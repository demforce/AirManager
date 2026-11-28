import { execFileSync } from 'node:child_process';
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

/** Extract actual Unicode text in drawing order, with Poppler's page boundaries. */
function pageTexts(pdf: Buffer): string[] {
  const text = execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', '-', '-'], { input: pdf, encoding: 'utf8' });
  return text.trimEnd().split('\f').map((page) => page.replace(/\s+/g, ' ').trim());
}

describe('renderReportPdf (story 17.7)', () => {
  it('preserves readable and searchable names in body, headings, totals and footer', async () => {
    const name = 'Łukasz Żółć';
    const pdf = await renderReportPdf({
      ...props([{ id: 1, status: 'Élodie Ștefan Őri' }]),
      branding: { name: 'Aeroclub Łódź' },
      title: name,
      subtitle: 'Scuola di volo – Łódź',
      columns: [{ header: 'Attività a Łódź', value: (row) => row.status }],
      totals: [{ label: 'Totale Łódź', value: '€ 123' }],
      generatedAtLabel: 'Generato a Łódź',
    });
    const [page] = pageTexts(pdf);
    for (const text of ['Aeroclub Łódź', name, 'Scuola di volo – Łódź', 'Attività a Łódź',
      'Élodie Ștefan Őri', 'Totale Łódź: € 123', 'Generato a Łódź — Pag. 1 di 1']) {
      expect(page).toContain(text);
    }
  });

  it('keeps the last wrapped Unicode line above the next row in the four-column layout', async () => {
    const pdf = await renderReportPdf({
      ...props([]),
      rows: ['Łukasz '.repeat(200) + 'Fine', 'Nuova'],
      columns: [
        { header: 'Persona', width: 1.25, value: (name) => name },
        { header: 'Tipo', width: 1.25, value: () => 'Visita' },
        { header: 'Scadenza', value: () => '27/11/2026' },
        { header: 'Stato', value: () => 'Valida' },
      ],
    });
    expect(pageTexts(pdf)).toHaveLength(1);
    const boxes = execFileSync('pdftotext', ['-bbox', '-', '-'], { input: pdf, encoding: 'utf8' });
    const lastLine = boxes.match(/yMax="([\d.]+)">Fine<\/word>/);
    const nextRow = boxes.match(/yMin="([\d.]+)"[^>]*>Nuova<\/word>/);
    expect(lastLine).toBeTruthy();
    expect(nextRow).toBeTruthy();
    expect(Number(lastLine![1])).toBeLessThan(Number(nextRow![1]));
  });

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

  it('preserves a 600-character value in an oversized eleven-column flight row', async () => {
    const token = 'X'.repeat(600);
    const widths = [1.4, 1.3, 1.1, 1.1, 1, 1.3, 1.1, 0.6, 0.7, 1.1, 1.1];
    const columns: PdfColumn<{ name: string }>[] = widths.map((width, index) => ({
      header: index === 2 ? 'Persona' : `Campo ${index}`,
      width,
      value: (row) => index === 2 ? row.name : `valore-${index}`,
    }));
    const pages = pageTexts(await renderReportPdf({ ...props([]), columns, rows: [{ name: token }] }));
    expect((pages.join('').match(/X/g) ?? [])).toHaveLength(600);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('Pag. 1 di 1');
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
