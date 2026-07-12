/**
 * Pure DD/MM/YYYY <-> ISO (`YYYY-MM-DD`) conversion for `DatePicker` (story
 * 12.5, AC 1) — no DOM dependency, so the parsing/formatting/validation
 * rules are unit-testable without mounting the component. The conversion
 * lives ONLY here and in the component that calls it: every consumer keeps
 * exchanging ISO on the wire (Dev Notes: "gli schemi Zod NON si toccano").
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Tolerant of missing leading zeros (`1/7/2026`) — the day/month/year parts
// are validated against the real calendar below, not just the shape.
const DISPLAY_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** `YYYY-MM-DD` -> `DD/MM/YYYY`. Returns `''` for `''` or a malformed ISO string (defensive; callers only ever pass a value this component itself produced). */
export function formatIsoDateToDisplay(iso: string): string {
  const match = ISO_DATE_RE.exec(iso);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/**
 * `DD/MM/YYYY` (or `D/M/YYYY`) -> `YYYY-MM-DD`. `''` maps to `''` (a
 * deliberately CLEARED field, not an error — required-ness is the caller's
 * schema's concern, same as an empty native `<input type="date">` today).
 * Anything else that doesn't parse to a real calendar date (wrong shape,
 * `31/02/2026`, month 13, ...) returns `null` — the component's own
 * per-field invalid state (AC 1).
 */
export function parseDisplayDateToIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return '';

  const match = DISPLAY_DATE_RE.exec(trimmed);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!isValidCalendarDate(year, month, day)) return null;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Rejects out-of-range components AND impossible combinations (`31/02`, `29/02` on a non-leap year) by round-tripping through UTC `Date` and checking every field survived unchanged. */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Composes the datetime variant's wire value (AC 1/2) — byte-identical to
 * what the `<input type="datetime-local" step={300}>` it replaces already
 * produced (no seconds, per Dev Notes: verified against `new-booking-form`/
 * `ppr-form`/`bookings-list` before this story touched them). `''` when
 * either half is missing — nothing to compose yet.
 */
export function composeDateTimeLocalValue(isoDate: string, time: string): string {
  if (isoDate === '' || time === '') return '';
  return `${isoDate}T${time}`;
}

/**
 * Inverse of `composeDateTimeLocalValue` — splits an existing
 * `YYYY-MM-DDTHH:MM` wire value (or `''`) into its date/time halves, used to
 * seed `DateTimeField`'s two sub-fields from a single incoming `value` prop
 * (e.g. `MoveBookingForm`'s `defaultValues`, still built by the pre-existing
 * `toDatetimeLocalValue`).
 */
export function splitDateTimeLocalValue(value: string): { date: string; time: string } {
  const [date, time] = value.split('T');
  return { date: date ?? '', time: time ?? '' };
}
