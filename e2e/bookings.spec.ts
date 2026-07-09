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

  test('review 7.2 fixes: an extreme ?date falls back to today without a 500 (F1); a bottom-clamped short block pins INSIDE the grid (F2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    // F1: a hand-edited year-9999 date must sanitize to today and render the
    // calendar — before the fix, addDaysDateOnly(date, 1) overflowed into a
    // 5-digit ISO year and zonedMidnightUtc crashed the page with a 500.
    await page.goto('/it/dashboard/bookings?date=9999-12-31');
    await expect(page.getByTestId('bookings-calendar-section')).toBeVisible();
    await expect(page.getByTestId('calendar-heading')).not.toBeEmpty();

    // F2: a 20:45Z–21:45Z booking lands at/after the 22:00 Europe/Rome window
    // edge in BOTH DST regimes (22:45 CEST / 21:45 CET start), forcing the
    // min-height inflation near the bottom edge — the block must pin AT the
    // grid's bottom border, never render below it.
    const nextHref = await page.getByTestId('calendar-next').getAttribute('href');
    const tomorrow = nextHref?.match(/date=(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!tomorrow) throw new Error(`Could not extract tomorrow's date from calendar-next href: ${nextHref}`);

    const response = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${tomorrow}T20:45:00.000Z`, endsAt: `${tomorrow}T21:45:00.000Z` },
    });
    expect(response.status()).toBe(201);

    await page.goto(`/it/dashboard/bookings?date=${tomorrow}`);
    const column = page.getByTestId('calendar-aircraft-column').filter({ hasText: aircraft.registration });
    const block = column.getByTestId('calendar-block').filter({ hasText: pilot.lastName });
    await expect(block).toBeVisible();

    const blockBox = await block.boundingBox();
    const columnBox = await column.boundingBox();
    if (!blockBox || !columnBox) throw new Error('Missing bounding boxes for the clamped block/column');
    expect(blockBox.y + blockBox.height).toBeLessThanOrEqual(columnBox.y + columnBox.height + 1);
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

test.describe('Booking edit/cancel (Story 7.3, AC 1/2)', () => {
  test('pilot moves their own booking from the UI (new time/aircraft visible in the list), cancels it via the two-step confirm (disappears from list AND calendar), and the freed slot accepts a new booking', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const aircraft2 = await createAircraft(page);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const me = await (await page.request.get('/api/v1/me')).json();
    const pilotPersonId = me.person.id as string;

    await gotoBookingsAndWaitForHydration(page);
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T02:00`);
    await form.getByLabel('Fine').fill(`${FUTURE_DAY}T03:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();

    // Sposta: change BOTH the aircraft and the interval.
    await row.getByTestId('booking-move-action').click();
    const moveForm = page.getByTestId('move-booking-form');
    await moveForm.getByLabel('Velivolo').selectOption({ label: aircraft2.registration });
    await moveForm.getByLabel('Inizio').fill(`${FUTURE_DAY}T13:00`);
    await moveForm.getByLabel('Fine').fill(`${FUTURE_DAY}T14:00`);
    await moveForm.getByTestId('move-booking-save').click();

    await expect(page.getByTestId('bookings-list-feedback')).toHaveText('Prenotazione spostata.');
    await expect(page.getByTestId('booking-row').filter({ hasText: aircraft.registration })).toHaveCount(0);
    const movedRow = page.getByTestId('booking-row').filter({ hasText: aircraft2.registration });
    await expect(movedRow).toBeVisible();

    // Cancella: two-step confirm.
    await movedRow.getByTestId('booking-cancel-action').click();
    await page.getByTestId('booking-cancel-confirm').click();
    await expect(page.getByTestId('bookings-list-feedback')).toHaveText('Prenotazione cancellata.');
    await expect(page.getByTestId('booking-row').filter({ hasText: aircraft2.registration })).toHaveCount(0);

    // Gone from the calendar too (the row's own aircraft column has no block left).
    await page.goto(`/it/dashboard/bookings?date=${FUTURE_DAY}`);
    const column = page.getByTestId('calendar-aircraft-column').filter({ hasText: aircraft2.registration });
    await expect(column.getByTestId('calendar-block')).toHaveCount(0);

    // The freed slot (aircraft2 @ 13:00-14:00Z) accepts a brand-new booking.
    const recreate = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft2.id, personId: pilotPersonId, startsAt: `${FUTURE_DAY}T13:00:00.000Z`, endsAt: `${FUTURE_DAY}T14:00:00.000Z` },
    });
    expect(recreate.status()).toBe(201);
  });

  test('an overlap on a move shows 409 in the Sposta form', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await gotoBookingsAndWaitForHydration(page);
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T02:00`);
    await form.getByLabel('Fine').fill(`${FUTURE_DAY}T03:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T05:00`);
    await form.getByLabel('Fine').fill(`${FUTURE_DAY}T06:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    const rows = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(rows).toHaveCount(2);

    // The second (later, 05:00-06:00Z) booking is ordered second (startsAt asc) — move it into the first's slot (02:00-03:00Z, same aircraft, prefilled).
    await rows.nth(1).getByTestId('booking-move-action').click();
    const moveForm = page.getByTestId('move-booking-form');
    await moveForm.getByLabel('Inizio').fill(`${FUTURE_DAY}T02:00`);
    await moveForm.getByLabel('Fine').fill(`${FUTURE_DAY}T03:00`);
    await moveForm.getByTestId('move-booking-save').click();

    await expect(page.getByTestId('move-booking-form-error')).toContainText('già prenotato');
  });

  test('an own booking that already started answers 422 BOOKING_ALREADY_STARTED for both edit and cancel; staff can still cancel it ("lo staff può sempre")', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const me = await (await page.request.get('/api/v1/me')).json();
    const pilotPersonId = me.person.id as string;

    // startsAt = now+4s (future at creation time) — a real, short active wait
    // until it has started (Dev Notes: kept in ONE test to bound suite duration).
    const startsAt = new Date(Date.now() + 4000).toISOString();
    const endsAt = new Date(Date.now() + 3_600_000).toISOString();
    const created = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilotPersonId, startsAt, endsAt },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };

    while (Date.now() < new Date(startsAt).getTime()) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const patchRes = await page.request.patch(`/api/v1/bookings/${id}`, { data: { notes: 'tentativo modifica' } });
    expect(patchRes.status()).toBe(422);
    const patchBody = (await patchRes.json()) as { error: { code: string } };
    expect(patchBody.error.code).toBe('BOOKING_ALREADY_STARTED');

    const cancelOwnRes = await page.request.post(`/api/v1/bookings/${id}/cancel`);
    expect(cancelOwnRes.status()).toBe(422);
    const cancelOwnBody = (await cancelOwnRes.json()) as { error: { code: string } };
    expect(cancelOwnBody.error.code).toBe('BOOKING_ALREADY_STARTED');

    // Staff is exempt from every temporal constraint (AC 1).
    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const staffCancel = await page.request.post(`/api/v1/bookings/${id}/cancel`);
    expect(staffCancel.status()).toBe(200);
  });

  test('a pilot editing or cancelling another person\'s booking gets 403', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const other = await createPilotPerson(page);
    const created = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: other.personId, startsAt: `${FUTURE_DAY}T07:00:00.000Z`, endsAt: `${FUTURE_DAY}T08:00:00.000Z` },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const patchRes = await page.request.patch(`/api/v1/bookings/${id}`, { data: { notes: 'non dovrebbe funzionare' } });
    expect(patchRes.status()).toBe(403);
    const patchBody = (await patchRes.json()) as { error: { code: string } };
    expect(patchBody.error.code).toBe('FORBIDDEN');

    const cancelRes = await page.request.post(`/api/v1/bookings/${id}/cancel`);
    expect(cancelRes.status()).toBe(403);
  });

  test('concurrency: two parallel PATCHes moving two different bookings onto the same run-unique slot yield exactly one 200 and one 409', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    const bookingA = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${FUTURE_DAY}T08:00:00.000Z`, endsAt: `${FUTURE_DAY}T09:00:00.000Z` },
    });
    const bookingB = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${FUTURE_DAY}T10:00:00.000Z`, endsAt: `${FUTURE_DAY}T11:00:00.000Z` },
    });
    expect(bookingA.status()).toBe(201);
    expect(bookingB.status()).toBe(201);
    const { id: idA } = (await bookingA.json()) as { id: string };
    const { id: idB } = (await bookingB.json()) as { id: string };

    const targetInterval = { startsAt: `${FUTURE_DAY}T20:00:00.000Z`, endsAt: `${FUTURE_DAY}T21:00:00.000Z` };
    const [respA, respB] = await Promise.all([
      page.request.patch(`/api/v1/bookings/${idA}`, { data: targetInterval }),
      page.request.patch(`/api/v1/bookings/${idB}`, { data: targetInterval }),
    ]);

    const statuses = [respA.status(), respB.status()].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
  });

  test('concurrency: a double-cancel race on the same booking yields exactly one 200 and one 409', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    const created = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${FUTURE_DAY}T22:00:00.000Z`, endsAt: `${FUTURE_DAY}T23:00:00.000Z` },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const [first, second] = await Promise.all([
      page.request.post(`/api/v1/bookings/${id}/cancel`),
      page.request.post(`/api/v1/bookings/${id}/cancel`),
    ]);

    const statuses = [first.status(), second.status()].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
  });

  // Story 7.2's M1 debt: an automated assertion on the COMBINED href
  // crosstalk (list pagination `?page` and calendar `?view`/`?date` are two
  // independent pieces of state on the SAME page, lesson 6.4 M1) — both
  // directions, in ONE test.
  test('crosstalk href (7.2 M1 debt): calendar links preserve ?page=2, and list pagination links preserve ?view=week&date=<non-oggi>', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    // >=21 run-unique future bookings on a dedicated aircraft (1-hour slots,
    // non-overlapping) — guarantees a page 2 on "Prossime prenotazioni"
    // regardless of this long-lived DB's existing volume (Dev Notes: F1 6.3,
    // never rely on a total count, but pagination itself needs >20 rows to exist).
    for (let i = 0; i < 21; i += 1) {
      const hour = String(i).padStart(2, '0');
      const response = await page.request.post('/api/v1/bookings', {
        data: {
          aircraftId: aircraft.id,
          personId: pilot.personId,
          startsAt: `${FUTURE_DAY}T${hour}:00:00.000Z`,
          endsAt: `${FUTURE_DAY}T${hour}:50:00.000Z`,
        },
      });
      expect(response.status()).toBe(201);
    }

    await page.goto(`/it/dashboard/bookings?view=week&date=${FUTURE_DAY}&page=2`);

    // Direction 1: every calendar link preserves the list's ?page=2.
    for (const testId of ['calendar-prev', 'calendar-today', 'calendar-next', 'calendar-view-day', 'calendar-view-week']) {
      const href = await page.getByTestId(testId).getAttribute('href');
      expect(href, `${testId} href should preserve page=2`).toMatch(/[?&]page=2(&|$)/);
    }

    // Direction 2: both list pagination links preserve the calendar's ?view=week&date=<FUTURE_DAY>.
    for (const testId of ['booking-page-prev', 'booking-page-next']) {
      const href = await page.getByTestId(testId).getAttribute('href');
      expect(href, `${testId} href should preserve view=week`).toMatch(/[?&]view=week(&|$)/);
      expect(href, `${testId} href should preserve date=${FUTURE_DAY}`).toContain(`date=${FUTURE_DAY}`);
    }
  });
});
