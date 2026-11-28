import type { Prisma } from '@/generated/prisma/client';

export const DEFAULT_SCAN_MS = 30_000;
export const MAIL_LEASE_MS = 120_000;

export async function lockMailChannel(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM "MailChannel" WHERE id = 1 FOR UPDATE`;
  return tx.mailChannel.findUniqueOrThrow({ where: { id: 1 } });
}

/** Caller holds the shared channel row through the insertion of a MailAttempt. */
export async function mailCapacityAvailable(tx: Prisma.TransactionClient, now: Date, intervalMs: number | null) {
  if (await tx.mailAttempt.count({ where: { finishedAt: null } }) >= 2) return false;
  if (intervalMs === null) return true; // Explicit club probes use a slot but need no automatic-start budget.
  return await tx.mailAttempt.count({ where: { startedAt: { gt: new Date(+now - intervalMs) } } }) < 10;
}
