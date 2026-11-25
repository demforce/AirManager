import PDFDocument from 'pdfkit';

/** Preformatted report cell. A width is a relative column weight. */
export type PdfColumn<T> = {
  header: string;
  value: (row: T) => string;
  color?: (row: T) => string | undefined;
  width?: number;
};

export type PdfTotal = { label: string; value: string };

export type PdfReportDocumentProps<T> = {
  branding: { name: string };
  title: string;
  subtitle?: string | null;
  columns: PdfColumn<T>[];
  rows: T[];
  totals?: PdfTotal[];
  generatedAtLabel: string;
  pageLabel: (pageNumber: number, totalPages: number) => string;
};

const COLOR = {
  text: '#111111', muted: '#787774', border: '#EAEAEA', headerBg: '#F7F6F3',
};
const PAGE_MARGIN = 36;
const CONTENT_BOTTOM_MARGIN = 48;
const CELL_PADDING = 4;
const ROW_PADDING = 5;
const BORDER = 1;
// react-pdf's Helvetica line box is 9.9 pt; pdfkit measures 10.404 pt.
// Use the former for pagination while keeping pdfkit's own text placement.
const LINE_BOX_ADJUSTMENT = 0.5;
const REACT_LINE_HEIGHT = 9.9;
const CONTINUATION_ROW_ADJUSTMENT = 0.5;

/**
 * Draws the report with pdfkit's standard Helvetica fonts. Rows are measured
 * before drawing; a page break occurs before, never inside, a row. The HTTP
 * contract remains a Buffer, so render errors are handled before the route
 * sends a response. `bufferPages` lets the footer include the final total.
 */
