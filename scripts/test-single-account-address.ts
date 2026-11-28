import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Client, Pool } from 'pg';
import './require-mail-integration-db';
import { emailTrialEnabled } from '../src/server/auth/email-trial-policy';
import { prisma } from '../src/server/db/prisma';
import { createPerson, getPerson, listPeople, updatePerson } from '../src/server/services/people.service';
import { createUser } from '../src/server/services/users.service';
import { ConflictError } from '../src/server/services/errors';
import { archiveAircraft, setOutOfService } from '../src/server/services/aircraft.service';
import { transitionBooking } from '../src/server/services/bookings.service';
import { registerFlight } from '../src/server/services/flights.service';
import { runExpiryAlertsJob } from '../src/server/services/expiry-alerts.service';
import { SmtpMailSender } from '../src/server/adapters/mail/smtp-mail-sender';
import { holderDeliveryFence, holderMailbox } from '../src/server/services/account-mailbox';
import { sendNegativeBalanceAlert } from '../src/server/services/accounts.service';
import { requestEmailLogin } from '../src/server/services/email-trial.service';

assert.ok(emailTrialEnabled(), 'Dedicated local email trial required');
const actor = { userId: 'synthetic-admin', roles: ['ADMIN'] as ['ADMIN'], personId: null };
const address = () => randomUUID() + '@fixture.invalid';
const fixture = async (personalEmail: string | null, verified = true) => {
  const email = address();
  const person = await prisma.person.create({ data: { firstName: 'Fixture', lastName: randomUUID(), email: personalEmail } });
  const user = await prisma.user.create({ data: { email, personId: person.id, roles: ['PILOT'], locale: 'en',
    emailVerification: { create: { email, verifiedAt: verified ? new Date() : null } } } });
  return { person, user };
};

before(async () => {
  const info = await (await fetch('http://127.0.0.1:8025/api/v1/webui')).json();
  assert.equal(info.MessageRelay.Enabled, false, 'Fixture sink must not forward mail');
  const smtp = { 'smtp.host': '127.0.0.1', 'smtp.port': '1025', 'smtp.security': 'NONE', 'smtp.from': 'sender@fixture.invalid' };
  for (const [key, value] of Object.entries(smtp)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@airmanager.local' } });
  actor.userId = admin.id;
});

after(() => prisma.$disconnect());

test('registry and search expose only the registered account address; a partial identity edit preserves historical data', async () => {
  const historical = address();
  const { person, user } = await fixture(historical);
  assert.equal((await getPerson(actor, person.id)).email, user.email);
  const query = { page: 1, pageSize: 20, includeArchived: false };
  assert.equal((await listPeople(actor, { ...query, q: user.email })).total, 1);
  assert.equal((await listPeople(actor, { ...query, q: historical })).total, 0);
  await assert.rejects(updatePerson(actor, person.id, { email: address() }), /account/i);
  await updatePerson(actor, person.id, { firstName: 'Updated' });
  assert.equal((await prisma.person.findUniqueOrThrow({ where: { id: person.id } })).email, historical);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).tokenVersion, user.tokenVersion);
});

test('integrated creation cannot store a second contact, even before proof of mailbox', async () => {
  const input = { firstName: 'Fixture', lastName: randomUUID(), access: { email: address(), roles: ['PILOT'] as ['PILOT'] } };
  await assert.rejects(createPerson(actor, { ...input, email: address() }), /account/i);
  assert.equal(await prisma.person.count({ where: { lastName: input.lastName } }), 0);
  const person = await createPerson(actor, { ...input, email: input.access.email });
  assert.equal((await prisma.person.findUniqueOrThrow({ where: { id: person.id } })).email, null);
  await assert.rejects(updatePerson(actor, person.id, { email: address() }), /account/i);
});

async function captures(email: string) {
  const api = new URL('http://127.0.0.1:8025/api/v1/search');
  api.searchParams.set('query', 'to:' + email);
  const response = await fetch(api);
  assert.equal(response.status, 200);
  return (await response.json() as { messages: { To: { Address: string }[]; Cc: unknown[]; Bcc: unknown[]; Subject: string }[] }).messages;
}

