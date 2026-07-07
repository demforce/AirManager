import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/flights.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Run-unique names (same pattern as the other specs, for the dirty DB). */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

/** A safely-in-the-past date, before any run-unique aircraft/rate created below. */
const PAST_DATE = '2020-01-01';

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as the other e2e specs. */
async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<MailpitFullMessage> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const searchResponse = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
    const searchBody = (await searchResponse.json()) as { messages: MailpitMessageSummary[] };
    const found = searchBody.messages.find((message) => message.Subject.includes(subjectIncludes));

    if (found) {
      const messageResponse = await fetch(`${MAILPIT_API}/message/${found.ID}`);
      return (await messageResponse.json()) as MailpitFullMessage;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

function extractSetPasswordUrl(emailText: string): URL {
  const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(emailText);
  if (!match) {
    throw new Error(`Email body did not contain a /set-password link:\n${emailText}`);
  }
  return new URL(match[1]);
}

/** Creates a STAFF-only user (via the admin users API) and sets its password — same pattern as `aircraft-rates.spec.ts`. */
async function createStaffUserAndSetPassword(page: Page, password: string): Promise<string> {
  const email = uniqueEmail('staff-flights');
  const response = await page.request.post('/api/v1/users', { data: { email, roles: ['STAFF'] } });
  expect(response.status()).toBe(201);

  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(inviteEmail.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();

  return email;
}

/**
 * Creates a fresh pilot person (with an active pilot profile, so an
 * `Account` exists) plus a linked login user — avoids the shared seeded
 * pilot (mutated by other, parallel e2e specs — `fullyParallel: true`).
 * Mirrors `createPilotWithLogin` (`package-sale.spec.ts`).
 */
async function createPilotWithLogin(page: Page, password: string): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Volo';
  const lastName = `Titolare-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail('pilot-flights');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId: person.id } });
  expect(userResponse.status()).toBe(201);

  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(inviteEmail.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();

  return { personId: person.id, email, firstName, lastName };
}

/** Creates a fresh instructor person (with an active instructor profile and an hourly rate) via the admin API. */
async function createInstructorWithRate(page: Page, priceCentsPerHour: number): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Istruttore';
  const lastName = `Test-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, {
    data: { ratings: 'FI(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  const rateResponse = await page.request.post(`/api/v1/people/${person.id}/instructor-rates`, {
    data: { priceCentsPerHour, validFrom: PAST_DATE },
  });
  expect(rateResponse.status()).toBe(201);

  return { personId: person.id, firstName, lastName };
}

async function createAircraftWithRate(page: Page, priceCentsPerHour: number | null): Promise<{ id: string; registration: string }> {
  // Same `.slice(0, 20)` convention as `aircraft-rates.spec.ts`'s `uniqueAircraft`
  // — keeps the full millisecond timestamp (which differs call to call) plus
  // a couple of random chars; slicing tighter would truncate away the only
  // part that varies within a single test run and risk a 409 collision.
  const suffix = uniqueSuffix();
  const registration = `I-FL${suffix}`.toUpperCase().slice(0, 20);

  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 100 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };

  if (priceCentsPerHour !== null) {
    const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
      data: { priceCentsPerHour, validFrom: PAST_DATE },
    });
    expect(rateResponse.status()).toBe(201);
  }

  return { id: aircraft.id, registration };
}

