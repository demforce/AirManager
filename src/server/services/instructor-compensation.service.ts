import type { Prisma } from '@/generated/prisma/client';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import type { RecordInstructorPayoutInput } from '@/lib/schemas/instructor-compensation';
import { APP_TIMEZONE } from '@/lib/time';
import { todayDateOnlyInZone, todayDateOnlyUtcInZone } from '@/lib/zoned-time';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { getOwnInstructorProfileId } from './bookings.service';
import { ConflictError, NotFoundError } from './errors';

/** The seeded cash category (`prisma/seed.ts`/`seed-demo.ts`) the payout's money twin is recorded under (story Billing-1, AC 4) — resolved BY NAME before the transaction opens, same "fails loudly by design" contract as `accounts.service.ts#recordTopUp`'s "Ricariche". */
const INSTRUCTOR_PAYOUT_CASH_CATEGORY_NAME = 'Compensi istruttori';

/**
 * Instructor compensation (epic 12, story 12.7) — payout RATE (what the
 * airfield pays the instructor per hour, `InstructorProfile.payoutRateCents`)
 * and the payout LEDGER (`InstructorPayout`), kept deliberately separate from
 * `instructor-rates.service.ts`'s `InstructorRate` (what the STUDENT is
 * charged, D8 — that one stays untouched by this story).
 *
 * `getCompensationSummary`'s flights query (SCHOOL, per
 * `instructorProfileId`, ONE batched groupBy) was deliberately
 * self-contained rather than shared with the pre-12.13 school area's own
 * equivalent groupBy — that area was removed in story 12.13, and this page
 * never depended on it.
 *
 * **The owed is the sum of what each flight froze (story 16.5, R-16-d)**:
 * `owed = Σ Flight.instructorPayoutCents (SCHOOL flights in the window) − Σ
 * payouts (by periodEnd in the window)`. Until this story it was
 * `round(Σ minutes / 60 × payoutRateCents) − paid`, with TODAY's rate on
 * every hour ever flown: one `setPayoutRate` rewrote the owed of hours
 * already paid, in both directions (ledger audit MAJOR-1). The owed is always
 * a number — a flight whose instructor had no rate froze `0` (R-16-k).
 *
 * **Archiving never hides money owed (story 16.5, P4 — same rule as
 * `accounts.service.ts#listNegativeBalances`)**: the summary is the active
 * instructors PLUS every instructor no longer active (person archived or
 * profile deactivated) whose owed is not zero, each row saying which
 * (`isActive`). Such an instructor can still be paid while their owed is
 * positive (R-16-i, `recordPayout`); their detail stays a 404 (Q-16.5-c).
 */

export type InstructorCompensationSummaryItem = {
  personId: string;
  firstName: string;
  lastName: string;
  payoutRateCents: number | null;
  mtdMinutes: number;
  ytdMinutes: number;
  totalMinutes: number;
  owedMtdCents: number;
  owedYtdCents: number;
  owedTotalCents: number;
  /** `false` when the person is archived OR the instructor profile is deactivated (story 16.5, P4) — such a row is in the summary only while its `owedTotalCents` is not zero. */
  isActive: boolean;
};

export type InstructorCompensationRecentFlight = {
  id: string;
  flightDate: string;
  personFirstName: string;
  personLastName: string;
  minutes: number;
};

export type InstructorCompensationRecentStudent = { personId: string; firstName: string; lastName: string };

export type InstructorCompensationDetail = InstructorCompensationSummaryItem & {
  recentFlights: InstructorCompensationRecentFlight[];
  recentStudents: InstructorCompensationRecentStudent[];
};

export type InstructorPayoutDto = {
  id: string;
  instructorProfileId: string;
  amountCents: number;
  periodStart: string;
  periodEnd: string;
  method: 'CASH' | 'BANK_TRANSFER' | 'POS';
  notes: string | null;
  actorUserId: string;
  createdAt: Date;
};

type InstructorRow = {
  personId: string;
  firstName: string;
  lastName: string;
  instructorProfileId: string;
  payoutRateCents: number | null;
  isActive: boolean;
};

/** `[from, to]` inclusive `@db.Date` bounds, or `null` for an unbounded ("total") variant. */
type VariantBounds = { from: Date; to: Date } | null;

