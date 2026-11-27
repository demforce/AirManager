import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, beforeEach, test } from 'node:test';
import SMTPConnection from 'nodemailer/lib/smtp-connection';
import './require-mail-integration-db';
import { prisma } from '../src/server/db/prisma';
import { createUser } from '../src/server/services/users.service';

import { beginHandoff, completeHandoff, processMailAttempt, reserveMail } from '../src/server/services/credential-mail-worker';
import { consumeTrialLink, loginRequestOrigin, requestEmailLogin } from '../src/server/services/email-trial.service';
import { setPasswordWithToken } from '../src/server/services/auth-tokens.service';
import { startSyntheticSmtp } from './synthetic-smtp';

async function selectRelay(port:number) {
  for(const [key,value] of Object.entries({'smtp.host':'127.0.0.1','smtp.port':String(port),'smtp.security':'NONE','smtp.from':'sender@fixture.invalid'})){
    await prisma.appSetting.upsert({where:{key},create:{key,value},update:{value}});
  }
}

beforeEach(async()=>{
  assert.equal(process.env.AIRMANAGER_EMAIL_TRIAL,'1');
  await prisma.mailAttempt.deleteMany({});
  await prisma.credentialMail.deleteMany({});
  await prisma.emailTrialRequest.deleteMany({});
  await prisma.authToken.deleteMany({where:{user:{email:{endsWith:'@fixture.invalid'}}}});
  await prisma.user.deleteMany({where:{email:{endsWith:'@fixture.invalid'}}});
  await prisma.mailChannel.update({where:{id:1},data:{mode:'ACTIVE',probeId:null,probeAfter:null,failures:0}});
});
const actor = { userId: 'synthetic-operator', roles: ['ADMIN'] as ['ADMIN'], personId: null };
const address = () => randomUUID() + '@fixture.invalid';

after(() => prisma.$disconnect());

test('explicit admin invitation creates an account and a distinct verification intent in one transaction', async () => {
  const email = address();
  const account = await createUser(actor, { email, roles: ['PILOT'], locale: 'it', verificationInvite: true });
  const intent = await prisma.credentialMail.findFirstOrThrow({ where: { userId: account.id } });
  assert.equal(intent.purpose, 'VERIFY_EMAIL');
  const enrollment = await prisma.emailVerification.findUniqueOrThrow({ where: { userId: account.id } });
  assert.equal(enrollment.email, email);
  assert.equal(enrollment.verifiedAt, null);
  assert.equal(account.passwordSet, false);
});

async function trialUser(verified = true) {
  const email = address();
  return prisma.user.create({ data: { email, isActive: true, roles: ['PILOT'], emailVerification: {
    create: { email, verifiedAt: verified ? new Date() : null },
  } } });
}

test('public login never creates accounts or issues credentials for unknown, unverified, legacy or inactive accounts', async () => {
  const pending = await trialUser(false);
  const legacy = await prisma.user.create({ data: { email: address(), roles: ['PILOT'] } });
  const inactive = await trialUser();
  await prisma.user.update({ where: { id: inactive.id }, data: { isActive: false } });
  const unknown = address();
  const n = await prisma.user.count();
  for (const email of [pending.email, legacy.email, inactive.email, unknown]) await requestEmailLogin(email, 'direct');
  assert.equal(await prisma.user.count(), n);
  assert.equal(await prisma.credentialMail.count({where:{purpose:'LOGIN_LINK'}}), 0);
  assert.equal(await prisma.authToken.count({where:{type:'LOGIN_LINK'}}), 0);
});

