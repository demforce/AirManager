import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPerson } from '../src/server/services/people.service';
import { after, beforeEach, test } from 'node:test';
import './require-mail-integration-db';
import { prisma } from '../src/server/db/prisma';
import { emailTrialEnabled } from '../src/server/auth/email-trial-policy';
import { applyActiveRecheck } from '../src/server/auth/jwt-active-check';
import { requestAddressChange, submitAddressChange } from '../src/server/services/account-email-change';
import { holderMailbox } from '../src/server/services/account-mailbox';
import { databaseNow, enqueueCredential } from '../src/server/services/credential-mail.service';
import { beginHandoff, completeHandoff, reserveMail } from '../src/server/services/credential-mail-worker';
import { consumeTrialLink, requestEmailLogin } from '../src/server/services/email-trial.service';
import { openCandidate } from '../src/server/crypto/address-candidate';
import type { AuthTokenType } from '../src/generated/prisma/client';

const first = 'CHANGE_EMAIL_CURRENT';
const second = 'CHANGE_EMAIL_NEW';
const manager = { userId: 'change-operator', roles: ['ADMIN'] as ['ADMIN'], personId: null };
const address = () => randomUUID() + '@fixture.invalid';
const ttl = 600_000;

async function holder(withPerson = false) {
  const email = address();
  return prisma.user.create({ data: {
    email, roles: ['ADMIN'], emailVerification: { create: { email, verifiedAt: new Date(Date.now() - 86400_000), expiryStartCycle: 5 } },
    ...(withPerson && { person: { create: { firstName: 'Fixture', lastName: 'Holder', email: address() } } }),
  }, include: { emailVerification: true, person: true } });
}

async function handoff(purpose: AuthTokenType, recipient: string, outcome: 'ACCEPTED' | 'TEMPORARY' | 'UNCERTAIN' = 'ACCEPTED') {
  const attempt = await reserveMail(false, 250);
  assert.ok(attempt);
  const raw = randomBytes(32).toString('base64url');
  const { credential } = await beginHandoff(attempt, raw) ?? {};
  assert.ok(credential && credential.purpose === purpose && credential.to === recipient, 'Unexpected handoff purpose or destination');
  await completeHandoff(attempt.id, { outcome, phase: outcome === 'TEMPORARY' ? 'RECIPIENT' : 'FINAL', channel: false });
  return raw;
}

async function stageTwo() {
  const user = await holder();
  const next = address();
  await requestAddressChange(manager, user.id);
  const oldLink = await handoff(first, user.email);
  assert.ok(await submitAddressChange(first, oldLink, next));
  const newLink = await handoff(second, next);
  return { user, next, newLink };
}

beforeEach(async () => {
  assert.ok(emailTrialEnabled());
  await prisma.mailAttempt.deleteMany({});
  await prisma.credentialMail.deleteMany({});
  await prisma.emailTrialRequest.deleteMany({});
  await prisma.mailChannel.update({ where: { id: 1 }, data: { mode: 'ACTIVE', loginLinksPaused: false, probeId: null, probeAfter: null, failures: 0 } });
});
after(() => prisma.$disconnect());

