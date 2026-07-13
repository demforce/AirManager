import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/package-consumption.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/** Same `SearchCombobox` typeahead helper as `flights.spec.ts` (story TD-3) — velivolo/persona. */
async function selectFromCombobox(combobox: Locator, query: string, optionLabel: string): Promise<void> {
  await combobox.click();
  await combobox.fill(query);
  await combobox.page().getByRole('option', { name: optionLabel, exact: true }).click();
}

/** Story 12.3 (AC 2): the registration form now lives in a `Dialog` — opens it before any `flight-form` field interaction (same helper as `flights.spec.ts`). */
async function openRegisterDialog(page: Page): Promise<void> {
  await page.getByTestId('flight-open-register').click();
  await expect(page.getByTestId('flight-form')).toBeVisible();
}

/** Run-unique names (same pattern as the other specs, for the dirty DB). */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

function uniqueName(prefix: string): string {
  return `${prefix} ${uniqueSuffix()}`;
}

/** A safely-in-the-past date, before any run-unique aircraft/package/rate created below. */
const PAST_DATE = '2020-01-01';

/** Story 12.5: `DatePicker`'s text input takes DD/MM/YYYY, not ISO. */
function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as the other e2e specs. */
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
 * Creates a fresh pilot person (with an active pilot profile, so an
 * `Account` exists) plus a linked login user — avoids the shared seeded
 * pilot (mutated by other, parallel e2e specs — `fullyParallel: true`).
 * Mirrors `createPilotWithLogin` (`flights.spec.ts`/`package-sale.spec.ts`).
 */
async function createPilotWithLogin(page: Page, password: string): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Consumo';
  const lastName = `Titolare-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail('pilot-pkgcons');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId: person.id } });
  expect(userResponse.status()).toBe(201);

  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(inviteEmail.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();

  // TD-8: a comfortably sufficient balance — still authenticated as ADMIN
  // (the set-password page never touched the session cookie), and a fresh
  // pilot otherwise starts at 0,00 €, which the new insufficient-balance
  // guard (AC 1) would now block on any real (non-package-covered) charge
  // this suite registers.
  const topUpResponse = await page.request.post(`/api/v1/people/${person.id}/account/top-ups`, {
    data: { amountCents: 50_000_000, paymentMethod: 'CASH', effectiveDate: PAST_DATE },
  });
  expect(topUpResponse.status()).toBe(200);

  return { personId: person.id, email, firstName, lastName };
}

/** Creates an aircraft with a rate in effect since `PAST_DATE` (same pattern as `flights.spec.ts`). */
async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-PC${suffix}`.toUpperCase().slice(0, 20);

  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 100 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };

  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
    data: { priceCentsPerHour, validFrom: PAST_DATE },
  });
  expect(rateResponse.status()).toBe(201);

  return { id: aircraft.id, registration };
}

/** Creates a package type, optionally restricted to a set of eligible aircraft (AD-6 eligibility rule 2). */
async function createPackageType(
  page: Page,
  data: { name: string; includedMinutes: number; priceCents: number; validityMonths?: number | null; aircraftIds?: string[] },
): Promise<{ id: string; name: string }> {
  const response = await page.request.post('/api/v1/package-types', { data });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; name: string };
}

