import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/cash-register.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as account-adjustments.spec.ts. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/**
 * The cash register is GLOBAL (not per person) and append-only (AD-3): rows
 * accumulate across runs, so every scenario isolates itself with its OWN
 * unique category and drives the register through the category filter.
 */
function uniqueCategoryName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Creates a cash category via the API (admin session) and returns its id. */
async function createCategory(page: Page, name: string): Promise<string> {
  const response = await page.request.post('/api/v1/cash-categories', { data: { name } });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return created.id;
}

/** Records a manual movement via the API. */
async function recordMovement(page: Page, categoryId: string, amountCents: number, effectiveDate: string): Promise<void> {
  const response = await page.request.post('/api/v1/cash-movements', {
    data: { categoryId, amountCents, paymentMethod: 'CASH', effectiveDate },
  });
  expect(response.status()).toBe(201);
}

/**
 * Fills and submits the "Nuova transazione" SlideOver's "Movimento cassa"
 * branch (story 12.9 — replaces the legacy `/dashboard/finance` inline
 * panel). Assumes billing is open with no editor active.
 */
async function submitCashMovement(
  page: Page,
  input: { direction: 'in' | 'out'; categoryName: string; amount: string; date: string; description: string },
): Promise<void> {
  await page.getByTestId('billing-new-transaction-button').click();
  await page.waitForSelector('[data-testid="transaction-form"]');
  await page.getByTestId('transaction-kind').selectOption('cash');
  await page.getByTestId('transaction-category').selectOption({ label: input.categoryName });
  await page.getByTestId('transaction-direction').selectOption(input.direction);
  await page.getByTestId('transaction-amount').fill(input.amount);
  await page.getByTestId('transaction-date').fill(input.date);
  await page.getByTestId('transaction-description').fill(input.description);
  await page.getByTestId('transaction-submit').click();
  await page.waitForSelector('[data-testid="transaction-result-panel"]');
  await page.getByTestId('transaction-result-close').click();
}

function registerRows(page: Page) {
  return page.getByTestId('transaction-row');
}

