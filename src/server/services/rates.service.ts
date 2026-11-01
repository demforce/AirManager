import type { Prisma } from '@/generated/prisma/client';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import type { CreateAircraftRateInput } from '@/lib/schemas/aircraft';
import { APP_TIMEZONE } from '@/lib/time';
import { todayDateOnlyUtcInZone } from '@/lib/zoned-time';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, NotFoundError, ValidationError } from './errors';

/**
 * Historicized aircraft rates (epic 4, story 4.1, AD-4/AD-2). Two billed
 * prices per row since story 19.3 (R-19-e): `studentPriceCents` and
 * `pilotPriceCents` — the flight takes the column of the flying person's
 * profile (`flights.service.ts#resolveFlightInput`). Writes (R-19-f): a
 * `validFrom` today or later only (`assertRateValidFromNotPast`), and a row
 * whose `validFrom` is still today or later is rewritten in place
 * (`upsertAircraftRateCore`) — a past row never changes.
 */
export type AircraftRateListItem = {
  id: string;
  aircraftId: string;
  studentPriceCents: number;
  pilotPriceCents: number;
  /** Calendar-only date (`YYYY-MM-DD`), never a timestamp — see `toDateOnlyString`. */
  validFrom: string;
  actorUserId: string;
  actorEmail: string;
  createdAt: Date;
};

const RATE_SELECT = {
  id: true,
  aircraftId: true,
  studentPriceCents: true,
  pilotPriceCents: true,
  validFrom: true,
  actorUserId: true,
  actorUser: { select: { email: true } },
  createdAt: true,
} as const;

type SelectedRate = {
  id: string;
  aircraftId: string;
  studentPriceCents: number;
  pilotPriceCents: number;
  validFrom: Date;
  actorUserId: string;
  actorUser: { email: string };
  createdAt: Date;
};

function toListItem(rate: SelectedRate): AircraftRateListItem {
  return {
    id: rate.id,
    aircraftId: rate.aircraftId,
    studentPriceCents: rate.studentPriceCents,
    pilotPriceCents: rate.pilotPriceCents,
    validFrom: toDateOnlyString(rate.validFrom),
    actorUserId: rate.actorUserId,
    actorEmail: rate.actorUser.email,
    createdAt: rate.createdAt,
  };
}

/**
 * The one decorrenza rule of both rate twins (story 19.3, R-19-f, A16): a new
 * or rewritten rate takes effect TODAY or later, "today" being the
 * Europe/Rome calendar day — a past `validFrom` would reprice days whose
 * flights already froze the old price. Checked by every rate write path
 * (`POST /aircraft/{id}/rates`, the `rate` block of `POST`/`PATCH
 * /aircraft`, `POST /people/{id}/instructor-rates`) BEFORE any write and
 * before any transaction. `validFrom` is already a `z.iso.date()` string.
 */
export function assertRateValidFromNotPast(validFrom: string): void {
  if (parseDateOnlyUtc(validFrom).getTime() < todayDateOnlyUtcInZone(APP_TIMEZONE).getTime()) {
    throw new ValidationError('validFrom cannot be in the past.', undefined, 'RATE_VALID_FROM_IN_PAST');
  }
}

/**
 * The ONLY writer of `AircraftRate` (story 19.3, AD-2): inserts the rate, or
 * rewrites the prices (and the actor) of the row already on that
 * `(aircraftId, validFrom)` — callers have already checked
 * `assertRateValidFromNotPast`, so the row it can rewrite is never a past
 * one. `createdAt` keeps the first write. Runs on the caller's `tx`:
 * `createAircraftRate` (its own), and the aircraft composites
 * `aircraft.service.ts#createAircraft`/`#updateAircraft` (theirs, next to the
 * aircraft write). A flat upsert — no nested read in its `select` — so
 * Prisma emits a native `INSERT … ON CONFLICT DO UPDATE` and two concurrent
 * writes of the same day can never collide on the unique constraint.
 */
export async function upsertAircraftRateCore(
  tx: Prisma.TransactionClient,
  aircraftId: string,
  input: CreateAircraftRateInput,
  actorUserId: string,
): Promise<string> {
  const validFrom = parseDateOnlyUtc(input.validFrom);
  const rate = await tx.aircraftRate.upsert({
    where: { aircraftId_validFrom: { aircraftId, validFrom } },
    create: {
      aircraftId,
      studentPriceCents: input.studentPriceCents,
      pilotPriceCents: input.pilotPriceCents,
      validFrom,
      actorUserId,
    },
    update: { studentPriceCents: input.studentPriceCents, pilotPriceCents: input.pilotPriceCents, actorUserId },
    select: { id: true },
  });
  return rate.id;
}

/**
 * Records a rate (AC 1/2), or rewrites the one already on that `validFrom`
 * (story 19.3, R-19-f: a 201 with the updated row, never a 409).
 * `settings.manage` (admin) only — pricing configuration, deliberately
 * stricter than day-to-day fleet management (`aircraft.manage`, which only
 * gets read access below) — same split as `createCashCategory` vs
 * `listCashCategories`.
 *
 * Decision (Dev Notes left this open): an ARCHIVED aircraft rejects new
 * rates with a 409, not a 404 — the aircraft demonstrably exists (an
 * admin already sees archived aircraft via `aircraft.manage`, so there is no
 * enumeration concern in telling them apart) and pricing a retired airframe
 * going forward would be misleading; this mirrors `archiveAircraft`'s own
 * "already archived" `ConflictError` for the same "valid id, wrong state"
 * shape.
 */
