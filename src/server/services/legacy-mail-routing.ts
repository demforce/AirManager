import { createHmac, randomUUID } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { singleMailbox } from '@/lib/schemas/email-trial';
import type { InventoryReason, LegacyMailPreview, LegacyMailRow } from '@/lib/schemas/legacy-mail-routing';
import { emailTrialEnabled } from '@/server/auth/email-trial-policy';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from './errors';
import { getOperationalMailPolicy, parseOperationalMailPolicy, OPERATIONAL_MAIL_KEY } from './operational-mail-settings';

const KEY = 'mail.legacyRouting';
const PAGE_SIZE = 30;
type Tx = Prisma.TransactionClient;
type RecordRow = Omit<LegacyMailRow, 'reasons' | 'mixedProfiles'> & {
  contact: string | null; account: string | null; active: boolean | null; archived: boolean;
  verifiedEmail: string | null; verifiedAt: Date | string | null; profiles: number; inactive: number; duplicate: boolean;
};

function mailboxKey(column: Prisma.Sql) {
  return Prisma.sql`airmanager_mailbox_key(${column}) COLLATE "C"`;
}

function inventoryQuery(personId?: string) {
  // For the directory as a whole, group by owner once. For a delivery, use
  // two indexed equality probes. Other owners count even if inactive/archived.
  const contactKey = mailboxKey(Prisma.sql`p.email`);
  const directory = Prisma.sql`
    WITH owners AS (
      SELECT 'p:' || id AS owner, ${mailboxKey(Prisma.sql`email`)} AS mailbox FROM "Person"
      UNION ALL SELECT COALESCE('p:' || "personId", 'u:' || id), ${mailboxKey(Prisma.sql`email`)} FROM "User"
    ), collisions AS (
      SELECT mailbox FROM owners WHERE mailbox IS NOT NULL GROUP BY mailbox HAVING MIN(owner) <> MAX(owner)
    ), deliveries AS (
      SELECT "userId" AS owner, state FROM "CredentialMail" WHERE state IN ('QUEUED','CLAIMED','HANDOFF','UNCERTAIN')
      UNION ALL SELECT "userId", state FROM "SecurityDelivery" WHERE state IN ('QUEUED','CONFIGURATION','HANDOFF','UNCERTAIN')
    ), counts AS (
      SELECT owner, count(*) FILTER (WHERE state IN ('QUEUED','CONFIGURATION'))::int AS queued,
        count(*) FILTER (WHERE state IN ('CLAIMED','HANDOFF'))::int AS "inFlight",
        count(*) FILTER (WHERE state = 'UNCERTAIN')::int AS uncertain FROM deliveries GROUP BY owner
    )`;
  const indexedConflict = Prisma.sql`
    EXISTS (SELECT 1 FROM "Person" other WHERE other.email IS NOT NULL AND ${mailboxKey(Prisma.sql`other.email`)} = ${contactKey}
            AND other.id <> p.id)
    OR EXISTS (SELECT 1 FROM "User" other WHERE ${mailboxKey(Prisma.sql`other.email`)} = ${contactKey}
               AND other."personId" IS DISTINCT FROM p.id)`;
  const counts = personId ? Prisma.sql`0 AS queued, 0 AS "inFlight", 0 AS uncertain` : Prisma.sql`
    coalesce(m.queued, 0) AS queued, coalesce(m."inFlight", 0) AS "inFlight", coalesce(m.uncertain, 0) AS uncertain`;
  return Prisma.sql`
    ${personId ? Prisma.empty : directory}
    SELECT p.id AS "personId", u.id AS "userId", p.email AS contact, u.email AS account,
      u."isActive" AS active, (p."archivedAt" IS NOT NULL) AS archived,
      e.email AS "verifiedEmail", e."verifiedAt", num_nonnulls(pi.id, st.id, ins.id) AS profiles,
      num_nonnulls(pi."deactivatedAt", st."deactivatedAt", ins."deactivatedAt") AS inactive,
      (${personId ? indexedConflict : Prisma.sql`pc.mailbox IS NOT NULL OR uc.mailbox IS NOT NULL`}) AS duplicate, ${counts}
    FROM "Person" p ${personId ? Prisma.sql`LEFT JOIN` : Prisma.sql`FULL OUTER JOIN`} "User" u ON u."personId" = p.id
    LEFT JOIN "EmailVerification" e ON e."userId" = u.id
    LEFT JOIN "PilotProfile" pi ON pi."personId" = p.id
    LEFT JOIN "StudentProfile" st ON st."personId" = p.id
    LEFT JOIN "InstructorProfile" ins ON ins."personId" = p.id
    ${personId ? Prisma.sql`WHERE p.id = ${personId}` : Prisma.sql`
      LEFT JOIN collisions pc ON pc.mailbox = ${contactKey}
      LEFT JOIN collisions uc ON uc.mailbox = ${mailboxKey(Prisma.sql`u.email`)}
      LEFT JOIN counts m ON m.owner = u.id ORDER BY p.id NULLS LAST, u.id`}`;
}

