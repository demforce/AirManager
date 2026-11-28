import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, beforeEach, test } from 'node:test';
import './require-mail-integration-db';
import { hashPassword, verifyPassword } from '../src/server/auth/password';
import { prisma } from '../src/server/db/prisma';
import { requestProfilePassword, saveProfilePassword } from '../src/server/services/profile-password';
import { beginHandoff, completeHandoff, reserveMail, processMailAttempt } from '../src/server/services/credential-mail-worker';
import { enqueueCredential } from '../src/server/services/credential-mail.service';
import { setPasswordWithToken } from '../src/server/services/auth-tokens.service';
import { requestAddressChange, submitAddressChange } from '../src/server/services/account-email-change';
import { updateUser } from '../src/server/services/users.service';
import { emailTrialEnabled } from '../src/server/auth/email-trial-policy';
import { startSyntheticSmtp } from './synthetic-smtp';

const purpose = 'CHANGE_ADMIN_PASSWORD';
const raw = () => randomBytes(32).toString('base64url');
async function holder() {
  const email = randomUUID() + '@fixture.invalid';
  const password = randomUUID();
  const user = await prisma.user.create({ data: { email, roles: ['ADMIN'], passwordHash: await hashPassword(password),
    emailVerification: { create: { email, verifiedAt: new Date() } } } });
  return { user, actor: { userId: user.id, personId: null, roles: user.roles }, password };
}
async function reserve() {
  const attempt = await reserveMail(false, 250);
  assert.ok(attempt);
  return attempt;
}
async function deliver() {
  const attempt = await reserve();
  const token = raw();
  assert.ok(await beginHandoff(attempt, token));
  await completeHandoff(attempt.id, { outcome: 'ACCEPTED', phase: 'FINAL', channel: false });
  return token;
}
beforeEach(async () => {
  assert.ok(emailTrialEnabled());
  await prisma.mailAttempt.deleteMany();
  await prisma.credentialMail.deleteMany();
  await prisma.emailTrialRequest.deleteMany();
  await prisma.mailChannel.update({ where: { id: 1 }, data: { mode: 'ACTIVE', failures: 0, probeId: null, probeAfter: null } });
});
after(() => prisma.$disconnect());

test('eligible holder only; concurrent clicks queue once; only one valid save revokes other credentials', async () => {
  const { actor, user, password } = await holder();
  const record = () => prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  await assert.rejects(requestProfilePassword({ ...actor, roles: ['PILOT'] }));
  await prisma.$transaction(tx => enqueueCredential(tx, user.id, 'PASSWORD_RESET'));
  const reset = await deliver();
  await Promise.all([requestProfilePassword(actor), requestProfilePassword(actor)]);
  assert.equal(await prisma.credentialMail.count({ where: { purpose, userId: user.id } }), 1);
  const token = await deliver();
  const next = randomUUID();
  for (const separator of ['\n', '\r']) {
    const multiline = next + separator + 'fixture';
    assert.equal(await saveProfilePassword(token, multiline, multiline), 'policy');
    await assert.rejects(setPasswordWithToken(reset, multiline), { code: 'ADMIN_PASSWORD_POLICY' });
  }
  for (const [value, confirm] of [[next, 'mismatch'], [password, password], [user.email, user.email]]) {
    assert.notEqual(await saveProfilePassword(token, value, confirm), 'saved');
  }
  assert.equal(await prisma.authToken.count({ where: { userId: user.id, usedAt: null } }), 2);
  assert.equal((await record()).tokenVersion, user.tokenVersion);
  assert.ok(await verifyPassword((await record()).passwordHash!, password));
  assert.deepEqual((await Promise.all([saveProfilePassword(token, next, next), saveProfilePassword(token, next, next)])).sort(), ['invalid', 'saved']);
  assert.equal(await saveProfilePassword(token, next, next), 'invalid');
  await assert.rejects(setPasswordWithToken(reset, randomUUID()), {name:'ValidationError'});
  const changed = await record();
  assert.equal(changed.tokenVersion, user.tokenVersion + 1);
  assert.ok(await verifyPassword(changed.passwordHash!, next));
  assert.equal(await verifyPassword(changed.passwordHash!, password), false);
});

