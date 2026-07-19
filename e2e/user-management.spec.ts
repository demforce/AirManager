import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * User management (story 1.4; rewritten story 12.13 — `/dashboard/users`
 * is gone, no longer a route). Every flow this spec exercises (invite,
 * pending-invite login block, deactivated-user login block, forgot-password)
 * moved to the Piloti page's "Accesso" section (story 12.6) — the API
 * (`POST /api/v1/users`, `PATCH /api/v1/users/{id}`,
 * `POST /api/v1/users/{id}/resend-invite`) is unchanged, only its UI moved.
 * The suspend/reactivate-from-the-row describe block below (story 12.6) was
 * already Piloti-native and is untouched.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const STAFF_EMAIL = 'staff@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/user-management.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';

async function login(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
}

/** Login that must succeed: waits for the dashboard redirect so the session
 * cookie is in place before the test navigates elsewhere. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await login(page, email, password);
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** The logout button lives on the dashboard landing page only. */
async function logout(page: Page): Promise<void> {
  await page.goto('/it/dashboard');
  await page.getByRole('button', { name: 'Esci' }).click();
  await expect(page).toHaveURL(/\/it\/login$/);
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/**
 * Polls Mailpit's HTTP API (localhost:8025) for a message addressed to `to`
 * whose subject contains `subjectIncludes` — used to tell the invite email
 * apart from the password-reset email when both land in the same inbox.
 */
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

function extractSetPasswordUrl(emailText: string): URL {
  const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(emailText);
  if (!match) {
    throw new Error(`Email body did not contain a /set-password link:\n${emailText}`);
  }
  return new URL(match[1]);
}

async function submitSetPassword(page: Page, url: URL, password: string): Promise<void> {
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@airmanager.local`;
}

function rowFor(page: Page, lastName: string) {
  return page.locator('[data-testid^="pilot-row-"]').filter({ hasText: lastName });
}

/**
 * Admin must already be logged in. Creates a fresh pilot person, then
 * invites a user for it from the editor's "Accesso" section (story 12.6,
 * AC 4) — the ONLY invite path left now that `/dashboard/users` is gone.
 */
async function createPilotWithAccess(page: Page, email: string): Promise<{ lastName: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const lastName = `UserMgmt-${suffix}`;

  await page.goto('/it/dashboard/pilots');
  await page.getByTestId('pilots-new-button').click();
  const form = page.getByTestId('pilot-identity-form');
  await form.getByLabel('Nome', { exact: true }).fill('Test');
  await form.getByLabel('Cognome', { exact: true }).fill(lastName);
  await page.getByTestId('pilot-identity-submit').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Pilota creato' })).toBeVisible();

  await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(lastName)}`);
  await rowFor(page, lastName).getByRole('button', { name: 'Modifica' }).click();

  const accessSection = page.getByTestId('pilot-access-none');
  await accessSection.getByLabel('Email').fill(email);
  await accessSection.getByLabel('Pilota', { exact: true }).check();
  await page.getByTestId('pilot-access-create').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Utente creato' })).toBeVisible();

  await page.getByRole('button', { name: 'Chiudi' }).first().click();
  return { lastName };
}

/** Full invite flow: create from the Piloti "Accesso" section, read the invite email from Mailpit, set the password. */
async function inviteAndSetPassword(page: Page, password: string): Promise<{ email: string; lastName: string }> {
  const email = uniqueEmail('invitee');
  const { lastName } = await createPilotWithAccess(page, email);

  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  await submitSetPassword(page, extractSetPasswordUrl(inviteEmail.Text), password);

  return { email, lastName };
}

