import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/instructor-rates.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';

/** Same login helper as the other rate e2e specs (aircraft-rates.spec.ts). */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniquePerson(prefix: string): { firstName: string; lastName: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { firstName: prefix, lastName: `Istruttore-${suffix}` };
}

/**
 * Creates a person via the admin API and activates the instructor profile
 * (`PUT /api/v1/people/{id}/profiles/instructor`, same call shape as the
 * existing profile e2e specs — `person-profiles.spec.ts`) — the story needs
 * a person WITH an instructor profile, which the seed doesn't ship.
 */
async function createInstructorPerson(page: Page, person: { firstName: string; lastName: string }): Promise<string> {
  const createResponse = await page.request.post('/api/v1/people', {
    data: { firstName: person.firstName, lastName: person.lastName },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${created.id}/profiles/instructor`, {
    data: { ratings: 'SEP(land), FI(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  return created.id;
}

/** Today, `YYYY-MM-DD`, browser-local time — matches `InstructorRatesPanel`'s `<input type="date">` default. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A safely-in-the-past date — always earlier than any run-unique person's creation time. */
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

/** Same Mailpit-polling helper as user-management.spec.ts/aircraft-rates.spec.ts. */
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
 * Creates a STAFF-only user (via the admin users API — same helper as
 * `aircraft-rates.spec.ts`) and returns credentials once the password is set
 * — the seed only ships admin + pilot, and the 403 test below needs an
 * actor with `people.read` but deliberately WITHOUT `settings.manage` to
 * prove the permission split (`createInstructorRate` requires the stricter
 * one, same as `createAircraftRate`).
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

test.describe('Historicized instructor rates (Story 4.2, AD-4/AD-2 — twin of 4.1)', () => {
  test('admin adds a past and a current rate; history shows both and the current rate is the most recent (AC 1)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Marco');
    const personId = await createInstructorPerson(page, person);

    const today = todayDateOnly();

    await page.goto(`/it/dashboard/people/${personId}`);
    const panel = page.getByTestId('instructor-rates-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('instructor-rates-current')).toContainText('Nessuna tariffa in vigore');

    // First rate: 40 €/h from a past date.
    await panel.getByRole('button', { name: 'Nuova tariffa' }).click();
    await page.getByLabel('Prezzo (€/h)').fill('40,00');
    await page.getByLabel('In vigore da').fill(PAST_DATE);
    await panel.getByRole('button', { name: 'Aggiungi tariffa' }).click();
    await expect(panel.getByTestId('instructor-rates-feedback')).toBeVisible();
    await expect(panel.getByTestId('instructor-rates-current')).toContainText(/40,00\s€/);

    // Second rate: 45 €/h from today.
    await panel.getByRole('button', { name: 'Nuova tariffa' }).click();
    await page.getByLabel('Prezzo (€/h)').fill('45,00');
    await page.getByLabel('In vigore da').fill(today);
    await panel.getByRole('button', { name: 'Aggiungi tariffa' }).click();
    await expect(panel.getByTestId('instructor-rates-feedback')).toBeVisible();

    // Current rate is now 45,00 € (AD-4: max validFrom <= today) and BOTH
    // history rows are visible (append-only, AC 1).
    await expect(panel.getByTestId('instructor-rates-current')).toContainText(/45,00\s€/);
    const historyRows = panel.getByTestId('instructor-rate-history-row');
    await expect(historyRows).toHaveCount(2);
    await expect(historyRows.nth(0)).toContainText(ddmmyyyy(today));
    await expect(historyRows.nth(0)).toContainText(/45,00\s€/);
    await expect(historyRows.nth(1)).toContainText(ddmmyyyy(PAST_DATE));
    await expect(historyRows.nth(1)).toContainText(/40,00\s€/);
  });

  test('a second rate with the same validFrom shows a 409 conflict message (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Giulia');
    const personId = await createInstructorPerson(page, person);

    await page.goto(`/it/dashboard/people/${personId}`);
    const panel = page.getByTestId('instructor-rates-panel');

    await panel.getByRole('button', { name: 'Nuova tariffa' }).click();
    await page.getByLabel('Prezzo (€/h)').fill('40,00');
    await page.getByLabel('In vigore da').fill(PAST_DATE);
    await panel.getByRole('button', { name: 'Aggiungi tariffa' }).click();
    await expect(panel.getByTestId('instructor-rates-feedback')).toBeVisible();
    await expect(panel.getByTestId('instructor-rates-current')).toContainText(/40,00\s€/);

    // Re-insert a rate with the SAME validFrom (AC 2 — 409).
    await panel.getByRole('button', { name: 'Nuova tariffa' }).click();
    await page.getByLabel('Prezzo (€/h)').fill('999,00');
    await page.getByLabel('In vigore da').fill(PAST_DATE);
    await panel.getByRole('button', { name: 'Aggiungi tariffa' }).click();

    await expect(panel.getByTestId('instructor-rates-form-error')).toContainText(
      'Esiste già una tariffa con questa data di decorrenza',
    );
  });

  test('a STAFF actor (people.read but not settings.manage) gets a 403 AD-8 envelope from POST instructor-rates', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Sara');
    const personId = await createInstructorPerson(page, person);

    const staffPassword = 'StaffInstructorRates123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);

    const response = await page.request.post(`/api/v1/people/${personId}/instructor-rates`, {
      data: { priceCentsPerHour: 4500, validFrom: PAST_DATE },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('a pilot gets a 403 AD-8 envelope from POST /api/v1/people/{id}/instructor-rates', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Luca');
    const personId = await createInstructorPerson(page, person);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.post(`/api/v1/people/${personId}/instructor-rates`, {
      data: { priceCentsPerHour: 4500, validFrom: PAST_DATE },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
