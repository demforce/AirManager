import type { Prisma, PprStatus } from '@/generated/prisma/client';
import type { AppLocale } from '@/i18n/routing';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import { parseDateOnlyUtc } from '@/lib/date-only';
import type { CompletePprRequestInput, CreateManualPprRequestInput, CreatePprRequestInput, ListPprRequestsQuery, PprRequestItemDto } from '@/lib/schemas/ppr';
import { APP_TIMEZONE } from '@/lib/time';
import { addDaysDateOnly, dateOnlyInZone, zonedMidnightUtc } from '@/lib/zoned-time';
import { getMailSender } from '@/server/adapters/mail';
import { buildPprApprovalEmail, buildPprReceiptEmail, buildPprRejectionEmail } from '@/server/adapters/mail/templates';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { getPprOperatingInstructions } from './app-settings.service';
import { ConflictError, NotFoundError, RateLimitError, ValidationError } from './errors';

/** The seeded cash category (`prisma/seed.ts`) the landing-fee movement is recorded under (story 8.3, AC 1) — resolved BY NAME inside the closing transaction, same "fails loudly by design" contract as `accounts.service.ts#recordTopUp`'s "Ricariche". */
const PPR_CASH_CATEGORY_NAME = 'PPR';

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

/**
 * Global fallback cap (CWE-770/H5 fix) on PPR requests with NO resolvable
 * submitter IP, within the SAME rolling window as the per-IP limit. Without
 * this, `extractSubmitterIp` returning `null` (no `x-forwarded-for` — the
 * app is reachable directly by IP, no trusted proxy guaranteed) let an
 * attacker who simply omits the header skip `PPR_RATE_LIMIT_MAX` entirely:
 * unbounded rows plus unbounded receipt emails to an attacker-chosen
 * address. Every no-IP request now shares ONE bucket instead. Set higher
 * than `PPR_RATE_LIMIT_MAX`: this bucket is also hit by every legitimate
 * no-header submitter (e.g. behind a proxy that strips the header), not
 * just an attacker, so it only needs to bound the damage, not match the
 * per-IP limit's tightness.
 */
export const PPR_NO_IP_RATE_LIMIT_MAX = 20;

/**
 * Per-recipient cap (review F3, CWE-770) on how many public PPR requests may
 * name the SAME `email` within the window. The receipt email is sent to this
 * caller-supplied address, so the per-IP limit alone is insufficient: an
 * attacker rotating `x-forwarded-for` gets a fresh per-IP budget each time
 * and could otherwise mail-bomb / relay unbounded receipts to any chosen
 * address using the club's SMTP reputation. This bound is independent of IP.
 * Case-insensitive so `Victim@x` / `victim@x` share one bucket.
 */
export const PPR_PER_EMAIL_RATE_LIMIT_MAX = 5;

const PPR_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type CreatePprRequestResult = { status: 'PENDING' };

/**
 * Extracts the caller's IP from the `x-forwarded-for` header (first value,
 * trimmed) — `null` when the header is absent. A `null` result no longer
 * means "no rate limit at all" (H5 fix): `createPprRequest` falls back to
 * the shared `PPR_NO_IP_RATE_LIMIT_MAX` bucket in that case instead. Trust
 * assumption, declared: in production the reverse proxy sets this header;
 * in dev/e2e the client sets it directly. A future real deployment behind a
 * proxy that does NOT strip/overwrite client-supplied `x-forwarded-for`
 * would need hardening — out of scope here (same "declared assumption"
 * shape as `JOBS_SECRET`'s bearer check).
 */
export function extractSubmitterIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) {
    return null;
  }
  const first = forwardedFor.split(',')[0]?.trim();
  if (!first) {
    console.warn('extractSubmitterIp: x-forwarded-for header present but empty — falling back to the shared no-IP rate limit for this request.');
    return null;
  }
  return first;
}

