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

/**
 * A run-unique isolation date SAFELY IN THE PAST (unlike `dateAt`/
 * `uniqueDatePair`'s own far-future scheme) — `registerFlight` rejects a
 * future `takeoffAt` with a 422 `FLIGHT_DATE_IN_FUTURE`
 * (`flights.service.ts`), so any scenario involving a real flight charge
 * needs a past isolation date instead. Counts backward from a fixed 2022
 * epoch, capped so it never goes earlier than `createAircraftWithRate`'s own
 * `validFrom` (`2020-01-01`, or the rate lookup finds none) — and stays
 * clear of the exact `PAST_DATE = '2020-01-01'` constant several OTHER spec
 * files share, for the same low-collision-probability reason `dateAt` is.
 */
function uniquePastDateOnly(): string {
  const dayOffset = Math.floor(Math.random() * 700);
  return new Date(Date.UTC(2022, 0, 1) - dayOffset * 86_400_000).toISOString().slice(0, 10);
}

/** Today, `YYYY-MM-DD` (server clock, UTC) — the three riquadri (story Billing-2, AC 1) are ALWAYS the current calendar month, never date-filterable, so a scenario that verifies their arithmetic must be dated today. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
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

/** Creates a fresh instructor person (active profile only — `recordPayout` doesn't require an accrued "owed" balance). */
async function createInstructorPerson(page: Page, tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Istruttore';
  const lastName = `${tag}-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, { data: { ratings: 'FI(A)' } });
  expect(profileResponse.status()).toBe(200);
  return { personId: person.id, firstName, lastName };
}

/** Creates an aircraft with a rate in effect since a safely-past date (same pattern as `flight-reversal.spec.ts`). */
async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-BL${suffix}`.toUpperCase().slice(0, 20);
  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 500 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };
  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
    data: { priceCentsPerHour, validFrom: '2020-01-01' },
  });
  expect(rateResponse.status()).toBe(201);
  return { id: aircraft.id, registration };
}

async function createCategory(page: Page, name: string): Promise<string> {
  const response = await page.request.post('/api/v1/cash-categories', { data: { name } });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return created.id;
}

async function recordTopUp(page: Page, personId: string, amountCents: number, effectiveDate: string, method: 'CASH' | 'BANK_TRANSFER' | 'POS' = 'BANK_TRANSFER'): Promise<void> {
  const response = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
    data: { amountCents, paymentMethod: method, effectiveDate },
  });
  expect(response.status()).toBe(200);
}

async function recordCashMovement(page: Page, categoryId: string, amountCents: number, effectiveDate: string, description: string): Promise<void> {
  const response = await page.request.post('/api/v1/cash-movements', { data: { categoryId, amountCents, paymentMethod: 'CASH', effectiveDate, description } });
  expect(response.status()).toBe(201);
}

