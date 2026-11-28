import './require-mail-integration-db';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, beforeEach, test } from 'node:test';
import { prisma } from '../src/server/db/prisma';
import { consumeTrialLink, requestEmailLogin } from '../src/server/services/email-trial.service';
import { beginHandoff, completeHandoff, processMailAttempt, reserveMail, runMailCycle } from '../src/server/services/credential-mail-worker';
import { setPasswordWithToken } from '../src/server/services/auth-tokens.service';
import { resendInvite } from '../src/server/services/credential-mail.service';
import { createUser } from '../src/server/services/users.service';
import { inspectAccessSecurity, setLoginPause, scanAccessSecurity } from '../src/server/services/access-security';
import { deliverSecurityAlerts, processSecurityAlert } from '../src/server/services/security-alert-delivery';
import { setSmtpSettings, writeSmtpSettingsCore } from '../src/server/services/app-settings.service';
import { startSyntheticSmtp } from './synthetic-smtp';

const operator = { userId: 'test-operator', personId: null, roles: ['ADMIN'] as ['ADMIN'] };
const mailbox = () => randomUUID() + '@fixture.invalid';

async function account(admin = false, verified = true, locale = 'it') {
  const email = mailbox();
  return prisma.user.create({ data: { email, roles: [admin ? 'ADMIN' : 'PILOT'], locale,
    emailVerification: { create: { email, verifiedAt: verified ? new Date() : null } } } });
}

async function localRelay(port: number) {
  for (const [key, value] of Object.entries({ 'smtp.host': '127.0.0.1', 'smtp.port': String(port),
    'smtp.security': 'NONE', 'smtp.from': 'sender@fixture.invalid' })) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}

async function pending(user: {id: string; email: string}) {
  await requestEmailLogin(user.email, 'direct');
  return prisma.credentialMail.findFirstOrThrow({ where: { userId: user.id } });
}

