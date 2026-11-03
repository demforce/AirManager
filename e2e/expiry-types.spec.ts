import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/expiry-types.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Run-unique expiry-type name (same pattern as `uniquePackageName` in `package-types.spec.ts`, for the dirty DB). */
function uniqueTypeName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The ONE `PATCH /api/v1/settings` a click on the Salva sends. This spec runs
 * in the PARALLEL `chromium` project, outside the serialized chain of the
 * specs that write global AppSettings — legitimately only because the page
 * sends the blocks the user touched and nothing else (story 19.8, D-3): every
 * save here asserts that the body is `expiryTypes` ALONE (AC 20).
 */
async function saveOnlyExpiryTypes(page: Page): Promise<{ create?: Record<string, unknown>[]; update?: Record<string, unknown>[]; delete?: string[] }> {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/v1/settings') && r.request().method() === 'PATCH'),
    page.getByTestId('settings-save').click(),
  ]);
  expect(response.status()).toBe(200);
  const body = response.request().postDataJSON() as Record<string, unknown>;
  expect(Object.keys(body)).toEqual(['expiryTypes']);
  return body['expiryTypes'] as { create?: Record<string, unknown>[]; update?: Record<string, unknown>[]; delete?: string[] };
}

/** Same hydration hardening as `settings.spec.ts#gotoSettingsAndWaitForHydration`. */
async function gotoSettings(page: Page): Promise<void> {
  await page.goto('/it/dashboard/settings');
  await page.waitForLoadState('networkidle');
}

/**
 * Expiry-type catalogue (Story 6.1, AC 1/2, FR-35) — story 12.11 AC 2/3
 * moved it from the removed `/dashboard/expiries/types` page into
 * Impostazioni; story 13.1 (AC 3, R-13.1-a) split it into TWO cards —
 * "Ratings" (`kind=RATING`) and "Visite mediche" (`kind=MEDICAL`), both
 * backed by the SAME `ratings-card.tsx` component; story 19.8 (R-19-m) made
 * both lists drafts written by the page's single Salva.
 */
