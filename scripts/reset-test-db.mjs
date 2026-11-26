#!/usr/bin/env node
// Reset only a disposable local test database. No sudo or production URL is used.
import { spawnSync } from 'node:child_process';

function targetFromEnvironment() {
  if (process.env.NODE_ENV === 'production') throw new Error('Production mode cannot reset a test database.');
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required.');
  const url = new URL(process.env.TEST_DATABASE_URL);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['localhost', '127.0.0.1'].includes(url.hostname)
      || !['airmanager_test', 'airmanager_e2e'].includes(database)
      || !url.username
      || [...url.searchParams].some(([key, value]) => key !== 'schema' || value !== 'public')) {
    throw new Error('Only a local airmanager_test or airmanager_e2e database (public schema) may be reset.');
  }
  return { url, database };
}

function reset() {
  const { url, database } = targetFromEnvironment();
  const user = decodeURIComponent(url.username);
  const env = { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'test',
    PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: user,
    PGPASSWORD: decodeURIComponent(url.password) };
  // Ignore ambient libpq overrides; the validated URL chooses the target.
  delete env.PGSERVICE;
  delete env.PGOPTIONS;
  delete env.PGHOSTADDR;
  const steps = [
    ['psql', ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`]],
    ['createdb', ['--maintenance-db=postgres', `--owner=${user}`, database]],
    ['npx', ['prisma', 'migrate', 'deploy']],
    ['npx', ['prisma', 'db', 'seed']],
  ];
  for (const [command, args] of steps) {
    const result = spawnSync(command, args, { env, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status ?? 'unknown'}).`);
  }
  console.log(`Test database ${database} reset and seeded.`);
}

try { reset(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