beforeEach(async () => {
  assert.equal(process.env.AIRMANAGER_EMAIL_TRIAL, '1');
  await prisma.securityIncident.deleteMany({});
  await prisma.loginVolume.deleteMany({});
  await prisma.mailAttempt.deleteMany({});
  await prisma.credentialMail.deleteMany({});
  await prisma.emailTrialRequest.deleteMany({});
  await prisma.authToken.deleteMany({ where: { user: { email: { endsWith: '@fixture.invalid' } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@fixture.invalid' } } });
  await prisma.mailChannel.update({ where: { id: 1 }, data: { mode: 'ACTIVE', failures: 0, probeId: null,
    probeAfter: null, loginLinksPaused: false, loginPauseThrough: 0, heartbeatAt: new Date(), monitorStartedAt: new Date() } });
});
after(() => prisma.$disconnect());

test('brief pause cancels waiting and reserved login work, preserves handed-off links and permits a fresh request', async () => {
  const first = await account();
  await pending(first);
  const emitted = await reserveMail(false, 250); assert.ok(emitted);
  const issued = randomBytes(32).toString('base64url');
  await beginHandoff(emitted, issued);
  await completeHandoff(emitted.id, { outcome: 'ACCEPTED', phase: 'FINAL', channel: false });
  const second = await account();
  const queued = await pending(second);
  const reserved = await reserveMail(false, 250); assert.ok(reserved);
  const third = await account();
  await setLoginPause(operator, true);
  assert.equal(await prisma.authToken.count({ where: { userId: first.id, usedAt: null } }), 1);
  assert.equal((await consumeTrialLink('LOGIN_LINK', issued, first.email))?.id, first.id);
  assert.equal(await consumeTrialLink('LOGIN_LINK', issued, first.email), null);
  await requestEmailLogin(third.email, 'direct');
  await setLoginPause(operator, false);
  assert.equal(await beginHandoff(reserved), null);
  assert.equal(await reserveMail(false, 250), null);
  assert.equal(await prisma.credentialMail.count({ where: { userId: third.id } }), 0);
  assert.equal((await prisma.credentialMail.findUniqueOrThrow({ where: { id: queued.id } })).state, 'SUPPRESSED');
  await requestEmailLogin(second.email, 'direct');
  assert.equal(await prisma.credentialMail.count({ where: { userId: second.id, state: 'QUEUED' } }), 1);
});

test('a pause and resume during the SMTP greeting stops this login at the final fence', async () => {
  const relay = await startSyntheticSmtp();
  try {
    await localRelay(relay.port);
    relay.controls.reply = 'holdGreeting';
    const user = await account();
    await pending(user);
    const reserved = await reserveMail(false, 250); assert.ok(reserved);
    const result = processMailAttempt(reserved, undefined, true);
    await waitForGreeting(relay.controls);
    await setLoginPause(operator, true);
    await setLoginPause(operator, false);
    relay.controls.finish!();
    assert.equal((await result)?.outcome, 'SUPPRESSED');
    assert.equal(relay.controls.recipients.length, 0);
    assert.equal(await prisma.authToken.count({ where: { userId: user.id, usedAt: null } }), 0);
  } finally { await relay.close(); }
});

test('monitor records and groups suppressed login demand and a never-started worker without a recipient or worker', async () => {
  const email = mailbox();
  for (let i = 0; i < 40; i++) await requestEmailLogin(email, 'direct');
  assert.equal(await prisma.emailTrialRequest.count({}), 5);
  await prisma.mailChannel.update({ where: { id: 1 }, data: { heartbeatAt: null, monitorStartedAt: new Date(Date.now() - 300000) } });
  await Promise.all([scanAccessSecurity(), scanAccessSecurity()]);
  assert.equal(await prisma.securityIncident.count({}), 2);
  assert.equal((await inspectAccessSecurity(operator)).withoutRecipients, 2);
  await account(true, false);
  await account(false, true);
  await scanAccessSecurity();
  assert.equal(await prisma.securityDelivery.count({}), 0);
  const admin = await account(true);
  await scanAccessSecurity();
  assert.equal(await prisma.securityDelivery.count({ where: { userId: admin.id } }), 2);
});

async function incidentForWorker() {
  await prisma.mailChannel.update({ where: { id: 1 }, data: { heartbeatAt: new Date(Date.now() - 300_000) } });
  await scanAccessSecurity();
}

async function dueAgain() {
  await prisma.securityDelivery.updateMany({ where: { state: 'QUEUED' }, data: { nextAt: new Date(0) } });
}

test('recipient readiness after legacy upgrade and an explicit mailbox confirmation', async () => {
  const sink = 'http://127.0.0.1:8025/api/v1';
  assert.equal((await (await fetch(sink + '/webui')).json()).MessageRelay.Enabled, false);
  const club = mailbox();
  const contactKey = 'airfield.contactEmail';
  const previous = await prisma.appSetting.findUnique({ where: { key: contactKey } });
  await prisma.appSetting.upsert({ where: { key: contactKey }, create: { key: contactKey, value: club }, update: { value: club } });
  const captured = async (address: string) => {
    const list = await (await fetch(sink + '/search?query=' + encodeURIComponent('to:' + address))).json();
    return list.messages as { ID: string; Subject: string }[];
  };
  async function issuedLink(address: string) {
    const attempt = await reserveMail(false, 250);
    assert.ok(attempt);
    assert.equal((await processMailAttempt(attempt, undefined, true))?.outcome, 'ACCEPTED');
    const mails = await captured(address);
    assert.equal(mails.length, 1);
    const message = await (await fetch(sink + '/message/' + mails[0].ID)).json();
    assert.ok(message.To.length === 1 && message.To[0].Address === address && !message.Cc?.length && !message.Bcc?.length);
    const url = new URL(message.Text.match(/https?:\/\/[^\s]+/)[0]);
    assert.ok(url.origin === new URL(process.env.APP_URL!).origin);
    return url;
  }
  try {
    await localRelay(1025);
    process.env.AIRMANAGER_EMAIL_TRIAL = '0';
    const legacy = await createUser(operator, { email: mailbox(), roles: ['ADMIN'], locale: 'it' });
    const provision = await issuedLink(legacy.email);
    assert.equal(provision.pathname, '/set-password');
    const passwordToken = provision.searchParams.get('token');
    assert.ok(passwordToken);
    await setPasswordWithToken(passwordToken, randomUUID());
    const legacyState = await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } });
    assert.ok(legacyState.passwordHash);
    process.env.AIRMANAGER_EMAIL_TRIAL = '1';
    assert.equal(await prisma.emailVerification.count({ where: { userId: legacy.id } }), 0);
    await assert.rejects(resendInvite(operator, legacy.id), { code: 'CONFLICT' });
    await requestEmailLogin(legacy.email, 'direct');
    assert.equal(await prisma.credentialMail.count({ where: { userId: legacy.id, purpose: { in: ['VERIFY_EMAIL', 'LOGIN_LINK'] } } }), 0);

    const pendingAdmin = await createUser(operator, { email: mailbox(), roles: ['ADMIN'], locale: 'it' });
    const invite = await issuedLink(pendingAdmin.email);
    assert.equal(invite.searchParams.get('purpose'), 'verify');
    const stale = new Date(Date.now() - 5 * 60_000);
    await prisma.mailChannel.update({ where: { id: 1 }, data: { heartbeatAt: stale, monitorAt: stale } });
    await scanAccessSecurity();
    const health = await prisma.mailChannel.findUniqueOrThrow({ where: { id: 1 } });
    assert.ok(health.monitorAt && health.monitorAt > stale);
    assert.equal(health.heartbeatAt?.getTime(), +stale);
    const incident = await prisma.securityIncident.findFirstOrThrow({ where: { kind: 'MAIL_WORKER' } });
    assert.equal(incident.needsRecipients, true);
    assert.equal(await prisma.securityDelivery.count({ where: { incidentId: incident.id } }), 0);

    // Confirm the credential actually submitted to Mailpit. No verification rows are manufactured by the fixture.
    assert.equal((await consumeTrialLink('VERIFY_EMAIL', invite.hash.slice(1)))?.id, pendingAdmin.id);
    await Promise.all([scanAccessSecurity(), scanAccessSecurity()]);
    const deliveries = await prisma.securityDelivery.findMany({ where: { incidentId: incident.id } });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].userId, pendingAdmin.id);
    assert.equal(deliveries[0].state, 'QUEUED');

    // The refused loopback connection definitely precedes SMTP acceptance.
    const stopped = await startSyntheticSmtp();
    await stopped.close();
    await localRelay(stopped.port);
    await deliverSecurityAlerts(true);
    let delivery = await prisma.securityDelivery.findUniqueOrThrow({ where: { id: deliveries[0].id } });
    assert.equal(delivery.state, 'QUEUED');
    assert.equal(delivery.attempts, 1);
    assert.equal(delivery.recipientFailures, 0);
    assert.ok(delivery.nextAt.getTime() > Date.now());
    await localRelay(1025);
    await dueAgain();
    const lastMonitor = (await inspectAccessSecurity(operator)).monitoredAt;
    await runMailCycle(250, true);
    const recovered = await prisma.mailChannel.findUniqueOrThrow({ where: { id: 1 } });
    assert.ok(recovered.heartbeatAt && recovered.heartbeatAt > stale);
    assert.equal(recovered.monitorAt?.getTime(), lastMonitor?.getTime());
    await Promise.all([scanAccessSecurity(), scanAccessSecurity()]);
    await deliverSecurityAlerts(true);
    delivery = await prisma.securityDelivery.findUniqueOrThrow({ where: { id: deliveries[0].id } });
    assert.equal(delivery.state, 'ACCEPTED');
    assert.equal(delivery.attempts, 2);
    const alert = 'AirManager — Avviso di sicurezza';
    const accepted = (await captured(pendingAdmin.email)).filter(m => m.Subject === alert);
    assert.equal(accepted.length, 1);
    const message = await (await fetch(sink + '/message/' + accepted[0].ID)).json();
    assert.ok(message.To.length === 1 && message.To[0].Address === pendingAdmin.email && !message.Cc?.length && !message.Bcc?.length);
    assert.equal((await captured(legacy.email)).filter(m => m.Subject === alert).length, 0);
    assert.equal((await captured(club)).length, 0);
  } finally {
    process.env.AIRMANAGER_EMAIL_TRIAL = '1';
    if (previous) await prisma.appSetting.update({ where: { key: contactKey }, data: { value: previous.value } });
    else await prisma.appSetting.delete({ where: { key: contactKey } });
  }
});

