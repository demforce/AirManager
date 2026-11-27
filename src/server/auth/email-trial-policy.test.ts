import { describe, expect, it } from 'vitest';
import { formMailbox, singleMailbox } from '@/lib/schemas/email-trial';
import { emailTrialEnabled } from './email-trial-policy';

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
