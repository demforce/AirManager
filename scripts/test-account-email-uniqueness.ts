// Run against a migrated, disposable airmanager_test with the local email trial enabled.
// No worker or SMTP transport is started; accepted invitations are inspected in the database.
import './require-mail-integration-db';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { Client } from 'pg';
import { createPersonSchema } from '../src/lib/schemas/people';
import { createUserSchema } from '../src/lib/schemas/users';
import { emailTrialEnabled } from '../src/server/auth/email-trial-policy';
import { prisma } from '../src/server/db/prisma';
import { ConflictError } from '../src/server/services/errors';
import { createPerson } from '../src/server/services/people.service';
import { createUser } from '../src/server/services/users.service';

assert.ok(emailTrialEnabled(), 'Dedicated local email trial required');
const actor = { userId: 'synthetic-admin', roles: ['ADMIN'] as ['ADMIN'], personId: null };
const mailbox = () => 'k' + randomUUID() + '@fixture.invalid';
after(() => prisma.$disconnect());

test('direct SQL inserts and updates respect canonical ownership, including inactive and pending accounts', async () => {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  try {
    for (const isActive of [false, true]) {
      const email = mailbox();
      const historical = '\u3000\u212a' + email.slice(1).toUpperCase() + '\u00a0';
      const owner = await prisma.user.create({ data: { email: historical, roles: ['PILOT'], isActive,
        emailVerification: { create: { email: historical } } } });
      const input = createUserSchema.parse({ email: historical, roles: ['PILOT'] });
      assert.equal(input.email, email);
      const conflict = (error: unknown) => error instanceof ConflictError && error.code === 'CONFLICT' && /email/i.test(error.message);
      await assert.rejects(createUser(actor, input), conflict);
      const composite = createPersonSchema.parse({ firstName: 'Fixture', lastName: randomUUID(), access: input });
      await assert.rejects(createPerson(actor, composite), conflict);
      assert.equal(await prisma.person.count({ where: { lastName: composite.lastName } }), 0);
      const duplicate = (error: unknown) => (error as { code?: string; constraint?: string }).code === '23505'
        && (error as { constraint?: string }).constraint === 'User_canonical_email_key';
      await assert.rejects(db.query('INSERT INTO "User" (id, email, "updatedAt") VALUES ($1, $2, now())', [randomUUID(), email]), duplicate);
      const other = await prisma.user.create({ data: { email: mailbox(), roles: ['STUDENT'] } });
      await assert.rejects(db.query('UPDATE "User" SET email = $1 WHERE id = $2', [email, other.id]), duplicate);
      const afterAttempts = await prisma.user.findUniqueOrThrow({ where: { id: owner.id }, include: { emailVerification: true } });
      assert.equal(afterAttempts.email, historical);
      assert.equal(afterAttempts.emailVerification?.verifiedAt, null);
      assert.equal(afterAttempts.isActive, isActive);
      assert.equal(afterAttempts.tokenVersion, owner.tokenVersion);
      assert.equal(await prisma.credentialMail.count({ where: { userId: owner.id } }), 0);
    }
  } finally { await db.end(); }
});

test('concurrent standalone and integrated administrative creation produce one account and one invitation', async () => {
  const email = mailbox();
  const standalone = createUserSchema.parse({ email: ' ' + email.toUpperCase() + ' ', roles: ['PILOT'] });
  const integrated = createPersonSchema.parse({ firstName: 'Fixture', lastName: randomUUID(), access: { email, roles: ['PILOT'] } });
  const outcomes = await Promise.allSettled([createUser(actor, standalone), createPerson(actor, integrated)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  const loser = outcomes.find(result => result.status === 'rejected');
  assert.ok(loser?.reason instanceof ConflictError);
  assert.equal(loser.reason.code, 'CONFLICT');
  assert.match(loser.reason.message, /email/i);
  const winner = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.equal(await prisma.credentialMail.count({ where: { userId: winner.id, purpose: 'VERIFY_EMAIL' } }), 1);
  assert.equal(await prisma.person.count({ where: { lastName: integrated.lastName } }), outcomes[1].status === 'fulfilled' ? 1 : 0);
});
