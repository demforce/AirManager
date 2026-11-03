import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ensureValidSeedExpiries } from './helpers';
import { seedAircraftRate, seedInstructorRate } from './db-fixtures';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/instructor-compensation.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PAST_DATE = '2020-01-01';
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Same login helper as every other e2e spec in this repo. */
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

/** Creates a fresh person with an active INSTRUCTOR profile — a BRAND NEW person every call (never the shared seed, `fullyParallel: true`), same helper shape as `school.spec.ts#createInstructorPerson`. */
async function createInstructorPerson(page: Page, tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Istruttore';
  const lastName = `Comp-${tag}-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, { data: { ratings: 'FI(A)' } });
  expect(profileResponse.status()).toBe(200);
  // Story 14.4 blast-radius fixture fix — see `ensureValidSeedExpiries`'s own doc-comment (e2e/helpers.ts).
  await ensureValidSeedExpiries(page, person.id, 'INSTRUCTORS');

  return { personId: person.id, firstName, lastName };
}

/** Creates a fresh person with an active STUDENT profile. */
async function createStudentPerson(page: Page, tag: string): Promise<{ personId: string }> {
  const suffix = uniqueSuffix();
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName: 'Allievo', lastName: `Comp-${tag}-${suffix}` } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/student`, { data: { courseStartDate: PAST_DATE } });
  expect(profileResponse.status()).toBe(200);
  // Story 14.4 blast-radius fixture fix — see `ensureValidSeedExpiries`'s own doc-comment (e2e/helpers.ts).
  await ensureValidSeedExpiries(page, person.id, 'STUDENTS');

  return { personId: person.id };
}

