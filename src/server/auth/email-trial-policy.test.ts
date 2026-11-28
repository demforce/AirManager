import { describe, expect, it, vi } from 'vitest';
import { formMailbox, singleMailbox } from '@/lib/schemas/email-trial';
import { credentialEligible, emailTrialEnabled } from './email-trial-policy';

describe('email access trial boundary', () => {
  const db = 'postgresql://fixture@localhost:55410/airmanager_test';
  const valid = { AIRMANAGER_EMAIL_TRIAL: '1', DATABASE_URL: db, TEST_DATABASE_URL: db, APP_URL: 'http://localhost:3000' };
  it('requires explicit opt-in, a marked disposable local database and local application', () => {
    expect(emailTrialEnabled(valid)).toBe(true);
    for (const patch of [{ AIRMANAGER_EMAIL_TRIAL: undefined }, { AIRMANAGER_EMAIL_TRIAL: 'true' },
      { TEST_DATABASE_URL: undefined }, { APP_URL: 'https://example.invalid' }, { PGHOSTADDR: '192.0.2.5' },
      { DATABASE_URL: db.replace('airmanager_test', 'other'), TEST_DATABASE_URL: db.replace('airmanager_test', 'other') }]) {
      expect(emailTrialEnabled({ ...valid, ...patch })).toBe(false);
    }
  });
  it('separates reactivation of verified suspended accounts from first invitation and login', () => {
    for (const [key,value] of Object.entries(valid)) vi.stubEnv(key,value);
    try {
      const email = 'pilot@fixture.invalid';
      const suspended = { email, isActive: false, roles: ['PILOT'], emailVerification: { email, verifiedAt: new Date() } };
      expect(credentialEligible(suspended, 'REACTIVATE_ACCOUNT')).toBe(true);
      expect(credentialEligible(suspended, 'VERIFY_EMAIL')).toBe(false);
      expect(credentialEligible(suspended, 'LOGIN_LINK')).toBe(false);
      expect(credentialEligible({ ...suspended, isActive: true }, 'REACTIVATE_ACCOUNT')).toBe(false);
      expect(credentialEligible({ ...suspended, emailVerification: null }, 'REACTIVATE_ACCOUNT')).toBe(false);
      expect(credentialEligible({ ...suspended, emailVerification: { email, verifiedAt: null } }, 'REACTIVATE_ACCOUNT')).toBe(false);
      vi.stubEnv('AIRMANAGER_EMAIL_TRIAL', '0');
      expect(credentialEligible(suspended, 'REACTIVATE_ACCOUNT')).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });
  it('requires an active, verified trial account for both steps of an address change', () => {
    for (const [key, value] of Object.entries(valid)) vi.stubEnv(key, value);
    const email = 'holder@fixture.invalid';
    const holder = { email, roles: ['PILOT'], isActive: true, emailVerification: { email, verifiedAt: new Date() } };
    try {
      for (const purpose of ['CHANGE_EMAIL_CURRENT', 'CHANGE_EMAIL_NEW'] as const) {
        expect(credentialEligible(holder, purpose)).toBe(true);
        expect(credentialEligible({ ...holder, isActive: false }, purpose)).toBe(false);
        expect(credentialEligible({ ...holder, emailVerification: null }, purpose)).toBe(false);
        expect(credentialEligible({ ...holder, email: 'different@fixture.invalid' }, purpose)).toBe(false);
      }
      vi.stubEnv('AIRMANAGER_EMAIL_TRIAL', '0');
      expect(credentialEligible(holder, 'CHANGE_EMAIL_CURRENT')).toBe(false);
      expect(credentialEligible(holder, 'CHANGE_EMAIL_NEW')).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });
  it('accepts exactly one mailbox and only the email field', () => {
    for (const invalid of ['one@example.invalid,two@example.invalid', 'A <one@example.invalid>',
      'one@example.invalid; two@example.invalid', 'one@example.invalid two@example.invalid',
      'one@example.invalid\r\n', '\tone@example.invalid', 'one@example.invalid\u0000', 'one@example.invalid\u007f']) {
      expect(singleMailbox.safeParse(invalid).success).toBe(false);
    }
    const form = new FormData();
    form.append('email', '  One@Example.Invalid ');
    expect(formMailbox(form)).toBe('one@example.invalid');
    form.append('email', 'two@example.invalid');
    expect(formMailbox(form)).toBeNull();
    form.delete('email');
    form.append('email', 'one@example.invalid');
    form.append('cc', 'two@example.invalid');
    expect(formMailbox(form)).toBeNull();
  });
});
