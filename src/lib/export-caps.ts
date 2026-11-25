/**
 * The two export caps (story 10.1 AC 4, story 10.2 AC 4), in a module with NO
 * import (story 19.11, AD-8): the two statement pages compare them with the
 * period's total to say BEFORE the click that an export is not available, and
 * importing `exports.service.ts` for two numbers would drag `exceljs` and
 * `pdfkit` into a page's module graph. `exports.service.ts`
 * re-exports both, unchanged.
 */

/** Above this many filtered rows, every export rejects with 422 `EXPORT_TOO_LARGE` (AC 4) rather than silently truncating. */
export const EXPORT_MAX_ROWS = 10_000;

/** Story 17.7: highest round cap whose widest 11-column flight report rendered under 3 s: 5,000 rows = 1.592 s median; 10,000 = 3.524 s (3 runs, synthetic rows, load average <1, 2026-11-25). */
export const PDF_EXPORT_MAX_ROWS = 5_000;
