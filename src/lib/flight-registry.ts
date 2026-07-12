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

/**
 * Registry display order — the SAME order `listFlights` applies server-side
 * (`flightDate desc, createdAt desc, id desc`). Client mutations (optimistic
 * register/correct prepends) must re-establish this invariant before the list
 * reaches `groupFlightsByDay`, otherwise a backdated flight lands on top and
 * produces out-of-order/duplicate day headers (review 12.4, 124-F1).
 */
export function compareFlightsRegistryOrder(a: FlightListItemDto, b: FlightListItemDto): number {
  if (a.flightDate !== b.flightDate) return a.flightDate < b.flightDate ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

/**
 * Inserts an optimistically mutated flight into an accumulated list keeping
 * the registry order invariant and dropping any stale entry with the same id
 * (review 12.4, 124-F1/F2).
 */
export function insertFlightSorted(flights: FlightListItemDto[], flight: FlightListItemDto): FlightListItemDto[] {
  const next = flights.filter((existing) => existing.id !== flight.id);
  next.push(flight);
  next.sort(compareFlightsRegistryOrder);
  return next;
}

/**
 * Appends a freshly fetched load-more page, dropping rows already present —
 * an optimistic insert shifts the server's page offsets, so the boundary row
 * of the previous page can come back as the first row of the next one
 * (review 12.4, 124-F2: duplicate React key + inflated footer count).
 */
export function appendFlightsPage(flights: FlightListItemDto[], page: FlightListItemDto[]): FlightListItemDto[] {
  const seen = new Set(flights.map((flight) => flight.id));
  return [...flights, ...page.filter((flight) => !seen.has(flight.id))];
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
