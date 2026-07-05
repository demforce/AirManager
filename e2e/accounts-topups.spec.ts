import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/accounts-topups.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as person-detail.spec.ts. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

async function ownPersonId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/me');
  const body = await response.json();
  return body.person.id as string;
}

/**
 * The seed pilot's account balance accumulates across runs (the ledger is
 * append-only by design — AD-3 — so tests must never assume a fresh 0).
 * Scenarios needing a pristine balance create their own person instead.
 */
function uniquePerson(prefix: string): { firstName: string; lastName: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { firstName: prefix, lastName: `Conto-${suffix}` };
}

/** Creates a person via the API and activates the pilot profile (which creates the Account, AC 1). Returns the person id. */
async function createPilotPerson(page: Page, person: { firstName: string; lastName: string }): Promise<string> {
  const createResponse = await page.request.post('/api/v1/people', {
    data: { firstName: person.firstName, lastName: person.lastName },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${created.id}/profiles/pilot`, {
    data: { licenseNumber: 'IT-PPL-E2E', licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  return created.id;
}

test.describe('Prepaid account and top-ups (Story 3.1)', () => {
  test('activating a pilot profile creates the account: the scheda shows saldo 0,00 € (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Elena');
    const personId = await createPilotPerson(page, person);

    await page.goto(`/it/dashboard/people/${personId}`);
    await expect(page.getByRole('heading', { name: 'Saldo conto' })).toBeVisible();
    await expect(page.getByTestId('account-balance')).toHaveText(/0,00\s€/);
    await expect(page.getByText('Nessun movimento registrato.')).toBeVisible();
  });

  test('staff records a 100 € cash top-up: saldo 100,00 € and the movement appears in the preview (AC 2/3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Franco');
    const personId = await createPilotPerson(page, person);

    await page.goto(`/it/dashboard/people/${personId}`);
    await expect(page.getByTestId('account-balance')).toHaveText(/0,00\s€/);

    await page.getByRole('button', { name: 'Registra ricarica' }).click();
    await page.getByLabel('Importo (EUR)').fill('100');
    await page.getByLabel('Metodo di pagamento').selectOption('CASH');
    await page.getByRole('button', { name: 'Conferma ricarica' }).click();

    // The POST response feeds the panel directly: saldo updates without a reload (AC 3).
    await expect(page.getByTestId('account-balance')).toHaveText(/100,00\s€/);
    const movementRow = page.getByTestId('account-movement-row');
    await expect(movementRow).toHaveCount(1);
    await expect(movementRow.getByText('Ricarica', { exact: true })).toBeVisible();
    await expect(movementRow.getByText(/\+100,00\s€/)).toBeVisible();

    // Money follows the page locale (review 3.1 F1): the same balance on /en
    // renders with English formatting (€100.00), not Italian separators.
    await page.goto(`/en/dashboard/people/${personId}`);
    await expect(page.getByTestId('account-balance')).toHaveText(/€100\.00/);
  });

  test('a person without pilot/student profile shows "Nessun conto attivo" (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Giulia');
    const createResponse = await page.request.post('/api/v1/people', {
      data: { firstName: person.firstName, lastName: person.lastName },
    });
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()) as { id: string };

    await page.goto(`/it/dashboard/people/${created.id}`);
    await expect(page.getByTestId('account-balance')).toHaveText('Nessun conto attivo');
  });

  test('a pilot sees their OWN balance in their scheda, without the top-up action (AC 1, AD-5)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.getByRole('link', { name: 'La mia scheda' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/]+$/);

    await expect(page.getByRole('heading', { name: 'Saldo conto' })).toBeVisible();
    // The seeded pilot has an Account: a real formatted amount, never the no-account label.
    await expect(page.getByTestId('account-balance')).toHaveText(/€/);
    // No finance.manage → the action is hidden (the API is the real guardian, tested below).
    await expect(page.getByRole('button', { name: 'Registra ricarica' })).toHaveCount(0);
  });

  test('a pilot gets a 403 AD-8 envelope from POST /api/v1/people/{id}/account/top-ups (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const myId = await ownPersonId(page);

    const response = await page.request.post(`/api/v1/people/${myId}/account/top-ups`, {
      data: { amountCents: 10000, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('there is no update/delete API for movements (AC 3): unknown methods are rejected', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Marta');
    const personId = await createPilotPerson(page, person);

    const topUpResponse = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
      data: { amountCents: 5000, paymentMethod: 'POS', effectiveDate: '2026-07-01' },
    });
    expect(topUpResponse.status()).toBe(200);

    // The collection only accepts POST — PATCH/DELETE (even by an admin) have no handler (405).
    const patchResponse = await page.request.patch(`/api/v1/people/${personId}/account/top-ups`, {
      data: { amountCents: 1 },
    });
    expect(patchResponse.status()).toBe(405);
    const deleteResponse = await page.request.delete(`/api/v1/people/${personId}/account/top-ups`);
    expect(deleteResponse.status()).toBe(405);
  });
});