export async function createPprRequest(input: CreatePprRequestInput, meta: { ip: string | null }): Promise<CreatePprRequestResult> {
  // --- Honeypot (AC 2) — first, before anything else observes the request.
  if (input.website && input.website.trim().length > 0) {
    return { status: 'PENDING' };
  }

  // --- Rate limit (AC 2) — per-IP when the caller has a resolvable IP;
  // otherwise a shared global bucket (H5 fix, CWE-770) so a missing
  // x-forwarded-for is no longer a free pass. The global bucket excludes
  // staff-entered manual rows (`createManualPprRequest`, `createdByUserId`
  // set) — those already skip every anti-abuse check by design and must
  // not eat into the public endpoint's shared allowance.
  const windowStart = new Date(Date.now() - PPR_RATE_LIMIT_WINDOW_MS);
  if (meta.ip) {
    const recentCount = await prisma.pprRequest.count({
      where: { submitterIp: meta.ip, createdAt: { gt: windowStart } },
    });
    if (recentCount >= PPR_RATE_LIMIT_MAX) {
      throw new RateLimitError('Too many PPR requests from this address — try again later.');
    }
  } else {
    const recentCount = await prisma.pprRequest.count({
      where: { submitterIp: null, createdByUserId: null, createdAt: { gt: windowStart } },
    });
    if (recentCount >= PPR_NO_IP_RATE_LIMIT_MAX) {
      throw new RateLimitError('Too many PPR requests — try again later.');
    }
  }

  // --- Per-recipient cap (review F3) — independent of IP, so x-forwarded-for
  // rotation cannot mail-bomb / relay unbounded receipts to a chosen address.
  // A 429 here still creates no row. Public rows only (manual staff entries,
  // `createdByUserId` set, are excluded — same rationale as the IP buckets).
  if (input.email) {
    const recentForEmail = await prisma.pprRequest.count({
      where: {
        email: { equals: input.email, mode: 'insensitive' },
        createdByUserId: null,
        createdAt: { gt: windowStart },
      },
    });
    if (recentForEmail >= PPR_PER_EMAIL_RATE_LIMIT_MAX) {
      throw new RateLimitError('Too many PPR requests for this email — try again later.');
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
  // committed, a send failure must never surface to the caller. `email` is
  // always non-null on THIS path (the public schema requires it) — the
  // guard exists only because the column itself is nullable since story
  // 12.4 (a manual entry may have none); skipping silently on `null` is the
  // same contract every email-sending path in this module now shares.
  if (created.email) {
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
  /** `null` for a manual entry with a phone but no email (story 12.4, AC 1) — the public form always fills it. */
  email: string | null;
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
  /** When this request was closed — completed or cancelled (story 8.3, AC 1/2). `null` while still open. */
  closedAt: Date | null;
  closedByUserId: string | null;
  /** Landing fee charged at completion (story 8.3, AC 1), integer euro cents. `null` unless `COMPLETED` — see `completePprRequest`. */
  landingFeeCents: number | null;
  createdAt: Date;
  /** The staff/admin user who entered this request manually (story 12.4, AC 1) — `null` for every public-form submission. Never exposed as-is on the wire DTO (see `pprRequestItemSchema`'s `fromPublicForm` derived boolean instead). */
  createdByUserId: string | null;
};

/**
 * `PprRequestListItem` -> the wire DTO (`pprRequestItemSchema`), the ONE
 * mapping every consumer goes through — the API routes and both server
 * pages (review 12.4, F1: the routes used to return the service item raw,
 * so `createdByUserId`/`closedByUserId` reached the wire and the declared
 * `fromPublicForm` never did). Field-by-field ON PURPOSE, no spread: a
 * spread would silently re-leak any future service-only field into every
 * response; this shape fails typecheck instead the moment the schema and
 * the service type diverge.
 */
export function toPprRequestDto(item: PprRequestListItem): PprRequestItemDto {
  return {
    id: item.id,
    status: item.status,
    firstName: item.firstName,
    lastName: item.lastName,
    email: item.email,
    phone: item.phone,
    aircraftRegistration: item.aircraftRegistration,
    aircraftType: item.aircraftType,
    origin: item.origin,
    destination: item.destination,
    eta: item.eta.toISOString(),
    etd: item.etd ? item.etd.toISOString() : null,
    personsOnBoard: item.personsOnBoard,
    notes: item.notes,
    locale: item.locale as AppLocale,
    pprNumber: item.pprNumber,
    rejectionReason: item.rejectionReason,
    decidedAt: item.decidedAt ? item.decidedAt.toISOString() : null,
    decidedByUserId: item.decidedByUserId,
    landingFeeCents: item.landingFeeCents,
    closedAt: item.closedAt ? item.closedAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    fromPublicForm: item.createdByUserId === null,
  };
}

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
  closedAt: true,
  closedByUserId: true,
  landingFeeCents: true,
  createdAt: true,
  createdByUserId: true,
} as const;

/**
 * Lists the staff approval queue (AC 1/2, story 8.2) AND the filterable
 * register (AC 2, story 8.3) — ONE function, two callers (`/dashboard/ppr`'s
 * console and `/dashboard/movements`), same `ppr.manage` gate. Defaults to
 * `status=PENDING` (the actionable queue's own contract, unchanged, FIFO
 * `createdAt asc`, tie-broken by `id` for stable pagination); the register passes an
 * explicit status (including `'ALL'`, no status filter at all) plus an
 * optional `from`/`to` period bounding `eta` — the register is a register
 * of ARRIVALS. The period is resolved to a semi-open
 * `[zonedMidnightUtc(from), zonedMidnightUtc(to+1))` Europe/Rome instant
 * range (same `zonedMidnightUtc`/`addDaysDateOnly` pattern as story 7.2's
 * calendar day/week bounds) — an `eta` exactly at the `to+1` midnight
 * belongs to the FOLLOWING day, never silently included.
 */
export async function listPprRequests(actor: Actor, query: ListPprRequestsQuery): Promise<PaginatedResult<PprRequestListItem>> {
  authorize(actor, 'ppr.manage');

  const etaFilter: { gte?: Date; lt?: Date } = {};
  if (query.from) {
    etaFilter.gte = zonedMidnightUtc(query.from, APP_TIMEZONE);
  }
  if (query.to) {
    etaFilter.lt = zonedMidnightUtc(addDaysDateOnly(query.to, 1), APP_TIMEZONE);
  }

  const where: Prisma.PprRequestWhereInput = {
    ...(query.status === 'ALL' ? {} : { status: query.status }),
    ...(Object.keys(etaFilter).length > 0 ? { eta: etaFilter } : {}),
  };

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
 * Staff manual PPR intake (epic 12, story 12.4, AC 1) — `ppr.manage`, shared
 * by BOTH the console's "PPR manuale" slide-over (`approveImmediately`
 * omitted/`false`, stays PENDING) and the movements page's "Registra
 * arrivo" slide-over (`approveImmediately: true`). Enforces
 * `ETD_NOT_AFTER_ETA` (instants, never strings) but — unlike the public
 * `createPprRequest` — deliberately ALLOWS a past `eta` (ratified 12.4
 * review): "Registra arrivo" logs an aircraft that has just landed, so the
 * row derives to "al suolo" immediately. It skips EVERYTHING anti-abuse — no
 * rate limit, no receipt email (Dev Notes: "è staff"; this route never
 * triggers the automated notification pipeline the public form does — not
 * even the approval email when `approveImmediately` is used, since the
 * staff member creating the row is already the one dealing with the
 * requester directly). `phone`/`email` mirror the schema's own "at least
 * one contact" contract: an absent `email` is stored as `null` (never `''`
 * — a real NULL is what every email-sending path checks for); an absent
 * `phone` is stored as `''` (the DB column stays `NOT NULL` — only `email`
 * became nullable, story 12.4 AC 1).
 *
 * `approveImmediately` (`options`, NOT a field read off `input` — the wire
 * schema carries it only so the ROUTE can bridge it into this explicit
 * parameter) issues the SAME atomic per-year PPR number as
 * `approvePprRequest` (`PprCounter`, FOR-UPDATE-then-upsert), inlined here
 * rather than calling that function: this row was JUST created inside the
 * SAME transaction, so no concurrent decision can exist yet and
 * `lockPprRequest`'s `PPR_ALREADY_DECIDED` guard would be a no-op check
 * against data only this transaction can see.
 */
export async function createManualPprRequest(
  actor: Actor,
  input: CreateManualPprRequestInput,
  options: { approveImmediately?: boolean } = {},
): Promise<PprRequestListItem> {
  authorize(actor, 'ppr.manage');

  const eta = new Date(input.eta);
  // A past eta is intentionally allowed here (ratified 12.4 review) — "Registra
  // arrivo" logs an aircraft that has just landed. The public createPprRequest
  // still rejects it (ETA_IN_PAST); this staff path does not.
  let etd: Date | null = null;
  if (input.etd) {
    etd = new Date(input.etd);
    if (etd.getTime() <= eta.getTime()) {
      throw new ValidationError('etd must be strictly after eta.', undefined, 'ETD_NOT_AFTER_ETA');
    }
  }

  const approveImmediately = options.approveImmediately ?? false;
  const decidedAt = new Date();
  // Europe/Rome calendar year, same rule as `approvePprRequest` — never `getUTCFullYear`.
  const year = Number(dateOnlyInZone(decidedAt, APP_TIMEZONE).slice(0, 4));

  return prisma.$transaction(async (tx) => {
    const created = await tx.pprRequest.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? '',
        aircraftRegistration: input.aircraftRegistration,
        aircraftType: input.aircraftType,
        origin: input.origin,
        destination: input.destination,
        eta,
        etd,
        personsOnBoard: input.personsOnBoard,
        notes: input.notes,
        locale: input.locale,
        submitterIp: null,
        createdByUserId: actor.userId,
      },
      select: PPR_REQUEST_SELECT,
    });

    if (!approveImmediately) {
      return created;
    }

    const counterRows = await tx.$queryRaw<Array<{ lastSeq: number }>>`
      INSERT INTO "PprCounter" ("year", "lastSeq") VALUES (${year}, 1)
      ON CONFLICT ("year") DO UPDATE SET "lastSeq" = "PprCounter"."lastSeq" + 1
      RETURNING "lastSeq"`;
    const seq = counterRows[0]!.lastSeq;
    const pprNumber = `PPR-${year}-${String(seq).padStart(4, '0')}`;

    return tx.pprRequest.update({
      where: { id: created.id },
      data: { status: 'APPROVED', pprNumber, decidedAt, decidedByUserId: actor.userId },
      select: PPR_REQUEST_SELECT,
    });
  });
}