test.describe('Cash register with categories and reversals (Story 3.4 — port to billing, story 12.9; Entrate/Uscite columns story Billing-2)', () => {
  test('staff records a +50 € entrata and a −30 € uscita via "Nuova transazione"; each shows in its own Entrate/Uscite column and the category filter isolates them (AC 2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = uniqueCategoryName('Registro');
    const categoryId = await createCategory(page, categoryName);

    await page.goto('/it/dashboard/billing');
    await submitCashMovement(page, {
      direction: 'in',
      categoryName,
      amount: '50',
      date: '2026-07-01',
      description: 'Incasso piazzale',
    });
    await submitCashMovement(page, {
      direction: 'out',
      categoryName,
      amount: '30',
      date: '2026-07-02',
      description: 'Acquisto materiale',
    });

    // Isolate this run's rows through the "Categoria" filter (URL-driven, story Billing-2 — replaces the old combined "Tipo" select's cash optgroup).
    await page.getByTestId('billing-filter-category').selectOption(categoryId);
    await expect(page).toHaveURL(new RegExp(`categoryId=${categoryId}`));
    await expect(registerRows(page)).toHaveCount(2);

    // Entrate/Uscite columns (story Billing-2, AC 2): each shows its OWN unsigned amount in its own column — no more
    // one signed "Importo" column to disambiguate.
    const inflowRow = registerRows(page).filter({ hasText: 'Incasso piazzale' });
    await expect(inflowRow).toContainText(/50,00\s€/);
    const outflowRow = registerRows(page).filter({ hasText: 'Acquisto materiale' });
    await expect(outflowRow).toContainText(/30,00\s€/);

    // Period filter, INCLUSIVE boundaries: [2026-07-01, 2026-07-01] -> only the entrata.
    await page.getByTestId('billing-filter-date-from').fill('2026-07-01');
    await expect(page).toHaveURL(/dateFrom=2026-07-01/);
    await page.getByTestId('billing-filter-date-to').fill('2026-07-01');
    await expect(page).toHaveURL(/dateTo=2026-07-01/);
    await expect(registerRows(page)).toHaveCount(1);
    await expect(registerRows(page).first()).toContainText('Incasso piazzale');
  });

  test('reversing the uscita with a reason creates the +30 € storno row with the "Storno" status badge; the original loses its Storna action (AC 2, AD-3)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = uniqueCategoryName('Storno');
    const categoryId = await createCategory(page, categoryName);
    await recordMovement(page, categoryId, -3000, '2026-07-02');

    await page.goto(`/it/dashboard/billing?categoryId=${categoryId}`);
    await expect(registerRows(page)).toHaveCount(1);

    // Two-step: the row action only opens the panel; the storno needs a reason.
    await registerRows(page).first().getByTestId('transaction-reverse-action').click();
    await page.waitForSelector('[data-testid="transaction-reverse-panel"]');
    await page.getByTestId('transaction-reverse-reason').fill('Registrata per errore');
    await page.getByTestId('transaction-reverse-confirm').click();
    await expect(page.getByTestId('billing-reverse-feedback')).toHaveText('Storno registrato.');

    // The storno row: opposite amount, same category, "Storno" status badge.
    await expect(registerRows(page)).toHaveCount(2);
    const reversalRow = registerRows(page).filter({ hasText: 'Registrata per errore' });
    await expect(reversalRow).toContainText(/30,00\s€/);
    await expect(reversalRow.getByText('Storno', { exact: true })).toBeVisible();

    // Neither the reversed original nor the storno itself offers "Storna" anymore.
    await expect(registerRows(page).getByTestId('transaction-reverse-action')).toHaveCount(0);
  });

  test('admin deactivates a category via the API: it disappears from the "Nuova transazione" cash picker (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = uniqueCategoryName('Effimera');
    const categoryId = await createCategory(page, categoryName);

    // Story 12.13: the legacy `/dashboard/finance/categories` management page
    // is gone — category CRUD is API-only now (`cash-* RESTANO`, ratified);
    // the picker-visibility behavior below is what still has a live UI to check.
    const deactivateResponse = await page.request.post(`/api/v1/cash-categories/${categoryId}/deactivate`);
    expect(deactivateResponse.status()).toBe(200);

    // Deactivated -> not selectable for new movements (the picker filters to active) NOR
    // in the "Categoria" filter (story 12.9/Billing-2: BOTH read the same active-only list —
    // a deliberate deviation from the legacy register's filter, which kept inactive ones
    // reachable there; the story ratifies "Categorie cassa = categorie attive" for billing).
    await page.goto('/it/dashboard/billing');
    await page.getByTestId('billing-new-transaction-button').click();
    await page.waitForSelector('[data-testid="transaction-form"]');
    await page.getByTestId('transaction-kind').selectOption('cash');
    await expect(page.getByTestId('transaction-category')).toBeVisible();
    await expect(page.locator(`[data-testid="transaction-category"] option:has-text("${categoryName}")`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="billing-filter-category"] option:has-text("${categoryName}")`)).toHaveCount(0);
  });

  test('deleting a category in use via the API fails with a clear message suggesting deactivation (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = uniqueCategoryName('Usata');
    const categoryId = await createCategory(page, categoryName);
    await recordMovement(page, categoryId, 1500, '2026-07-03');

    // Story 12.13: no more management page to drive this through the UI —
    // the DELETE endpoint itself stays (`cash-* RESTANO`, ratified). Asserted
    // directly against the API's own (English, AD-8) envelope now — the
    // Italian-translated message the deleted management page used to render
    // no longer exists to assert against.
    const deleteResponse = await page.request.delete(`/api/v1/cash-categories/${categoryId}`);
    expect(deleteResponse.status()).toBe(409);
    const deleteBody = await deleteResponse.json();
    expect(deleteBody.error.code).toBe('CONFLICT');
    expect(deleteBody.error.message).toBe('This category has recorded movements — deactivate it instead of deleting it.');

    // The category is still there (still selectable in the billing picker).
    await page.goto('/it/dashboard/billing');
    await page.getByTestId('billing-new-transaction-button').click();
    await page.waitForSelector('[data-testid="transaction-form"]');
    await page.getByTestId('transaction-kind').selectOption('cash');
    await expect(page.locator(`[data-testid="transaction-category"] option:has-text("${categoryName}")`)).toHaveCount(1);
  });

  test('a pilot gets a 403 AD-8 envelope from GET /api/v1/cash-movements (AD-5)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.get('/api/v1/cash-movements');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
