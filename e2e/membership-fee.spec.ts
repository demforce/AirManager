import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/membership-fee.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createPilotPerson(page: Page): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Socio';
  const lastName = `Quota-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  return { personId: person.id, firstName, lastName };
}

function personOptionLabel(person: { firstName: string; lastName: string }): string {
  return `${person.lastName} ${person.firstName}`;
}

/** Same top-up pattern as `account-adjustments.spec.ts`/story 12.9 — `createPilotPerson`'s freshly-activated pilot profile has an Account at a ZERO balance (review F3: an addebito that would take it below zero is now refused), so most charging tests below pre-load it well above any fee amount they use. */
async function topUpAccount(page: Page, personId: string, amountCents: number): Promise<void> {
  const response = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
    data: { amountCents, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
  });
  expect(response.status()).toBe(200);
}

/**
 * "Quota associativa" (Story 12.11, AC 7; ratifiche utente 1/1a/1b): the
 * action debits the account (ADJUSTMENT, visible in Contabilità) AND
 * creates/renews the "Quota associativa" Expiry (visible in the Scadenze
 * registry) in ONE gesture.
 *
 * `mode: 'serial'` (Dev Agent Record): every test in this file writes the
 * SAME global `membership.annualFeeCents` setting — under `fullyParallel`
 * (`playwright.config.ts`) two of these tests racing on different workers
 * would clobber each other's fee value mid-test (verified during dev
 * verification: a parallel run intermittently read back a SIBLING test's fee
 * instead of its own). Serial execution removes that race entirely.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Quota associativa (Story 12.11, AC 7)', () => {
  test('charging a pilot for the first time creates an ADJUSTMENT movement (visible in billing) and a NEW "Quota associativa" expiry (visible in the registry), 12 months out', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // Ensure a non-zero default fee is configured (the action is disabled otherwise).
    const feeResponse = await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents: 5000 } });
    expect(feeResponse.status()).toBe(200);

    const pilot = await createPilotPerson(page);
    await topUpAccount(page, pilot.personId, 100_000); // review F3: sufficient balance for the addebito below

    await page.goto('/it/dashboard/expiries');
    await page.getByTestId('scadenze-membership-fee-button').click();
    const panel = page.getByTestId('membership-fee-panel');
    await expect(panel).toBeVisible();

    const combobox = panel.getByRole('combobox', { name: 'Pilota' });
    await combobox.click();
    await combobox.fill(pilot.lastName);
    await page.getByRole('option', { name: personOptionLabel(pilot), exact: true }).click();

    await expect(panel.getByTestId('membership-fee-amount')).toHaveValue('50.00');
    await panel.getByTestId('membership-fee-submit').click();
    await expect(panel.getByTestId('membership-fee-success')).toBeVisible();

    // Visible in Contabilità: an ADJUSTMENT movement for this pilot, negative amount (addebito).
    const movementsResponse = await page.request.get(`/api/v1/people/${pilot.personId}/account/movements`);
    expect(movementsResponse.status()).toBe(200);
    const movements = (await movementsResponse.json()) as { items: { type: string; amountCents: number; description: string | null }[] };
    const adjustment = movements.items.find((m) => m.type === 'ADJUSTMENT' && m.description?.startsWith('Quota associativa'));
    expect(adjustment).toBeDefined();
    expect(adjustment?.amountCents).toBe(-5000);

    // Visible in the Scadenze registry: a "Quota associativa" expiry, ~12 months out.
    const expiriesResponse = await page.request.get(`/api/v1/people/${pilot.personId}/expiries`);
    expect(expiriesResponse.status()).toBe(200);
    const expiries = (await expiriesResponse.json()) as { typeName: string; expiresAt: string }[];
    const membershipExpiry = expiries.find((e) => e.typeName === 'Quota associativa');
    expect(membershipExpiry).toBeDefined();
    const expectedYear = new Date().getUTCFullYear() + 1;
    expect(membershipExpiry?.expiresAt.startsWith(String(expectedYear))).toBe(true);
  });

  test('a second charge for the SAME pilot RENEWS the existing expiry (rolling forward from its current expiresAt) rather than creating a duplicate', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents: 3000 } });

    const pilot = await createPilotPerson(page);
    await topUpAccount(page, pilot.personId, 100_000); // review F3: sufficient balance for both charges below

    const firstCharge = await page.request.post(`/api/v1/people/${pilot.personId}/membership-fee`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { amountCents: 3000 },
    });
    expect(firstCharge.status()).toBe(200);
    const firstBody = (await firstCharge.json()) as { expiryId: string; expiresAt: string };

    const secondCharge = await page.request.post(`/api/v1/people/${pilot.personId}/membership-fee`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { amountCents: 3000 },
    });
    expect(secondCharge.status()).toBe(200);
    const secondBody = (await secondCharge.json()) as { expiryId: string; expiresAt: string };

    // Same expiry row, renewed (never a second "Quota associativa" row for the same person).
    expect(secondBody.expiryId).toBe(firstBody.expiryId);
    expect(secondBody.expiresAt > firstBody.expiresAt).toBe(true);

    const expiriesResponse = await page.request.get(`/api/v1/people/${pilot.personId}/expiries`);
    const expiries = (await expiriesResponse.json()) as { typeName: string }[];
    expect(expiries.filter((e) => e.typeName === 'Quota associativa')).toHaveLength(1);
  });

  test('a repeated request with the SAME Idempotency-Key replays the first response instead of double-charging', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents: 4000 } });

    const pilot = await createPilotPerson(page);
    await topUpAccount(page, pilot.personId, 100_000); // review F3: sufficient balance for the addebito below
    const key = crypto.randomUUID();

    const first = await page.request.post(`/api/v1/people/${pilot.personId}/membership-fee`, {
      headers: { 'Idempotency-Key': key },
      data: { amountCents: 4000 },
    });
    expect(first.status()).toBe(200);
    const firstBody = await first.json();

    const replay = await page.request.post(`/api/v1/people/${pilot.personId}/membership-fee`, {
      headers: { 'Idempotency-Key': key },
      data: { amountCents: 4000 },
    });
    expect(replay.status()).toBe(200);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    expect(await replay.json()).toEqual(firstBody);

    // Only ONE ADJUSTMENT for this pilot — the replay never re-executed the charge.
    const movementsResponse = await page.request.get(`/api/v1/people/${pilot.personId}/account/movements`);
    const movements = (await movementsResponse.json()) as { items: { type: string; description: string | null }[] };
    expect(movements.items.filter((m) => m.type === 'ADJUSTMENT' && m.description?.startsWith('Quota associativa'))).toHaveLength(1);
  });

  test('the endpoint requires an Idempotency-Key header (422 without it); gated finance.manage', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotPerson(page);
    await topUpAccount(page, pilot.personId, 100_000); // sufficient balance for the addebito below

    const missingKey = await page.request.post(`/api/v1/people/${pilot.personId}/membership-fee`, { data: { amountCents: 1000 } });
    expect(missingKey.status()).toBe(422);
    expect((await missingKey.json()).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const withKey = await page.request.post(`/api/v1/people/${pilot.personId}/membership-fee`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { amountCents: 1000 },
    });
    expect(withKey.status()).toBe(200);
  });

  test('an addebito that would take a ZERO-balance pilot below zero shows a clear error, no override checked (PO decision 2026-07-17, review F3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents: 5000 } });

    const pilot = await createPilotPerson(page); // no top-up: balance stays 0

    await page.goto('/it/dashboard/expiries');
    await page.getByTestId('scadenze-membership-fee-button').click();
    const panel = page.getByTestId('membership-fee-panel');
    await expect(panel).toBeVisible();

    const combobox = panel.getByRole('combobox', { name: 'Pilota' });
    await combobox.click();
    await combobox.fill(pilot.lastName);
    await page.getByRole('option', { name: personOptionLabel(pilot), exact: true }).click();

    // ADMIN sees the override checkbox (same `settings.manage` gate as "Invia promemoria") — left UNCHECKED.
    await expect(panel.getByTestId('membership-fee-override-checkbox')).not.toBeChecked();
    await panel.getByTestId('membership-fee-submit').click();

    await expect(panel.getByTestId('membership-fee-error')).toBeVisible();
    await expect(panel.getByTestId('membership-fee-success')).toHaveCount(0);

    // No account movement / expiry was created — the addebito never happened.
    const movementsResponse = await page.request.get(`/api/v1/people/${pilot.personId}/account/movements`);
    const movements = (await movementsResponse.json()) as { items: { type: string; description: string | null }[] };
    expect(movements.items.filter((m) => m.type === 'ADJUSTMENT' && m.description?.startsWith('Quota associativa'))).toHaveLength(0);
  });

  test('an ADMIN checking "Forza addebito" charges a ZERO-balance pilot below zero successfully (review F3 override)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents: 5000 } });

    const pilot = await createPilotPerson(page); // no top-up: balance stays 0

    await page.goto('/it/dashboard/expiries');
    await page.getByTestId('scadenze-membership-fee-button').click();
    const panel = page.getByTestId('membership-fee-panel');
    await expect(panel).toBeVisible();

    const combobox = panel.getByRole('combobox', { name: 'Pilota' });
    await combobox.click();
    await combobox.fill(pilot.lastName);
    await page.getByRole('option', { name: personOptionLabel(pilot), exact: true }).click();

    await panel.getByTestId('membership-fee-override-checkbox').check();
    await panel.getByTestId('membership-fee-submit').click();
    await expect(panel.getByTestId('membership-fee-success')).toBeVisible();

    const movementsResponse = await page.request.get(`/api/v1/people/${pilot.personId}/account/movements`);
    const movements = (await movementsResponse.json()) as { items: { type: string; amountCents: number; description: string | null }[] };
    const adjustment = movements.items.find((m) => m.type === 'ADJUSTMENT' && m.description?.startsWith('Quota associativa'));
    expect(adjustment?.amountCents).toBe(-5000); // balance now -5000, below zero — allowed by the override.
  });

  test('setting the fee to 0 disables the button on the Scadenze page, with a hint', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents: 0 } });

    await page.goto('/it/dashboard/expiries');
    const button = page.getByTestId('scadenze-membership-fee-button');
    await expect(button).toBeDisabled();
  });
});
