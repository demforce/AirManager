import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import type { CreateAircraftInput, ListAircraftQuery, UpdateAircraftInput } from '@/lib/schemas/aircraft';
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
    archivedAt: aircraft.archivedAt,
    createdAt: aircraft.createdAt,
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

  const [items, total] = await prisma.$transaction([
    prisma.aircraft.findMany({
      where,
      select: AIRCRAFT_SELECT,
      orderBy: [{ registration: 'asc' }],
      ...paginationOffset(query),
    }),
    prisma.aircraft.count({ where }),
  ]);

  return paginate(items.map(toListItem), total, query);
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

/** Partial update: registration, type, model, contaore, notes. Archiving is separate (AC 2). */
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
        ...(patch.hourMeterMinutes !== undefined && { hourMeterMinutes: patch.hourMeterMinutes }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
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
