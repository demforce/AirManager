import type { FlightTypeDto } from '@/lib/schemas/flights';

/** The minimal shape `flightPicPerson` needs from either `person` or `instructor` — structurally satisfied by both `FlightListItemDto` shapes without importing either directly. */
export type FlightPicName = { firstName: string; lastName: string };

export type FlightPicInput = {
  flightType: FlightTypeDto;
  isSolo: boolean;
  person: FlightPicName;
  instructor: FlightPicName | null;
};

/**
 * Derives a flight's PIC (pilota al comando) — a pure UI-presentation
 * helper, NEVER persisted (story 9.4, `Flight.isSolo`'s own Prisma
 * doc-comment makes the same point). Story 11.2, AC 2:
 * - a non-SCHOOL flight, or a SCHOOL flight flown SOLO -> the flight's own
 *   `person` (pilot/allievo).
 * - a SCHOOL flight flown dual (doppio comando) -> the `instructor`.
 * Returns `null` only on historical, anomalous data — a dual SCHOOL flight
 * recorded without an instructor (registration/correction always requires
 * one via `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`, so this can only happen on
 * data that predates that rule) — the caller falls back to a "—" label.
 */
export function flightPicPerson(flight: FlightPicInput): FlightPicName | null {
  if (flight.flightType !== 'SCHOOL' || flight.isSolo) return flight.person;
  return flight.instructor;
}
