import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { paymentMethodSchema } from './accounts';
import { exportQuerySchema } from './common';
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

// --- Staff manual intake (epic 12, story 12.4, AC 1) -------------------------
// `POST /api/v1/ppr-requests/manual` — `ppr.manage`, shared by the console's
// "PPR manuale" slide-over (stays PENDING) and the movements page's
// "Registra arrivo" slide-over (`approveImmediately: true`, same endpoint,
// same body shape). No `website` honeypot field at all (staff, not public —
// `ppr.service.ts#createManualPprRequest`'s doc-comment).

/**
 * Unlike the public schema above, `email` is OPTIONAL here — a manual entry
 * may have only a phone number (Dev Notes: "il manuale può avere solo
 * telefono") — but `.refine` below still requires AT LEAST ONE contact
 * (email or phone), so a request with neither is rejected before it ever
 * reaches the service. `approveImmediately` (default `false`) is a WIRE
 * field only — the route bridges it into
 * `createManualPprRequest`'s own explicit `{ approveImmediately }` options
 * parameter (that function's doc-comment); the service does not read it off
 * `input` itself.
 */
export const createManualPprRequestSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    phone: z.string().trim().min(1).max(30).optional(),
    aircraftRegistration: z.string().trim().min(1).max(20),
    aircraftType: z.string().trim().min(1).max(100),
    origin: z.string().trim().min(1).max(100),
    destination: z.string().trim().min(1).max(100),
    eta: z.iso.datetime(),
    etd: z.iso.datetime().optional(),
    personsOnBoard: z.number().int().min(1).max(99),
    notes: z.string().trim().max(1000).optional(),
    locale: z.enum(['it', 'en']),
    approveImmediately: z.boolean().optional().default(false),
  })
  .refine((value) => Boolean(value.email) || Boolean(value.phone), {
    message: 'At least one contact (email or phone) is required.',
    path: ['phone'],
  });

export type CreateManualPprRequestInput = z.infer<typeof createManualPprRequestSchema>;

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
 * `listAllExpiriesQuerySchema`. `'ALL'` (story 8.3, AC 2) means no
 * status filter at all — an explicit, separate literal rather than
 * `status` becoming optional-and-absent-means-all, so the queue's own
 * default (`PENDING`, the 8.2 contract, unchanged) and the register's
 * "every status" both stay expressible with one required-with-default
 * field. `from`/`to` (`z.iso.date()`, date-only) bound `eta` — the register
 * is a register of ARRIVALS — resolved to a semi-open Europe/Rome instant
 * range service-side (`ppr.service.ts#listPprRequests`, same
 * `zonedMidnightUtc`/`addDaysDateOnly` pattern as story 7.2's calendar),
 * never compared as raw strings.
 */
/**
 * `PPR-<year>-NNNN` (story 15.9, R-15.9-h) — the exact shape
 * `ppr.service.ts` issues (`PPR-${year}-${String(seq).padStart(4, '0')}`),
 * with the sequence left open-ended upward so the 10.000th request of a year
 * stays queryable instead of answering 422 on a number the system itself
 * printed. A malformed value is a VALIDATION error (422), never a 500 and
 * never a silently-ignored filter.
 */
export const pprNumberSchema = z.string().regex(/^PPR-\d{4}-\d{4,}$/);

export const listPprRequestsQuerySchema = paginationQuerySchema
  .extend({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'ALL']).optional().default('PENDING'),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /**
     * Exact-match filter on the assigned PPR number (story 15.9, AC 15) — the
     * deep link from the approval queue to the transits register. Absent means
     * "no number filter", exactly like `from`/`to`; the number is `null` while
     * a request is PENDING and forever on a REJECTED one, so the UI only ever
     * offers the link where a number exists.
     */
    pprNumber: pprNumberSchema.optional(),
    ...exportQuerySchema.shape,
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must not be after to',
    path: ['to'],
  });

export type ListPprRequestsQuery = z.infer<typeof listPprRequestsQuerySchema>;

