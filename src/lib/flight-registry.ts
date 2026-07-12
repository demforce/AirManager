/**
 * Pure helpers for the flight registry's two rendering contexts (story 12.4,
 * AC 2/3) — grouped-by-day (no filter) vs. flat (any filter active), plus
 * the day-bucketing itself. Kept out of `flights-manager.tsx` so both are
 * unit-testable (that file is a client component; this project's `vitest`
 * runs with `environment: 'node'`, no jsdom/testing-library — see 12.3's
 * Review Record — so component-level rendering is never unit-tested, only
 * the pure logic it calls).
 */

import type { FlightListItemDto } from './schemas/flights';

/**
 * The filter values that decide grouped vs. flat (AC 2/3, mechanical rule
 * ratified in the story's Contesto): `dateFrom||dateTo||aircraftId||
 * personId||flightType||status||instructorPersonId`. `instructorPersonId`
 * is not part of the `FlightsFilters` the filter bar controls — it is the
 * separate school-drill-down banner param (story 9.3) — so it is passed
 * here independently.
 */
export type FlightRegistryFilterState = {
  dateFrom: string;
  dateTo: string;
  aircraftId: string;
  personId: string;
  flightType: string;
  status: string;
  instructorPersonId?: string | null;
};

/** `true` -> flat context (date column in row, no day headers); `false` -> grouped context (day headers, no date column). */
export function hasActiveFlightFilter(filters: FlightRegistryFilterState): boolean {
  return (
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.aircraftId !== '' ||
    filters.personId !== '' ||
    filters.flightType !== '' ||
    filters.status !== '' ||
    Boolean(filters.instructorPersonId)
  );
}

/** One calendar day's worth of adjacent flights (grouped context, AC 2). */
export type FlightDayGroup = { flightDate: string; flights: FlightListItemDto[] };

/**
 * Buckets an already-ordered flight list into consecutive same-day groups,
 * using `flight.flightDate` AS-IS (it is already the Europe/Rome calendar
 * day, derived server-side in story 11.1 — no client conversion, per the
 * story's binding decision). Only merges ADJACENT entries — the list is
 * already sorted `flightDate desc, createdAt desc, id desc` server-side
 * (`flights.service.ts#listFlights`), so this never re-sorts or merges
 * non-adjacent same-day flights split across a load-more page boundary
 * (the story's own accepted "a day can be split across two loads" case).
 */
export function groupFlightsByDay(flights: FlightListItemDto[]): FlightDayGroup[] {
  const groups: FlightDayGroup[] = [];
  for (const flight of flights) {
    const last = groups[groups.length - 1];
    if (last && last.flightDate === flight.flightDate) {
      last.flights.push(flight);
    } else {
      groups.push({ flightDate: flight.flightDate, flights: [flight] });
    }
  }
  return groups;
}
