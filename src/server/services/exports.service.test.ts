import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { formatMinutes } from '@/lib/time';

// Every one of the 10 sibling list services `exports.service.ts` statically
// imports is mocked here — NOT because each test below exercises all of
// them, but because an unmocked one would import `@/server/db/prisma`,
// which eagerly validates `env.ts` (no `DATABASE_URL` in the plain vitest
// process, same reason every other `*.service.test.ts` mocks it — see
// `handler.test.ts`'s doc-comment). Mocking the SIBLING SERVICE directly
// (rather than mocking Prisma and letting the real service logic run) is
// deliberate: these tests are about `exports.service.ts`'s OWN contract
// (which args it forwards, how it maps a DTO to columns), not a
// re-verification of `listPeople`/`listFlights`/etc.'s own already-tested
// query logic.
vi.mock('./people.service', () => ({ listPeople: vi.fn(), getPerson: vi.fn() }));
vi.mock('./aircraft.service', () => ({ listAircraft: vi.fn(), sumFlightMinutesByAircraft: vi.fn() }));
vi.mock('./flights.service', () => ({ listFlights: vi.fn() }));
vi.mock('./bookings.service', () => ({ listBookings: vi.fn() }));
vi.mock('./accounts.service', () => ({ listAccountMovements: vi.fn(), getAccountOverview: vi.fn() }));
vi.mock('./cash.service', () => ({ listCashMovements: vi.fn(), getCashReport: vi.fn() }));
vi.mock('./expiries.service', () => ({ listAllExpiries: vi.fn() }));
vi.mock('./instructor-compensation.service', () => ({ getCompensationSummary: vi.fn() }));
vi.mock('./transactions.service', () => ({ listTransactions: vi.fn() }));
// Story 10.2: the PDF adapter is mocked here (unlike `buildWorkbook`, never
// mocked for the xlsx tests above) — the CONTENTS assertion is on the props
// passed to `renderReportPdf` (Dev Notes: "asserzioni sui contenuti a
// livello unit sull'input passato all'adapter"), the adapter's OWN
// buffer-producing behavior is covered by `adapters/pdf/document.test.ts`.
vi.mock('@/server/adapters/pdf/document', () => ({ renderReportPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-fake')) }));
vi.mock('./app-settings.service', () => ({ getAirfieldBranding: vi.fn() }));

const { listPeople, getPerson } = await import('./people.service');
const { listAircraft, sumFlightMinutesByAircraft } = await import('./aircraft.service');
const { listFlights } = await import('./flights.service');
const { listBookings } = await import('./bookings.service');
const { listCashMovements, getCashReport } = await import('./cash.service');
const { listAllExpiries } = await import('./expiries.service');
const { listAccountMovements, getAccountOverview } = await import('./accounts.service');
const { getAirfieldBranding } = await import('./app-settings.service');
const { renderReportPdf } = await import('@/server/adapters/pdf/document');
const { getCompensationSummary } = await import('./instructor-compensation.service');
const { listTransactions } = await import('./transactions.service');
const {
  EXPORT_MAX_ROWS,
  PDF_EXPORT_MAX_ROWS,
  assertWithinExportCap,
  assertWithinPdfExportCap,
  exportPeopleXlsx,
  exportAircraftXlsx,
  exportFlightsXlsx,
  exportAccountMovementsXlsx,
  exportCashMovementsXlsx,
  exportExpiriesXlsx,
  exportInstructorCompensationXlsx,
  exportTransactionsXlsx,
  exportAccountStatementPdf,
  exportCashReportPdf,
  exportFlightsPdf,
  exportExpiriesPdf,
  exportBookingsPdf,
} = await import('./exports.service');

const listPeopleMock = vi.mocked(listPeople);
const listAircraftMock = vi.mocked(listAircraft);
const sumFlightMinutesByAircraftMock = vi.mocked(sumFlightMinutesByAircraft);
const listFlightsMock = vi.mocked(listFlights);
const listBookingsMock = vi.mocked(listBookings);
const listCashMovementsMock = vi.mocked(listCashMovements);
const listAllExpiriesMock = vi.mocked(listAllExpiries);
const listAccountMovementsMock = vi.mocked(listAccountMovements);
const getAccountOverviewMock = vi.mocked(getAccountOverview);
const getPersonMock = vi.mocked(getPerson);
const getCashReportMock = vi.mocked(getCashReport);
const getAirfieldBrandingMock = vi.mocked(getAirfieldBranding);
const renderReportPdfMock = vi.mocked(renderReportPdf);
const getCompensationSummaryMock = vi.mocked(getCompensationSummary);
const listTransactionsMock = vi.mocked(listTransactions);

const ACTOR: Actor = { userId: 'user_1', personId: null, roles: ['ADMIN'] };
const BRANDING = { name: 'Aviosuperficie di Test' };

async function readSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  // Same exceljs typings gap as `workbook.test.ts`'s `readBack` — see its doc-comment.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook.worksheets[0]!;
}

/** The single arg object the mocked `renderReportPdf` was last called with — every PDF test inspects this instead of parsing a real buffer (Dev Notes). */
function lastPdfProps() {
  return renderReportPdfMock.mock.calls.at(-1)![0];
}

beforeEach(() => {
  listPeopleMock.mockReset();
  listAircraftMock.mockReset();
  sumFlightMinutesByAircraftMock.mockReset();
  listFlightsMock.mockReset();
  listBookingsMock.mockReset();
  listCashMovementsMock.mockReset();
  listAllExpiriesMock.mockReset();
  listAccountMovementsMock.mockReset();
  getAccountOverviewMock.mockReset();
  getPersonMock.mockReset();
  getCashReportMock.mockReset();
  renderReportPdfMock.mockClear();
  getAirfieldBrandingMock.mockReset();
  getAirfieldBrandingMock.mockResolvedValue(BRANDING);
  getCompensationSummaryMock.mockReset();
  listTransactionsMock.mockReset();
});

describe('assertWithinExportCap (story 10.1, AC 4)', () => {
  it('does not throw at exactly the cap', () => {
    expect(() => assertWithinExportCap(EXPORT_MAX_ROWS)).not.toThrow();
  });

  it('throws a ValidationError with code EXPORT_TOO_LARGE one row past the cap', () => {
    expect(() => assertWithinExportCap(EXPORT_MAX_ROWS + 1)).toThrow(
      expect.objectContaining({ code: 'EXPORT_TOO_LARGE' }),
    );
  });
});

describe('exportPeopleXlsx (T2 — argument parity with the list service)', () => {
  it('reuses listPeople with the SAME actor and filters, overriding ONLY page/pageSize to the export cap', async () => {
    listPeopleMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: EXPORT_MAX_ROWS });

    const query = { page: 3, pageSize: 20, q: 'ros', includeArchived: true, format: 'xlsx' as const, locale: 'it' as const };
    await exportPeopleXlsx(ACTOR, query);

    expect(listPeopleMock).toHaveBeenCalledWith(ACTOR, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  });

  it('rejects with 422 EXPORT_TOO_LARGE (never reads/maps rows) when the filtered total exceeds the cap', async () => {
    listPeopleMock.mockResolvedValue({ items: [], total: EXPORT_MAX_ROWS + 1, page: 1, pageSize: EXPORT_MAX_ROWS });

    await expect(exportPeopleXlsx(ACTOR, { page: 1, pageSize: 20, includeArchived: false })).rejects.toMatchObject({
      code: 'EXPORT_TOO_LARGE',
    });
  });
});

describe('exportAircraftXlsx (story 19.2, R-19-b — "Ore totali" = the sum of the registered flights)', () => {
  it('asks the aggregate ONCE for every exported id with no window, and prints each total as H:MM where the old column was', async () => {
    const aircraftRow = {
      type: 'Ultraleggero',
      model: 'Tecnam P92',
      status: 'OPERATIONAL' as const,
      statusReason: null,
      outOfServiceUntil: null,
      archivedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    listAircraftMock.mockResolvedValue({
      total: 2,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
      items: [
        { ...aircraftRow, id: 'ac_1', registration: 'I-ABCD' },
        { ...aircraftRow, id: 'ac_2', registration: 'I-EFGH' },
      ],
    });
    // `ac_2` never flew: absent from the map, read as 0.
    sumFlightMinutesByAircraftMock.mockResolvedValue(new Map([['ac_1', 120]]));

    const result = await exportAircraftXlsx(ACTOR, { page: 1, pageSize: 20, includeArchived: false, locale: 'en' });

    expect(sumFlightMinutesByAircraftMock).toHaveBeenCalledTimes(1);
    expect(sumFlightMinutesByAircraftMock).toHaveBeenCalledWith(ACTOR, ['ac_1', 'ac_2'], null, null);
    const sheet = await readSheet(result.buffer);
    expect(sheet.getRow(1).getCell(4).value).toBe('Total hours');
    expect(sheet.getRow(2).getCell(4).value).toBe(formatMinutes(120));
    expect(sheet.getRow(3).getCell(4).value).toBe(formatMinutes(0));
  });
});

describe('exportFlightsXlsx (T2/11.3 — durations + money + separate logbook column mapping)', () => {
  it('formats duration as H:MM, amount as a numeric euro cell, the type column with the solo suffix, and the separate partenza/arrivo/orari/decolli/PIC columns', async () => {
    listFlightsMock.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
      items: [
        {
          id: 'flight_1',
          flightDate: '2026-07-10',
          flightType: 'SCHOOL',
          isSolo: true,
          noCharge: false,
          departureAirfield: 'Campo Sud',
          arrivalAirfield: 'Campo Nord',
          takeoffAt: new Date('2026-07-10T09:00:00Z'),
          landingAt: new Date('2026-07-10T10:35:00Z'),
          minutes: 95,
          takeoffs: 2,
          landings: 3,
          aircraft: { id: 'ac_1', registration: 'I-ABCD' },
          person: { id: 'p_1', firstName: 'Mario', lastName: 'Rossi' },
          instructor: null,
          breakdown: {
            aircraftRateCentsPerHour: 10000,
            aircraftAmountCents: 12345,
            totalAmountCents: 12345,
          },
          createdAt: new Date('2026-07-10T10:00:00Z'),
        },
      ],
    } as never);

    const { buffer } = await exportFlightsXlsx(ACTOR, { page: 1, pageSize: 20, locale: 'it' });
    const sheet = await readSheet(buffer);
    const row = sheet.getRow(2);

    expect(row.getCell(1).value).toBe('10/07/2026'); // date (formatDateOnly)
    expect(row.getCell(3).value).toBe('Rossi Mario'); // person
    expect(row.getCell(4).value).toBeNull(); // no instructor
    expect(row.getCell(5).value).toBe('Scuola — solista'); // type + solo suffix
    expect(row.getCell(6).value).toBe('Campo Sud'); // partenza
    expect(row.getCell(7).value).toBe('Campo Nord'); // arrivo
    expect(row.getCell(8).value).toBe('11:00'); // ora decollo (09:00Z -> CEST +2)
    expect(row.getCell(9).value).toBe('12:35'); // ora atterraggio
    expect(row.getCell(10).value).toBe('1:35'); // duration H:MM
    expect(row.getCell(11).value).toBe(2); // decolli
    expect(row.getCell(12).value).toBe(3); // atterraggi
    expect(row.getCell(13).value).toBe('Rossi Mario'); // PIC: SCHOOL flown solo -> the flight's own person
    expect(row.getCell(14).value).toBe(123.45); // amount, numeric cents/100
    expect(row.getCell(14).numFmt).toBe('#,##0.00 "€"');
    // Story 19.6 (AC 27): no Stato column anymore — the amount is the last one.
    expect(sheet.getRow(1).cellCount).toBe(14);
    expect(row.getCell(15).value).toBeNull();
  });

  it('exports null cells for the airfield/time columns on a historical (pre-11.1) flight, keeping takeoffs/landings as real numbers', async () => {
    listFlightsMock.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
      items: [
        {
          id: 'flight_hist',
          flightDate: '2020-01-01',
          flightType: 'TOURISM',
          isSolo: false,
          noCharge: false,
          departureAirfield: null,
          arrivalAirfield: null,
          takeoffAt: null,
          landingAt: null,
          minutes: 30,
          takeoffs: 1,
          landings: 1,
          aircraft: { id: 'ac_1', registration: 'I-ABCD' },
          person: { id: 'p_1', firstName: 'Mario', lastName: 'Rossi' },
          instructor: null,
          breakdown: {
            aircraftRateCentsPerHour: 10000,
            aircraftAmountCents: 5000,
            totalAmountCents: 5000,
          },
          createdAt: new Date('2020-01-01T10:00:00Z'),
        },
      ],
    } as never);

    const { buffer } = await exportFlightsXlsx(ACTOR, { page: 1, pageSize: 20, locale: 'it' });
    const sheet = await readSheet(buffer);
    const row = sheet.getRow(2);

    expect(row.getCell(6).value).toBeNull(); // partenza
    expect(row.getCell(7).value).toBeNull(); // arrivo
    expect(row.getCell(8).value).toBeNull(); // ora decollo
    expect(row.getCell(9).value).toBeNull(); // ora atterraggio
    expect(row.getCell(11).value).toBe(1); // decolli — never null (story 11.1 default)
    expect(row.getCell(12).value).toBe(1); // atterraggi — never null (story 11.1 default)
  });

  it('a SCHOOL flight flown dual (doppio comando): the PIC column resolves to the instructor', async () => {
    listFlightsMock.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
      items: [
        {
          id: 'flight_dual',
          flightDate: '2026-07-03',
          flightType: 'SCHOOL',
          isSolo: false,
          noCharge: false,
          departureAirfield: 'Campo Sud',
          arrivalAirfield: 'Campo Nord',
          takeoffAt: new Date('2026-07-03T09:00:00Z'),
          landingAt: new Date('2026-07-03T09:40:00Z'),
          minutes: 40,
          takeoffs: 1,
          landings: 1,
          aircraft: { id: 'ac_1', registration: 'I-ABCD' },
          person: { id: 'p_1', firstName: 'Mario', lastName: 'Rossi' },
          instructor: { personId: 'i_1', firstName: 'Anna', lastName: 'Bianchi' },
          breakdown: {
            aircraftRateCentsPerHour: 10000,
            aircraftAmountCents: 4000,
            totalAmountCents: 4000,
          },
          createdAt: new Date('2026-07-03T10:00:00Z'),
        },
      ],
    } as never);

    const { buffer } = await exportFlightsXlsx(ACTOR, { page: 1, pageSize: 20, locale: 'it' });
    const sheet = await readSheet(buffer);
    const row = sheet.getRow(2);

    expect(row.getCell(13).value).toBe('Bianchi Anna'); // PIC: SCHOOL dual -> the instructor
  });

  it('reuses listFlights with the SAME actor/filters, overriding page/pageSize', async () => {
    listFlightsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: EXPORT_MAX_ROWS });
    const query = { page: 2, pageSize: 20, aircraftId: 'ac_1', flightType: 'SCHOOL' as const };

    await exportFlightsXlsx(ACTOR, query);

    expect(listFlightsMock).toHaveBeenCalledWith(ACTOR, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  });
});