test('role checks, a healthy startup grace period and aggregate retention', async () => {
  const pilot = { ...operator, roles: ['PILOT'] as ['PILOT'] };
  await assert.rejects(setLoginPause(pilot, true), { code: 'FORBIDDEN' });
  await assert.rejects(inspectAccessSecurity(pilot), { code: 'FORBIDDEN' });
  await prisma.loginVolume.create({ data: { minute: new Date(0), requests: 400 } });
  await prisma.mailChannel.update({ where: { id: 1 }, data: { heartbeatAt: null } });
  await scanAccessSecurity();
  assert.equal(await prisma.securityIncident.count({}), 0);
  assert.equal(await prisma.loginVolume.count({}), 0);
  await incidentForWorker();
  await prisma.securityIncident.updateMany({ data: { lastSeenAt: new Date(Date.now() - 11 * 60_000) } });
  await prisma.mailChannel.update({ where: { id: 1 }, data: { heartbeatAt: new Date() } });
  await scanAccessSecurity();
  assert.equal(await prisma.securityIncident.count({ where: { resolvedAt: { not: null }, needsRecipients: true } }), 1);
});

test('only recently verified, active admins receive the alert, even with login paused and the relay unavailable for several cycles', async () => {
  const mailboxApi = 'http://127.0.0.1:8025/api/v1';
  const info = await (await fetch(mailboxApi + '/webui')).json();
  assert.equal(info.MessageRelay.Enabled, false, 'Mailpit forwarding must be disabled');
  const admins = await Promise.all([account(true), account(true, true, 'en')]);
  const inactive = await account(true);
  await prisma.user.update({ where: { id: inactive.id }, data: { isActive: false } });
  await account(true, false);
  await account();
  const moved = await account(true);
  await prisma.user.update({ where: { id: moved.id }, data: { email: mailbox() } });
  await setLoginPause(operator, true);
  const stopped = await startSyntheticSmtp();
  await stopped.close();
  await localRelay(stopped.port);
  await incidentForWorker();
  for (let i = 0; i < 4; i++) {
    await dueAgain();
    await deliverSecurityAlerts(true);
    assert.equal(await prisma.securityDelivery.count({ where: { state: 'QUEUED', recipientFailures: 0 } }), 2);
  }
  await localRelay(1025);
  await dueAgain();
  await Promise.all([deliverSecurityAlerts(true), deliverSecurityAlerts(true)]);
  assert.equal(await prisma.securityDelivery.count({ where: { state: 'ACCEPTED', attempts: 5 } }), 2);
  for (const admin of admins) {
    const search = await (await fetch(mailboxApi + '/search?query=' + encodeURIComponent('to:' + admin.email))).json();
    assert.equal(search.messages.length, 1);
    const mail = await (await fetch(mailboxApi + '/message/' + search.messages[0].ID)).json();
    assert.equal(mail.To.length, 1);
    assert.ok(mail.To[0].Address === admin.email);
    assert.equal(mail.Subject, admin.locale === 'en' ? 'AirManager — Security alert' : 'AirManager — Avviso di sicurezza');
    assert.ok(mail.Text.length && mail.HTML.includes('AirManager') && mail.HTML.includes('lang="' + admin.locale + '"'));
  }
});

