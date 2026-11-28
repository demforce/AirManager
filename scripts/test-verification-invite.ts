import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, beforeEach, test } from 'node:test';
import SMTPConnection from 'nodemailer/lib/smtp-connection';
import './require-mail-integration-db';
import { prisma } from '../src/server/db/prisma';
import { createPerson } from '../src/server/services/people.service';
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

test('ordinary admin invitation creates a pending account and a distinct verification intent in one transaction', async () => {
  const email = address();
  const account = await createUser(actor, { email, roles: ['PILOT'], locale: 'it' });
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
  const invited=await createUser(actor,{email:address(),roles:['PILOT'],locale:'it'});
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

test('composite enrollment uses a single account address and rolls back divergent inputs', async () => {
  const email = address();
  const access = { email, roles: ['PILOT'] as ['PILOT'] };
  const base = { firstName: 'Synthetic', lastName: randomUUID() };
  await assert.rejects(createPerson(actor, { ...base, email: address(), access }), /email/i);
  assert.equal(await prisma.person.count({ where: { lastName: base.lastName } }), 0);
  const person = await createPerson(actor, { ...base, access });
  const user = await prisma.user.findUniqueOrThrow({ where: { personId: person.id }, include: { emailVerification: true } });
  assert.equal(user.emailVerification?.email, email);
  assert.equal(user.emailVerification?.verifiedAt, null);
  assert.equal(user.passwordHash, null);
  assert.deepEqual((await prisma.credentialMail.findMany({ where: { userId: user.id } })).map(intent => intent.purpose), ['VERIFY_EMAIL']);
  assert.equal((await prisma.person.findUniqueOrThrow({ where: { id: person.id } })).email, null);
  const standaloneEmail = address();
  const contact = await createPerson(actor, { firstName: 'Fixture', lastName: randomUUID(), email: standaloneEmail });
  assert.equal(contact.email, standaloneEmail);
  assert.equal(await prisma.user.count({ where: { personId: contact.id } }), 0);
});

test('first admin invitation verifies the mailbox and sets exactly the holder’s winning password together', async () => {
  const { requestPasswordReset } = await import('../src/server/services/auth-tokens.service');
  const { authorizeCredentials } = await import('../src/server/auth/authorize');
  const { verifyPassword } = await import('../src/server/auth/password');
  const account = await createUser(actor, { email: address(), roles: ['ADMIN'], locale: 'it' });
  const raw = await prepareVerification();
  const passwords = [randomUUID(), randomUUID()];
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', raw), 'passwordRequired');
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', raw, '🙂'.repeat(8)), 'passwordRequired');
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', raw, 'a'.repeat(257)), 'passwordRequired');
  await requestPasswordReset(account.email);
  await requestEmailLogin(account.email, 'direct');
  assert.equal(await prisma.credentialMail.count({ where: { userId: account.id, purpose: { in: ['PASSWORD_RESET', 'LOGIN_LINK'] } } }), 0);
  assert.equal(await authorizeCredentials({ email: account.email, password: passwords[0] }, null, 'admin-password'), null);
  const pending = await prisma.user.findUniqueOrThrow({ where: { id: account.id }, include: { emailVerification: true } });
  assert.equal(pending.passwordHash, null);
  assert.equal(pending.emailVerification?.verifiedAt, null);
  assert.equal(await prisma.authToken.count({ where: { userId: account.id, usedAt: null } }), 1);
  const results = await Promise.all(passwords.map(password => consumeTrialLink('VERIFY_EMAIL', raw, password)));
  assert.equal(results.filter(result => typeof result === 'object' && result !== null).length, 1);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: account.id }, include: { emailVerification: true } });
  assert.ok(after.passwordHash && after.emailVerification?.verifiedAt);
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', raw, randomUUID()), null);
  for (const [i, password] of passwords.entries()) assert.equal(await verifyPassword(after.passwordHash, password), results[i] !== null);
  await requestEmailLogin(account.email, 'direct');
  assert.equal(await prisma.credentialMail.count({ where: { userId: account.id, purpose: 'LOGIN_LINK' } }), 1);
});