test('balance alert uses the verified login address even when the person has no email; login never uses the historic value', async () => {
  const { person, user } = await fixture(null);
  await sendNegativeBalanceAlert(person.id, person, -1000);
  const sent = await captures(user.email);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].To.map(r => r.Address), [user.email]);
  assert.equal(sent[0].Cc?.length || 0, 0);
  assert.equal(sent[0].Bcc?.length || 0, 0);
  const previous = address();
  await prisma.person.update({ where: { id: person.id }, data: { email: previous } });
  await requestEmailLogin(previous, 'direct');
  assert.equal(await prisma.credentialMail.count({ where: { userId: user.id, purpose: 'LOGIN_LINK' } }), 0);
  assert.equal(sent[0].Subject, 'Your AirManager account is in the negative');
});

test('a contact without an account cannot deliver to a mailbox independently claimed by another verified account', async () => {
  const { user } = await fixture(null);
  const other = await prisma.person.create({ data: { firstName: 'Other', lastName: randomUUID(), email: user.email } });
  await sendNegativeBalanceAlert(other.id, other, -1000);
  assert.equal((await captures(user.email)).length, 0);
});

test('archived, whitespace/case-variant contact of another person prevents issuance of a login credential', async () => {
  const { user } = await fixture(null);
  await prisma.person.create({ data: { firstName: 'Archived', lastName: randomUUID(), email: ' ' + user.email.toUpperCase() + ' ', archivedAt: new Date() } });
  await requestEmailLogin(user.email, 'direct');
  assert.equal(await prisma.credentialMail.count({ where: { userId: user.id, purpose: 'LOGIN_LINK' } }), 0);
});

test('stale proof, inactive account and malformed stored account address cannot fall back to a person contact', async () => {
  const { person, user } = await fixture(address());
  await prisma.emailVerification.update({ where: { userId: user.id }, data: { email: address() } });
  assert.equal(await holderMailbox(person.id, person.email), null);
  await prisma.emailVerification.update({ where: { userId: user.id }, data: { email: user.email } });
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  assert.equal(await holderMailbox(person.id, person.email), null);
  await prisma.user.update({ where: { id: user.id }, data: { isActive: true, email: '' } });
  try { assert.equal(await holderMailbox(person.id, person.email), null); }
  finally { await prisma.user.update({ where: { id: user.id }, data: { email: user.email } }); }
});

test('registered aircraft and flight actions, booking denial, holder reminder and admin digest use their distinct owners', async () => {
  const { person, user } = await fixture(address());
  await prisma.pilotProfile.create({ data: { personId: person.id, licenseNumber: randomUUID(), licenseType: 'PPL' } });
  const aircraft = await prisma.aircraft.create({ data: { registration: randomUUID(), type: 'Fixture', model: 'Local' } });
  await prisma.aircraftRate.create({ data: { aircraftId: aircraft.id, actorUserId: actor.userId,
    pilotPriceCents: 15000, studentPriceCents: 12000, validFrom: new Date('2020-01-01') } });
  await registerFlight(actor, { aircraftId: aircraft.id, personId: person.id, isSolo: false, noCharge: false, flightType: 'TOURISM',
    departureAirfield: 'Fixture', arrivalAirfield: 'Fixture', takeoffAt: new Date(Date.now() - 2*3600_000).toISOString(),
    landingAt: new Date(Date.now() - 3600_000).toISOString(), force: true });
  const slot = { aircraftId: aircraft.id, personId: person.id, actorUserId: actor.userId,
    startsAt: new Date(Date.now() + 86400_000), endsAt: new Date(Date.now() + 86400_000 + 3600_000) };
  const pending = await prisma.booking.create({ data: slot });
  await transitionBooking(actor, pending.id, { to: 'DENIED', reason: 'Synthetic maintenance' });
  await prisma.booking.create({ data: { ...slot, status: 'APPROVED' } });
  await setOutOfService(actor, aircraft.id, { reason: 'Fixture' });
  await archiveAircraft(actor, aircraft.id);
  const admin = await fixture(address());
  await prisma.user.update({ where: { id: admin.user.id }, data: { roles: ['ADMIN'], locale: 'it' } });
  const expiryType = await prisma.expiryType.create({ data: { name: randomUUID(), scope: 'ALL' } });
  const expiry = await prisma.expiry.create({ data: { personId: person.id, actorUserId: actor.userId,
    expiryTypeId: expiryType.id, expiresAt: new Date(Date.now() + 45*86400_000) } });
  try {
    await runExpiryAlertsJob();
    const until = Date.now() + 6000;
    let mails = await captures(user.email);
    while (mails.length < 5 && Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 100));
      mails = await captures(user.email);
    }
    assert.equal(new Set(mails.map(m => m.Subject)).size, 5, 'Expected five distinct operational emails');
    for (const mail of mails) assert.deepEqual(mail.To.map(to => to.Address), [user.email]);
    assert.equal((await captures(person.email!)).length, 0);
    const digest = await captures(admin.user.email);
    assert.equal(digest.length, 1);
    assert.deepEqual(digest[0].To.map(to => to.Address), [admin.user.email]);
    assert.equal((await captures(admin.person.email!)).length, 0);
  } finally { await prisma.expiry.delete({ where: { id: expiry.id } }); }
});

