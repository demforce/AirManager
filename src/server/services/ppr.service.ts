import type { AppLocale } from '@/i18n/routing';
import type { CreatePprRequestInput } from '@/lib/schemas/ppr';
import { getMailSender } from '@/server/adapters/mail';
import { buildPprReceiptEmail } from '@/server/adapters/mail/templates';
import { prisma } from '@/server/db/prisma';
import { RateLimitError, ValidationError } from './errors';

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
