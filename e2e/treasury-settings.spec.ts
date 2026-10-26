// This spec writes GLOBAL AppSetting rows (`treasury.*`, story Billing-2, AC
// 4) — it runs in the `treasury-settings` Playwright project, serialized
// AFTER `booking-window` (`playwright.config.ts`), same rationale as
// `settings.spec.ts`/`booking-window.spec.ts`: a `fullyParallel` race on a
// GLOBAL setting would otherwise let a concurrent read elsewhere observe a
// half-saved state. Running this file alone locally:
// `npx playwright test treasury-settings.spec.ts --no-deps` (otherwise
// Playwright first runs the dependency chain).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/treasury-settings.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Same hydration-race hardening as `settings.spec.ts#gotoSettingsAndWaitForHydration`. */
async function gotoSettingsAndWaitForHydration(page: Page): Promise<void> {
  await page.goto('/it/dashboard/settings');
  await page.waitForLoadState('networkidle');
}

/** Parses an Intl-formatted EUR string back to integer cents — same test-only helper as `billing.spec.ts`. */
function parseEuroText(text: string): number {
  const normalized = text.replace(/−/g, '-').replace(/[^\d,.-]/g, '');
  const cleaned = normalized.replace(/\./g, '').replace(',', '.');
  return Math.round(Number.parseFloat(cleaned) * 100);
}

async function panelValueCents(page: Page, testId: string): Promise<number> {
  const text = await page.getByTestId(testId).innerText();
  return parseEuroText(text);
}

/**
 * A fixed, safely-in-the-past opening date (story Billing-2, AC 6): no e2e
 * fixture or seed row anywhere in the suite is dated before this, so
 * switching `treasury.openingDate` to it never excludes an existing
 * movement from the running cash/bank totals — only the opening BALANCE
 * itself shifts the figure, making a before/after delta exact.
 */
const SAFE_OPENING_DATE = '2000-01-01';

test.describe.configure({ mode: 'serial' });

test.describe('Impostazioni — card Tesoreria (story Billing-2, AC 4/6)', () => {
  test.afterAll(async ({ browser }) => {
    // Neutral restore — 0/0 opening balances keep every OTHER spec's own
    // (delta-based, story Billing-2 AC 6) Liquidità assertions meaningful
    // for whichever run happens after this one.
    const page = await browser.newPage();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.request.put('/api/v1/settings/treasury', { data: { openingCashCents: 0, openingBankCents: 0, openingDate: SAFE_OPENING_DATE } });
    await page.close();
  });

  test('the card prefills from getTreasurySettings (server component, no GET route — D5) and round-trips through its own PUT response', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);

    await expect(page.getByTestId('treasury-settings-card')).toBeVisible();
    await page.getByTestId('treasury-opening-cash-input').fill('123.45');
    await page.getByTestId('treasury-opening-bank-input').fill('678.90');
    await page.getByTestId('treasury-opening-date-input').fill(SAFE_OPENING_DATE);

    const [putResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/treasury') && r.request().method() === 'PUT'),
      page.getByTestId('treasury-settings-save').click(),
    ]);
    expect(putResponse.status()).toBe(200);
    expect(await putResponse.json()).toEqual({ openingCashCents: 12345, openingBankCents: 67890, openingDate: SAFE_OPENING_DATE });
    await expect(page.getByTestId('treasury-settings-feedback')).toHaveText('Impostazioni salvate.');

    // A fresh navigation re-reads the server component — the saved values persist and prefill again.
    await gotoSettingsAndWaitForHydration(page);
    await expect(page.getByTestId('treasury-opening-cash-input')).toHaveValue('123.45');
    await expect(page.getByTestId('treasury-opening-bank-input')).toHaveValue('678.90');
    await expect(page.getByTestId('treasury-opening-date-input')).toHaveValue(SAFE_OPENING_DATE);
  });

  test('raising the opening cash/bank balances moves Liquidità\'s Cassa/Banca on /dashboard/billing by EXACTLY the delta (AC 6)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.goto('/it/dashboard/billing');
    await page.waitForSelector('[data-testid="billing-panel-treasury"]');
    const cashBefore = await panelValueCents(page, 'billing-panel-cash');
    const bankBefore = await panelValueCents(page, 'billing-panel-bank');

    await gotoSettingsAndWaitForHydration(page);
    const currentCash = Number.parseFloat((await page.getByTestId('treasury-opening-cash-input').inputValue()).replace(',', '.'));
    const currentBank = Number.parseFloat((await page.getByTestId('treasury-opening-bank-input').inputValue()).replace(',', '.'));
    const nextCash = (currentCash + 37.5).toFixed(2);
    const nextBank = (currentBank + 82.25).toFixed(2);

    await page.getByTestId('treasury-opening-cash-input').fill(nextCash);
    await page.getByTestId('treasury-opening-bank-input').fill(nextBank);
    await page.getByTestId('treasury-opening-date-input').fill(SAFE_OPENING_DATE);
    const [putResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/treasury') && r.request().method() === 'PUT'),
      page.getByTestId('treasury-settings-save').click(),
    ]);
    expect(putResponse.status()).toBe(200);

    await page.goto('/it/dashboard/billing');
    await page.waitForSelector('[data-testid="billing-panel-treasury"]');
    const cashAfter = await panelValueCents(page, 'billing-panel-cash');
    const bankAfter = await panelValueCents(page, 'billing-panel-bank');

    expect(cashAfter - cashBefore).toBe(3750);
    expect(bankAfter - bankBefore).toBe(8225);
  });

  test('a pilot (non-ADMIN) actor is redirected away from /dashboard/settings — the Tesoreria card is admin-only like every other settings.manage card', async ({ page }) => {
    await loginExpectingDashboard(page, 'pilot@airmanager.local');
    await gotoSettingsAndWaitForHydration(page);
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });
});