test('a +9/+11 minute sequence commits one identity and revokes preceding sessions and links, preserving notification boundaries', async () => {
  const user = await holder(true);
  const next = address();
  const actor = { userId: user.id, roles: user.roles, personId: user.personId };
  const cookie = { userId: user.id, roles: user.roles, personId: user.personId, tokenVersion: user.tokenVersion, lastActiveCheck: Date.now(), email: user.email };
  await requestEmailLogin(user.email, 'direct');
  const previousLogin = await handoff('LOGIN_LINK', user.email);
  await prisma.$transaction(tx => enqueueCredential(tx, user.id, 'PASSWORD_RESET'));
  const reset = await handoff('PASSWORD_RESET', user.email);
  await requestAddressChange(actor, user.id);
  const oldLink = await handoff(first, user.email);
  const intent = await prisma.credentialMail.findFirstOrThrow({ where: { purpose: first, userId: user.id } });
  assert.equal(+intent.expiresAt - +intent.createdAt, ttl);
  // Advance only the disposable fixture's deadlines relative to database time.
  const shift = async (id: string, tokenId: string | null, minutes: number) => {
    assert.ok(tokenId);
    const row = await prisma.credentialMail.findUniqueOrThrow({ where: { id } });
    const expiresAt = new Date(+row.expiresAt - minutes * 60_000);
    await prisma.credentialMail.update({ where: { id }, data: { createdAt: new Date(+row.createdAt - minutes * 60_000), expiresAt } });
    await prisma.authToken.update({ where: { id: tokenId }, data: { expiresAt } });
  };
  await shift(intent.id, intent.tokenId, 9);
  assert.equal(await submitAddressChange(second, oldLink), false);
  const accepted = await Promise.all([submitAddressChange(first, oldLink, next.toUpperCase()), submitAddressChange(first, oldLink, next)]);
  assert.equal(accepted.filter(Boolean).length, 1);
  const pending = await prisma.credentialMail.findFirstOrThrow({ where: { purpose: second, userId: user.id } });
  assert.equal(+pending.expiresAt - +pending.createdAt, ttl);
  assert.ok(pending.candidateBox && !pending.candidateBox.includes(next) && openCandidate(pending) === next);
  assert.equal(await prisma.credentialMail.count({ where: { purpose: second, userId: user.id } }), 1);
  for (const changed of [{ id: randomUUID() }, { generation: pending.generation + BigInt(1) }, { userId: randomUUID() }]) {
    assert.equal(openCandidate({ ...pending, ...changed }), null);
  }
  assert.ok(await applyActiveRecheck({ ...cookie }));
  assert.ok((await holderMailbox(user.personId!, null))?.email === user.email);
  const newLink = await handoff(second, next);
  await shift(pending.id, (await prisma.credentialMail.findUniqueOrThrow({ where: { id: pending.id } })).tokenId, 2);
  await shift(intent.id, intent.tokenId, 2);
  const clock = await databaseNow(prisma);
  const currentDeadline = await prisma.credentialMail.findUniqueOrThrow({ where: { id: intent.id }, select: { expiresAt: true } });
  const newDeadline = await prisma.credentialMail.findUniqueOrThrow({ where: { id: pending.id }, select: { expiresAt: true } });
  assert.ok(currentDeadline.expiresAt <= clock && clock < newDeadline.expiresAt, 'The first deadline has passed, the second is still open.');
  const completed = await Promise.all([submitAddressChange(second, newLink), submitAddressChange(second, newLink)]);
  assert.equal(completed.filter(Boolean).length, 1);
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { person: true, emailVerification: true } });
  assert.ok(updated.email === next && updated.emailVerification?.email === next && updated.emailVerification.addressChangedAt);
  assert.equal(+updated.emailVerification!.verifiedAt!, +user.emailVerification!.verifiedAt!);
  assert.equal(updated.emailVerification!.expiryStartCycle, user.emailVerification!.expiryStartCycle);
  assert.ok(updated.person?.email === user.person?.email && (await holderMailbox(user.personId!, null))?.email === next);
  assert.equal(updated.tokenVersion, user.tokenVersion + 1);
  assert.equal(updated.adminPasswordVersion, user.adminPasswordVersion + 1);
  assert.equal(await applyActiveRecheck({ ...cookie }), null);
  assert.equal(await applyActiveRecheck({ ...cookie, emailTrialLogin: true }), null);
  assert.equal(await applyActiveRecheck({ ...cookie, adminPasswordVersion: user.adminPasswordVersion }), null);
  assert.equal(await consumeTrialLink('LOGIN_LINK', previousLogin, user.email), null);
  assert.ok(reset && await prisma.authToken.count({ where: { userId: user.id, usedAt: null } }) === 0);
  assert.equal((await prisma.credentialMail.findUniqueOrThrow({ where: { id: pending.id } })).candidateBox, null);
  await requestEmailLogin(user.email, 'direct');
  assert.equal(await prisma.credentialMail.count({ where: { userId: user.id, purpose: 'LOGIN_LINK', revokedAt: null } }), 0);
  await requestEmailLogin(next, 'direct');
  const login = await handoff('LOGIN_LINK', next);
  assert.ok(await consumeTrialLink('LOGIN_LINK', login, next));
});

test('requires verified current ownership, self or users.manage, rejects inactive/unverified and trial off', async () => {
  const user = await holder();
  await assert.rejects(requestAddressChange({ ...manager, roles: ['PILOT'] }, user.id), { name: 'ForbiddenError' });
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  await assert.rejects(requestAddressChange(manager, user.id), { name: 'ConflictError' });
  await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
  await prisma.emailVerification.update({ where: { userId: user.id }, data: { verifiedAt: null } });
  await assert.rejects(requestAddressChange(manager, user.id), { name: 'ConflictError' });
  process.env.AIRMANAGER_EMAIL_TRIAL = '0';
  try {
    await assert.rejects(requestAddressChange(manager, user.id), { name: 'NotFoundError' });
    assert.equal(await submitAddressChange(second, randomBytes(32).toString('base64url')), false);
  } finally { process.env.AIRMANAGER_EMAIL_TRIAL = '1'; }
  assert.equal(await prisma.credentialMail.count({ where: { userId: user.id } }), 0);
});

