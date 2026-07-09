import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { z } from './zod-with-openapi';

// --- Public PPR request (epic 8, story 8.1, FR-22) --------------------------
// The first PUBLIC (`security: []`) request/response pair in this codebase
// — see `ppr.service.ts#createPprRequest`'s doc-comment for the AD-5
// deroga (no `Actor` at all) and the full honeypot/rate-limit/validation
// ordering.

/**
 * `POST /api/v1/ppr-requests` body. Every free-text field is `trim()`med
 * with a generous `.max()` bound (Dev Notes lesson: "bound sugli input
 * stringa ovunque" — a public, unauthenticated endpoint is the LAST place
 * to skip this). `eta`/`etd` are full instants (`z.iso.datetime()`, ISO
 * 8601 UTC wire format, AD-8, same pattern as `createBookingSchema`) —
 * deliberately NO cross-field refine here for "eta in the past" or "etd
 * not after eta": those become the stable `ETA_IN_PAST`/
 * `ETD_NOT_AFTER_ETA` 422 codes produced by `ppr.service.ts` (Contesto),
 * not a generic Zod `VALIDATION_ERROR` — the same reasoning as
 * `createBookingSchema`'s "startsAt in the past" check living
 * service-side rather than as a schema refine.
 *
 * `locale` mirrors `User.locale`'s `'it'|'en'` convention — the language
 * the FORM was submitted in (NFR-1), which drives the receipt email; never
 * a lookup.
 *
 * `website` is the honeypot (AC 2): an innocuously-named optional field a
 * bot's generic form-filler is likely to populate, a human never sees it
 * (the form hides it off-screen, `ppr-form.tsx`, `aria-hidden` +
 * `tabIndex={-1}`). Yes, it is part of this schema and therefore appears in
 * the generated OpenAPI document like every other field here — an accepted,
 * declared tradeoff (Contesto): bots fill the rendered HTML, not the spec.
 */
export const createPprRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  phone: z.string().trim().min(1).max(30),
  /** "Marche" (tail number), free text — not necessarily one of this aviosuperficie's own aircraft. */
  aircraftRegistration: z.string().trim().min(1).max(20),
  aircraftType: z.string().trim().min(1).max(100),
  origin: z.string().trim().min(1).max(100),
  destination: z.string().trim().min(1).max(100),
  eta: z.iso.datetime(),
  etd: z.iso.datetime().optional(),
  personsOnBoard: z.number().int().min(1).max(99),
  notes: z.string().trim().max(1000).optional(),
  locale: z.enum(['it', 'en']),
  /** Honeypot — see the schema's doc-comment. Never rendered visibly to a human. */
  website: z.string().max(200).optional(),
});

export type CreatePprRequestInput = z.infer<typeof createPprRequestSchema>;

/**
 * `POST /api/v1/ppr-requests` response — deliberately minimal (Contesto):
 * no `id`, no echo of the submitted data. The requester has no use for
 * either (the outcome arrives by email in story 8.2) and an anonymous
 * public endpoint should not hand back an enumerable identifier for free.
 * Also returned, byte-identical, when the honeypot silently rejects a
 * submission (AC 2) — "indistinguishable from success" is the whole point.
 */
export const pprRequestCreatedResponseSchema = z.object({
  status: z.literal('PENDING'),
});

export type PprRequestCreatedResponseDto = z.infer<typeof pprRequestCreatedResponseSchema>;

// --- Staff approval queue (epic 8, story 8.2, FR-23) -------------------------
// `authorize(actor, 'ppr.manage')` gates every function below — see
// `ppr.service.ts`'s module doc-comment (AD-5, unlike the public schemas
// above).

/** Mirrors the Prisma `PprStatus` enum. */
export const pprStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED']);

export type PprStatusDto = z.infer<typeof pprStatusSchema>;

/**
 * `GET /api/v1/ppr-requests` query (AC 1/2). `status` defaults to `PENDING`
 * — the actionable queue, FIFO (`createdAt asc`) — same
 * `paginationQuerySchema.extend` + `.optional().default(...)` pattern as
 * `listExpiryProposalsQuerySchema`.
 */
export const listPprRequestsQuerySchema = paginationQuerySchema.extend({
  status: pprStatusSchema.optional().default('PENDING'),
});

export type ListPprRequestsQuery = z.infer<typeof listPprRequestsQuerySchema>;

/**
 * One queue entry, ALL detail fields (Contesto: "vede le richieste in
 * attesa, il dettaglio") EXCEPT `submitterIp` — a technical anti-abuse
 * datum (GDPR/NFR-3, see the `PprRequest` model doc-comment), never exposed
 * to staff. Mirrors `ppr.service.ts`'s `PprRequestListItem`.
 */
export const pprRequestItemSchema = z.object({
  id: z.string(),
  status: pprStatusSchema,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string(),
  aircraftRegistration: z.string(),
  aircraftType: z.string(),
  origin: z.string(),
  destination: z.string(),
  eta: z.iso.datetime(),
  etd: z.iso.datetime().nullable(),
  personsOnBoard: z.number().int(),
  notes: z.string().nullable(),
  locale: z.enum(['it', 'en']),
  /** `'PPR-<year>-NNNN'` (AC 1) — `null` while `PENDING` and stays `null` forever on a `REJECTED` request. */
  pprNumber: z.string().nullable(),
  /** Mandatory on REJECT (AC 2) — `null` on every other status. */
  rejectionReason: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decidedByUserId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type PprRequestItemDto = z.infer<typeof pprRequestItemSchema>;

/** `GET /api/v1/ppr-requests` response — the AD-8 paginated envelope. */
export const pprRequestListResponseSchema = paginatedResponseSchema(pprRequestItemSchema);

export type PprRequestListResponseDto = z.infer<typeof pprRequestListResponseSchema>;

/**
 * `POST /api/v1/ppr-requests/{id}/reject` body (AC 2) — `reason` mandatory,
 * same `.trim().min(1).max(500)` bound as `reverseCashMovementSchema`.
 */
export const rejectPprRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type RejectPprRequestInput = z.infer<typeof rejectPprRequestSchema>;

// --- Operating instructions (epic 8, story 8.2, AC 1) ------------------------
// First real use of `AppSetting` — see `app-settings.service.ts`. GET is
// gated `ppr.manage` (staff sees them in the queue's email preview context),
// PUT is `settings.manage` (admin-only edit).

/**
 * `{ it, en }` — an admin-edited operational note appended to the approval
 * email in the requester's OWN form locale, ONLY when non-empty for that
 * locale (`templates.ts#buildPprApprovalEmail`). Absent/never-set reads as
 * `''` for both languages (`app-settings.service.ts`), never `null` — a
 * bare textarea default, not a tri-state.
 */
export const pprOperatingInstructionsSchema = z.object({
  it: z.string().trim().max(2000),
  en: z.string().trim().max(2000),
});

export type PprOperatingInstructionsDto = z.infer<typeof pprOperatingInstructionsSchema>;