describe('exportCashMovementsXlsx (T2 — signed amount column mapping)', () => {
  it('keeps a negative (uscita) amount as a real negative NUMERIC cell, not a string', async () => {
    listCashMovementsMock.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
      items: [
        {
          id: 'cm_1',
          categoryId: 'cat_1',
          categoryName: 'Carburante',
          amountCents: -5000,
          effectiveDate: '2026-07-01',
          description: null,
          actorEmail: 'staff@airmanager.local',
          createdAt: new Date('2026-07-01T09:00:00Z'),
          reversalOfId: null,
          hasReversal: false,
          isAutomatic: false,
        },
      ],
    } as never);

    const { buffer } = await exportCashMovementsXlsx(ACTOR, { page: 1, pageSize: 20, locale: 'it' });
    const sheet = await readSheet(buffer);
    const row = sheet.getRow(2);

    expect(row.getCell(1).value).toBe('01/07/2026');
    expect(row.getCell(2).value).toBe('Carburante');
    expect(row.getCell(3).value).toBeNull(); // no description
    expect(row.getCell(4).value).toBe(-50);
    expect(row.getCell(4).numFmt).toBe('#,##0.00 "€"');
    expect(row.getCell(5).value).toBe('staff@airmanager.local');
  });
});

describe('exportExpiriesXlsx (T2 — date-only column mapping)', () => {
  it('formats expiresAt as DD/MM/YYYY (formatDateOnly), never a raw ISO string', async () => {
    listAllExpiriesMock.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
      items: [
        {
          id: 'exp_1',
          personId: 'p_1',
          personFirstName: 'Mario',
          personLastName: 'Rossi',
          expiryTypeId: 'type_1',
          typeName: 'Visita medica',
          typeScope: 'PILOTS',
          expiresAt: '2027-01-15',
          notes: null,
          status: 'ok',
        },
      ],
    } as never);

    const { buffer } = await exportExpiriesXlsx(ACTOR, { page: 1, pageSize: 20, locale: 'it' });
    const sheet = await readSheet(buffer);
    const row = sheet.getRow(2);

    expect(row.getCell(1).value).toBe('Rossi Mario');
    expect(row.getCell(2).value).toBe('Visita medica');
    expect(row.getCell(3).value).toBe('Piloti');
    expect(row.getCell(4).value).toBe('15/01/2027');
    expect(row.getCell(5).value).toBe('In regola');
  });
});

