import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/reset-test-db.mjs');
const dirs: string[] = [];

function fakeCommands() {
  const dir = mkdtempSync(join(tmpdir(), 'airmanager-reset-test-'));
  dirs.push(dir);
  for (const name of ['psql', 'createdb', 'npx']) {
    const path = join(dir, name);
    writeFileSync(path, '#!/bin/sh\nprintf "%s %s\\n" "' + name + '" "$*" >> "$COMMAND_LOG"\n');
    chmodSync(path, 0o755);
  }
  return { dir, log: join(dir, 'commands.log') };
}

function run(url: string, nodeEnv: 'test' | 'production' = 'test') {
  const { dir, log } = fakeCommands();
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ''}`,
      COMMAND_LOG: log,
      TEST_DATABASE_URL: url,
      DATABASE_URL: 'postgresql://production.example/airmanager',
      NODE_ENV: nodeEnv,
    },
  });
  return { ...result, commands: (() => { try { return readFileSync(log, 'utf8'); } catch { return ''; } })() };
}

afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('reset-test-db guardrails', () => {
  it.each([
    'postgresql://tester:pw@localhost:5432/airmanager',
    'postgresql://tester:pw@db.example:5432/airmanager_test',
    'postgresql://tester:pw@localhost:5432/postgres',
    'postgresql://tester:pw@localhost:5432/airmanager_test?schema=other',
  ])('rejects a non-isolated target before invoking database commands: %s', (url) => {
    const result = run(url);
    expect(result.status).not.toBe(0);
    expect(result.commands).toBe('');
  });

  it('rejects production mode even for a test-named local database', () => {
    const result = run('postgresql://tester:pw@localhost:5432/airmanager_test', 'production');
    expect(result.status).not.toBe(0);
    expect(result.commands).toBe('');
  });

  it('resets only the explicitly named local test database without sudo', () => {
    const result = run('postgresql://tester:pw@localhost:5432/airmanager_test?schema=public');
    expect(result.status).toBe(0);
    expect(result.commands).toContain('psql -d postgres -v ON_ERROR_STOP=1 -c DROP DATABASE IF EXISTS airmanager_test WITH (FORCE)');
    expect(result.commands).toContain('createdb --maintenance-db=postgres --owner=tester airmanager_test');
    expect(result.commands).toContain('npx prisma migrate deploy');
    expect(result.commands).toContain('npx prisma db seed');
    expect(result.commands).not.toContain('sudo');
    expect(result.commands).not.toContain('production.example');
  });
});
