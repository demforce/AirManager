import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * AES-256-GCM box for secrets persisted on the `AppSetting` K/V table (CWE-312
 * fix — the SMTP password was previously stored in cleartext, see
 * `app-settings.service.ts#setSmtpSettings`/`getSmtpSettingsForMailer`).
 *
 * Key derivation: HKDF-SHA256 over the EXISTING `AUTH_SECRET` (no new env var)
 * with a fixed, purpose-specific salt/info — deterministic across restarts,
 * and namespaced so this derived key can't collide with another HKDF use of
 * the same secret elsewhere in the app.
 *
 * Wire format: base64(iv[12] || authTag[16] || ciphertext). No version
 * prefix — {@link decryptSecret} instead treats anything that fails to
 * authenticate as this shape (wrong length, or GCM tag mismatch) as a LEGACY
 * CLEARTEXT value written before this fix, and returns it unchanged. GCM's
 * 128-bit auth tag makes a false "successful decrypt" of an unrelated
 * cleartext string astronomically unlikely, so this passthrough is safe.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const HKDF_SALT = 'airmanager.secret-box.v1.salt';
const HKDF_INFO = 'airmanager.secret-box.v1.smtp-pass';

function deriveKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', env.AUTH_SECRET, HKDF_SALT, HKDF_INFO, KEY_LENGTH));
}

/** Encrypts `plaintext` for storage. Call before every write of a secret `AppSetting` value. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * Decrypts a value produced by {@link encryptSecret}. A `stored` value that
 * is not in that format (too short once base64-decoded, or fails GCM
 * authentication) is assumed to be a pre-existing cleartext row and is
 * returned as-is — never throws.
 */
export function decryptSecret(stored: string): string {
  try {
    const raw = Buffer.from(stored, 'base64');
    if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      return stored;
    }

    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, deriveKey(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    return stored;
  }
}
