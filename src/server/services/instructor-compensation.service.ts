import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import type { RecordInstructorPayoutInput } from '@/lib/schemas/instructor-compensation';
import { APP_TIMEZONE } from '@/lib/time';
import { todayDateOnlyInZone } from '@/lib/zoned-time';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
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
 * `getCompensationSummary`'s minutes query (SCHOOL, non-CANCELLED, per
 * `instructorProfileId`, ONE batched groupBy) was deliberately
 * self-contained rather than shared with the pre-12.13 school area's own
 * equivalent groupBy — that area was removed in story 12.13, and this page
 * never depended on it.
 */

export type InstructorCompensationSummaryItem = {
  personId: string;
  firstName: string;
  lastName: string;
  payoutRateCents: number | null;
  mtdMinutes: number;
  ytdMinutes: number;
  totalMinutes: number;
  owedMtdCents: number | null;
  owedYtdCents: number | null;
  owedTotalCents: number | null;
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
  }));
}

/** SUM(minutes) of non-cancelled SCHOOL flights per instructor, ONE batched groupBy (never N+1). */
async function sumMinutesByProfile(instructorProfileIds: string[], bounds: VariantBounds): Promise<Map<string, number>> {
  if (instructorProfileIds.length === 0) return new Map();
  const rows = await prisma.flight.groupBy({
    by: ['instructorProfileId'],
    where: {
      instructorProfileId: { in: instructorProfileIds },
      flightType: 'SCHOOL',
      status: { not: 'CANCELLED' },
      ...(bounds ? { flightDate: { gte: bounds.from, lte: bounds.to } } : {}),
    },
    _sum: { minutes: true },
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.instructorProfileId) map.set(row.instructorProfileId, row._sum.minutes ?? 0);
  }
  return map;
}

/**
 * SUM(amountCents) of payouts per instructor, attributed by `periodEnd`
 * falling in `bounds` (AC 2's binding attribution rule, index-backed by
 * `InstructorPayout`'s `@@index([instructorProfileId, periodEnd])`) — ONE
 * batched groupBy per variant.
 */
async function sumPayoutsByProfile(instructorProfileIds: string[], bounds: VariantBounds): Promise<Map<string, number>> {
  if (instructorProfileIds.length === 0) return new Map();
  const rows = await prisma.instructorPayout.groupBy({
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

/** `owed = round(minutes/60 * payoutRateCents) - paidCents`, or `null` when there is no rate to owe against (AC 2). */
function computeOwed(minutes: number, payoutRateCents: number | null, paidCents: number): number | null {
  if (payoutRateCents === null) return null;
  const gross = Math.round((minutes / 60) * payoutRateCents);
  return gross - paidCents;
}

/** Computes the mtd/ytd/total minutes+owed rows for a given instructor platea — 6 batched queries total, regardless of platea size. Shared by the summary and the detail (single-instructor platea). */
async function computeSummaryRows(instructors: InstructorRow[]): Promise<InstructorCompensationSummaryItem[]> {
  const ids = instructors.map((instructor) => instructor.instructorProfileId);
  const today = todayDateOnlyInZone(APP_TIMEZONE);
  const bounds = variantBounds(today);

  const [mtdMinutes, ytdMinutes, totalMinutes, mtdPaid, ytdPaid, totalPaid] = await Promise.all([
    sumMinutesByProfile(ids, bounds.mtd),
    sumMinutesByProfile(ids, bounds.ytd),
    sumMinutesByProfile(ids, bounds.total),
    sumPayoutsByProfile(ids, bounds.mtd),
    sumPayoutsByProfile(ids, bounds.ytd),
    sumPayoutsByProfile(ids, bounds.total),
  ]);

  return instructors.map((instructor) => {
    const mtd = mtdMinutes.get(instructor.instructorProfileId) ?? 0;
    const ytd = ytdMinutes.get(instructor.instructorProfileId) ?? 0;
    const total = totalMinutes.get(instructor.instructorProfileId) ?? 0;
    return {
      personId: instructor.personId,
      firstName: instructor.firstName,
      lastName: instructor.lastName,
      payoutRateCents: instructor.payoutRateCents,
      mtdMinutes: mtd,
      ytdMinutes: ytd,
      totalMinutes: total,
      owedMtdCents: computeOwed(mtd, instructor.payoutRateCents, mtdPaid.get(instructor.instructorProfileId) ?? 0),
      owedYtdCents: computeOwed(ytd, instructor.payoutRateCents, ytdPaid.get(instructor.instructorProfileId) ?? 0),
      owedTotalCents: computeOwed(total, instructor.payoutRateCents, totalPaid.get(instructor.instructorProfileId) ?? 0),
    };
  });
}

/** `GET /api/v1/instructor-compensation` (no `personId`) — the full roster's compensation summary. `finance.manage` (staff+admin). */
export async function getCompensationSummary(actor: Actor): Promise<InstructorCompensationSummaryItem[]> {
  authorize(actor, 'finance.manage');
  const instructors = await listActiveInstructors();
  if (instructors.length === 0) return [];
  return computeSummaryRows(instructors);
}

/** The Overview instructor landing's own-scoped compensation KPIs (AC 5, ratifica 2) — a narrow projection of {@link InstructorCompensationSummaryItem}. */
export type OwnCompensationSummary = {
  payoutRateCents: number | null;
  mtdMinutes: number;
  owedMtdCents: number | null;
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
  return { payoutRateCents: row!.payoutRateCents, mtdMinutes: row!.mtdMinutes, owedMtdCents: row!.owedMtdCents };
}

/** Resolves ONE active instructor by `Person.id` for the detail read (unknown person OR no/deactivated profile -> 404, no enumeration concern since `finance.manage` already sees every person). */
async function resolveActiveInstructorRow(personId: string): Promise<InstructorRow> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      instructorProfile: { select: { id: true, payoutRateCents: true, deactivatedAt: true } },
    },
  });
  if (!person || !person.instructorProfile || person.instructorProfile.deactivatedAt !== null) {
    throw new NotFoundError('Person not found or has no active instructor profile.');
  }
  return {
    personId: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    instructorProfileId: person.instructorProfile.id,
    payoutRateCents: person.instructorProfile.payoutRateCents,
  };
}

