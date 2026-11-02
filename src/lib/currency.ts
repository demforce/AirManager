import { addDaysDateOnly } from './zoned-time';

/**
 * Currency (story 19.7a, R-19-i, CR §4.5) — DERIVED, never stored: a pilot or
 * student is current with at least X flights on board (as pilot/student or as
 * instructor) in the last Y days. X and Y are AppSettings
 * (`app-settings.service.ts#getCurrencySettings`, keys `currency.minFlights` /
 * `currency.windowDays`).
 *
 * This module is PURE and imports nothing heavy (no `@/lib/env`, no service):
 * the Impostazioni mirror of story 19.8 reads the defaults and limits from
 * here on the client.
 */
export type CurrencySettings = { minFlights: number; windowDays: number };

export const CURRENCY_DEFAULTS: CurrencySettings = { minFlights: 1, windowDays: 90 };

/** Inclusive bounds of the two settings — the Zod schema (`schemas/settings.ts#currencySettingsSchema`) and the getter's fallback both read them from here. */
export const CURRENCY_LIMITS = {
  minFlights: { min: 1, max: 99 },
  windowDays: { min: 1, max: 3650 },
} as const;

export type CurrencyResult = {
  current: boolean;
  /** Last day the person is still current (`YYYY-MM-DD`), `null` with fewer than X flights ever. */
  expiresAt: string | null;
  lastFlightDate: string | null;
  flightsInWindow: number;
};

/**
 * The REFERENCE implementation of the currency window (story 19.7a, D-6):
 * at a date D the flights with `flightDate` in [D − Y, D] count, each one
 * singly (two flights on the same day count 2); flights after D never count.
 * `expiresAt` = date of the X-th most recent flight ≤ D, plus Y days — the
 * last valid day, i.e. the day that flight leaves the window. Hence
 * `current ⇔ expiresAt ≠ null ∧ D ≤ expiresAt ⇔ flightsInWindow ≥ X`.
 *
 * Story 19.7b writes a SQL twin of this for the Scadenze registry and checks
 * it against this function on the same fixture: change one, change both.
 */
export function computeCurrency(flightDates: string[], atDate: string, settings: CurrencySettings): CurrencyResult {
  const pastDescending = flightDates.filter((date) => date <= atDate).sort((left, right) => (left < right ? 1 : left > right ? -1 : 0));
  const windowStart = addDaysDateOnly(atDate, -settings.windowDays);
  const flightsInWindow = pastDescending.filter((date) => date >= windowStart).length;
  const xthMostRecent = pastDescending[settings.minFlights - 1];
  const expiresAt = xthMostRecent === undefined ? null : addDaysDateOnly(xthMostRecent, settings.windowDays);

  return {
    current: expiresAt !== null && atDate <= expiresAt,
    expiresAt,
    lastFlightDate: pastDescending[0] ?? null,
    flightsInWindow,
  };
}
