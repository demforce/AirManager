// Review Billing-2 F4/F5/D3 — two billing.spec.ts cases moved HERE because
// neither tolerates a concurrent writer touching the ledger:
// (1) the three-riquadri invariant reads before/after values with nothing
//     but a CLIENT-SIDE filter change in between — any OTHER worker creating
//     a flight/top-up/cash-movement in that window changes the "after" read
//     and flakes the equality (measured: flaked 2/2 runs under
//     `fullyParallel` in the main project);
// (2) the secchiello reclassify test consumes the ONE seeded unattributed
//     historical movement (`prisma/seed.ts`) via a real write — a second run
//     against the SAME dirty DB (no reset in between) has nothing left to
//     reclassify, so it skips rather than fails. Consuming this fixture
//     WITHOUT a restore is ACCEPTED (review F4/F5): this is the LAST project
//     in the serialized chain, nothing downstream reads the seeded row
//     again.
// Same serialized-project pattern as settings.spec.ts/booking-window.spec.ts/
// treasury-settings.spec.ts (`playwright.config.ts`): `billing-global` runs
// LAST in the chain, after `treasury-settings`. `mode: 'serial'` below keeps
// the two tests in THIS file from racing each other too (fullyParallel would
// otherwise let a worker start the second test before the first finishes
// reading its own before/after pair). Run locally in isolation:
// `npx playwright test billing-global.spec.ts --no-deps`.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/billing-global.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Same far-future scheme as `billing.spec.ts#dateAt` — used here only to build a date range that DEFINITELY excludes everything (no per-run uniqueness needed, this test never collides with itself). */
function dateAt(daysFromBase: number): string {
  return new Date(Date.UTC(2033, 0, 1) + daysFromBase * 86_400_000).toISOString().slice(0, 10);
}

function billingRows(page: Page) {
  return page.getByTestId('transaction-row');
}

async function gotoBilling(page: Page, query: Record<string, string>): Promise<void> {
  const params = new URLSearchParams(query);
  await page.goto(`/it/dashboard/billing?${params.toString()}`);
}

test.describe.configure({ mode: 'serial' });

test.describe('Billing — global/serialized cases (review Billing-2 F4/F5)', () => {
  test('the three riquadri (Risultato/Liquidità/Acconti) do NOT change when the table filters do (AC 1 — same invariant getBillingKpis had); DETERMINISTIC now that no concurrent worker touches the ledger (review F4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoBilling(page, {});
    await page.waitForSelector('[data-testid="billing-panel-result"]');

    // Sanity precondition: there IS something to filter away — otherwise the
    // "the filter changed the table" assert below would be vacuous.
    await expect(billingRows(page).first()).toBeVisible();

    const before = await Promise.all(
      ['billing-panel-revenue', 'billing-panel-cost', 'billing-panel-net', 'billing-panel-cash', 'billing-panel-bank'].map((id) => page.getByTestId(id).innerText()),
    );

    // A date filter that excludes everything (far future) — table goes empty, panels must stay identical.
    const emptyDay = dateAt(50_000);
    await page.getByTestId('billing-filter-date-from').fill(emptyDay);
    await page.getByTestId('billing-filter-date-to').fill(emptyDay);
    await expect(page).toHaveURL(new RegExp(`dateFrom=${emptyDay}`));
    await expect(page.getByTestId('billing-empty')).toBeVisible();

    // Positive assert (review F4): the filter DID change the table — the panels staying put below is only meaningful because the table demonstrably moved.
    await expect(billingRows(page)).toHaveCount(0);

    const after = await Promise.all(
      ['billing-panel-revenue', 'billing-panel-cost', 'billing-panel-net', 'billing-panel-cash', 'billing-panel-bank'].map((id) => page.getByTestId(id).innerText()),
    );
    expect(after).toEqual(before);
  });

  test('the seeded unattributed historical movement is reachable via the Liquidità riquadro\'s link; reclassifying it via the inline select PATCHes the method and drops it out of the secchiello', async ({ page }) => {
    // Every LIVE writer now requires a paymentMethod (Billing-1 AC2 + review
    // F8/D2 closed the last gap, `completePprRequest`) — the ONLY reachable
    // unattributed row on a test DB is the ONE seeded directly via Prisma in
    // `prisma/seed.ts` (simulating a genuinely pre-migration historical
    // entry, exactly what this feature exists for).
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // Guard rewritten on the SEEDED ROW itself (review F4/F5) — the OLD
    // guard (skip when the panel's link doesn't render) could not tell
    // "already consumed by a previous run" apart from "a genuine
    // regression". This one checks for the seed's own description marker
    // directly via the API first; only THEN does it decide whether to skip.
    // Consuming the fixture without a restore is accepted here: this test is
    // the LAST thing in the LAST serialized project — nothing downstream
    // reads it again.
    const seedCheckResponse = await page.request.get('/api/v1/transactions?unattributed=true&pageSize=100');
    const seedCheckBody = (await seedCheckResponse.json()) as { items: Array<{ description: string | null }> };
    const seedStillPresent = seedCheckBody.items.some((item) => item.description === 'Movimento storico pre-Billing-1 (seed)');
    if (!seedStillPresent) {
      test.skip(true, 'The seeded unattributed movement was already reclassified by a previous run against the same DB (no reset in between) — consuming this fixture without restore is accepted (review F4/F5).');
    }

    await gotoBilling(page, {});
    await page.waitForSelector('[data-testid="billing-panel-treasury"]');
    const unattributedLink = page.getByTestId('billing-panel-unattributed-link');
    await expect(unattributedLink).toBeVisible();

    await unattributedLink.click();
    await expect(page).toHaveURL(/unattributed=true/);

    const row = billingRows(page).filter({ hasText: 'Movimento storico pre-Billing-1' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/5,00\s€/);

    const select = row.getByTestId('transaction-reclassify-method');
    await expect(select).toBeVisible();
    await select.selectOption('CASH');
    await expect(page.getByTestId('billing-reclassify-feedback')).toHaveText('Metodo assegnato.');

    // `router.refresh()` re-runs the server-side `unattributed=true` filter — the row, now attributed, drops out on its own.
    await expect(billingRows(page).filter({ hasText: 'Movimento storico pre-Billing-1' })).toHaveCount(0);

    // A direct API check closes the loop independently of the UI's own filtered view.
    const stillUnattributedResponse = await page.request.get('/api/v1/transactions?unattributed=true&pageSize=100');
    const stillUnattributed = (await stillUnattributedResponse.json()) as { items: Array<{ description: string | null }> };
    expect(stillUnattributed.items.some((item) => item.description === 'Movimento storico pre-Billing-1 (seed)')).toBe(false);
  });
});