test('a change after rendering is checked at the SMTP handoff and cannot redirect a prepared message', async () => {
  const { user, person } = await fixture(address());
  const recipient = await holderMailbox(person.id, person.email);
  assert.ok(recipient);
  const prepared = { to: recipient.email, subject: 'Fixture', text: 'Fixture', ...holderDeliveryFence(person.id, recipient) };
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  await assert.rejects(new SmtpMailSender().send(prepared), /eligibility changed/);
  assert.equal((await captures(user.email)).length, 0);
  assert.equal((await captures(person.email!)).length, 0);
});

test('only a contact without an account may receive at its own address in the trial; rollback restores the original read without writing', async () => {
  const personal = address();
  const standalone = await createPerson(actor, { firstName: 'Fixture', lastName: randomUUID(), email: personal });
  assert.equal((await holderMailbox(standalone.id, personal))?.email, personal);
  assert.equal(await prisma.user.count({ where: { personId: standalone.id } }), 0);
  const legacy = await prisma.user.create({ data: { email: address(), roles: ['PILOT'], personId: standalone.id } });
  assert.equal(await holderMailbox(standalone.id, personal), null);
  assert.equal((await getPerson(actor, standalone.id)).email, legacy.email);
  await assert.rejects(updatePerson(actor, standalone.id, { email: address() }), /account/i);
  const { digestRecipientCurrent } = await import('../src/server/services/account-mailbox');
  await prisma.user.update({ where: { id: legacy.id }, data: { roles: ['ADMIN'] } });
  assert.equal(await digestRecipientCurrent(legacy.id, legacy.email, null), false);
  const { user, person } = await fixture(address());
  try {
    delete process.env.AIRMANAGER_EMAIL_TRIAL;
    assert.equal((await getPerson(actor, person.id)).email, person.email);
    assert.equal((await holderMailbox(person.id, person.email))?.email, person.email);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } })).tokenVersion, legacy.tokenVersion);
  } finally { process.env.AIRMANAGER_EMAIL_TRIAL = '1'; }
  assert.equal((await holderMailbox(person.id, person.email))?.email, user.email);
});

