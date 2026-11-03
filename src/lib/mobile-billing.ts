/**
 * Pure derivations of the Contabilità phone face (story 15.8a, AD-6).
 *
 * They live here, not inside `billing-console.tsx`, for the same reason
 * `mobile-logbook.ts`/`mobile-movements.ts` do: the composition rules they
 * encode (an ABSENT segment is omitted, never filled with the "—"
 * placeholder — review 15.5 F1) are the ones that end up inside a dialog's
 * accessible name, so they are unit-testable in isolation and cannot drift
 * per call site.
 *
 * Pure by construction: the only import is `joinSegments`, itself pure, so
 * no test that reaches this file drags `@/lib/env` in (CLAUDE.md's eager-env
 * rule).
 */
import { joinSegments } from './mobile-sub-line';

/**
 * The card's mono sub-line (template 325-334: `pilota · MM-DD · metodo`).
 * `personName` is null on every CASH row, `methodLabel` is null on an
 * unattributed one — both are simply dropped, never rendered as "—".
 */
export function transactionCardSubLine(parts: { personName?: string | null; date: string; methodLabel?: string | null }): string {
  return joinSegments([parts.personName, parts.date, parts.methodLabel]);
}

/**
 * The detail sheet's mono over-line. `BottomSheet` puts it into the dialog's
 * accessible name as `` `${sub} — ${title}` `` (`bottom-sheet.tsx:61`), so an
 * empty segment here would be audible as a double separator: `date` always
 * exists on a `TransactionRowDto`, and the two optional segments follow the
 * same omit-never-placeholder rule.
 */
export function transactionSheetSub(parts: { date: string; bookTypeLabel: string; personName?: string | null }): string {
  return joinSegments([parts.date, parts.bookTypeLabel, parts.personName]);
}

/**
 * The card's title, and the sheet's: the desktop's own "Descrizione" cell
 * (`kindLabel` + the free-text description). The description is optional on
 * both `ACCOUNT` and `CASH` rows.
 */
export function transactionCardTitle(parts: { kindLabel: string; description?: string | null }): string {
  const description = (parts.description ?? '').trim();
  return description === '' ? parts.kindLabel : `${parts.kindLabel} — ${description}`;
}

/** Which of the desktop's two money columns (Entrate/Uscite) the card's amount stands for. */
export type LedgerSide = 'in' | 'out' | 'none';

/**
 * The card shows ONE amount where the desktop table has two columns. This
 * decides WHICH column it is — and nothing else: the value itself always
 * comes from `ledgerClubAmountCents` (comportamento 2, the one shared
 * club-perspective rule), never re-derived here.
 */
export function ledgerSide(clubAmountCents: number): LedgerSide {
  if (clubAmountCents > 0) return 'in';
  if (clubAmountCents < 0) return 'out';
  return 'none';
}

/**
 * "Badge only when the row is NOT ordinary" (idiom 15.6, ratifica
 * R-15.8a-d): a registered row carries no status chip on the card, a
 * stornata/di storno one does — the state that changes what the row MEANS.
 */
export function transactionStatusIsAnomalous(row: { reversed: boolean; reversal: boolean }): boolean {
  return row.reversed || row.reversal;
}
