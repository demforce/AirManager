import { describe, expect, it } from 'vitest';
import { createPersonSchema, updatePersonSchema } from './people';

/**
 * `createPersonSchema` (story 13.1, AC 5) — pure-schema-shape checks for the
 * one-step composite's `profiles`/`expiries`/`access` blocks. Service-level
 * validation (expiry type existence/active/scope compatibility, `access`'s
 * `users.manage` requirement) is covered in `people.service.test.ts`
 * instead — this file only covers what Zod itself can reject.
 */
describe('createPersonSchema (story 13.1, AC 5 — one-step composite)', () => {
  const base = { firstName: 'Maria', lastName: 'Bianchi' };

  it('accepts the base anagrafica alone (retro-compatibility: no new blocks required)', () => {
    const parsed = createPersonSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it('accepts every optional block fully populated', () => {
    const parsed = createPersonSchema.safeParse({
      ...base,
      profiles: { pilot: { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' } },
      expiries: [{ expiryTypeId: 'et_1', expiresAt: '2027-01-01' }],
      access: { email: 'maria@airmanager.local', roles: ['PILOT'] },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an expiries entry missing expiresAt (R-13.1-c: mandatory per entry)', () => {
    const parsed = createPersonSchema.safeParse({
      ...base,
      expiries: [{ expiryTypeId: 'et_1' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an expiries entry missing expiryTypeId', () => {
    const parsed = createPersonSchema.safeParse({
      ...base,
      expiries: [{ expiresAt: '2027-01-01' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects duplicate expiryTypeId entries within the same array', () => {
    const parsed = createPersonSchema.safeParse({
      ...base,
      expiries: [
        { expiryTypeId: 'et_1', expiresAt: '2027-01-01' },
        { expiryTypeId: 'et_1', expiresAt: '2028-01-01' },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an access block with no roles', () => {
    const parsed = createPersonSchema.safeParse({
      ...base,
      access: { email: 'maria@airmanager.local', roles: [] },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an access block with an invalid email', () => {
    const parsed = createPersonSchema.safeParse({
      ...base,
      access: { email: 'not-an-email', roles: ['PILOT'] },
    });
    expect(parsed.success).toBe(false);
  });

  it('activates an instructor profile with an empty object — no free-text field left (R-13.1-b)', () => {
    const parsed = createPersonSchema.safeParse({ ...base, profiles: { instructor: {} } });
    expect(parsed.success).toBe(true);
  });
});

describe('removed anagrafica field (story 19.2, AC 2)', () => {
  // Zod strips unknown keys: a stale client still sending the field gets a
  // 201/200, never a 422 — and the key never reaches the service.
  it('createPersonSchema and updatePersonSchema drop a fiscalCode key instead of rejecting it', () => {
    const created = createPersonSchema.parse({ firstName: 'Maria', lastName: 'Bianchi', fiscalCode: 'BNCMRA80A01L219K' });
    const updated = updatePersonSchema.parse({ phone: '+39 333 1234567', fiscalCode: 'BNCMRA80A01L219K' });
    expect(created).not.toHaveProperty('fiscalCode');
    expect(updated).toEqual({ phone: '+39 333 1234567' });
  });
});
