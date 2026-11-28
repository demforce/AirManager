import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { constructorOptions, connect, query, end, spawn } = vi.hoisted(() => ({
  constructorOptions: vi.fn(), connect: vi.fn(), query: vi.fn(), end: vi.fn(), spawn: vi.fn(),
}));
vi.mock('pg', () => ({ default: { Client: class { constructor(options: unknown) { constructorOptions(options); } connect = connect; query = query; end = end; } } }));
vi.mock('node:child_process', () => ({ spawnSync: spawn }));

// The script is JavaScript so it can run before TypeScript or Prisma setup.
const { resetTestDatabase } = await import('../../scripts/reset-test-db.mjs');

beforeEach(() => {
  vi.clearAllMocks();
  connect.mockResolvedValue(undefined);
  query.mockResolvedValue({ rows: [] });
  end.mockResolvedValue(undefined);
  spawn.mockReturnValue({ status: 0 });
  vi.stubEnv('NODE_ENV', 'test');
});
afterEach(() => vi.unstubAllEnvs());

describe('reset-test-db guardrails', () => {
  it.each([
    'postgresql://tester:pw@localhost:55432/airmanager',
    'postgresql://tester:pw@localhost:5432/airmanager_test',
    'postgresql://tester:pw@db.example:55432/airmanager_test',
    'postgresql://tester:pw@localhost:55432/postgres',
    'postgresql://tester:pw@localhost:55432/airmanager_test?schema=other',
  ])('rejects a non-isolated target before connecting: %s', async (url) => {
    await expect(resetTestDatabase(url)).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects production mode even for a test-named local database', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(resetTestDatabase('postgresql://tester:pw@localhost:55432/airmanager_test')).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });

  it('uses the validated test URL for maintenance and Prisma, never the ambient DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://production.example/airmanager');
    const url = 'postgresql://tester:pw@localhost:55432/airmanager_test?schema=public';
    await resetTestDatabase(url);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(constructorOptions).toHaveBeenCalledWith({ connectionString: 'postgresql://tester:pw@localhost:55432/postgres' });
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'DROP DATABASE IF EXISTS "airmanager_test" WITH (FORCE)',
      'CREATE DATABASE "airmanager_test"',
    ]);
    expect(end).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls.map(([command, args]) => [command, args])).toEqual([
      ['npx', ['prisma', 'migrate', 'deploy']],
      ['npx', ['prisma', 'db', 'seed']],
    ]);
    for (const [, , options] of spawn.mock.calls) {
      expect(options.env.DATABASE_URL).toBe(url);
      expect(options.env.NODE_ENV).toBe('test');
    }
  });
});