/**
 * One queue/register entry, ALL detail fields (Contesto: "vede le richieste
 * in attesa, il dettaglio") EXCEPT `submitterIp` — a technical anti-abuse
 * datum (GDPR/NFR-3, see the `PprRequest` model doc-comment), never exposed
 * to staff. Mirrors `ppr.service.ts`'s `PprRequestListItem`.
 */
export const pprRequestItemSchema = z.object({
  id: z.string(),
  status: pprStatusSchema,
  firstName: z.string(),
  lastName: z.string(),
  /** `null` for a manual entry with a phone but no email (epic 12, story 12.4, AC 1) — the public form always fills it. */
  email: z.string().nullable(),
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
  /** Landing fee charged at completion (story 8.3, AC 1), integer euro cents (AD-2) — `null` unless `COMPLETED`. 0 is a valid, distinct value (a waived fee is still a recorded decision), never confused with `null` (not yet closed, or closed via cancel). */
  landingFeeCents: z.number().int().nullable(),
  /** When this request was closed — completed or cancelled (story 8.3, AC 1/2). `null` while still `PENDING`/`APPROVED`/`REJECTED`. */
  closedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /** `true` when this request came in through the public `/ppr` form — i.e. `createdByUserId === null` (epic 12, story 12.4, AC 1/2). Drives the console's "da modulo web" badge. Deliberately a derived boolean, never the raw staff user id (Dev Notes: "niente id utente nel DTO"). */
  fromPublicForm: z.boolean(),
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

// --- Closure (epic 8, story 8.3, FR-24) --------------------------------------
// `authorize(actor, 'ppr.manage')` gates both — see `ppr.service.ts#completePprRequest`/
// `cancelPprRequest`'s doc-comments.

/**
 * `POST /api/v1/ppr-requests/{id}/complete` body (AC 1). `landingFeeCents`
 * is the fee actually charged — 0 included (Contesto: "tassa zero nessun
 * movimento" is a service-side branch, not a schema one; 0 is a fully valid
 * input here). Same `.int().min(0).max(2_147_483_647)` bound as
 * `recordCashMovementSchema.amountCents` (AD-2's `Int` ceiling). No default:
 * the caller (the register's completion panel) always sends a value,
 * prefilled from `GET /api/v1/settings/ppr-landing-fee` but editable.
 * `paymentMethod` (story Billing-1, AC 2; review D2 ratification, 2026-07-27)
 * is MANDATORY, same as `recordCashMovementSchema`'s — every completion,
 * even a waived (`landingFeeCents: 0`) one where no `CashMovement` is even
 * created, states how the fee would have been collected, so the "PPR"
 * category never grows `unattributedCents`. The completion panel's Select
 * defaults to `CASH` (`movements-table.tsx`), same default as every other
 * method picker in the app.
 */
export const completePprRequestSchema = z.object({
  landingFeeCents: z.number().int().min(0).max(2_147_483_647),
  paymentMethod: paymentMethodSchema,
});

export type CompletePprRequestInput = z.infer<typeof completePprRequestSchema>;

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

// --- Default landing fee (epic 8, story 8.3, AC 1) ---------------------------
// Exact mirror of the operating-instructions pair above: GET is
// `ppr.manage` (the completion panel prefills from it), PUT is
// `settings.manage` (admin-only edit) — see
// `app-settings.service.ts#getPprLandingFeeDefaultCents`/
// `setPprLandingFeeDefaultCents`.

/**
 * `{ landingFeeCents }` — the admin-configured default landing fee, integer
 * euro cents (AD-2), used to BOTH `GET`/`PUT
 * /api/v1/settings/ppr-landing-fee` (symmetric request/response shape, same
 * pattern as `pprOperatingInstructionsSchema`). Absent/never-configured
 * reads as `0` (`app-settings.service.ts`), never a missing field.
 */
export const pprLandingFeeDefaultSchema = z.object({
  landingFeeCents: z.number().int().min(0).max(2_147_483_647),
});

export type PprLandingFeeDefaultDto = z.infer<typeof pprLandingFeeDefaultSchema>;
