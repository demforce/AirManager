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
    data: { categoryId, amountCents, effectiveDate },
  });
  expect(response.status()).toBe(201);
}

/** Story 12.5: `#cash-effective-date` is a `DatePicker` now — `YYYY-MM-DD` -> `DD/MM/YYYY` for its typed-text input. */
function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Fills and submits the "Nuovo movimento" panel (assumes the finance page is open). */
async function submitMovement(
  page: Page,
  input: { direction: 'Entrata' | 'Uscita'; categoryName: string; amount: string; date: string; description: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Nuovo movimento' }).click();
  await page.locator('#cash-direction').selectOption({ label: input.direction });
  await page.locator('#cash-category').selectOption({ label: input.categoryName });
  await page.locator('#cash-amount').fill(input.amount);
  await page.locator('#cash-effective-date').fill(isoToDisplay(input.date));
  await page.locator('#cash-description').fill(input.description);
  await page.getByRole('button', { name: 'Registra movimento' }).click();
  // The panel closes only on success — a stronger completion signal than the
  // feedback text, which persists from a previous submit in the same test.
  await expect(page.getByTestId('cash-movement-form')).toHaveCount(0);
  await expect(page.getByTestId('cash-feedback')).toHaveText('Movimento registrato.');
}

function registerRows(page: Page) {
  return page.getByTestId('cash-register-table').locator('tbody tr');
}

/** TD-6 (AC 1): the filter bar is hidden behind a "Filtri" toggle. Cash's manager does NOT remount on a filter change (no `key`, unlike flights/ppr-register), so the panel simply stays open for the rest of the test once opened — open it once, before the first filter interaction. */
async function openCashFilters(page: Page): Promise<void> {
  const toggle = page.getByTestId('cash-filter-bar-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
  }
}

test.describe('Cash register with categories and reversals (Story 3.4)', () => {
  test('staff records a +50 € entrata and a −30 € uscita: both in the register with signed colored amounts; sign and period filters work (AC 2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = uniqueCategoryName('Registro');
    const categoryId = await createCategory(page, categoryName);

    await page.goto('/it/dashboard/finance');
    await submitMovement(page, {
      direction: 'Entrata',
      categoryName,
      amount: '50',
      date: '2026-07-01',
      description: 'Incasso piazzale',
    });
    await submitMovement(page, {
      direction: 'Uscita',
      categoryName,
      amount: '30',
      date: '2026-07-02',
      description: 'Acquisto materiale',
    });

    // Isolate this run's rows through the category filter (URL-driven).
    await openCashFilters(page);
    await page.getByTestId('cash-filter-category').selectOption(categoryId);
    await expect(page).toHaveURL(new RegExp(`categoryId=${categoryId}`));
    await expect(registerRows(page)).toHaveCount(2);

    // Signed colored amounts: entrata green (+50,00 €), uscita red (−30,00 €).
    const inflowRow = registerRows(page).filter({ hasText: 'Incasso piazzale' });
    await expect(inflowRow).toContainText(/\+50,00\s€/);
    await expect(inflowRow.locator('span.text-\\[\\#346538\\]')).toBeVisible();
    const outflowRow = registerRows(page).filter({ hasText: 'Acquisto materiale' });
    await expect(outflowRow).toContainText(/-30,00\s€/);
    await expect(outflowRow.locator('span.text-\\[\\#9F2F2D\\]')).toBeVisible();

    // Sign filter: out → only the uscita.
    await page.getByTestId('cash-filter-sign').selectOption('out');
    await expect(page).toHaveURL(/sign=out/);
    await expect(registerRows(page)).toHaveCount(1);
    await expect(registerRows(page).first()).toContainText('Acquisto materiale');
    await page.getByTestId('cash-filter-sign').selectOption('');
    await expect(page).not.toHaveURL(/sign=/);

    // Period filter, INCLUSIVE boundaries: [2026-07-01, 2026-07-01] → only the entrata.
    await page.getByTestId('cash-filter-from').fill('01/07/2026');
    await expect(page).toHaveURL(/from=2026-07-01/);
    await page.getByTestId('cash-filter-to').fill('01/07/2026');
    await expect(page).toHaveURL(/to=2026-07-01/);
    await expect(registerRows(page)).toHaveCount(1);
    await expect(registerRows(page).first()).toContainText('Incasso piazzale');
  });

  test('reversing the uscita with a reason creates the +30 € storno row with badge; the original loses its Storna action (AC 2, AD-3)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = uniqueCategoryName('Storno');
    const categoryId = await createCategory(page, categoryName);
    await recordMovement(page, categoryId, -3000, '2026-07-02');

    await page.goto(`/it/dashboard/finance?categoryId=${categoryId}`);
    await expect(registerRows(page)).toHaveCount(1);

    // Two-step: the row action only opens the panel; the storno needs a reason.
    await registerRows(page).first().getByRole('button', { name: 'Storna' }).click();
    await page.locator('#cash-reverse-reason').fill('Registrata per errore');
    await page.getByRole('button', { name: 'Conferma storno' }).click();
    await expect(page.getByTestId('cash-feedback')).toHaveText('Storno registrato.');

    // The storno row: opposite amount, same category, badge.
    await expect(registerRows(page)).toHaveCount(2);
    const reversalRow = registerRows(page).filter({ hasText: 'Registrata per errore' });
    await expect(reversalRow).toContainText(/\+30,00\s€/);
    await expect(reversalRow.getByTestId('cash-reversal-badge')).toBeVisible();

    // Neither the reversed original nor the storno itself offers "Storna" anymore.
    await expect(page.getByTestId('cash-register-table').getByRole('button', { name: 'Storna' })).toHaveCount(0);
  });

  test('admin creates a category and deactivates it: it disappears from the new-movement picker (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = uniqueCategoryName('Effimera');

    await page.goto('/it/dashboard/finance/categories');
    await page.getByRole('button', { name: 'Nuova categoria' }).click();
    await page.locator('#category-name').fill(categoryName);
    await page.getByRole('button', { name: 'Crea categoria' }).click();
    await expect(page.getByTestId('categories-feedback')).toHaveText('Categoria creata.');

    const row = page.getByTestId('cash-categories-table').locator('tbody tr').filter({ hasText: categoryName });
    await expect(row).toContainText('Attiva');

    await row.getByRole('button', { name: 'Disattiva' }).click();
    await expect(page.getByTestId('categories-feedback')).toHaveText('Categoria disattivata.');
    await expect(row).toContainText('Disattivata');

    // Deactivated → not selectable for new movements (the picker filters to active).
    await page.goto('/it/dashboard/finance');
    await page.getByRole('button', { name: 'Nuovo movimento' }).click();
    await expect(page.locator('#cash-category')).toBeVisible();
    await expect(page.locator(`#cash-category option:has-text("${categoryName}")`)).toHaveCount(0);
    // ... while the FILTER select still lists it (historical movements stay reachable).
    await openCashFilters(page);
    await expect(page.getByTestId('cash-filter-category').locator(`option:has-text("${categoryName}")`)).toHaveCount(1);
  });

  test('deleting a category in use fails with a clear message suggesting deactivation (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = uniqueCategoryName('Usata');
    const categoryId = await createCategory(page, categoryName);
    await recordMovement(page, categoryId, 1500, '2026-07-03');

    await page.goto('/it/dashboard/finance/categories');
    const row = page.getByTestId('cash-categories-table').locator('tbody tr').filter({ hasText: categoryName });
    // Movement-count column (3rd cell) — the unique name itself contains digits, so target the cell.
    await expect(row.locator('td').nth(2)).toHaveText('1');
    await row.getByRole('button', { name: 'Elimina' }).click();
    await row.getByRole('button', { name: 'Conferma' }).click();
    await expect(page.getByTestId('categories-feedback')).toHaveText(
      'La categoria ha movimenti registrati e non può essere eliminata: disattivala invece.',
    );
    // The category is still there.
    await expect(row).toHaveCount(1);
  });

  test('a pilot gets a 403 AD-8 envelope from GET /api/v1/cash-movements (AD-5)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.get('/api/v1/cash-movements');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
