/**
 * The two export caps (story 10.1 AC 4, story 10.2 AC 4), in a module with NO
 * import (story 19.11, AD-8): the two statement pages compare them with the
 * period's total to say BEFORE the click that an export is not available, and
 * importing `exports.service.ts` for two numbers would drag `exceljs` and
 * `@react-pdf/renderer` into a page's module graph. `exports.service.ts`
 * re-exports both, unchanged.
 */

/** Above this many filtered rows, every export rejects with 422 `EXPORT_TOO_LARGE` (AC 4) rather than silently truncating. */
export const EXPORT_MAX_ROWS = 10_000;

/** Story 10.2 (AC 4): a PDF is not a data tool — its cap is far tighter than the xlsx one; above it, use the Excel export instead. */
export const PDF_EXPORT_MAX_ROWS = 2_000;
