import { describe, expect, it } from 'vitest';
import { buildAgendaEntries, nowMarkerIndex } from './mobile-agenda';

/**
 * Story 15.4, AD-5: the agenda's ORDER and the ORA marker's POSITION are the
 * two things an e2e can only probe on one configuration at a time (it always
 * runs on a day with the fixtures it just created). The boundary cases — an
 * empty day, a day already over, a day still entirely ahead, two adjacent
 * slots — live here.
 */
const NOW = new Date('2026-07-30T10:00:00.000Z');

const morning = { id: 'b-morning', startsAt: new Date('2026-07-30T08:00:00.000Z'), endsAt: new Date('2026-07-30T09:00:00.000Z') };
const straddling = { id: 'b-straddling', startsAt: new Date('2026-07-30T09:30:00.000Z'), endsAt: new Date('2026-07-30T11:00:00.000Z') };
const afternoon = { id: 'b-afternoon', startsAt: new Date('2026-07-30T14:00:00.000Z'), endsAt: new Date('2026-07-30T15:00:00.000Z') };
const evening = { id: 'b-evening', startsAt: new Date('2026-07-30T17:00:00.000Z'), endsAt: new Date('2026-07-30T18:00:00.000Z') };

const flying = { id: 'ac-ok', status: 'OPERATIONAL' } as const;
const grounded = { id: 'ac-aog', status: 'OUT_OF_SERVICE' } as const;

function ids(entries: ReturnType<typeof buildAgendaEntries>): string[] {
  return entries.map((entry) => (entry.kind === 'aog' ? entry.aircraft.id : entry.booking.id));
}

/** What the component actually hands `nowMarkerIndex`: EVERY row on screen, AOG rows included (they are never "after now"). */
function markerInput(entries: ReturnType<typeof buildAgendaEntries>): Array<{ startsAfterNow: boolean }> {
  return entries.map((entry) => ({ startsAfterNow: entry.kind === 'booking' && entry.startsAfterNow }));
}

describe('buildAgendaEntries', () => {
  it('sorts the movements by startsAt, whatever order they arrive in', () => {
    const entries = buildAgendaEntries([afternoon, morning, straddling], [flying], NOW);
    expect(ids(entries)).toEqual(['b-morning', 'b-straddling', 'b-afternoon']);
  });

  it('puts every out-of-service aircraft FIRST, before the movements (ratifica R-15.4-h)', () => {
    const entries = buildAgendaEntries([morning, afternoon], [flying, grounded], NOW);
    expect(ids(entries)).toEqual(['ac-aog', 'b-morning', 'b-afternoon']);
  });

  it('is empty on an empty day with a fully serviceable fleet', () => {
    expect(buildAgendaEntries([], [flying], NOW)).toEqual([]);
  });

  it('holds a single movement on a one-booking day', () => {
    const entries = buildAgendaEntries([afternoon], [flying], NOW);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'booking', phase: 'scheduled', startsAfterNow: true });
  });

  it('derives the phase of each movement from `dayPhaseOf`', () => {
    const entries = buildAgendaEntries([morning, straddling, afternoon], [flying], NOW);
    expect(entries.map((entry) => (entry.kind === 'booking' ? entry.phase : 'aog'))).toEqual(['completed', 'inProgress', 'scheduled']);
  });

  it('does not mark a slot starting EXACTLY now as future (it is already in progress)', () => {
    const startingNow = { id: 'b-now', startsAt: NOW, endsAt: new Date('2026-07-30T11:00:00.000Z') };
    const entries = buildAgendaEntries([startingNow], [flying], NOW);
    expect(entries[0]).toMatchObject({ phase: 'inProgress', startsAfterNow: false });
  });

  it('keeps two adjacent slots (endsAt === startsAt) apart: the first is completed, the second is in progress', () => {
    const first = { id: 'b-first', startsAt: new Date('2026-07-30T09:00:00.000Z'), endsAt: NOW };
    const second = { id: 'b-second', startsAt: NOW, endsAt: new Date('2026-07-30T11:00:00.000Z') };
    const entries = buildAgendaEntries([second, first], [flying], NOW);
    expect(ids(entries)).toEqual(['b-first', 'b-second']);
    expect(entries.map((entry) => (entry.kind === 'booking' ? entry.phase : 'aog'))).toEqual(['completed', 'inProgress']);
  });

  it('breaks a startsAt tie on the id, so the order is total (never renderer-dependent)', () => {
    const alpha = { id: 'a', startsAt: afternoon.startsAt, endsAt: afternoon.endsAt };
    const beta = { id: 'b', startsAt: afternoon.startsAt, endsAt: afternoon.endsAt };
    expect(ids(buildAgendaEntries([beta, alpha], [flying], NOW))).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = [afternoon, morning];
    buildAgendaEntries(input, [flying], NOW);
    expect(input.map((booking) => booking.id)).toEqual(['b-afternoon', 'b-morning']);
  });
});

describe('nowMarkerIndex', () => {
  it('points at the first future movement in the middle of a normal day', () => {
    expect(nowMarkerIndex(markerInput(buildAgendaEntries([morning, straddling, afternoon], [flying], NOW)))).toBe(2);
  });

  it('is 0 (marker in the head) when the whole day is still ahead', () => {
    expect(nowMarkerIndex(markerInput(buildAgendaEntries([afternoon, evening], [flying], NOW)))).toBe(0);
  });

  it('is -1 (NO marker at all) when the day is over', () => {
    expect(nowMarkerIndex(markerInput(buildAgendaEntries([morning], [flying], NOW)))).toBe(-1);
  });

  it('is -1 on an empty agenda', () => {
    expect(nowMarkerIndex([])).toBe(-1);
  });

  it('never lands on an AOG row: with only AOG rows there is no marker', () => {
    expect(nowMarkerIndex(markerInput(buildAgendaEntries([], [grounded], NOW)))).toBe(-1);
  });

  it('counts the AOG rows in the head: the marker index shifts past them', () => {
    expect(nowMarkerIndex(markerInput(buildAgendaEntries([afternoon], [grounded], NOW)))).toBe(1);
  });

  it('follows the aircraft filter: filtering the past movement away moves the marker to the head', () => {
    const rows = buildAgendaEntries([morning, afternoon], [flying], NOW);
    const filtered = rows.filter((entry) => entry.kind === 'aog' || entry.booking.id !== 'b-morning');
    expect(nowMarkerIndex(markerInput(rows))).toBe(1);
    expect(nowMarkerIndex(markerInput(filtered))).toBe(0);
  });
});
