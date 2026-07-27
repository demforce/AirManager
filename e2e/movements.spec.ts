import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Voli in transito / movements register: closure (complete/cancel), landing
 * fee, filters, derived status (epic 8, story 8.3, AC 1/2; FR-24 — rebuilt
 * epic 12, story 12.4, AC 3). RENAMED from `ppr-register.spec.ts`
 * (`/dashboard/ppr/register` was ELIMINATED, replaced by
 * `/dashboard/movements`) — every pre-12.4 behavioral test below is carried
 * over UNCHANGED in substance (only the URL and the feedback mechanism —
 * toast instead of a persistent `role="status"` paragraph — differ), plus
 * two NEW tests for the derived atteso/in-arrivo/al-suolo status and
 * "Registra arrivo".
 *
 * Requests are created via the PUBLIC POST (`POST /api/v1/ppr-requests`,
 * story 8.1) with run-unique fake `x-forwarded-for` IPs and unique
 * emails/registrations, then approved via the authenticated API — same
 * pattern as `ppr-queue.spec.ts` (the dev DB is never reset between runs).
 *
 * **Serial within this file** (`test.describe.configure`, same rationale as
 * `ppr-queue.spec.ts`): the register's `status=APPROVED`/`COMPLETED`/
 * `CANCELLED` views are shared, mutable, GLOBAL, paginated state (`page.tsx`)
 * — a complete/cancel in one test moves a row OUT of the `APPROVED` view and
 * INTO another, which can shift every other still-`APPROVED` row's page
 * number mid-test. `gotoMovementsLastPage` below is the same defensive
 * navigation `ppr-queue.spec.ts#gotoQueueLastPage` uses, parametrized by
 * status.
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
  throw new Error('e2e/movements.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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
  return `e2e-movements-${uniqueSuffix()}`;
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

/**
 * `YYYY-MM-DD` of an instant in Europe/Rome — the SAME calendar-day bucketing
 * `listPprRequests` applies to the register's `from`/`to` filter
 * (`zonedMidnightUtc(from, APP_TIMEZONE)`), via the same en-CA `Intl` trick as
 * `src/lib/zoned-time.ts#dateOnlyInZone`. `toISOString().slice(0, 10)` (the UTC
 * day) is WRONG here: between 22:00 and 24:00 UTC (CEST) the Rome day is
 * already tomorrow, and the filter misses the row — the exact 22–24 UTC CI
 * failure window this replaced (lesson PR #17).
 */
function romeDateOnly(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** The calendar day before a `YYYY-MM-DD` date-only — plain date arithmetic in UTC, immune to DST-length Rome days. */
function dayBeforeDateOnly(dateOnly: string): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * A safely-"later today" (Rome) eta for the `IN_ARRIVO` derived-status
 * fixture — normally `+1h`, but if that would already cross into
 * TOMORROW's Rome calendar day (the suite happens to run late at night),
 * falls back to a much smaller `+5min` offset instead, so this fixture
 * never spuriously lands on `ATTESO` (lesson PR #17: never assume "later
 * today" is safe without checking the Rome-day boundary).
 */
function inArrivoEtaHoursFromNow(): number {
  const now = new Date();
  const todayRome = romeDateOnly(now);
  const oneHourLater = new Date(now.getTime() + 3_600_000);
  return romeDateOnly(oneHourLater) === todayRome ? 1 : 5 / 60;
}

/** Creates a PENDING PPR request via the public POST (story 8.1), a run-unique fake IP per call (never a fixed one, same rule as `ppr-queue.spec.ts`). */
async function createPendingRequest(page: Page, hoursFromNow = 5): Promise<{ registration: string; email: string; eta: string }> {
  const registration = uniqueRegistration('R');
  const email = uniqueEmail('movements');
  const eta = futureIso(hoursFromNow);

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
      eta,
      personsOnBoard: 1,
      locale: 'it',
    },
  });
  expect(response.status()).toBe(201);

  return { registration, email, eta };
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
async function createApprovedRequest(page: Page, hoursFromNow = 5): Promise<{ id: string; pprNumber: string; registration: string; email: string; eta: string }> {
  const { registration, email, eta } = await createPendingRequest(page, hoursFromNow);
  const id = await findPendingId(page, registration);

  const approveResponse = await page.request.post(`/api/v1/ppr-requests/${id}/approve`);
  expect(approveResponse.status()).toBe(200);
  const approveBody = (await approveResponse.json()) as { pprNumber: string };

  return { id, pprNumber: approveBody.pprNumber, registration, email, eta };
}

const UI_MOVEMENTS_PAGE_SIZE = 20;

/**
 * Same rationale as `ppr-queue.spec.ts#gotoQueueLastPage`: the register's
 * per-status view is FIFO (`createdAt asc`) and never reset between runs, so
 * a request just created/closed is always the NEWEST row under its current
 * status — it lands on the LAST page once the accumulated backlog exceeds
 * `UI_MOVEMENTS_PAGE_SIZE`.
 */
async function gotoMovementsLastPage(page: Page, status: string): Promise<void> {
  const response = await page.request.get(`/api/v1/ppr-requests?status=${status}&pageSize=${UI_MOVEMENTS_PAGE_SIZE}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { total: number };
  const lastPage = Math.max(1, Math.ceil(body.total / UI_MOVEMENTS_PAGE_SIZE));
  await page.goto(`/it/dashboard/movements?status=${status}&page=${lastPage}`);
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

function movementsRows(page: Page) {
  return page.getByTestId('ppr-register-row');
}

/**
 * Story 12.13, ratifica utente 5 — hard-delete: the pre-12.4 shim page that
 * used to 308-redirect `/dashboard/ppr/register` to `/dashboard/movements`
 * is gone entirely. MUST authenticate first: every `/dashboard/*` path is
 * proxy-gated (`src/proxy.ts`) BEFORE Next's own router ever resolves it —
 * an unauthenticated request never reaches the missing-route 404 at all, it
 * gets redirected (200) to `/login` instead. Runs standalone, outside the
 * serial block below (stateless once logged in).
 */
test('the eliminated /dashboard/ppr/register route answers 404, no redirect (ratifica utente 5: hard-delete, not a shim)', async ({ page }) => {
  await loginExpectingDashboard(page, ADMIN_EMAIL);
  const response = await page.goto('/it/dashboard/ppr/register');
  expect(response?.status()).toBe(404);
});

test('clicking "Esporta PDF" in Voli in transito\'s ExportMenu triggers a real file download (story 13.6, AC 4) — read-only, runs standalone outside the serial block', async ({ page }) => {
  await loginExpectingDashboard(page, ADMIN_EMAIL);
  await page.goto('/it/dashboard/movements');

  await page.getByRole('button', { name: 'Esporta' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Esporta PDF' }).click()]);

  expect(download.suggestedFilename()).toMatch(/^airmanager-ppr-requests-\d{4}-\d{2}-\d{2}\.pdf$/);
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
});

test.describe('Voli in transito / movements register: closure, landing fee, filters, derived status (Story 8.3, AC 1/2, FR-24; epic 12 story 12.4, AC 3)', () => {
  // Module doc-comment: the shared, paginated per-status register views are
  // mutable, global state that decisions in THIS file's own tests shift.
  test.describe.configure({ mode: 'serial' });

  test('the register row shows the requester email AND phone, each on its own line (story 13.6, AC 2 — regression guard: `.student-sub` nowrap/ellipsis must not clip the phone off)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    // An APPROVED request is what surfaces as a transit movement in this
    // register (a PENDING one lives only in the PPR console) — so its row is
    // the one that renders the requester's email + phone.
    const { registration, email } = await createApprovedRequest(page);
    await page.goto('/it/dashboard/movements');
    const row = movementsRows(page).filter({ hasText: registration });
    await expect(row.getByText(email)).toBeVisible();
    await expect(row.getByText('+39 333 0000000')).toBeVisible();
  });

  test('admin sets the default landing fee via Impostazioni; staff completes an APPROVED request from the register with the PREFILLED default: the row turns COMPLETED with the formatted fee, and a matching cash movement lands in the "PPR" category (AC 1)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const created = await createApprovedRequest(page);

    // --- Admin: set the default landing fee (story 13.6, AC 1 — the
    // console's own duplicate landing-fee editor was removed together with
    // the operating-instructions one, Impostazioni/ClubCard is now the only
    // UI that edits it; `settings.spec.ts` covers THAT UI's own PUT
    // round-trip). Via the API directly here, not the ClubCard UI: its
    // single "Salva" bundles icao/contactEmail/landingFee/instructions/
    // membershipFee into ONE save, which would make this test (running in
    // the main `chromium` project) write the SAME global keys
    // `settings.spec.ts` writes from its own serialized `settings` project
    // — exactly the cross-project race `playwright.config.ts` quarantines
    // settings.spec.ts to avoid (lesson 12.11 F1). This test's own concern
    // is the DOWNSTREAM effect (the completion panel's prefill), not the
    // settings UI.
    const feePutResponse = await page.request.put('/api/v1/settings/ppr-landing-fee', { data: { landingFeeCents: 4321 } });
    expect(feePutResponse.status()).toBe(200);
    await logout(page);

    // --- Staff: complete from the register, fee PREFILLED from the default ---
    await loginExpectingDashboard(page, STAFF_EMAIL);
    await gotoMovementsLastPage(page, 'APPROVED');
    await expect(page.getByText(created.registration)).toBeVisible();

    const row = movementsRows(page).filter({ hasText: created.registration });
    await row.getByTestId('ppr-register-complete-button').click();
    await expect(page.getByTestId('ppr-complete-fee-input')).toHaveValue('43,21');
    await page.getByTestId('ppr-complete-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'PPR completato.' })).toBeVisible();

    // --- The row is now COMPLETED, with the fee formatted ("partito" badge) ---
    await gotoMovementsLastPage(page, 'COMPLETED');
    const updatedRow = movementsRows(page).filter({ hasText: created.registration });
    await expect(updatedRow).toContainText('Partito');
    await expect(updatedRow).toContainText(/43,21\s€/);

    // --- Billing ledger: the matching movement in the "PPR" category (story 12.9 — pattern cash-register.spec.ts; "Categoria" filter, story Billing-2) ---
    await page.goto('/it/dashboard/billing');
    await page.getByTestId('billing-filter-category').selectOption({ label: 'PPR' });
    const movementRow = page.getByTestId('transaction-row').filter({ hasText: created.pprNumber });
    await expect(movementRow).toBeVisible();
    await expect(movementRow).toContainText(/43,21\s€/);
  });

  test('completing with the fee cleared to 0,00 (overriding whatever the current default is): the row turns COMPLETED with landingFeeCents 0, and creates NO new cash movement (AC 1, "tassa zero -> nessun movimento")', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const created = await createApprovedRequest(page);
    const categoryId = await pprCategoryId(page);
    const before = await movementCount(page, categoryId);

    await gotoMovementsLastPage(page, 'APPROVED');
    const row = movementsRows(page).filter({ hasText: created.registration });
    await row.getByTestId('ppr-register-complete-button').click();
    await page.getByTestId('ppr-complete-fee-input').fill('0,00');
    await page.getByTestId('ppr-complete-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'PPR completato.' })).toBeVisible();

    await gotoMovementsLastPage(page, 'COMPLETED');
    const updatedRow = movementsRows(page).filter({ hasText: created.registration });
    await expect(updatedRow).toContainText('Partito');
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

    await gotoMovementsLastPage(page, 'APPROVED');
    const row = movementsRows(page).filter({ hasText: created.registration });
    await row.getByTestId('ppr-register-cancel-button').click();
    await row.getByTestId('ppr-register-cancel-confirm').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'PPR annullato.' })).toBeVisible();

    await gotoMovementsLastPage(page, 'CANCELLED');
    const updatedRow = movementsRows(page).filter({ hasText: created.registration });
    await expect(updatedRow).toContainText('Annullato');
    await expect(updatedRow).toContainText('—');

    expect(await movementCount(page, categoryId)).toBe(before);
  });

  test('POST .../complete on a PENDING (never-approved) request answers 409 PPR_NOT_APPROVED, AD-8 envelope', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const { registration } = await createPendingRequest(page);
    const id = await findPendingId(page, registration);

    const response = await page.request.post(`/api/v1/ppr-requests/${id}/complete`, { data: { landingFeeCents: 1000, paymentMethod: 'CASH' } });
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
    const body = { landingFeeCents: 2500, paymentMethod: 'CASH' };

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
    // Europe/Rome day of the ACTUAL eta sent — the register filter buckets by
    // Rome calendar day, not UTC day (see `romeDateOnly`).
    const etaDateOnly = romeDateOnly(new Date(created.eta));
    const dayBefore = dayBeforeDateOnly(etaDateOnly);

    // --- Status + period match: visible ------------------------------------
    await page.goto(`/it/dashboard/movements?status=APPROVED&from=${etaDateOnly}&to=${etaDateOnly}`);
    await expect(page.getByText(created.registration)).toBeVisible();

    // --- Status filter mismatch (REJECTED): not visible --------------------
    // Filter changes go through a CONTROLLED `<input>`/`<select>` (`value={filters.status}`)
    // whose value comes from the URL via a client-side `router.push` — the
    // widget can briefly show the OLD value while that navigation resolves,
    // so the URL assertion below gets a generous timeout rather than
    // Playwright's 5s default (empirically ~200-400ms under a warm server,
    // more under the concurrent-worker/cold-compile load this suite runs
    // under — same tolerance as the documented login flake).
    await page.getByTestId('ppr-register-filter-status').selectOption('REJECTED');
    await expect(page).toHaveURL(/status=REJECTED/, { timeout: 15_000 });
    await expect(page.getByText(created.registration)).toHaveCount(0);

    // --- Period filter: `to` set to the day BEFORE the eta excludes it -----
    // Drives the real date input, the pre-12.4 assertion (restored by review
    // 12.4, F5 — `.fill()` DOES fire a React-visible change on this widget,
    // reproduced 3/3 against the CI prod build): the URL round-trip proves
    // the date-input -> `handleFilterChange` -> client-navigation wiring,
    // not just the server-side exclusion. Same 15s URL tolerance as the
    // `selectOption` assertion above.
    await page.goto(`/it/dashboard/movements?status=APPROVED&from=${etaDateOnly}&to=${etaDateOnly}`);
    await expect(page.getByText(created.registration)).toBeVisible();
    await page.getByTestId('ppr-register-filter-to').fill(dayBefore);
    await expect(page).toHaveURL(new RegExp(`to=${dayBefore}`), { timeout: 15_000 });
    await expect(page.getByText(created.registration)).toHaveCount(0);
  });

  test('"Azzera filtri" is hidden on the page default (APPROVED, no period) and appears on ANY chosen filter, incl. "Tutti" (TD-5 AC 4)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // Fresh landing, no URL params at all: the page's own APPROVED default is NOT an "active filter".
    await page.goto('/it/dashboard/movements');
    await expect(page.getByTestId('ppr-register-filter-status')).toHaveValue('APPROVED');
    await expect(page.getByTestId('ppr-register-filter-reset')).toHaveCount(0);

    // Choosing "Tutti" (ALL) is a deliberate filter choice -> the reset button appears.
    // (Generous timeout: same controlled-input/client-navigation race as the filters test above.)
    await page.getByTestId('ppr-register-filter-status').selectOption('ALL');
    await expect(page).toHaveURL(/status=ALL/, { timeout: 15_000 });
    await expect(page.getByTestId('ppr-register-filter-reset')).toBeVisible();

    // Reset -> back to the page default: clean URL, APPROVED selected again, button gone.
    await page.getByTestId('ppr-register-filter-reset').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/movements$/, { timeout: 15_000 });
    await expect(page.getByTestId('ppr-register-filter-status')).toHaveValue('APPROVED');
    await expect(page.getByTestId('ppr-register-filter-reset')).toHaveCount(0);
  });

  test('derived movement status (epic 12, story 12.4, AC 3): al suolo (eta just passed, still APPROVED), in arrivo (later today), atteso (a future day)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // "al suolo": eta a few seconds in the future at creation time (must be
    // strictly future to pass ETA_IN_PAST) — by the time we check the badge
    // below (after an explicit wait), it has already passed.
    const alSuolo = await createApprovedRequest(page, 10 / 3600);
    const inArrivo = await createApprovedRequest(page, inArrivoEtaHoursFromNow());
    // +30h: safely a LATER Rome calendar day than today regardless of what
    // time of day the suite runs (max Rome/UTC offset is 2h, far less than
    // the 30h margin) — see `deriveApprovedPprMovementStatus`'s own doc-comment.
    const atteso = await createApprovedRequest(page, 30);

    await page.waitForTimeout(12_000);

    await gotoMovementsLastPage(page, 'APPROVED');
    await expect(movementsRows(page).filter({ hasText: alSuolo.registration })).toContainText('Al suolo');
    await expect(movementsRows(page).filter({ hasText: inArrivo.registration })).toContainText('In arrivo');
    await expect(movementsRows(page).filter({ hasText: atteso.registration })).toContainText('Atteso');
  });

  test('"Registra arrivo" (epic 12, story 12.4, AC 3): a past eta is accepted (logging a just-landed arrival) and the row appears immediately as "al suolo" with an assigned pprNumber, no separate approval step', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, STAFF_EMAIL);
    await page.goto('/it/dashboard/movements');

    const suffix = uniqueSuffix();
    const registration = uniqueRegistration('A');
    // A past eta — "Registra arrivo" logs an aircraft that has just landed
    // (ratified 12.4 review): the staff manual path accepts it (no ETA_IN_PAST)
    // and the row derives to "al suolo" at once, no wait needed.
    const eta = new Date(Date.now() - 30 * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const etaLocal = `${eta.getFullYear()}-${pad(eta.getMonth() + 1)}-${pad(eta.getDate())}T${pad(eta.getHours())}:${pad(eta.getMinutes())}`;

    await page.getByTestId('log-arrival-button').click();
    const form = page.getByTestId('manual-ppr-form');
    await form.getByLabel('Nome', { exact: true }).fill('Arrivo');
    await form.getByLabel('Cognome', { exact: true }).fill(`Test-${suffix}`);
    await form.getByLabel('Telefono', { exact: true }).fill('+39 333 2222222');
    await form.getByLabel('Marche', { exact: true }).fill(registration);
    await form.getByLabel('Tipo aeromobile', { exact: true }).fill('TB-20');
    await form.getByLabel('Provenienza', { exact: true }).fill('LIRN');
    await form.getByLabel('Destinazione', { exact: true }).fill('LIRU');
    await form.getByLabel('Arrivo (ETA)', { exact: true }).fill(etaLocal);
    await form.getByLabel('Persone a bordo', { exact: true }).fill('1');
    await page.getByTestId('manual-ppr-submit').click();

    await expect(page.getByTestId('toast').filter({ hasText: /PPR-\d{4}-\d{4}/ })).toBeVisible();

    // FIFO (createdAt asc): the just-created row is always the NEWEST
    // APPROVED one — it lands on the LAST page, not necessarily page 1
    // (same defensive navigation as `gotoMovementsLastPage`'s own doc-comment).
    await gotoMovementsLastPage(page, 'APPROVED');
    const row = movementsRows(page).filter({ hasText: registration });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Al suolo');
    await expect(row.getByTestId('ppr-register-complete-button')).toBeVisible();
  });
});
