/**
 * Money helpers (architecture spine AD-2): every amount in the domain is an
 * integer number of euro cents. `number`/`Decimal` monetary values are
 * forbidden — formatting/parsing is the only place decimals are allowed to
 * appear, and only as presentation.
 */

const AMOUNT_PATTERN = /^-?\d+([.,]\d{1,2})?$/;

/**
 * Formats an integer amount of euro cents as a localized EUR currency
 * string, e.g. `formatCents(1500000, 'it')` -> `"15.000,00 €"` (note: per
 * CLDR `minimumGroupingDigits`, Italian omits the thousands separator below
 * 10.000, so `formatCents(150000, 'it')` -> `"1500,00 €"`).
 */
export function formatCents(cents: number, locale: 'it' | 'en' = 'it'): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`formatCents: cents must be an integer, received ${cents}`);
  }

  const intlLocale = locale === 'it' ? 'it-IT' : 'en-IE';

  return new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
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
