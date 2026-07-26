import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Story TD-7 (`CalendarPopover` extended with a date+time mode, `DateInput`/
 * `DateTimeInput` popover now `position:fixed` + portaled to `document.body`):
 * these tests drive the picker's own UI (click the calendar button, click a
 * day, type an hour, click confirm) rather than `fill()`-ing the underlying
 * input directly — the existing specs that DO `fill()` (`bookings.spec.ts`,
 * `ppr-public.spec.ts`) are the regression guard for the transparent-wrapper
 * contract and are expected to keep passing unchanged.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/datetime-picker.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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
  const registration = `I-DT${suffix}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 50 },
  });
  expect(response.status()).toBe(201);
  const aircraft = (await response.json()) as { id: string };
  return { id: aircraft.id, registration };
}

async function createPilotPerson(page: Page): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Picker';
  const lastName = `Datetime-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  return { personId: person.id, firstName, lastName };
}

/** `YYYY-MM-DD` for `day` of the month `monthsForward` months from now (local time — matches the picker's own local `Date` math). Choosing a day 2+ months out keeps the target always in the future regardless of today's date, without needing to compute month-length edge cases. */
function futureDateOnly(monthsForward: number, day: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthsForward, day);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}

/**
 * Drives `DateTimeInput`'s picker UI end-to-end — never `fill()` on the
 * underlying input: opens the popover via its calendar button, steps the
 * month cursor forward `monthsForward` times, clicks the exact in-month day
 * cell (anchored regex, never a bare `hasText` substring match — Dev Notes
 * lesson), types the `HH:MM` time, and clicks the confirm action. The
 * popover is portaled to `document.body` (story TD-7 clipping fix), so it's
 * looked up globally on `page`, not as a descendant of `fieldWrapper`.
 */
async function pickDateTimeViaPicker(fieldWrapper: Locator, monthsForward: number, day: number, time: string): Promise<void> {
  const page = fieldWrapper.page();
  await fieldWrapper.getByRole('button', { name: 'Apri calendario' }).click();
  const popover = page.locator('.cal-popover');
  await expect(popover).toBeVisible();
  for (let i = 0; i < monthsForward; i++) {
    await popover.locator('.cal-head .iconbtn').last().click();
  }
  await popover.locator('.cal-grid .cal-cell:not(.out)', { hasText: new RegExp(`^${day}$`) }).click();
  await popover.locator('.fld input[type="text"]').fill(time);
  await popover.locator('.cal-foot .btn.primary').click();
  await expect(popover).toHaveCount(0);
}

/** Same technique as `bookings.spec.ts#hitTestsOwnControl` (review 13.7 F2): scrolls ONLY the popover's own internal scrollbox (a no-op if it doesn't need one) before hit-testing — the discriminator a plain `.click()` cannot provide, since Playwright's own `scrollIntoViewIfNeeded` would mask a still-clipped popover. */
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

