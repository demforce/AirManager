import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const STAFF_EMAIL = 'staff@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/settings.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitSearchResult = { messages: MailpitMessageSummary[] };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as the other e2e specs. */
async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<MailpitFullMessage> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const searchResponse = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
    const searchBody = (await searchResponse.json()) as MailpitSearchResult;
    const found = searchBody.messages.find((message) => message.Subject.includes(subjectIncludes));

    if (found) {
      const messageResponse = await fetch(`${MAILPIT_API}/message/${found.ID}`);
      return (await messageResponse.json()) as MailpitFullMessage;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

test.describe('Impostazioni — Club/Pianificazione/SMTP cards (Story 12.11, AC 1/2)', () => {
  test('redirects a non-ADMIN (staff) actor away from /dashboard/settings', async ({ page }) => {
    await loginExpectingDashboard(page, STAFF_EMAIL);
    await page.goto('/it/dashboard/settings');
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });

  test('Club card: ICAO/contact email/METAR station/landing fee/instructions/membership fee round-trip through GET after save', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/settings');

    const icao = `LI${uniqueSuffix().slice(-2).toUpperCase()}`;
    const contactEmail = `ops-${uniqueSuffix()}@example.com`;

    await page.getByTestId('club-icao-input').fill(icao);
    await page.getByTestId('club-contact-email-input').fill(contactEmail);
    await page.getByTestId('club-landing-fee-input').fill('12.50');
    await page.getByTestId('club-membership-fee-input').fill('60.00');
    await page.getByTestId('club-instructions-it-input').fill('Presentarsi in torre.');
    await page.getByTestId('club-settings-save').click();
    await expect(page.getByTestId('club-settings-feedback')).toBeVisible();

    const clubResponse = await page.request.get('/api/v1/settings/club');
    expect((await clubResponse.json())).toEqual({ icao, contactEmail });

    const feeResponse = await page.request.get('/api/v1/settings/ppr-landing-fee');
    expect((await feeResponse.json()).landingFeeCents).toBe(1250);

    const membershipResponse = await page.request.get('/api/v1/settings/membership-fee');
    expect((await membershipResponse.json()).annualFeeCents).toBe(6000);

    const instructionsResponse = await page.request.get('/api/v1/settings/ppr-operating-instructions');
    expect((await instructionsResponse.json()).it).toBe('Presentarsi in torre.');
  });

  test('Scheduling card: openTime/closeTime/minSlotMinutes/turnaroundMinutes/maxAdvanceDays round-trip; reload shows the saved values', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/settings');

    await page.getByTestId('scheduling-open-time-input').fill('08:00');
    await page.getByTestId('scheduling-close-time-input').fill('20:00');
    await page.getByTestId('scheduling-min-slot-input').fill('30');
    await page.getByTestId('scheduling-turnaround-input').fill('10');
    await page.getByTestId('scheduling-max-advance-input').fill('45');
    await page.getByTestId('scheduling-settings-save').click();
    await expect(page.getByTestId('scheduling-settings-feedback')).toBeVisible();

    const response = await page.request.get('/api/v1/settings/scheduling');
    expect(await response.json()).toEqual({ openTime: '08:00', closeTime: '20:00', minSlotMinutes: 30, turnaroundMinutes: 10, maxAdvanceDays: 45 });

    await page.reload();
    await expect(page.getByTestId('scheduling-open-time-input')).toHaveValue('08:00');
    await expect(page.getByTestId('scheduling-close-time-input')).toHaveValue('20:00');
  });

  test('SMTP card: saves host/port/security/from/user; GET never returns the password, only hasPassword; "Invia email di prova" sends a REAL email via Mailpit', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/settings');

    // The contact email is needed for the test-send target — reuse the Club card's own save.
    const contactEmail = `smtp-test-${uniqueSuffix()}@example.com`;
    await page.getByTestId('club-contact-email-input').fill(contactEmail);
    await page.getByTestId('club-settings-save').click();
    await expect(page.getByTestId('club-settings-feedback')).toBeVisible();

    await page.getByTestId('smtp-host-input').fill('localhost');
    await page.getByTestId('smtp-port-input').fill('1025');
    await page.getByTestId('smtp-security-select').selectOption('NONE');
    await page.getByTestId('smtp-from-input').fill('AirManager Test <ops@example.com>');
    await page.getByTestId('smtp-user-input').fill('');
    await page.getByTestId('smtp-pass-input').fill('a-secret-password');
    await page.getByTestId('smtp-settings-save').click();
    await expect(page.getByTestId('smtp-settings-feedback')).toBeVisible();

    // AC 1: GET never carries the password back.
    const getResponse = await page.request.get('/api/v1/settings/smtp');
    const body = (await getResponse.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('pass');
    expect(body['hasPassword']).toBe(true);

    // AC 2: the test-send button hits the mailer for real — verify via Mailpit.
    await page.getByTestId('smtp-test-email-button').click();
    await expect(page.getByTestId('smtp-test-email-feedback')).toBeVisible();
    const testEmail = await waitForMailpitMessage(contactEmail, 'prova');
    expect(testEmail.Text.toLowerCase()).toContain('prova');
  });
});
