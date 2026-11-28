import { accountMailboxUncontested } from './account-mailbox';
import { randomUUID } from 'node:crypto';
import type { Prisma, SecurityDelivery } from '@/generated/prisma/client';
import { singleMailbox } from '@/lib/schemas/email-trial';
import { emailTrialEnabled, verifiedTrialAddress } from '@/server/auth/email-trial-policy';
import { buildSecurityAlertEmail } from '@/server/adapters/mail/templates';
import { InvalidMailConfiguration, NonLocalTestRelay, readObservedSmtpConfig, submitObservedMail } from '@/server/adapters/mail/observed-smtp';
import type { SmtpObservation } from '@/server/adapters/mail/smtp-observation';
import { prisma } from '@/server/db/prisma';
import { databaseNow } from './credential-mail.service';
import { DEFAULT_SCAN_MS, MAIL_LEASE_MS, lockMailChannel, mailCapacityAvailable } from './mail-transport-budget';
import type { IncidentKind } from './access-security';

const MINUTE = 60_000;
const recipientFields = { email: true, locale: true, roles: true, isActive: true, emailVerification: true } as const;

async function recipient(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: recipientFields });
  if (!user?.isActive || !user.roles.includes('ADMIN') || !verifiedTrialAddress(user)) return null;
  const mailbox = singleMailbox.safeParse(user.email);
  return mailbox.success && mailbox.data === user.email
    && (!emailTrialEnabled() || await accountMailboxUncontested(prisma, userId, user.email)) ? user : null;
}

// Called under the same channel lock as reservations and completion. Both ledgers
// retain the uncertain outcome if a worker disappears after crossing the handoff.
export async function recoverSecurityLeases(tx: Prisma.TransactionClient, now: Date) {
  await tx.securityDelivery.updateMany({ where: { state: 'HANDOFF', leaseUntil: { lte: now } },
    data: { state: 'UNCERTAIN', reason: 'UNCERTAIN', leaseUntil: null } });
  await tx.mailAttempt.updateMany({ where: { origin: 'SECURITY', finishedAt: null, leaseUntil: { lte: now } },
    data: { finishedAt: now, phase: 'MESSAGE', outcome: 'UNCERTAIN' } });
}

async function completeAlert(job: SecurityDelivery, key: string, result: SmtpObservation, config: number, retiredConfig: boolean) {
  await prisma.$transaction(async tx => {
    await lockMailChannel(tx);
    const now = await databaseNow(tx);
    await recoverSecurityLeases(tx, now);
    const attempt = await tx.mailAttempt.findUniqueOrThrow({ where: { id: key } });
    if (attempt.finishedAt && !(attempt.outcome === 'UNCERTAIN' && result.outcome === 'ACCEPTED')) return;
    await tx.mailAttempt.update({ where: { id: key }, data: {
      finishedAt: now, phase: result.phase, outcome: result.outcome, smtpCode: result.code ?? null,
    } });
    let state: string = result.outcome;
    let recipientFailures = job.recipientFailures;
    let nextAt = now;
    if (result.outcome === 'TEMPORARY' || result.outcome === 'UNAVAILABLE') {
      if (!result.channel) recipientFailures++;
      state = recipientFailures >= 3 ? 'EXHAUSTED' : 'QUEUED';
      nextAt = new Date(+now + Math.min(60, 2 ** Math.min(job.attempts, 6)) * MINUTE);
    }
    const configurationChanged = retiredConfig && result.outcome === 'SUPPRESSED';
    if (configurationChanged) state = 'QUEUED'; // Local fence: SMTP never saw the envelope.
    const active = await tx.securityDelivery.updateMany({
      where: { id: job.id, attemptKey: key, state: { in: result.outcome === 'ACCEPTED' ? ['HANDOFF', 'UNCERTAIN'] : ['HANDOFF'] } },
      data: { state, nextAt, recipientFailures, config, leaseUntil: null, reason: configurationChanged ? 'CONFIG_CHANGED' : result.outcome, smtpCode: result.code ?? null },
    });
    if (active.count && state === 'SUPPRESSED') {
      // Serialize audience reassignment across simultaneous demotions.
      await tx.$queryRaw`SELECT id FROM "SecurityIncident" WHERE id = ${job.incidentId} FOR UPDATE`;
      const others = await tx.securityDelivery.count({ where: { incidentId: job.incidentId, state: { not: 'SUPPRESSED' } } });
      if (!others) await tx.securityIncident.update({ where: { id: job.incidentId }, data: { needsRecipients: true } });
    }
  });
}

