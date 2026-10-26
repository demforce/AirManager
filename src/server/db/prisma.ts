import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { env } from '@/lib/env';

/**
 * Prisma client singleton. Next.js dev mode hot-reloads server modules on
 * every request, which would otherwise exhaust the Postgres connection pool
 * by re-instantiating the client each time — cache it on `globalThis` in
 * non-production environments.
 *
 * Since Prisma 7, `PrismaClient` requires an explicit driver adapter (no more
 * implicit `datasources.db.url` connection) — `@prisma/adapter-pg` wraps
 * `pg.Pool` for PostgreSQL.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // `max` explicit (story 17.1, AD-5): defaults to 10, the same number `pg`
  // already used implicitly (`pg-pool/index.js:89`: `this.options.max ||
  // this.options.poolSize || 10`), so behaviour at the default is
  // unchanged. `PrismaPg` accepts a `pg.PoolConfig`, so this needs no cast.
  // Override with `DATABASE_POOL_MAX`. This module is instantiated once PER
  // NEXT LAYER (route handlers and page rendering each get their own), so a
  // production `next start` opens up to 2 x `DATABASE_POOL_MAX` connections
  // — keep DATABASE_POOL_MAX x 2 x instances <= max_connections (100 by
  // default) minus `superuser_reserved_connections` (3 by default); full
  // formula and measurement in `src/lib/env.ts`'s doc-comment.
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX });
  return new PrismaClient({
    adapter,
    // 36 interactive transactions across 13 service files (31 in the
    // `$transaction(async (tx) => …)` form plus 5 in the equally-interactive
    // `$transaction((tx) => someAsyncFn(tx, …))` form — measured on HEAD,
    // review 17.1) ran on the implicit defaults; declaring them here makes
    // the timeout that produces `P2028 Unable to start a transaction in the
    // given time` visible and tunable in ONE place. Also governs the batch
    // form (`$transaction([...])`: same `maxWait`/`timeout` fields, runtime
    // `@prisma/client`). Values are Prisma's own documented defaults
    // (`@prisma/client` runtime `client.d.ts`), so behaviour is unchanged:
    // raising `maxWait` trades P2028 errors for slower requests under
    // contention and belongs to story 17.5, which fixes the cause
    // (read-only interactive transactions holding a connection).
    transactionOptions: { maxWait: 2000, timeout: 5000 },
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
