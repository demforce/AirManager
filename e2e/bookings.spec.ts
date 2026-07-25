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

/** Archives an aircraft via the admin API — review F5: test-created aircraft must not pile up in the shared dev DB across runs. */
async function archiveAircraft(page: Page, id: string): Promise<void> {
  const response = await page.request.post(`/api/v1/aircraft/${id}/archive`);
  expect(response.status()).toBe(200);
}

/**
 * Review F2: hit-tests `controlTestId` at its RENDERED position after
 * scrolling ONLY `popoverSelector`'s own internal scrollbox to its bottom
 * (`el.scrollTop = el.scrollHeight` — a no-op if the popover isn't
 * `overflow-y: auto`/doesn't need it). This is the discriminator a plain
 * Playwright `.click()` cannot provide: `.click()` calls
 * `scrollIntoViewIfNeeded` first, which — proven by the review — scrolls the
 * CARD's `overflow: hidden` container too (a `overflow: hidden` box is
 * still a scroll container), silently bringing an otherwise-clipped control
 * into view and making the click succeed even on the PRE-fix, still-clipped
 * rendering. Scrolling only the popover's own box sidesteps that: on the
 * real (`position: fixed`) popover the control ends up inside the capped,
 * scrollable box and is hit; on a `position: absolute` popover clipped by
 * the card, there is no internal scrollbox to move, so the control stays
 * wherever the card's clip left it — off-screen or behind the scrim.
 */
