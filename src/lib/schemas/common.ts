import { z } from './zod-with-openapi';

/**
 * AD-8 error envelope, shared by every documented `/api/v1/*` error
 * response (401/403/404/409/422/500) — the OpenAPI registry (story 1.5)
 * references this one schema instead of redefining the shape per status
 * code. Mirrors `errorEnvelope()` in `src/lib/api/handler.ts`.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ErrorEnvelopeDto = z.infer<typeof errorEnvelopeSchema>;

/** Trivial `{ ok: true }` acknowledgement used by fire-and-forget action endpoints. */
export const okResponseSchema = z.object({ ok: z.literal(true) });

export type OkResponseDto = z.infer<typeof okResponseSchema>;

/**
 * Story 10.1 (AC 1/2, FR-39) — the two query params every list endpoint's
 * `?format=xlsx` export adds, shared by ALL 10 covered endpoints (spine
 * convention: "ogni endpoint elenco accetta `?format=xlsx`", SAME route, no
 * dedicated export path). `.shape` is spread into each domain's own list
 * query schema (`.extend({ ...exportQuerySchema.shape, ... })`) rather than
 * composed via `.extend(exportQuerySchema)` directly, since several of those
 * schemas wrap their `.extend(...)` in a `.refine(...)` — the shape must
 * join the underlying `ZodObject` BEFORE that refine, not after (`ZodEffects`
 * has no `.extend`).
 *
 * `format` is optional (its absence is the existing JSON branch, unchanged);
 * `locale` is optional too (deliberately NOT `.default('it')`, unlike most
 * other optional query fields in this codebase): a Zod `.default()` makes
 * the field REQUIRED in the inferred output type (`z.infer`), and every one
 * of these 10 query types is also used as a plain TS parameter type by
 * server components that call the list service directly with a hand-built
 * object — e.g. `dashboard/aircraft/page.tsx` — never through
 * `.safeParse()`, so no default would ever apply to them. `locale`'s
 * default-to-`'it'` (AC 2) is instead applied once, at the point of use,
 * in `exports.service.ts` — ignored entirely on the JSON branch either way
 * (Dev Notes).
 */
export const exportQuerySchema = z.object({
  format: z.enum(['xlsx']).optional(),
  locale: z.enum(['it', 'en']).optional(),
});

export type ExportQuery = z.infer<typeof exportQuerySchema>;

/**
 * Story 10.2 (AC 2, FR-40) — the ONE query param a dedicated PDF export
 * route needs beyond its view's own filters: `locale`. Unlike
 * {@link exportQuerySchema}, there is no `format` field — a PDF export lives
 * on its OWN route (`/api/v1/**\/pdf`, spine :105), never behind
 * `?format=pdf` on the list endpoint (that convention is xlsx-only, AC 1 of
 * story 10.1). Used standalone by routes with no other filters (the account
 * statement); routes that also need the view's own filters (flights,
 * expiries) reuse that view's OWN list query schema directly instead
 * (already carries `locale` via `exportQuerySchema.shape`).
 */
export const pdfQuerySchema = z.object({
  locale: z.enum(['it', 'en']).optional(),
});

export type PdfQuery = z.infer<typeof pdfQuerySchema>;
