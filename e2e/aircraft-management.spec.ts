import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/aircraft-management.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Login that must succeed: waits for the dashboard redirect so the session
 * cookie is in place before the test navigates elsewhere. `admin` also holds
 * `aircraft.manage` (ADMIN gets every permission, story 1.3), so it exercises
 * the same staff-only perimeter the story's AC 1/2 describe. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueAircraft(prefix: string): { registration: string; type: string; model: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    registration: `I-${prefix}${suffix}`.toUpperCase().slice(0, 20),
    type: 'Ultraleggero 3 assi',
    model: `Test Model ${suffix}`,
  };
}

async function createAircraft(
  page: Page,
  aircraft: { registration: string; type: string; model: string },
): Promise<void> {
  await page.goto('/it/dashboard/aircraft');
  await page.getByRole('button', { name: 'Nuovo velivolo' }).click();
  await page.getByLabel('Marche', { exact: true }).fill(aircraft.registration);
  await page.getByLabel('Tipo', { exact: true }).fill(aircraft.type);
  await page.getByLabel('Modello', { exact: true }).fill(aircraft.model);
  await page.getByLabel('Contaore (minuti)').fill('750');
  await page.getByRole('button', { name: 'Crea velivolo' }).click();
  await expect(page.getByTestId('aircraft-feedback')).toBeVisible();
}

test.describe('Aircraft fleet CRUD with archiving (Story 2.4)', () => {
  test('staff/admin creates an aircraft, which appears in the paginated searchable list (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('AAA');

    await createAircraft(page, aircraft);

    const row = page.getByRole('row', { name: new RegExp(aircraft.registration) });
    await expect(row).toBeVisible();
    await expect(row.getByText('Attivo', { exact: true })).toBeVisible();
    // The hour meter column shows the H:MM presentation of the 750 minutes typed above.
    await expect(row.getByText('12:30')).toBeVisible();
  });

  test('duplicate registration is rejected with a 409/conflict message (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('BBB');
    await createAircraft(page, aircraft);

    await page.goto('/it/dashboard/aircraft');
    await page.getByRole('button', { name: 'Nuovo velivolo' }).click();
    await page.getByLabel('Marche', { exact: true }).fill(aircraft.registration);
    await page.getByLabel('Tipo', { exact: true }).fill('Altro tipo');
    await page.getByLabel('Modello', { exact: true }).fill('Altro modello');
    await page.getByLabel('Contaore (minuti)').fill('0');
    await page.getByRole('button', { name: 'Crea velivolo' }).click();

    await expect(page.getByTestId('aircraft-form-error')).toHaveText('Esiste già un velivolo con queste marche.');
  });

  test('archiving an aircraft removes it from the default list and shows it with the archived filter (AC 2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('CCC');
    await createAircraft(page, aircraft);

    const row = page.getByRole('row', { name: new RegExp(aircraft.registration) });
    await row.getByRole('button', { name: 'Archivia' }).click();
    await row.getByRole('button', { name: 'Conferma' }).click();
    // TD-9: the feedback toast proves the archive POST RESOLVED (so a reload
    // can't abort the in-flight fetch — the risk the old comment guarded
    // against), while the row's disappearance depends on a completion-less
    // `router.refresh()` whose landing time is unbounded under parallel
    // CI-mode load. Reload, then assert the durable outcome.
    await expect(page.getByTestId('aircraft-feedback')).toBeVisible();
    await page.reload();
    await expect(row).toHaveCount(0);

    // Fresh navigation: still gone from the default list.
    await page.goto('/it/dashboard/aircraft');
    await expect(page.getByRole('row', { name: new RegExp(aircraft.registration) })).toHaveCount(0);

    // With the archived filter: still there, and shown as archived.
    await page.getByLabel('Includi archiviati').check();
    const archivedRow = page.getByRole('row', { name: new RegExp(aircraft.registration) });
    await expect(archivedRow).toBeVisible();
    await expect(archivedRow.getByText('Archiviato')).toBeVisible();

    // Restoring: the row stays visible under "include archived", just with
    // the status flipped back to active.
    await archivedRow.getByRole('button', { name: 'Ripristina' }).click();
    await archivedRow.getByRole('button', { name: 'Conferma' }).click();
    await expect(archivedRow.getByText('Attivo', { exact: true })).toBeVisible();

    await page.getByLabel('Includi archiviati').uncheck();
    await expect(page.getByRole('row', { name: new RegExp(aircraft.registration) })).toBeVisible();
  });

  test('a pilot (without aircraft.manage) is redirected away from /dashboard/aircraft (AD-5, AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.goto('/it/dashboard/aircraft');
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });

  test('a pilot gets a 403 AD-8 envelope from GET /api/v1/aircraft directly (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.get('/api/v1/aircraft');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('GET /api/v1/aircraft returns the AD-8 401 envelope without a session', async ({ request }) => {
    const response = await request.get('/api/v1/aircraft');
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });
});