test.describe('Package consumption in flight charges (Story 5.2, AC 1/2/3)', () => {
  test('an eligible package covers minutes FIFO, pro-rata excess is charged, and the package is untouched once exhausted or the aircraft is not eligible', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // Aircraft eligible for the package, 150,00 €/h.
    const aircraft = await createAircraftWithRate(page, 15000);
    // A second aircraft NOT associated with the package type (AD-6 eligibility rule 2), 100,00 €/h.
    const otherAircraft = await createAircraftWithRate(page, 10000);
    const typeName = uniqueName('Pacchetto Consumo');
    await createPackageType(page, {
      name: typeName,
      includedMinutes: 60, // 1:00
      priceCents: 50000, // 500,00 €
      aircraftIds: [aircraft.id],
    });
    const pilot = await createPilotWithLogin(page, 'PilotConsumo123!');

    // Still authenticated as admin — creating the pilot login above never touched this session cookie.
    // Sell the package via the UI (scheda persona).
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    await page.getByRole('button', { name: 'Vendi pacchetto' }).click();
    await page.getByLabel('Tipo di pacchetto').selectOption({ label: typeName });
    await page.getByLabel('Data valuta').fill(toDisplayDate(PAST_DATE));
    await page.getByRole('button', { name: 'Conferma vendita' }).click();
    await expect(page.getByTestId('packages-panel-feedback')).toBeVisible();
    const packageRow = page.getByTestId('hour-package-row').filter({ hasText: typeName });
    await expect(packageRow).toContainText('1:00'); // residuo pieno

    // Register a 70' flight on the eligible aircraft: 60' from the package, 10' pro-rata at full rate.
    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await page.getByLabel('Data volo').fill(toDisplayDate(PAST_DATE));
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:10');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

    // Da pacchetto 1:00, minuti addebitati 0:10, costo velivolo/totale 25,00 € (round(150*10/60)).
    const resultPanel = page.getByTestId('flight-result-panel');
    await expect(resultPanel).toContainText('1:10');
    await expect(resultPanel).toContainText('1:00'); // Da pacchetto
    await expect(resultPanel).toContainText('0:10'); // Minuti addebitati
    await expect(resultPanel.getByTestId('flight-result-total')).toContainText(/25,00\s€/);
    // TD-8: `createPilotWithLogin` now tops up 50.000.000 cents — the
    // resulting balance is that top-up minus this flight's 25,00 € charge.
    await expect(resultPanel.getByTestId('flight-result-new-balance')).toContainText(/499\.975,00\s€/);

    const firstFlightRow = page.getByTestId('flight-row').filter({ hasText: aircraft.registration }).first();
    await expect(firstFlightRow).toContainText(/25,00\s€/);

    // Story 12.4 (AC 1): the row-level "di cui X da pacchetto" note moved
    // into the detail sheet's addebito breakdown (`dt`/`dd` pairs — scoped
    // to the exact term to avoid any substring collision with the sheet's
    // own orari, lesson 11.2).
    await firstFlightRow.getByTestId('flight-detail-action').click();
    const sheet = page.getByTestId('flight-detail-sheet');
    await expect(sheet.locator('dt', { hasText: 'Da pacchetto' }).locator('xpath=following-sibling::dd[1]')).toHaveText('1:00');
    await expect(sheet.locator('dt', { hasText: 'Minuti addebitati' }).locator('xpath=following-sibling::dd[1]')).toHaveText('0:10');
    await sheet.getByRole('button', { name: 'Chiudi' }).click();
    await expect(sheet).toBeHidden();

    // Estratto conto: the FLIGHT_CHARGE row shows only the eccedenza (25,00 €), never the full 70'x150€/h.
    await page.goto(`/it/dashboard/people/${pilot.personId}/account`);
    const statementRow = page.locator('tbody tr').filter({ hasText: 'Addebito volo' }).first();
    await expect(statementRow).toContainText(/-25,00\s€/);
    await expect(page.getByTestId('account-statement-balance')).toContainText(/499\.975,00\s€/);

    // Packages panel: residuo sceso a 0 (esaurito).
    const exhaustedRow = page.getByTestId('hour-package-row').filter({ hasText: typeName });
    await expect(exhaustedRow).toContainText('0:00');
    await expect(exhaustedRow).toContainText('1:00'); // "Usati: 1:00"

    // A second flight on the SAME (now-exhausted) package: full rate, no coverage.
    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await page.getByLabel('Data volo').fill(toDisplayDate('2020-01-02'));
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:10');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

    const secondResultPanel = page.getByTestId('flight-result-panel');
    await expect(secondResultPanel.getByTestId('flight-result-total')).toContainText(/25,00\s€/); // 10' x 150€/h
    // Total charged against the top-up so far: 50,00 € (25,00 + 25,00) — no further package coverage.
    await expect(secondResultPanel.getByTestId('flight-result-new-balance')).toContainText(/499\.950,00\s€/);
    const secondFlightRow = page.getByTestId('flight-row').filter({ hasText: aircraft.registration }).filter({ hasText: '0:10' });
    // Story 12.4 (AC 1): the row itself no longer carries a "da pacchetto"
    // note at all (moved to the sheet) — assert the ABSENCE there instead,
    // proving the sheet's own conditional ("Da pacchetto" renders only when
    // `packageCoveredMinutes > 0`) correctly skips it for this full-rate flight.
    await secondFlightRow.getByTestId('flight-detail-action').click();
    const secondSheet = page.getByTestId('flight-detail-sheet');
    await expect(secondSheet).not.toContainText('Da pacchetto');
    await secondSheet.getByRole('button', { name: 'Chiudi' }).click();
    await expect(secondSheet).toBeHidden();

    // A flight on the NON-eligible aircraft: full rate, and the package (already exhausted anyway)
    // is never queried for this aircraft in the first place — verified via a FRESH package below.
    const freshTypeName = uniqueName('Pacchetto Intatto');
    await createPackageType(page, {
      name: freshTypeName,
      includedMinutes: 30,
      priceCents: 30000,
      aircraftIds: [aircraft.id],
    });
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    await page.getByRole('button', { name: 'Vendi pacchetto' }).click();
    await page.getByLabel('Tipo di pacchetto').selectOption({ label: freshTypeName });
    await page.getByLabel('Data valuta').fill(toDisplayDate('2020-01-03'));
    await page.getByRole('button', { name: 'Conferma vendita' }).click();
    await expect(page.getByTestId('packages-panel-feedback')).toBeVisible();

    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), otherAircraft.registration, otherAircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await page.getByLabel('Data volo').fill(toDisplayDate('2020-01-04'));
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

    // 30' x 100,00 €/h = 50,00 € (full rate, otherAircraft is not eligible for the fresh package).
    const thirdResultPanel = page.getByTestId('flight-result-panel');
    await expect(thirdResultPanel.getByTestId('flight-result-total')).toContainText(/50,00\s€/);
    const thirdFlightRow = page.getByTestId('flight-row').filter({ hasText: otherAircraft.registration });
    // Same absence check as the second flight, on the non-eligible aircraft.
    await thirdFlightRow.getByTestId('flight-detail-action').click();
    const thirdSheet = page.getByTestId('flight-detail-sheet');
    await expect(thirdSheet).not.toContainText('Da pacchetto');
    await thirdSheet.getByRole('button', { name: 'Chiudi' }).click();
    await expect(thirdSheet).toBeHidden();

    // The fresh package's residuo is untouched (still 0:30, no "Usati" note).
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    const freshRow = page.getByTestId('hour-package-row').filter({ hasText: freshTypeName });
    await expect(freshRow).toContainText('0:30');
    await expect(freshRow).not.toContainText('Usati');
  });
});
