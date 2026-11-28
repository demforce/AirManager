import type { AuthTokenType } from '@/generated/prisma/client';
import { singleMailbox } from '@/lib/schemas/email-trial';

export function emailTrialEnabled(vars: Record<string, string | undefined> = process.env): boolean {
  if (vars.AIRMANAGER_EMAIL_TRIAL !== '1' || !vars.TEST_DATABASE_URL || vars.DATABASE_URL !== vars.TEST_DATABASE_URL) return false;
  try {
    const db = new URL(vars.DATABASE_URL);
    const app = new URL(vars.APP_URL ?? '');
    const local = (host: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(host);
    return ['postgres:', 'postgresql:'].includes(db.protocol) && local(db.hostname) && Boolean(db.port)
      && ['/airmanager_test', '/airmanager_e2e'].includes(db.pathname)
      && [...db.searchParams].every(([key, value]) => key === 'schema' && value === 'public')
      && !['PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGSERVICE','PGSERVICEFILE','PGOPTIONS'].some(key => vars[key])
      && ['http:', 'https:'].includes(app.protocol) && local(app.hostname) && !app.username && !app.password;
  } catch { return false; }
}

export function trialPurpose(purpose: AuthTokenType) {
  return purpose === 'VERIFY_EMAIL' || purpose === 'LOGIN_LINK' || purpose === 'REACTIVATE_ACCOUNT';
}

type Account = {
  email: string; isActive: boolean; passwordHash?: string | null; roles: string[];
  emailVerification?: { email: string; verifiedAt: Date | null } | null;
};

export function verifiedTrialAddress(user: Pick<Account, 'email' | 'emailVerification'>): boolean {
  return Boolean(user.emailVerification?.verifiedAt && user.email === user.emailVerification.email);
}

export function credentialEligible(user: Account, purpose: AuthTokenType): boolean {
  if (purpose === 'REACTIVATE_ACCOUNT') {
    return emailTrialEnabled() && !user.isActive && verifiedTrialAddress(user)
      && singleMailbox.safeParse(user.email).data === user.email;
  }
  if (!user.isActive) return false;
  const enrollment = user.emailVerification;
  if (!enrollment) return !trialPurpose(purpose) && (purpose !== 'INVITE' || user.passwordHash === null);
  const canonical = singleMailbox.safeParse(user.email);
  if (!canonical.success || canonical.data !== user.email || enrollment.email !== user.email) return false;
  if (!emailTrialEnabled()) return false;
  if (purpose === 'PASSWORD_RESET') return verifiedTrialAddress(user) && user.roles.includes('ADMIN');
  if (purpose === 'VERIFY_EMAIL') return enrollment.verifiedAt === null;
  return purpose === 'LOGIN_LINK' && enrollment.verifiedAt !== null;
}
