#!/usr/bin/env node
// Reset only a disposable local test database. Uses the project's pg driver, not sudo or psql.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export async function resetTestDatabase(testDatabaseUrl = process.env.TEST_DATABASE_URL) {
  if (process.env.NODE_ENV === 'production') throw new Error('Production mode cannot reset a test database.');
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');
  const url = new URL(testDatabaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['localhost', '127.0.0.1'].includes(url.hostname)
      || !url.port || url.port === '5432'
      || !['airmanager_test', 'airmanager_e2e'].includes(database)
      || !url.username
      || [...url.searchParams].some(([key, value]) => key !== 'schema' || value !== 'public')) {
    throw new Error('Only a local airmanager_test or airmanager_e2e database on a dedicated non-default port (public schema) may be reset.');
  }

  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = '/postgres';
  maintenanceUrl.search = '';
  const client = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    // Identifiers are quoted and selected from the two literal allowlisted names above.
    await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${database}"`);
  } finally {
    await client.end();
  }

  const env = { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'test' };
  delete env.PGSERVICE;
  delete env.PGOPTIONS;
  delete env.PGHOSTADDR;
  for (const args of [['prisma', 'migrate', 'deploy'], ['prisma', 'db', 'seed']]) {
    const result = spawnSync('npx', args, { env, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`npx failed (exit ${result.status ?? 'unknown'}).`);
  }
  console.log(`Test database ${database} reset and seeded.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  resetTestDatabase().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