/** The `lockPprRequest` conflict shared by `approvePprRequest`/`rejectPprRequest` (story 8.2) — a request not `PENDING` when a decision is attempted. */
const PPR_ALREADY_DECIDED_CONFLICT = { message: 'This PPR request has already been decided.', code: 'PPR_ALREADY_DECIDED' } as const;

/** The `lockPprRequest` conflict shared by `completePprRequest`/`cancelPprRequest` (story 8.3) — a request not `APPROVED` when a closure is attempted (covers a still-`PENDING`/`REJECTED` request AND an already-closed one alike — the problem is the STATE, distinct from the 8.2 decision conflict above). */
const PPR_NOT_APPROVED_CONFLICT = { message: 'This PPR request is not in APPROVED status.', code: 'PPR_NOT_APPROVED' } as const;

/**
 * Locks and re-reads a `PprRequest` row for a state-changing action —
 * approve/reject (story 8.2) or complete/cancel (story 8.3) — shared by all
 * four functions below — `SELECT ... FOR UPDATE` as the FIRST statement in
 * the caller's transaction (precedent: `bookings.service.ts#createBooking`'s
 * aircraft lock), so the guard below and whatever the caller does next
 * (issuing a PPR number on approve; recording the landing-fee movement on
 * complete) are serialized against a concurrent action on the SAME row.
 * Generalized (story 8.3, Task 3) from the 8.2-only `lockPendingPprRequest`:
 * `expectedStatus`/`conflict` are now parameters — the two 8.2 call sites
 * (`'PENDING'`, `PPR_ALREADY_DECIDED_CONFLICT`) behave byte-identically to
 * before this refactor.
 *
 * **Concurrency (Dev Notes, "la matrice 409-vs-numero è il cuore della
 * story")**: two actions racing on the SAME request both reach this lock;
 * the second to acquire it re-reads a row the first already flipped away
 * from `expectedStatus` and throws the conflict here — BEFORE either side
 * effect (a PPR number on approve; a cash movement on complete) runs, so a
 * losing action never burns a PPR number, never records a duplicate
 * movement, and never overwrites the winner's outcome. Two actions on
 * DIFFERENT requests never contend this lock at all (it is scoped to one
 * row by `id`) — they only ever meet at the `PprCounter` row inside
 * `approvePprRequest`, a separate, much narrower bottleneck (see that
 * model's doc-comment).
 */
