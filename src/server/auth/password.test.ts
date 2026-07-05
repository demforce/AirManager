import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing (Argon2id round-trip)', () => {
  it('hashes a password using the Argon2id PHC format', async () => {
    const hashed = await hashPassword('CorrectHorseBatteryStaple1!');
    expect(hashed).toMatch(/^\$argon2id\$/);
  });

  it('verifies the correct password against its hash', async () => {
    const hashed = await hashPassword('CorrectHorseBatteryStaple1!');
    await expect(verifyPassword(hashed, 'CorrectHorseBatteryStaple1!')).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hashed = await hashPassword('CorrectHorseBatteryStaple1!');
    await expect(verifyPassword(hashed, 'wrong-password')).resolves.toBe(false);
  });

  it('returns false instead of throwing for a malformed hash', async () => {
    await expect(verifyPassword('not-a-real-hash', 'anything')).resolves.toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await hashPassword('SamePassword1!');
    const b = await hashPassword('SamePassword1!');
    expect(a).not.toBe(b);
  });
});