test('pending invitations follow the role under the account lock at completion', async () => {
  const { updateUser } = await import('../src/server/services/users.service');
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@airmanager.local' } });
  const operator = { ...actor, userId: owner.id };
  const account = await createUser(operator, { email: address(), roles: ['PILOT'], locale: 'it' });
  const raw = await prepareVerification();
  await updateUser(operator, account.id, { roles: ['PILOT', 'ADMIN'] });
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', raw), 'passwordRequired');
  await updateUser(operator, account.id, { roles: ['PILOT'] });
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', raw, randomUUID()), null);
  const confirmed = await consumeTrialLink('VERIFY_EMAIL', raw);
  assert.ok(confirmed && confirmed !== 'passwordRequired');
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: account.id } })).passwordHash, null);
});

test('expired and replaced admin invitations leave the holder pending', async () => {
  const { resendInvite } = await import('../src/server/services/credential-mail.service');
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@airmanager.local' } });
  const operator = { ...actor, userId: owner.id };
  const account = await createUser(operator, { email: address(), roles: ['ADMIN'], locale: 'en' });
  const old = await prepareVerification();
  const invitation = await prisma.credentialMail.findFirstOrThrow({ where: { userId: account.id } });
  assert.equal(+invitation.expiresAt - +invitation.createdAt, 7 * 86400_000);
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', old), 'passwordRequired');
  await resendInvite(operator, account.id, randomUUID());
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', old, randomUUID()), null);
  const fresh = await prepareVerification();
  await prisma.authToken.updateMany({ where: { userId: account.id, usedAt: null }, data: { expiresAt: new Date(0) } });
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', fresh), null);
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', fresh, randomUUID()), null);
  const row = await prisma.user.findUniqueOrThrow({ where: { id: account.id }, include: { emailVerification: true } });
  assert.equal(row.passwordHash, null);
  assert.equal(row.emailVerification?.verifiedAt, null);
});

test('trial off preserves normal and composite legacy invitation and separate contact-only ownership', async () => {
  const previous = process.env.AIRMANAGER_EMAIL_TRIAL;
  process.env.AIRMANAGER_EMAIL_TRIAL = '0';
  try {
    const user = await createUser(actor, { email: address(), roles: ['PILOT'], locale: 'it' });
    const personal = address();
    const person = await createPerson(actor, { firstName: 'Fixture', lastName: randomUUID(), email: personal,
      access: { email: address(), roles: ['PILOT'] } });
    assert.equal(person.email, personal);
    const linked = await prisma.user.findUniqueOrThrow({ where: { personId: person.id } });
    for (const id of [user.id, linked.id]) {
      assert.equal(await prisma.emailVerification.count({ where: { userId: id } }), 0);
      assert.deepEqual((await prisma.credentialMail.findMany({ where: { userId: id } })).map(intent => intent.purpose), ['INVITE']);
    }
  } finally { process.env.AIRMANAGER_EMAIL_TRIAL = previous; }
});

test('API compatibility cannot select a password invitation in the trial, and the public flow creates no account', async () => {
  const { createUserSchema } = await import('../src/lib/schemas/users');
  const { createPersonSchema } = await import('../src/lib/schemas/people');
  const ordinary = { email: address(), roles: ['PILOT'] };
  assert.equal(createUserSchema.safeParse({ ...ordinary, verificationInvite: false }).success, false);
  assert.equal(createPersonSchema.safeParse({ firstName: 'Fixture', lastName: randomUUID(),
    access: { ...ordinary, verificationInvite: false } }).success, false);
  const account = await createUser(actor, createUserSchema.parse({ ...ordinary, verificationInvite: true }));
  assert.deepEqual((await prisma.credentialMail.findMany({ where: { userId: account.id } })).map(m => m.purpose), ['VERIFY_EMAIL']);
  const absent = address();
  await requestEmailLogin(absent, 'direct');
  assert.equal(await prisma.user.count({ where: { email: absent } }), 0);
});

