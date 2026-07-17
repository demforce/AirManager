import { z } from './zod-with-openapi';

/**
 * `GET /api/v1/metar` response (story 12.11, AC 5) — mirrors
 * `metar.service.ts#MetarData`. `null` whenever no station is configured or
 * the upstream fetch/parse failed for ANY reason (that service's own
 * contract: degrade silently, never throw) — the sidebar simply omits the
 * weather card in that case (unchanged behavior since story 12.1).
 */
export const metarCategorySchema = z.enum(['VFR', 'MVFR', 'IFR']);

export const metarDataSchema = z.object({
  raw: z.string(),
  tempC: z.number(),
  windDir: z.number(),
  windKt: z.number(),
  visM: z.number(),
  qnh: z.number(),
  category: metarCategorySchema,
});

export type MetarDataDto = z.infer<typeof metarDataSchema>;

export const metarResponseSchema = metarDataSchema.nullable();

export type MetarResponseDto = z.infer<typeof metarResponseSchema>;
