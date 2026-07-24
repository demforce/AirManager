import type { AircraftStatus } from '@/generated/prisma/client';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import type {
  CreateAircraftInput,
  CreateHourMeterAdjustmentInput,
  ListAircraftQuery,
  ListHourMeterAdjustmentsQuery,
  UpdateAircraftInput,
} from '@/lib/schemas/aircraft';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, NotFoundError } from './errors';

export type AircraftListItem = {
  id: string;
  registration: string;
  type: string;
  model: string;
  hourMeterMinutes: number;
  notes: string | null;
  status: AircraftStatus;
  statusReason: string | null;
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
  seats: true,
  fuelType: true,
  based: true,
  archivedAt: true,
  createdAt: true,
} as const;

type SelectedAircraft = AircraftListItem;

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

/** Prisma unique-constraint violation (concurrent duplicate registration). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
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

/** Creates an aircraft (AC 1). Write access: `aircraft.manage`. */
export async function createAircraft(actor: Actor, input: CreateAircraftInput): Promise<AircraftListItem> {
  authorize(actor, 'aircraft.manage');

  await assertRegistrationAvailable(input.registration);

  let aircraft;
  try {
    aircraft = await prisma.aircraft.create({
      data: {
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
      },
      select: AIRCRAFT_SELECT,
    });
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
 */
export async function setOutOfService(actor: Actor, id: string, reason: string): Promise<AircraftListItem> {
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
    data: { status: 'OUT_OF_SERVICE', statusReason: reason },
  });
  if (count === 0) {
    throw new ConflictError('Aircraft is already out of service.');
  }

  const aircraft = await prisma.aircraft.findUniqueOrThrow({ where: { id }, select: AIRCRAFT_SELECT });
  return toListItem(aircraft);
}

/**
 * Returns an out-of-service aircraft to service (story 2.5, AC 1), clearing
 * `statusReason` — a stale reason from a previous grounding must never
 * linger once the aircraft is airworthy again.
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
    data: { status: 'OPERATIONAL', statusReason: null },
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
