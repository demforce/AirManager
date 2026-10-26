// This spec writes GLOBAL `sched.*` AppSetting rows (see PERMISSIVE_SCHEDULING
// below) and runs in the `booking-window` Playwright project, serialized AFTER
// `settings` and the main `chromium` project (playwright.config.ts) so its
// writes never race a concurrent booking create elsewhere. Running this file
// alone locally: `npx playwright test booking-window.spec.ts --no-deps`
// (otherwise Playwright first runs its `chromium`/`settings` dependencies).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/booking-window.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

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

async function createAircraft(page: Page): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-BW${suffix}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 50 },
  });
  expect(response.status()).toBe(201);
  const aircraft = (await response.json()) as { id: string };
  return { id: aircraft.id, registration };
}

async function createPilotPerson(page: Page): Promise<{ personId: string }> {
  const suffix = uniqueSuffix();
  // `AAA` prefix: the staff person picker on /dashboard/bookings loads ONE page
  // of `listPeople` (100 rows, `lastName asc` — `page.tsx#OPTIONS_PAGE_SIZE`),
  // and this project runs AFTER the whole `chromium` suite has filled the DB.
  // Measured on the first full-chain run (2026-08-03): 299 people, a
  // `Booking-*` surname ranked 125 → its <option> was absent and the UI half
  // of the banner test timed out on all 3 retries. The API-only tests here
  // don't care, but the fixture must sort inside page 1 for the one that does.
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName: 'Orario', lastName: `AAABooking-${suffix}` } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  return { personId: person.id };
}

async function setScheduling(
  page: Page,
  values: { openTime: string; closeTime: string; minSlotMinutes: number; turnaroundMinutes: number; maxAdvanceDays: number },
): Promise<void> {
  const response = await page.request.put('/api/v1/settings/scheduling', { data: values });
  expect(response.status()).toBe(200);
}

/** Always resets to a maximally PERMISSIVE window at the end (Dev Agent Record: a real `sched.*` setting, once written, persists for the rest of the local e2e run — narrowing it here must never leak into any other spec's bookings). */
const PERMISSIVE_SCHEDULING = { openTime: '00:00', closeTime: '23:59', minSlotMinutes: 15, turnaroundMinutes: 0, maxAdvanceDays: 3650 };

const FUTURE_DAY = '2031-03-10'; // winter (CET, UTC+1) — same fixed far-future day as `bookings.spec.ts`'s own `FUTURE_DAY`.

/**
 * Walks the list forward from page 1 until the row matching `filterText`
 * appears — a local copy of `bookings.spec.ts#findBookingRow`, kept file-local
 * like every other helper here, and for the same measured reason: the list is
 * `startsAt asc` from now-48h, 20 per page, so a far-future fixture's page
 * number depends on how many OTHER bookings the run has already created. An
 * out-of-range `?page` is clamped server-side, so this is safe past the end.
 */
async function findBookingRow(page: Page, filterText: string): Promise<ReturnType<Page['getByTestId']>> {
  const MAX_PAGES = 50;
  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    await page.goto(`/it/dashboard/bookings?page=${pageNumber}`);
    await page.waitForLoadState('networkidle');
    const row = page.getByTestId('booking-row').filter({ hasText: filterText });
    if ((await row.count()) > 0) return row;
    const statusLocator = page.getByTestId('booking-pagination-status');
    if ((await statusLocator.count()) === 0) break;
    const totalPages = Number.parseInt(((await statusLocator.textContent()) ?? '').split('/')[1]?.trim() ?? '1', 10);
    if (pageNumber >= totalPages) break;
  }
  throw new Error(`Booking row matching "${filterText}" not found within ${MAX_PAGES} pages of /dashboard/bookings`);
}

