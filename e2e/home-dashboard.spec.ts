import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Home dashboard per ruolo (story 10.3, FR-41). The home (`/dashboard`) grew
 * from a placeholder + two widgets into a role-based dashboard: staff/admin
 * get five operational widgets, a pilot/allievo gets a personal block, an
 * istruttore gets a roster/hours block — every applicable widget is ALWAYS
 * visible for its audience, even empty (AC 4).
 *
 * Widget CONTAINERS (top-level `data-testid`) are asserted deterministically
 * — presence/absence never depends on the shared dev DB's overall row
 * counts. Internal row/empty assertions are used ONLY where the check is
 * actor-intrinsic (e.g. the seed admin's own instructor profile, which no
 * other spec ever touches) or where the underlying query is unpaginated/run
 * against an extreme, guaranteed-top-of-sort value (matching the pattern
 * `ppr-queue.spec.ts`/`expiry-dashboard.spec.ts` already use on this shared,
 * `fullyParallel: true`, never-reset dev DB).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const STAFF_EMAIL = 'staff@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const STUDENT_EMAIL = 'student@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/home-dashboard.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';
const PAST_DATE = '2020-01-01';

/** Same login helper as the other e2e specs. */
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

/** A day `days` from NOW (can be negative), `YYYY-MM-DD` UTC — same helper as `expiry-dashboard.spec.ts`. */
function addDaysUtc(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
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
  if (!match) throw new Error(`Email body did not contain a /set-password link:\n${emailText}`);
  return new URL(match[1]);
}

async function setPasswordFromInvite(page: Page, email: string, password: string): Promise<void> {
  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(inviteEmail.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();
}

/** Creates a fresh person with an active pilot profile (Account included), no login. */
async function createPilotPerson(page: Page, tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Pilota';
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

/** Same as `createPilotPerson`, plus a login user (invite flow via Mailpit). */
async function createPilotWithLogin(page: Page, password: string, tag: string): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const pilot = await createPilotPerson(page, tag);
  const email = uniqueEmail('pilot-home');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId: pilot.personId } });
  expect(userResponse.status()).toBe(201);
  await setPasswordFromInvite(page, email, password);
  return { ...pilot, email };
}

/** Creates a fresh run-unique aircraft. */
async function createAircraft(page: Page, tag: string): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-HD${tag}${suffix}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 50 },
  });
  expect(response.status()).toBe(201);
  const aircraft = (await response.json()) as { id: string };
  return { id: aircraft.id, registration };
}

/** Same as `createAircraft`, plus an active hourly rate (required for `registerFlight` to compute an amount, pattern `flight-log.spec.ts#createAircraftWithRate`). */
async function createAircraftWithRate(page: Page, tag: string, priceCentsPerHour = 15_000): Promise<{ id: string; registration: string }> {
  const aircraft = await createAircraft(page, tag);
  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
    data: { priceCentsPerHour, validFrom: PAST_DATE },
  });
  expect(rateResponse.status()).toBe(201);
  return aircraft;
}

const STAFF_WIDGET_TEST_IDS = [
  'ppr-pending-widget',
  'negative-balances-widget',
  'staff-expiries-widget',
  'bookings-today-widget',
  'aircraft-out-of-service-widget',
];

const PERSONAL_WIDGET_TEST_IDS = ['account-widget', 'packages-widget', 'upcoming-bookings-widget', 'my-expiries-widget', 'recent-flights-widget'];

const INSTRUCTOR_WIDGET_TEST_IDS = ['students-widget', 'school-flights-widget', 'monthly-hours-widget'];

