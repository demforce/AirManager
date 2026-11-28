import { emailTrialEnabled } from '@/server/auth/email-trial-policy';
import { captureEventRecipients, holderMailbox, holderDeliveryFence, digestRecipientCurrent, holderStillCurrent } from './account-mailbox';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { getOperationalMailPolicy, type MailBoundary, type OperationalMailPolicy } from './operational-mail-settings';
import { lockExpiryDate } from './expiry-cycle';
import { APP_TIMEZONE } from '@/lib/time';
import { dateOnlyInZone, todayDateOnlyUtcInZone } from '@/lib/zoned-time';
import type { AppLocale } from '@/i18n/routing';
import { daysUntilUtc, EXPIRY_ALERT_THRESHOLDS } from '@/lib/expiry-status';
import { getMailSender } from '@/server/adapters/mail';
import { MailRecipientChangedError } from '@/server/adapters/mail/mail-sender';
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
  status: 'completed' | 'disabled' | 'settings_changed';
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
  notificationCycle: true,
  createdAt: true,
  person: { select: { id: true, firstName: true, lastName: true, email: true } },
  expiryType: { select: { name: true } },
  sentAlerts: { select: { threshold: true } },
} as const;

/** Every threshold `T` with `daysLeft <= T` — the DUE set (Contesto: a cadence marker, not an equality). */
function dueThresholds(daysLeft: number): number[] {
  return EXPIRY_ALERT_THRESHOLDS.filter((threshold) => daysLeft <= threshold);
}

/** The two channels consume one shared cadence. An enabled channel without
 * a cutoff keeps the original catch-up rules. Otherwise the earliest active
 * cutoff covers the union: subsequent activations have greater sequence IDs. */
function pendingExpiries(policy: OperationalMailPolicy, today: Date): Prisma.ExpiryWhereInput {
  const { switches, holderSince, digestSince } = policy;
  const boundaries = [...(switches.expiryHolder ? [holderSince] : []), ...(switches.expiryDigest ? [digestSince] : [])];
  const oldest = boundaries.length && boundaries.every((boundary) => boundary !== null)
    ? boundaries.reduce((left, right) => left.cycle < right.cycle ? left : right) : null;
  return {
    person: { archivedAt: null },
    expiryType: { isActive: true },
    OR: boundaries.length ? EXPIRY_ALERT_THRESHOLDS.map((threshold) => ({
      expiresAt: { lte: new Date(today.getTime() + threshold * MS_PER_DAY) },
      sentAlerts: { none: { threshold } },
      ...(oldest ? { OR: [
        { notificationCycle: { gt: oldest.cycle } },
        { expiresAt: { gt: new Date(Date.parse(oldest.day) + threshold * MS_PER_DAY) } },
      ] } : {}),
    })) : [],
  };
}

function eligible(boundary: MailBoundary | null, cycle: number | null, expiresAt: Date, threshold: number): boolean {
  return !boundary || (cycle !== null && cycle > boundary.cycle)
    || expiresAt.getTime() - threshold * MS_PER_DAY > Date.parse(boundary.day);
}

type EnrollmentBoundary = { verifiedAt: Date | null; expiryStartCycle: number | null };
function afterFirstActivation(proof: EnrollmentBoundary | null | undefined, expiry: {
  createdAt: Date; notificationCycle: number | null; expiresAt: Date;
}, threshold: number) {
  if (!proof?.verifiedAt || expiry.createdAt > proof.verifiedAt) return true;
  if (proof.expiryStartCycle !== null && expiry.notificationCycle !== null && expiry.notificationCycle > proof.expiryStartCycle) return true;
  const day = dateOnlyInZone(proof.verifiedAt, APP_TIMEZONE);
  return expiry.expiresAt.getTime() - threshold * MS_PER_DAY > Date.parse(day);
}

