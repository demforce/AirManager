// This spec WRITES a GLOBAL `sched.*` AppSetting row (the `fleetUtilization`
// test below) and runs in the `reports` Playwright project, serialized after
// `booking-window` (playwright.config.ts) — story 15.8b, R-15.8b-f. Until then
// it ran in the main `fullyParallel` project and left an 07:00-21:00 window
// behind: the TD registered since 14.4, aggravated by 15.4 (every `moveBooking`
// in the suite inherits that window, so the "today" fixtures of
// `mobile-planning` fall outside it when the suite runs before ~07:20 or after
// ~20:40 Rome). The `afterAll` below restores the same permissive window
// `settings.spec.ts` restores. Running this file alone locally:
// `npx playwright test reports.spec.ts --no-deps` (otherwise Playwright first
// runs its `chromium`/`settings`/`booking-window` dependencies).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureValidSeedExpiries } from './helpers';

/**
 * Statistiche / reports (epic 12, story 12.10, AC 4). `stats.service.ts`
 * aggregates over the WHOLE current Rome month/year, shared with every
 * other e2e spec run in the same CI window — a plain "register this fixture
 * then assert the ABSOLUTE KPI value" would be flaky under `fullyParallel`.
 * Every uniquely-identified row (fleet by registration, instructor/pilot by
 * a random-suffixed name) is asserted EXACTLY (no other spec can produce a
 * colliding registration/name); the shared aggregate KPIs (`kpis.*`,
 * `movementMix[].count`) are asserted as a BEFORE/AFTER DELTA instead — same
 * pattern `billing.spec.ts`'s "KPI row is the TRUE current-month aggregate"
 * test already uses for the identical shared-aggregate problem.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/reports.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example) — migrate + seed the DB first.');
}

const RATE_VALID_FROM = '2020-01-01';

async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueRegistration(prefix: string): string {
  return `I-${prefix}${uniqueSuffix().replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()}`;
}

function uniqueFakeIp(): string {
  return `e2e-reports-${uniqueSuffix()}`;
}

/** `YYYY-MM-DD` "today" in UTC — the same convention `flight-log.spec.ts#registerFlight` relies on (`T10:00:00.000Z`, comfortably clear of any midnight boundary). */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

async function createPilotPerson(page: Page, tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Reports';
  const lastName = `${tag}-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  // Story 14.4 blast-radius fixture fix — see `ensureValidSeedExpiries`'s own doc-comment (e2e/helpers.ts).
  await ensureValidSeedExpiries(page, person.id, 'PILOTS');
  return { personId: person.id, firstName, lastName };
}

async function createInstructorPerson(page: Page, tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Istruttore';
  const lastName = `Rep-${tag}-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, { data: { ratings: 'FI(A)' } });
  expect(profileResponse.status()).toBe(200);
  // Story 14.4 blast-radius fixture fix — see `ensureValidSeedExpiries`'s own doc-comment (e2e/helpers.ts).
  await ensureValidSeedExpiries(page, person.id, 'INSTRUCTORS');
  return { personId: person.id, firstName, lastName };
}

async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string; registration: string }> {
  const registration = uniqueRegistration('RP');
  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 100 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };
  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, { data: { priceCentsPerHour, validFrom: RATE_VALID_FROM } });
  expect(rateResponse.status()).toBe(201);
  return { id: aircraft.id, registration };
}

async function createInstructorRate(page: Page, instructorPersonId: string, priceCentsPerHour: number): Promise<void> {
  const rateResponse = await page.request.post(`/api/v1/people/${instructorPersonId}/instructor-rates`, {
    data: { priceCentsPerHour, validFrom: RATE_VALID_FROM },
  });
  expect(rateResponse.status()).toBe(201);
}

type RegisterFlightParams = {
  aircraftId: string;
  personId: string;
  instructorPersonId?: string;
  flightType: 'TOURISM' | 'SCHOOL' | 'AERIAL_WORK';
  minutes: number;
};

