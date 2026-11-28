import { describe, expect, it, vi } from 'vitest';
import * as mail from './templates';

vi.mock('@/lib/env', () => ({ env: { APP_URL: 'https://club.example.test' } }));

const origin = 'https://club.example.test';
const expiry = new Date('2031-06-15T10:30:00Z');
const name = 'Lia <C> & "D"';
const note = "Prima riga\nSeconda <riga> & 'nota'";

describe.each(['it', 'en'] as const)('HTML mail in %s', (locale) => {
  const passwordUrl = origin + '/set-password?token=sample';
  const securityMessages = [
    ['INVITE', passwordUrl, 'Imposta la password', 'Set your password'],
    ['PASSWORD_RESET', passwordUrl, 'Reimposta la password', 'Reset your password'],
    ['VERIFY_EMAIL', origin + '/' + locale + '/email-access?purpose=verify#sample', 'Verifica il tuo indirizzo', 'Verify your email address'],
    ['CHANGE_EMAIL_CURRENT', origin + '/' + locale + '/email-access?purpose=change-current#sample', 'Scegli il nuovo indirizzo', 'Choose new address'],
    ['CHANGE_EMAIL_NEW', origin + '/' + locale + '/email-access?purpose=change-new#sample', 'Conferma nuovo indirizzo', 'Confirm new address'],
    ['LOGIN_LINK', origin + '/' + locale + '/email-access?purpose=login#sample', 'Conferma l’accesso', 'Confirm sign-in'],
  ] as const;

  it.each(securityMessages)('keeps %s text and a single matching, named action', async (purpose, href, itLabel, enLabel) => {
    const message = await mail.buildCredentialEmail(locale, purpose, href, expiry);
    expect(message.text).toContain(href);
    expect(message.html.match(/<a\s/g)).toHaveLength(1);
    expect(message.html).toContain('href="' + href + '"');
    expect(message.html).toContain(locale === 'it' ? itLabel : enLabel);
    expect(message.html).toContain('2031');
    expect(message.html).not.toMatch(/<script|<img|<link\s|@import|url\(/i);
  });

  it('keeps the relative invite and reset wording and links', async () => {
    const href = origin + '/' + locale + '/set-password?token=sample';
    const [invite, reset] = await Promise.all([
      mail.buildInviteEmail(locale, { setPasswordUrl: href, expiresInDays: 7 }),
      mail.buildPasswordResetEmail(locale, { setPasswordUrl: href, expiresInHours: 2 }),
    ]);
    expect(invite.html).toContain(locale === 'it' ? '7 giorni' : '7 days');
    expect(reset.html).toContain(locale === 'it' ? '2 ore' : '2 hours');
    for (const message of [invite, reset]) expect(message.html).toContain('href="' + href + '"');
  });

  it('shares the layout and escapes names, multiline reasons and subject text in all operational notices', async () => {
    const holder = { firstName: name, aircraftRegistration: 'I-<A>', startsAt: expiry };
    const messages = await Promise.all([
      mail.buildNegativeBalanceAlertEmail(locale, { personName: name, balanceCents: -12000 }),
      mail.buildAircraftArchivedEmail(locale, holder),
      mail.buildBookingDeniedEmail(locale, { ...holder, reason: note }),
      mail.buildAircraftGroundedEmail(locale, { ...holder, reason: note, effectiveUntil: null, outOfServiceUntil: null }),
      mail.buildExpiryAlertEmail(locale, { personName: name, typeName: 'SEP', daysLeft: 3, expiresAt: expiry }),
    ]);
    for (const message of messages) {
      expect(message.html).toContain('<html lang="' + locale + '">');
      expect(message.html).toContain('AirManager');
      expect(message.html).toContain('Lia &lt;C&gt; &amp; &quot;D&quot;');
      expect(message.html).not.toMatch(/<A>|<C>|<riga>|<a\s|<script|<img|<link\s/i);
      expect(message.text).toContain(name);
    }
    for (const { html, text } of messages.slice(2, 4)) {
      expect(html).toMatch(/Prima riga<br\s*\/?>Seconda &lt;riga&gt; &amp; &#39;nota&#39;/);
      expect(text).toContain(note);
    }
  });

  it('renders the digest as a labelled data table, preserving each localized status and its holder', async () => {
    const states = ['EMAILED', 'NO_EMAIL', 'SEND_FAILED', 'REMINDERS_DISABLED', 'THRESHOLD_SUSPENDED'] as const;
    const { text, html } = await mail.buildExpiryDigestEmail(locale, { items: states.map((holderStatus, i) => ({
      personName: name + i, typeName: 'SEP', expiresAt: expiry, daysLeft: -3, holderStatus,
    })) });
    expect(html.match(/scope="col"/g)).toHaveLength(2);
    expect(html.match(/scope="row"/g)).toHaveLength(5);
    const flags = [...text.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
    expect(flags).toHaveLength(4);
    for (const flag of flags) expect(html).toContain(flag);
    expect(html).toContain('Lia &lt;C&gt; &amp; &quot;D&quot;4');
    expect(html).not.toContain('<C>');
    expect(html).toContain(locale === 'it' ? '15 giugno 2031' : '15 June 2031');
  });
});

it('wraps the bilingual club test with the same wordmark and preserves its SMTP probe text exactly', async () => {
  const message = await mail.buildSmtpTestEmail();
  expect(message.subject).toBe('AirManager — Email di prova / Test email');
  expect(message.text).toBe('Email di prova / SMTP test · AirManager.');
  expect(message.html).toContain('Email di prova');
  expect(message.html).toContain('<span lang="en">SMTP test · AirManager.</span>');
  expect(message.html).not.toMatch(/<a\s/i);
});

it.each([
  ['LOGIN_LINK', 'https://elsewhere.example.test/en/email-access?purpose=login#sample'],
  ['LOGIN_LINK', origin + '/en/email-access?purpose=verify#sample'],
  ['INVITE', origin + '/dashboard/settings?token=sample'],
  ['PASSWORD_RESET', 'https://staff@club.example.test/set-password?token=sample'],
] as const)('rejects an untrusted or incorrect %s action in both alternatives without reporting its URL', async (purpose, url) => {
  await expect(mail.buildCredentialEmail('en', purpose, url, expiry)).rejects.toThrow(/^Invalid email action URL\.$/);
});

it('encodes a literal ampersand in the action attribute and keeps the original plain URL', async () => {
  const url = origin + '/en/email-access?purpose=login#sample&value';
  const { html, text } = await mail.buildCredentialEmail('en', 'LOGIN_LINK', url, expiry);
  expect(text).toContain(url);
  expect(html).toContain('href="' + url.replace('&', '&amp;') + '"');
});
