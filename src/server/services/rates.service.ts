import type { CreateAircraftRateInput } from '@/lib/schemas/aircraft';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, NotFoundError } from './errors';

/**
 * Historicized aircraft rates (epic 4, story 4.1, AD-4/AD-2). Append-only
 * (AD-3's spirit) — there is deliberately no update/delete function here: a
 * wrong price is corrected by `createAircraftRate`-ing a NEW rate with a
 * later `validFrom`, the history never changes.
 */
export type AircraftRateListItem = {
  id: string;
  aircraftId: string;
  priceCentsPerHour: number;
  /** Calendar-only date (`YYYY-MM-DD`), never a timestamp — see `toDateOnlyString`. */
  validFrom: string;
  actorUserId: string;
  actorEmail: string;
  createdAt: Date;
};

const RATE_SELECT = {
  id: true,
  aircraftId: true,
  priceCentsPerHour: true,
  validFrom: true,
  actorUserId: true,
  actorUser: { select: { email: true } },
  createdAt: true,
} as const;

type SelectedRate = {
  id: string;
  aircraftId: string;
  priceCentsPerHour: number;
  validFrom: Date;
  actorUserId: string;
  actorUser: { email: string };
  createdAt: Date;
};

/** `@db.Date` round-trips as a UTC-midnight `Date` — same helper as `accounts.service.ts`/`cash.service.ts`. */
function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Parses a `YYYY-MM-DD` string (already validated by `z.iso.date()` at the
 * Zod boundary) into a UTC-midnight `Date` — the exact shape Prisma expects
 * to bind against a `@db.Date` column (review 3.5 F1's lesson: never let a
 * JS `Date` carry any time-of-day/timezone component into a date-only
 * comparison).
 */
function parseDateOnlyUtc(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** `@db.Date` calendar-only "today" (server clock, UTC) — same helper as `accounts.service.ts#todayDateOnlyUtc`. */
export function todayDateOnlyUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toListItem(rate: SelectedRate): AircraftRateListItem {
  return {
    id: rate.id,
    aircraftId: rate.aircraftId,
    priceCentsPerHour: rate.priceCentsPerHour,
    validFrom: toDateOnlyString(rate.validFrom),
    actorUserId: rate.actorUserId,
    actorEmail: rate.actorUser.email,
    createdAt: rate.createdAt,
  };
}

/** Prisma unique-constraint violation (same pattern as every other service). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/**
 * Pre-check for the check-then-write race the `try`/`catch` around `create`
 * backstops (same pattern as `aircraft.service.ts#assertRegistrationAvailable`).
 */
async function assertRateAvailable(aircraftId: string, validFrom: Date): Promise<void> {
  const existing = await prisma.aircraftRate.findFirst({
    where: { aircraftId, validFrom },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('A rate with this validFrom already exists for this aircraft.');
  }
}

/**
 * Records a new historicized rate (AC 1/2). `settings.manage` (admin) only —
 * pricing configuration, deliberately stricter than day-to-day fleet
 * management (`aircraft.manage`, staff+admin, which only gets read access
 * below) — same split as `createCashCategory` vs `listCashCategories`.
 *
 * Decision (Dev Notes left this open): an ARCHIVED aircraft rejects new
 * rates with a 409, not a 404 — the aircraft demonstrably exists (staff/
 * admin already see archived aircraft via `aircraft.manage`, so there is no
 * enumeration concern in telling them apart) and pricing a retired airframe
 * going forward would be misleading; this mirrors `archiveAircraft`'s own
 * "already archived" `ConflictError` for the same "valid id, wrong state"
 * shape.
 */
export async function createAircraftRate(
  actor: Actor,
  aircraftId: string,
  input: CreateAircraftRateInput,
): Promise<AircraftRateListItem> {
  authorize(actor, 'settings.manage');

  const aircraft = await prisma.aircraft.findUnique({ where: { id: aircraftId }, select: { id: true, archivedAt: true } });
  if (!aircraft) {
    throw new NotFoundError('Aircraft not found.');
  }
  if (aircraft.archivedAt !== null) {
    throw new ConflictError('Cannot add a rate to an archived aircraft.');
  }

  const validFrom = parseDateOnlyUtc(input.validFrom);

  // Check-then-write pre-check; the try/catch below backstops the
  // concurrency race (lezione review: "mai fidarsi solo del pre-check").
  await assertRateAvailable(aircraftId, validFrom);

  let rate;
  try {
    rate = await prisma.aircraftRate.create({
      data: {
        aircraftId,
        priceCentsPerHour: input.priceCentsPerHour,
        validFrom,
        actorUserId: actor.userId,
      },
      select: RATE_SELECT,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('A rate with this validFrom already exists for this aircraft.');
    }
    throw error;
  }

  return toListItem(rate);
}

/**
 * Lists an aircraft's full rate history, most recent `validFrom` first (AC
 * 1). `aircraft.manage` (staff+admin) — a deliberately wider read than the
 * `settings.manage` write above (Dev Notes: staff sees fleet pricing even
 * though only admin sets it). No pagination (small, admin-managed list, same
 * choice as `listCashCategories`) but defensively capped at `take: 500`.
 */
export async function listAircraftRates(actor: Actor, aircraftId: string): Promise<AircraftRateListItem[]> {
  authorize(actor, 'aircraft.manage');

  const aircraft = await prisma.aircraft.findUnique({ where: { id: aircraftId }, select: { id: true } });
  if (!aircraft) {
    throw new NotFoundError('Aircraft not found.');
  }

  const rates = await prisma.aircraftRate.findMany({
    where: { aircraftId },
    select: RATE_SELECT,
    orderBy: [{ validFrom: 'desc' }],
    take: 500,
  });

  return rates.map(toListItem);
}

/**
 * The rate in effect for a given date (AD-4, the cardinal rule of this
 * story): the row with the MAXIMUM `validFrom <= onDate`. Uses Prisma's
 * typed query (never raw SQL against the `date` column) so `@db.Date` binds
 * as a real Postgres `date` — TZ-safe (review 3.5 F1's lesson: a raw
 * `date >= timestamptz` comparison promotes to the session timezone and can
 * drop boundary rows; the typed query never does that promotion). Returns
 * `null` when the aircraft has no rate on or before `onDate` — this is the
 * hook epic 5's flight snapshot will call; it is NOT consumed by a
 * dedicated route in this story, only internally (the "current price" shown
 * in the UI, `onDate = today`).
 */
export async function getEffectiveRate(actor: Actor, aircraftId: string, onDate: Date): Promise<AircraftRateListItem | null> {
  authorize(actor, 'aircraft.manage');

  const rate = await prisma.aircraftRate.findFirst({
    where: { aircraftId, validFrom: { lte: onDate } },
    select: RATE_SELECT,
    orderBy: [{ validFrom: 'desc' }],
  });

  return rate ? toListItem(rate) : null;
}
