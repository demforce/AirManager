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
