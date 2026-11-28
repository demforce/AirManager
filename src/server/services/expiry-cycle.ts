import type { Prisma } from '@/generated/prisma/client';

/** The shared serialization point for reminder claims and date changes.
 * NO KEY UPDATE permits foreign-key checks on the expiry. */
export async function lockExpiryDate(tx: Prisma.TransactionClient, id: string): Promise<Date | null> {
  const [row] = await tx.$queryRaw<{ expiresAt: Date }[]>`
    SELECT "expiresAt" FROM "Expiry" WHERE "id" = ${id} FOR NO KEY UPDATE`;
  return row?.expiresAt ?? null;
}
