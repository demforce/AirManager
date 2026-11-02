import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureValidSeedExpiries } from './helpers';
import { seedAircraftRate, seedInstructorRate } from './db-fixtures';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/flight-delete-update.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/** Story 11.1: composes `{ takeoffAt, landingAt }` for a direct `POST`/`PUT /api/v1/flights` call — `10:00Z` stays clear of the Europe/Rome midnight boundary. */
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
  const firstName = 'Elimina';
  const lastName = `Titolare-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  // Story 14.4 blast-radius fixture fix — see `ensureValidSeedExpiries`'s own doc-comment (e2e/helpers.ts).
  await ensureValidSeedExpiries(page, person.id, 'PILOTS');

  const email = uniqueEmail('pilot-delete');
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

/** A run-unique pilot person WITHOUT a login (every test but the 403 one only needs the flight's titolare). */
async function createPilotPerson(page: Page): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Elimina';
  const lastName = `Pilota-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  await ensureValidSeedExpiries(page, person.id, 'PILOTS');
  return { personId: person.id, firstName, lastName };
}

/** The registration body every API call below reuses. */
function flightBody(aircraftId: string, personId: string, dateOnly: string, minutes: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aircraftId,
    personId,
    departureAirfield: 'Base Airfield',
    arrivalAirfield: 'Base Airfield',
    flightType: 'TOURISM',
    ...flightTimes(dateOnly, minutes),
    ...extra,
  };
}

/** The person's balance and flight charges, read from the API (the source of truth of the statement page). */
async function readAccount(page: Page, personId: string): Promise<{ balanceCents: number; flightCharges: Array<{ id: string; amountCents: number }> }> {
  const overview = (await (await page.request.get(`/api/v1/people/${personId}/account`)).json()) as { balanceCents: number };
  const movements = (await (await page.request.get(`/api/v1/people/${personId}/account/movements?pageSize=100`)).json()) as {
    items: Array<{ id: string; type: string; amountCents: number }>;
  };
  return { balanceCents: overview.balanceCents, flightCharges: movements.items.filter((item) => item.type === 'FLIGHT_CHARGE') };
}

async function listAircraftFlights(page: Page, aircraftId: string): Promise<Array<{ id: string; minutes: number }>> {
  const response = await page.request.get(`/api/v1/flights?page=1&pageSize=20&aircraftId=${aircraftId}`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { items: Array<{ id: string; minutes: number }> }).items;
}

/** Creates a fresh instructor person (with an active instructor profile and an hourly rate) via the admin API — same pattern as `flights.spec.ts`. */
async function createInstructorWithRate(page: Page, priceCentsPerHour: number): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Istruttore';
  const lastName = `Elimina-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, {
    data: { ratings: 'FI(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  // Story 14.4 blast-radius fixture fix — see `ensureValidSeedExpiries`'s own doc-comment (e2e/helpers.ts).
  await ensureValidSeedExpiries(page, person.id, 'INSTRUCTORS');

  await seedInstructorRate(person.id, { priceCentsPerHour, validFrom: PAST_DATE });

  return { personId: person.id, firstName, lastName };
}

/** Creates an aircraft with a rate in effect since `PAST_DATE` (same pattern as `flights.spec.ts`). */
async function createAircraftWithRate(page: Page, priceCents: number): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-RV${suffix}`.toUpperCase().slice(0, 20);

  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model' },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };

  await seedAircraftRate(aircraft.id, { studentPriceCents: priceCents, pilotPriceCents: priceCents, validFrom: PAST_DATE });

  return { id: aircraft.id, registration };
}

