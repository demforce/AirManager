import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/flight-reversal.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/** Same `SearchCombobox` typeahead helper as `flights.spec.ts` (story TD-3) — velivolo/persona/istruttore. */
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

/** Story 11.1: composes `{ takeoffAt, landingAt }` for a direct `POST /api/v1/flights`/`.../correct` call — `10:00Z` stays clear of the Europe/Rome midnight boundary. */
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

/** Creates a fresh pilot person (with an active pilot profile, so an `Account` exists) plus a linked login user — same pattern as `flights.spec.ts`. */
async function createPilotWithLogin(page: Page, password: string): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Storno';
  const lastName = `Titolare-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail('pilot-reversal');
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

/** Creates a fresh instructor person (with an active instructor profile and an hourly rate) via the admin API — same pattern as `flights.spec.ts`. */
async function createInstructorWithRate(page: Page, priceCentsPerHour: number): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Istruttore';
  const lastName = `Storno-${suffix}`;

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

/** Creates an aircraft with a rate in effect since `PAST_DATE` (same pattern as `flights.spec.ts`). */
async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-RV${suffix}`.toUpperCase().slice(0, 20);

  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 500 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };

  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
    data: { priceCentsPerHour, validFrom: PAST_DATE },
  });
  expect(rateResponse.status()).toBe(201);

  return { id: aircraft.id, registration };
}

