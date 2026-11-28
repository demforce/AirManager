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
 * RATING / MEDICAL / MEMBERSHIP (story 13.1, AC 1, R-13.1-a; story 19.7a,
 * R-19-k) — a SEPARATE axis from `scope` (who it's for): `kind` is WHAT it
 * is. Mirrors the Prisma `ExpiryTypeKind` enum — the shape every catalogue
 * item and the list filter carry.
 */
export const expiryTypeKindSchema = z.enum(['RATING', 'MEDICAL', 'MEMBERSHIP']);

export type ExpiryTypeKindDto = z.infer<typeof expiryTypeKindSchema>;

/**
 * The kinds a caller may WRITE (story 19.7a, D-1): `MEMBERSHIP` is a system
 * type upserted by `membership.service.ts`, so a create or a PATCH naming it
 * is a 422 `VALIDATION_ERROR` at this boundary. The "Abilitazioni" card
 * creates `RATING` (the default), the "Visite mediche" card `MEDICAL`.
 */
export const expiryTypeKindInputSchema = z.enum(['RATING', 'MEDICAL']);

/**
 * `POST /api/v1/expiry-types` body (AC 1/2). `name` unique (enforced in the
 * service, P2002 → `Conflict`), trimmed, capped at 100 chars — same
 * defense-in-depth as `createCashCategorySchema.name`/
 * `createPackageTypeSchema.name`. `blocksBooking` (epic 7, story 7.4;
 * FR-21) of a RATING is `false` when omitted — a brand-new/custom rating
 * never blocks a booking until an admin (`settings.manage`) opts it in
 * (resolved by the service since story 19.7a, see below).
 */
/**
 * Validity window in months (story 12.11, ratifica utente 2) — precompiles
 * `expiresAt` at registration time (`today + validityMonths`, editable;
 * story 13.1 review R6 dropped the `issuedAt` base this used to read).
 * `null`/`0` both mean "no expiry" — the catalogue UI shows a "senza
 * scadenza" badge for either. Bounded at 600 (50 years, generously above
 * any real-world validity window — a defensive `Int` guard, not a domain
 * rule).
 */
export const expiryTypeValidityMonthsSchema = z.number().int().nonnegative().max(600).nullable();

/**
 * Story 19.7a (AD-7): `scope` and `blocksBooking` are OPTIONAL with no Zod
 * default — `expiry-types.service.ts` resolves them by `kind`: a MEDICAL type
 * is always `ALL`/`true` (omitted = those values, explicit and different =
 * 422 `MEDICAL_TYPE_FIELDS`, R-19-j), a RATING takes `ALL`/`false` when they
 * are omitted (a retro-compatible loosening: the "Abilitazioni" card always
 * sends both).
 */
export const createExpiryTypeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scope: expiryScopeSchema.optional(),
  kind: expiryTypeKindInputSchema.default('RATING'),
  blocksBooking: z.boolean().optional(),
  validityMonths: expiryTypeValidityMonthsSchema.default(null),
});

export type CreateExpiryTypeInput = z.infer<typeof createExpiryTypeSchema>;

/**
 * `PATCH /api/v1/expiry-types/{id}` body (AC 1/2) — every field optional so
 * a caller can patch just one; `isActive` toggling the lifecycle also goes
 * through here (no dedicated deactivate/reactivate endpoints, unlike
 * `cash.service.ts`'s categories). `.refine`: an empty body is a 422, not a
 * silent no-op PATCH. `blocksBooking` (story 7.4) is patchable
 * independently of every other field — the admin can toggle "Blocca
 * prenotazioni" on an existing type without touching its name/scope.
 * `kind` (story 13.1 review F3) is ALSO independently patchable — the
 * backfill migration (`20260722190000_add_expiry_type_kind`) classifies
 * `kind` by an exact-name match on the seed's medical-visit types; without
 * this field a type that fell on the wrong side of that match (or a custom
 * type an admin later wants to move between Ratings/Visite mediche) would
 * be stuck — the create-only `kind` left the PATCH silently stripping it.
 */
export const updateExpiryTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    scope: expiryScopeSchema.optional(),
    kind: expiryTypeKindInputSchema.optional(),
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
 * would treat the string `"false"` as truthy. `kind` (story 13.1, AC 2) is
 * an OPTIONAL filter — omitted, every existing consumer (scadenze page,
 * editor, seed/fixtures) keeps seeing every kind, unchanged; `MEMBERSHIP`
 * (story 19.7a) returns the one membership-fee type.
 */
export const listExpiryTypesQuerySchema = z.object({
  includeInactive: z.preprocess((value) => value === 'true' || value === true, z.boolean()).default(false),
  kind: expiryTypeKindSchema.optional(),
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
  kind: expiryTypeKindSchema,
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
