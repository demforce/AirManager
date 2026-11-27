import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import './require-mail-integration-db';
import { prisma } from '../src/server/db/prisma';
import { inspectLegacyMail, setLegacyMailRouting, readHolderDelivery } from '../src/server/services/legacy-mail-routing';

const admin = { userId: '', personId: null, roles: ['ADMIN'] as ['ADMIN'] };
before(async () => {
  assert.equal(process.env.AIRMANAGER_EMAIL_TRIAL, '1');
  admin.userId = (await prisma.user.findUniqueOrThrow({ where: { email: 'admin@airmanager.local' } })).id;
});
after(() => prisma.$disconnect());

test('a current preview enables only proven pairs and rollback restores legacy spelling', async () => {
  const email = randomUUID() + '@fixture.invalid';
  const person = await prisma.person.create({ data: { firstName: 'Fixture', lastName: 'Legacy', email: email.toUpperCase() } });
  const user = await prisma.user.create({ data: { email, roles: ['PILOT'], personId: person.id,
    emailVerification: { create: { email, verifiedAt: new Date() } } } });
  const read = async () => (await readHolderDelivery({ id: person.id, email: person.email! })).email;
  try {
    const preview = await inspectLegacyMail(admin, 1);
    assert.equal(preview.enabled, false);
    assert.equal(await read(), person.email);
    await Promise.all([1, 2].map(() => setLegacyMailRouting(admin, true, preview.revision)));
    assert.equal(await read(), email);
    const current = await inspectLegacyMail(admin, 1);
    await setLegacyMailRouting(admin, false, current.revision);
    assert.equal(await read(), person.email);
    await assert.rejects(setLegacyMailRouting(admin, true, preview.revision), { code: 'CONFLICT' });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).tokenVersion, 0);
  } finally {
    await prisma.appSetting.deleteMany({ where: { key: 'mail.legacyRouting' } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.person.delete({ where: { id: person.id } });
  }
});

test('stored opt-in off avoids scanning identity, profile and mail tables in holder fan-out', async () => {
  const { Prisma } = await import('../src/generated/prisma/client');
  const { holderDeliveryQuery } = await import('../src/server/services/legacy-mail-routing');
  type Plan = { 'Relation Name'?: string; 'Actual Loops': number; Plans?: Plan[] };
  const explain = await prisma.$queryRaw<{ 'QUERY PLAN': { Plan: Plan }[] }[]>(Prisma.sql`EXPLAIN (ANALYZE, FORMAT JSON) ${holderDeliveryQuery('synthetic-holder')}`);
  const checked: string[] = [];
  function visit(plan: Plan) {
    const table = plan['Relation Name'];
    if (table && table !== 'AppSetting') {
      checked.push(table);
      assert.equal(plan['Actual Loops'], 0, 'unexpected scan of ' + table);
    }
    plan.Plans?.forEach(visit);
  }
  visit(explain[0]['QUERY PLAN'][0].Plan);
  assert.ok(checked.includes('Person') && checked.includes('User'));
});

