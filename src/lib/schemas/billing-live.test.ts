import { describe, expect, it } from 'vitest';
import { billingLiveQuerySchema } from './billing-live';

describe('billingLiveQuerySchema', () => {
  it('accepts only the Billing page filters and rejects export or unrelated ledger options', () => {
    expect(billingLiveQuerySchema.safeParse({ page: '2', pageSize: '20', categoryId: 'test', unattributed: 'true' }).success).toBe(true);
    expect(billingLiveQuerySchema.safeParse({ format: 'xlsx' }).success).toBe(false);
    expect(billingLiveQuerySchema.safeParse({ movementType: 'TOP_UP' }).success).toBe(false);
  });
});