test('expiry, account changes and intervening password reset prevent saving', async () => {
  for (const reason of ['expired','demotion','suspended','address','reset']) {
    const { actor, user } = await holder();
    await requestProfilePassword(actor);
    const token = await deliver();
    if (reason === 'expired') await prisma.authToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
    if (reason === 'demotion') { await updateUser(actor,user.id,{ roles: ['PILOT'] }); await updateUser(actor,user.id,{ roles: ['ADMIN'] }); }
    if (reason === 'suspended') await updateUser(actor,user.id,{ isActive: false });
    if (reason === 'address') await prisma.emailVerification.update({where:{userId:user.id},data:{email:randomUUID()+'@fixture.invalid'}});
    if (reason === 'reset') {
      await prisma.$transaction(tx => enqueueCredential(tx,user.id,'PASSWORD_RESET'));
      await setPasswordWithToken(await deliver(), randomUUID());
    }
    const before = await prisma.user.findUniqueOrThrow({ where:{id:user.id} });
    const next = randomUUID();
    assert.equal(await saveProfilePassword(token,next,next), 'invalid', reason);
    const after = await prisma.user.findUniqueOrThrow({ where:{id:user.id} });
    assert.ok(after.passwordHash === before.passwordHash && after.tokenVersion === before.tokenVersion,reason);
  }
});
test('temporary refusal retains ten-minute expiry; demotion before retry suppresses the old intent', async () => {
  const { actor, user } = await holder();
  await requestProfilePassword(actor);
  const intent = await prisma.credentialMail.findFirstOrThrow({where:{userId:user.id,purpose}});
  assert.equal(+intent.expiresAt - +intent.createdAt, 600_000);
  const first = await reserve();
  assert.ok(await beginHandoff(first));
  await completeHandoff(first.id,{outcome:'TEMPORARY',phase:'RECIPIENT',channel:false,code:451});
  const retry = await prisma.credentialMail.findUniqueOrThrow({where:{id:intent.id}});
  assert.equal(retry.state,'QUEUED');
  assert.equal(+retry.expiresAt,+intent.expiresAt);
  await prisma.credentialMail.update({where:{id:intent.id},data:{nextAt:new Date(0)}});
  await updateUser(actor,user.id,{roles:['PILOT']});
  await updateUser(actor,user.id,{roles:['ADMIN']});
  assert.equal(await beginHandoff(await reserve()),null);
});

for (const transition of ['role', 'address'] as const) test(`a ${transition} change during SMTP greeting prevents submission`, async () => {
  const relay = await startSyntheticSmtp();
  const { actor, user } = await holder();
  try {
    let confirmAddress: string | undefined;
    if (transition === 'address') {
      await requestAddressChange(actor, user.id);
      assert.ok(await submitAddressChange('CHANGE_EMAIL_CURRENT', await deliver(), randomUUID() + '@fixture.invalid'));
      confirmAddress = await deliver();
    }
    relay.controls.reply = 'holdGreeting';
    for (const [key,value] of Object.entries({'smtp.host':'127.0.0.1','smtp.port':String(relay.port),'smtp.security':'NONE','smtp.from':'fixture@example.invalid'})) {
      await prisma.appSetting.upsert({where:{key},create:{key,value},update:{value}});
    }
    await requestProfilePassword(actor);
    const processing = processMailAttempt(await reserve(), undefined, true);
    for (let i=0; !relay.controls.finish && i<100; i++) await new Promise(resolve=>setTimeout(resolve,25));
    assert.ok(relay.controls.finish);
    if (confirmAddress) assert.ok(await submitAddressChange('CHANGE_EMAIL_NEW', confirmAddress));
    else {
      await updateUser(actor,user.id,{roles:['PILOT']});
      await updateUser(actor,user.id,{roles:['ADMIN']});
    }
    relay.controls.finish();
    assert.equal((await processing)?.outcome,'SUPPRESSED');
    assert.equal(relay.controls.recipients.length,0);
  } finally { await relay.close(); }
});

test('request reads current database eligibility; an unverified, inactive, ordinary or passwordless account cannot queue', async () => {
  for (const condition of ['unverified', 'inactive', 'pilot', 'passwordless']) {
    const { actor, user } = await holder();
    if (condition === 'unverified') await prisma.emailVerification.update({ where: { userId: user.id }, data: { verifiedAt: null } });
    if (condition === 'inactive') await updateUser(actor, user.id, { isActive: false });
    if (condition === 'pilot') await updateUser(actor, user.id, { roles: ['PILOT'] });
    if (condition === 'passwordless') await prisma.user.update({ where: { id: user.id }, data: { passwordHash: null } });
    await assert.rejects(requestProfilePassword(actor), { name: 'ConflictError' });
  }
  assert.equal(await prisma.credentialMail.count({ where: { purpose } }), 0);
});
