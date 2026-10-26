/**
 * Pure derivations of the Impostazioni phone face (story 15.8b, AD-5) — the
 * sub-lines of the two catalogue cards (`ExpiryType`, `CashCategory`) and the
 * over-line of their detail sheets.
 *
 * Every composition goes through `joinSegments`, so an ABSENT segment is
 * omitted instead of being filled with a placeholder (lesson 15.5 F1): the
 * sheet's `sub` ends up inside the dialog's accessible name
 * (`${sub} — ${title}`, `bottom-sheet.tsx:61`), where both a stray "—" and a
 * double separator are audible.
 *
 * Pure by construction: no service import, hence no `@/lib/env` dragged into
 * any test that reaches this file (CLAUDE.md's eager-env rule).
 */
import { joinSegments } from './mobile-sub-line';

export type ExpiryTypeSubLineInput = {
  /** Always present: `ExpiryScope` is a non-nullable enum with four values. */
  scopeLabel: string;
  /** "12 mesi" or the "senza scadenza" wording — always present, the card decides which. */
  validityLabel: string;
  /** Present ONLY when `blocksBooking` is true (the manoeuvre that feeds the 7.4/14.4 guards). */
  blocksLabel?: string | null;
};

/**
 * Sub-line of an `ExpiryType` card: scope, validity, and the one fact that is
 * only worth a word when true. The deactivated state is NOT here — it is the
 * card's `Badge` (`ratings-card.tsx`), and a second channel for it would be a
 * branch nothing renders (review LOW-2).
 */
export function expiryTypeSubLine(input: ExpiryTypeSubLineInput): string {
  return joinSegments([input.scopeLabel, input.validityLabel, input.blocksLabel]);
}

export type ExpiryTypeSheetSubInput = {
  /** Which catalogue the type belongs to ("Abilitazioni" / "Visite mediche") — the card's own title. */
  catalogLabel: string;
  scopeLabel: string;
  blocksLabel?: string | null;
};

/** Over-line of an `ExpiryType` sheet — says WHICH catalogue and WHOM the type applies to before the name is read out. */
export function expiryTypeSheetSub(input: ExpiryTypeSheetSubInput): string {
  return joinSegments([input.catalogLabel, input.scopeLabel, input.blocksLabel]);
}

export type CashCategorySubLineInput = {
  /** "3 movimenti" — always present (the count is 0 or more, never unknown). */
  movementsLabel: string;
  /** Present ONLY for the three system categories (`Ricariche`, `Compensi istruttori`, `PPR`). */
  systemLabel?: string | null;
};

/** Sub-line of a `CashCategory` card — the deactivated state lives in the card's `Badge`, not here (review LOW-2). */
export function cashCategorySubLine(input: CashCategorySubLineInput): string {
  return joinSegments([input.movementsLabel, input.systemLabel]);
}

export type CashCategorySheetSubInput = {
  catalogLabel: string;
  systemLabel?: string | null;
};

/** Over-line of a `CashCategory` sheet. */
export function cashCategorySheetSub(input: CashCategorySheetSubInput): string {
  return joinSegments([input.catalogLabel, input.systemLabel]);
}
