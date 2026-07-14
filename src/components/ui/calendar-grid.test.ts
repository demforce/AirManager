import { describe, expect, it } from 'vitest';
import { buildCalendarGrid } from './calendar-grid';

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

describe('buildCalendarGrid', () => {
  it('always returns exactly 42 (6x7) consecutive days', () => {
    const grid = buildCalendarGrid(new Date(2026, 6, 15)); // July 2026
    expect(grid).toHaveLength(42);
    for (let i = 1; i < grid.length; i++) {
      const prev = grid[i - 1]!;
      const next = new Date(prev);
      next.setDate(prev.getDate() + 1);
      expect(sameDay(grid[i]!, next)).toBe(true);
    }
  });

  it('always starts on a Monday', () => {
    // Exercise every weekday-of-1st case across a full year.
    for (let month = 0; month < 12; month++) {
      const grid = buildCalendarGrid(new Date(2026, month, 1));
      expect(grid[0]!.getDay()).toBe(1);
    }
  });

  it('when the 1st is already a Monday, the grid starts on the 1st itself', () => {
    // 2026-06-01 is a Monday.
    const grid = buildCalendarGrid(new Date(2026, 5, 10));
    expect(sameDay(grid[0]!, new Date(2026, 5, 1))).toBe(true);
  });

  it('when the 1st is a Sunday, the grid starts 6 days earlier (previous Monday)', () => {
    // 2026-11-01 is a Sunday.
    const grid = buildCalendarGrid(new Date(2026, 10, 20));
    expect(sameDay(grid[0]!, new Date(2026, 9, 26))).toBe(true);
    expect(sameDay(grid[6]!, new Date(2026, 10, 1))).toBe(true);
  });

  it('when the 1st is a mid-week day, the grid starts on the Monday of that week', () => {
    // 2026-07-01 is a Wednesday.
    const grid = buildCalendarGrid(new Date(2026, 6, 1));
    expect(sameDay(grid[0]!, new Date(2026, 5, 29))).toBe(true);
    expect(grid[0]!.getDay()).toBe(1);
    expect(sameDay(grid[2]!, new Date(2026, 6, 1))).toBe(true);
  });

  it('spans a year boundary correctly (December -> January)', () => {
    // 2027-01-01 is a Friday.
    const grid = buildCalendarGrid(new Date(2027, 0, 1));
    expect(sameDay(grid[0]!, new Date(2026, 11, 28))).toBe(true);
    expect(grid[grid.length - 1]!.getFullYear()).toBe(2027);
  });
});
