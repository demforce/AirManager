import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/package-types.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Run-unique package-type name (same pattern as `uniqueAircraft`/`uniqueEmail` in other specs, for the dirty DB). */
function uniquePackageName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@airmanager.local`;
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as aircraft-rates.spec.ts/user-management.spec.ts. */
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

/**
 * Creates a STAFF-only user (via the admin users API) and returns credentials
 * once the password is set — the seed only ships admin + pilot (Dev Notes),
 * and the read-only-listino/403-write tests below need an actor with
 * `finance.manage` but deliberately WITHOUT `settings.manage` (same helper
 * shape as aircraft-rates.spec.ts's `createStaffUserAndSetPassword`).
 */
async function createStaffUserAndSetPassword(page: Page, password: string): Promise<string> {
  const email = uniqueEmail('staff-pkg');
  const response = await page.request.post('/api/v1/users', { data: { email, roles: ['STAFF'] } });
  expect(response.status()).toBe(201);

  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(inviteEmail.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();

  return email;
}

test.describe('Package-type listino (Story 4.3, AC 1/2, FR-12)', () => {
  test('admin creates a package type, sees it in the listino, edits its price, deactivates it and deletes it', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/finance/packages');

    const name = uniquePackageName('Pacchetto 10 ore');

    await page.getByRole('button', { name: 'Nuovo pacchetto' }).click();
    await page.getByLabel('Nome').fill(name);
    await page.getByLabel('Ore incluse').fill('10:00');
    await page.getByLabel('Prezzo (€)').fill('1400,00');
    await page.getByLabel('Validità (mesi)').fill('12');
    await page.getByLabel('I-ABCD').check();
    await page.getByRole('button', { name: 'Crea pacchetto' }).click();

    await expect(page.getByTestId('packages-feedback')).toBeVisible();

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toContainText('10:00');
    await expect(row).toContainText(/1\.?400,00\s€/);
    await expect(row).toContainText('I-ABCD');
    await expect(row).toContainText('12');
    await expect(row).toContainText('Attivo');

    // AC 2 groundwork — a second type with the SAME name → 409 shown, not created twice.
    await page.getByRole('button', { name: 'Nuovo pacchetto' }).click();
    await page.getByLabel('Nome').fill(name);
    await page.getByLabel('Ore incluse').fill('5:00');
    await page.getByLabel('Prezzo (€)').fill('700,00');
    await page.getByRole('button', { name: 'Crea pacchetto' }).click();
    await expect(page.getByTestId('package-type-form-error')).toContainText('Esiste già un pacchetto con questo nome.');
    await page.getByRole('button', { name: 'Annulla' }).click();

    // Edit the price — the table reflects the new value.
    await row.getByRole('button', { name: 'Modifica' }).click();
    await page.getByLabel('Prezzo (€)').fill('1500,00');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByTestId('packages-feedback')).toBeVisible();
    const rowAfterEdit = page.getByRole('row', { name: new RegExp(name) });
    await expect(rowAfterEdit).toContainText(/1\.?500,00\s€/);

    // Deactivate — the status badge flips to "Disattivato".
    await rowAfterEdit.getByRole('button', { name: 'Disattiva' }).click();
    const rowAfterDeactivate = page.getByRole('row', { name: new RegExp(name) });
    await expect(rowAfterDeactivate).toContainText('Disattivato');

    // Delete (never sold) — the row disappears from the listino.
    await rowAfterDeactivate.getByRole('button', { name: 'Elimina' }).click();
    await rowAfterDeactivate.getByRole('button', { name: 'Conferma' }).click();
    await expect(page.getByTestId('packages-feedback')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
  });

  test('a STAFF actor (finance.manage) sees the read-only listino, and a POST as staff gets a 403 AD-8 envelope', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const staffPassword = 'StaffPackages123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);
    await page.goto('/it/dashboard/finance/packages');

    await expect(page.getByTestId('package-types-table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuovo pacchetto' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Modifica' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Elimina' })).toHaveCount(0);

    const response = await page.request.post('/api/v1/package-types', {
      data: { name: uniquePackageName('Non permesso'), includedMinutes: 300, priceCents: 70000 },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
