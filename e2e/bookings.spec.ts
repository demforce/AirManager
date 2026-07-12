import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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
async function createPilotPerson(
  page: Page,
  // Story 7.4: an optional lastName PREFIX, defaulting to the exact
  // pre-existing "Pilota-" (every other caller in this file is unaffected,
  // byte-for-byte). A caller whose test picks this person from the
  // `<select>`-based "Pilota o allievo" picker (a plain native select, no
  // search — `listPeople`'s own `orderBy: lastName asc` + its
  // `OPTIONS_PAGE_SIZE` cap, page.tsx, is unrelated to and out of scope for
  // this story) can pass an alphabetically-EARLY prefix so the option is
  // guaranteed to render regardless of how many OTHER people this
  // long-lived, never-reset dev DB has accumulated (Dev Notes: this file's
  // own row-visibility lesson, applied to a second paginated surface).
  lastNamePrefix = 'Pilota',
): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Prenota';
  const lastName = `${lastNamePrefix}-${suffix}`;

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

/** Creates a run-unique pilot person plus a linked login user (story 7.4: a non-staff actor is needed to exercise the expiry-block from the OWN-path form, unlike `createPilotPerson` which has no login). */
async function createPilotWithLogin(page: Page, password: string): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Pilota';
  const lastName = `Scadenze-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail('pilot-expiry-bookings');
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

/**
 * Creates a run-unique expiry TYPE via the admin API (story 7.4, Dev Notes:
 * "MAI riusare 'Licenza' del seed nei test, si inquinerebbero a vicenda" —
 * the catalogue is shared and tests run in parallel). `scope: 'ALL'` for
 * simplicity (any person is eligible), matching the Contesto's own e2e plan.
 */
async function createExpiryTypeForBooking(page: Page, blocksBooking: boolean): Promise<{ id: string; name: string }> {
  const name = `Tipo prenotazioni ${uniqueSuffix()}`;
  const response = await page.request.post('/api/v1/expiry-types', { data: { name, scope: 'ALL', blocksBooking } });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { id: string };
  return { id: body.id, name };
}

/** Registers a scadenza for a person via the staff API (story 7.4; `expiries` API of story 6.2). */
async function registerExpiry(page: Page, personId: string, expiryTypeId: string, issuedAt: string, expiresAt: string): Promise<void> {
  const response = await page.request.post('/api/v1/expiries', { data: { personId, expiryTypeId, issuedAt, expiresAt } });
  expect(response.status()).toBe(201);
}

/** Far enough in the future to never collide with "today" no matter when this suite runs. */
const FUTURE_DAY = '2031-03-10';

// Story 7.4: an expiry dated well before FUTURE_DAY — genuinely expired for
// any booking made on FUTURE_DAY, regardless of DST/timezone edge cases.
const EXPIRED_ISSUED_AT = '2020-01-01';
const EXPIRED_EXPIRES_AT = '2020-06-01';

/**
 * The SOONEST valid future slot (`startsAt`/`endsAt`, `YYYY-MM-DDTHH:mm` —
 * this environment's browser/server timezone is UTC, matching the
 * datetime-local `Inizio`/`Fine` inputs directly) — story 7.4, Dev Notes
 * lesson learned, after TWO failed attempts at picking a "day that sorts
 * early enough": `listBookings`/"Prossime prenotazioni" orders `startsAt
 * asc` GLOBALLY (not per-day) and shows only page 1
 * (`BOOKINGS_PAGE_SIZE`) — a test asserting a just-created row is VISIBLE
 * there (unlike a plain API status/count assertion) needs a slot that
 * outranks EVERY other booking currently in the table, not merely one that
 * avoids the shared, heavily-reused `FUTURE_DAY` pile (2031-03-10, dozens
 * of accumulated bookings across every session this long-lived, never-reset
 * dev DB has ever run). A random FUTURE date/day is not enough — this
 * session's own repeated re-runs alone scattered enough near-term bookings
 * to blow past `BOOKINGS_PAGE_SIZE` again. Minutes-from-now is the only
 * slot that beats literally everything else EXCEPT other genuinely-imminent
 * bookings, AND it self-cleans: `from: nowIso` drops it from the list on
 * its own once it is in the past, unlike a fixed/far future date that
 * accumulates forever.
 */
function soonestFutureSlot(): { startsAt: string; endsAt: string } {
  const toDatetimeLocal = (d: Date): string => d.toISOString().slice(0, 16);
  const start = new Date(Date.now() + 10 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startsAt: toDatetimeLocal(start), endsAt: toDatetimeLocal(end) };
}

/**
 * Story 12.5: the single `datetime-local` `Inizio`/`Fine` inputs became a
 * `DateTimeField` pair (`DatePicker` DD/MM/YYYY text + a derived "Ora
 * inizio"/"Ora fine" time field) — these two helpers split a
 * `YYYY-MM-DDTHH:mm` value (the SAME shape `soonestFutureSlot`/every inline
 * template literal below already produced for the old single input) across
 * both fields, scoped to whichever form `Locator` the caller passes (the
 * create form and a per-row move form share the SAME "Inizio"/"Fine"
 * labels). `exact: true` on the date half — Playwright's `getByLabel` is a
 * case-insensitive SUBSTRING match by default, and "Ora inizio"/"Ora fine"
 * both literally contain "inizio"/"fine".
 */
async function fillStartsAt(scope: Locator, value: string): Promise<void> {
  const [datePart, time] = value.split('T');
  const [y, m, d] = datePart.split('-');
  await scope.getByLabel('Inizio', { exact: true }).fill(`${d}/${m}/${y}`);
  await scope.getByLabel('Ora inizio').fill(time);
}

async function fillEndsAt(scope: Locator, value: string): Promise<void> {
  const [datePart, time] = value.split('T');
  const [y, m, d] = datePart.split('-');
  await scope.getByLabel('Fine', { exact: true }).fill(`${d}/${m}/${y}`);
  await scope.getByLabel('Ora fine').fill(time);
}

test.describe('Aircraft bookings (Story 7.1, AC 1/2/3)', () => {
  test('pilot books via UI for a future interval; an overlap shows 409 in the form; back-to-back (semi-open) succeeds', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await gotoBookingsAndWaitForHydration(page);
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await fillStartsAt(form, `${FUTURE_DAY}T09:00`);
    await fillEndsAt(form, `${FUTURE_DAY}T10:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();

    await expect(page.getByTestId('booking-form-success')).toBeVisible();
    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();

    // Overlapping attempt on the SAME run-unique aircraft -> 409, never conflated with a 422.
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await fillStartsAt(form, `${FUTURE_DAY}T09:30`);
    await fillEndsAt(form, `${FUTURE_DAY}T10:30`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-error')).toContainText('già prenotato');

    // Back-to-back: starts exactly when the first booking ends -> semi-open, no overlap, 201.
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await fillStartsAt(form, `${FUTURE_DAY}T10:00`);
    await fillEndsAt(form, `${FUTURE_DAY}T11:00`);
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
    await fillStartsAt(form, `${FUTURE_DAY}T13:00`);
    await fillEndsAt(form, `${FUTURE_DAY}T14:00`);
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
    // `soonestFutureSlot()`, not `FUTURE_DAY` (review 12.5, 125-F1): this test
    // asserts the ROW on page 1 of the startsAt-ASC paginated list — a fixed
    // far-future 15:00 slot sinks past page 1 once the parallel suite has
    // accumulated ~3 pages of `FUTURE_DAY` bookings.
    const slot = soonestFutureSlot();
    await fillStartsAt(form, slot.startsAt);
    await fillEndsAt(form, slot.endsAt);
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
    await fillStartsAt(form, `${FUTURE_DAY}T02:00`);
    await fillEndsAt(form, `${FUTURE_DAY}T03:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();

    // Sposta: change BOTH the aircraft and the interval.
    await row.getByTestId('booking-move-action').click();
    const moveForm = page.getByTestId('move-booking-form');
    await moveForm.getByLabel('Velivolo').selectOption({ label: aircraft2.registration });
    await fillStartsAt(moveForm, `${FUTURE_DAY}T13:00`);
    await fillEndsAt(moveForm, `${FUTURE_DAY}T14:00`);
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
    await fillStartsAt(form, `${FUTURE_DAY}T02:00`);
    await fillEndsAt(form, `${FUTURE_DAY}T03:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await fillStartsAt(form, `${FUTURE_DAY}T05:00`);
    await fillEndsAt(form, `${FUTURE_DAY}T06:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    const rows = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(rows).toHaveCount(2);

    // The second (later, 05:00-06:00Z) booking is ordered second (startsAt asc) — move it into the first's slot (02:00-03:00Z, same aircraft, prefilled).
    await rows.nth(1).getByTestId('booking-move-action').click();
    const moveForm = page.getByTestId('move-booking-form');
    await fillStartsAt(moveForm, `${FUTURE_DAY}T02:00`);
    await fillEndsAt(moveForm, `${FUTURE_DAY}T03:00`);
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
    // Story 7.4: the POST response envelope is now `{ booking, warnings }`.
    const { booking } = (await created.json()) as { booking: { id: string } };
    const { id } = booking;

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
    const { booking } = (await created.json()) as { booking: { id: string } };
    const { id } = booking;

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
    const { booking: createdA } = (await bookingA.json()) as { booking: { id: string } };
    const { booking: createdB } = (await bookingB.json()) as { booking: { id: string } };
    const idA = createdA.id;
    const idB = createdB.id;

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
    const { booking } = (await created.json()) as { booking: { id: string } };
    const { id } = booking;

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

test.describe('Booking expiry block (Story 7.4, AC 1/2)', () => {
  test('a pilot with a run-unique BLOCKING expired document sees an error naming it, and no force section (staff-only)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const blockingType = await createExpiryTypeForBooking(page, true);
    const pilotPassword = 'PilotaBloccato123!';
    const pilot = await createPilotWithLogin(page, pilotPassword);
    await registerExpiry(page, pilot.personId, blockingType.id, EXPIRED_ISSUED_AT, EXPIRED_EXPIRES_AT);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, pilotPassword);

    await gotoBookingsAndWaitForHydration(page);
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await fillStartsAt(form, `${FUTURE_DAY}T06:00`);
    await fillEndsAt(form, `${FUTURE_DAY}T07:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();

    await expect(page.getByTestId('booking-form-error')).toContainText(blockingType.name);
    await expect(page.getByTestId('force-booking-section')).toHaveCount(0);
    await expect(page.getByTestId('booking-row').filter({ hasText: aircraft.registration })).toHaveCount(0);
  });

  test('a pilot with ONLY a run-unique NON-blocking (warning) expired document: the booking is created, with an amber warning banner naming it', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const warningType = await createExpiryTypeForBooking(page, false);
    const pilotPassword = 'PilotaWarning123!';
    const pilot = await createPilotWithLogin(page, pilotPassword);
    await registerExpiry(page, pilot.personId, warningType.id, EXPIRED_ISSUED_AT, EXPIRED_EXPIRES_AT);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, pilotPassword);

    await gotoBookingsAndWaitForHydration(page);
    const form = page.getByTestId('new-booking-form');
    // `soonestFutureSlot()`, not `FUTURE_DAY` (Dev Notes): this test asserts
    // the created row is VISIBLE in the paginated "Prossime prenotazioni"
    // list, so it needs a slot that outranks EVERYTHING else in it, not
    // merely a day that avoids `FUTURE_DAY`'s own accumulated volume.
    const slot = soonestFutureSlot();
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await fillStartsAt(form, slot.startsAt);
    await fillEndsAt(form, slot.endsAt);
    await form.getByRole('button', { name: 'Prenota' }).click();

    await expect(page.getByTestId('booking-form-warning')).toBeVisible();
    await expect(page.getByTestId('booking-form-warning')).toContainText(warningType.name);
    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();
  });

  test('staff: a blocked person triggers 422 with the document name, "Forza prenotazione" appears, and a motivated force succeeds (201) with forcedAt tracked', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const blockingType = await createExpiryTypeForBooking(page, true);
    // Alphabetically-EARLY prefix (Dev Notes): this test picks the person
    // from the "Pilota o allievo" `<select>` by label, which only renders
    // `listPeople`'s FIRST `OPTIONS_PAGE_SIZE` (100) people ordered by
    // lastName — with 169+ active people accumulated in this never-reset
    // dev DB, a "Pilota-..." (mid-alphabet) name is no longer a safe bet.
    const pilot = await createPilotPerson(page, '0Pilota');
    await registerExpiry(page, pilot.personId, blockingType.id, EXPIRED_ISSUED_AT, EXPIRED_EXPIRES_AT);

    await gotoBookingsAndWaitForHydration(page);
    const form = page.getByTestId('new-booking-form');
    // `soonestFutureSlot()`, not `FUTURE_DAY` — see the other row-visibility
    // assertion above for the rationale (only "outranks everything else in
    // the globally-sorted list" survives this DB's accumulated volume).
    const slot = soonestFutureSlot();
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Pilota o allievo').selectOption({ label: `${pilot.lastName} ${pilot.firstName}` });
    await fillStartsAt(form, slot.startsAt);
    await fillEndsAt(form, slot.endsAt);
    await form.getByRole('button', { name: 'Prenota' }).click();

    await expect(page.getByTestId('booking-form-error')).toContainText(blockingType.name);
    const forceSection = page.getByTestId('force-booking-section');
    await expect(forceSection).toBeVisible();

    // Submitting without a motivo is rejected client-side first.
    await forceSection.getByTestId('force-booking-submit').click();
    await expect(forceSection.getByTestId('force-booking-error')).toBeVisible();

    await forceSection.getByTestId('force-booking-reason').fill('Autorizzato dal direttore per volo urgente');
    await forceSection.getByTestId('force-booking-submit').click();

    await expect(page.getByTestId('booking-form-success')).toBeVisible();
    await expect(page.getByTestId('force-booking-section')).toHaveCount(0);
    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();

    // The tracking (AC 2 "chi, quando") is exposed read-side on the item DTO
    // (`bookingItemSchema.forcedAt`) — assert it is non-null on the row just created.
    const listResponse = await page.request.get(`/api/v1/bookings?personId=${pilot.personId}&pageSize=50`);
    expect(listResponse.status()).toBe(200);
    const listBody = (await listResponse.json()) as { items: Array<{ aircraftId: string; forcedAt: string | null }> };
    const forcedBooking = listBody.items.find((item) => item.aircraftId === aircraft.id);
    expect(forcedBooking?.forcedAt).not.toBeNull();
  });

  test('a pilot attempting force:true directly via the API gets 403 (own-path never bypasses a block, checked before any expiry query)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const me = await (await page.request.get('/api/v1/me')).json();
    const pilotPersonId = me.person.id as string;

    const response = await page.request.post('/api/v1/bookings', {
      data: {
        aircraftId: aircraft.id,
        personId: pilotPersonId,
        startsAt: `${FUTURE_DAY}T19:30:00.000Z`,
        endsAt: `${FUTURE_DAY}T20:30:00.000Z`,
        force: true,
        forceReason: 'Tentativo non autorizzato',
      },
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('boundary: an expiry whose expiresAt equals the flight day itself is still valid — the booking succeeds with no error and no warning', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const blockingType = await createExpiryTypeForBooking(page, true);
    const pilot = await createPilotPerson(page);
    // FUTURE_DAY's own date, in Europe/Rome: a 09:00Z start on 2031-03-10 is
    // 10:00 CET (before that year's DST transition) — same calendar day.
    await registerExpiry(page, pilot.personId, blockingType.id, EXPIRED_ISSUED_AT, FUTURE_DAY);

    const response = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${FUTURE_DAY}T09:00:00.000Z`, endsAt: `${FUTURE_DAY}T10:00:00.000Z` },
    });

    expect(response.status()).toBe(201);
    const body = (await response.json()) as { booking: { id: string }; warnings: unknown[] };
    expect(body.warnings).toEqual([]);
  });

  test('moving a booking to a DIFFERENT flight day past a blocking expired document answers 422 naming it; a same-day time-only move is unaffected (TD-5, AC 5)', async ({
    page,
  }) => {
    // Deliberately NOT `FUTURE_DAY` (2031-03-10): "Prossime prenotazioni"
    // orders `startsAt asc` GLOBALLY and shows only page 1
    // (`BOOKINGS_PAGE_SIZE`, `soonestFutureSlot`'s own doc-comment above) —
    // that shared, heavily-reused fixture day has accumulated far more rows
    // across repeated runs than the page size, which would push THIS row off
    // page 1. Two near-term, run-fresh calendar days (Europe/Rome, noon UTC —
    // comfortably clear of any midnight/DST boundary) avoid that pile-up.
    const romeDateOnly = (date: Date): string =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const DAY_1 = romeDateOnly(new Date(Date.now() + 24 * 3_600_000));
    const DAY_2 = romeDateOnly(new Date(Date.now() + 48 * 3_600_000));

    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const blockingType = await createExpiryTypeForBooking(page, true);
    const pilotPassword = 'PilotaSpostaScaduto123!';
    const pilot = await createPilotWithLogin(page, pilotPassword);
    // Valid exactly ON DAY_1 (boundary), expired the day AFTER.
    await registerExpiry(page, pilot.personId, blockingType.id, EXPIRED_ISSUED_AT, DAY_1);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, pilotPassword);

    await gotoBookingsAndWaitForHydration(page);
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await fillStartsAt(form, `${DAY_1}T12:00`);
    await fillEndsAt(form, `${DAY_1}T13:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();

    // Same-day time-only move: never rechecked, succeeds even past the block.
    await row.getByTestId('booking-move-action').click();
    let moveForm = page.getByTestId('move-booking-form');
    await fillStartsAt(moveForm, `${DAY_1}T14:00`);
    await fillEndsAt(moveForm, `${DAY_1}T15:00`);
    await moveForm.getByTestId('move-booking-save').click();
    await expect(page.getByTestId('bookings-list-feedback')).toHaveText('Prenotazione spostata.');
    // Wait for the first form to fully close before reopening it — avoids a
    // race between `handleMoved`'s `router.refresh()` and the next click.
    await expect(page.getByTestId('move-booking-form')).toHaveCount(0);

    // Moving to the NEXT day: the document is expired relative to THAT day -> 422, naming it.
    await row.getByTestId('booking-move-action').click();
    moveForm = page.getByTestId('move-booking-form');
    await fillStartsAt(moveForm, `${DAY_2}T12:00`);
    await fillEndsAt(moveForm, `${DAY_2}T13:00`);
    await moveForm.getByTestId('move-booking-save').click();
    await expect(page.getByTestId('move-booking-form-error')).toContainText(blockingType.name);
  });
});
