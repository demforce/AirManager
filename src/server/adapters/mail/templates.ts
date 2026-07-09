import { createTranslator } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatCents } from '@/lib/money';
import { formatDateTime } from '@/lib/time';

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

export type InviteEmailContent = { subject: string; text: string };
export type PasswordResetEmailContent = { subject: string; text: string };
export type NegativeBalanceAlertEmailContent = { subject: string; text: string };
export type ExpiryAlertEmailContent = { subject: string; text: string };
export type ExpiryDigestEmailContent = { subject: string; text: string };
export type PprReceiptEmailContent = { subject: string; text: string };

/**
 * One row of the staff digest (story 6.3, tri-state hardened story TD-1 AC
 * 2) — mirrors `expiry-alerts.service.ts`'s per-candidate loop state.
 * `holderStatus` distinguishes the three outcomes a candidate can land in:
 * `EMAILED` (no flag), `NO_EMAIL` (no `Person.email` on file — the
 * recovery-net flag), and `SEND_FAILED` (an email exists but SMTP send
 * failed — a DIFFERENT flag, since the staff recovery action differs:
 * "contact them directly" vs "retry/verify the address"). Replaces the
 * earlier boolean `holderEmailed`, which conflated the latter two cases.
 */
export type ExpiryDigestItem = {
  personName: string;
  typeName: string;
  expiresAt: Date;
  daysLeft: number;
  holderStatus: 'EMAILED' | 'NO_EMAIL' | 'SEND_FAILED';
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

  return {
    subject: t('subject'),
    text: t('body', { url: params.setPasswordUrl, expiresInDays: params.expiresInDays }),
  };
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

  return {
    subject: t('subject'),
    text: t('body', { url: params.setPasswordUrl, expiresInHours: params.expiresInHours }),
  };
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

  return {
    subject: t('subject'),
    text: t('body', { name: params.personName, balance: formatCents(params.balanceCents, locale) }),
  };
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
 * straight into a sentence without re-conjugating around it.
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

  return {
    subject: t('subject', { typeName: params.typeName }),
    text: t('body', { name: params.personName, typeName: params.typeName, daysPhrase, date }),
  };
}

/**
 * Builds the staff digest email (story 6.3, AC 1; tri-state flag hardened
 * story TD-1, AC 2) — one per active admin/staff user per run, sent ONLY
 * when the run consumed at least one alert (the caller,
 * `expiry-alerts.service.ts`, never invokes this otherwise). Lists every
 * alert consumed this run, flagging `NO_EMAIL` holders (no `Person.email` on
 * file — the recovery net for the "thresholds are consumed regardless" rule,
 * Contesto) DISTINCTLY from `SEND_FAILED` holders (an email exists but the
 * SMTP send itself failed — the staff recovery action differs: verify the
 * address or retry, not "contact them directly"). `EMAILED` items carry no
 * flag at all.
 */
export async function buildExpiryDigestEmail(
  locale: AppLocale,
  params: { items: ExpiryDigestItem[] },
): Promise<ExpiryDigestEmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.expiryDigest' });

  const lines = params.items.map((item) => {
    const daysPhrase = expiryDaysPhrase(locale, messages, item.daysLeft);
    const date = formatExpiryDate(item.expiresAt, locale);
    const flag = item.holderStatus === 'NO_EMAIL' ? t('noEmailFlag') : item.holderStatus === 'SEND_FAILED' ? t('sendFailedFlag') : '';
    return t('itemLine', { name: item.personName, typeName: item.typeName, daysPhrase, date, flag });
  });

  return {
    subject: t('subject'),
    text: `${t('intro')}\n\n${lines.join('\n')}`,
  };
}

/**
 * Builds the public PPR request receipt email (epic 8, story 8.1, AC 1) —
 * sent best-effort right after `ppr.service.ts#createPprRequest` commits
 * the row (see that function's doc-comment: a send failure never fails the
 * request). `locale` is `input.locale` — the language the FORM was
 * submitted in (NFR-1), never a `User.locale` lookup (there is no `User`
 * to look up: the submitter is an anonymous external pilot). `eta` is
 * formatted date+time in `APP_TIMEZONE` (`formatDateTime`, `time.ts`) —
 * deliberately NOT `formatExpiryDate` above, which is date-only UTC and
 * would drop the time-of-day a pilot actually needs to plan around.
 */
export async function buildPprReceiptEmail(
  locale: AppLocale,
  params: {
    firstName: string;
    aircraftRegistration: string;
    aircraftType: string;
    origin: string;
    destination: string;
    eta: Date;
    personsOnBoard: number;
  },
): Promise<PprReceiptEmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.pprReceipt' });
  const eta = formatDateTime(params.eta, locale);

  return {
    subject: t('subject', { aircraftRegistration: params.aircraftRegistration }),
    text: t('body', {
      firstName: params.firstName,
      aircraftRegistration: params.aircraftRegistration,
      aircraftType: params.aircraftType,
      origin: params.origin,
      destination: params.destination,
      eta,
      personsOnBoard: params.personsOnBoard,
    }),
  };
}
