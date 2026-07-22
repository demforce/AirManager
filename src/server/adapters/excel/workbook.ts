import ExcelJS from 'exceljs';

/**
 * One exported column (story 10.1, AC 2, `adapters/excel` — spine :227):
 * `header` is the ALREADY-LOCALIZED label (the caller resolves it via
 * `createTranslator`, same pattern as `mail/templates.ts`); `value` maps one
 * row to the cell's raw content — a `string` for text/dates/enum labels
 * (already formatted with `formatDateTime`/`formatDateOnly`/`formatMinutes`,
 * AD-2: no decimal-hours/raw-Date leaks) or a `number` for money (`cents /
 * 100`, paired with `numFmt` so Excel keeps it a real, summable numeric
 * cell — AC 2: "importi come celle NUMERICHE"). `numFmt` is an Excel number
 * format string (e.g. `'#,##0.00 "€"'`); `width` defaults to a generous 18
 * characters when omitted.
 */
export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | null;
  numFmt?: string;
  width?: number;
};

const DEFAULT_COLUMN_WIDTH = 18;

// Leading characters that spreadsheet apps (and CSV re-imports) treat as
// formula/command triggers — prefixing with `'` forces literal-text
// interpretation, defusing formula injection (CWE-1236) from user-supplied
// strings (e.g. unauthenticated public PPR fields).
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

function neutralizeFormulaInjection(value: string | number | null): string | number | null {
  if (typeof value === 'string' && FORMULA_TRIGGER_CHARS.has(value.charAt(0))) {
    return `'${value}`;
  }
  return value;
}

/**
 * Builds a single-sheet `.xlsx` workbook as a `Buffer` (AC 1/2): a bold,
 * frozen header row (`views: [{ state: 'frozen', ySplit: 1 }]`) followed by
 * one row per `rows` entry, columns in the SAME order as `columns`. Per-cell
 * `numFmt` is applied only where the column declares one (money columns) —
 * `exceljs` infers the cell type (string vs number) from the JS value
 * `value()` returns, no explicit `cell.type` assignment needed.
 */
export async function buildWorkbook<T>(params: { sheetName: string; columns: ExportColumn<T>[]; rows: T[] }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(params.sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

  sheet.columns = params.columns.map((column) => ({ header: column.header, width: column.width ?? DEFAULT_COLUMN_WIDTH }));
  sheet.getRow(1).font = { bold: true };

  for (const row of params.rows) {
    const addedRow = sheet.addRow(params.columns.map((column) => neutralizeFormulaInjection(column.value(row))));
    params.columns.forEach((column, index) => {
      if (column.numFmt) {
        addedRow.getCell(index + 1).numFmt = column.numFmt;
      }
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
