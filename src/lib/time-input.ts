/**
 * Keyboard-first shorthand parser for the flight dialog's takeoff/landing
 * time fields (story 12.3, AC 3) — a PURE function, no DOM/React
 * dependency, so it can normalize on `change`/`blur` from plain component
 * state. Deliberately separate from `time.ts`'s `parseMinutes` (a DURATION
 * parser, `H:MM`): this one parses a CLOCK reading and accepts the
 * shorthand a pilot actually types (`1430`, `930`) alongside the canonical
 * `HH:MM`/`H:MM` form. It has no bearing on the wire format — the composed
 * `<input type="time">` value it feeds still goes through
 * `composeFlightTimes`/`toISOString()` unchanged (Dev Notes: NOT touched by
 * this story).
 */

/**
 * Normalizes a typed time shorthand to `HH:MM`, or `null` if it cannot be
 * parsed as a valid 24h clock reading.
 *
 * Accepted shapes:
 * - 3-4 bare digits, the last two being minutes (`'1430'` -> `'14:30'`,
 *   `'930'` -> `'09:30'`).
 * - `H:MM`/`HH:MM` (`'9:30'` -> `'09:30'`, `'14:30'` -> `'14:30'`, idempotent).
 *
 * Anything else (wrong digit count, out-of-range hours/minutes, non-numeric
 * input) returns `null` — the caller shows the existing per-field error.
 */
export function parseTimeShorthand(raw: string): string | null {
  const trimmed = raw.trim();

  const bareDigits = /^(\d{3,4})$/.exec(trimmed);
  if (bareDigits) {
    const digits = bareDigits[1];
    return normalizeClock(Number(digits.slice(0, -2)), Number(digits.slice(-2)));
  }

  const withColon = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (withColon) {
    return normalizeClock(Number(withColon[1]), Number(withColon[2]));
  }

  return null;
}

function normalizeClock(hours: number, minutes: number): string | null {
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
