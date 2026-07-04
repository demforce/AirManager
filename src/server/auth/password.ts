import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing (AD-10): Argon2id via `@node-rs/argon2`. The library's
 * default parameters already select the Argon2id variant recommended by the
 * OWASP password storage cheat sheet, so no explicit `algorithm`/cost params
 * are passed here — keeping one source of truth for the tuning.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword);
}

export async function verifyPassword(hashed: string, plainPassword: string): Promise<boolean> {
  try {
    return await verify(hashed, plainPassword);
  } catch {
    // `verify` throws on a malformed/foreign hash string rather than
    // returning false — normalize to false so callers never need a try/catch.
    return false;
  }
}