/** The DERIVED currency row of the unified registry (story 19.7b) — no type, no type scope, always a date. */
const CURRENCY_REGISTRY_ROW = {
  id: 'currency:p_1',
  source: 'DERIVED',
  category: 'CURRENCY',
  personId: 'p_1',
  personFirstName: 'Mario',
  personLastName: 'Rossi',
  expiryTypeId: null,
  typeName: null,
  typeScope: null,
  expiresAt: '2026-11-05',
  notes: null,
  status: 'expiring',
  daysUntil: 3,
  currency: { lastFlightDate: '2026-08-07', flightsInWindow: 1, minFlights: 1, windowDays: 90 },
};

describe('exportExpiriesXlsx / exportExpiriesPdf — the currency row of the unified registry (story 19.7b, AD-4)', () => {
  it('xlsx: the category as the type, «—» as the scope, its date and status', async () => {
    listAllExpiriesMock.mockResolvedValue({ total: 1, page: 1, pageSize: EXPORT_MAX_ROWS, items: [CURRENCY_REGISTRY_ROW] } as never);

    const { buffer } = await exportExpiriesXlsx(ACTOR, { page: 1, pageSize: 20, locale: 'it' });
    const sheet = await readSheet(buffer);

    expect([1, 2, 3, 4, 5].map((cell) => sheet.getRow(2).getCell(cell).value)).toEqual(['Rossi Mario', 'Currency', '—', '05/11/2026', 'In scadenza']);
  });

  it('xlsx in English: the category', async () => {
    listAllExpiriesMock.mockResolvedValue({ total: 1, page: 1, pageSize: EXPORT_MAX_ROWS, items: [CURRENCY_REGISTRY_ROW] } as never);

    const { buffer } = await exportExpiriesXlsx(ACTOR, { page: 1, pageSize: 20, locale: 'en' });
    const sheet = await readSheet(buffer);

    expect(sheet.getRow(2).getCell(2).value).toBe('Currency');
  });

  it('pdf: same cells, the status in its own colour', async () => {
    listAllExpiriesMock.mockResolvedValue({ total: 1, page: 1, pageSize: PDF_EXPORT_MAX_ROWS, items: [CURRENCY_REGISTRY_ROW] } as never);

    await exportExpiriesPdf(ACTOR, { page: 1, pageSize: 20, locale: 'it' });
    const props = lastPdfProps();
    const column = (header: string) => props.columns.find((c) => c.header === header)!;

    expect(['Tipo', 'Ambito', 'Scadenza', 'Stato'].map((header) => column(header).value(props.rows[0]!))).toEqual(['Currency', '—', '05/11/2026', 'In scadenza']);
    expect(column('Stato').color!(props.rows[0]!)).toBe('#956400');
  });
});