async function hitTestsOwnControl(page: Page, popoverSelector: string, controlSelector: string): Promise<boolean> {
  return page.evaluate(
    ({ popoverSelector, controlSelector }) => {
      const popover = document.querySelector(popoverSelector);
      const control = document.querySelector(controlSelector);
      if (!popover || !control) return false;
      (popover as HTMLElement).scrollTop = (popover as HTMLElement).scrollHeight;
      const rect = control.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === control || control.contains(hit);
    },
    { popoverSelector, controlSelector },
  );
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
async function registerExpiry(page: Page, personId: string, expiryTypeId: string, expiresAt: string): Promise<void> {
  const response = await page.request.post('/api/v1/expiries', { data: { personId, expiryTypeId, expiresAt } });
  expect(response.status()).toBe(201);
}

/** Far enough in the future to never collide with "today" no matter when this suite runs. */
const FUTURE_DAY = '2031-03-10';

/**
 * A run-unique far-future calendar day (review 12.3 F5, dirty-DB
 * robustness): unlike `FUTURE_DAY` above (a single fixed date, deliberately
 * shared and heavily reused across this whole file) or "tomorrow" (shared
 * across every run on the SAME calendar day), a fresh random day per test
 * run never collides with another run's leftover bookings — used only where
 * an assertion cannot otherwise be scoped to a single run-unique
 * booking/aircraft (the week view's per-day count has no per-aircraft
 * breakdown of its own).
 */
function runUniqueFutureDay(): string {
  const base = Date.UTC(2040, 0, 1);
  const dayOffsetMs = Math.floor(Math.random() * 3000) * 24 * 3_600_000;
  const date = new Date(base + dayOffsetMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// Story 7.4: an expiry dated well before FUTURE_DAY — genuinely expired for
// any booking made on FUTURE_DAY, regardless of DST/timezone edge cases.
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
  // datetime-local inputs are wall-clock time: render LOCAL components, never
  // toISOString() (UTC) — off-UTC that shifts "now + 10min" into the past and
  // the server rejects the booking (same class as the ppr-register:292 lesson;
  // invisible on CI only because CI runs UTC).
  const toDatetimeLocal = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const start = new Date(Date.now() + 10 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startsAt: toDatetimeLocal(start), endsAt: toDatetimeLocal(end) };
}

test.describe('Aircraft bookings (Story 7.1, AC 1/2/3)', () => {
  test('pilot books via UI for a future interval; an overlap on an APPROVED booking shows 409 in the form; back-to-back (semi-open) succeeds', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await gotoBookingsAndWaitForHydration(page);
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T09:00`);
    await form.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T10:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();

    await expect(page.getByTestId('booking-form-success')).toBeVisible();
    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();

    // Story 12.2, AC 4: only an APPROVED booking occupies a slot (a PENDING
    // one does not, AC 2) — fetch the just-created booking's id (via the
    // API, same-aircraft filter) and have staff approve it, so the overlap
    // the UI form attempt below exercises is actually live. Fetched via the
    // API rather than hand-computed to avoid the datetime-local/UTC offset
    // entirely (this form's inputs are LOCAL time, `af4e5f5`) — the id is
    // the only thing this test needs from the row it just created.
    const listResponse = await page.request.get(`/api/v1/bookings?aircraftId=${aircraft.id}&status=PENDING,APPROVED`);
    const { items } = (await listResponse.json()) as { items: Array<{ id: string }> };
    const bookingAId = items[0]!.id;

    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const approveResponse = await page.request.post(`/api/v1/bookings/${bookingAId}/transition`, { data: { to: 'APPROVED' } });
    expect(approveResponse.status()).toBe(200);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await gotoBookingsAndWaitForHydration(page);
    await page.getByTestId('new-booking-button').click();
    const formAfterApproval = page.getByTestId('new-booking-form');

    // Overlapping attempt on the SAME run-unique aircraft -> 409, never conflated with a 422.
    await formAfterApproval.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await formAfterApproval.getByLabel('Inizio').fill(`${FUTURE_DAY}T09:30`);
    await formAfterApproval.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T10:30`);
    await formAfterApproval.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-error')).toContainText('già prenotato');

    // Back-to-back: starts exactly when the first (APPROVED) booking ends -> semi-open, no overlap, 201.
    await formAfterApproval.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await formAfterApproval.getByLabel('Inizio').fill(`${FUTURE_DAY}T10:00`);
    await formAfterApproval.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T11:00`);
    await formAfterApproval.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    const rows = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(rows).toHaveCount(2);
  });

  test('staff books for another (run-unique) pilot from the "Pilota o allievo" picker', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    await gotoBookingsAndWaitForHydration(page);
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Pilota o allievo').selectOption({ label: `${pilot.lastName} ${pilot.firstName}` });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T13:00`);
    await form.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T14:00`);
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
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    const aircraftOption = form.getByLabel('Velivolo').locator('option', { hasText: aircraft.registration });
    await expect(aircraftOption).toHaveText(new RegExp(reason));
    // `toBeDisabled()` is unreliable for a plain `<option>` in this Chromium
    // build (pre-existing, unrelated to this story: the DOM `disabled`
    // property, `hasAttribute('disabled')`, and `:disabled` all agree the
    // option IS disabled, yet `toBeDisabled()` still reports "enabled") —
    // asserting the attribute directly is the same check without that quirk.
    await expect(aircraftOption).toHaveAttribute('disabled', '');

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
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByRole('radio', { name: 'Per un allievo' }).click();
    // Pre-existing bug uncovered by review 12.3 F1 (out of scope to fix in
    // product code here): `Field`'s implicit `<label>` wraps the `<select>`
    // as a DOM child, so the browser's computed accessible name concatenates
    // the label text with EVERY `<option>`'s text — `getByLabel('Allievo',
    // { exact: true })` therefore never matches (it never equals the bare
    // "Allievo" string). `select[name="studentId"]` targets the SAME control
    // precisely (matches `register('studentId')` in `new-booking-form.tsx`),
    // sidestepping the polluted accessible name entirely.
    await form.locator('select[name="studentId"]').selectOption({ label: `${student.lastName} ${student.firstName}` });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T15:00`);
    await form.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T16:00`);
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

    // Story 12.12: the legacy in-page "Aree operative" nav died with the
    // widget-grid home — same landmark name, now the AirOps Sidebar, whose
    // "schedule" nav item is labeled "Pianificazione" (`shell.nav.schedule`).
    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(nav.getByRole('link', { name: 'Pianificazione', exact: true })).toBeVisible();

    await page.goto(`/it/dashboard/bookings?date=${tomorrow}`);
    // Story 12.3, AC 2: the day view's aircraft columns became rows (the
    // prototype's horizontal timeline) — `calendar-aircraft-column`/
    // `calendar-block` renamed to `schedule-aircraft-row`/`schedule-block`.
    const row = page.getByTestId('schedule-aircraft-row').filter({ hasText: aircraft.registration });
    const block = row.getByTestId('schedule-block').filter({ hasText: pilot.lastName });
    await expect(block).toBeVisible();
    await expect(block).toContainText(pilot.firstName);

    // Story 12.3, AC 3: `NewBookingForm` (and `EditBookingForm`) are only
    // ever MOUNTED for an actor who could ever open one (`canCreate`) — an
    // allievo with no booking permission at all gets neither in the DOM.
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

  test('timeline (Story 7.2 AC 1, re-presented story 12.3 AC 2): day-view blocks on the run-unique aircraft row, week-view real count, prev/next change the heading', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    // Review 12.3 F5: a run-unique far-future day (never-reset dev DB) — the
    // day itself no longer needs to be "tomorrow", since the day-view
    // assertions below are already scoped to the run-unique aircraft ROW,
    // and the week-view count is explicitly scoped to it too (below).
    const targetDay = runUniqueFutureDay();

    // Two run-unique bookings via the admin API at known times (Task 4: "orari noti di DOMANI, es. 09:00Z e 14:00Z").
    const first = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${targetDay}T09:00:00.000Z`, endsAt: `${targetDay}T10:00:00.000Z` },
    });
    expect(first.status()).toBe(201);
    const second = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${targetDay}T14:00:00.000Z`, endsAt: `${targetDay}T15:00:00.000Z` },
    });
    expect(second.status()).toBe(201);

    await page.goto(`/it/dashboard/bookings?date=${targetDay}`);

    // Story 12.3, AC 2: the day view's aircraft columns became rows (the
    // prototype's horizontal timeline) — `calendar-aircraft-column`/
    // `calendar-block` renamed to `schedule-aircraft-row`/`schedule-block`.
    const row = page.getByTestId('schedule-aircraft-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();
    const blocksOnAircraft = row.getByTestId('schedule-block');
    await expect(blocksOnAircraft).toHaveCount(2);
    await expect(blocksOnAircraft.filter({ hasText: pilot.lastName })).toHaveCount(2);

    // prev/next change the heading (Task 4) — round-trip back to the same day.
    const headingOnTargetDay = await page.getByTestId('calendar-heading').textContent();
    await page.getByTestId('calendar-next').click();
    await expect(page.getByTestId('calendar-heading')).not.toHaveText(headingOnTargetDay ?? '');
    await page.getByTestId('calendar-prev').click();
    await expect(page.getByTestId('calendar-heading')).toHaveText(headingOnTargetDay ?? '');

    // Story 12.3, AC 2: the week view is now the prototype's simple 7-cell
    // grid with a REAL per-day count (no more per-aircraft chip matrix,
    // Contesto: "griglia .week-grid con conteggi reali per giorno") — the
    // grid has no per-aircraft breakdown of its own (review 12.3 F5), so the
    // aircraft filter scopes the count to just the two run-unique bookings
    // created above, regardless of anything else landing on the same day.
    await page.getByTestId('calendar-view-week').click();
    await page.getByTestId('schedule-filter-toggle').click();
    await page.getByTestId(`schedule-filter-aircraft-${aircraft.id}`).click();
    const targetDayCell = page.locator('[data-testid="schedule-week-day"].selected');
    await expect(targetDayCell).toBeVisible();
    await expect(targetDayCell.getByTestId('schedule-week-day-count')).toContainText('2');
  });

  test('story 13.7 AC 1 (review F2/F3/F5): the filter popover escapes the card clip and its bottom-most control ("Fatto") is genuinely hit-testable — not just present in the DOM or reachable via Playwright\'s own auto-scroll', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // A tall filter popover (many wrapped aircraft badges) against the
    // week-grid's fixed, roughly constant card height (`.week-grid` cells
    // are `min-height: 200px`, unlike the day view where each aircraft adds
    // its OWN row and the card grows to match) is the scenario ricognizione
    // found clipped. Review F5: 6 run-unique aircraft (long registrations,
    // 2/row at the fixed 320px popover width, review F3) already give a
    // comfortable margin over the card's ~268px height (measured: ~356px of
    // content vs. ~214px of room below the trigger) — down from the
    // original 20, and archived in `finally` so they don't accumulate in
    // the shared dev DB across runs (review F5).
    const created: Array<{ id: string }> = [];
    try {
      for (let i = 0; i < 6; i++) {
        created.push(await createAircraft(page));
      }

      await page.goto('/it/dashboard/bookings?view=week');
      await page.getByTestId('schedule-filter-toggle').click();

      // Review F2: a plain `.click()` on "Fatto" is NOT a valid regression
      // guard — Playwright's `scrollIntoViewIfNeeded` scrolls the CARD's
      // `overflow: hidden` box too (still a scroll container), so the click
      // succeeds even against the PRE-fix, still-clipped rendering (proven
      // empirically by the review). The three assertions below are geometry/
      // hit-testability, not falsifiable by that auto-scroll.
      const geometry = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="schedule-section"]');
        const popover = document.querySelector('.popover');
        if (!card || !popover) return null;
        return {
          position: getComputedStyle(popover).position,
          escapesCard: popover.getBoundingClientRect().bottom > card.getBoundingClientRect().bottom,
        };
      });
      expect(geometry?.position).toBe('fixed');
      expect(geometry?.escapesCard).toBe(true);
      expect(await hitTestsOwnControl(page, '.popover', '[data-testid="schedule-filter-done"]')).toBe(true);

      // Functional sanity check (not the regression guard above): the
      // control is still a real, working button — clicking it closes the
      // popover, same behavior as before the fix.
      const doneButton = page.getByTestId('schedule-filter-done');
      await doneButton.click();
      await expect(page.getByTestId('schedule-filter-toggle')).toBeVisible();
      await expect(doneButton).toHaveCount(0);
    } finally {
      for (const aircraft of created) {
        await archiveAircraft(page, aircraft.id);
      }
    }
  });

  test('story 13.7 review F1: the calendar popover (same toolbar, same card clip) also escapes the card and its last grid row + "Oggi" are genuinely hit-testable', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // Unlike the filter popover above, `CalendarPopover`'s grid is a
    // CONSTANT 6-row/42-cell layout (`buildCalendarGrid`) regardless of
    // which month is shown — no extra fixtures needed, it reliably exceeds
    // the week-grid card's ~268px height on its own.
    await page.goto('/it/dashboard/bookings?view=week');
    await page.getByTestId('schedule-date-pick').click();

    const geometry = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="schedule-section"]');
      const popover = document.querySelector('.cal-popover');
      if (!card || !popover) return null;
      return {
        position: getComputedStyle(popover).position,
        escapesCard: popover.getBoundingClientRect().bottom > card.getBoundingClientRect().bottom,
      };
    });
    expect(geometry?.position).toBe('fixed');
    expect(geometry?.escapesCard).toBe(true);

    // Last grid row (cells 36-42 of the 42-cell grid) + the "Oggi" footer —
    // exactly the controls the review found behind the scrim, pre-fix.
    const lastRowHit = await page.evaluate(() => {
      const popover = document.querySelector('.cal-popover');
      if (!popover) return false;
      const cells = Array.from(popover.querySelectorAll('.cal-cell'));
      const lastRow = cells.slice(-7);
      if (lastRow.length !== 7) return false;
      return lastRow.every((cell) => {
        const rect = cell.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit === cell || cell.contains(hit);
      });
    });
    expect(lastRowHit).toBe(true);
    expect(await hitTestsOwnControl(page, '.cal-popover', '.cal-foot .btn')).toBe(true);

    // Functional sanity check: "Oggi" still works — closes the popover and navigates to today.
    await page.locator('.cal-foot .btn').click();
    await expect(page.locator('.cal-popover')).toHaveCount(0);
  });

  test('story 13.10 (F4-13.7): at 375px both popovers stay clamped inside the viewport (no left/right edge overflow)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/it/dashboard/bookings?view=week');

    // Filter popover: pre-fix, its `right`-anchored math (no clamp) pushed the
    // popover's LEFT edge 139px past the viewport's left edge at this width
    // (measured, review 13.7 F4).
    await page.getByTestId('schedule-filter-toggle').click();
    const filterGeometry = await page.evaluate(() => {
      const popover = document.querySelector('.popover');
      const rect = popover?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right } : null;
    });
    expect(filterGeometry?.left).toBeGreaterThanOrEqual(0);
    expect(filterGeometry?.right).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await hitTestsOwnControl(page, '.popover', '[data-testid="schedule-filter-done"]')).toBe(true);
    await page.getByTestId('schedule-filter-done').click();

    // Calendar popover: pre-fix, its center-under-trigger math (no clamp)
    // pushed the popover's RIGHT edge 12px past the viewport's right edge at
    // this width (measured, story 13.10 sweep — same twin-popover shape as F4).
    await page.getByTestId('schedule-date-pick').click();
    const calGeometry = await page.evaluate(() => {
      const popover = document.querySelector('.cal-popover');
      const rect = popover?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right } : null;
    });
    expect(calGeometry?.left).toBeGreaterThanOrEqual(0);
    expect(calGeometry?.right).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await hitTestsOwnControl(page, '.cal-popover', '.cal-foot .btn')).toBe(true);
  });

  test('calendar mobile viewport (375x812, Task 4): day view is usable, no page-level horizontal overflow, primary action reachable', async ({
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

    // Story 12.3, AC 2: `calendar-aircraft-column`/`calendar-block` renamed
    // to `schedule-aircraft-row`/`schedule-block` (day view is now rows, not columns).
    const row = page.getByTestId('schedule-aircraft-row').filter({ hasText: aircraft.registration });
    const block = row.getByTestId('schedule-block').filter({ hasText: pilot.lastName });
    await expect(block).toBeVisible();

    // Pragmatic mobile-usability assert (Dev Notes): the body itself never scrolls horizontally — only the timeline's own `overflow-x-auto` wrapper does.
    const bodyFitsViewport = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth);
    expect(bodyFitsViewport).toBe(true);

    // Story 12.3 deviation (documented): the AirOps prototype's toolbar
    // icon buttons (`.iconbtn`, ported 1:1) are a deliberate 26x26px dense
    // design, below the 44px touch-target guideline the LEGACY calendar's
    // own bigger controls satisfied — this epic's binding decision
    // ("minimalist-ui superseded") accepts that trade-off for visual
    // parity with the prototype, so the pixel-size assertion is dropped;
    // the primary action stays reachable at this viewport regardless.
    await expect(page.getByTestId('new-booking-button')).toBeVisible();
  });

  test('review 7.2 fixes: an extreme ?date falls back to today without a 500 (F1); a bottom-clamped short block pins INSIDE the grid (F2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    // F1: a hand-edited year-9999 date must sanitize to today and render the
    // timeline — before the fix, addDaysDateOnly(date, 1) overflowed into a
    // 5-digit ISO year and zonedMidnightUtc crashed the page with a 500.
    await page.goto('/it/dashboard/bookings?date=9999-12-31');
    // Story 12.3, AC 2: `bookings-calendar-section` renamed `schedule-section`.
    await expect(page.getByTestId('schedule-section')).toBeVisible();
    await expect(page.getByTestId('calendar-heading')).not.toBeEmpty();

    // F2: a 20:45Z–21:45Z booking lands at/after the 22:00 Europe/Rome window
    // edge in BOTH DST regimes (22:45 CEST / 21:45 CET start), forcing the
    // min-height inflation near the bottom edge — the block must pin AT the
    // grid's edge, never render past it.
    const nextHref = await page.getByTestId('calendar-next').getAttribute('href');
    const tomorrow = nextHref?.match(/date=(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!tomorrow) throw new Error(`Could not extract tomorrow's date from calendar-next href: ${nextHref}`);

    const response = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${tomorrow}T20:45:00.000Z`, endsAt: `${tomorrow}T21:45:00.000Z` },
    });
    expect(response.status()).toBe(201);

    await page.goto(`/it/dashboard/bookings?date=${tomorrow}`);
    // Story 12.3, AC 2: `calendar-aircraft-column`/`calendar-block` renamed
    // `schedule-aircraft-row`/`schedule-block`, AND the projection's
    // `top%`/`height%` (still computed unchanged, `page.tsx#projectDayBlocks`)
    // now drive `left%`/`width%` instead (the axis flipped from vertical
    // column to horizontal row, Contesto) — the clamp check below follows
    // that flip: RIGHT edge (x + width), not bottom edge (y + height).
    const row = page.getByTestId('schedule-aircraft-row').filter({ hasText: aircraft.registration });
    const block = row.getByTestId('schedule-block').filter({ hasText: pilot.lastName });
    await expect(block).toBeVisible();

    const blockBox = await block.boundingBox();
    const rowBox = await row.boundingBox();
    if (!blockBox || !rowBox) throw new Error('Missing bounding boxes for the clamped block/row');
    expect(blockBox.x + blockBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
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
  test('pilot moves their own booking from the UI (new time/aircraft visible in the list), cancels it via the two-step confirm (stays in the list as Annullato, absent from the calendar), and the freed slot accepts a new booking', async ({
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
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T02:00`);
    await form.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T03:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    // Review 12.3 F1: the create SlideOver stays open after a successful
    // submit (no auto-close) — its scrim/panel would otherwise intercept the
    // row-action click below (`pointer-events: none` only lifts on `.open`).
    await page.keyboard.press('Escape');

    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();

    // Modifica (story 12.3: renamed from "Sposta", same PATCH mechanics):
    // change BOTH the aircraft and the interval.
    await row.getByTestId('booking-move-action').click();
    const moveForm = page.getByTestId('move-booking-form');
    await moveForm.getByLabel('Velivolo').selectOption({ label: aircraft2.registration });
    await moveForm.getByLabel('Inizio').fill(`${FUTURE_DAY}T13:00`);
    await moveForm.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T14:00`);
    await moveForm.getByTestId('move-booking-save').click();

    // Story 12.3: feedback moved from an inline `bookings-list-feedback`
    // paragraph to a toast (`useToast`, the AirOps-native convention every
    // workflow action in `bookings-table.tsx` uses).
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione modificata.' })).toBeVisible();
    await expect(page.getByTestId('booking-row').filter({ hasText: aircraft.registration })).toHaveCount(0);
    const movedRow = page.getByTestId('booking-row').filter({ hasText: aircraft2.registration });
    await expect(movedRow).toBeVisible();

    // Cancella: two-step confirm.
    await movedRow.getByTestId('booking-cancel-action').click();
    await movedRow.getByTestId('booking-cancel-confirm').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione annullata.' })).toBeVisible();
    // Story 12.3, AC 3: the list now shows EVERY status (default UI: tutti)
    // — a cancelled booking stays visible with an "Annullato" badge and no
    // actions, it no longer disappears from the list (unlike the legacy
    // "Prossime prenotazioni", which only ever fetched PENDING+APPROVED).
    await expect(movedRow).toContainText('Annullato');
    await expect(movedRow.getByTestId('booking-cancel-action')).toHaveCount(0);

    // Gone from the timeline too (an own-path booking starts PENDING, story
    // 12.2 AC 2 — it was never APPROVED, so it was never on the timeline to
    // begin with; this assertion is the exact mirror of that: still zero).
    await page.goto(`/it/dashboard/bookings?date=${FUTURE_DAY}`);
    const scheduleRow = page.getByTestId('schedule-aircraft-row').filter({ hasText: aircraft2.registration });
    await expect(scheduleRow.getByTestId('schedule-block')).toHaveCount(0);

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
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T02:00`);
    await form.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T03:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T05:00`);
    await form.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T06:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    const rows = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(rows).toHaveCount(2);

    // Story 12.2, AC 4: only an APPROVED booking occupies a slot — approve
    // the FIRST (soonest startsAt, 02:00-03:00) booking so the move below
    // actually collides with it (own-path bookings now start PENDING, AC 2).
    // Fetched via the API (sorted by startsAt) rather than hand-computed, to
    // avoid the datetime-local/UTC offset entirely (this form's inputs are
    // LOCAL time, `af4e5f5`) — only the id is needed from the row created above.
    const listResponse = await page.request.get(`/api/v1/bookings?aircraftId=${aircraft.id}&status=PENDING,APPROVED`);
    const { items } = (await listResponse.json()) as { items: Array<{ id: string; startsAt: string }> };
    const firstBookingId = items.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]!.id;

    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const approveResponse = await page.request.post(`/api/v1/bookings/${firstBookingId}/transition`, { data: { to: 'APPROVED' } });
    expect(approveResponse.status()).toBe(200);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await gotoBookingsAndWaitForHydration(page);

    const rowsAfterApproval = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(rowsAfterApproval).toHaveCount(2);

    // The second (later, 05:00-06:00) booking is ordered second (startsAt asc) — move it into the first's slot (02:00-03:00, same aircraft, prefilled).
    await rowsAfterApproval.nth(1).getByTestId('booking-move-action').click();
    const moveForm = page.getByTestId('move-booking-form');
    await moveForm.getByLabel('Inizio').fill(`${FUTURE_DAY}T02:00`);
    await moveForm.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T03:00`);
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
    await registerExpiry(page, pilot.personId, blockingType.id, EXPIRED_EXPIRES_AT);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, pilotPassword);

    await gotoBookingsAndWaitForHydration(page);
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T06:00`);
    await form.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T07:00`);
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
    await registerExpiry(page, pilot.personId, warningType.id, EXPIRED_EXPIRES_AT);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, pilotPassword);

    await gotoBookingsAndWaitForHydration(page);
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    // `soonestFutureSlot()`, not `FUTURE_DAY` (Dev Notes): this test asserts
    // the created row is VISIBLE in the paginated "Prossime prenotazioni"
    // list, so it needs a slot that outranks EVERYTHING else in it, not
    // merely a day that avoids `FUTURE_DAY`'s own accumulated volume.
    const slot = soonestFutureSlot();
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(slot.startsAt);
    await form.getByLabel('Fine', { exact: true }).fill(slot.endsAt);
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
    await registerExpiry(page, pilot.personId, blockingType.id, EXPIRED_EXPIRES_AT);

    await gotoBookingsAndWaitForHydration(page);
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    // `soonestFutureSlot()`, not `FUTURE_DAY` — see the other row-visibility
    // assertion above for the rationale (only "outranks everything else in
    // the globally-sorted list" survives this DB's accumulated volume).
    const slot = soonestFutureSlot();
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Pilota o allievo').selectOption({ label: `${pilot.lastName} ${pilot.firstName}` });
    await form.getByLabel('Inizio').fill(slot.startsAt);
    await form.getByLabel('Fine', { exact: true }).fill(slot.endsAt);
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
    await registerExpiry(page, pilot.personId, blockingType.id, FUTURE_DAY);

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
    await registerExpiry(page, pilot.personId, blockingType.id, DAY_1);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, pilotPassword);

    await gotoBookingsAndWaitForHydration(page);
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Inizio').fill(`${DAY_1}T12:00`);
    await form.getByLabel('Fine', { exact: true }).fill(`${DAY_1}T13:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();

    // Review 12.3 F1: the create SlideOver stays open after a successful
    // submit (no auto-close) — its scrim/panel would otherwise intercept the
    // row-action click below (`pointer-events: none` only lifts on `.open`).
    await page.keyboard.press('Escape');

    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();

    // Same-day time-only move: never rechecked, succeeds even past the block.
    await row.getByTestId('booking-move-action').click();
    let moveForm = page.getByTestId('move-booking-form');
    await moveForm.getByLabel('Inizio').fill(`${DAY_1}T14:00`);
    await moveForm.getByLabel('Fine', { exact: true }).fill(`${DAY_1}T15:00`);
    await moveForm.getByTestId('move-booking-save').click();
    // Story 12.3: toast instead of an inline `bookings-list-feedback` paragraph.
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione modificata.' })).toBeVisible();
    // Wait for the first form to fully close before reopening it — avoids a
    // race between `onSuccess`'s `router.refresh()` and the next click.
    await expect(page.getByTestId('move-booking-form')).toHaveCount(0);

    // Moving to the NEXT day: the document is expired relative to THAT day -> 422, naming it.
    await row.getByTestId('booking-move-action').click();
    moveForm = page.getByTestId('move-booking-form');
    await moveForm.getByLabel('Inizio').fill(`${DAY_2}T12:00`);
    await moveForm.getByLabel('Fine', { exact: true }).fill(`${DAY_2}T13:00`);
    await moveForm.getByTestId('move-booking-save').click();
    await expect(page.getByTestId('move-booking-form-error')).toContainText(blockingType.name);
  });
});