/** Registers a TOURISM flight charge via the API — the "volo" leg of the three-riquadri scenario (AC 6). */
async function registerTourismFlight(page: Page, aircraftId: string, personId: string, dateOnly: string, minutes: number): Promise<void> {
  const takeoffAt = `${dateOnly}T10:00:00.000Z`;
  const landingAt = new Date(new Date(takeoffAt).getTime() + minutes * 60_000).toISOString();
  const response = await page.request.post('/api/v1/flights', {
    data: { aircraftId, personId, departureAirfield: 'Base Airfield', arrivalAirfield: 'Base Airfield', flightType: 'TOURISM', takeoffAt, landingAt },
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

/**
 * Parses an Intl-formatted EUR string (e.g. "1.234,56 €", "-40,00 €") back to
 * integer cents — test-only hardening (no application code touched), needed
 * to assert BEFORE/AFTER deltas on the three riquadri (AC 6) without knowing
 * the ambient baseline every other spec's run has left behind this month.
 */
function parseEuroText(text: string): number {
  const normalized = text.replace(/−/g, '-').replace(/[^\d,.-]/g, '');
  const cleaned = normalized.replace(/\./g, '').replace(',', '.');
  return Math.round(Number.parseFloat(cleaned) * 100);
}

async function panelValueCents(page: Page, testId: string): Promise<number> {
  const text = await page.getByTestId(testId).innerText();
  return parseEuroText(text);
}

test.describe('Unified billing ledger (Story 12.9; Entrate/Uscite + bookType columns, story Billing-2)', () => {
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

  test('bookType filter (story Billing-2, AC 2): DEPOSIT narrows to acconti (TOP_UP), REVENUE narrows to ricavi — independent of the "Categoria" filter', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotPerson(page, 'TipoFiltro');
    const category = await createCategory(page, `TipoFiltro-${uniqueSuffix()}`);
    const { day1 } = uniqueDatePair();
    await recordTopUp(page, pilot.personId, 8000, day1);
    await recordCashMovement(page, category, 3000, day1, 'Entrata cassa');

    await gotoBilling(page, { dateFrom: day1, dateTo: day1, bookType: 'DEPOSIT' });
    await expect(billingRows(page)).toHaveCount(1);
    await expect(billingRows(page).first()).toContainText('Ricarica');

    await gotoBilling(page, { dateFrom: day1, dateTo: day1, bookType: 'REVENUE' });
    await expect(billingRows(page)).toHaveCount(1);
    await expect(billingRows(page).first()).toContainText('Entrata cassa');
  });

  test('Categoria filter (cash categories only, replaces the old combined Tipo select) narrows to that category only', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = `Cat-${uniqueSuffix()}`;
    const categoryId = await createCategory(page, categoryName);
    const other = await createCategory(page, `Altra-${uniqueSuffix()}`);
    const { day1 } = uniqueDatePair();
    await recordCashMovement(page, categoryId, 3000, day1, 'Riga categoria A');
    await recordCashMovement(page, other, 4000, day1, 'Riga categoria B');

    await gotoBilling(page, { dateFrom: day1, dateTo: day1 });
    await expect(billingRows(page)).toHaveCount(2);

    await page.getByTestId('billing-filter-category').selectOption(categoryId);
    await expect(page).toHaveURL(new RegExp(`categoryId=${categoryId}`));
    await expect(billingRows(page)).toHaveCount(1);
    await expect(billingRows(page).first()).toContainText('Riga categoria A');
  });

  test('Pilota filter (free-text, debounced like Piloti, URL-driven) narrows to that person only (story 13.5, AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilotA = await createPilotPerson(page, 'FiltroA');
    const pilotB = await createPilotPerson(page, 'FiltroB');
    const { day1 } = uniqueDatePair();
    await recordTopUp(page, pilotA.personId, 5000, day1);
    await recordTopUp(page, pilotB.personId, 6000, day1);

    await gotoBilling(page, { dateFrom: day1, dateTo: day1 });
    await expect(billingRows(page)).toHaveCount(2);

    await page.getByTestId('billing-filter-person').fill(pilotA.lastName);
    await expect(page).toHaveURL(new RegExp(`personQuery=${encodeURIComponent(pilotA.lastName)}`));
    await expect(billingRows(page)).toHaveCount(1);
    await expect(billingRows(page).first()).toContainText(pilotA.lastName);
  });

  test('the pilot cell shows only the name, no raw row id underneath (story 13.5, AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotPerson(page, 'NoRowId');
    const { day1 } = uniqueDatePair();
    await recordTopUp(page, pilot.personId, 5000, day1);

    await gotoBilling(page, { dateFrom: day1, dateTo: day1 });
    const row = billingRows(page).first();
    await expect(row).toContainText(pilot.lastName);
    await expect(row.locator('.student-sub')).toHaveCount(0);
  });

  test('Entrate/Uscite columns (story Billing-2, AC 2): a TOP_UP (acconto) shows in Entrate, a FLIGHT_CHARGE (ricavo) shows in Uscite — the old signed "Importo" column and its club-centric flip are gone', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotPerson(page, 'EntUsc');
    const aircraft = await createAircraftWithRate(page, 12000); // 120,00 €/h
    // A past isolation date (NOT uniqueDatePair's future one) — registerFlight rejects a future takeoffAt.
    const day1 = uniquePastDateOnly();
    await recordTopUp(page, pilot.personId, 5000, day1);
    await registerTourismFlight(page, aircraft.id, pilot.personId, day1, 30); // 30' @ 120,00 €/h = 60,00 €

    await gotoBilling(page, { dateFrom: day1, dateTo: day1 });
    await expect(billingRows(page)).toHaveCount(2);

    const depositRow = billingRows(page).filter({ hasText: 'Ricarica' });
    await expect(depositRow).toContainText(/50,00\s€/);
    await expect(depositRow.getByText('Acconto', { exact: true })).toBeVisible();
    await expect(depositRow).toContainText('non incide sul risultato');

    const chargeRow = billingRows(page).filter({ hasText: 'Addebito volo' });
    await expect(chargeRow).toContainText(/60,00\s€/);
    await expect(chargeRow.getByText('Ricavo', { exact: true })).toBeVisible();
  });

  // Review F4: the "three riquadri stay put under table filters" invariant
  // MOVED to e2e/billing-global.spec.ts (its own serialized `billing-global`
  // Playwright project) — it reads before/after ALL-TIME aggregates with
  // nothing but a client-side filter change in between, and flaked 2/2 runs
  // here under fullyParallel whenever a concurrent worker wrote to the
  // ledger in that window.
});

