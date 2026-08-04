/**
 * The one composer of a mobile sub-line / sheet over-line (story 15.7).
 *
 * It is review 15.5 F1 turned into code: a placeholder ("—") pushed into a
 * composed string reads as a second separator, and an ABSENT segment leaves
 * two separators adjacent — and when the composed string is a sheet's `sub`,
 * `BottomSheet` puts it straight into the dialog's accessible name
 * (`${sub} — ${title}`, `bottom-sheet.tsx:61`), where both defects are
 * audible. Both are defects of the COMPOSITION, so they are killed once,
 * here, instead of at each call site.
 *
 * Story 15.6 wrote this function privately inside `mobile-logbook.ts`; story
 * 15.7 gave it two more consumers (`mobile-expiries.ts`,
 * `mobile-movements.ts`), so it moved here rather than being copied twice.
 * No behaviour change: same body, same separator.
 *
 * Pure by construction: no import of a service, hence no `@/lib/env` dragged
 * into any test that reaches it (CLAUDE.md's eager-env rule).
 */
export function joinSegments(segments: readonly (string | null | undefined)[]): string {
  return segments.map((segment) => (segment ?? '').trim()).filter((segment) => segment !== '').join(' · ');
}