test.describe('Booking approval workflow UI (Story 12.3, AC 3)', () => {
  /**
   * Walks the paginated "Prossime prenotazioni" list forward from page 1
   * until a row matching `filterText` appears (review 12.3 F5): the list is
   * sorted `startsAt asc` and, on a never-reset dev DB (plus story 12.3 F7's
   * wider 48h-back window), a fixture booking's exact page number depends on
   * how many OTHER bookings currently outrank it — never assumed to be page 1.
   */
  async function findBookingRow(page: Page, filterText: string | string[]): Promise<ReturnType<Page['getByTestId']>> {
    const filterTexts = Array.isArray(filterText) ? filterText : [filterText];
    const MAX_PAGES = 50;
    // A direct `?page=N` navigation per attempt, not repeated `booking-page-next`
    // clicks: clicking a `<Link>` through several client-side (SPA) navigations
    // in a tight loop proved unreliable in this environment (the "next" link
    // intermittently reported "not enabled" even with `aria-disabled="false"`,
    // hanging until the test timeout) — a plain full navigation is the SAME
    // reliable primitive `gotoBookingsAndWaitForHydration` already uses
    // elsewhere in this file for the identical hydration-race reason. An
    // out-of-range `?page` is clamped server-side (`page.tsx`), so this is
    // always safe even past the real last page.
    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
      await page.goto(`/it/dashboard/bookings?page=${pageNumber}`);
      await page.waitForLoadState('networkidle');
      const row = filterTexts.reduce((locator, text) => locator.filter({ hasText: text }), page.getByTestId('booking-row'));
      if ((await row.count()) > 0) return row;
      const statusLocator = page.getByTestId('booking-pagination-status');
      if ((await statusLocator.count()) === 0) break; // a single page has no pagination controls at all
      const statusText = (await statusLocator.textContent()) ?? '';
      const totalPages = Number.parseInt(statusText.split('/')[1]?.trim() ?? '1', 10);
      if (pageNumber >= totalPages) break;
    }
    throw new Error(`Booking row matching "${filterText}" not found within ${MAX_PAGES} pages of /dashboard/bookings`);
  }

  /**
   * Creates a run-unique aircraft plus a PENDING booking (own-path: a
   * freshly logged-in pilot creates it, story 12.2 AC 2 — `bookings.manage.own`
   * always starts PENDING), then logs back in as staff and lands on the
   * bookings page. Returns the aircraft (for a run-unique `booking-row`
   * filter, same convention as every other test in this file) and the row
   * locator itself.
   */
  async function setupPendingBookingAsStaff(page: Page): Promise<{ aircraft: { id: string; registration: string }; row: ReturnType<Page['getByTestId']> }> {
    // Review 12.3 F5: this helper can run TWICE in the same test (e.g. the
    // Effettuato/Assente test below) — without clearing cookies first, the
    // SECOND call's `loginExpectingDashboard(ADMIN_EMAIL)` hits `/it/login`
    // while already authenticated as admin (leftover from the FIRST call's
    // own final login), which some apps redirect away from before the
    // Email/Password fields ever render.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilotPassword = `PilotaWorkflow${uniqueSuffix()}!`;
    const pilot = await createPilotWithLogin(page, pilotPassword);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, pilotPassword);
    const response = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${FUTURE_DAY}T09:00:00.000Z`, endsAt: `${FUTURE_DAY}T10:00:00.000Z` },
    });
    expect(response.status()).toBe(201);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const row = await findBookingRow(page, aircraft.registration);
    await expect(row).toContainText('In attesa');
    return { aircraft, row };
  }

  test('staff approves a PENDING booking: badge changes, decisional actions gone, Effettuato/Assente/Annulla appear', async ({ page }) => {
    const { aircraft, row } = await setupPendingBookingAsStaff(page);

    await row.getByTestId('booking-approve-action').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione approvata.' })).toBeVisible();

    // Review 12.3 F5: `router.refresh()` re-fetches the SAME `?page=N` the
    // row was found on — on a dirty, never-reset (and, in this run,
    // concurrently written-to) dev DB, other bookings inserted meanwhile can
    // push this row's rank onto a DIFFERENT page, so it is re-located here
    // rather than reusing the pre-approval `row` locator.
    const approvedRow = await findBookingRow(page, aircraft.registration);
    await expect(approvedRow).toContainText('Approvato');
    await expect(approvedRow.getByTestId('booking-approve-action')).toHaveCount(0);
    await expect(approvedRow.getByTestId('booking-reject-action')).toHaveCount(0);
    await expect(approvedRow.getByTestId('booking-flown-action')).toBeVisible();
    await expect(approvedRow.getByTestId('booking-noshow-action')).toBeVisible();
    await expect(approvedRow.getByTestId('booking-cancel-action')).toBeVisible();
  });

  test('staff rejects a PENDING booking with a required reason, the reason shows under the badge; "Riapri" reopens it back to PENDING', async ({
    page,
  }) => {
    const { aircraft, row } = await setupPendingBookingAsStaff(page);

    await row.getByTestId('booking-reject-action').click();

    // Submitting without a motivo is rejected client-side first (same UX as the create form's "Forza prenotazione" reason).
    await page.getByTestId('booking-deny-submit').click();
    await expect(page.getByTestId('booking-deny-error')).toBeVisible();

    const reason = `Aeromobile non disponibile ${uniqueSuffix()}`;
    await page.getByTestId('booking-deny-reason').fill(reason);
    await page.getByTestId('booking-deny-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione rifiutata.' })).toBeVisible();

    // Review 12.3 F5: re-located after `router.refresh()` (see the approve
    // test's own comment above) — the row's page can shift between actions
    // on a dirty, concurrently-written-to dev DB.
    const rejectedRow = await findBookingRow(page, aircraft.registration);
    await expect(rejectedRow).toContainText('Rifiutato');
    await expect(rejectedRow).toContainText(reason);
    await expect(rejectedRow.getByTestId('booking-reject-action')).toHaveCount(0);
    await expect(rejectedRow.getByTestId('booking-approve-action')).toHaveCount(0);

    await rejectedRow.getByTestId('booking-reopen-action').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione riaperta.' })).toBeVisible();

    const reopenedRow = await findBookingRow(page, aircraft.registration);
    await expect(reopenedRow).toContainText('In attesa');
    await expect(reopenedRow.getByTestId('booking-approve-action')).toBeVisible();
  });

  test('staff marks an APPROVED booking Effettuato (and a second one Assente); both then only offer "Riapri"', async ({ page }) => {
    // Twice the sequential work of any other test here (two FULL
    // setupPendingBookingAsStaff → approve → decision cycles, each
    // re-locating its row via findBookingRow) — the default 30s budget is
    // tight for that much serial navigation, so it gets extra headroom.
    test.setTimeout(60_000);
    // Review 12.3 F5: every row is RE-LOCATED after each mutating click
    // (`router.refresh()` re-fetches the SAME `?page=N` the row was found
    // on, but the row's rank — and so its page — can shift meanwhile on a
    // dirty, concurrently-written-to dev DB, see the approve test's comment).
    const { aircraft: flownAircraft, row: pendingFlownRow } = await setupPendingBookingAsStaff(page);
    await pendingFlownRow.getByTestId('booking-approve-action').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione approvata.' })).toBeVisible();

    const approvedFlownRow = await findBookingRow(page, flownAircraft.registration);
    await expect(approvedFlownRow).toContainText('Approvato');
    await approvedFlownRow.getByTestId('booking-flown-action').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione segnata come effettuata.' })).toBeVisible();

    const flownRow = await findBookingRow(page, flownAircraft.registration);
    await expect(flownRow).toContainText('Effettuato');
    await expect(flownRow.getByTestId('booking-flown-action')).toHaveCount(0);
    await expect(flownRow.getByTestId('booking-cancel-action')).toHaveCount(0);
    await expect(flownRow.getByTestId('booking-reopen-action')).toBeVisible();

    const { aircraft: noShowAircraft, row: pendingNoShowRow } = await setupPendingBookingAsStaff(page);
    await pendingNoShowRow.getByTestId('booking-approve-action').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione approvata.' })).toBeVisible();

    const approvedNoShowRow = await findBookingRow(page, noShowAircraft.registration);
    await expect(approvedNoShowRow).toContainText('Approvato');
    await approvedNoShowRow.getByTestId('booking-noshow-action').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione segnata come assente.' })).toBeVisible();

    const noShowRow = await findBookingRow(page, noShowAircraft.registration);
    await expect(noShowRow).toContainText('Assente');
    await expect(noShowRow.getByTestId('booking-noshow-action')).toHaveCount(0);
    await expect(noShowRow.getByTestId('booking-reopen-action')).toBeVisible();
  });

  test('own-path pilot sees only Modifica/Annulla on their own PENDING booking, no decisional actions, and a PENDING row on another pilot\'s booking has no actions at all', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const otherPilotPassword = `PilotaAltro${uniqueSuffix()}!`;
    // `createPilotWithLogin` ends its own set-password flow authenticated
    // AS the new pilot (same pattern every other helper in this file
    // relies on, e.g. the force-booking test below) — this own-path POST
    // is genuinely `personId === actor.personId`, so it starts PENDING
    // (story 12.2 AC 2), unlike a staff-created booking for someone else
    // (which starts APPROVED).
    const otherPilot = await createPilotWithLogin(page, otherPilotPassword);
    const other = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: otherPilot.personId, startsAt: `${FUTURE_DAY}T11:00:00.000Z`, endsAt: `${FUTURE_DAY}T12:00:00.000Z` },
    });
    expect(other.status()).toBe(201);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const me = await (await page.request.get('/api/v1/me')).json();
    const ownResponse = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: me.person.id, startsAt: `${FUTURE_DAY}T14:00:00.000Z`, endsAt: `${FUTURE_DAY}T15:00:00.000Z` },
    });
    expect(ownResponse.status()).toBe(201);

    // Still logged in as PILOT (own path): sees the shared list (FR-19,
    // `self.read`), with the "other pilot's" row present but action-less.
    // Disambiguate rows by PERSON NAME, never by H:MM (CLAUDE.md lesson
    // 11.2, epic 11: a substring time like "11:00" would also match
    // "1:00" — the two rows here are distinguished by the two run-unique
    // people involved instead). `findBookingRow` (review 12.3 F5): never
    // assumes page 1 on a dirty, never-reset dev DB.
    const ownRow = await findBookingRow(page, [aircraft.registration, me.person.lastName]);
    await expect(ownRow.getByTestId('booking-move-action')).toBeVisible();
    await expect(ownRow.getByTestId('booking-cancel-action')).toBeVisible();
    await expect(ownRow.getByTestId('booking-approve-action')).toHaveCount(0);
    await expect(ownRow.getByTestId('booking-reject-action')).toHaveCount(0);

    const otherRow = await findBookingRow(page, [aircraft.registration, otherPilot.lastName]);
    await expect(otherRow.getByTestId('booking-move-action')).toHaveCount(0);
    await expect(otherRow.getByTestId('booking-cancel-action')).toHaveCount(0);
    await expect(otherRow.getByTestId('booking-approve-action')).toHaveCount(0);
  });
});
