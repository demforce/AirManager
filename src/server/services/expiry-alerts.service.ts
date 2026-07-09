import type { AppLocale } from '@/i18n/routing';
import { todayDateOnlyUtc } from '@/lib/date-only';
import { daysUntilUtc, EXPIRY_ALERT_THRESHOLDS } from '@/lib/expiry-status';
import { getMailSender } from '@/server/adapters/mail';
import { buildExpiryAlertEmail, buildExpiryDigestEmail, type ExpiryDigestItem } from '@/server/adapters/mail/templates';
import { prisma } from '@/server/db/prisma';

/**
 * The automatic expiry-alert job (epic 6, story 6.3; FR-37; AD-9) — invoked
 * by `POST /api/v1/jobs/expiry-alerts`, an EXTERNAL cron, never a session.
 * No `Actor` parameter here (Contesto's deliberate AD-5 exception,
 * doc-commented on the route): the bearer check at the route boundary is
 * this job's only guardian.
 *
 * **Threshold semantics (Contesto) — cadence markers, not equalities.**
 * `EXPIRY_ALERT_THRESHOLDS = [60, 30, 7, 0]` (`src/lib/expiry-status.ts`).
 * For a scadenza with `daysLeft = expiresAt - today` (calendar days, UTC
 * date-only, via `daysUntilUtc`): the DUE thresholds are every `T` with
 * `daysLeft <= T`; the thresholds TO CONSUME are the due ones without a
 * matching `SentAlert` row yet. When there is at least one to consume, this
 * job sends exactly ONE holder email — about the REAL `daysLeft`, never
 * about which threshold(s) triggered it — and inserts a `SentAlert` row for
 * EVERY threshold it just consumed. The normal cadence (job runs daily,
 * nothing skipped) walks the array one threshold at a time: 60, then 30,
 * then 7, then 0 — four emails over the scadenza's life. A missed cron (or
 * a scadenza registered already close to/past its date, even already
 * expired — `daysLeft < 0` is still due for ALL four thresholds) instead
 * finds several due-but-unconsumed thresholds in the SAME run and catches
 * them all up behind that single email: never four emails at once, and
 * never an alert permanently lost to a missed cron run.
 *
 * **Idempotence (AC 2, AD-9) is a DB constraint, and the order is
 * insert-BEFORE-send.** The `SentAlert` rows for a candidate are created
 * (`createMany`, one write) in a try/catch BEFORE the holder email is sent.
 * A `P2002` (a concurrent run already claimed at least one of these
 * thresholds for this expiry) is caught and treated as "the other run owns
 * this email" — this run silently skips it, sends nothing, throws nothing.
 * This ordering has a known, accepted trade-off (doc'd here, not just
 * asserted): a crash between the successful insert and the `send()` call
 * loses that one holder email — AD-9 privileges "never more than one alert
 * per threshold, ever" over "never lose an alert"; the staff digest below
 * is the recovery net for exactly this case (a staff member sees the
 * scadenza listed even if the titolare's own inbox never got it).
 *
 * **Titolare without an email** (`Person.email === null`): thresholds are
 * consumed anyway (`SentAlert` created — the job must not re-evaluate this
 * scadenza forever) but no holder email is attempted; the entry still lands
 * in the staff digest, flagged, which is the deliberate recovery channel
 * (Contesto).
 *
 * **Staff digest**: ONE email per active `ADMIN`/`STAFF` user, in their OWN
 * locale, listing every alert this run actually consumed — sent ONLY when
 * the run consumed at least one alert (`alertsCreated > 0`); a run that
 * consumes nothing sends no digest to anyone (this is what makes AC 2 true
 * end-to-end, digest included: a second identical run is a complete no-op).
 * A single recipient's send failure is caught per-recipient — it never
 * blocks the others, and the job never throws for a mail failure (Dev
 * Notes: never let SMTP failures fail an idempotent write job whose rows
 * already committed).
 */
export type ExpiryAlertsJobResult = {
  /** Scadenze inspected this run (`expiresAt <= today + 60 days`), before filtering to those with something new to consume. */
  candidates: number;
  /** `SentAlert` rows created this run (thresholds consumed, not emails sent). */
  alertsCreated: number;
  /** Holder emails actually sent (<= the number of candidates with something to consume). */
  holderEmailsSent: number;
  /** Candidates that consumed a threshold but have no `Person.email` on file. */
  holdersWithoutEmail: number;
  /** Staff/admin digest emails sent (0 when `alertsCreated === 0`). */
  digestEmailsSent: number;
};

/** Prisma unique-constraint violation (same pattern as every other service). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/** Never hardcode `60` a second time (Task 3) — the query horizon is always derived from the threshold list itself. */
const MAX_ALERT_THRESHOLD_DAYS = Math.max(...EXPIRY_ALERT_THRESHOLDS);
const MS_PER_DAY = 86_400_000;

