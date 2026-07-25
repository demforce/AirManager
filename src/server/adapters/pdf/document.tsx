import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

/**
 * One PDF report column (story 10.2, AC 2, `adapters/pdf` — spine :227,
 * gemello di `adapters/excel/workbook.ts#ExportColumn`): `header` and
 * `value()` are ALREADY localized/formatted strings — the caller resolves
 * them via `createTranslator` + `formatDateOnly`/`formatMinutes`/
 * `formatCents`, same pattern as the excel adapter's columns. Unlike the
 * excel column there is no `numFmt`: a PDF cell is always plain text, money
 * is a pre-formatted string, never a numeric cell. `color`, when given,
 * sets ONLY that cell's text color per row — the one use case is the
 * expiries status column, reusing `expiry-status-badge.tsx`'s palette.
 * `width` is a RELATIVE flex weight (mirrors the excel adapter's `width`,
 * though that one is an absolute character count) — omitted, every column
 * gets the SAME 1 (the story 10.2 behavior, unchanged for the 3 reports that
 * never set it). Story 11.3 (AC 3): introduced because the flight log's 12
 * equal-width columns left unbreakable tokens with no wrap point (a plain
 * `DD/MM/YYYY` date, an aircraft registration) NARROWER than their own text —
 * react-pdf cannot hyphenate a non-dictionary token, so it silently
 * overflows into the next column instead of wrapping. Found via the AC 3
 * real-PDF render check (a `flex:1` regression only visible once column
 * count grew past ~9), not a hypothetical.
 */
export type PdfColumn<T> = {
  header: string;
  value: (row: T) => string;
  color?: (row: T) => string | undefined;
  width?: number;
};

/** One line of the optional totals block below the table (AC 2: "totali dove pertinenti"). */
export type PdfTotal = {
  label: string;
  value: string;
};

export type PdfReportDocumentProps<T> = {
  branding: { name: string };
  title: string;
  /** Period/filters summary (AC 2) — omitted entirely when the report has none (e.g. the account statement, which is always the full history). */
  subtitle?: string | null;
  columns: PdfColumn<T>[];
  rows: T[];
  totals?: PdfTotal[];
  /** Already-localized "Generato il ..." / "Generated on ..." (AC 2), computed once by the caller (`exports.service.ts`). */
  generatedAtLabel: string;
  /** `(pageNumber, totalPages) => "Pag. 1/2"` / `"Page 1 of 2"` (AC 2) — react-pdf's `Text render` prop supplies both numbers per page. */
  pageLabel: (pageNumber: number, totalPages: number) => string;
};

/** Same warm-monochrome palette as the dashboard (`minimalist-ui`) — no gradients/heavy shadows in a PDF either. */
const COLOR = {
  text: '#111111',
  muted: '#787774',
  border: '#EAEAEA',
  headerBg: '#F7F6F3',
};

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36, fontSize: 9, color: COLOR.text },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  airfieldName: { fontSize: 11, fontWeight: 700 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: COLOR.muted, marginBottom: 14 },
  table: { borderTopWidth: 1, borderTopColor: COLOR.border, marginTop: 6 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLOR.border, paddingVertical: 5 },
  headerRow: { backgroundColor: COLOR.headerBg },
  headerCell: { paddingHorizontal: 4, fontWeight: 700 },
  cell: { paddingHorizontal: 4 },
  totals: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 6 },
  totalItem: { fontSize: 10, fontWeight: 700 },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, fontSize: 8, color: COLOR.muted, textAlign: 'center' },
  empty: { paddingVertical: 12, fontSize: 9, color: COLOR.muted, textAlign: 'center' },
});

/**
 * Shared report layout (story 10.2, AC 2): branding header, title,
 * optional subtitle, a generic column-driven table, an optional totals
 * line, and a footer with the generation timestamp + page numbering
 * (`fixed` + `render`, the documented react-pdf idiom — appears on every
 * page). Simplification (declared, Dev Notes leaves this to dev
 * discretion): the table's header row is NOT repeated on every page for a
 * report that spans more than one — an honest MVP limitation rather than a
 * speculative `fixed`-positioning attempt this story cannot visually verify
 * (no `pdf-parse` dependency, Dev Notes T6: content is asserted at the
 * adapter-input level, the binary only by magic bytes).
 */
export function PdfReportDocument<T>(props: PdfReportDocumentProps<T>): ReactElement {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.airfieldName}>{props.branding.name}</Text>
        </View>

        <Text style={styles.title}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.subtitle}>{props.subtitle}</Text> : null}

        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            {props.columns.map((column, index) => (
              <Text key={index} style={[styles.headerCell, { flex: column.width ?? 1 }]}>
                {column.header}
              </Text>
            ))}
          </View>
          {props.rows.length === 0 ? (
            <Text style={styles.empty}>—</Text>
          ) : (
            props.rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row} wrap={false}>
                {props.columns.map((column, colIndex) => {
                  const color = column.color?.(row);
                  return (
                    <Text key={colIndex} style={[styles.cell, { flex: column.width ?? 1, color }]}>
                      {column.value(row)}
                    </Text>
                  );
                })}
              </View>
            ))
          )}
        </View>

        {props.totals && props.totals.length > 0 ? (
          <View style={styles.totals}>
            {props.totals.map((total, index) => (
              <Text key={index} style={styles.totalItem}>
                {total.label}: {total.value}
              </Text>
            ))}
          </View>
        ) : null}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${props.generatedAtLabel} — ${props.pageLabel(pageNumber, totalPages)}`}
        />
      </Page>
    </Document>
  );
}

/**
 * Renders a react-pdf tree to a `Buffer` (story 10.2, AC 2) — the PDF
 * counterpart of `adapters/excel/workbook.ts#buildWorkbook`. Typed to
 * accept ANY react-pdf element (not literally `ReactElement<DocumentProps>`,
 * which `renderToBuffer` itself demands) so it also works for
 * `renderReportPdf` below, whose root element is `<PdfReportDocument>` — a
 * WRAPPER around `<Document>`, not `<Document>` itself, from TypeScript's
 * point of view. The cast is safe: every caller in this codebase renders a
 * tree that resolves to a `<Document>` root at runtime.
 */
export async function renderPdfBuffer(document: ReactElement): Promise<Buffer> {
  return renderToBuffer(document as ReactElement<DocumentProps>);
}

/**
 * Builds a `PdfReportDocument` from plain data and renders it in one call —
 * what every `export<Report>Pdf` function in `exports.service.ts` actually
 * calls. Kept here (not inlined at the call site) because JSX needs a
 * `.tsx` file: `exports.service.ts` stays a plain, JSX-free service module,
 * same separation as it already has from `adapters/excel/workbook.ts`.
 */
export async function renderReportPdf<T>(props: PdfReportDocumentProps<T>): Promise<Buffer> {
  return renderPdfBuffer(<PdfReportDocument {...props} />);
}
