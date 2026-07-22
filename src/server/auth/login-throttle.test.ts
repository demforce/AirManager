import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A tiny in-memory stand-in for `prisma.loginAttempt` — real filtering
 * (`identifier`/`ip`/`succeeded`/`createdAt: { gt }`), so these tests
 * exercise the ACTUAL rolling-window counting logic in
 * `login-throttle.ts`, not just "was the mock called with these args".
 * `authorize.test.ts` covers the wiring into `authorizeCredentials`
 * separately, with `login-throttle.ts` itself mocked wholesale.
 */
type Row = { identifier: string; ip: string | null; succeeded: boolean; createdAt: Date };
let rows: Row[] = [];

function matchesWindow(row: Row, where: { identifier?: string; ip?: string; succeeded?: boolean; createdAt?: { gt: Date } }): boolean {
  if (where.identifier !== undefined && row.identifier !== where.identifier) return false;
  if (where.ip !== undefined && row.ip !== where.ip) return false;
  if (where.succeeded !== undefined && row.succeeded !== where.succeeded) return false;
  if (where.createdAt && row.createdAt.getTime() <= where.createdAt.gt.getTime()) return false;
  return true;
}

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    loginAttempt: {
      count: vi.fn(async ({ where }: { where: Parameters<typeof matchesWindow>[1] }) => rows.filter((r) => matchesWindow(r, where)).length),
      create: vi.fn(async ({ data }: { data: { identifier: string; ip: string | null; succeeded: boolean } }) => {
        const row: Row = { ...data, createdAt: new Date() };
        rows.push(row);
        return row;
      }),
      deleteMany: vi.fn(async ({ where }: { where: Parameters<typeof matchesWindow>[1] }) => {
        const before = rows.length;
        rows = rows.filter((r) => !matchesWindow(r, where));
        return { count: before - rows.length };
      }),
    },
  },
}));

const {
  isLoginLocked,
  recordFailedLoginAttempt,
  recordSuccessfulLogin,
  LOGIN_MAX_FAILED_PER_IDENTIFIER,
  LOGIN_MAX_FAILED_PER_IP,
  LOGIN_RATE_LIMIT_WINDOW_MS,
} = await import('./login-throttle');

describe('login-throttle (H1, CWE-307)', () => {
  beforeEach(() => {
    rows = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not locked with no history', async () => {
    await expect(isLoginLocked('pilot@airmanager.local', null)).resolves.toBe(false);
  });

  it('locks the identifier after LOGIN_MAX_FAILED_PER_IDENTIFIER failed attempts, with a null IP (falls back to identifier-only limiting, H5 lesson)', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IDENTIFIER - 1; i += 1) {
      await recordFailedLoginAttempt('pilot@airmanager.local', null);
    }
    await expect(isLoginLocked('pilot@airmanager.local', null)).resolves.toBe(false);

    await recordFailedLoginAttempt('pilot@airmanager.local', null);

    await expect(isLoginLocked('pilot@airmanager.local', null)).resolves.toBe(true);
  });

  it('never blocks a different identifier sharing no history (per-identifier isolation)', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IDENTIFIER + 5; i += 1) {
      await recordFailedLoginAttempt('attacker-target@airmanager.local', null);
    }

    await expect(isLoginLocked('someone-else@airmanager.local', null)).resolves.toBe(false);
  });

  it('a successful login clears the identifier failure history, so a real user is never blocked by their own earlier typos', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IDENTIFIER - 1; i += 1) {
      await recordFailedLoginAttempt('pilot@airmanager.local', null);
    }
    await expect(isLoginLocked('pilot@airmanager.local', null)).resolves.toBe(false);

    await recordSuccessfulLogin('pilot@airmanager.local', null);

    // A fresh typo right after the successful login does not combine with
    // the (now cleared) pre-success failures to trip the lockout.
    await recordFailedLoginAttempt('pilot@airmanager.local', null);
    await expect(isLoginLocked('pilot@airmanager.local', null)).resolves.toBe(false);
  });

  it('many successful logins in a row never lock the identifier (only failures count)', async () => {
    for (let i = 0; i < 50; i += 1) {
      await recordSuccessfulLogin('pilot@airmanager.local', null);
      await expect(isLoginLocked('pilot@airmanager.local', null)).resolves.toBe(false);
    }
  });

  it('locks an IP after LOGIN_MAX_FAILED_PER_IP failures spread across DIFFERENT identifiers (credential stuffing)', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IP; i += 1) {
      await recordFailedLoginAttempt(`guess-${i}@airmanager.local`, '203.0.113.5');
    }

    // A brand-new identifier from the SAME IP is locked by the IP dimension
    // even though it has zero failures of its own.
    await expect(isLoginLocked('fresh-guess@airmanager.local', '203.0.113.5')).resolves.toBe(true);
    // A different IP is unaffected.
    await expect(isLoginLocked('fresh-guess@airmanager.local', '198.51.100.1')).resolves.toBe(false);
  });

  it('a successful login does NOT clear the IP bucket (would let an attacker reset it via an unrelated account)', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IP; i += 1) {
      await recordFailedLoginAttempt(`guess-${i}@airmanager.local`, '203.0.113.5');
    }
    await recordSuccessfulLogin('attackers-own-account@airmanager.local', '203.0.113.5');

    await expect(isLoginLocked('fresh-guess@airmanager.local', '203.0.113.5')).resolves.toBe(true);
  });

  it('does not keep re-extending the lockout: a failure recorded before the window is not counted, so an old burst ages out', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IDENTIFIER; i += 1) {
      await recordFailedLoginAttempt('pilot@airmanager.local', null);
    }
    await expect(isLoginLocked('pilot@airmanager.local', null)).resolves.toBe(true);

    vi.setSystemTime(new Date(Date.now() + LOGIN_RATE_LIMIT_WINDOW_MS + 1000));

    await expect(isLoginLocked('pilot@airmanager.local', null)).resolves.toBe(false);
  });
});