function sameExpiryPolicy(a: OperationalMailPolicy, b: OperationalMailPolicy): boolean {
  return a.switches.expiryHolder === b.switches.expiryHolder && a.switches.expiryDigest === b.switches.expiryDigest
    && a.holderSince?.cycle === b.holderSince?.cycle && a.digestSince?.cycle === b.digestSince?.cycle;
}

/** Mailbox/address RCPT replies are per-recipient; other SMTP failures may affect the channel. */
function isRecipientRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { command, responseCode } = error as { command?: unknown; responseCode?: unknown };
  return command === 'RCPT TO' && typeof responseCode === 'number' && [450, 550, 551, 552, 553].includes(responseCode);
}

/** A selected page can outlive a renewal. Claims and date changes serialize
 * on the same expiry row. A replaced cycle is reconsidered by a fresh page.
 * The second statement sees markers committed by a job we waited for. */
async function claimExpiry(selected: { id: string; expiresAt: Date }, today: Date, policy: OperationalMailPolicy) {
  try {
    return await prisma.$transaction(async (tx) => {
      const currentDate = await lockExpiryDate(tx, selected.id);
      if (currentDate?.getTime() !== selected.expiresAt.getTime()) return null;
      // Read after waiting for the expiry lock. An already-claimed delivery
      // may complete while settings change, just as it may during a renewal.
      if (!sameExpiryPolicy(policy, await getOperationalMailPolicy(tx))) return 'settings_changed' as const;
      const candidate = await tx.expiry.findUnique({
        where: { id: selected.id, person: { archivedAt: null }, expiryType: { isActive: true } },
        select: CANDIDATE_SELECT,
      });
      if (!candidate) return null;
      const daysLeft = daysUntilUtc(candidate.expiresAt, today);
      const consumed = new Set(candidate.sentAlerts.map((row) => row.threshold));
      const atClaim = await captureEventRecipients(tx, [candidate.person.id]);
      const snapshot = atClaim?.get(candidate.person.id);
      const lookupFailed = atClaim !== undefined && !snapshot;
      // If the ownership query failed, still distinguish historical thresholds from
      // current attempts. Only the latter enter the existing failure/retry path.
      const enrollment = lookupFailed ? await tx.emailVerification.findFirst({
        where: { user: { personId: candidate.person.id } }, select: { verifiedAt: true, expiryStartCycle: true },
      }) : snapshot?.proof;
      const pendingAtClaim = enrollment?.verifiedAt === null;
      const due = dueThresholds(daysLeft).filter((threshold) => !consumed.has(threshold));
      let suppressed = 0;
      if (enrollment?.verifiedAt) {
        const historical = due.filter(threshold => !afterFirstActivation(enrollment, candidate, threshold));
        if (historical.length) {
          // These cadence markers never described a delivery. Keep them independent
          // of the attempt IDs released for a failure on a newer, eligible threshold.
          await tx.sentAlert.createMany({ data: historical.map(threshold => ({ expiryId: candidate.id, threshold })) });
          suppressed = historical.length;
          for (const threshold of historical) consumed.add(threshold);
        }
      }
      const canDeliver = (threshold: number, boundary: MailBoundary | null) => !consumed.has(threshold) && eligible(boundary, candidate.notificationCycle, candidate.expiresAt, threshold);
      const holder = due.filter((threshold) => policy.switches.expiryHolder && canDeliver(threshold, policy.holderSince));
      const digest = due.filter((threshold) => policy.switches.expiryDigest && canDeliver(threshold, policy.digestSince));
      const claims = due.filter((threshold) => holder.includes(threshold) || digest.includes(threshold))
        .map((threshold) => ({ id: randomUUID(), expiryId: candidate.id, threshold }));
      if (!claims.length) return suppressed ? { suppressed } : null;
      await tx.sentAlert.createMany({ data: claims });
      return { candidate, daysLeft, claims, suppressed, pendingAtClaim, atClaim, lookupFailed, sendHolder: holder.length > 0, digestThresholds: digest };
    });
  } catch (error) {
    if (hasPrismaCode(error, 'P2002') || hasPrismaCode(error, 'P2003')) return null;
    throw error;
  }
}