describe('exportInstructorCompensationXlsx (story 12.7, AC 3 — payout rate/owed money columns)', () => {
  it('maps name/hours + the payout rate and owed as numeric euro cells, null when the instructor has no payout rate', async () => {
    getCompensationSummaryMock.mockResolvedValue([
      { instructorProfileId: 'ip_1', personId: 'p_1', firstName: 'Ines', lastName: 'Bianchi', payoutRateCents: 6000, totalMinutes: 90, owedTotalCents: 9000 },
      { instructorProfileId: 'ip_2', personId: 'p_2', firstName: 'Luca', lastName: 'Verdi', payoutRateCents: null, totalMinutes: 0, owedTotalCents: null },
    ] as never);

    const { buffer } = await exportInstructorCompensationXlsx(ACTOR, { locale: 'it' });
    const sheet = await readSheet(buffer);

    const withRate = sheet.getRow(2);
    expect(withRate.getCell(1).value).toBe('Bianchi Ines');
    expect(withRate.getCell(2).value).toBe(60); // 6000 cents → 60 as a real numeric euro cell (MONEY_NUM_FMT), never a string
    expect(withRate.getCell(3).value).toBe(formatMinutes(90));
    expect(withRate.getCell(4).value).toBe(90); // owed 9000 cents → 90

    const noRate = sheet.getRow(3);
    expect(noRate.getCell(1).value).toBe('Verdi Luca');
    expect(noRate.getCell(2).value).toBeNull(); // rate null when the instructor has no payout rate
    expect(noRate.getCell(4).value).toBeNull(); // owed null when no rate
  });
});

describe('exportTransactionsXlsx (story 12.9, AC 2 — unified ledger; story Billing-2 — Tipo is now bookType, kind folded into Descrizione, Entrate/Uscite split)', () => {
  it('Tipo shows the coarse bookType (translated), Descrizione folds in the granular kind (translated for ACCOUNT, verbatim for CASH), Entrate/Uscite are split, and Stato is derived', async () => {
    listTransactionsMock.mockResolvedValue({
      total: 2,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
      items: [
        {
          id: 'am_1',
          source: 'ACCOUNT',
          date: '2026-07-10',
          personId: 'p_1',
          personName: 'Nakamura Elena',
          kind: 'FLIGHT_CHARGE',
          bookType: 'REVENUE',
          description: null,
          // Review F7: raw DB direction — a FLIGHT_CHARGE is a debit against
          // the pilot's account, always negative; `ledgerClubAmountCents`
          // negates a REVENUE-booked ACCOUNT row into the club's own
          // Entrate (185,00 €), the SAME sign `computeRevenueCents` sums.
          amountCents: -18500,
          method: null,
          reference: 'flight_1',
          reversal: false,
          reversed: false,
          actionable: false,
        },
        {
          id: 'cm_1',
          source: 'CASH',
          date: '2026-07-09',
          personId: null,
          personName: null,
          kind: 'Carburante',
          bookType: 'COST',
          description: 'Rifornimento',
          amountCents: -5000,
          method: null,
          reference: null,
          reversal: false,
          reversed: true,
          actionable: false,
        },
      ],
    } as never);

    const { buffer } = await exportTransactionsXlsx(ACTOR, { page: 1, pageSize: 20, locale: 'it' });
    const sheet = await readSheet(buffer);

    const accountRow = sheet.getRow(2);
    expect(accountRow.getCell(2).value).toBe('Nakamura Elena');
    expect(accountRow.getCell(3).value).toBe('Ricavo'); // BillingPage.table.bookTypes.REVENUE
    expect(accountRow.getCell(4).value).toBe('Addebito volo'); // AccountStatementPage.movementType.flightCharge, no free-text description to append
    expect(accountRow.getCell(6).value).toBe(185); // Entrate
    expect(accountRow.getCell(7).value).toBeNull(); // Uscite
    expect(accountRow.getCell(8).value).toBe('Registrato');

    const cashRow = sheet.getRow(3);
    expect(cashRow.getCell(3).value).toBe('Costo'); // BillingPage.table.bookTypes.COST
    expect(cashRow.getCell(4).value).toBe('Carburante — Rifornimento'); // verbatim category name + free-text description
    expect(cashRow.getCell(6).value).toBeNull(); // Entrate
    expect(cashRow.getCell(7).value).toBe(50); // Uscite
    expect(cashRow.getCell(8).value).toBe('Stornato');
  });

  it('rejects with 422 EXPORT_TOO_LARGE when the filtered total exceeds the cap', async () => {
    listTransactionsMock.mockResolvedValue({ total: EXPORT_MAX_ROWS + 1, page: 1, pageSize: EXPORT_MAX_ROWS, items: [] } as never);

    await expect(exportTransactionsXlsx(ACTOR, { page: 1, pageSize: 20, locale: 'it' })).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE' });
  });
});

// =============================================================================
// PDF exports (story 10.2) — content assertions run against the PROPS passed
// to the mocked `renderReportPdf` (Dev Notes: "asserzioni sui contenuti a
// livello unit sull'input passato all'adapter"), never a parsed buffer.
// =============================================================================

describe('assertWithinPdfExportCap (story 10.2, AC 4)', () => {
  it('does not throw at exactly the cap', () => {
    expect(() => assertWithinPdfExportCap(PDF_EXPORT_MAX_ROWS)).not.toThrow();
  });

  it('throws a ValidationError with code EXPORT_TOO_LARGE one row past the cap', () => {
    expect(() => assertWithinPdfExportCap(PDF_EXPORT_MAX_ROWS + 1)).toThrow(expect.objectContaining({ code: 'EXPORT_TOO_LARGE' }));
  });
});