test('recipient 451 is bounded, 550 is terminal, and loss of the final reply or worker lease does not trigger a second submission', async () => {
  const relay = await startSyntheticSmtp();
  try {
    await localRelay(relay.port);
    const user = await account(true);
    for (const behavior of ['temporary', 'permanent', 'loseReply', 'abandoned'] as const) {
      await prisma.securityIncident.deleteMany({});
      await incidentForWorker();
      const delivery = await prisma.securityDelivery.findFirstOrThrow({ where: { userId: user.id } });
      if (behavior === 'abandoned') {
        await prisma.securityDelivery.update({ where: { id: delivery.id }, data: { state: 'HANDOFF', leaseUntil: new Date(0) } });
      } else relay.controls.reply = behavior;
      const receipts = relay.controls.recipients.length;
      for (let i = 0; i < 4; i++) { await dueAgain(); await deliverSecurityAlerts(true); }
      const last = await prisma.securityDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
      assert.equal(last.state, behavior === 'temporary' ? 'EXHAUSTED' : behavior === 'permanent' ? 'PERMANENT' : 'UNCERTAIN');
      assert.equal(relay.controls.recipients.length - receipts, behavior === 'temporary' ? 3 : behavior === 'abandoned' ? 0 : 1);
    }
  } finally { await relay.close(); }
});