export async function createAircraftRate(actor: Actor, aircraftId: string, input: CreateAircraftRateInput): Promise<AircraftRateListItem> {
  authorize(actor, 'settings.manage');

  const aircraft = await prisma.aircraft.findUnique({ where: { id: aircraftId }, select: { id: true, archivedAt: true } });
  if (!aircraft) {
    throw new NotFoundError('Aircraft not found.');
  }
  if (aircraft.archivedAt !== null) {
    throw new ConflictError('Cannot add a rate to an archived aircraft.');
  }
  assertRateValidFromNotPast(input.validFrom);

  // The response carries the actor's email (a nested read), which would
  // turn the upsert into a non-native read-then-write: write flat, read after.
  const rate = await prisma.$transaction(async (tx) => {
    const id = await upsertAircraftRateCore(tx, aircraftId, input, actor.userId);
    return tx.aircraftRate.findUniqueOrThrow({ where: { id }, select: RATE_SELECT });
  });

  return toListItem(rate);
}

/**
 * Lists an aircraft's full rate history, most recent `validFrom` first (AC
 * 1) — kept for API clients (story 19.3, D-2): the UI shows only the current
 * and the next scheduled rate, never this list. `aircraft.manage` (ADMIN-only) — a deliberately wider read than the
 * `settings.manage` write above (Dev Notes: an admin reads fleet pricing
 * through this wider permission, even though the same admin also sets it).
 * No pagination (small, admin-managed list, same
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
 * `null` when the aircraft has no rate on or before `onDate`. Read by the
 * flight snapshot (`flights.service.ts#resolveFlightInput`, `onDate =
 * flightDate`); no route of its own.
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

/**
 * Batched effective-rate lookup (story TD-1, AC 4 — the fleet table's
 * "current rate" column used to run `getEffectiveRate` once per row, an N+1
 * flagged in 4.1's review as a follow-up). Same AD-4 semantics as
 * `getEffectiveRate` (the row with the MAXIMUM `validFrom <= onDate`), same
 * `authorize`, same TZ-safe typed query on `@db.Date` (review 3.5 F1 — never
 * raw SQL here) — but ONE query for the whole page instead of N: rows are
 * ordered `aircraftId asc, validFrom desc` and `distinct: ['aircraftId']`
 * keeps only the first (most-recent-qualifying) row per aircraft, which is
 * exactly what `getEffectiveRate` would return per id. The result `Map`
 * always has an entry for every requested id — an aircraft with no
 * qualifying rate maps to `null`, never an absent key, so callers never have
 * to special-case a missing entry.
 */
export async function getEffectiveRates(
  actor: Actor,
  aircraftIds: string[],
  onDate: Date,
): Promise<Map<string, AircraftRateListItem | null>> {
  authorize(actor, 'aircraft.manage');

  const result = new Map<string, AircraftRateListItem | null>(aircraftIds.map((id) => [id, null]));
  if (aircraftIds.length === 0) {
    return result;
  }

  const rates = await prisma.aircraftRate.findMany({
    where: { aircraftId: { in: aircraftIds }, validFrom: { lte: onDate } },
    select: RATE_SELECT,
    orderBy: [{ aircraftId: 'asc' }, { validFrom: 'desc' }],
    distinct: ['aircraftId'],
  });

  for (const rate of rates) {
    result.set(rate.aircraftId, toListItem(rate));
  }

  return result;
}

/**
 * Batched NEXT scheduled rate (story 19.3, Q-19.3-d): per aircraft, the row
 * with the MINIMUM `validFrom > onDate` — the one line "variazione
 * programmata" the aircraft editor shows under its price fields (only the
 * next one, never a list). The mirror of `getEffectiveRates`: same
 * `authorize`, same typed query on `@db.Date`, same one-query `distinct`
 * trick with the order flipped to `validFrom asc`, same "every requested id
 * has an entry, `null` when nothing is scheduled" contract.
 */
export async function getNextScheduledRates(
  actor: Actor,
  aircraftIds: string[],
  onDate: Date,
): Promise<Map<string, AircraftRateListItem | null>> {
  authorize(actor, 'aircraft.manage');

  const result = new Map<string, AircraftRateListItem | null>(aircraftIds.map((id) => [id, null]));
  if (aircraftIds.length === 0) {
    return result;
  }

  const rates = await prisma.aircraftRate.findMany({
    where: { aircraftId: { in: aircraftIds }, validFrom: { gt: onDate } },
    select: RATE_SELECT,
    orderBy: [{ aircraftId: 'asc' }, { validFrom: 'asc' }],
    distinct: ['aircraftId'],
  });

  for (const rate of rates) {
    result.set(rate.aircraftId, toListItem(rate));
  }

  return result;
}
