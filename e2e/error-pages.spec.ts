import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Story 19.12b (AD-4, PO Q-19.12-d): an address no route claims answers a 404
 * in the locale of its prefix, with the AirOps card and a link to the
 * Panoramica, instead of Next's English default. `/ppr` (removed by story
 * 19.1, still public so an anonymous visitor gets a 404 and not the login
 * page) stays a 404: only the language changes.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/error-pages.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example) — migrate + seed the DB first.');
}

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

async function expectNotFound(page: Page, path: string, copy: { title: string; text: string; home: string }): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), `${path} answers 404`).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
  await expect(page.getByTestId('error-page')).toContainText(copy.text);
  await expect(page.getByTestId('error-page-home')).toHaveText(copy.home);
}

const IT = { title: 'Pagina non trovata', text: "L'indirizzo che hai aperto non esiste o non è più disponibile.", home: 'Vai alla Panoramica' };
const EN = { title: 'Page not found', text: 'The address you opened does not exist or is no longer available.', home: 'Go to the overview' };

test.describe('Localized 404 (story 19.12b, AC 19)', () => {
  test('anonymous: /it/ppr and /en/ppr are a 404 in their own language, and the link leads to the login through the Panoramica', async ({ page }) => {
    await expectNotFound(page, '/it/ppr', IT);
    await expectNotFound(page, '/en/ppr', EN);

    await page.getByTestId('error-page-home').click();
    await expect(page).toHaveURL(/\/en\/login\?callbackUrl=%2Fen%2Fdashboard$/);
  });

  test('signed in: an unknown address, also under /dashboard, is the Italian 404 and the link opens the Panoramica; existing routes are untouched', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await expectNotFound(page, '/it/una-pagina-che-non-esiste', IT);
    await expectNotFound(page, '/it/dashboard/una-pagina-che-non-esiste', IT);
    await expectNotFound(page, '/it/ppr', IT);
    await expectNotFound(page, '/en/a-page-that-does-not-exist', EN);

    await page.goto('/it/ppr');
    await page.getByTestId('error-page-home').click();
    await expect(page).toHaveURL(/\/it\/dashboard$/);
    await expect(page.getByTestId('error-page')).toHaveCount(0);

    // The catch-all is the least specific route: a real page and an API route still answer.
    for (const path of ['/it/dashboard/fleet', '/en/dashboard/logbook']) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} still answers 200`).toBe(200);
      await expect(page.getByTestId('error-page')).toHaveCount(0);
    }
    expect((await page.request.get('/api/v1/health')).status()).toBe(200);
  });
});
