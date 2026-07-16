import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/package-sale.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/** Run-unique names (same pattern as `uniqueAircraft`/`uniquePackageName` in other specs, for the dirty DB). */
function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@airmanager.local`;
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as package-types.spec.ts/aircraft-rates.spec.ts. */
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
 * Creates a fresh pilot person (with an activated pilot profile, so an
 * `Account` exists) plus a linked login user, via the admin API — avoids
 * the shared seeded pilot (whose account is mutated by other, parallel
 * e2e specs — `fullyParallel: true` — which would make "saldo INVARIATO"
 * flaky to assert against). Mirrors `createStaffUserAndSetPassword`
 * (package-types.spec.ts) but links the invited user to a NEW `Person`.
 */
async function createPilotWithLogin(
  page: Page,
  password: string,
): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const firstName = 'Pacchetto';
  const lastName = `Titolare-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail('pilot-pkg');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId: person.id } });
  expect(userResponse.status()).toBe(201);

  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(inviteEmail.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();

  return { personId: person.id, email, firstName, lastName };
}

async function createPackageType(
  page: Page,
  data: { name: string; includedMinutes: number; priceCents: number; validityMonths?: number | null },
): Promise<{ id: string }> {
  const response = await page.request.post('/api/v1/package-types', { data });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

test.describe('Package sale and residuals (Story 4.4, AC 1/2/3)', () => {
  test('admin sells a package (POS): scheda persona shows the residuo/scadenza, titolare sees it in the estratto conto with an unchanged balance, and the cash register shows the entrata', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const typeName = uniqueName('Pacchetto Vendita');
    const packageType = await createPackageType(page, {
      name: typeName,
      includedMinutes: 300, // 5:00
      priceCents: 50000, // 500,00 €
      validityMonths: 6,
    });

    const pilot = await createPilotWithLogin(page, 'PilotPackages123!');

    // Balance BEFORE the sale (AC 1: the payment is external to the account — must stay invariant).
    const beforeResponse = await page.request.get(`/api/v1/people/${pilot.personId}/account`);
    const before = (await beforeResponse.json()) as { balanceCents: number };

    // Still authenticated as admin (visiting the public set-password page
    // above never touched the admin session cookie).
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    await expect(page.getByRole('heading', { name: `${pilot.lastName} ${pilot.firstName}` })).toBeVisible();

    await page.getByRole('button', { name: 'Vendi pacchetto' }).click();
    await page.getByLabel('Tipo di pacchetto').selectOption({ label: typeName });
    await page.getByLabel('Metodo di pagamento').selectOption('POS');
    await page.getByRole('button', { name: 'Conferma vendita' }).click();

    await expect(page.getByTestId('packages-panel-feedback')).toBeVisible();
    const row = page.getByTestId('hour-package-row').filter({ hasText: typeName });
    await expect(row).toContainText('5:00'); // residuo pieno = includedMinutes
    await expect(row).toContainText(/500,00\s€/);
    // scadenza calcolata (validityMonths: 6), locale-aware DD/MM/YYYY (TD-1, AC 7), non "—"
    await expect(row).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    await expect(row.getByTestId('hour-package-expired-badge')).toHaveCount(0);

    // Balance AFTER the sale — unchanged (AC 1).
    const afterResponse = await page.request.get(`/api/v1/people/${pilot.personId}/account`);
    const after = (await afterResponse.json()) as { balanceCents: number };
    expect(after.balanceCents).toBe(before.balanceCents);

    // AC 3: the sold type can no longer be deleted — 409 with a clear message.
    const deleteResponse = await page.request.delete(`/api/v1/package-types/${packageType.id}`);
    expect(deleteResponse.status()).toBe(409);
    const deleteBody = (await deleteResponse.json()) as { error: { code: string; message: string } };
    expect(deleteBody.error.code).toBe('CONFLICT');
    expect(deleteBody.error.message).toMatch(/deactivate/i);

    // Selling an INACTIVE type -> 409.
    const inactiveType = await createPackageType(page, {
      name: uniqueName('Pacchetto Inattivo'),
      includedMinutes: 60,
      priceCents: 10000,
    });
    await page.request.patch(`/api/v1/package-types/${inactiveType.id}`, { data: { isActive: false } });
    const sellInactiveResponse = await page.request.post(`/api/v1/people/${pilot.personId}/packages`, {
      data: { packageTypeId: inactiveType.id, paymentMethod: 'CASH', effectiveDate: '2026-07-07' },
    });
    expect(sellInactiveResponse.status()).toBe(409);

    // Cash register: an entrata under "Pacchetti" for the price, identifying the package/person.
    const categoriesResponse = await page.request.get('/api/v1/cash-categories');
    const categories = (await categoriesResponse.json()) as Array<{ id: string; name: string }>;
    const pacchettiCategory = categories.find((category) => category.name === 'Pacchetti');
    expect(pacchettiCategory).toBeDefined();

    // Story 12.9: the cash register is now the unified billing ledger.
    await page.goto(`/it/dashboard/billing?type=${pacchettiCategory!.id}`);
    const cashRow = page.getByTestId('transaction-row').filter({ hasText: typeName });
    await expect(cashRow).toContainText(/500,00\s€/);
    await expect(cashRow).toContainText(pilot.lastName);

    // TD-1, AC 6: the estratto conto's "Rettifica questo movimento" action is
    // hidden on a PACKAGE_PURCHASE row (still admin, who has finance.manage
    // and would otherwise see the action column).
    await page.goto(`/it/dashboard/people/${pilot.personId}/account`);
    const packagePurchaseRow = page.locator('tbody tr').filter({ hasText: 'Acquisto pacchetto' });
    await expect(packagePurchaseRow).toBeVisible();
    await expect(packagePurchaseRow.getByRole('button', { name: 'Rettifica questo movimento' })).toHaveCount(0);

    // Titolare's own view: log out admin, log in as the newly created pilot.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotPackages123!');
    await page.goto(`/it/dashboard/people/${pilot.personId}/account`);

    await expect(page.getByTestId('hour-package-row').filter({ hasText: typeName })).toBeVisible();
    // The PACKAGE_PURCHASE row (AC 1): its own movement type label, amount 0,00 € (the
    // payment is external to the account — the balance below stays unchanged).
    const statementRow = page.locator('tbody tr').filter({ hasText: 'Acquisto pacchetto' });
    await expect(statementRow).toContainText(/0,00\s€/);
    await expect(page.getByTestId('account-statement-balance')).toHaveText(
      new RegExp(`${(before.balanceCents / 100).toFixed(2).replace('.', ',')}`),
    );
  });

  test('a pilot gets a 403 AD-8 envelope from POST /api/v1/people/{id}/packages', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotWithLogin(page, 'PilotForbidden123!');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotForbidden123!');

    const response = await page.request.post(`/api/v1/people/${pilot.personId}/packages`, {
      data: { packageTypeId: 'whatever', paymentMethod: 'CASH', effectiveDate: '2026-07-07' },
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
