import { expect, test } from '@playwright/test';

// The pre-epic-12 public splash is gone (user decision 2026-07-21): the root
// now redirects straight into the app — `/{locale}` → `/{locale}/dashboard`,
// which bounces an anonymous visitor to the localized login (with a
// `callbackUrl` back to the dashboard). The old locale-switch link lived on
// the splash and has no replacement on the login page — switching locale is
// a URL concern now.

test('redirects "/" to the default-locale login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/it\/login\?callbackUrl=/);
});

test('serves the localized login on /it', async ({ page }) => {
  await page.goto('/it');
  await expect(page).toHaveURL(/\/it\/login/);
  await expect(page.getByRole('heading', { name: 'Accedi ad AirManager' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accedi' })).toBeVisible();
});

test('serves the localized login on /en', async ({ page }) => {
  await page.goto('/en');
  await expect(page).toHaveURL(/\/en\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in to AirManager' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
