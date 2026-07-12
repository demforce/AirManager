import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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

/**
 * Types into a `SearchCombobox` (story TD-3) and clicks the matching option
 * — the typeahead replacement for the old `selectOption({ label })` on the
 * flight pickers (velivolo/persona/istruttore/filter-bar). `combobox` must
 * already resolve to the specific `<input>` (scoped the same way the old
 * `selectOption` call sites were). Playwright's auto-waiting on the option
 * locator absorbs both the ~250ms debounce and the server round-trip —
 * no manual wait needed.
 */
async function selectFromCombobox(combobox: Locator, query: string, optionLabel: string): Promise<void> {
  await combobox.click();
  await combobox.fill(query);
  await combobox.page().getByRole('option', { name: optionLabel, exact: true }).click();
}

/** Story 12.3 (AC 2): the registration form now lives in a `Dialog` — opens it before any `flight-form` field interaction (`flight-open-register` disambiguates the SAME "Registra volo" label from the dialog's own submit button). */
async function openRegisterDialog(page: Page): Promise<void> {
  await page.getByTestId('flight-open-register').click();
  await expect(page.getByTestId('flight-form')).toBeVisible();
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

/** Story 11.1: composes `{ takeoffAt, landingAt }` for a direct `POST /api/v1/flights` call — `10:00Z` stays clear of the Europe/Rome midnight boundary. */
function flightTimes(dateOnly: string, minutes: number): { takeoffAt: string; landingAt: string } {
  const takeoffAt = `${dateOnly}T10:00:00.000Z`;
  const landingAt = new Date(new Date(takeoffAt).getTime() + minutes * 60_000).toISOString();
  return { takeoffAt, landingAt };
}

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

test.describe('Flight logging with automatic charges (Story 5.1, AC 1/2/3/4; Story 11.1, AC 1/2)', () => {
  test('staff registers a flight with takeoff/landing times: duration auto-derived and shown live, breakdown shown, balance drops in the estratto conto (FLIGHT_CHARGE, negative), aircraft hour meter advances', async ({
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
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(
      page.getByTestId('flight-form').getByLabel('Pilota o allievo'),
      pilot.lastName,
      `${pilot.lastName} ${pilot.firstName}`,
    );
    // 80' (1:20) via takeoff/landing times — story 11.1, AC 2: the duration is derived, never a direct input.
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:20');
    await expect(page.getByTestId('flight-computed-duration')).toHaveText('1:20');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

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
    // T0 hardening: filter by this test's own registration instead of relying
    // on it landing on the default page 1 (root-caused empirically — under a
    // fully-parallel e2e run, dozens of aircraft get created by OTHER specs;
    // `/dashboard/aircraft` is paginated 20/page ordered by `registration asc`,
    // so a freshly created, run-unique registration can sort well past page 1
    // and never appear, which read as a flaky `toContainText` timeout even
    // though the underlying data was correct all along). The list page
    // already supports `?q=` server-side search (`aircraft.service.ts`),
    // same mechanism `people-manager.tsx`'s search box drives.
    await page.goto(`/it/dashboard/aircraft?q=${encodeURIComponent(aircraft.registration)}`);
    const aircraftRow = page.getByRole('row', { name: new RegExp(aircraft.registration) });
    await expect(aircraftRow).toContainText('3:00');

    // Estratto conto: a FLIGHT_CHARGE row, negative, same total.
    await page.goto(`/it/dashboard/people/${pilot.personId}/account`);
    const statementRow = page.locator('tbody tr').filter({ hasText: 'Addebito volo' });
    await expect(statementRow).toContainText(/-200,00\s€/);
    await expect(page.getByTestId('account-statement-balance')).toContainText(/-200,00\s€/);
  });

  test('orari decollo/atterraggio derivano la durata (contaore ormai solo informativo); a SCHOOL flight with an instructor charges both and sums the total', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 12000); // 120,00 €/h
    const pilot = await createPilotWithLogin(page, 'PilotFlights456!');
    const instructor = await createInstructorWithRate(page, 4000); // 40,00 €/h

    // Still authenticated as admin — creating the pilot/instructor logins above never touched this session cookie.
    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(
      page.getByTestId('flight-form').getByLabel('Pilota o allievo'),
      pilot.lastName,
      `${pilot.lastName} ${pilot.firstName}`,
    );
    await selectFromCombobox(
      page.getByTestId('flight-form').getByLabel('Istruttore'),
      instructor.lastName,
      `${instructor.lastName} ${instructor.firstName}`,
    );
    await page.getByTestId('flight-form').getByLabel('Tipo di volo').selectOption({ label: 'Scuola' });
    // 60' via takeoff/landing times — the (optional, purely informational) contaore pair is left blank.
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:00');
    await expect(page.getByTestId('flight-computed-duration')).toHaveText('1:00');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

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

  test('an invalid hour-meter pair (end <= start) shows the HOUR_METER_INVALID message in the form (story 11.1: two independent optional fields, no radio/mode anymore)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createPilotWithLogin(page, 'PilotFlights789!');

    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(
      page.getByTestId('flight-form').getByLabel('Pilota o allievo'),
      pilot.lastName,
      `${pilot.lastName} ${pilot.firstName}`,
    );
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByLabel('Contaore iniziale', { exact: true }).fill('200');
    await page.getByLabel('Contaore finale', { exact: true }).fill('200');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText("Il contaore finale deve essere maggiore dell'iniziale.");
  });

  test('an incomplete hour-meter pair (only the start filled) shows the HOUR_METER_INVALID message in the form', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsHM1!');

    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(
      page.getByTestId('flight-form').getByLabel('Pilota o allievo'),
      pilot.lastName,
      `${pilot.lastName} ${pilot.firstName}`,
    );
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByLabel('Contaore iniziale', { exact: true }).fill('200');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText("Il contaore finale deve essere maggiore dell'iniziale.");
  });

  test('an aircraft with no rate in effect shows the NO_AIRCRAFT_RATE message', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, null);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsNoRate1!');

    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(
      page.getByTestId('flight-form').getByLabel('Pilota o allievo'),
      pilot.lastName,
      `${pilot.lastName} ${pilot.firstName}`,
    );
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText('Nessuna tariffa oraria è in vigore per questo velivolo alla data del volo.');
  });

  test('a pilot gets a 403 AD-8 envelope from POST /api/v1/flights', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsForbidden1!');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotFlightsForbidden1!');

    const response = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: 'whatever',
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        ...flightTimes(PAST_DATE, 30),
      },
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('a landing at/before takeoff or a duration over 1440 minutes is a 422 FLIGHT_TIMES_INVALID (story 11.1, AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 10000);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsTimesInvalid1!');

    const sameInstantResponse = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        takeoffAt: `${PAST_DATE}T10:00:00.000Z`,
        landingAt: `${PAST_DATE}T10:00:00.000Z`,
      },
    });
    expect(sameInstantResponse.status()).toBe(422);
    expect(((await sameInstantResponse.json()) as { error: { code: string } }).error.code).toBe('FLIGHT_TIMES_INVALID');

    const tooLongResponse = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        ...flightTimes(PAST_DATE, 1441),
      },
    });
    expect(tooLongResponse.status()).toBe(422);
    expect(((await tooLongResponse.json()) as { error: { code: string } }).error.code).toBe('FLIGHT_TIMES_INVALID');
  });

  test('a landing past midnight (landingTime <= takeoffTime) is interpreted as the following day, both via the UI and the API (story 11.1, AC 2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 12000); // 120,00 €/h
    const pilot = await createPilotWithLogin(page, 'PilotFlightsMidnight1!');

    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(
      page.getByTestId('flight-form').getByLabel('Pilota o allievo'),
      pilot.lastName,
      `${pilot.lastName} ${pilot.firstName}`,
    );
    await page.getByLabel('Data volo').fill(PAST_DATE);
    // 23:30 -> 00:10 the next day: 40', not a negative duration.
    await page.getByLabel('Ora decollo').fill('23:30');
    await page.getByLabel('Ora atterraggio').fill('00:10');
    await expect(page.getByTestId('flight-computed-duration')).toHaveText('0:40');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

    const resultPanel = page.getByTestId('flight-result-panel');
    await expect(resultPanel).toContainText('0:40');

    // Same case directly via the API, with `landingAt` on the NEXT calendar
    // day (the server never needs the UI's own +1-day rollover — it just
    // compares the two given instants): no 422, minutes derives to 40.
    const response = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        takeoffAt: `${PAST_DATE}T23:30:00.000Z`,
        landingAt: '2020-01-02T00:10:00.000Z',
      },
    });
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { flight: { minutes: number } };
    expect(body.flight.minutes).toBe(40);
  });

  test('nav shows "Voli" for both staff and a pilot (story 5.4, FR-17: own-access registry)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsNav123!');

    await page.goto('/it/dashboard');
    const adminNav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(adminNav.getByRole('link', { name: 'Voli', exact: true })).toHaveAttribute('href', '/it/dashboard/flights');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotFlightsNav123!');
    const pilotNav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(pilotNav.getByRole('link', { name: 'Voli', exact: true })).toHaveAttribute('href', '/it/dashboard/flights');
  });

  test('the registry shows the new logbook columns (data DD/MM/YYYY, tratta, orari, decolli/atterraggi) and derives the PIC for a dual SCHOOL flight as the instructor (story 11.2, AC 1/2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 10000);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsLogbook1!');
    const instructor = await createInstructorWithRate(page, 4000);

    const departure = `Campo-${uniqueSuffix()}`;
    const arrival = `Base-${uniqueSuffix()}`;
    const takeoffAt = `${PAST_DATE}T10:00:00.000Z`;
    const landingAt = `${PAST_DATE}T11:00:00.000Z`;

    // Direct API registration (not the form): the tratta/orari assertions
    // below need EXACT, run-deterministic values — the form composes
    // `takeoffAt`/`landingAt` from the BROWSER's local timezone, which this
    // suite never pins (Playwright inherits the container's `Etc/UTC`), so a
    // form-filled '10:00' would not reliably equal `10:00:00.000Z`.
    const response = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        instructorPersonId: instructor.personId,
        departureAirfield: departure,
        arrivalAirfield: arrival,
        flightType: 'SCHOOL',
        isSolo: false,
        takeoffAt,
        landingAt,
        takeoffs: 2,
        landings: 3,
      },
    });
    expect(response.status()).toBe(201);

    // Same Europe/Rome conversion the registry's `formatTimeOfDay` applies
    // (Node's `Intl` supports any IANA zone regardless of the host/browser
    // TZ) — computed here instead of hardcoded, so it holds across the
    // CET/CEST boundary too.
    const romeTimeFormatter = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false });
    const expectedTimes = `${romeTimeFormatter.format(new Date(takeoffAt))}–${romeTimeFormatter.format(new Date(landingAt))}`;

    await page.goto('/it/dashboard/flights');
    await selectFromCombobox(page.getByTestId('flight-filter-aircraft'), aircraft.registration, aircraft.registration);
    await expect(page).toHaveURL(/aircraftId=/);

    const row = page.getByTestId('flight-row').first();
    await expect(row).toContainText('01/01/2020');
    await expect(row).toContainText(`${departure} → ${arrival}`);
    await expect(row).toContainText(expectedTimes);
    await expect(row).toContainText('2 / 3');
    // Dual SCHOOL flight (AC 2): the PIC is the INSTRUCTOR, distinctly from
    // the existing "Istruttore" column (same name, different cell).
    await expect(row.getByTestId('flight-pic-cell')).toHaveText(`${instructor.lastName} ${instructor.firstName}`);

    // A SOLO SCHOOL flight on the same pilot: the PIC is the pilot (allievo), not the instructor.
    const soloResponse = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        instructorPersonId: instructor.personId,
        departureAirfield: departure,
        arrivalAirfield: arrival,
        flightType: 'SCHOOL',
        isSolo: true,
        takeoffAt: `${PAST_DATE}T12:00:00.000Z`,
        landingAt: `${PAST_DATE}T12:30:00.000Z`,
      },
    });
    expect(soloResponse.status()).toBe(201);
    await page.reload();
    const soloRow = page.getByTestId('flight-row').filter({ hasText: 'solista' }).first();
    await expect(soloRow.getByTestId('flight-pic-cell')).toHaveText(`${pilot.lastName} ${pilot.firstName}`);
  });
});