test('canonical conflicts with inactive users and independent or archived contacts preserve the first token and the account', async () => {
  const user = await holder();
  const taken = await prisma.user.create({ data: { email: address(), roles: ['PILOT'], isActive: false } });
  const contacts = await Promise.all([false, true].map(archived => prisma.person.create({ data: {
    firstName: 'Fixture', lastName: 'Independent', email: address(), archivedAt: archived ? new Date() : null,
  } })));
  await requestAddressChange(manager, user.id);
  const oldLink = await handoff(first, user.email);
  for (const email of [user.email, taken.email, ...contacts.map(p => p.email!)]) {
    assert.equal(await submitAddressChange(first, oldLink, ' ' + email.toUpperCase() + ' '), false);
  }
  assert.equal(await prisma.credentialMail.count({ where: { userId: user.id, purpose: second } }), 0);
  const next = address();
  assert.ok(await submitAddressChange(first, oldLink, next));
  const link = await handoff(second, next);
  await prisma.person.create({ data: { firstName: 'Fixture', lastName: 'Later owner', email: next.toUpperCase(), archivedAt: new Date() } });
  assert.equal(await submitAddressChange(second, link), false);
  const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.ok(unchanged.email === user.email && unchanged.tokenVersion === user.tokenVersion);
});

test('two verified accounts confirming the same candidate concurrently have one winner', async () => {
  const next = address();
  const flows = [];
  for (let i = 0; i < 2; i++) {
    const user = await holder();
    await requestAddressChange(manager, user.id);
    assert.ok(await submitAddressChange(first, await handoff(first, user.email), next));
    flows.push({ user, link: await handoff(second, next) });
  }
  const results = await Promise.all(flows.map(flow => submitAddressChange(second, flow.link)));
  assert.equal(results.filter(Boolean).length, 1);
  for (const [i, { user }] of flows.entries()) {
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(saved.email === (results[i] ? next : user.email) && saved.tokenVersion === user.tokenVersion + Number(results[i]));
  }
});

test('a retry, superseding start, lost acknowledgement or suspension cannot replay an older generation', async () => {
  const user = await holder();
  const next = address();
  const key = randomUUID();
  await Promise.all([requestAddressChange(manager, user.id, key), requestAddressChange(manager, user.id, key)]);
  assert.equal(await prisma.credentialMail.count({ where: { userId: user.id, purpose: first } }), 1);
  const firstRaw = await handoff(first, user.email, 'TEMPORARY');
  const original = await prisma.credentialMail.findFirstOrThrow({ where: { userId: user.id, purpose: first } });
  await prisma.credentialMail.update({ where: { id: original.id }, data: { nextAt: new Date(0) } });
  const retryRaw = await handoff(first, user.email);
  assert.equal(await submitAddressChange(first, firstRaw, next), false);
  assert.ok(await submitAddressChange(first, retryRaw, next));
  assert.equal(+(await prisma.credentialMail.findUniqueOrThrow({ where: { id: original.id } })).expiresAt, +original.expiresAt);
  const uncertain = await handoff(second, next, 'UNCERTAIN');
  await requestAddressChange(manager, user.id, key); // same operation does not rescind its own second stage
  const pending = await prisma.credentialMail.findFirstOrThrow({ where: { userId: user.id, purpose: second } });
  assert.ok(!pending.revokedAt && pending.candidateBox && pending.state === 'UNCERTAIN');
  assert.equal(await reserveMail(false, 250), null);
  await prisma.credentialMail.update({ where: { id: original.id }, data: { createdAt: new Date(Date.now() - 61_000) } });
  await requestAddressChange(manager, user.id);
  assert.equal(await submitAddressChange(second, uncertain), false);
  assert.equal((await prisma.credentialMail.findUniqueOrThrow({ where: { id: pending.id } })).candidateBox, null);
  const later = await handoff(first, user.email);
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  assert.equal(await submitAddressChange(first, later, next), false);
});

test('expiry of either stage preserves registered details and releases the encrypted candidate on the next scan', async () => {
  const user = await holder();
  await requestAddressChange(manager, user.id);
  const stale = await handoff(first, user.email);
  const expire = async (userId: string, purpose: AuthTokenType) => {
    const expiresAt = new Date(Date.now() - 1);
    await prisma.credentialMail.updateMany({where:{userId,purpose},data:{expiresAt}});
    await prisma.authToken.updateMany({where:{userId,type:purpose},data:{expiresAt}});
  };
  await expire(user.id, first);
  assert.equal(await submitAddressChange(first, stale, address()), false);
  const flow = await stageTwo();
  await expire(flow.user.id, second);
  assert.equal(await submitAddressChange(second, flow.newLink), false);
  assert.ok((await prisma.user.findUniqueOrThrow({where:{id:flow.user.id}})).email === flow.user.email);
  assert.equal(await reserveMail(false, 250), null);
  assert.equal(await prisma.credentialMail.count({where:{userId:flow.user.id,candidateBox:{not:null}}}),0);
});

