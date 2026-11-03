import { describe, expect, it } from 'vitest';
import { accountStatementPdfQuerySchema, listAccountMovementsQuerySchema } from './accounts';

/** Story 19.11, AC 1: the two statement queries share ONE period contract — optional bounds, `from <= to`, a 422 on `to` otherwise. */
describe.each([
  ['listAccountMovementsQuerySchema', listAccountMovementsQuerySchema],
  ['accountStatementPdfQuerySchema', accountStatementPdfQuerySchema],
] as const)('%s — the statement period (story 19.11, AC 1)', (_name, schema) => {
  it('accepts no period at all (the complete history, D-1)', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('accepts a valid pair, a one-day period and a single bound', () => {
    expect(schema.safeParse({ from: '2026-01-01', to: '2026-02-01' })).toMatchObject({ success: true, data: { from: '2026-01-01', to: '2026-02-01' } });
    expect(schema.safeParse({ from: '2026-01-01', to: '2026-01-01' }).success).toBe(true);
    expect(schema.safeParse({ from: '2026-01-01' }).success).toBe(true);
    expect(schema.safeParse({ to: '2026-01-01' }).success).toBe(true);
  });

  it('rejects an inverted pair, with the error on `to` (same message and path as cashReportQuerySchema)', () => {
    const result = schema.safeParse({ from: '2026-02-01', to: '2026-01-01' });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: ['to'], message: 'from must not be after to' })]);
  });

  it('rejects a date that is not a calendar date', () => {
    expect(schema.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(schema.safeParse({ to: '01/02/2026' }).success).toBe(false);
  });
});

describe('listAccountMovementsQuerySchema keeps its other params (story 3.2/10.1)', () => {
  it('still coerces page/pageSize and accepts the xlsx export params next to the period', () => {
    expect(listAccountMovementsQuerySchema.parse({ page: '2', pageSize: '50', format: 'xlsx', locale: 'en', from: '2026-01-01', to: '2026-01-31' })).toEqual({
      page: 2,
      pageSize: 50,
      format: 'xlsx',
      locale: 'en',
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });
});
