import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Desktop-like app shell (story 12.2, FR-48): a persistent sidebar/topbar
 * living in `dashboard/layout.tsx`, so navigating between dashboard
 * sections never re-renders them. The four scenarios below are the closed
 * list from the story's AC 7 — everything else (active-item highlighting,
 * independent scroll, the loading skeleton, the narrow-viewport fallback)
 * is verified visually, not here (Dev Notes).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/app-shell.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

test.describe('Desktop app shell (story 12.2)', () => {
  test('the sidebar is present and role-gated from a sub-page, not only the home', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await page.goto('/it/dashboard/bookings');

    // Scoped to the nav landmark (suite convention, see rbac.spec.ts) —
    // same "Aree operative" landmark, now living in the sidebar.
    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(nav.getByRole('link', { name: 'Prenotazioni' })).toBeVisible();
    // A pilot has neither `people.read` nor `settings.manage` — those
    // sections must be absent from the sidebar on a sub-page too.
    await expect(nav.getByRole('link', { name: 'Persone' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Impostazioni' })).toHaveCount(0);
  });

  test('navigating between two sections via the sidebar swaps the content without losing the sidebar', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await nav.getByRole('link', { name: 'Persone', exact: true }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/people$/);

    await nav.getByRole('link', { name: 'Velivoli', exact: true }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/aircraft$/);
    // The landmark still resolves and is still gated the same way — the
    // shell wasn't torn down and rebuilt by the second navigation.
    await expect(nav.getByRole('link', { name: 'Persone', exact: true })).toBeVisible();
  });

  test('logout from the topbar works from a sub-page, not only the home', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/aircraft');

    await page.getByRole('button', { name: 'Esci' }).click();
    await expect(page).toHaveURL(/\/it\/login$/);
  });

  test('the language switcher preserves the current route', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/people');

    // Scoped to the topbar's `banner` landmark — the app's only `<header>`.
    await page.getByRole('banner').getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/en\/dashboard\/people$/);
  });
});