test('normal concurrent requests from independent origins reserve one grant; suppression preserves the original token and expiry', async () => {
  const user = await trialUser();
  await Promise.all(['192.0.2.1','192.0.2.2','192.0.2.3'].map(origin => requestEmailLogin(user.email.toUpperCase(), origin)));
  const grants = await prisma.credentialMail.findMany({where:{userId:user.id}});
  assert.equal(grants.length, 1);
  assert.equal(+grants[0].expiresAt - +grants[0].createdAt, 600_000);
  const attempt = await reserveMail(false, 250);
  assert.ok(attempt);
  const raw = randomBytes(32).toString('base64url');
  const handoff = await beginHandoff(attempt, raw);
  assert.equal(handoff?.credential?.to, user.email);
  const hash = createHash('sha256').update(raw).digest('hex');
  const first = await prisma.authToken.findUniqueOrThrow({where:{tokenHash:hash}});
  await completeHandoff(attempt.id,{outcome:'UNCERTAIN',phase:'FINAL',channel:false});
  for (const origin of ['192.0.2.4','192.0.2.5','192.0.2.6']) await requestEmailLogin(user.email, origin);
  const original = await prisma.authToken.findUniqueOrThrow({where:{id:first.id}});
  assert.equal(original.usedAt, null);
  assert.equal(+original.expiresAt,+grants[0].expiresAt);
  assert.equal(await prisma.credentialMail.count({where:{userId:user.id}}),1);
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', raw),null);
  assert.equal(await consumeTrialLink('LOGIN_LINK', raw, address()),null);
  await assert.rejects(setPasswordWithToken(raw,'synthetic-password-only'),/Invalid or expired/);
  const commits = await Promise.all([consumeTrialLink('LOGIN_LINK',raw,user.email),consumeTrialLink('LOGIN_LINK',raw,user.email)]);
  assert.equal(commits.filter(Boolean).length,1);
});

test('safe retry has the original deadline, one envelope recipient and no automatic retry after uncertain acceptance', async () => {
  const user = await trialUser();
  const relay = await startSyntheticSmtp();
  try {
    await selectRelay(relay.port);
    await requestEmailLogin(user.email, 'direct');
    const intent = await prisma.credentialMail.findFirstOrThrow({where:{userId:user.id}});
    const first = await reserveMail(false, 250); assert.ok(first);
    relay.controls.reply='finalTemporary';
    assert.equal((await processMailAttempt(first,undefined,true))?.outcome, 'TEMPORARY');
    const failed = await prisma.credentialMail.findUniqueOrThrow({where:{id:intent.id}});
    assert.equal(failed.state,'QUEUED'); assert.equal(failed.attempts,1);
    await prisma.credentialMail.update({where:{id:intent.id},data:{nextAt:new Date(0)}});
    relay.controls.reply='loseReply';
    const second=await reserveMail(false,250); assert.ok(second);
    assert.equal((await processMailAttempt(second,undefined,true))?.outcome,'UNCERTAIN');
    const last=await prisma.credentialMail.findUniqueOrThrow({where:{id:intent.id}});
    assert.equal(last.attempts,2);assert.equal(last.state,'UNCERTAIN');
    const tokens=await prisma.authToken.findMany({where:{userId:user.id,type:'LOGIN_LINK'}});
    assert.equal(tokens.length,2); assert.ok(tokens.every(t=>+t.expiresAt===+intent.expiresAt));
    assert.equal(tokens.filter(t=>!t.usedAt).length,1);
    assert.deepEqual(relay.controls.recipients,['<' + user.email + '>','<' + user.email + '>']);
    assert.equal(await reserveMail(false,250),null);
  }finally{await relay.close();}
});

test('expiry, deactivation and a changed address suppress queued mail before SMTP submission', async () => {
  const relay=await startSyntheticSmtp();
  try{
    await selectRelay(relay.port);
    for (const change of ['expired','inactive','address'] as const) {
      const user=await trialUser();
      await requestEmailLogin(user.email,'direct');
      const intent=await prisma.credentialMail.findFirstOrThrow({where:{userId:user.id}});
      const attempt=await reserveMail(false,250);assert.ok(attempt);
      if(change==='expired') await prisma.credentialMail.update({where:{id:intent.id},data:{expiresAt:new Date(0)}});
      else await prisma.user.update({where:{id:user.id},data:change==='inactive'?{isActive:false}:{email:address()}});
      assert.equal(await processMailAttempt(attempt,undefined,true),null);
      assert.equal(await prisma.authToken.count({where:{userId:user.id}}),0);
    }
    assert.equal(relay.controls.recipients.length,0);
  }finally{await relay.close();}
});

