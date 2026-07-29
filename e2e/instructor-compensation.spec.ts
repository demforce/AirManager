import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureValidSeedExpiries } from './helpers';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/instructor-compensation.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';
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

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as the other e2e specs (school.spec.ts, instructor-rates.spec.ts). */
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
async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-CP${suffix}`.toUpperCase().slice(0, 20);

  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 100 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };

  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, { data: { priceCentsPerHour, validFrom: PAST_DATE } });
  expect(rateResponse.status()).toBe(201);

  return { id: aircraft.id };
}

/** A SCHOOL flight ALSO bills the instructor (`flights.service.ts` 422 `NO_INSTRUCTOR_RATE` otherwise) — the STUDENT-charged rate (D8), unrelated to the payout rate this story adds. Same helper as `school.spec.ts#createInstructorRate`. */
async function createInstructorRate(page: Page, instructorPersonId: string, priceCentsPerHour: number): Promise<void> {
  const rateResponse = await page.request.post(`/api/v1/people/${instructorPersonId}/instructor-rates`, {
    data: { priceCentsPerHour, validFrom: PAST_DATE },
  });
  expect(rateResponse.status()).toBe(201);
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
async function registerSchoolFlight(
  page: Page,
  params: { aircraftId: string; personId: string; instructorPersonId: string; flightDate: string; minutes: number },
): Promise<void> {
  await ensureValidSeedExpiries(page, params.personId, 'STUDENTS');
  await ensureValidSeedExpiries(page, params.instructorPersonId, 'INSTRUCTORS');
  const takeoffAt = `${params.flightDate}T10:00:00.000Z`;
  const landingAt = new Date(new Date(takeoffAt).getTime() + params.minutes * 60_000).toISOString();
  const response = await page.request.post('/api/v1/flights', {
    data: {
      aircraftId: params.aircraftId,
      personId: params.personId,
      instructorPersonId: params.instructorPersonId,
      flightType: 'SCHOOL',
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      takeoffAt,
      landingAt,
    },
  });
  expect(response.status()).toBe(201);
}

/** Creates a STAFF-only user (Mailpit invite flow), same helper as `instructor-rates.spec.ts`. */
async function createStaffUserAndSetPassword(page: Page, password: string): Promise<string> {
  const email = uniqueEmail('staff-comp');
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

test.describe('Instructor compensation (story 12.7)', () => {
  test('setting a payout rate makes the summary compute owed from a SCHOOL flight fixture, and "Paga" scales it down (AC 2/4/5)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorPerson(page, 'Owed');
    const student = await createStudentPerson(page, 'Owed');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructor.personId, 4000);
    // 60 minutes of SCHOOL flying with this instructor -> 1:00 (AC 2's minutes model).
    await registerSchoolFlight(page, { aircraftId: aircraft.id, personId: student.personId, instructorPersonId: instructor.personId, flightDate: PAST_DATE, minutes: 60 });

    await page.goto('/it/dashboard/instructors');
    const row = page.getByTestId(`instructor-row-${instructor.personId}`);
    await expect(row).toBeVisible();
    // No rate set yet -> "—" for both rate and owed (never a bare "0,00 €", AC 4).
    await expect(row.getByTestId(`instructor-edit-${instructor.personId}`)).toBeVisible();
    await expect(row).toContainText('—');

    // Set the payout rate to 30,00 €/h via the editor.
    await row.getByTestId(`instructor-edit-${instructor.personId}`).click();
    const rateForm = page.getByTestId('instructor-payout-rate-form');
    await rateForm.getByLabel('Tariffa oraria').fill('30,00');
    await page.getByTestId('instructor-payout-rate-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Tariffa payout aggiornata' })).toBeVisible();

    // 60 min / 60 * 3000 c = 3000 c = 30,00 € owed (AC 2's rounding rule).
    const refreshedRow = page.getByTestId(`instructor-row-${instructor.personId}`);
    await expect(refreshedRow).toContainText(/30,00\s€/);

    // Close the editor slide-over first — it overlays the table and would
    // otherwise intercept the "Paga" click below.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('instructor-payout-rate-form')).toHaveCount(0);

    // "Paga" 20,00 € -> dovuto scala to 10,00 € (AC 5).
    await refreshedRow.getByTestId(`instructor-pay-${instructor.personId}`).click();
    const payForm = page.getByTestId('instructor-pay-form');
    await payForm.getByLabel('Importo (€)').fill('20,00');
    await page.getByTestId('instructor-pay-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Pagamento registrato' })).toBeVisible();

    const afterPayRow = page.getByTestId(`instructor-row-${instructor.personId}`);
    await expect(afterPayRow).toContainText(/10,00\s€/);
  });

  test('a payout replayed with the SAME Idempotency-Key records only ONE payout (AC 3/5)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorPerson(page, 'Idem');
    const student = await createStudentPerson(page, 'Idem');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructor.personId, 4000);
    await registerSchoolFlight(page, { aircraftId: aircraft.id, personId: student.personId, instructorPersonId: instructor.personId, flightDate: PAST_DATE, minutes: 120 });

    const rateResponse = await page.request.put(`/api/v1/instructor-compensation/${instructor.personId}/rate`, { data: { payoutRateCents: 6000 } });
    expect(rateResponse.status()).toBe(200);
    // 120 min / 60 * 6000 c = 12000 c = 120,00 € owed before any payout.

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
    const summary = (await summaryResponse.json()) as Array<{ personId: string; owedTotalCents: number | null }>;
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

  test('an instructor with no payout rate shows "—" and is absent from "Ciclo pagamenti"; the rated one with dovuto>0 IS listed (AC 4/5)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const unratedInstructor = await createInstructorPerson(page, 'Unrated');
    const ratedInstructor = await createInstructorPerson(page, 'Rated');
    const student = await createStudentPerson(page, 'Cycle');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, ratedInstructor.personId, 4000);
    await registerSchoolFlight(page, { aircraftId: aircraft.id, personId: student.personId, instructorPersonId: ratedInstructor.personId, flightDate: PAST_DATE, minutes: 60 });
    const rateResponse = await page.request.put(`/api/v1/instructor-compensation/${ratedInstructor.personId}/rate`, { data: { payoutRateCents: 5000 } });
    expect(rateResponse.status()).toBe(200);

    await page.goto('/it/dashboard/instructors');
    const unratedRow = page.getByTestId(`instructor-row-${unratedInstructor.personId}`);
    await expect(unratedRow).toContainText('—');
    // No "Paga" action for an instructor without a rate is still shown (payouts.manage still lets admin pay ANY instructor), but it is excluded from the payment cycle below regardless (dovuto is null, never > 0).

    await page.getByTestId('instructors-payment-cycle-button').click();
    await expect(page.getByTestId(`payment-cycle-row-${ratedInstructor.personId}`)).toBeVisible();
    await expect(page.getByTestId(`payment-cycle-row-${unratedInstructor.personId}`)).toHaveCount(0);
  });

  test('RBAC: staff sees the summary but NOT "Paga" or the payout-rate field; POST payout / PUT rate answer 403 (AC 3/4/6)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const instructor = await createInstructorPerson(page, 'Rbac');

    const staffPassword = 'StaffComp123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);

    await page.goto('/it/dashboard/instructors');
    const row = page.getByTestId(`instructor-row-${instructor.personId}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId(`instructor-pay-${instructor.personId}`)).toHaveCount(0);
    await expect(page.getByTestId('instructors-payment-cycle-button')).toHaveCount(0);

    await row.getByTestId(`instructor-edit-${instructor.personId}`).click();
    await expect(page.getByTestId('instructor-payout-rate-form')).toHaveCount(0);

    const payoutResponse = await page.request.post('/api/v1/instructor-payouts', {
      headers: { 'Idempotency-Key': `e2e-${uniqueSuffix()}` },
      data: { instructorPersonId: instructor.personId, amountCents: 1000, periodStart: PAST_DATE, periodEnd: PAST_DATE, method: 'CASH', notes: null },
    });
    expect(payoutResponse.status()).toBe(403);

    const rateResponse = await page.request.put(`/api/v1/instructor-compensation/${instructor.personId}/rate`, { data: { payoutRateCents: 3000 } });
    expect(rateResponse.status()).toBe(403);
  });

  test('the compensation summary export answers xlsx 200 for both staff and admin (AC 3/8, finance.manage)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const adminExport = await page.request.get('/api/v1/instructor-compensation?format=xlsx&locale=it');
    expect(adminExport.status()).toBe(200);
    expect(adminExport.headers()['content-type']).toBe(XLSX_CONTENT_TYPE);

    const staffPassword = 'StaffExportComp123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);
    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);

    const staffExport = await page.request.get('/api/v1/instructor-compensation?format=xlsx&locale=it');
    expect(staffExport.status()).toBe(200);
    expect(staffExport.headers()['content-type']).toBe(XLSX_CONTENT_TYPE);
  });
});
