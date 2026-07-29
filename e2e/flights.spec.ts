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
 * Types into a `SearchCombobox` (story TD-3) and clicks the matching option —
 * the "Nuova voce" slide-over's velivolo/pilota/istruttore pickers (story
 * 12.8). `combobox` must already resolve to the specific `<input>` (scoped
 * the same way the old `selectOption({ label })` call sites were).
 * Playwright's auto-waiting on the option locator absorbs both the debounce
 * and the server round-trip — no manual wait needed.
 */
async function selectFromCombobox(combobox: Locator, query: string, optionLabel: string): Promise<void> {
  await combobox.click();
  await combobox.fill(query);
  // Scoped to the combobox's own popup (role=listbox): a page-level option
  // lookup ALSO matches the logbook filter bar's native <select> options
  // since the 2026-07-21 filter-UI change (the 103-F1 page-level-selector
  // lesson again).
  await combobox.page().getByRole('listbox').getByRole('option', { name: optionLabel, exact: true }).click();
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
 * The seed's own blocksBooking=true catalogue (`prisma/seed.ts#STANDARD_EXPIRY_TYPES`,
 * story 6.1) — review F5 (ratifica R-14.4-a, BLAST RADIUS note): since this
 * story, a person with NO `Expiry` row at all for an APPLICABLE blocking type
 * is rejected from flight registration exactly like an expired one, and the
 * seed already ships one such type per PILOTS/STUDENTS/INSTRUCTORS scope
 * (plus "Licenza", PILOTS). Every fresh pilot/student/instructor fixture
 * below registers a FAR-FUTURE (valid) `Expiry` for whichever of these apply,
 * so the rest of this file's "happy path" registrations are not spuriously
 * blocked. Restricted to this FIXED name list — deliberately never "every
 * currently blocksBooking=true type" — so it can never collide with this
 * file's own run-unique `createExpiryTypeForFlights` fixtures (several tests
 * below register one of THOSE as EXPIRED for the very same person right
 * after; a dynamic scan would have already registered a valid one first and
 * hit the `Expiry` unique constraint on personId+expiryTypeId).
 */
const SEED_BLOCKING_EXPIRY_TYPE_NAMES = ['Visita medica classe 1', 'Visita medica classe 2', 'Visita medica LAPL', 'Licenza'];

/** A comfortably far-future date — never itself the boundary under test. */
const FAR_FUTURE_DATE = '2099-12-31';