function classify(row: RecordRow): LegacyMailRow {
  const reasons: InventoryReason[] = [];
  const account = singleMailbox.safeParse(row.account);
  const contact = singleMailbox.safeParse(row.contact);
  if (!row.personId) reasons.push('accountOnly');
  if (!row.userId) reasons.push('personOnly');
  if (row.active === false) reasons.push('inactiveAccount');
  if (row.archived) reasons.push('archivedPerson');
  if (row.inactive && row.inactive === row.profiles) reasons.push('inactiveProfiles');
  if (row.personId && !row.contact) reasons.push('missingContact');
  if (row.contact && !contact.success) reasons.push('invalidContact');
  if (row.userId) {
    if (!account.success || account.data !== row.account) reasons.push('invalidAccount');
    if (row.verifiedEmail === null) reasons.push('notEnrolled');
    else if (row.verifiedEmail !== row.account) reasons.push('staleVerification');
    else if (!row.verifiedAt) reasons.push('pendingVerification');
  }
  if (account.success && contact.success && account.data !== contact.data) reasons.push('differentAddresses');
  if (row.duplicate) reasons.push('duplicate');
  return { personId: row.personId, userId: row.userId, reasons, mixedProfiles: row.inactive > 0 && row.inactive < row.profiles,
    queued: row.queued, inFlight: row.inFlight, uncertain: row.uncertain };
}

function requireTrialAdmin(actor: Actor) {
  authorize(actor, 'settings.manage');
  if (!emailTrialEnabled()) throw new NotFoundError('Trial unavailable.');
}

async function snapshot(tx: Tx, actor: Actor, requestedPage: number, changing = false): Promise<LegacyMailPreview> {
  // Legacy JWT role claims can predate a deactivation or demotion. A settings
  // writer retains current permission until commit, without changing the session.
  const permitted = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User" WHERE id = ${actor.userId} AND "isActive" AND 'ADMIN' = ANY(roles)
    ${changing ? Prisma.sql`FOR SHARE` : Prisma.empty}`;
  if (!permitted.length) throw new ForbiddenError('Active administrator required.');
  const setting = await tx.appSetting.findUnique({ where: { key: KEY }, select: { value: true } });
  const raw = await tx.$queryRaw<RecordRow[]>(inventoryQuery());
  // Bind the preview to the operator, every relevant source value and the unique
  // setting revision. Never expose or store its underlying addresses.
  const revision = createHmac('sha256', process.env.AUTH_SECRET!).update(JSON.stringify([actor.userId, setting?.value, raw])).digest('hex');
  const rows = raw.map(classify);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  return { enabled: setting?.value.startsWith('on:') ?? false, revision, total: rows.length,
    eligible: rows.filter(row => !row.reasons.length).length, pages, page,
    rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

export async function inspectLegacyMail(actor: Actor, page: number) {
  requireTrialAdmin(actor);
  return prisma.$transaction(tx => snapshot(tx, actor, page), { isolationLevel: 'RepeatableRead' });
}

export async function setLegacyMailRouting(actor: Actor, enabled: boolean, revision: string) {
  requireTrialAdmin(actor);
  return prisma.$transaction(async tx => {
    // Wait before taking the read-committed preview snapshot. An identical
    // concurrent request is a no-op, including after a lost HTTP response.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(19021, 4)`;
    const current = await snapshot(tx, actor, 1, true);
    if (enabled === current.enabled) return { enabled };
    if (revision !== current.revision) throw new ConflictError('Refresh the preview before applying this change.');
    const value = (enabled ? 'on:' : 'off:') + randomUUID();
    await tx.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
    return { enabled };
  });
}

/** Read identity rows only when the stored opt-in is active. One DB snapshot
 * supplies the normal notification switch and any trial routing decision. */
export function holderDeliveryQuery(personId: string) {
  return Prisma.sql`
    SELECT settings.enabled, (SELECT value FROM "AppSetting" WHERE key = ${OPERATIONAL_MAIL_KEY}) AS policy,
      CASE WHEN settings.enabled THEN (SELECT row_to_json(holder) FROM (${inventoryQuery(personId)}) AS holder) END AS holder
    FROM (SELECT EXISTS (SELECT 1 FROM "AppSetting" WHERE key = ${KEY} AND value LIKE 'on:%') AS enabled) AS settings`;
}

export async function readHolderDelivery(person: { id: string; email: string }) {
  if (!emailTrialEnabled()) return { email: person.email, policy: await getOperationalMailPolicy() };
  const [{ enabled, policy: rawPolicy, holder }] = await prisma.$queryRaw<{ enabled: boolean; policy: string | null; holder: RecordRow | null }[]>(holderDeliveryQuery(person.id));
  const policy = parseOperationalMailPolicy(rawPolicy ?? undefined);
  if (!enabled) return { email: person.email, policy };
  // A changed contact after event selection must not receive an old event.
  // Neither address is safe to select until the operation is evaluated anew.
  if (!holder || holder.contact !== person.email) return { email: null, policy };
  return { email: classify(holder).reasons.length ? person.email : holder.account, policy };
}