test.describe('Flight logging with automatic charges (Story 5.1, AC 1/2/3/4)', () => {
  test('staff registers a flight with direct minutes: breakdown shown, balance drops in the estratto conto (FLIGHT_CHARGE, negative), aircraft hour meter advances', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // Admin defines the aircraft rate (API) — 150,00 €/h.
    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createPilotWithLogin(page, 'PilotFlights123!');

    const staffPassword = 'StaffFlights123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);

    // Still authenticated as admin (visiting the public set-password page never touched the session cookie).
    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);

    await page.goto('/it/dashboard/flights');
    await page.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await page.getByLabel('Pilota o allievo').selectOption({ label: `${pilot.lastName} ${pilot.firstName}` });
    await page.getByLabel('Minuti', { exact: true }).fill('80');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    // 80' @ 150,00 €/h -> 200,00 € (the PRD-testable 80'x150 case).
    const resultPanel = page.getByTestId('flight-result-panel');
    await expect(resultPanel).toContainText('1:20');
    await expect(resultPanel).toContainText(/150,00\s€/);
    await expect(resultPanel.getByTestId('flight-result-total')).toContainText(/200,00\s€/);
    await expect(resultPanel.getByTestId('flight-result-new-balance')).toContainText(/-200,00\s€/);

    const row = page.getByTestId('flight-row').filter({ hasText: aircraft.registration });
    await expect(row).toContainText('1:20');
    await expect(row).toContainText(/200,00\s€/);

    // Aircraft hour meter advanced by exactly the flight's minutes (100 + 80 = 180 -> 3:00).
    await page.goto('/it/dashboard/aircraft');
    const aircraftRow = page.getByRole('row', { name: new RegExp(aircraft.registration) });
    await expect(aircraftRow).toContainText('3:00');

    // Estratto conto: a FLIGHT_CHARGE row, negative, same total.
    await page.goto(`/it/dashboard/people/${pilot.personId}/account`);
    const statementRow = page.locator('tbody tr').filter({ hasText: 'Addebito volo' });
    await expect(statementRow).toContainText(/-200,00\s€/);
    await expect(page.getByTestId('account-statement-balance')).toContainText(/-200,00\s€/);
  });

  test('flight with hourMeterStart/hourMeterEnd derives minutes; a SCHOOL flight with an instructor charges both and sums the total', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 12000); // 120,00 €/h
    const pilot = await createPilotWithLogin(page, 'PilotFlights456!');
    const instructor = await createInstructorWithRate(page, 4000); // 40,00 €/h

    // Still authenticated as admin — creating the pilot/instructor logins above never touched this session cookie.
    await page.goto('/it/dashboard/flights');
    await page.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await page.getByLabel('Pilota o allievo').selectOption({ label: `${pilot.lastName} ${pilot.firstName}` });
    await page.getByLabel('Istruttore').selectOption({ label: `${instructor.lastName} ${instructor.firstName}` });
    await page.getByLabel('Tipo di volo').selectOption({ label: 'Scuola' });
    await page.getByRole('radio', { name: 'Contaore iniziale/finale' }).click();
    await page.getByLabel('Contaore iniziale', { exact: true }).fill('100');
    await page.getByLabel('Contaore finale', { exact: true }).fill('160'); // 60' derived.
    await page.getByRole('button', { name: 'Registra volo' }).click();

    // 60' @ 120,00 €/h -> 120,00 €; 60' @ 40,00 €/h -> 40,00 €; total 160,00 €.
    const resultPanel = page.getByTestId('flight-result-panel');
    await expect(resultPanel).toContainText('1:00');
    await expect(resultPanel.getByTestId('flight-result-total')).toContainText(/160,00\s€/);

    const row = page.getByTestId('flight-row').filter({ hasText: aircraft.registration });
    await expect(row).toContainText(`${instructor.lastName} ${instructor.firstName}`);
    await expect(row).toContainText('Scuola');
    await expect(row).toContainText('1:00');
    await expect(row).toContainText(/160,00\s€/);
  });

  test('an invalid hour-meter pair (end <= start) shows the HOUR_METER_INVALID message in the form', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createPilotWithLogin(page, 'PilotFlights789!');

    await page.goto('/it/dashboard/flights');
    await page.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await page.getByLabel('Pilota o allievo').selectOption({ label: `${pilot.lastName} ${pilot.firstName}` });
    await page.getByRole('radio', { name: 'Contaore iniziale/finale' }).click();
    await page.getByLabel('Contaore iniziale', { exact: true }).fill('200');
    await page.getByLabel('Contaore finale', { exact: true }).fill('200');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText("Il contaore finale deve essere maggiore dell'iniziale.");
  });

  test('an aircraft with no rate in effect shows the NO_AIRCRAFT_RATE message', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, null);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsNoRate1!');

    await page.goto('/it/dashboard/flights');
    await page.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await page.getByLabel('Pilota o allievo').selectOption({ label: `${pilot.lastName} ${pilot.firstName}` });
    await page.getByLabel('Minuti', { exact: true }).fill('30');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText('Nessuna tariffa oraria è in vigore per questo velivolo alla data del volo.');
  });

  test('a pilot gets a 403 AD-8 envelope from POST /api/v1/flights', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsForbidden1!');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotFlightsForbidden1!');

    const response = await page.request.post('/api/v1/flights', {
      data: { aircraftId: 'whatever', personId: pilot.personId, flightDate: PAST_DATE, flightType: 'PRIVATE', minutes: 30 },
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('nav shows "Voli" for staff and hides it for a pilot', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsNav123!');

    await page.goto('/it/dashboard');
    const adminNav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(adminNav.getByRole('link', { name: 'Voli', exact: true })).toHaveAttribute('href', '/it/dashboard/flights');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotFlightsNav123!');
    const pilotNav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(pilotNav.getByRole('link', { name: 'Voli', exact: true })).toHaveCount(0);
  });
});
