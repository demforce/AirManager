import { renderClubProbe, renderEmail, type EmailContent } from './mail-layout';
import type { CredentialPurpose } from './credential-action';
import { createTranslator } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatCents } from '@/lib/money';
import { formatDateOnly, formatDateTime } from '@/lib/time';

/**
 * Loads a locale's message catalogue directly (not via `next-intl/server`'s
 * `getTranslations`, which is bound to the *current request's* locale). An
 * invite/reset email must be written in the *recipient's* stored `locale`
 * (AD-7: "le email ... usano la lingua scelta dal destinatario"), which is
 * almost always different from whichever locale the admin who triggered the
 * action happens to be browsing in.
 */
type Messages = typeof import('../../../../messages/it.json');

async function loadMessages(locale: AppLocale): Promise<Messages> {
  return (await import(`../../../../messages/${locale}.json`)).default as Messages;
}

export type InviteEmailContent = EmailContent;
export type PasswordResetEmailContent = EmailContent;
export type NegativeBalanceAlertEmailContent = EmailContent;
export type ExpiryAlertEmailContent = EmailContent;
export type ExpiryDigestEmailContent = EmailContent;
export type BookingDeniedEmailContent = EmailContent;
export type AircraftGroundedEmailContent = EmailContent;

/**
 * One row of the staff digest (story 6.3, tri-state hardened story TD-1 AC
 * 2) — mirrors `expiry-alerts.service.ts`'s per-candidate loop state.
 * `holderStatus` distinguishes the three outcomes a candidate can land in:
 * `EMAILED` (no flag), `NO_EMAIL` (no `Person.email` on file — the
 * recovery-net flag), and `SEND_FAILED` (an email exists but SMTP send
 * failed — a DIFFERENT flag, since the staff recovery action differs:
 * "contact them directly" vs "automatic retry next run"). Replaces the
 * earlier boolean `holderEmailed`, which conflated the latter two cases.
 */
export type ExpiryDigestItem = {
  personName: string;
  typeName: string;
  expiresAt: Date;
  daysLeft: number;
  holderStatus: 'EMAILED' | 'NO_EMAIL' | 'SEND_FAILED' | 'REMINDERS_DISABLED' | 'THRESHOLD_SUSPENDED';
};

/**
 * Builds the invite email (AC 1). Subject/body come from the `Emails.invite`
 * catalogue entry (`messages/{it,en}.json`) — no hardcoded strings, per the
 * story's Task 1.
 */
export async function buildInviteEmail(
  locale: AppLocale,
  params: { setPasswordUrl: string; expiresInDays: number },
): Promise<InviteEmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.invite' });

  const { credentialAction } = await import('./credential-action');
  const action = credentialAction(locale, 'INVITE', params.setPasswordUrl, t('action'));
  return renderEmail(locale, messages.Emails.layout.footer, t('subject'),
    t('body', { url: params.setPasswordUrl, expiresInDays: params.expiresInDays }), { action });
}

/**
 * Builds the password-reset email (AC 3). Subject/body come from the
 * `Emails.passwordReset` catalogue entry.
 */
export async function buildPasswordResetEmail(
  locale: AppLocale,
  params: { setPasswordUrl: string; expiresInHours: number },
): Promise<PasswordResetEmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.passwordReset' });

  const { credentialAction } = await import('./credential-action');
  const action = credentialAction(locale, 'PASSWORD_RESET', params.setPasswordUrl, t('action'));
  return renderEmail(locale, messages.Emails.layout.footer, t('subject'),
    t('body', { url: params.setPasswordUrl, expiresInHours: params.expiresInHours }), { action });
}

/**
 * Builds the negative-balance alert email (story 3.3, AC 2) — sent when a
 * rettifica/top-up makes an account's balance band worsen (`accounts.service.ts`'s
 * `balanceBand`). `locale` is the recipient `Person`'s linked `User.locale`
 * (AD-7), not the staff actor's — same rationale as the invite/reset emails.
 * `balanceCents` is formatted with THIS email's locale (M1: money is always
 * locale-aware), never the actor's browsing locale.
 */
