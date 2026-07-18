import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/rbac.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example) — migrate + seed the DB first.');
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

test.describe('RBAC (Story 1.3 AC 1, 2, 3)', () => {
  test('GET /api/v1/me returns the caller’s own data for an authenticated session', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    const response = await page.request.get('/api/v1/me');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      email: ADMIN_EMAIL,
      roles: ['ADMIN'],
      person: { firstName: 'Admin', lastName: 'AirManager' },
    });
  });

  test('admin dashboard navigation shows every operational area (AirOps sidebar, story 12.12 AC 7)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    // Story 12.12: the legacy in-page "Aree operative" nav died with the
    // widget-grid home — the ONE nav landmark left is the AirOps Sidebar
    // (same accessible name, `sidebar.tsx`'s `navLabel` prop).
    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(nav.getByRole('link', { name: 'Piloti', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Contabilità', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Impostazioni', exact: true })).toBeVisible();
  });

  test('pilot dashboard navigation only shows self-service areas (AC 2)', async ({ page }) => {
    await login(page, PILOT_EMAIL);

    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(nav.getByRole('link', { name: 'Pianificazione', exact: true })).toBeVisible();

    // A pilot has no `people.read`/`settings.manage`/`finance.manage` —
    // those areas must be absent, not merely disabled (AD-5: navigation
    // hides, never the only guardian, but it must still be correct).
    await expect(nav.getByRole('link', { name: 'Piloti', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Impostazioni', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Contabilità', exact: true })).toHaveCount(0);
  });
});
