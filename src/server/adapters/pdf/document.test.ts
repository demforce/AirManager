import { describe, expect, it } from 'vitest';
import { renderPdfBuffer, renderReportPdf, type PdfColumn } from './document';

type Row = { name: string; status: 'ok' | 'expired' };

const COLUMNS: PdfColumn<Row>[] = [
  { header: 'Name', value: (row) => row.name },
  { header: 'Status', value: (row) => row.status, color: (row) => (row.status === 'expired' ? '#9F2F2D' : undefined) },
];

const NOOP_PAGE_LABEL = (pageNumber: number, totalPages: number) => `Pag. ${pageNumber}/${totalPages}`;

/**
 * Story 10.2 (AC 2, T3): a binary smoke test — the CONTENTS (columns,
 * totals, localized headers) are asserted at the `exports.service.ts` level
 * against the props passed to `renderReportPdf` (mocked there), never by
 * parsing the rendered PDF back (Dev Notes: no `pdf-parse` dependency).
 * This file only proves the adapter itself produces a valid, non-empty
 * `%PDF-` buffer for the shapes every `export<Report>Pdf` function feeds
 * it: with/without a logo, with/without rows, with/without totals.
 */
describe('renderReportPdf / renderPdfBuffer (story 10.2, AC 2, T3)', () => {
  it('renders a valid PDF buffer (magic bytes) with a logo, rows, and totals', async () => {
    const buffer = await renderReportPdf<Row>({
      branding: { name: 'Aviosuperficie di Test', logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      title: 'Test report',
      subtitle: '01/01/2026 – 31/01/2026',
      columns: COLUMNS,
      rows: [
        { name: 'Mario Rossi', status: 'ok' },
        { name: 'Luigi Verdi', status: 'expired' },
      ],
      totals: [{ label: 'Totale', value: '2' }],
      generatedAtLabel: 'Generato il 10/07/2026, 12:00',
      pageLabel: NOOP_PAGE_LABEL,
    });

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('renders without a logo (null logoDataUrl) and without totals', async () => {
    const buffer = await renderReportPdf<Row>({
      branding: { name: 'AirManager', logoDataUrl: null },
      title: 'Test report',
      columns: COLUMNS,
      rows: [{ name: 'Mario Rossi', status: 'ok' }],
      generatedAtLabel: 'Generato il 10/07/2026, 12:00',
      pageLabel: NOOP_PAGE_LABEL,
    });

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders an empty-rows report without throwing (AC 2: an empty result set is still a valid PDF)', async () => {
    const buffer = await renderReportPdf<Row>({
      branding: { name: 'AirManager', logoDataUrl: null },
      title: 'Test report',
      columns: COLUMNS,
      rows: [],
      generatedAtLabel: 'Generato il 10/07/2026, 12:00',
      pageLabel: NOOP_PAGE_LABEL,
    });

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renderPdfBuffer accepts a plain react-pdf element tree directly (not just renderReportPdf)', async () => {
    const { Document, Page, Text } = await import('@react-pdf/renderer');
    const React = await import('react');
    const buffer = await renderPdfBuffer(React.createElement(Document, null, React.createElement(Page, null, React.createElement(Text, null, 'x'))));

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
