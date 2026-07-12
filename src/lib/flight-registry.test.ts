import { describe, expect, it } from 'vitest';
import { appendFlightsPage, groupFlightsByDay, hasActiveFlightFilter, insertFlightSorted, type FlightRegistryFilterState } from './flight-registry';
import type { FlightListItemDto } from './schemas/flights';

const BASE_FILTERS: FlightRegistryFilterState = {
  dateFrom: '',
  dateTo: '',
  aircraftId: '',
  personId: '',
  flightType: '',
  status: '',
};

describe('hasActiveFlightFilter', () => {
  it('no filter set: false (grouped context)', () => {
    expect(hasActiveFlightFilter(BASE_FILTERS)).toBe(false);
  });

  it.each([
    ['dateFrom', '2020-01-01'],
    ['dateTo', '2020-01-31'],
    ['aircraftId', 'aircraft-1'],
    ['personId', 'person-1'],
    ['flightType', 'SCHOOL'],
    ['status', 'CANCELLED'],
  ] as const)('%s set: true (flat context)', (key, value) => {
    expect(hasActiveFlightFilter({ ...BASE_FILTERS, [key]: value })).toBe(true);
  });

  it('instructorPersonId set (school drill-down banner, not a FilterBar control): true', () => {
    expect(hasActiveFlightFilter({ ...BASE_FILTERS, instructorPersonId: 'person-1' })).toBe(true);
  });

  it('instructorPersonId null/undefined: false', () => {
    expect(hasActiveFlightFilter({ ...BASE_FILTERS, instructorPersonId: null })).toBe(false);
    expect(hasActiveFlightFilter(BASE_FILTERS)).toBe(false);
  });
});

/** Minimal `FlightListItemDto` stand-in — only `id`/`flightDate` matter to the grouping logic. */
function flight(id: string, flightDate: string): FlightListItemDto {
  return { id, flightDate } as FlightListItemDto;
}

describe('groupFlightsByDay', () => {
  it('empty list: no groups', () => {
    expect(groupFlightsByDay([])).toEqual([]);
  });

  it('two flights the same day: one group with both, in order', () => {
    const flights = [flight('a', '2020-01-02'), flight('b', '2020-01-02')];
    expect(groupFlightsByDay(flights)).toEqual([{ flightDate: '2020-01-02', flights }]);
  });

  it('flights on different days: one group per day, preserving arrival order', () => {
    const flights = [flight('a', '2020-01-03'), flight('b', '2020-01-02'), flight('c', '2020-01-02')];
    expect(groupFlightsByDay(flights)).toEqual([
      { flightDate: '2020-01-03', flights: [flights[0]] },
      { flightDate: '2020-01-02', flights: [flights[1], flights[2]] },
    ]);
  });

  it('the same day appearing non-adjacently (should never happen given the server sort, but never silently merges) stays two separate groups', () => {
    const flights = [flight('a', '2020-01-02'), flight('b', '2020-01-01'), flight('c', '2020-01-02')];
    expect(groupFlightsByDay(flights)).toEqual([
      { flightDate: '2020-01-02', flights: [flights[0]] },
      { flightDate: '2020-01-01', flights: [flights[1]] },
      { flightDate: '2020-01-02', flights: [flights[2]] },
    ]);
  });
});

/** Stand-in with the three sort keys the registry order uses. */
function sortableFlight(id: string, flightDate: string, createdAt: string): FlightListItemDto {
  return { id, flightDate, createdAt } as FlightListItemDto;
}

describe('insertFlightSorted (review 12.4, 124-F1)', () => {
  it('a backdated optimistic insert lands in its own day position, not on top', () => {
    const list = [
      sortableFlight('a', '2026-07-12', '2026-07-12T10:00:00.000Z'),
      sortableFlight('b', '2021-03-09', '2021-03-09T10:00:00.000Z'),
      sortableFlight('c', '2020-07-10', '2020-07-10T10:00:00.000Z'),
    ];
    const next = insertFlightSorted(list, sortableFlight('new', '2020-07-10', '2026-07-12T11:00:00.000Z'));
    // Same day as 'c' — must sit adjacent to it so the grouping yields ONE
    // 2020-07-10 header (the reviewer's live repro produced a duplicate).
    const dates = groupFlightsByDay(next).map((group) => group.flightDate);
    expect(dates).toEqual(['2026-07-12', '2021-03-09', '2020-07-10']);
    // Newer createdAt wins within the day (server order: createdAt desc).
    expect(next.map((f) => f.id)).toEqual(['a', 'b', 'new', 'c']);
  });

  it('day-header dates stay strictly descending after any insert', () => {
    const list = [
      sortableFlight('a', '2026-07-12', '2026-07-12T10:00:00.000Z'),
      sortableFlight('b', '2026-07-10', '2026-07-10T10:00:00.000Z'),
    ];
    const next = insertFlightSorted(list, sortableFlight('mid', '2026-07-11', '2026-07-11T10:00:00.000Z'));
    expect(next.map((f) => f.flightDate)).toEqual(['2026-07-12', '2026-07-11', '2026-07-10']);
  });

  it('replaces a stale entry with the same id instead of duplicating it', () => {
    const list = [sortableFlight('a', '2026-07-12', '2026-07-12T10:00:00.000Z')];
    const next = insertFlightSorted(list, sortableFlight('a', '2026-07-12', '2026-07-12T10:00:00.000Z'));
    expect(next).toHaveLength(1);
  });
});

describe('appendFlightsPage (review 12.4, 124-F2)', () => {
  it('drops boundary rows re-served after an optimistic insert shifted the offsets', () => {
    const page1 = [
      sortableFlight('new', '2026-07-12', '2026-07-12T11:00:00.000Z'),
      sortableFlight('a', '2026-07-12', '2026-07-12T10:00:00.000Z'),
      sortableFlight('b', '2026-07-11', '2026-07-11T10:00:00.000Z'),
    ];
    const page2 = [
      sortableFlight('b', '2026-07-11', '2026-07-11T10:00:00.000Z'), // boundary row served again
      sortableFlight('c', '2026-07-10', '2026-07-10T10:00:00.000Z'),
    ];
    const next = appendFlightsPage(page1, page2);
    expect(next.map((f) => f.id)).toEqual(['new', 'a', 'b', 'c']);
  });

  it('plain append when there is no overlap', () => {
    const next = appendFlightsPage(
      [sortableFlight('a', '2026-07-12', '2026-07-12T10:00:00.000Z')],
      [sortableFlight('b', '2026-07-11', '2026-07-11T10:00:00.000Z')],
    );
    expect(next.map((f) => f.id)).toEqual(['a', 'b']);
  });
});
