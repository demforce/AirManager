import { describe, expect, it } from 'vitest';
import { flightTypeSchema, listFlightsQuerySchema } from './flights';
import { statsMovementMixKeySchema } from './stats';

/**
 * Story 19.5 (AC 3, AC 26): `FlightType` keeps only TOURISM and SCHOOL — the
 * removed AERIAL_WORK must be a validation error everywhere Zod sees it (the
 * API answers 422 `VALIDATION_ERROR` off these same schemas, `handler.ts`).
 */
describe('flight type schemas (story 19.5 — two flight types)', () => {
  it('flightTypeSchema accepts TOURISM and SCHOOL and rejects AERIAL_WORK', () => {
    expect(flightTypeSchema.options).toEqual(['TOURISM', 'SCHOOL']);
    expect(flightTypeSchema.safeParse('AERIAL_WORK').success).toBe(false);
  });

  it('listFlightsQuerySchema rejects flightType=AERIAL_WORK', () => {
    expect(listFlightsQuerySchema.safeParse({ flightType: 'TOURISM' }).success).toBe(true);
    const parsed = listFlightsQuerySchema.safeParse({ flightType: 'AERIAL_WORK' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['flightType']);
  });

  it('statsMovementMixKeySchema has exactly the two keys, in the card order', () => {
    expect(statsMovementMixKeySchema.options).toEqual(['SCHOOL', 'TOURISM']);
  });
});