/** See `SEED_BLOCKING_EXPIRY_TYPE_NAMES`'s own doc-comment. */
async function ensureValidSeedExpiries(page: Page, personId: string, scope: 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS'): Promise<void> {
  const response = await page.request.get('/api/v1/expiry-types');
  expect(response.status()).toBe(200);
  const types = (await response.json()) as { id: string; name: string; scope: string }[];
  const applicable = types.filter((type) => SEED_BLOCKING_EXPIRY_TYPE_NAMES.includes(type.name) && type.scope === scope);
  for (const type of applicable) {
    await registerExpiry(page, personId, type.id, FAR_FUTURE_DATE);
  }
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
  // Review F5 blast-radius fixture fix — see `ensureValidSeedExpiries`'s own doc-comment.
  await ensureValidSeedExpiries(page, person.id, 'PILOTS');

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
  // Review F5 blast-radius fixture fix — see `ensureValidSeedExpiries`'s own doc-comment.
  await ensureValidSeedExpiries(page, person.id, 'INSTRUCTORS');

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

/**
 * Creates a run-unique expiry TYPE via the admin API (story 14.4; same
 * "MAI riusare 'Licenza' del seed" rationale as `bookings.spec.ts`'s own
 * `createExpiryTypeForBooking` — the catalogue is shared across parallel
 * specs). `scope: 'ALL'` (any person is eligible) — `blocksBooking` gates
 * BOTH bookings AND, since this story, flight registration (module
 * doc-comment on `ExpiryType.blocksBooking` in `schema.prisma`).
 */
async function createExpiryTypeForFlights(page: Page, blocksBooking: boolean): Promise<{ id: string; name: string }> {
  const name = `Tipo voli ${uniqueSuffix()}`;
  const response = await page.request.post('/api/v1/expiry-types', { data: { name, scope: 'ALL', blocksBooking } });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { id: string };
  return { id: body.id, name };
}

/** Registers a scadenza for a person via the staff API (story 14.4; `expiries` API of story 6.2). */
async function registerExpiry(page: Page, personId: string, expiryTypeId: string, expiresAt: string): Promise<void> {
  const response = await page.request.post('/api/v1/expiries', { data: { personId, expiryTypeId, expiresAt } });
  expect(response.status()).toBe(201);
}

/** A safely-EXPIRED date for `PAST_DATE` flights (well before it, immune to DST/timezone edge cases). */
const EXPIRED_BEFORE_PAST_DATE = '2019-06-01';

/** Opens the "Nuova voce" slide-over (story 12.8) — staff-only, replaces the legacy inline "Registra volo" form. */
async function openNewEntryForm(page: Page): Promise<void> {
  await page.getByTestId('logbook-new-button').click();
  await expect(page.getByTestId('flight-form')).toBeVisible();
}

test.describe('Flight logging with automatic charges (Story 5.1, AC 1/2/3/4; Story 11.1, AC 1/2; Story 12.8: AirOps logbook)', () => {
  test('staff registers a flight with takeoff/landing times: duration auto-derived and shown live, breakdown shown INSIDE the slide-over, balance drops in the estratto conto (FLIGHT_CHARGE, negative), aircraft hour meter advances', async ({
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

    await page.goto('/it/dashboard/logbook');
    await openNewEntryForm(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    // 80' (1:20) via takeoff/landing times — story 11.1, AC 2: the duration is derived, never a direct input.
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:20');
    await expect(page.getByTestId('flight-computed-duration')).toHaveText('1:20');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    // 80' @ 150,00 €/h -> 200,00 € (the PRD-testable 80'x150 case) — ratifica 1: the breakdown/nuovo saldo stays INSIDE the slide-over on success.
    const resultPanel = page.getByTestId('flight-result-panel');
    await expect(resultPanel).toContainText('1:20');
    await expect(resultPanel).toContainText(/150,00\s€/);
    await expect(resultPanel.getByTestId('flight-result-total')).toContainText(/200,00\s€/);
    await expect(resultPanel.getByTestId('flight-result-new-balance')).toContainText(/-200,00\s€/);
    await page.getByTestId('flight-result-close').click();

    const row = page.getByTestId('flight-row').filter({ hasText: aircraft.registration });
    await expect(row).toContainText('1:20');
    await expect(row).toContainText(/200,00\s€/);

    // Aircraft hour meter advanced by exactly the flight's minutes (100 + 80 = 180 -> 3:00).
    // T0 hardening: filter by this test's own registration instead of relying
    // on it landing on the default page 1 (root-caused empirically — under a
    // fully-parallel e2e run, dozens of aircraft get created by OTHER specs;
    // `/dashboard/fleet` (story 12.5, the `/dashboard/aircraft` page's
    // replacement) is paginated 20/page ordered by `registration asc`, so a
    // freshly created, run-unique registration can sort well past page 1 and
    // never appear, which read as a flaky `toContainText` timeout even
    // though the underlying data was correct all along). The fleet page
    // still supports `?q=` server-side search (`aircraft.service.ts`); the
    // contaore now lives inside the slide-over editor's "Contaore" section
    // (the card itself only shows the wet rate, story 12.5 AC 2), scoped by
    // the card's own `data-testid="ac-card-{id}"` (no text-match ambiguity).
    await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
    await page.getByTestId(`ac-card-${aircraft.id}`).click();
    await expect(page.getByTestId('hour-meter-current')).toContainText('3:00');

    // Estratto conto: a FLIGHT_CHARGE row, negative, same total.
    await page.goto(`/it/dashboard/people/${pilot.personId}/account`);
    const statementRow = page.getByTestId('account-movement-row').filter({ hasText: 'Addebito volo' });
    await expect(statementRow).toContainText(/-200,00\s€/);
    await expect(page.getByTestId('account-balance')).toContainText(/-200,00\s€/);
  });

  test('orari decollo/atterraggio derivano la durata (contaore ormai solo informativo); a SCHOOL flight with an instructor charges both and sums the total', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 12000); // 120,00 €/h
    const pilot = await createPilotWithLogin(page, 'PilotFlights456!');
    const instructor = await createInstructorWithRate(page, 4000); // 40,00 €/h

    // Still authenticated as admin — creating the pilot/instructor logins above never touched this session cookie.
    await page.goto('/it/dashboard/logbook');
    await openNewEntryForm(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await selectFromCombobox(page.getByLabel('Istruttore'), instructor.lastName, `${instructor.lastName} ${instructor.firstName}`);
    await page.getByTestId('flight-form').getByLabel('Tipo di volo').selectOption({ label: 'Scuola' });
    // 60' via takeoff/landing times — the (optional, purely informational) contaore pair is left blank.
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:00');
    await expect(page.getByTestId('flight-computed-duration')).toHaveText('1:00');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    // 60' @ 120,00 €/h -> 120,00 €; 60' @ 40,00 €/h -> 40,00 €; total 160,00 €.
    const resultPanel = page.getByTestId('flight-result-panel');
    await expect(resultPanel).toContainText('1:00');
    await expect(resultPanel.getByTestId('flight-result-total')).toContainText(/160,00\s€/);
    await page.getByTestId('flight-result-close').click();

    const row = page.getByTestId('flight-row').filter({ hasText: aircraft.registration });
    await expect(row).toContainText(`CFI ${instructor.lastName} ${instructor.firstName}`);
    await expect(row).toContainText('Scuola');
    await expect(row).toContainText('1:00');
    await expect(row).toContainText(/160,00\s€/);
    // Dual SCHOOL flight (AC 2): the PIC is the INSTRUCTOR (own dedicated cell, distinct from the "pilota" column above).
    await expect(row.getByTestId('flight-pic-cell')).toHaveText(`${instructor.lastName} ${instructor.firstName}`);
  });

  test('an invalid hour-meter pair (end <= start) shows the HOUR_METER_INVALID message in the form (story 11.1: two independent optional fields, no radio/mode anymore)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createPilotWithLogin(page, 'PilotFlights789!');

    await page.goto('/it/dashboard/logbook');
    await openNewEntryForm(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByLabel('Contaore iniziale', { exact: true }).fill('200');
    await page.getByLabel('Contaore finale', { exact: true }).fill('200');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText("Il contaore finale deve essere maggiore dell'iniziale.");
  });

  test('an incomplete hour-meter pair (only the start filled) shows the HOUR_METER_INVALID message in the form', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsHM1!');

    await page.goto('/it/dashboard/logbook');
    await openNewEntryForm(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByLabel('Contaore iniziale', { exact: true }).fill('200');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText("Il contaore finale deve essere maggiore dell'iniziale.");
  });

  test('an aircraft with no rate in effect shows the NO_AIRCRAFT_RATE message', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, null);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsNoRate1!');

    await page.goto('/it/dashboard/logbook');
    await openNewEntryForm(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByRole('button', { name: 'Registra volo' }).click();

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

    await page.goto('/it/dashboard/logbook');
    await openNewEntryForm(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await page.getByLabel('Data volo').fill(PAST_DATE);
    // 23:30 -> 00:10 the next day: 40', not a negative duration.
    await page.getByLabel('Ora decollo').fill('23:30');
    await page.getByLabel('Ora atterraggio').fill('00:10');
    await expect(page.getByTestId('flight-computed-duration')).toHaveText('0:40');
    await page.getByRole('button', { name: 'Registra volo' }).click();

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

  test('nav shows "Registro voli" for both staff and a pilot (story 5.4, FR-17: own-access registry; story 12.8: repointed at the AirOps sidebar)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotWithLogin(page, 'PilotFlightsNav123!');

    await page.goto('/it/dashboard');
    const adminSidebar = page.locator('aside.sidebar');
    await expect(adminSidebar.getByRole('link', { name: 'Registro voli', exact: true })).toHaveAttribute('href', '/it/dashboard/logbook');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotFlightsNav123!');
    const pilotSidebar = page.locator('aside.sidebar');
    await expect(pilotSidebar.getByRole('link', { name: 'Registro voli', exact: true })).toHaveAttribute('href', '/it/dashboard/logbook');
  });

  test('the registry shows the new logbook columns (data DD/MM/YYYY, tratta, decolli/atterraggi) and derives the PIC for a dual SCHOOL flight as the instructor (story 11.2, AC 1/2; story 12.8 AC 2)', async ({
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

    // Direct API registration (not the form): the tratta assertions below
    // need EXACT, run-deterministic values — the form composes
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

    await page.goto('/it/dashboard/logbook');
    // Native select since the 2026-07-21 filter-UI change.
    await page.getByTestId('flight-filter-aircraft').selectOption({ label: aircraft.registration });
    await expect(page).toHaveURL(/aircraftId=/);

    const row = page.getByTestId('flight-row').first();
    await expect(row).toContainText('01/01/2020');
    await expect(row).toContainText(`${departure} → ${arrival}`);
    await expect(row.getByTestId('flight-takeoffs-cell')).toHaveText('2');
    await expect(row.getByTestId('flight-landings-cell')).toHaveText('3');
    // Dual SCHOOL flight (AC 2): the PIC is the INSTRUCTOR, distinctly from
    // the existing "pilota" column (same name shown there as a "CFI" sub-line, different cell).
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

  test('a student-only person (active student profile, no active pilot profile) forces Tipo volo to SCHOOL in the form, and the forced submission actually succeeds (story 14.3, AC 1/2 — no vicolo cieco, lezione 14.6 F2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 12000);
    const instructor = await createInstructorWithRate(page, 4000);

    // A fresh student-only person (active student profile, NO pilot profile)
    // — no login needed, the admin registers the flight on their behalf.
    const suffix = uniqueSuffix();
    const firstName = 'Allievo';
    const lastName = `SoloScuola-${suffix}`;
    const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
    expect(personResponse.status()).toBe(201);
    const student = (await personResponse.json()) as { id: string };
    const studentProfileResponse = await page.request.put(`/api/v1/people/${student.id}/profiles/student`, {
      data: { courseStartDate: PAST_DATE },
    });
    expect(studentProfileResponse.status()).toBe(200);
    // Review F5 blast-radius fixture fix — this test registers a brand-new
    // flight (not a correction, so F4's identity-unchanged exemption never
    // applies) for this student — see `ensureValidSeedExpiries`'s own doc-comment.
    await ensureValidSeedExpiries(page, student.id, 'STUDENTS');

    await page.goto('/it/dashboard/logbook');
    await openNewEntryForm(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), lastName, `${lastName} ${firstName}`);

    // AC 2: forced + locked to SCHOOL, with a clear reason — never a choice
    // the service (STUDENT_FLIGHT_MUST_BE_SCHOOL) would reject.
    const flightTypeSelect = page.getByTestId('flight-type-select');
    await expect(flightTypeSelect).toHaveValue('SCHOOL');
    await expect(flightTypeSelect).toBeDisabled();
    // Scoped to the form (lezione 103-F1): a page-level `getByText` could
    // also match unrelated copy elsewhere on the page.
    await expect(page.getByTestId('flight-form').locator('.fld-hint')).toContainText('Allievo senza brevetto');

    // No dead end: the forced value is one the service actually accepts,
    // given the (unchanged) instructor requirement on every SCHOOL flight.
    await selectFromCombobox(page.getByLabel('Istruttore'), instructor.lastName, `${instructor.lastName} ${instructor.firstName}`);
    await page.getByLabel('Ora decollo').fill('09:00');
    await page.getByLabel('Ora atterraggio').fill('10:00');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-result-panel')).toBeVisible();
  });

  test('review F1/F2 (14.3): "Correggi volo" on a TOURISM flight whose person is student-only TODAY never rewrites the type nor locks the select — a notes-only correction succeeds unchanged (ratifica R-14.3-a)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 12000);

    // A pilot with an active pilot profile flies a TOURISM flight...
    const pilot = await createPilotWithLogin(page, 'PilotFlightsF1F2-1!');
    const flightResponse = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        departureAirfield: 'Base',
        arrivalAirfield: 'Base',
        flightType: 'TOURISM',
        ...flightTimes(PAST_DATE, 60),
      },
    });
    expect(flightResponse.status()).toBe(201);
    const flight = (await flightResponse.json()) as { flight: { id: string } };

    // ...then, SINCE that flight, loses the pilot profile and gains a
    // student one — student-only TODAY (review F1's exact repro shape),
    // while the historical flight stays TOURISM on file.
    const deactivateResponse = await page.request.post(`/api/v1/people/${pilot.personId}/profiles/pilot/deactivate`);
    expect(deactivateResponse.status()).toBe(200);
    const studentProfileResponse = await page.request.put(`/api/v1/people/${pilot.personId}/profiles/student`, {
      data: { courseStartDate: PAST_DATE },
    });
    expect(studentProfileResponse.status()).toBe(200);

    await page.goto('/it/dashboard/logbook');
    // Persona filter, free-text (story 13.5, AC 7) — the RUN-UNIQUE last
    // name keeps this a single row regardless of the dirty DB/pagination
    // (lezione 6.3 F1), unlike a plain page-1 lookup on a PAST_DATE flight.
    await page.getByTestId('flight-filter-person').fill(pilot.lastName);
    await expect(page).toHaveURL(new RegExp(`personQuery=${encodeURIComponent(pilot.lastName)}`));
    const row = page.getByTestId('flight-row');
    await expect(row).toHaveCount(1);
    await row.getByTestId('flight-correct-action').click();
    await expect(page.getByTestId('flight-form')).toBeVisible();

    const flightTypeSelect = page.getByTestId('flight-type-select');
    // F1: the type stays what is ON FILE — never silently re-derived from
    // the person's CURRENT (student-only) profile. F1/F2: correcting NEVER
    // disables the select (only a NEW registration does), whether or not
    // the form already knows this person's profile at this point (it may
    // not — the prefilled person is not guaranteed to be on the server-
    // rendered options page, review's own "fuori dalle prime 100" case).
    await expect(flightTypeSelect).toHaveValue('TOURISM');
    await expect(flightTypeSelect).toBeEnabled();

    // F2's own repro path: typing the person's OWN name into the picker
    // (without re-selecting) lets `searchPilotStudent` learn their CURRENT
    // profile flags for certain (deterministic, unlike the page above).
    const personCombobox = page.getByLabel('Pilota o allievo');
    await personCombobox.click();
    await personCombobox.fill(pilot.lastName);
    await expect(page.getByRole('listbox').getByRole('option', { name: `${pilot.lastName} ${pilot.firstName}`, exact: true })).toBeVisible();
    // NB: never `Escape` here — `SlideOver`'s window-level handler closes the
    // WHOLE panel (slide-over.tsx:29-31), and the assertions below would then
    // race the closing animation and read stale/absent nodes (that is exactly
    // how this test first failed). Leaving the combobox popup open is fine:
    // the assertions below read the select's state, not its visibility, and
    // filling "Note" further down closes the popup naturally.

    // Now the profile IS known — the select must STILL be enabled and
    // STILL on TOURISM (never locked into a server-rejected dead end, the
    // invariant `disabled ⇒ value === 'SCHOOL'` holds trivially here since
    // correct mode never disables at all), and the correction hint now
    // explains the situation, naming the on-file type.
    await expect(flightTypeSelect).toHaveValue('TOURISM');
    await expect(flightTypeSelect).toBeEnabled();
    await expect(page.getByTestId('flight-form').locator('.fld-hint')).toContainText('Turismo');

    // A notes-only correction goes through untouched: type unchanged, no
    // instructor needed (still TOURISM), no new SCHOOL charge.
    await page.getByLabel('Note').fill('Nota di correzione, tipo invariato');
    await page.getByLabel('Motivo della correzione').fill('Verifica review F1/F2');
    await page.getByRole('button', { name: 'Conferma correzione' }).click();

    await expect(page.getByTestId('flight-result-panel')).toBeVisible();

    const detailResponse = await page.request.get(`/api/v1/flights?personId=${pilot.personId}&pageSize=10`);
    expect(detailResponse.status()).toBe(200);
    const detailBody = (await detailResponse.json()) as { items: { id: string; flightType: string; status: string; correctionOfId: string | null }[] };
    const corrected = detailBody.items.find((item) => item.correctionOfId === flight.flight.id);
    expect(corrected?.flightType).toBe('TOURISM');
    expect(corrected?.status).toBe('REGISTERED');
  });
});