test('source, account and aggregate budgets suppress new grants without changing live ones', async () => {
  const origin='192.0.2.50';
  for(let i=0;i<20;i++) await requestEmailLogin(address(),origin);
  const user=await trialUser();
  await requestEmailLogin(user.email,origin);
  assert.equal(await prisma.credentialMail.count({where:{userId:user.id}}),0);
  for(let i=0;i<3;i++){
    await prisma.credentialMail.create({data:{userId:user.id,purpose:'LOGIN_LINK',createdAt:new Date(Date.now()-40*60_000),expiresAt:new Date(Date.now()-30*60_000),state:'EXPIRED'}});
  }
  await requestEmailLogin(user.email,'192.0.2.51');
  assert.equal(await prisma.credentialMail.count({where:{userId:user.id}}),3);
  const users=await Promise.all(Array.from({length:11},()=>trialUser()));
  for(let i=0;i<users.length;i++)await requestEmailLogin(users[i].email,'192.0.2.'+(70+i));
  assert.equal(await prisma.credentialMail.count({where:{userId:{in:users.map(u=>u.id)}}}),10);
  const original=await prisma.credentialMail.findFirstOrThrow({where:{userId:users[0].id}});
  await requestEmailLogin(users[0].email,'192.0.2.90');
  assert.equal((await prisma.credentialMail.findUniqueOrThrow({where:{id:original.id}})).revokedAt,null);
  assert.equal(await prisma.credentialMail.count({where:{userId:users[10].id}}),0);
});

test('direct requests do not choose their origin bucket through forwarded headers', () => {
  const previous = process.env.AIRMANAGER_TRIAL_PROXY_SECRET;
  const secret = 'synthetic-proxy-key-for-local-testing';
  process.env.AIRMANAGER_TRIAL_PROXY_SECRET = secret;
  try {
    const origin = (ip: string, key = secret) => loginRequestOrigin(new Headers({
      'x-forwarded-for': ip, 'x-airmanager-proxy-key': key,
    }));
    assert.equal(origin('192.0.2.5', ''), 'direct');
    assert.equal(origin('192.0.2.5'), '192.0.2.5');
    assert.equal(origin('2001:0db8:0:0:0:0:0:1'), origin('2001:db8::1'));
    assert.equal(origin('fe80::1%local'), 'direct');
  } finally {
    if (previous === undefined) delete process.env.AIRMANAGER_TRIAL_PROXY_SECRET;
    else process.env.AIRMANAGER_TRIAL_PROXY_SECRET = previous;
  }
});

test('an outstanding grant is bound to the address that was eligible when requested', async () => {
  const user = await trialUser();
  await requestEmailLogin(user.email, 'direct');
  const original = await reserveMail(false, 250);
  assert.ok(original);
  const other = address();
  // A synthetic, already-verified replacement models a future address-change workflow.
  await prisma.user.update({ where: { id: user.id }, data: {
    email: other, emailVerification: { update: { email: other, verifiedAt: new Date() } },
  } });
  assert.equal(Boolean(await beginHandoff(original)), false);
  assert.equal(await prisma.authToken.count({ where: { userId: user.id } }), 0);
});

test('confirmation consumes neither expired nor disabled grants. One verified invitation never accepts the login purpose', async () => {
  for(const change of ['expired','inactive'] as const){
    const user=await trialUser(); await requestEmailLogin(user.email,'direct');
    const attempt=await reserveMail(false,250);assert.ok(attempt);
    const raw=randomBytes(32).toString('base64url');
    await beginHandoff(attempt,raw);await completeHandoff(attempt.id,{outcome:'ACCEPTED',phase:'FINAL',channel:false});
    if(change==='expired')await prisma.authToken.updateMany({where:{userId:user.id},data:{expiresAt:new Date(0)}});
    else await prisma.user.update({where:{id:user.id},data:{isActive:false}});
    assert.equal(await consumeTrialLink('LOGIN_LINK',raw,user.email),null);
  }
  const invited=await createUser(actor,{email:address(),roles:['PILOT'],locale:'it',verificationInvite:true});
  const a=await reserveMail(false,250);assert.ok(a);
  const raw=randomBytes(32).toString('base64url');
  await beginHandoff(a,raw);
  assert.equal(await consumeTrialLink('LOGIN_LINK',raw,invited.email),null);
  await assert.rejects(setPasswordWithToken(raw,'synthetic-password-only'),/Invalid or expired/);
  const wins=await Promise.all([consumeTrialLink('VERIFY_EMAIL',raw),consumeTrialLink('VERIFY_EMAIL',raw)]);
  assert.equal(wins.filter(Boolean).length,1);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:invited.id}})).passwordHash,null);
});

