/**
 * Money helpers (architecture spine AD-2): every amount in the domain is an
 * integer number of euro cents. `number`/`Decimal` monetary values are
 * forbidden — formatting/parsing is the only place decimals are allowed to
 * appear, and only as presentation.
 */

const AMOUNT_PATTERN = /^-?\d+([.,]\d{1,2})?$/;

/**
 * Formats an integer amount of euro cents as a localized EUR currency
 * string, e.g. `formatCents(1500000, 'it')` -> `"15.000,00 €"`. Grouping is
 * pinned with `useGrouping: 'always'` so the thousands separator is always
 * present, including below 10.000 (e.g. `formatCents(150000, 'it')` ->
 * `"1.500,00 €"`): the CLDR `minimumGroupingDigits: 2` rule that otherwise
 * suppresses it for Italian below that threshold is applied inconsistently
 * between Node's ICU (SSR) and the browser's ICU (client), which caused
 * hydration mismatches on amounts in the 1.000–9.999 range. Pinning makes
 * the output deterministic across both — the tradeoff being the separator
 * now always shows, which is also the conventional Italian format.
 */
export function formatCents(cents: number, locale: 'it' | 'en' = 'it'): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`formatCents: cents must be an integer, received ${cents}`);
  }

  const intlLocale = locale === 'it' ? 'it-IT' : 'en-IE';

  return new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency: 'EUR',
    useGrouping: 'always',
  }).format(cents / 100);
}

/**
 * Same as `formatCents`, but a positive amount gets an explicit leading `+`
 * (`Intl.NumberFormat` never adds one on its own — only the negative sign is
 * automatic). Used wherever an amount must visibly read as a signed ledger
 * entry (AD-2, story 3.1's account/cash movement previews) rather than a
 * plain magnitude — a `TOP_UP`'s `+100,00 €` vs a future debit's `-45,00 €`.
 */
export function formatSignedCents(cents: number, locale: 'it' | 'en' = 'it'): string {
  const formatted = formatCents(cents, locale);
  return cents > 0 ? `+${formatted}` : formatted;
}

/**
 * Parses a user-provided decimal amount (comma or dot as decimal separator,
 * at most 2 decimal digits) into an integer number of euro cents.
 * Throws `RangeError` on any input that isn't an unambiguous plain amount.
 */
export function parseCents(value: string): number {
  const trimmed = value.trim();

  if (!AMOUNT_PATTERN.test(trimmed)) {
    throw new RangeError(`parseCents: invalid amount "${value}"`);
  }

  const normalized = trimmed.replace(',', '.');
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholePart, fractionPart = ''] = unsigned.split('.');
  const cents = Number(wholePart) * 100 + Number(fractionPart.padEnd(2, '0').slice(0, 2));

  return negative ? -cents : cents;
}
