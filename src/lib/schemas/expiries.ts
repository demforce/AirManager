import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { exportQuerySchema } from './common';
import { expiryScopeSchema } from './expiry-types';
import { z } from './zod-with-openapi';

// --- Expiries (epic 6, story 6.2, Task 1/2/4, AC 1/2; FR-36) ----------------
// The scadenza registered against a person + `ExpiryType` (story 6.1) — a
// CURRENT abilitative state, never a ledger (see the `Expiry` model doc).
// Computed status (`ok`/`expiring`/`expired`) is server-computed
// (`src/lib/expiry-status.ts`) and always shipped ready-to-render — never
// recomputed client-side (Dev Notes: a client clock skew must not change
// the badge). Story 12.13 (ratifica utente 4b) retired the titolare-facing
// update-proposal flow (`ExpiryUpdateProposal` stays in the schema,
// dormant, §9) — `pendingProposalSummarySchema` below is a READ-ONLY
// leftover for any pre-cutover proposal still `PENDING`.

/** Mirrors `src/lib/expiry-status.ts`'s `ExpiryStatus` — server-computed, NEVER recomputed client-side (Dev Notes). */
export const expiryStatusSchema = z.enum(['ok', 'expiring', 'expired']);

export type ExpiryStatusDto = z.infer<typeof expiryStatusSchema>;

/**
 * The pending proposal summary embedded on a `GET .../expiries` list item
 * (AC 2) — `null` when no proposal is currently pending for that scadenza.
 * Just enough to render the "proposta in attesa" badge/hint (story 12.13:
 * the propose/decide flow that used to produce these is gone — a
 * non-`null` value can now only come from a proposal filed before the
 * cutover).
 */