test.describe('Blocking expiry guard-rail & admin override (Story 14.4, AC 1/2/3/4; ratifica R4)', () => {
  test('STAFF: a pilot with a BLOCKING expired document (at the FLIGHT DATE) is rejected naming the document and its date, with NO override affordance (admin-only)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 15000);
    const blockingType = await createExpiryTypeForFlights(page, true);
    const pilot = await createPilotWithLogin(page, 'PilotBlocked123!');
    await registerExpiry(page, pilot.personId, blockingType.id, EXPIRED_BEFORE_PAST_DATE);

    const staffPassword = 'StaffBlocked123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);
    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);

    await page.goto('/it/dashboard/logbook');
    await openNewEntryForm(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await page.getByLabel('Data volo').fill(PAST_DATE);
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText(blockingType.name);
    await expect(page.getByTestId('flight-form-error')).toContainText('01/06/2019'); // EXPIRED_BEFORE_PAST_DATE, IT date format (DD/MM/YYYY).
    await expect(page.getByTestId('force-flight-section')).toHaveCount(0);
    await expect(page.getByTestId('flight-row').filter({ hasText: aircraft.registration })).toHaveCount(0);
  });

  test('ADMIN: a blocked pilot triggers 422 naming the document, "Forza registrazione" appears, empty motivo is rejected client-side, and a motivated force succeeds (201) with forcedAt/forceReason tracked and shown as a badge in the registry', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 12000);
    const blockingType = await createExpiryTypeForFlights(page, true);
    const pilot = await createPilotWithLogin(page, 'PilotForce123!');
    await registerExpiry(page, pilot.personId, blockingType.id, EXPIRED_BEFORE_PAST_DATE);

    await page.goto('/it/dashboard/logbook');
    await openNewEntryForm(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await page.getByLabel('Data volo').fill(PAST_DATE);
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText(blockingType.name);
    const forceSection = page.getByTestId('force-flight-section');
    await expect(forceSection).toBeVisible();

    // Submitting without a motivo is rejected client-side first.
    await forceSection.getByTestId('force-flight-submit').click();
    await expect(forceSection.getByTestId('force-flight-error')).toBeVisible();

    await forceSection.getByTestId('force-flight-reason').fill('Autorizzato dal direttore per volo urgente');
    await forceSection.getByTestId('force-flight-submit').click();

    await expect(page.getByTestId('flight-result-panel')).toBeVisible();

    // The tracking (AC 2 "chi, quando, perché") is exposed read-side on the item DTO.
    const listResponse = await page.request.get(`/api/v1/flights?personId=${pilot.personId}&pageSize=10`);
    expect(listResponse.status()).toBe(200);
    const listBody = (await listResponse.json()) as { items: { forcedAt: string | null; forceReason: string | null }[] };
    expect(listBody.items[0]?.forcedAt).not.toBeNull();
    expect(listBody.items[0]?.forceReason).toBe('Autorizzato dal direttore per volo urgente');

    // Visible in the registry too (AC 2 "persistita e visibile"), not just on the wire.
    // Scoped via the run-unique person free-text filter (same pattern as the
    // review F1/F2 test below, lezione 6.3 F1) rather than trusting default
    // page-1 ordering: `PAST_DATE` (2020-01-01) is reused by many specs across
    // this whole (never-reset) suite, so `flightDate desc` pagination alone
    // does not guarantee this run-unique flight lands on page 1.
    await page.getByTestId('flight-result-close').click();
    await page.getByTestId('flight-filter-person').fill(pilot.lastName);
    await expect(page).toHaveURL(new RegExp(`personQuery=${encodeURIComponent(pilot.lastName)}`));
    const row = page.getByTestId('flight-row');
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('flight-forced-badge')).toBeVisible();
  });

  test('a non-admin actor cannot force even via a direct API call (403), and force: true without forceReason is a 422 (schema)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 12000);
    const blockingType = await createExpiryTypeForFlights(page, true);
    const pilot = await createPilotWithLogin(page, 'PilotForceApi123!');
    await registerExpiry(page, pilot.personId, blockingType.id, EXPIRED_BEFORE_PAST_DATE);

    const staffPassword = 'StaffForceApi123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);
    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);

    const response = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        force: true,
        forceReason: 'Tentativo non autorizzato',
        ...flightTimes(PAST_DATE, 30),
      },
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('an instructor with a blocking expired document (pilot clear) is rejected naming the instructor\'s document, and an ADMIN override succeeds', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 12000);
    const blockingType = await createExpiryTypeForFlights(page, true);
    const pilot = await createPilotWithLogin(page, 'PilotInstrBlock123!');
    const instructor = await createInstructorWithRate(page, 4000);
    await registerExpiry(page, instructor.personId, blockingType.id, EXPIRED_BEFORE_PAST_DATE);

    await page.goto('/it/dashboard/logbook');
    await openNewEntryForm(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await selectFromCombobox(page.getByLabel('Istruttore'), instructor.lastName, `${instructor.lastName} ${instructor.firstName}`);
    await page.getByLabel('Data volo').fill(PAST_DATE);
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText(blockingType.name);
    const forceSection = page.getByTestId('force-flight-section');
    await forceSection.getByTestId('force-flight-reason').fill('Autorizzato dal direttore');
    await forceSection.getByTestId('force-flight-submit').click();

    await expect(page.getByTestId('flight-result-panel')).toBeVisible();
  });

  test('a flight that pushes the pilot balance negative shows an in-app warning to the operator, without blocking the registration (AC 3, decision D1)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 20000); // 200,00 €/h — a 30' flight from a fresh (0-balance) account crosses into negative.
    const pilot = await createPilotWithLogin(page, 'PilotBalanceAlert123!');

    await page.goto('/it/dashboard/logbook');
    await openNewEntryForm(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    // Review F9 — dated PAST_DATE, not the default "today": an undated flight
    // here would land inside `billing.spec.ts`'s own delta-assert window on
    // TODAY's aggregates (`fullyParallel`, CLAUDE.md's "e2e, stato globale").
    await page.getByLabel('Data volo').fill(PAST_DATE);
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    const resultPanel = page.getByTestId('flight-result-panel');
    await expect(resultPanel).toBeVisible();
    await expect(resultPanel.getByTestId('flight-result-new-balance')).toContainText(/-100,00\s€/);
    await expect(page.getByTestId('flight-balance-alert')).toBeVisible();
  });
});