/**
 * `GET /api/v1/instructor-compensation?personId=` — the single-instructor
 * detail behind the profile slide-over (AC 3/7): the same summary row PLUS
 * the 5 most recent SCHOOL flights this instructor flew as CFI and the
 * distinct students among them (derived from the SAME 5 flights, never a
 * separate query — same as the prototype's own `[...new Set(...)]`).
 * `finance.manage` (staff+admin) — same permission as the summary; the
 * `personId` resolution keeps the door open for a future own-access variant
 * (Dev Notes) without any extra work now.
 */
export async function getInstructorCompensationDetail(actor: Actor, personId: string): Promise<InstructorCompensationDetail> {
  authorize(actor, 'finance.manage');

  const instructor = await resolveActiveInstructorRow(personId);
  const [row] = await computeSummaryRows([instructor]);

  const flights = await prisma.flight.findMany({
    where: { instructorProfileId: instructor.instructorProfileId, flightType: 'SCHOOL', status: { not: 'CANCELLED' } },
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

  return { ...row!, recentFlights, recentStudents };
}

/** Resolves a `Person.id` to its `InstructorProfile` (unknown person -> 404; no/deactivated profile -> caller decides) — same shape as `instructor-rates.service.ts:75`'s `resolveInstructorProfile`, duplicated here (twin services, no cross-import) rather than imported. */
async function resolveInstructorProfile(personId: string): Promise<{ id: string; deactivatedAt: Date | null } | null> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { instructorProfile: { select: { id: true, deactivatedAt: true } } },
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }
  return person.instructorProfile;
}

/** Resolves to an ACTIVE instructor's profile id, or 409 (mirrors `createInstructorRate`'s "valid person, wrong state" choice — no enumeration concern since `people.read` actors already see the person). */
async function resolveActiveInstructorProfileId(personId: string): Promise<string> {
  const profile = await resolveInstructorProfile(personId);
  if (!profile || profile.deactivatedAt !== null) {
    throw new ConflictError('This person has no active instructor profile.');
  }
  return profile.id;
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
 * boundary (`recordInstructorPayoutSchema`). `payouts.manage` (ADMIN-only).
 */
export async function recordPayout(actor: Actor, input: RecordInstructorPayoutInput): Promise<InstructorPayoutDto> {
  authorize(actor, 'payouts.manage');

  const instructorProfileId = await resolveActiveInstructorProfileId(input.instructorPersonId);

  const category = await prisma.cashCategory.findUnique({
    where: { name: INSTRUCTOR_PAYOUT_CASH_CATEGORY_NAME, isActive: true },
    select: { id: true },
  });
  if (!category) {
    throw new Error(
      `Cash category "${INSTRUCTOR_PAYOUT_CASH_CATEGORY_NAME}" is missing or inactive — seed/reactivate it before recording a payout.`,
    );
  }

  const effectiveDate = parseDateOnlyUtc(todayDateOnlyInZone(APP_TIMEZONE));

  const payout = await prisma.$transaction(async (tx) => {
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
        description: `Instructor payout ${input.periodStart} – ${input.periodEnd}`,
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
 * permission). Reuses the same active-instructor resolution as `recordPayout`.
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
