import type { Prisma, PprStatus } from '@/generated/prisma/client';
import type { AppLocale } from '@/i18n/routing';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import type { CreatePprRequestInput, ListPprRequestsQuery } from '@/lib/schemas/ppr';
import { APP_TIMEZONE } from '@/lib/time';
import { dateOnlyInZone } from '@/lib/zoned-time';
import { getMailSender } from '@/server/adapters/mail';
import { buildPprApprovalEmail, buildPprReceiptEmail, buildPprRejectionEmail } from '@/server/adapters/mail/templates';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { getPprOperatingInstructions } from './app-settings.service';
import { ConflictError, NotFoundError, RateLimitError, ValidationError } from './errors';

/**
 * Public PPR request intake (epic 8, story 8.1; FR-22, UJ-3) — the FIRST
 * service in this codebase with no `Actor` parameter at all. `authorize()`
 * (AD-5) assumes a session actor; there is none here — `POST
 * /api/v1/ppr-requests` (`route.ts`) is `apiRoute({ auth: 'public' })` and
 * `src/proxy.ts` never gates it either. This is a DELIBERATE, narrow deroga
 * to AD-5: anti-abuse for this one endpoint is enforced by the honeypot
 * field and the per-IP rate limit below INSTEAD of RBAC, not in addition to
 * it — there is no permission to check because there is no identity to
 * check it against.
 *
 * **Order (AC 2, same rigor as story 7.4's verification order)**: honeypot
 * → rate limit (429 `RateLimitError`) → domain validation (`ETA_IN_PAST` /
 * `ETD_NOT_AFTER_ETA`, both compared as INSTANTS per the N1 lesson from
 * story 7.1, never as ISO strings) → create → best-effort receipt email.
 * A honeypot hit or a 429 NEVER creates a row (Contesto: "le richieste 429
 * NON creano righe -> non estendono la finestra"; letting a honeypot hit
 * write a row would let a bot both poison a real submitter's rate-limit
 * window on a shared IP and itself count toward the limit it is supposed
 * to be silently rejected by).
 */

/** Max PPR requests accepted from the same source IP within a rolling hour (AC 2). */
export const PPR_RATE_LIMIT_MAX = 5;

const PPR_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type CreatePprRequestResult = { status: 'PENDING' };

/**
 * Extracts the caller's IP from the `x-forwarded-for` header (first value,
 * trimmed) — `null` when the header is absent (no rate limit is applied in
 * that case, Contesto: "nessun header -> niente rate limit ma logga").
 * Trust assumption, declared: in production the reverse proxy sets this
 * header; in dev/e2e the client sets it directly. A future real deployment
 * behind a proxy that does NOT strip/overwrite client-supplied
 * `x-forwarded-for` would need hardening — out of scope here (same
 * "declared assumption" shape as `JOBS_SECRET`'s bearer check).
 */
export function extractSubmitterIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) {
    return null;
  }
  const first = forwardedFor.split(',')[0]?.trim();
  if (!first) {
    console.warn('extractSubmitterIp: x-forwarded-for header present but empty — no rate limit applied to this request.');
    return null;
  }
  return first;
}

export async function createPprRequest(input: CreatePprRequestInput, meta: { ip: string | null }): Promise<CreatePprRequestResult> {
  // --- Honeypot (AC 2) — first, before anything else observes the request.
  if (input.website && input.website.trim().length > 0) {
    return { status: 'PENDING' };
  }

  // --- Rate limit (AC 2) — a null IP (no x-forwarded-for header) skips the
  // limit entirely rather than either blocking everyone or exempting no
  // one (Contesto).
  if (meta.ip) {
    const windowStart = new Date(Date.now() - PPR_RATE_LIMIT_WINDOW_MS);
    const recentCount = await prisma.pprRequest.count({
      where: { submitterIp: meta.ip, createdAt: { gt: windowStart } },
    });
    if (recentCount >= PPR_RATE_LIMIT_MAX) {
      throw new RateLimitError('Too many PPR requests from this address — try again later.');
    }
  }

  // --- Domain validation (AD-8 stable codes) — instants, never strings.
  const eta = new Date(input.eta);
  if (eta.getTime() <= Date.now()) {
    throw new ValidationError('eta must be in the future.', undefined, 'ETA_IN_PAST');
  }
  let etd: Date | null = null;
  if (input.etd) {
    etd = new Date(input.etd);
    if (etd.getTime() <= eta.getTime()) {
      throw new ValidationError('etd must be strictly after eta.', undefined, 'ETD_NOT_AFTER_ETA');
    }
  }

  // --- Create.
  const created = await prisma.pprRequest.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      aircraftRegistration: input.aircraftRegistration,
      aircraftType: input.aircraftType,
      origin: input.origin,
      destination: input.destination,
      eta,
      etd,
      personsOnBoard: input.personsOnBoard,
      notes: input.notes,
      locale: input.locale,
      submitterIp: meta.ip,
    },
  });

  // --- Receipt email (AC 1) — best-effort, same pattern as
  // `accounts.service.ts#sendNegativeBalanceAlert`: the row is already
  // committed, a send failure must never surface to the caller.
  try {
    const { subject, text } = await buildPprReceiptEmail(input.locale as AppLocale, {
      firstName: created.firstName,
      aircraftRegistration: created.aircraftRegistration,
      aircraftType: created.aircraftType,
      origin: created.origin,
      destination: created.destination,
      eta: created.eta,
      personsOnBoard: created.personsOnBoard,
    });
    await getMailSender().send({ to: created.email, subject, text });
  } catch (error) {
    console.error('createPprRequest: failed to send receipt email', error);
  }

  return { status: 'PENDING' };
}

