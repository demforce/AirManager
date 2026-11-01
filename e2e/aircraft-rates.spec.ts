import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { seedAircraftRate } from './db-fixtures';
import { addDaysIso, todayRome } from './helpers';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/aircraft-rates.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Aircraft rates (story 4.1, AD-4/AD-2), reshaped by story 19.3: two prices
 * (student, pilot), a `validFrom` of today or later only (Europe/Rome), a
 * rewrite of the row on the same day instead of a 409 (R-19-f), and the
 * editor's ONE form with ONE Salva (R-19-m) — no history, no display-only price. This is
 * the one spec that proves the rate API path; every other spec that needs a
 * rate in the PAST writes it through `db-fixtures.ts` (D-7).
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

/** A safely-in-the-past date — the "rate in effect today" fixtures start there (SQL, D-7). */
const PAST_DATE = '2020-01-01';

type Rate = { studentPriceCents: number; pilotPriceCents: number; validFrom: string };

async function createAircraft(page: Page, prefix: string): Promise<{ id: string; registration: string }> {
  const aircraft = uniqueAircraft(prefix);
  const response = await page.request.post('/api/v1/aircraft', { data: aircraft });
  expect(response.status()).toBe(201);
  return { id: ((await response.json()) as { id: string }).id, registration: aircraft.registration };
}

async function ratesOf(page: Page, aircraftId: string): Promise<Rate[]> {
  const response = await page.request.get(`/api/v1/aircraft/${aircraftId}/rates`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as Rate[]).map(({ studentPriceCents, pilotPriceCents, validFrom }) => ({ studentPriceCents, pilotPriceCents, validFrom }));
}

/** Opens the editor of a search-scoped card (same TD-1 lesson as aircraft-management.spec.ts). */
async function openEditor(page: Page, aircraft: { id: string; registration: string }): Promise<void> {
  await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
  await page.getByTestId(`ac-card-${aircraft.id}`).click();
  await expect(page.getByTestId('identity-form')).toBeVisible();
}

/** Every `PATCH`/`POST` the editor sends to the aircraft API from now on — to prove that a blocked Salva sends nothing. */
function recordAircraftWrites(page: Page): Request[] {
  const writes: Request[] = [];
  page.on('request', (request) => {
    if ((request.method() === 'PATCH' || request.method() === 'POST') && /\/api\/v1\/aircraft(\/[^/]+)?$/.test(new URL(request.url()).pathname)) writes.push(request);
  });
  return writes;
}

const panel = (page: Page) => page.locator('.slideover.open');
const studentField = (page: Page) => page.getByTestId('aircraft-rate-student');
const pilotField = (page: Page) => page.getByTestId('aircraft-rate-pilot');
const validFromField = (page: Page) => page.getByTestId('aircraft-rate-valid-from');
const save = (page: Page) => page.getByTestId('identity-submit');
const updatedToast = (page: Page) => page.getByTestId('toast').filter({ hasText: 'Velivolo aggiornato.' });

