import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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
async function loginExpectingDashboard(
  page: Page,
  email: string,
  password: string = SEED_PASSWORD!,
): Promise<void> {
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
async function waitForMailpitMessage(
  to: string,
  subjectIncludes: string,
  timeoutMs = 15_000,
): Promise<MailpitFullMessage> {
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

/**
 * Admin must already be logged in. Creates a person WITH access active via
 * the unified form (story TD-7, AC 1/3/5 — the old `/dashboard/users`
 * create-user flow this replaces). Returns the person's `lastName`, unique
 * per call, used to find the row afterwards (the people list sorts
 * `lastName asc`, NOT newest-first — same pagination hardening as
 * `people-management.spec.ts`'s `createPerson`).
 */
async function createInvitedPerson(page: Page, email: string): Promise<string> {
  const lastName = email.split('@')[0]!;

  await page.goto('/it/dashboard/people');
  await page.getByRole('button', { name: 'Nuovo pilota' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Test');
  await page.getByLabel('Cognome', { exact: true }).fill(lastName);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel("Può accedere all'app").check();
  // "Pilota" is ALSO a profile-toggle label (section b) — scope to the
  // roles fieldset (section c, `<fieldset><legend>Ruoli</legend>`) so the
  // two same-named Switches never collide (Playwright strictness).
  await page.getByRole('group', { name: 'Ruoli' }).getByLabel('Pilota', { exact: true }).check();
  await page.getByRole('button', { name: 'Crea persona' }).click();
  await expect(page.getByTestId('people-feedback')).toBeVisible();

  await page.goto(`/it/dashboard/people?q=${encodeURIComponent(lastName)}`);
  const row = page.getByRole('row', { name: new RegExp(lastName) });
  await expect(row.getByText('Invitato', { exact: true })).toBeVisible();
  return lastName;
}

/** Full invite flow: create via the unified form, read the invite email from Mailpit, set the password. */
async function inviteAndSetPassword(page: Page, password: string): Promise<string> {
  const email = uniqueEmail('invitee');
  await createInvitedPerson(page, email);

  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  await submitSetPassword(page, extractSetPasswordUrl(inviteEmail.Text), password);

  return email;
}

test.describe('User management (Story 1.4, merged into the unified people form by Story TD-7)', () => {
  test('admin creates a person with access, who receives an invite email, sets a password, and logs in (AC 1)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'InviteFlow123!';

    const email = await inviteAndSetPassword(page, password);
    await logout(page);

    await loginExpectingDashboard(page, email, password);
  });

  test('an invited person cannot log in before setting a password (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const email = uniqueEmail('pending');
    await createInvitedPerson(page, email);
    await logout(page);

    await login(page, email, 'whatever-password-they-guess');

    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page).toHaveURL(/\/it\/login$/);
  });

  test('a deactivated account is rejected at login (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'DeactivateFlow123!';
    const email = await inviteAndSetPassword(page, password);
    const lastName = email.split('@')[0]!;

    await page.goto(`/it/dashboard/people?q=${encodeURIComponent(lastName)}`);
    const row = page.getByRole('row', { name: new RegExp(lastName) });
    await row.getByRole('button', { name: 'Modifica' }).click();
    await page.getByLabel("Può accedere all'app").uncheck();
    await page.getByRole('button', { name: 'Salva modifiche' }).click();
    await expect(page.getByTestId('people-feedback')).toBeVisible();

    await page.goto(`/it/dashboard/people?q=${encodeURIComponent(lastName)}`);
    await expect(row.getByText('Disattivato', { exact: true })).toBeVisible();

    await logout(page);
    await login(page, email, password);

    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page).toHaveURL(/\/it\/login$/);
  });

  test('forgot-password sends a reset email and the new password works, without revealing account existence (AC 3)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const initialPassword = 'ForgotFlowInitial123!';
    const email = await inviteAndSetPassword(page, initialPassword);
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

  test('a staff member (people.manage without users.manage) does not see the Accesso section in the person form (AC 3, AD-5)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, STAFF_EMAIL);

    await page.goto('/it/dashboard/people');
    await page.getByRole('button', { name: 'Nuovo pilota' }).click();
    await expect(page.getByRole('heading', { name: "Accesso all'app" })).toHaveCount(0);
    await expect(page.getByLabel("Può accedere all'app")).toHaveCount(0);
  });

  test('a pilot gets 403 from the users API directly (AD-5 defense in depth)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.get('/api/v1/users');
    expect(response.status()).toBe(403);
  });

  test('GET /api/v1/users returns the AD-8 401 envelope without a session', async ({ request }) => {
    const response = await request.get('/api/v1/users');
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });
});
