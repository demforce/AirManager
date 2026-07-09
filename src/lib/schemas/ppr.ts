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