/** Aircraft + rate (`NO_AIRCRAFT_RATE` 422 otherwise), same helper shape as `school.spec.ts#createAircraftWithRate`. */
async function createAircraftWithRate(page: Page, priceCents: number): Promise<{ id: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-CP${suffix}`.toUpperCase().slice(0, 20);

  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model' },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };

  await seedAircraftRate(aircraft.id, { studentPriceCents: priceCents, pilotPriceCents: priceCents, validFrom: PAST_DATE });

  return { id: aircraft.id };
}

/** A SCHOOL flight ALSO bills the instructor (`flights.service.ts` 422 `NO_INSTRUCTOR_RATE` otherwise) — the STUDENT-charged rate (D8), unrelated to the payout rate this story adds. Same helper as `school.spec.ts#createInstructorRate`. */
async function createInstructorRate(page: Page, instructorPersonId: string, priceCentsPerHour: number): Promise<void> {
  await seedInstructorRate(instructorPersonId, { priceCentsPerHour, validFrom: PAST_DATE });
}

/**
 * Registers a SCHOOL flight (same wire shape as `school.spec.ts#registerSchoolFlight`,
 * story 11.1's `takeoffAt`/`landingAt`). Story 14.4 blast-radius fixture fix:
 * re-runs `ensureValidSeedExpiries` for BOTH the student and the instructor
 * right before submitting — `createStudentPerson`/`createInstructorPerson`
 * already cover this at person-creation time, but this file's tests do
 * several MORE awaited setup calls (aircraft, rate, instructor rate) in
 * between, widening the window for a CONCURRENTLY-running sibling test
 * (`flights.spec.ts`'s own custom-type tests) to leave a type active just
 * long enough to be missed by the earlier scan (e2e/helpers.ts's own
 * doc-comment).
 */
type SchoolFlightParams = { aircraftId: string; personId: string; instructorPersonId: string; flightDate: string; minutes: number; takeoffTimeUtc?: string };

/** The `POST`/`PUT /api/v1/flights` body — `force` for the same reason as everywhere in this file: these tests are not about the requirements. Distinct `takeoffTimeUtc` per flight on one aircraft (`FLIGHT_OVERLAP`, story 16.2). */
function schoolFlightBody(params: SchoolFlightParams): Record<string, unknown> {
  const takeoffAt = `${params.flightDate}T${params.takeoffTimeUtc ?? '10:00'}:00.000Z`;
  const landingAt = new Date(new Date(takeoffAt).getTime() + params.minutes * 60_000).toISOString();
  return {
    aircraftId: params.aircraftId,
    personId: params.personId,
    instructorPersonId: params.instructorPersonId,
    flightType: 'SCHOOL',
    departureAirfield: 'Base Airfield',
    arrivalAirfield: 'Base Airfield',
    takeoffAt,
    landingAt,
    force: true,
  };
}

async function registerSchoolFlight(page: Page, params: SchoolFlightParams): Promise<{ id: string }> {
  await ensureValidSeedExpiries(page, params.personId, 'STUDENTS');
  await ensureValidSeedExpiries(page, params.instructorPersonId, 'INSTRUCTORS');
  const response = await page.request.post('/api/v1/flights', { data: schoolFlightBody(params) });
  expect(response.status()).toBe(201);
  return { id: ((await response.json()) as { flight: { id: string } }).flight.id };
}

async function setPayoutRate(page: Page, personId: string, payoutRateCents: number | null): Promise<void> {
  const response = await page.request.put(`/api/v1/instructor-compensation/${personId}/rate`, { data: { payoutRateCents } });
  expect(response.status()).toBe(200);
}

type SummaryRow = { personId: string; totalMinutes: number; owedTotalCents: number; isActive: boolean };

/** This instructor's row of the compensation summary, from the API — `undefined` when the summary leaves them out. Never a global aggregate (AC 14). */
async function summaryRowOf(page: Page, personId: string): Promise<SummaryRow | undefined> {
  const response = await page.request.get('/api/v1/instructor-compensation');
  expect(response.status()).toBe(200);
  return ((await response.json()) as SummaryRow[]).find((row) => row.personId === personId);
}

/** The four cells of a roster-shaped row (name, rate, hours, owed), each asserted EXACTLY — never `hasText` on an amount or an H:MM (lesson 11.2). */
function cellsOf(row: Locator): { rate: Locator; hours: Locator; owed: Locator } {
  const cells = row.locator(':scope > div');
  return { rate: cells.nth(1), hours: cells.nth(2), owed: cells.nth(3) };
}

/** "1.234,56 €" / "-40,00 €" -> cents (same parser as `billing.spec.ts`). */
function parseEuroText(text: string): number {
  const normalized = text.replace(/−/g, '-').replace(/[^\d,.-]/g, '');
  return Math.round(Number.parseFloat(normalized.replace(/\./g, '').replace(',', '.')) * 100);
}

/** "H:MM" -> minutes. */
function parseHours(text: string): number {
  const [hours, minutes] = text.trim().split(':');
  return Number(hours) * 60 + Number(minutes);
}

test.describe('Instructor compensation (story 12.7)', () => {
  test('setting a payout rate makes the summary compute owed from a SCHOOL flight fixture, and "Paga" scales it down (AC 2/4/5)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorPerson(page, 'Owed');
    const student = await createStudentPerson(page, 'Owed');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructor.personId, 4000);

    await page.goto('/it/dashboard/instructors');
    const row = page.getByTestId(`instructor-row-${instructor.personId}`);
    await expect(row).toBeVisible();
    // No rate set yet: the rate says "—"; nothing flown, so nothing owed (story 16.5, R-16-k: an owed is always a number).
    await expect(cellsOf(row).rate).toHaveText('—');
    await expect(cellsOf(row).owed).toHaveText(/^0,00\s€$/);

    // Set the payout rate to 30,00 €/h via the editor's single Salva (story
    // 19.4) — BEFORE the flight (story 16.5): the flight freezes the rate in
    // force when it is registered, so a rate set afterwards would not reach it.
    await row.getByTestId(`instructor-edit-${instructor.personId}`).click();
    const rateForm = page.getByTestId('instructor-payout-rate-form');
    // Story 16.5 (AC 12): the field says the rate applies from the next flights on.
    await expect(rateForm).toContainText('Vale dai prossimi voli');
    await rateForm.getByLabel('Compenso orario (€/h)').fill('30,00');
    await page.getByTestId('instructor-identity-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Modifiche salvate.' })).toBeVisible();

    // Close the editor slide-over first — it overlays the table and would
    // otherwise intercept the "Paga" click below.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('instructor-payout-rate-form')).toHaveCount(0);

    // 60 minutes of SCHOOL flying with this instructor -> 1:00 (AC 2's minutes model).
    await registerSchoolFlight(page, { aircraftId: aircraft.id, personId: student.personId, instructorPersonId: instructor.personId, flightDate: PAST_DATE, minutes: 60 });
    await page.reload();

    // 60 min at 3000 c/h = 3000 c = 30,00 € owed.
    const refreshedRow = page.getByTestId(`instructor-row-${instructor.personId}`);
    await expect(cellsOf(refreshedRow).owed).toHaveText(/^30,00\s€$/);

    // "Paga" 20,00 € -> dovuto scala to 10,00 € (AC 5).
    await refreshedRow.getByTestId(`instructor-pay-${instructor.personId}`).click();
    const payForm = page.getByTestId('instructor-pay-form');
    await payForm.getByLabel('Importo (€)').fill('20,00');
    // The form's own default period (ISO, native date inputs) — it is what the movement's description carries.
    const [periodStart, periodEnd] = await payForm.locator('input[type="date"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    await page.getByTestId('instructor-pay-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Pagamento registrato' })).toBeVisible();

    const afterPayRow = page.getByTestId(`instructor-row-${instructor.personId}`);
    await expect(cellsOf(afterPayRow).owed).toHaveText(/^10,00\s€$/);

    // Story 19.12b AC 20: the payout's own Contabilità row names it «Compenso istruttore {inizio} – {fine}».
    // Today's costs only, so the fresh row is on page 1; its period and amount single it out from the API payouts of other specs.
    // `periodEnd` is the BROWSER's today, the movement is dated on Europe/Rome's: the window takes the day after too.
    const dayAfter = new Date(`${periodEnd}T00:00:00Z`);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    await page.goto(`/it/dashboard/billing?${new URLSearchParams({ dateFrom: periodEnd!, dateTo: dayAfter.toISOString().slice(0, 10), bookType: 'COST' }).toString()}`);
    const payoutMovement = page.getByTestId('transaction-row').filter({ hasText: `Compenso istruttore ${periodStart} – ${periodEnd}` }).filter({ hasText: /\b20,00\s€/ });
    await expect(payoutMovement.first()).toBeVisible();
  });

  test('a payout replayed with the SAME Idempotency-Key records only ONE payout (AC 3/5)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorPerson(page, 'Idem');
    const student = await createStudentPerson(page, 'Idem');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructor.personId, 4000);
    // The rate BEFORE the flight (story 16.5: the flight freezes it).
    await setPayoutRate(page, instructor.personId, 6000);
    await registerSchoolFlight(page, { aircraftId: aircraft.id, personId: student.personId, instructorPersonId: instructor.personId, flightDate: PAST_DATE, minutes: 120 });
    // 120 min at 6000 c/h = 12000 c = 120,00 € owed before any payout.

    const idempotencyKey = `e2e-${uniqueSuffix()}`;
    const payoutBody = { instructorPersonId: instructor.personId, amountCents: 5000, periodStart: PAST_DATE, periodEnd: PAST_DATE, method: 'CASH', notes: null };

    const first = await page.request.post('/api/v1/instructor-payouts', { headers: { 'Idempotency-Key': idempotencyKey }, data: payoutBody });
    expect(first.status()).toBe(201);
    const second = await page.request.post('/api/v1/instructor-payouts', { headers: { 'Idempotency-Key': idempotencyKey }, data: payoutBody });
    expect(second.status()).toBe(201);
    expect(second.headers()['idempotency-replayed']).toBe('true');

    // Owed reflects ONE payout (12000 - 5000 = 7000 c = 70,00 €), not two (which would be 20,00 €).
    const summaryResponse = await page.request.get('/api/v1/instructor-compensation');
    expect(summaryResponse.status()).toBe(200);
    const summary = (await summaryResponse.json()) as Array<{ personId: string; owedTotalCents: number }>;
    const row = summary.find((item) => item.personId === instructor.personId);
    expect(row?.owedTotalCents).toBe(7000);
  });

  test('POST /api/v1/instructor-payouts without an Idempotency-Key is rejected (AC 3, mandatory header)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const instructor = await createInstructorPerson(page, 'NoKey');

    const response = await page.request.post('/api/v1/instructor-payouts', {
      data: { instructorPersonId: instructor.personId, amountCents: 1000, periodStart: PAST_DATE, periodEnd: PAST_DATE, method: 'CASH', notes: null },
    });
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  test('an instructor with no payout rate shows "—" for the rate, 0,00 € owed, and is absent from "Compensi da liquidare"; the rated one with dovuto>0 IS listed (AC 4/5)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const unratedInstructor = await createInstructorPerson(page, 'Unrated');
    const ratedInstructor = await createInstructorPerson(page, 'Rated');
    const student = await createStudentPerson(page, 'Cycle');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, ratedInstructor.personId, 4000);
    await setPayoutRate(page, ratedInstructor.personId, 5000);
    await registerSchoolFlight(page, { aircraftId: aircraft.id, personId: student.personId, instructorPersonId: ratedInstructor.personId, flightDate: PAST_DATE, minutes: 60 });

    await page.goto('/it/dashboard/instructors');
    const unratedRow = page.getByTestId(`instructor-row-${unratedInstructor.personId}`);
    await expect(cellsOf(unratedRow).rate).toHaveText('—');
    await expect(cellsOf(unratedRow).owed).toHaveText(/^0,00\s€$/);
    // "Paga" is still offered on that row (payouts.manage lets the admin pay ANY active instructor — an advance), but the payment cycle below lists only dovuto > 0.

    await page.getByTestId('instructors-payment-cycle-button').click();
    await expect(page.getByTestId(`payment-cycle-row-${ratedInstructor.personId}`)).toBeVisible();
    await expect(page.getByTestId(`payment-cycle-row-${unratedInstructor.personId}`)).toHaveCount(0);
  });

  // Story 16.5 (AC 10/24a, MAJOR-1): the flight freezes the rate in force when
  // it is registered. Before the story the owed was recomputed from TODAY's
  // rate, so a rate set afterwards reached every flight already flown.
  test('a flight registered while the instructor had no payout rate stays at 0 after the rate is set; only the next flights accrue it (story 16.5, AC 10)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorPerson(page, 'Frozen');
    const student = await createStudentPerson(page, 'Frozen');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructor.personId, 4000);
    const flight = { aircraftId: aircraft.id, personId: student.personId, instructorPersonId: instructor.personId, flightDate: PAST_DATE, minutes: 60 };

    await registerSchoolFlight(page, flight);
    expect(await summaryRowOf(page, instructor.personId)).toMatchObject({ totalMinutes: 60, owedTotalCents: 0 });

    await setPayoutRate(page, instructor.personId, 5000);
    // Pre-fix: 60 min at today's 5000 c/h = 5000 c, out of a flight that froze nothing.
    expect(await summaryRowOf(page, instructor.personId)).toMatchObject({ totalMinutes: 60, owedTotalCents: 0 });

    await registerSchoolFlight(page, { ...flight, takeoffTimeUtc: '12:00' });
    // Only the second flight accrues: 5000 c — never round(120/60 x 5000) = 10000.
    expect(await summaryRowOf(page, instructor.personId)).toMatchObject({ totalMinutes: 120, owedTotalCents: 5000 });

    await page.goto('/it/dashboard/instructors');
    await expect(cellsOf(page.getByTestId(`instructor-row-${instructor.personId}`)).owed).toHaveText(/^50,00\s€$/);
  });

  // Story 16.5 (Q-16.5-a, AC 6/7): an edit in place keeps the rate the flight
  // froze while the instructor stays the same, and a delete takes away exactly
  // what the flight accrued — no arithmetic of its own on either path.
  test('editing a flight keeps its frozen rate and follows the new minutes; deleting it lowers the owed by exactly its snapshot (story 16.5, AC 6/7)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorPerson(page, 'Edit');
    const student = await createStudentPerson(page, 'Edit');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructor.personId, 4000);
    await setPayoutRate(page, instructor.personId, 3000);
    const params = { aircraftId: aircraft.id, personId: student.personId, instructorPersonId: instructor.personId, flightDate: PAST_DATE, minutes: 60 };
    const { id: flightId } = await registerSchoolFlight(page, params);
    expect(await summaryRowOf(page, instructor.personId)).toMatchObject({ owedTotalCents: 3000 });

    // A new rate moves no owed of a flight already registered (MAJOR-1).
    await setPayoutRate(page, instructor.personId, 6000);
    expect(await summaryRowOf(page, instructor.personId)).toMatchObject({ owedTotalCents: 3000 });

    // 60 -> 90 min, same instructor: 90 min at the FROZEN 3000 c/h = 4500 c (today's 6000 would give 9000).
    const edited = await page.request.put(`/api/v1/flights/${flightId}`, { data: schoolFlightBody({ ...params, minutes: 90 }) });
    expect(edited.status(), await edited.text()).toBe(200);
    expect(await summaryRowOf(page, instructor.personId)).toMatchObject({ totalMinutes: 90, owedTotalCents: 4500 });

    expect((await page.request.delete(`/api/v1/flights/${flightId}`)).status()).toBe(204);
    expect(await summaryRowOf(page, instructor.personId)).toMatchObject({ totalMinutes: 0, owedTotalCents: 0 });
  });

  // Story 16.5 (P4, R-16-i, Q-16.5-b/c — AC 13/14/16/17; ledger audit MAJOR-2):
  // an instructor who left was in no summary, and the money owed to them in no
  // total. Now: their own card, the KPI, "Compensi da liquidare", and "Paga".
  test('an instructor no longer active with 1 000,00 € owed: their own card, inside the KPI, paid 200 then 800 down to zero, and nothing more to pay (story 16.5, P4)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorPerson(page, 'Gone');
    const student = await createStudentPerson(page, 'Gone');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructor.personId, 4000);
    await setPayoutRate(page, instructor.personId, 10000);
    // 600 min at 100,00 €/h = 100 000 c = 1 000,00 €.
    await registerSchoolFlight(page, { aircraftId: aircraft.id, personId: student.personId, instructorPersonId: instructor.personId, flightDate: PAST_DATE, minutes: 600 });
    expect((await page.request.post(`/api/v1/people/${instructor.personId}/profiles/instructor/deactivate`)).status()).toBe(200);

    expect(await summaryRowOf(page, instructor.personId)).toMatchObject({ isActive: false, totalMinutes: 600, owedTotalCents: 100_000 });
    // Q-16.5-c: their detail stays a 404 — the row offers "Paga" only.
    expect((await page.request.get(`/api/v1/instructor-compensation?personId=${instructor.personId}`)).status()).toBe(404);

    await page.goto('/it/dashboard/instructors');
    const row = page.getByTestId(`inactive-instructor-row-${instructor.personId}`);
    await expect(row).toBeVisible();
    await expect(page.getByTestId(`instructor-row-${instructor.personId}`)).toHaveCount(0);
    await expect(cellsOf(row).hours).toHaveText('10:00');
    await expect(cellsOf(row).owed).toHaveText(/^1\.000,00\s€$/);
    // No click on the name (AC 16): no detail behind it.
    await expect(row.getByTestId(`instructor-name-${instructor.personId}`)).toHaveCount(0);

    // AC 14 — the KPIs are global aggregates, so never compared with a number
    // read at another instant: the SAME server render must agree with itself.
    // "Totale dovuto" and the hours sum BOTH lists; "Istruttori attivi" counts
    // the roster alone.
    const page1 = await page.evaluate(() => {
      const cell = (row: Element, index: number) => (row.querySelectorAll(':scope > div')[index] as HTMLElement).innerText;
      const roster = [...document.querySelectorAll('[data-testid^="instructor-row-"]')];
      const inactive = [...document.querySelectorAll('[data-testid^="inactive-instructor-row-"]')];
      const kpis = [...document.querySelectorAll('.kpi-row .kpi .kpi-value')].map((value) => (value as HTMLElement).innerText);
      return {
        rosterCount: roster.length,
        owed: [...roster, ...inactive].map((row) => cell(row, 3)),
        hours: [...roster, ...inactive].map((row) => cell(row, 2)),
        kpis,
      };
    });
    expect(Number(page1.kpis[0])).toBe(page1.rosterCount);
    expect(parseHours(page1.kpis[1]!)).toBe(page1.hours.reduce((sum, text) => sum + parseHours(text), 0));
    expect(parseEuroText(page1.kpis[2]!)).toBe(page1.owed.reduce((sum, text) => sum + parseEuroText(text), 0));

    // Q-16.5-b: "Compensi da liquidare" lists them, labelled.
    await page.getByTestId('instructors-payment-cycle-button').click();
    const cycleRow = page.getByTestId(`payment-cycle-row-${instructor.personId}`);
    await expect(cycleRow).toContainText('Non più attivo');
    await cycleRow.getByTestId(`payment-cycle-pay-${instructor.personId}`).click();
    const payForm = page.getByTestId('instructor-pay-form');
    await expect(payForm.getByLabel('Importo (€)')).toHaveValue('1000,00');
    await page.getByTestId('instructor-pay-form').getByRole('button', { name: 'Annulla', exact: true }).click();
    await expect(page.getByTestId('instructor-pay-form')).toHaveCount(0);

    // R-16-i: "Paga" 200,00 € on the card -> 800,00 € still owed.
    await row.getByTestId(`inactive-instructor-pay-${instructor.personId}`).click();
    await page.getByTestId('instructor-pay-form').getByLabel('Importo (€)').fill('200,00');
    await page.getByTestId('instructor-pay-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Pagamento registrato' })).toBeVisible();
    await expect(cellsOf(row).owed).toHaveText(/^800,00\s€$/);
    expect(await summaryRowOf(page, instructor.personId)).toMatchObject({ isActive: false, owedTotalCents: 80_000 });

    // The phone face (AC 17): the row is not a trigger, and its "Paga" is a 44px target.
    await page.setViewportSize({ width: 375, height: 812 });
    const mobileRow = page.getByTestId(`mobile-inactive-instructor-row-${instructor.personId}`);
    await expect(mobileRow).toBeVisible();
    await expect(row).toBeHidden();
    expect(await mobileRow.evaluate((element) => element.tagName)).toBe('DIV');
    const mobilePay = page.getByTestId(`inactive-instructor-pay-${instructor.personId}-mobile`);
    expect((await mobilePay.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await mobilePay.click();
    await expect(page.getByTestId('instructor-pay-form').getByLabel('Importo (€)')).toHaveValue('800,00');
    await page.getByTestId('instructor-pay-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Pagamento registrato' })).toBeVisible();

    // Owed back to zero: out of the card and of the summary...
    await expect(mobileRow).toHaveCount(0);
    expect(await summaryRowOf(page, instructor.personId)).toBeUndefined();
    // ...and nothing more to pay (409, never a silent overpayment).
    const again = await page.request.post('/api/v1/instructor-payouts', {
      headers: { 'Idempotency-Key': `e2e-${uniqueSuffix()}` },
      data: { instructorPersonId: instructor.personId, amountCents: 1000, periodStart: PAST_DATE, periodEnd: PAST_DATE, method: 'CASH', notes: null },
    });
    expect(again.status()).toBe(409);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe('INSTRUCTOR_NOTHING_OWED');
  });

  test('RBAC: POST payout / PUT rate answer 403 for a non-admin actor (AC 3/4/6, payouts.manage)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const instructor = await createInstructorPerson(page, 'Rbac');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const payoutResponse = await page.request.post('/api/v1/instructor-payouts', {
      headers: { 'Idempotency-Key': `e2e-${uniqueSuffix()}` },
      data: { instructorPersonId: instructor.personId, amountCents: 1000, periodStart: PAST_DATE, periodEnd: PAST_DATE, method: 'CASH', notes: null },
    });
    expect(payoutResponse.status()).toBe(403);

    const rateResponse = await page.request.put(`/api/v1/instructor-compensation/${instructor.personId}/rate`, { data: { payoutRateCents: 3000 } });
    expect(rateResponse.status()).toBe(403);
  });

  test('the compensation summary export answers xlsx 200 (AC 3/8, finance.manage)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const adminExport = await page.request.get('/api/v1/instructor-compensation?format=xlsx&locale=it');
    expect(adminExport.status()).toBe(200);
    expect(adminExport.headers()['content-type']).toBe(XLSX_CONTENT_TYPE);
  });
});
