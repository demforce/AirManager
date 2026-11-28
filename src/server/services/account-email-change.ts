import { createHash, randomUUID } from 'node:crypto';
import { singleMailbox } from '@/lib/schemas/email-trial';
import { authorize, type Actor } from '@/server/auth/rbac';
import { credentialEligible, emailTrialEnabled } from '@/server/auth/email-trial-policy';
import { openCandidate, sealCandidate } from '@/server/crypto/address-candidate';
import { prisma } from '@/server/db/prisma';
import { accountMailboxUncontested, candidateMailboxAvailable, lockMailboxWrites } from './account-mailbox';
import { databaseNow, enqueueCredential, lockMailAccount, revokeAccountCredentials } from './credential-mail.service';
import { reserveRequest } from './email-trial.service';
import { NotFoundError, ValidationError } from './errors';

export async function requestAddressChange(actor: Actor, userId: string, key: string = randomUUID()) {
  authorize(actor, actor.userId === userId ? 'self.read' : 'users.manage');
  if (!emailTrialEnabled()) throw new NotFoundError('Address change unavailable.');
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new ValidationError('Invalid request key.');
  await prisma.$transaction(async tx => {
    const first = await enqueueCredential(tx, userId, 'CHANGE_EMAIL_CURRENT', { operatorId: actor.userId, key });
    if (!first) throw new Error('Address change unavailable.');
    const { generation } = await tx.credentialMail.findUniqueOrThrow({ where: { id: first.id }, select: { generation: true } });
    // A retry with the same key must not supersede its own later stage.
    const older = { userId, purpose: 'CHANGE_EMAIL_NEW' as const, revokedAt: null, generation: { lt: generation } };
    const now = await databaseNow(tx);
    await tx.$executeRaw`UPDATE "AuthToken" SET "usedAt" = ${now}
      WHERE "usedAt" IS NULL AND id IN (SELECT "tokenId" FROM "CredentialMail"
      WHERE "userId" = ${userId} AND purpose = 'CHANGE_EMAIL_NEW' AND "revokedAt" IS NULL AND generation < ${generation})`;
    await tx.credentialMail.updateMany({ where: { ...older, state: { in: ['CLAIMED', 'QUEUED'] } },
      data: { state: 'SUPPRESSED', reason: 'REPLACED', observedAt: now } });
    await tx.credentialMail.updateMany({ where: older, data: { revokedAt: now } });
  });
  return { ok: true as const };
}

type Step = 'CHANGE_EMAIL_CURRENT' | 'CHANGE_EMAIL_NEW';

/** Both opaque credentials are bound to their originating queue intent. Only a successful
 * final confirmation changes account identity. No transport operation occurs in this transaction. */
export async function submitAddressChange(step: Step, raw: unknown, proposed?: unknown, origin = 'direct'): Promise<boolean> {
  if (!emailTrialEnabled() || typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return false;
  const candidate = step === 'CHANGE_EMAIL_CURRENT' ? singleMailbox.safeParse(proposed).data : null;
  if (step === 'CHANGE_EMAIL_CURRENT' && !candidate) return false;
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  try {
    return await prisma.$transaction(async tx => {
      const token = await tx.authToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true, type: true } });
      if (!await reserveRequest(tx, 'confirmation', token?.userId ?? 'unmatched', origin) || !token || token.type !== step) return false;
      await lockMailboxWrites(tx);
      await lockMailAccount(tx, token.userId);
      const intent = await tx.credentialMail.findFirst({ where: { tokenId: token.id, userId: token.userId, purpose: step, revokedAt: null },
        include: { user: { include: { emailVerification: true } } } });
      if (!intent || !credentialEligible(intent.user, step) || !await accountMailboxUncontested(tx, token.userId, intent.user.email)) return false;
      const email = candidate ?? openCandidate(intent);
      if (!email || email === intent.user.email || !await candidateMailboxAvailable(tx, token.userId, intent.user.personId, email)) return false;
      const now = await databaseNow(tx);
      if (intent.expiresAt <= now) return false;
      const consumed = await tx.authToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (consumed.count !== 1) return false;

      if (step === 'CHANGE_EMAIL_CURRENT') {
        const queued = await enqueueCredential(tx, token.userId, 'CHANGE_EMAIL_NEW');
        if (!queued) throw new Error('Second confirmation unavailable.');
        const second = await tx.credentialMail.findUniqueOrThrow({ where: { id: queued.id } });
        await tx.credentialMail.update({ where: { id: second.id }, data: { candidateBox: sealCandidate(second, email) } });
      } else {
        await revokeAccountCredentials(tx, token.userId, now);
        await tx.user.update({ where: { id: token.userId }, data: {
          email, tokenVersion: { increment: 1 }, adminPasswordVersion: { increment: 1 },
        } });
        await tx.emailVerification.update({ where: { userId: token.userId }, data: { email, addressChangedAt: now } });
      }
      return true;
    });
  } catch {
    // Keep database conflicts and public confirmation diagnostics free of personal data.
    console.error('email-trial: address change unavailable');
    return false;
  }
}