test.describe('Flight cancellation and correction with reversal (Story 5.3, AC 1/2/3/4)', () => {
  test('cancel a school flight (instructor): balance/contaore revert, flight shows ANNULLATO with the reason; a second cancel is a 409; correcting a fresh flight links old->new', async ({
    page,
  }) => {
    // The heaviest single test in the suite (~15 UI interactions across
    // flight, cancel, 409, correct, and three verification pages):
    // functionally green with headroom but it can exceed the default
    // per-test timeout when the dev server compiles its pages cold or under
    // parallel-worker contention — the exact signature of every historical
    // "failure" of this test. slow() triples the timeout without weakening
    // a single assertion.
    test.slow();

    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 15000); // 150,00 €/h
    const pilot = await createPilotWithLogin(page, 'PilotStorno123!');
    const instructor = await createInstructorWithRate(page, 4000); // 40,00 €/h

    // Register a SCHOOL flight (60') with an instructor. Story 12.13:
    // package consumption is retired — the aircraft component is always
    // charged at the full rate now.
    await page.goto('/it/dashboard/logbook');
    await page.getByTestId('logbook-new-button').click();
    await expect(page.getByTestId('flight-form')).toBeVisible();
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await selectFromCombobox(page.getByLabel('Istruttore'), instructor.lastName, `${instructor.lastName} ${instructor.firstName}`);
    await page.getByTestId('flight-form').getByLabel('Tipo di volo').selectOption({ label: 'Scuola' });
    await page.getByLabel('Data volo').fill(PAST_DATE);
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:00');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    // Aircraft 150,00 € (full rate, 60') + instructor 40,00 € full charge -> total 190,00 €
    // — ratifica 1: shown INSIDE the slide-over on success.
    const resultPanel = page.getByTestId('flight-result-panel');
    await expect(resultPanel.getByTestId('flight-result-total')).toContainText(/190,00\s€/);
    await expect(resultPanel.getByTestId('flight-result-new-balance')).toContainText(/-190,00\s€/);
    await page.getByTestId('flight-result-close').click();

    // Aircraft hour meter advanced by 60' (500 -> 560 = 9:20). Search-scoped:
    // the fleet grid (`/dashboard/fleet`, story 12.5) is paginated 20/page
    // ordered by registration, so on an accumulated DB this run's aircraft
    // can sit past page 1 (same TD-1 T0 fix as flights.spec) — the contaore
    // itself now lives inside the slide-over editor's "Contaore" section.
    await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
    await page.getByTestId(`ac-card-${aircraft.id}`).click();
    await expect(page.getByTestId('hour-meter-current')).toContainText('9:20');

    // Cancel it with a reason. Scope the registry to this run's aircraft via
    // the filter bar FIRST (TD-3 review D1): the unfiltered page 1 orders by
    // flightDate desc with a 20-row cap, so on an accumulated DB recent-dated
    // flights from other runs bury this 2020-dated row past the page. The
    // filter change navigates and REMOUNTS the manager — settle on its URL
    // effect before touching anything else (TD-3 review M1 lesson).
    await page.goto('/it/dashboard/logbook');
    await page.getByTestId('flight-filter-aircraft').selectOption({ label: aircraft.registration }); // native select since the 2026-07-21 filter-UI change
    await expect(page).toHaveURL(/aircraftId=/);
    const flightRow = page.getByTestId('flight-row').filter({ hasText: aircraft.registration }).first();
    await flightRow.getByTestId('flight-cancel-action').click();
    const cancelPanel = page.getByTestId('flight-cancel-panel');
    await expect(cancelPanel).toContainText(aircraft.registration);
    await expect(cancelPanel).toContainText(/190,00\s€/);
    await page.getByLabel('Motivo').fill('Volo mai avvenuto per meteo');
    await page.getByTestId('flight-cancel-confirm').click();
    await expect(page.getByTestId('flight-cancel-feedback')).toBeVisible();

    // The row now shows ANNULLATO with the reason, no more actions.
    const cancelledRow = page.getByTestId('flight-row').filter({ hasText: aircraft.registration }).first();
    await expect(cancelledRow.getByTestId('flight-status-badge')).toContainText('Annullato');
    await expect(cancelledRow).toContainText('Volo mai avvenuto per meteo');
    await expect(cancelledRow.getByTestId('flight-cancel-action')).toHaveCount(0);
    await expect(cancelledRow.getByTestId('flight-correct-action')).toHaveCount(0);

    // Balance back to 0,00 € (pre-volo value) — estratto conto shows FLIGHT_CHARGE negative + linked STORNO positive.
    await page.goto(`/it/dashboard/people/${pilot.personId}/account`);
    await expect(page.getByTestId('account-balance')).toContainText(/0,00\s€/);
    const chargeRow = page.getByTestId('account-movement-row').filter({ hasText: 'Addebito volo' }).first();
    await expect(chargeRow).toContainText(/-190,00\s€/);
    const reversalRow = page.getByTestId('account-movement-row').filter({ hasText: 'Storno volo' }).first();
    await expect(reversalRow).toContainText(/\+190,00\s€/);
    await expect(page.getByTestId('reversal-badge')).toBeVisible();

    // Aircraft hour meter reverted to 8:20 (560 - 60 = 500). Same
    // search-scoped fleet-grid navigation as above.
    await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
    await page.getByTestId(`ac-card-${aircraft.id}`).click();
    await expect(page.getByTestId('hour-meter-current')).toContainText('8:20');

    // A second cancel attempt on the same flight is a 409 AD-8 envelope.
    // Scoped to this run's aircraft (TD-3 review D1 class): an UNSCOPED page 1
    // is ordered by flightDate desc, so other runs' recent-dated flights bury
    // this 2020-dated one past the page on an accumulated DB.
    const flightsResponse = await page.request.get(`/api/v1/flights?page=1&pageSize=20&aircraftId=${aircraft.id}`);
    const flightsBody = (await flightsResponse.json()) as { items: { id: string; status: string; aircraft: { registration: string } }[] };
    const cancelledFlight = flightsBody.items.find((item) => item.aircraft.registration === aircraft.registration && item.status === 'CANCELLED');
    expect(cancelledFlight).toBeDefined();
    const secondCancelResponse = await page.request.post(`/api/v1/flights/${cancelledFlight!.id}/cancel`, {
      data: { reason: 'secondo tentativo' },
    });
    expect(secondCancelResponse.status()).toBe(409);
    const secondCancelBody = (await secondCancelResponse.json()) as { error: { code: string } };
    expect(secondCancelBody.error.code).toBe('CONFLICT');

    // A second (independent) 60' TOURISM flight, no instructor this time —
    // full aircraft rate: 150,00 €. Same run-unique registry scoping as
    // above (TD-3 review D1/M1): filter by this run's aircraft and settle
    // BEFORE using the form, so the '2020-01-02' row lookups below cannot
    // be buried by other runs' recent-dated flights.
    await page.goto('/it/dashboard/logbook');
    await page.getByTestId('flight-filter-aircraft').selectOption({ label: aircraft.registration }); // native select since the 2026-07-21 filter-UI change
    await expect(page).toHaveURL(/aircraftId=/);
    await page.getByTestId('logbook-new-button').click();
    await expect(page.getByTestId('flight-form')).toBeVisible();
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await page.getByLabel('Data volo').fill('2020-01-02');
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:00');
    await page.getByRole('button', { name: 'Registra volo' }).click();
    await expect(page.getByTestId('flight-result-panel').getByTestId('flight-result-total')).toContainText(/150,00\s€/);
    await page.getByTestId('flight-result-close').click();

    // Correct it: 60' -> 30' (a genuine "dati sbagliati" fix) — same takeoff (prefilled from the original), landing moved an hour earlier.
    // Disambiguated by the presence of a still-available "Correggi" action
    // (the REGISTERED row) rather than an H:MM duration substring: `textContent`
    // concatenates adjacent cells with NO separator, so a `\b`-anchored regex
    // can still land mid-word right after the preceding cell's own text
    // (e.g. the type badge "Turismo" butting straight up against "0:30") —
    // a structural filter has no such gotcha.
    const secondFlightRow = page.getByTestId('flight-row').filter({ hasText: '02/01/2020' }).filter({ has: page.getByTestId('flight-correct-action') });
    await secondFlightRow.getByTestId('flight-correct-action').click();
    await expect(page.locator('.so-title')).toHaveText('Correggi volo');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByLabel('Motivo della correzione').fill('Durata inserita per errore');
    await page.getByRole('button', { name: 'Conferma correzione' }).click();

    // The new (30') flight is REGISTERED and marked as a correction; the old (60') is ANNULLATO and marked as corrected.
    // 30' at 150,00 €/h -> 75,00 €.
    await expect(page.getByTestId('flight-result-panel').getByTestId('flight-result-total')).toContainText(/75,00\s€/);
    await page.getByTestId('flight-result-close').click();
    const correctedRow = page.getByTestId('flight-row').filter({ hasText: '02/01/2020' }).filter({ has: page.getByTestId('flight-correct-action') });
    await expect(correctedRow).toContainText('Correzione di un volo precedente');
    const oldRow = page.getByTestId('flight-row').filter({ hasText: '02/01/2020' }).filter({ hasText: 'Annullato' });
    await expect(oldRow.getByTestId('flight-status-badge')).toContainText('Annullato');
    await expect(oldRow).toContainText('Corretto da un volo successivo');
    await expect(oldRow).toContainText('Durata inserita per errore');

    // Net balance: 0,00 € (first flight, cancelled) - 75,00 € (corrected second flight) = -75,00 €.
    await page.goto(`/it/dashboard/people/${pilot.personId}/account`);
    await expect(page.getByTestId('account-balance')).toContainText(/-75,00\s€/);
  });

  test('a pilot gets a 403 AD-8 envelope from both POST /cancel and POST /correct', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 10000);
    const pilot = await createPilotWithLogin(page, 'PilotStornoForbidden1!');

    const flightResponse = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        ...flightTimes(PAST_DATE, 30),
      },
    });
    expect(flightResponse.status()).toBe(201);
    const flightBody = (await flightResponse.json()) as { flight: { id: string } };
    const flightId = flightBody.flight.id;

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotStornoForbidden1!');

    const cancelResponse = await page.request.post(`/api/v1/flights/${flightId}/cancel`, { data: { reason: 'tentativo pilota' } });
    expect(cancelResponse.status()).toBe(403);
    expect(((await cancelResponse.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    const correctResponse = await page.request.post(`/api/v1/flights/${flightId}/correct`, {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        ...flightTimes(PAST_DATE, 45),
        reason: 'tentativo pilota',
      },
    });
    expect(correctResponse.status()).toBe(403);
    expect(((await correctResponse.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });
});
