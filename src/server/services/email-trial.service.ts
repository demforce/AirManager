import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Prisma } from '@/generated/prisma/client';
import { env } from '@/lib/env';
import { singleMailbox } from '@/lib/schemas/email-trial';
import { prisma } from '@/server/db/prisma';
import { credentialEligible, emailTrialEnabled } from '@/server/auth/email-trial-policy';
import { databaseNow, enqueueCredential, lockMailAccount } from './credential-mail.service';

const MINUTE = 60_000;

// Direct peers share a bucket. Only an explicitly authenticated, sanitizing
// ingress may assert a single IP address. Never store its header or secret.
export function loginRequestOrigin(headers: Pick<Headers, 'get'>): string {
  const secret = process.env.AIRMANAGER_TRIAL_PROXY_SECRET;
  const supplied = headers.get('x-airmanager-proxy-key');
  const ip = headers.get('x-forwarded-for');
  if (!secret || Buffer.byteLength(secret) < 32 || !supplied || !ip || ip.includes('%') || !isIP(ip)) return 'direct';
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return 'direct';
  return isIP(ip) === 6 ? new URL('http://[' + ip + ']').hostname : ip;
}

function bucket(kind: string, value: string) {
  return createHmac('sha256', env.AUTH_SECRET).update('email-trial:' + kind + ':' + value).digest('hex');
}

async function reserveRequest(tx: Prisma.TransactionClient, step: 'request' | 'confirmation', identity: string, origin: string) {
  const namespace = step === 'request' ? 1 : 2;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(19021, ${namespace}::int)`;
  const now = await databaseNow(tx);
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
      const account = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (!account) return;
      const login = { purpose: 'LOGIN_LINK' as const };
      if (await tx.credentialMail.count({ where: { ...login, createdAt: { gt: since(20) } } }) >= 10) return;
      const forAccount = { ...login, userId: account.id };
      if (await tx.credentialMail.findFirst({ where: { ...forAccount, expiresAt: { gt: now } }, select: { id: true } })
        || await tx.credentialMail.count({ where: { ...forAccount, createdAt: { gt: since(60) } } }) >= 3) return;
      await enqueueCredential(tx, account.id, 'LOGIN_LINK', undefined, email);
    });
  } catch {
    console.error('email-trial: login request unavailable');
  }
}

export async function consumeTrialLink(purpose: 'VERIFY_EMAIL' | 'LOGIN_LINK', raw: unknown, loginEmail?: unknown, origin = 'direct') {
  if (!emailTrialEnabled() || typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const mailbox = singleMailbox.safeParse(loginEmail);
  if (purpose === 'LOGIN_LINK' && !mailbox.success) return null;
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  try {
    return await prisma.$transaction(async tx => {
      const token = await tx.authToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true, type: true } });
      if (!await reserveRequest(tx, 'confirmation', mailbox.data ?? token?.userId ?? 'unmatched', origin)) return null;
      if (!token || token.type !== purpose) return null;
      await lockMailAccount(tx, token.userId);
      const user = await tx.user.findUnique({ where: { id: token.userId }, select: {
        id: true, email: true, isActive: true, roles: true, tokenVersion: true, personId: true, emailVerification: true,
      } });
      if (!user || !credentialEligible(user, purpose) || (purpose === 'LOGIN_LINK' && mailbox.data !== user.email)) return null;
      const now = await databaseNow(tx);
      const claim = await tx.authToken.updateMany({
        where: { id: token.id, type: purpose, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
      });
      if (claim.count !== 1) return null;
      if (purpose === 'VERIFY_EMAIL') {
        await tx.emailVerification.update({ where: { userId: user.id }, data: { verifiedAt: now } });
      }
      return { id: user.id, email: user.email, roles: user.roles, personId: user.personId, tokenVersion: user.tokenVersion };
    });
  } catch {
    console.error('email-trial: confirmation unavailable');
    return null;
  }
}
