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
