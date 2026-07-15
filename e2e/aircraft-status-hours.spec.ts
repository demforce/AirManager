import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/aircraft-status-hours.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Aircraft operational status and audited hour meter adjustments (Story
 * 2.5). Rebuilt onto `/dashboard/fleet`'s slide-over "Disponibilità"/
 * "Contaore" sections (the legacy `/dashboard/aircraft` table page is gone,
 * epic 12 story 12.5).
 */

/** Same login helper as aircraft-management.spec.ts. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueAircraft(prefix: string): { registration: string; type: string; model: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    registration: `I-${prefix}${suffix}`.toUpperCase().slice(0, 20),
    type: 'Ultraleggero 3 assi',
    model: `Test Model ${suffix}`,
  };
}

/** Search-scoped card locator (same TD-1 lesson as aircraft-management.spec.ts). */
function cardFor(page: Page, registration: string) {
  return page.locator('[data-testid^="ac-card-"]').filter({ hasText: registration });
}

/** Creates an aircraft via the fleet slide-over, then re-opens it search-scoped — same helper shape as aircraft-management.spec.ts/aircraft-rates.spec.ts. */
async function createAndOpenAircraft(page: Page, aircraft: { registration: string; type: string; model: string }): Promise<void> {
  await page.goto('/it/dashboard/fleet');
  await page.getByTestId('fleet-new-button').click();
  const form = page.getByTestId('identity-form');
  await form.getByLabel('Marche').fill(aircraft.registration);
  await form.getByLabel('Tipo').fill(aircraft.type);
  await form.getByLabel('Modello').fill(aircraft.model);
  await form.getByLabel('Contaore iniziale (minuti)').fill('750');
  await page.getByTestId('identity-submit').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Velivolo creato' })).toBeVisible();

  await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
  await cardFor(page, aircraft.registration).click();
}

test.describe('Aircraft operational status and audited hour meter adjustments (Story 2.5)', () => {
  test('staff marks an aircraft out of service with a reason, then returns it to service (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('DDD');
    await createAndOpenAircraft(page, aircraft);

    await expect(page.getByTestId('availability-current')).toContainText('—');

    await page.getByTestId('out-of-service-reason').fill('Revisione motore programmata');
    await page.getByTestId('out-of-service-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'fuori servizio' })).toBeVisible();

    // The editor's own section reflects the reason, and the card badge flips to AOG.
    await expect(page.getByTestId('availability-current')).toContainText('Revisione motore programmata');
    await expect(cardFor(page, aircraft.registration)).toContainText('AOG');

    // Returning to service: the reason is gone, the card badge flips back.
    await page.getByTestId('return-to-service-button').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'rimesso in servizio' })).toBeVisible();
    await expect(page.getByTestId('availability-current')).toContainText('—');
    await expect(cardFor(page, aircraft.registration)).toContainText('Disponibile');
  });

  test('adjusting the hour meter updates the editor + card and records a tracked history row (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('EEE');
    await createAndOpenAircraft(page, aircraft);

    await expect(page.getByTestId('hour-meter-current')).toContainText('12:30'); // 750 minutes, from the create form's fixed input.

    const hourMeterForm = page.getByTestId('hour-meter-form');
    await hourMeterForm.getByLabel('Nuovo valore (minuti)').fill('900');
    await hourMeterForm.getByLabel('Motivo').fill('Errore di lettura precedente');
    await expect(page.getByTestId('hour-meter-delta')).toHaveText('+2:30');
    await page.getByTestId('hour-meter-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Contaore rettificato' })).toBeVisible();

    // The editor now shows the corrected value (900 minutes = 15:00).
    await expect(page.getByTestId('hour-meter-current')).toContainText('15:00');

    // The tracked history: who, when, previous -> new, delta and reason.
    const historyRow = page.getByTestId('hour-meter-history-row');
    await expect(historyRow).toBeVisible();
    await expect(historyRow).toContainText('12:30');
    await expect(historyRow).toContainText('15:00');
    await expect(historyRow).toContainText('+2:30');
    await expect(historyRow).toContainText(ADMIN_EMAIL);
    await expect(historyRow).toContainText('Errore di lettura precedente');
  });

  test('a pilot gets a 403 AD-8 envelope from POST /api/v1/aircraft/{id}/out-of-service (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('FFF');
    await createAndOpenAircraft(page, aircraft);
    const createResponse = await page.request.get('/api/v1/aircraft', { params: { q: aircraft.registration } });
    const created = (await createResponse.json()) as { items: Array<{ id: string }> };
    const aircraftId = created.items[0]?.id;
    expect(aircraftId).toBeTruthy();

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.post(`/api/v1/aircraft/${aircraftId}/out-of-service`, {
      data: { reason: 'Should be forbidden' },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
