import type { Prisma } from '@/generated/prisma/client';
import { emailTrialEnabled } from '@/server/auth/email-trial-policy';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { securityOwnershipFilter } from './account-mailbox';
import { databaseNow } from './credential-mail.service';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export type IncidentKind = 'LOGIN_VOLUME' | 'MAIL_WORKER';

// The request path already takes this lock before enforcing its issuance budgets.
// The pause command joins that ordering before fencing the SMTP worker.
export async function lockLoginRequests(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(19021, 1)`;
}

export async function setLoginPause(actor: Actor, paused: boolean) {
  authorize(actor, 'settings.manage');
  return prisma.$transaction(async tx => {
    await lockLoginRequests(tx);
    await tx.$queryRaw`SELECT id FROM "MailChannel" WHERE id = 1 FOR UPDATE`;
    const current = await tx.mailChannel.findUniqueOrThrow({ where: { id: 1 } });
    if (current.loginLinksPaused === paused) return { paused };
    if (paused) {
      const last = await tx.credentialMail.aggregate({ where: { purpose: 'LOGIN_LINK' }, _max: { generation: true } });
      const fence = last._max.generation ?? current.loginPauseThrough;
      const now = await databaseNow(tx);
      await tx.credentialMail.updateMany({
        where: { purpose: 'LOGIN_LINK', state: { in: ['QUEUED', 'CLAIMED'] } },
        data: { state: 'SUPPRESSED', reason: 'LOGIN_PAUSED', observedAt: now },
      });
      await tx.mailChannel.update({ where: { id: 1 }, data: { loginLinksPaused: true, loginPauseThrough: fence } });
    } else {
      await tx.mailChannel.update({ where: { id: 1 }, data: { loginLinksPaused: false } });
    }
    return { paused };
  });
}

async function updateIncident(tx: Prisma.TransactionClient, kind: IncidentKind, active: boolean, now: Date) {
  const open = await tx.securityIncident.findFirst({ where: { kind, resolvedAt: null } });
  if (active) {
    if (open) await tx.securityIncident.update({ where: { id: open.id }, data: { lastSeenAt: now } });
    else await tx.securityIncident.create({ data: { kind, openedAt: now, lastSeenAt: now } });
  } else if (open && +now - +open.lastSeenAt >= 10 * MINUTE) {
    await tx.securityIncident.update({ where: { id: open.id }, data: { resolvedAt: now } });
  }
}

async function queueAlertRecipients(tx: Prisma.TransactionClient) {
  const waiting = await tx.securityIncident.findMany({ where: { needsRecipients: true }, select: { id: true },
    orderBy: { openedAt: 'asc' }, take: 50 });
  if (!waiting.length) return;
  const admins = await tx.$queryRaw<{ id: string }[]>`
    SELECT u.id FROM "User" u JOIN "EmailVerification" e ON e."userId" = u.id
    WHERE u."isActive" AND 'ADMIN' = ANY(u.roles) AND e.email = u.email AND e."verifiedAt" IS NOT NULL
      ${securityOwnershipFilter()}`;
  if (!admins.length) return;
  const userIds = admins.map(a => a.id);
  for (const { id } of waiting) {
    await tx.securityDelivery.createMany({
      data: userIds.map(userId => ({ incidentId: id, userId })), skipDuplicates: true,
    });
    // A previously ineligible recipient can become eligible again; no message was submitted for a suppression.
    await tx.securityDelivery.updateMany({ where: { incidentId: id, userId: { in: userIds }, state: 'SUPPRESSED' },
      data: { state: 'QUEUED', reason: null } });
    await tx.securityIncident.update({ where: { id }, data: { needsRecipients: false } });
  }
}

/** Supervise independently of Next.js and the SMTP worker. No socket is opened by this service. */
export async function scanAccessSecurity() {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(19021, 3)`;
    const now = await databaseNow(tx);
    // Take the channel lock before incident rows, in the same order as delivery completion.
    const channel = await tx.mailChannel.update({ where: { id: 1 }, data: { monitorAt: now } });
    const minute = Math.floor(+now / MINUTE) * MINUTE;
    const volume = await tx.loginVolume.aggregate({ where: { minute: { gte: new Date(minute - 9 * MINUTE) } }, _sum: { requests: true } });
    await updateIncident(tx, 'LOGIN_VOLUME', (volume._sum.requests ?? 0) >= 40, now);
    const late = new Date(+now - 4 * MINUTE);
    const lateMail = await tx.credentialMail.findFirst({ where: { state: 'QUEUED', revokedAt: null,
      ...(!emailTrialEnabled() && { purpose: { in: ['INVITE' as const, 'PASSWORD_RESET' as const] }, user: { emailVerification: null } }),
      nextAt: { lte: late }, expiresAt: { gt: now } }, select: { id: true } });
    const lateAlert = await tx.securityDelivery.findFirst({ where: { state: 'QUEUED', nextAt: { lte: late } }, select: { id: true } });
    await updateIncident(tx, 'MAIL_WORKER', (channel.heartbeatAt ?? channel.monitorStartedAt) <= late || !!lateMail || !!lateAlert, now);
    await queueAlertRecipients(tx);
    await tx.loginVolume.deleteMany({ where: { minute: { lt: new Date(+now - DAY) } } });
    // Unreported outages and retryable work outlive normal log retention.
    await tx.securityIncident.deleteMany({ where: { resolvedAt: { lt: new Date(+now - 30 * DAY) }, needsRecipients: false,
      deliveries: { none: { state: { in: ['QUEUED', 'HANDOFF', 'CONFIGURATION'] } } } } });
  });
}

export async function inspectAccessSecurity(actor: Actor) {
  authorize(actor, 'settings.manage');
  const [channel, incidents, withoutRecipients, deliveries] = await Promise.all([
    prisma.mailChannel.findUniqueOrThrow({ where: { id: 1 }, select: { loginLinksPaused: true, monitorAt: true } }),
    prisma.securityIncident.findMany({ where: { resolvedAt: null }, select: { kind: true }, orderBy: { kind: 'asc' } }),
    prisma.securityIncident.count({ where: { needsRecipients: true } }),
    prisma.securityDelivery.groupBy({ by: ['state'], _count: true }),
  ]);
  const count = (...states: string[]) => deliveries.filter(row => states.includes(row.state)).reduce((n, row) => n + row._count, 0);
  return { paused: channel.loginLinksPaused, monitoredAt: channel.monitorAt, incidents: incidents.map(i => i.kind),
    withoutRecipients, waiting: count('QUEUED', 'HANDOFF', 'CONFIGURATION'), uncertain: count('UNCERTAIN'),
    rejected: count('PERMANENT', 'EXHAUSTED') };
}
