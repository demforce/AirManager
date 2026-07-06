import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/account-adjustments.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';

/** Same login helper as accounts-topups.spec.ts / account-statement.spec.ts. */
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
 * Every scenario creates its own person (append-only ledger, AD-3: balances
 * accumulate across runs — never assume a fresh 0 on seed data). The person
 * gets a UNIQUE email: the negative-balance alert (AC 2) lands in Mailpit
 * addressed to it, so per-recipient search isolates this run's messages.
 */
function uniquePerson(prefix: string): { firstName: string; lastName: string; email: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { firstName: prefix, lastName: `Rettifica-${suffix}`, email: `adj-${suffix}@e2e.airmanager.local` };
}

/** Creates a person (with email) via the API and activates the pilot profile (which creates the Account, story 3.1 AC 1). */
async function createPilotPerson(page: Page, person: { firstName: string; lastName: string; email: string }): Promise<string> {
  const createResponse = await page.request.post('/api/v1/people', {
    data: { firstName: person.firstName, lastName: person.lastName, email: person.email },
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

/** Counts Mailpit messages addressed to `to` (pattern from user-management.spec.ts, per-recipient to isolate parallel tests). */
async function countMailpitMessagesTo(to: string): Promise<number> {
  const response = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
  const body = (await response.json()) as { messages: Array<{ ID: string }> };
  return body.messages.length;
}

async function waitForMailpitCount(to: string, expected: number, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countMailpitMessagesTo(to)) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Expected ${expected} Mailpit message(s) to "${to}" within ${timeoutMs}ms`);
}

/** Fills and submits the adjustment panel (assumes it is already open). */
async function submitAdjustment(page: Page, amount: string, reason: string): Promise<void> {
  await page.getByLabel('Importo (EUR, con segno)').fill(amount);
  await page.getByLabel('Motivo').fill(reason);
  await page.getByRole('button', { name: 'Conferma rettifica' }).click();
  await expect(page.getByTestId('adjustment-feedback')).toHaveText('Rettifica registrata.');
}

test.describe('Account adjustments and negative-balance alerts (Story 3.3)', () => {
  test('staff records a −250 € rettifica on a 0 € account: saldo −250 €, ADJUSTMENT row, alert email, listed in /dashboard/finance; a further −10 € does NOT resend (AC 1/2/3)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Rita');
    const personId = await createPilotPerson(page, person);

    await page.goto(`/it/dashboard/people/${personId}/account`);
    await expect(page.getByTestId('account-statement-balance')).toHaveText(/0,00\s€/);

    // Rettifica from the header action (standalone, AC 1: motivo obbligatorio).
    await page.getByRole('button', { name: 'Registra rettifica' }).click();
    await submitAdjustment(page, '-250', 'Addebito pacchetto ore errato');

    // Balance and statement refresh server-side (router.refresh).
    await expect(page.getByTestId('account-statement-balance')).toHaveText(/-250,00\s€/);
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Rettifica');
    await expect(rows.first()).toContainText('Addebito pacchetto ore errato');
    await expect(rows.first()).toContainText('-250,00');

    // AC 2: 0 → −250 € crosses below the −200 € default threshold → ONE email in Mailpit.
    await waitForMailpitCount(person.email, 1);

    // AC 2: the account shows up in the staff "saldi negativi" list, reached
    // via the repointed "Finanze" nav item.
    await page.goto('/it/dashboard');
    await page.getByRole('link', { name: 'Finanze' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/finance$/);
    const negativeRow = page.getByTestId('negative-balance-row').filter({ hasText: person.lastName });
    await expect(negativeRow).toHaveCount(1);
    await expect(negativeRow).toContainText(/-250,00\s€/);

    // AC 3: a second rettifica that stays in the same band (belowThreshold →
    // belowThreshold) must NOT resend the email.
    await page.goto(`/it/dashboard/people/${personId}/account`);
    await page.getByRole('button', { name: 'Registra rettifica' }).click();
    await submitAdjustment(page, '-10', 'Conguaglio carburante');
    await expect(page.getByTestId('account-statement-balance')).toHaveText(/-260,00\s€/);

    // Give a would-be (wrong) second email time to arrive, then assert the count is unchanged.
    await page.waitForTimeout(1_500);
    expect(await countMailpitMessagesTo(person.email)).toBe(1);
  });

  test('a rettifica linked to a movement shows the badge and consumes the row action (AC 1, one adjustment per original)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Sergio');
    const personId = await createPilotPerson(page, person);
    await recordTopUp(page, personId, 10000); // +100,00 € — the movement to correct.

    await page.goto(`/it/dashboard/people/${personId}/account`);
    const topUpRow = page.locator('tbody tr').filter({ hasText: 'Ricarica' });
    await topUpRow.getByRole('button', { name: 'Rettifica questo movimento' }).click();
    // The panel names the linked original movement.
    await expect(page.getByTestId('account-adjustment-form')).toContainText('Collegata al movimento del');
    // Reason deliberately does NOT contain "Ricarica": the `hasText:
    // 'Ricarica'` row filter below must match ONLY the original top-up row.
    await submitAdjustment(page, '-100', 'Registrata due volte per errore');

    // The linked ADJUSTMENT row carries the "rettifica di ..." badge (AC 1).
    await expect(page.getByTestId('adjustment-badge')).toHaveText(/Rettifica del movimento del/);
    // The original is intact (still listed) but can no longer be adjusted
    // again — the row action disappears (reversalOfId is unique).
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.locator('tbody tr').filter({ hasText: 'Ricarica' }).getByRole('button', { name: 'Rettifica questo movimento' })).toHaveCount(0);
    // 100 → 0 stays in the "ok" band: no alert email for this person.
    expect(await countMailpitMessagesTo(person.email)).toBe(0);
  });

  test('a second adjustment linked to the same movement is rejected with a 409 AD-8 envelope (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Tullio');
    const personId = await createPilotPerson(page, person);
    await recordTopUp(page, personId, 5000);

    const movementsResponse = await page.request.get(`/api/v1/people/${personId}/account/movements`);
    const movements = (await movementsResponse.json()) as { items: Array<{ id: string }> };
    const originalId = movements.items[0].id;

    const first = await page.request.post(`/api/v1/people/${personId}/account/adjustments`, {
      data: { amountCents: -5000, reason: 'Storno ricarica', originalMovementId: originalId },
    });
    expect(first.status()).toBe(200);

    const second = await page.request.post(`/api/v1/people/${personId}/account/adjustments`, {
      data: { amountCents: -100, reason: 'Doppio storno', originalMovementId: originalId },
    });
    expect(second.status()).toBe(409);
    const body = await second.json();
    expect(body.error.code).toBe('CONFLICT');
  });

  test('a pilot gets a 403 AD-8 envelope from POST /api/v1/people/{id}/account/adjustments — even on their own account (AC 1, AD-5)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const myId = await ownPersonId(page);

    const response = await page.request.post(`/api/v1/people/${myId}/account/adjustments`, {
      data: { amountCents: -100, reason: 'Tentativo non autorizzato' },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