test('inventory reports independent owners, conflicts, enrollment, disabled profiles and pending work without exposing addresses', async () => {
  const suffix = randomUUID();
  const address = (label: string) => label + '-' + suffix + '@fixture.invalid';
  const ids: string[] = [];
  const users: string[] = [];
  const incidents: string[] = [];
  async function person(email: string | null) {
    const row = await prisma.person.create({ data: { firstName: 'Identical', lastName: 'Name', email } });
    ids.push(row.id);
    return row;
  }
  async function user(email: string, personId: string | null, proof?: { email: string; verifiedAt?: Date }) {
    const row = await prisma.user.create({ data: { email, personId, roles: ['PILOT'], tokenVersion: 4,
      adminPasswordVersion: 3, locale: 'en', passwordHash: 'unused-synthetic-hash', ...(proof && { emailVerification: { create: proof } }) } });
    users.push(row.id);
    return row;
  }
  try {
    const standalone = await user(address('separate'), null);
    const homonym = await person(address('separate'));
    const blank = await person(null);
    const inactive = await person(address('inactive'));
    const inactiveAccount = await user(inactive.email!, inactive.id);
    await prisma.user.update({ where: { id: inactiveAccount.id }, data: { isActive: false } });
    await prisma.person.update({ where: { id: inactive.id }, data: { archivedAt: new Date() } });
    await prisma.pilotProfile.create({ data: { personId: inactive.id, licenseType: 'PPL', licenseNumber: suffix, deactivatedAt: new Date() } });
    const divergent = await person(address('other'));
    const divergentAccount = await user(address('login'), divergent.id, { email: address('login') });
    const invalid = await person('invalid-' + suffix);
    await user(address('OLD').toUpperCase(), invalid.id, { email: address('outdated'), verifiedAt: new Date() });
    const valid = await person(address('Valid').toUpperCase());
    const activeAccount = await user(address('valid'), valid.id, { email: address('valid'), verifiedAt: new Date() });
    await prisma.studentProfile.create({ data: { personId: valid.id, courseStartDate: new Date() } });
    await prisma.pilotProfile.create({ data: { personId: valid.id, licenseType: 'PPL', licenseNumber: 'p-' + suffix, deactivatedAt: new Date() } });
    const credential = await prisma.credentialMail.create({ data: { userId: activeAccount.id, purpose: 'LOGIN_LINK', expiresAt: new Date(Date.now() + 600_000) } });
    const incident = await prisma.securityIncident.create({ data: { kind: 'MAIL_WORKER', openedAt: new Date(), lastSeenAt: new Date() } });
    incidents.push(incident.id);
    const alert = await prisma.securityDelivery.create({ data: { incidentId: incident.id, userId: activeAccount.id, state: 'UNCERTAIN' } });

    const secondAdmin = await user(address('second-operator'), null);
    await prisma.user.update({ where: { id: secondAdmin.id }, data: { roles: ['ADMIN'] } });
    const snapshot = await inspectLegacyMail(admin, 1);
    const all = [...snapshot.rows];
    for (let page = 2; page <= snapshot.pages; page++) all.push(...(await inspectLegacyMail(admin, page)).rows);
    const row = (personId: string) => all.find(record => record.personId === personId)!;
    assert.equal(snapshot.enabled, false);
    assert.deepEqual(row(homonym.id).reasons, ['personOnly', 'duplicate']);
    assert.deepEqual(all.find(r => r.userId === standalone.id)?.reasons, ['accountOnly', 'notEnrolled', 'duplicate']);
    assert.deepEqual(row(blank.id).reasons, ['personOnly', 'missingContact']);
    assert.deepEqual(row(inactive.id).reasons, ['inactiveAccount', 'archivedPerson', 'inactiveProfiles', 'notEnrolled']);
    assert.deepEqual(row(divergent.id).reasons, ['pendingVerification', 'differentAddresses']);
    assert.deepEqual(row(invalid.id).reasons, ['invalidContact', 'invalidAccount', 'staleVerification']);
    assert.deepEqual(row(valid.id), { personId: valid.id, userId: activeAccount.id, reasons: [], mixedProfiles: true,
      queued: 1, inFlight: 0, uncertain: 1 });
    assert.equal(JSON.stringify(all).includes('@'), false);
    await assert.rejects(inspectLegacyMail({ ...admin, roles: ['PILOT'] }, 1), { code: 'FORBIDDEN' });
    await assert.rejects(setLegacyMailRouting({ ...admin, roles: ['PILOT'] }, true, snapshot.revision), { code: 'FORBIDDEN' });
    await assert.rejects(setLegacyMailRouting({ ...admin, userId: secondAdmin.id }, true, snapshot.revision), { code: 'CONFLICT' });

    await assert.rejects(inspectLegacyMail({ ...admin, userId: inactiveAccount.id }, 1), { code: 'FORBIDDEN' });
    await assert.rejects(setLegacyMailRouting({ ...admin, userId: activeAccount.id }, true, snapshot.revision), { code: 'FORBIDDEN' });

    await prisma.credentialMail.update({ where: { id: credential.id }, data: { state: 'CLAIMED' } });
    await assert.rejects(setLegacyMailRouting(admin, true, snapshot.revision), { code: 'CONFLICT' });
    const latest = await inspectLegacyMail(admin, 1);
    await setLegacyMailRouting(admin, true, latest.revision);
    const resolve = (p: { id: string; email: string | null }) => readHolderDelivery({ id: p.id, email: p.email! }).then(d => d.email);
    assert.equal(await resolve(valid), activeAccount.email);
    assert.equal(await resolve(divergent), divergent.email);
    assert.equal(await resolve(homonym), homonym.email);
    assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: activeAccount.id } }), activeAccount);
    assert.deepEqual(await prisma.person.findUniqueOrThrow({ where: { id: valid.id } }), valid);
    assert.equal((await prisma.credentialMail.findUniqueOrThrow({ where: { id: credential.id } })).state, 'CLAIMED');
    assert.deepEqual(await prisma.securityDelivery.findUniqueOrThrow({ where: { id: alert.id } }), alert);
    assert.equal(await prisma.user.count({ where: { personId: homonym.id } }), 0);
    assert.equal((await prisma.emailVerification.findUniqueOrThrow({ where: { userId: divergentAccount.id } })).verifiedAt, null);

    // A historically distinct row acquires an equivalent spelling while enabled.
    const duplicate = await person('\u00a0' + valid.email! + ' ');
    assert.equal(await resolve(valid), valid.email);
    await prisma.person.update({ where: { id: duplicate.id }, data: { email: null } });
    assert.equal(await resolve(valid), activeAccount.email);
    await prisma.user.update({ where: { id: activeAccount.id }, data: { personId: null } });
    assert.equal(await resolve(valid), valid.email);
    await prisma.user.update({ where: { id: activeAccount.id }, data: { personId: valid.id } });
    await prisma.person.update({ where: { id: valid.id }, data: { email: address('new') } });
    assert.equal(await resolve(valid), null);
    await prisma.person.update({ where: { id: valid.id }, data: { email: valid.email } });
    const trial = process.env.AIRMANAGER_EMAIL_TRIAL;
    try {
      delete process.env.AIRMANAGER_EMAIL_TRIAL;
      await assert.rejects(inspectLegacyMail(admin, 1), { code: 'NOT_FOUND' });
      await assert.rejects(setLegacyMailRouting(admin, false, latest.revision), { code: 'NOT_FOUND' });
      assert.equal(await resolve(valid), valid.email);
    } finally { process.env.AIRMANAGER_EMAIL_TRIAL = trial; }
  } finally {
    await prisma.appSetting.deleteMany({ where: { key: 'mail.legacyRouting' } });
    await prisma.securityIncident.deleteMany({ where: { id: { in: incidents } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.pilotProfile.deleteMany({ where: { personId: { in: ids } } });
    await prisma.studentProfile.deleteMany({ where: { personId: { in: ids } } });
    await prisma.person.deleteMany({ where: { id: { in: ids } } });
  }
});

test('the five operational paths submit one mailbox and EN multipart mail to the local sink; rollback restores the original contact', async (t) => {
  const { recordAdjustment, sendNegativeBalanceAlert } = await import('../src/server/services/accounts.service');
  const { transitionBooking } = await import('../src/server/services/bookings.service');
  const { setOutOfService, archiveAircraft } = await import('../src/server/services/aircraft.service');
  const { runExpiryAlertsJob } = await import('../src/server/services/expiry-alerts.service');
  const { getMailSender } = await import('../src/server/adapters/mail');
  const sink = 'http://127.0.0.1:8025/api/v1';
  assert.ok((await fetch(sink + '/info', { redirect: 'error' })).ok, 'Local Mailpit required');
  assert.equal(await prisma.expiry.count(), 0, 'Use a freshly seeded disposable database');
  assert.equal(await prisma.user.count({ where: { isActive: true, roles: { has: 'ADMIN' } } }), 1,
    'The local sink fixture requires the sole seeded admin; reset the disposable database');
  const staff = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@airmanager.local' } });
  const actor = { userId: staff.id, roles: staff.roles, personId: staff.personId };
  const tag = randomUUID();
  const email = 'holder-' + tag + '@fixture.invalid';
  const legacy = email.split('@')[0].toUpperCase() + '@fixture.invalid';
  const person = await prisma.person.create({ data: { firstName: 'Synthetic', lastName: tag, email: legacy, account: { create: {} } } });
  const user = await prisma.user.create({ data: { email, locale: 'en', roles: ['PILOT'], personId: person.id,
    emailVerification: { create: { email, verifiedAt: new Date() } } } });
  const smtp = { 'smtp.host': '127.0.0.1', 'smtp.port': '1025', 'smtp.from': 'local-sender@fixture.invalid', 'smtp.security': 'NONE' };
  const saved = await prisma.appSetting.findMany({ where: { key: { startsWith: 'smtp.' } } });
  const ids: string[] = [];
  const expiryType = await prisma.expiryType.create({ data: { name: 'Synthetic-' + tag, scope: 'ALL' } });
  const send = getMailSender();
  const submit = send.send.bind(send);
  const submitted: { to: string; subject: string }[] = [];
  t.mock.method(send, 'send', async (msg: Parameters<typeof submit>[0]) => {
    assert.ok([email, legacy, staff.email].includes(msg.to), 'Only the fixture holder and seeded digest admin may receive mail');
    await submit(msg);
    submitted.push({ to: msg.to, subject: msg.subject });
  });
  async function airplane(status: 'PENDING' | 'APPROVED') {
    const ac = await prisma.aircraft.create({ data: { registration: 'T-' + randomUUID(), type: 'Synthetic', model: 'Synthetic' } });
    ids.push(ac.id);
    const book = (offset: number) => prisma.booking.create({ data: { personId: person.id, aircraftId: ac.id, status,
      actorUserId: staff.id, startsAt: new Date(Date.now() + offset), endsAt: new Date(Date.now() + offset + 3600000) } });
    const booking = await book(86400000);
    if (status === 'APPROVED') await book(2 * 86400000);
    return { ac, booking };
  }
  async function captured(expected: number) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && submitted.filter(m => m.to !== staff.email).length < expected) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(submitted.filter(m => m.to !== staff.email).length, expected, 'Number of holder messages accepted by local sink');
  }
  try {
    await prisma.appSetting.deleteMany({ where: { key: { startsWith: 'smtp.' } } });
    await prisma.appSetting.createMany({ data: Object.entries(smtp).map(([key, value]) => ({ key, value })) });
    await sendNegativeBalanceAlert(person.id, person, -100);
    await captured(1);
    const preview = await inspectLegacyMail(actor, 1);
    await setLegacyMailRouting(actor, true, preview.revision);
    await recordAdjustment(actor, person.id, { amountCents: -2000, reason: 'Synthetic' });
    await captured(2);
    const denied = await airplane('PENDING');
    await transitionBooking(actor, denied.booking.id, { to: 'DENIED', reason: 'Synthetic' });
    const grounded = await airplane('APPROVED');
    await setOutOfService(actor, grounded.ac.id, { reason: 'Synthetic' });
    await captured(4);
    const archived = await airplane('APPROVED');
    await archiveAircraft(actor, archived.ac.id);
    await captured(5);
    await prisma.expiry.create({ data: { personId: person.id, expiryTypeId: expiryType.id, actorUserId: staff.id,
      expiresAt: new Date(Date.now() + 3 * 86400000) } });
    const notifications = await runExpiryAlertsJob();
    assert.equal(notifications.holderEmailsSent, 1);
    assert.equal(notifications.digestEmailsSent, 1);
    await captured(6);
    const latest = await inspectLegacyMail(actor, 1);
    await setLegacyMailRouting(actor, false, latest.revision);
    await sendNegativeBalanceAlert(person.id, person, -100);
    await captured(7);
    assert.deepEqual(submitted.filter(msg => msg.to !== staff.email).map(msg => msg.to), [legacy, email, email, email, email, email, legacy]);
    const response = await fetch(sink + '/search?query=' + encodeURIComponent('to:' + email), { redirect: 'error' });
    const result = await response.json() as { messages: { ID: string }[] };
    assert.equal(result.messages.length, 7);
    const capturedTo: string[] = [];
    const subjects = new Set<string>();
    for (const item of result.messages) {
      const msg = await (await fetch(sink + '/message/' + item.ID, { redirect: 'error' })).json() as {
        To: { Address: string }[]; Cc: unknown[]; Bcc: unknown[]; Subject: string; Text: string; HTML: string;
      };
      assert.equal(msg.To.length, 1);
      assert.equal((msg.Cc ?? []).length + (msg.Bcc ?? []).length, 0);
      capturedTo.push(msg.To[0].Address);
      assert.match(msg.Text, /Hello/);
      assert.match(msg.HTML, /AirManager/);
      subjects.add(msg.Subject);
    }
    assert.equal(capturedTo.filter(to => to === email).length, 5);
    assert.equal(capturedTo.filter(to => to === legacy).length, 2);
    assert.equal(subjects.size, 5);
  } finally {
    await prisma.appSetting.deleteMany({ where: { OR: [{ key: { startsWith: 'smtp.' } }, { key: 'mail.legacyRouting' }] } });
    await prisma.appSetting.createMany({ data: saved });
    await prisma.expiry.deleteMany({ where: { personId: person.id } });
    await prisma.expiryType.delete({ where: { id: expiryType.id } });
    await prisma.booking.deleteMany({ where: { personId: person.id } });
    await prisma.aircraft.deleteMany({ where: { id: { in: ids } } });
    await prisma.accountMovement.deleteMany({ where: { account: { personId: person.id } } });
    await prisma.account.delete({ where: { personId: person.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.person.delete({ where: { id: person.id } });
  }
});

test('custom and generic delivery plans look up a mailbox by index with 5,000 other account/person pairs', async (t) => {
  const { Client } = await import('pg');
  const { holderDeliveryQuery } = await import('../src/server/services/legacy-mail-routing');
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const prefix = 'cost-' + randomUUID();
    await client.query(`INSERT INTO "Person"(id,"firstName","lastName",email,"updatedAt")
      SELECT $1||n,'Synthetic','Cost',upper($1||n||'@fixture.invalid'),now() FROM generate_series(1,5000) n`, [prefix]);
    await client.query(`INSERT INTO "User"(id,"personId",email,roles,"updatedAt")
      SELECT $1||n,$1||n,$1||n||'@fixture.invalid',ARRAY['PILOT']::"Role"[],now() FROM generate_series(1,5000) n`, [prefix]);
    await client.query(`INSERT INTO "AppSetting"(id,key,value,"updatedAt") VALUES ('synthetic-plan-setting','mail.legacyRouting','on:fixture',now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    await client.query('ANALYZE "User"');
    await client.query('ANALYZE "Person"');
    const statement = holderDeliveryQuery(prefix + '2500');
    await client.query('PREPARE legacy_route AS ' + statement.text);
    const parameters = statement.values.map(value => client.escapeLiteral(String(value))).join(',');
    type Node = { 'Relation Name'?: string; 'Node Type': string; 'Index Name'?: string; 'Actual Loops': number; Plans?: Node[] };
    for (const mode of ['force_custom_plan', 'force_generic_plan']) {
      await client.query('SET LOCAL plan_cache_mode = ' + mode);
      const doc = (await client.query('EXPLAIN (ANALYZE, FORMAT JSON) EXECUTE legacy_route(' + parameters + ')')).rows[0]['QUERY PLAN'][0];
      const indexes: string[] = [];
      function inspect(node: Node) {
        if (node['Actual Loops'] && node['Index Name']) indexes.push(node['Index Name']);
        if (node['Actual Loops'] && ['Person','User'].includes(node['Relation Name'] ?? '')) {
          assert.notEqual(node['Node Type'], 'Seq Scan', 'unexpected full directory scan');
        }
        node.Plans?.forEach(inspect);
      }
      inspect(doc.Plan);
      assert.ok(indexes.includes('Person_trial_mailbox_idx') && indexes.includes('User_trial_mailbox_idx'), 'Both ownership indexes must be used');
      t.diagnostic(mode + ': ' + doc['Execution Time'] + ' ms; both ownership indexes used');
    }
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