async function lockPprRequest(
  tx: Prisma.TransactionClient,
  id: string,
  expectedStatus: PprStatus,
  conflict: { message: string; code: string },
): Promise<void> {
  const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id", "status" FROM "PprRequest" WHERE "id" = ${id} FOR UPDATE`;
  const row = locked[0];
  if (!row) {
    throw new NotFoundError('PPR request not found.');
  }
  if (row.status !== expectedStatus) {
    throw new ConflictError(conflict.message, undefined, conflict.code);
  }
}

/**
 * Approves a PENDING PPR request (AC 1) — `ppr.manage` only. Assigns the
 * next atomic per-year PPR number (`'PPR-<year>-NNNN'`, see
 * `lockPprRequest`'s and `PprCounter`'s doc-comments for the full
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
    await lockPprRequest(tx, id, 'PENDING', PPR_ALREADY_DECIDED_CONFLICT);

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

  // Story 12.4, AC 1: `email` is `null` for a manual entry with a phone but
  // no email — every email-sending path in this module skips silently in
  // that case, same as `createPprRequest`'s own guard.
  if (updated.email) {
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
  }

  return updated;
}

/**
 * Rejects a PENDING PPR request with a mandatory reason (AC 2) —
 * `ppr.manage` only. Same lock-then-guard as `approvePprRequest` (via
 * `lockPprRequest`) but never touches `PprCounter` (Contesto: "il
 * contatore non si tocca"). Best-effort outcome email AFTER commit, same
 * failure-swallowing rule as the approval side.
 */
