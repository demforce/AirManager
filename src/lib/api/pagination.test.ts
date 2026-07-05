import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { paginate, paginatedResponseSchema, paginationOffset, paginationQuerySchema } from './pagination';

describe('paginationQuerySchema (Story 1.5 AC 3)', () => {
  it('defaults to page 1 / pageSize 20 when omitted', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces string query values (as they arrive from URLSearchParams)', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
  });

  it('rejects page < 1', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('caps pageSize at 100', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ pageSize: 100 }).success).toBe(true);
  });

  it('rejects non-integer values', () => {
    expect(paginationQuerySchema.safeParse({ page: 1.5 }).success).toBe(false);
  });
});

describe('paginate', () => {
  it('builds the AD-8 `{ items, total, page, pageSize }` envelope', () => {
    const result = paginate(['a', 'b'], 42, { page: 2, pageSize: 20 });
    expect(result).toEqual({ items: ['a', 'b'], total: 42, page: 2, pageSize: 20 });
  });
});

describe('paginationOffset', () => {
  it('computes `skip`/`take` for page 1', () => {
    expect(paginationOffset({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
  });

  it('computes `skip`/`take` for a later page', () => {
    expect(paginationOffset({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('respects a non-default pageSize', () => {
    expect(paginationOffset({ page: 2, pageSize: 5 })).toEqual({ skip: 5, take: 5 });
  });
});

describe('paginatedResponseSchema', () => {
  const itemSchema = z.object({ id: z.string() });
  const schema = paginatedResponseSchema(itemSchema);

  it('accepts a well-formed paginated payload', () => {
    const result = schema.safeParse({ items: [{ id: '1' }], total: 1, page: 1, pageSize: 20 });
    expect(result.success).toBe(true);
  });

  it('rejects items that do not match the item schema', () => {
    const result = schema.safeParse({ items: [{ wrong: true }], total: 1, page: 1, pageSize: 20 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative total', () => {
    const result = schema.safeParse({ items: [], total: -1, page: 1, pageSize: 20 });
    expect(result.success).toBe(false);
  });
});
