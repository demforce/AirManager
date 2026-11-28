import { describe, expect, it } from 'vitest';
import { setPasswordSchema } from '@/lib/schemas/auth-tokens';
import { loginSchema } from '@/lib/schemas/login';
import { acceptableAdminPassword } from './admin-password-policy';
import { verifyPassword, hashPassword } from './password';

describe('administrative password assignment', () => {
  const email = 'club.manager@fixture.invalid';
  it('rejects a whole common or account-specific value without filtering words inside a passphrase', () => {
    for (const password of ['123456789987654321', 'PASSWORDPASSWORD', 'AirManager2026!', email, 'Club.Manager2026!', ' '.repeat(15)]) {
      expect(acceptableAdminPassword(password, email)).toBe(false);
    }
    expect(acceptableAdminPassword('password del mango maturo in giardino', email)).toBe(true);
  });
  it.each([10, 13])('rejects line break U+%i for new admin passwords, preserving legacy input contracts', code => {
    const password = 'glicine' + String.fromCharCode(code) + ' in fiore nel cortile';
    expect(acceptableAdminPassword(password, email)).toBe(false);
    expect(setPasswordSchema.parse({ token: 'fixture', password }).password).toBe(password);
    expect(loginSchema.parse({ email, password }).password).toBe(password);
  });
  it('counts code points and accepts full long values, with spaces and no mandatory mix', async () => {
    expect(acceptableAdminPassword('🙂'.repeat(8), email)).toBe(false);
    expect(acceptableAdminPassword('a malformed input ' + String.fromCharCode(0xd800), email)).toBe(false);
    const long = 'glicine in fiore '.repeat(4);
    expect(acceptableAdminPassword(long, email)).toBe(true);
    expect(acceptableAdminPassword('la lanterna blu', email)).toBe(true);
    expect(acceptableAdminPassword(long.repeat(5), email)).toBe(false);
    const encoded = await hashPassword(long);
    expect(await verifyPassword(encoded, long)).toBe(true);
    expect(await verifyPassword(encoded, long.trim())).toBe(false);
  });
});
