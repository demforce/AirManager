import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, beforeEach, test } from 'node:test';
import './require-mail-integration-db';
import { prisma } from '../src/server/db/prisma';
import { applyActiveRecheck } from '../src/server/auth/jwt-active-check';
import { emailTrialEnabled } from '../src/server/auth/email-trial-policy';
import { authorizeCredentials } from '../src/server/auth/authorize';
import { hashPassword } from '../src/server/auth/password';
import { updateUser } from '../src/server/services/users.service';
import { enqueueCredential, requestReactivation, resendInvite } from '../src/server/services/credential-mail.service';
import { beginHandoff, completeHandoff, processMailAttempt, reserveMail } from '../src/server/services/credential-mail-worker';
import { consumeTrialLink, requestEmailLogin } from '../src/server/services/email-trial.service';
import { digestRecipientCurrent, holderDeliveryFence, holderMailbox } from '../src/server/services/account-mailbox';
import { runExpiryAlertsJob } from '../src/server/services/expiry-alerts.service';
import { startSyntheticSmtp } from './synthetic-smtp';

const manager = { userId: 'reactivation-operator', roles: ['ADMIN'] as ['ADMIN'], personId: null };
const account = async (active = false, locale = 'it') => {
  const email = randomUUID() + '@fixture.invalid';
  return prisma.user.create({ data: { email, locale, roles: ['ADMIN'], isActive: active,
    emailVerification: { create: { email, verifiedAt: new Date(Date.now() - 86400_000) } } } });
};
async function selectRelay(port = 1025) {
  for (const [key,value] of Object.entries({ 'smtp.host':'127.0.0.1', 'smtp.port':String(port),
    'smtp.security':'NONE', 'smtp.from':'sender@fixture.invalid' })) {
    await prisma.appSetting.upsert({where:{key},create:{key,value},update:{value}});
  }
}
async function reserve() {
  const attempt = await reserveMail(false, 250);
  assert.ok(attempt);
  return attempt;
}
async function issue(userId: string) {
  await requestReactivation(manager, userId);
  const raw = randomBytes(32).toString('base64url');
  const attempt = await reserve();
  assert.equal((await beginHandoff(attempt, raw))?.credential?.purpose, 'REACTIVATE_ACCOUNT');
  await completeHandoff(attempt.id, {outcome:'ACCEPTED', phase:'FINAL', channel:false});
  return raw;
}
async function captures(email: string) {
  const host = 'http://127.0.0.1:8025/api/v1';
  const response = await fetch(host + '/search?query=' + encodeURIComponent('to:' + email));
  assert.equal(response.status, 200);
  return (await response.json() as { messages: { ID: string; Subject: string }[] }).messages;
}
beforeEach(async () => {
  assert.ok(emailTrialEnabled());
  const info = await (await fetch('http://127.0.0.1:8025/api/v1/webui')).json();
  assert.equal(info.MessageRelay.Enabled, false);
  await prisma.mailAttempt.deleteMany({});
  await prisma.credentialMail.deleteMany({});
  await prisma.emailTrialRequest.deleteMany({});
  await prisma.mailChannel.update({ where:{id:1},data:{mode:'ACTIVE',probeId:null,probeAfter:null,failures:0} });
  await selectRelay();
});
after(() => prisma.$disconnect());

test('only users.manage can request a distinct intent for a suspended, verified and uncontested account', async () => {
  const user = await account();
  const pilot = { ...manager, roles: ['PILOT'] as ['PILOT'] };
  await assert.rejects(requestReactivation(pilot,user.id), { name: 'ForbiddenError' });
  await assert.rejects(resendInvite(manager,user.id), { name: 'ConflictError' });
  await requestEmailLogin(user.email, 'direct');
  await assert.rejects(updateUser(manager,user.id,{roles:['PILOT'],isActive:true}), { name: 'ConflictError' });
  assert.deepEqual((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).roles,['ADMIN']);
  const active = await account(true);
  await assert.rejects(requestReactivation(manager,active.id), { name: 'ConflictError' });
  await prisma.emailVerification.update({ where:{userId:user.id}, data:{verifiedAt:null} });
  await assert.rejects(requestReactivation(manager,user.id), { name: 'ConflictError' });
  await prisma.emailVerification.update({ where:{userId:user.id}, data:{verifiedAt:new Date()} });
  await prisma.person.create({data:{firstName:'Fixture',lastName:'Other owner',email:user.email,archivedAt:new Date()}});
  await assert.rejects(requestReactivation(manager,user.id), { name: 'ConflictError' });
  assert.equal(await prisma.credentialMail.count(),0);
});

