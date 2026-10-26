import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/aircraft-rates.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Historicized aircraft rates (story 4.1, AD-4/AD-2; extended with an
 * optional "dry" rate by epic 12 story 12.5, AC 1 — display-only, never
 * fed into pricing). Rebuilt onto `/dashboard/fleet`'s slide-over "Tariffe"
 * section (the legacy `/dashboard/aircraft` table page is gone).
 */

/** Same login helper as the other aircraft e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
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

/** Creates an aircraft via the fleet slide-over, then opens it (search-scoped) — same helper shape as aircraft-management.spec.ts/aircraft-status-hours.spec.ts. */
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

/** Today, `YYYY-MM-DD`, browser-local time — matches the "In vigore da" field's default. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A safely-in-the-past date — always earlier than any run-unique aircraft's creation time. */
const PAST_DATE = '2020-01-01';

/** `YYYY-MM-DD` -> `DD/MM/YYYY`, the registry's own `formatDateOnly` presentation (story 11.3). */
function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

test.describe('Historicized aircraft rates (Story 4.1, AD-4/AD-2; dry rate added by epic 12 story 12.5, AC 1)', () => {
  test('admin adds a past and a current rate (with an optional dry rate); history shows both and the current rate is the most recent (AC 1)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('R1');
    await createAndOpenAircraft(page, aircraft);

    const today = todayDateOnly();
    const newRateForm = page.getByTestId('new-rate-form');

    // First rate: 150 €/h wet (no dry) from a past date.
    await newRateForm.getByLabel('Prezzo wet (€/h)').fill('150,00');
    await newRateForm.getByLabel('In vigore da').fill(PAST_DATE);
    await page.getByTestId('new-rate-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Tariffa aggiunta' })).toBeVisible();

    // The current rate (effective today) already reflects it — 150,00 €/h, no dry line.
    await expect(page.getByTestId('rates-current')).toContainText(/150,00\s€/);
    await expect(page.getByTestId('rates-current-dry')).toHaveCount(0);

    // Second rate: 160 €/h wet + 115 €/h dry from today.
    await newRateForm.getByLabel('Prezzo wet (€/h)').fill('160,00');
    await newRateForm.getByLabel('Prezzo dry (€/h) — opzionale').fill('115,00');
    await newRateForm.getByLabel('In vigore da').fill(today);
    await page.getByTestId('new-rate-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Tariffa aggiunta' })).toBeVisible();

    // Current rate now 160,00 €/h wet + 115,00 €/h dry (AD-4: max validFrom <= today).
    await expect(page.getByTestId('rates-current')).toContainText(/160,00\s€/);
    await expect(page.getByTestId('rates-current-dry')).toContainText(/115,00\s€/);

    // History (append-only, AC 1): BOTH rows, most recent first, dry shown only on the row that has it.
    const historyRows = page.getByTestId('rate-history-row');
    await expect(historyRows).toHaveCount(2);
    await expect(historyRows.nth(0)).toContainText(ddmmyyyy(today));
    await expect(historyRows.nth(0)).toContainText(/160,00\s€/);
    await expect(historyRows.nth(0)).toContainText(/115,00\s€.*dry/);
    await expect(historyRows.nth(1)).toContainText(ddmmyyyy(PAST_DATE));
    await expect(historyRows.nth(1)).toContainText(/150,00\s€/);
    await expect(historyRows.nth(1)).not.toContainText('dry');
  });

  test('a second rate with the same validFrom shows a 409 conflict message (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('R2');
    await createAndOpenAircraft(page, aircraft);

    const newRateForm = page.getByTestId('new-rate-form');
    await newRateForm.getByLabel('Prezzo wet (€/h)').fill('150,00');
    await newRateForm.getByLabel('In vigore da').fill(PAST_DATE);
    await page.getByTestId('new-rate-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Tariffa aggiunta' })).toBeVisible();
    await expect(page.getByTestId('rates-current')).toContainText(/150,00\s€/);

    // Re-insert a rate with the SAME validFrom (AC 2 — 409).
    await newRateForm.getByLabel('Prezzo wet (€/h)').fill('999,00');
    await newRateForm.getByLabel('In vigore da').fill(PAST_DATE);
    await page.getByTestId('new-rate-submit').click();

    await expect(page.getByTestId('new-rate-error')).toContainText('Esiste già una tariffa con questa data di decorrenza.');
  });

  test('a pilot gets a 403 AD-8 envelope from POST /api/v1/aircraft/{id}/rates', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('R4');
    await createAndOpenAircraft(page, aircraft);
    const listResponse = await page.request.get('/api/v1/aircraft', { params: { q: aircraft.registration } });
    const listed = (await listResponse.json()) as { items: Array<{ id: string }> };
    const aircraftId = listed.items[0]?.id;
    expect(aircraftId).toBeTruthy();

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.post(`/api/v1/aircraft/${aircraftId}/rates`, {
      data: { priceCentsPerHour: 16000, validFrom: PAST_DATE },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('rate history shows only the last 5 by default, with "mostra tutte" revealing the rest (AC 2, story 13.4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('R5');
    await createAndOpenAircraft(page, aircraft);

    const listResponse = await page.request.get('/api/v1/aircraft', { params: { q: aircraft.registration } });
    const listed = (await listResponse.json()) as { items: Array<{ id: string }> };
    const aircraftId = listed.items[0]?.id;
    expect(aircraftId).toBeTruthy();

    // Seed 6 historicized rates directly via the API (distinct past `validFrom` dates,
    // AC 2's 409-on-duplicate-date guard) — enough to trip the "last 5" default.
    const validFroms = ['2015-01-01', '2016-01-01', '2017-01-01', '2018-01-01', '2019-01-01', '2020-01-01'];
    for (const [index, validFrom] of validFroms.entries()) {
      const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraftId}/rates`, {
        data: { priceCentsPerHour: 10000 + index * 100, validFrom },
      });
      expect(rateResponse.status()).toBe(201);
    }

    // Reopen the editor — a fresh fetch of the now 6-row history.
    await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
    await cardFor(page, aircraft.registration).click();

    const historyRows = page.getByTestId('rate-history-row');
    await expect(historyRows).toHaveCount(5);
    const showAllButton = page.getByTestId('rates-history-show-all');
    await expect(showAllButton).toContainText('1');

    await showAllButton.click();
    await expect(historyRows).toHaveCount(6);
    await expect(showAllButton).toHaveCount(0);
  });

  // Story 14.8 ("form velivolo unificato" — feedback utente: "il form di
  // creazione non espone tutte le voci del form di modifica, es. il
  // costo"): the create slide-over now folds the wet/dry rate AND the
  // initial hour meter into the SAME composite submit as the identity
  // fields.
  test('creates an aircraft with wet+dry rate and hour meter in ONE composite submit — card and editor show them immediately, no edit round-trip (story 14.8, AC 1/2/4)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('C1');

    await page.goto('/it/dashboard/fleet');
    await page.getByTestId('fleet-new-button').click();
    const form = page.getByTestId('identity-form');
    await form.getByLabel('Marche').fill(aircraft.registration);
    await form.getByLabel('Tipo').fill(aircraft.type);
    await form.getByLabel('Modello').fill(aircraft.model);
    await form.getByLabel('Contaore iniziale (minuti)').fill('600');
    await page.getByTestId('new-aircraft-rate-price').fill('120,00');
    await page.getByTestId('new-aircraft-rate-price-dry').fill('95,00');
    // "In vigore da" left at its "today" default.
    await page.getByTestId('identity-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Velivolo creato' })).toBeVisible();

    // The fleet card already shows the wet rate — no separate "add a rate" step.
    await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
    const card = cardFor(page, aircraft.registration);
    await expect(card).toContainText(/120,00\s€/);

    // Reopening the editor confirms hour meter + wet/dry rate are ALREADY there.
    await card.click();
    await expect(page.getByTestId('hour-meter-current')).toContainText('10:00');
    await expect(page.getByTestId('rates-current')).toContainText(/120,00\s€/);
    await expect(page.getByTestId('rates-current-dry')).toContainText(/95,00\s€/);
  });

  test('a dry price WITHOUT a wet one blocks the submit and marks the wet field — never silently dropped (review 14.8 F1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('F1');

    await page.goto('/it/dashboard/fleet');
    await page.getByTestId('fleet-new-button').click();
    const form = page.getByTestId('identity-form');
    await form.getByLabel('Marche').fill(aircraft.registration);
    await form.getByLabel('Tipo').fill(aircraft.type);
    await form.getByLabel('Modello').fill(aircraft.model);
    await page.getByTestId('new-aircraft-rate-price-dry').fill('95,00');
    await page.getByTestId('identity-submit').click();

    // The submit is BLOCKED: wet price marked as required, editor stays open,
    // no toast — and the aircraft was never created.
    await expect(page.getByTestId('new-aircraft-rate-price')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('toast').filter({ hasText: 'Velivolo creato' })).toHaveCount(0);
    const listResponse = await page.request.get(`/api/v1/aircraft?q=${encodeURIComponent(aircraft.registration)}`);
    const list = (await listResponse.json()) as { items: unknown[] };
    expect(list.items).toHaveLength(0);
  });

});
