import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addDaysIso, todayRome } from './helpers';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/instructor-rates.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

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

/** A safely-in-the-past date — always earlier than any run-unique person's creation time. */
const PAST_DATE = '2020-01-01';

/** `YYYY-MM-DD` -> `DD/MM/YYYY`, the registry's own `formatDateOnly` presentation (story 11.3). */
function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Opens the instructor editor slide-over for `personId` from the instructors
 * page (story 12.7) and returns the (always-visible, no toggle) student-rate
 * panel locator inside it — the NEW selectors this story's AC 8 adapts the
 * 4 behavioral tests below onto.
 */
async function openInstructorRatesPanel(page: Page, personId: string) {
  await page.goto('/it/dashboard/instructors');
  await page.getByTestId(`instructor-edit-${personId}`).click();
  const panel = page.getByTestId('instructor-rates-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('Historicized instructor rates (Story 4.2, AD-4/AD-2 — twin of 4.1), on the instructors page (story 12.7)', () => {
  // Story 19.3 (R-19-f): a rate takes effect today or later (Europe/Rome), so
  // the two rates are today and today + 30 — both typed explicitly, never the
  // panel's own default (still a UTC date until story 19.4 rewrites the panel).
  test('admin adds a rate from today and one from today + 30; history shows both, the future one is never current (AC 1, story 19.3 AC 26)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Marco');
    const personId = await createInstructorPerson(page, person);

    const today = todayRome();
    const inThirtyDays = addDaysIso(today, 30);
    const panel = await openInstructorRatesPanel(page, personId);
    await expect(panel.getByTestId('instructor-rates-current')).toContainText('Nessuna tariffa in vigore');

    // First rate: 40 €/h from today.
    await panel.getByLabel('Prezzo (€/h)').fill('40,00');
    await panel.getByLabel('In vigore da').fill(today);
    await panel.getByTestId('instructor-rates-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Tariffa aggiunta' })).toBeVisible();

    // Second rate: 45 €/h from today + 30.
    await panel.getByLabel('Prezzo (€/h)').fill('45,00');
    await panel.getByLabel('In vigore da').fill(inThirtyDays);
    await panel.getByTestId('instructor-rates-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Tariffa aggiunta' })).toBeVisible();

    // BOTH rows in the history, most recent validFrom first; the scheduled
    // one is not the rate in effect (AD-4: max validFrom <= today).
    const historyRows = panel.getByTestId('instructor-rate-history-row');
    await expect(historyRows).toHaveCount(2);
    await expect(historyRows.nth(0)).toContainText(ddmmyyyy(inThirtyDays));
    await expect(historyRows.nth(0)).toContainText(/45,00\s€/);
    await expect(historyRows.nth(1)).toContainText(ddmmyyyy(today));
    await expect(historyRows.nth(1)).toContainText(/40,00\s€/);
    await expect(panel.getByTestId('instructor-rates-current')).not.toContainText('45,00');
  });

  test('a second rate on the same validFrom REWRITES it: no conflict message, one row with the new price (story 19.3, AC 26)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Giulia');
    const personId = await createInstructorPerson(page, person);
    const today = todayRome();

    const panel = await openInstructorRatesPanel(page, personId);

    await panel.getByLabel('Prezzo (€/h)').fill('40,00');
    await panel.getByLabel('In vigore da').fill(today);
    await panel.getByTestId('instructor-rates-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Tariffa aggiunta' })).toBeVisible();
    await expect(panel.getByTestId('instructor-rate-history-row')).toHaveCount(1);

    // The SAME validFrom again: rewritten in place (R-19-f), never a 409.
    await panel.getByLabel('Prezzo (€/h)').fill('99,00');
    await panel.getByLabel('In vigore da').fill(today);
    await panel.getByTestId('instructor-rates-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Tariffa aggiunta' }).last()).toBeVisible();

    await expect(panel.getByTestId('instructor-rate-history-row')).toHaveCount(1);
    await expect(panel.getByTestId('instructor-rate-history-row')).toContainText(/99,00\s€/);
    await expect(panel.getByTestId('instructor-rates-form-error')).toHaveCount(0);
  });

  test('a validFrom before today (Europe/Rome) answers 422 RATE_VALID_FROM_IN_PAST and writes nothing (story 19.3, AC 4/26)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createInstructorPerson(page, uniquePerson('Paolo'));

    const response = await page.request.post(`/api/v1/people/${personId}/instructor-rates`, {
      data: { priceCentsPerHour: 4500, validFrom: addDaysIso(todayRome(), -1) },
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe('RATE_VALID_FROM_IN_PAST');
    const list = await page.request.get(`/api/v1/people/${personId}/instructor-rates`);
    expect(await list.json()).toEqual([]);
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