test('eligibility is checked again after a delayed SMTP greeting, before the envelope', async () => {
  const user=await trialUser();
  const relay=await startSyntheticSmtp();
  try{
    await selectRelay(relay.port); relay.controls.reply='holdGreeting';
    await requestEmailLogin(user.email,'direct');
    const attempt=await reserveMail(false,250);assert.ok(attempt);
    const pending=processMailAttempt(attempt,undefined,true);
    try {
      for(let i=0;!relay.controls.finish && i<200;i++) await new Promise(r=>setTimeout(r,10));
      assert.ok(relay.controls.finish);
      await prisma.user.update({where:{id:user.id},data:{isActive:false}});
    } finally { relay.controls.finish?.(); }
    assert.equal((await pending)?.outcome,'SUPPRESSED');
    assert.equal(relay.controls.accepted,0);assert.equal(relay.controls.recipients.length,0);
  } finally {await relay.close();}
});

test('a provisioned trial administrator uses only the dedicated password provider, including during a mail outage', async () => {
  const { authorizeCredentials } = await import('../src/server/auth/authorize');
  const { hashPassword } = await import('../src/server/auth/password');
  const account = await trialUser();
  const password = randomUUID();
  const login = { email: account.email, password };
  await prisma.user.update({where:{id:account.id},data:{roles:['ADMIN'],passwordHash:await hashPassword(password)}});
  const previous = process.env.AIRMANAGER_EMAIL_TRIAL;
  process.env.AIRMANAGER_EMAIL_TRIAL = '0';
  try {
    assert.equal(Boolean(await authorizeCredentials(login)), false);
    assert.equal((await authorizeCredentials(login, null, 'admin-password'))?.id, account.id);
    await prisma.user.update({where:{id:account.id},data:{roles:['PILOT']}});
    assert.equal(Boolean(await authorizeCredentials(login, null, 'admin-password')), false);
    assert.equal(Boolean(await authorizeCredentials(login)), false);
  } finally { process.env.AIRMANAGER_EMAIL_TRIAL = previous; }
});

test('trial administrator password provisioning is isolated with the other trial credentials', async () => {
  const { requestPasswordReset } = await import('../src/server/services/auth-tokens.service');
  const admin = await trialUser();
  await prisma.user.update({where:{id:admin.id},data:{roles:['ADMIN']}});
  const previous = process.env.AIRMANAGER_EMAIL_TRIAL;
  try {
    process.env.AIRMANAGER_EMAIL_TRIAL = '0';
    await requestPasswordReset(admin.email);
    assert.equal(await prisma.credentialMail.count({where:{userId:admin.id}}), 0);
    process.env.AIRMANAGER_EMAIL_TRIAL = '1';
    await requestPasswordReset(admin.email);
    process.env.AIRMANAGER_EMAIL_TRIAL = '0';
    assert.equal(Boolean(await reserveMail(false, 250)), false);
    process.env.AIRMANAGER_EMAIL_TRIAL = '1';
    const attempt = await reserveMail(false, 250);
    assert.ok(attempt);
    const raw = randomBytes(32).toString('base64url');
    assert.ok(await beginHandoff(attempt, raw));
    process.env.AIRMANAGER_EMAIL_TRIAL = '0';
    await assert.rejects(setPasswordWithToken(raw, randomUUID()), /Invalid or expired/);
    process.env.AIRMANAGER_EMAIL_TRIAL = '1';
    await setPasswordWithToken(raw, randomUUID());
  } finally { process.env.AIRMANAGER_EMAIL_TRIAL = previous; }
});

test('a trial password reset never connects to a non-loopback relay', async context => {
  // Intercept the transport boundary: even a failing assertion cannot make a network request.
  const connection = context.mock.method(SMTPConnection.prototype, 'connect', () => {
    throw new Error('unexpected synthetic connection');
  });
  const { requestPasswordReset } = await import('../src/server/services/auth-tokens.service');
  const admin = await trialUser();
  await prisma.user.update({ where: { id: admin.id }, data: { roles: ['ADMIN'] } });
  await requestPasswordReset(admin.email);
  const host = 'mail.fixture.invalid';
  await selectRelay(1025);
  await prisma.appSetting.update({ where: { key: 'smtp.host' }, data: { value: host } });
  const attempt = await reserveMail(false, 250);
  assert.ok(attempt);
  await processMailAttempt(attempt);
  const intent = await prisma.credentialMail.findUniqueOrThrow({ where: { id: attempt.intentId! } });
  assert.equal(intent.state, 'SUPPRESSED');
  assert.equal(intent.tokenId, null);
  assert.equal(connection.mock.callCount(), 0);
});
