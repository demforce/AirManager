import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test } from '@playwright/test';
import { requireMailTestDatabase } from '../scripts/mail-test-database';

test('admin previews, activates and rolls back verified operational routing in Settings; ordinary user has no access', async ({ page, browser }) => {
  test.skip(process.env.AIRMANAGER_EMAIL_TRIAL !== '1', 'Disposable email-access trial disabled.');
  const db = new Client({ connectionString: requireMailTestDatabase('browser') });
  await db.connect();
  const other = await browser.newPage();
  // The fixture sorts on the first page, independent of the number of other synthetic people.
  const personId = '000-fixture-' + randomUUID();
  const userId = randomUUID();
  const email = userId + '@fixture.invalid';
  const endpoint = '/api/v1/settings/legacy-mail';
  try {
    await db.query('INSERT INTO "Person" (id,"firstName","lastName",email,"updatedAt") VALUES ($1,$2,$3,$4,now())',
      [personId, 'Synthetic', 'Legacy', email.toUpperCase()]);
    await db.query('INSERT INTO "User" (id,email,"personId",roles,"updatedAt") VALUES ($1,$2,$3,ARRAY[\'PILOT\']::"Role"[],now())', [userId,email,personId]);
    await db.query('INSERT INTO "EmailVerification" ("userId",email,"verifiedAt") VALUES ($1,$2,now())',[userId,email]);
    const discovery = await page.request.get('/api/v1/openapi.json');
    expect(discovery.ok()).toBe(true);
    const operations = (await discovery.json()).paths[endpoint];
    expect(operations.get.security).toBeDefined();
    expect(operations.put.responses['409']).toBeDefined();
    expect((await page.request.get(endpoint)).status()).toBe(401);
    await page.goto('/it/login?access=admin&callbackUrl=%2Fit%2Fdashboard%2Fsettings');
    await expect(page.getByRole('heading', { name: 'Accesso amministratori con password' })).toBeVisible();
    await page.getByLabel('Email', { exact: true }).fill('admin@airmanager.local');
    await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_ADMIN_PASSWORD!);
    await page.getByRole('button', { name: 'Accedi', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
    const panel = page.getByRole('region', { name: 'Recapiti degli account' });
    await expect(panel.getByRole('button', { name: 'Usa i recapiti verificati' })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Simula la riconciliazione' }).click();
    const item = panel.getByRole('listitem').filter({ hasText: personId });
    await expect(item.getByRole('link')).toHaveAttribute('href', '/it/dashboard/people/' + personId);
    await expect(item).toContainText('Recapito verificato e univoco');
    await expect(panel).not.toContainText('@');
    // A concurrent routine contact edit makes the displayed preview stale.
    await db.query('UPDATE "Person" SET email=$2 WHERE id=$1', [personId, 'updated-' + email]);
    await panel.getByRole('button', { name: 'Usa i recapiti verificati' }).click();
    await expect(panel.getByRole('status')).toContainText('I dati sono cambiati');
    await panel.getByRole('button', { name: 'Simula la riconciliazione' }).click();
    await expect(item).toContainText('I due recapiti differiscono');
    await panel.getByRole('button', { name: 'Usa i recapiti verificati' }).click();
    await expect(panel.getByText('Uso dei recapiti verificati attivo', { exact: true })).toBeVisible();
    await page.goto('/en/dashboard/settings');
    const english = page.getByRole('region', { name: 'Account email addresses' });
    await english.getByRole('button', { name: 'Preview reconciliation' }).click();
    await english.getByRole('button', { name: 'Restore usual addresses' }).click();
    await expect(english.getByText('Verified address routing off', { exact: true })).toBeVisible();
    expect((await page.request.get('/api/v1/me')).status()).toBe(200);

    await other.goto('/it/login');
    await other.getByLabel('Email', { exact: true }).fill('pilot@airmanager.local');
    await other.getByLabel('Password', { exact: true }).fill(process.env.SEED_ADMIN_PASSWORD!);
    await other.getByRole('button', { name: 'Accedi', exact: true }).click();
    await expect(other).toHaveURL(/\/dashboard$/);
    expect((await other.request.get(endpoint)).status()).toBe(403);
    expect((await other.request.put(endpoint, { data: { enabled: true, revision: '0'.repeat(64) } })).status()).toBe(403);
  } finally {
    await db.query('DELETE FROM "AppSetting" WHERE key=$1', ['mail.legacyRouting']);
    await db.query('DELETE FROM "User" WHERE id=$1', [userId]);
    await db.query('DELETE FROM "Person" WHERE id=$1', [personId]);
    await Promise.all([db.end(), other.close()]);
  }
});
