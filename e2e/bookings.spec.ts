import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/bookings.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/**
 * Navigates to `/dashboard/bookings` and waits for the page to settle
 * before returning — necessary before interacting with the "Nuova
 * prenotazione" form specifically (story 7.2 finding, this session): the
 * page now carries a much larger DOM (the calendar's hour grid times
 * aircraft columns, plus however many rows "Prossime prenotazioni" has
 * accumulated) — a plain `page.goto()` only waits for the `load` event,
 * which can resolve before React finishes hydrating a page this size. An
 * automated `selectOption`/`fill`/`click` landing in that window sets the
 * native control's DOM value, but React's hydration reconciliation then
 * resets it to the server-rendered `defaultValue`, silently discarding the
 * interaction (react-hook-form never observes the change, so the form
 * fails its own "Campo obbligatorio" validation on submit). A human never
 * notices — hydration still completes in well under a second — but
 * Playwright's automated interaction can outrun it. Test-only hardening;
 * no application code is touched.
 */
async function gotoBookingsAndWaitForHydration(page: Page): Promise<void> {
  await page.goto('/it/dashboard/bookings');
  await page.waitForLoadState('networkidle');
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

/** Creates a run-unique aircraft via the admin API (caller must already be authenticated as admin/staff). */
async function createAircraft(page: Page): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  // Same `.slice(0, 20)` convention as `flights.spec.ts`'s `createAircraftWithRate`.
  const registration = `I-BK${suffix}`.toUpperCase().slice(0, 20);

  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 50 },
  });
  expect(response.status()).toBe(201);
  const aircraft = (await response.json()) as { id: string };

  return { id: aircraft.id, registration };
}

/** Creates a run-unique person with an active pilot profile, no login (used as the staff form's "for" target). */
async function createPilotPerson(page: Page): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Prenota';
  const lastName = `Pilota-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  return { personId: person.id, firstName, lastName };
}

/** Creates a run-unique instructor person plus a linked login user. */
async function createInstructorWithLogin(
  page: Page,
  password: string,
): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Istruttore';
  const lastName = `Prenota-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, {
    data: { ratings: 'FI(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail('instructor-bookings');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['INSTRUCTOR'], personId: person.id } });
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

/** Creates a run-unique student (allievo) person plus a linked login user. */
async function createStudentWithLogin(
  page: Page,
  password: string,
): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Allievo';
  const lastName = `Prenota-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/student`, {
    data: { courseStartDate: '2026-01-01' },
  });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail('student-bookings');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['STUDENT'], personId: person.id } });
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

/** Far enough in the future to never collide with "today" no matter when this suite runs. */
const FUTURE_DAY = '2031-03-10';