export async function rejectPprRequest(actor: Actor, id: string, reason: string): Promise<PprRequestListItem> {
  authorize(actor, 'ppr.manage');

  const decidedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await lockPprRequest(tx, id, 'PENDING', PPR_ALREADY_DECIDED_CONFLICT);

    return tx.pprRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, decidedAt, decidedByUserId: actor.userId },
      select: PPR_REQUEST_SELECT,
    });
  });

  // Story 12.4, AC 1: same null-email guard as `approvePprRequest` above.
  if (updated.email) {
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
  }

  return updated;
}

// --- Closure (epic 8, story 8.3, FR-24) --------------------------------------
// `authorize(actor, 'ppr.manage')` gates both — same module-wide contract as
// every function above. Unlike approve/reject, NEITHER function here sends
// an email (Dev Notes: "FR-24 non ne prevede nessuna in TUTTA la story").

/**
 * Completes an APPROVED PPR request (AC 1) — `ppr.manage` only. Records the
 * closure AND the landing-fee `CashMovement` (when `landingFeeCents > 0`)
 * in ONE `prisma.$transaction`: either both commit or neither does — a
 * `COMPLETED` request with a positive fee and no linked movement would be a
 * corrupted state this codebase never allows to exist, even transiently.
 *
 * Guard: `lockPprRequest(tx, id, 'APPROVED', PPR_NOT_APPROVED_CONFLICT)` —
 * 404 on an unknown id, 409 `PPR_NOT_APPROVED` for any status other than
 * `APPROVED` (still `PENDING`/`REJECTED`, OR already closed by a concurrent
 * `complete`/`cancel` — the second racer to acquire the lock always loses
 * here, BEFORE the category lookup or the movement create run, so at most
 * one movement is ever created per request).
 *
 * `landingFeeCents === 0` (a waived fee) skips the movement entirely — the
 * branch is checked BEFORE the "PPR" category is even looked up, so a
 * missing/inactive category never blocks a zero-fee completion. When the
 * fee is positive, the category is resolved BY NAME (`PPR_CASH_CATEGORY_NAME`)
 * INSIDE this same transaction — missing or `isActive: false` throws
 * (`NotFoundError`/`ConflictError` respectively), which rolls back the
 * `COMPLETED` update too (same "fails loudly by design" contract as
 * `cash.service.ts#recordCashMovement`'s doc-comment: an operational
 * misconfiguration must never silently complete a PPR with an unrecorded
 * fee). `effectiveDate` is the closure's OWN calendar day in Europe/Rome
 * (`parseDateOnlyUtc(dateOnlyInZone(closedAt, APP_TIMEZONE))` — a
 * `@db.Date` column, review 3.5's lesson: never a raw instant), computed
 * from the SAME `closedAt` instant the row itself is stamped with, never a
 * second independent `new Date()` call that could tick a millisecond apart.
 */