// --- Staff approval queue (epic 8, story 8.2; FR-23, FR-41) -----------------
// Unlike `createPprRequest` above (the public, no-`Actor` deroga), EVERY
// function below takes an `Actor` and calls `authorize(actor, 'ppr.manage')`
// as its FIRST statement, before any query (AD-5) — the precedent for this
// module is `expiry-types.service.ts`, not `createPprRequest`'s own deroga.

export type PprRequestListItem = {
  id: string;
  status: PprStatus;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  aircraftRegistration: string;
  aircraftType: string;
  origin: string;
  destination: string;
  eta: Date;
  etd: Date | null;
  personsOnBoard: number;
  notes: string | null;
  locale: string;
  /** `null` while `PENDING`; assigned atomically on approval — see `approvePprRequest`. */
  pprNumber: string | null;
  /** `null` unless `REJECTED` (AC 2). */
  rejectionReason: string | null;
  decidedAt: Date | null;
  decidedByUserId: string | null;
  createdAt: Date;
};

/**
 * Every detail field EXCEPT `submitterIp` (Contesto: "MAI submitterIp" — an
 * anti-abuse technical datum, never shown to staff, see the model's
 * doc-comment).
 */
const PPR_REQUEST_SELECT = {
  id: true,
  status: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  aircraftRegistration: true,
  aircraftType: true,
  origin: true,
  destination: true,
  eta: true,
  etd: true,
  personsOnBoard: true,
  notes: true,
  locale: true,
  pprNumber: true,
  rejectionReason: true,
  decidedAt: true,
  decidedByUserId: true,
  createdAt: true,
} as const;

/**
 * Lists the staff approval queue (AC 1/2). `ppr.manage` only. Defaults to
 * `status=PENDING` (the actionable queue, FIFO `createdAt asc`, tie-broken
 * by `id` for stable pagination) — same pattern as
 * `expiries.service.ts#listExpiryProposals`; pass `APPROVED`/`REJECTED` to
 * review past decisions.
 */
export async function listPprRequests(actor: Actor, query: ListPprRequestsQuery): Promise<PaginatedResult<PprRequestListItem>> {
  authorize(actor, 'ppr.manage');

  const where = { status: query.status };

  // Interactive transaction (story TD-1, AC 3 pattern) — see
  // `people.service.ts#listPeople`'s doc-comment for the batch-vs-interactive
  // `pg` DeprecationWarning rationale.
  const [items, total] = await prisma.$transaction(async (tx) => {
    const items = await tx.pprRequest.findMany({
      select: PPR_REQUEST_SELECT,
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...paginationOffset(query),
    });
    const total = await tx.pprRequest.count({ where });
    return [items, total] as const;
  });

  return paginate(items, total, query);
}

/**
 * Locks and re-reads a `PprRequest` row for a decision (approve/reject),
 * shared by both functions below — `SELECT ... FOR UPDATE` as the FIRST
 * statement in the caller's transaction (precedent:
 * `bookings.service.ts#createBooking`'s aircraft lock), so the guard below
 * and whatever the caller does next (issuing a PPR number, on approve) are
 * serialized against a concurrent decision on the SAME row.
 *
 * **Concurrency (Dev Notes, "la matrice 409-vs-numero è il cuore della
 * story")**: two decisions racing on the SAME request both reach this lock;
 * the second to acquire it re-reads a row the first already flipped away
 * from `PENDING` and throws the 409 here — BEFORE either the counter
 * upsert (approve) or the update (reject) runs, so a losing decision never
 * burns a PPR number and never overwrites the winner's outcome. Two
 * approvals on DIFFERENT requests never contend this lock at all (it is
 * scoped to one row by `id`) — they only ever meet at the `PprCounter` row
 * inside `approvePprRequest`, which is a separate, much narrower
 * bottleneck (see that model's doc-comment).
 */