test('one request across concurrent clicks; authorized reissue replaces the former link and roles do not activate', async () => {
  const user = await account();
  const key = randomUUID();
  await Promise.all([requestReactivation(manager,user.id,key),requestReactivation(manager,user.id,key)]);
  await assert.rejects(requestReactivation(manager,user.id), { name: 'ConflictError' });
  assert.equal(await prisma.credentialMail.count(),1);
  const old = randomBytes(32).toString('base64url');
  const attempt = await reserve();
  await beginHandoff(attempt,old);
  await completeHandoff(attempt.id,{outcome:'ACCEPTED',phase:'FINAL',channel:false});
  await prisma.credentialMail.updateMany({where:{userId:user.id},data:{createdAt:new Date(Date.now()-61_000)}});
  const replacement = await issue(user.id);
  assert.equal(await consumeTrialLink('REACTIVATE_ACCOUNT',old),null);
  await updateUser(manager,user.id,{roles:['PILOT']});
  assert.equal(await consumeTrialLink('REACTIVATE_ACCOUNT',replacement),null);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).isActive,false);
});

test('suspension cancels queued, claimed and handed-off credentials and all prior session versions stay revoked after POST', async () => {
  const user = await account(true);
  const password = randomUUID();
  await prisma.user.update({where:{id:user.id},data:{passwordHash:await hashPassword(password)}});
  await requestEmailLogin(user.email,'direct');
  const rawLogin = randomBytes(32).toString('base64url');
  const sending = await reserve();
  await beginHandoff(sending,rawLogin);
  await prisma.$transaction(tx=>enqueueCredential(tx,user.id,'PASSWORD_RESET'));
  const claimed = await reserve();
  const snapshot = { userId:user.id, email:user.email, roles:user.roles, personId:null, tokenVersion:user.tokenVersion, lastActiveCheck:Date.now() };
  const suspended = await updateUser(manager,user.id,{isActive:false});
  assert.equal(suspended.isActive,false);
  assert.equal(await beginHandoff(claimed),null);
  assert.equal(await authorizeCredentials({email:user.email,password},null,'admin-password'),null);
  await completeHandoff(sending.id,{outcome:'TEMPORARY',phase:'RECIPIENT',channel:false});
  assert.equal(await prisma.credentialMail.count({where:{userId:user.id,revokedAt:null}}),0);
  const raw = await issue(user.id);
  assert.equal(await consumeTrialLink('LOGIN_LINK',raw,user.email),null);
  assert.equal(await consumeTrialLink('VERIFY_EMAIL',raw),null);
  const results = await Promise.all([consumeTrialLink('REACTIVATE_ACCOUNT',raw),consumeTrialLink('REACTIVATE_ACCOUNT',raw)]);
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(await consumeTrialLink('REACTIVATE_ACCOUNT',raw),null);
  assert.equal(await consumeTrialLink('LOGIN_LINK',rawLogin,user.email),null);
  for (const provider of [{}, {emailTrialLogin:true}, {adminPasswordVersion:user.adminPasswordVersion}]) {
    assert.equal(await applyActiveRecheck({...snapshot,...provider}),null);
  }
  assert.ok(await authorizeCredentials({email:user.email,password},null,'admin-password'));
});

