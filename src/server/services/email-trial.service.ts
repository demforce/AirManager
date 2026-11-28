import { accountMailboxUncontested, lockMailboxWrites } from './account-mailbox';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Prisma, User } from '@/generated/prisma/client';
import { env } from '@/lib/env';
import { hashPassword } from '@/server/auth/password';
import { adminPasswordSchema } from '@/lib/schemas/auth-tokens';
import { singleMailbox } from '@/lib/schemas/email-trial';
import { prisma } from '@/server/db/prisma';
import { credentialEligible, emailTrialEnabled } from '@/server/auth/email-trial-policy';
import { databaseNow, enqueueCredential, lockMailAccount, revokeAccountCredentials } from './credential-mail.service';

import { lockLoginRequests } from './access-security';

const MINUTE = 60_000;

// Direct peers share a bucket. Only an explicitly authenticated, sanitizing
// ingress may assert a single IP address. Never store its header or secret.
export function trustedProxyIp(headers: Pick<Headers, 'get'>): string | null {
  const secret = process.env.AIRMANAGER_TRIAL_PROXY_SECRET;
  const supplied = headers.get('x-airmanager-proxy-key');
  const ip = headers.get('x-forwarded-for');
  if (!secret || Buffer.byteLength(secret) < 32 || !supplied || !ip || ip.includes('%') || !isIP(ip)) return null;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return ip;
}

export function loginRequestOrigin(headers: Pick<Headers, 'get'>): string {
  const ip = trustedProxyIp(headers);
  if (!ip) return 'direct';
  return isIP(ip) === 6 ? new URL('http://[' + ip + ']').hostname : ip;
}

function bucket(kind: string, value: string) {
  return createHmac('sha256', env.AUTH_SECRET).update('email-trial:' + kind + ':' + value).digest('hex');
}

