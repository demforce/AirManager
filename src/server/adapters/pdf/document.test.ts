import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { renderReportPdf, type PdfColumn } from './document';

type Row = { id: number; status: string };
const COLUMNS: PdfColumn<Row>[] = [
  { header: 'Identificativo', value: (row) => `RIGA-${String(row.id).padStart(3, '0')}`, width: 1 },
  { header: 'Stato', value: (row) => row.status, color: () => '#9F2F2D', width: 1 },
];
const props = (rows: Row[], columns = COLUMNS) => ({
  branding: { name: 'AirManager Sintetico' }, title: 'Report', subtitle: '01/07/2026',
  columns, rows, generatedAtLabel: 'Generato il 10/07/2026',
  pageLabel: (page: number, total: number) => `Pag. ${page} di ${total}`,
});

/** Read only Flate content streams + WinAnsi hex text; no PDF parser dependency. */
function pageTexts(pdf: Buffer): string[] {
  const source = pdf.toString('latin1');
  const objects = new Map([...source.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)].map((match) => [Number(match[1]), match[2]]));
  const pages = [...objects.values()].filter((body) => /\/Type \/Page\b/.test(body));
  return pages.map((page) => {
    const contentId = Number(page.match(/\/Contents (\d+) 0 R/)?.[1]);
    const content = objects.get(contentId);
    if (!content) throw new Error('Missing page content');
    const encoded = content.match(/stream\r?\n([\s\S]*?)\r?\nendstream/)?.[1];
    if (!encoded) throw new Error('Missing page stream');
    const decoded = inflateSync(Buffer.from(encoded, 'latin1')).toString('latin1');
    return [...decoded.matchAll(/\[([^\]]+)\]\s*TJ/g)].map((array) =>
      [...array[1].matchAll(/<([0-9A-Fa-f]+)>/g)].map((part) => new TextDecoder('windows-1252').decode(Buffer.from(part[1], 'hex'))).join(''),
    ).join(' ');
  });
}

describe('renderReportPdf (story 17.7)', () => {
  it('renders rows, repeated headers, and an accurate footer on every page', async () => {
    const buffer = await renderReportPdf(props(Array.from({ length: 120 }, (_, id) => ({ id, status: `STATO-${id}` }))));
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const pages = pageTexts(buffer);
    expect(pages.length).toBeGreaterThan(1);
    for (const [index, page] of pages.entries()) {
      expect(page).toContain(`Pag. ${index + 1} di ${pages.length}`);
      expect(page).toContain('Identificativo');
      expect(page).toContain('Stato');
    }
    for (let id = 0; id < 120; id++) {
      const matching = pages.filter((page) => page.includes(`RIGA-${String(id).padStart(3, '0')}`));
      expect(matching).toHaveLength(1);
      expect(matching[0]).toContain(`STATO-${id}`);
    }
  });

  it('renders an empty table, and totals without a broken footer', async () => {
    const empty = pageTexts(await renderReportPdf({ ...props([]), totals: [{ label: 'Totale', value: '0' }] }));
    expect(empty).toHaveLength(1);
    expect(empty[0]).toContain('—');
    expect(empty[0]).toContain('Totale');
    expect(empty[0]).toContain('Pag. 1 di 1');
  });

  it('wraps a long token inside its column, keeping the row together', async () => {
    const token = 'SUPERLONGTOKEN'.repeat(9);
    const pdf = await renderReportPdf(props([{ id: 1, status: token }]));
    const pages = pageTexts(pdf);
    expect(pages).toHaveLength(1);
    expect(pages[0].replace(/\s/g, '')).toContain(token);
    expect(pages[0]).toContain('RIGA-001');
  });

  it('moves a tall row intact when it reaches the bottom of a page', async () => {
    const token = 'BOUNDARYTOKEN'.repeat(14);
    const rows = [...Array.from({ length: 30 }, (_, id) => ({ id, status: 'ok' })), { id: 999, status: token }];
    const pages = pageTexts(await renderReportPdf(props(rows)));
    expect(pages.length).toBeGreaterThan(1);
    const rowPage = pages.find((page) => page.includes('RIGA-999'));
    expect(rowPage).toBeDefined();
    expect(rowPage?.replace(/\s/g, '')).toContain(token);
    expect(pages.filter((page) => page.includes('RIGA-999'))).toHaveLength(1);
  });

  it('keeps a total intact on a new page with its header and final page count', async () => {
    const rows = Array.from({ length: 31 }, (_, id) => ({ id, status: 'ok' }));
    const pages = pageTexts(await renderReportPdf({ ...props(rows), totals: [{ label: 'Totale', value: '31' }] }));
    expect(pages).toHaveLength(2);
    expect(pages[1]).toContain('Identificativo');
    expect(pages[1]).toContain('Totale: 31');
    expect(pages[1]).toContain('Pag. 2 di 2');
  });
});