export async function processSecurityAlert(job: SecurityDelivery & { incident: { kind: string; openedAt: Date } }, loopbackOnly: boolean, intervalMs: number) {
  const isolated = loopbackOnly || emailTrialEnabled() || (!!process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL);
  const user = await recipient(job.userId);
  const channel = await prisma.mailChannel.findUniqueOrThrow({ where: { id: 1 }, select: { config: true } });
  let preparationFailure: SmtpObservation | undefined;
  let config;
  let message;
  if (user) {
    try {
      config = await readObservedSmtpConfig();
      if (isolated && !['127.0.0.1', 'localhost', '::1'].includes(config.host)) throw new NonLocalTestRelay();
      if (isolated && config.host === 'localhost') config.host = '127.0.0.1';
      message = { to: user.email, ...await buildSecurityAlertEmail(user.locale === 'en' ? 'en' : 'it',
        job.incident.kind as IncidentKind, job.incident.openedAt) };
    } catch (error) {
      if (error instanceof NonLocalTestRelay) throw error;
      preparationFailure = { outcome: error instanceof InvalidMailConfiguration ? 'CONFIGURATION' : 'UNAVAILABLE', phase: 'CONFIG', channel: true };
    }
  }
  const key = randomUUID();
  const claimed = await prisma.$transaction(async tx => {
    // Settings and their monotonically increasing revision commit together. If a save
    // overlapped the single query that read the settings, leave the job queued.
    const current = await lockMailChannel(tx);
    if (current.config !== channel.config) return false;
    const now = await databaseNow(tx);
    if (!await mailCapacityAvailable(tx, now, intervalMs)) return false;
    const leaseUntil = new Date(+now + MAIL_LEASE_MS);
    const claim = await tx.securityDelivery.updateMany({ where: { id: job.id, attempts: job.attempts, state: 'QUEUED', nextAt: { lte: now } },
      data: { state: 'HANDOFF', attempts: { increment: 1 }, config: channel.config, attemptKey: key, leaseUntil } });
    if (!claim.count) return false;
    await tx.mailAttempt.create({ data: { id: key, origin: 'SECURITY', config: channel.config, number: job.attempts + 1,
      phase: 'HANDOFF', startedAt: now, leaseUntil } });
    return true;
  });
  if (!claimed) return;
  let result: SmtpObservation = { outcome: 'SUPPRESSED', phase: 'RECIPIENT', channel: false };
  let retiredConfig = false;
  if (preparationFailure) result = preparationFailure;
  else if (config && message) {
    const address = message.to;
    try {
      result = await submitObservedMail(config, message, async () => {
        const [eligible, lease] = await Promise.all([
          recipient(job.userId),
          prisma.securityDelivery.findUnique({ where: { id: job.id }, select: { state: true, attemptKey: true, leaseUntil: true } }),
        ]);
        if (eligible?.email !== address || lease?.state !== 'HANDOFF' || lease.attemptKey !== key
          || !lease.leaseUntil || lease.leaseUntil <= await databaseNow(prisma)) return false;
        const current = await prisma.mailChannel.findUniqueOrThrow({ where: { id: 1 }, select: { config: true } });
        retiredConfig = current.config !== channel.config;
        return !retiredConfig;
      });
    } catch { result = { outcome: 'UNCERTAIN', phase: 'MESSAGE', channel: false }; }
  }
  await completeAlert(job, key, result, channel.config, retiredConfig);
}

/** A bounded share of each worker cycle, independently of login and operational notification switches. */
export async function deliverSecurityAlerts(loopbackOnly = false, intervalMs = DEFAULT_SCAN_MS) {
  const now = await prisma.$transaction(async tx => {
    const channel = await lockMailChannel(tx);
    const time = await databaseNow(tx);
    await recoverSecurityLeases(tx, time);
    const manual = channel.manual as { outcome?: string; at?: string; config?: number } | null;
    const repairedAt = manual?.outcome === 'ACCEPTED' && manual.config === channel.config && manual.at ? new Date(manual.at) : null;
    await tx.securityDelivery.updateMany({
      where: { state: 'CONFIGURATION', OR: [{ config: { not: channel.config } }, ...(repairedAt ? [{ nextAt: { lt: repairedAt } }] : [])] },
      data: { state: 'QUEUED', nextAt: time },
    });
    return time;
  });
  const due = await prisma.securityDelivery.findMany({ where: { state: 'QUEUED', nextAt: { lte: now } },
    orderBy: [{ nextAt: 'asc' }, { id: 'asc' }], take: 2, include: { incident: { select: { kind: true, openedAt: true } } } });
  await Promise.all(due.map(job => processSecurityAlert(job, loopbackOnly, intervalMs)));
}