test('recipient eligibility is rechecked at the final boundary and a missing eligible audience stays visible', async () => {
  const relay = await startSyntheticSmtp();
  try {
    const user = await account(true);
    await localRelay(relay.port);
    await incidentForWorker();
    relay.controls.reply = 'holdGreeting';
    const result = deliverSecurityAlerts(true);
    await waitForGreeting(relay.controls);
    await prisma.user.update({ where: { id: user.id }, data: { roles: ['PILOT'] } });
    relay.controls.finish!();
    await result;
    assert.equal(relay.controls.recipients.length, 0);
    await scanAccessSecurity();
    assert.equal((await inspectAccessSecurity(operator)).withoutRecipients, 1);
    await account(true);
    await scanAccessSecurity();
    relay.controls.reply = 'accept';
    await deliverSecurityAlerts(true);
    assert.equal(relay.controls.accepted, 1);
  } finally { await relay.close(); }
});

async function waitForGreeting(controls: {finish?: () => void}) {
  const end = Date.now() + 8_000;
  while (!controls.finish && Date.now() < end) await new Promise(r => setTimeout(r, 10));
  assert.ok(controls.finish, 'Synthetic relay reached its greeting boundary');
}

test('an SMTP rejection that arrives after a brief pause cannot refill the login queue', async () => {
  const user = await account();
  const grant = await pending(user);
  const attempt = await reserveMail(false, 250); assert.ok(attempt);
  assert.ok(await beginHandoff(attempt));
  await setLoginPause(operator, true);
  await setLoginPause(operator, false);
  await completeHandoff(attempt.id, { outcome: 'TEMPORARY', phase: 'FINAL', code: 451, channel: true });
  const job = await prisma.credentialMail.findUniqueOrThrow({ where: { id: grant.id } });
  assert.equal(job.state, 'SUPPRESSED');
  assert.equal(job.reason, 'LOGIN_PAUSED');
  assert.equal(await reserveMail(false, 250), null);
});

test('fallback cooldown serializes simultaneous reservations across database connections', async () => {
  const { reserveLoginAttempt, recordSuccessfulLogin } = await import('../src/server/auth/login-throttle');
  const id = mailbox();
  for (let i = 0; i < 2; i++) assert.ok(await reserveLoginAttempt(id, null, 'admin-password'));
  const pair = await Promise.all([reserveLoginAttempt(id, null, 'admin-password'), reserveLoginAttempt(id, null, 'admin-password')]);
  assert.equal(pair.filter(Boolean).length, 1);
  await recordSuccessfulLogin(id, null, 'admin-password');
  assert.ok(await reserveLoginAttempt(id, null, 'admin-password'));
});

test('overdue dispatch creates a worker incident even with a current heartbeat', async () => {
  const user = await account();
  const grant = await pending(user);
  await prisma.credentialMail.update({ where: { id: grant.id }, data: { nextAt: new Date(Date.now() - 300_000) } });
  await scanAccessSecurity();
  assert.deepEqual((await inspectAccessSecurity(operator)).incidents, ['MAIL_WORKER']);
});

test('saving a new SMTP configuration during the greeting requeues the alert and sends only on the replacement relay', async () => {
  const first = await startSyntheticSmtp();
  const second = await startSyntheticSmtp();
  const saveRelayPort = (port: number) => setSmtpSettings(operator, {
    host: '127.0.0.1', port, security: 'NONE', from: 'sender@fixture.invalid', user: '',
  });
  try {
    await account(true);
    await saveRelayPort(first.port);
    await incidentForWorker();
    first.controls.reply = 'holdGreeting';
    const sending = deliverSecurityAlerts(true);
    await waitForGreeting(first.controls);
    await saveRelayPort(second.port);
    first.controls.finish!();
    await sending;
    assert.equal(first.controls.recipients.length, 0);
    assert.equal(first.controls.accepted, 0);
    const job = await prisma.securityDelivery.findFirstOrThrow();
    assert.equal(job.state, 'QUEUED');
    assert.equal(job.recipientFailures, 0);
    assert.equal((await inspectAccessSecurity(operator)).withoutRecipients, 0);
    await deliverSecurityAlerts(true);
    assert.equal(second.controls.accepted, 1);
    assert.equal(await prisma.securityDelivery.count({ where: { state: 'ACCEPTED' } }), 1);
  } finally { await first.close(); await second.close(); }
});