test.describe('Flight delete and edit in place (Story 19.6, P2/P3 — R-19-c)', () => {
  test('delete (desktop): the confirmation says what goes, the row and the charge disappear, the balance and the hours come back; a second DELETE is a 404 (AC 3/4)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 15000); // 150,00 €/h
    const pilot = await createPilotPerson(page);
    const instructor = await createInstructorWithRate(page, 4000); // 40,00 €/h

    // A SCHOOL flight (60') with an instructor: 150,00 € + 40,00 € = 190,00 €.
    const registered = await page.request.post('/api/v1/flights', {
      data: flightBody(aircraft.id, pilot.personId, PAST_DATE, 60, { flightType: 'SCHOOL', instructorPersonId: instructor.personId }),
    });
    expect(registered.status()).toBe(201);
    const flightId = ((await registered.json()) as { flight: { id: string } }).flight.id;
    expect((await readAccount(page, pilot.personId)).balanceCents).toBe(-19000);

    await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
    await page.getByTestId(`ac-card-${aircraft.id}`).click();
    await expect(page.getByTestId('aircraft-total-hours')).toHaveText('Ore totali: 1:00');

    // Scoped to this run's aircraft through the URL (review 19.3 F1: the
    // "Velivolo" select stops at the first 100 registrations).
    await page.goto(`/it/dashboard/logbook?aircraftId=${aircraft.id}`);
    await expect(page).toHaveURL(/aircraftId=/);
    const flightRow = page.getByTestId('flight-row').filter({ hasText: aircraft.registration });
    await expect(flightRow).toHaveCount(1);
    await expect(flightRow.getByTestId('flight-cancel-action')).toHaveText('Annulla');
    await flightRow.getByTestId('flight-cancel-action').click();

    const cancelPanel = page.getByTestId('flight-cancel-panel');
    await expect(cancelPanel).toContainText(aircraft.registration);
    await expect(cancelPanel).toContainText(/190,00\s€/);
    // D-1: no motivo any more — the confirmation says what the deletion takes away instead.
    await expect(cancelPanel.locator('textarea')).toHaveCount(0);
    await expect(cancelPanel.getByTestId('flight-cancel-warning')).toContainText(`${pilot.lastName} ${pilot.firstName}`);
    await expect(cancelPanel.getByTestId('flight-cancel-warning')).toContainText('eliminato definitivamente');
    await expect(cancelPanel.getByTestId('flight-cancel-confirm')).toHaveText('Elimina volo');
    await cancelPanel.getByTestId('flight-cancel-confirm').click();
    await expect(page.getByTestId('flight-cancel-feedback')).toHaveText('Volo eliminato.');

    // Gone from the registry — no "Annullato" row left behind.
    await expect(page.getByTestId('flight-row').filter({ hasText: aircraft.registration })).toHaveCount(0);
    expect(await listAircraftFlights(page, aircraft.id)).toEqual([]);

    // Gone from the statement, balance back to its pre-flight value.
    const account = await readAccount(page, pilot.personId);
    expect(account.balanceCents).toBe(0);
    expect(account.flightCharges).toEqual([]);
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    await expect(page.getByTestId('account-balance')).toContainText(/0,00\s€/);
    await expect(page.getByTestId('account-movement-row').filter({ hasText: 'Addebito volo' })).toHaveCount(0);

    // A deleted flight never counts: the aircraft's hours are back to 0:00.
    await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
    await page.getByTestId(`ac-card-${aircraft.id}`).click();
    await expect(page.getByTestId('aircraft-total-hours')).toHaveText('Ore totali: 0:00');

    const second = await page.request.delete(`/api/v1/flights/${flightId}`);
    expect(second.status()).toBe(404);
    expect(((await second.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });

  test('edit (desktop): the SAME flight and the SAME charge are rewritten — one row, one statement line at the new amount, no motivo asked (AC 9)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createPilotPerson(page);
    const registered = await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.personId, '2020-01-02', 60) });
    expect(registered.status()).toBe(201);
    const flightId = ((await registered.json()) as { flight: { id: string } }).flight.id;
    const chargeBefore = (await readAccount(page, pilot.personId)).flightCharges;
    expect(chargeBefore).toHaveLength(1);

    await page.goto(`/it/dashboard/logbook?aircraftId=${aircraft.id}`);
    await expect(page).toHaveURL(/aircraftId=/);
    const flightRow = page.getByTestId('flight-row').filter({ hasText: aircraft.registration });
    await expect(flightRow.getByTestId('flight-correct-action')).toHaveText('Modifica');
    await flightRow.getByTestId('flight-correct-action').click();
    await expect(page.locator('.so-title')).toHaveText('Modifica volo');
    await expect(page.getByLabel('Motivo della correzione')).toHaveCount(0);
    // 60' -> 30'. Both clock times are typed: the prefill is the browser's
    // local time of a 10:00Z takeoff, and typing only the landing would make
    // the outcome depend on the host's timezone.
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByRole('button', { name: 'Salva modifiche' }).click();

    const resultPanel = page.getByTestId('flight-result-panel');
    await expect(resultPanel).toContainText('Addebito aggiornato');
    await expect(resultPanel.getByTestId('flight-result-total')).toHaveText(/^75,00\s€$/);
    await page.getByTestId('flight-result-close').click();

    // ONE row, the same id, no "Annullato" anywhere.
    await expect(page.getByTestId('flight-row').filter({ hasText: aircraft.registration })).toHaveCount(1);
    await expect(page.getByTestId('flight-row').filter({ hasText: 'Annullato' })).toHaveCount(0);
    const flights = await listAircraftFlights(page, aircraft.id);
    expect(flights).toEqual([expect.objectContaining({ id: flightId, minutes: 30 })]);

    // ONE charge, the SAME movement, at the new amount.
    const account = await readAccount(page, pilot.personId);
    expect(account.flightCharges).toEqual([expect.objectContaining({ id: chargeBefore[0]!.id, amountCents: -7500 })]);
    expect(account.balanceCents).toBe(-7500);
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    await expect(page.getByTestId('account-balance')).toContainText(/-75,00\s€/);
    await expect(page.getByTestId('account-movement-row').filter({ hasText: 'Addebito volo' })).toHaveCount(1);
  });

  test('a pilot gets a 403 AD-8 envelope from both PUT and DELETE — noCharge in the payload changes nothing (AC 24)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 10000);
    const pilot = await createPilotWithLogin(page, 'PilotEliminaForbidden1!');

    const flightResponse = await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.personId, PAST_DATE, 30) });
    expect(flightResponse.status()).toBe(201);
    const flightId = ((await flightResponse.json()) as { flight: { id: string } }).flight.id;

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotEliminaForbidden1!');

    const deleteResponse = await page.request.delete(`/api/v1/flights/${flightId}`);
    expect(deleteResponse.status()).toBe(403);
    expect(((await deleteResponse.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    const putResponse = await page.request.put(`/api/v1/flights/${flightId}`, {
      data: flightBody(aircraft.id, pilot.personId, PAST_DATE, 45, { noCharge: true }),
    });
    expect(putResponse.status()).toBe(403);
    expect(((await putResponse.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    const postResponse = await page.request.post('/api/v1/flights', {
      data: flightBody(aircraft.id, pilot.personId, '2020-02-01', 30, { noCharge: true }),
    });
    expect(postResponse.status()).toBe(403);
  });

  test('DELETE and PUT in parallel on the same flight: DELETE 204, PUT 200 or 404, never a 500 — the flight and its charge are gone (AC 17)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 12000);
    const pilot = await createPilotPerson(page);
    const registered = await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.personId, PAST_DATE, 60) });
    expect(registered.status()).toBe(201);
    const flightId = ((await registered.json()) as { flight: { id: string } }).flight.id;

    const [deleted, edited] = await Promise.all([
      page.request.delete(`/api/v1/flights/${flightId}`),
      page.request.put(`/api/v1/flights/${flightId}`, { data: flightBody(aircraft.id, pilot.personId, PAST_DATE, 90) }),
    ]);

    expect(deleted.status()).toBe(204);
    expect([200, 404]).toContain(edited.status());
    expect(await listAircraftFlights(page, aircraft.id)).toEqual([]);
    const account = await readAccount(page, pilot.personId);
    expect(account.flightCharges).toEqual([]);
    expect(account.balanceCents).toBe(0);
  });

  test('the retired storno/correction routes answer 404 for the admin (AC 33)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 12000);
    const pilot = await createPilotPerson(page);
    const registered = await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.personId, PAST_DATE, 30) });
    expect(registered.status()).toBe(201);
    const flightId = ((await registered.json()) as { flight: { id: string } }).flight.id;

    expect((await page.request.post(`/api/v1/flights/${flightId}/cancel`, { data: { reason: 'vecchia rotta' } })).status()).toBe(404);
    expect(
      (await page.request.post(`/api/v1/flights/${flightId}/correct`, { data: { ...flightBody(aircraft.id, pilot.personId, PAST_DATE, 45), reason: 'vecchia rotta' } })).status(),
    ).toBe(404);
    // Nothing happened to the flight.
    expect(await listAircraftFlights(page, aircraft.id)).toEqual([expect.objectContaining({ id: flightId, minutes: 30 })]);
  });

  test('a replay of the registration after the delete answers the ORIGINAL 201 and never re-creates the flight (AC 34, D-9)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 12000);
    const pilot = await createPilotPerson(page);
    const body = flightBody(aircraft.id, pilot.personId, PAST_DATE, 30);
    const key = `flight-19-6-${uniqueSuffix()}`;

    const first = await page.request.post('/api/v1/flights', { data: body, headers: { 'Idempotency-Key': key } });
    expect(first.status()).toBe(201);
    const flightId = ((await first.json()) as { flight: { id: string } }).flight.id;

    expect((await page.request.delete(`/api/v1/flights/${flightId}`)).status()).toBe(204);

    const replay = await page.request.post('/api/v1/flights', { data: body, headers: { 'Idempotency-Key': key } });
    expect(replay.status()).toBe(201);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    expect(((await replay.json()) as { flight: { id: string } }).flight.id).toBe(flightId);
    expect(await listAircraftFlights(page, aircraft.id)).toEqual([]);
    expect((await readAccount(page, pilot.personId)).flightCharges).toEqual([]);
  });
});
