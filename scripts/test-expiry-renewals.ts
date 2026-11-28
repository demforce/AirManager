// Run after db:reset:test on the dedicated local airmanager_test database:
// npx tsx --test scripts/test-expiry-renewals.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { APP_TIMEZONE } from '@/lib/time';
import { todayDateOnlyUtcInZone } from '@/lib/zoned-time';
import { getMailSender, type MailMessage } from '@/server/adapters/mail';
import type { Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { updateExpiry, updateExpiryDateCore } from '@/server/services/expiries.service';
import { runExpiryAlertsJob } from '@/server/services/expiry-alerts.service';
import { chargeMembershipFee } from '@/server/services/membership.service';
import { getSettingsSnapshot, saveSettings } from '@/server/services/settings.service';
import { updatePerson } from '@/server/services/people.service';

let admin: Actor;
let mail: MailMessage[];
const expiryIds: string[] = [];
const day = (days: number) => new Date(todayDateOnlyUtcInZone(APP_TIMEZONE).getTime() + days * 86_400_000);
const iso = (days: number) => day(days).toISOString().slice(0, 10);

before(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol)
    && [...url.searchParams].every(([k, v]) => k === 'schema' && v === 'public')
    && !process.env.PGHOSTADDR && !process.env.PGSERVICE
    && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port && url.port !== '5432'
    && url.pathname === '/airmanager_test' && process.env.NODE_ENV !== 'production', 'Dedicated local disposable database required');
  assert.equal(await prisma.expiry.count(), 0, 'Start with a freshly seeded disposable database');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@airmanager.local' } });
  admin = { userId: user.id, personId: user.personId, roles: user.roles };
});
beforeEach(() => { mail = []; });
afterEach(async () => {
  await prisma.appSetting.deleteMany({ where: { key: 'mail.operational' } });
  if (expiryIds.length) await prisma.expiry.deleteMany({ where: { id: { in: expiryIds.splice(0) } } });
});
after(() => prisma.$disconnect());

async function fixture(name: string, days: number, membership = false) {
  const slug = randomUUID();
  const email = slug + '@example.test';
  const person = await prisma.person.create({ data: { firstName: 'Synthetic', lastName: name + slug, email } });
  const type = membership
    ? await prisma.expiryType.findFirstOrThrow({ where: { kind: 'MEMBERSHIP' } })
    : await prisma.expiryType.create({ data: { name: name + slug, scope: 'ALL' } });
  const expiry = await prisma.expiry.create({ data: { personId: person.id, expiryTypeId: type.id, actorUserId: admin.userId, expiresAt: day(days) } });
  expiryIds.push(expiry.id);
  return { id: expiry.id, person, type, email };
}

async function markers(expiryId: string) {
  const rows = await prisma.sentAlert.findMany({ where: { expiryId }, orderBy: { threshold: 'desc' } });
  return rows.map(({ threshold }) => threshold);
}

for (const path of ['direct', 'person editor', 'membership'] as const) {
  test('renew between selection and claim via ' + path, async (t) => {
    const start = day(0).getTime() + 12 * 3_600_000;
    t.mock.timers.enable({ apis: ['Date'], now: start });
    const first = await fixture('First', 1);
    const renewed = await fixture('Renewed', 3, path === 'membership');
    let completed = false;
    t.mock.method(getMailSender(), 'send', async (message: MailMessage) => {
      mail.push(message);
      if (message.to !== first.email || completed) return;
      switch (path) {
        case 'direct':
          await updateExpiry(admin, renewed.id, { expiresAt: iso(50) });
          break;
        case 'person editor':
          await updatePerson(admin, renewed.person.id, { expiries: { set: [{ expiryTypeId: renewed.type.id, expiresAt: iso(50) }] } });
          break;
        case 'membership':
          await chargeMembershipFee(admin, renewed.person.id, { amountCents: 100, force: true });
      }
      completed = true;
    });

    const oldRun = await runExpiryAlertsJob();
    assert.equal(completed, true, 'Renewal committed during the batch');
    assert.equal(oldRun.candidates, 2);
    assert.equal(mail.filter((m) => m.to === renewed.email).length, 0, 'Stale page must not dispatch a holder reminder');
    assert.deepEqual(await markers(renewed.id), [], 'New cycle keeps every threshold');
    const digest = mail.find((m) => m.to === 'admin@airmanager.local');
    assert.ok(digest);
    assert.ok(digest.text.includes(first.person.lastName));
    assert.ok(!digest.text.includes(renewed.person.lastName));

    mail = [];
    const freshRun = await runExpiryAlertsJob();
    if (path === 'membership') {
      assert.equal(freshRun.alertsCreated, 0);
      assert.deepEqual(mail, []);
    } else {
      assert.deepEqual(await markers(renewed.id), [60]);
      assert.ok(mail.find((m) => m.to === renewed.email)?.text.includes('50 giorni'));
      assert.ok(mail.find((m) => m.to === 'admin@airmanager.local')?.text.includes('50 giorni'));
      for (const threshold of [30, 7, 0]) {
        t.mock.timers.setTime(start + (50 - threshold) * 86_400_000);
        mail = [];
        await runExpiryAlertsJob();
        assert.equal(mail.filter((m) => m.to === renewed.email).length, 1);
        assert.deepEqual(await markers(renewed.id), [60, 30, 7, 0].filter((n) => n >= threshold));
        assert.equal((await runExpiryAlertsJob()).holderEmailsSent, 0);
      }
    }
  });
}

