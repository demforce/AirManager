/**
 * Pure derivations of the two mobile Scadenze faces (story 15.7, AD-6) — the
 * registry card's sub-line and sheet over-line, plus the "Le mie scadenze"
 * card's sub-line. They live here, outside `scadenze-console.tsx`/
 * `my-expiries.tsx`, for the same reason `mobile-logbook.ts` does: they
 * encode edge cases invisible on a happy-path screenshot (a scadenza with no
 * note, a scadenza that expired N days AGO) and are cheaper to prove with a
 * unit test than with a fixture.
 *
 * The urgency TIER and the CATEGORY are deliberately absent: `tierOf` and
 * `categoryOf` already exist in `lib/expiry-status.ts` and are shared with
 * the desktop registry and the Panoramica widget — there must never be a
 * second implementation of those boundaries (AD-6).
 *
 * Pure by construction: no import of a service, hence no `@/lib/env` dragged
 * into the test (CLAUDE.md's eager-env rule).
 */
import { joinSegments } from './mobile-sub-line';

/**
 * The desktop "Giorni rimasti" cell's own wording (`scadenze-console.tsx:315`),
 * reused verbatim so the phone and the desktop never disagree about a
 * boundary: a negative count reads "N g fa", everything else "N g". Both
 * suffixes arrive already translated (`registry.daysAgoSuffix` /
 * `registry.daysSuffix`), because this module is not locale-bound.
 */
export function expiryDaysLabel(daysUntil: number, suffixes: { ago: string; left: string }): string {
  return daysUntil < 0 ? `${Math.abs(daysUntil)}${suffixes.ago}` : `${daysUntil}${suffixes.left}`;
}

/**
 * The registry card's mono sub-line — the template's own `{{x.what}} ·
 * {{x.date}}` (`AirOps Mobile` 273-283) plus the day count, which ratifica
 * R-15.7-b moved here when the right-hand pill became the app's own 5-tier
 * status `Badge`.
 */
export function expiryCardSubLine(parts: { typeName: string; dateLabel: string; daysLabel: string }): string {
  return joinSegments([parts.typeName, parts.dateLabel, parts.daysLabel]);
}

/**
 * The registry sheet's mono over-line: the two CLASSIFICATIONS of a scadenza
 * (category and certificate), with the person as the sheet's title. Goes
 * through `joinSegments` because it becomes half of the dialog's accessible
 * name (`${sub} — ${title}`, `bottom-sheet.tsx:61`).
 */
export function expirySheetSub(parts: { category: string; typeName: string }): string {
  return joinSegments([parts.category, parts.typeName]);
}

/**
 * "Le mie scadenze": the card's sub-line. `notes` is nullable
 * (`schemas/expiries.ts:52`) and is OMITTED when absent — never the desktop
 * table's "—" placeholder, which in a composed line reads as a second
 * separator (review 15.5 F1).
 */
export function myExpiryCardSubLine(parts: { dateLabel: string; notes: string | null }): string {
  return joinSegments([parts.dateLabel, parts.notes]);
}
