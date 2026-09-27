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
  /** Story 16.3 (ops F9): FLOWN/NO_SHOW on a booking whose slot has not started yet. */
  BOOKING_NOT_STARTED: string;
  /** Story 16.3 (ops F2): the two 409s that are NOT about this booking's row — another booking of the same person/instructor overlaps. */
  PERSON_BUSY: string;
  INSTRUCTOR_BUSY: string;
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
    case 'BOOKING_NOT_STARTED':
      // Story 16.3: without this case the 422 fell to "Riprova", which is the
      // one thing that cannot work until the slot starts (lesson R-15.4-g).
      return labels.BOOKING_NOT_STARTED;
    default:
      return labels.generic;
  }
}

export type BookingTransitionOutcome =
  | { ok: true }
  /**
   * `conflict` is the 409 — which on THIS endpoint means slot overlap or an
   * archived aircraft, exactly what `labels.conflict` describes, or (story
   * 16.3) the booking's person/instructor busy on ANOTHER booking.
   *
   * `stale` is the broader question a caller actually asks ("is the row on my
   * screen still real?"), and review 15.3 F2 measured that the two are not the
   * same: when somebody else has already decided the booking,
   * `bookings.service.ts#transitionBooking` raises a `ValidationError`
   * (`BOOKING_TRANSITION_INVALID`), and `lib/api/handler.ts` maps
   * ValidationError -> **422**, ConflictError -> 409. A caller keying its
   * "close and refresh" on `conflict` therefore did nothing in the one
   * scenario it was written for: the sheet stayed open over a dead row and
   * every further tap produced the same error.
   */
  | { ok: false; conflict: boolean; stale: boolean; message: string };

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

  const body = await readBookingApiError(response);
  const code = body?.error?.code;
  if (response.status === 409) {
    // Story 16.3: `PERSON_BUSY`/`INSTRUCTOR_BUSY` say that ANOTHER booking of
    // the same person/instructor is in the way — the row on screen is alive,
    // so it is NOT stale (closing and refreshing over it is review 15.3 F2's
    // mistake again). Every other 409 keeps today's answer, byte for byte.
    if (code === 'PERSON_BUSY' || code === 'INSTRUCTOR_BUSY') return { ok: false, conflict: true, stale: false, message: labels[code] };
    return { ok: false, conflict: true, stale: true, message: labels.conflict };
  }
  return {
    ok: false,
    conflict: false,
    // 422 `BOOKING_TRANSITION_INVALID` = the booking is no longer in a state
    // this transition applies to, i.e. the caller's row is stale (review 15.3
    // F2). Every other 4xx here is about THIS request (missing reason, expired
    // documents, aircraft out of service): the row is fine, the input is not.
    stale: code === 'BOOKING_TRANSITION_INVALID',
    message: bookingErrorMessage(code, body, labels),
  };
}
