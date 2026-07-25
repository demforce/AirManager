import type { ExpiryProposalStatus, ExpiryScope } from '@/generated/prisma/client';
import { paginate, paginationOffset } from '@/lib/api/pagination';
import { parseDateOnlyUtc, toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import { computeExpiryStatus, daysUntilUtc, EXPIRY_WARNING_DAYS, type ExpiryStatus } from '@/lib/expiry-status';
import type { ExpiryWindowDto, ListAllExpiriesQuery, RegisterExpiryInput, UpdateExpiryInput } from '@/lib/schemas/expiries';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

/**
 * Person expiries with computed status (epic 6, story 6.2; FR-36) — builds
 * on the catalogue from story 6.1 (`ExpiryType`). See `Expiry`'s Prisma
 * doc-comment for the full domain rationale (one current row per
 * person+type, status NEVER persisted). Story 12.13 (ratifica utente 4b)
 * retired the titolare-facing update-proposal queue this module used to
 * also own (`ExpiryUpdateProposal` stays in the schema, dormant, §9 — no
 * destructive migration) — `pendingProposal` on `ExpiryListItem` below is a
 * READ-ONLY leftover: any row a pre-cutover proposal left `PENDING` still
 * shows on the scheda persona's `ExpiriesPanel`, it just can no longer be
 * filed or decided through this app.
 */

/** Prisma unique-constraint violation (same pattern as every other service). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/**
 * Prisma "record not found" on write (story TD-1, AC 1) — the loser of a
 * concurrent double-DELETE race: both requests pass the `findUnique`
 * pre-check (the row still exists at that instant), one wins the `DELETE`,
 * and the other's `DELETE` then hits a row that is already gone. Maps to the
 * SAME 404 the pre-check itself would have produced, never a raw 500.
 */
function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2025';
}

// --- Person expiries (AC 1) --------------------------------------------------

export type PendingProposalSummary = {
  id: string;
  proposedIssuedAt: string;
  proposedExpiresAt: string;
  proposedNotes: string | null;
  createdAt: Date;
};

export type ExpiryListItem = {
  id: string;
  expiryTypeId: string;
  typeName: string;
  typeScope: ExpiryScope;
  expiresAt: string;
  notes: string | null;
  status: ExpiryStatus;
  pendingProposal: PendingProposalSummary | null;
};

const EXPIRY_SELECT = {
  id: true,
  expiryTypeId: true,
  expiryType: { select: { name: true, scope: true } },
  expiresAt: true,
  notes: true,
  proposals: {
    where: { status: 'PENDING' as ExpiryProposalStatus },
    select: { id: true, proposedIssuedAt: true, proposedExpiresAt: true, proposedNotes: true, createdAt: true },
    // At most one PENDING proposal per expiry (the hand-appended partial
    // unique index) — `take: 1` is a defensive cap, not a real limit.
    take: 1,
  },
} as const;

type SelectedExpiry = {
  id: string;
  expiryTypeId: string;
  expiryType: { name: string; scope: ExpiryScope };
  expiresAt: Date;
  notes: string | null;
  proposals: Array<{ id: string; proposedIssuedAt: Date; proposedExpiresAt: Date; proposedNotes: string | null; createdAt: Date }>;
};

function toListItem(expiry: SelectedExpiry, today: Date): ExpiryListItem {
  const pending = expiry.proposals[0];

  return {
    id: expiry.id,
    expiryTypeId: expiry.expiryTypeId,
    typeName: expiry.expiryType.name,
    typeScope: expiry.expiryType.scope,
    expiresAt: toDateOnlyString(expiry.expiresAt),
    notes: expiry.notes,
    status: computeExpiryStatus(expiry.expiresAt, today),
    pendingProposal: pending
      ? {
          id: pending.id,
          proposedIssuedAt: toDateOnlyString(pending.proposedIssuedAt),
          proposedExpiresAt: toDateOnlyString(pending.proposedExpiresAt),
          proposedNotes: pending.proposedNotes,
          createdAt: pending.createdAt,
        }
      : null,
  };
}