export async function buildNegativeBalanceAlertEmail(
  locale: AppLocale,
  params: { personName: string; balanceCents: number },
): Promise<NegativeBalanceAlertEmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.negativeBalanceAlert' });

  return renderEmail(locale, messages.Emails.layout.footer,
    t('subject'),
    t('body', { name: params.personName, balance: formatCents(params.balanceCents, locale) }),
  );
}

/**
 * Locale-aware, date-ONLY (no time-of-day) long date — story 6.3, Dev Notes:
 * "data formattata locale-aware date-only UTC". `time.ts`'s formatters
 * don't cover this shape (they present a Europe/Rome timestamp-of-day, for
 * timestamps — not a bare calendar date); `timeZone: 'UTC'` keeps a
 * `@db.Date` value's calendar day intact regardless of server timezone,
 * the same date-only discipline as `date-only.ts`. Private to this module —
 * only the expiry email builders need it.
 */
function formatExpiryDate(date: Date, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-IE', { timeZone: 'UTC', dateStyle: 'long' }).format(date);
}

/**
 * Renders the `Emails.expiryDays.*` day-phrase sub-key for a given
 * `daysLeft` (story 6.3, Contesto: "la frase temporale via sotto-chiavi
 * dedicate ... MAI la soglia nel testo, sempre i giorni reali"). Shared by
 * both the holder alert and the staff digest so the wording — and its
 * it/en pairing — never drifts between the two templates (one catalogue
 * entry, not two copies). Each sub-key is a full verb phrase ("scade
 * oggi"/"expires today", "scade tra N giorni"/"expires in N days", "è
 * scaduta da N giorni"/"expired N days ago") so callers can slot it
 * straight into a sentence without re-conjugating around it. The one
 * exception is the digest's PAST phrase (story 19.12b, decisione PO 3): «è
 * scaduta» agrees with the holder's «La tua scadenza», not with the type
 * name the digest line leads with («Rating SEP: …»), so the digest reads
 * its own neutral `Emails.expiryDigest.expiredDaysAgo` instead.
 *
 * Builds its OWN narrowly-namespaced translator (`Emails.expiryDays`)
 * rather than accepting one from the caller: `createTranslator`'s return
 * type is generic over BOTH the full message tree and the exact namespace
 * literal it was built with, so a translator scoped to `'Emails'` and one
 * scoped to `'Emails.expiryDays'` are not interchangeable at the type
 * level (the key parameter's literal-union type differs) — reconstructing
 * it here, with a namespace known at this call site, sidesteps that
 * entirely instead of fighting it with a loosened function-parameter type.
 */
function expiryDaysPhrase(locale: AppLocale, messages: Messages, daysLeft: number): string {
  const t = createTranslator({ locale, messages, namespace: 'Emails.expiryDays' });

  if (daysLeft === 0) {
    return t('expiresToday');
  }
  if (daysLeft > 0) {
    return t('expiresInDays', { days: daysLeft });
  }
  return t('expiredDaysAgo', { days: Math.abs(daysLeft) });
}

/**
 * Builds the holder-facing expiry alert email (story 6.3, AC 1). Sent AT
 * MOST once per titolare per job run, no matter how many thresholds that
 * run consumed for this scadenza (see `expiry-alerts.service.ts`'s
 * catch-up doc-comment) — the body always talks about the REAL `daysLeft`,
 * never the threshold(s) that triggered it.
 */
export async function buildExpiryAlertEmail(
  locale: AppLocale,
  params: { personName: string; typeName: string; expiresAt: Date; daysLeft: number },
): Promise<ExpiryAlertEmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.expiryAlert' });
  const daysPhrase = expiryDaysPhrase(locale, messages, params.daysLeft);
  const date = formatExpiryDate(params.expiresAt, locale);

  return renderEmail(locale, messages.Emails.layout.footer,
    t('subject', { typeName: params.typeName }),
    t('body', { name: params.personName, typeName: params.typeName, daysPhrase, date }),
  );
}