test.describe('Expiry-type catalogue, now on Impostazioni (Story 6.1 AC 1/2; Story 12.11 AC 2/3; Story 13.1 AC 3; Story 19.8 AC 14/15/20)', () => {
  test('admin sees the seeded standard types split RATING/MEDICAL across the two cards, creates a custom rating, edits/deactivates/deletes it — all in draft until the Salva', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await gotoSettings(page);
    const ratingsCard = page.getByTestId('ratings-settings-card');
    await expect(ratingsCard).toBeVisible();
    const medicalCard = page.getByTestId('medical-settings-card');
    await expect(medicalCard).toBeVisible();

    // Story 13.1 (R-13.1-a): the medical-visit standard types live in the
    // "Visite mediche" card, NOT "Ratings". Story 19.8 (R-19-j): a visit has
    // no scope — no "Ambito" column, no "Tutti" on its row.
    const medicalClass2Row = page.getByTestId('medical-row').filter({ hasText: 'Visita medica classe 2' });
    await expect(medicalClass2Row).toContainText('Attiva');
    await expect(medicalClass2Row).not.toContainText('Tutti');
    await expect(medicalCard.locator('.student-row.header')).not.toContainText('Ambito');
    await expect(page.getByTestId('rating-row').filter({ hasText: 'Visita medica' })).toHaveCount(0);

    // Story 19.7a (R-19-k, D-1): the membership fee is its own kind — in NEITHER card.
    await expect(page.getByTestId('rating-row').filter({ hasText: 'Quota associativa' })).toHaveCount(0);
    await expect(page.getByTestId('medical-row').filter({ hasText: 'Quota associativa' })).toHaveCount(0);

    // AC 2 (6.1): a custom type, scope "Tutti", WITH a validity in months.
    const name = uniqueTypeName('Assicurazione volo');
    await ratingsCard.getByTestId('ratings-add-button').click();
    await expect(page.getByTestId('rating-name-input')).toBeFocused();
    await page.getByTestId('rating-name-input').fill(name);
    await page.getByTestId('rating-scope-select').selectOption('ALL');
    await page.getByTestId('rating-validity-input').fill('24');
    await page.getByTestId('rating-form-close').click();

    const row = page.getByTestId('rating-row').filter({ hasText: name });
    await expect(row).toHaveAttribute('data-state', 'new');
    await expect(row).toContainText('Nuova');
    const created = await saveOnlyExpiryTypes(page);
    expect(created).toEqual({ create: [{ name, kind: 'RATING', scope: 'ALL', blocksBooking: false, validityMonths: 24 }] });
    await expect(row).toHaveAttribute('data-state', 'saved');
    await expect(row).toContainText('Tutti');
    await expect(row).toContainText('Attivo');
    await expect(row).toContainText('24 mesi');

    // A second type with the SAME name is stopped on its row by the client — no request.
    let patches = 0;
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().endsWith('/api/v1/settings')) patches += 1;
    });
    await ratingsCard.getByTestId('ratings-add-button').click();
    await page.getByTestId('rating-name-input').fill(name);
    await page.getByTestId('rating-form-close').click();
    await page.getByTestId('settings-save').click();
    const duplicate = page.locator('[data-testid="rating-row"][data-state="new"]');
    await expect(duplicate.getByTestId('rating-row-error')).toHaveText('Questo nome è già usato in questa lista.');
    await page.waitForTimeout(300);
    expect(patches).toBe(0);
    await duplicate.getByTestId('rating-delete-button').click();
    await expect(page.locator('[data-testid="rating-row"][data-state="new"]')).toHaveCount(0);

    // Edit the scope — the badge reflects the new value; the update carries ONLY that field.
    await row.getByTestId('rating-edit-button').click();
    await page.getByTestId('rating-scope-select').selectOption('STUDENTS');
    await expect(row).toHaveAttribute('data-state', 'changed');
    await expect(row).toContainText('Allievi');
    const edited = await saveOnlyExpiryTypes(page);
    expect(edited.update).toEqual([{ id: expect.any(String), scope: 'STUDENTS' }]);

    // Deactivate — the status badge flips to "Disattivato" on the draft already.
    await row.getByTestId('rating-toggle-button').click();
    await expect(row).toContainText('Disattivato');
    expect((await saveOnlyExpiryTypes(page)).update).toEqual([{ id: expect.any(String), isActive: false }]);

    // Delete (never used) — marked, restorable, gone after the Salva.
    await row.getByTestId('rating-delete-button').click();
    await expect(row).toHaveAttribute('data-state', 'removed');
    await expect(row.getByTestId('rating-delete-button')).toHaveText('Ripristina');
    expect((await saveOnlyExpiryTypes(page)).delete).toHaveLength(1);
    await expect(page.getByTestId('rating-row').filter({ hasText: name })).toHaveCount(0);
  });

  test('admin creates a custom type via the "Visite mediche" card, renames it, and deactivates it — no scope, no "Blocca prenotazioni" anywhere (R-19-j)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettings(page);

    const medicalCard = page.getByTestId('medical-settings-card');
    await expect(medicalCard).toBeVisible();

    const name = uniqueTypeName('Visita idoneità');
    await medicalCard.getByTestId('medical-add-button').click();
    await expect(page.getByTestId('medical-form')).toBeVisible();
    await expect(page.getByTestId('medical-scope-select')).toHaveCount(0);
    await expect(page.getByTestId('medical-form').getByRole('checkbox')).toHaveCount(0);
    await page.getByTestId('medical-name-input').fill(name);
    await page.getByTestId('medical-form-close').click();
    const created = await saveOnlyExpiryTypes(page);
    // A visit sends neither scope nor blocksBooking: the server fixes both (19.7a).
    expect(created).toEqual({ create: [{ name, kind: 'MEDICAL', validityMonths: null }] });

    const row = page.getByTestId('medical-row').filter({ hasText: name });
    await expect(row).toContainText('Attiva');
    await expect(row).not.toContainText('Tutti');
    await expect(row).not.toContainText('Blocca prenotazioni');
    const types = (await (await page.request.get('/api/v1/expiry-types?includeInactive=true&kind=MEDICAL')).json()) as { name: string; scope: string; blocksBooking: boolean }[];
    expect(types.find((type) => type.name === name)).toMatchObject({ scope: 'ALL', blocksBooking: true });

    // Created via the "Visite mediche" card -> kind=MEDICAL -> never shows on the "Ratings" card.
    await expect(page.getByTestId('rating-row').filter({ hasText: name })).toHaveCount(0);

    const renamed = uniqueTypeName('Visita idoneità rinominata');
    await row.getByTestId('medical-edit-button').click();
    await page.getByTestId('medical-name-input').fill(renamed);
    await page.getByTestId('medical-form-close').click();
    const renamedRow = page.getByTestId('medical-row').filter({ hasText: renamed });
    // An update of a visit never carries scope/blocksBooking either.
    expect((await saveOnlyExpiryTypes(page)).update).toEqual([{ id: expect.any(String), name: renamed }]);
    await expect(renamedRow).toBeVisible();
    await expect(page.getByTestId('medical-row').filter({ hasText: name })).toHaveCount(0);

    await renamedRow.getByTestId('medical-toggle-button').click();
    await saveOnlyExpiryTypes(page);
    await expect(page.getByTestId('medical-row').filter({ hasText: renamed })).toContainText('Disattivata');
  });

  test('a validity of 0 shows the "senza scadenza" badge instead of a month count', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettings(page);

    const name = uniqueTypeName('Abilitazione notturna');
    await page.getByTestId('ratings-add-button').click();
    await page.getByTestId('rating-name-input').fill(name);
    await page.getByTestId('rating-scope-select').selectOption('ALL');
    await page.getByTestId('rating-validity-input').fill('0');
    await saveOnlyExpiryTypes(page);

    const row = page.getByTestId('rating-row').filter({ hasText: name });
    await expect(row).toContainText('senza scadenza');
  });

  test('admin creates a type with "Blocca prenotazioni" checked (story 7.4, AC 1), sees the list badge, then unchecks it on edit and the badge disappears', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettings(page);

    const name = uniqueTypeName('Tipo bloccante');
    const blocks = () => page.getByTestId('rating-form').getByLabel('Blocca prenotazioni');

    await page.getByTestId('ratings-add-button').click();
    await page.getByTestId('rating-name-input').fill(name);
    await page.getByTestId('rating-scope-select').selectOption('ALL');
    await blocks().check();
    expect((await saveOnlyExpiryTypes(page)).create?.[0]).toMatchObject({ name, blocksBooking: true });

    const row = page.getByTestId('rating-row').filter({ hasText: name });
    try {
      await expect(row).toContainText('Blocca prenotazioni');

      await row.getByTestId('rating-edit-button').click();
      await expect(blocks()).toBeChecked();
      await blocks().uncheck();
      expect((await saveOnlyExpiryTypes(page)).update).toEqual([{ id: expect.any(String), blocksBooking: false }]);

      await expect(page.getByTestId('rating-row').filter({ hasText: name })).not.toContainText('Blocca prenotazioni');
    } finally {
      // A blocking type left behind would fail every other spec's `POST /flights`.
      const types = (await (await page.request.get('/api/v1/expiry-types?includeInactive=true')).json()) as { id: string; name: string }[];
      const created = types.find((type) => type.name === name);
      if (created) await page.request.patch(`/api/v1/expiry-types/${created.id}`, { data: { blocksBooking: false } });
    }
  });

  test('a POST to expiry-types by a non-admin actor gets a 403 AD-8 envelope (settings.manage required)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.post('/api/v1/expiry-types', {
      data: { name: uniqueTypeName('Non permesso'), scope: 'ALL' },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('the pilot seed user (no expiries.manage) sees the Scadenze nav item (own-access, self.read) but /dashboard/settings stays out of reach', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(nav.getByRole('link', { name: 'Scadenze' })).toHaveCount(1);
    await nav.getByRole('link', { name: 'Scadenze' }).click();
    await expect(page.getByRole('heading', { name: 'Le mie scadenze' })).toBeVisible();

    await page.goto('/it/dashboard/settings');
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });
});
