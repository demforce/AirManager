import { Prisma, type ExpiryProposalStatus, type ExpiryScope, type ExpiryTypeKind } from '@/generated/prisma/client';
import { paginate, paginationOffset } from '@/lib/api/pagination';
import type { CurrencySettings } from '@/lib/currency';
import { parseDateOnlyUtc, toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import { computeExpiryStatus, daysUntilUtc, EXPIRY_WARNING_DAYS, type ExpiryStatus } from '@/lib/expiry-status';
import { evaluateMedicalRequirement, type MedicalRequirementFailure } from '@/lib/medical-requirement';
import type { ExpiryWindowDto, ListAllExpiriesQuery, RegisterExpiryInput, UpdateExpiryInput } from '@/lib/schemas/expiries';
import { APP_TIMEZONE } from '@/lib/time';
import { todayDateOnlyInZone } from '@/lib/zoned-time';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { getCurrencySettings } from './app-settings.service';
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
  /** The type's `kind` (story 19.7a, D-12) — how a reader tells a visit from a rating from the membership fee, never by name. */
  typeKind: ExpiryTypeKind;
  expiresAt: string;
  notes: string | null;
  status: ExpiryStatus;
  pendingProposal: PendingProposalSummary | null;
};

const EXPIRY_SELECT = {
  id: true,
  expiryTypeId: true,
  expiryType: { select: { name: true, scope: true, kind: true } },
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
  expiryType: { name: string; scope: ExpiryScope; kind: ExpiryTypeKind };
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
    typeKind: expiry.expiryType.kind,
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
 * profile is treated the same as "no profile", both fail the check. Exported
 * for the person composite (`people.service.ts#updatePerson`, story 19.4),
 * which runs it against the profiles as they are AFTER its own profile writes
 * and passes `details` naming the row (review 19.4 F2).
 */
export function assertScopeCompatible(scope: ExpiryScope, person: ScopeCheckPerson, details?: Record<string, unknown>): void {
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
      details,
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

  const updated = await prisma.$transaction(async (tx) => {
    if (input.expiresAt !== undefined) {
      await updateExpiryDateCore(tx, id, parseDateOnlyUtc(input.expiresAt), existing.expiresAt, actor.userId);
    }

    return tx.expiry.update({
      where: { id },
      data: {
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        actorUserId: actor.userId,
      },
      select: EXPIRY_SELECT,
    });
  });

  return toListItem(updated, todayDateOnlyUtc());
}

/**
 * Writes a scadenza's `expiresAt` — the ONE place of story 6.3's AD-9 rule
 * (see `updateExpiry`): when the date actually CHANGES value, its `SentAlert`
 * rows are wiped in the same transaction, so the renewed cycle re-earns its
 * alerts. Shared by `updateExpiry` and the person composite
 * (`people.service.ts#updatePerson`, story 19.4).
 */
export async function updateExpiryDateCore(
  tx: Prisma.TransactionClient,
  expiryId: string,
  nextExpiresAt: Date,
  previousExpiresAt: Date,
  actorUserId: string,
): Promise<void> {
  if (nextExpiresAt.getTime() !== previousExpiresAt.getTime()) {
    await tx.sentAlert.deleteMany({ where: { expiryId } });
  }
  await tx.expiry.update({ where: { id: expiryId }, data: { expiresAt: nextExpiresAt, actorUserId } });
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

/** The registry row's category (story 19.7b): the type's `kind` for a document, `CURRENCY` for the derived currency row. */
export type RegistryCategory = ExpiryTypeKind | 'CURRENCY';

export type ExpiryDashboardItem = {
  /** An `Expiry` id, or `currency:` + the person id for a derived currency row (no endpoint accepts it). */
  id: string;
  source: 'DOCUMENT' | 'DERIVED';
  /** The type's `kind` for a document (story 19.7a, D-12), `CURRENCY` for the currency row (19.7b). */
  category: RegistryCategory;
  personId: string;
  personFirstName: string;
  personLastName: string;
  /** `null` on the currency row, which has no type of its own. */
  expiryTypeId: string | null;
  typeName: string | null;
  typeScope: ExpiryScope | null;
  expiresAt: string;
  notes: string | null;
  status: ExpiryStatus;
  daysUntil: number;
  /** Only on the `CURRENCY` row. */
  currency: { lastFlightDate: string; flightsInWindow: number; minFlights: number; windowDays: number } | null;
};

export type ExpiryDashboardListResult = {
  items: ExpiryDashboardItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** Same private `MS_PER_DAY` copy as `expiry-alerts.service.ts` (story 6.3) — the day-BOUNDARY arithmetic itself (`computeExpiryStatus`/`daysUntilUtc`) stays the single shared implementation in `expiry-status.ts`; this is only a millisecond-per-day constant for building a `Date` threshold, not a second status algorithm. */
const MS_PER_DAY = 86_400_000;

/**
 * The UNIFIED Scadenze registry (story 19.7b, Q-19.7-a) as a CTE named
 * `"registryRows"` — one row per:
 *
 * - registered `Expiry` of a person NOT archived (`source = 'DOCUMENT'`,
 *   `category` = its type's `kind`; review 19.7b F1: an archived person
 *   leaves the registry whole, as the derived rows already did);
 * - currency SUBJECT (19.7a D-8: not archived, ACTIVE pilot or student
 *   profile) with at least X on-board flights ever: `category = 'CURRENCY'`,
 *   `expiresAt` = date of the X-th most recent one + Y days.
 *
 * Every row has a date. Nothing is derived for what is MISSING — a currency
 * never acquired, a membership fee never paid, a medical visit never
 * registered show no row at all (PO 2026-11-02, Q-19.7-b/c overturned); the
 * flight and booking checks (19.9/19.10) still fail on them.
 *
 * The currency here is the SQL TWIN of `@/lib/currency#computeCurrency`
 * (D-15): it has to live in SQL to be sorted, filtered and paginated together
 * with the documents. Same rule, written twice — change one, change both:
 * "on board" = `Flight.personId`, or the person behind the flight's instructor
 * profile when the flight is NOT a solo (a supervised solo is not on board,
 * review 19.7a F2), each flight once per person (the instructor seat skips a
 * flight whose pilot is that same person, so `UNION ALL` counts exactly what
 * the TS `UNION` counts — the service forbids it anyway,
 * `INSTRUCTOR_SAME_AS_PILOT`); only flights up to `today`; the window is
 * `[today − Y, today]`. The X-th date is picked per person from the
 * aggregated array — a hash aggregate plus a tiny per-person sort, measured
 * ~3× cheaper on the load DB than a global sort of every on-board row.
 *
 * Derived, never stored (CR §4.5): no cache, computed on every read.
 * `today` is a `YYYY-MM-DD` string cast `::date` in SQL (a bound JS `Date`
 * would be a `timestamptz` and could shift the day).
 */
function registryRowsSql(today: string, settings: CurrencySettings): Prisma.Sql {
  return Prisma.sql`
    WITH "currencySubjects" AS (
      SELECT p."id" FROM "Person" p
      WHERE p."archivedAt" IS NULL
        AND (EXISTS (SELECT 1 FROM "PilotProfile" pp WHERE pp."personId" = p."id" AND pp."deactivatedAt" IS NULL)
          OR EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."personId" = p."id" AND sp."deactivatedAt" IS NULL))
    ), "onBoard" AS (
      SELECT f."personId", f."flightDate" FROM "Flight" f WHERE f."flightDate" <= ${today}::date
      UNION ALL
      SELECT ip."personId", f."flightDate"
      FROM "Flight" f JOIN "InstructorProfile" ip ON ip."id" = f."instructorProfileId"
      WHERE f."isSolo" = false AND ip."personId" <> f."personId" AND f."flightDate" <= ${today}::date
    ), "currency" AS (
      SELECT ob."personId",
             (SELECT d FROM unnest(array_agg(ob."flightDate")) AS d ORDER BY d DESC OFFSET ${settings.minFlights}::int - 1 LIMIT 1) AS "xthFlightDate",
             MAX(ob."flightDate") AS "lastFlightDate",
             (COUNT(*) FILTER (WHERE ob."flightDate" >= ${today}::date - ${settings.windowDays}::int))::int AS "flightsInWindow"
      FROM "onBoard" ob
      GROUP BY ob."personId"
    ), "registryRows" AS (
      SELECT e."id", 'DOCUMENT' AS "source", t."kind"::text AS "category", e."personId", e."expiryTypeId", t."name" AS "typeName",
             t."scope"::text AS "typeScope", e."expiresAt", e."notes", NULL::date AS "lastFlightDate", NULL::int AS "flightsInWindow"
      FROM "Expiry" e JOIN "ExpiryType" t ON t."id" = e."expiryTypeId" JOIN "Person" pd ON pd."id" = e."personId"
      WHERE pd."archivedAt" IS NULL
      UNION ALL
      SELECT 'currency:' || s."id", 'DERIVED', 'CURRENCY', s."id", NULL, NULL, NULL,
             c."xthFlightDate" + ${settings.windowDays}::int, NULL, c."lastFlightDate", c."flightsInWindow"
      FROM "currencySubjects" s JOIN "currency" c ON c."personId" = s."id"
      WHERE c."xthFlightDate" IS NOT NULL
    )`;
}

/** `%`, `_` and `\` matched literally by `ILIKE … ESCAPE '\'` — the parity with Prisma's `contains`, which escaped them on its own. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * The `status` filter as an `expiresAt` predicate on the SAME `today` and
 * `EXPIRY_WARNING_DAYS` boundary `computeExpiryStatus` uses for the row's own
 * `status` field — by construction the two never disagree: `expired` is
 * `expiresAt < today`, `expiring` is `today <= expiresAt <= today +
 * EXPIRY_WARNING_DAYS` (inclusive both ends), `ok` beyond it.
 */
function statusSql(status: ExpiryStatus, today: string): Prisma.Sql {
  switch (status) {
    case 'expired':
      return Prisma.sql`r."expiresAt" < ${today}::date`;
    case 'expiring':
      return Prisma.sql`r."expiresAt" >= ${today}::date AND r."expiresAt" <= ${today}::date + ${EXPIRY_WARNING_DAYS}::int`;
    case 'ok':
      return Prisma.sql`r."expiresAt" > ${today}::date + ${EXPIRY_WARNING_DAYS}::int`;
  }
}

/**
 * The registry's "finestra" segmented filter (story 12.11, AC 3), the
 * prototype's own `inWindow` predicate (`ScadenzeView.jsx`): `'7'`/`'30'`/`'60'`
 * are `expiresAt <= today + N` with NO lower bound (an already-expired row
 * still matches), `'expired'` is `expiresAt < today`.
 * Deliberately separate from {@link statusSql} — a caller passes ONE of
 * `status`/`window`, never both (the Scadenze page only ever sends `window`).
 */
function windowSql(window: ExpiryWindowDto, today: string): Prisma.Sql {
  if (window === 'expired') {
    return Prisma.sql`r."expiresAt" < ${today}::date`;
  }
  const days = window === '7' ? 7 : window === '30' ? 30 : 60;
  return Prisma.sql`r."expiresAt" <= ${today}::date + ${days}::int`;
}

/** Every filter of {@link listAllExpiries}, AND-combined over `"registryRows" r JOIN "Person" p`. */
function registryWhereSql(query: ListAllExpiriesQuery, today: string): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (query.category) conditions.push(Prisma.sql`r."category" = ${query.category}`);
  if (query.expiryTypeId) conditions.push(Prisma.sql`r."expiryTypeId" = ${query.expiryTypeId}`);
  if (query.personId) conditions.push(Prisma.sql`r."personId" = ${query.personId}`);
  if (query.personQuery) {
    const pattern = `%${escapeLikePattern(query.personQuery)}%`;
    conditions.push(Prisma.sql`(p."firstName" ILIKE ${pattern} ESCAPE '\\' OR p."lastName" ILIKE ${pattern} ESCAPE '\\')`);
  }
  if (query.scope) conditions.push(Prisma.sql`r."typeScope" = ${query.scope}`);
  if (query.window) conditions.push(windowSql(query.window, today));
  else if (query.status) conditions.push(statusSql(query.status, today));
  return conditions.length === 0 ? Prisma.empty : Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}

type RegistryRow = {
  id: string;
  source: 'DOCUMENT' | 'DERIVED';
  category: RegistryCategory;
  personId: string;
  personFirstName: string;
  personLastName: string;
  expiryTypeId: string | null;
  typeName: string | null;
  typeScope: ExpiryScope | null;
  expiresAt: string;
  notes: string | null;
  /** `null` on a document row (the SQL selects it for the currency row only). */
  lastFlightDate: string | null;
  flightsInWindow: number | null;
};

function toRegistryItem(row: RegistryRow, today: Date, settings: CurrencySettings): ExpiryDashboardItem {
  const expiresAt = parseDateOnlyUtc(row.expiresAt);
  return {
    id: row.id,
    source: row.source,
    category: row.category,
    personId: row.personId,
    personFirstName: row.personFirstName,
    personLastName: row.personLastName,
    expiryTypeId: row.expiryTypeId,
    typeName: row.typeName,
    typeScope: row.typeScope,
    expiresAt: row.expiresAt,
    notes: row.notes,
    status: computeExpiryStatus(expiresAt, today),
    daysUntil: daysUntilUtc(expiresAt, today),
    currency:
      row.category === 'CURRENCY'
        ? { lastFlightDate: row.lastFlightDate!, flightsInWindow: row.flightsInWindow!, minFlights: settings.minFlights, windowDays: settings.windowDays }
        : null,
  };
}

/**
 * Lists the UNIFIED registry (story 19.7b) across every person, ordered by
 * urgency (AC 1) — the data behind `/dashboard/expiries`, the Panoramica's
 * widget and "Avvisi" feed, the exports and `GET /api/v1/expiries`.
 * `expiries.manage` only. Filters are AND-combinable (pattern `listFlights`,
 * story 5.4): `category` (19.7b); `expiryTypeId` (exact id — a filter, never
 * a lookup: an unknown id yields an empty page; rows without a type never
 * match); `personId`; `personQuery` (story 13.5, AC 9 — case-insensitive
 * substring of `firstName`/`lastName`, wildcards matched literally); `scope`
 * (the TYPE's ambito — rows without a type never match); `window` or `status`
 * (SQL predicates, never post-filtered in JS).
 *
 * Ordered `expiresAt, id` (story 6.4: most overdue first; `id` breaks ties for
 * a stable pagination). `total` comes from the SAME query (`COUNT(*) OVER ()`); only a
 * page past the end, which has no row to carry it, runs a count of its own.
 *
 * ONE "today" for every row (D-21): Rome's, as the currency's own (A16) — a
 * union with two "todays" would give two rows with the same date two
 * different `daysUntil` between 00:00 and 02:00. The currency settings (X, Y)
 * are read once per call.
 */
export async function listAllExpiries(actor: Actor, query: ListAllExpiriesQuery): Promise<ExpiryDashboardListResult> {
  authorize(actor, 'expiries.manage');

  const today = todayDateOnlyInZone(APP_TIMEZONE);
  const settings = await getCurrencySettings();
  const rowsSql = registryRowsSql(today, settings);
  const whereSql = registryWhereSql(query, today);
  const { skip, take } = paginationOffset(query);

  const rows = await prisma.$queryRaw<Array<RegistryRow & { total: number }>>`
    ${rowsSql}
    SELECT r."id", r."source", r."category", r."personId", p."firstName" AS "personFirstName", p."lastName" AS "personLastName",
           r."expiryTypeId", r."typeName", r."typeScope", to_char(r."expiresAt", 'YYYY-MM-DD') AS "expiresAt", r."notes",
           to_char(r."lastFlightDate", 'YYYY-MM-DD') AS "lastFlightDate", r."flightsInWindow", (COUNT(*) OVER ())::int AS "total"
    FROM "registryRows" r JOIN "Person" p ON p."id" = r."personId"
    ${whereSql}
    ORDER BY r."expiresAt", r."id"
    LIMIT ${take} OFFSET ${skip}`;

  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && skip > 0) {
    const [count] = await prisma.$queryRaw<Array<{ total: number }>>`
      ${rowsSql}
      SELECT (COUNT(*))::int AS "total" FROM "registryRows" r JOIN "Person" p ON p."id" = r."personId"
      ${whereSql}`;
    total = count?.total ?? 0;
  }

  const todayDate = parseDateOnlyUtc(today);
  return paginate(
    rows.map((row) => toRegistryItem(row, todayDate, settings)),
    total,
    query,
  );
}

export type ExpiryTierCounts = {
  expired: number;
  within7: number;
  within30: number;
  within60: number;
};

/**
 * The Scadenze registry's 4 stat-card counts (story 12.11, AC 3) — GLOBAL
 * counts across the WHOLE unified registry (story 19.7b, Q-19.7-a: documents
 * and currency rows alike), unaffected by the table's own
 * filters (mirrors the prototype's own `rows` vs `shown` split,
 * `ScadenzeView.jsx`: stat cards always count the FULL unfiltered set).
 * EXCLUSIVE bands (Contesto: `tierOf`, `ScadenzeView.jsx:12-20`) — `within30`
 * is "more than 7 but at most 30 days out", NOT cumulative with `within7`.
 * Same boundaries the alert job's
 * cadence markers use (60/30/7/0, `EXPIRY_ALERT_THRESHOLDS`) — ONE `COUNT …
 * FILTER` query over the registry, never a tally over a capped page. Same
 * Rome "today" and same once-per-call settings as {@link listAllExpiries}.
 */
export async function getExpiryTierCounts(actor: Actor): Promise<ExpiryTierCounts> {
  authorize(actor, 'expiries.manage');

  const today = todayDateOnlyInZone(APP_TIMEZONE);
  const settings = await getCurrencySettings();

  const [counts] = await prisma.$queryRaw<ExpiryTierCounts[]>`
    ${registryRowsSql(today, settings)}
    SELECT (COUNT(*) FILTER (WHERE r."expiresAt" < ${today}::date))::int AS "expired",
           (COUNT(*) FILTER (WHERE r."expiresAt" >= ${today}::date AND r."expiresAt" <= ${today}::date + 7))::int AS "within7",
           (COUNT(*) FILTER (WHERE r."expiresAt" > ${today}::date + 7 AND r."expiresAt" <= ${today}::date + 30))::int AS "within30",
           (COUNT(*) FILTER (WHERE r."expiresAt" > ${today}::date + 30 AND r."expiresAt" <= ${today}::date + 60))::int AS "within60"
    FROM "registryRows" r`;

  return counts ?? { expired: 0, within7: 0, within30: 0, within60: 0 };
}


/**
 * The medical requirement of ONE person at `dateOnly` (`YYYY-MM-DD`) — story
 * 19.7a, R-19-j, D-4: the names of the ACTIVE MEDICAL types plus every
 * MEDICAL row of the person, judged by the pure
 * `src/lib/medical-requirement.ts#evaluateMedicalRequirement`. `null` =
 * requirement off or satisfied; otherwise the ONE failing document (the most
 * recently expired visit, or a "missing" one with `expiresAt: null`).
 *
 * No actor, like `requirements.service.ts#evaluateRequirements`: it runs
 * inside the booking/flight scans for whoever the operation names. Exported
 * for those scans and for the checks of stories 19.9/19.10.
 */
export async function getMedicalRequirementFailure(personId: string, dateOnly: string): Promise<MedicalRequirementFailure | null> {
  const activeTypes = await prisma.expiryType.findMany({ where: { kind: 'MEDICAL', isActive: true }, select: { name: true } });
  // No active MEDICAL type: the requirement is off, whatever the person has.
  if (activeTypes.length === 0) return null;
  const medicals = await prisma.expiry.findMany({
    where: { personId, expiryType: { kind: 'MEDICAL' } },
    select: { expiresAt: true, expiryType: { select: { name: true } } },
  });
  return evaluateMedicalRequirement(
    {
      activeMedicalTypeNames: activeTypes.map((type) => type.name),
      medicals: medicals.map((medical) => ({ typeName: medical.expiryType.name, expiresAt: toDateOnlyString(medical.expiresAt) })),
    },
    dateOnly,
  );
}

/** One blocking document of one person, already reduced to whole days from "today" — the shape `pilotRowFlag` consumes. */
export type BlockingExpiryItem = { typeName: string; daysUntil: number };

/**
 * The BLOCKING documents of `personIds` that are already expired or due
 * within {@link BLOCKING_FLAG_HORIZON_DAYS} days — story 15.5, ratifica
 * R-15.5-c: the data behind the pilot row's flag chip. Blocking means a
 * RATING with `ExpiryType.blocksBooking` of an ACTIVE type (story 19.9, D-13:
 * a deactivated type no longer blocks — 16.4, R-16-c — so it no longer flags
 * either), plus — story 19.7a, D-13 — the
 * person's BEST medical visit (the latest `expiresAt`): one valid visit of any
 * class covers them (R-19-j), so an expired class 2 beside a valid class 1 is
 * no signal at all. The visits are therefore read WHOLE and reduced to the
 * best one BEFORE the horizon is applied — filtering first would drop the
 * valid visit and keep the expired one, a false "expired" chip.
 *
 * BATCHED over the ids of the current page (one query, `personId in (…)`),
 * same N+1-avoidance rationale as `listPilotsPageData`'s own five readers it
 * runs beside. Neither existing reader fitted: `listPersonExpiries` is for ONE
 * person and `listAllExpiries` is a globally paginated dashboard list gated on
 * `expiries.manage`.
 *
 * The horizon is the widest tier the chip can render (`tierOf` 0/1/2, i.e.
 * expired or <=30 days) — filtering it in SQL keeps the payload proportional to
 * what is actually shown, and `pilotRowFlag` re-applies the same boundaries on
 * the values, so the two can never disagree about "31 days".
 *
 * Gate: `people.read`, the SAME permission the Pilots page requires — this is
 * a column OF that list, and a helper whose gate is narrower than its page
 * would silently blank the chip for a future role instead of failing loudly.
 * People with no such document are ABSENT from the map (callers read `?? []`).
 */
const BLOCKING_FLAG_HORIZON_DAYS = 30;

export async function listBlockingExpiriesByPerson(actor: Actor, personIds: string[], today: Date): Promise<Map<string, BlockingExpiryItem[]>> {
  authorize(actor, 'people.read');

  if (personIds.length === 0) {
    return new Map();
  }

  const horizon = new Date(today.getTime() + BLOCKING_FLAG_HORIZON_DAYS * MS_PER_DAY);
  const ratingRows = await prisma.expiry.findMany({
    where: { personId: { in: personIds }, expiresAt: { lte: horizon }, expiryType: { kind: 'RATING', blocksBooking: true, isActive: true } },
    select: { personId: true, expiresAt: true, expiryType: { select: { name: true } } },
  });
  const medicalRows = await prisma.expiry.findMany({
    where: { personId: { in: personIds }, expiryType: { kind: 'MEDICAL' } },
    select: { personId: true, expiresAt: true, expiryType: { select: { name: true } } },
  });

  // A TOTAL order (review 19.7a F5): latest `expiresAt`, then the smaller type
  // name — unique per type, one row per (person, type) — so two visits expiring
  // the same day always yield the same chip, whatever order the rows come in.
  const bestMedicalByPerson = new Map<string, (typeof medicalRows)[number]>();
  for (const row of medicalRows) {
    const best = bestMedicalByPerson.get(row.personId);
    const later = best === undefined || row.expiresAt.getTime() > best.expiresAt.getTime();
    const tieWins = best !== undefined && row.expiresAt.getTime() === best.expiresAt.getTime() && row.expiryType.name < best.expiryType.name;
    if (later || tieWins) bestMedicalByPerson.set(row.personId, row);
  }
  const bestMedicalsInHorizon = [...bestMedicalByPerson.values()].filter((row) => row.expiresAt.getTime() <= horizon.getTime());

  const byPerson = new Map<string, BlockingExpiryItem[]>();
  for (const row of [...ratingRows, ...bestMedicalsInHorizon]) {
    const list = byPerson.get(row.personId) ?? [];
    list.push({ typeName: row.expiryType.name, daysUntil: daysUntilUtc(row.expiresAt, today) });
    byPerson.set(row.personId, list);
  }
  return byPerson;
}
