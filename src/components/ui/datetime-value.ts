/**
 * Pure `HH:MM`/`YYYY-MM-DDTHH:MM` string helpers for `datetime-input.tsx`'s
 * typable time field (story TD-7, ratifica 2: "campo digitabile, TUTTI i
 * minuti disponibili" — a plain validated TEXT field, not a native
 * `<input type="time">`, so no HTML5 `step` rounding ever applies).
 * Extracted from the component so the parse/format/validate logic is
 * unit-testable without rendering anything — same reasoning as
 * `calendar-grid.ts` for the day-grid math.
 */

/** Strict 24h `HH:MM`, both digits required (e.g. `09:30`, not `9:30`) — matches the placeholder/example the story itself uses. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeText(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/**
 * Normalizes a colon-less 3-4 digit value into `HH:MM` (story TD-7 review
 * F3: `inputMode="numeric"`'s mobile keypad has no `:` key, so a user typing
 * on one produces `930`/`0930` rather than `09:30`) — read right-to-left as
 * minutes with whatever remains as hours (`930` -> `09:30`, `0930` ->
 * `09:30`). Anything else (already has a `:`, wrong digit count, non-digit
 * characters) passes through UNCHANGED — this only widens what's ACCEPTED as
 * valid, it never rewrites a value the user typed with the separator
 * already in place (`9:30` stays `9:30`, still rejected by `isValidTimeText`
 * per its own single-digit-hour rule, unrelated to this normalization).
 */
export function normalizeTimeText(value: string): string {
  if (!/^\d{3,4}$/.test(value)) return value;
  const padded = value.padStart(4, '0');
  return `${padded.slice(0, 2)}:${padded.slice(2)}`;
}

/** Splits an `<input type="datetime-local">` value (`YYYY-MM-DDTHH:MM`) into its date/time parts — `null` for anything else (empty, no `T`, malformed), same permissiveness as `date-input.tsx`'s own `dateOnlyToLocalDate` (trusts the browser-produced shape, doesn't re-validate calendar/time semantics). */
export function parseDatetimeLocal(value: string): { dateOnly: string; time: string } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  return { dateOnly: match[1]!, time: match[2]! };
}

/** Composes a `YYYY-MM-DDTHH:MM` value the way `<input type="datetime-local">` expects — the inverse of `parseDatetimeLocal`. */
export function composeDatetimeLocal(dateOnly: string, time: string): string {
  return `${dateOnly}T${time}`;
}
