import type { CreatePackageTypeInput, ListPackageTypesQuery, UpdatePackageTypeInput } from '@/lib/schemas/package-types';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, NotFoundError } from './errors';

/** Prisma unique-constraint violation (same pattern as every other service). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/**
 * Prisma FK-constraint violation. No FK references `PackageType` yet (story
 * 4.3) — this is the forward-looking backstop for story 4.4's
 * `HourPackage.packageTypeId` (`ON DELETE RESTRICT`): a package sold against
 * this very type between the pre-check and the `DELETE` must still read as
 * the same `Conflict`, never a raw 500 (same rationale as
 * `cash.service.ts#isForeignKeyViolation`).
 */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2003';
}

export type PackageTypeEligibleAircraft = { id: string; registration: string };

export type PackageTypeListItem = {
  id: string;
  name: string;
  includedMinutes: number;
  priceCents: number;
  validityMonths: number | null;
  isActive: boolean;
  eligibleAircraft: PackageTypeEligibleAircraft[];
  createdAt: Date;
};

const PACKAGE_TYPE_SELECT = {
  id: true,
  name: true,
  includedMinutes: true,
  priceCents: true,
  validityMonths: true,
  isActive: true,
  createdAt: true,
  eligibleAircraft: { select: { aircraft: { select: { id: true, registration: true } } } },
} as const;

type SelectedPackageType = {
  id: string;
  name: string;
  includedMinutes: number;
  priceCents: number;
  validityMonths: number | null;
  isActive: boolean;
  createdAt: Date;
  eligibleAircraft: { aircraft: PackageTypeEligibleAircraft }[];
};

function toListItem(packageType: SelectedPackageType): PackageTypeListItem {
  return {
    id: packageType.id,
    name: packageType.name,
    includedMinutes: packageType.includedMinutes,
    priceCents: packageType.priceCents,
    validityMonths: packageType.validityMonths,
    isActive: packageType.isActive,
    eligibleAircraft: packageType.eligibleAircraft
      .map((row) => row.aircraft)
      .sort((a, b) => a.registration.localeCompare(b.registration)),
    createdAt: packageType.createdAt,
  };
}

/** Deduplicates a list of ids, preserving first-seen order (Dev Notes: `aircraftIds` are deduplicated before validation/storage). */
function dedupIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

/**
 * Validates a set of aircraft ids for eligibility (create/update, AC 1):
 * every id must exist (404 `NotFoundError` otherwise — a typo/stale id in
 * the payload) and a NEW association must not target an archived aircraft
 * (409 `ConflictError` — same "valid id, wrong state" shape as
 * `rates.service.ts#createAircraftRate`'s archived-aircraft guard). An
 * aircraft archived AFTER being associated stays in the set (Dev Notes), and
 * the edit form deliberately re-sends the full set including such aircraft —
 * so ids in `alreadyAssociatedIds` are exempt from the archived check (only
 * from that one: existence is still enforced for every id). Review 4.3 F1:
 * without the exemption, a type retaining a later-archived aircraft was
 * uneditable (even a price-only edit 409ed).
 */
async function assertAircraftEligible(aircraftIds: string[], alreadyAssociatedIds: ReadonlySet<string> = new Set()): Promise<void> {
  if (aircraftIds.length === 0) {
    return;
  }

  const aircraft = await prisma.aircraft.findMany({
    where: { id: { in: aircraftIds } },
    select: { id: true, archivedAt: true },
  });
  const byId = new Map(aircraft.map((entry) => [entry.id, entry]));

  for (const id of aircraftIds) {
    const match = byId.get(id);
    if (!match) {
      throw new NotFoundError('Aircraft not found.');
    }
    if (match.archivedAt !== null && !alreadyAssociatedIds.has(id)) {
      throw new ConflictError('Cannot associate an archived aircraft with a package type.');
    }
  }
}

/**
 * Lists the package-type listino (AC 1). `finance.manage` (staff+admin) —
 * staff sells packages from this list in story 4.4 and reads it now; only
 * the write side below is stricter (`settings.manage`, admin-only pricing
 * configuration — same split as `AircraftRate`/`InstructorRate`, epic 4).
 * Ordered by name; defensively capped at `take: 500` (small, admin-managed
 * listino, same choice as `listCashCategories`/`listAircraftRates`).
 */
export async function listPackageTypes(actor: Actor, query: ListPackageTypesQuery): Promise<PackageTypeListItem[]> {
  authorize(actor, 'finance.manage');

  const packageTypes = await prisma.packageType.findMany({
    where: query.includeInactive ? undefined : { isActive: true },
    select: PACKAGE_TYPE_SELECT,
    orderBy: { name: 'asc' },
    take: 500,
  });

  return packageTypes.map(toListItem);
}

/**
 * Creates a package type (AC 1). `settings.manage` (admin) only — listino
 * configuration, same as `createCashCategory`/`createAircraftRate`. Name
 * uniqueness: `trim()` + pre-check `findFirst` + `try/catch` `P2002`
 * backstop (the check-then-write race, same pattern as
 * `rates.service.ts#assertRateAvailable`). The type row and its
 * eligible-aircraft join rows are created in ONE transaction — a failure
 * partway through (e.g. the `createMany` below) must never leave an
 * eligible-aircraft-less type silently committed.
 */
