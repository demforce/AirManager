import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/person-profiles.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as people-management.spec.ts: `ADMIN` holds every
 * permission incl. `people.manage`, exercising the identical staff perimeter
 * the story's ACs describe (choice documented in story 2.1). */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniquePerson(prefix: string): { firstName: string; lastName: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { firstName: prefix, lastName: `Prof-${suffix}` };
}

async function createPerson(page: Page, person: { firstName: string; lastName: string }): Promise<void> {
  await page.goto('/it/dashboard/people');
  await page.getByRole('button', { name: 'Nuova persona' }).click();
  await page.getByLabel('Nome', { exact: true }).fill(person.firstName);
  await page.getByLabel('Cognome', { exact: true }).fill(person.lastName);
  await page.getByRole('button', { name: 'Crea persona' }).click();
  await expect(page.getByTestId('people-feedback')).toBeVisible();
}

/** Finds the created person via search (the list is paginated — the fresh
 * row may not be on page 1) and opens its profiles panel. */
async function openProfilesPanel(page: Page, lastName: string): Promise<void> {
  await page.goto(`/it/dashboard/people?q=${encodeURIComponent(lastName)}`);
  const row = page.getByRole('row', { name: new RegExp(lastName) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Profili' }).click();
  await expect(page.getByRole('heading', { name: 'Profili' })).toBeVisible();
}

test.describe('Person profiles (Story 2.2)', () => {
  test('staff activates the pilot profile: badge in the list, data in the panel (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Lucia');
    await createPerson(page, person);

    await openProfilesPanel(page, person.lastName);

    // The Pilota section starts "Non attivato" — activate it with its fields.
    const pilotSection = page.getByTestId('profile-section-pilot');
    await expect(pilotSection.getByText('Non attivato', { exact: true })).toBeVisible();
    await pilotSection.getByRole('button', { name: 'Attiva' }).click();
    await page.getByLabel('Numero licenza').fill('IT-PPL-77821');
    await page.getByLabel('Tipo licenza').fill('PPL(A)');
    await page.getByRole('button', { name: 'Salva' }).click();

    // Panel shows the saved data and the active status.
    await expect(pilotSection.getByText('Numero licenza: IT-PPL-77821 · Tipo licenza: PPL(A)')).toBeVisible();
    await expect(pilotSection.getByText('Attivo', { exact: true })).toBeVisible();

    // The list row now carries the "P" badge (router.refresh() re-fetched the flags).
    const row = page.getByRole('row', { name: new RegExp(person.lastName) });
    await expect(row.getByText('P', { exact: true })).toBeVisible();
  });

  test('student → pilot transition keeps the same person row (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Andrea');
    await createPerson(page, person);

    await openProfilesPanel(page, person.lastName);

    // Activate the student profile.
    const studentSection = page.getByTestId('profile-section-student');
    await studentSection.getByRole('button', { name: 'Attiva' }).click();
    await page.getByLabel('Data inizio corso').fill('2026-03-01');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(studentSection.getByText('Attivo', { exact: true })).toBeVisible();
    await expect(studentSection.getByText('Data inizio corso: 2026-03-01')).toBeVisible();

    const row = page.getByRole('row', { name: new RegExp(person.lastName) });
    await expect(row.getByText('A', { exact: true })).toBeVisible();

    // The student gets the license: deactivate Allievo (two-step confirm)…
    await studentSection.getByRole('button', { name: 'Disattiva' }).click();
    await studentSection.getByRole('button', { name: 'Conferma' }).click();
    await expect(studentSection.getByText('Disattivato', { exact: true })).toBeVisible();

    // …and activate Pilota on the same person.
    const pilotSection = page.getByTestId('profile-section-pilot');
    await pilotSection.getByRole('button', { name: 'Attiva' }).click();
    await page.getByLabel('Numero licenza').fill('IT-PPL-90455');
    await page.getByLabel('Tipo licenza').fill('PPL(A)');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(pilotSection.getByText('Attivo', { exact: true })).toBeVisible();

    // Same single person row: pilot badge on, student badge off — no second
    // anagrafica appeared (AD-11: the Person and its id survive the switch).
    await expect(row).toHaveCount(1);
    await expect(row.getByText('P', { exact: true })).toBeVisible();
    await expect(row.getByText('A', { exact: true })).toHaveCount(0);
    // The deactivated student data is retained in the panel, not deleted.
    await expect(studentSection.getByText('Data inizio corso: 2026-03-01')).toBeVisible();
  });

  test('a pilot gets the 403 AD-8 envelope from PUT .../profiles/pilot (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.put('/api/v1/people/any-person-id/profiles/pilot', {
      data: { licenseNumber: 'X-1', licenseType: 'PPL(A)' },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('a pilot gets the 403 AD-8 envelope from POST .../profiles/student/deactivate (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.post('/api/v1/people/any-person-id/profiles/student/deactivate');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('an unknown profile type answers 404 with the AD-8 envelope', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const response = await page.request.put('/api/v1/people/any-person-id/profiles/mechanic', {
      data: {},
    });
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
