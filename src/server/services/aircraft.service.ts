import type { AircraftStatus } from '@/generated/prisma/client';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import type {
  CreateAircraftInput,
  CreateHourMeterAdjustmentInput,
  ListAircraftQuery,
  ListHourMeterAdjustmentsQuery,
  SetOutOfServiceInput,
  UpdateAircraftInput,
} from '@/lib/schemas/aircraft';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, NotFoundError } from './errors';
import { createAircraftRateCore } from './rates.service';

export type AircraftListItem = {
  id: string;
  registration: string;
  type: string;
  model: string;
  hourMeterMinutes: number;
  notes: string | null;
  status: AircraftStatus;
  statusReason: string | null;
  /** `YYYY-MM-DD` — last day the aircraft is GROUNDED, inclusive (story AOG-1a, ratifica R-AOG-a). Semantics/life-cycle/invariants: `schema.prisma`, `Aircraft.outOfServiceUntil` (the single source; never re-interpreted here). `null` = "return date not yet known". Calendar-only on the wire, same convention every other `@db.Date` DTO field in this repo follows (`AircraftRateListItem.validFrom`, `ExpiryListItem.expiresAt`). */
  outOfServiceUntil: string | null;
  /** Number of seats (story 12.5, AC 1) — anagrafica only, optional. */
  seats: number | null;
  /** Free-text fuel type (story 12.5, AC 1). */
  fuelType: string | null;
  /** Based at the field vs. a visiting/guest airframe (story 12.5, AC 1). */
  based: boolean;
  archivedAt: Date | null;
  createdAt: Date;
};

/** AD-8 paginated shape, via the shared helper (story 1.5). */
export type AircraftListResult = PaginatedResult<AircraftListItem>;

const AIRCRAFT_SELECT = {
  id: true,
  registration: true,
  type: true,
  model: true,
  hourMeterMinutes: true,
  notes: true,
  status: true,
  statusReason: true,
  outOfServiceUntil: true,
  seats: true,
  fuelType: true,
  based: true,
  archivedAt: true,
  createdAt: true,
} as const;

/** The raw `AIRCRAFT_SELECT` row: identical to the DTO except `outOfServiceUntil`, which is a `@db.Date` `Date` at rest and a `YYYY-MM-DD` string on the wire (same split `rates.service.ts` uses for `validFrom`). */
type SelectedAircraft = Omit<AircraftListItem, 'outOfServiceUntil'> & { outOfServiceUntil: Date | null };

function toListItem(aircraft: SelectedAircraft): AircraftListItem {
  return {
    id: aircraft.id,
    registration: aircraft.registration,
    type: aircraft.type,
    model: aircraft.model,
    hourMeterMinutes: aircraft.hourMeterMinutes,
    notes: aircraft.notes,
    status: aircraft.status,
    statusReason: aircraft.statusReason,
    outOfServiceUntil: aircraft.outOfServiceUntil === null ? null : toDateOnlyString(aircraft.outOfServiceUntil),
    seats: aircraft.seats,
    fuelType: aircraft.fuelType,
    based: aircraft.based,
    archivedAt: aircraft.archivedAt,
    createdAt: aircraft.createdAt,
  };
}

/**
 * One entry of the hour-meter adjustment history (AC 2: "chi, quando, delta,
 * motivo"). `actorEmail` is a small display-only enrichment over the stored
 * `actorUserId` (joined via the existing `HourMeterAdjustment.actorUser`
 * relation) — a raw cuid is not a usable "chi" in the UI history list.
 */
export type HourMeterAdjustmentListItem = {
  id: string;
  aircraftId: string;
  actorUserId: string;
  actorEmail: string;
  previousMinutes: number;
  newMinutes: number;
  reason: string;
  createdAt: Date;
};

/** AD-8 paginated shape for the adjustment history. */
export type HourMeterAdjustmentListResult = PaginatedResult<HourMeterAdjustmentListItem>;

const HOUR_METER_ADJUSTMENT_SELECT = {
  id: true,
  aircraftId: true,
  actorUserId: true,
  actorUser: { select: { email: true } },
  previousMinutes: true,
  newMinutes: true,
  reason: true,
  createdAt: true,
} as const;

type SelectedHourMeterAdjustment = {
  id: string;
  aircraftId: string;
  actorUserId: string;
  actorUser: { email: string };
  previousMinutes: number;
  newMinutes: number;
  reason: string;
  createdAt: Date;
};

