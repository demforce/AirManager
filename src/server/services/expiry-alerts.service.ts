import { randomUUID } from 'node:crypto';
import { APP_TIMEZONE } from '@/lib/time';
import { todayDateOnlyUtcInZone } from '@/lib/zoned-time';
import type { AppLocale } from '@/i18n/routing';
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
 * EVERY threshold it just consumed. The normal cadence (job runs regularly,
 * nothing skipped) walks the array one threshold at a time: 60, then 30,
 * then 7, then 0 — four emails over the scadenza's life. A missed cron (or
 * a scadenza registered already close to/past its date, even already
 * expired — `daysLeft < 0` is still due for ALL four thresholds) instead
 * finds several due-but-unconsumed thresholds in the SAME run and catches
 * them all up behind that single email: never four emails at once, and
 * never an alert permanently lost to a missed cron run.
 *
 * **Idempotence (AC 2, AD-9)**: claim due thresholds before sending. A
 * concurrent run's P2002 loses the claim and sends nothing. A failed send
 * releases only this attempt's claim IDs so the next run can retry. A process
 * crash between claim and send can still lose one reminder, the ratified
 * trade-off that prevents duplicate emails without a durable queue.
 * When permanent recipient rejections fill the 200-candidate cap, a small
 * AppSetting cursor advances the next run past them, then resets at the end
 * of the ordered queue. This narrow exception to story 17.8's stateless
 * cursor preserves the cap and eventual retry; rejected addresses and new
 * earlier expiries may wait until the queue wraps. The setting is updated
 * with a compare-and-swap; it never owns or consumes SentAlert claims.
 *
 * **Titolare without an email** (`Person.email === null`): thresholds are
 * consumed anyway (`SentAlert` created — the job must not re-evaluate this
 * scadenza forever) but no holder email is attempted; the entry still lands
 * in the admin digest, flagged, which is the deliberate recovery channel
 * (Contesto).
 *
 * **Admin digest**: ONE email per active `ADMIN` user, in their OWN
 * locale, listing this run's attempts, including failed sends that will be
 * retried. A run with no attempts sends no digest.
 * A single recipient's send failure is caught per-recipient — it never
 * blocks the others, and the job never throws for a mail failure (Dev
 * Notes: never let SMTP failures fail an idempotent write job whose rows
 * already committed).
 */
export type ExpiryAlertsJobResult = {
  /** Pending scadenze processed in this run (at most EXPIRY_ALERTS_MAX_PER_RUN). */
  candidates: number;
  /** `SentAlert` rows created this run (thresholds consumed, not emails sent). */
  alertsCreated: number;
  /** Holder emails actually sent (<= the number of candidates with something to consume). */
  holderEmailsSent: number;
  /** Candidates that consumed a threshold but have no `Person.email` on file. */
  holdersWithoutEmail: number;
  /** Admin digest emails sent (0 when this run made no attempts). */
  digestEmailsSent: number;
  /** Due, unsent scadenze still pending after this run, including failed sends. */
  remaining: number;
};

/** Prisma conflict code, used for concurrent claims and deleted expiries. */
function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === code;
}

const MS_PER_DAY = 86_400_000;
export const EXPIRY_ALERTS_MAX_PER_RUN = 200;
const PAGE_SIZE = 50;
const RETRY_CURSOR_KEY = 'expiry-alerts.retry-cursor';

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

/** Mailbox/address RCPT replies are per-recipient; other SMTP failures may affect the channel. */
function isRecipientRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { command, responseCode } = error as { command?: unknown; responseCode?: unknown };
  return command === 'RCPT TO' && typeof responseCode === 'number' && [450, 550, 551, 552, 553].includes(responseCode);
}

