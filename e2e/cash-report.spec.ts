import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/cash-report.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as cash-register.spec.ts. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/**
 * The cash register (and therefore the report over it) is GLOBAL and
 * append-only (AD-3, story 3.4): every scenario isolates itself with its OWN
 * unique category.
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

/** Today, `YYYY-MM-DD`, server-clock UTC — same convention `getBillingKpis`'s Europe/Rome "current month" reads (both land in the same calendar month in practice for this suite's run window). */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

test.describe('Financial report over the cash ledger — per-category via billing + PDF export (Story 3.5, port to story 12.9)', () => {
  test('a positive movement recorded TODAY shows up as a bar in billing\'s "Ricavi per categoria" card (ratifica utente 2: month-anchored, not a free period) — a negative one does not contribute (AC 1/2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = uniqueCategoryName('Report');
    const categoryId = await createCategory(page, categoryName);
    const today = todayDateOnly();
    await recordMovement(page, categoryId, 10000, today);
    await recordMovement(page, categoryId, -4000, today);

    await page.goto('/it/dashboard/billing');
    const row = page.getByTestId('billing-revenue-by-category-row').filter({ hasText: categoryName });
    await expect(row).toBeVisible();
    // Only the POSITIVE movement (100,00 €) counts as revenue — the uscita (-40,00 €) never subtracts from it.
    await expect(row).toContainText(/100,00\s€/);
  });

  test('"Report cassa (PDF)" from billing\'s ExportMenu downloads (200, application/pdf), defaulting to the current month when no period filter is applied (AC 2, story 10.2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/billing');
    await page.getByRole('button', { name: 'Esporta' }).click();
    const pdfLink = page.getByRole('link', { name: 'Report cassa (PDF)' });
    const href = await pdfLink.getAttribute('href');
    expect(href).toContain('/api/v1/cash-report/pdf');

    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
  });

  test('a period with no movements shows all-zero totals over the raw JSON report API (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // A run-unique, guaranteed-empty date range (no category was ever created for these random future days).
    const dayOffset = Math.floor(Math.random() * 9_000);
    const day1 = new Date(Date.UTC(2035, 0, 1) + dayOffset * 86_400_000).toISOString().slice(0, 10);
    const day2 = new Date(Date.UTC(2035, 0, 1) + (dayOffset + 1) * 86_400_000).toISOString().slice(0, 10);

    const response = await page.request.get(`/api/v1/cash-report?from=${day1}&to=${day2}`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { totalInCents: number; totalOutCents: number; netCents: number; categories: unknown[] };
    expect(body.totalInCents).toBe(0);
    expect(body.totalOutCents).toBe(0);
    expect(body.netCents).toBe(0);
    expect(body.categories).toEqual([]);
  });

  test('a pilot gets a 403 AD-8 envelope from GET /api/v1/cash-report (AD-5)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.get('/api/v1/cash-report?from=2026-07-01&to=2026-07-31');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