test.describe('Aircraft bookings (Story 7.1, AC 1/2/3)', () => {
  test('pilot books via UI for a future interval; an overlap shows 409 in the form; back-to-back (semi-open) succeeds', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await gotoBookingsAndWaitForHydration(page);
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T09:00`);
    await form.getByLabel('Fine').fill(`${FUTURE_DAY}T10:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();

    await expect(page.getByTestId('booking-form-success')).toBeVisible();
    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();

    // Overlapping attempt on the SAME run-unique aircraft -> 409, never conflated with a 422.
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T09:30`);
    await form.getByLabel('Fine').fill(`${FUTURE_DAY}T10:30`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-error')).toContainText('già prenotato');

    // Back-to-back: starts exactly when the first booking ends -> semi-open, no overlap, 201.
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T10:00`);
    await form.getByLabel('Fine').fill(`${FUTURE_DAY}T11:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    const rows = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(rows).toHaveCount(2);
  });

  test('staff books for another (run-unique) pilot from the "Pilota o allievo" picker', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    await gotoBookingsAndWaitForHydration(page);
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Pilota o allievo').selectOption({ label: `${pilot.lastName} ${pilot.firstName}` });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T13:00`);
    await form.getByLabel('Fine').fill(`${FUTURE_DAY}T14:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();

    await expect(page.getByTestId('booking-form-success')).toBeVisible();
    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    // `personName` is "Nome Cognome" (Contesto's DTO spec) — firstName first, unlike the picker's "Cognome Nome" option labels above.
    await expect(row).toContainText(`${pilot.firstName} ${pilot.lastName}`);
  });

  test('a run-unique aircraft OUT_OF_SERVICE shows a disabled option and rejects a direct API attempt with the reason (422)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);
    const reason = `Revisione motore ${uniqueSuffix()}`;

    const oosResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/out-of-service`, { data: { reason } });
    expect(oosResponse.status()).toBe(200);

    await page.goto('/it/dashboard/bookings');
    const form = page.getByTestId('new-booking-form');
    const aircraftOption = form.getByLabel('Velivolo').locator('option', { hasText: aircraft.registration });
    await expect(aircraftOption).toHaveText(new RegExp(reason));
    await expect(aircraftOption).toBeDisabled();

    // The service re-verifies regardless of the disabled UI control (AD-5) — a direct API attempt confirms the 422.
    const response = await page.request.post('/api/v1/bookings', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        startsAt: `${FUTURE_DAY}T09:00:00.000Z`,
        endsAt: `${FUTURE_DAY}T10:00:00.000Z`,
      },
    });
    expect(response.status()).toBe(422);
    const body = (await response.json()) as { error: { code: string; message: string; details: { reason: string } } };
    expect(body.error.code).toBe('AIRCRAFT_OUT_OF_SERVICE');
    expect(body.error.details.reason).toBe(reason);
    expect(body.error.message).toContain(reason);
  });

  test('an instructor books for an allievo (toggle "Per un allievo") — 201, row shows both names', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const student = await createStudentWithLogin(page, 'AllievoBookings123!');
    const instructorPassword = 'IstruttoreBookings123!';
    const instructor = await createInstructorWithLogin(page, instructorPassword);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, instructor.email, instructorPassword);

    await gotoBookingsAndWaitForHydration(page);
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByRole('radio', { name: 'Per un allievo' }).click();
    // `{ exact: true }`: "Allievo" is otherwise ambiguous against the "Per un allievo" radio's accessible name.
    await form.getByLabel('Allievo', { exact: true }).selectOption({ label: `${student.lastName} ${student.firstName}` });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T15:00`);
    await form.getByLabel('Fine').fill(`${FUTURE_DAY}T16:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();

    await expect(page.getByTestId('booking-form-success')).toBeVisible();
    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    // `personName`/`instructorName` are "Nome Cognome" (Contesto's DTO spec) — firstName first.
    await expect(row).toContainText(`${student.firstName} ${student.lastName}`);
    await expect(row).toContainText(`${instructor.firstName} ${instructor.lastName}`);
  });

  // CONTRACT CHANGE (story 7.2, FR-19): the calendar view opened `bookings`
  // to every authenticated role via `self.read` — an allievo alone now SEES
  // the "Prenotazioni" nav item and the calendar (with prenotante names,
  // FR-19), same pattern as story 6.2 did for 6.1's nav test when
  // `expiries` gained `self.read`. What does NOT change: no create form,
  // and a direct `POST /api/v1/bookings` still answers 403 (the calendar's
  // own `GET .../calendar` is `self.read`-gated, creation stays
  // `bookings.manage.*`-gated).
  test('an allievo alone sees "Prenotazioni" and the calendar with prenotante names, but no create form; a direct POST still gets 403', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    // Read "tomorrow" (Europe/Rome) off the app's OWN next-day link (Dev
    // Notes: never re-derive the zoned date in the test — the server is the
    // single source of truth for what "tomorrow" means).
    await page.goto('/it/dashboard/bookings');
    const nextHref = await page.getByTestId('calendar-next').getAttribute('href');
    const tomorrow = nextHref?.match(/date=(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!tomorrow) throw new Error(`Could not extract tomorrow's date from calendar-next href: ${nextHref}`);

    // A booking visible to EVERY authenticated role (FR-19) — the allievo
    // must see the PILOT's name on the calendar despite having no booking
    // permission at all.
    const bookingResponse = await page.request.post('/api/v1/bookings', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        startsAt: `${tomorrow}T09:00:00.000Z`,
        endsAt: `${tomorrow}T10:00:00.000Z`,
      },
    });
    expect(bookingResponse.status()).toBe(201);

    const student = await createStudentWithLogin(page, 'AllievoForbidden123!');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, student.email, 'AllievoForbidden123!');

    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(nav.getByRole('link', { name: 'Prenotazioni' })).toBeVisible();

    await page.goto(`/it/dashboard/bookings?date=${tomorrow}`);
    const column = page.getByTestId('calendar-aircraft-column').filter({ hasText: aircraft.registration });
    const block = column.getByTestId('calendar-block').filter({ hasText: pilot.lastName });
    await expect(block).toBeVisible();
    await expect(block).toContainText(pilot.firstName);

    await expect(page.getByTestId('new-booking-form')).toHaveCount(0);

    const response = await page.request.post('/api/v1/bookings', {
      data: {
        aircraftId: aircraft.id,
        personId: student.personId,
        startsAt: `${tomorrow}T11:00:00.000Z`,
        endsAt: `${tomorrow}T12:00:00.000Z`,
      },
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('calendar (Story 7.2, AC 1): day-view blocks on the run-unique aircraft column, week-view chips, prev/next change the heading', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    await page.goto('/it/dashboard/bookings');
    const nextHref = await page.getByTestId('calendar-next').getAttribute('href');
    const tomorrow = nextHref?.match(/date=(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!tomorrow) throw new Error(`Could not extract tomorrow's date from calendar-next href: ${nextHref}`);

    // Two run-unique bookings via the admin API at known times (Task 4: "orari noti di DOMANI, es. 09:00Z e 14:00Z").
    const first = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${tomorrow}T09:00:00.000Z`, endsAt: `${tomorrow}T10:00:00.000Z` },
    });
    expect(first.status()).toBe(201);
    const second = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${tomorrow}T14:00:00.000Z`, endsAt: `${tomorrow}T15:00:00.000Z` },
    });
    expect(second.status()).toBe(201);

    // Navigate to tomorrow via the "next" link (Task 4: "link next o `?date=`") in day view.
    await page.getByTestId('calendar-next').click();
    await expect(page).toHaveURL(new RegExp(`date=${tomorrow}`));

    const column = page.getByTestId('calendar-aircraft-column').filter({ hasText: aircraft.registration });
    await expect(column).toBeVisible();
    const blocksOnAircraft = column.getByTestId('calendar-block');
    await expect(blocksOnAircraft).toHaveCount(2);
    await expect(blocksOnAircraft.filter({ hasText: pilot.lastName })).toHaveCount(2);

    // prev/next change the heading (Task 4) — round-trip back to the same day.
    const headingOnTomorrow = await page.getByTestId('calendar-heading').textContent();
    await page.getByTestId('calendar-next').click();
    await expect(page.getByTestId('calendar-heading')).not.toHaveText(headingOnTomorrow ?? '');
    await page.getByTestId('calendar-prev').click();
    await expect(page.getByTestId('calendar-heading')).toHaveText(headingOnTomorrow ?? '');

    // Toggle week -> compact chips present, in the run-unique aircraft's column.
    await page.getByTestId('calendar-view-week').click();
    await expect(page.getByTestId('calendar-week-table')).toBeVisible();
    const weekChips = page.getByTestId('calendar-chip').filter({ hasText: pilot.lastName });
    await expect(weekChips).toHaveCount(2);
  });

  test('calendar mobile viewport (375x812, Task 4): day view is usable, no page-level horizontal overflow, touch targets >= 44px', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    await page.goto('/it/dashboard/bookings');
    const nextHref = await page.getByTestId('calendar-next').getAttribute('href');
    const tomorrow = nextHref?.match(/date=(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!tomorrow) throw new Error(`Could not extract tomorrow's date from calendar-next href: ${nextHref}`);

    const bookingResponse = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${tomorrow}T09:00:00.000Z`, endsAt: `${tomorrow}T10:00:00.000Z` },
    });
    expect(bookingResponse.status()).toBe(201);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/it/dashboard/bookings?date=${tomorrow}`);

    const column = page.getByTestId('calendar-aircraft-column').filter({ hasText: aircraft.registration });
    const block = column.getByTestId('calendar-block').filter({ hasText: pilot.lastName });
    await expect(block).toBeVisible();

    // Pragmatic mobile-usability assert (Dev Notes): the body itself never scrolls horizontally — only the calendar's own `overflow-x-auto` wrapper does.
    const bodyFitsViewport = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth);
    expect(bodyFitsViewport).toBe(true);

    const nextBox = await page.getByTestId('calendar-next').boundingBox();
    expect(nextBox?.width).toBeGreaterThanOrEqual(44);
    expect(nextBox?.height).toBeGreaterThanOrEqual(44);
  });

  test('concurrency (AC 2): two parallel POSTs for the same run-unique aircraft/interval yield exactly one 201 and one 409', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    const body = {
      aircraftId: aircraft.id,
      personId: pilot.personId,
      startsAt: `${FUTURE_DAY}T17:00:00.000Z`,
      endsAt: `${FUTURE_DAY}T18:00:00.000Z`,
    };

    const [first, second] = await Promise.all([
      page.request.post('/api/v1/bookings', { data: body }),
      page.request.post('/api/v1/bookings', { data: body }),
    ]);

    const statuses = [first.status(), second.status()].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
  });
});