export async function createPackageType(actor: Actor, input: CreatePackageTypeInput): Promise<PackageTypeListItem> {
  authorize(actor, 'settings.manage');

  const name = input.name.trim();
  const aircraftIds = dedupIds(input.aircraftIds);

  const existing = await prisma.packageType.findFirst({ where: { name }, select: { id: true } });
  if (existing) {
    throw new ConflictError('A package type with this name already exists.');
  }

  await assertAircraftEligible(aircraftIds);

  try {
    const packageType = await prisma.$transaction(async (tx) => {
      const created = await tx.packageType.create({
        data: {
          name,
          includedMinutes: input.includedMinutes,
          priceCents: input.priceCents,
          validityMonths: input.validityMonths ?? null,
        },
        select: { id: true },
      });

      if (aircraftIds.length > 0) {
        await tx.packageTypeAircraft.createMany({
          data: aircraftIds.map((aircraftId) => ({ packageTypeId: created.id, aircraftId })),
        });
      }

      return tx.packageType.findUniqueOrThrow({ where: { id: created.id }, select: PACKAGE_TYPE_SELECT });
    });

    return toListItem(packageType);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('A package type with this name already exists.');
    }
    throw error;
  }
}

/**
 * Partially updates a package type (AC 1). `settings.manage` only. Every
 * field is optional — `validityMonths: null` explicitly clears the validity
 * (no expiry), while an absent `validityMonths` leaves it untouched (the
 * schema's `.refine` already rejects a wholly empty body upstream).
 * `aircraftIds`, when present, REPLACES the eligible-aircraft set entirely
 * (`deleteMany` + `createMany`, same transaction) — never a partial patch of
 * it. Editing a type that already has sold packages is deliberately LEGAL
 * (Contesto: the sale snapshots price/minutes, so this never rewrites
 * history) — there is no "sold" guard here, only the 404/409 shape checks
 * below.
 */
export async function updatePackageType(actor: Actor, id: string, input: UpdatePackageTypeInput): Promise<PackageTypeListItem> {
  authorize(actor, 'settings.manage');

  const existing = await prisma.packageType.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new NotFoundError('Package type not found.');
  }

  const name = input.name !== undefined ? input.name.trim() : undefined;
  if (name !== undefined) {
    const duplicate = await prisma.packageType.findFirst({ where: { name, NOT: { id } }, select: { id: true } });
    if (duplicate) {
      throw new ConflictError('A package type with this name already exists.');
    }
  }

  let aircraftIds: string[] | undefined;
  if (input.aircraftIds !== undefined) {
    aircraftIds = dedupIds(input.aircraftIds);
    // Retained associations are exempt from the archived check (review 4.3
    // F1): the form re-sends the full set, so an aircraft archived after
    // association must not block the edit — only genuinely NEW associations
    // are held to the active-aircraft rule.
    const current = await prisma.packageTypeAircraft.findMany({
      where: { packageTypeId: id },
      select: { aircraftId: true },
    });
    await assertAircraftEligible(aircraftIds, new Set(current.map((row) => row.aircraftId)));
  }

  try {
    const packageType = await prisma.$transaction(async (tx) => {
      await tx.packageType.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(input.includedMinutes !== undefined ? { includedMinutes: input.includedMinutes } : {}),
          ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
          ...(input.validityMonths !== undefined ? { validityMonths: input.validityMonths } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });

      if (aircraftIds !== undefined) {
        await tx.packageTypeAircraft.deleteMany({ where: { packageTypeId: id } });
        if (aircraftIds.length > 0) {
          await tx.packageTypeAircraft.createMany({
            data: aircraftIds.map((aircraftId) => ({ packageTypeId: id, aircraftId })),
          });
        }
      }

      return tx.packageType.findUniqueOrThrow({ where: { id }, select: PACKAGE_TYPE_SELECT });
    });

    return toListItem(packageType);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('A package type with this name already exists.');
    }
    throw error;
  }
}

/**
 * Deletes a package type — ONLY when it has never been sold (AC 2/3).
 * `settings.manage` only. Story 4.4 completes AC 2's constraint with an
 * explicit pre-check (`_count.soldPackages > 0` -> 409 with a clear
 * message) NOW that `HourPackage` exists; the `P2003` catch remains as the
 * concurrency backstop (a sale that slips in between the pre-check and the
 * `DELETE` still reads as the same `Conflict`, never a raw 500 — same
 * pre-check + backstop shape as every other unique/FK guard in this
 * codebase). Join rows are deleted in the same transaction as the type
 * itself.
 */
export async function deletePackageType(actor: Actor, id: string): Promise<void> {
  authorize(actor, 'settings.manage');

  const existing = await prisma.packageType.findUnique({
    where: { id },
    select: { id: true, _count: { select: { soldPackages: true } } },
  });
  if (!existing) {
    throw new NotFoundError('Package type not found.');
  }
  if (existing._count.soldPackages > 0) {
    throw new ConflictError('This package type has sold packages — deactivate it instead.');
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.packageTypeAircraft.deleteMany({ where: { packageTypeId: id } });
      await tx.packageType.delete({ where: { id } });
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new ConflictError('This package type has sold packages — deactivate it instead.');
    }
    throw error;
  }
}