test.describe('Home dashboard — widget visibility per role (Story 10.3, AC 1/2/3/4)', () => {
  test('staff sees the 5 operational widgets and none of the personal/instructor blocks', async ({ page }) => {
    await loginExpectingDashboard(page, STAFF_EMAIL);
    for (const testId of STAFF_WIDGET_TEST_IDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    await expect(page.getByTestId('personal-widgets-grid')).toHaveCount(0);
    await expect(page.getByTestId('instructor-widgets-grid')).toHaveCount(0);
  });

  test('admin sees the 5 operational widgets, none of the personal block, and a degraded (empty) instructor block (ratified: ADMIN inherits school.manage.own via ALL_PERMISSIONS but has no instructor profile)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    for (const testId of STAFF_WIDGET_TEST_IDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    await expect(page.getByTestId('personal-widgets-grid')).toHaveCount(0);
    await expect(page.getByTestId('instructor-widgets-grid')).toBeVisible();
    await expect(page.getByTestId('students-widget-empty')).toBeVisible();
    await expect(page.getByTestId('school-flights-widget-empty')).toBeVisible();
    await expect(page.getByTestId('monthly-hours-widget-value')).toHaveText('0:00');
  });

  test('a pilot sees the personal widgets and neither the staff nor the instructor blocks', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    for (const testId of PERSONAL_WIDGET_TEST_IDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    await expect(page.getByTestId('staff-widgets-grid')).toHaveCount(0);
    await expect(page.getByTestId('instructor-widgets-grid')).toHaveCount(0);
  });

  test('an allievo sees the personal widgets and neither the staff nor the instructor blocks', async ({ page }) => {
    await loginExpectingDashboard(page, STUDENT_EMAIL);
    for (const testId of PERSONAL_WIDGET_TEST_IDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    await expect(page.getByTestId('staff-widgets-grid')).toHaveCount(0);
    await expect(page.getByTestId('instructor-widgets-grid')).toHaveCount(0);
  });

  test('a pure istruttore sees BOTH the personal widgets and the instructor widgets, never the staff ones (union of the asymmetric self-block gate and school.manage.own)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, INSTRUCTOR_EMAIL);
    for (const testId of PERSONAL_WIDGET_TEST_IDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    for (const testId of INSTRUCTOR_WIDGET_TEST_IDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    await expect(page.getByTestId('staff-widgets-grid')).toHaveCount(0);
  });

  test('a pilot+istruttore dual-role actor sees the union of the personal AND instructor blocks (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const suffix = uniqueSuffix();
    const firstName = 'Dual';
    const lastName = `PilotaIstruttore-${suffix}`;
    const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
    expect(personResponse.status()).toBe(201);
    const person = (await personResponse.json()) as { id: string };

    const pilotProfileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
      data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
    });
    expect(pilotProfileResponse.status()).toBe(200);
    const instructorProfileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, {
      data: { ratings: 'FI(A)' },
    });
    expect(instructorProfileResponse.status()).toBe(200);

    const email = uniqueEmail('dual-home');
    const password = 'DualRoleHome123!';
    const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT', 'INSTRUCTOR'], personId: person.id } });
    expect(userResponse.status()).toBe(201);
    await setPasswordFromInvite(page, email, password);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, email, password);

    for (const testId of PERSONAL_WIDGET_TEST_IDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    for (const testId of INSTRUCTOR_WIDGET_TEST_IDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
  });
});

