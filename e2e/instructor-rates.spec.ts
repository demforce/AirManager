import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedInstructorRate } from './db-fixtures';
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
 * page (story 12.7) and returns the student-rate section inside it. Since
 * story 19.4 (R-19-f, AD-10) the section is part of the editor's ONE form:
 * a price field whose placeholder and hint are the rate in effect today,
 * "In vigore da" (today at the earliest), the next scheduled rate on one
 * line, no history and no submit of its own — the panel's single Salva
 * writes it.
 */
async function openInstructorRatesPanel(page: Page, personId: string) {
  await page.goto('/it/dashboard/instructors');
  await page.getByTestId(`instructor-edit-${personId}`).click();
  const panel = page.getByTestId('instructor-rates-panel');
  await expect(panel).toBeVisible();
  return panel;
}

/**
 * The editor's single Salva, then the editor opened afresh. Re-opening is not
 * cosmetic: the Salva refreshes the page, and the instructors page re-mounts
 * its console (closing the editor) whenever the NUMBER of instructors changed
 * — which a parallel spec creating an instructor does at any time (measured:
 * one flaky run, the panel gone under the assertion). The in-place
 * realignment after a Salva is proved on the pilot editor
 * (`person-save.spec.ts`, AC 15), whose page keys on its filters instead.
 */
async function saveAndReopen(page: Page, personId: string) {
  await page.getByTestId('instructor-identity-submit').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Modifiche salvate.' }).last()).toBeVisible();
  return openInstructorRatesPanel(page, personId);
}