test.describe('Aircraft rates: two prices, decorrenza from today, the editor\'s single Salva (Story 4.1; Story 19.3)', () => {
  test('one form, one Salva: the Tariffe block lives in identity-form, with the current prices as placeholders and hints, no history and no old price labels (AC 17-18)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'R1');
    await seedAircraftRate(aircraft.id, { studentPriceCents: 12000, pilotPriceCents: 14000, validFrom: PAST_DATE });
    await openEditor(page, aircraft);

    // ONE form in the whole panel, and it holds the rate fields.
    await expect(panel(page).locator('form')).toHaveCount(1);
    const form = page.getByTestId('identity-form');
    await expect(form.getByTestId('aircraft-rate-student')).toBeVisible();
    await expect(form.getByTestId('aircraft-rate-pilot')).toBeVisible();
    await expect(form.getByTestId('aircraft-rate-valid-from')).toBeVisible();
    // The footer's submit is the only button that saves data.
    await expect(panel(page).locator('button[type="submit"]')).toHaveCount(1);
    await expect(panel(page).locator('.so-foot button[type="submit"]')).toHaveAttribute('data-testid', 'identity-submit');

    // Placeholder = the price as typed, hint = the price in words (linked, accessible).
    await expect(studentField(page)).toHaveAttribute('placeholder', '120,00');
    await expect(pilotField(page)).toHaveAttribute('placeholder', '140,00');
    await expect(studentField(page)).toHaveAccessibleDescription(/^Attuale: 120,00\s€\/h — lascia vuoto per non cambiarlo\.$/);
    await expect(pilotField(page)).toHaveAccessibleDescription(/^Attuale: 140,00\s€\/h — lascia vuoto per non cambiarlo\.$/);
    const today = todayRome();
    await expect(validFromField(page)).toHaveValue(today);
    await expect(validFromField(page)).toHaveAttribute('min', today);
    // Nothing scheduled: no "variazione programmata" line.
    await expect(page.getByTestId('aircraft-rate-scheduled')).toHaveCount(0);

    // Gone: the second form, its submit, the two old current-rate readouts and the history.
    for (const testId of ['new-rate-form', 'new-rate-submit', 'rates-current', 'rates-current-dry', 'rate-history-row', 'rates-history-show-all']) {
      await expect(page.getByTestId(testId)).toHaveCount(0);
    }
    await expect(panel(page)).not.toContainText(/\bwet\b|\bdry\b|Storico tariffe/i);
  });

  test('Salva semantics: empty prices write no rate; one price typed inherits the other; the panel stays open on a fresh block with updated placeholders (AC 19a-b, AC 21)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'R2');
    await seedAircraftRate(aircraft.id, { studentPriceCents: 12000, pilotPriceCents: 14000, validFrom: PAST_DATE });
    const today = todayRome();
    await openEditor(page, aircraft);

    // (a) Prices empty, model changed: the model is saved, no rate row is added.
    await page.getByTestId('identity-form').getByLabel('Modello').fill('Tecnam P2008 JC');
    await save(page).click();
    await expect(updatedToast(page)).toBeVisible();
    expect(await ratesOf(page, aircraft.id)).toEqual([{ studentPriceCents: 12000, pilotPriceCents: 14000, validFrom: PAST_DATE }]);
    const listed = await page.request.get(`/api/v1/aircraft/${aircraft.id}`);
    expect(((await listed.json()) as { model: string }).model).toBe('Tecnam P2008 JC');

    // (b) Only the student price typed: today's row takes 125,00 and the pilot price in effect.
    await studentField(page).fill('125,00');
    await save(page).click();
    // AC 21: the panel stays open and the placeholder turns into the price just
    // saved for today (D-6) — which is also the sign the Salva answered.
    await expect(studentField(page)).toHaveAttribute('placeholder', '125,00');
    expect(await ratesOf(page, aircraft.id)).toEqual([
      { studentPriceCents: 12500, pilotPriceCents: 14000, validFrom: today },
      { studentPriceCents: 12000, pilotPriceCents: 14000, validFrom: PAST_DATE },
    ]);
    await expect(page.getByTestId('identity-form')).toBeVisible();
    await expect(studentField(page)).toHaveValue('');
    await expect(pilotField(page)).toHaveValue('');
    await expect(validFromField(page)).toHaveValue(today);
    await expect(studentField(page)).toHaveAttribute('placeholder', '125,00');
    await expect(pilotField(page)).toHaveAttribute('placeholder', '140,00');
  });

  test('the same validFrom twice is a rewrite: one row of today with the new prices, the empty one inherited from the first save (AC 19e)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'R3');
    await seedAircraftRate(aircraft.id, { studentPriceCents: 12000, pilotPriceCents: 14000, validFrom: PAST_DATE });
    const today = todayRome();
    await openEditor(page, aircraft);

    await studentField(page).fill('130,00');
    await pilotField(page).fill('150,00');
    await save(page).click();
    await expect(studentField(page)).toHaveAttribute('placeholder', '130,00');

    await studentField(page).fill('135,00');
    await save(page).click();
    await expect(studentField(page)).toHaveAttribute('placeholder', '135,00');
    await expect(pilotField(page)).toHaveAttribute('placeholder', '150,00');
    expect(await ratesOf(page, aircraft.id)).toEqual([
      { studentPriceCents: 13500, pilotPriceCents: 15000, validFrom: today },
      { studentPriceCents: 12000, pilotPriceCents: 14000, validFrom: PAST_DATE },
    ]);
  });

  test('without a rate in effect a single price is not enough, and a typed date before today is blocked — neither sends a request (AC 18-19c-d)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'R4');
    await openEditor(page, aircraft);
    const writes = recordAircraftWrites(page);

    // No rate in effect: placeholder 0,00 and the "no rate" hint.
    await expect(studentField(page)).toHaveAttribute('placeholder', '0,00');
    await expect(studentField(page)).toHaveAccessibleDescription('Nessuna tariffa in vigore');

    // (c) One price only: the other one is required.
    await studentField(page).fill('110,00');
    await save(page).click();
    await expect(pilotField(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(pilotField(page)).toHaveAccessibleDescription('Campo obbligatorio.');
    await expect(studentField(page)).not.toHaveAttribute('aria-invalid', 'true');

    // (d) Both prices, a date before today typed (the native `min` does not stop typing).
    await pilotField(page).fill('130,00');
    await validFromField(page).fill(addDaysIso(todayRome(), -1));
    await save(page).click();
    await expect(validFromField(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(validFromField(page)).toHaveAccessibleDescription('La decorrenza non può essere nel passato.');

    expect(writes).toHaveLength(0);
    await expect(page.getByTestId('toast')).toHaveCount(0);
    expect(await ratesOf(page, aircraft.id)).toEqual([]);
  });

  test('"In vigore da" popover: every day before today is disabled, today picks; a DateInput without a min disables nothing (AC 24)', async ({ browser }) => {
    // The popover's "today" is the browser's: pin it to Rome (trap 6).
    const context = await browser.newContext({ timezoneId: 'Europe/Rome' });
    const page = await context.newPage();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'R5');
    await openEditor(page, aircraft);

    const validFromCalendar = page.locator('.fld', { has: validFromField(page) }).getByRole('button', { name: 'Apri calendario' });
    await validFromCalendar.scrollIntoViewIfNeeded();
    await validFromCalendar.click();
    const popover = page.locator('.cal-popover');
    await expect(popover).toBeVisible();
    const states = await popover.locator('.cal-grid .cal-cell').evaluateAll((cells) =>
      cells.map((cell) => ({ today: cell.classList.contains('today'), disabled: (cell as HTMLButtonElement).disabled })),
    );
    const todayIndex = states.findIndex((state) => state.today);
    expect(todayIndex).toBeGreaterThanOrEqual(0);
    expect(states.slice(0, todayIndex).every((state) => state.disabled)).toBe(true);
    expect(states.slice(todayIndex).every((state) => !state.disabled)).toBe(true);
    await expect(popover.getByRole('button', { name: 'Oggi' })).toBeEnabled();
    await popover.locator('.cal-cell.today').click();
    await expect(popover).toHaveCount(0);
    await expect(validFromField(page)).toHaveValue(todayRome());

    // The "Fermo fino al" field of the same panel has no `min`: nothing disabled.
    const untilCalendar = page.locator('.fld', { has: page.getByTestId('out-of-service-until') }).getByRole('button', { name: 'Apri calendario' });
    await untilCalendar.scrollIntoViewIfNeeded();
    await untilCalendar.click();
    await expect(popover).toBeVisible();
    await expect(popover.locator('.cal-cell:disabled')).toHaveCount(0);
    await context.close();
  });

  test('a scheduled change shows as ONE line under the fields, the nearest one, and a Salva with a nearer date replaces it (AC 25)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'R6');
    await seedAircraftRate(aircraft.id, { studentPriceCents: 12000, pilotPriceCents: 14000, validFrom: PAST_DATE });
    const in20 = addDaysIso(todayRome(), 20);
    const in40 = addDaysIso(todayRome(), 40);
    for (const rate of [
      { studentPriceCents: 13000, pilotPriceCents: 15000, validFrom: in20 },
      { studentPriceCents: 14000, pilotPriceCents: 16000, validFrom: in40 },
    ]) {
      expect((await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, { data: rate })).status()).toBe(201);
    }
    const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/');

    await openEditor(page, aircraft);
    const scheduled = page.getByTestId('aircraft-rate-scheduled');
    await expect(scheduled).toHaveCount(1);
    await expect(scheduled).toHaveText(new RegExp(`^Variazione programmata dal ${ddmmyyyy(in20)}: allievo 130,00\\s€/h · pilota 150,00\\s€/h$`));
    // A future rate is never the current one: the placeholders stay on today's prices.
    await expect(studentField(page)).toHaveAttribute('placeholder', '120,00');

    // A Salva dated sooner than the known one becomes the line.
    const in10 = addDaysIso(todayRome(), 10);
    await studentField(page).fill('125,00');
    await validFromField(page).fill(in10);
    await save(page).click();
    await expect(updatedToast(page)).toBeVisible();
    await expect(scheduled).toHaveText(new RegExp(`^Variazione programmata dal ${ddmmyyyy(in10)}: allievo 125,00\\s€/h · pilota 140,00\\s€/h$`));
    await expect(studentField(page)).toHaveAttribute('placeholder', '120,00');
  });

  test('an archived aircraft shows a sentence instead of the rate fields, and its Salva never carries a rate (AC 22)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'R7');
    expect((await page.request.post(`/api/v1/aircraft/${aircraft.id}/archive`)).status()).toBe(200);
    await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}&includeArchived=true`);
    await page.getByTestId(`ac-card-${aircraft.id}`).click();

    await expect(page.getByTestId('aircraft-rate-readonly')).toHaveText('Un velivolo archiviato non accetta nuove tariffe.');
    await expect(studentField(page)).toHaveCount(0);
    await expect(validFromField(page)).toHaveCount(0);

    const writes = recordAircraftWrites(page);
    await page.getByTestId('identity-form').getByLabel('Modello').fill('Archiviato rinominato');
    await save(page).click();
    await expect(updatedToast(page)).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.postDataJSON()).not.toHaveProperty('rate');
  });

  test('creation: the same two-price block in the one composite submit — one price alone is blocked, a past date too; both prices create the aircraft and its rate (AC 23)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('C1');
    const today = todayRome();

    await page.goto('/it/dashboard/fleet');
    await page.getByTestId('fleet-new-button').click();
    const form = page.getByTestId('identity-form');
    await form.getByLabel('Marche').fill(aircraft.registration);
    await form.getByLabel('Tipo').fill(aircraft.type);
    await form.getByLabel('Modello').fill(aircraft.model);
    const writes = recordAircraftWrites(page);

    // One price only: nothing to inherit in a creation — the other is required.
    await pilotField(page).fill('132,00');
    await save(page).click();
    await expect(studentField(page)).toHaveAttribute('aria-invalid', 'true');
    // A date before today: blocked too.
    await studentField(page).fill('125,00');
    await validFromField(page).fill(addDaysIso(today, -1));
    await save(page).click();
    await expect(validFromField(page)).toHaveAttribute('aria-invalid', 'true');
    expect(writes).toHaveLength(0);

    await validFromField(page).fill(today);
    await save(page).click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Velivolo creato' })).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.postDataJSON()).toMatchObject({ rate: { studentPriceCents: 12500, pilotPriceCents: 13200, validFrom: today } });

    // Reopened: the placeholders are the prices just created (no card shows a price, Q-19.3-a).
    const listed = (await (await page.request.get(`/api/v1/aircraft?q=${encodeURIComponent(aircraft.registration)}`)).json()) as { items: Array<{ id: string }> };
    const created = { id: listed.items[0]!.id, registration: aircraft.registration };
    await openEditor(page, created);
    await expect(page.getByTestId(`ac-card-${created.id}`)).not.toContainText('€');
    await expect(studentField(page)).toHaveAttribute('placeholder', '125,00');
    await expect(pilotField(page)).toHaveAttribute('placeholder', '132,00');
  });

  test('API: past decorrenza is a 422 on POST /rates, POST /aircraft and PATCH /aircraft (nothing written); PATCH with a rate on an archived aircraft is a 409; POST /rates on the same day rewrites (AC 4-5, AC 20)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const today = todayRome();
    const yesterday = addDaysIso(today, -1);
    const rate = (validFrom: string) => ({ studentPriceCents: 12000, pilotPriceCents: 14000, validFrom });

    const aircraft = await createAircraft(page, 'A1');
    const pastRate = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, { data: rate(yesterday) });
    expect(pastRate.status()).toBe(422);
    expect((await pastRate.json()).error.code).toBe('RATE_VALID_FROM_IN_PAST');

    // The old single-price body is a plain validation error now.
    const oldBody = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, { data: { priceCentsPerHour: 16000, validFrom: today } });
    expect(oldBody.status()).toBe(422);
    expect((await oldBody.json()).error.code).toBe('VALIDATION_ERROR');

    // Same day twice: 201 both times, ONE row with the second prices.
    expect((await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, { data: rate(today) })).status()).toBe(201);
    const rewrite = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, { data: { studentPriceCents: 12500, pilotPriceCents: 14500, validFrom: today } });
    expect(rewrite.status()).toBe(201);
    expect(await ratesOf(page, aircraft.id)).toEqual([{ studentPriceCents: 12500, pilotPriceCents: 14500, validFrom: today }]);

    // PATCH: new registration + a past rate → 422, and the registration did not change (one transaction).
    const patched = await page.request.patch(`/api/v1/aircraft/${aircraft.id}`, { data: { registration: uniqueAircraft('A9').registration, rate: rate(yesterday) } });
    expect(patched.status()).toBe(422);
    expect((await patched.json()).error.code).toBe('RATE_VALID_FROM_IN_PAST');
    expect(((await (await page.request.get(`/api/v1/aircraft/${aircraft.id}`)).json()) as { registration: string }).registration).toBe(aircraft.registration);

    // POST /aircraft with a past rate → 422, no aircraft created.
    const fresh = uniqueAircraft('A2');
    const created = await page.request.post('/api/v1/aircraft', { data: { ...fresh, rate: rate(yesterday) } });
    expect(created.status()).toBe(422);
    expect((await created.json()).error.code).toBe('RATE_VALID_FROM_IN_PAST');
    const search = await page.request.get(`/api/v1/aircraft?q=${encodeURIComponent(fresh.registration)}&includeArchived=true`);
    expect(((await search.json()) as { items: unknown[] }).items).toHaveLength(0);

    // PATCH with a rate on an archived aircraft → 409.
    const archived = await createAircraft(page, 'A3');
    expect((await page.request.post(`/api/v1/aircraft/${archived.id}/archive`)).status()).toBe(200);
    expect((await page.request.patch(`/api/v1/aircraft/${archived.id}`, { data: { rate: rate(today) } })).status()).toBe(409);
  });

  test('a pilot gets a 403 AD-8 envelope from POST /api/v1/aircraft/{id}/rates', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'R8');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
      data: { studentPriceCents: 15000, pilotPriceCents: 16000, validFrom: todayRome() },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
