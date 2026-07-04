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
