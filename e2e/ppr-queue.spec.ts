import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * PPR console (epic 8, story 8.2; FR-23, FR-41 — rebuilt epic 12, story
 * 12.4, AC 2). Requests are created via the PUBLIC POST
 * (`POST /api/v1/ppr-requests`, story 8.1) with run-unique fake
 * `x-forwarded-for` IPs and unique emails/registrations — same pattern as
 * `ppr-public.spec.ts` (the dev DB is never reset between runs, and the
 * rate-limit e2e in that file must stay untouched: never reuse a fixed IP
 * here).
 *
 * **Serial within this file** (`test.describe.configure`, below): the FIFO
 * PENDING queue's page boundaries (`page.tsx`'s pagination) are shared,
 * mutable, GLOBAL state — a decision (approve/reject) in one test REMOVES a
 * row from the PENDING set, which can shift EVERY other still-pending row's
 * page number mid-test. Two of these tests decide requests; running them
 * `fullyParallel` (the project default) let one test's decision race
 * another's "navigate to the last page, find my row" step and intermittently
 * miss it.
 *
 * **UI-structural rewrite (story 12.4, AC 5)**: approve is now a DIRECT
 * action (no two-step confirm — `ppr-console.tsx`'s own precedent, matching
 * `bookings-table.tsx`'s "Approva"); reject opens a `.mini-modal` (same
 * testids as before: `ppr-reject-reason`/`ppr-reject-submit`); feedback is
 * now a TOAST (`data-testid="toast"`, `useToast`), not a persistent
 * `role="status"` paragraph — asserted immediately after the action, before
 * `TOAST_LIFETIME_MS` (2.6s) elapses.
 */

const MAILPIT_API = 'http://localhost:8025/api/v1';

