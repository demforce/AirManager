import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * `DatePicker`/`DateTimeField` (story 12.5, AC 1/7) — the three scenarios
 * the story's AC 7 asks for explicitly, on top of the ~50 `.fill()` call
 * sites already converted across every other spec: typed valid input still
 * submits (here, the booking form's `DateTimeField` pair — AC 7's "coppia
 * data+ora nel form prenotazione"), a malformed typed date shows a
 * per-field error (`31/02/2026`, AC 1), and a popover day selection commits
 * the same way typing would.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/date-picker.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/** Same aircraft-creation helper as `bookings.spec.ts`. */
async function createAircraft(page: Page): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-DP${suffix}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 50 },
  });
  expect(response.status()).toBe(201);
  const aircraft = (await response.json()) as { id: string };
  return { id: aircraft.id, registration };
}

/** Far enough in the future to never collide with "today" no matter when this suite runs (same value as `bookings.spec.ts`). */
const FUTURE_DAY = '2031-03-11';

/**
 * A slot starting 10 minutes from now, split into the DD/MM/YYYY + HH:MM
 * pair the `DateTimeField` pair expects — mirrors `bookings.spec.ts`'s own
 * `soonestFutureSlot()` and its "avoid `FUTURE_DAY`'s accumulated volume"
 * lesson: "Prossime prenotazioni" is a paginated, ascending-by-date table,
 * and this long-lived, never-reset dev DB accumulates so many near-future
 * bookings across repeated e2e runs that a booking on a fixed far-future
 * day can fall off the visible first page. Local wall-clock (no UTC
 * conversion), matching `composeDateTimeLocalValue`'s own semantics.
 */
function soonestFutureSlotDisplay(): { date: string; startTime: string; endTime: string } {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const start = new Date(Date.now() + 10 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const date = `${pad(start.getDate())}/${pad(start.getMonth() + 1)}/${start.getFullYear()}`;
  const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  return { date, startTime, endTime };
}

test.describe('DatePicker (Story 12.5, AC 1)', () => {
  test('a manually typed valid DD/MM/YYYY date + time submits the booking form (AC 1/7 — DateTimeField pair)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.goto('/it/dashboard/bookings');
    await page.waitForLoadState('networkidle');
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });

    // Typed by hand, DD/MM/YYYY — never the wire's YYYY-MM-DD.
    const slot = soonestFutureSlotDisplay();
    await form.getByLabel('Inizio', { exact: true }).fill(slot.date);
    await form.getByLabel('Ora inizio').fill(slot.startTime);
    await form.getByLabel('Fine', { exact: true }).fill(slot.date);
    await form.getByLabel('Ora fine').fill(slot.endTime);
    await form.getByRole('button', { name: 'Prenota' }).click();

    await expect(page.getByTestId('booking-form-success')).toBeVisible();
    const row = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();
  });

  test('an impossible calendar date (31/02/2026) shows a per-field error with aria-invalid (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/flights');
    await page.getByTestId('flight-open-register').click();
    const form = page.getByTestId('flight-form');
    await expect(form).toBeVisible();

    const dateInput = form.getByLabel('Data volo', { exact: true });
    await dateInput.fill('31/02/2026');

    await expect(dateInput).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByText('Data non valida (usa GG/MM/AAAA).')).toBeVisible();
  });

  test('selecting a day from the calendar popover fills the field (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/flights');
    await page.getByTestId('flight-open-register').click();
    const form = page.getByTestId('flight-form');
    await expect(form).toBeVisible();

    const dateInput = form.getByLabel('Data volo', { exact: true });
    await dateInput.fill(FUTURE_DAY.split('-').reverse().join('/'));

    await form.getByRole('button', { name: 'Apri calendario' }).first().click();
    // Navigate one month forward, then pick day 15 — a fixed, deterministic
    // target regardless of which month the suite happens to run in.
    await form.getByRole('button', { name: 'Mese successivo' }).click();
    await form.getByRole('button', { name: '15', exact: true }).click();

    const [y, m] = FUTURE_DAY.split('-').map(Number);
    const next = new Date(Date.UTC(y, m, 1)); // m is 1-based already -> next month, 0-based Date arg
    const expectedDisplay = `15/${String(next.getUTCMonth() + 1).padStart(2, '0')}/${next.getUTCFullYear()}`;
    await expect(dateInput).toHaveValue(expectedDisplay);
  });
});