export const pendingProposalSummarySchema = z.object({
  id: z.string(),
  proposedIssuedAt: z.iso.date(),
  proposedExpiresAt: z.iso.date(),
  proposedNotes: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type PendingProposalSummaryDto = z.infer<typeof pendingProposalSummarySchema>;

/**
 * One entry of `GET /api/v1/people/{id}/expiries` (AC 1/2). Mirrors
 * `expiries.service.ts`'s `ExpiryListItem`. `typeName`/`typeScope` are
 * denormalized from `ExpiryType` at read time (never snapshotted — a type
 * rename/re-scope is immediately visible, per that model's doc-comment).
 */
export const expiryItemSchema = z.object({
  id: z.string(),
  expiryTypeId: z.string(),
  typeName: z.string(),
  typeScope: z.enum(['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL']),
  expiresAt: z.iso.date(),
  notes: z.string().nullable(),
  status: expiryStatusSchema,
  pendingProposal: pendingProposalSummarySchema.nullable(),
});

export type ExpiryItemDto = z.infer<typeof expiryItemSchema>;

/**
 * `GET /api/v1/people/{id}/expiries` response — a plain array (no
 * pagination), same choice as `hourPackageListResponseSchema`/
 * `instructorRateListResponseSchema`: a single person's scadenze are a
 * small, bounded set (`take: 200` in the service).
 */
export const expiryListResponseSchema = z.array(expiryItemSchema);

export type ExpiryListResponseDto = z.infer<typeof expiryListResponseSchema>;

/**
 * `POST /api/v1/expiries` body (AC 1). `personId`/`expiryTypeId` reference
 * existing rows (404/409 checked in the service — scope compatibility,
 * duplicate, deactivated type); `expiresAt` is a calendar date
 * (`z.iso.date()`, same convention as `createAircraftRateSchema.validFrom`).
 * No future/past constraint (Contesto: an already-expired scadenza can
 * legitimately be registered — it is the real state of the world). There
 * used to be an `issuedAt` alongside it plus a cross-field `expiresAt >=
 * issuedAt` refine (story 6.2); story 13.1's review (R6, PO ratifica
 * 2026-07-23) dropped `issuedAt` — see `Expiry`'s Prisma doc-comment.
 */
export const registerExpirySchema = z.object({
  personId: z.string().min(1),
  expiryTypeId: z.string().min(1),
  expiresAt: z.iso.date(),
  notes: z.string().trim().max(500).optional(),
});

export type RegisterExpiryInput = z.infer<typeof registerExpirySchema>;

/**
 * `PATCH /api/v1/expiries/{id}` body (AC 1) — every field optional so a
 * caller can patch just one; `notes: null` explicitly clears it (distinct
 * from an absent `notes`, which leaves it untouched — same
 * undefined-vs-null convention as `updatePackageTypeSchema.validityMonths`,
 * story 4.3). `personId`/`expiryTypeId` are NOT patchable here (Contesto: a
 * wrong type/person is corrected by delete + re-register, never an edit in
 * place).
 */
export const updateExpirySchema = z
  .object({
    expiresAt: z.iso.date().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided.' });

export type UpdateExpiryInput = z.infer<typeof updateExpirySchema>;

// --- Expiry dashboard (epic 6, story 6.4, AC 1; FR-38) ----------------------
// The staff-facing "Tutte le scadenze" landing (`/dashboard/expiries`) — every
// scadenza across every person, ordered by urgency. `status` is NEVER
// post-filtered client-side: it maps to an `expiresAt` date range in the
// service (`expiries.service.ts#listAllExpiries`'s doc-comment), using the
// SAME `today`/`EXPIRY_WARNING_DAYS` boundary the per-row `status` field
// (`expiryStatusSchema`, computed via `computeExpiryStatus`) already uses —
// the two always agree by construction.

/**
 * `GET /api/v1/expiries` query (AC 1). Every filter optional and
 * AND-combinable (pattern `listFlightsQuerySchema`, story 5.4).
 * `expiryTypeId` is an exact-match filter, not a lookup — an id that does
 * not exist yields an empty page, never a 404 (same convention as
 * `personId`/`aircraftId` on `listFlightsQuerySchema`). `personQuery`
 * (story 13.5, AC 9) is a SEPARATE, free-text narrowing filter —
 * case-insensitive substring match on the linked person's
 * `firstName`/`lastName` (the Scadenze registry's free-text pilot filter,
 * replacing its old `SearchCombobox` picker) — AND-combined with every
 * other filter, `personId` included.
 */
/**
 * The Scadenze registry's "finestra" segmented filter (story 12.11, AC 3) —
 * mirrors the prototype's own `win` state (`ScadenzeView.jsx`): `expiresAt
 * <= today + N` for `'7'`/`'30'`/`'60'` (NO lower bound — an already-expired
 * row still matches every one of those, same as the prototype's `d<=N`),
 * `'expired'` is `expiresAt < today`. Deliberately DISTINCT from `status`
 * above (3 bands: ok/expiring/expired) — this is a coarser day-count cutoff
 * with 4 bands matching the alert job's own cadence markers
 * (`EXPIRY_ALERT_THRESHOLDS`).
 */
export const expiryWindowSchema = z.enum(['60', '30', '7', 'expired']);

export type ExpiryWindowDto = z.infer<typeof expiryWindowSchema>;

export const listAllExpiriesQuerySchema = paginationQuerySchema.extend({
  expiryTypeId: z.string().trim().min(1).optional(),
  scope: expiryScopeSchema.optional(),
  status: expiryStatusSchema.optional(),
  window: expiryWindowSchema.optional(),
  personId: z.string().trim().min(1).optional(),
  personQuery: z.string().trim().min(1).optional(),
  ...exportQuerySchema.shape,
});

export type ListAllExpiriesQuery = z.infer<typeof listAllExpiriesQuerySchema>;

/**
 * One entry of `GET /api/v1/expiries` (AC 1). Mirrors
 * `expiries.service.ts`'s `ExpiryDashboardItem` — `personFirstName`/
 * `personLastName`/`typeName`/`typeScope` denormalized at read time (never
 * snapshotted, same choice as `expiryItemSchema`).
 */
export const expiryDashboardItemSchema = z.object({
  id: z.string(),
  personId: z.string(),
  personFirstName: z.string(),
  personLastName: z.string(),
  expiryTypeId: z.string(),
  typeName: z.string(),
  typeScope: expiryScopeSchema,
  expiresAt: z.iso.date(),
  notes: z.string().nullable(),
  status: expiryStatusSchema,
  /** Calendar-day count `expiresAt - today` (story 12.11, AC 3) — same `daysUntilUtc` arithmetic `status` is derived from; negative = already expired. Powers the registry's colored "Giorni" column (`{d}g` / `{|d|}g fa`). */
  daysUntil: z.number().int(),
});

export type ExpiryDashboardItemDto = z.infer<typeof expiryDashboardItemSchema>;

/** `GET /api/v1/expiries` response — the AD-8 paginated envelope (same shape as `listCashMovements`'s). */
export const expiryDashboardListResponseSchema = paginatedResponseSchema(expiryDashboardItemSchema);

export type ExpiryDashboardListResponseDto = z.infer<typeof expiryDashboardListResponseSchema>;