const ADMIN_EMAIL = 'admin@airmanager.local';
const STAFF_EMAIL = 'staff@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/ppr-queue.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** The "Esci" button only lives on `/dashboard` itself, not on sub-pages like `/dashboard/ppr` — navigate there first. */
async function logout(page: Page): Promise<void> {
  await page.goto('/it/dashboard');
  await page.getByRole('button', { name: 'Esci' }).click();
  await expect(page).toHaveURL(/\/it\/login$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueFakeIp(): string {
  return `e2e-ppr-queue-${uniqueSuffix()}`;
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

type CreatedRequest = { registration: string; email: string; firstName: string; lastName: string };

/** Creates a PENDING PPR request via the public POST (story 8.1), a run-unique fake IP per call (never a fixed one). */
async function createPendingRequest(
  page: Page,
  overrides: Partial<{ firstName: string; lastName: string; locale: 'it' | 'en' }> = {},
): Promise<CreatedRequest> {
  const registration = uniqueRegistration('Q');
  const email = uniqueEmail('ppr-queue');
  const firstName = overrides.firstName ?? 'Queue';
  const lastName = overrides.lastName ?? `Test-${uniqueSuffix()}`;

  const response = await page.request.post('/api/v1/ppr-requests', {
    headers: { 'x-forwarded-for': uniqueFakeIp() },
    data: {
      firstName,
      lastName,
      email,
      phone: '+39 333 0000000',
      aircraftRegistration: registration,
      aircraftType: 'Cessna 172',
      origin: 'LIRN Napoli',
      destination: 'LIRU Urbe',
      eta: futureIso(5),
      personsOnBoard: 1,
      locale: overrides.locale ?? 'it',
    },
  });
  expect(response.status()).toBe(201);

  return { registration, email, firstName, lastName };
}

/** Looks up a PENDING request's id by its (unique) aircraft registration, via the staff-authenticated list endpoint. */
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

const UI_QUEUE_PAGE_SIZE = 20;

/**
 * The dev DB is never reset between e2e runs (module doc-comment) and the
 * queue is FIFO (`createdAt asc`), so a request just created via
 * `createPendingRequest` is always the NEWEST PENDING row — it lands on the
 * LAST page, not necessarily page 1, once the accumulated backlog exceeds
 * `QUEUE_PAGE_SIZE` (`page.tsx`). The console's own status filter default
 * (PENDING) matches the API's default, so no `?status` is needed on this
 * URL for the PENDING case.
 */
async function gotoQueueLastPage(page: Page): Promise<void> {
  const response = await page.request.get(`/api/v1/ppr-requests?status=PENDING&pageSize=${UI_QUEUE_PAGE_SIZE}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { total: number };
  const lastPage = Math.max(1, Math.ceil(body.total / UI_QUEUE_PAGE_SIZE));
  await page.goto(`/it/dashboard/ppr?page=${lastPage}`);
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same polling pattern as `ppr-public.spec.ts`'s `waitForMailpitMessage`. */
async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<MailpitFullMessage> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const searchResponse = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
    const searchBody = (await searchResponse.json()) as { messages: MailpitMessageSummary[] };
    const found = searchBody.messages.find((message) => message.Subject.includes(subjectIncludes));

    if (found) {
      const messageResponse = await fetch(`${MAILPIT_API}/message/${found.ID}`);
      return (await messageResponse.json()) as MailpitFullMessage;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

/** Same short-negative-wait pattern as `ppr-public.spec.ts#expectNoMailpitMessage` — nothing to poll FOR. */
async function expectNoMailpitMessage(to: string, waitMs = 3_000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const searchResponse = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
  const searchBody = (await searchResponse.json()) as { messages: MailpitMessageSummary[] };
  expect(searchBody.messages).toHaveLength(0);
}

test.describe('PPR console (Story 8.2, AC 1/2, FR-23/FR-41; rebuilt epic 12 story 12.4, AC 2)', () => {
  // Module doc-comment: the shared FIFO PENDING queue's page boundaries are
  // mutable, global state that decisions in THIS file's own tests shift.
  test.describe.configure({ mode: 'serial' });

  test('admin sets run-unique operating instructions via UI; staff sees the pending queue populated on the dashboard widget, opens the console, sees the run-unique request, and approves it: toast shows the assigned number, the row leaves the PENDING view, and the outcome email carries BOTH the number and the instructions (IT form)', async ({
    page,
  }) => {
    const created = await createPendingRequest(page, { firstName: 'Giulia', locale: 'it' });
    const instructionsMarker = `Verifica e2e istruzioni ${uniqueSuffix()}, presentarsi in torre.`;

    // --- Admin: set the operating instructions via the UI (AC 1) ---------
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/ppr');
    await page.getByTestId('ppr-instructions-it').fill(instructionsMarker);
    await page.getByTestId('ppr-instructions-save').click();
    await expect(page.getByTestId('ppr-instructions-feedback')).toBeVisible();
    await logout(page);

    // --- Staff: dashboard widget is populated (AC 2, FR-41) --------------
    await loginExpectingDashboard(page, STAFF_EMAIL);
    await expect(page.getByTestId('ppr-pending-widget')).toBeVisible();
    await expect(page.getByTestId('ppr-pending-widget-empty')).toHaveCount(0);
    await expect(page.getByTestId('ppr-pending-widget-row').first()).toBeVisible();

    // --- Staff: open the console, see the run-unique request (AC 1) ------
    await gotoQueueLastPage(page);
    await expect(page.getByText(created.registration)).toBeVisible();
    // Staff (ppr.manage, not settings.manage) never sees the editor section.
    await expect(page.getByTestId('ppr-instructions-editor')).toHaveCount(0);

    // --- Staff: approve, DIRECT action (AC 1, no confirm step) -----------
    const row = page.getByTestId('ppr-row').filter({ hasText: created.registration });
    await row.getByTestId('ppr-approve-button').click();

    const toast = page.getByTestId('toast').filter({ hasText: /PPR-\d{4}-\d{4}/ });
    await expect(toast).toBeVisible();
    await expect(page.getByText(created.registration)).toHaveCount(0);

    // --- Outcome email: number + instructions, IT form locale ------------
    const message = await waitForMailpitMessage(created.email, 'approvato');
    expect(message.Subject).toMatch(/PPR-\d{4}-\d{4} approvato/);
    expect(message.Text).toMatch(/PPR-\d{4}-\d{4}/);
    expect(message.Text).toContain(instructionsMarker);
  });

  test('staff rejects a pending request with a mandatory reason (AC 2, mini-modal): empty submit shows an inline error with NO network call, then a real reason succeeds and the outcome email (EN form) carries the reason', async ({
    page,
  }) => {
    const created = await createPendingRequest(page, { firstName: 'John', locale: 'en' });
    const reason = `Documentazione mancante (verifica e2e ${uniqueSuffix()}).`;

    await loginExpectingDashboard(page, STAFF_EMAIL);
    await gotoQueueLastPage(page);
    await expect(page.getByText(created.registration)).toBeVisible();

    const row = page.getByTestId('ppr-row').filter({ hasText: created.registration });
    await row.getByTestId('ppr-reject-button').click();

    // The mini-modal is a page-wide overlay (`.mini-modal`), not nested
    // inside `row` — located page-wide, unique by construction (only ONE
    // reject modal can be open at a time).
    // --- Empty submit: inline error, no call (the row must still be there) ---
    await page.getByTestId('ppr-reject-submit').click();
    await expect(page.getByText('Il motivo è obbligatorio.')).toBeVisible();
    await expect(page.getByText(created.registration)).toBeVisible();

    // --- Real reason: succeeds ------------------------------------------
    await page.getByTestId('ppr-reject-reason').fill(reason);
    await page.getByTestId('ppr-reject-submit').click();

    await expect(page.getByTestId('toast').filter({ hasText: 'Richiesta rifiutata.' })).toBeVisible();
    await expect(page.getByText(created.registration)).toHaveCount(0);

    const message = await waitForMailpitMessage(created.email, 'not approved');
    expect(message.Text).toContain(reason);
  });

  test('a second decision on the same (already-decided) request answers 409 PPR_ALREADY_DECIDED, AD-8 envelope', async ({ page }) => {
    const created = await createPendingRequest(page);

    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const id = await findPendingId(page, created.registration);

    const first = await page.request.post(`/api/v1/ppr-requests/${id}/approve`);
    expect(first.status()).toBe(200);

    const second = await page.request.post(`/api/v1/ppr-requests/${id}/approve`);
    expect(second.status()).toBe(409);
    const body = await second.json();
    expect(body).toMatchObject({ error: { code: 'PPR_ALREADY_DECIDED' } });

    // The 409 attempt must not have consumed a PPR number of its own — the
    // first (winning) response already carries the only number issued here.
    const firstBody = await first.json();
    expect(firstBody.pprNumber).toMatch(/^PPR-\d{4}-\d{4}$/);
  });

  test('a pilot is forbidden: GET /api/v1/ppr-requests answers 403, and the nav has no ppr item', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await expect(page.getByRole('link', { name: 'PPR' })).toHaveCount(0);

    const response = await page.request.get('/api/v1/ppr-requests');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: 'FORBIDDEN' } });

    // The page itself redirects away too (AD-5: the nav hiding is not the guardian).
    await page.goto('/it/dashboard/ppr');
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });

  test('"PPR manuale" (epic 12, story 12.4, AC 1): staff enters a manual request with an email — it appears PENDING in the console, badge-free ("da modulo web" is only for public-form rows), and NO receipt email is ever sent', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, STAFF_EMAIL);
    await page.goto('/it/dashboard/ppr');

    const suffix = uniqueSuffix();
    const registration = uniqueRegistration('M');
    const email = uniqueEmail('ppr-manual');
    const eta = new Date(Date.now() + 4 * 3_600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const etaLocal = `${eta.getFullYear()}-${pad(eta.getMonth() + 1)}-${pad(eta.getDate())}T${pad(eta.getHours())}:${pad(eta.getMinutes())}`;

    await page.getByTestId('ppr-manual-button').click();
    const form = page.getByTestId('manual-ppr-form');
    await form.getByLabel('Nome', { exact: true }).fill('Manuale');
    await form.getByLabel('Cognome', { exact: true }).fill(`Staff-${suffix}`);
    await form.getByLabel('Email', { exact: true }).fill(email);
    await form.getByLabel('Marche', { exact: true }).fill(registration);
    await form.getByLabel('Tipo aeromobile', { exact: true }).fill('Cessna 172');
    await form.getByLabel('Provenienza', { exact: true }).fill('LIRN');
    await form.getByLabel('Destinazione', { exact: true }).fill('LIRU');
    await form.getByLabel('Arrivo (ETA)', { exact: true }).fill(etaLocal);
    await form.getByLabel('Persone a bordo', { exact: true }).fill('1');
    await page.getByTestId('manual-ppr-submit').click();

    await expect(page.getByTestId('toast').filter({ hasText: 'Richiesta PPR aggiunta.' })).toBeVisible();

    // FIFO (createdAt asc): the just-created row is always the NEWEST
    // PENDING one — it lands on the LAST page, not necessarily page 1, once
    // the accumulated backlog exceeds the queue's own page size (same
    // defensive navigation as `gotoQueueLastPage`'s own doc-comment).
    await gotoQueueLastPage(page);
    const row = page.getByTestId('ppr-row').filter({ hasText: registration });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('ppr-approve-button')).toBeVisible();
    await expect(row.getByTestId('ppr-from-public-badge')).toHaveCount(0);

    await expectNoMailpitMessage(email);
  });
});