export async function renderReportPdf<T>(props: PdfReportDocumentProps<T>): Promise<Buffer> {
  const doc = new PDFDocument({ autoFirstPage: false, size: 'A4', margins: { top: PAGE_MARGIN, bottom: CONTENT_BOTTOM_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN }, bufferPages: true, compress: true });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const tableWidth = pageWidth - PAGE_MARGIN * 2;
  const contentBottom = pageHeight - CONTENT_BOTTOM_MARGIN;
  const weightSum = props.columns.reduce((sum, col) => sum + (col.width ?? 1), 0);
  const widths = props.columns.map((col) => tableWidth * (col.width ?? 1) / weightSum);
  let y = PAGE_MARGIN;
  let continuationPage = false;

  const measure = (text: string, width: number, bold: boolean, size: number): number => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    return doc.heightOfString(text, { width: Math.max(1, width - CELL_PADDING * 2), lineGap: 0 });
  };
  const rowHeight = (values: string[]): number => {
    const lineHeight = measure('M', tableWidth, false, 9);
    const maxLines = Math.max(0, ...values.map((value, i) => {
      const lines = Math.round(measure(value, widths[i], false, 9) / lineHeight);
      // The old renderer hyphenates long words. In a multi-line cell this
      // can cost another line compared with pdfkit's character break.
      const available = Math.max(1, widths[i] - CELL_PADDING * 2);
      const longWord = lines >= 4 && value.split(/\s+/).some((word) => doc.widthOfString(word) > available && /[A-Za-zÀ-ÿ]{5}/.test(word));
      return lines + (longWord ? 1 : 0);
    }));
    return ROW_PADDING * 2 + BORDER + maxLines * REACT_LINE_HEIGHT;
  };
  const drawCells = (values: string[], colors: (string | undefined)[], height: number, header: boolean) => {
    if (header) doc.rect(PAGE_MARGIN, y, tableWidth, height).fill(COLOR.headerBg);
    let x = PAGE_MARGIN;
    for (let i = 0; i < values.length; i++) {
      doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(colors[i] ?? COLOR.text);
      doc.text(values[i], x + CELL_PADDING, y + ROW_PADDING, { width: Math.max(1, widths[i] - CELL_PADDING * 2), lineGap: 0 });
      x += widths[i];
    }
    y += height;
    doc.moveTo(PAGE_MARGIN, y - BORDER / 2).lineTo(PAGE_MARGIN + tableWidth, y - BORDER / 2).lineWidth(BORDER).strokeColor(COLOR.border).stroke();
  };
  const drawTableHeader = () => {
    doc.moveTo(PAGE_MARGIN, y + BORDER / 2).lineTo(PAGE_MARGIN + tableWidth, y + BORDER / 2).lineWidth(BORDER).strokeColor(COLOR.border).stroke();
    const values = props.columns.map((col) => col.header);
    const height = Math.max(0, ...values.map((value, i) => measure(value, widths[i], true, 9))) + ROW_PADDING * 2 + BORDER - LINE_BOX_ADJUSTMENT;
    drawCells(values, values.map(() => undefined), height, true);
  };
  const addPage = async () => {
    doc.addPage();
    y = PAGE_MARGIN;
    continuationPage = true;
    drawTableHeader();
    // pdfkit's drawing API is synchronous. Let other requests run per page.
    await new Promise<void>((resolve) => setImmediate(resolve));
  };

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.text).text(props.branding.name, PAGE_MARGIN, y, { width: tableWidth });
  y = doc.y + 18;
  doc.font('Helvetica-Bold').fontSize(16).text(props.title, PAGE_MARGIN, y, { width: tableWidth });
  y = doc.y + 2;
  if (props.subtitle) {
    doc.font('Helvetica').fontSize(10).fillColor(COLOR.muted).text(props.subtitle, PAGE_MARGIN, y, { width: tableWidth });
    y = doc.y + 14;
  }
  y += 6;
  drawTableHeader();

  if (props.rows.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted);
    doc.text('—', PAGE_MARGIN, y + 12, { width: tableWidth, align: 'center' });
    y = doc.y + 12;
  }
  for (const row of props.rows) {
    const values = props.columns.map((col) => col.value(row));
    const colors = props.columns.map((col) => col.color?.(row));
    // The repeated heading consumes the spare space of the base renderer's
    // continuation pages. Half a point per row keeps their cell breaks.
    const height = rowHeight(values) - (continuationPage ? CONTINUATION_ROW_ADJUSTMENT : 0);
    if (y + height > contentBottom) await addPage();
    // A pathological cell taller than a page cannot fit an indivisible row.
    // Clip it within the page instead of letting pdfkit split the row.
    const available = contentBottom - y;
    if (height > available) {
      let x = PAGE_MARGIN;
      for (let i = 0; i < values.length; i++) {
        doc.font('Helvetica').fontSize(9).fillColor(colors[i] ?? COLOR.text);
        doc.text(values[i], x + CELL_PADDING, y + ROW_PADDING, { width: Math.max(1, widths[i] - CELL_PADDING * 2), height: available - ROW_PADDING * 2 - BORDER, ellipsis: true });
        x += widths[i];
      }
      y += available;
      doc.moveTo(PAGE_MARGIN, y - BORDER / 2).lineTo(PAGE_MARGIN + tableWidth, y - BORDER / 2).strokeColor(COLOR.border).stroke();
    } else {
      drawCells(values, colors, height, false);
    }
  }

  if (props.totals?.length) {
    y += 10;
    doc.font('Helvetica-Bold').fontSize(10);
    let x = PAGE_MARGIN;
    let lineHeight = 0;
    for (const total of props.totals) {
      const value = `${total.label}: ${total.value}`;
      const width = Math.min(tableWidth, doc.widthOfString(value) + 1);
      const height = doc.heightOfString(value, { width });
      if (x !== PAGE_MARGIN && x + width > PAGE_MARGIN + tableWidth) { x = PAGE_MARGIN; y += lineHeight + 6; lineHeight = 0; }
      if (y + height > contentBottom) { await addPage(); x = PAGE_MARGIN; }
      doc.fillColor(COLOR.text).text(value, x, y, { width });
      x += width + 20;
      lineHeight = Math.max(lineHeight, height);
    }
  }

  const pages = doc.bufferedPageRange().count;
  for (let index = 0; index < pages; index++) {
    doc.switchToPage(index);
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(COLOR.muted);
    doc.text(`${props.generatedAtLabel} — ${props.pageLabel(index + 1, pages)}`, PAGE_MARGIN, pageHeight - 27.35, { width: tableWidth, align: 'center', lineBreak: false });
  }
  doc.end();
  return complete;
}