test('failed old transport releases only its claim IDs after another job claims the renewed cycle', async (t) => {
  const target = await fixture('Delayed', 3);
  let failedAttempt = false;
  t.mock.method(getMailSender(), 'send', async (message: MailMessage) => {
    if (message.to === target.email && !failedAttempt) {
      failedAttempt = true;
      await updateExpiry(admin, target.id, { expiresAt: iso(50) });
      await runExpiryAlertsJob();
      throw new Error('synthetic delayed SMTP failure');
    }
    mail.push(message);
  });
  const old = await runExpiryAlertsJob();
  assert.equal(failedAttempt, true);
  assert.equal(old.holderEmailsSent, 0);
  assert.deepEqual(await markers(target.id), [60]);
  assert.ok(mail.find((m) => m.to === target.email)?.text.includes('50 giorni'));
  assert.equal((await runExpiryAlertsJob()).candidates, 0);
});

test('two concurrent jobs send exactly one reminder and one digest entry', async (t) => {
  const target = await fixture('Concurrent', 3);
  t.mock.method(getMailSender(), 'send', async (message: MailMessage) => { mail.push(message); });
  const runs = await Promise.all([runExpiryAlertsJob(), runExpiryAlertsJob()]);
  assert.deepEqual(runs.map((r) => r.holderEmailsSent).sort(), [0, 1]);
  assert.deepEqual(await markers(target.id), [60, 30, 7]);
  assert.equal(mail.filter((m) => m.to === target.email).length, 1);
  assert.equal(mail.filter((m) => m.to === 'admin@airmanager.local' && m.text.includes(target.person.lastName)).length, 1);
});

