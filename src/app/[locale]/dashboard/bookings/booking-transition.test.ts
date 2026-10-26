import { afterEach, describe, expect, it, vi } from 'vitest';
import { postBookingTransition, type BookingTransitionErrorLabels } from './booking-transition';

// Story 16.3 (AD-7 #3): the transition wrapper used to decide a 409's message
// from the STATUS alone, and to mark every 409 `stale` — true for an overlap on
// the booking's own aircraft or an archived one, false for the two new codes,
// where the row on screen is alive and ANOTHER booking of the same
// person/instructor is in the way (closing the sheet over it is review 15.3
// F2's mistake again).

const LABELS: BookingTransitionErrorLabels = {
  BOOKING_ALREADY_STARTED: 'already-started',
  BOOKING_TRANSITION_INVALID: 'transition-invalid',
  BOOKING_DENY_REASON_REQUIRED: 'deny-reason-required',
  EXPIRED_DOCUMENTS: 'expired {documents}',
  AIRCRAFT_OUT_OF_SERVICE: 'out-of-service {reason}',
  BOOKING_NOT_STARTED: 'not-started',
  PERSON_BUSY: 'person-busy',
  INSTRUCTOR_BUSY: 'instructor-busy',
  conflict: 'conflict',
  generic: 'generic',
};

function answer(status: number, code: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ error: { code, message: 'x' } }), { status, headers: { 'Content-Type': 'application/json' } })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postBookingTransition — 409s and the new 422 (story 16.3)', () => {
  it.each(['PERSON_BUSY', 'INSTRUCTOR_BUSY'] as const)('409 %s names the busy subject and is a conflict but NOT stale (the row is alive)', async (code) => {
    answer(409, code);

    const outcome = await postBookingTransition('booking_1', 'APPROVED', LABELS);

    expect(outcome).toEqual({ ok: false, conflict: true, stale: false, message: LABELS[code] });
  });

  it('every other 409 keeps the pre-story answer byte for byte: the generic conflict message, stale', async () => {
    answer(409, 'CONFLICT');

    const outcome = await postBookingTransition('booking_1', 'APPROVED', LABELS);

    expect(outcome).toEqual({ ok: false, conflict: true, stale: true, message: 'conflict' });
  });

  it('422 BOOKING_NOT_STARTED says when the booking can be closed instead of "Riprova", and is not stale', async () => {
    answer(422, 'BOOKING_NOT_STARTED');

    const outcome = await postBookingTransition('booking_1', 'FLOWN', LABELS);

    expect(outcome).toEqual({ ok: false, conflict: false, stale: false, message: 'not-started' });
  });
});
