import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/exports.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Run-unique names (same pattern as `flight-log.spec.ts`). */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const PAST_DATE = '2020-01-01';

/** Same helper as `flight-log.spec.ts`'s `createAircraftWithRate`. */
async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-EX${suffix}`.toUpperCase().slice(0, 20);

  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 100 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };

  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
    data: { priceCentsPerHour, validFrom: PAST_DATE },
  });
  expect(rateResponse.status()).toBe(201);

  return { id: aircraft.id, registration };
}

async function createPilotPerson(page: Page, tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Export';
  const lastName = `${tag}-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  return { personId: person.id, firstName, lastName };
}

type RegisterFlightParams = {
  aircraftId: string;
  personId: string;
  flightDate: string;
  flightType: 'TOURISM' | 'SCHOOL' | 'AERIAL_WORK';
  minutes: number;
};

/** Story 11.1: composes `{ takeoffAt, landingAt }` from the OLD `{ flightDate, minutes }` shape so every call site below stays unchanged. `10:00Z` stays clear of the Europe/Rome midnight boundary. */
async function registerFlight(page: Page, params: RegisterFlightParams): Promise<{ id: string }> {
  const { flightDate, minutes, ...rest } = params;
  const takeoffAt = `${flightDate}T10:00:00.000Z`;
  const landingAt = new Date(new Date(takeoffAt).getTime() + minutes * 60_000).toISOString();
  const response = await page.request.post('/api/v1/flights', {
    data: { ...rest, departureAirfield: 'Base Airfield', arrivalAirfield: 'Base Airfield', takeoffAt, landingAt },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { flight: { id: string } };
  return body.flight;
}

async function ownPersonId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/me');
  const body = await response.json();
  return body.person.id as string;
}

/** Loads an xlsx response body into an `ExcelJS.Workbook` for cell-level assertions. */
async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // Same exceljs typings gap documented in `workbook.test.ts` — `Buffer` here is a real Node Buffer.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook;
}

