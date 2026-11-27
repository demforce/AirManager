/** Pure validation: no network and no database client. Call before fixture creation or cleanup. */
export function requireMailTestDatabase(kind: 'integration' | 'browser' | 'worker', vars: Record<string, string | undefined> = process.env) {
  const url = new URL(vars.TEST_DATABASE_URL ?? 'about:blank');
  const loopback = ['127.0.0.1', 'localhost', '[::1]'];
  const database = url.pathname;
  const allowed = kind === 'integration' ? ['/airmanager_test'] : ['/airmanager_test', '/airmanager_e2e'];
  const redirected = ['PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGSSLCERT', 'PGSSLKEY'].some(key => vars[key]);
  if (!vars.DATABASE_URL || vars.TEST_DATABASE_URL !== vars.DATABASE_URL || !allowed.includes(database)
    || !['postgres:', 'postgresql:'].includes(url.protocol) || !loopback.includes(url.hostname) || !url.port
    || (database === '/airmanager_test' && url.port === '5432') || redirected || vars.NODE_ENV === 'production'
    || [...url.searchParams].some(([key, value]) => key !== 'schema' || value !== 'public')) {
    throw new Error('Dedicated disposable credential-mail database required.');
  }
  return vars.DATABASE_URL;
}
