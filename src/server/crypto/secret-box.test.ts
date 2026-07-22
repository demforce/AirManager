import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({ env: { AUTH_SECRET: 'test-auth-secret-not-real-0123456789' } }));

const { encryptSecret, decryptSecret } = await import('./secret-box');

/**
 * CWE-312 fix — AES-256-GCM box for `AppSetting` secrets (SMTP password).
 * Minimal targeted coverage: the round-trip, ciphertext non-determinism (a
 * random IV per call), and the legacy-cleartext passthrough backward-compat
 * contract `app-settings.service.ts` relies on.
 */
describe('secret-box (CWE-312 fix)', () => {
  it('round-trips a plaintext through encryptSecret -> decryptSecret', () => {
    const plaintext = 'a-real-smtp-password-123!';

    const stored = encryptSecret(plaintext);

    expect(stored).not.toBe(plaintext);
    expect(decryptSecret(stored)).toBe(plaintext);
  });

  it('encrypts the same plaintext to a different value each time (random IV)', () => {
    const a = encryptSecret('same-password');
    const b = encryptSecret('same-password');

    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-password');
    expect(decryptSecret(b)).toBe('same-password');
  });

  it('a legacy cleartext value (pre-existing demo/prod row, not in the encrypted format) passes through unchanged', () => {
    expect(decryptSecret('hunter2')).toBe('hunter2');
    expect(decryptSecret('')).toBe('');
  });

  it('a value that happens to be valid base64 but too short to carry an IV+authTag also passes through unchanged', () => {
    const shortBase64 = Buffer.from('short').toString('base64');
    expect(decryptSecret(shortBase64)).toBe(shortBase64);
  });
});
