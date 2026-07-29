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
 * Expiry-type catalogue (Story 6.1, AC 1/2, FR-35) — story 12.11 AC 2/3
 * moved it from the removed `/dashboard/expiries/types` page into
 * Impostazioni; story 13.1 (AC 3, R-13.1-a) split it into TWO cards —
 * "Abilitazioni" (`kind=RATING`) and "Visite mediche" (`kind=MEDICAL`),
 * both backed by the SAME `ratings-card.tsx` component — `settings.manage`
 * (ADMIN-only) gated same as every other card on that page.
 */
test.describe('Expiry-type catalogue, now on Impostazioni (Story 6.1 AC 1/2; Story 12.11 AC 2/3; Story 13.1 AC 3)', () => {
  test('admin sees the seeded standard types split RATING/MEDICAL across the two cards, creates a custom rating, edits/deactivates/deletes it', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.goto('/it/dashboard/settings');
    const ratingsCard = page.getByTestId('ratings-settings-card');
    await expect(ratingsCard).toBeVisible();
    const medicalCard = page.getByTestId('medical-settings-card');
    await expect(medicalCard).toBeVisible();

    // Story 13.1 (R-13.1-a): the 3 medical-visit standard types live in the
    // "Visite mediche" card, NOT "Abilitazioni".
    const medicalClass2Row = page.getByTestId('medical-row').filter({ hasText: 'Visita medica classe 2' });
    await expect(medicalClass2Row).toContainText('Piloti');
    await expect(medicalClass2Row).toContainText('Attivo');

    const medicalLapl = page.getByTestId('medical-row').filter({ hasText: 'Visita medica LAPL' });
    await expect(medicalLapl).toContainText('Allievi');
    await expect(page.getByTestId('rating-row').filter({ hasText: 'Visita medica' })).toHaveCount(0);

    // Ratifica utente 1: seeded for a fresh install too — a RATING (scope ALL), stays in "Abilitazioni".
    const membershipRow = page.getByTestId('rating-row').filter({ hasText: 'Quota associativa' });
    await expect(membershipRow).toContainText('12 mesi');

    // AC 2 (6.1): a custom type, scope "Tutti", usable exactly like a standard one — WITH a validity in months (story 12.11, ratifica utente 2).
    const name = uniqueTypeName('Assicurazione volo');

    await ratingsCard.getByTestId('ratings-add-button').click();
    await page.getByTestId('rating-name-input').fill(name);
    await page.getByTestId('rating-scope-select').selectOption('ALL');
    await page.getByTestId('rating-validity-input').fill('24');
    await page.getByTestId('rating-form-submit').click();

    await expect(page.getByTestId('ratings-feedback')).toBeVisible();

    const row = page.getByTestId('rating-row').filter({ hasText: name });
    await expect(row).toContainText('Tutti');
    await expect(row).toContainText('Attivo');
    await expect(row).toContainText('24 mesi');

    // A second type with the SAME name -> 409 shown in the form, not created twice.
    await ratingsCard.getByTestId('ratings-add-button').click();
    await page.getByTestId('rating-name-input').fill(name);
    await page.getByTestId('rating-scope-select').selectOption('PILOTS');
    await page.getByTestId('rating-form-submit').click();
    await expect(page.getByTestId('rating-form-error')).toContainText('Esiste già un tipo con questo nome.');
    await page.getByTestId('rating-form').getByRole('button', { name: 'Annulla' }).click();

    // Edit the scope — the badge reflects the new value.
    await row.getByTestId('rating-edit-button').click();
    await page.getByTestId('rating-scope-select').selectOption('STUDENTS');
    await page.getByTestId('rating-form-submit').click();
    await expect(page.getByTestId('ratings-feedback')).toBeVisible();
    const rowAfterEdit = page.getByTestId('rating-row').filter({ hasText: name });
    await expect(rowAfterEdit).toContainText('Allievi');

    // Deactivate — the status badge flips to "Disattivato".
    await rowAfterEdit.getByRole('button', { name: 'Disattiva' }).click();
    const rowAfterDeactivate = page.getByTestId('rating-row').filter({ hasText: name });
    await expect(rowAfterDeactivate).toContainText('Disattivato');

    // Delete (never used) — the row disappears from the catalogue.
    await rowAfterDeactivate.getByRole('button', { name: 'Elimina' }).click();
    await rowAfterDeactivate.getByRole('button', { name: 'Sì' }).click();
    await expect(page.getByTestId('ratings-feedback')).toBeVisible();
    await expect(page.getByTestId('rating-row').filter({ hasText: name })).toHaveCount(0);
  });

  test('admin creates a custom type via the "Visite mediche" card, renames it, and deactivates it (review F4 — symmetric to the "Abilitazioni" card flow, via medical-* testids)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/settings');

    const medicalCard = page.getByTestId('medical-settings-card');
    await expect(medicalCard).toBeVisible();

    const name = uniqueTypeName('Visita idoneità');
    await medicalCard.getByTestId('medical-add-button').click();
    await page.getByTestId('medical-name-input').fill(name);
    await page.getByTestId('medical-scope-select').selectOption('PILOTS');
    await page.getByTestId('medical-form-submit').click();
    await expect(page.getByTestId('medical-feedback')).toBeVisible();

    const row = page.getByTestId('medical-row').filter({ hasText: name });
    await expect(row).toContainText('Piloti');
    await expect(row).toContainText('Attivo');

    // Created via the "Visite mediche" card -> kind=MEDICAL -> never shows on the "Abilitazioni" card.
    await expect(page.getByTestId('rating-row').filter({ hasText: name })).toHaveCount(0);

    // Rename via edit — the row reflects the new name.
    const renamed = uniqueTypeName('Visita idoneità rinominata');
    await row.getByTestId('medical-edit-button').click();
    await page.getByTestId('medical-name-input').fill(renamed);
    await page.getByTestId('medical-form-submit').click();
    await expect(page.getByTestId('medical-feedback')).toBeVisible();
    const renamedRow = page.getByTestId('medical-row').filter({ hasText: renamed });
    await expect(renamedRow).toBeVisible();
    await expect(page.getByTestId('medical-row').filter({ hasText: name })).toHaveCount(0);

    // Deactivate — the status badge flips to "Disattivato".
    await renamedRow.getByRole('button', { name: 'Disattiva' }).click();
    await expect(page.getByTestId('medical-row').filter({ hasText: renamed })).toContainText('Disattivato');
  });

  test('a validity of 0 shows the "senza scadenza" badge instead of a month count', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/settings');

    const name = uniqueTypeName('Abilitazione notturna');
    await page.getByTestId('ratings-add-button').click();
    await page.getByTestId('rating-name-input').fill(name);
    await page.getByTestId('rating-scope-select').selectOption('ALL');
    await page.getByTestId('rating-validity-input').fill('0');
    await page.getByTestId('rating-form-submit').click();
    await expect(page.getByTestId('ratings-feedback')).toBeVisible();

    const row = page.getByTestId('rating-row').filter({ hasText: name });
    await expect(row).toContainText('senza scadenza');
  });

  test('admin creates a type with "Blocca prenotazioni" checked (story 7.4, AC 1), sees the list badge, then unchecks it on edit and the badge disappears', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/settings');

    const name = uniqueTypeName('Tipo bloccante');

    await page.getByTestId('ratings-add-button').click();
    await page.getByTestId('rating-name-input').fill(name);
    await page.getByTestId('rating-scope-select').selectOption('ALL');
    await page.getByLabel('Blocca prenotazioni').check();
    await page.getByTestId('rating-form-submit').click();
    await expect(page.getByTestId('ratings-feedback')).toBeVisible();

    const row = page.getByTestId('rating-row').filter({ hasText: name });
    await expect(row).toContainText('Blocca prenotazioni');

    await row.getByTestId('rating-edit-button').click();
    await expect(page.getByLabel('Blocca prenotazioni')).toBeChecked();
    await page.getByLabel('Blocca prenotazioni').uncheck();
    await page.getByTestId('rating-form-submit').click();
    await expect(page.getByTestId('ratings-feedback')).toBeVisible();

    const rowAfterEdit = page.getByTestId('rating-row').filter({ hasText: name });
    await expect(rowAfterEdit).not.toContainText('Blocca prenotazioni');
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
