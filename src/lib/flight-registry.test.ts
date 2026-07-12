import { describe, expect, it } from 'vitest';
import { groupFlightsByDay, hasActiveFlightFilter, type FlightRegistryFilterState } from './flight-registry';
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