/**
 * The three summary variants' Rome-calendar bounds (AC 2), derived from a
 * single "today" (`todayDateOnlyInZone`, PR #17 lesson: the Rome calendar
 * day, never the UTC one). `mtd`/`ytd` are `[monthStart/yearStart, today]`;
 * `total` is unbounded — flights can never be future-dated (enforced in
 * `flights.service.ts`) and a payout's `periodEnd` is always in the past or
 * present in practice, so "all of it" needs no upper bound either.
 */
function variantBounds(today: string): { mtd: VariantBounds; ytd: VariantBounds; total: VariantBounds } {
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  return {
    mtd: { from: parseDateOnlyUtc(monthStart), to: parseDateOnlyUtc(today) },
    ytd: { from: parseDateOnlyUtc(yearStart), to: parseDateOnlyUtc(today) },
    total: null,
  };
}

/** Every ACTIVE instructor (non-archived person, non-deactivated profile) — or just the one matching `personId`, when given. */
async function listActiveInstructors(personId?: string): Promise<InstructorRow[]> {
  const rows = await prisma.person.findMany({
    where: {
      archivedAt: null,
      instructorProfile: { deactivatedAt: null },
      ...(personId ? { id: personId } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      instructorProfile: { select: { id: true, payoutRateCents: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  return rows.map((row) => ({
    personId: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    instructorProfileId: row.instructorProfile!.id,
    payoutRateCents: row.instructorProfile!.payoutRateCents,
    isActive: true,
  }));
}

/** Every instructor NO LONGER active (person archived OR profile deactivated) — the platea story 16.5 (P4) adds to the summary, which keeps only those whose owed is not zero. */
async function listInactiveInstructors(): Promise<InstructorRow[]> {
  const rows = await prisma.person.findMany({
    where: {
      instructorProfile: { isNot: null },
      OR: [{ archivedAt: { not: null } }, { instructorProfile: { deactivatedAt: { not: null } } }],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      instructorProfile: { select: { id: true, payoutRateCents: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  return rows.map((row) => ({
    personId: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    instructorProfileId: row.instructorProfile!.id,
    payoutRateCents: row.instructorProfile!.payoutRateCents,
    isActive: false,
  }));
}

/**
 * SUM(minutes) and SUM(instructorPayoutCents) — the compensation each flight
 * froze (story 16.5) — of SCHOOL flights per instructor, no-charge flights
 * included (story 19.6, R-19-d: the compensation still accrues). ONE batched
 * groupBy (never N+1). A SCHOOL flight always has an instructor, so its
 * snapshot is never `null`; the `?? 0` only covers an empty sum. `db` is the
 * payout's `tx` under its lock (`assertStillOwedUnderLock`).
 */
async function sumSchoolFlightsByProfile(
  instructorProfileIds: string[],
  bounds: VariantBounds,
  db: Prisma.TransactionClient = prisma,
): Promise<Map<string, { minutes: number; accruedCents: number }>> {
  if (instructorProfileIds.length === 0) return new Map();
  const rows = await db.flight.groupBy({
    by: ['instructorProfileId'],
    where: {
      instructorProfileId: { in: instructorProfileIds },
      flightType: 'SCHOOL',
      ...(bounds ? { flightDate: { gte: bounds.from, lte: bounds.to } } : {}),
    },
    _sum: { minutes: true, instructorPayoutCents: true },
  });

  const map = new Map<string, { minutes: number; accruedCents: number }>();
  for (const row of rows) {
    if (row.instructorProfileId) map.set(row.instructorProfileId, { minutes: row._sum.minutes ?? 0, accruedCents: row._sum.instructorPayoutCents ?? 0 });
  }
  return map;
}

/**
 * SUM(amountCents) of payouts per instructor, attributed by `periodEnd`
 * falling in `bounds` (AC 2's binding attribution rule, index-backed by
 * `InstructorPayout`'s `@@index([instructorProfileId, periodEnd])`) — ONE
 * batched groupBy per variant. `db`: as `sumSchoolFlightsByProfile`.
 */
async function sumPayoutsByProfile(instructorProfileIds: string[], bounds: VariantBounds, db: Prisma.TransactionClient = prisma): Promise<Map<string, number>> {
  if (instructorProfileIds.length === 0) return new Map();
  const rows = await db.instructorPayout.groupBy({
    by: ['instructorProfileId'],
    where: {
      instructorProfileId: { in: instructorProfileIds },
      ...(bounds ? { periodEnd: { gte: bounds.from, lte: bounds.to } } : {}),
    },
    _sum: { amountCents: true },
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.instructorProfileId, row._sum.amountCents ?? 0);
  }
  return map;
}

/** A summary row plus the month's GROSS accrual, which only the self-service overview shows (`mtdGrossCents`). */
type ComputedRow = { item: InstructorCompensationSummaryItem; mtdAccruedCents: number };

/**
 * Computes the mtd/ytd/total minutes+owed rows for a given instructor platea
 * — 6 batched queries total, regardless of platea size. Shared by the
 * summary, the detail (single-instructor platea) and the self-service reads.
 * `owed = accrued − paid` per variant, both sums over the same window.
 */
async function computeSummaryRows(instructors: InstructorRow[]): Promise<ComputedRow[]> {
  const ids = instructors.map((instructor) => instructor.instructorProfileId);
  const today = todayDateOnlyInZone(APP_TIMEZONE);
  const bounds = variantBounds(today);

  const [mtdFlights, ytdFlights, totalFlights, mtdPaid, ytdPaid, totalPaid] = await Promise.all([
    sumSchoolFlightsByProfile(ids, bounds.mtd),
    sumSchoolFlightsByProfile(ids, bounds.ytd),
    sumSchoolFlightsByProfile(ids, bounds.total),
    sumPayoutsByProfile(ids, bounds.mtd),
    sumPayoutsByProfile(ids, bounds.ytd),
    sumPayoutsByProfile(ids, bounds.total),
  ]);

  const none = { minutes: 0, accruedCents: 0 };
  return instructors.map((instructor) => {
    const id = instructor.instructorProfileId;
    const mtd = mtdFlights.get(id) ?? none;
    const ytd = ytdFlights.get(id) ?? none;
    const total = totalFlights.get(id) ?? none;
    return {
      item: {
        personId: instructor.personId,
        firstName: instructor.firstName,
        lastName: instructor.lastName,
        payoutRateCents: instructor.payoutRateCents,
        mtdMinutes: mtd.minutes,
        ytdMinutes: ytd.minutes,
        totalMinutes: total.minutes,
        owedMtdCents: mtd.accruedCents - (mtdPaid.get(id) ?? 0),
        owedYtdCents: ytd.accruedCents - (ytdPaid.get(id) ?? 0),
        owedTotalCents: total.accruedCents - (totalPaid.get(id) ?? 0),
        isActive: instructor.isActive,
      },
      mtdAccruedCents: mtd.accruedCents,
    };
  });
}

/**
 * `GET /api/v1/instructor-compensation` (no `personId`) — the compensation
 * summary: every ACTIVE instructor, then every instructor no longer active
 * whose all-time owed is not zero (story 16.5, P4 — "dovuto ≠ 0" is a
 * COMPUTED property, so the filter runs after the math, on one batched
 * computation over both platee). `finance.manage` (ADMIN-only).
 */
export async function getCompensationSummary(actor: Actor): Promise<InstructorCompensationSummaryItem[]> {
  authorize(actor, 'finance.manage');
  const [active, inactive] = await Promise.all([listActiveInstructors(), listInactiveInstructors()]);
  if (active.length + inactive.length === 0) return [];
  const rows = await computeSummaryRows([...active, ...inactive]);
  return rows.map((row) => row.item).filter((item) => item.isActive || item.owedTotalCents !== 0);
}

/** The Overview instructor landing's own-scoped compensation KPIs (AC 5, ratifica 2) — a narrow projection of {@link InstructorCompensationSummaryItem}. */
export type OwnCompensationSummary = {
  payoutRateCents: number | null;
  mtdMinutes: number;
  owedMtdCents: number;
};

/**
 * `getOwnCompensationSummary` (epic 12, story 12.12, AC 5; ratifica utente 2,
 * 2026-07-18) — own-scoped instructor compensation reader for the
 * Overview's Instructor landing KPIs (Ore mese / Tariffa payout / Dovuto
 * mese). NO new permission: gated on `self.read` (every role, same
 * own-scoping convention as `me.service.ts`) plus the actor's OWN person
 * having an active `InstructorProfile` — an actor with no linked person, or
 * whose person has no active instructor profile, gets `null` (never a 403,
 * never fabricated data, Dev Notes: "profilo istruttore assente -> niente
 * KPI compensi, mai dati finti"). Reuses `listActiveInstructors`'s existing
 * single-`personId` filter and `computeSummaryRows`'s existing math
 * VERBATIM — the staff-facing `finance.manage`/`payouts.manage` reads
 * (`getCompensationSummary`/`getInstructorCompensationDetail`) are
 * UNCHANGED by this addition.
 */
export async function getOwnCompensationSummary(actor: Actor): Promise<OwnCompensationSummary | null> {
  authorize(actor, 'self.read');
  if (!actor.personId) return null;

  const instructors = await listActiveInstructors(actor.personId);
  if (instructors.length === 0) return null;

  const [row] = await computeSummaryRows(instructors);
  return { payoutRateCents: row!.item.payoutRateCents, mtdMinutes: row!.item.mtdMinutes, owedMtdCents: row!.item.owedMtdCents };
}

/** A single received payout, as the self-service "I miei compensi" page's history table shows it (story 14.7, AC 2). */
export type OwnPayoutHistoryItem = {
  id: string;
  amountCents: number;
  periodStart: string;
  periodEnd: string;
  method: 'CASH' | 'BANK_TRANSFER' | 'POS';
  createdAt: Date;
};

/** The self-service "I miei compensi" page's full read (story 14.7, AC 2). */
export type OwnCompensationOverview = {
  payoutRateCents: number | null;
  mtdMinutes: number;
  /** GROSS accrual this month ("Maturato nel mese" — ratifica PO, review F4): the sum of the month's flight snapshots (story 16.5), the very accrual `mtdOwedCents` nets — never `minutes × today's rate`. */
  mtdGrossCents: number;
  /** NET owed this month (accrual minus payouts already made this month, "Dovuto nel mese") — same number the staff-facing roster card already shows for this instructor. */
  mtdOwedCents: number;
  /** All-time residual owed ("saldo residuo dovuto", AC 2) — same `owedTotalCents` the staff roster row already computes. */
  totalOwedCents: number;
  /** Newest first — every individual payout ever recorded against this instructor, capped (AC 2 is a history view, not an export — same cap convention as the rate history, `instructor-rates.service.ts`). */
  payouts: OwnPayoutHistoryItem[];
};

/** History rows fetched for the self-service page (review F8) — a reasonable cap for a read-only recap, not a paginated/exportable ledger. */
const OWN_PAYOUT_HISTORY_LIMIT = 50;

/**
 * Resolves the person + payout rate behind an ACTIVE instructor profile id
 * (review F5/F7): the self-service read already knows its OWN
 * `instructorProfileId` (`getOwnInstructorProfileId`) and has no reason to
 * re-check `Person.archivedAt` — an instructor's payout history is about the
 * PROFILE, not the person's current archival/employment status, the same
 * convention `getInstructorCompensationDetail`'s `resolveActiveInstructorRow`
 * already follows (it does not check `archivedAt` either). This also removes
 * the `listActiveInstructors(actor.personId ?? undefined)` call this
 * function used to make — there is no longer an `undefined` fallback to
 * reason about.
 */
async function resolveInstructorRowByProfileId(instructorProfileId: string): Promise<InstructorRow | null> {
  const profile = await prisma.instructorProfile.findUnique({
    where: { id: instructorProfileId },
    select: { id: true, payoutRateCents: true, person: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!profile) return null;
  return {
    personId: profile.person.id,
    firstName: profile.person.firstName,
    lastName: profile.person.lastName,
    instructorProfileId: profile.id,
    payoutRateCents: profile.payoutRateCents,
    // Only ever reached for the actor's own ACTIVE profile (`getOwnInstructorProfileId`).
    isActive: true,
  };
}

/**
 * `getOwnCompensationOverview` (story 14.7, AC 2/3) — the self-service "I
 * miei compensi" page's single read: current-period accrual (`mtdMinutes`/
 * `mtdOwedCents`) plus the all-time residual (`totalOwedCents`), computed by
 * the SAME `computeSummaryRows` math the staff-facing `getCompensationSummary`
 * / `getOwnCompensationSummary` already use (AC 5: no new calculation), plus
 * the individual payout history. Gated on `self.read`; resolves the actor's
 * OWN instructor profile via `getOwnInstructorProfileId`
 * (`bookings.service.ts` — reused verbatim, the exact function the "Nuova
 * prenotazione" toggle and the Overview landing already rely on for the same
 * "actor's own ACTIVE profile, never a client-supplied id" contract): there
 * is no personId/instructorProfileId parameter on this function for a client
 * to override (AC 3 — IDOR impossible by construction, not by a check). A
 * deactivated/absent profile returns `null` (AC 4) — never a 403, never
 * fabricated data, same convention as `getOwnCompensationSummary`. The
 * staff-facing `getCompensationSummary`/`recordPayout` are UNTOUCHED by this
 * addition (AC 5).
 */
export async function getOwnCompensationOverview(actor: Actor): Promise<OwnCompensationOverview | null> {
  authorize(actor, 'self.read');
  const instructorProfileId = await getOwnInstructorProfileId(actor);
  if (!instructorProfileId) return null;

  const instructor = await resolveInstructorRowByProfileId(instructorProfileId);
  if (!instructor) return null;

  const [[row], payouts] = await Promise.all([
    computeSummaryRows([instructor]),
    prisma.instructorPayout.findMany({
      where: { instructorProfileId },
      orderBy: [{ createdAt: 'desc' }],
      take: OWN_PAYOUT_HISTORY_LIMIT,
      select: { id: true, amountCents: true, periodStart: true, periodEnd: true, method: true, createdAt: true },
    }),
  ]);

  return {
    payoutRateCents: row!.item.payoutRateCents,
    mtdMinutes: row!.item.mtdMinutes,
    mtdGrossCents: row!.mtdAccruedCents,
    mtdOwedCents: row!.item.owedMtdCents,
    totalOwedCents: row!.item.owedTotalCents,
    payouts: payouts.map((payout) => ({
      id: payout.id,
      amountCents: payout.amountCents,
      periodStart: toDateOnlyString(payout.periodStart),
      periodEnd: toDateOnlyString(payout.periodEnd),
      method: payout.method,
      createdAt: payout.createdAt,
    })),
  };
}

/** Resolves ONE active instructor by `Person.id` for the detail read (unknown person, archived person OR no/deactivated profile -> 404, no enumeration concern since `finance.manage` already sees every person). "Active" is the summary's own rule, so a row it flags `isActive: false` — archived OR deactivated — keeps this 404 (story 16.5, Q-16.5-c; review F1): it offers "Paga" only. */
async function resolveActiveInstructorRow(personId: string): Promise<InstructorRow> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      archivedAt: true,
      instructorProfile: { select: { id: true, payoutRateCents: true, deactivatedAt: true } },
    },
  });
  if (!person || person.archivedAt !== null || !person.instructorProfile || person.instructorProfile.deactivatedAt !== null) {
    throw new NotFoundError('Person not found or has no active instructor profile.');
  }
  return {
    personId: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    instructorProfileId: person.instructorProfile.id,
    payoutRateCents: person.instructorProfile.payoutRateCents,
    isActive: true,
  };
}

/**
 * `GET /api/v1/instructor-compensation?personId=` — the single-instructor
 * detail behind the profile slide-over (AC 3/7): the same summary row PLUS
 * the 5 most recent SCHOOL flights this instructor flew as CFI and the
 * distinct students among them (derived from the SAME 5 flights, never a
 * separate query — same as the prototype's own `[...new Set(...)]`).
 * `finance.manage` (ADMIN-only) — same permission as the summary; the
 * `personId` resolution keeps the door open for a future own-access variant
 * (Dev Notes) without any extra work now.
 */
export async function getInstructorCompensationDetail(actor: Actor, personId: string): Promise<InstructorCompensationDetail> {
  authorize(actor, 'finance.manage');

  const instructor = await resolveActiveInstructorRow(personId);
  const [row] = await computeSummaryRows([instructor]);

  const flights = await prisma.flight.findMany({
    where: { instructorProfileId: instructor.instructorProfileId, flightType: 'SCHOOL' },
    orderBy: [{ flightDate: 'desc' }, { id: 'desc' }],
    take: 5,
    select: { id: true, flightDate: true, minutes: true, personId: true, person: { select: { firstName: true, lastName: true } } },
  });

  const recentFlights: InstructorCompensationRecentFlight[] = flights.map((flight) => ({
    id: flight.id,
    flightDate: toDateOnlyString(flight.flightDate),
    personFirstName: flight.person.firstName,
    personLastName: flight.person.lastName,
    minutes: flight.minutes,
  }));

  const seenStudentIds = new Set<string>();
  const recentStudents: InstructorCompensationRecentStudent[] = [];
  for (const flight of flights) {
    if (seenStudentIds.has(flight.personId)) continue;
    seenStudentIds.add(flight.personId);
    recentStudents.push({ personId: flight.personId, firstName: flight.person.firstName, lastName: flight.person.lastName });
  }

  return { ...row!.item, recentFlights, recentStudents };
}

/** Resolves a `Person.id` to its `InstructorProfile` (unknown person -> 404; no/deactivated profile -> caller decides) — same shape as `instructor-rates.service.ts:75`'s `resolveInstructorProfile`, duplicated here (twin services, no cross-import) rather than imported. `personArchived`: "no longer active" = archived OR deactivated, the summary's own rule (story 16.5). */
async function resolveInstructorProfile(personId: string): Promise<{ id: string; deactivatedAt: Date | null; personArchived: boolean } | null> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { archivedAt: true, instructorProfile: { select: { id: true, deactivatedAt: true } } },
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }
  return person.instructorProfile ? { ...person.instructorProfile, personArchived: person.archivedAt !== null } : null;
}

/** Resolves to an ACTIVE instructor's profile id — person not archived, profile not deactivated (review 16.5 F1: the summary's rule) — or 409 (mirrors `createInstructorRate`'s "valid person, wrong state" choice — no enumeration concern since `people.read` actors already see the person). */
async function resolveActiveInstructorProfileId(personId: string): Promise<string> {
  const profile = await resolveInstructorProfile(personId);
  if (!profile || profile.deactivatedAt !== null || profile.personArchived) {
    throw new ConflictError('This person has no active instructor profile.');
  }
  return profile.id;
}

/**
 * The instructor a payout may go to (story 16.5, R-16-i): an active one
 * always — an advance on hours not flown yet stays allowed, as before — and
 * one NO LONGER active (person archived or profile deactivated) only while
 * their all-time owed is positive (`assertStillOwedUnderLock`). No profile at
 * all is the plain 409 as before.
 */
async function resolvePayee(personId: string): Promise<{ instructorProfileId: string; isActive: boolean }> {
  const profile = await resolveInstructorProfile(personId);
  if (!profile) {
    throw new ConflictError('This person has no instructor profile.');
  }
  return { instructorProfileId: profile.id, isActive: profile.deactivatedAt === null && !profile.personArchived };
}

/**
 * Story 16.5 (R-16-i): an instructor no longer active is paid only while
 * their all-time owed is positive — paying the work they did is the way out
 * of the summary's "non più attivi" section; otherwise 409
 * `INSTRUCTOR_NOTHING_OWED`. No cap on the amount (R-16-i only asks owed > 0).
 *
 * Decided UNDER A LOCK, inside the payout's own transaction (review 16.5 I-1,
 * PO 2026-11-04): read before it, two concurrent payouts both saw the same
 * owed and both passed, so the money went out twice. The `InstructorProfile`
 * row lock serializes the payouts of one instructor, and the owed is read
 * after it on `tx` — a fresh statement under READ COMMITTED sees the payout
 * the first transaction committed, so the second one answers 409. `FOR NO KEY
 * UPDATE`, not `FOR UPDATE`, as `bookings.service.ts#lockBookingPeople`: it
 * does not conflict with the `FOR KEY SHARE` of the foreign-key checks on the
 * profile (this payout's own insert, a flight's). Every read here goes
 * through `tx` (review 19.10 F2: never a second pool connection while one is
 * held).
 */
async function assertStillOwedUnderLock(tx: Prisma.TransactionClient, instructorProfileId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "InstructorProfile" WHERE "id" = ${instructorProfileId} FOR NO KEY UPDATE`;
  const flights = await sumSchoolFlightsByProfile([instructorProfileId], null, tx);
  const paid = await sumPayoutsByProfile([instructorProfileId], null, tx);
  const owedCents = (flights.get(instructorProfileId)?.accruedCents ?? 0) - (paid.get(instructorProfileId) ?? 0);
  if (owedCents <= 0) {
    throw new ConflictError('This instructor is no longer active and is owed nothing.', undefined, 'INSTRUCTOR_NOTHING_OWED');
  }
}

/**
 * `POST /api/v1/instructor-payouts` (AC 5; story Billing-1, AC 4) — records
 * a payout against the resolved instructor AND, in the SAME transaction, its
 * automatic money twin: a `CashMovement` under the seeded "Compensi
 * istruttori" category, `amountCents` NEGATIVE (an uscita — the airfield
 * paying the instructor), `paymentMethod` = `input.method`, `effectiveDate`
 * = today (server clock, Europe/Rome calendar — same "no explicit date
 * input, values as of today" convention as `recordAdjustment`/
 * `reverseCashMovement`), linked via `instructorPayoutId` for traceability
 * (same pattern as `accountMovementId`). Before this story, `recordPayout`
 * only ever wrote the `InstructorPayout` row — the payment never showed up
 * as a cost or a cash/bank outflow anywhere.
 *
 * The category is resolved BEFORE the transaction opens (fail-fast, same
 * "never silently create it" contract as `accounts.service.ts#recordTopUp`'s
 * "Ricariche" lookup) — a missing/inactive seed is an operational
 * misconfiguration, not a `DomainError` the caller can retry past.
 *
 * `amountCents > 0` and `periodStart <= periodEnd` are enforced at the Zod
 * boundary (`recordInstructorPayoutSchema`). Who may be paid: `resolvePayee`
 * and, for an instructor no longer active, `assertStillOwedUnderLock` as the
 * transaction's first statements (story 16.5, R-16-i). `payouts.manage` (ADMIN-only).
 */
export async function recordPayout(actor: Actor, input: RecordInstructorPayoutInput): Promise<InstructorPayoutDto> {
  authorize(actor, 'payouts.manage');

  const { instructorProfileId, isActive } = await resolvePayee(input.instructorPersonId);

  const category = await prisma.cashCategory.findUnique({
    where: { name: INSTRUCTOR_PAYOUT_CASH_CATEGORY_NAME, isActive: true },
    select: { id: true },
  });
  if (!category) {
    throw new Error(
      `Cash category "${INSTRUCTOR_PAYOUT_CASH_CATEGORY_NAME}" is missing or inactive — seed/reactivate it before recording a payout.`,
    );
  }

  const effectiveDate = todayDateOnlyUtcInZone(APP_TIMEZONE);

  const payout = await prisma.$transaction(async (tx) => {
    if (!isActive) await assertStillOwedUnderLock(tx, instructorProfileId);

    const created = await tx.instructorPayout.create({
      data: {
        instructorProfileId,
        amountCents: input.amountCents,
        periodStart: parseDateOnlyUtc(input.periodStart),
        periodEnd: parseDateOnlyUtc(input.periodEnd),
        method: input.method,
        notes: input.notes ?? null,
        actorUserId: actor.userId,
      },
    });

    await tx.cashMovement.create({
      data: {
        categoryId: category.id,
        amountCents: -input.amountCents,
        paymentMethod: input.method,
        description: `Compenso istruttore ${input.periodStart} – ${input.periodEnd}`,
        effectiveDate,
        actorUserId: actor.userId,
        instructorPayoutId: created.id,
      },
    });

    return created;
  });

  return {
    id: payout.id,
    instructorProfileId: payout.instructorProfileId,
    amountCents: payout.amountCents,
    periodStart: toDateOnlyString(payout.periodStart),
    periodEnd: toDateOnlyString(payout.periodEnd),
    method: payout.method,
    notes: payout.notes,
    actorUserId: payout.actorUserId,
    createdAt: payout.createdAt,
  };
}

/**
 * `PUT /api/v1/instructor-compensation/{personId}/rate` (AC 6) — sets or
 * clears (`null`) the instructor's hourly payout rate. `payouts.manage`
 * (ADMIN-only), same permission as `recordPayout` (ratified 2026-07-15:
 * symmetric to `createInstructorRate`'s `settings.manage`, just a different
 * permission). An ACTIVE instructor only — person not archived, profile not
 * deactivated (409 otherwise, review 16.5 F1) — unlike `recordPayout`, which
 * may also pay one no longer active (story 16.5). The new rate applies
 * from the next flights on: every registered flight keeps the rate it froze
 * (story 16.5, R-16-d), so this write moves no owed.
 */
export async function setPayoutRate(actor: Actor, personId: string, payoutRateCents: number | null): Promise<{ payoutRateCents: number | null }> {
  authorize(actor, 'payouts.manage');

  const instructorProfileId = await resolveActiveInstructorProfileId(personId);

  const updated = await prisma.instructorProfile.update({
    where: { id: instructorProfileId },
    data: { payoutRateCents },
    select: { payoutRateCents: true },
  });

  return { payoutRateCents: updated.payoutRateCents };
}