test.describe.serial('BOOKING_OUTSIDE_WINDOW (Story 12.11, AC 4, ratifica utente 3)', () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await setScheduling(page, PERMISSIVE_SCHEDULING);
    await page.close();
  });

  // The APPROVE-path re-check (`transitionBooking`'s `PENDING -> APPROVED`)
  // is exhaustively covered at the service-unit-test layer
  // (`bookings.service.test.ts`, "a booking outside the configured
  // scheduling window answers 422 ... on APPROVE") — not duplicated here:
  // reaching it end-to-end needs a genuinely PENDING booking, which only a
  // non-staff (own-path) actor can create, adding real-login machinery for
  // no additional coverage of the window logic itself.
  test('a booking outside the configured openTime-closeTime window answers 422 BOOKING_OUTSIDE_WINDOW on create; one inside the window is accepted', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    // Narrow afternoon-only window: 10:00-11:00 Rome (09:00-10:00Z, winter CET) falls OUTSIDE it.
    await setScheduling(page, { openTime: '14:00', closeTime: '18:00', minSlotMinutes: 60, turnaroundMinutes: 0, maxAdvanceDays: 3650 });

    const outsideResponse = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${FUTURE_DAY}T09:00:00.000Z`, endsAt: `${FUTURE_DAY}T10:00:00.000Z` },
    });
    expect(outsideResponse.status()).toBe(422);
    expect((await outsideResponse.json()).error.code).toBe('BOOKING_OUTSIDE_WINDOW');

    // Within the window: 15:00-16:00 Rome (14:00-15:00Z) is accepted.
    const insideResponse = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${FUTURE_DAY}T14:00:00.000Z`, endsAt: `${FUTURE_DAY}T15:00:00.000Z` },
    });
    expect(insideResponse.status()).toBe(201);
  });

  test('startsAt beyond maxAdvanceDays answers 422 BOOKING_OUTSIDE_WINDOW', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    await setScheduling(page, { openTime: '00:00', closeTime: '23:59', minSlotMinutes: 60, turnaroundMinutes: 0, maxAdvanceDays: 1 });

    const response = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${FUTURE_DAY}T09:00:00.000Z`, endsAt: `${FUTURE_DAY}T10:00:00.000Z` },
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe('BOOKING_OUTSIDE_WINDOW');
  });

  /**
   * Story 15.4, ratifica R-15.4-g. Before this story the 422 above fell
   * through `new-booking-form.tsx`'s `else` into "Impossibile creare la
   * prenotazione. Riprova." — the least actionable message in the app, since
   * retrying an out-of-window slot fails identically. The guard is written on
   * the side the fix LIBERATES: the banner must NAME the window, so it stays
   * red if the branch is deleted (the generic text contains neither bound).
   *
   * It lives in this serialized project because it writes `sched.*` globally
   * (CLAUDE.md, lesson 12.11 F1) — never in the `fullyParallel` one.
   *
   * The MOVE half at the end of this test is the review fix (PO decision
   * 2026-08-03): the window is re-checked on `updateBooking` too, which is what
   * makes the edit panel's own branch reachable at all.
   */
  test('the 422 BOOKING_OUTSIDE_WINDOW banner states the airfield window instead of the generic "Riprova", on create AND on move (story 15.4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);
    await setScheduling(page, { openTime: '14:00', closeTime: '18:00', minSlotMinutes: 60, turnaroundMinutes: 0, maxAdvanceDays: 3650 });

    await page.goto('/it/dashboard/bookings');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    // THIS run's pilot, by id — never `{ index: 1 }`: the shared dev DB is full
    // of people other specs gave expired documents to, and `EXPIRED_DOCUMENTS`
    // would answer first (measured: it did).
    await form.getByLabel('Pilota o allievo').selectOption(pilot.personId);
    // 10:00-11:00 Rome (winter CET) — outside the 14:00-18:00 window above.
    await form.getByLabel('Inizio').fill(`${FUTURE_DAY}T09:00`);
    await form.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T10:00`);
    await form.getByRole('button', { name: 'Prenota' }).click();

    const banner = page.getByTestId('booking-form-error');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('14:00');
    await expect(banner).toContainText('18:00');
    // The pre-fix text, which must NOT be what the user reads any more.
    await expect(banner).not.toContainText('Riprova');

    const insideBooking = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${FUTURE_DAY}T14:00:00.000Z`, endsAt: `${FUTURE_DAY}T15:00:00.000Z` },
    });
    expect(insideBooking.status()).toBe(201);

    // The MOVE path (story 15.4 review, PO decision 2026-08-03). Until then
    // `assertWithinSchedulingWindow` ran on create and on approve only, so this
    // very PATCH answered 200 — a booking could be parked outside the
    // airfield's hours, and `edit-booking-form.tsx`'s own
    // `BOOKING_OUTSIDE_WINDOW` branch (R-15.4-g) was unreachable code. Both
    // halves are asserted here: the API, and the message the user reads.
    const movedBookingId = ((await insideBooking.json()) as { booking: { id: string } }).booking.id;
    const movedOutside = await page.request.patch(`/api/v1/bookings/${movedBookingId}`, {
      data: { startsAt: `${FUTURE_DAY}T09:00:00.000Z`, endsAt: `${FUTURE_DAY}T10:00:00.000Z` },
    });
    expect(movedOutside.status(), await movedOutside.text()).toBe(422);
    expect((await movedOutside.json()).error.code).toBe('BOOKING_OUTSIDE_WINDOW');

    // The 422 above left the booking where it was (14:00-15:00Z, APPROVED), so
    // its row still offers "Modifica": the same move, from the panel.
    const row = await findBookingRow(page, aircraft.registration);
    await row.getByTestId('booking-move-action').click();
    const moveForm = page.getByTestId('move-booking-form');
    await expect(moveForm).toBeVisible();
    // The browser runs on UTC, so these wall-clock values are the SAME instants
    // as the PATCH above: 10:00-11:00 Rome, outside 14:00-18:00.
    await moveForm.getByLabel('Inizio').fill(`${FUTURE_DAY}T09:00`);
    await moveForm.getByLabel('Fine', { exact: true }).fill(`${FUTURE_DAY}T10:00`);
    await page.getByTestId('move-booking-save').click();

    const moveBanner = page.getByTestId('move-booking-form-error');
    await expect(moveBanner).toBeVisible();
    await expect(moveBanner).toContainText('14:00');
    await expect(moveBanner).toContainText('18:00');
    await expect(moveBanner).not.toContainText('Riprova');
  });

  test('a permissive (near-24h) window imposes no practical constraint, confirming the afterAll restore leaves other specs unaffected', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await setScheduling(page, PERMISSIVE_SCHEDULING);

    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);
    const response = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${FUTURE_DAY}T21:00:00.000Z`, endsAt: `${FUTURE_DAY}T22:00:00.000Z` },
    });
    expect(response.status()).toBe(201);
  });
});