test('confirmation also retires credentials and versions for accounts already suspended before upgrade', async () => {
  const user = await account();
  // Model a pre-upgrade suspension where previously issued credentials had no lifecycle fence.
  const reset = await prisma.authToken.create({data:{type:'PASSWORD_RESET',userId:user.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+600_000)}});
  await prisma.credentialMail.create({data:{userId:user.id,purpose:'PASSWORD_RESET',nextAt:new Date(Date.now()+300_000),expiresAt:new Date(Date.now()+600_000)}});
  const oldProof = await prisma.emailVerification.findUniqueOrThrow({where:{userId:user.id}});
  assert.ok(await consumeTrialLink('REACTIVATE_ACCOUNT',await issue(user.id)));
  const updated = await prisma.user.findUniqueOrThrow({where:{id:user.id},include:{emailVerification:true}});
  assert.ok(updated.tokenVersion>user.tokenVersion);
  assert.ok(updated.adminPasswordVersion>user.adminPasswordVersion);
  assert.ok(updated.emailVerification?.reactivatedAt);
  assert.deepEqual(updated.emailVerification.verifiedAt,oldProof.verifiedAt);
  assert.ok((await prisma.authToken.findUniqueOrThrow({where:{id:reset.id}})).usedAt);
  assert.equal(await prisma.credentialMail.count({where:{userId:user.id,revokedAt:null}}),0);
});

test('an intent and a minted token remain bound to the registered mailbox at issuance', async () => {
  const changeSyntheticProof = async (id: string) => {
    const email = randomUUID() + '@fixture.invalid';
    await prisma.user.update({where:{id},data:{email,emailVerification:{update:{email,verifiedAt:new Date()}}}});
  };
  const queued = await account();
  await requestReactivation(manager,queued.id);
  await changeSyntheticProof(queued.id);
  assert.equal(await reserveMail(false,250),null);
  const claimed = await account();
  await requestReactivation(manager,claimed.id);
  const attempt = await reserve();
  await changeSyntheticProof(claimed.id);
  assert.equal(await beginHandoff(attempt),null);
  const issued = await account();
  const raw = await issue(issued.id);
  await changeSyntheticProof(issued.id);
  assert.equal(await consumeTrialLink('REACTIVATE_ACCOUNT',raw),null);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:issued.id}})).isActive,false);
});

test('expiry or ownership change rejects confirmation; an expired queue item never reaches SMTP', async () => {
  const user = await account();
  const link = await issue(user.id);
  await prisma.authToken.updateMany({where:{userId:user.id},data:{expiresAt:new Date(0)}});
  assert.equal(await consumeTrialLink('REACTIVATE_ACCOUNT',link),null);
  const other = await account();
  const otherLink = await issue(other.id);
  await prisma.person.create({data:{firstName:'Fixture',lastName:'Conflict',email:other.email}});
  assert.equal(await consumeTrialLink('REACTIVATE_ACCOUNT',otherLink),null);
  const late = await account();
  await requestReactivation(manager,late.id);
  await prisma.credentialMail.updateMany({where:{userId:late.id},data:{expiresAt:new Date(0)}});
  assert.equal(await reserveMail(false,250),null);
  assert.equal((await prisma.credentialMail.findFirstOrThrow({where:{userId:late.id}})).state,'EXPIRED');
  assert.equal((await captures(late.email)).length,0);
});