export async function reserveRequest(tx: Prisma.TransactionClient, step: 'request' | 'confirmation', identity: string, origin: string) {
  if (step === 'request') await lockLoginRequests(tx);
  else await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(19021, 2)`;
  const now = await databaseNow(tx);
  if (step === 'request') {
    // Count demand before any identity, origin, pause or issuance suppression.
    const minute = new Date(Math.floor(+now / MINUTE) * MINUTE);
    await tx.loginVolume.upsert({ where: { minute }, create: { minute, requests: 1 }, update: { requests: { increment: 1 } } });
    const channel = await tx.mailChannel.findUniqueOrThrow({ where: { id: 1 }, select: { loginLinksPaused: true } });
    if (channel.loginLinksPaused) return null;
  }
  const cutoff = new Date(+now - 10 * MINUTE);
  await tx.emailTrialRequest.deleteMany({ where: { createdAt: { lte: cutoff } } });
  const accountBucket = bucket(step + ':identity', identity);
  const originBucket = bucket(step + ':origin', origin);
  if (await tx.emailTrialRequest.count({ where: { identity: accountBucket } }) >= (step === 'request' ? 5 : 10)
    || await tx.emailTrialRequest.count({ where: { origin: originBucket } }) >= (step === 'request' ? 20 : 30)) return null;
  await tx.emailTrialRequest.create({ data: { identity: accountBucket, origin: originBucket, createdAt: now } });
  return now;
}

/** Accepts a single syntactically valid mailbox. Every public outcome gets the same acknowledgement. */
export async function requestEmailLogin(rawEmail: string, origin: string): Promise<void> {
  const parsed = singleMailbox.safeParse(rawEmail);
  if (!emailTrialEnabled() || !parsed.success) return;
  const email = parsed.data;
  try {
    await prisma.$transaction(async tx => {
      // Independent of password, invitation and operational mail budgets.
      const now = await reserveRequest(tx, 'request', email, origin);
      if (!now) return;
      const since = (minutes: number) => new Date(+now - minutes * MINUTE);
      const account = await tx.user.findUnique({ where: { email }, select: { id: true, emailVerification: { select: { addressChangedAt: true } } } });
      if (!account) return;
      const login = { purpose: 'LOGIN_LINK' as const };
      if (await tx.credentialMail.count({ where: { ...login, createdAt: { gt: since(20) } } }) >= 10) return;
      const forAccount = { ...login, userId: account.id };
      if (await tx.credentialMail.findFirst({ where: { ...forAccount, expiresAt: { gt: now },
        ...(account.emailVerification?.addressChangedAt && { createdAt: { gte: account.emailVerification.addressChangedAt } }), OR: [{ reason: null }, { reason: { not: 'LOGIN_PAUSED' } }] }, select: { id: true } })
        || await tx.credentialMail.count({ where: { ...forAccount, createdAt: { gt: since(60) } } }) >= 3) return;
      await enqueueCredential(tx, account.id, 'LOGIN_LINK', undefined, email);
    });
  } catch {
    console.error('email-trial: login request unavailable');
  }
}

type TrialIdentity = Pick<User, 'id' | 'email' | 'roles' | 'personId' | 'tokenVersion'>;
type TrialPurpose = 'VERIFY_EMAIL' | 'LOGIN_LINK' | 'REACTIVATE_ACCOUNT';

export function consumeTrialLink(purpose: 'VERIFY_EMAIL', raw: unknown, newPassword?: unknown, origin?: string): Promise<TrialIdentity | 'passwordRequired' | null>;
export function consumeTrialLink(purpose: 'LOGIN_LINK' | 'REACTIVATE_ACCOUNT', raw: unknown, loginEmail?: unknown, origin?: string): Promise<TrialIdentity | null>;
export async function consumeTrialLink(purpose: TrialPurpose, raw: unknown, proof?: unknown, origin = 'direct') {
  if (!emailTrialEnabled() || typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const mailbox = singleMailbox.safeParse(purpose === 'LOGIN_LINK' ? proof : undefined);
  if (purpose === 'LOGIN_LINK' && !mailbox.success) return null;
  const tokenHash = createHash('sha256').update(raw).digest('hex');

  async function reserveConfirmation(tx: Prisma.TransactionClient) {
    const token = await tx.authToken.findUnique({ where: { tokenHash }, select: {
      id: true, userId: true, type: true, usedAt: true, expiresAt: true,
    } });
    const now = await reserveRequest(tx, 'confirmation', mailbox.data ?? token?.userId ?? 'unmatched', origin);
    return now && token?.type === purpose && !token.usedAt && token.expiresAt > now ? token : null;
  }

  try {
    // Only hash a conforming password for a live, rate-limited admin invitation.
    // Release the reservation transaction before Argon2; check the role and claim again at commit.
    const password = purpose === 'VERIFY_EMAIL' ? adminPasswordSchema.safeParse(proof) : null;
    let prepared;
    if (password?.success) {
      const token = await prisma.$transaction(async tx => {
        const reserved = await reserveConfirmation(tx);
        if (!reserved) return null;
        const admin = await tx.user.findFirst({ where: { id: reserved.userId, isActive: true, roles: { has: 'ADMIN' } }, select: { id: true } });
        return admin ? reserved : null;
      });
      if (!token) return null;
      prepared = { token, passwordHash: await hashPassword(password.data) };
    }
    const adminInvite = prepared;
    return await prisma.$transaction(async tx => {
      const token = adminInvite?.token ?? await reserveConfirmation(tx);
      if (!token) return null;
      if (purpose === 'REACTIVATE_ACCOUNT') await lockMailboxWrites(tx);
      await lockMailAccount(tx, token.userId);
      const user = await tx.user.findUnique({ where: { id: token.userId }, select: {
        id: true, email: true, isActive: true, roles: true, tokenVersion: true, personId: true, emailVerification: true,
      } });
      if (!user || !credentialEligible(user, purpose) || !await accountMailboxUncontested(tx, user.id, user.email) || (purpose === 'LOGIN_LINK' && mailbox.data !== user.email)) return null;
      const now = await databaseNow(tx);
      if (purpose === 'VERIFY_EMAIL') {
        if (user.roles.includes('ADMIN') && !adminInvite) return 'passwordRequired' as const;
        if (!user.roles.includes('ADMIN') && proof !== undefined) return null;
      }
      const claim = await tx.authToken.updateMany({
        where: { id: token.id, type: purpose, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
      });
      if (claim.count !== 1) return null;
      if (purpose === 'VERIFY_EMAIL') {
        if (adminInvite) await tx.user.update({ where: { id: user.id }, data: { passwordHash: adminInvite.passwordHash } });
        await tx.$executeRaw`UPDATE "EmailVerification"
          SET "verifiedAt" = ${now}, "expiryStartCycle" = nextval('"Expiry_notificationCycle_seq"')
          WHERE "userId" = ${user.id}`;
      }
      if (purpose === 'REACTIVATE_ACCOUNT') {
        await revokeAccountCredentials(tx, user.id, now);
        await tx.$executeRaw`UPDATE "EmailVerification"
          SET "reactivatedAt" = ${now}, "expiryStartCycle" = nextval('"Expiry_notificationCycle_seq"')
          WHERE "userId" = ${user.id}`;
        await tx.user.update({ where: { id: user.id }, data: {
          isActive: true, tokenVersion: { increment: 1 }, adminPasswordVersion: { increment: 1 },
        } });
      }
      return { id: user.id, email: user.email, roles: user.roles, personId: user.personId, tokenVersion: user.tokenVersion };
    });
  } catch {
    console.error('email-trial: confirmation unavailable');
    return null;
  }
}