test.describe('Historicized instructor rates (Story 4.2, AD-4/AD-2 — twin of 4.1), on the instructors page (story 12.7)', () => {
  test('the rate in effect today is the placeholder and the hint, never a value; a rate from today replaces it, one from today + 30 does not (story 19.4 AC 18)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createInstructorPerson(page, uniquePerson('Marco'));
    const today = todayRome();
    const inThirtyDays = addDaysIso(today, 30);
    // A rate dated in the past can only be a fixture (R-19-f): the one in effect when the editor opens.
    await seedInstructorRate(personId, { priceCentsPerHour: 3500, validFrom: PAST_DATE });

    const panel = await openInstructorRatesPanel(page, personId);
    const price = panel.getByTestId('instructor-rate-price');
    const validFrom = panel.getByTestId('instructor-rate-valid-from');
    await expect(price).toHaveValue('');
    await expect(price).toHaveAttribute('placeholder', '35,00');
    await expect(price).toHaveAccessibleDescription(/^Attuale: 35,00\s€\/h — lascia vuoto per non cambiarlo\.$/);
    // "In vigore da": today (Europe/Rome) by default, and today at the earliest.
    await expect(validFrom).toHaveValue(today);
    await expect(validFrom).toHaveAttribute('min', today);
    // No history, no submit of its own (R-19-f, R-19-m).
    for (const testId of ['instructor-rate-history-row', 'instructor-rate-history-show-all', 'instructor-rates-form', 'instructor-rates-submit', 'instructor-rates-current']) {
      await expect(page.getByTestId(testId), testId).toHaveCount(0);
    }

    // 40 €/h from today: the placeholder follows.
    await price.fill('40,00');
    let reopened = await saveAndReopen(page, personId);
    await expect(reopened.getByTestId('instructor-rate-price')).toHaveValue('');
    await expect(reopened.getByTestId('instructor-rate-price')).toHaveAttribute('placeholder', '40,00');
    await expect(reopened.getByTestId('instructor-rate-valid-from')).toHaveValue(today);

    // 45 €/h from today + 30: scheduled — the placeholder stays, the line shows it.
    await reopened.getByTestId('instructor-rate-price').fill('45,00');
    await reopened.getByTestId('instructor-rate-valid-from').fill(inThirtyDays);
    reopened = await saveAndReopen(page, personId);
    await expect(reopened.getByTestId('instructor-rate-price')).toHaveAttribute('placeholder', '40,00');
    await expect(reopened.getByTestId('instructor-rates-next')).toHaveText(new RegExp(`^Dal ${ddmmyyyy(inThirtyDays)}: 45,00\\s€/h$`));

    const list = (await (await page.request.get(`/api/v1/people/${personId}/instructor-rates`)).json()) as Array<{ validFrom: string; priceCentsPerHour: number }>;
    expect(list.map((rate) => [rate.validFrom, rate.priceCentsPerHour])).toEqual([
      [inThirtyDays, 4500],
      [today, 4000],
      [PAST_DATE, 3500],
    ]);
  });

  test('without a rate in effect: no placeholder, the hint says so; of two scheduled rates only the nearest is shown (story 19.4 AC 18, Q-19.4-b)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createInstructorPerson(page, uniquePerson('Elena'));
    const today = todayRome();
    for (const [days, priceCentsPerHour] of [
      [40, 5900],
      [20, 5200],
    ] as const) {
      const response = await page.request.post(`/api/v1/people/${personId}/instructor-rates`, { data: { priceCentsPerHour, validFrom: addDaysIso(today, days) } });
      expect(response.status()).toBe(201);
    }

    const panel = await openInstructorRatesPanel(page, personId);
    const price = panel.getByTestId('instructor-rate-price');
    await expect(price).toHaveAccessibleDescription('Nessuna tariffa in vigore');
    await expect(price).not.toHaveAttribute('placeholder');
    await expect(panel.getByTestId('instructor-rates-next')).toHaveCount(1);
    await expect(panel.getByTestId('instructor-rates-next')).toHaveText(new RegExp(`^Dal ${ddmmyyyy(addDaysIso(today, 20))}: 52,00\\s€/h$`));
  });

  test('a failed read of the rates says so — never «Nessuna tariffa in vigore» over a rate that exists (review 19.4 F3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createInstructorPerson(page, uniquePerson('Lettura'));
    await seedInstructorRate(personId, { priceCentsPerHour: 3500, validFrom: PAST_DATE });
    await page.route(`**/api/v1/people/${personId}/instructor-rates`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } }) }),
    );

    const panel = await openInstructorRatesPanel(page, personId);
    const price = panel.getByTestId('instructor-rate-price');
    await expect(price).toHaveAccessibleDescription('Impossibile caricare le tariffe: quella in vigore non è nota.');
    await expect(price).not.toHaveAttribute('placeholder');
    await expect(price).not.toHaveAttribute('aria-invalid', 'true');
    await expect(panel.getByText('Nessuna tariffa in vigore')).toHaveCount(0);
  });

  test('a second rate on the same validFrom REWRITES it: one row, the new price in the placeholder (story 19.3 AC 26, story 19.4 AC 18)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createInstructorPerson(page, uniquePerson('Giulia'));

    let panel = await openInstructorRatesPanel(page, personId);
    await panel.getByTestId('instructor-rate-price').fill('40,00');
    panel = await saveAndReopen(page, personId);
    await expect(panel.getByTestId('instructor-rate-price')).toHaveAttribute('placeholder', '40,00');

    // The SAME validFrom (today, the default) again: rewritten in place (R-19-f), never a 409.
    await panel.getByTestId('instructor-rate-price').fill('99,00');
    panel = await saveAndReopen(page, personId);
    await expect(panel.getByTestId('instructor-rate-price')).toHaveAttribute('placeholder', '99,00');
    await expect(panel.getByTestId('instructor-rates-error')).toHaveCount(0);
    const list = (await (await page.request.get(`/api/v1/people/${personId}/instructor-rates`)).json()) as Array<{ priceCentsPerHour: number }>;
    expect(list.map((rate) => rate.priceCentsPerHour)).toEqual([9900]);
  });

  test('a TYPED "In vigore da" before today is a field error: no write leaves, the rest of the draft stays (story 19.4 AC 21)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Ieri');
    const personId = await createInstructorPerson(page, person);

    const panel = await openInstructorRatesPanel(page, personId);
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/api/v1/')) writes.push(`${request.method()} ${request.url()}`);
    });
    const firstName = page.getByTestId('instructor-identity-form').getByLabel('Nome', { exact: true });
    await firstName.fill('IeriNuovo');
    await panel.getByTestId('instructor-rate-price').fill('48,00');
    // `fill` writes into the date input even below its `min` (the form is `noValidate`).
    await panel.getByTestId('instructor-rate-valid-from').fill(addDaysIso(todayRome(), -1));
    await page.getByTestId('instructor-identity-submit').click();

    await expect(panel.getByText('La decorrenza non può essere nel passato.')).toBeVisible();
    await expect(panel.getByTestId('instructor-rate-valid-from')).toHaveAttribute('aria-invalid', 'true');
    expect(writes).toEqual([]);
    await expect(firstName).toHaveValue('IeriNuovo');
    await expect(panel.getByTestId('instructor-rate-price')).toHaveValue('48,00');
    expect(((await (await page.request.get(`/api/v1/people/${personId}`)).json()) as { firstName: string }).firstName).toBe(person.firstName);
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