for (const locale of ['it','en']) {
  test('safe retry preserves the ten-minute deadline; one local multipart message in '+locale, async () => {
    const user = await account(false,locale);
    const relay = await startSyntheticSmtp();
    try {
      await requestReactivation(manager,user.id);
      const intent = await prisma.credentialMail.findFirstOrThrow({where:{userId:user.id}});
      assert.equal(+intent.expiresAt-+intent.createdAt,600_000);
      await selectRelay(relay.port);
      relay.controls.reply = 'finalTemporary';
      assert.equal((await processMailAttempt(await reserve(),undefined,true))?.outcome,'TEMPORARY');
      await selectRelay();
      await prisma.credentialMail.update({where:{id:intent.id},data:{nextAt:new Date(0)}});
      assert.equal((await processMailAttempt(await reserve(),undefined,true))?.outcome,'ACCEPTED');
      const tokens = await prisma.authToken.findMany({where:{userId:user.id}});
      assert.ok(tokens.length===2 && tokens.every(t=>+t.expiresAt===+intent.expiresAt) && tokens.filter(t=>!t.usedAt).length===1);
      const mails = await captures(user.email);
      assert.equal(mails.length,1);
      const mail = await (await fetch('http://127.0.0.1:8025/api/v1/message/'+mails[0].ID)).json();
      assert.equal(mail.Subject,locale==='it'?'Riattiva il tuo account AirManager':'Reactivate your AirManager account');
      assert.ok(mail.To.length===1 && mail.To[0].Address===user.email && !mail.Cc?.length && !mail.Bcc?.length);
      const link = mail.Text.match(/https?:\/\/[^\s]+/)?.[0] as string;
      assert.ok(link && mail.HTML.includes(link) && new URL(link).searchParams.get('purpose')==='reactivate');
    } finally { await relay.close(); }
  });
}

test('a prepared holder notification and admin digest retain the activation cycle at their delivery fence', async () => {
  const user = await account(true);
  const person = await prisma.person.create({data:{firstName:'Fixture',lastName:randomUUID()}});
  await prisma.user.update({where:{id:user.id},data:{personId:person.id}});
  const address = await holderMailbox(person.id,null);
  assert.ok(address);
  const fence = holderDeliveryFence(person.id,address).confirmRecipient;
  assert.ok(fence && await fence());
  assert.ok(await digestRecipientCurrent(user.id,user.email,null));
  await updateUser(manager,user.id,{isActive:false});
  assert.ok(await consumeTrialLink('REACTIVATE_ACCOUNT',await issue(user.id)));
  assert.equal(await fence(),false);
  assert.equal(await digestRecipientCurrent(user.id,user.email,null),false);
  const current = await holderMailbox(person.id,null);
  assert.ok(current?.activationCycle);
  assert.ok(await digestRecipientCurrent(user.id,user.email,current.activationCycle));
});

test('suspension thresholds do not replay, a new expiry cycle after reactivation sends normally', async () => {
  const user = await account();
  const person = await prisma.person.create({data:{firstName:'Fixture',lastName:randomUUID()}});
  await prisma.user.update({where:{id:user.id},data:{personId:person.id}});
  const type = await prisma.expiryType.create({data:{name:randomUUID(),scope:'ALL'}});
  const expiry = () => prisma.expiry.create({data:{personId:person.id,actorUserId:user.id,expiryTypeId:type.id,expiresAt:new Date(Date.now()+2*86400_000)}});
  const paused = await expiry();
  try {
    assert.ok(await consumeTrialLink('REACTIVATE_ACCOUNT',await issue(user.id)));
    await runExpiryAlertsJob();
    assert.equal((await captures(user.email)).length,0);
    assert.ok(await prisma.sentAlert.count({where:{expiryId:paused.id}}));
    await prisma.expiry.delete({where:{id:paused.id}});
    const current = await expiry();
    await runExpiryAlertsJob();
    assert.ok((await captures(user.email)).some(mail=>mail.Subject.includes('scadenza')||mail.Subject.includes('Scadenza')));
    assert.ok(await prisma.sentAlert.count({where:{expiryId:current.id}}));
  } finally {
    await prisma.expiry.deleteMany({where:{personId:person.id}});
    await prisma.expiryType.delete({where:{id:type.id}});
  }
});

test('trial off preserves direct reactivation and the new trial-only command is unavailable', async () => {
  const user = await account();
  const value = process.env.AIRMANAGER_EMAIL_TRIAL;
  try {
    process.env.AIRMANAGER_EMAIL_TRIAL = '0';
    await assert.rejects(requestReactivation(manager,user.id), {name:'NotFoundError'});
    assert.ok((await updateUser(manager,user.id,{isActive:true})).isActive);
    assert.equal(await prisma.credentialMail.count(),0);
  } finally { process.env.AIRMANAGER_EMAIL_TRIAL = value; }
});
