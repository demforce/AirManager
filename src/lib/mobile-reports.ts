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
