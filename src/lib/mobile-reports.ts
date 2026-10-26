/**
 * Pure derivations of the Statistiche phone face (story 15.8b, AD-5).
 *
 * Pure by construction: no service import, hence no `@/lib/env` dragged into
 * any test that reaches this file (CLAUDE.md's eager-env rule).
 */

/**
 * How many rows of a ranked list a phone shows before the "Mostra tutte"
 * affordance (R-15.8b-b, pattern 13.4).
 *
 * MEASURED, not picked: at 375x812 the sticky top bar takes 56px and the tab
 * bar 92px (story 15.1), leaving ~664px of content; a ranked row on a phone
 * measures ~44px plus the 12px `.util-rows` gap, and the card's own head plus
 * the cap foot cost ~110px. Eight rows is therefore the largest count whose
 * capped card still fits one screenful (110 + 8*44 + 7*12 = 546px) — the point
 * of the cap being that a card stops being 9.356px tall, i.e. 11 screenfuls of
 * scroll for ONE card on a 145-aircraft fleet.
 */
export const RANKED_MOBILE_LIMIT = 8;

export type RankedCap = {
  /** Rows the phone shows while collapsed. */
  visibleCount: number;
  /** Rows the phone hides while collapsed — 0 when there is nothing to hide. */
  hiddenCount: number;
  /** `false` when the list fits: no cap row is rendered at all. */
  capped: boolean;
};

/**
 * The cap of a ranked list, as a function of its length alone.
 *
 * Boundary cases the callers depend on: a list SHORTER than or exactly as long
 * as the limit is not capped (`hiddenCount` 0, no foot row — a "Mostra tutte"
 * that reveals nothing is the kind of lie R4 forbids), and a non-positive limit
 * caps nothing either (there is no state in which showing zero rows is better
 * than showing the list).
 */
export function rankedCap(total: number, limit: number = RANKED_MOBILE_LIMIT): RankedCap {
  if (limit <= 0 || total <= limit) return { visibleCount: total, hiddenCount: 0, capped: false };
  return { visibleCount: limit, hiddenCount: total - limit, capped: true };
}

/**
 * WHICH rows a capped list keeps on screen: the `limit` best ones BY THE
 * METRIC, given the metric values in the list's own render order.
 *
 * AC 3 asks for "the first N BY THE SELECTED METRIC", and a cap that hides by
 * POSITION only satisfies it when the list is already sorted by that metric.
 * `stats.fleet` is not: `stats.service.ts:230` returns it in `registration asc`
 * (`listAircraft`'s own order), so hiding rows 9..N showed eight aircraft
 * chosen alphabetically — on the review's DB, eight rows of `0:00` while the
 * aircraft with 2 hours sat behind "Mostra tutte" (review 15.8b MAJOR-1).
 *
 * The returned indexes are RANKS, not an order: the caller keeps rendering its
 * rows in its own order and only marks the ones outside this set as overflow,
 * so the DOM order — and therefore the desktop, where nothing is hidden — is
 * untouched, and the server is not involved at all (AD-10).
 *
 * Ties are broken by the row's own position, which for `fleet` means by
 * registration: with more rows at the same value than there are seats, the same
 * rows win every render instead of depending on `sort` stability.
 */
export function rankedTopIndexes(values: number[], limit: number = RANKED_MOBILE_LIMIT): Set<number> {
  const all = values.map((_, index) => index);
  if (limit <= 0 || values.length <= limit) return new Set(all);
  return new Set(all.sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0) || a - b).slice(0, limit));
}