test('a second editor saving the same date keeps the intervening new claim, as does a notes-only edit', async (t) => {
  const target = await fixture('TwoEditors', 3);
  t.mock.method(getMailSender(), 'send', async (message: MailMessage) => { mail.push(message); });
  let secondEditor: Promise<unknown> | undefined;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Expiry" WHERE "id" = ${target.id} FOR UPDATE`;
    const [connection] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    secondEditor = updateExpiry(admin, target.id, { expiresAt: iso(50) });
    // Wait for the other editor to reach its date write before releasing the
    // first editor. An intervening marker represents the new cycle.
    const deadline = Date.now() + 3000;
    for (;;) {
      const [wait] = await tx.$queryRaw<{ waiting: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE ${connection.pid}::int = ANY(pg_blocking_pids(pid))) AS waiting`;
      if (wait.waiting) break;
      assert.ok(Date.now() < deadline, 'Second editor reached the expiry lock');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await updateExpiryDateCore(tx, target.id, day(50), admin.userId);
    await tx.sentAlert.create({ data: { expiryId: target.id, threshold: 60 } });
  });
  await secondEditor;
  assert.deepEqual(await markers(target.id), [60]);
  await updateExpiry(admin, target.id, { notes: 'Synthetic notes' });
  assert.deepEqual(await markers(target.id), [60]);
  assert.equal((await runExpiryAlertsJob()).candidates, 0);
});

test('archive, deactivation and deletion after page selection leave no markers or digest entries', async (t) => {
  const first = await fixture('First', 1);
  const archived = await fixture('Archived', 3);
  const inactive = await fixture('Inactive', 3);
  const deleted = await fixture('Deleted', 3);
  t.mock.method(getMailSender(), 'send', async (message: MailMessage) => {
    mail.push(message);
    if (message.to !== first.email) return;
    await prisma.person.update({ where: { id: archived.person.id }, data: { archivedAt: new Date() } });
    await prisma.expiryType.update({ where: { id: inactive.type.id }, data: { isActive: false } });
    await prisma.expiry.delete({ where: { id: deleted.id } });
  });
  const result = await runExpiryAlertsJob();
  assert.equal(result.candidates, 4);
  assert.equal(result.holderEmailsSent, 1);
  assert.equal(result.remaining, 0);
  for (const target of [archived, inactive, deleted]) {
    assert.deepEqual(await markers(target.id), []);
    assert.ok(mail.every((m) => m.to !== target.email && !m.text.includes(target.person.lastName)));
  }
});

test('201 pending expiries drain in two runs, within the cap of 200', async (t) => {
  t.mock.method(getMailSender(), 'send', async (message: MailMessage) => { mail.push(message); });
  const type = await prisma.expiryType.create({ data: { name: randomUUID(), scope: 'ALL' } });
  const people = Array.from({ length: 201 }, () => ({ id: randomUUID(), firstName: 'Synthetic', lastName: 'Batch' }));
  await prisma.person.createMany({ data: people });
  const rows = people.map((p) => ({ id: randomUUID(), personId: p.id, expiresAt: day(50), expiryTypeId: type.id, actorUserId: admin.userId }));
  await prisma.expiry.createMany({ data: rows });
  expiryIds.push(...rows.map((r) => r.id));
  const first = await runExpiryAlertsJob();
  const second = await runExpiryAlertsJob();
  assert.deepEqual([first.candidates, first.alertsCreated, first.remaining], [200, 200, 1]);
  assert.deepEqual([second.candidates, second.alertsCreated, second.remaining], [1, 1, 0]);
  assert.equal(await prisma.sentAlert.count({ where: { expiryId: { in: expiryIds }, threshold: 60 } }), 201);
});

test('disabled channels leave existing markers intact; reactivation starts at the next threshold', async (t) => {
  const persisted = await fixture('Existing', 3);
  const nextThreshold = await fixture('LegacyNext', 8);
  await prisma.expiry.updateMany({ where: { id: { in: [persisted.id, nextThreshold.id] } }, data: { notificationCycle: null } });
  await prisma.sentAlert.create({ data: { expiryId: persisted.id, threshold: 60 } });
  const original = await getSettingsSnapshot(admin);
  assert.equal(original.notifications.expiryHolder, true);
  assert.equal(original.notifications.expiryDigest, true);
  t.mock.method(getMailSender(), 'send', async (message: MailMessage) => { mail.push(message); });
  await saveSettings(admin, { notifications: { expiryHolder: false, expiryDigest: false } });
  const disabled = await runExpiryAlertsJob();
  assert.equal(disabled.status, 'disabled');
  assert.equal(disabled.alertsCreated, 0);
  assert.deepEqual(await markers(persisted.id), [60]);
  assert.equal(mail.length, 0);
  await saveSettings(admin, { notifications: { expiryHolder: true, expiryDigest: true } });
  await updateExpiry(admin, persisted.id, { notes: 'synthetic notes' });
  const resumed = await runExpiryAlertsJob(1);
  assert.equal(resumed.candidates, 0, 'Skipped backlog is excluded before the batch limit');
  assert.equal(resumed.remaining, 0);
  assert.deepEqual(await markers(persisted.id), [60]);
  const fresh = await fixture('New cycle', 5);
  await saveSettings(admin, { notifications: { expiryHolder: true, expiryDigest: true } });
  await runExpiryAlertsJob(1);
  assert.deepEqual(await markers(fresh.id), [60, 30, 7]);
  assert.equal(mail.filter((m) => m.to === fresh.email).length, 1);
  await updateExpiry(admin, persisted.id, { expiresAt: iso(20) });
  await runExpiryAlertsJob();
  assert.deepEqual(await markers(persisted.id), [60, 30]);
  assert.equal(mail.filter((m) => m.to === persisted.email).length, 1);
  const noon = day(0).getTime() + 12 * 3_600_000;
  t.mock.timers.enable({ apis: ['Date'], now: noon + 86_400_000 });
  await runExpiryAlertsJob();
  assert.deepEqual(await markers(nextThreshold.id), [7], 'Next Rome day reaches the first eligible legacy threshold');
  t.mock.timers.setTime(noon + 5 * 86_400_000);
  await runExpiryAlertsJob();
  assert.deepEqual(await markers(fresh.id), [60, 30, 7, 0]);
});

test('digest only records each due item once, including a holder without an address; rejected digest stays best effort', async (t) => {
  await saveSettings(admin, { notifications: { expiryHolder: false } });
  const target = await fixture('DigestOnly', 5);
  const noAddress = await fixture('NoAddress', 6);
  await prisma.person.update({ where: { id: noAddress.person.id }, data: { email: null } });
  t.mock.method(getMailSender(), 'send', async (message: MailMessage) => { mail.push(message); });
  const runs = await Promise.all([runExpiryAlertsJob(), runExpiryAlertsJob()]);
  assert.equal(runs.reduce((n, run) => n + run.holderEmailsSent + run.holdersWithoutEmail, 0), 0);
  const items = mail.map((m) => m.text).join('\n');
  for (const row of [target, noAddress]) {
    assert.equal(items.split('\n').filter((line) => line.includes(row.person.lastName)).length, 1);
    assert.deepEqual(await markers(row.id), [60, 30, 7]);
  }
  assert.equal(items.split('[promemoria al titolare disattivato]').length - 1, 2);
  assert.equal((await runExpiryAlertsJob()).candidates, 0);
  t.mock.restoreAll();
  const rejected = await fixture('RejectedDigest', 40);
  t.mock.method(getMailSender(), 'send', async () => { throw new Error('synthetic admin digest rejection'); });
  assert.equal((await runExpiryAlertsJob()).digestEmailsSent, 0);
  assert.deepEqual(await markers(rejected.id), [60]);
  assert.equal((await runExpiryAlertsJob()).candidates, 0);
});

test('holder only retries failed mail without a digest and keeps the single successful claim', async (t) => {
  await saveSettings(admin, { notifications: { expiryDigest: false } });
  const target = await fixture('Retry', 40);
  let reject = true;
  t.mock.method(getMailSender(), 'send', async (message: MailMessage) => {
    assert.equal(message.to, target.email);
    if (reject) { reject = false; throw new Error('synthetic first holder failure'); }
    mail.push(message);
  });
  const failed = await runExpiryAlertsJob();
  assert.deepEqual([failed.alertsCreated, failed.holdersWithoutEmail, failed.digestEmailsSent, failed.remaining], [0, 0, 0, 1]);
  assert.deepEqual(await markers(target.id), []);
  const retried = await runExpiryAlertsJob();
  assert.equal(retried.holderEmailsSent, 1);
  assert.deepEqual(await markers(target.id), [60]);
  assert.equal((await runExpiryAlertsJob()).candidates, 0);
  assert.equal(mail.length, 1);
});

test('reenabling one channel does not send its backlog while the other remains active', async (t) => {
  t.mock.method(getMailSender(), 'send', async (message: MailMessage) => { mail.push(message); });
  await saveSettings(admin, { notifications: { expiryHolder: false } });
  const waitingHolder = await fixture('WaitingHolder', 5);
  await saveSettings(admin, { notifications: { expiryHolder: true } });
  const first = await runExpiryAlertsJob();
  assert.equal(first.holderEmailsSent, 0);
  assert.equal(first.digestEmailsSent, 1);
  assert.ok(mail[0].text.includes(waitingHolder.person.lastName) && mail[0].text.includes('soglia già maturata alla riattivazione'));
  mail = [];
  await saveSettings(admin, { notifications: { expiryDigest: false } });
  const waitingDigest = await fixture('WaitingDigest', 4);
  await saveSettings(admin, { notifications: { expiryDigest: true } });
  const second = await runExpiryAlertsJob();
  assert.equal(second.holderEmailsSent, 1);
  assert.equal(second.digestEmailsSent, 0);
  assert.deepEqual(mail.map((m) => m.to), [waitingDigest.email]);
});

test('overlapping settings saves merge and a running job stops claiming after the switches change', async (t) => {
  await Promise.all([
    saveSettings(admin, { notifications: { aircraftArchived: false } }),
    saveSettings(admin, { notifications: { negativeBalance: false } }),
  ]);
  const { notifications } = await getSettingsSnapshot(admin);
  assert.equal(notifications.aircraftArchived, false);
  assert.equal(notifications.negativeBalance, false);
  const first = await fixture('First', 1);
  const second = await fixture('Second', 2);
  t.mock.method(getMailSender(), 'send', async (message: MailMessage) => {
    assert.equal(message.to, first.email);
    await saveSettings(admin, { notifications: { expiryDigest: false, expiryHolder: false } });
  });
  const run = await runExpiryAlertsJob();
  assert.equal(run.status, 'settings_changed');
  assert.equal(run.holderEmailsSent, 1);
  assert.equal(run.digestEmailsSent, 0);
  assert.equal(run.remaining, 0);
  assert.deepEqual(await markers(second.id), []);
});

test('digest-only renewal while a later claim waits removes the obsolete entry and preserves the new cycle', async (t) => {
  await saveSettings(admin, { notifications: { expiryHolder: false } });
  const renewed = await fixture('RenewedBeforeDigest', 3);
  const second = await fixture('OtherDigestItem', 4);
  t.mock.method(getMailSender(), 'send', async (message: MailMessage) => { mail.push(message); });
  let job: ReturnType<typeof runExpiryAlertsJob> | undefined;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Expiry" WHERE id = ${second.id} FOR NO KEY UPDATE`;
    job = runExpiryAlertsJob();
    const timeout = Date.now() + 5000;
    while (!(await markers(renewed.id)).length) {
      assert.ok(Date.now() < timeout, 'First claim reached before the later expiry lock');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await updateExpiry(admin, renewed.id, { expiresAt: iso(50) });
  }, { timeout: 10000 });
  assert.ok(job);
  assert.equal((await job).digestEmailsSent, 1);
  assert.ok(mail[0].text.includes(second.person.lastName));
  assert.ok(!mail[0].text.includes(renewed.person.lastName));
  assert.deepEqual(await markers(renewed.id), []);
  mail = [];
  await runExpiryAlertsJob();
  assert.deepEqual(await markers(renewed.id), [60]);
  assert.ok(mail[0].text.includes(renewed.person.lastName));
  assert.ok(mail[0].text.includes('50 giorni'));
});

