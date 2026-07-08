import { describe, expect, it } from 'vitest';
import { extractBearerToken, timingSafeStringEqual, verifyJobsBearer } from './jobs-bearer';

describe('jobs-bearer (story 6.3, AD-9 — the JOBS_SECRET bearer check)', () => {
  describe('extractBearerToken', () => {
    it('extracts the token from a well-formed header', () => {
      expect(extractBearerToken('Bearer abc123')).toBe('abc123');
    });

    it('null header -> null', () => {
      expect(extractBearerToken(null)).toBeNull();
    });

    it('empty string header -> null', () => {
      expect(extractBearerToken('')).toBeNull();
    });

    it('"Bearer" with no token -> null', () => {
      expect(extractBearerToken('Bearer')).toBeNull();
    });

    it('"Bearer " with only whitespace after it -> null', () => {
      expect(extractBearerToken('Bearer    ')).toBeNull();
    });

    it('wrong scheme (Basic) -> null', () => {
      expect(extractBearerToken('Basic abc123')).toBeNull();
    });

    it('lowercase "bearer" scheme -> null (case-sensitive per RFC 6750 conventions used elsewhere in this codebase)', () => {
      expect(extractBearerToken('bearer abc123')).toBeNull();
    });
  });

  describe('timingSafeStringEqual', () => {
    it('true for identical strings', () => {
      expect(timingSafeStringEqual('the-secret', 'the-secret')).toBe(true);
    });

    it('false for different strings of the SAME length', () => {
      expect(timingSafeStringEqual('the-secret', 'the-secreu')).toBe(false);
    });

    it('false for different strings of DIFFERENT length (no throw — the digest workaround)', () => {
      expect(timingSafeStringEqual('short', 'a-much-longer-secret-value')).toBe(false);
    });

    it('false for an empty string against a non-empty one', () => {
      expect(timingSafeStringEqual('', 'the-secret')).toBe(false);
    });
  });

  describe('verifyJobsBearer', () => {
    const secret = 'dev-jobs-secret-change-me';

    it('correct bearer -> true', () => {
      expect(verifyJobsBearer(`Bearer ${secret}`, secret)).toBe(true);
    });

    it('wrong token -> false', () => {
      expect(verifyJobsBearer('Bearer wrong-token', secret)).toBe(false);
    });

    it('missing header -> false', () => {
      expect(verifyJobsBearer(null, secret)).toBe(false);
    });

    it('malformed header ("Bearer" with no token) -> false', () => {
      expect(verifyJobsBearer('Bearer', secret)).toBe(false);
    });

    it('empty token after "Bearer " -> false', () => {
      expect(verifyJobsBearer('Bearer ', secret)).toBe(false);
    });
  });
});
