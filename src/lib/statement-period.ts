import { z } from 'zod';
import { lastTwelveMonthsRange } from './period-presets';

export type ResolvedStatementPeriod = { from: string; to: string; explicit: boolean };

const isoDate = z.iso.date();

/**
 * The period of the estratto conto read from a page's URL (story 19.11,
 * AD-2) — shared by its two pages, the scheda persona and "Il mio conto".
 * `explicit` is true ONLY for a well-formed pair: both bounds present once,
 * valid `YYYY-MM-DD` dates (the API's own `z.iso.date()`), `from <= to`.
 * Anything else — absent, half, invalid, inverted, repeated (`?from=a&from=b`
 * arrives as an array) — is the default 12 months (`lastTwelveMonthsRange`,
 * Rome's today): a hand-written URL never produces an error page, it produces
 * the default period, and the form shows the bounds actually applied.
 */
export function resolveStatementPeriod(
  searchParams: { from?: string | string[]; to?: string | string[] },
  now: Date = new Date(),
): ResolvedStatementPeriod {
  const { from, to } = searchParams;
  if (typeof from === 'string' && typeof to === 'string' && isoDate.safeParse(from).success && isoDate.safeParse(to).success && from <= to) {
    return { from, to, explicit: true };
  }
  return { ...lastTwelveMonthsRange(now), explicit: false };
}