test.describe('Excel exports (Story 10.1, FR-39)', () => {
  test('admin exports flights filtered by aircraftId: 200, xlsx headers, row count matches the JSON total, date/money cells formatted (AC 1/2/4)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 15000); // 150,00 €/h
    const pilot = await createPilotPerson(page, 'Filtered');

    await registerFlight(page, { aircraftId: aircraft.id, personId: pilot.personId, flightDate: '2020-03-10', flightType: 'TOURISM', minutes: 90 });
    await registerFlight(page, { aircraftId: aircraft.id, personId: pilot.personId, flightDate: '2020-03-11', flightType: 'TOURISM', minutes: 30 });

    const jsonResponse = await page.request.get(`/api/v1/flights?aircraftId=${aircraft.id}`);
    expect(jsonResponse.status()).toBe(200);
    const jsonBody = (await jsonResponse.json()) as { total: number };
    expect(jsonBody.total).toBe(2);

    const xlsxResponse = await page.request.get(`/api/v1/flights?aircraftId=${aircraft.id}&format=xlsx&locale=it`);
    expect(xlsxResponse.status()).toBe(200);
    expect(xlsxResponse.headers()['content-type']).toBe(XLSX_CONTENT_TYPE);
    expect(xlsxResponse.headers()['content-disposition']).toMatch(/^attachment; filename="airmanager-flights-\d{4}-\d{2}-\d{2}\.xlsx"$/);

    const workbook = await loadWorkbook(await xlsxResponse.body());
    const sheet = workbook.worksheets[0]!;
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'Data',
      'Velivolo',
      'Persona',
      'Istruttore',
      'Tipo',
      'Partenza',
      'Arrivo',
      'Ora decollo',
      'Ora atterraggio',
      'Durata',
      'Decolli',
      'Atterraggi',
      'PIC',
      'Addebito',
      'Stato',
    ]);
    // Header + 2 data rows, matching the JSON total for the SAME filter (AC 1: "TUTTE le pagine").
    expect(sheet.rowCount).toBe(3);

    const rows = [sheet.getRow(2), sheet.getRow(3)];
    const durations = rows.map((row) => row.getCell(10).value);
    expect(durations).toEqual(expect.arrayContaining(['1:30', '0:30']));
    // Money cell: a real NUMERIC value (225,00 € for 90 min @ 150 €/h), not a formatted string.
    const amountCell = rows.find((row) => row.getCell(10).value === '1:30')!.getCell(14);
    expect(amountCell.value).toBe(225);
    expect(amountCell.numFmt).toBe('#,##0.00 "€"');
    // Date cell: DD/MM/YYYY string (formatDateOnly), never the raw ISO date.
    expect(rows.map((row) => row.getCell(1).value)).toEqual(expect.arrayContaining(['10/03/2020', '11/03/2020']));
    expect(rows.every((row) => row.getCell(15).value === 'Registrato')).toBe(true);

    // New logbook columns (story 11.3, AC 2): partenza/arrivo/orari SEPARATE, decolli/atterraggi
    // (default 1, `registerFlight` never sets them), PIC — all deterministic given the
    // 'Base Airfield'/10:00Z fixture `registerFlight` composes (Dev Notes).
    expect(rows.every((row) => row.getCell(6).value === 'Base Airfield')).toBe(true); // partenza
    expect(rows.every((row) => row.getCell(7).value === 'Base Airfield')).toBe(true); // arrivo
    expect(rows.every((row) => row.getCell(8).value === '11:00')).toBe(true); // ora decollo (10:00Z -> CET +1, March)
    expect(rows.every((row) => row.getCell(11).value === 1)).toBe(true); // decolli (default)
    expect(rows.every((row) => row.getCell(12).value === 1)).toBe(true); // atterraggi (default)
    // PIC: TOURISM (non-SCHOOL) -> the flight's own person (story 11.2's derivation, AC 4's shared helper).
    expect(rows.every((row) => row.getCell(13).value === `${pilot.lastName} ${pilot.firstName}`)).toBe(true);
  });

  test('locale=en renders English column headers on the same export (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 10000);

    const xlsxResponse = await page.request.get(`/api/v1/aircraft?format=xlsx&locale=en&q=${aircraft.registration}`);
    expect(xlsxResponse.status()).toBe(200);

    const workbook = await loadWorkbook(await xlsxResponse.body());
    const sheet = workbook.worksheets[0]!;
    expect(sheet.getRow(1).values).toEqual([undefined, 'Registration', 'Type', 'Model', 'Hour meter', 'Status', 'Operational status']);
    expect(sheet.getRow(2).getCell(1).value).toBe(aircraft.registration);
  });

  test('a pilot exporting flights gets ONLY their own rows — a flight belonging to another person is absent (AC 3)', async ({ page }) => {
    // Pilots cannot register flights themselves (`flights.manage` is staff-only) — capture the
    // seeded pilot's own personId first, then have ADMIN register both flights (own + other's).
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const myId = await ownPersonId(page);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 12000);
    const otherPilot = await createPilotPerson(page, 'Other');
    expect(myId).not.toBe(otherPilot.personId);
    await registerFlight(page, { aircraftId: aircraft.id, personId: otherPilot.personId, flightDate: '2020-04-01', flightType: 'TOURISM', minutes: 20 });
    await registerFlight(page, { aircraftId: aircraft.id, personId: myId, flightDate: '2020-04-02', flightType: 'TOURISM', minutes: 25 });

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const xlsxResponse = await page.request.get(`/api/v1/flights?aircraftId=${aircraft.id}&format=xlsx`);
    expect(xlsxResponse.status()).toBe(200);
    const workbook = await loadWorkbook(await xlsxResponse.body());
    const sheet = workbook.worksheets[0]!;

    // Own flight present, exactly once — the other pilot's flight never appears.
    const dataRows = sheet.rowCount - 1;
    expect(dataRows).toBe(1);
    expect(sheet.getRow(2).getCell(3).value).not.toContain(otherPilot.lastName);
  });

  test('a pilot exporting the staff-only people list gets a 403 AD-8 envelope (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const response = await page.request.get('/api/v1/people?format=xlsx');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('an unauthenticated export request gets the AD-8 401 envelope (AC 3)', async ({ request }) => {
    const response = await request.get('/api/v1/flights?format=xlsx');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  test('an export with invalid filters (dateFrom after dateTo) gets a 422 AD-8 envelope, never a file (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const response = await page.request.get('/api/v1/flights?format=xlsx&dateFrom=2026-01-10&dateTo=2026-01-01');
    expect(response.status()).toBe(422);
    expect(response.headers()['content-type']).not.toBe(XLSX_CONTENT_TYPE);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('exports own account statement: 200 xlsx; exports another person\'s: 403 (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const otherPerson = await createPilotPerson(page, 'AccountOther');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const myId = await ownPersonId(page);

    const ownResponse = await page.request.get(`/api/v1/people/${myId}/account/movements?format=xlsx`);
    expect(ownResponse.status()).toBe(200);
    expect(ownResponse.headers()['content-type']).toBe(XLSX_CONTENT_TYPE);

    const otherResponse = await page.request.get(`/api/v1/people/${otherPerson.personId}/account/movements?format=xlsx`);
    expect(otherResponse.status()).toBe(403);
    const otherBody = await otherResponse.json();
    expect(otherBody.error.code).toBe('FORBIDDEN');
  });

  test('clicking "Esporta Excel" on the flights registry triggers a real file download with the applied filter (AC 5)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 8000);
    const pilot = await createPilotPerson(page, 'UiClick');
    await registerFlight(page, { aircraftId: aircraft.id, personId: pilot.personId, flightDate: '2020-05-05', flightType: 'TOURISM', minutes: 15 });

    await page.goto(`/it/dashboard/flights?aircraftId=${aircraft.id}`);
    await expect(page.getByTestId('flight-row')).toHaveCount(1);

    // Story 12.4 (AC 6): Excel/PDF are collected into one overflow menu now.
    await page.getByTestId('flights-export-menu-trigger').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('flights-export-button').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^airmanager-flights-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();

    const workbook = await loadWorkbook(await readFile(downloadedPath!));
    const sheet = workbook.worksheets[0]!;
    // Only the one flight matching the applied `aircraftId` filter was downloaded.
    expect(sheet.rowCount).toBe(2);
  });
});
