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
 * append-only (AD-3, story 3.4): every scenario isolates itself with its
 * OWN unique category — but the report's SUMMARY CARDS sum ACROSS every
 * category in the requested period (unlike the register table, which can
 * be filtered down to one category), so a fixed date range is not enough:
 * re-running this spec against a not-freshly-seeded DB (Dev Notes: "e2e
 * flaky su DB sporco") would accumulate a previous run's movements into
 * the SAME day and inflate the totals. Each scenario therefore also draws
 * its OWN random day, spread across ~27 years (2030-2057) — the same
 * negligible-collision-risk pattern as `uniqueCategoryName`'s random
 * suffix, just applied to the calendar instead of the name.
 */
function uniqueCategoryName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A day, `daysFromBase` after 2030-01-01 UTC, as `YYYY-MM-DD`. */
function dateAt(daysFromBase: number): string {
  return new Date(Date.UTC(2030, 0, 1) + daysFromBase * 86_400_000).toISOString().slice(0, 10);
}

/** A run-unique two-day window (`day1`, `day2 = day1 + 1`) — see the comment above. */
function uniqueDatePair(): { day1: string; day2: string } {
  const dayOffset = Math.floor(Math.random() * 9_000); // ~24.6 years of distinct starting days
  return { day1: dateAt(dayOffset), day2: dateAt(dayOffset + 1) };
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

function categoryRow(page: Page, categoryName: string) {
  return page.getByTestId('cash-report-category-row').filter({ hasText: categoryName });
}

test.describe('Financial report over the cash ledger (Story 3.5)', () => {
  test('staff records +100 € and -40 € on known dates: the report shows entrate 100, uscite -40, saldo 60 and the right category; narrowing the range to exclude a date keeps totals coherent (AC 1/2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = uniqueCategoryName('Report');
    const categoryId = await createCategory(page, categoryName);
    const { day1, day2 } = uniqueDatePair();
    await recordMovement(page, categoryId, 10000, day1);
    await recordMovement(page, categoryId, -4000, day2);

    await page.goto(`/it/dashboard/finance/report?from=${day1}&to=${day2}`);

    await expect(page.getByTestId('cash-report-total-in')).toContainText(/100,00\s€/);
    await expect(page.getByTestId('cash-report-total-out')).toContainText(/-40,00\s€/);
    await expect(page.getByTestId('cash-report-net')).toContainText(/\+60,00\s€/);

    const row = categoryRow(page, categoryName);
    await expect(row).toBeVisible();
    await expect(row).toContainText(/100,00\s€/);
    await expect(row).toContainText(/-40,00\s€/);
    await expect(row).toContainText(/\+60,00\s€/);

    // The "apri nel registro" link carries the same from/to (Dev Notes: no
    // duplicated movements table — reopen the existing register instead).
    await expect(page.getByTestId('cash-report-open-register')).toHaveAttribute(
      'href',
      new RegExp(`/it/dashboard/finance\\?from=${day1}&to=${day2}`),
    );

    // Narrow the range to exclude day2 (the uscita): totals stay coherent —
    // only the entrata remains, saldo becomes +100.
    await page.getByTestId('cash-report-filter-to').fill(day1);
    await expect(page).toHaveURL(new RegExp(`to=${day1}`));
    await expect(page.getByTestId('cash-report-total-in')).toContainText(/100,00\s€/);
    await expect(page.getByTestId('cash-report-total-out')).toContainText(/0,00\s€/);
    await expect(page.getByTestId('cash-report-net')).toContainText(/\+100,00\s€/);
    await expect(categoryRow(page, categoryName)).toContainText(/\+100,00\s€/);
  });

  test('a period with no movements shows all-zero totals and an empty category table (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // A run-unique, guaranteed-empty date range (no category was ever
    // created for these random days).
    const { day1, day2 } = uniqueDatePair();
    await page.goto(`/it/dashboard/finance/report?from=${day1}&to=${day2}`);

    await expect(page.getByTestId('cash-report-total-in')).toContainText(/0,00\s€/);
    await expect(page.getByTestId('cash-report-total-out')).toContainText(/0,00\s€/);
    await expect(page.getByTestId('cash-report-net')).toContainText(/0,00\s€/);
    await expect(page.getByTestId('cash-report-categories-table')).toContainText('Nessun movimento nel periodo selezionato.');
  });

  test('a pilot gets a 403 AD-8 envelope from GET /api/v1/cash-report (AD-5)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.get('/api/v1/cash-report?from=2026-07-01&to=2026-07-31');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
