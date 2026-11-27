import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { DEFAULT_NOTIFICATIONS, NOTIFICATION_KEYS, type NotificationSettings } from '@/lib/operational-mail';
import { APP_TIMEZONE } from '@/lib/time';
import { prisma } from '@/server/db/prisma';

const KEY = 'mail.operational';
const boundarySchema = z.object({ cycle: z.number().int().positive(), day: z.iso.date() });
const storedSchema = z.object({
  switches: z.partialRecord(z.enum(NOTIFICATION_KEYS), z.boolean()),
  holderSince: boundarySchema.nullable(),
  digestSince: boundarySchema.nullable(),
});
export type MailBoundary = z.infer<typeof boundarySchema>;
export type OperationalMailPolicy = {
  switches: NotificationSettings;
  holderSince: MailBoundary | null;
  digestSince: MailBoundary | null;
};

function parsePolicy(value?: string): OperationalMailPolicy {
  if (value === undefined) return { switches: { ...DEFAULT_NOTIFICATIONS }, holderSince: null, digestSince: null };
  const stored = storedSchema.parse(JSON.parse(value));
  return { ...stored, switches: { ...DEFAULT_NOTIFICATIONS, ...stored.switches } };
}

export async function getOperationalMailPolicy(client: Prisma.TransactionClient = prisma): Promise<OperationalMailPolicy> {
  const row = await client.appSetting.findUnique({ where: { key: KEY }, select: { value: true } });
  return parsePolicy(row?.value);
}

/** A partial PATCH merges with the latest row, even for two concurrent first saves. */
export async function writeNotificationSettings(tx: Prisma.TransactionClient, patch: Partial<NotificationSettings>): Promise<void> {
  await tx.appSetting.createMany({ data: { key: KEY, value: JSON.stringify(parsePolicy()) }, skipDuplicates: true });
  const [row] = await tx.$queryRaw<{ value: string }[]>`SELECT value FROM "AppSetting" WHERE key = ${KEY} FOR UPDATE`;
  const policy = parsePolicy(row.value);
  const changed = NOTIFICATION_KEYS.filter((key) => patch[key] !== undefined && patch[key] !== policy.switches[key]);
  if (!changed.length) return;
  const resumeHolder = changed.includes('expiryHolder') && patch.expiryHolder;
  const resumeDigest = changed.includes('expiryDigest') && patch.expiryDigest;
  if (resumeHolder || resumeDigest) {
    const [boundary] = await tx.$queryRaw<MailBoundary[]>`
      SELECT nextval('"Expiry_notificationCycle_seq"')::int AS cycle,
             to_char(clock_timestamp() AT TIME ZONE ${APP_TIMEZONE}, 'YYYY-MM-DD') AS day`;
    if (resumeHolder) policy.holderSince = boundary;
    if (resumeDigest) policy.digestSince = boundary;
  }
  Object.assign(policy.switches, patch);
  await tx.appSetting.update({ where: { key: KEY }, data: { value: JSON.stringify(policy) } });
}