/**
 * Builds the staff digest email (story 6.3, AC 1; tri-state flag hardened
 * story TD-1, AC 2) — one per active ADMIN user per run, sent ONLY
 * when the run attempted at least one alert (the caller,
 * `expiry-alerts.service.ts`, never invokes this otherwise). Lists every
 * alert attempted this run, flagging `NO_EMAIL` holders (no `Person.email` on
 * file — the recovery net for the "thresholds are consumed regardless" rule,
 * Contesto) DISTINCTLY from `SEND_FAILED` holders (an email exists but the
 * SMTP send itself failed and the next run will retry automatically, rather
 * than requiring direct contact). `EMAILED` items carry no
 * flag at all.
 */
export async function buildExpiryDigestEmail(
  locale: AppLocale,
  params: { items: ExpiryDigestItem[] },
): Promise<ExpiryDigestEmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.expiryDigest' });

  const flags = {
    EMAILED: '',
    NO_EMAIL: t('noEmailFlag'),
    SEND_FAILED: t('sendFailedFlag'),
    REMINDERS_DISABLED: t('remindersDisabledFlag'),
    THRESHOLD_SUSPENDED: t('thresholdSuspendedFlag'),
  };
  const rows = params.items.map((item) => {
    const daysPhrase = item.daysLeft < 0 ? t('expiredDaysAgo', { days: Math.abs(item.daysLeft) }) : expiryDaysPhrase(locale, messages, item.daysLeft);
    const date = formatExpiryDate(item.expiresAt, locale);
    const details = t('details', { typeName: item.typeName, daysPhrase, date });
    return { name: item.personName, details, flag: flags[item.holderStatus] };
  });

  const intro = t('intro');
  const lines = rows.map((row) => t('itemLine', row));
  return renderEmail(locale, messages.Emails.layout.footer, t('subject'), `${intro}\n\n${lines.join('\n')}`, {
    intro,
    table: { headers: [t('holderColumn'), t('expiryColumn')], rows },
  });
}

/**
 * Builds the booking-denial email (epic 12, story 12.2, AC 5) — sent
 * best-effort AFTER `bookings.service.ts#transitionBooking`'s `PENDING ->
 * DENIED` write commits, same fire-and-forget/no-throw rule as every other
 * outcome email in this module. `locale` is the booking-holder's `User.locale`
 * (AD-7), resolved by the caller the same way as
 * `accounts.service.ts#sendNegativeBalanceAlert` (fallback `it` when there is
 * no linked `User`). `startsAt` is formatted date+time in `APP_TIMEZONE`
 * (`formatDateTime`, `time.ts`) and `reason` is the staff-entered mandatory
 * motivation, included verbatim.
 */
export async function buildBookingDeniedEmail(
  locale: AppLocale,
  params: { firstName: string; aircraftRegistration: string; startsAt: Date; reason: string },
): Promise<BookingDeniedEmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.bookingDenied' });
  const when = formatDateTime(params.startsAt, locale);

  return renderEmail(locale, messages.Emails.layout.footer,
    t('subject', { aircraftRegistration: params.aircraftRegistration }),
    t('body', {
      firstName: params.firstName,
      aircraftRegistration: params.aircraftRegistration,
      when,
      reason: params.reason,
    }),
  );
}