/** Suspends the pilot's linked user from the Piloti row (story 12.6, AC 3) — admin must already be on the filtered Piloti list. */
async function suspendFromRow(page: Page, lastName: string): Promise<void> {
  await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(lastName)}`);
  const row = rowFor(page, lastName);
  await row.getByTestId(/^pilot-suspend-toggle-/).click();
  await row.getByTestId(/^pilot-suspend-confirm-/).click();
  await expect(page.getByTestId('toast').filter({ hasText: 'sospeso' })).toBeVisible();
}

test.describe('User management (Story 1.4)', () => {
  test('admin invites a user from the Piloti "Accesso" section, who receives an invite email, sets a password, and logs in (AC 1)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'InviteFlow123!';

    const { email } = await inviteAndSetPassword(page, password);
    await logout(page);

    await loginExpectingDashboard(page, email, password);
  });

  test('an invited user cannot log in before setting a password (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const email = uniqueEmail('pending');
    await createPilotWithAccess(page, email);
    await logout(page);

    await login(page, email, 'whatever-password-they-guess');

    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page).toHaveURL(/\/it\/login$/);
  });

  test('a deactivated user is rejected at login (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'DeactivateFlow123!';
    const { email, lastName } = await inviteAndSetPassword(page, password);

    await suspendFromRow(page, lastName);

    await logout(page);
    await login(page, email, password);

    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page).toHaveURL(/\/it\/login$/);
  });

  test('forgot-password sends a reset email and the new password works, without revealing account existence (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const initialPassword = 'ForgotFlowInitial123!';
    const { email } = await inviteAndSetPassword(page, initialPassword);
    await logout(page);

    // Unknown email: same neutral confirmation, no distinguishing behavior.
    await page.goto('/it/forgot-password');
    await page.getByLabel('Email').fill('this-account-does-not-exist@airmanager.local');
    await page.getByRole('button', { name: 'Invia link di reset' }).click();
    await expect(page.getByTestId('forgot-password-confirmation')).toBeVisible();

    // Real email: same confirmation, but a reset email actually arrives.
    await page.goto('/it/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Invia link di reset' }).click();
    await expect(page.getByTestId('forgot-password-confirmation')).toBeVisible();

    const resetEmail = await waitForMailpitMessage(email, 'Reimposta');
    const newPassword = 'ForgotFlowNew456!';
    await submitSetPassword(page, extractSetPasswordUrl(resetEmail.Text), newPassword);

    await loginExpectingDashboard(page, email, newPassword);
  });

  test('a pilot gets 403 creating a user directly via the API (AD-5 defense in depth — users.manage is ADMIN-only)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.post('/api/v1/users', {
      data: { email: uniqueEmail('forbidden'), roles: ['PILOT'] },
    });
    expect(response.status()).toBe(403);
  });

  test('POST /api/v1/users returns the AD-8 401 envelope without a session', async ({ request }) => {
    const response = await request.post('/api/v1/users', { data: { email: uniqueEmail('anon'), roles: ['PILOT'] } });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });
});

/**
 * Suspend/reactivate from the Piloti row (story 12.6, AC 3) — `users.manage`
 * is ADMIN-only (RBAC INVARIANT, D13): staff (`people.manage`/`finance.manage`
 * but no `users.manage`) must see Modifica/Registra but NEVER
 * Sospendi/Riattiva, even on a row with a linked user.
 */
test.describe('Suspend/reactivate from the Piloti row (Story 12.6)', () => {
  test('admin suspends and reactivates the linked user from the row', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const { lastName } = await createPilotWithAccess(page, uniqueEmail('pilotaccess'));

    await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(lastName)}`);
    const row = rowFor(page, lastName);
    await expect(row.getByText('Attivo', { exact: true })).toBeVisible();

    await row.getByTestId(/^pilot-suspend-toggle-/).click();
    await row.getByTestId(/^pilot-suspend-confirm-/).click();
    await expect(page.getByTestId('toast').filter({ hasText: 'sospeso' })).toBeVisible();
    await expect(row.getByText('Sospeso', { exact: true })).toBeVisible();

    await row.getByTestId(/^pilot-reactivate-toggle-/).click();
    await row.getByTestId(/^pilot-suspend-confirm-/).click();
    await expect(page.getByTestId('toast').filter({ hasText: 'riattivato' })).toBeVisible();
    await expect(row.getByText('Attivo', { exact: true })).toBeVisible();
  });

  test('staff sees Modifica/Registra but no Sospendi/Riattiva on a row with a linked user', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const { lastName } = await createPilotWithAccess(page, uniqueEmail('pilotaccess'));
    await page.context().clearCookies();

    await loginExpectingDashboard(page, STAFF_EMAIL);
    await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(lastName)}`);
    const row = rowFor(page, lastName);
    await expect(row).toBeVisible();

    await expect(row.getByRole('button', { name: 'Modifica' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Registra' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Sospendi' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Riattiva' })).toHaveCount(0);
  });
});
