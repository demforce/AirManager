import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/person-detail.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniquePerson(prefix: string): { firstName: string; lastName: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { firstName: prefix, lastName: `Scheda-${suffix}` };
}

async function createPerson(page: Page, person: { firstName: string; lastName: string }): Promise<void> {
  await page.goto('/it/dashboard/people');
  await page.getByRole('button', { name: 'Nuova persona' }).click();
  await page.getByLabel('Nome', { exact: true }).fill(person.firstName);
  await page.getByLabel('Cognome', { exact: true }).fill(person.lastName);
  await page.getByRole('button', { name: 'Crea persona' }).click();
  await expect(page.getByTestId('people-feedback')).toBeVisible();
}

async function ownPersonId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/me');
  const body = await response.json();
  return body.person.id as string;
}

test.describe('Person detail page (Story 2.3)', () => {
  test('staff opens the scheda from the list: anagrafica, profiles and the 5 structural placeholders (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Chiara');
    await createPerson(page, person);

    await page.goto(`/it/dashboard/people?q=${encodeURIComponent(person.lastName)}`);
    await page.getByRole('link', { name: new RegExp(`${person.lastName} ${person.firstName}`) }).click();

    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/]+$/);
    await expect(page.getByRole('heading', { name: `${person.lastName} ${person.firstName}` })).toBeVisible();
    await expect(page.getByText('Dati anagrafici')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Profili' })).toBeVisible();

    // The 5 structural placeholders (AC 1) — stable titles, no restructuring expected from later epics.
    for (const title of ['Scadenze', 'Saldo conto', 'Pacchetti ore', 'Ultimi voli', 'Prossime prenotazioni']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    await expect(page.getByText('Disponibile prossimamente.').first()).toBeVisible();

    // Staff has people.manage: the pilot profile section is interactive (activate control present).
    const pilotSection = page.getByTestId('profile-section-pilot');
    await expect(pilotSection.getByRole('button', { name: 'Attiva' })).toBeVisible();
  });

  test('a pilot opens their own scheda: data visible, profiles read-only, no edit controls (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.getByRole('link', { name: 'La mia scheda' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/]+$/);

    await expect(page.getByRole('heading', { name: 'Volante Piero' })).toBeVisible();
    await expect(page.getByText('Dati anagrafici')).toBeVisible();

    // The seeded pilot profile is active — data shows, but with no activate/edit/deactivate controls (Task 3).
    const pilotSection = page.getByTestId('profile-section-pilot');
    await expect(pilotSection.getByText('IT-PPL-100200', { exact: false })).toBeVisible();
    await expect(pilotSection.getByRole('button', { name: 'Modifica' })).toHaveCount(0);
    await expect(pilotSection.getByRole('button', { name: 'Disattiva' })).toHaveCount(0);
  });

  test('a pilot cannot open someone else’s scheda: redirected away (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Davide');
    await createPerson(page, person);
    await page.goto(`/it/dashboard/people?q=${encodeURIComponent(person.lastName)}`);
    await page.getByRole('link', { name: new RegExp(`${person.lastName} ${person.firstName}`) }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/]+$/);
    const otherPersonId = page.url().split('/').pop();

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await page.goto(`/it/dashboard/people/${otherPersonId}`);
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });

  test('GET /api/v1/people/{id}: 200 for a pilot’s own record, 403 AD-8 envelope for someone else’s (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const myId = await ownPersonId(page);

    const ownResponse = await page.request.get(`/api/v1/people/${myId}`);
    expect(ownResponse.status()).toBe(200);
    const ownBody = await ownResponse.json();
    expect(ownBody.id).toBe(myId);

    const otherResponse = await page.request.get('/api/v1/people/some-other-person-id');
    expect(otherResponse.status()).toBe(403);
    const otherBody = await otherResponse.json();
    expect(otherBody.error.code).toBe('FORBIDDEN');
  });
});
