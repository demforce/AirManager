import { z } from './zod-with-openapi';

// --- Package types (story 4.3, Task 1/2/3, AC 1/2) --------------------------
// Configuration/listino, NOT a ledger (see `PackageType` doc-comment): this
// is why an update is a plain PATCH — a rate/category-like lifecycle, never
// append-only. The sale (story 4.4) snapshots price/minutes onto the sold
// `HourPackage`, so editing the catalogue afterwards never rewrites history.

/**
 * `POST /api/v1/package-types` body (AC 1). `name` unique (enforced in the
 * service, P2002 → `Conflict`), trimmed, capped at 100 chars (same
 * defense-in-depth as `createCashCategorySchema.name`). `includedMinutes` is
 * an integer number of minutes (AD-2 — same cardinal rule as
 * `Aircraft.hourMeterMinutes`), never a decimal-hours value; `priceCents` is
 * an integer number of euro cents (AD-2). Both are `.positive()` and capped
 * at the Postgres INTEGER max (same defense-in-depth as
 * `createAircraftRateSchema.priceCentsPerHour`). `validityMonths` is the
 * OPTIONAL validity of a sold package, in whole months — `.positive()` when
 * present, capped at 600 (50 years, a defensive ceiling, not a real limit);
 * omitted or `null` means no expiry. `aircraftIds` is the set of eligible
 * aircraft (deduplicated in the service) — defaults to an empty set (a
 * package type with no eligible aircraft yet is a valid, if useless, draft).
 */
export const createPackageTypeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  includedMinutes: z.number().int().positive().max(2_147_483_647),
  priceCents: z.number().int().positive().max(2_147_483_647),
  validityMonths: z.number().int().positive().max(600).nullable().optional(),
  aircraftIds: z.array(z.string().min(1)).max(100).default([]),
});

export type CreatePackageTypeInput = z.infer<typeof createPackageTypeSchema>;

/**
 * `PATCH /api/v1/package-types/{id}` body (AC 1) — every field optional so a
 * caller can patch just one (e.g. only `priceCents`). `validityMonths`
 * distinguishes `undefined` (leave unchanged) from `null` (clear the
 * validity, the package never expires) — the service relies on this exact
 * distinction (Dev Notes). `aircraftIds`, when present, is the FULL
 * replacement of the eligible-aircraft set (never a partial patch of it).
 * `.refine`: an empty body is a 422, not a silent no-op PATCH.
 */
export const updatePackageTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    includedMinutes: z.number().int().positive().max(2_147_483_647).optional(),
    priceCents: z.number().int().positive().max(2_147_483_647).optional(),
    validityMonths: z.number().int().positive().max(600).nullable().optional(),
    isActive: z.boolean().optional(),
    aircraftIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided.' });

export type UpdatePackageTypeInput = z.infer<typeof updatePackageTypeSchema>;

/**
 * `GET /api/v1/package-types` query — `includeInactive` defaults to `false`
 * (the future 4.4 sale picker only wants active types); the management page
 * passes `true`. Same `z.preprocess` footgun-avoidance as
 * `listCashCategoriesQuerySchema.includeInactive` — `z.coerce.boolean()`
 * would treat the string `"false"` as truthy.
 */
export const listPackageTypesQuerySchema = z.object({
  includeInactive: z.preprocess((value) => value === 'true' || value === true, z.boolean()).default(false),
});

export type ListPackageTypesQuery = z.infer<typeof listPackageTypesQuerySchema>;

/** One eligible-aircraft entry embedded in a package type (AC 1). */
export const packageTypeEligibleAircraftSchema = z.object({
  id: z.string(),
  registration: z.string(),
});

export type PackageTypeEligibleAircraftDto = z.infer<typeof packageTypeEligibleAircraftSchema>;

/**
 * One entry of `GET /api/v1/package-types` (AC 1). Documentation only,
 * mirroring `package-types.service.ts`'s `PackageTypeListItem`. The
 * "effective hourly price" is NEVER part of this wire shape (Dev Notes,
 * AD-2) — it is derived client/server-side for display only, from
 * `priceCents`/`includedMinutes`, and never persisted or transmitted as its
 * own field.
 */
export const packageTypeItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  includedMinutes: z.number().int().positive(),
  priceCents: z.number().int().positive(),
  validityMonths: z.number().int().positive().nullable(),
  isActive: z.boolean(),
  eligibleAircraft: z.array(packageTypeEligibleAircraftSchema),
  createdAt: z.iso.datetime(),
});

export type PackageTypeItemDto = z.infer<typeof packageTypeItemSchema>;

/**
 * `GET /api/v1/package-types` response — a plain array, not the AD-8
 * paginated envelope (Dev Notes: small, admin-managed listino, same choice
 * as `cashCategoryListResponseSchema`), defensively capped at `take: 500` in
 * the service.
 */
export const packageTypeListResponseSchema = z.array(packageTypeItemSchema);

export type PackageTypeListResponseDto = z.infer<typeof packageTypeListResponseSchema>;