/**
 * Lists a person's scadenze (AC 1/2). Access: `expiries.manage` (any
 * person) OR own-access (`self.read` AND `actor.personId === personId`,
 * checked BEFORE any query — pattern from `flights.service.ts#listFlights`,
 * story 5.4). 404 on an unknown person is only meaningful for the
 * `expiries.manage` path — an own-access actor's person is themselves by
 * definition, so there is nothing further to look up. Ordered by
 * `expiresAt asc` (soonest-expiring first) and defensively capped at
 * `take: 200`.
 */
export async function listPersonExpiries(actor: Actor, personId: string): Promise<ExpiryListItem[]> {
  const canManage = hasPermission(actor, 'expiries.manage');
  const isOwnAccess = hasPermission(actor, 'self.read') && actor.personId === personId;
  if (!canManage && !isOwnAccess) {
    throw new ForbiddenError('Actor may not read this person\'s expiries.');
  }

  if (canManage) {
    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
    if (!person) {
      throw new NotFoundError('Person not found.');
    }
  }

  const today = todayDateOnlyUtc();

  const expiries = await prisma.expiry.findMany({
    where: { personId },
    select: EXPIRY_SELECT,
    orderBy: { expiresAt: 'asc' },
    take: 200,
  });

  return expiries.map((expiry) => toListItem(expiry, today));
}

type ScopeCheckPerson = {
  pilotProfile: { deactivatedAt: Date | null } | null;
  studentProfile: { deactivatedAt: Date | null } | null;
  instructorProfile: { deactivatedAt: Date | null } | null;
};

/**
 * Registration-time ambito↔person compatibility check (AC 1; `ExpiryType`'s
 * doc-comment names this story as its owner). `ALL` matches everyone; every
 * other scope requires the corresponding profile to exist AND be currently
 * ACTIVE (`deactivatedAt === null`) — a deactivated or never-activated
 * profile is treated the same as "no profile", both fail the check.
 */
function assertScopeCompatible(scope: ExpiryScope, person: ScopeCheckPerson): void {
  if (scope === 'ALL') {
    return;
  }

  const isCompatible =
    (scope === 'PILOTS' && person.pilotProfile !== null && person.pilotProfile.deactivatedAt === null) ||
    (scope === 'STUDENTS' && person.studentProfile !== null && person.studentProfile.deactivatedAt === null) ||
    (scope === 'INSTRUCTORS' && person.instructorProfile !== null && person.instructorProfile.deactivatedAt === null);

  if (!isCompatible) {
    throw new ValidationError(
      "This expiry type's scope does not match any of the person's active profiles.",
      undefined,
      'SCOPE_MISMATCH',
    );
  }
}

/**
 * Registers a new scadenza (AC 1). `expiries.manage` only. Verification
 * order (404-before-409-before-422, no state leak — the lesson from every
 * prior epic): person exists -> archived -> type exists -> type deactivated
 * -> scope compatibility -> duplicate (person, type). The duplicate check is
 * pre-check + `P2002` backstop (the check-then-write race, same pattern as
 * every other unique constraint in this codebase) — `@@unique([personId,
 * expiryTypeId])` is the DB-level guarantee this backstops.
 */
