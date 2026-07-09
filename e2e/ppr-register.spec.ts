import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * PPR register: closure (complete/cancel), landing fee, filters (epic 8,
 * story 8.3, AC 1/2; FR-24). Requests are created via the PUBLIC POST
 * (`POST /api/v1/ppr-requests`, story 8.1) with run-unique fake
 * `x-forwarded-for` IPs and unique emails/registrations, then approved via
 * the authenticated API — same pattern as `ppr-queue.spec.ts` (the dev DB is
 * never reset between runs).
 *
 * **Serial within this file** (`test.describe.configure`, same rationale as
 * `ppr-queue.spec.ts`): the register's `status=APPROVED`/`COMPLETED`/
 * `CANCELLED` views are shared, mutable, GLOBAL, paginated state (`page.tsx`)
 * — a complete/cancel in one test moves a row OUT of the `APPROVED` view and
 * INTO another, which can shift every other still-`APPROVED` row's page
 * number mid-run exactly like the queue's own FIFO race. `gotoRegisterLastPage`
 * below is the same defensive navigation `ppr-queue.spec.ts#gotoQueueLastPage`
 * uses, parametrized by status.
 *
 * **The admin-configured default landing fee is GLOBAL, single-row state**
 * (`AppSetting`, AC 1) — only the first test in this file writes it via the
 * UI; every later test either overrides it explicitly (fee 0) or does not
 * depend on its exact value, so serial execution (above) is enough to avoid
 * any race on it.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const STAFF_EMAIL = 'staff@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/ppr-register.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as `ppr-queue.spec.ts`. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** The "Esci" button only lives on `/dashboard` itself — navigate there first (same as `ppr-queue.spec.ts`). */