/** Story 19.11: a `listAccountMovements` result — the page plus the period it covers and its two balances. */
function statementFixture(overrides: Record<string, unknown> = {}) {
  return { items: [], total: 0, page: 1, pageSize: PDF_EXPORT_MAX_ROWS, from: null, to: null, openingBalanceCents: 0, closingBalanceCents: 0, ...overrides } as never;
}

/** Two movements of the SAME day, most recent first (the service's order), with their running balances over an opening of 100,00 €. */
const PERIOD_ITEMS = [
  {
    id: 'mv_2',
    type: 'FLIGHT_CHARGE',
    amountCents: -5000,
    effectiveDate: '2026-07-10',
    description: null,
    createdAt: new Date('2026-07-10T11:00:00Z'),
    actorEmail: 'staff@airmanager.local',
    reversalOfId: null,
    hasReversal: false,
    balanceAfterCents: 25000,
    reversalOfEffectiveDate: null,
  },
  {
    id: 'mv_1',
    type: 'TOP_UP',
    amountCents: 20000,
    effectiveDate: '2026-07-10',
    description: 'Ricarica POS',
    createdAt: new Date('2026-07-10T09:00:00Z'),
    actorEmail: 'staff@airmanager.local',
    reversalOfId: null,
    hasReversal: false,
    balanceAfterCents: 30000,
    reversalOfEffectiveDate: null,
  },
];

describe('exportAccountStatementPdf (story 10.2, AC 2/3/4; story 19.11, AC 24)', () => {
  it('reuses listAccountMovements with page:1/pageSize:PDF_EXPORT_MAX_ROWS, and rejects EXPORT_TOO_LARGE before reading person/branding', async () => {
    listAccountMovementsMock.mockResolvedValue(statementFixture({ total: PDF_EXPORT_MAX_ROWS + 1 }));

    await expect(exportAccountStatementPdf(ACTOR, 'person_1', {})).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE' });

    expect(listAccountMovementsMock).toHaveBeenCalledWith(ACTOR, 'person_1', { page: 1, pageSize: PDF_EXPORT_MAX_ROWS });
    expect(getPersonMock).not.toHaveBeenCalled();
    expect(getAirfieldBrandingMock).not.toHaveBeenCalled();
  });

  it('without a period: the whole history, a Saldo column, NO opening line, and the closing balance as "Saldo finale" — never a second read of the current balance', async () => {
    listAccountMovementsMock.mockResolvedValue(statementFixture({ total: 1, items: [{ ...PERIOD_ITEMS[1], balanceAfterCents: 42000 }], closingBalanceCents: 42000 }));
    getPersonMock.mockResolvedValue({ id: 'person_1', firstName: 'Mario', lastName: 'Rossi' } as never);

    const { buffer, filename } = await exportAccountStatementPdf(ACTOR, 'person_1', { locale: 'it' });

    expect(buffer.toString('latin1').startsWith('%PDF-')).toBe(true);
    expect(filename).toMatch(/^airmanager-account-statement-\d{4}-\d{2}-\d{2}\.pdf$/);

    const props = lastPdfProps();
    expect(props.title).toBe('Estratto conto');
    expect(props.subtitle).toBe('Rossi Mario');
    expect(props.branding).toEqual(BRANDING);
    expect(props.columns.map((c) => c.header)).toEqual(['Data', 'Tipo', 'Descrizione', 'Importo', 'Saldo', 'Registrato da']);
    expect(props.rows).toHaveLength(1);
    expect(props.columns.map((c) => c.value(props.rows[0]))).toEqual(['10/07/2026', 'Ricarica', 'Ricarica POS', '+200,00 €', '420,00 €', 'staff@airmanager.local']);
    expect(props.totals).toEqual([{ label: 'Saldo finale', value: '420,00 €' }]);
    expect(getAccountOverviewMock).not.toHaveBeenCalled();
  });

  it('drops the "registrato da" column for an actor without people.read (own access)', async () => {
    listAccountMovementsMock.mockResolvedValue(statementFixture({ total: 1, items: [{ ...PERIOD_ITEMS[0], actorEmail: undefined }], closingBalanceCents: -5000 }));
    getPersonMock.mockResolvedValue({ id: 'person_1', firstName: 'Mario', lastName: 'Rossi' } as never);

    const pilotActor: Actor = { userId: 'u2', personId: 'person_1', roles: ['PILOT'] };
    await exportAccountStatementPdf(pilotActor, 'person_1', { locale: 'it' });

    const props = lastPdfProps();
    expect(props.columns.map((c) => c.header)).toEqual(['Data', 'Tipo', 'Descrizione', 'Importo', 'Saldo']);
  });

  it('with a period: rows in the screen order, the "Saldo iniziale" line LAST, the period subtitle, and the opening/closing balances of the period as totals', async () => {
    listAccountMovementsMock.mockResolvedValue(
      statementFixture({ total: 2, items: PERIOD_ITEMS, from: '2026-07-01', to: '2026-07-31', openingBalanceCents: 10000, closingBalanceCents: 25000 }),
    );
    getPersonMock.mockResolvedValue({ id: 'person_1', firstName: 'Mario', lastName: 'Rossi' } as never);

    await exportAccountStatementPdf(ACTOR, 'person_1', { locale: 'it', from: '2026-07-01', to: '2026-07-31' });

    expect(listAccountMovementsMock).toHaveBeenCalledWith(ACTOR, 'person_1', {
      page: 1,
      pageSize: PDF_EXPORT_MAX_ROWS,
      from: '2026-07-01',
      to: '2026-07-31',
    });
    const props = lastPdfProps();
    expect(props.subtitle).toBe('Rossi Mario · 01/07/2026 – 31/07/2026');
    expect(props.rows.map((row) => props.columns.map((c) => c.value(row)))).toEqual([
      ['10/07/2026', 'Addebito volo', '', '-50,00 €', '250,00 €', 'staff@airmanager.local'],
      ['10/07/2026', 'Ricarica', 'Ricarica POS', '+200,00 €', '300,00 €', 'staff@airmanager.local'],
      ['01/07/2026', 'Saldo iniziale', '', '', '100,00 €', ''],
    ]);
    expect(props.totals).toEqual([
      { label: 'Saldo iniziale al 01/07/2026', value: '100,00 €' },
      { label: 'Saldo finale al 31/07/2026', value: '250,00 €' },
    ]);
    expect(getAccountOverviewMock).not.toHaveBeenCalled();
  });

  it('a lone `from`: the opening total and line, and the closing one as plain "Saldo finale" (no date to name)', async () => {
    listAccountMovementsMock.mockResolvedValue(statementFixture({ total: 0, from: '2026-07-01', openingBalanceCents: 10000, closingBalanceCents: 10000 }));
    getPersonMock.mockResolvedValue({ id: 'person_1', firstName: 'Mario', lastName: 'Rossi' } as never);

    await exportAccountStatementPdf(ACTOR, 'person_1', { locale: 'en', from: '2026-07-01' });

    const props = lastPdfProps();
    expect(props.subtitle).toBe('Rossi Mario');
    expect(props.rows).toHaveLength(1);
    expect(props.totals).toEqual([
      { label: 'Opening balance on 01/07/2026', value: '€100.00' },
      { label: 'Final balance', value: '€100.00' },
    ]);
  });

  it('rejects EXPORT_TOO_LARGE on the PERIOD-FILTERED total — the cap reads the total AFTER from/to are applied', async () => {
    listAccountMovementsMock.mockResolvedValue(statementFixture({ total: PDF_EXPORT_MAX_ROWS + 1, from: '2026-07-01', to: '2026-07-31' }));

    await expect(exportAccountStatementPdf(ACTOR, 'person_1', { locale: 'it', from: '2026-07-01', to: '2026-07-31' })).rejects.toMatchObject({
      code: 'EXPORT_TOO_LARGE',
    });

    expect(listAccountMovementsMock).toHaveBeenCalledWith(ACTOR, 'person_1', expect.objectContaining({ from: '2026-07-01', to: '2026-07-31' }));
  });
});

