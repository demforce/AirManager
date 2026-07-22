import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// env.ts validates eagerly at import time, so the current required vars are
// stubbed before the dynamic import. A future required var will make this
// import throw "Invalid environment configuration: ... at NEW_VAR" — same
// signal, the failure names the variable to align.
process.env['DATABASE_URL'] ??= 'postgresql://test:test@localhost:5432/test?schema=public';
process.env['AUTH_SECRET'] ??= 'test-secret-at-least-32-characters-long';
const { envSchema } = await import('./env');

// Keeps the automation aligned with the env contract: a story that adds a
// required env var to envSchema fails these tests until .env.example and the
// CI workflow provide it too — so CI and fresh containers never drift.
const root = path.resolve(__dirname, '../..');
const envExample = readFileSync(path.join(root, '.env.example'), 'utf8');
const ciYaml = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');

const requiredKeys = Object.entries(envSchema.shape)
  .filter(([, type]) => !type.safeParse(undefined).success)
  .map(([key]) => key);

describe('env contract stays in sync with CI and .env.example', () => {
  it('has the expected shape (guards the introspection itself)', () => {
    expect(requiredKeys).toContain('DATABASE_URL');
    expect(requiredKeys).toContain('AUTH_SECRET');
    expect(requiredKeys.length).toBeGreaterThanOrEqual(2);
  });

  it.each(requiredKeys)('.env.example documents %s', (key) => {
    expect(envExample).toMatch(new RegExp(`^${key}=`, 'm'));
  });

  it.each(requiredKeys)('.github/workflows/ci.yml provides %s', (key) => {
    expect(ciYaml).toMatch(new RegExp(`^\\s+${key}: `, 'm'));
  });

  // Schema-optional vars can still be required by the e2e suite (e.g.
  // JOBS_SECRET: the jobs route answers 500 when unset and the specs
  // exercise it). Any env var an e2e spec reads must exist in CI too.
  const e2eDir = path.join(root, 'e2e');
  const e2eSource = readdirSync(e2eDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(path.join(e2eDir, f), 'utf8'))
    .join('\n');
  const e2eEnvKeys = [
    ...new Set(
      [...e2eSource.matchAll(/process\.env\[['"]([A-Z0-9_]+)['"]\]/g)].map((m) => m[1]),
    ),
  ].filter((key) => key in envSchema.shape);

  it('finds the env vars the e2e specs read (guards the scan itself)', () => {
    expect(e2eEnvKeys).toContain('JOBS_SECRET');
  });

  it.each(e2eEnvKeys)('ci.yml provides %s, read by the e2e specs', (key) => {
    expect(ciYaml).toMatch(new RegExp(`^\\s+${key}: `, 'm'));
  });
});