async function logout(page: Page): Promise<void> {
  await page.goto('/it/dashboard');
  await page.getByRole('button', { name: 'Esci' }).click();
  await expect(page).toHaveURL(/\/it\/login$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueFakeIp(): string {
  return `e2e-ppr-register-${uniqueSuffix()}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@e2e.airmanager.local`;
}

function uniqueRegistration(prefix: string): string {
  return `I-${prefix}${uniqueSuffix().replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()}`;
}

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

/** Creates a PENDING PPR request via the public POST (story 8.1), a run-unique fake IP per call (never a fixed one, same rule as `ppr-queue.spec.ts`). */
async function createPendingRequest(page: Page, hoursFromNow = 5): Promise<{ registration: string; email: string }> {
  const registration = uniqueRegistration('R');
  const email = uniqueEmail('ppr-register');

  const response = await page.request.post('/api/v1/ppr-requests', {
    headers: { 'x-forwarded-for': uniqueFakeIp() },
    data: {
      firstName: 'Register',
      lastName: `Test-${uniqueSuffix()}`,
      email,
      phone: '+39 333 0000000',
      aircraftRegistration: registration,
      aircraftType: 'Cessna 172',
      origin: 'LIRN Napoli',
      destination: 'LIRU Urbe',
      eta: futureIso(hoursFromNow),
      personsOnBoard: 1,
      locale: 'it',
    },
  });
  expect(response.status()).toBe(201);

  return { registration, email };
}

/** Looks up a PENDING request's id by its (unique) aircraft registration, via the staff/admin-authenticated list endpoint. */
async function findPendingId(page: Page, registration: string): Promise<string> {
  const response = await page.request.get('/api/v1/ppr-requests?status=PENDING&pageSize=100');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: { id: string; aircraftRegistration: string }[] };
  const match = body.items.find((item) => item.aircraftRegistration === registration);
  if (!match) {
    throw new Error(`PENDING PprRequest with registration ${registration} not found via GET /api/v1/ppr-requests`);
  }
  return match.id;
}

/** Creates + approves a request in one call (caller must already be logged in as an actor with `ppr.manage`). */
async function createApprovedRequest(page: Page, hoursFromNow = 5): Promise<{ id: string; pprNumber: string; registration: string }> {
  const { registration } = await createPendingRequest(page, hoursFromNow);
  const id = await findPendingId(page, registration);

  const approveResponse = await page.request.post(`/api/v1/ppr-requests/${id}/approve`);
  expect(approveResponse.status()).toBe(200);
  const approveBody = (await approveResponse.json()) as { pprNumber: string };

  return { id, pprNumber: approveBody.pprNumber, registration };
}

const UI_REGISTER_PAGE_SIZE = 20;

/**
 * Same rationale as `ppr-queue.spec.ts#gotoQueueLastPage`: the register's
 * per-status view is FIFO (`createdAt asc`) and never reset between runs, so
 * a request just created/closed is always the NEWEST row under its current
 * status — it lands on the LAST page once the accumulated backlog exceeds
 * `UI_REGISTER_PAGE_SIZE`.
 */
async function gotoRegisterLastPage(page: Page, status: string): Promise<void> {
  const response = await page.request.get(`/api/v1/ppr-requests?status=${status}&pageSize=${UI_REGISTER_PAGE_SIZE}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { total: number };
  const lastPage = Math.max(1, Math.ceil(body.total / UI_REGISTER_PAGE_SIZE));
  await page.goto(`/it/dashboard/ppr/register?status=${status}&page=${lastPage}`);
}

/** The seeded "PPR" cash category's id (`prisma/seed.ts`) — resolved once per test via the API. */
async function pprCategoryId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/cash-categories');
  expect(response.status()).toBe(200);
  const categories = (await response.json()) as { id: string; name: string }[];
  const match = categories.find((category) => category.name === 'PPR');
  if (!match) {
    throw new Error('Seeded "PPR" cash category not found via GET /api/v1/cash-categories');
  }
  return match.id;
}

/** Total cash-movement count in the given category — same "total via the list endpoint" technique as `idempotency.spec.ts#movementCount`. */
async function movementCount(page: Page, categoryId: string): Promise<number> {
  const response = await page.request.get(`/api/v1/cash-movements?categoryId=${categoryId}&pageSize=1`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { total: number };
  return body.total;
}

function registerRows(page: Page) {
  return page.getByTestId('ppr-register-row');
}

test.describe('PPR register: closure, landing fee, filters (Story 8.3, AC 1/2; FR-24)', () => {
  // Module doc-comment: the shared, paginated per-status register views are
  // mutable, global state that decisions in THIS file's own tests shift.
  test.describe.configure({ mode: 'serial' });

  test('admin sets the default landing fee via the settings section; staff completes an APPROVED request from the register with the PREFILLED default: the row turns COMPLETED with the formatted fee, and a matching cash movement lands in the "PPR" category (AC 1)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const created = await createApprovedRequest(page);

    // --- Admin: set the default landing fee via the UI (AC 1) ------------
    await page.goto('/it/dashboard/ppr');
    await page.getByTestId('ppr-landing-fee-amount').fill('43,21');
    await page.getByTestId('ppr-landing-fee-save').click();
    await expect(page.getByTestId('ppr-landing-fee-feedback')).toHaveText('Tassa salvata.');
    await logout(page);

    // --- Staff: complete from the register, fee PREFILLED from the default ---
    await loginExpectingDashboard(page, STAFF_EMAIL);
    await gotoRegisterLastPage(page, 'APPROVED');
    await expect(page.getByText(created.registration)).toBeVisible();

    const row = registerRows(page).filter({ hasText: created.registration });
    await row.getByTestId('ppr-register-complete-button').click();
    await expect(page.getByTestId('ppr-complete-fee-input')).toHaveValue('43,21');
    await page.getByTestId('ppr-complete-submit').click();
    await expect(page.getByTestId('ppr-register-feedback')).toHaveText('PPR completato.');

    // --- The row is now COMPLETED, with the fee formatted ----------------
    await gotoRegisterLastPage(page, 'COMPLETED');
    const updatedRow = registerRows(page).filter({ hasText: created.registration });
    await expect(updatedRow).toContainText('Completato');
    await expect(updatedRow).toContainText(/43,21\s€/);

    // --- Cash register: the matching movement in the "PPR" category (pattern cash-register.spec.ts) ---
    await page.goto('/it/dashboard/finance');
    await page.getByTestId('cash-filter-category').selectOption({ label: 'PPR' });
    const movementRow = page.getByTestId('cash-register-table').locator('tbody tr').filter({ hasText: created.pprNumber });
    await expect(movementRow).toBeVisible();
    await expect(movementRow).toContainText(/\+43,21\s€/);
  });

  test('completing with the fee cleared to 0,00 (overriding whatever the current default is): the row turns COMPLETED with landingFeeCents 0, and creates NO new cash movement (AC 1, "tassa zero -> nessun movimento")', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const created = await createApprovedRequest(page);
    const categoryId = await pprCategoryId(page);
    const before = await movementCount(page, categoryId);

    await gotoRegisterLastPage(page, 'APPROVED');
    const row = registerRows(page).filter({ hasText: created.registration });
    await row.getByTestId('ppr-register-complete-button').click();
    await page.getByTestId('ppr-complete-fee-input').fill('0,00');
    await page.getByTestId('ppr-complete-submit').click();
    await expect(page.getByTestId('ppr-register-feedback')).toHaveText('PPR completato.');

    await gotoRegisterLastPage(page, 'COMPLETED');
    const updatedRow = registerRows(page).filter({ hasText: created.registration });
    await expect(updatedRow).toContainText('Completato');
    await expect(updatedRow).toContainText(/0,00\s€/);

    expect(await movementCount(page, categoryId)).toBe(before);
  });

  test('"Annulla PPR" from the register: two-step confirm, the row turns CANCELLED, no fee and no cash movement (AC 2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const created = await createApprovedRequest(page);
    const categoryId = await pprCategoryId(page);
    const before = await movementCount(page, categoryId);

    await gotoRegisterLastPage(page, 'APPROVED');
    const row = registerRows(page).filter({ hasText: created.registration });
    await row.getByTestId('ppr-register-cancel-button').click();
    await row.getByTestId('ppr-register-cancel-confirm').click();
    await expect(page.getByTestId('ppr-register-feedback')).toHaveText('PPR annullato.');

    await gotoRegisterLastPage(page, 'CANCELLED');
    const updatedRow = registerRows(page).filter({ hasText: created.registration });
    await expect(updatedRow).toContainText('Annullato');
    await expect(updatedRow).toContainText('—');

    expect(await movementCount(page, categoryId)).toBe(before);
  });

  test('POST .../complete on a PENDING (never-approved) request answers 409 PPR_NOT_APPROVED, AD-8 envelope', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const { registration } = await createPendingRequest(page);
    const id = await findPendingId(page, registration);

    const response = await page.request.post(`/api/v1/ppr-requests/${id}/complete`, { data: { landingFeeCents: 1000 } });
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: 'PPR_NOT_APPROVED' } });
  });

  test('replaying the same Idempotency-Key on complete creates exactly ONE cash movement (TD-2 + story 8.3 atomicity: the replay is semantically identical, never a second execution)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const created = await createApprovedRequest(page);
    const key = crypto.randomUUID();
    const body = { landingFeeCents: 2500 };

    const first = await page.request.post(`/api/v1/ppr-requests/${created.id}/complete`, {
      data: body,
      headers: { 'Idempotency-Key': key },
    });
    expect(first.status()).toBe(200);
    expect(first.headers()['idempotency-replayed']).toBeUndefined();

    const second = await page.request.post(`/api/v1/ppr-requests/${created.id}/complete`, {
      data: body,
      headers: { 'Idempotency-Key': key },
    });
    expect(second.status()).toBe(200);
    expect(second.headers()['idempotency-replayed']).toBe('true');

    const categoryId = await pprCategoryId(page);
    const movementsResponse = await page.request.get(`/api/v1/cash-movements?categoryId=${categoryId}&pageSize=100`);
    expect(movementsResponse.status()).toBe(200);
    const movementsBody = (await movementsResponse.json()) as { items: { description: string | null }[] };
    const matches = movementsBody.items.filter((item) => item.description === `PPR ${created.pprNumber} landing fee`);
    expect(matches).toHaveLength(1);
  });

  test('register filters by status and period: a request with a distinctive far-future ETA is found within its own day and status, and disappears outside either (AC 2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    // 96h out: a distinct calendar day from every other test's ~5h-ahead (today) ETA.
    const created = await createApprovedRequest(page, 96);
    const etaDateOnly = new Date(Date.now() + 96 * 3_600_000).toISOString().slice(0, 10);
    const dayBefore = new Date(Date.now() + 96 * 3_600_000 - 24 * 3_600_000).toISOString().slice(0, 10);

    // --- Status + period match: visible ------------------------------------
    await page.goto(`/it/dashboard/ppr/register?status=APPROVED&from=${etaDateOnly}&to=${etaDateOnly}`);
    await expect(page.getByText(created.registration)).toBeVisible();

    // --- Status filter mismatch (REJECTED): not visible --------------------
    await page.getByTestId('ppr-register-filter-status').selectOption('REJECTED');
    await expect(page).toHaveURL(/status=REJECTED/);
    await expect(page.getByText(created.registration)).toHaveCount(0);

    // --- Period filter: `to` set to the day BEFORE the eta excludes it -----
    await page.goto(`/it/dashboard/ppr/register?status=APPROVED&from=${etaDateOnly}&to=${etaDateOnly}`);
    await expect(page.getByText(created.registration)).toBeVisible();
    await page.getByTestId('ppr-register-filter-to').fill(dayBefore);
    await expect(page).toHaveURL(new RegExp(`to=${dayBefore}`));
    await expect(page.getByText(created.registration)).toHaveCount(0);
  });
});
