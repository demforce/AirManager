import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/flight-log.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/** Same `SearchCombobox` typeahead helper as `flights.spec.ts` (story TD-3) — the filter bar's velivolo/persona pickers. */
async function selectFromCombobox(combobox: Locator, query: string, optionLabel: string): Promise<void> {
  await combobox.click();
  await combobox.fill(query);
  await combobox.page().getByRole('option', { name: optionLabel, exact: true }).click();
}

/** Run-unique names (same pattern as the other specs, for the dirty/parallel DB). */
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

/** Creates a fresh pilot person (active pilot profile) plus a linked login user — always a BRAND NEW person, never the shared seeded pilot (mutated by other, parallel e2e specs — `fullyParallel: true`). Mirrors `flights.spec.ts`'s `createPilotWithLogin`. */
async function createPilotWithLogin(page: Page, password: string, tag: string): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Volo';
  const lastName = `${tag}-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail('pilot-flightlog');
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

/** A plain pilot/student person (active pilot profile, no login needed) — for the "another person" side of a filter/own-access assertion. */
async function createPilotPerson(page: Page, tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Volo';
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

async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string; registration: string }> {
  // Same `.slice(0, 20)` convention as `aircraft-rates.spec.ts`'s `uniqueAircraft`.
  const suffix = uniqueSuffix();
  const registration = `I-FL${suffix}`.toUpperCase().slice(0, 20);

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

type RegisterFlightParams = {
  aircraftId: string;
  personId: string;
  flightDate: string;
  flightType: 'PRIVATE' | 'SCHOOL' | 'OTHER';
  minutes: number;
};

async function registerFlight(page: Page, params: RegisterFlightParams): Promise<{ id: string }> {
  const response = await page.request.post('/api/v1/flights', { data: params });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { flight: { id: string } };
  return body.flight;
}

test.describe('Flight log with filters and role-scoped visibility (Story 5.4, AC 1/2/3/4; FR-17)', () => {
  test('a pilot sees ONLY their own flights (own or as instructor), including a cancelled one, in their own-access registry — no form, no actions', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createPilotWithLogin(page, 'PilotOwnView123!', 'Titolare');
    const otherPerson = await createPilotPerson(page, 'AltroTitolare');

    // The pilot's own flight (stays REGISTERED).
    await registerFlight(page, { aircraftId: aircraft.id, personId: pilot.personId, flightDate: '2020-02-01', flightType: 'PRIVATE', minutes: 30 });
    // A second flight for the pilot, later cancelled — AC 1: "storia completa", cancelled flights stay visible in own-access scope.
    const toCancel = await registerFlight(page, {
      aircraftId: aircraft.id,
      personId: pilot.personId,
      flightDate: '2020-03-01',
      flightType: 'OTHER',
      minutes: 50,
    });
    const cancelResponse = await page.request.post(`/api/v1/flights/${toCancel.id}/cancel`, { data: { reason: 'Errore di prova' } });
    expect(cancelResponse.status()).toBe(200);
    // Someone else's flight on the SAME aircraft — must NEVER show up in the pilot's own registry.
    await registerFlight(page, { aircraftId: aircraft.id, personId: otherPerson.personId, flightDate: '2020-02-01', flightType: 'PRIVATE', minutes: 40 });

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotOwnView123!');

    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(nav.getByRole('link', { name: 'Voli', exact: true })).toHaveAttribute('href', '/it/dashboard/flights');
    await nav.getByRole('link', { name: 'Voli', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'I miei voli' })).toBeVisible();
    // No registration form, no per-row actions for a non-staff actor.
    await expect(page.getByTestId('flight-form')).toHaveCount(0);
    await expect(page.getByTestId('flight-cancel-action')).toHaveCount(0);
    await expect(page.getByTestId('flight-correct-action')).toHaveCount(0);
    // Only staff filters (aircraft/persona) are absent; period/tipo/stato remain.
    await expect(page.getByTestId('flight-filter-aircraft')).toHaveCount(0);
    await expect(page.getByTestId('flight-filter-person')).toHaveCount(0);

    // Exactly the pilot's own 2 flights (this pilot is brand new — nothing else could be theirs), never the other person's.
    const rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: otherPerson.lastName })).toHaveCount(0);
    await expect(rows.filter({ hasText: 'Annullato' })).toHaveCount(1);

    // Own-access filters (period/tipo/stato) narrow the results.
    await page.getByTestId('flight-filter-status').selectOption('CANCELLED');
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-row').first()).toContainText('Annullato');

    await page.getByTestId('flight-filter-reset').click();
    await expect(page.getByTestId('flight-row')).toHaveCount(2);

    await page.getByTestId('flight-filter-type').selectOption('PRIVATE');
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-row').first()).toContainText('Privato');
  });

  test('a non-staff actor filtering GET /api/v1/flights by someone else\'s personId gets a 403 envelope (AC 4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotWithLogin(page, 'PilotForbidden123!', 'Forbidden');
    const otherPerson = await createPilotPerson(page, 'AltroForbidden');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotForbidden123!');

    const response = await page.request.get(`/api/v1/flights?personId=${otherPerson.personId}`);
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');

    // Filtering by their OWN id is redundant but allowed (never 403).
    const ownResponse = await page.request.get(`/api/v1/flights?personId=${pilot.personId}`);
    expect(ownResponse.status()).toBe(200);
  });

  test('staff: filters by velivolo, persona, tipo and periodo (combined) restrict the registry (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraftA = await createAircraftWithRate(page, 15000);
    const aircraftB = await createAircraftWithRate(page, 9000);
    const personA = await createPilotPerson(page, 'FiltroA');
    const personB = await createPilotPerson(page, 'FiltroB');

    // Four flights spanning two aircraft, two people, two types, two periods.
    await registerFlight(page, { aircraftId: aircraftA.id, personId: personA.personId, flightDate: '2020-05-01', flightType: 'PRIVATE', minutes: 30 });
    await registerFlight(page, { aircraftId: aircraftB.id, personId: personB.personId, flightDate: '2020-06-15', flightType: 'OTHER', minutes: 45 });

    await page.goto('/it/dashboard/flights');

    // Velivolo filter: only aircraftA's flight.
    await selectFromCombobox(page.getByTestId('flight-filter-aircraft'), aircraftA.registration, aircraftA.registration);
    let rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(aircraftA.registration);
    await expect(rows.first()).toContainText(personA.lastName);

    await page.getByTestId('flight-filter-reset').click();

    // Persona filter: only personB's flight.
    await selectFromCombobox(
      page.getByTestId('flight-filter-person'),
      personB.lastName,
      `${personB.lastName} ${personB.firstName}`,
    );
    rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(personB.lastName);

    await page.getByTestId('flight-filter-reset').click();

    // Combined periodo + tipo: dateFrom/dateTo bracketing only the June flight, tipo OTHER -> only personB's flight.
    await page.getByTestId('flight-filter-date-from').fill('2020-06-01');
    await page.getByTestId('flight-filter-date-to').fill('2020-06-30');
    await page.getByTestId('flight-filter-type').selectOption('OTHER');
    rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(personB.lastName);
    await expect(rows.first()).toContainText('Altro');

    await page.getByTestId('flight-filter-reset').click();
    // Reset shows both again (no other run's flights ever touch these run-unique aircraft).
    await expect(page.getByTestId('flight-row').filter({ hasText: aircraftA.registration })).toHaveCount(1);
    await expect(page.getByTestId('flight-row').filter({ hasText: aircraftB.registration })).toHaveCount(1);
  });

  test('staff: pagination shows a second page once a filtered person has more than one page of flights (NFR-6)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 6000);
    const person = await createPilotPerson(page, 'Paginazione');

    // 21 flights (the registry's page size is 20) for the SAME run-unique person — distinct dates so nothing collides.
    for (let day = 1; day <= 21; day += 1) {
      const flightDate = `2020-04-${String(day).padStart(2, '0')}`;
      await registerFlight(page, { aircraftId: aircraft.id, personId: person.personId, flightDate, flightType: 'PRIVATE', minutes: 10 });
    }

    await page.goto(`/it/dashboard/flights?personId=${person.personId}`);

    await expect(page.getByTestId('flight-row')).toHaveCount(20);
    await expect(page.getByTestId('flight-pagination-status')).toHaveText('1 / 2');

    await page.getByRole('link', { name: '→' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-pagination-status')).toHaveText('2 / 2');

    await page.getByRole('link', { name: '←' }).click();
    await expect(page.getByTestId('flight-pagination-status')).toHaveText('1 / 2');
  });
});
