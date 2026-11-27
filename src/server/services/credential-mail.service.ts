import { randomUUID } from 'node:crypto';
import type { Prisma, AuthTokenType } from '@/generated/prisma/client';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, NotFoundError, ValidationError } from './errors';
export const INVITE_TTL_MS = 7 * 86_400_000;
export const PASSWORD_RESET_TTL_MS = 2 * 3_600_000;
type Tx = Prisma.TransactionClient;
export async function databaseNow(tx: Tx): Promise<Date> {
  const [row] = await tx.$queryRaw<{
    now: Date;
  }[]>`SELECT clock_timestamp() AS now`;
  return row.now;
}
export async function lockMailAccount(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
}
export async function enqueueCredential(tx: Tx, userId: string, purpose: AuthTokenType, action?: {
  operatorId: string;
  key: string;
}, expectedEmail?: string) {
  await lockMailAccount(tx, userId);
  const user = await tx.user.findUnique({
    where: {
      id: userId
    },
    select: {
      email: true,
      isActive: true,
      passwordHash: true
    }
  });
  const now = await databaseNow(tx);
  if (action) {
    const previous = await tx.credentialMail.findFirst({
      where: {
        userId,
        purpose,
        operatorId: action.operatorId,
        actionKey: action.key,
        createdAt: {
          gt: new Date(now.getTime() - 86_400_000)
        }
      }
    });
    if (previous) return {
      id: previous.id,
      state: 'QUEUED' as const
    };
  }
  if (!user || !user.isActive || expectedEmail && user.email !== expectedEmail || purpose === 'INVITE' && user.passwordHash !== null) {
    if (purpose === 'PASSWORD_RESET') return null;
    if (!user) throw new NotFoundError('User not found.');
    throw new ConflictError('This account has no eligible pending invitation.');
  }
  if (action) {
    // All operators share the recipient cooldown. The separate operator limit also spans accounts.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${action.operatorId}, 17))`;
    const recent = await tx.credentialMail.findFirst({
      where: {
        userId,
        purpose,
        operatorId: {
          not: null
        },
        createdAt: {
          gt: new Date(now.getTime() - 60_000)
        }
      }
    });
    const operatorUses = await tx.credentialMail.count({
      where: {
        operatorId: action.operatorId,
        createdAt: {
          gt: new Date(now.getTime() - 600_000)
        }
      }
    });
    if (recent || operatorUses >= 20) throw new ConflictError('Wait before issuing another invitation.', undefined, 'INVITE_COOLDOWN');
    await tx.credentialMail.updateMany({
      where: {
        userId,
        purpose,
        operatorId: action.operatorId,
        actionKey: action.key
      },
      data: {
        actionKey: null
      }
    });
  }
  await tx.authToken.updateMany({
    where: {
      userId,
      type: purpose,
      usedAt: null
    },
    data: {
      usedAt: now
    }
  });
  await tx.credentialMail.updateMany({
    where: {
      userId,
      purpose,
      revokedAt: null,
      state: {
        in: ['CLAIMED', 'QUEUED']
      }
    },
    data: {
      revokedAt: now,
      state: 'SUPPRESSED',
      reason: 'REPLACED',
      observedAt: now
    }
  });
  await tx.credentialMail.updateMany({
    where: {
      userId,
      purpose,
      revokedAt: null
    },
    data: {
      revokedAt: now
    }
  });
  const intent = await tx.credentialMail.create({
    data: {
      userId,
      purpose,
      expiresAt: new Date(now.getTime() + (purpose === 'INVITE' ? INVITE_TTL_MS : PASSWORD_RESET_TTL_MS)),
      createdAt: now,
      observedAt: now,
      nextAt: now,
      operatorId: action?.operatorId,
      actionKey: action?.key
    }
  });
  return {
    id: intent.id,
    state: 'QUEUED' as const
  };
}
export async function resendInvite(actor: Actor, userId: string, key: string = randomUUID()) {
  authorize(actor, 'users.manage');
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new ValidationError('Invalid request key.');
  const invite = await prisma.$transaction(tx => enqueueCredential(tx, userId, 'INVITE', {
    operatorId: actor.userId,
    key
  }));
  return {
    ok: true as const,
    invite
  };
}
export async function readInviteStatus(actor: Actor, userId: string) {
  authorize(actor, 'users.manage');
  const latest = await prisma.credentialMail.findFirst({
    where: {
      userId,
      purpose: 'INVITE'
    },
    orderBy: { generation: 'desc' },
    select: {
      tokenId: true,
      state: true,
      reason: true,
      observedAt: true,
      nextAt: true,
      expiresAt: true,
      revokedAt: true,
      history: {
        orderBy: {
          startedAt: 'desc'
        },
        take: 1,
        select: {
          outcome: true,
          phase: true,
          smtpCode: true
        }
      }
    }
  });
  if (!latest) return null;
  const { tokenId, ...status } = latest;
  const credential = tokenId && !status.revokedAt ? await prisma.authToken.findFirst({
    where: { id: tokenId, userId, usedAt: null, expiresAt: { gt: new Date() } },
    select: { expiresAt: true },
  }) : null;
  return { ...status, credentialValidUntil: credential?.expiresAt ?? null };

}
