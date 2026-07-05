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
  const adapter = new PrismaPg(env.DATABASE_URL);
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
