/**
 * Period presets for the financial report (story 3.5, Task 2, AC 1) —
 * "mese/trimestre/anno correnti" as `YYYY-MM-DD` bounds. UI-only (Dev
 * Notes): `cash.service.ts#getCashReport` never runs calendar logic, it
 * always receives explicit `from`/`to` computed here (server default on
 * first page load, or client button clicks thereafter).
 *
 * Computed in `Europe/Rome`, NOT the server/browser's local timezone —
 * `Intl.DateTimeFormat`'s `timeZone` option converts a UTC instant to the
 * correct Rome-local calendar date regardless of where the code runs
 * (Node's server clock is UTC in this environment). This matters exactly
 * at the month/day boundary: e.g. at 23:30 UTC in winter (CET = UTC+1) it
 * is already past midnight of the NEXT day in Rome, so `now.getUTCDate()`
 * alone would pick the wrong "today".
 */

import { APP_TIMEZONE } from './time';

export type DateRange = { from: string; to: string };

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Rome-local (year, 1-based month, day) for a UTC instant. */
function romeDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(lookup['year']), month: Number(lookup['month']), day: Number(lookup['day']) };
}

/** Last day-of-month (1-based `month`) — day 0 of the following month, UTC-calendar arithmetic (no timezone involved here, it's plain calendar math). */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The current calendar month in Europe/Rome, as inclusive `YYYY-MM-DD` bounds. */
export function currentMonthRange(now: Date = new Date()): DateRange {
  const { year, month } = romeDateParts(now);
  const from = `${year}-${pad2(month)}-01`;
  const to = `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`;
  return { from, to };
}

/** The PREVIOUS calendar month in Europe/Rome, as inclusive `YYYY-MM-DD` bounds (story 12.9's billing KPI: "Ricavi del mese" delta vs mese precedente). */
export function previousMonthRange(now: Date = new Date()): DateRange {
  const { year, month } = romeDateParts(now);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const from = `${prevYear}-${pad2(prevMonth)}-01`;
  const to = `${prevYear}-${pad2(prevMonth)}-${pad2(lastDayOfMonth(prevYear, prevMonth))}`;
  return { from, to };
}

/** The current calendar quarter (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec) in Europe/Rome, as inclusive `YYYY-MM-DD` bounds. */
export function currentQuarterRange(now: Date = new Date()): DateRange {
  const { year, month } = romeDateParts(now);
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const endMonth = startMonth + 2;
  const from = `${year}-${pad2(startMonth)}-01`;
  const to = `${year}-${pad2(endMonth)}-${pad2(lastDayOfMonth(year, endMonth))}`;
  return { from, to };
}

/** The current calendar year in Europe/Rome, as inclusive `YYYY-MM-DD` bounds. */
export function currentYearRange(now: Date = new Date()): DateRange {
  const { year } = romeDateParts(now);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