test('the delivery fence suppresses a candidate claimed after reservation and retains the account', async () => {
  const user = await holder();
  const next = address();
  await requestAddressChange(manager, user.id);
  assert.ok(await submitAddressChange(first, await handoff(first, user.email), next));
  const attempt = await reserveMail(false, 250);
  assert.ok(attempt);
  await prisma.person.create({ data: { firstName: 'Fixture', lastName: 'New contact', email: next } });
  assert.equal(await beginHandoff(attempt), null);
  const intent = await prisma.credentialMail.findFirstOrThrow({where:{userId:user.id,purpose:second}});
  assert.equal(intent.state, 'SUPPRESSED');
  assert.equal(intent.tokenId, null);
  assert.equal(intent.candidateBox, null);
  assert.ok((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).email === user.email);
});

test('second-stage retry uses only the candidate and its original deadline; disabling the trial prevents confirmation and pickup', async () => {
  const user = await holder();
  const next = address();
  await requestAddressChange(manager, user.id);
  assert.ok(await submitAddressChange(first, await handoff(first, user.email), next));
  const oldRaw = await handoff(second, next, 'TEMPORARY');
  const original = await prisma.credentialMail.findFirstOrThrow({where:{userId:user.id,purpose:second}});
  await prisma.credentialMail.update({where:{id:original.id},data:{nextAt:new Date(0)}});
  process.env.AIRMANAGER_EMAIL_TRIAL = '0';
  try {
    assert.equal(await reserveMail(false, 250), null);
    assert.equal(await submitAddressChange(second, oldRaw), false);
  } finally { process.env.AIRMANAGER_EMAIL_TRIAL = '1'; }
  const retry = await handoff(second, next);
  const current = await prisma.credentialMail.findUniqueOrThrow({where:{id:original.id}});
  assert.equal(+current.expiresAt,+original.expiresAt);
  assert.equal(current.attempts,2);
  assert.equal(await submitAddressChange(second, oldRaw), false);
  assert.ok(await submitAddressChange(second, retry));
  process.env.AIRMANAGER_EMAIL_TRIAL = '0';
  try {
    assert.ok((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).email === next);
  } finally { process.env.AIRMANAGER_EMAIL_TRIAL = '1'; }
});

test('a concurrent contact writer queued before the final confirmation keeps the old account and its credentials', async () => {
  const { user, next, newLink } = await stageTwo();
  await requestEmailLogin(user.email, 'direct');
  const login = await handoff('LOGIN_LINK', user.email);
  const coordinator = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await coordinator.connect();
  try {
    await coordinator.query('BEGIN');
    await coordinator.query('SELECT pg_advisory_xact_lock(19021, 4)');
    const waitForWriters = async (count: number) => {
      const deadline = Date.now() + 2500;
      do {
        const { rows } = await coordinator.query(`SELECT count(*)::int AS waiting FROM pg_locks
          WHERE locktype='advisory' AND classid=19021 AND objid=4 AND NOT granted`);
        if (rows[0].waiting >= count) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      } while (Date.now() < deadline);
      throw new Error('Expected synthetic writers to reach the mailbox lock.');
    };
    const contact = createPerson(manager, { firstName: 'Concurrent', lastName: 'Owner', email: next });
    await waitForWriters(1);
    const finish = submitAddressChange(second, newLink);
    await waitForWriters(2);
    await coordinator.query('COMMIT');
    const [owner, switched] = await Promise.all([contact, finish]);
    assert.ok(owner.email === next && !switched);
    const saved = await prisma.user.findUniqueOrThrow({where:{id:user.id}});
    assert.ok(saved.email === user.email && saved.tokenVersion === user.tokenVersion && saved.adminPasswordVersion === user.adminPasswordVersion);
    assert.ok(await consumeTrialLink('LOGIN_LINK',login,user.email));
  } finally { await coordinator.end(); }
});

test('a restarted worker clears an expired candidate and records an abandoned handoff as uncertain', async () => {
  const user = await holder();
  const next = address();
  await requestAddressChange(manager, user.id);
  assert.ok(await submitAddressChange(first, await handoff(first, user.email), next));
  const attempt = await reserveMail(false,250);
  assert.ok(attempt?.intentId);
  assert.ok((await beginHandoff(attempt))?.credential?.to === next);
  const expiresAt = new Date(Date.now() - 10);
  await prisma.credentialMail.update({ where: { id: attempt.intentId }, data: { expiresAt } });
  await prisma.mailAttempt.update({ where: { id: attempt.id }, data: { leaseUntil: expiresAt } });
  assert.equal(await reserveMail(false,250), null);
  const stale = await prisma.credentialMail.findUniqueOrThrow({ where: { id: attempt.intentId } });
  assert.equal(stale.state, 'UNCERTAIN');
  assert.equal(stale.attempts, 1);
  assert.equal(stale.candidateBox, null);
  assert.ok((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).email === user.email);
});