test('competing contact edit and verified invitation cannot create conflicting ownership; re-link rolls back an ambiguous association', async () => {
  const contact = await createPerson(actor, { firstName: 'Fixture', lastName: randomUUID() });
  const email = address();
  const results = await Promise.allSettled([
    updatePerson(actor, contact.id, { email }),
    createUser(actor, { email, roles: ['PILOT'], locale: 'it' }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(results.find(r => r.status === 'rejected')?.reason instanceof ConflictError);

  const { person, user } = await fixture(null);
  await prisma.person.update({ where: { id: person.id }, data: { email: user.email } });
  const target = await createPerson(actor, { firstName: 'Fixture', lastName: randomUUID() });
  const { updateUser } = await import('../src/server/services/users.service');
  await assert.rejects(updateUser(actor, user.id, { personId: target.id }), ConflictError);
  const retained = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(retained.personId, person.id);
  assert.equal(retained.tokenVersion, user.tokenVersion);
});

for (const stage of ['claim', 'handoff'] as const) test('a temporary holder lookup failure at '+stage+' releases only the new cadence; the next run sends it once', async t => {
  const { user, person } = await fixture(address());
  const reporter = await fixture(null);
  await prisma.user.update({ where: { id: reporter.user.id }, data: { roles: ['ADMIN'] } });
  const type = await prisma.expiryType.create({ data: { name: randomUUID(), scope: 'ALL' } });
  const expiry = await prisma.expiry.create({ data: { personId: person.id, actorUserId: actor.userId,
    expiryTypeId: type.id, expiresAt: new Date(Date.now() + 3 * 86400_000) } });
  const older = await prisma.sentAlert.create({ data: { expiryId: expiry.id, threshold: 60 } });
  try {
    // Inject one database read error; the claim, its release and the next
    // run still use the real transaction, rows and SMTP capture.
    const endpoint = stage === 'claim' ? Client.prototype : Pool.prototype;
    const originalQuery = endpoint.query;
    let interrupted = false;
    t.mock.method(endpoint, 'query', function(this: Pool | Client, ...args: unknown[]) {
      const request = args[0] as { text?: string; values?: unknown[] };
      if (!interrupted && request.text?.includes('AS "contactContested"') && request.values?.includes(person.id)) {
        interrupted = true;
        if (stage === 'claim') {
          // PostgreSQL marks the real transaction failed; only a savepoint can recover it.
          return Reflect.apply(originalQuery, this, [{ text: "SELECT CAST('fixture' AS integer)" }]);
        }
        return Promise.reject(new Error('Synthetic temporary read failure'));
      }
      return Reflect.apply(originalQuery, this, args);
    });
    const first = await runExpiryAlertsJob();
    assert.equal(interrupted, true);
    assert.equal(first.holderEmailsSent, 0);
    assert.equal(first.alertsCreated, 0);
    assert.equal(first.digestEmailsSent > 0, true);
    const kept = await prisma.sentAlert.findMany({ where: { expiryId: expiry.id }, select: { id: true } });
    assert.deepEqual(kept.map(row => row.id), [older.id]);
    assert.equal((await captures(user.email)).length, 0);
    const next = await runExpiryAlertsJob();
    assert.equal(next.holderEmailsSent, 1);
    assert.equal(next.alertsCreated, 2);
    assert.equal((await captures(user.email)).length, 1);
    assert.equal((await runExpiryAlertsJob()).holderEmailsSent, 0);
    assert.equal((await captures(user.email)).length, 1);
  } finally { await prisma.expiry.delete({ where: { id: expiry.id } }); }
});

test('contact mail permits one legacy mailbox; admin digests require current proof of one canonical address', async () => {
  const { digestRecipientCurrent } = await import('../src/server/services/account-mailbox');
  const raw = address().toUpperCase();
  const person = await prisma.person.create({ data: { firstName: 'Fixture', lastName: randomUUID(), email: raw } });
  assert.equal((await holderMailbox(person.id, raw))?.email, raw);
  const admin = await prisma.user.create({ data: { email: raw, roles: ['ADMIN'], personId: person.id } });
  assert.equal(await digestRecipientCurrent(admin.id, raw, null), false);
  const joined = address() + ', ' + address();
  await prisma.person.update({ where: { id: person.id }, data: { email: joined } });
  await prisma.user.update({ where: { id: admin.id }, data: { email: joined } });
  assert.equal(await holderMailbox(person.id, joined), null);
  assert.equal(await digestRecipientCurrent(admin.id, joined, null), false);
});