async function lockPendingPprRequest(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id", "status" FROM "PprRequest" WHERE "id" = ${id} FOR UPDATE`;
  const row = locked[0];
  if (!row) {
    throw new NotFoundError('PPR request not found.');
  }
  if (row.status !== 'PENDING') {
    throw new ConflictError('This PPR request has already been decided.', undefined, 'PPR_ALREADY_DECIDED');
  }
}

/**
 * Approves a PENDING PPR request (AC 1) — `ppr.manage` only. Assigns the
 * next atomic per-year PPR number (`'PPR-<year>-NNNN'`, see
 * `lockPendingPprRequest`'s and `PprCounter`'s doc-comments for the full
 * race analysis) and sends a best-effort outcome email AFTER the
 * transaction commits, in the requester's OWN form locale
 * (`PprRequest.locale`), including the admin-configured operating
 * instructions for that locale ONLY when non-empty
 * (`app-settings.service.ts#getPprOperatingInstructions`,
 * `templates.ts#buildPprApprovalEmail`). A send failure is logged and
 * swallowed — the decision itself already committed and stays valid
 * (NFR-7 deferral: no retry queue).
 */
export async function approvePprRequest(actor: Actor, id: string): Promise<PprRequestListItem> {
  authorize(actor, 'ppr.manage');

  const decidedAt = new Date();
  // Europe/Rome calendar year of THIS instant (Dev Notes: NEVER
  // `getUTCFullYear` — an approval right around New Year's Eve must land in
  // the year Rome's wall clock says, not UTC's).
  const year = Number(dateOnlyInZone(decidedAt, APP_TIMEZONE).slice(0, 4));

  const updated = await prisma.$transaction(async (tx) => {
    await lockPendingPprRequest(tx, id);

    // Atomic per-year sequence (AC 1) — ONE statement; Postgres's own row
    // lock on the upserted `PprCounter` row is what makes two approvals in
    // the SAME year serialize into distinct, consecutive numbers instead of
    // racing a read-then-write gap (`PprCounter`'s doc-comment).
    const counterRows = await tx.$queryRaw<Array<{ lastSeq: number }>>`
      INSERT INTO "PprCounter" ("year", "lastSeq") VALUES (${year}, 1)
      ON CONFLICT ("year") DO UPDATE SET "lastSeq" = "PprCounter"."lastSeq" + 1
      RETURNING "lastSeq"`;
    const seq = counterRows[0]!.lastSeq;
    const pprNumber = `PPR-${year}-${String(seq).padStart(4, '0')}`;

    return tx.pprRequest.update({
      where: { id },
      data: { status: 'APPROVED', pprNumber, decidedAt, decidedByUserId: actor.userId },
      select: PPR_REQUEST_SELECT,
    });
  });

  try {
    const instructions = await getPprOperatingInstructions(actor);
    const operatingInstructions = updated.locale === 'en' ? instructions.en : instructions.it;
    const { subject, text } = await buildPprApprovalEmail(updated.locale as AppLocale, {
      firstName: updated.firstName,
      // Set unconditionally by the transaction above — safe to assert.
      pprNumber: updated.pprNumber!,
      aircraftRegistration: updated.aircraftRegistration,
      eta: updated.eta,
      operatingInstructions,
    });
    await getMailSender().send({ to: updated.email, subject, text });
  } catch (error) {
    console.error('approvePprRequest: failed to send approval email', error);
  }

  return updated;
}

/**
 * Rejects a PENDING PPR request with a mandatory reason (AC 2) —
 * `ppr.manage` only. Same lock-then-guard as `approvePprRequest` (via
 * `lockPendingPprRequest`) but never touches `PprCounter` (Contesto: "il
 * contatore non si tocca"). Best-effort outcome email AFTER commit, same
 * failure-swallowing rule as the approval side.
 */
export async function rejectPprRequest(actor: Actor, id: string, reason: string): Promise<PprRequestListItem> {
  authorize(actor, 'ppr.manage');

  const decidedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await lockPendingPprRequest(tx, id);

    return tx.pprRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, decidedAt, decidedByUserId: actor.userId },
      select: PPR_REQUEST_SELECT,
    });
  });

  try {
    const { subject, text } = await buildPprRejectionEmail(updated.locale as AppLocale, {
      firstName: updated.firstName,
      aircraftRegistration: updated.aircraftRegistration,
      eta: updated.eta,
      // Just written above by this same transaction — safe to assert.
      reason: updated.rejectionReason!,
    });
    await getMailSender().send({ to: updated.email, subject, text });
  } catch (error) {
    console.error('rejectPprRequest: failed to send rejection email', error);
  }

  return updated;
}