/** Same `takeoffAt`/`landingAt` wire shape as `flight-log.spec.ts#registerFlight` — `flightDate` is TODAY (UTC, `T10:00Z`), so the flight always lands in the CURRENT Rome month (`getStats`'s default `ref`). Charges live under `flight.breakdown.*` (`flights.service.ts#toListItem`); `instructorAmountCents` is OMITTED (not `null`) when there is no instructor, normalized here to `0`. */
async function registerFlight(page: Page, params: RegisterFlightParams): Promise<{ id: string; aircraftAmountCents: number; instructorAmountCents: number }> {
  const takeoffAt = `${todayDateOnly()}T10:00:00.000Z`;
  const landingAt = new Date(new Date(takeoffAt).getTime() + params.minutes * 60_000).toISOString();
  const response = await page.request.post('/api/v1/flights', {
    data: {
      aircraftId: params.aircraftId,
      personId: params.personId,
      ...(params.instructorPersonId ? { instructorPersonId: params.instructorPersonId } : {}),
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      takeoffAt,
      landingAt,
      flightType: params.flightType,
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { flight: { id: string; breakdown: { aircraftAmountCents: number; instructorAmountCents?: number } } };
  return {
    id: body.flight.id,
    aircraftAmountCents: body.flight.breakdown.aircraftAmountCents,
    instructorAmountCents: body.flight.breakdown.instructorAmountCents ?? 0,
  };
}

/** Creates + approves + completes a PPR request (a "transit" in `getStats`'s ratified definition) — `eta` a couple of hours from now, comfortably inside TODAY's Rome calendar month. */
async function createCompletedTransit(page: Page, landingFeeCents: number): Promise<void> {
  const registration = uniqueRegistration('T');
  const createResponse = await page.request.post('/api/v1/ppr-requests', {
    headers: { 'x-forwarded-for': uniqueFakeIp() },
    data: {
      firstName: 'Transito',
      lastName: `Rep-${uniqueSuffix()}`,
      email: `transit-${uniqueSuffix()}@e2e.airmanager.local`,
      phone: '+39 333 0000000',
      aircraftRegistration: registration,
      aircraftType: 'Cessna 172',
      origin: 'LIRN Napoli',
      destination: 'LIRU Urbe',
      eta: futureIso(2),
      personsOnBoard: 1,
      locale: 'it',
    },
  });
  expect(createResponse.status()).toBe(201);

  const listResponse = await page.request.get('/api/v1/ppr-requests?status=PENDING&pageSize=100');
  expect(listResponse.status()).toBe(200);
  const list = (await listResponse.json()) as { items: { id: string; aircraftRegistration: string }[] };
  const match = list.items.find((item) => item.aircraftRegistration === registration);
  if (!match) throw new Error(`PENDING PprRequest ${registration} not found`);

  const approveResponse = await page.request.post(`/api/v1/ppr-requests/${match.id}/approve`);
  expect(approveResponse.status()).toBe(200);

  const completeResponse = await page.request.post(`/api/v1/ppr-requests/${match.id}/complete`, {
    data: { landingFeeCents, paymentMethod: 'CASH' },
    headers: { 'Idempotency-Key': `e2e-${uniqueSuffix()}` },
  });
  expect(completeResponse.status()).toBe(200);
}

type StatsDto = {
  kpis: { revenueCents: number; flightMinutes: number; movements: number; transitShare: number; fleetUtilization: number | null };
  series: { months: string[]; revenueCents: number[]; flightMinutes: number[]; transitMovements: number[] };
  fleet: { registration: string; minutes: number; revenueCents: number }[];
  movementMix: { key: 'SCHOOL' | 'TOURISM' | 'AERIAL_WORK' | 'TRANSIT'; count: number }[];
  instructors: { name: string; minutes: number; owedCents: number | null }[];
  topPilots: { name: string; minutes: number; spentCents: number }[];
};

async function fetchStats(page: Page, period: 'month' | 'year'): Promise<StatsDto> {
  const response = await page.request.get(`/api/v1/stats?period=${period}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as StatsDto;
}

function mixCount(stats: StatsDto, key: StatsDto['movementMix'][number]['key']): number {
  return stats.movementMix.find((m) => m.key === key)?.count ?? 0;
}

function formatCentsIt(cents: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(cents / 100);
}

function formatMinutesHm(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

/** Same permissive baseline as `settings.spec.ts`/`booking-window.spec.ts`: a PUT has no unset, so restoring a maximally permissive window is the only way to neutralise the one the `fleetUtilization` test writes (story 15.8b, R-15.8b-f). */
const PERMISSIVE_SCHEDULING = { openTime: '00:00', closeTime: '23:59', minSlotMinutes: 30, turnaroundMinutes: 0, maxAdvanceDays: 3650 };

test.describe('Reports / Statistiche (story 12.10)', () => {
  test.afterAll(async ({ browser }) => {
    // Story 15.8b (R-15.8b-f): the `fleetUtilization` test needs `sched.*`
    // CONFIGURED, and until this story nothing ever put it back — read back
    // here, not assumed.
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const put = await page.request.put('/api/v1/settings/scheduling', { data: PERMISSIVE_SCHEDULING });
    expect(put.status()).toBe(200);
    const readBack = await page.request.get('/api/v1/settings/scheduling');
    expect(await readBack.json()).toMatchObject(PERMISSIVE_SCHEDULING);
    await context.close();
  });

  test('a real fixture (2 flights, 1 completed transit) moves the KPIs/mix by EXACTLY the right delta, and populates fleet/instructor/topPilot rows exactly (AC 1/3/4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const before = await fetchStats(page, 'month');

    const pilot = await createPilotPerson(page, 'Fixture');
    const instructor = await createInstructorPerson(page, 'Fixture');
    await createInstructorRate(page, instructor.personId, 4000); // 40,00 €/h
    const aircraft = await createAircraftWithRate(page, 15000); // 150,00 €/h

    // SCHOOL, 60 min: aircraft 15000c, instructor 4000c.
    const schoolFlight = await registerFlight(page, { aircraftId: aircraft.id, personId: pilot.personId, instructorPersonId: instructor.personId, flightType: 'SCHOOL', minutes: 60 });
    // TOURISM, 30 min: aircraft 7500c, no instructor.
    const tourismFlight = await registerFlight(page, { aircraftId: aircraft.id, personId: pilot.personId, flightType: 'TOURISM', minutes: 30 });
    // 1 completed transit, landing fee 2500c.
    await createCompletedTransit(page, 2500);

    const after = await fetchStats(page, 'month');

    const expectedFlightRevenue = schoolFlight.aircraftAmountCents + schoolFlight.instructorAmountCents + tourismFlight.aircraftAmountCents;
    expect(after.kpis.revenueCents - before.kpis.revenueCents).toBe(expectedFlightRevenue + 2500);
    expect(after.kpis.flightMinutes - before.kpis.flightMinutes).toBe(90);
    expect(after.kpis.movements - before.kpis.movements).toBe(3); // 2 flights + 1 transit
    expect(mixCount(after, 'SCHOOL') - mixCount(before, 'SCHOOL')).toBe(1);
    expect(mixCount(after, 'TOURISM') - mixCount(before, 'TOURISM')).toBe(1);
    expect(mixCount(after, 'AERIAL_WORK') - mixCount(before, 'AERIAL_WORK')).toBe(0);
    expect(mixCount(after, 'TRANSIT') - mixCount(before, 'TRANSIT')).toBe(1);

    // Uniquely-identified rows: exact assertions, no delta needed.
    const fleetRow = after.fleet.find((row) => row.registration === aircraft.registration);
    expect(fleetRow).toEqual({ registration: aircraft.registration, minutes: 90, revenueCents: schoolFlight.aircraftAmountCents + tourismFlight.aircraftAmountCents });

    const instructorName = `${instructor.firstName} ${instructor.lastName}`;
    const instructorRow = after.instructors.find((row) => row.name === instructorName);
    expect(instructorRow).toEqual({ name: instructorName, minutes: 60, owedCents: null });

    const pilotName = `${pilot.firstName} ${pilot.lastName}`;
    const topPilotRow = after.topPilots.find((row) => row.name === pilotName);
    expect(topPilotRow).toEqual({ name: pilotName, minutes: 90, spentCents: expectedFlightRevenue });

    // The page itself (period=month) renders these SAME `after` numbers.
    await page.goto('/it/dashboard/reports?period=month');
    await expect(page.getByTestId('reports-period-month')).toHaveClass(/on/);
    const kpiValues = page.locator('.kpi-row .kpi .kpi-value');
    await expect(kpiValues.nth(0)).toContainText(formatCentsIt(after.kpis.revenueCents));
    await expect(kpiValues.nth(1)).toContainText(formatMinutesHm(after.kpis.flightMinutes));
    await expect(kpiValues.nth(2)).toContainText(String(after.kpis.movements));

    // H:MM app-wide (PO ratification, review 12.10): 90min -> 1:30, 60min -> 1:00.
    await expect(page.getByTestId(`reports-fleet-row-${aircraft.registration}`)).toContainText(formatMinutesHm(90));
    await expect(page.getByTestId(`reports-instructor-row-${instructorName}`)).toContainText(formatMinutesHm(60));
    await expect(page.getByTestId(`reports-instructor-row-${instructorName}`)).toContainText('—');
    // "Per pilota" RankBars defaults to the "Ore" metric — switch to "Spesa" to check the money column.
    await expect(page.getByTestId(`reports-rank-pilot-row-${pilotName}`)).toContainText(formatMinutesHm(90));
    await page.getByTestId('reports-rank-pilots').getByRole('button', { name: 'Spesa' }).click();
    await expect(page.getByTestId(`reports-rank-pilot-row-${pilotName}`)).toContainText(formatCentsIt(expectedFlightRevenue));
  });

  test('toggling month/year switches the chart series length (6 vs 12 points) and the active segmented button (AC 3/4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.goto('/it/dashboard/reports');
    // Default is YEAR (matches the prototype's own default, AC 3).
    await expect(page.getByTestId('reports-period-year')).toHaveClass(/on/);
    await expect(page.getByTestId('reports-period-month')).not.toHaveClass(/on/);
    const yearSeriesResponse = await page.request.get('/api/v1/stats?period=year');
    const yearSeries = (await yearSeriesResponse.json()) as StatsDto;
    expect(yearSeries.series.months).toHaveLength(12);

    await page.getByTestId('reports-period-month').click();
    await expect(page).toHaveURL(/period=month/);
    await expect(page.getByTestId('reports-period-month')).toHaveClass(/on/);
    await expect(page.getByTestId('reports-period-year')).not.toHaveClass(/on/);
    const monthSeriesResponse = await page.request.get('/api/v1/stats?period=month');
    const monthSeries = (await monthSeriesResponse.json()) as StatsDto;
    expect(monthSeries.series.months).toHaveLength(6);
  });

  test('RBAC: a pilot is redirected away from the page, and the API answers 403 (AC 4)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.goto('/it/dashboard/reports');
    await expect(page).toHaveURL(/\/it\/dashboard$/);

    const response = await page.request.get('/api/v1/stats?period=month');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('a future ref answers 422 (ratifica utente 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const nextYear = new Date().getUTCFullYear() + 1;
    const response = await page.request.get(`/api/v1/stats?period=month&ref=${nextYear}-01`);
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('STATS_REF_IN_FUTURE');
  });

  // --- fleetUtilization (story 12.11, AC 6 — closes ratifica utente 2 from 12.10) ---

  test('fleetUtilization: once sched.openTime/closeTime are configured, the API returns a number and the 5th KPI card renders (positive assertion — scheduling settings are process-wide and may already be configured by other specs, so absence is not asserted here)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const schedResponse = await page.request.put('/api/v1/settings/scheduling', {
      data: { openTime: '07:00', closeTime: '21:00', minSlotMinutes: 60, turnaroundMinutes: 15, maxAdvanceDays: 30 },
    });
    expect(schedResponse.status()).toBe(200);

    const statsResponse = await page.request.get('/api/v1/stats?period=month');
    const stats = (await statsResponse.json()) as StatsDto;
    expect(typeof stats.kpis.fleetUtilization).toBe('number');

    await page.goto('/it/dashboard/reports');
    const kpiValues = page.locator('.kpi-row .kpi .kpi-value');
    await expect(kpiValues).toHaveCount(5);
  });
});
