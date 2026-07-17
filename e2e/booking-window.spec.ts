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
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName: 'Orario', lastName: `Booking-${suffix}` } });
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
