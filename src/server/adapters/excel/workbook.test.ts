import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildWorkbook, type ExportColumn } from './workbook';

type Row = { name: string; amountCents: number; when: string };

const COLUMNS: ExportColumn<Row>[] = [
  { header: 'Name', value: (row) => row.name },
  { header: 'Amount', value: (row) => row.amountCents / 100, numFmt: '#,##0.00 "€"' },
  { header: 'When', value: (row) => row.when },
];

async function readBack(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's own `.d.ts` declares a local, browser-compatible `Buffer`
  // shim (`extends ArrayBuffer`, unrelated to Node's `Buffer` class) that
  // real Node `Buffer` instances don't structurally satisfy under the
  // newer resizable-ArrayBuffer lib types — a known exceljs typings gap,
  // not a real runtime mismatch (a Node `Buffer` IS valid input here).
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook;
}

describe('buildWorkbook (story 10.1, AC 2 — Task 1)', () => {
  it('names the sheet, freezes/bolds the header row, and writes the header labels', async () => {
    const buffer = await buildWorkbook({ sheetName: 'Persone', columns: COLUMNS, rows: [] });
    const workbook = await readBack(buffer);

    const sheet = workbook.getWorksheet('Persone');
    expect(sheet).toBeDefined();
    expect(sheet!.views).toEqual([expect.objectContaining({ state: 'frozen', ySplit: 1 })]);
    expect(sheet!.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(sheet!.getRow(1).values).toEqual([undefined, 'Name', 'Amount', 'When']);
  });

  it('writes a money column as a real NUMERIC cell (cents/100) with the euro numFmt, and a plain string column as text', async () => {
    const rows: Row[] = [{ name: 'Mario Rossi', amountCents: 150000, when: '10/07/2026' }];
    const buffer = await buildWorkbook({ sheetName: 'Sheet1', columns: COLUMNS, rows });
    const workbook = await readBack(buffer);

    const sheet = workbook.getWorksheet('Sheet1')!;
    const dataRow = sheet.getRow(2);
    expect(dataRow.getCell(1).value).toBe('Mario Rossi');
    expect(dataRow.getCell(2).value).toBe(1500);
    expect(dataRow.getCell(2).numFmt).toBe('#,##0.00 "€"');
    expect(dataRow.getCell(3).value).toBe('10/07/2026');
    // The non-money column never gets a numFmt assigned.
    expect(dataRow.getCell(1).numFmt).toBeUndefined();
    expect(dataRow.getCell(3).numFmt).toBeUndefined();
  });

  it('writes one row per input row, in the same order', async () => {
    const rows: Row[] = [
      { name: 'A', amountCents: 100, when: '01/01/2026' },
      { name: 'B', amountCents: 200, when: '02/01/2026' },
      { name: 'C', amountCents: 300, when: '03/01/2026' },
    ];
    const buffer = await buildWorkbook({ sheetName: 'Sheet1', columns: COLUMNS, rows });
    const workbook = await readBack(buffer);

    const sheet = workbook.getWorksheet('Sheet1')!;
    expect(sheet.rowCount).toBe(4); // header + 3 rows
    expect(sheet.getRow(2).getCell(1).value).toBe('A');
    expect(sheet.getRow(3).getCell(1).value).toBe('B');
    expect(sheet.getRow(4).getCell(1).value).toBe('C');
  });

  it('leaves a `null` cell value blank rather than writing the literal string "null"', async () => {
    const rows: Row[] = [{ name: 'A', amountCents: 0, when: '01/01/2026' }];
    const nullableColumns: ExportColumn<Row>[] = [{ header: 'Maybe', value: () => null }];
    const buffer = await buildWorkbook({ sheetName: 'Sheet1', columns: nullableColumns, rows });
    const workbook = await readBack(buffer);

    expect(workbook.getWorksheet('Sheet1')!.getRow(2).getCell(1).value).toBeNull();
  });
});
