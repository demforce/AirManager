import { z } from './zod-with-openapi';

// --- Expiry types (story 6.1, Task 1/2/3, AC 1/2; FR-35) --------------------
// Catalogue/configuration, NOT a ledger (see `ExpiryType` doc-comment): same
// mutable lifecycle shape as `CashCategory` (story 3.4) / `PackageType`
// (story 4.3) — create/update/deactivate freely, delete only while unused.
// The actual scadenze registered against a type (`Expiry`) arrive in story
// 6.2 — this schema file only covers the catalogue.

/**
 * The "ambito" of an expiry type (AC 1) — who it is meant for. `ALL` matches
 * any person; every other value matches a person with the corresponding
 * profile currently active. Mirrors the Prisma `ExpiryScope` enum.
 */
export const expiryScopeSchema = z.enum(['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL']);

export type ExpiryScopeDto = z.infer<typeof expiryScopeSchema>;

/**
 * `POST /api/v1/expiry-types` body (AC 1/2). `name` unique (enforced in the
 * service, P2002 → `Conflict`), trimmed, capped at 100 chars — same
 * defense-in-depth as `createCashCategorySchema.name`/
 * `createPackageTypeSchema.name`. `blocksBooking` (epic 7, story 7.4;
 * FR-21) defaults `false` — a brand-new/custom type never blocks a booking
 * until an admin (`settings.manage`) opts it in from `types-manager.tsx`'s
 * checkbox.
 */
/**
 * Validity window in months (story 12.11, ratifica utente 2) — precompiles
 * `expiresAt` at registration time (`issuedAt + validityMonths`, editable).
 * `null`/`0` both mean "no expiry" — the catalogue UI shows a "senza
 * scadenza" badge for either. Bounded at 600 (50 years, generously above
 * any real-world validity window — a defensive `Int` guard, not a domain
 * rule).
 */
export const expiryTypeValidityMonthsSchema = z.number().int().nonnegative().max(600).nullable();

export const createExpiryTypeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scope: expiryScopeSchema,
  blocksBooking: z.boolean().default(false),
  validityMonths: expiryTypeValidityMonthsSchema.default(null),
});

export type CreateExpiryTypeInput = z.infer<typeof createExpiryTypeSchema>;

/**
 * `PATCH /api/v1/expiry-types/{id}` body (AC 1/2) — every field optional so
 * a caller can patch just one; `isActive` toggling the lifecycle also goes
 * through here (no dedicated deactivate/reactivate endpoints, following
 * `package-types.service.ts`'s pattern, NOT `cash.service.ts`'s). `.refine`:
 * an empty body is a 422, not a silent no-op PATCH (same pattern as
 * `updatePackageTypeSchema`). `blocksBooking` (story 7.4) is patchable
 * independently of every other field — the admin can toggle "Blocca
 * prenotazioni" on an existing type without touching its name/scope.
 */
export const updateExpiryTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    scope: expiryScopeSchema.optional(),
    isActive: z.boolean().optional(),
    blocksBooking: z.boolean().optional(),
    validityMonths: expiryTypeValidityMonthsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided.' });

export type UpdateExpiryTypeInput = z.infer<typeof updateExpiryTypeSchema>;

/**
 * `GET /api/v1/expiry-types` query — `includeInactive` defaults to `false`
 * (a future registration picker, story 6.2, only wants active types); the
 * management page passes `true`. Same `z.preprocess` footgun-avoidance as
 * `listCashCategoriesQuerySchema.includeInactive` — `z.coerce.boolean()`
 * would treat the string `"false"` as truthy.
 */
export const listExpiryTypesQuerySchema = z.object({
  includeInactive: z.preprocess((value) => value === 'true' || value === true, z.boolean()).default(false),
});

export type ListExpiryTypesQuery = z.infer<typeof listExpiryTypesQuerySchema>;

/**
 * One entry of `GET /api/v1/expiry-types` (AC 1/2). Documentation only,
 * mirroring `expiry-types.service.ts`'s `ExpiryTypeListItem`. `blocksBooking`
 * (story 7.4) is additive — every 6.1/6.2 consumer of this DTO already
 * ignores unknown fields.
 */
export const expiryTypeItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: expiryScopeSchema,
  isActive: z.boolean(),
  blocksBooking: z.boolean(),
  validityMonths: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});

export type ExpiryTypeItemDto = z.infer<typeof expiryTypeItemSchema>;

/**
 * `GET /api/v1/expiry-types` response — a plain array, not the AD-8
 * paginated envelope (Dev Notes: small, admin-managed catalogue, same
 * choice as `packageTypeListResponseSchema`/`cashCategoryListResponseSchema`),
 * defensively capped at `take: 500` in the service.
 */
export const expiryTypeListResponseSchema = z.array(expiryTypeItemSchema);

export type ExpiryTypeListResponseDto = z.infer<typeof expiryTypeListResponseSchema>;