export async function registerExpiry(actor: Actor, input: RegisterExpiryInput): Promise<ExpiryListItem> {
  authorize(actor, 'expiries.manage');

  const person = await prisma.person.findUnique({
    where: { id: input.personId },
    select: {
      id: true,
      archivedAt: true,
      pilotProfile: { select: { deactivatedAt: true } },
      studentProfile: { select: { deactivatedAt: true } },
      instructorProfile: { select: { deactivatedAt: true } },
    },
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }
  if (person.archivedAt !== null) {
    throw new ConflictError('This person is archived.');
  }

  const expiryType = await prisma.expiryType.findUnique({
    where: { id: input.expiryTypeId },
    select: { id: true, scope: true, isActive: true },
  });
  if (!expiryType) {
    throw new NotFoundError('Expiry type not found.');
  }
  if (!expiryType.isActive) {
    throw new ConflictError('This expiry type is deactivated.');
  }

  assertScopeCompatible(expiryType.scope, person);

  const existing = await prisma.expiry.findUnique({
    where: { personId_expiryTypeId: { personId: input.personId, expiryTypeId: input.expiryTypeId } },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('An expiry of this type is already registered for this person — update it instead.');
  }

  try {
    const created = await prisma.expiry.create({
      data: {
        personId: input.personId,
        expiryTypeId: input.expiryTypeId,
        expiresAt: parseDateOnlyUtc(input.expiresAt),
        notes: input.notes ?? null,
        actorUserId: actor.userId,
      },
      select: EXPIRY_SELECT,
    });
    return toListItem(created, todayDateOnlyUtc());
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('An expiry of this type is already registered for this person — update it instead.');
    }
    throw error;
  }
}

/**
 * Partially updates a scadenza (AC 1). `expiries.manage` only. `personId`/
 * `expiryTypeId` are NOT patchable (Contesto: a wrong type/person is
 * corrected by delete + re-register). A PENDING proposal already filed
 * against this scadenza is left untouched — staff will see it in the queue
 * alongside the freshly updated current values (doc-comment, not a guard:
 * there is no conflict to prevent here). There used to be a cross-field
 * `expiresAt >= issuedAt` check here (story 6.2); story 13.1's review (R6,
 * PO ratifica 2026-07-23) dropped `issuedAt` entirely — see `Expiry`'s
 * Prisma doc-comment.
 *
 * Story 6.3 (AD-9): when `expiresAt` actually CHANGES value (a renewal),
 * this scadenza's `SentAlert` rows are wiped in the SAME transaction as the
 * write — otherwise the `(expiryId, threshold)` unique constraint would
 * permanently block the new cycle's alerts. Patching only `notes` (or
 * re-submitting the SAME `expiresAt`) leaves `SentAlert` untouched.
 */
export async function updateExpiry(actor: Actor, id: string, input: UpdateExpiryInput): Promise<ExpiryListItem> {
  authorize(actor, 'expiries.manage');

  const existing = await prisma.expiry.findUnique({ where: { id }, select: { id: true, expiresAt: true } });
  if (!existing) {
    throw new NotFoundError('Expiry not found.');
  }

  const nextExpiresAt = input.expiresAt !== undefined ? parseDateOnlyUtc(input.expiresAt) : existing.expiresAt;
  const expiresAtChanged = nextExpiresAt.getTime() !== existing.expiresAt.getTime();

  const updated = await prisma.$transaction(async (tx) => {
    if (expiresAtChanged) {
      await tx.sentAlert.deleteMany({ where: { expiryId: id } });
    }

    return tx.expiry.update({
      where: { id },
      data: {
        ...(input.expiresAt !== undefined ? { expiresAt: nextExpiresAt } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        actorUserId: actor.userId,
      },
      select: EXPIRY_SELECT,
    });
  });

  return toListItem(updated, todayDateOnlyUtc());
}

/**
 * Deletes a scadenza — a staff correction tool (wrong type/person), AC 1.
 * `expiries.manage` only. 404 on an unknown id; the delete cascades to any
 * `ExpiryUpdateProposal` rows (pending included, `onDelete: Cascade`) — no
 * FK `RESTRICT` points at `Expiry`, so the only concurrency backstop needed
 * (story TD-1, AC 1) is the P2025 race of a concurrent double-DELETE.
 */
export async function deleteExpiry(actor: Actor, id: string): Promise<void> {
  authorize(actor, 'expiries.manage');

  const existing = await prisma.expiry.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new NotFoundError('Expiry not found.');
  }

  try {
    await prisma.expiry.delete({ where: { id } });
  } catch (error) {
    if (isRecordNotFound(error)) {
      // Concurrent double-DELETE race (TD-1, AC 1): the other request won.
      throw new NotFoundError('Expiry not found.');
    }
    throw error;
  }
}

// --- Expiry dashboard (story 6.4, AC 1; FR-38) -------------------------------

export type ExpiryDashboardItem = {
  id: string;
  personId: string;
  personFirstName: string;
  personLastName: string;
  expiryTypeId: string;
  typeName: string;
  typeScope: ExpiryScope;
  expiresAt: string;
  notes: string | null;
  status: ExpiryStatus;
  daysUntil: number;
};

export type ExpiryDashboardListResult = {
  items: ExpiryDashboardItem[];
  total: number;
  page: number;
  pageSize: number;
};

const DASHBOARD_SELECT = {
  id: true,
  personId: true,
  person: { select: { firstName: true, lastName: true } },
  expiryTypeId: true,
  expiryType: { select: { name: true, scope: true } },
  expiresAt: true,
  notes: true,
} as const;

type SelectedDashboardExpiry = {
  id: string;
  personId: string;
  person: { firstName: string; lastName: string };
  expiryTypeId: string;
  expiryType: { name: string; scope: ExpiryScope };
  expiresAt: Date;
  notes: string | null;
};

function toDashboardItem(expiry: SelectedDashboardExpiry, today: Date): ExpiryDashboardItem {
  return {
    id: expiry.id,
    personId: expiry.personId,
    personFirstName: expiry.person.firstName,
    personLastName: expiry.person.lastName,
    expiryTypeId: expiry.expiryTypeId,
    typeName: expiry.expiryType.name,
    typeScope: expiry.expiryType.scope,
    expiresAt: toDateOnlyString(expiry.expiresAt),
    notes: expiry.notes,
    status: computeExpiryStatus(expiry.expiresAt, today),
    daysUntil: daysUntilUtc(expiry.expiresAt, today),
  };
}

/** Same private `MS_PER_DAY` copy as `expiry-alerts.service.ts` (story 6.3) — the day-BOUNDARY arithmetic itself (`computeExpiryStatus`/`daysUntilUtc`) stays the single shared implementation in `expiry-status.ts`; this is only a millisecond-per-day constant for building a `Date` threshold, not a second status algorithm. */
const MS_PER_DAY = 86_400_000;

/**
 * Maps the `status` filter to an `expiresAt` date range (Contesto: NEVER
 * post-filtered in JS). Uses the SAME `today` `listAllExpiries` already
 * computed once for this request, and the SAME `EXPIRY_WARNING_DAYS` window
 * `computeExpiryStatus` uses for the per-row `status` field below — by
 * construction the SQL range and the computed status can never disagree:
 * `expired` is `expiresAt < today` (strictly before, mirrors
 * `computeExpiryStatus`'s `daysRemaining < 0`); `expiring` is `today <=
 * expiresAt <= today + EXPIRY_WARNING_DAYS` (inclusive both ends, mirrors
 * `daysRemaining <= EXPIRY_WARNING_DAYS`); `ok` is everything beyond that
 * horizon. The boundary unit tests prove this: a scadenza at exactly
 * `today + EXPIRY_WARNING_DAYS` lands in `expiring` for both the query and
 * `computeExpiryStatus`; at `+1` day beyond that, both agree on `ok`.
 */
function expiresAtRangeForStatus(status: ExpiryStatus, today: Date): { lt: Date } | { gte: Date; lte: Date } | { gt: Date } {
  const horizon = new Date(today.getTime() + EXPIRY_WARNING_DAYS * MS_PER_DAY);
  if (status === 'expired') {
    return { lt: today };
  }
  if (status === 'expiring') {
    return { gte: today, lte: horizon };
  }
  return { gt: horizon };
}

/**
 * Maps the registry's "finestra" segmented filter (story 12.11, AC 3) to an
 * `expiresAt` range — mirrors the prototype's own `inWindow` predicate
 * (`ScadenzeView.jsx`): `'7'`/`'30'`/`'60'` are `expiresAt <= today + N`
 * with NO lower bound (an already-expired row still matches, exactly like
 * the prototype's `d<=N`); `'expired'` is `expiresAt < today`. Deliberately
 * a SEPARATE mapping from {@link expiresAtRangeForStatus} (3-band
 * ok/expiring/expired) — a caller passes ONE of `status`/`window`, never
 * both (the new Scadenze page only ever sends `window`).
 */
function expiresAtRangeForWindow(window: ExpiryWindowDto, today: Date): { lt: Date } | { lte: Date } {
  if (window === 'expired') {
    return { lt: today };
  }
  const days = window === '7' ? 7 : window === '30' ? 30 : 60;
  return { lte: new Date(today.getTime() + days * MS_PER_DAY) };
}

/**
 * Lists EVERY scadenza across every person, ordered by urgency (AC 1) — the
 * data behind the staff `/dashboard/expiries` "Tutte le scadenze" table.
 * `expiries.manage` only. Filters are AND-combinable (pattern `listFlights`,
 * story 5.4): `expiryTypeId` (exact id — a filter, never a lookup: an id
 * that does not exist simply yields an empty page, not a 404); `scope` (the
 * TYPE's ambito, via the `expiryType` relation — NOT the `Expiry` itself,
 * which has no scope of its own); `status` (mapped to an `expiresAt` date
 * range by `expiresAtRangeForStatus` above, never post-filtered in JS);
 * `personQuery` (story 13.5, AC 9) — a case-insensitive substring match on
 * the person's `firstName`/`lastName`, the registry's free-text pilot
 * filter (replacing its old `SearchCombobox` picker), AND-combined with
 * `personId`. Ordered `expiresAt asc, id asc` — the scadute sort first by construction
 * (the most urgent items are the smallest/most-negative `expiresAt`), `id`
 * only breaks ties for stable pagination across identical dates. `total`
 * reflects the SAME filtered `where` (AD-8 paginated envelope, pattern
 * `listCashMovements`/`listExpiryProposals`).
 */
export async function listAllExpiries(actor: Actor, query: ListAllExpiriesQuery): Promise<ExpiryDashboardListResult> {
  authorize(actor, 'expiries.manage');

  const today = todayDateOnlyUtc();

  const where = {
    ...(query.expiryTypeId ? { expiryTypeId: query.expiryTypeId } : {}),
    ...(query.personId ? { personId: query.personId } : {}),
    ...(query.personQuery
      ? {
          person: {
            OR: [
              { firstName: { contains: query.personQuery, mode: 'insensitive' as const } },
              { lastName: { contains: query.personQuery, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
    ...(query.scope ? { expiryType: { scope: query.scope } } : {}),
    ...(query.window
      ? { expiresAt: expiresAtRangeForWindow(query.window, today) }
      : query.status
        ? { expiresAt: expiresAtRangeForStatus(query.status, today) }
        : {}),
  };

  // Interactive transaction (story TD-1, AC 3) — see
  // `people.service.ts#listPeople`'s doc-comment for the batch-vs-interactive
  // `pg` DeprecationWarning rationale.
  const [items, total] = await prisma.$transaction(async (tx) => {
    const items = await tx.expiry.findMany({
      select: DASHBOARD_SELECT,
      where,
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      ...paginationOffset(query),
    });
    const total = await tx.expiry.count({ where });
    return [items, total] as const;
  });

  return paginate(items.map((item) => toDashboardItem(item, today)), total, query);
}

export type ExpiryTierCounts = {
  expired: number;
  within7: number;
  within30: number;
  within60: number;
};

/**
 * The Scadenze registry's 4 stat-card counts (story 12.11, AC 3) — GLOBAL
 * counts across every scadenza, unaffected by the table's own tipo/pilota/
 * finestra filters (mirrors the prototype's own `rows` vs `shown` split,
 * `ScadenzeView.jsx`: stat cards always count the FULL unfiltered set).
 * EXCLUSIVE bands (Contesto: `tierOf`, `ScadenzeView.jsx:12-20`) — `within30`
 * is "more than 7 but at most 30 days out", NOT cumulative with `within7`
 * (mirrors the prototype's own `d>7&&d<=30`, `d>30&&d<=60`) — the 4 numbers
 * sum to the total scadenze count. Same boundaries the alert job's cadence
 * markers use (60/30/7/0, `EXPIRY_ALERT_THRESHOLDS`) — 4 plain `COUNT`
 * queries rather than fetching every row into memory (correct regardless of
 * how many scadenze exist, unlike a client-side tally over a capped page).
 */
export async function getExpiryTierCounts(actor: Actor): Promise<ExpiryTierCounts> {
  authorize(actor, 'expiries.manage');

  const today = todayDateOnlyUtc();
  const plus = (days: number) => new Date(today.getTime() + days * MS_PER_DAY);

  const [expired, within7, within30, within60] = await Promise.all([
    prisma.expiry.count({ where: { expiresAt: { lt: today } } }),
    prisma.expiry.count({ where: { expiresAt: { gte: today, lte: plus(7) } } }),
    prisma.expiry.count({ where: { expiresAt: { gt: plus(7), lte: plus(30) } } }),
    prisma.expiry.count({ where: { expiresAt: { gt: plus(30), lte: plus(60) } } }),
  ]);

  return { expired, within7, within30, within60 };
}