function toAdjustmentListItem(adjustment: SelectedHourMeterAdjustment): HourMeterAdjustmentListItem {
  return {
    id: adjustment.id,
    aircraftId: adjustment.aircraftId,
    actorUserId: adjustment.actorUserId,
    actorEmail: adjustment.actorUser.email,
    previousMinutes: adjustment.previousMinutes,
    newMinutes: adjustment.newMinutes,
    reason: adjustment.reason,
    createdAt: adjustment.createdAt,
  };
}

/**
 * Prisma unique-constraint violation ON `registration` (concurrent duplicate).
 * Review 14.8 F5: the composite create's try now also spans the rate insert —
 * checking `meta.target` turns "any P2002 in here is a registration clash"
 * from an assumption into a guarantee (a foreign P2002 falls through as 500).
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error) || (error as { code?: string }).code !== 'P2002') {
    return false;
  }
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) ? target.includes('registration') : true;
}

/**
 * Pre-check for the check-then-write race the `try`/`catch` around
 * `create`/`update` backstops (same pattern as `people.service.ts`'s
 * `assertUnique`). `registration` arrives already normalized
 * (`trim().toUpperCase()`) by the Zod schema, so this comparison is
 * effectively case-insensitive.
 */
async function assertRegistrationAvailable(registration: string, excludeId?: string): Promise<void> {
  const existing = await prisma.aircraft.findFirst({
    where: { registration, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('An aircraft with this registration already exists.');
  }
}

/**
 * Lists aircraft, paginated and searchable (AC 1: FR-7's fleet registry,
 * browsable/searchable). `q` matches registration or model,
 * case-insensitively; archived aircraft (AC 2) are excluded by default and
 * only surfaced with `includeArchived: true`. There is no `aircraft.read`
 * permission (Dev Notes: pilots will see the fleet via the future bookings
 * epic, not here) — every operation, list included, requires
 * `aircraft.manage`.
 */
export async function listAircraft(actor: Actor, query: ListAircraftQuery): Promise<AircraftListResult> {
  authorize(actor, 'aircraft.manage');

  const q = query.q?.trim();
  const where = {
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(q
      ? {
          OR: [
            { registration: { contains: q, mode: 'insensitive' as const } },
            { model: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  // Interactive transaction (story TD-1, AC 3) — see
  // `people.service.ts#listPeople`'s doc-comment for the batch-vs-interactive
  // `pg` DeprecationWarning rationale.
  const [items, total] = await prisma.$transaction(async (tx) => {
    const items = await tx.aircraft.findMany({
      where,
      select: AIRCRAFT_SELECT,
      orderBy: [{ registration: 'asc' }],
      ...paginationOffset(query),
    });
    const total = await tx.aircraft.count({ where });
    return [items, total] as const;
  });

  return paginate(items.map(toListItem), total, query);
}

/**
 * Lists every aircraft currently OUT_OF_SERVICE (story 10.3, AC 1) — the
 * staff home dashboard's "velivoli fuori servizio" widget (FR-41).
 * `aircraft.manage` only, same gate as every other aircraft operation.
 * Unlike `listAircraft`, this is unpaginated and filters on `status` (a
 * filter `listAircraft` does not expose) — a fleet realistically has few
 * aircraft grounded at once, and the home widget needs the full set, not a
 * page. Archived aircraft are excluded, same default convention as
 * `listAircraft`.
 */
export async function listOutOfServiceAircraft(actor: Actor): Promise<AircraftListItem[]> {
  authorize(actor, 'aircraft.manage');

  const aircraft = await prisma.aircraft.findMany({
    where: { status: 'OUT_OF_SERVICE', archivedAt: null },
    select: AIRCRAFT_SELECT,
    orderBy: [{ registration: 'asc' }],
  });

  return aircraft.map(toListItem);
}

/** Returns a single aircraft. Access: `aircraft.manage`. */
export async function getAircraft(actor: Actor, id: string): Promise<AircraftListItem> {
  authorize(actor, 'aircraft.manage');

  const aircraft = await prisma.aircraft.findUnique({ where: { id }, select: AIRCRAFT_SELECT });
  if (!aircraft) {
    throw new NotFoundError('Aircraft not found.');
  }
  return toListItem(aircraft);
}

/**
 * Creates an aircraft (AC 1). Write access: `aircraft.manage`. Story 14.8
 * ("form velivolo unificato", AC 1/2): the optional `input.rate` block adds
 * the aircraft's first historicized rate in the SAME request — checked
 * BEFORE any write against the stricter `settings.manage` (same split
 * `createAircraftRate` itself enforces), then both writes run inside ONE
 * `$transaction` so a rejected rate rolls back the aircraft too — never a
 * silently half-created aircraft (same `createPerson`/`profiles`+`access`
 * composite precedent, `people.service.ts`). Without `rate` (the pre-14.8
 * shape, still the common case) the aircraft insert stays a single
 * non-transactional call, unchanged.
 */
export async function createAircraft(actor: Actor, input: CreateAircraftInput): Promise<AircraftListItem> {
  authorize(actor, 'aircraft.manage');
  if (input.rate) {
    // Review 14.9 F5: since 14.9, `aircraft.manage` is ADMIN-only, and ADMIN
    // always also holds `settings.manage` — no role can pass the guard above
    // and fail this one, so this branch is structurally unreachable today.
    // Kept for a future role holding `aircraft.manage` without
    // `settings.manage`; coverage for it is no longer expressible (an
    // adjacent test can only reach the OUTER `aircraft.manage` gate).
    authorize(actor, 'settings.manage');
  }

  await assertRegistrationAvailable(input.registration);

  const data = {
    registration: input.registration,
    type: input.type,
    model: input.model,
    hourMeterMinutes: input.hourMeterMinutes,
    notes: input.notes ?? null,
    seats: input.seats ?? null,
    fuelType: input.fuelType ?? null,
    // Omitted (`undefined`) falls back to the Prisma/DB default
    // (`true`, story 12.5 AC 1) rather than forcing a value here.
    based: input.based,
  };

  const rate = input.rate;

  let aircraft;
  try {
    aircraft = rate
      ? await prisma.$transaction(async (tx) => {
          const created = await tx.aircraft.create({ data, select: AIRCRAFT_SELECT });
          await createAircraftRateCore(tx, created.id, rate, actor.userId);
          return created;
        })
      : await prisma.aircraft.create({ data, select: AIRCRAFT_SELECT });
  } catch (error) {
    // assertRegistrationAvailable is check-then-write: a concurrent request
    // can win the race and the unique constraint fires here instead.
    if (isUniqueViolation(error)) {
      throw new ConflictError('An aircraft with this registration already exists.');
    }
    throw error;
  }

  return toListItem(aircraft);
}

/**
 * Partial update: registration, type, model, notes, seats, fuelType,
 * based (story 12.5, AC 1, all additive). Archiving is separate (AC 2), and
 * so is the hour meter (story 2.5, AC 2): `hourMeterMinutes` is deliberately
 * absent from `UpdateAircraftInput` — it only changes via `adjustHourMeter`'s
 * tracked transaction, never this generic patch.
 */
export async function updateAircraft(actor: Actor, id: string, patch: UpdateAircraftInput): Promise<AircraftListItem> {
  authorize(actor, 'aircraft.manage');

  const existing = await prisma.aircraft.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Aircraft not found.');
  }

  if (patch.registration !== undefined) {
    await assertRegistrationAvailable(patch.registration, id);
  }

  let aircraft;
  try {
    aircraft = await prisma.aircraft.update({
      where: { id },
      data: {
        ...(patch.registration !== undefined && { registration: patch.registration }),
        ...(patch.type !== undefined && { type: patch.type }),
        ...(patch.model !== undefined && { model: patch.model }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
        ...(patch.seats !== undefined && { seats: patch.seats }),
        ...(patch.fuelType !== undefined && { fuelType: patch.fuelType }),
        ...(patch.based !== undefined && { based: patch.based }),
      },
      select: AIRCRAFT_SELECT,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('An aircraft with this registration already exists.');
    }
    throw error;
  }

  return toListItem(aircraft);
}

/**
 * Archives an aircraft (AC 2): `archivedAt` is a timestamp, not a boolean, so
 * it also records *when*. There is deliberately no physical-delete API — an
 * archived aircraft stays fully readable with all its history, it is just
 * excluded from `listAircraft`'s default (non-`includeArchived`) results and
 * from new-operation pickers built on top of it (same pattern as
 * `archivePerson`, story 2.1).
 */
export async function archiveAircraft(actor: Actor, id: string): Promise<AircraftListItem> {
  authorize(actor, 'aircraft.manage');

  const existing = await prisma.aircraft.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Aircraft not found.');
  }
  if (existing.archivedAt !== null) {
    throw new ConflictError('Aircraft is already archived.');
  }

  const aircraft = await prisma.aircraft.update({
    where: { id },
    data: { archivedAt: new Date() },
    select: AIRCRAFT_SELECT,
  });
  return toListItem(aircraft);
}

/** Restores a previously archived aircraft (AC 2). */
export async function unarchiveAircraft(actor: Actor, id: string): Promise<AircraftListItem> {
  authorize(actor, 'aircraft.manage');

  const existing = await prisma.aircraft.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Aircraft not found.');
  }
  if (existing.archivedAt === null) {
    throw new ConflictError('Aircraft is not archived.');
  }

  const aircraft = await prisma.aircraft.update({
    where: { id },
    data: { archivedAt: null },
    select: AIRCRAFT_SELECT,
  });
  return toListItem(aircraft);
}

/**
 * Marks an aircraft out of service with a mandatory reason (story 2.5, AC 1;
 * FR-8). This is deliberately NOT archiving (Dev Notes) — the aircraft stays
 * in the default fleet list, just flagged as not currently airworthy; the
 * real booking block lands with Epic 7.
 *
 * Story AOG-1a (P3): `outOfServiceUntil` is written HERE, together with the
 * reason, and only here — its semantics/invariants live in ONE place,
 * `schema.prisma`'s own doc-comment on the column. It is OPTIONAL (invariant
 * [b]): an omitted value stores `null` ("return date not yet known"), which is
 * a legitimate state. A date in the PAST is a legitimate input too and is NOT
 * rejected: invariant [a] means the field never decides anything, so a
 * "must be in the future" rule would be semantically wrong here (and is not
 * ratified). The date never re-opens the aircraft — only `returnToService` does.
 */
export async function setOutOfService(actor: Actor, id: string, input: SetOutOfServiceInput): Promise<AircraftListItem> {
  authorize(actor, 'aircraft.manage');

  const existing = await prisma.aircraft.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new NotFoundError('Aircraft not found.');
  }

  // Atomic guard (review 2.2 F1): the WHERE also requires status ===
  // OPERATIONAL, so two concurrent "out of service" calls can't both read
  // OPERATIONAL and both "win" the check-then-write race — the loser matches
  // zero rows and gets ConflictError instead of silently overwriting the
  // other caller's statusReason.
  const { count } = await prisma.aircraft.updateMany({
    where: { id, status: 'OPERATIONAL' },
    data: {
      status: 'OUT_OF_SERVICE',
      statusReason: input.reason,
      // Story AOG-1a: ONE extra key in the `data`; the `where` above is
      // untouched, so the concurrency discipline of review 2.2 F1 is
      // unchanged. `@db.Date` is bound as a UTC-midnight calendar date
      // (`parseDateOnlyUtc`, review 3.5 F1's lesson) — never a timestamp.
      outOfServiceUntil: input.outOfServiceUntil === undefined ? null : parseDateOnlyUtc(input.outOfServiceUntil),
    },
  });
  if (count === 0) {
    throw new ConflictError('Aircraft is already out of service.');
  }

  const aircraft = await prisma.aircraft.findUniqueOrThrow({ where: { id }, select: AIRCRAFT_SELECT });
  return toListItem(aircraft);
}

/**
 * Returns an out-of-service aircraft to service (story 2.5, AC 1), clearing
 * `statusReason` AND (story AOG-1a) `outOfServiceUntil` — a stale reason, or a
 * stale expected-return date, from a previous grounding must never linger once
 * the aircraft is airworthy again. Both are cleared in the SAME statement, so
 * no second code path can ever let them diverge.
 */
export async function returnToService(actor: Actor, id: string): Promise<AircraftListItem> {
  authorize(actor, 'aircraft.manage');

  const existing = await prisma.aircraft.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new NotFoundError('Aircraft not found.');
  }

  // Same atomic guard as setOutOfService, mirrored for the opposite transition.
  const { count } = await prisma.aircraft.updateMany({
    where: { id, status: 'OUT_OF_SERVICE' },
    data: { status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null },
  });
  if (count === 0) {
    throw new ConflictError('Aircraft is already operational.');
  }

  const aircraft = await prisma.aircraft.findUniqueOrThrow({ where: { id }, select: AIRCRAFT_SELECT });
  return toListItem(aircraft);
}

/**
 * Corrects the hour meter (contaore) with a tracked, mandatory-reason
 * rectification (story 2.5, AC 2; AD-3's spirit). Both the audit row and the
 * `Aircraft.hourMeterMinutes` update happen inside one Prisma transaction —
 * the project's first multi-statement `$transaction` — so the two writes
 * can never be observed out of sync (an adjustment recorded without the
 * aircraft actually changing, or vice versa). `previousMinutes` is read with
 * a `SELECT ... FOR UPDATE` row lock: under the default READ COMMITTED
 * isolation a plain read would let two concurrent adjustments both observe
 * the same "previous" value and record a stale audit "before" (review 2.5
 * F1) — the lock serializes them, so the second reads the first's committed
 * result. A negative delta (`newMinutes < previousMinutes`) is allowed —
 * Dev Notes: a correction can go either direction, this is not a monotonic
 * counter.
 */
export async function adjustHourMeter(
  actor: Actor,
  id: string,
  input: CreateHourMeterAdjustmentInput,
): Promise<AircraftListItem> {
  authorize(actor, 'aircraft.manage');

  const aircraft = await prisma.$transaction(async (tx) => {
    // Row-locked read (FOR UPDATE): a concurrent adjustment's transaction
    // blocks here until this one commits, so its `previousMinutes` is never
    // stale (review 2.5 F1). Raw SQL because Prisma has no select-for-update.
    const locked = await tx.$queryRaw<Array<{ hourMeterMinutes: number }>>`
      SELECT "hourMeterMinutes" FROM "Aircraft" WHERE "id" = ${id} FOR UPDATE`;
    const existing = locked[0];
    if (!existing) {
      throw new NotFoundError('Aircraft not found.');
    }

    await tx.hourMeterAdjustment.create({
      data: {
        aircraftId: id,
        actorUserId: actor.userId,
        previousMinutes: existing.hourMeterMinutes,
        newMinutes: input.newMinutes,
        reason: input.reason,
      },
    });

    return tx.aircraft.update({
      where: { id },
      data: { hourMeterMinutes: input.newMinutes },
      select: AIRCRAFT_SELECT,
    });
  });

  return toListItem(aircraft);
}

/**
 * Lists an aircraft's hour-meter adjustment history (story 2.5, AC 2),
 * paginated and most-recent-first — append-only, so there is no
 * update/delete counterpart. `aircraft.manage` guards it, same as every
 * other aircraft operation.
 */
export async function listHourMeterAdjustments(
  actor: Actor,
  aircraftId: string,
  query: ListHourMeterAdjustmentsQuery,
): Promise<HourMeterAdjustmentListResult> {
  authorize(actor, 'aircraft.manage');

  const existing = await prisma.aircraft.findUnique({ where: { id: aircraftId }, select: { id: true } });
  if (!existing) {
    throw new NotFoundError('Aircraft not found.');
  }

  const where = { aircraftId };
  // Interactive transaction (story TD-1, AC 3) — see
  // `people.service.ts#listPeople`'s doc-comment for the batch-vs-interactive
  // `pg` DeprecationWarning rationale.
  const [items, total] = await prisma.$transaction(async (tx) => {
    const items = await tx.hourMeterAdjustment.findMany({
      where,
      select: HOUR_METER_ADJUSTMENT_SELECT,
      orderBy: [{ createdAt: 'desc' }],
      ...paginationOffset(query),
    });
    const total = await tx.hourMeterAdjustment.count({ where });
    return [items, total] as const;
  });

  return paginate(items.map(toAdjustmentListItem), total, query);
}

/**
 * Flown minutes per aircraft over `[from, to]` (both `@db.Date` UTC-midnight
 * bounds, inclusive), for the subset of `aircraftIds` that flew — story 15.5,
 * ratifica R-15.5-b: the number behind the fleet card's hours bar.
 *
 * BATCHED over the ids of the CURRENT PAGE, exactly like the two readers the
 * fleet page already calls beside it (`getEffectiveRates`,
 * `listReservedAircraftIds`) — never one query per card, and never the whole
 * fleet: the bar compares the 20 cards on screen, and `hoursBarPercent`'s
 * doc-comment says so. The alternative considered (and rejected in Q2) was
 * `getStats`, a `finance.manage` service that fires 10+ queries and paginates
 * the entire fleet to expose one field.
 *
 * `REGISTERED` only, matching every other flown-minutes aggregate in this
 * codebase (`stats.service.ts`'s `kpiFlightWhere`): a cancelled flight never
 * counts as activity. Aircraft with no flights in the window are ABSENT from
 * the map — callers read `?? 0`, so an empty bar and a missing key mean the
 * same thing.
 *
 * Gated on `aircraft.manage`, the SAME permission its only caller (the fleet
 * page) requires, so the helper's gate can never drift from the page that
 * reaches it.
 */
export async function sumFlightMinutesByAircraft(actor: Actor, aircraftIds: string[], from: Date, to: Date): Promise<Map<string, number>> {
  authorize(actor, 'aircraft.manage');

  if (aircraftIds.length === 0) {
    return new Map();
  }

  const groups = await prisma.flight.groupBy({
    by: ['aircraftId'],
    where: { aircraftId: { in: aircraftIds }, status: 'REGISTERED', flightDate: { gte: from, lte: to } },
    _sum: { minutes: true },
  });
  return new Map(groups.map((group) => [group.aircraftId, group._sum.minutes ?? 0]));
}
