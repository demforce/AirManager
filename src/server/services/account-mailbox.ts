import { Prisma } from '@/generated/prisma/client';
import { singleMailbox } from '@/lib/schemas/email-trial';
import { emailTrialEnabled } from '@/server/auth/email-trial-policy';
import { prisma } from '@/server/db/prisma';
import { ConflictError } from './errors';

type Db = Prisma.TransactionClient;

// Legacy imports can predate canonical input validation. Equality here is only a
// collision check. It never supplies an identity, association or destination.
const sameMailbox = (column: Prisma.Sql, address: Prisma.Sql) =>
  Prisma.sql`airmanager_canonical_email(${column}) COLLATE "C" = airmanager_canonical_email(${address}) COLLATE "C"`;

function otherOwner(email: Prisma.Sql, userId: Prisma.Sql, personId: Prisma.Sql) {
  return Prisma.sql`(
    EXISTS (SELECT 1 FROM "User" other_u
            WHERE other_u.id IS DISTINCT FROM ${userId} AND ${sameMailbox(Prisma.sql`other_u.email`, email)})
    OR EXISTS (SELECT 1 FROM "Person" other_p
               WHERE other_p.id IS DISTINCT FROM ${personId} AND ${sameMailbox(Prisma.sql`other_p.email`, email)})
  )`;
}

// Used by the existing security monitor's admin query (table alias u).
export function securityOwnershipFilter() {
  return emailTrialEnabled()
    ? Prisma.sql`AND NOT ${otherOwner(Prisma.sql`u.email`, Prisma.sql`u.id`, Prisma.sql`u."personId"`)}`
    : Prisma.empty;
}

export async function accountMailboxUncontested(db: Db, userId: string, email: string): Promise<boolean> {
  const [owner] = await db.$queryRaw<{ eligible: boolean }[]>`
    SELECT NOT ${otherOwner(Prisma.sql`u.email`, Prisma.sql`u.id`, Prisma.sql`u."personId"`)} AS eligible
    FROM "User" u WHERE u.id = ${userId} AND u.email = ${email}`;
  return owner?.eligible === true;
}

// Only identity writers in the isolated trial take this lock; never held for mail.
export async function lockMailboxWrites(tx: Db) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(19021, 4)`;
}

export async function assertContactAvailable(tx: Db, email: string, personId: string | null) {
  const [other] = await tx.$queryRaw<{ taken: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "User" u
      WHERE (u."personId" IS NULL OR u."personId" IS DISTINCT FROM ${personId})
        AND ${sameMailbox(Prisma.sql`u.email`, Prisma.sql`${email}::text`)}
    ) AS taken`;
  if (other.taken) throw new ConflictError('Email already belongs to another account.');
}

type Recipient = { email: string; userId: string | null };
type HolderRow = { personId: string; personal: string | null; registered: string | null; userId: string | null;
  enrolled: boolean; verifiedAt: Date | null; expiryStartCycle: number | null;
  verified: boolean; uncontested: boolean; contactContested: boolean };
type HolderSnapshot = {
  recipient: Recipient | null;
  proof: { verifiedAt: Date | null; expiryStartCycle: number | null } | null;
};
export type EventRecipients = ReadonlyMap<string, HolderSnapshot>;

// One statement snapshots the persistent association, proof and ownership at the business event.
// Absence in this map stays a suppression even if post-commit rendering runs after activation.
async function readRecipients(db: Db, personIds: string[]): Promise<EventRecipients> {
  const rows = await db.$queryRaw<HolderRow[]>`
    SELECT p.id AS "personId", p.email AS personal, u.email AS registered, u.id AS "userId",
      v."userId" IS NOT NULL AS enrolled, v."verifiedAt", v."expiryStartCycle",
      u."isActive" AND v.email = u.email AND v."verifiedAt" IS NOT NULL AS verified,
      EXISTS (SELECT 1 FROM "User" claimant
              WHERE claimant.id IS DISTINCT FROM u.id AND ${sameMailbox(Prisma.sql`claimant.email`, Prisma.sql`p.email`)}) AS "contactContested",
      NOT ${otherOwner(Prisma.sql`u.email`, Prisma.sql`u.id`, Prisma.sql`p.id`)} AS uncontested
    FROM "Person" p LEFT JOIN "User" u ON u."personId" = p.id
    LEFT JOIN "EmailVerification" v ON v."userId" = u.id WHERE p.id IN (${Prisma.join(personIds)})`;
  const recipients = new Map<string, HolderSnapshot>();
  for (const row of rows) {
    let recipient: Recipient | null = null;
    if (row.userId === null) {
      if (row.personal && !row.contactContested && singleMailbox.safeParse(row.personal).success) {
        recipient = { email: row.personal.trim(), userId: null };
      }
    } else {
      const canonical = singleMailbox.safeParse(row.registered);
      if (row.verified && row.uncontested && canonical.success && canonical.data === row.registered) {
        recipient = { email: canonical.data, userId: row.userId };
      }
    }
    const proof = row.enrolled ? { verifiedAt: row.verifiedAt, expiryStartCycle: row.expiryStartCycle } : null;
    recipients.set(row.personId, { recipient, proof });
  }
  return recipients;
}

// A notification read must never undo the business operation. A savepoint confines
// a failed PostgreSQL statement to the snapshot; an empty result suppresses this event.
export async function captureEventRecipients(tx: Db, personIds: string[]): Promise<EventRecipients | undefined> {
  if (!emailTrialEnabled() || !personIds.length) return undefined;
  await tx.$executeRaw`SAVEPOINT operational_mail_recipient`;
  let recipients: EventRecipients;
  try {
    recipients = await readRecipients(tx, personIds);
  } catch {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT operational_mail_recipient`;
    console.error('Operational mail: recipient snapshot unavailable.');
    recipients = new Map();
  }
  await tx.$executeRaw`RELEASE SAVEPOINT operational_mail_recipient`;
  return recipients;
}

export async function holderMailbox(personId: string, legacyEmail: string | null, atEvent?: EventRecipients): Promise<Recipient | null> {
  if (atEvent) return atEvent.get(personId)?.recipient ?? null;
  if (!emailTrialEnabled()) return legacyEmail ? { email: legacyEmail, userId: null } : null;
  return (await readRecipients(prisma, [personId])).get(personId)?.recipient ?? null;
}

export async function holderStillCurrent(personId: string, recipient: Recipient): Promise<boolean> {
  if (!emailTrialEnabled()) return true;
  const fresh = await holderMailbox(personId, recipient.email);
  return fresh?.email === recipient.email && fresh.userId === recipient.userId;
}

export function holderDeliveryFence(personId: string, recipient: Recipient) {
  return emailTrialEnabled() ? { confirmRecipient: () => holderStillCurrent(personId, recipient) } : {};
}

export async function digestRecipientCurrent(userId: string, address: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: {
    email: true, isActive: true, roles: true, emailVerification: true,
  } });
  if (!user?.isActive || !user.roles.includes('ADMIN') || user.email !== address) return false;
  const checked = singleMailbox.safeParse(address);
  if (!user.emailVerification) return false;
  return checked.success && checked.data === address && user.emailVerification.verifiedAt !== null
    && user.emailVerification.email === address && await accountMailboxUncontested(prisma, userId, user.email);
}