describe('exportAccountMovementsXlsx (story 10.1; story 19.11, AC 23)', () => {
  it('reuses listAccountMovements on the SAME period with page:1/pageSize:EXPORT_MAX_ROWS and rejects EXPORT_TOO_LARGE', async () => {
    listAccountMovementsMock.mockResolvedValue(statementFixture({ total: EXPORT_MAX_ROWS + 1, pageSize: EXPORT_MAX_ROWS }));
    const query = { page: 3, pageSize: 20, format: 'xlsx' as const, locale: 'it' as const, from: '2026-07-01', to: '2026-07-31' };

    await expect(exportAccountMovementsXlsx(ACTOR, 'person_1', query)).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE' });

    expect(listAccountMovementsMock).toHaveBeenCalledWith(ACTOR, 'person_1', { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  });

  it('writes Data/Tipo/Descrizione/Importo/Saldo/Registrato da, both money columns NUMERIC, the rows in the screen order and the "Saldo iniziale" line last with an empty amount', async () => {
    listAccountMovementsMock.mockResolvedValue(
      statementFixture({ total: 2, pageSize: EXPORT_MAX_ROWS, items: PERIOD_ITEMS, from: '2026-07-01', to: '2026-07-31', openingBalanceCents: 10000, closingBalanceCents: 25000 }),
    );

    const { buffer } = await exportAccountMovementsXlsx(ACTOR, 'person_1', { page: 1, pageSize: 20, format: 'xlsx', locale: 'it', from: '2026-07-01', to: '2026-07-31' });

    const sheet = await readSheet(buffer);
    expect(sheet.getRow(1).values).toEqual([undefined, 'Data', 'Tipo', 'Descrizione', 'Importo', 'Saldo', 'Registrato da']);
    expect(sheet.rowCount).toBe(4);
    expect(sheet.getRow(2).getCell(2).value).toBe('Addebito volo');
    expect(sheet.getRow(2).getCell(4).value).toBe(-50);
    expect(sheet.getRow(2).getCell(5).value).toBe(250);
    expect(sheet.getRow(2).getCell(5).numFmt).toBe('#,##0.00 "€"');
    expect(sheet.getRow(3).getCell(5).value).toBe(300);
    const opening = sheet.getRow(4);
    expect(opening.getCell(1).value).toBe('01/07/2026');
    expect(opening.getCell(2).value).toBe('Saldo iniziale');
    expect(opening.getCell(4).value).toBeNull();
    expect(opening.getCell(5).value).toBe(100);
    expect(opening.getCell(5).numFmt).toBe('#,##0.00 "€"');
  });

  it('without a period: no opening line; an actor without people.read gets no "Registrato da" column', async () => {
    listAccountMovementsMock.mockResolvedValue(statementFixture({ total: 1, pageSize: EXPORT_MAX_ROWS, items: [{ ...PERIOD_ITEMS[1], actorEmail: undefined }] }));
    const pilotActor: Actor = { userId: 'u2', personId: 'person_1', roles: ['PILOT'] };

    const { buffer } = await exportAccountMovementsXlsx(pilotActor, 'person_1', { page: 1, pageSize: 20, format: 'xlsx', locale: 'it' });

    const sheet = await readSheet(buffer);
    expect(sheet.getRow(1).values).toEqual([undefined, 'Data', 'Tipo', 'Descrizione', 'Importo', 'Saldo']);
    expect(sheet.rowCount).toBe(2);
  });
});

describe('exportCashReportPdf (story 10.2, AC 2/3)', () => {
  it('reuses getCashReport with the SAME actor/query, maps categories to columns, and carries totalIn/totalOut/net as totals', async () => {
    getCashReportMock.mockResolvedValue({
      from: '2026-07-01',
      to: '2026-07-31',
      totalInCents: 100000,
      totalOutCents: -40000,
      netCents: 60000,
      movementCount: 5,
      categories: [{ categoryId: 'cat_1', categoryName: 'Carburante', inCents: 0, outCents: -40000, netCents: -40000 }],
    });

    const { buffer } = await exportCashReportPdf(ACTOR, { from: '2026-07-01', to: '2026-07-31', locale: 'it' });

    expect(buffer.toString('latin1').startsWith('%PDF-')).toBe(true);
    expect(getCashReportMock).toHaveBeenCalledWith(ACTOR, { from: '2026-07-01', to: '2026-07-31', locale: 'it' });

    const props = lastPdfProps();
    expect(props.title).toBe('Report finanziario');
    expect(props.subtitle).toBe('01/07/2026 – 31/07/2026');
    expect(props.columns.map((c) => c.header)).toEqual(['Categoria', 'Entrate', 'Uscite', 'Netto']);
    expect(props.columns.map((c) => c.value(props.rows[0]))).toEqual(['Carburante', '0,00 €', '-400,00 €', '-400,00 €']);
    expect(props.totals).toEqual([
      { label: 'Entrate', value: '1.000,00 €' },
      { label: 'Uscite', value: '-400,00 €' },
      { label: 'Saldo del periodo', value: '+600,00 €' },
    ]);
  });
});

describe('exportFlightsPdf (story 10.2, AC 2/3/4; story 11.3, AC 3/4 — compact tratta/orari/dec.-att./PIC columns)', () => {
  it('reuses listFlights with page:1/pageSize:PDF_EXPORT_MAX_ROWS, rejects EXPORT_TOO_LARGE, sums duration/amount into totals, and maps the compact logbook columns (tratta/orari/dec.-att./PIC), including the historical-null case', async () => {
    listFlightsMock.mockResolvedValue({ items: [], total: PDF_EXPORT_MAX_ROWS + 1, page: 1, pageSize: PDF_EXPORT_MAX_ROWS });
    await expect(exportFlightsPdf(ACTOR, { page: 1, pageSize: 20 })).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE' });

    listFlightsMock.mockReset();
    listFlightsMock.mockResolvedValue({
      total: 2,
      page: 1,
      pageSize: PDF_EXPORT_MAX_ROWS,
      items: [
        {
          id: 'f1',
          flightDate: '2026-07-01',
          flightType: 'TOURISM',
          isSolo: false,
          noCharge: false,
          departureAirfield: 'Campo Sud',
          arrivalAirfield: 'Campo Nord',
          takeoffAt: new Date('2026-07-01T09:00:00Z'),
          landingAt: new Date('2026-07-01T10:00:00Z'),
          minutes: 60,
          takeoffs: 1,
          landings: 2,
          aircraft: { id: 'ac_1', registration: 'I-ABCD' },
          person: { id: 'p_1', firstName: 'Mario', lastName: 'Rossi' },
          instructor: null,
          breakdown: { totalAmountCents: 10000 },
        },
        {
          // Historical (pre-11.1) flight: no departure/arrival/takeoff/landing data.
          id: 'f2',
          flightDate: '2026-07-02',
          flightType: 'SCHOOL',
          isSolo: true,
          noCharge: false,
          departureAirfield: null,
          arrivalAirfield: null,
          takeoffAt: null,
          landingAt: null,
          minutes: 30,
          takeoffs: 1,
          landings: 1,
          aircraft: { id: 'ac_1', registration: 'I-ABCD' },
          person: { id: 'p_2', firstName: 'Luigi', lastName: 'Verdi' },
          instructor: { personId: 'i_1', firstName: 'Anna', lastName: 'Bianchi' },
          breakdown: { totalAmountCents: 5000 },
        },
      ],
    } as never);

    const { buffer, filename } = await exportFlightsPdf(ACTOR, { page: 1, pageSize: 20, dateFrom: '2026-07-01', dateTo: '2026-07-31', locale: 'it' });

    expect(buffer.toString('latin1').startsWith('%PDF-')).toBe(true);
    expect(filename).toMatch(/^airmanager-flights-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(listFlightsMock).toHaveBeenLastCalledWith(
      ACTOR,
      expect.objectContaining({ page: 1, pageSize: PDF_EXPORT_MAX_ROWS, dateFrom: '2026-07-01', dateTo: '2026-07-31' }),
    );

    const props = lastPdfProps();
    expect(props.subtitle).toBe('01/07/2026 – 31/07/2026');
    const [row1, row2] = props.rows;
    const typeColumn = props.columns.find((c) => c.header === 'Tipo')!;
    expect(typeColumn.value(row1)).toBe('Turismo');
    expect(typeColumn.value(row2)).toBe('Scuola — solista');
    const durationColumn = props.columns.find((c) => c.header === 'Durata')!;
    expect(durationColumn.value(row1)).toBe('1:00');
    const routeColumn = props.columns.find((c) => c.header === 'Tratta')!;
    expect(routeColumn.value(row1)).toBe('Campo Sud -> Campo Nord'); // ASCII arrow: `→` is outside the PDF's WinAnsi font (AC 3)
    expect(routeColumn.value(row2)).toBe(''); // historical, no logbook data — empty string, never null
    const timesColumn = props.columns.find((c) => c.header === 'Orari')!;
    expect(timesColumn.value(row1)).toBe('11:00 – 12:00'); // 09:00Z–10:00Z -> CEST +2 (spaced dash, AC 3: wrap point)
    expect(timesColumn.value(row2)).toBe('');
    const movementsColumn = props.columns.find((c) => c.header === 'Decolli/Atterraggi')!;
    expect(movementsColumn.value(row1)).toBe('1 / 2');
    expect(movementsColumn.value(row2)).toBe('1 / 1');
    const picColumn = props.columns.find((c) => c.header === 'PIC')!;
    expect(picColumn.value(row1)).toBe('Rossi Mario'); // non-SCHOOL -> the flight's own person
    expect(picColumn.value(row2)).toBe('Verdi Luigi'); // SCHOOL flown solo -> the allievo, even with an instructor on record
    // Story 19.6 (AC 27): no Stato column anymore — the amount is the last one.
    expect(props.columns.map((c) => c.header).at(-1)).toBe('Addebito');
    expect(props.columns.map((c) => c.header)).not.toContain('Stato');
    expect(props.totals).toEqual([
      { label: 'Durata totale', value: '1:30' },
      { label: 'Totale addebiti', value: '150,00 €' },
    ]);
  });

  it('a SCHOOL flight flown dual (doppio comando): the PIC column resolves to the instructor', async () => {
    listFlightsMock.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: PDF_EXPORT_MAX_ROWS,
      items: [
        {
          id: 'f3',
          flightDate: '2026-07-03',
          flightType: 'SCHOOL',
          isSolo: false,
          noCharge: false,
          departureAirfield: 'Campo Sud',
          arrivalAirfield: 'Campo Nord',
          takeoffAt: new Date('2026-07-03T09:00:00Z'),
          landingAt: new Date('2026-07-03T09:40:00Z'),
          minutes: 40,
          takeoffs: 1,
          landings: 1,
          aircraft: { id: 'ac_1', registration: 'I-ABCD' },
          person: { id: 'p_1', firstName: 'Mario', lastName: 'Rossi' },
          instructor: { personId: 'i_1', firstName: 'Anna', lastName: 'Bianchi' },
          breakdown: { totalAmountCents: 4000 },
        },
      ],
    } as never);

    await exportFlightsPdf(ACTOR, { page: 1, pageSize: 20 });

    const props = lastPdfProps();
    const picColumn = props.columns.find((c) => c.header === 'PIC')!;
    expect(picColumn.value(props.rows[0])).toBe('Bianchi Anna');
  });

  it('omits the subtitle when no dateFrom/dateTo filter is applied', async () => {
    listFlightsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: PDF_EXPORT_MAX_ROWS });

    await exportFlightsPdf(ACTOR, { page: 1, pageSize: 20 });

    expect(lastPdfProps().subtitle).toBeNull();
  });
});

