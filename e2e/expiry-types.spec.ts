import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/expiry-types.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/** Run-unique expiry-type name (same pattern as `uniquePackageName` in `package-types.spec.ts`, for the dirty DB). */
function uniqueTypeName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@airmanager.local`;
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as `package-types.spec.ts`. */
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
 * once the password is set — the seed only ships admin + pilot, and the
 * read-only-catalogue/403-write test below needs an actor with
 * `expiries.manage` but deliberately WITHOUT `settings.manage` (same helper
 * shape as `package-types.spec.ts#createStaffUserAndSetPassword`).
 */
async function createStaffUserAndSetPassword(page: Page, password: string): Promise<string> {
  const email = uniqueEmail('staff-exp');
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

test.describe('Expiry-type catalogue (Story 6.1, AC 1/2, FR-35)', () => {
  test('admin sees the 6 seeded standard types, creates a custom one, edits/deactivates/deletes it', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // Landing page (AC 1/2): links through to the types manager.
    await page.goto('/it/dashboard/expiries');
    await page.getByRole('link', { name: 'Tipi di scadenza' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/expiries\/types$/);

    // AC 1: the 6 standard types are seeded, with their scopes.
    const medicalClass2Row = page.getByRole('row', { name: /Visita medica classe 2/ });
    await expect(medicalClass2Row).toContainText('Piloti');
    await expect(medicalClass2Row).toContainText('Attivo');

    const medicalLapl = page.getByRole('row', { name: /Visita medica LAPL/ });
    await expect(medicalLapl).toContainText('Allievi');

    const licenseRow = page.getByRole('row', { name: /^Licenza/ });
    await expect(licenseRow).toContainText('Piloti');

    // AC 2: a custom type, scope "Tutti", is usable exactly like a standard one.
    const name = uniqueTypeName('Assicurazione volo');

    await page.getByRole('button', { name: 'Nuovo tipo' }).click();
    await page.getByLabel('Nome').fill(name);
    await page.getByLabel('Ambito').selectOption('ALL');
    await page.getByRole('button', { name: 'Crea tipo' }).click();

    await expect(page.getByTestId('expiry-types-feedback')).toBeVisible();

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toContainText('Tutti');
    await expect(row).toContainText('Attivo');

    // A second type with the SAME name → 409 shown in the form, not created twice.
    await page.getByRole('button', { name: 'Nuovo tipo' }).click();
    await page.getByLabel('Nome').fill(name);
    await page.getByLabel('Ambito').selectOption('PILOTS');
    await page.getByRole('button', { name: 'Crea tipo' }).click();
    await expect(page.getByTestId('expiry-type-form-error')).toContainText('Esiste già un tipo di scadenza con questo nome.');
    await page.getByRole('button', { name: 'Annulla' }).click();

    // Edit the scope — the badge reflects the new value.
    await row.getByRole('button', { name: 'Modifica' }).click();
    await page.getByLabel('Ambito').selectOption('STUDENTS');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByTestId('expiry-types-feedback')).toBeVisible();
    const rowAfterEdit = page.getByRole('row', { name: new RegExp(name) });
    await expect(rowAfterEdit).toContainText('Allievi');

    // Deactivate — the status badge flips to "Disattivato".
    await rowAfterEdit.getByRole('button', { name: 'Disattiva' }).click();
    const rowAfterDeactivate = page.getByRole('row', { name: new RegExp(name) });
    await expect(rowAfterDeactivate).toContainText('Disattivato');

    // Delete (never used) — the row disappears from the catalogue.
    await rowAfterDeactivate.getByRole('button', { name: 'Elimina' }).click();
    await rowAfterDeactivate.getByRole('button', { name: 'Conferma' }).click();
    await expect(page.getByTestId('expiry-types-feedback')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
  });

  test('a STAFF actor (expiries.manage) sees the read-only catalogue, a POST as staff gets a 403 AD-8 envelope, nav item visible', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const staffPassword = 'StaffExpiries123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);

    // Nav (rendered on the dashboard landing itself, story 1.3's tile grid):
    // "Scadenze" visible for staff (`expiries.manage`).
    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(nav.getByRole('link', { name: 'Scadenze' })).toBeVisible();

    await page.goto('/it/dashboard/expiries/types');
    await expect(page.getByTestId('expiry-types-table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuovo tipo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Modifica' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Elimina' })).toHaveCount(0);

    const response = await page.request.post('/api/v1/expiry-types', {
      data: { name: uniqueTypeName('Non permesso'), scope: 'ALL' },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('the pilot seed user (no expiries.manage) does not see the Scadenze nav item', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(nav.getByRole('link', { name: 'Scadenze' })).toHaveCount(0);
  });
});
