import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/account-statement.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as person-detail.spec.ts / accounts-topups.spec.ts. */
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

function uniquePerson(prefix: string): { firstName: string; lastName: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { firstName: prefix, lastName: `Estratto-${suffix}` };
}

/** Creates a person via the API and activates the pilot profile (which creates the Account, story 3.1 AC 1). */
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

async function recordTopUp(page: Page, personId: string, amountCents: number): Promise<void> {
  const response = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
    data: { amountCents, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
  });
  expect(response.status()).toBe(200);
}

test.describe('Account statement (Story 3.2; "Estratto conto" section, Story 13.3)', () => {
  test('staff records 2 top-ups then opens the estratto: 2 rows, reverse-chronological, signed amounts, "registrato da" column (AC 2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Marco');
    const personId = await createPilotPerson(page, person);

    await recordTopUp(page, personId, 10000); // 100,00 €
    await recordTopUp(page, personId, 5000); // 50,00 €

    // Story 13.3 (R-13.3-b): the standalone `/account` route now redirects
    // to the consolidated scheda persona — the estratto conto is a SECTION
    // there, not a separate page.
    await page.goto(`/it/dashboard/people/${personId}/account`);
    await expect(page).toHaveURL(new RegExp(`/it/dashboard/people/${personId}$`));
    await expect(page.getByRole('heading', { name: `${person.lastName} ${person.firstName}` })).toBeVisible();
    await expect(page.getByTestId('account-balance')).toHaveText(/150,00\s€/);

    // Staff sees the operational "registrato da" column (AC 2).
    await expect(page.getByTestId('account-statement-header-row')).toContainText('Registrato da');

    const rows = page.getByTestId('account-movement-row');
    await expect(rows).toHaveCount(2);
    // Reverse-chronological: the SECOND top-up (50 €) registered last appears FIRST.
    await expect(rows.nth(0)).toContainText('+50,00');
    await expect(rows.nth(0)).toContainText(ADMIN_EMAIL);
    await expect(rows.nth(1)).toContainText('+100,00');
    await expect(rows.nth(1)).toContainText(ADMIN_EMAIL);
  });

  test('the seeded pilot opens "Il mio conto": balance and movements visible, "registrato da" column absent (AC 1)', async ({ page }) => {
    // The seeded pilot's base account has no movements (only seed-demo records
    // top-ups, and e2e does not use it), so give it a real one as admin — the
    // pilot cannot top up their own account. Story 13.3: the AirOps estratto
    // renders an empty-state <p> instead of a placeholder row, so the movement
    // row assertion below needs an actual movement to exist.
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const pilotPersonId = await ownPersonId(page);
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await recordTopUp(page, pilotPersonId, 10000); // 100,00 €
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.getByRole('link', { name: 'Il mio conto' }).click();
    // Story 13.3: lands on the scheda persona itself (the account link's
    // `/account` suffix redirects there — R-13.3-b).
    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/]+$/);

    await expect(page.getByTestId('account-balance')).toHaveText(/€/);
    await expect(page.getByTestId('account-movement-row').first()).toBeVisible();
    await expect(page.getByTestId('account-statement-header-row')).not.toContainText('Registrato da');
  });

  test('a pilot gets a 403 AD-8 envelope from GET /api/v1/people/{other}/account/movements (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Elisa');
    const otherPersonId = await createPilotPerson(page, person);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const myId = await ownPersonId(page);
    expect(myId).not.toBe(otherPersonId);

    const response = await page.request.get(`/api/v1/people/${otherPersonId}/account/movements`);
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('money follows the page locale: the same statement on /en renders English formatting (review 3.1 M1 pattern)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Sara');
    const personId = await createPilotPerson(page, person);
    await recordTopUp(page, personId, 10000); // 100,00 €

    await page.goto(`/en/dashboard/people/${personId}/account`);
    await expect(page).toHaveURL(new RegExp(`/en/dashboard/people/${personId}$`));
    await expect(page.getByTestId('account-balance')).toHaveText(/€100\.00/);
    await expect(page.getByTestId('account-movement-row').first()).toContainText('+€100.00');
  });
});
