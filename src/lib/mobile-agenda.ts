/**
 * PURE composition of the phone agenda of "Pianificazione" (story 15.4) — the
 * day view a phone gets instead of the 1000px-wide desktop timeline.
 *
 * Two ratified rules live here rather than in JSX (AD-5): both are trivial to
 * get subtly wrong, and neither can be proven on its boundary cases by an e2e
 * (an empty day, a day already over, two adjacent slots).
 *
 * - **AOG first** (ratifica R-15.4-h): an out-of-service aircraft has no
 *   `startsAt` at all, and "which aircraft is not flying today, and why" is
 *   the first useful line for someone opening this page on the apron. It is
 *   also what the desktop timeline shows. Every other row follows its own
 *   slot's `startsAt`.
 * - **the ORA marker** sits immediately BEFORE the first movement starting
 *   after "now", and does not exist at all when there is none (the template's
 *   `nowIdx = findIndex(f.start > NOW)`, lines 636-639).
 *
 * `startsAfterNow` is decided ONCE, against the server's clock, and carried on
 * the row on purpose. The marker's position has to survive the client-side
 * aircraft filter (a filtered list has a different first-future row, so the
 * index cannot be precomputed), while re-reading the clock in the browser
 * during render would make the marker a hydration mismatch.
 */
import { dayPhaseOf, type DayPhase } from './booking-day-phase';

/** The booking fields the ordering and the phase need — callers pass their own richer rows through the generic. */
export type AgendaSourceBooking = {
  id: string;
  startsAt: Date;
  endsAt: Date;
};

/** Ditto for the fleet: only "is this aircraft out of service" decides an AOG row. */
export type AgendaSourceAircraft = {
  id: string;
  status: 'OPERATIONAL' | 'OUT_OF_SERVICE';
};

export type AgendaEntry<B extends AgendaSourceBooking, A extends AgendaSourceAircraft> =
  | { kind: 'aog'; aircraft: A }
  | { kind: 'booking'; booking: B; phase: DayPhase; startsAfterNow: boolean };

/**
 * The agenda's rows, in the order they are rendered: the out-of-service
 * aircraft (input order), then the movements by `startsAt` ascending with `id`
 * as the tie-break — the same total order `listCalendarBookings` already
 * applies server-side, restated here because this function must not depend on
 * its caller having preserved it.
 */
export function buildAgendaEntries<B extends AgendaSourceBooking, A extends AgendaSourceAircraft>(
  bookings: readonly B[],
  aircraft: readonly A[],
  now: Date,
): Array<AgendaEntry<B, A>> {
  const aogRows: Array<AgendaEntry<B, A>> = aircraft
    .filter((item) => item.status === 'OUT_OF_SERVICE')
    .map((item) => ({ kind: 'aog', aircraft: item }));

  const movements: Array<AgendaEntry<B, A>> = [...bookings]
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime() || left.id.localeCompare(right.id))
    .map((booking) => ({
      kind: 'booking',
      booking,
      phase: dayPhaseOf(booking.startsAt, booking.endsAt, now),
      // Strictly after (the template's `f.start > NOW`): a slot that starts
      // exactly now is already `inProgress`, so the marker belongs AFTER it.
      startsAfterNow: booking.startsAt.getTime() > now.getTime(),
    }));

  return [...aogRows, ...movements];
}

/**
 * Where the "ORA" separator goes in the rows ACTUALLY on screen (after the
 * aircraft filter): the index of the first future movement, or `-1` when the
 * day holds none — in which case no marker is rendered at all, exactly like
 * the template. AOG rows are never `startsAfterNow`, so they can never take
 * the marker themselves.
 */
export function nowMarkerIndex(rows: readonly { startsAfterNow: boolean }[]): number {
  return rows.findIndex((row) => row.startsAfterNow);
}