test.describe('TD-7: CalendarPopover date+time picker', () => {
  test('authenticated: creates a booking entirely via the picker UI (calendar button -> day -> time -> confirm) for both Inizio and Fine — 201', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPilotPerson(page);

    await page.goto('/it/dashboard/bookings');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    await form.getByLabel('Velivolo').selectOption({ label: aircraft.registration });
    await form.getByLabel('Pilota o allievo').selectOption({ label: `${pilot.lastName} ${pilot.firstName}` });

    const startsAtWrapper = form.locator('span.date-input:has(input[name="startsAt"])');
    const endsAtWrapper = form.locator('span.date-input:has(input[name="endsAt"])');
    await pickDateTimeViaPicker(startsAtWrapper, 2, 15, '09:15');
    await pickDateTimeViaPicker(endsAtWrapper, 2, 15, '10:15');

    const expectedDay = futureDateOnly(2, 15);
    await expect(form.locator('input[name="startsAt"]')).toHaveValue(`${expectedDay}T09:15`);
    await expect(form.locator('input[name="endsAt"]')).toHaveValue(`${expectedDay}T10:15`);

    await form.getByRole('button', { name: 'Prenota' }).click();
    await expect(page.getByTestId('booking-form-success')).toBeVisible();
  });

  test('public /ppr: ETA driven entirely via the picker UI, every other field via fill() — real submission succeeds', async ({ page }) => {
    await page.goto('/it/ppr');
    const form = page.getByTestId('ppr-form');
    await form.getByLabel('Nome', { exact: true }).fill('Picker');
    await form.getByLabel('Cognome', { exact: true }).fill(`Test-${uniqueSuffix()}`);
    await form.getByLabel('Email', { exact: true }).fill(`ppr-picker-${uniqueSuffix()}@e2e.airmanager.local`);
    await form.getByLabel('Telefono', { exact: true }).fill('+39 333 0000000');
    await form.getByLabel('Marche', { exact: true }).fill(`I-PK${uniqueSuffix().slice(-6).toUpperCase()}`);
    await form.getByLabel('Tipo aeromobile', { exact: true }).fill('Cessna 172');
    await form.getByLabel('Provenienza', { exact: true }).fill('LIRN Napoli');
    await form.getByLabel('Destinazione', { exact: true }).fill('LIRU Urbe');
    await form.getByLabel('Persone a bordo', { exact: true }).fill('1');

    const etaWrapper = form.locator('span.date-input:has(input[name="eta"])');
    await pickDateTimeViaPicker(etaWrapper, 2, 20, '08:00');
    const expectedDay = futureDateOnly(2, 20);
    await expect(form.locator('input[name="eta"]')).toHaveValue(`${expectedDay}T08:00`);

    await form.getByRole('button', { name: 'Invia richiesta' }).click();
    await expect(page.getByTestId('ppr-success')).toBeVisible();
  });

  test('ratifica 3: picking a day with the time field still empty never writes a value — confirm stays disabled', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await createAircraft(page);
    await page.goto('/it/dashboard/bookings');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    const startsAtWrapper = form.locator('span.date-input:has(input[name="startsAt"])');

    await startsAtWrapper.getByRole('button', { name: 'Apri calendario' }).click();
    const popover = page.locator('.cal-popover');
    await popover.locator('.cal-head .iconbtn').last().click();
    await popover.locator('.cal-grid .cal-cell:not(.out)', { hasText: /^12$/ }).click();

    await expect(popover.locator('.cal-foot .btn.primary')).toBeDisabled();
    await expect(form.locator('input[name="startsAt"]')).toHaveValue('');
  });

  test('clipping regression guard: the SlideOver popover escapes .so-body\'s clip (portaled to document.body, position:fixed) and its confirm control is genuinely hit-testable', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/bookings');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('new-booking-button').click();
    const form = page.getByTestId('new-booking-form');
    const startsAtWrapper = form.locator('span.date-input:has(input[name="startsAt"])');
    await startsAtWrapper.getByRole('button', { name: 'Apri calendario' }).click();

    const geometry = await page.evaluate(() => {
      const soBody = document.querySelector('.so-body');
      const popover = document.querySelector('.cal-popover');
      if (!soBody || !popover) return null;
      return {
        position: getComputedStyle(popover).position,
        isPortaledToBody: popover.parentElement === document.body,
      };
    });
    expect(geometry?.position).toBe('fixed');
    expect(geometry?.isPortaledToBody).toBe(true);
    expect(await hitTestsOwnControl(page, '.cal-popover', '.cal-foot .btn.primary')).toBe(true);
  });

  test('mobile 375px: the public /ppr ETD field and its popover both stay inside the viewport (13.10-F3 regression twin)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/it/ppr');
    const form = page.getByTestId('ppr-form');
    const etdWrapper = form.locator('span.date-input:has(input[name="etd"])');

    const fieldBox = await etdWrapper.boundingBox();
    if (!fieldBox) throw new Error('Missing bounding box for the /ppr ETD field wrapper');
    expect(fieldBox.x).toBeGreaterThanOrEqual(0);
    expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(375);

    await etdWrapper.getByRole('button', { name: 'Apri calendario' }).click();
    const popoverGeometry = await page.evaluate(() => {
      const popover = document.querySelector('.cal-popover');
      const rect = popover?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right } : null;
    });
    expect(popoverGeometry?.left).toBeGreaterThanOrEqual(0);
    expect(popoverGeometry?.right).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await hitTestsOwnControl(page, '.cal-popover', '.cal-foot .btn.primary')).toBe(true);
  });
});
