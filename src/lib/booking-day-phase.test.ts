import { describe, expect, it } from 'vitest';
import { dayPhaseOf, filterInProgress } from './booking-day-phase';

const START = new Date('2026-07-30T09:00:00.000Z');
const END = new Date('2026-07-30T10:00:00.000Z');

/**
 * Story 15.3, AD-4: the "In corso ora" card is derived from this boundary, and
 * an e2e can only ever probe ONE side of it (a fixture straddling `now`) — the
 * four confini live here.
 */
describe('dayPhaseOf', () => {
  it('is `scheduled` strictly before the start', () => {
    expect(dayPhaseOf(START, END, new Date('2026-07-30T08:59:59.999Z'))).toBe('scheduled');
  });

  it('is `inProgress` EXACTLY at startsAt (the slot has begun)', () => {
    expect(dayPhaseOf(START, END, START)).toBe('inProgress');
  });

  it('is `inProgress` inside the slot', () => {
    expect(dayPhaseOf(START, END, new Date('2026-07-30T09:30:00.000Z'))).toBe('inProgress');
  });

  it('is `completed` EXACTLY at endsAt (so two adjacent slots never both read "in corso")', () => {
    expect(dayPhaseOf(START, END, END)).toBe('completed');
  });

  it('is `completed` after the end', () => {
    expect(dayPhaseOf(START, END, new Date('2026-07-30T10:00:00.001Z'))).toBe('completed');
  });
});

describe('filterInProgress', () => {
  const bookings = [
    { id: 'past', startsAt: new Date('2026-07-30T07:00:00.000Z'), endsAt: new Date('2026-07-30T08:00:00.000Z') },
    { id: 'now-a', startsAt: START, endsAt: END },
    { id: 'now-b', startsAt: new Date('2026-07-30T09:15:00.000Z'), endsAt: new Date('2026-07-30T11:00:00.000Z') },
    { id: 'future', startsAt: new Date('2026-07-30T14:00:00.000Z'), endsAt: new Date('2026-07-30T15:00:00.000Z') },
  ];

  it('keeps only the bookings covering `now`, in input order', () => {
    const result = filterInProgress(bookings, new Date('2026-07-30T09:30:00.000Z'));
    expect(result.map((booking) => booking.id)).toEqual(['now-a', 'now-b']);
  });

  it('is empty when nothing covers `now` (a fully future day)', () => {
    expect(filterInProgress(bookings, new Date('2026-07-30T06:00:00.000Z'))).toEqual([]);
  });

  it('does not include a booking that ends exactly now', () => {
    expect(filterInProgress(bookings, END).map((booking) => booking.id)).toEqual(['now-b']);
  });
});
