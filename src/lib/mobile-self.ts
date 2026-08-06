/**
 * Pure derivations of the two self-service phone faces (story 15.9, AD-5):
 * the estratto conto (`account-section.tsx`, shared by "Le mie transazioni"
 * and the scheda persona) and "I miei compensi".
 *
 * They live here, not inside the components, for the same reason
 * `mobile-billing.ts`/`mobile-registries.ts` do: the composition rules they
 * encode (an ABSENT segment is omitted, never filled with the "—"
 * placeholder — review 15.5 F1) end up inside a dialog's accessible name, so
 * they are unit-testable in isolation and cannot drift per call site.
 *
 * Pure by construction: the only import is `joinSegments`, itself pure, so no
 * test that reaches this file drags `@/lib/env` in (CLAUDE.md's eager-env
 * rule).
 */
import { joinSegments } from './mobile-sub-line';

/**
 * The movement card's mono sub-line (template 325-334: the left block's
 * second line). `description` is genuinely `null` on a real row — the desktop
 * cell prints `table.noValue` ("—") there, which is exactly the placeholder
 * this line must NOT inherit; `actorEmail` only exists on the admin face
 * (`showActor`), so the self face simply never passes it.
 */
export function accountMovementSubLine(parts: { dateLabel: string; description?: string | null; actorEmail?: string | null }): string {
  return joinSegments([parts.dateLabel, parts.description, parts.actorEmail]);
}

/**
 * The movement sheet's mono over-line. `BottomSheet` builds the dialog's
 * accessible name as `` `${sub} — ${title}` `` (`bottom-sheet.tsx:61`), so a
 * missing segment here would be audible as a double separator: `dateLabel`
 * always exists on an `AccountMovementRow`, `actorEmail` is optional and is
 * dropped when absent rather than rendered as "—".
 */
export function accountMovementSheetSub(parts: { dateLabel: string; actorEmail?: string | null }): string {
  return joinSegments([parts.dateLabel, parts.actorEmail]);
}

/**
 * The text of the two linked badges (rettifica / storno), extracted UNCHANGED
 * from `account-section.tsx`'s own `adjustmentBadgeText`/`reversalBadgeText`:
 * the date of the original movement when that original is on the SAME page of
 * the statement (`rowById`), the `linked` fallback otherwise. The
 * page-dependence is the behaviour, not a bug — the statement pages at 20 and
 * the original can legitimately be on another page.
 */
export function linkedBadgeText(labels: { ofDate: string; linked: string }, originalDateLabel: string | null): string {
  return originalDateLabel === null ? labels.linked : labels.ofDate.replace('{date}', originalDateLabel);
}

/**
 * The payout card's mono sub-line ("I miei compensi"): when the payout was
 * registered and how it was paid. Both segments always exist on an
 * `OwnPayoutHistoryItem` — `joinSegments` is used anyway so the rule stays the
 * same one every other card of the epic follows.
 */
export function payoutCardSubLine(parts: { registeredLabel: string; methodLabel: string }): string {
  return joinSegments([parts.registeredLabel, parts.methodLabel]);
}
