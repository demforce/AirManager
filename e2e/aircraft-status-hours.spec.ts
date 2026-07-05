import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/aircraft-status-hours.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

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

async function createAircraft(
  page: Page,
  aircraft: { registration: string; type: string; model: string },
): Promise<void> {
  await page.goto('/it/dashboard/aircraft');
  await page.getByRole('button', { name: 'Nuovo velivolo' }).click();
  await page.getByLabel('Marche', { exact: true }).fill(aircraft.registration);
  await page.getByLabel('Tipo', { exact: true }).fill(aircraft.type);
  await page.getByLabel('Modello', { exact: true }).fill(aircraft.model);
  await page.getByLabel('Contaore (minuti)').fill('750');
  await page.getByRole('button', { name: 'Crea velivolo' }).click();
  await expect(page.getByTestId('aircraft-feedback')).toBeVisible();
}

test.describe('Aircraft operational status and audited hour meter adjustments (Story 2.5)', () => {
  test('staff marks an aircraft out of service with a reason, then returns it to service (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('DDD');
    await createAircraft(page, aircraft);

    const row = page.getByRole('row', { name: new RegExp(aircraft.registration) });
    await expect(row.getByText('Operativo', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Fuori servizio' }).click();
    await page.getByLabel('Motivo', { exact: true }).fill('Revisione motore programmata');
    await page.getByRole('button', { name: 'Conferma' }).click();
    await expect(page.getByTestId('aircraft-feedback')).toBeVisible();

    // Badge flips to "Fuori servizio" and the row list still shows it (not archived).
    const outOfServiceRow = page.getByRole('row', { name: new RegExp(aircraft.registration) });
    await expect(outOfServiceRow.getByText('Fuori servizio', { exact: true })).toBeVisible();
    await expect(outOfServiceRow.getByTestId(/^operational-status-/)).toHaveAttribute(
      'title',
      'Revisione motore programmata',
    );

    // Returning to service: two-step confirm, badge flips back and the reason is gone.
    await outOfServiceRow.getByRole('button', { name: 'Rientro in servizio' }).click();
    await outOfServiceRow.getByRole('button', { name: 'Conferma' }).click();
    const restoredRow = page.getByRole('row', { name: new RegExp(aircraft.registration) });
    await expect(restoredRow.getByText('Operativo', { exact: true })).toBeVisible();
    await expect(restoredRow.getByTestId(/^operational-status-/)).not.toHaveAttribute('title', /.+/);
  });

  test('adjusting the hour meter updates the list value and records a tracked history row (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('EEE');
    await createAircraft(page, aircraft);

    const row = page.getByRole('row', { name: new RegExp(aircraft.registration) });
    await expect(row.getByText('12:30')).toBeVisible(); // 750 minutes, from createAircraft's fixed input.

    await row.getByRole('button', { name: 'Rettifica contaore' }).click();
    await page.getByLabel('Nuovo valore (minuti)').fill('900');
    await page.getByLabel('Motivo', { exact: true }).fill('Errore di lettura precedente');
    await expect(page.getByTestId('hour-meter-delta')).toHaveText('+2:30');
    await page.getByRole('button', { name: 'Registra rettifica' }).click();
    await expect(page.getByTestId('aircraft-feedback')).toBeVisible();

    // The list now shows the corrected value (900 minutes = 15:00).
    const updatedRow = page.getByRole('row', { name: new RegExp(aircraft.registration) });
    await expect(updatedRow.getByText('15:00')).toBeVisible();

    // Reopening the panel shows the tracked history: previous -> new, delta and reason.
    await updatedRow.getByRole('button', { name: 'Rettifica contaore' }).click();
    const historyRow = page.getByTestId('hour-meter-history-row');
    await expect(historyRow).toBeVisible();
    await expect(historyRow.getByText('12:30')).toBeVisible();
    await expect(historyRow.getByText('15:00')).toBeVisible();
    await expect(historyRow.getByText('+2:30')).toBeVisible();
    await expect(historyRow.getByText('Errore di lettura precedente')).toBeVisible();
  });

  test('a pilot gets a 403 AD-8 envelope from POST /api/v1/aircraft/{id}/out-of-service (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('FFF');
    await createAircraft(page, aircraft);
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
