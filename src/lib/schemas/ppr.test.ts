import { describe, expect, it } from 'vitest';
import { listPprRequestsQuerySchema, pprOperatingInstructionsSchema, rejectPprRequestSchema } from './ppr';

describe('rejectPprRequestSchema (story 8.2, AC 2 — mandatory reason)', () => {
  it('accepts a non-empty, trimmed reason', () => {
    const parsed = rejectPprRequestSchema.safeParse({ reason: '  Missing insurance documents.  ' });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.reason).toBe('Missing insurance documents.');
  });

  it('rejects an empty string', () => {
    expect(rejectPprRequestSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  it('rejects a whitespace-only string (trimmed to empty)', () => {
    expect(rejectPprRequestSchema.safeParse({ reason: '   ' }).success).toBe(false);
  });

  it('rejects a missing reason field entirely', () => {
    expect(rejectPprRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a reason longer than 500 characters', () => {
    expect(rejectPprRequestSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
  });

  it('accepts a reason exactly at the 500-character bound', () => {
    expect(rejectPprRequestSchema.safeParse({ reason: 'x'.repeat(500) }).success).toBe(true);
  });
});

describe('pprOperatingInstructionsSchema (story 8.2, AC 1)', () => {
  it('accepts both fields empty (the default, "no instructions configured" state)', () => {
    expect(pprOperatingInstructionsSchema.safeParse({ it: '', en: '' }).success).toBe(true);
  });

  it('requires both it and en to be present', () => {
    expect(pprOperatingInstructionsSchema.safeParse({ it: 'ciao' }).success).toBe(false);
  });

  it('rejects a value longer than 2000 characters per language', () => {
    expect(pprOperatingInstructionsSchema.safeParse({ it: 'x'.repeat(2001), en: '' }).success).toBe(false);
  });

  it('accepts a value exactly at the 2000-character bound', () => {
    expect(pprOperatingInstructionsSchema.safeParse({ it: 'x'.repeat(2000), en: '' }).success).toBe(true);
  });
});

describe('listPprRequestsQuerySchema — the pprNumber filter (story 15.9, AC 15)', () => {
  it('accepts a well-formed number and keeps it verbatim', () => {
    const parsed = listPprRequestsQuerySchema.safeParse({ pprNumber: 'PPR-2026-0001' });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.pprNumber).toBe('PPR-2026-0001');
  });

  it('accepts a sequence longer than four digits (the 10.000th request of a year is still queryable)', () => {
    expect(listPprRequestsQuerySchema.safeParse({ pprNumber: 'PPR-2026-10000' }).success).toBe(true);
  });

  it('is optional — absent means no number filter, exactly like from/to', () => {
    const parsed = listPprRequestsQuerySchema.safeParse({});

    expect(parsed.success).toBe(true);
    expect(parsed.data?.pprNumber).toBeUndefined();
  });

  it('REJECTS a malformed value (a validation error, i.e. 422 — never a 500 and never a silently ignored filter)', () => {
    for (const value of ['', 'PPR-2026-1', 'PPR-26-0001', 'ppr-2026-0001', '2026-0001', 'PPR-2026-0001; DROP TABLE', ' PPR-2026-0001']) {
      expect(listPprRequestsQuerySchema.safeParse({ pprNumber: value }).success, value).toBe(false);
    }
  });

  it('leaves the other filters untouched (status still defaults to PENDING)', () => {
    const parsed = listPprRequestsQuerySchema.safeParse({ pprNumber: 'PPR-2026-0007' });

    expect(parsed.data?.status).toBe('PENDING');
  });
});
