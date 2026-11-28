import { createHash, randomUUID } from 'node:crypto';
import { adminPasswordSchema } from '@/lib/schemas/auth-tokens';
import { acceptableAdminPassword } from '@/server/auth/admin-password-policy';
import { credentialEligible, emailTrialEnabled } from '@/server/auth/email-trial-policy';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { type Actor, authorize } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { accountMailboxUncontested, lockMailboxWrites } from './account-mailbox';
import { databaseNow, enqueueCredential, lockMailAccount, revokeAccountCredentials } from './credential-mail.service';
import { reserveRequest } from './email-trial.service';
import { NotFoundError } from './errors';

const purpose = 'CHANGE_ADMIN_PASSWORD';

export async function requestProfilePassword(actor: Actor) {
  if (!emailTrialEnabled()) throw new NotFoundError('Password change unavailable.');
  authorize(actor, 'users.manage');
  await prisma.$transaction(tx => enqueueCredential(tx, actor.userId, purpose, { operatorId: actor.userId, key: randomUUID() }));
}

export async function saveProfilePassword(raw: unknown, password: unknown, confirmation: unknown, origin = 'direct') {
  if (!emailTrialEnabled() || typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return 'invalid';
  if (password !== confirmation) return 'mismatch';
  const parsed = adminPasswordSchema.safeParse(password);
  if (!parsed.success) return 'policy';
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  // Reserve a rate-limited confirmation before doing Argon2 work. No credential is consumed here.
  const prepared = await prisma.$transaction(async tx => {
    const token = await tx.authToken.findUnique({ where: { tokenHash }, include: { user: { include: { emailVerification: true } } } });
    const now = await reserveRequest(tx, 'confirmation', token?.userId ?? 'unmatched', origin);
    if (!now || token?.type !== purpose || token.usedAt || token.expiresAt <= now || !token.user.passwordHash
      || !credentialEligible(token.user, purpose)) return null;
    const intent = await tx.credentialMail.findFirst({ where: { tokenId: token.id, purpose, userId: token.userId, revokedAt: null,
      expiresAt: { gt: now }, expectedAdminPasswordVersion: token.user.adminPasswordVersion }, select: { id: true } });
    return intent && { id: token.id, intent: intent.id, userId: token.userId, hash: token.user.passwordHash,
      email: token.user.email, version: token.user.adminPasswordVersion };
  });
  if (!prepared) return 'invalid';
  if (!acceptableAdminPassword(parsed.data, prepared.email) || await verifyPassword(prepared.hash, parsed.data)) return 'policy';
  const passwordHash = await hashPassword(parsed.data);
  return prisma.$transaction(async tx => {
    await lockMailboxWrites(tx);
    await lockMailAccount(tx, prepared.userId);
    const intent = await tx.credentialMail.findUnique({ where: { id: prepared.intent }, include: { user: { include: { emailVerification: true } } } });
    if (!intent || intent.revokedAt || intent.tokenId !== prepared.id || intent.user.adminPasswordVersion !== prepared.version
      || intent.user.email !== prepared.email || intent.user.passwordHash !== prepared.hash || !credentialEligible(intent.user, purpose)
      || !await accountMailboxUncontested(tx, intent.userId, intent.user.email)) return 'invalid' as const;
    const now = await databaseNow(tx);
    if (intent.expiresAt <= now) return 'invalid' as const;
    const claim = await tx.authToken.updateMany({ where: { id: prepared.id, type: purpose, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (claim.count !== 1) return 'invalid' as const;
    await revokeAccountCredentials(tx, intent.userId, now);
    await tx.user.update({ where: { id: intent.userId }, data: { passwordHash, tokenVersion: { increment: 1 }, adminPasswordVersion: { increment: 1 } } });
    return 'saved' as const;
  });
}
