import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Shell trasversali (story 13.8): the IT/EN language switcher (AC 1) and
 * the sidebar "Aeromobili" (fleet) icon (AC 2). Both are pure shell chrome
 * (no fixtures/DB writes) — kept in their own file rather than folded into
 * an existing spec, same "topic-scoped file" convention as `reports.spec.ts`.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/shell-misc.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example) — migrate + seed the DB first.');
}

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

test.describe('Top bar — language switcher (story 13.8, AC 1)', () => {
  test('the IT/EN chip toggles the locale while PRESERVING the current pathname, round-trip', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.goto('/it/dashboard/pilots');
    const chip = page.getByTestId('locale-switch');
    await expect(chip).toHaveText('EN');
    await expect(chip).toHaveAttribute('title', 'Cambia lingua');

    await chip.click();
    await expect(page).toHaveURL(/\/en\/dashboard\/pilots$/);
    // The rest of the shell actually re-renders in English (not just the URL).
    await expect(page.getByRole('heading', { name: 'Pilots' })).toBeVisible();

    const chipAfter = page.getByTestId('locale-switch');
    await expect(chipAfter).toHaveText('IT');
    await expect(chipAfter).toHaveAttribute('title', 'Change language');

    await chipAfter.click();
    await expect(page).toHaveURL(/\/it\/dashboard\/pilots$/);
    await expect(page.getByRole('heading', { name: 'Piloti' })).toBeVisible();
  });

  test('preserves the query string (view/date filters) across a locale switch, round-trip (review F1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.goto('/it/dashboard/bookings?view=week&date=2026-08-05');
    await page.getByTestId('locale-switch').click();
    await expect(page).toHaveURL(/\/en\/dashboard\/bookings\?view=week&date=2026-08-05$/);

    await page.getByTestId('locale-switch').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/bookings\?view=week&date=2026-08-05$/);
  });
});

test.describe('Sidebar — fleet icon (story 13.8, AC 2)', () => {
  test('"Aeromobili" (fleet) renders the SAME small-plane icon as "Voli in transito" (movements)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    const fleetSvg = await nav.locator('a[href="/it/dashboard/fleet"] svg').innerHTML();
    const visitingSvg = await nav.locator('a[href="/it/dashboard/movements"] svg').innerHTML();
    const pilotsSvg = await nav.locator('a[href="/it/dashboard/pilots"] svg').innerHTML();

    expect(fleetSvg).toBeTruthy();
    expect(fleetSvg).toBe(visitingSvg);
    // Sanity check against a false positive (both empty/undefined): fleet's icon must differ from an unrelated nav item's.
    expect(fleetSvg).not.toBe(pilotsSvg);
  });
});