/**
 * Builds the aircraft-grounded email (story AOG-1b, ratifica R-AOG-i) — sent
 * best-effort AFTER `aircraft.service.ts#setOutOfService`'s transaction
 * commits, same fire-and-forget/no-throw rule as every other outcome email in
 * this module, and modelled on {@link buildBookingDeniedEmail}.
 *
 * It goes to the holders of the impacted APPROVED bookings, and only to them:
 * a PENDING booking is already frozen by the 422 an approval would hit, so its
 * holder learns it through the app; an APPROVED one survives the grounding
 * INTACT and MUTE — which is the pilot who otherwise shows up at the field to
 * a dismantled aircraft. The body says so explicitly: the booking is NOT
 * cancelled (decisione PO 2026-07-31, option 2 of 3 — the AOG counts and warns,
 * it never decides for the admin).
 *
 * The fermo window is stated in one of THREE named sentences, chosen on
 * `effectiveUntil` — the bound `aog-impact.ts#computeAogImpact` actually
 * counted over — and never re-derived from `outOfServiceUntil` (review
 * MAJOR-1): a live bound gives `windowUntil`, no date at all gives
 * `windowUnknown` (invariant [b] is a legitimate state, never an empty spot),
 * and a date whose day has already passed gives `windowOverdue`, which names
 * that date as the EXPECTED one instead of pretending the fermo ended there.
 * The third case is the one that was lying: the recipient of an overrun fermo
 * was told "fino al {ieri} compreso" while being warned about a booking weeks
 * later. Dates are rendered with the same `formatDateOnly` the UI uses, in the
 * RECIPIENT's locale.
 */
export async function buildAircraftGroundedEmail(
  locale: AppLocale,
  params: { firstName: string; aircraftRegistration: string; startsAt: Date; reason: string; outOfServiceUntil: string | null; effectiveUntil: string | null },
): Promise<AircraftGroundedEmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.aircraftGrounded' });
  const when = formatDateTime(params.startsAt, locale);
  const window =
    params.effectiveUntil !== null
      ? t('windowUntil', { date: formatDateOnly(params.effectiveUntil, locale) })
      : params.outOfServiceUntil === null
        ? t('windowUnknown')
        : t('windowOverdue', { date: formatDateOnly(params.outOfServiceUntil, locale) });

  return renderEmail(locale, messages.Emails.layout.footer,
    t('subject', { aircraftRegistration: params.aircraftRegistration }),
    t('body', {
      firstName: params.firstName,
      aircraftRegistration: params.aircraftRegistration,
      when,
      reason: params.reason,
      window,
    }),
  );
}

/** Notify an approved holder without implying their booking was cancelled. */
export async function buildAircraftArchivedEmail(
  locale: AppLocale,
  params: { firstName: string; aircraftRegistration: string; startsAt: Date },
): Promise<EmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.aircraftArchived' });
  return renderEmail(locale, messages.Emails.layout.footer,
    t('subject', { aircraftRegistration: params.aircraftRegistration }),
    t('body', {
      firstName: params.firstName,
      aircraftRegistration: params.aircraftRegistration,
      when: formatDateTime(params.startsAt, locale),
    }),
  );
}

/** Retries preserve the original absolute expiry, including its time zone. */
export async function buildCredentialEmail(locale: AppLocale, purpose: CredentialPurpose, url: string, expiresAt: Date) {
  const messages = await loadMessages(locale);
  const namespaces = { INVITE: 'Emails.invite', PASSWORD_RESET: 'Emails.passwordReset', VERIFY_EMAIL: 'Emails.verifyEmail', LOGIN_LINK: 'Emails.loginLink' } as const;
  const t = createTranslator({ locale, messages, namespace: namespaces[purpose] });
  const expiry = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'long', timeZone: 'Europe/Rome' }).format(expiresAt);
  const { credentialAction } = await import('./credential-action');
  const action = credentialAction(locale, purpose, url, t('action'));
  return renderEmail(locale, messages.Emails.layout.footer, t('subject'), t('deadlineBody', { url, expiry }), { action });
}

/** The club probe has always been bilingual, independent of the administrator's locale. */
export async function buildSmtpTestEmail(): Promise<EmailContent> {
  const [it, en] = await Promise.all([loadMessages('it'), loadMessages('en')]);
  return renderClubProbe(it.Emails.layout.footer, en.Emails.layout.footer);
}

export async function buildSecurityAlertEmail(locale: AppLocale, kind: 'MAIL_WORKER' | 'LOGIN_VOLUME', openedAt: Date) {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.securityAlert' });
  return renderEmail(locale, messages.Emails.layout.footer, t('subject'), t(kind, { time: formatDateTime(openedAt, locale) }));
}