test('a verified composite account receives an actual balance notification at its one registered address', async () => {
  const { recordAdjustment } = await import('../src/server/services/accounts.service');
  const operator = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@airmanager.local' } });
  const info = await (await fetch('http://127.0.0.1:8025/api/v1/webui')).json();
  assert.equal(info.MessageRelay.Enabled, false);
  const email = address();
  const person = await createPerson(actor, { firstName: 'Fixture', lastName: randomUUID(), access: { email, roles: ['PILOT'] } });
  assert.equal((await prisma.person.findUniqueOrThrow({ where: { id: person.id } })).email, null);
  const reservation = await reserveMail(false, 250);
  assert.ok(reservation);
  const raw = randomBytes(32).toString('base64url');
  const handoff = await beginHandoff(reservation, raw);
  assert.equal(handoff?.credential?.purpose, 'VERIFY_EMAIL');
  await completeHandoff(reservation.id, { outcome: 'ACCEPTED', phase: 'FINAL', channel: false });
  assert.ok(await consumeTrialLink('VERIFY_EMAIL', raw));
  await selectRelay(1025);
  await prisma.account.create({ data: { personId: person.id } });
  await recordAdjustment({ ...actor, userId: operator.id }, person.id, { amountCents: -5000, reason: 'Synthetic adjustment' });
  const query = 'http://127.0.0.1:8025/api/v1/search?query=' + encodeURIComponent('to:'+email);
  let captured: { To: { Address: string }[]; Subject: string }[] = [];
  for (let i=0; i<50; i++) {
    captured = (await (await fetch(query)).json()).messages;
    if (captured.length) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0].To.map(to => to.Address), [email]);
  assert.equal(captured[0].Subject, 'Il tuo conto AirManager è in negativo');
});

async function prepareVerification() {
  const attempt = await reserveMail(false, 250);
  assert.ok(attempt);
  const raw = randomBytes(32).toString('base64url');
  const prepared = await beginHandoff(attempt, raw);
  assert.equal(prepared?.credential?.purpose, 'VERIFY_EMAIL');
  await completeHandoff(attempt.id, { outcome: 'ACCEPTED', phase: 'FINAL', channel: false });
  return raw;
}

