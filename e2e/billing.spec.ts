import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/billing.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Run-unique day, far in the future — same isolation pattern as `cash-report.spec.ts`'s `uniqueDatePair` (a fresh DB per session, but re-runs against a dirty one must not collide). */
function dateAt(daysFromBase: number): string {
  return new Date(Date.UTC(2033, 0, 1) + daysFromBase * 86_400_000).toISOString().slice(0, 10);
}

function uniqueDatePair(): { day1: string; day2: string } {
  const dayOffset = Math.floor(Math.random() * 9_000);
  return { day1: dateAt(dayOffset), day2: dateAt(dayOffset + 1) };
}

async function createPilotPerson(page: Page, tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Billing';
  const lastName = `${tag}-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  return { personId: person.id, firstName, lastName };
}

async function createCategory(page: Page, name: string): Promise<string> {
  const response = await page.request.post('/api/v1/cash-categories', { data: { name } });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return created.id;
}

async function recordTopUp(page: Page, personId: string, amountCents: number, effectiveDate: string): Promise<void> {
  const response = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
    data: { amountCents, paymentMethod: 'BANK_TRANSFER', effectiveDate },
  });
  expect(response.status()).toBe(200);
}

async function recordCashMovement(page: Page, categoryId: string, amountCents: number, effectiveDate: string, description: string): Promise<void> {
  const response = await page.request.post('/api/v1/cash-movements', { data: { categoryId, amountCents, effectiveDate, description } });
  expect(response.status()).toBe(201);
}

async function createPackageType(page: Page, data: { name: string; includedMinutes: number; priceCents: number }): Promise<string> {
  const response = await page.request.post('/api/v1/package-types', { data });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return created.id;
}

async function sellPackage(page: Page, personId: string, packageTypeId: string, effectiveDate: string): Promise<void> {
  const response = await page.request.post(`/api/v1/people/${personId}/packages`, {
    data: { packageTypeId, paymentMethod: 'CASH', effectiveDate },
  });
  expect(response.status()).toBe(201);
}

async function accountBalance(page: Page, personId: string): Promise<number> {
  const response = await page.request.get(`/api/v1/people/${personId}/account`);
  const body = (await response.json()) as { balanceCents: number };
  return body.balanceCents;
}

function billingRows(page: Page) {
  return page.getByTestId('transaction-row');
}

function personOptionLabel(person: { firstName: string; lastName: string }): string {
  return `${person.lastName} ${person.firstName}`;
}

/** Same `SearchCombobox` typeahead helper as `flight-log.spec.ts`/`flights.spec.ts` (story TD-3). */
async function selectFromCombobox(combobox: Locator, query: string, optionLabel: string): Promise<void> {
  await combobox.click();
  await combobox.fill(query);
  await combobox.page().getByRole('option', { name: optionLabel, exact: true }).click();
}

async function gotoBilling(page: Page, query: Record<string, string>): Promise<void> {
  const params = new URLSearchParams(query);
  await page.goto(`/it/dashboard/billing?${params.toString()}`);
}

test.describe('Unified billing ledger (Story 12.9)', () => {
  test('mixed conto+cassa rows ordered effectiveDate desc, and the automatic cash twin of a top-up is deduped to ONE row (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotPerson(page, 'Ledger');
    const category = await createCategory(page, `Ledger-${uniqueSuffix()}`);
    const { day1, day2 } = uniqueDatePair();

    // day1 (earlier): manual cash entrata. day2 (later): a top-up — its automatic "Ricariche" twin shares day2 too.
    await recordCashMovement(page, category, 2000, day1, 'Voce cassa manuale');
    await recordTopUp(page, pilot.personId, 15000, day2);

    await gotoBilling(page, { dateFrom: day1, dateTo: day2 });
    // 2 rows expected (top-up + manual cash), NOT 3 — the automatic "Ricariche" twin of the top-up must be hidden.
    await expect(billingRows(page)).toHaveCount(2);
    await expect(billingRows(page).nth(0)).toContainText('Ricarica');
    await expect(billingRows(page).nth(0)).toContainText(pilot.lastName);
    await expect(billingRows(page).nth(1)).toContainText('Voce cassa manuale');
  });

  test('a package sale twin (PACKAGE_PURCHASE amount 0) surfaces as ONE row on the CASH side, person derived through the link, no row actions (AC 1/3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotPerson(page, 'Pacchetto');
    const typeName = `Pacchetto-${uniqueSuffix()}`;
    const packageTypeId = await createPackageType(page, { name: typeName, includedMinutes: 300, priceCents: 12000 });
    const { day1 } = uniqueDatePair();

    await sellPackage(page, pilot.personId, packageTypeId, day1);

    await gotoBilling(page, { dateFrom: day1, dateTo: day1 });
    await expect(billingRows(page)).toHaveCount(1);
    const row = billingRows(page).first();
    await expect(row).toContainText(pilot.lastName);
    await expect(row).toContainText(/120,00\s€/);
    // Derived/automatic twin: no Rettifica/Storna action.
    await expect(row.getByTestId('transaction-adjust-action')).toHaveCount(0);
    await expect(row.getByTestId('transaction-reverse-action')).toHaveCount(0);
  });

  test('Tipo filter (movementType via URL) narrows to the account vocabulary only', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotPerson(page, 'TipoFiltro');
    const { day1 } = uniqueDatePair();
    await recordTopUp(page, pilot.personId, 8000, day1);

    await gotoBilling(page, { dateFrom: day1, dateTo: day1, type: 'TOP_UP' });
    await expect(billingRows(page)).toHaveCount(1);

    await gotoBilling(page, { dateFrom: day1, dateTo: day1, type: 'ADJUSTMENT' });
    await expect(page.getByTestId('billing-empty')).toBeVisible();
  });

  test('Categoria cassa filter (Tipo select, cash optgroup) narrows to that category only', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = `Cat-${uniqueSuffix()}`;
    const categoryId = await createCategory(page, categoryName);
    const other = await createCategory(page, `Altra-${uniqueSuffix()}`);
    const { day1 } = uniqueDatePair();
    await recordCashMovement(page, categoryId, 3000, day1, 'Riga categoria A');
    await recordCashMovement(page, other, 4000, day1, 'Riga categoria B');

    await gotoBilling(page, { dateFrom: day1, dateTo: day1 });
    await expect(billingRows(page)).toHaveCount(2);

    await page.getByTestId('billing-filter-type').selectOption(categoryId);
    await expect(page).toHaveURL(new RegExp(`type=${categoryId}`));
    await expect(billingRows(page)).toHaveCount(1);
    await expect(billingRows(page).first()).toContainText('Riga categoria A');
  });

  test('Pilota filter (typed picker, URL-driven) narrows to that person only', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilotA = await createPilotPerson(page, 'FiltroA');
    const pilotB = await createPilotPerson(page, 'FiltroB');
    const { day1 } = uniqueDatePair();
    await recordTopUp(page, pilotA.personId, 5000, day1);
    await recordTopUp(page, pilotB.personId, 6000, day1);

    await gotoBilling(page, { dateFrom: day1, dateTo: day1, personId: pilotA.personId });
    await expect(page).toHaveURL(new RegExp(`personId=${pilotA.personId}`));
    await expect(billingRows(page)).toHaveCount(1);
    await expect(billingRows(page).first()).toContainText(pilotA.lastName);
  });

  test('KPI row is the TRUE current-month aggregate and does NOT change when the table filters do (ratifica 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoBilling(page, {});
    await page.waitForSelector('.kpi-row');
    const before = await page.locator('.kpi-row .kpi .kpi-value').allTextContents();

    // A date filter that excludes everything (far future) — table goes empty, KPI must stay identical.
    const emptyDay = dateAt(50_000);
    await page.getByTestId('billing-filter-date-from').fill(emptyDay);
    await page.getByTestId('billing-filter-date-to').fill(emptyDay);
    await expect(page).toHaveURL(new RegExp(`dateFrom=${emptyDay}`));
    await expect(page.getByTestId('billing-empty')).toBeVisible();

    const after = await page.locator('.kpi-row .kpi .kpi-value').allTextContents();
    expect(after).toEqual(before);
  });
});

test.describe('"Nuova transazione" — 3 branches (Story 12.9, AC 4)', () => {
  test('Pagamento (top-up): the account balance updates and the result panel shows it', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotPerson(page, 'NuovoPagamento');
    const before = await accountBalance(page, pilot.personId);

    await gotoBilling(page, {});
    await page.getByTestId('billing-new-transaction-button').click();
    await page.waitForSelector('[data-testid="transaction-form"]');
    await selectFromCombobox(page.getByTestId('transaction-person'), pilot.lastName, personOptionLabel(pilot));
    await page.getByTestId('transaction-amount').fill('100');
    await page.getByTestId('transaction-submit').click();

    await expect(page.getByTestId('transaction-result-panel')).toBeVisible();
    await expect(page.getByTestId('transaction-result-balance')).toContainText(/100,00\s€/);
    await page.getByTestId('transaction-result-close').click();

    const after = await accountBalance(page, pilot.personId);
    expect(after).toBe(before + 10000);
  });

  test('Addebito conto (standalone adjustment): the account balance decreases', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotPerson(page, 'NuovoAddebito');
    const before = await accountBalance(page, pilot.personId);

    await gotoBilling(page, {});
    await page.getByTestId('billing-new-transaction-button').click();
    await page.waitForSelector('[data-testid="transaction-form"]');
    await page.getByTestId('transaction-kind').selectOption('adjustment');
    await selectFromCombobox(page.getByTestId('transaction-person'), pilot.lastName, personOptionLabel(pilot));
    await page.getByTestId('transaction-amount').fill('30');
    await page.getByTestId('transaction-reason').fill('Addebito di verifica e2e');
    await page.getByTestId('transaction-submit').click();

    await expect(page.getByTestId('transaction-result-panel')).toBeVisible();
    await expect(page.getByTestId('transaction-result-balance')).toContainText(/-30,00\s€/);

    const after = await accountBalance(page, pilot.personId);
    expect(after).toBe(before - 3000);
  });

  test('Movimento cassa: a new row appears in the ledger under the chosen category', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = `Nuova-${uniqueSuffix()}`;
    const categoryId = await createCategory(page, categoryName);

    await gotoBilling(page, {});
    await page.getByTestId('billing-new-transaction-button').click();
    await page.waitForSelector('[data-testid="transaction-form"]');
    await page.getByTestId('transaction-kind').selectOption('cash');
    await page.getByTestId('transaction-category').selectOption({ label: categoryName });
    await page.getByTestId('transaction-direction').selectOption('out');
    await page.getByTestId('transaction-amount').fill('15');
    await page.getByTestId('transaction-description').fill('Movimento cassa e2e');
    await page.getByTestId('transaction-submit').click();
    await expect(page.getByTestId('transaction-result-panel')).toBeVisible();
    await page.getByTestId('transaction-result-close').click();

    await gotoBilling(page, { type: categoryId });
    await expect(billingRows(page)).toHaveCount(1);
    await expect(billingRows(page).first()).toContainText(/-15,00\s€/);
  });
});

test.describe('Rettifica / Storna row actions (Story 12.9, AC 3)', () => {
  test('Rettifica on a TOP_UP via the row action; a second rettifica on the SAME movement is rejected 409', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotPerson(page, 'Rettifica');
    const { day1 } = uniqueDatePair();
    await recordTopUp(page, pilot.personId, 20000, day1);

    await gotoBilling(page, { dateFrom: day1, dateTo: day1 });
    const row = billingRows(page).first();
    await row.getByTestId('transaction-adjust-action').click();
    await page.waitForSelector('[data-testid="transaction-adjust-panel"]');
    await page.getByTestId('transaction-adjust-amount').fill('-50');
    await page.getByTestId('transaction-adjust-reason').fill('Rettifica di verifica e2e');
    await page.getByTestId('transaction-adjust-confirm').click();
    await expect(page.getByTestId('billing-adjust-feedback')).toHaveText('Rettifica registrata.');

    // Fetch the original movement id and attempt a second, direct API rettifica -> 409.
    const movementsResponse = await page.request.get(`/api/v1/people/${pilot.personId}/account/movements`);
    const movements = (await movementsResponse.json()) as { items: Array<{ id: string; type: string }> };
    const originalId = movements.items.find((item) => item.type === 'TOP_UP')!.id;
    const second = await page.request.post(`/api/v1/people/${pilot.personId}/account/adjustments`, {
      data: { amountCents: -100, reason: 'Secondo tentativo', originalMovementId: originalId },
    });
    expect(second.status()).toBe(409);
  });

  test('Storna on a manual cash movement via the row action; a derived (package twin) row offers no action', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = `Storna-${uniqueSuffix()}`;
    const categoryId = await createCategory(page, categoryName);
    const { day1 } = uniqueDatePair();
    await recordCashMovement(page, categoryId, -4000, day1, 'Uscita da stornare');

    // Filtered by the (unique, single-use) category — NOT by date: `reverseCashMovement`
    // always dates the storno row as TODAY (server clock), not the original's `day1`
    // (a far-future isolation date), so a date-scoped filter would hide the storno row.
    await gotoBilling(page, { type: categoryId });
    const row = billingRows(page).filter({ hasText: 'Uscita da stornare' });
    await row.getByTestId('transaction-reverse-action').click();
    await page.waitForSelector('[data-testid="transaction-reverse-panel"]');
    await page.getByTestId('transaction-reverse-reason').fill('Storno di verifica e2e');
    await page.getByTestId('transaction-reverse-confirm').click();
    await expect(page.getByTestId('billing-reverse-feedback')).toHaveText('Storno registrato.');
    await expect(billingRows(page)).toHaveCount(2);
    await expect(billingRows(page).filter({ hasText: 'Uscita da stornare' }).getByTestId('transaction-reverse-action')).toHaveCount(0);
  });
});

test.describe('Estratti conto PDF + RBAC (Story 12.9, AC 5/8)', () => {
  test('the statements dialog builds a working PDF download link (200, application/pdf)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotPerson(page, 'Estratto');
    const { day1, day2 } = uniqueDatePair();

    await gotoBilling(page, {});
    await page.getByTestId('billing-statements-button').click();
    await page.waitForSelector('[data-testid="statement-dialog"]');
    await selectFromCombobox(page.getByTestId('statement-person'), pilot.lastName, personOptionLabel(pilot));
    await page.getByTestId('statement-date-from').fill(day1);
    await page.getByTestId('statement-date-to').fill(day2);

    const href = await page.getByTestId('statement-submit').getAttribute('href');
    expect(href).toContain(`/api/v1/people/${pilot.personId}/account/pdf`);
    expect(href).toContain(`from=${day1}`);
    expect(href).toContain(`to=${day2}`);

    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
  });

  test('a pilot is redirected away from /dashboard/billing and gets a 403 AD-8 envelope from GET /api/v1/transactions', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.goto('/it/dashboard/billing');
    await expect(page).toHaveURL(/\/it\/dashboard$/);

    const response = await page.request.get('/api/v1/transactions');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
