import { currentMonthRange } from '@/lib/period-presets';
import type { StatsQuery } from '@/lib/schemas/stats';
import { ValidationError } from './errors';

export type StatsDateRange = { from: string; to: string };

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Last day-of-month (1-based `month`), UTC-calendar arithmetic (day 0 of the next month) — same trick as `period-presets.ts`'s own private helper, duplicated here because that module only builds ranges anchored on "now", never an arbitrary `ref` month. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `[from, to]` inclusive bounds of the calendar month `yyyymm` (`YYYY-MM`) — `ref` is already a validated Rome calendar month, so this is pure calendar arithmetic, no timezone conversion needed. */
export function monthRangeFor(yyyymm: string): StatsDateRange {
  const [year, month] = yyyymm.split('-').map(Number) as [number, number];
  return { from: `${yyyymm}-01`, to: `${yyyymm}-${pad2(lastDayOfMonth(year, month))}` };
}

/** `[from, to]` inclusive bounds of the calendar YEAR containing `yyyymm`. */
function yearRangeFor(yyyymm: string): StatsDateRange {
  const year = yyyymm.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** The current Rome calendar month as `YYYY-MM`. */
function currentMonthRef(now: Date): string {
  return currentMonthRange(now).from.slice(0, 7);
}

export function resolveStatsPeriod(query: StatsQuery, now: Date) {
  const nowRef = currentMonthRef(now);
  const ref = query.ref ?? nowRef;
  if (ref > nowRef) throw new ValidationError('ref must not be in the future.', undefined, 'STATS_REF_IN_FUTURE');
  const isCurrentPeriod = query.period === 'month' ? ref === nowRef : ref.slice(0, 4) === nowRef.slice(0, 4);
  const range = query.period === 'month' ? monthRangeFor(ref) : yearRangeFor(ref);
  return { ref, isCurrentPeriod, range };
}
