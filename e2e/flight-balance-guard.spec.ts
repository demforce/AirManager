import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Flight registration balance guard + AOG guard (TD-8, AC 1/2/3/4-bis/7) —
 * the two guards that block `POST /api/v1/flights`: an insufficient balance
 * (admin-only `force` bypass) and an out-of-service aircraft (never
 * bypassable). Mirrors `flights.spec.ts`'s own helpers (this repo's e2e
 * specs are deliberately self-contained, no shared helper module).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/flight-balance-guard.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';

/** Same login helper as `flights.spec.ts`. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Same `SearchCombobox` typeahead helper as `flights.spec.ts`. */
async function selectFromCombobox(combobox: Locator, query: string, optionLabel: string): Promise<void> {
  await combobox.click();
  await combobox.fill(query);
  await combobox.page().getByRole('option', { name: optionLabel, exact: true }).click();
}

/** Same "open the registration dialog" helper as `flights.spec.ts`. */
async function openRegisterDialog(page: Page): Promise<void> {
  await page.getByTestId('flight-open-register').click();
  await expect(page.getByTestId('flight-form')).toBeVisible();
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

/** A safely-in-the-past date, before any run-unique aircraft/rate created below. */
const PAST_DATE = '2020-01-01';

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as `flights.spec.ts`. */
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

/** Same "create a STAFF user + set its password" helper as `flights.spec.ts`. */
async function createStaffUserAndSetPassword(page: Page, password: string): Promise<string> {
  const email = uniqueEmail('staff-balance-guard');
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

/** A fresh pilot with an active profile (so an `Account` exists) and NO movements at all — balance exactly 0,00 €, the simplest way to trigger `INSUFFICIENT_BALANCE` on any real (>0) charge. */
async function createZeroBalancePilot(page: Page): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Zero';
  const lastName = `Balance-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  return { personId: person.id, firstName, lastName };
}

async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-BG${suffix}`.toUpperCase().slice(0, 20);

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

test.describe('Flight registration insufficient-balance guard (TD-8, AC 1/2/7)', () => {
  test('staff: a charge exceeding the balance is blocked with a 422 message in the dialog, no force affordance', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 15000); // 150,00 €/h
    const pilot = await createZeroBalancePilot(page); // balance 0,00 €

    const staffPassword = 'StaffBalanceGuard123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);
    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);

    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(
      page.getByTestId('flight-form').getByLabel('Pilota o allievo'),
      pilot.lastName,
      `${pilot.lastName} ${pilot.firstName}`,
    );
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:00'); // 60' @ 150,00 €/h -> 150,00 €, balance 0,00 €.
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText('Saldo insufficiente');
    await expect(page.getByTestId('flight-form-error')).toContainText('150,00');
    await expect(page.getByTestId('force-flight-section')).toHaveCount(0);
    await expect(page.getByTestId('flight-row').filter({ hasText: aircraft.registration })).toHaveCount(0);
  });

  test('admin: forces the blocked charge with a motivazione and the flight lands in the registry', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 15000); // 150,00 €/h
    const pilot = await createZeroBalancePilot(page); // balance 0,00 €

    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(
      page.getByTestId('flight-form').getByLabel('Pilota o allievo'),
      pilot.lastName,
      `${pilot.lastName} ${pilot.firstName}`,
    );
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:00');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText('Saldo insufficiente');
    const forceSection = page.getByTestId('force-flight-section');
    await expect(forceSection).toBeVisible();

    // Submitting without a motivo is rejected client-side first.
    await forceSection.getByTestId('force-flight-submit').click();
    await expect(forceSection.getByTestId('force-flight-error')).toBeVisible();

    await forceSection.getByTestId('force-flight-reason').fill('Autorizzato dal direttore per volo urgente');
    await forceSection.getByTestId('force-flight-submit').click();

    await expect(page.getByTestId('force-flight-section')).toHaveCount(0);
    const row = page.getByTestId('flight-row').filter({ hasText: aircraft.registration });
    await expect(row).toBeVisible();

    // The override is tracked and surfaced on the flight DTO (`flights.manage`-gated).
    const listResponse = await page.request.get(`/api/v1/flights?personId=${pilot.personId}&pageSize=50`);
    expect(listResponse.status()).toBe(200);
    const listBody = (await listResponse.json()) as { items: Array<{ aircraft: { registration: string }; balanceForcedAt: string | null }> };
    const forcedFlight = listBody.items.find((item) => item.aircraft.registration === aircraft.registration);
    expect(forcedFlight?.balanceForcedAt).not.toBeNull();
  });

  test('a staff actor attempting force:true directly via the API gets 403 (before any balance check)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createZeroBalancePilot(page);

    const staffPassword = 'StaffBalanceGuardApi123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);
    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);

    const response = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        departureAirfield: 'Base',
        arrivalAirfield: 'Base',
        takeoffAt: `${PAST_DATE}T10:00:00.000Z`,
        landingAt: `${PAST_DATE}T11:00:00.000Z`,
        flightType: 'TOURISM',
        force: true,
        forceReason: 'Tentativo non autorizzato',
      },
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

test.describe('Flight registration AOG guard (TD-8, AC 4-bis/7)', () => {
  test('an out-of-service aircraft blocks registration with the stop reason in the dialog, never bypassable', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createZeroBalancePilot(page);
    const stopReason = 'Manutenzione motore programmata';

    const outOfServiceResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/out-of-service`, {
      data: { reason: stopReason },
    });
    expect(outOfServiceResponse.status()).toBe(200);

    await page.goto('/it/dashboard/flights');
    await openRegisterDialog(page);
    await selectFromCombobox(page.getByTestId('flight-form').getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(
      page.getByTestId('flight-form').getByLabel('Pilota o allievo'),
      pilot.lastName,
      `${pilot.lastName} ${pilot.firstName}`,
    );
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

    await expect(page.getByTestId('flight-form-error')).toContainText('fuori servizio');
    await expect(page.getByTestId('flight-form-error')).toContainText(stopReason);
    await expect(page.getByTestId('force-flight-section')).toHaveCount(0);
    await expect(page.getByTestId('flight-row').filter({ hasText: aircraft.registration })).toHaveCount(0);
  });
});
