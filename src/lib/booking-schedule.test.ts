import { describe, expect, it } from 'vitest';
import { clampToWindowPercent, projectDayBlocks, projectWeekChips, resolveWindowMinutes } from './booking-schedule';
import type { BookingListItem } from '@/server/services/bookings.service';

/**
 * Unit coverage for the data-prep extracted from `bookings/page.tsx` (story
 * 12.3 origin, story 12.12 AC 1 extraction) — was previously only exercised
 * indirectly via `bookings.spec.ts` e2e assertions on the rendered timeline;
 * moving it to a shared `lib` module earns it direct unit tests.
 */

function booking(overrides: Partial<BookingListItem> & Pick<BookingListItem, 'id' | 'startsAt' | 'endsAt'>): BookingListItem {
  return {
    aircraftId: 'ac-1',
    aircraftRegistration: 'I-TEST',
    personId: 'p-1',
    personName: 'Rossi Mario',
    instructorProfileId: null,
    instructorName: null,
    notes: null,
    status: 'APPROVED',
    cancelledAt: null,
    forcedAt: null,
    denyReason: null,
    decidedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('resolveWindowMinutes (story 12.11 AC 4)', () => {
  it('falls back to the default 06:00-22:00 window when both settings are absent', () => {
    expect(resolveWindowMinutes(null, null)).toEqual({ start: 6 * 60, end: 22 * 60 });
  });

  it('falls back to the default when the configured window is inverted (end <= start)', () => {
    expect(resolveWindowMinutes('10:00', '10:00')).toEqual({ start: 6 * 60, end: 22 * 60 });
    expect(resolveWindowMinutes('12:00', '08:00')).toEqual({ start: 6 * 60, end: 22 * 60 });
  });

  it('uses the configured window when both bounds are present and valid', () => {
    expect(resolveWindowMinutes('07:30', '20:00')).toEqual({ start: 7 * 60 + 30, end: 20 * 60 });
  });
});

describe('clampToWindowPercent', () => {
  it('clamps below 0 to 0% and above the span to 100%', () => {
    expect(clampToWindowPercent(-30, 960)).toBe(0);
    expect(clampToWindowPercent(2000, 960)).toBe(100);
  });

  it('maps the midpoint to 50%', () => {
    expect(clampToWindowPercent(480, 960)).toBe(50);
  });
});

describe('projectDayBlocks (story 7.2 AC 1, 12.3 re-presentation)', () => {
  const windowStart = 6 * 60;
  const windowEnd = 22 * 60;

  it('a booking entirely within the window is positioned proportionally, never clamped', () => {
    const [block] = projectDayBlocks(
      [booking({ id: 'b1', startsAt: new Date('2026-07-15T08:00:00.000Z'), endsAt: new Date('2026-07-15T10:00:00.000Z') })],
      '2026-07-15',
      windowStart,
      windowEnd,
    );
    // 08:00 Rome (CEST, UTC+2) is 10:00 local -> (10:00-06:00)/(22:00-06:00) = 25%.
    expect(block!.top).toBeCloseTo(25, 5);
    expect(block!.clampedTop).toBe(false);
    expect(block!.clampedBottom).toBe(false);
    expect(block!.timeLabel).toBe('10:00–12:00');
  });

  it('a booking starting before the day (or before the window) is clamped to the top edge, still rendered', () => {
    const [block] = projectDayBlocks(
      [booking({ id: 'b2', startsAt: new Date('2026-07-14T20:00:00.000Z'), endsAt: new Date('2026-07-15T08:00:00.000Z') })],
      '2026-07-15',
      windowStart,
      windowEnd,
    );
    expect(block).toBeDefined();
    expect(block!.top).toBe(0);
    expect(block!.clampedTop).toBe(true);
  });

  it('a booking not overlapping the requested day at all is omitted', () => {
    const blocks = projectDayBlocks(
      [booking({ id: 'b3', startsAt: new Date('2026-07-10T08:00:00.000Z'), endsAt: new Date('2026-07-10T10:00:00.000Z') })],
      '2026-07-15',
      windowStart,
      windowEnd,
    );
    expect(blocks).toHaveLength(0);
  });

  it('a very short booking is inflated to the minimum visible height', () => {
    const [block] = projectDayBlocks(
      [booking({ id: 'b4', startsAt: new Date('2026-07-15T08:00:00.000Z'), endsAt: new Date('2026-07-15T08:05:00.000Z') })],
      '2026-07-15',
      windowStart,
      windowEnd,
    );
    expect(block!.height).toBeGreaterThanOrEqual(8);
  });
});

describe('projectWeekChips (story 7.2, per-day counts)', () => {
  it('a booking spanning two Rome calendar days produces one chip per overlapping day', () => {
    // 20:00 UTC on 07-15 is 22:00 CEST (still Rome 07-15); 04:00 UTC on
    // 07-16 is 06:00 CEST (Rome 07-16) — genuinely crosses the Rome midnight.
    const chips = projectWeekChips(
      [booking({ id: 'b5', startsAt: new Date('2026-07-15T20:00:00.000Z'), endsAt: new Date('2026-07-16T04:00:00.000Z') })],
      ['2026-07-15', '2026-07-16', '2026-07-17'],
    );
    expect(chips.map((chip) => chip.dateOnly)).toEqual(['2026-07-15', '2026-07-16']);
  });
});
