import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const STAFF_EMAIL = 'staff@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/pdf-exports.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PDF_CONTENT_TYPE = 'application/pdf';
/** A valid, minimal (68-byte) transparent PNG — well under the ~200KB logo cap. */
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A day, `daysFromBase` after a fixed PAST date (flight registration rejects future dates) — same fixed-past-date convention as `exports.spec.ts`'s `PAST_DATE`. Every fixture below is scoped by a unique aircraft/person/category id, so re-running against a non-fresh DB never collides. */
function dateAt(daysFromBase: number): string {
  return new Date(Date.UTC(2021, 0, 1) + daysFromBase * 86_400_000).toISOString().slice(0, 10);
}

async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-PD${suffix}`.toUpperCase().slice(0, 20);

  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 100 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };

  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
    data: { priceCentsPerHour, validFrom: '2020-01-01' },
  });
  expect(rateResponse.status()).toBe(201);

  return { id: aircraft.id, registration };
}

async function createPilotPerson(page: Page, tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'PdfExport';
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

async function registerFlight(
  page: Page,
  params: { aircraftId: string; personId: string; flightDate: string; flightType: 'TOURISM' | 'SCHOOL' | 'AERIAL_WORK'; minutes: number },
): Promise<void> {
  const response = await page.request.post('/api/v1/flights', { data: params });
  expect(response.status()).toBe(201);
}

async function ownPersonId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/me');
  const body = await response.json();
  return body.person.id as string;
}

async function createCashCategory(page: Page): Promise<string> {
  const response = await page.request.post('/api/v1/cash-categories', { data: { name: `Categoria PDF ${uniqueSuffix()}` } });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return created.id;
}

async function recordCashMovement(page: Page, categoryId: string, amountCents: number, effectiveDate: string): Promise<void> {
  const response = await page.request.post('/api/v1/cash-movements', { data: { categoryId, amountCents, effectiveDate } });
  expect(response.status()).toBe(201);
}

async function createExpiryType(page: Page): Promise<string> {
  const response = await page.request.post('/api/v1/expiry-types', { data: { name: `Tipo PDF ${uniqueSuffix()}`, scope: 'ALL' } });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return created.id;
}

async function registerExpiry(page: Page, personId: string, expiryTypeId: string): Promise<void> {
  const response = await page.request.post('/api/v1/expiries', {
    data: { personId, expiryTypeId, issuedAt: '2026-01-01', expiresAt: '2027-01-01' },
  });
  expect(response.status()).toBe(201);
}

// The airfield settings row is GLOBAL, shared, mutable state (same reason
// `ppr-queue.spec.ts` serializes its own operating-instructions scenario) —
// this whole file runs serially so a settings PUT in one test is never
// raced by a concurrent PUT from another test in the same file.
test.describe.configure({ mode: 'serial' });

test.describe('PDF exports (Story 10.2, FR-40)', () => {
  test('admin exports the 4 report PDFs: 200, application/pdf, attachment filename, %PDF- magic bytes (AC 2/3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createPilotPerson(page, 'Flights');
    const flightDate = dateAt(1);
    await registerFlight(page, { aircraftId: aircraft.id, personId: pilot.personId, flightDate, flightType: 'TOURISM', minutes: 60 });

    const categoryId = await createCashCategory(page);
    const cashDate = dateAt(2);
    await recordCashMovement(page, categoryId, 10000, cashDate);

    const expiryTypeId = await createExpiryType(page);
    await registerExpiry(page, pilot.personId, expiryTypeId);

    const topUpResponse = await page.request.post(`/api/v1/people/${pilot.personId}/account/top-ups`, {
      data: { amountCents: 5000, paymentMethod: 'CASH', effectiveDate: dateAt(0) },
    });
    expect(topUpResponse.status()).toBe(200);

    const routes: { url: string; filenamePrefix: string }[] = [
      { url: `/api/v1/people/${pilot.personId}/account/pdf`, filenamePrefix: 'account-statement' },
      { url: `/api/v1/cash-report/pdf?from=${cashDate}&to=${cashDate}`, filenamePrefix: 'cash-report' },
      { url: `/api/v1/flights/pdf?aircraftId=${aircraft.id}`, filenamePrefix: 'flights' },
      { url: `/api/v1/expiries/pdf?expiryTypeId=${expiryTypeId}`, filenamePrefix: 'expiries' },
    ];

    for (const route of routes) {
      const response = await page.request.get(route.url);
      expect(response.status(), route.url).toBe(200);
      expect(response.headers()['content-type']).toBe(PDF_CONTENT_TYPE);
      expect(response.headers()['content-disposition']).toMatch(
        new RegExp(`^attachment; filename="airmanager-${route.filenamePrefix}-\\d{4}-\\d{2}-\\d{2}\\.pdf"$`),
      );
      const body = await response.body();
      expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
  });

  test('admin configures the airfield name and logo on /dashboard/settings: saved, re-read via the API, and a PDF export still succeeds (AC 1, 5)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const airfieldName = `Aviosuperficie e2e ${uniqueSuffix()}`;

    await page.goto('/it/dashboard/settings');
    await expect(page.getByTestId('airfield-settings-form')).toBeVisible();

    await page.getByTestId('airfield-name-input').fill(airfieldName);
    await page.getByTestId('airfield-logo-input').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });
    await expect(page.getByTestId('airfield-logo-preview')).toBeVisible();
    await page.getByTestId('airfield-settings-save').click();
    await expect(page.getByTestId('airfield-settings-feedback')).toBeVisible();

    const getResponse = await page.request.get('/api/v1/settings/airfield');
    expect(getResponse.status()).toBe(200);
    const saved = (await getResponse.json()) as { name: string; logoDataUrl: string | null };
    expect(saved.name).toBe(airfieldName);
    expect(saved.logoDataUrl).toMatch(/^data:image\/png;base64,/);

    // The branding renders into every PDF header (unit-covered content) — here just a smoke check the export still succeeds with a real logo configured.
    const pilot = await createPilotPerson(page, 'Branding');
    const exportResponse = await page.request.get(`/api/v1/people/${pilot.personId}/account/pdf`);
    expect(exportResponse.status()).toBe(200);
    expect((await exportResponse.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // Remove the logo again: preview disappears, and PUT persists `logoDataUrl: null`.
    await page.getByTestId('airfield-logo-remove').click();
    await expect(page.getByTestId('airfield-logo-preview')).toHaveCount(0);
    await page.getByTestId('airfield-settings-save').click();
    await expect(page.getByTestId('airfield-settings-feedback')).toBeVisible();
    const afterRemoval = (await (await page.request.get('/api/v1/settings/airfield')).json()) as { logoDataUrl: string | null };
    expect(afterRemoval.logoDataUrl).toBeNull();
  });

  test('/dashboard/settings redirects staff and pilot to /dashboard; PUT /api/v1/settings/airfield answers 403 for both (AC 1)', async ({ page }) => {
    for (const email of [STAFF_EMAIL, PILOT_EMAIL]) {
      await loginExpectingDashboard(page, email);
      await page.goto('/it/dashboard/settings');
      await expect(page).toHaveURL(/\/it\/dashboard$/);

      const putResponse = await page.request.put('/api/v1/settings/airfield', { data: { name: 'Should not save', logoDataUrl: null } });
      expect(putResponse.status()).toBe(403);

      await page.context().clearCookies();
    }
  });

  test('own-access parity: a pilot exports their own account statement (200) but another person\'s (403), and the staff-only cash report/expiries PDFs (403) (AC 3)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const otherPerson = await createPilotPerson(page, 'OwnAccessOther');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const myId = await ownPersonId(page);

    const ownResponse = await page.request.get(`/api/v1/people/${myId}/account/pdf`);
    expect(ownResponse.status()).toBe(200);

    const otherResponse = await page.request.get(`/api/v1/people/${otherPerson.personId}/account/pdf`);
    expect(otherResponse.status()).toBe(403);
    expect((await otherResponse.json()).error.code).toBe('FORBIDDEN');

    const cashReportResponse = await page.request.get('/api/v1/cash-report/pdf?from=2026-01-01&to=2026-01-31');
    expect(cashReportResponse.status()).toBe(403);

    const expiriesResponse = await page.request.get('/api/v1/expiries/pdf');
    expect(expiriesResponse.status()).toBe(403);
  });

  test('unauthenticated requests to every PDF export route get the AD-8 401 envelope', async ({ request }) => {
    for (const url of ['/api/v1/people/anyone/account/pdf', '/api/v1/cash-report/pdf?from=2026-01-01&to=2026-01-31', '/api/v1/flights/pdf', '/api/v1/expiries/pdf']) {
      const response = await request.get(url);
      expect(response.status(), url).toBe(401);
      expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
    }
  });

  test('invalid filters (inverted period) get a 422 AD-8 envelope, never a file (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const cashReportResponse = await page.request.get('/api/v1/cash-report/pdf?from=2026-01-10&to=2026-01-01');
    expect(cashReportResponse.status()).toBe(422);
    expect(cashReportResponse.headers()['content-type']).not.toBe(PDF_CONTENT_TYPE);

    const flightsResponse = await page.request.get('/api/v1/flights/pdf?dateFrom=2026-01-10&dateTo=2026-01-01');
    expect(flightsResponse.status()).toBe(422);
    expect((await flightsResponse.json()).error.code).toBe('VALIDATION_ERROR');
  });

  test('clicking "Esporta PDF" on the flight log triggers a real file download with the applied filter (AC 5)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 9000);
    const pilot = await createPilotPerson(page, 'UiPdfClick');
    await registerFlight(page, { aircraftId: aircraft.id, personId: pilot.personId, flightDate: dateAt(3), flightType: 'TOURISM', minutes: 20 });

    await page.goto(`/it/dashboard/flights?aircraftId=${aircraft.id}`);
    await expect(page.getByTestId('flight-row')).toHaveCount(1);

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('flights-export-pdf-button').click()]);

    expect(download.suggestedFilename()).toMatch(/^airmanager-flights-\d{4}-\d{2}-\d{2}\.pdf$/);
    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();
  });
});
