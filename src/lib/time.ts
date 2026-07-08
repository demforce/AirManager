/**
 * Time helpers (architecture spine AD-2): every duration in the domain is an
 * integer number of minutes. Wire-format timestamps are ISO 8601 UTC
 * (AD-8); this module only deals with duration conversion and the
 * Europe/Rome presentation used by the UI.
 */

/** Timezone used to present timestamps to users (aviosuperficie is in Italy). */
export const APP_TIMEZONE = 'Europe/Rome';

const DURATION_PATTERN = /^(\d+):([0-5]\d)$/;

/**
 * Formats an integer number of minutes as `H:MM`, e.g. `formatMinutes(90)` -> `"1:30"`.
 */
export function formatMinutes(totalMinutes: number): string {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0) {
    throw new RangeError(
      `formatMinutes: totalMinutes must be a non-negative integer, received ${totalMinutes}`,
    );
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Parses an `H:MM` (or `HH:MM`) duration string into an integer number of minutes.
 */
export function parseMinutes(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());

  if (!match) {
    throw new RangeError(`parseMinutes: invalid duration "${value}"`);
  }

  const [, hoursStr, minutesStr] = match;

  return Number(hoursStr) * 60 + Number(minutesStr);
}

/**
 * Formats a UTC `Date` as an `HH:MM` time-of-day in the Europe/Rome timezone,
 * for display purposes only (wire format stays ISO 8601 UTC per AD-8).
 */
export function formatTimeOfDay(date: Date, locale: 'it' | 'en' = 'it'): string {
  return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-IE', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Formats a UTC `Date` as a full `DD/MM/YYYY HH:MM` timestamp in the
 * Europe/Rome timezone (story 2.5, AC 2: "quando" column of the hour-meter
 * adjustment history) — display only, wire format stays ISO 8601 UTC.
 */
export function formatDateTime(date: Date, locale: 'it' | 'en' = 'it'): string {
  return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-IE', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Formats a `YYYY-MM-DD` date-only string (the wire shape for `@db.Date`
 * columns, e.g. `HourPackage.expiresAt`) as `DD/MM/YYYY`, locale-aware —
 * story TD-1, AC 7: `PackagesPanel` was showing the raw ISO string. Parses
 * the string as UTC-midnight (same `date-only.ts` discipline as the server
 * side, review 3.5 F1's lesson) so no client timezone can shift the
 * calendar day, then formats with `timeZone: 'UTC'` for the same reason —
 * the numeric `2-digit`/`numeric` shape mirrors `formatDateTime`'s date
 * portion, just without the time-of-day. Deviation note: no existing
 * client-side date-only display helper was found to reuse (`ExpiriesPanel`/
 * `AccountStatementTable` also render their date-only strings raw today) —
 * this is a new, narrowly-scoped helper, not a retrofit of those other
 * surfaces (out of this AC's list).
 */
export function formatDateOnly(dateOnly: string, locale: 'it' | 'en' = 'it'): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-IE', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
