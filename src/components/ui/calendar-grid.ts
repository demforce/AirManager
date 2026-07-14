/**
 * Pure Monday-first 6x7 calendar grid math (story 12.1, AC 3) — extracted
 * from `docs/design-reference/airops/src/Schedule.jsx#CalendarPopover` so
 * the date arithmetic is unit-testable without rendering the component.
 * Always returns exactly 42 dates (6 weeks), starting on the Monday of the
 * week that contains the 1st of `cursor`'s month.
 */
export function buildCalendarGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const weekday = first.getDay(); // 0 (Sun) .. 6 (Sat)
  const offset = weekday === 0 ? -6 : 1 - weekday; // days back to the Monday on/before `first`
  const start = new Date(first);
  start.setDate(first.getDate() + offset);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date;
  });
}