for (const change of ['type', 'person'] as const) {
  test('digest-only releases the unattempted claims when the ' + change + ' becomes ineligible', async (t) => {
    await saveSettings(admin, { notifications: { expiryHolder: false } });
    const target = await fixture('Excluded', 3);
    const other = await fixture('Other', 4);
    // A marker from an earlier attempt must survive this cleanup.
    await prisma.sentAlert.create({ data: { expiryId: target.id, threshold: 60 } });
    t.mock.method(getMailSender(), 'send', async (message: MailMessage) => { mail.push(message); });
    async function setEligible(eligible: boolean) {
      if (change === 'type') await prisma.expiryType.update({ where: { id: target.type.id }, data: { isActive: eligible } });
      else await prisma.person.update({ where: { id: target.person.id }, data: { archivedAt: eligible ? null : new Date() } });
    }
    let job: ReturnType<typeof runExpiryAlertsJob> | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Expiry" WHERE id = ${other.id} FOR NO KEY UPDATE`;
      job = runExpiryAlertsJob();
      const timeout = Date.now() + 5000;
      while ((await markers(target.id)).length < 3) {
        assert.ok(Date.now() < timeout, 'Target was claimed before the later expiry lock');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await setEligible(false);
    }, { timeout: 10000 });
    assert.ok(job);
    assert.equal((await job).digestEmailsSent, 1);
    assert.ok(!mail[0].text.includes(target.person.lastName));
    assert.deepEqual(await markers(target.id), [60], 'Release only the undelivered attempt');
    await setEligible(true);
    mail = [];
    const restored = await runExpiryAlertsJob();
    assert.equal(restored.digestEmailsSent, 1);
    assert.ok(mail[0].text.includes(target.person.lastName));
    assert.deepEqual(await markers(target.id), [60, 30, 7]);
    assert.equal((await runExpiryAlertsJob()).candidates, 0);
  });
}
