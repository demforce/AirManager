import { expect, test } from '@playwright/test';

test('redirects "/" to the default locale ("/it")', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/it$/);
});

test('serves a localized welcome page on /it', async ({ page }) => {
  await page.goto('/it');
  await expect(page).toHaveTitle('AirManager');
  await expect(page.getByRole('heading', { level: 1, name: 'AirManager' })).toBeVisible();
  await expect(page.getByText('Gestionale aviosuperficie')).toBeVisible();
});

test('serves a localized welcome page on /en', async ({ page }) => {
  await page.goto('/en');
  await expect(page).toHaveTitle('AirManager');
  await expect(page.getByRole('heading', { level: 1, name: 'AirManager' })).toBeVisible();
  await expect(page.getByText('Airfield management')).toBeVisible();
});

test('switches locale from /it to /en via the language link', async ({ page }) => {
  await page.goto('/it');
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByText('Airfield management')).toBeVisible();
});
