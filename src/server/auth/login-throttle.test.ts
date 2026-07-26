import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A tiny in-memory stand-in for `prisma.loginAttempt` — real filtering
 * (`identifier`/`ip`/`succeeded`/`createdAt: { gt }`), so these tests
 * exercise the ACTUAL rolling-window counting logic in
 * `login-throttle.ts`, not just "was the mock called with these args".
 * `authorize.test.ts` covers the wiring into `authorizeCredentials`
 * separately, with `login-throttle.ts` itself mocked wholesale.
 *
 * `$transaction` here just invokes the callback with the SAME mocked
 * `prisma` object as `tx` (same pattern as `auth-tokens.service.test.ts`) —
 * single-threaded, so it proves the reservation's CONDITIONAL atomicity
 * (count-then-insert happens as one logical step, above cap inserts
 * nothing) but cannot exercise genuine concurrent Postgres transaction
 * serialization. The real concurrent-burst race (`Promise.all` against a
 * live Postgres advisory lock) is left for review-time verification — see
 * the Dev Agent Record.
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

const executeRawMock = vi.fn(async () => undefined);

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
    $executeRaw: executeRawMock,
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import('@/server/db/prisma');
const {
  reserveLoginAttempt,
  recordSuccessfulLogin,
  LOGIN_MAX_FAILED_PER_IDENTIFIER,
  LOGIN_MAX_FAILED_PER_IP,
  LOGIN_RATE_LIMIT_WINDOW_MS,
} = await import('./login-throttle');

// Interactive-callback stand-in (same pattern as auth-tokens.service.test.ts):
// invoke the callback with the mocked `prisma` itself as `tx`.
vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => (fn as (tx: typeof prisma) => unknown)(prisma));

describe('login-throttle (H1, CWE-307 — throttle semantics; TD-6, F2 — atomic reservation)', () => {
  beforeEach(() => {
    rows = [];
    executeRawMock.mockClear();
    vi.mocked(prisma.$transaction).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reserves (returns true) with no history', async () => {
    await expect(reserveLoginAttempt('pilot@airmanager.local', null)).resolves.toBe(true);
  });

  it('locks the identifier after LOGIN_MAX_FAILED_PER_IDENTIFIER reservations, with a null IP (falls back to identifier-only limiting, H5 lesson)', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IDENTIFIER; i += 1) {
      await expect(reserveLoginAttempt('pilot@airmanager.local', null)).resolves.toBe(true);
    }

    await expect(reserveLoginAttempt('pilot@airmanager.local', null)).resolves.toBe(false);
  });

  it('never blocks a different identifier sharing no history (per-identifier isolation)', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IDENTIFIER + 5; i += 1) {
      await reserveLoginAttempt('attacker-target@airmanager.local', null);
    }

    await expect(reserveLoginAttempt('someone-else@airmanager.local', null)).resolves.toBe(true);
  });

  it('a successful login clears the identifier failure history, so a real user is never blocked by their own earlier typos', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IDENTIFIER - 1; i += 1) {
      await reserveLoginAttempt('pilot@airmanager.local', null);
    }

    await recordSuccessfulLogin('pilot@airmanager.local', null);

    // A fresh reservation right after the successful login does not combine
    // with the (now cleared) pre-success reservations to trip the lockout.
    await expect(reserveLoginAttempt('pilot@airmanager.local', null)).resolves.toBe(true);
  });

  it('many successful logins in a row never lock the identifier (only failures count)', async () => {
    for (let i = 0; i < 50; i += 1) {
      await recordSuccessfulLogin('pilot@airmanager.local', null);
    }

    await expect(reserveLoginAttempt('pilot@airmanager.local', null)).resolves.toBe(true);
  });

  it('locks an IP after LOGIN_MAX_FAILED_PER_IP reservations spread across DIFFERENT identifiers (credential stuffing)', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IP; i += 1) {
      await reserveLoginAttempt(`guess-${i}@airmanager.local`, '203.0.113.5');
    }

    // A brand-new identifier from the SAME IP is locked by the IP dimension
    // even though it has zero reservations of its own.
    await expect(reserveLoginAttempt('fresh-guess@airmanager.local', '203.0.113.5')).resolves.toBe(false);
    // A different IP is unaffected.
    await expect(reserveLoginAttempt('fresh-guess@airmanager.local', '198.51.100.1')).resolves.toBe(true);
  });

  it('a successful login does NOT clear the IP bucket (would let an attacker reset it via an unrelated account)', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IP; i += 1) {
      await reserveLoginAttempt(`guess-${i}@airmanager.local`, '203.0.113.5');
    }
    await recordSuccessfulLogin('attackers-own-account@airmanager.local', '203.0.113.5');

    await expect(reserveLoginAttempt('fresh-guess@airmanager.local', '203.0.113.5')).resolves.toBe(false);
  });

  it('does not keep re-extending the lockout: a reservation recorded before the window is not counted, so an old burst ages out', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    for (let i = 0; i < LOGIN_MAX_FAILED_PER_IDENTIFIER; i += 1) {
      await reserveLoginAttempt('pilot@airmanager.local', null);
    }
    await expect(reserveLoginAttempt('pilot@airmanager.local', null)).resolves.toBe(false);

    vi.setSystemTime(new Date(Date.now() + LOGIN_RATE_LIMIT_WINDOW_MS + 1000));

    await expect(reserveLoginAttempt('pilot@airmanager.local', null)).resolves.toBe(true);
  });

  describe('TD-6, F2 (CWE-367) — atomic reservation mechanics', () => {
    it('above cap: further reservations insert no additional row (anti-DoS — a continued flood must not re-extend the lockout window)', async () => {
      for (let i = 0; i < LOGIN_MAX_FAILED_PER_IDENTIFIER; i += 1) {
        await reserveLoginAttempt('pilot@airmanager.local', null);
      }
      const rowCountAtCap = rows.filter((r) => r.identifier === 'pilot@airmanager.local').length;
      expect(rowCountAtCap).toBe(LOGIN_MAX_FAILED_PER_IDENTIFIER);

      for (let i = 0; i < 5; i += 1) {
        await expect(reserveLoginAttempt('pilot@airmanager.local', null)).resolves.toBe(false);
      }

      const rowCountAfterFlood = rows.filter((r) => r.identifier === 'pilot@airmanager.local').length;
      expect(rowCountAfterFlood).toBe(LOGIN_MAX_FAILED_PER_IDENTIFIER);
    });

    it('runs the count-and-insert inside a transaction, after acquiring an advisory lock scoped to the identifier', async () => {
      await reserveLoginAttempt('pilot@airmanager.local', null);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(executeRawMock).toHaveBeenCalledTimes(1);
      const [strings, ...values] = executeRawMock.mock.calls[0] as unknown as [TemplateStringsArray] & unknown[];
      expect(strings.join('')).toContain('pg_advisory_xact_lock');
      expect(values).toContain('pilot@airmanager.local');
    });
  });
});