/** Recipient locale, same fallback rule as `sendNegativeBalanceAlert` (story 3.3): `User.locale === 'en'` -> `en`, everything else (including no linked `User`) -> `it`. */
function resolveLocale(locale: string | null | undefined): AppLocale {
  return locale === 'en' ? 'en' : 'it';
}

const CANDIDATE_SELECT = {
  id: true,
  expiresAt: true,
  person: { select: { id: true, firstName: true, lastName: true, email: true } },
  expiryType: { select: { name: true } },
  sentAlerts: { select: { threshold: true } },
} as const;

type Candidate = {
  id: string;
  expiresAt: Date;
  person: { id: string; firstName: string; lastName: string; email: string | null };
  expiryType: { name: string };
  sentAlerts: { threshold: number }[];
};

/** Every threshold `T` with `daysLeft <= T` — the DUE set (Contesto: a cadence marker, not an equality). */
function dueThresholds(daysLeft: number): number[] {
  return EXPIRY_ALERT_THRESHOLDS.filter((threshold) => daysLeft <= threshold);
}

export async function runExpiryAlertsJob(): Promise<ExpiryAlertsJobResult> {
  const today = todayDateOnlyUtc();
  const horizon = new Date(today.getTime() + MAX_ALERT_THRESHOLD_DAYS * MS_PER_DAY);

  const candidates: Candidate[] = await prisma.expiry.findMany({
    where: { expiresAt: { lte: horizon } },
    select: CANDIDATE_SELECT,
  });

  let alertsCreated = 0;
  let holderEmailsSent = 0;
  let holdersWithoutEmail = 0;
  const digestItems: ExpiryDigestItem[] = [];

  for (const candidate of candidates) {
    const daysLeft = daysUntilUtc(candidate.expiresAt, today);
    const consumed = new Set(candidate.sentAlerts.map((sentAlert) => sentAlert.threshold));
    const toConsume = dueThresholds(daysLeft).filter((threshold) => !consumed.has(threshold));

    if (toConsume.length === 0) {
      continue;
    }

    try {
      await prisma.sentAlert.createMany({
        data: toConsume.map((threshold) => ({ expiryId: candidate.id, threshold })),
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // A concurrent run already claimed (at least one of) these
        // thresholds for this expiry — AD-9: that run owns the holder
        // email, this one skips silently (no email, no digest entry, no
        // throw).
        continue;
      }
      throw error;
    }

    alertsCreated += toConsume.length;

    const personName = `${candidate.person.firstName} ${candidate.person.lastName}`;
    // Tri-state (story TD-1, AC 2): `EMAILED`/`NO_EMAIL`/`SEND_FAILED` — the
    // digest flag must distinguish "no email on file" (contact them
    // directly) from "the send itself failed" (verify the address or
    // retry). `holdersWithoutEmail` below counts ONLY the true `NO_EMAIL`
    // case (semantics unchanged from story 6.3).
    let holderStatus: 'EMAILED' | 'NO_EMAIL' | 'SEND_FAILED';

    if (candidate.person.email) {
      try {
        const user = await prisma.user.findUnique({ where: { personId: candidate.person.id }, select: { locale: true } });
        const locale = resolveLocale(user?.locale);
        const { subject, text } = await buildExpiryAlertEmail(locale, {
          personName,
          typeName: candidate.expiryType.name,
          expiresAt: candidate.expiresAt,
          daysLeft,
        });
        await getMailSender().send({ to: candidate.person.email, subject, text });
        holderEmailsSent += 1;
        holderStatus = 'EMAILED';
      } catch (error) {
        // Never let a mail failure surface to the caller — the SentAlert
        // rows are already committed and must stay valid (same rationale as
        // `sendNegativeBalanceAlert`, story 3.3).
        console.error('runExpiryAlertsJob: failed to send holder alert email', error);
        holderStatus = 'SEND_FAILED';
      }
    } else {
      holdersWithoutEmail += 1;
      holderStatus = 'NO_EMAIL';
    }

    digestItems.push({
      personName,
      typeName: candidate.expiryType.name,
      expiresAt: candidate.expiresAt,
      daysLeft,
      holderStatus,
    });
  }

  let digestEmailsSent = 0;
  if (digestItems.length > 0) {
    const staffUsers = await prisma.user.findMany({
      where: { isActive: true, roles: { hasSome: ['ADMIN', 'STAFF'] } },
      select: { email: true, locale: true },
    });

    for (const staffUser of staffUsers) {
      try {
        const locale = resolveLocale(staffUser.locale);
        const { subject, text } = await buildExpiryDigestEmail(locale, { items: digestItems });
        await getMailSender().send({ to: staffUser.email, subject, text });
        digestEmailsSent += 1;
      } catch (error) {
        console.error('runExpiryAlertsJob: failed to send staff digest email', error);
      }
    }
  }

  return {
    candidates: candidates.length,
    alertsCreated,
    holderEmailsSent,
    holdersWithoutEmail,
    digestEmailsSent,
  };
}
