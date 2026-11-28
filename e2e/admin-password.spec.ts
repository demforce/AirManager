import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { requireMailTestDatabase } from '../scripts/mail-test-database';
import { hashPassword } from '../src/server/auth/password';

const heading = 'Accesso amministratori con password';

async function enterPassword(page: Page, email: string, password: string, admin = true) {
  await page.goto('/it/login');
  if (admin) {
    await page.getByRole('link', { name: heading, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
}

test('admin password from a signed-out browser saves a pilot in the registry', { tag: '@email-trial' }, async ({ page }) => {
  await enterPassword(page, 'admin@airmanager.local', process.env.SEED_ADMIN_PASSWORD!);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await page.goto('/it/dashboard/pilots');
  await page.getByTestId('pilots-new-button').click();
  const lastName = 'Fallback-' + randomUUID();
  const form = page.getByTestId('pilot-identity-form');
  await form.getByLabel('Nome', { exact: true }).fill('Fixture');
  await form.getByLabel('Cognome', { exact: true }).fill(lastName);
  await form.getByTestId('pilot-identity-submit').click();
  await expect(page.getByTestId('toast')).toContainText('Pilota creato');
  await page.goto('/it/dashboard/pilots?q=' + lastName);
  await expect(page.locator('[data-testid^="pilot-row-"]').filter({ hasText: lastName })).toBeVisible();
});

test('the administrator entry keeps its method and return path across languages', { tag: '@email-trial' }, async ({ page }) => {
  await page.goto('/it/login?callbackUrl=%2Fit%2Fdashboard%2Fpilots');
  await page.getByRole('link', { name: heading, exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/it/login' && url.searchParams.get('access') === 'admin'
    && url.searchParams.get('callbackUrl') === '/it/dashboard/pilots');
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await page.getByTestId('auth-locale-switch').click();
  await expect(page.getByRole('heading', { name: 'Administrator password sign-in' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe('/en/dashboard/pilots');
  await page.getByRole('link', { name: 'Back to standard sign-in' }).click();
  await expect(page).toHaveURL(url => url.pathname === '/en/login' && !url.searchParams.has('access')
    && url.searchParams.get('callbackUrl') === '/en/dashboard/pilots');
});

for (const change of ['demote', 'deactivate', 'reset'] as const) {
  test(`admin password session ends on the first protected request after ${change}`, { tag: '@email-trial' }, async ({ page, browser }) => {
    const db = new Client({ connectionString: requireMailTestDatabase('browser') });
    const manager = await browser.newPage();
    const id = randomUUID();
    const email = id + '@fixture.invalid';
    const password = randomUUID();
    await db.connect();
    try {
      await db.query(`INSERT INTO "User" (id,email,"passwordHash",roles,"updatedAt")
        VALUES ($1,$2,$3,ARRAY['ADMIN']::"Role"[],now())`, [id, email, await hashPassword(password)]);
      await enterPassword(page, email, password);
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
      if (change === 'reset') {
        // The reset service advances tokenVersion in the same write as the hash.
        // Use an ordinary reset token fixture on this disposable DB, then the public endpoint.
        const token = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        await db.query(`INSERT INTO "AuthToken" (id,"userId",type,"tokenHash","expiresAt")
          VALUES ($1,$2,'PASSWORD_RESET',$3,now() + interval '5 minutes')`, [randomUUID(), id, tokenHash]);
        const reset = await manager.request.post('/api/v1/auth/set-password', { data: { token, password: randomUUID() } });
        expect(reset.ok()).toBe(true);
      } else {
        await enterPassword(manager, 'admin@airmanager.local', process.env.SEED_ADMIN_PASSWORD!, false);
        await expect(manager).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
        const patch = change === 'demote' ? { roles: ['PILOT'] } : { isActive: false };
        expect((await manager.request.patch('/api/v1/users/' + id, { data: patch })).ok()).toBe(true);
      }
      expect((await page.request.get('/api/v1/me')).status()).toBe(401);
      const fresh = await browser.newPage();
      try {
        await enterPassword(fresh, email, password);
        await expect(fresh.getByTestId('login-error')).toHaveText('Email o password non corretti.');
        expect((await fresh.request.get('/api/v1/me')).status()).toBe(401);
        if (change === 'demote') {
          await enterPassword(fresh, email, password, false);
          await expect(fresh).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
        }
      } finally {
        await fresh.close();
      }
      if (change !== 'reset') {
        const restore = await manager.request.patch('/api/v1/users/' + id, { data: { roles: ['ADMIN'], isActive: true } });
        expect(restore.status()).toBe(change === 'deactivate' && process.env.AIRMANAGER_EMAIL_TRIAL === '1' ? 409 : 200);
        expect((await page.request.get('/api/v1/me')).status()).toBe(401);
      }
    } finally {
      await manager.close();
      try {
        await db.query('DELETE FROM "AuthToken" WHERE "userId"=$1', [id]);
        await db.query('DELETE FROM "User" WHERE id=$1', [id]);
      } finally {
        await db.end();
      }
    }
  });
}