test('a settings save overlapping alert preparation leaves the original reservation unclaimed', async () => {
  const first = await startSyntheticSmtp();
  const second = await startSyntheticSmtp();
  let permitCommit!: () => void;
  const release = new Promise<void>(resolve => { permitCommit = resolve; });
  let changed!: (pid: number) => void;
  const staged = new Promise<number>(resolve => { changed = resolve; });
  try {
    await account(true);
    await localRelay(first.port);
    await incidentForWorker();
    const save = prisma.$transaction(async tx => {
      await writeSmtpSettingsCore(tx, { host: '127.0.0.1', port: second.port, security: 'NONE',
        from: 'sender@fixture.invalid', user: '' });
      const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      changed(backend.pid);
      await release;
    }, { timeout: 15000 });
    const jobBeforeSave = await prisma.securityDelivery.findFirstOrThrow({ include: { incident: { select: { kind: true, openedAt: true } } } });
    const pid = await Promise.race([staged, save.then(() => { throw new Error('Expected an in-progress settings save.'); })]);
    const dispatch = processSecurityAlert(jobBeforeSave, true, 30_000);
    try {
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (!blocked && Date.now() < deadline) {
        const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))) AS blocked`;
        blocked = row.blocked;
        if (!blocked) await new Promise(r => setTimeout(r, 15));
      }
      assert.ok(blocked, 'The alert claim met the in-progress settings revision');
    } finally { permitCommit(); await save; await dispatch; }
    const job = await prisma.securityDelivery.findFirstOrThrow();
    assert.equal(job.state, 'QUEUED');
    assert.equal(job.attempts, 0);
    assert.equal(first.controls.recipients.length, 0);
    assert.equal(second.controls.recipients.length, 0);
    await deliverSecurityAlerts(true);
    assert.equal(second.controls.accepted, 1);
  } finally { permitCommit(); await first.close(); await second.close(); }
});

test('monitor detects only overdue queued security alerts and groups consecutive observations with a fresh worker', async () => {
  const admin = await account(true);
  const now = new Date();
  const old = new Date(+now - 5 * 60_000);
  const incident = await prisma.securityIncident.create({ data: { kind: 'LOGIN_VOLUME', openedAt: old,
    lastSeenAt: old, resolvedAt: now, needsRecipients: false } });
  const job = await prisma.securityDelivery.create({ data: { incidentId: incident.id, userId: admin.id, nextAt: new Date(+now + 60_000) } });
  await scanAccessSecurity();
  assert.deepEqual((await inspectAccessSecurity(operator)).incidents, []);
  await prisma.securityDelivery.update({ where: { id: job.id }, data: { state: 'UNCERTAIN', nextAt: old } });
  await scanAccessSecurity();
  assert.deepEqual((await inspectAccessSecurity(operator)).incidents, []);
  await prisma.securityDelivery.update({ where: { id: job.id }, data: { state: 'QUEUED' } });
  await Promise.all([scanAccessSecurity(), scanAccessSecurity()]);
  assert.deepEqual((await inspectAccessSecurity(operator)).incidents, ['MAIL_WORKER']);
  assert.equal(await prisma.securityDelivery.count({ where: { incident: { kind: 'MAIL_WORKER' } } }), 1);
});

test('security alerts and ordinary mail share the two conversation slots in either direction', async () => {
  const relay = await startSyntheticSmtp();
  try {
    await localRelay(relay.port);
    await account(true);
    await incidentForWorker();
    await pending(await account());
    const held = await reserveMail(false, 30_000); assert.ok(held);
    const manual = await reserveMail(true, 30_000); assert.ok(manual);
    await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/mail-worker.ts', '--once', '--test-loopback'], { timeout: 15_000 });
    assert.equal(relay.controls.recipients.length, 0);
    await prisma.mailAttempt.updateMany({ where: { id: { in: [held.id, manual.id] } }, data: { leaseUntil: new Date(0) } });
    const replacement = await reserveMail(false, 30_000); assert.ok(replacement);
    relay.controls.reply = 'holdGreeting';
    const sending = deliverSecurityAlerts(true);
    await waitForGreeting(relay.controls);
    try { assert.equal(await reserveMail(true, 30_000), null); }
    finally { relay.controls.finish!(); await sending; }
    assert.equal(relay.controls.accepted, 1);
  } finally { await relay.close(); }
});

test('security and credential dispatch both enforce ten automatic reservations per interval', async () => {
  const relay = await startSyntheticSmtp();
  try {
    await account(true);
    await incidentForWorker();
    await pending(await account());
    await localRelay(relay.port);
    const now = new Date();
    // Completed reservations consume this interval's capacity without holding a conversation.
    await prisma.mailAttempt.createMany({ data: Array.from({ length: 10 }, () => ({
      origin: 'CREDENTIAL', config: 1, number: 1, phase: 'FINAL', outcome: 'ACCEPTED', startedAt: now, leaseUntil: now, finishedAt: now,
    })) });
    await deliverSecurityAlerts(true);
    assert.equal(relay.controls.accepted, 0);
    const one = await prisma.mailAttempt.findFirstOrThrow();
    await prisma.mailAttempt.update({ where: { id: one.id }, data: { startedAt: new Date(0) } });
    await deliverSecurityAlerts(true);
    assert.equal(relay.controls.accepted, 1);
    assert.equal(await reserveMail(false, 30_000), null);
  } finally { await relay.close(); }
});

test('late SMTP rejection stays uncertain at the lease boundary even before another scanner runs', async () => {
  const relay = await startSyntheticSmtp();
  try {
    await localRelay(relay.port);
    await account(true);
    await incidentForWorker();
    relay.controls.reply = 'holdRejection';
    const sending = deliverSecurityAlerts(true);
    await waitForGreeting(relay.controls);
    await prisma.securityDelivery.updateMany({ where: { state: 'HANDOFF' }, data: { leaseUntil: new Date(0) } });
    await prisma.mailAttempt.updateMany({ where: { origin: 'SECURITY', finishedAt: null }, data: { leaseUntil: new Date(0) } });
    relay.controls.finish!();
    await sending;
    assert.equal(await prisma.securityDelivery.count({ where: { state: 'UNCERTAIN' } }), 1);
  } finally { await relay.close(); }
});

test('a previous worker selection cannot reserve a later retry or spend another recipient attempt', async () => {
  const relay = await startSyntheticSmtp();
  try {
    await localRelay(relay.port);
    await account(true);
    await incidentForWorker();
    const stale = await prisma.securityDelivery.findFirstOrThrow({ include: { incident: { select: { kind: true, openedAt: true } } } });
    relay.controls.reply = 'temporary';
    await deliverSecurityAlerts(true);
    await dueAgain();
    await Promise.all([processSecurityAlert(stale, true, 30_000), deliverSecurityAlerts(true)]);
    assert.equal(relay.controls.recipients.length, 2);
    await dueAgain();
    await processSecurityAlert(stale, true, 30_000);
    assert.equal(relay.controls.recipients.length, 2);
    await deliverSecurityAlerts(true);
    assert.equal(relay.controls.recipients.length, 3);
    assert.equal(await prisma.securityDelivery.count({ where: { state: 'EXHAUSTED', recipientFailures: 3, attempts: 3 } }), 1);
  } finally { await relay.close(); }
});

test('a positive reply for the same expired attempt can confirm acceptance without repeating submission', async () => {
  const relay = await startSyntheticSmtp();
  try {
    await account(true);
    await localRelay(relay.port);
    await incidentForWorker();
    relay.controls.reply = 'holdReply';
    const sending = deliverSecurityAlerts(true);
    await waitForGreeting(relay.controls);
    await prisma.securityDelivery.updateMany({ where: { state: 'HANDOFF' }, data: { leaseUntil: new Date(0) } });
    await prisma.mailAttempt.updateMany({ where: { origin: 'SECURITY', finishedAt: null }, data: { leaseUntil: new Date(0) } });
    await deliverSecurityAlerts(true);
    assert.equal(await prisma.securityDelivery.count({ where: { state: 'UNCERTAIN' } }), 1);
    relay.controls.finish!();
    await sending;
    assert.equal(await prisma.securityDelivery.count({ where: { state: 'ACCEPTED', attempts: 1 } }), 1);
    assert.equal(relay.controls.recipients.length, 1);
  } finally { await relay.close(); }
});