test('initial invitation lasts exactly seven days across a safe retry; replacement is atomic and requires continuing eligibility', async () => {
  const { resendInvite } = await import('../src/server/services/credential-mail.service');
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@airmanager.local' } });
  const operator = { ...actor, userId: admin.id };
  const account = await createUser(operator, { email: address(), roles: ['PILOT'], locale: 'en' });
  const original = await prisma.credentialMail.findFirstOrThrow({ where: { userId: account.id } });
  assert.equal(+original.expiresAt - +original.createdAt, 7 * 86400_000);
  const failed = await reserveMail(false, 250);
  assert.ok(failed);
  assert.ok(await beginHandoff(failed, randomBytes(32).toString('base64url')));
  await completeHandoff(failed.id, { outcome: 'TEMPORARY', phase: 'FINAL', code: 451, channel: false });
  await prisma.credentialMail.update({ where: { id: original.id }, data: { nextAt: new Date(0) } });
  const old = await prepareVerification();
  const attempts = await prisma.authToken.findMany({ where: { userId: account.id, type: 'VERIFY_EMAIL' } });
  assert.equal(attempts.length, 2);
  assert.ok(attempts.every(t => +t.expiresAt === +original.expiresAt));
  const keys = [randomUUID(), randomUUID()];
  const results = await Promise.allSettled(keys.map(key => resendInvite(operator, account.id, key)));
  const winner = results.findIndex(r => r.status === 'fulfilled');
  assert.notEqual(winner, -1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal(await prisma.credentialMail.count({ where: { userId: account.id } }), 2);
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', old), null);
  const fresh = await prepareVerification();
  assert.ok(await consumeTrialLink('VERIFY_EMAIL', fresh));
  await assert.rejects(resendInvite(operator, account.id, keys[winner]), /eligible pending invitation/);
  await prisma.user.update({ where: { id: account.id }, data: { isActive: false } });
  await assert.rejects(resendInvite(operator, account.id, randomUUID()), /eligible pending invitation/);
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', fresh), null);
  assert.equal(await prisma.credentialMail.count({ where: { userId: account.id } }), 2);
});

test('suspending an account still waiting for verification disables both the mailed link and its initial resend', async () => {
  const { resendInvite } = await import('../src/server/services/credential-mail.service');
  const account = await createUser(actor, { email: address(), roles: ['PILOT'], locale: 'it' });
  const old = await prepareVerification();
  await prisma.user.update({ where: { id: account.id }, data: { isActive: false } });
  await assert.rejects(resendInvite(actor, account.id), /eligible pending invitation/);
  assert.equal(await consumeTrialLink('VERIFY_EMAIL', old), null);
  assert.equal((await prisma.emailVerification.findUniqueOrThrow({ where: { userId: account.id } })).verifiedAt, null);
});

for (const digest of [false, true]) for (const ranBefore of [false, true]) {
  test('no historical reminders at first activation; one later threshold and one renewed cycle (digest=' + digest + ', prior job=' + ranBefore + ')', async context => {
    const { updateExpiry } = await import('../src/server/services/expiries.service');
    const { runExpiryAlertsJob } = await import('../src/server/services/expiry-alerts.service');
    const { todayDateOnlyUtcInZone } = await import('../src/lib/zoned-time');
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@airmanager.local' } });
    const operator = { ...actor, userId: admin.id };
    const today = todayDateOnlyUtcInZone('Europe/Rome');
    const day = (offset: number) => new Date(+today + offset * 86400_000);
    const email = address();
    const person = await createPerson(operator, { firstName: 'Fixture', lastName: randomUUID(), access: { email, roles: ['PILOT'] } });
    const reporter = await trialUser();
    await prisma.user.update({ where: { id: reporter.id }, data: { roles: ['ADMIN'] } });
    const setting = await prisma.appSetting.findUnique({ where: { key: 'mail.operational' } });
    const value = JSON.stringify({ switches: { expiryDigest: digest }, holderSince: null, digestSince: null });
    await prisma.appSetting.upsert({ where: { key: 'mail.operational' }, create: { key: 'mail.operational', value }, update: { value } });
    const info = await (await fetch('http://127.0.0.1:8025/api/v1/webui')).json();
    assert.equal(info.MessageRelay.Enabled, false);
    await selectRelay(1025);
    const expiries = [];
    const countMail = async (to: string) => (await (await fetch('http://127.0.0.1:8025/api/v1/search?query='+encodeURIComponent('to:'+to))).json()).messages.length as number;
    try {
      for (const days of [3, -1]) {
        const type = await prisma.expiryType.create({ data: { scope: 'ALL', name: randomUUID() } });
        expiries.push(await prisma.expiry.create({ data: { personId: person.id, expiryTypeId: type.id, expiresAt: day(days), actorUserId: admin.id } }));
      }
      if (ranBefore) await runExpiryAlertsJob();
      assert.equal(await countMail(email), 0);
      const before = await countMail(reporter.email);
      assert.equal(before, Number(digest && ranBefore), 'An eligible admin retains the current digest while the holder is pending');
      if (before) {
        const list = await (await fetch('http://127.0.0.1:8025/api/v1/search?query='+encodeURIComponent('to:'+reporter.email))).json();
        const mail = await (await fetch('http://127.0.0.1:8025/api/v1/message/'+list.messages[0].ID)).json();
        assert.ok(mail.Text.includes('attivazione') && mail.Text.includes(person.lastName));
      }
      const raw = await prepareVerification();
      assert.ok(await consumeTrialLink('VERIFY_EMAIL', raw));
      await runExpiryAlertsJob();
      assert.equal(await countMail(email), 0, 'No holder catch-up at activation');
      assert.equal(await countMail(reporter.email), before, 'No digest catch-up at activation');
      context.mock.timers.enable({ apis: ['Date'], now: +day(3) + 12 * 3600_000 });
      await runExpiryAlertsJob();
      assert.equal(await countMail(email), 1, 'Day-zero threshold in the existing cycle');
      assert.equal(await countMail(reporter.email), before + Number(digest));
      await runExpiryAlertsJob();
      assert.equal(await countMail(email), 1);
      await updateExpiry(operator, expiries[0].id, { expiresAt: day(5).toISOString().slice(0,10) });
      await runExpiryAlertsJob();
      await runExpiryAlertsJob();
      assert.equal(await countMail(email), 2, 'New renewal cycle, no duplicates');
      assert.equal(await countMail(reporter.email), before + 2 * Number(digest));
    } finally {
      await prisma.expiry.deleteMany({ where: { personId: person.id } });
      if (setting) await prisma.appSetting.update({ where: { key: setting.key }, data: { value: setting.value } });
      else await prisma.appSetting.deleteMany({ where: { key: 'mail.operational' } });
    }
  });
}

test('each admin digest starts with its own activation and includes a later threshold on the same expiry', async context => {
  const { runExpiryAlertsJob } = await import('../src/server/services/expiry-alerts.service');
  const { todayDateOnlyUtcInZone } = await import('../src/lib/zoned-time');
  const reporter = await createUser(actor, { email: address(), roles: ['ADMIN'], locale: 'en' });
  const other = await trialUser();
  await prisma.user.update({ where: { id: other.id }, data: { roles: ['ADMIN'] } });
  const contact = await createPerson(actor, { firstName: 'Fixture', lastName: randomUUID(), email: address() });
  const futureContact = await createPerson(actor, { firstName: 'Fixture', lastName: randomUUID(), email: address() });
  const type = await prisma.expiryType.create({ data: { name: randomUUID(), scope: 'ALL' } });
  const laterType = await prisma.expiryType.create({ data: { name: randomUUID(), scope: 'ALL' } });
  const today = todayDateOnlyUtcInZone('Europe/Rome');
  await prisma.expiry.createMany({ data: [
    { personId: contact.id, actorUserId: other.id, expiryTypeId: type.id, expiresAt: new Date(+today + 3 * 86400_000) },
    { personId: futureContact.id, actorUserId: other.id, expiryTypeId: laterType.id, expiresAt: new Date(+today + 9 * 86400_000) },
  ] });
  const sink = 'http://127.0.0.1:8025/api/v1';
  const info = await (await fetch(sink + '/webui')).json();
  assert.equal(info.MessageRelay.Enabled, false);
  await selectRelay(1025);
  const mails = async (email: string) =>
    (await (await fetch(sink+'/search?query='+encodeURIComponent('to:'+email))).json()).messages as {ID:string}[];
  try {
    const confirmed = await consumeTrialLink('VERIFY_EMAIL', await prepareVerification(), randomUUID());
    assert.ok(confirmed && confirmed !== 'passwordRequired');
    // At +2 days the second row has both old (30/60) and new (7) thresholds.
    context.mock.timers.enable({ apis: ['Date'], now: +today + 2 * 86400_000 + 12 * 3600_000 });
    await runExpiryAlertsJob();
    const newcomer = await mails(reporter.email);
    assert.equal(newcomer.length, 1);
    const digest = await (await fetch(sink+'/message/'+newcomer[0].ID)).json();
    assert.ok(!digest.Text.includes(type.name), 'Entirely pre-activation row excluded from this admin digest');
    assert.ok(digest.Text.includes(laterType.name), 'Mixed row included once for the new threshold');
    const existing = await mails(other.email);
    assert.equal(existing.length, 1);
    const original = await (await fetch(sink+'/message/'+existing[0].ID)).json();
    assert.ok(original.Text.includes(type.name) && original.Text.includes(laterType.name));
    assert.equal((await mails(contact.email!)).length, 1);
    assert.equal((await mails(futureContact.email!)).length, 1);
    await runExpiryAlertsJob();
    assert.equal((await mails(reporter.email)).length, 1);
  } finally { await prisma.expiry.deleteMany({ where: { personId: { in: [contact.id, futureContact.id] } } }); }
});

test('a committed debit preceding verification stays silent when the post-commit overview resumes after activation', async context => {
  const { Pool } = await import('pg');
  const { recordAdjustment } = await import('../src/server/services/accounts.service');
  const operator = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@airmanager.local' } });
  const email = address();
  const person = await createPerson(actor, { firstName: 'Fixture', lastName: randomUUID(), access: { email, roles: ['PILOT'] } });
  const raw = await prepareVerification();
  const account = await prisma.account.create({ data: { personId: person.id } });
  const sink = 'http://127.0.0.1:8025/api/v1';
  assert.equal((await (await fetch(sink+'/webui')).json()).MessageRelay.Enabled, false);
  await selectRelay(1025);
  const original = Pool.prototype.query;
  let crossed = false;
  context.mock.method(Pool.prototype, 'query', async function(this: InstanceType<typeof Pool>, ...args: unknown[]) {
    const query = args[0] as { text?: string; values?: unknown[] };
    if (!crossed && query.text?.includes('"AccountMovement"."description"') && query.values?.includes(account.id)) {
      crossed = true;
      assert.ok(await consumeTrialLink('VERIFY_EMAIL', raw));
    }
    return Reflect.apply(original, this, args);
  });
  await recordAdjustment({ ...actor, userId: operator.id }, person.id, { amountCents: -5000, reason: 'Activation boundary fixture' });
  assert.ok(crossed, 'The post-commit overview observed the barrier');
  // Send a fresh eligible control after the preceding asynchronous task, then read the capture.
  const { sendNegativeBalanceAlert } = await import('../src/server/services/accounts.service');
  await sendNegativeBalanceAlert(person.id, person, -5000);
  const mails = await (await fetch(sink+'/search?query='+encodeURIComponent('to:'+email))).json();
  assert.equal(mails.messages.length, 1, 'Only the post-activation alert may reach the sink');
});

test('a pending holder who confirms during the reminder job never inherits its old claim', async context => {
  const { Pool } = await import('pg');
  const { runExpiryAlertsJob } = await import('../src/server/services/expiry-alerts.service');
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@airmanager.local' } });
  const operator = { ...actor, userId: admin.id };
  const reporter = await trialUser();
  await prisma.user.update({ where: { id: reporter.id }, data: { roles: ['ADMIN'] } });
  const email = address();
  const person = await createPerson(operator, { firstName: 'Fixture', lastName: randomUUID(), access: { email, roles: ['PILOT'] } });
  const type = await prisma.expiryType.create({ data: { name: randomUUID(), scope: 'ALL' } });
  const expiry = await prisma.expiry.create({ data: { personId: person.id, expiryTypeId: type.id,
    expiresAt: new Date(Date.now()+3*86400_000), actorUserId: admin.id } });
  const raw = await prepareVerification();
  const sink = 'http://127.0.0.1:8025/api/v1';
  assert.equal((await (await fetch(sink+'/webui')).json()).MessageRelay.Enabled, false);
  await selectRelay(1025);
  const original = Pool.prototype.query;
  let crossed = false;
  context.mock.method(Pool.prototype, 'query', async function(this: InstanceType<typeof Pool>, ...args: unknown[]) {
    const query = args[0] as { text?: string; values?: unknown[] };
    // Either post-claim branch can reach here: resolving a holder, or listing admins.
    if (!crossed && (query.text?.includes('AS "contactContested"') && query.values?.includes(person.id)
      || query.text?.includes('"User"."roles" @>'))) {
      crossed = true;
      assert.equal(await prisma.sentAlert.count({ where: { expiryId: expiry.id } }), 3);
      assert.ok(await consumeTrialLink('VERIFY_EMAIL', raw));
    }
    return Reflect.apply(original, this, args);
  });
  try {
    await runExpiryAlertsJob();
    assert.ok(crossed, 'The account was verified after the job committed the cadence claim');
    await runExpiryAlertsJob();
    const mails = async (to: string) => (await (await fetch(sink+'/search?query='+encodeURIComponent('to:'+to))).json()).messages;
    assert.equal((await mails(email)).length, 0);
    const list = await mails(reporter.email);
    assert.equal(list.length, 1);
    const digest = await (await fetch(sink+'/message/'+list[0].ID)).json();
    assert.ok(digest.Text.includes(type.name) && digest.Text.includes('attivazione'));
  } finally { await prisma.expiry.delete({ where: { id: expiry.id } }); }
});

for (const when of ['between digests', 'at the next handoff'] as const) test('personalized digests preserve only previously handed-off rows on renewal ' + when, async context => {
  const { Pool } = await import('pg');
  const { SmtpMailSender } = await import('../src/server/adapters/mail/smtp-mail-sender');
  const { updateExpiry } = await import('../src/server/services/expiries.service');
  const { runExpiryAlertsJob } = await import('../src/server/services/expiry-alerts.service');
  const { todayDateOnlyUtcInZone } = await import('../src/lib/zoned-time');
  const oldAdmin = await trialUser();
  await prisma.user.update({ where: { id: oldAdmin.id }, data: { roles: ['ADMIN'] } });
  const operator = { ...actor, userId: oldAdmin.id };
  const newcomer = await createUser(operator, { email: address(), roles: ['ADMIN'], locale: 'en' });
  const today = todayDateOnlyUtcInZone('Europe/Rome');
  const day = (offset: number) => new Date(+today + offset * 86400_000);
  const newExpiry = async () => {
    const contact = await createPerson(operator, { firstName: 'Fixture', lastName: randomUUID(), email: address() });
    const type = await prisma.expiryType.create({ data: { name: randomUUID(), scope: 'ALL' } });
    const expiry = await prisma.expiry.create({ data: { personId: contact.id, actorUserId: oldAdmin.id,
      expiryTypeId: type.id, expiresAt: day(3) } });
    return { name: type.name, id: expiry.id };
  };
  const hidden = await newExpiry();
  const confirmed = await consumeTrialLink('VERIFY_EMAIL', await prepareVerification(), randomUUID());
  assert.ok(confirmed && confirmed !== 'passwordRequired');
  const visible = await newExpiry();
  const key = 'mail.operational';
  const prior = await prisma.appSetting.findUnique({ where: { key } });
  const value = JSON.stringify({ switches: { expiryHolder: false, expiryDigest: true }, holderSince: null, digestSince: null });
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  const sink = 'http://127.0.0.1:8025/api/v1';
  assert.equal((await (await fetch(sink+'/webui')).json()).MessageRelay.Enabled, false);
  await selectRelay(1025);
  // Explicit fixture order, independent of PostgreSQL's heap/index scan order.
  const originalQuery = Pool.prototype.query;
  context.mock.method(Pool.prototype, 'query', async function(this: InstanceType<typeof Pool>, ...args: unknown[]) {
    const query = args[0] as { text?: string };
    const result = await Reflect.apply(originalQuery, this, args);
    if (query.text?.includes('"User"."roles" @>')) {
      const index = result.fields.findIndex((f: {name:string}) => f.name === 'id');
      assert.ok(index >= 0);
      const id = (row: {id: string} | string[]) => Array.isArray(row) ? row[index] : row.id;
      result.rows.sort((a: string[], b: string[]) => Number(id(b) === newcomer.id) - Number(id(a) === newcomer.id));
    }
    return result;
  });
  const handoffs: string[] = [];
  const originalSend = SmtpMailSender.prototype.send;
  let renewed = false;
  const renew = async () => {
    if (renewed) return;
    renewed = true;
    // Both sets of claims vanish. Only the visible row was present in the first message.
    for (const row of [hidden, visible]) await updateExpiry(operator, row.id, { expiresAt: day(90).toISOString().slice(0, 10) });
  };
  context.mock.method(SmtpMailSender.prototype, 'send', async function(this: InstanceType<typeof SmtpMailSender>, message: Parameters<typeof originalSend>[0]) {
    if (message.to === oldAdmin.email && when === 'at the next handoff') await renew();
    await originalSend.call(this, message);
    if (message.to !== newcomer.email && message.to !== oldAdmin.email) return;
    handoffs.push(message.to === newcomer.email ? 'new' : 'existing');
    if (message.to === newcomer.email && when === 'between digests') await renew();
  });
  try {
    await runExpiryAlertsJob();
    assert.deepEqual(handoffs, ['new', 'existing']);
    for (const email of [newcomer.email, oldAdmin.email]) {
      const list = await (await fetch(sink+'/search?query='+encodeURIComponent('to:'+email))).json();
      assert.equal(list.messages.length, 1);
      const mail = await (await fetch(sink+'/message/'+list.messages[0].ID)).json();
      assert.ok(mail.Text.includes(visible.name), 'Preserve the row handed off in the first digest');
      assert.ok(!mail.Text.includes(hidden.name), 'Never hand off an obsolete row excluded from the first digest');
    }
  } finally {
    await prisma.expiry.deleteMany({ where: { id: { in: [hidden.id, visible.id] } } });
    if (prior) await prisma.appSetting.update({ where: { key }, data: { value: prior.value } });
    else await prisma.appSetting.deleteMany({ where: { key } });
  }
});

for (const relinkAt of ['after claim', 'at relay fence'] as const) {
  test('a reminder claim cannot follow a newly linked account ' + relinkAt, async context => {
    const { Pool } = await import('pg');
    const { SmtpMailSender } = await import('../src/server/adapters/mail/smtp-mail-sender');
    const { updateUser } = await import('../src/server/services/users.service');
    const { runExpiryAlertsJob } = await import('../src/server/services/expiry-alerts.service');
    const admin = await trialUser();
    await prisma.user.update({ where: { id: admin.id }, data: { roles: ['ADMIN'] } });
    const operator = { ...actor, userId: admin.id };
    const other = await trialUser();
    const person = await createPerson(operator, { firstName: 'Fixture', lastName: randomUUID(), email: address() });
    const type = await prisma.expiryType.create({ data: { name: randomUUID(), scope: 'ALL' } });
    const expiry = await prisma.expiry.create({ data: { personId: person.id, actorUserId: admin.id,
      expiryTypeId: type.id, expiresAt: new Date(Date.now()+3*86400_000) } });
    const sink = 'http://127.0.0.1:8025/api/v1';
    assert.equal((await (await fetch(sink+'/webui')).json()).MessageRelay.Enabled, false);
    await selectRelay(1025);
    let changed = false;
    const relink = async () => {
      if (changed) return;
      changed = true;
      assert.equal(await prisma.sentAlert.count({ where: { expiryId: expiry.id } }), 3);
      await updateUser(operator, other.id, { personId: person.id });
    };
    if (relinkAt === 'after claim') {
      const original = Pool.prototype.query;
      context.mock.method(Pool.prototype, 'query', async function(this: InstanceType<typeof Pool>, ...args: unknown[]) {
        const query = args[0] as { text?: string; values?: unknown[] };
        if (query.text?.includes('AS "contactContested"') && query.values?.includes(person.id)) await relink();
        return Reflect.apply(original, this, args);
      });
    } else {
      const original = SmtpMailSender.prototype.send;
      context.mock.method(SmtpMailSender.prototype, 'send', async function(this: InstanceType<typeof SmtpMailSender>, message: Parameters<typeof original>[0]) {
        if (message.to === person.email) await relink();
        return original.call(this, message);
      });
    }
    try {
      await runExpiryAlertsJob();
      assert.equal(changed, true);
      await runExpiryAlertsJob();
      const mails = async (to: string) => (await (await fetch(sink+'/search?query='+encodeURIComponent('to:'+to))).json()).messages;
      assert.equal((await mails(other.email)).length, 0, 'A later link is never a destination for this claim or its next run');
      assert.equal((await mails(person.email!)).length, 0, 'Former contact is not eligible at relay handoff');
      const digests = await mails(admin.email);
      assert.equal(digests.length, 1);
      const digest = await (await fetch(sink+'/message/'+digests[0].ID)).json();
      assert.ok(digest.Text.includes(type.name) && digest.Text.includes('destinatario'));
      assert.equal(await prisma.sentAlert.count({ where: { expiryId: expiry.id } }), 3);
    } finally { await prisma.expiry.delete({ where: { id: expiry.id } }); }
  });
}