export async function completePprRequest(actor: Actor, id: string, input: CompletePprRequestInput): Promise<PprRequestListItem> {
  authorize(actor, 'ppr.manage');

  const closedAt = new Date();
  const effectiveDate = parseDateOnlyUtc(dateOnlyInZone(closedAt, APP_TIMEZONE));

  return prisma.$transaction(async (tx) => {
    await lockPprRequest(tx, id, 'APPROVED', PPR_NOT_APPROVED_CONFLICT);

    const closed = await tx.pprRequest.update({
      where: { id },
      data: { status: 'COMPLETED', closedAt, closedByUserId: actor.userId, landingFeeCents: input.landingFeeCents },
      select: PPR_REQUEST_SELECT,
    });

    if (input.landingFeeCents > 0) {
      const category = await tx.cashCategory.findUnique({
        where: { name: PPR_CASH_CATEGORY_NAME },
        select: { id: true, isActive: true },
      });
      if (!category) {
        throw new NotFoundError(
          `Cash category "${PPR_CASH_CATEGORY_NAME}" is missing — seed it before completing a PPR request with a landing fee.`,
        );
      }
      if (!category.isActive) {
        throw new ConflictError(
          `Cash category "${PPR_CASH_CATEGORY_NAME}" is inactive — reactivate it before completing a PPR request with a landing fee.`,
        );
      }

      await tx.cashMovement.create({
        data: {
          categoryId: category.id,
          amountCents: input.landingFeeCents,
          description: `PPR ${closed.pprNumber} landing fee`,
          effectiveDate,
          actorUserId: actor.userId,
          pprRequestId: id,
        },
      });
    }

    return closed;
  });
}

/**
 * Cancels an APPROVED PPR request that never showed up (AC 2) — `ppr.manage`
 * only. Same lock-then-guard as `completePprRequest`
 * (`lockPprRequest(tx, id, 'APPROVED', PPR_NOT_APPROVED_CONFLICT)`) but
 * records NEITHER a fee NOR a `CashMovement` NOR a reason (Contesto: "l'AC
 * non lo chiede" — a withdrawn/no-show request is simply closed with no
 * money involved, nothing speculative added beyond what AC 2 asks for).
 */
export async function cancelPprRequest(actor: Actor, id: string): Promise<PprRequestListItem> {
  authorize(actor, 'ppr.manage');

  const closedAt = new Date();

  return prisma.$transaction(async (tx) => {
    await lockPprRequest(tx, id, 'APPROVED', PPR_NOT_APPROVED_CONFLICT);

    return tx.pprRequest.update({
      where: { id },
      data: { status: 'CANCELLED', closedAt, closedByUserId: actor.userId },
      select: PPR_REQUEST_SELECT,
    });
  });
}
