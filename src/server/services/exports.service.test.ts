import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';

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
vi.mock('./people.service', () => ({ listPeople: vi.fn() }));
vi.mock('./aircraft.service', () => ({ listAircraft: vi.fn() }));
vi.mock('./flights.service', () => ({ listFlights: vi.fn() }));
vi.mock('./bookings.service', () => ({ listBookings: vi.fn() }));
vi.mock('./ppr.service', () => ({ listPprRequests: vi.fn() }));
vi.mock('./accounts.service', () => ({ listAccountMovements: vi.fn() }));
vi.mock('./cash.service', () => ({ listCashMovements: vi.fn() }));
vi.mock('./expiries.service', () => ({ listAllExpiries: vi.fn() }));
vi.mock('./school.service', () => ({ getStudentHourSummaries: vi.fn(), getInstructorHourSummaries: vi.fn() }));

const { listPeople } = await import('./people.service');
const { listFlights } = await import('./flights.service');
const { listCashMovements } = await import('./cash.service');
const { listAllExpiries } = await import('./expiries.service');
const { EXPORT_MAX_ROWS, assertWithinExportCap, exportPeopleXlsx, exportFlightsXlsx, exportCashMovementsXlsx, exportExpiriesXlsx } =
  await import('./exports.service');

const listPeopleMock = vi.mocked(listPeople);
const listFlightsMock = vi.mocked(listFlights);
const listCashMovementsMock = vi.mocked(listCashMovements);
const listAllExpiriesMock = vi.mocked(listAllExpiries);

const ACTOR: Actor = { userId: 'user_1', personId: null, roles: ['ADMIN'] };

async function readSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  // Same exceljs typings gap as `workbook.test.ts`'s `readBack` — see its doc-comment.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook.worksheets[0]!;
}

beforeEach(() => {
  listPeopleMock.mockReset();
  listFlightsMock.mockReset();
  listCashMovementsMock.mockReset();
  listAllExpiriesMock.mockReset();
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

describe('exportFlightsXlsx (T2 — durations + money column mapping)', () => {
  it('formats duration as H:MM, amount as a numeric euro cell, and the type column with the solo suffix', async () => {
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
          status: 'CANCELLED',
          minutes: 95,
          hourMeterStart: null,
          hourMeterEnd: null,
          landings: null,
          notes: null,
          aircraft: { id: 'ac_1', registration: 'I-ABCD' },
          person: { id: 'p_1', firstName: 'Mario', lastName: 'Rossi' },
          instructor: null,
          breakdown: {
            aircraftRateCentsPerHour: 10000,
            aircraftAmountCents: 12345,
            packageCoveredMinutes: 0,
            chargedMinutes: 95,
            packageConsumptions: [],
            totalAmountCents: 12345,
          },
          createdAt: new Date('2026-07-10T10:00:00Z'),
          cancelledAt: new Date('2026-07-10T11:00:00Z'),
          cancelReason: 'test',
          correctionOfId: null,
          correctedByFlightId: null,
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
    expect(row.getCell(6).value).toBe('1:35'); // duration H:MM
    expect(row.getCell(7).value).toBe(123.45); // amount, numeric cents/100
    expect(row.getCell(7).numFmt).toBe('#,##0.00 "€"');
    expect(row.getCell(9).value).toBe('Annullato'); // status, IT
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
  it('formats issuedAt/expiresAt as DD/MM/YYYY (formatDateOnly), never a raw ISO string', async () => {
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
          issuedAt: '2026-01-15',
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
    expect(row.getCell(4).value).toBe('15/01/2026');
    expect(row.getCell(5).value).toBe('15/01/2027');
    expect(row.getCell(6).value).toBe('In regola');
  });
});
