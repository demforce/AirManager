import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const ADMIN_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!ADMIN_PASSWORD) {
  throw new Error('e2e/login.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example) — migrate + seed the DB first.');
}

test.describe('login (AC 1, 2, 3)', () => {
  test('logs in with correct credentials and reaches the dashboard', async ({ page }) => {
    await page.goto('/it/login');

    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Accedi' }).click();

    await expect(page).toHaveURL(/\/it\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Bentornato, Admin AirManager' })).toBeVisible();
  });

  test('shows a generic error for wrong credentials, without revealing which field was wrong', async ({
    page,
  }) => {
    await page.goto('/it/login');

    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: 'Accedi' }).click();

    await expect(page.getByTestId('login-error')).toHaveText('Email o password non corretti.');
    await expect(page).toHaveURL(/\/it\/login$/);
  });

  test('shows the same generic error for a non-existent user', async ({ page }) => {
    await page.goto('/it/login');

    await page.getByLabel('Email').fill('nobody@airmanager.local');
    await page.getByLabel('Password').fill('whatever-password');
    await page.getByRole('button', { name: 'Accedi' }).click();

    await expect(page.getByTestId('login-error')).toHaveText('Email o password non corretti.');
  });

  test('redirects an unauthenticated request for a protected web route to the localized login page', async ({
    page,
  }) => {
    await page.goto('/it/dashboard');

    await expect(page).toHaveURL(/\/it\/login\?callbackUrl=/);
  });

  test('returns the AD-8 401 envelope for an unauthenticated protected /api/v1/* request', async ({ request }) => {
    const response = await request.get('/api/v1/flights');

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });

  test('lets an unauthenticated request through to the public /api/v1/health endpoint', async ({ request }) => {
    const response = await request.get('/api/v1/health');

    expect(response.status()).toBe(200);
  });

  test('logs out and returns to the login page, invalidating the session', async ({ page }) => {
    await page.goto('/it/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard$/);

    await page.getByRole('button', { name: 'Esci' }).click();

    await expect(page).toHaveURL(/\/it\/login$/);

    // The session cookie must actually be gone, not just a client-side redirect.
    await page.goto('/it/dashboard');
    await expect(page).toHaveURL(/\/it\/login\?callbackUrl=/);
  });
});
