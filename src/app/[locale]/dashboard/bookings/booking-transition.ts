'use client';

/**
 * `POST /api/v1/bookings/{id}/transition` — the ONE client-side wrapper of the
 * booking decision endpoint, plus the error-code -> message mapping that goes
 * with it.
 *
 * Extracted from `bookings-table.tsx` by story 15.3 (AD-2): the mobile
 * Panoramica has its own "Prenotazioni in attesa" card (a NEW component, so
 * that adding a mobile tree inside `bookings-table.tsx` does not pre-empt
 * story 15.4's own `/dashboard/bookings` work), and both surfaces must call
 * the same endpoint with the same body, the same 409 handling and the same
 * messages. The extraction is behaviour-preserving on the desktop side by
 * construction: the bodies below are the ones `bookings-table.tsx` had, moved
 * verbatim, and `bookings.spec.ts` is their guard.
 *
 * A plain function, not a hook and not a class (AD-2): the two callers own
 * their own busy/toast/refresh state, which is the part that legitimately
 * differs (a table row disables its buttons, a bottom sheet closes itself).
 */

/** Every `to` the transition endpoint accepts. `CANCELLED` is a different route (`/cancel`). */
export type BookingTransitionTarget = 'PENDING' | 'APPROVED' | 'DENIED' | 'FLOWN' | 'NO_SHOW';

/** The `actions.errors` sub-object of `BookingsTableLabels` — both callers pass exactly this. */
export type BookingTransitionErrorLabels = {
  BOOKING_ALREADY_STARTED: string;
  BOOKING_TRANSITION_INVALID: string;
  BOOKING_DENY_REASON_REQUIRED: string;
  /** `{documents}` placeholder, client-filled. */
  EXPIRED_DOCUMENTS: string;
  /** `{reason}` placeholder, client-filled. */
  AIRCRAFT_OUT_OF_SERVICE: string;
  conflict: string;
  generic: string;
};

export type BookingApiErrorBody = { error?: { code?: string; details?: { reason?: string; documents?: Array<{ typeName: string }> } } };

export async function readBookingApiError(response: Response): Promise<BookingApiErrorBody | null> {
  return (await response.json().catch(() => null)) as BookingApiErrorBody | null;
}

export function bookingErrorMessage(code: string | undefined, body: BookingApiErrorBody | null, labels: BookingTransitionErrorLabels): string {
  switch (code) {
    case 'BOOKING_ALREADY_STARTED':
      return labels.BOOKING_ALREADY_STARTED;
    case 'BOOKING_TRANSITION_INVALID':
      return labels.BOOKING_TRANSITION_INVALID;
    case 'BOOKING_DENY_REASON_REQUIRED':
      return labels.BOOKING_DENY_REASON_REQUIRED;
    case 'EXPIRED_DOCUMENTS': {
      const documentNames = (body?.error?.details?.documents ?? []).map((document) => document.typeName);
      return labels.EXPIRED_DOCUMENTS.replace('{documents}', documentNames.join(', '));
    }
    case 'AIRCRAFT_OUT_OF_SERVICE':
      return labels.AIRCRAFT_OUT_OF_SERVICE.replace('{reason}', body?.error?.details?.reason ?? '');
    default:
      return labels.generic;
  }
}

export type BookingTransitionOutcome =
  | { ok: true }
  /** `conflict` is the 409 (someone else decided first): the caller's list is stale. */
  | { ok: false; conflict: boolean; message: string };

/**
 * `reason` is only sent when present — the schema keeps it optional at the type
 * level but the domain REQUIRES it for `to: 'DENIED'`
 * (`lib/schemas/bookings.ts`), which is why both callers collect it in a second
 * step instead of deciding in one tap.
 */
export async function postBookingTransition(
  id: string,
  to: BookingTransitionTarget,
  labels: BookingTransitionErrorLabels,
  reason?: string,
): Promise<BookingTransitionOutcome> {
  const response = await fetch(`/api/v1/bookings/${id}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reason ? { to, reason } : { to }),
  });

  if (response.ok) return { ok: true };
  if (response.status === 409) return { ok: false, conflict: true, message: labels.conflict };

  const body = await readBookingApiError(response);
  return { ok: false, conflict: false, message: bookingErrorMessage(body?.error?.code, body, labels) };
}