test.describe('Tre riquadri con numeri veri da scenario seminato (story Billing-2, AC 6)', () => {
  test('ricarica + volo + payout, tutti dated today, move Risultato/Liquidità/Acconti by EXACTLY the expected deltas', async ({ page }) => {
    test.slow();
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const pilot = await createPilotPerson(page, 'Riquadri');
    const instructor = await createInstructorPerson(page, 'Riquadri');
    const aircraft = await createAircraftWithRate(page, 10000); // 100,00 €/h
    const today = todayDateOnly();

    await gotoBilling(page, {});
    await page.waitForSelector('[data-testid="billing-panel-result"]');
    const revenueBefore = await panelValueCents(page, 'billing-panel-revenue');
    const costBefore = await panelValueCents(page, 'billing-panel-cost');
    const netBefore = await panelValueCents(page, 'billing-panel-net');
    const bankBefore = await panelValueCents(page, 'billing-panel-bank');
    const depositsTotalBefore = await panelValueCents(page, 'billing-panel-deposits-total');

    // Ricarica: +200,00 € (BANK_TRANSFER) — acconto, entra in banca, aumenta il debito verso il pilota.
    await recordTopUp(page, pilot.personId, 20000, today, 'BANK_TRANSFER');
    // Volo: 60' @ 100,00 €/h = 100,00 € — ricavo, addebita il conto del pilota (nessun movimento di cassa).
    await registerTourismFlight(page, aircraft.id, pilot.personId, today, 60);
    // Payout istruttore: 30,00 € (BANK_TRANSFER) — costo, esce dalla banca.
    const payoutResponse = await page.request.post('/api/v1/instructor-payouts', {
      headers: { 'Idempotency-Key': `e2e-billing2-${uniqueSuffix()}` },
      data: { instructorPersonId: instructor.personId, amountCents: 3000, periodStart: today, periodEnd: today, method: 'BANK_TRANSFER', notes: null },
    });
    expect(payoutResponse.status()).toBe(201);

    await page.reload();
    await page.waitForSelector('[data-testid="billing-panel-result"]');
    const revenueAfter = await panelValueCents(page, 'billing-panel-revenue');
    const costAfter = await panelValueCents(page, 'billing-panel-cost');
    const netAfter = await panelValueCents(page, 'billing-panel-net');
    const bankAfter = await panelValueCents(page, 'billing-panel-bank');
    const depositsTotalAfter = await panelValueCents(page, 'billing-panel-deposits-total');

    expect(revenueAfter - revenueBefore).toBe(10000); // +100,00 € (il volo)
    // The "Costi" riquadro DISPLAYS the negative of the domain costCents value
    // (billing-panels.tsx: `formatCents(-result.costCents, ...)`, matching the
    // design mock "Costi −2.310 €") — a cost INCREASE of 3000 therefore reads
    // as a DISPLAYED delta of -3000, not +3000.
    expect(costAfter - costBefore).toBe(-3000); // shown value moves from 0,00 € to -30,00 €
    expect(netAfter - netBefore).toBe(10000 - 3000);
    expect(bankAfter - bankBefore).toBe(20000 - 3000); // ricarica in, payout out, stesso metodo
    // Il pilota parte da saldo 0 (persona nuova): +200,00 (ricarica) - 100,00 (addebito volo) = +100,00 nel suo conto.
    expect(depositsTotalAfter - depositsTotalBefore).toBe(10000);
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

  test('Movimento cassa: a new row appears in the ledger under the chosen category, in the Uscite column (story Billing-2)', async ({ page }) => {
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

    await gotoBilling(page, { categoryId });
    await expect(billingRows(page)).toHaveCount(1);
    await expect(billingRows(page).first()).toContainText(/15,00\s€/);
    await expect(billingRows(page).first().getByText('Costo', { exact: true })).toBeVisible();
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

  test('Storna on a manual cash movement via the row action', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const categoryName = `Storna-${uniqueSuffix()}`;
    const categoryId = await createCategory(page, categoryName);
    const { day1 } = uniqueDatePair();
    await recordCashMovement(page, categoryId, -4000, day1, 'Uscita da stornare');

    // Filtered by the (unique, single-use) category — NOT by date: `reverseCashMovement`
    // always dates the storno row as TODAY (server clock), not the original's `day1`
    // (a far-future isolation date), so a date-scoped filter would hide the storno row.
    await gotoBilling(page, { categoryId });
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

// Review F4/F5: the secchiello reclassify test ("Secchiello dei non
// attribuiti") MOVED to e2e/billing-global.spec.ts — it consumes the ONE
// seeded unattributed fixture (`prisma/seed.ts`) via a real write, and its
// old guard (skip when the link doesn't render) was indistinguishable from a
// genuine regression; the new guard checks the seed's own description
// marker directly via the API instead.

// Story 13.5, AC 4: the "Estratti conto" dialog is REMOVED from billing (UI
// only — `/api/v1/people/{id}/account/pdf` itself stays, exercised by the
// scheda persona's own estratto conto section, `pdf-exports.spec.ts` and
// `person-detail.spec.ts` — never touched here).
test.describe('Billing RBAC (Story 12.9, AC 8)', () => {
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
