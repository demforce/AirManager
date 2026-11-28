import { expect, test } from '@playwright/test';

test('admin pauses and resumes sign-in emails from Settings using the personal fallback', async ({ page }) => {
  await page.goto('/it/login');
  await page.getByRole('link', { name: 'Accesso amministratori con password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Accesso amministratori con password', exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('admin@airmanager.local');
  await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
  await page.goto('/it/dashboard/settings');
  const controls = page.getByRole('region', { name: 'Sicurezza degli accessi' });
  const policy = '/api/v1/settings/access-security';
  const original = await (await page.request.get(policy)).json();
  const pause = controls.getByRole('button', { name: 'Sospendi invii dei link di accesso' });
  const resume = controls.getByRole('button', { name: 'Riprendi invii dei link di accesso' });
  try {
    await (original.paused ? resume : pause).click();
    await expect(original.paused ? pause : resume).toBeVisible();
    expect((await (await page.request.get(policy)).json()).paused).toBe(!original.paused);
    await page.reload();
    await (original.paused ? pause : resume).click();
    await expect(original.paused ? resume : pause).toBeVisible();
    expect((await (await page.request.get(policy)).json()).paused).toBe(original.paused);
    await page.goto('/en/dashboard/settings');
    await expect(page.getByRole('region', { name: 'Sign-in security' })
      .getByRole('button', { name: original.paused ? 'Resume sign-in emails' : 'Pause sign-in emails' })).toBeVisible();
  } finally {
    expect((await page.request.put(policy, { data: { paused: original.paused } })).ok()).toBe(true);
  }
});