export async function runExpiryAlertsJob(maxPerRun = EXPIRY_ALERTS_MAX_PER_RUN): Promise<ExpiryAlertsJobResult> {
  const today = todayDateOnlyUtcInZone(APP_TIMEZONE);
  const limit = Math.max(1, Math.min(maxPerRun, EXPIRY_ALERTS_MAX_PER_RUN));
  const pendingWhere = {
    person: { archivedAt: null },
    expiryType: { isActive: true },
    OR: EXPIRY_ALERT_THRESHOLDS.map((threshold) => ({
      expiresAt: { lte: new Date(today.getTime() + threshold * MS_PER_DAY) },
      sentAlerts: { none: { threshold } },
    })),
  };

  let alertsCreated = 0;
  let holderEmailsSent = 0;
  let holdersWithoutEmail = 0;
  let candidatesProcessed = 0;
  let transportFailures = 0;
  let recipientRejections = 0;
  const digestItems: ExpiryDigestItem[] = [];
  const storedCursor = await prisma.appSetting.findUnique({ where: { key: RETRY_CURSOR_KEY }, select: { value: true, updatedAt: true } });
  let cursor: { expiresAt: Date; id: string } | null = null;
  if (storedCursor?.value) {
    try {
      const saved = JSON.parse(storedCursor.value) as { expiresAt: string; id: string };
      if (typeof saved.id === 'string' && !Number.isNaN(new Date(saved.expiresAt).getTime())) {
        cursor = { expiresAt: new Date(saved.expiresAt), id: saved.id };
      }
    } catch { /* Invalid old cursor: start from the first due candidate. */ }
  }
  const rotating = cursor !== null;
  let reachedEnd = false;
  const after = (position: { expiresAt: Date; id: string }) => ({
    AND: [pendingWhere, { OR: [
      { expiresAt: { gt: position.expiresAt } },
      { expiresAt: position.expiresAt, id: { gt: position.id } },
    ] }],
  });

  while (candidatesProcessed < limit) {
    const where = cursor === null ? pendingWhere : after(cursor);
    const take = Math.min(PAGE_SIZE, limit - candidatesProcessed);
    const page: Candidate[] = await prisma.expiry.findMany({
      where,
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take,
      select: CANDIDATE_SELECT,
    });
    if (page.length === 0) { reachedEnd = true; break; }
    const locales = await prisma.user.findMany({
      where: { personId: { in: page.map((candidate) => candidate.person.id) } },
      select: { personId: true, locale: true },
    });
    const localeByPerson = new Map(locales.map((user) => [user.personId, user.locale]));

    for (const candidate of page) {
      candidatesProcessed += 1;
      cursor = { expiresAt: candidate.expiresAt, id: candidate.id };
      const daysLeft = daysUntilUtc(candidate.expiresAt, today);
      const consumed = new Set(candidate.sentAlerts.map((sentAlert) => sentAlert.threshold));
      const toConsume = dueThresholds(daysLeft).filter((threshold) => !consumed.has(threshold));

      if (toConsume.length === 0) {
        continue;
      }

      // Stable claim IDs let a failed attempt release only rows it inserted.
      // A concurrent renewal can clear the old markers and another run can
      // claim the same thresholds before this send reports its failure.
      const claims = toConsume.map((threshold) => ({ id: randomUUID(), expiryId: candidate.id, threshold }));
      try {
        await prisma.sentAlert.createMany({
          data: claims,
        });
      } catch (error) {
        if (hasPrismaCode(error, 'P2002') || hasPrismaCode(error, 'P2003')) {
          // A concurrent run owns the claim, or the expiry was deleted while
          // this page was processed. Neither case should send an email.
          continue;
        }
        throw error;
      }

      const personName = `${candidate.person.firstName} ${candidate.person.lastName}`;
      // Tri-state (story TD-1, AC 2): `EMAILED`/`NO_EMAIL`/`SEND_FAILED` — the
      // digest flag must distinguish "no email on file" (contact them
      // directly) from "the send itself failed" (retry next run).
      // `holdersWithoutEmail` below counts ONLY the true `NO_EMAIL`
      // case (semantics unchanged from story 6.3).
      let holderStatus: 'EMAILED' | 'NO_EMAIL' | 'SEND_FAILED';

      if (candidate.person.email) {
        let sendAttempted = false;
        try {
          const locale = resolveLocale(localeByPerson.get(candidate.person.id));
          const { subject, text } = await buildExpiryAlertEmail(locale, {
            personName,
            typeName: candidate.expiryType.name,
            expiresAt: candidate.expiresAt,
            daysLeft,
          });
          sendAttempted = true;
          await getMailSender().send({ to: candidate.person.email, subject, text });
          holderEmailsSent += 1;
          alertsCreated += toConsume.length;
          transportFailures = 0;
          holderStatus = 'EMAILED';
        } catch (error) {
          console.error('runExpiryAlertsJob: failed to send holder alert email', error);
          await prisma.sentAlert.deleteMany({ where: { id: { in: claims.map((claim) => claim.id) } } });
          if (sendAttempted) {
            if (isRecipientRejection(error)) { recipientRejections += 1; transportFailures = 0; }
            else transportFailures += 1;
          }
          holderStatus = 'SEND_FAILED';
        }
      } else {
        holdersWithoutEmail += 1;
        alertsCreated += toConsume.length;
        holderStatus = 'NO_EMAIL';
      }

      digestItems.push({
        personName,
        typeName: candidate.expiryType.name,
        expiresAt: candidate.expiresAt,
        daysLeft,
        holderStatus,
      });
      if (transportFailures >= 3) break;
    }
    if (transportFailures >= 3) break;
    if (page.length < take) { reachedEnd = true; break; }
  }

  let digestEmailsSent = 0;
  if (digestItems.length > 0) {
    const adminUsers = await prisma.user.findMany({
      where: { isActive: true, roles: { has: 'ADMIN' } },
      select: { email: true, locale: true },
    });

    for (const adminUser of adminUsers) {
      try {
        const locale = resolveLocale(adminUser.locale);
        const { subject, text } = await buildExpiryDigestEmail(locale, { items: digestItems });
        await getMailSender().send({ to: adminUser.email, subject, text });
        digestEmailsSent += 1;
      } catch (error) {
        console.error('runExpiryAlertsJob: failed to send admin digest email', error);
      }
    }
  }

  const remaining = await prisma.expiry.count({ where: pendingWhere });
  // Rotate only when rejected addresses consume the whole batch. A stored cursor
  // is conditional (CAS) so an overlapping job cannot move it backwards.
  if (transportFailures < 3 && cursor && (rotating || (candidatesProcessed === limit && recipientRejections > 0 && remaining > 0))) {
    const hasLater = !reachedEnd && (await prisma.expiry.findMany({ where: after(cursor), orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }], take: 1, select: { id: true } })).length > 0;
    const nextValue = hasLater ? JSON.stringify({ expiresAt: cursor.expiresAt.toISOString(), id: cursor.id }) : '';
    if (storedCursor) {
      await prisma.appSetting.updateMany({ where: { key: RETRY_CURSOR_KEY, value: storedCursor.value, updatedAt: storedCursor.updatedAt }, data: { value: nextValue } });
    } else if (hasLater) {
      try { await prisma.appSetting.create({ data: { key: RETRY_CURSOR_KEY, value: nextValue } }); }
      catch (error) { if (!hasPrismaCode(error, 'P2002')) throw error; }
    }
  }

  return {
    candidates: candidatesProcessed,
    alertsCreated,
    holderEmailsSent,
    holdersWithoutEmail,
    digestEmailsSent,
    remaining,
  };
}
