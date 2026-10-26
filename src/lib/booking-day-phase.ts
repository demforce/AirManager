/**
 * Shared, PURE "where is this booking relative to NOW" derivation.
 *
 * Extracted from `dashboard/page.tsx` (story 15.3, AD-4) where it was a
 * private helper of the instructor landing: story 15.3's mobile Panoramica
 * needs the SAME boundary to build its "In corso ora" card, and the project
 * rule is that a boundary like this has exactly one implementation (the
 * precedent is `@/lib/expiry-status`'s `tierOf`).
 *
 * The app has **no notion of a flight actually being airborne** — `FlightStatus`
 * is `REGISTERED | CANCELLED` and a flight is logged AFTER the fact — so the
 * only honest "now" an aviosuperficie console can show is the BOOKING that
 * covers this instant (ratifica R-15.3-a: the card is called "In corso ora",
 * not "In volo ora", precisely so the number does not lie).
 *
 * Boundaries, deliberately half-open `[startsAt, endsAt)`:
 * - `now < startsAt`            -> `scheduled`
 * - `now === startsAt`          -> `inProgress` (the slot has begun)
 * - `startsAt < now < endsAt`   -> `inProgress`
 * - `now === endsAt`            -> `completed` (the slot is over; the next
 *   booking on the same aircraft starts exactly here, and two adjacent slots
 *   must never both read "in corso")
 * - `now > endsAt`              -> `completed`
 */

export type DayPhase = 'inProgress' | 'completed' | 'scheduled';

export function dayPhaseOf(startsAt: Date, endsAt: Date, now: Date): DayPhase {
  if (now >= endsAt) return 'completed';
  if (now >= startsAt) return 'inProgress';
  return 'scheduled';
}

/**
 * The bookings covering `now`, in the input's own order (the callers pass
 * `listCalendarBookings`' `startsAt`-ascending result and must keep it).
 */
export function filterInProgress<T extends { startsAt: Date; endsAt: Date }>(bookings: readonly T[], now: Date): T[] {
  return bookings.filter((booking) => dayPhaseOf(booking.startsAt, booking.endsAt, now) === 'inProgress');
}