function ownedDigestClaims(ids: string[]) {
  return ids.length ? prisma.sentAlert.findMany({
    where: { id: { in: ids }, expiry: { person: { archivedAt: null }, expiryType: { isActive: true } } },
    select: { id: true },
  }) : [];
}

export async function runExpiryAlertsJob(maxPerRun = EXPIRY_ALERTS_MAX_PER_RUN): Promise<ExpiryAlertsJobResult> {
  const today = todayDateOnlyUtcInZone(APP_TIMEZONE);
  const limit = Math.max(1, Math.min(maxPerRun, EXPIRY_ALERTS_MAX_PER_RUN));
  const policy = await getOperationalMailPolicy();
  if (!policy.switches.expiryHolder && !policy.switches.expiryDigest) {
    return { status: 'disabled', candidates: 0, alertsCreated: 0, holderEmailsSent: 0, holdersWithoutEmail: 0, digestEmailsSent: 0, remaining: 0 };
  }
  const pendingWhere = pendingExpiries(policy, today);
  let settingsChanged = false;

  let alertsCreated = 0;
  let holderEmailsSent = 0;
  let holdersWithoutEmail = 0;
  let candidatesProcessed = 0;
  let transportFailures = 0;
  let recipientRejections = 0;
  type DigestRow = ExpiryDigestItem & { createdAt: Date; notificationCycle: number | null; thresholds: number[] };
  let digestItems: DigestRow[] = [];
  const unattempted = new Map<ExpiryDigestItem, string[]>();

  const digestStillEnabled = (current: OperationalMailPolicy) => current.switches.expiryDigest && policy.digestSince?.cycle === current.digestSince?.cycle;
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

  batches: while (candidatesProcessed < limit) {
    const where = cursor === null ? pendingWhere : after(cursor);
    const take = Math.min(PAGE_SIZE, limit - candidatesProcessed);
    const page: { id: string; expiresAt: Date; personId: string }[] = await prisma.expiry.findMany({
      where,
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take,
      select: { id: true, expiresAt: true, personId: true },
    });
    if (page.length === 0) { reachedEnd = true; break; }
    const locales = await prisma.user.findMany({
      where: { personId: { in: page.map((candidate) => candidate.personId) } },
      select: { personId: true, locale: true },
    });
    const localeByPerson = new Map(locales.map((user) => [user.personId, user.locale]));

    for (const selected of page) {
      candidatesProcessed += 1;
      cursor = selected;
      const claim = await claimExpiry(selected, today, policy);
      if (claim === 'settings_changed') { settingsChanged = true; break batches; }
      if (!claim) continue;
      alertsCreated += claim.suppressed;
      if (!claim.candidate) continue;
      const { candidate, daysLeft, claims, digestThresholds } = claim;
      const claimIds = claims.map((row) => row.id);
      let retainedIds = claimIds;
      const personName = `${candidate.person.firstName} ${candidate.person.lastName}`;
      let holderStatus: ExpiryDigestItem['holderStatus'];
      let sendAttempted = false;
      try {
        if (claim.sendHolder && claim.lookupFailed) throw new Error('Holder snapshot unavailable.');
        const recipient = claim.sendHolder ? await holderMailbox(candidate.person.id, candidate.person.email, claim.atClaim) : null;
        if (!claim.sendHolder) {
          alertsCreated += claims.length;
          holderStatus = policy.switches.expiryHolder ? 'THRESHOLD_SUSPENDED' : 'REMINDERS_DISABLED';
        } else if (recipient) {
          const locale = resolveLocale(localeByPerson.get(candidate.person.id));
          const content = await buildExpiryAlertEmail(locale, {
            personName,
            typeName: candidate.expiryType.name,
            expiresAt: candidate.expiresAt,
            daysLeft,
          });
          // Rendering is asynchronous. A renewal may already have removed this
          // attempt's markers. After handoff, SMTP cannot recall a message.
          const [owned, current] = await Promise.all([
            prisma.sentAlert.findFirst({
              where: { id: claimIds[0], expiry: { person: { archivedAt: null, ...(!emailTrialEnabled() && { email: candidate.person.email }) }, expiryType: { isActive: true } } },
              select: { id: true },
            }),
            getOperationalMailPolicy(),
          ]);
          if (!owned) {
            await prisma.sentAlert.deleteMany({ where: { id: { in: claimIds } } });
            continue;
          }
          if (!await holderStillCurrent(candidate.person.id, recipient)) throw new MailRecipientChangedError();
          if (current.switches.expiryHolder && policy.holderSince?.cycle === current.holderSince?.cycle) {
            sendAttempted = true;
            await getMailSender().send({ ...content, to: recipient.email, ...holderDeliveryFence(candidate.person.id, recipient) });
            holderEmailsSent += 1;
            alertsCreated += claims.length;
            transportFailures = 0;
            holderStatus = 'EMAILED';
          } else {
            // Keep only cadence that the still-active digest will cover.
            const keep = claims.filter((row) => digestStillEnabled(current) && digestThresholds.includes(row.threshold));
            const release = claims.filter((row) => !keep.includes(row)).map((row) => row.id);
            if (release.length) await prisma.sentAlert.deleteMany({ where: { id: { in: release } } });
            if (!keep.length) continue;
            retainedIds = keep.map((row) => row.id);
            alertsCreated += keep.length;
            holderStatus = current.switches.expiryHolder ? 'THRESHOLD_SUSPENDED' : 'REMINDERS_DISABLED';
          }
        } else {
          holdersWithoutEmail += 1;
          alertsCreated += claims.length;
          holderStatus = claim.pendingAtClaim ? 'PENDING_ACTIVATION' : 'NO_EMAIL';
        }
      } catch (error) {
        if (error instanceof MailRecipientChangedError) {
          // This cadence belonged to the old association. A retry must not send it
          // to a newly linked account, even if the replacement address is verified.
          alertsCreated += claims.length;
          holderStatus = 'RECIPIENT_CHANGED';
        } else {
          console.error('runExpiryAlertsJob: failed to send holder alert email');
          await prisma.sentAlert.deleteMany({ where: { id: { in: claimIds } } });
          if (sendAttempted) {
            if (isRecipientRejection(error)) { recipientRejections += 1; transportFailures = 0; }
            else transportFailures += 1;
          }
          holderStatus = 'SEND_FAILED';
        }
      }

      if (digestThresholds.length) {
        const item = { personName, typeName: candidate.expiryType.name, expiresAt: candidate.expiresAt, daysLeft, holderStatus };
        const row = { ...item, createdAt: candidate.createdAt, notificationCycle: candidate.notificationCycle, thresholds: digestThresholds };
        digestItems.push(row);
        if (holderStatus !== 'EMAILED' && holderStatus !== 'SEND_FAILED') {
          unattempted.set(row, retainedIds);
        }
      }
      if (transportFailures >= 3) break;
    }
    if (transportFailures >= 3) break;
    if (page.length < take) { reachedEnd = true; break; }
  }

  let digestEmailsSent = 0;
  let latest = await getOperationalMailPolicy();
  if (digestItems.length && digestStillEnabled(latest)) {
    const adminUsers = await prisma.user.findMany({
      where: { isActive: true, roles: { has: 'ADMIN' } },
      select: { id: true, email: true, locale: true, ...(emailTrialEnabled() && {
        emailVerification: { select: { email: true, verifiedAt: true, expiryStartCycle: true } },
      }) },
    });

    admins: for (const adminUser of adminUsers) {
      try {
        const proof = adminUser.emailVerification;
        if (emailTrialEnabled() && (!proof?.verifiedAt || proof.email !== adminUser.email)) continue;
        const locale = resolveLocale(adminUser.locale);
        // A renewal during rendering invalidates a digest-only item. Re-render
        // only when a visible item disappeared. Only previously submitted rows
        // are historical; rows omitted for that admin still need their own fence.
        while (digestItems.length) {
          const items = digestItems.filter(row => row.thresholds.some(threshold => afterFirstActivation(proof, row, threshold)));
          if (!items.length) break;
          const content = await buildExpiryDigestEmail(locale, { items });
          const checked = new Map(items.flatMap(item => {
            const claims = unattempted.get(item);
            return claims ? [[item, claims] as const] : [];
          }));
          const ids = [...checked.values()].map(([first]) => first);
          const [current, owned] = await Promise.all([
            getOperationalMailPolicy(),
            ownedDigestClaims(ids),
          ]);
          latest = current;
          if (!digestStillEnabled(latest)) break admins;
          if (ids.length && owned.length < ids.length) {
            const ownedIds = new Set(owned.map((row) => row.id));
            const invalidClaims: string[] = [];
            digestItems = digestItems.filter((item) => {
              const claims = checked.get(item);
              if (!claims || ownedIds.has(claims[0])) return true;
              if (item.holderStatus !== 'RECIPIENT_CHANGED') invalidClaims.push(...claims);
              unattempted.delete(item);
              return false;
            });
            // Archiving the holder or disabling the type does not reset its
            // cycle. Release only these undelivered attempts, so restoring
            // eligibility can retry without dropping any older or renewed claim.
            const released = await prisma.sentAlert.deleteMany({ where: { id: { in: invalidClaims } } });
            alertsCreated -= released.count;
            continue;
          }
          let rowsChanged = false;
          const confirmRecipient = async () => {
            if (!await digestRecipientCurrent(adminUser.id, adminUser.email)) return false;
            rowsChanged = (await ownedDigestClaims(ids)).length !== ids.length;
            return !rowsChanged;
          };
          const markSubmitted = () => { for (const item of items) unattempted.delete(item); };
          try {
            await getMailSender().send({ ...content, to: adminUser.email, onSubmit: markSubmitted, ...(emailTrialEnabled() && { confirmRecipient }) });
          } catch (error) {
            // A renewal during SMTP configuration invalidated this rendering. The
            // next iteration discards its row and renders the remaining items.
            if (rowsChanged) continue;
            throw error;
          }
          markSubmitted(); // A successful alternate sender also completed this handoff.
          digestEmailsSent += 1;
          break;
        }
        if (!digestItems.length) break;
      } catch {
        console.error('runExpiryAlertsJob: failed to send admin digest email');
      }
    }
  }

  if (!digestStillEnabled(latest)) {
    const release = [...unattempted].flatMap(([item, claims]) =>
      item.holderStatus === 'THRESHOLD_SUSPENDED' || item.holderStatus === 'REMINDERS_DISABLED' ? claims : []);
    if (release.length) {
      const released = await prisma.sentAlert.deleteMany({ where: { id: { in: release } } });
      alertsCreated -= released.count;
    }
  }
  settingsChanged ||= !sameExpiryPolicy(policy, latest);
  const remaining = await prisma.expiry.count({ where: settingsChanged ? pendingExpiries(latest, today) : pendingWhere });
  // Rotate only when rejected addresses consume the whole batch. A stored cursor
  // is conditional (CAS) so an overlapping job cannot move it backwards.
  if (!settingsChanged && transportFailures < 3 && cursor && (rotating || (candidatesProcessed === limit && recipientRejections > 0 && remaining > 0))) {
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
    status: settingsChanged ? 'settings_changed' : 'completed',
    candidates: candidatesProcessed,
    alertsCreated,
    holderEmailsSent,
    holdersWithoutEmail,
    digestEmailsSent,
    remaining,
  };
}