describe('exportExpiriesPdf (story 10.2, AC 2/3)', () => {
  it('reuses listAllExpiries, colors the status column with the badge palette, and has no totals', async () => {
    listAllExpiriesMock.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: PDF_EXPORT_MAX_ROWS,
      items: [
        {
          id: 'exp_1',
          personId: 'p_1',
          personFirstName: 'Mario',
          personLastName: 'Rossi',
          expiryTypeId: 'type_1',
          typeName: 'Visita medica',
          typeScope: 'PILOTS',
          expiresAt: '2026-08-01',
          notes: null,
          status: 'expired',
        },
      ],
    } as never);

    const { buffer } = await exportExpiriesPdf(ACTOR, { page: 1, pageSize: 20, locale: 'it' });

    expect(buffer.toString('latin1').startsWith('%PDF-')).toBe(true);
    const props = lastPdfProps();
    expect(props.title).toBe('Tutte le scadenze');
    expect(props.subtitle).toBeNull();
    expect(props.totals).toBeUndefined();

    const statusColumn = props.columns.find((c) => c.header === 'Stato')!;
    const row = props.rows[0];
    expect(statusColumn.value(row)).toBe('Scaduta');
    expect(statusColumn.color!(row)).toBe('#9F2F2D');
  });
});

describe('exportBookingsPdf (story 13.7, AC 2)', () => {
  it('reuses listBookings with page:1/pageSize:PDF_EXPORT_MAX_ROWS and the SAME filters, rejects EXPORT_TOO_LARGE, maps the same columns as the xlsx export (incl. a null instructorName), and has no totals/no subtitle when from/to are absent', async () => {
    listBookingsMock.mockResolvedValue({ items: [], total: PDF_EXPORT_MAX_ROWS + 1, page: 1, pageSize: PDF_EXPORT_MAX_ROWS });
    await expect(exportBookingsPdf(ACTOR, { page: 1, pageSize: 20, status: ['PENDING'] })).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE' });

    listBookingsMock.mockReset();
    listBookingsMock.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: PDF_EXPORT_MAX_ROWS,
      items: [
        {
          id: 'booking_1',
          aircraftId: 'ac_1',
          aircraftRegistration: 'I-ABCD',
          personId: 'p_1',
          personName: 'Mario Rossi',
          instructorProfileId: null,
          instructorName: null,
          startsAt: new Date('2026-07-01T09:00:00Z'),
          endsAt: new Date('2026-07-01T10:00:00Z'),
          notes: null,
          status: 'APPROVED',
          cancelledAt: null,
          forcedAt: null,
          denyReason: null,
          decidedAt: null,
          createdAt: new Date('2026-06-30T09:00:00Z'),
        },
      ],
    } as never);

    const { buffer, filename } = await exportBookingsPdf(ACTOR, { page: 1, pageSize: 20, aircraftId: 'ac_1', locale: 'it' });

    expect(buffer.toString('latin1').startsWith('%PDF-')).toBe(true);
    expect(filename).toMatch(/^airmanager-bookings-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(listBookingsMock).toHaveBeenLastCalledWith(ACTOR, expect.objectContaining({ page: 1, pageSize: PDF_EXPORT_MAX_ROWS, aircraftId: 'ac_1' }));

    const props = lastPdfProps();
    expect(props.title).toBe('Prenotazioni');
    expect(props.subtitle).toBeNull();
    expect(props.totals).toBeUndefined();

    const row = props.rows[0];
    expect(props.columns.find((c) => c.header === 'Aereo')!.value(row)).toBe('I-ABCD');
    expect(props.columns.find((c) => c.header === 'Pilota')!.value(row)).toBe('Mario Rossi');
    expect(props.columns.find((c) => c.header === 'Istruttore')!.value(row)).toBe(''); // null instructorName -> empty string, never null
    expect(props.columns.find((c) => c.header === 'Inizio')!.value(row)).toBe('01/07/2026, 11:00'); // 09:00Z -> CEST +2
    expect(props.columns.find((c) => c.header === 'Stato')!.value(row)).toBe('Approvato');
  });

  it('a masked personName (story 14.5, ratifica R3: listBookings already nulled it for a pilot/student actor viewing someone else\'s booking) renders "Occupato", never a blank cell', async () => {
    listBookingsMock.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: PDF_EXPORT_MAX_ROWS,
      items: [
        {
          id: 'booking_1',
          aircraftId: 'ac_1',
          aircraftRegistration: 'I-ABCD',
          personId: 'someone_else',
          personName: null,
          instructorProfileId: null,
          instructorName: null,
          startsAt: new Date('2026-07-01T09:00:00Z'),
          endsAt: new Date('2026-07-01T10:00:00Z'),
          notes: null,
          status: 'APPROVED',
          cancelledAt: null,
          forcedAt: null,
          denyReason: null,
          decidedAt: null,
          createdAt: new Date('2026-06-30T09:00:00Z'),
        },
      ],
    } as never);

    await exportBookingsPdf(ACTOR, { page: 1, pageSize: 20, locale: 'it' });

    const row = lastPdfProps().rows[0];
    expect(lastPdfProps().columns.find((c) => c.header === 'Pilota')!.value(row)).toBe('Occupato');
  });

  it('open-ended subtitle (PO decision, review F7): from-only — the real UI case, since the booking list has no `to` filter — reads "Dal <date>"/"From <date>"', async () => {
    listBookingsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: PDF_EXPORT_MAX_ROWS });

    await exportBookingsPdf(ACTOR, { page: 1, pageSize: 20, from: '2026-07-01T09:00:00.000Z', locale: 'it' });
    expect(lastPdfProps().subtitle).toBe('Dal 01/07/2026');

    await exportBookingsPdf(ACTOR, { page: 1, pageSize: 20, from: '2026-07-01T09:00:00.000Z', locale: 'en' });
    expect(lastPdfProps().subtitle).toBe('From 01/07/2026');
  });

  it('open-ended subtitle: from+to uses the SAME period format as every other PDF report ("DD/MM/YYYY – DD/MM/YYYY")', async () => {
    listBookingsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: PDF_EXPORT_MAX_ROWS });

    await exportBookingsPdf(ACTOR, {
      page: 1,
      pageSize: 20,
      from: '2026-07-01T09:00:00.000Z',
      to: '2026-07-31T09:00:00.000Z',
      locale: 'it',
    });
    expect(lastPdfProps().subtitle).toBe('01/07/2026 – 31/07/2026');
  });
});