test.describe('Modal dialog for the flight form (Story 12.3, AC 1/2/3/6/7)', () => {
  test('the register dialog is keyboard-first: focus lands on Velivolo on open, Esc closes it and returns focus to the trigger', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/flights');

    await page.getByTestId('flight-open-register').click();
    const dialog = page.getByTestId('flight-form');
    await expect(dialog).toBeVisible();
    // AC 3: native <dialog> showModal() focusing steps land on the first
    // real field (Velivolo), NOT the scrollable card wrapper (verified live
    // via Playwright MCP against a known Chromium quirk — an
    // `overflow-y-auto` region with no explicit tabindex is otherwise
    // "focusable" and wins, fixed in the shared `Dialog`/`Sheet` primitive).
    await expect(page.getByTestId('flight-aircraft')).toBeFocused();

    // First Esc dismisses the Velivolo combobox's OWN popup — it auto-opens
    // in browse mode on focus (story TD-3's `handleFocus`) — the dialog
    // itself stays open (verified live: a single Esc here does NOT close it).
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    // Second Esc closes the dialog (AC 1/7) and returns focus, natively, to
    // the element that opened it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('flight-open-register')).toBeFocused();
  });

  test('typed time shorthand (1430/1600) normalizes and derives the duration live, without touching the wire semantics (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);

    await page.getByLabel('Ora decollo').fill('1430');
    await page.getByLabel('Ora atterraggio').fill('1600');
    await expect(page.getByTestId('flight-computed-duration')).toHaveText('1:30');
  });

  test('GET /api/v1/flights/{id}: the titolare gets 200, a DIFFERENT pilot gets 404 — never 403 (anti-enumeration, AC 6)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 10000);
    const pilotA = await createPilotWithLogin(page, 'PilotFlightsDetailA1!');
    const pilotB = await createPilotWithLogin(page, 'PilotFlightsDetailB1!');

    const registerResponse = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilotA.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        ...flightTimes(PAST_DATE, 30),
      },
    });
    expect(registerResponse.status()).toBe(201);
    const flight = (await registerResponse.json()) as { flight: { id: string } };

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilotA.email, 'PilotFlightsDetailA1!');
    const ownResponse = await page.request.get(`/api/v1/flights/${flight.flight.id}`);
    expect(ownResponse.status()).toBe(200);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilotB.email, 'PilotFlightsDetailB1!');
    const otherResponse = await page.request.get(`/api/v1/flights/${flight.flight.id}`);
    expect(otherResponse.status()).toBe(404);
    const otherBody = (await otherResponse.json()) as { error: { code: string } };
    expect(otherBody.error.code).toBe('NOT_FOUND');
  });
});
