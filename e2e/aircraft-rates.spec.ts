import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/aircraft-rates.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';

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

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@airmanager.local`;
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as user-management.spec.ts. */
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
 * Creates a STAFF-only user (via the admin users API — faster than the UI
 * form for a setup step) and returns credentials once the password is set —
 * the seed only ships admin + pilot (Dev Notes), and the 403 test below
 * needs an actor with `aircraft.manage` but deliberately WITHOUT
 * `settings.manage` to prove the permission split (AC's `createAircraftRate`
 * requires the stricter one).
 */
async function createStaffUserAndSetPassword(page: Page, password: string): Promise<string> {
  const email = uniqueEmail('staff');
  const response = await page.request.post('/api/v1/users', { data: { email, roles: ['STAFF'] } });
  expect(response.status()).toBe(201);

  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(inviteEmail.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();

  return email;
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

  test('a STAFF actor (aircraft.manage but not settings.manage) gets a 403 AD-8 envelope from POST rates', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('R3');
    await createAndOpenAircraft(page, aircraft);
    const listResponse = await page.request.get('/api/v1/aircraft', { params: { q: aircraft.registration } });
    const listed = (await listResponse.json()) as { items: Array<{ id: string }> };
    const aircraftId = listed.items[0]?.id;
    expect(aircraftId).toBeTruthy();

    const staffPassword = 'StaffRates123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);

    const response = await page.request.post(`/api/v1/aircraft/${aircraftId}/rates`, {
      data: { priceCentsPerHour: 16000, validFrom: PAST_DATE },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
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
});