test.describe('Home dashboard — data-driven widget content (Story 10.3, AC 1/2/5)', () => {
  test('a new flight for a pilot appears in "Ultimi voli"; a booking for tomorrow appears in "Prossime prenotazioni" (own) and "Prenotazioni di oggi e domani" (staff)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 'FL');
    const password = 'PilotHomeData123!';
    const pilot = await createPilotWithLogin(page, password, 'DatiHome');

    // Story 11.1: `takeoffAt`/`landingAt` replace `flightDate`/`minutes` — `10:00Z` stays clear of the Europe/Rome midnight boundary, so the derived flightDate is still "today".
    const todayTakeoffAt = `${addDaysUtc(0)}T10:00:00.000Z`;
    const flightResponse = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        takeoffAt: todayTakeoffAt,
        landingAt: new Date(new Date(todayTakeoffAt).getTime() + 45 * 60_000).toISOString(),
      },
    });
    expect(flightResponse.status()).toBe(201);

    const tomorrow = addDaysUtc(1);
    const bookingResponse = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${tomorrow}T09:00:00.000Z`, endsAt: `${tomorrow}T10:00:00.000Z` },
    });
    expect(bookingResponse.status()).toBe(201);

    // Staff view: the calendar-wide "oggi/domani" widget picks up the booking (unpaginated — always visible regardless of concurrent data).
    // The dashboard is a Server Component rendered at the earlier `loginExpectingDashboard` navigation — reload to pick up the fixtures just created via direct API calls.
    await page.goto('/it/dashboard');
    await expect(page.getByTestId('bookings-today-widget-row').filter({ hasText: aircraft.registration })).toBeVisible();

    // The pilot's own view.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, password);
    await expect(page.getByTestId('recent-flights-widget-row').filter({ hasText: aircraft.registration })).toBeVisible();
    await expect(page.getByTestId('upcoming-bookings-widget-row').filter({ hasText: aircraft.registration })).toBeVisible();
  });

  test('an OUT_OF_SERVICE aircraft appears in the staff widget with its reason', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'OOS');
    const reason = `Revisione motore ${uniqueSuffix()}`;

    const oosResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/out-of-service`, { data: { reason } });
    expect(oosResponse.status()).toBe(200);

    await page.goto('/it/dashboard');
    const row = page.getByTestId('aircraft-out-of-service-widget-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();
    await expect(row).toContainText(reason);
  });

  test('a large negative balance sorts into the top of "Saldi negativi" (guaranteed-top-of-sort, robust against a shared dirty DB)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const debtor = await createPilotPerson(page, 'SaldoNegativo');

    const adjustmentResponse = await page.request.post(`/api/v1/people/${debtor.personId}/account/adjustments`, {
      data: { amountCents: -2_000_000_000, reason: 'Rettifica di verifica home dashboard' },
    });
    expect(adjustmentResponse.status()).toBe(200);

    await page.goto('/it/dashboard');
    await expect(page.getByTestId('negative-balances-widget-row').filter({ hasText: debtor.lastName })).toBeVisible();
  });

  test('an expiring (today) scadenza sorts into the top of the staff "Scadenze" widget with the right badge', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = await createPilotPerson(page, 'ScadenzaOggi');
    const typeName = `Tipo home ${uniqueSuffix()}`;
    const typeResponse = await page.request.post('/api/v1/expiry-types', { data: { name: typeName, scope: 'ALL' } });
    expect(typeResponse.status()).toBe(201);
    const type = (await typeResponse.json()) as { id: string };

    const expiryResponse = await page.request.post('/api/v1/expiries', {
      data: { personId: person.personId, expiryTypeId: type.id, issuedAt: PAST_DATE, expiresAt: addDaysUtc(0) },
    });
    expect(expiryResponse.status()).toBe(201);

    await page.goto('/it/dashboard');
    const row = page.getByTestId('staff-expiries-widget-row').filter({ hasText: person.lastName });
    await expect(row).toBeVisible();
    await expect(row.getByText('In scadenza', { exact: true })).toBeVisible();
  });
});

test.describe('Home dashboard — widget links navigate to the right views (Story 10.3, AC 1/2/3)', () => {
  test('staff widget links reach their full views', async ({ page }) => {
    await loginExpectingDashboard(page, STAFF_EMAIL);

    await page.getByTestId('negative-balances-widget').getByRole('link').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/finance$/);

    await page.goto('/it/dashboard');
    await page.getByTestId('aircraft-out-of-service-widget').getByRole('link').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/fleet$/);

    await page.goto('/it/dashboard');
    await page.getByTestId('bookings-today-widget').getByRole('link').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/bookings$/);

    await page.goto('/it/dashboard');
    await page.getByTestId('staff-expiries-widget').getByRole('link').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/expiries$/);
  });

  test('personal widget links reach their full views', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.getByTestId('upcoming-bookings-widget').getByRole('link').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/bookings$/);

    await page.goto('/it/dashboard');
    await page.getByTestId('recent-flights-widget').getByRole('link').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/flights$/);

    await page.goto('/it/dashboard');
    await page.getByTestId('account-widget').getByRole('link').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/people\/.+\/account$/);
  });

  test('instructor widget links reach their full views', async ({ page }) => {
    await loginExpectingDashboard(page, INSTRUCTOR_EMAIL);

    await page.getByTestId('students-widget').getByRole('link').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/school$/);

    await page.goto('/it/dashboard');
    await page.getByTestId('school-flights-widget').getByRole('link').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/flights\?/);
  });
});
