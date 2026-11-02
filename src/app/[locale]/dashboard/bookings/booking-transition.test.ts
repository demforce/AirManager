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
  AIRCRAFT_OUT_OF_SERVICE: 'out-of-service {reason}',
  BOOKING_NOT_STARTED: 'not-started',
  INSTRUCTOR_SAME_AS_PILOT: 'same-as-pilot',
  PERSON_BUSY: 'person-busy',
  INSTRUCTOR_BUSY: 'instructor-busy',
  conflict: 'conflict',
  generic: 'generic',
};

function answer(status: number, code: string, details?: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ error: { code, message: 'x', ...(details ? { details } : {}) } }), { status, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
  return JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
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

describe('postBookingTransition — the requirements of an approval (story 19.10, AC 29)', () => {
  const failures = [{ type: 'MEMBERSHIP', role: 'person', personName: 'Mario Rossi', expiresAt: null }];

  it('422 REQUIREMENTS_NOT_MET carries the failures for the warning — neither stale nor a toast message', async () => {
    answer(422, 'REQUIREMENTS_NOT_MET', { failures });

    const outcome = await postBookingTransition('booking_1', 'APPROVED', LABELS);

    expect(outcome).toEqual({ ok: false, stale: false, failures });
  });

  it('force: true goes in the body only when passed', async () => {
    const plain = answer(200, 'OK');
    await postBookingTransition('booking_1', 'APPROVED', LABELS);
    expect(sentBody(plain)).toEqual({ to: 'APPROVED' });

    const forced = answer(200, 'OK');
    await postBookingTransition('booking_1', 'APPROVED', LABELS, undefined, true);
    expect(sentBody(forced)).toEqual({ to: 'APPROVED', force: true });

    const denied = answer(200, 'OK');
    await postBookingTransition('booking_1', 'DENIED', LABELS, 'motivo');
    expect(sentBody(denied)).toEqual({ to: 'DENIED', reason: 'motivo' });
  });

  it('422 INSTRUCTOR_SAME_AS_PILOT (D-8) names the rule instead of "Riprova"', async () => {
    answer(422, 'INSTRUCTOR_SAME_AS_PILOT');

    const outcome = await postBookingTransition('booking_1', 'APPROVED', LABELS);

    expect(outcome).toEqual({ ok: false, conflict: false, stale: false, message: 'same-as-pilot' });
  });
});
