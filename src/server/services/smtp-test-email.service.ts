import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { getAirfieldContactEmail } from './app-settings.service';
import { runManualMail } from './credential-mail-worker';
import { ValidationError } from './errors';
export async function sendSmtpTestEmail(actor: Actor) {
  authorize(actor, 'settings.manage');
  const contact = await getAirfieldContactEmail();
  if (!contact) throw new ValidationError('Set a club contact before testing SMTP.', undefined, 'NO_CONTACT_EMAIL');
  return runManualMail(contact);
}
export async function readMailHealth(actor: Actor) {
  authorize(actor, 'settings.manage');
  const [channel, waiting, uncertain, rejected, exhausted, oldest] = await Promise.all([prisma.mailChannel.findUniqueOrThrow({
    where: {
      id: 1
    }
  }), prisma.credentialMail.count({
    where: {
      state: {
        in: ['QUEUED', 'CLAIMED', 'HANDOFF']
      }
    }
  }), prisma.credentialMail.count({
    where: {
      state: 'UNCERTAIN'
    }
  }), prisma.mailAttempt.count({
    where: {
      outcome: {
        in: ['TEMPORARY', 'PERMANENT']
      }
    }
  }), prisma.credentialMail.count({
    where: {
      state: 'EXHAUSTED'
    }
  }), prisma.credentialMail.findFirst({
    where: {
      state: 'QUEUED'
    },
    orderBy: {
      createdAt: 'asc'
    },
    select: {
      createdAt: true
    }
  })]);
  return {
    mode: channel.mode,
    reason: channel.reason,
    heartbeatAt: channel.heartbeatAt,
    workerOverdue: !!channel.heartbeatAt && Date.now() - +channel.heartbeatAt > 240_000,
    manual: channel.manual,
    automatic: channel.automatic,
    waiting,
    uncertain,
    rejected,
    exhausted,
    oldestAt: oldest?.createdAt ?? null
  };
}
