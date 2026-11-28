/** Synthetic, deterministic adapter benchmark for story 17.7. No database access. */
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { renderReportPdf, type PdfColumn, type PdfReportDocumentProps } from '../../src/server/adapters/pdf/document';

type Row = { id: number; status: string };
const row = (id: number): Row => ({ id, status: id % 3 === 0 ? 'Scaduto' : 'Valido' });
const value = (label: string) => (r: Row) => `${label}-${String(r.id).padStart(5, '0')}`;
const flightColumns: PdfColumn<Row>[] = [
  { header: 'Data', value: (r) => `10/07/${2020 + r.id % 7}`, width: 1.15 },
  { header: 'Aeromobile', value: value('I-ABCD'), width: 1.4 },
  { header: 'Tratta', value: value('LIML-LIRF'), width: 1.5 },
  { header: 'Decollo', value: () => '10:30', width: 0.8 },
  { header: 'Atterraggio', value: () => '11:45', width: 0.8 },
  { header: 'Pilota', value: value('Mario Rossi'), width: 1.6 },
  { header: 'Tipo', value: () => 'Privato', width: 0.9 },
  { header: 'Durata', value: () => '1:15', width: 0.75 },
  { header: 'Dec./Att.', value: () => '1 / 1', width: 0.7 },
  { header: 'Importo', value: () => '120,00', width: 0.9 },
  { header: 'PIC', value: () => 'Sì', width: 0.55 },
];
const expiryColumns: PdfColumn<Row>[] = [
  { header: 'Pilota', value: value('Mario Rossi'), width: 2 },
  { header: 'Tipo', value: value('Visita'), width: 2 },
  { header: 'Scadenza', value: () => '31/12/2026' },
  { header: 'Giorni', value: () => '12' },
  { header: 'Stato', value: (r) => r.status, color: (r) => r.status === 'Scaduto' ? '#9F2F2D' : '#4F7C5B' },
];
const shapes: Record<string, { title: string; columns: PdfColumn<Row>[]; totals?: { label: string; value: string }[] }> = {
  flights: { title: 'Registro voli', columns: flightColumns, totals: [{ label: 'Durata totale', value: '125:00' }] },
  expiries: { title: 'Scadenze', columns: expiryColumns },
  bookings: { title: 'Prenotazioni', columns: [
    { header: 'Data', value: () => '10/07/2026' }, { header: 'Pilota', value: value('Mario Rossi') },
    { header: 'Aeromobile', value: value('I-ABCD') }, { header: 'Stato', value: (r) => r.status },
  ] },
  account: { title: 'Estratto conto', columns: [
    { header: 'Data', value: () => '10/07/2026' }, { header: 'Descrizione', value: value('Versamento') },
    { header: 'Importo', value: () => '120,00' }, { header: 'Saldo', value: () => '240,00' },
  ], totals: [{ label: 'Saldo finale', value: '240,00' }] },
  cash: { title: 'Report di cassa', columns: [
    { header: 'Categoria', value: value('Carburante') }, { header: 'Entrate', value: () => '120,00' },
    { header: 'Uscite', value: () => '20,00' }, { header: 'Saldo', value: () => '100,00' },
  ], totals: [{ label: 'Totale', value: '100,00' }] },
};

async function main() {
  const kind = process.argv[2] ?? 'flights';
  const count = Number(process.argv[3] ?? 2000);
  const iterations = Number(process.argv[4] ?? 1);
  const output = process.argv[5];
  const shape = shapes[kind];
  if (!shape || !Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(iterations) || iterations < 1) throw new Error('Usage: pdf-bench.ts <flights|expiries|bookings|account|cash> <rows> <iterations> [output.pdf]');
  const props: PdfReportDocumentProps<Row> = {
    branding: { name: 'AirManager Sintetico' }, title: shape.title, subtitle: '01/07/2026 - 31/07/2026',
    columns: shape.columns, rows: Array.from({ length: count }, (_, i) => row(i + 1)), totals: shape.totals,
    generatedAtLabel: 'Generato il 10/07/2026, 12:00', pageLabel: (p, n) => `Pag. ${p} di ${n}`,
  };
  const times: number[] = [];
  let peakRss = 0;
  let bytes = 0;
  let pages = 0;
  for (let i = 0; i < iterations; i++) {
    const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 5);
    const start = performance.now();
    let buffer: Buffer;
    try { buffer = await renderReportPdf(props); } finally { clearInterval(sample); }
    times.push(performance.now() - start);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    bytes = buffer.length;
    pages = (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    if (output) { await mkdir(output.substring(0, output.lastIndexOf('/')) || '.', { recursive: true }); await writeFile(output, buffer); }
  }
  times.sort((a, b) => a - b);
  console.log(JSON.stringify({ kind, rows: count, iterations, medianMs: Math.round(times[Math.floor(times.length / 2)]), msPerRow: +(times[Math.floor(times.length / 2)] / Math.max(count, 1)).toFixed(3), bytes, pages, peakRssBytes: peakRss, loadAverage: (await import('node:os')).loadavg()[0] }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
