import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/person-profiles.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Person profiles (story 2.2), adapted to the new Piloti editor (story 12.6,
 * AC 4/7): the legacy `/dashboard/people` "Profili" panel is gone — profile
 * activation now lives INSIDE the pilot slide-over editor's own "Profili"
 * section (`pilot-editor-profile-{pilot,student,instructor}` testids). The
 * underlying API/403 contract is UNCHANGED (still `PUT
 * /profiles/{type}`/`POST /profiles/{type}/deactivate`, `people.manage`).
 */
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

function rowFor(page: Page, lastName: string) {
  return page.locator('[data-testid^="pilot-row-"]').filter({ hasText: lastName });
}

async function createPilot(page: Page, person: { firstName: string; lastName: string }): Promise<void> {
  await page.goto('/it/dashboard/pilots');
  await page.getByTestId('pilots-new-button').click();
  const form = page.getByTestId('pilot-identity-form');
  await form.getByLabel('Nome', { exact: true }).fill(person.firstName);
  await form.getByLabel('Cognome', { exact: true }).fill(person.lastName);
  await page.getByTestId('pilot-identity-submit').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Pilota creato' })).toBeVisible();

  await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(person.lastName)}`);
  await expect(rowFor(page, person.lastName)).toBeVisible();
}

/** Opens the pilot editor for a searched row. The slide-over overlays the table WITHOUT removing it from the DOM, so `row` assertions below keep working while the editor stays open (`router.refresh()` re-renders the row live). */
async function openEditor(page: Page, lastName: string) {
  const row = rowFor(page, lastName);
  await row.getByRole('button', { name: 'Modifica' }).click();
  return row;
}

test.describe('Person profiles (Story 2.2), adapted to the Piloti editor (Story 12.6)', () => {
  test('staff activates the pilot profile: badge in the list, data in the panel (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Lucia');
    await createPilot(page, person);

    const row = await openEditor(page, person.lastName);

    // The Pilota section starts "Non attivato" — activate it with its fields.
    const pilotSection = page.getByTestId('pilot-editor-profile-pilot');
    await expect(pilotSection.getByText('Non attivato', { exact: true })).toBeVisible();
    await pilotSection.getByRole('button', { name: 'Attiva' }).click();
    await pilotSection.getByLabel('Numero licenza').fill('IT-PPL-77821');
    await pilotSection.getByLabel('Tipo licenza').fill('PPL(A)');
    await pilotSection.getByRole('button', { name: 'Salva' }).click();

    // Panel shows the saved data and the active status.
    await expect(pilotSection.getByText('Numero licenza: IT-PPL-77821 · Tipo licenza: PPL(A)')).toBeVisible();
    await expect(pilotSection.getByText('Attivo', { exact: true })).toBeVisible();

    // The list row now carries the "Pilota" role badge (router.refresh() re-fetched the flags).
    await expect(row.getByText('Pilota', { exact: true })).toBeVisible();
  });

  test('student → pilot transition keeps the same person row (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Andrea');
    await createPilot(page, person);

    const row = await openEditor(page, person.lastName);

    // Activate the student profile.
    const studentSection = page.getByTestId('pilot-editor-profile-student');
    await studentSection.getByRole('button', { name: 'Attiva' }).click();
    await studentSection.getByLabel('Data inizio corso').fill('2026-03-01');
    await studentSection.getByRole('button', { name: 'Salva' }).click();
    await expect(studentSection.getByText('Attivo', { exact: true })).toBeVisible();
    await expect(studentSection.getByText('Data inizio corso: 01/03/2026')).toBeVisible();

    await expect(row.getByText('Allievo', { exact: true })).toBeVisible();

    // The student gets the license: deactivate Allievo (two-step confirm)…
    await studentSection.getByRole('button', { name: 'Disattiva' }).click();
    await studentSection.getByRole('button', { name: 'Conferma' }).click();
    await expect(studentSection.getByText('Disattivato', { exact: true })).toBeVisible();

    // …and activate Pilota on the same person.
    const pilotSection = page.getByTestId('pilot-editor-profile-pilot');
    await pilotSection.getByRole('button', { name: 'Attiva' }).click();
    await pilotSection.getByLabel('Numero licenza').fill('IT-PPL-90455');
    await pilotSection.getByLabel('Tipo licenza').fill('PPL(A)');
    await pilotSection.getByRole('button', { name: 'Salva' }).click();
    await expect(pilotSection.getByText('Attivo', { exact: true })).toBeVisible();

    // Same single person row: pilot badge on, student badge off — no second
    // anagrafica appeared (AD-11: the Person and its id survive the switch).
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Pilota', { exact: true })).toBeVisible();
    await expect(row.getByText('Allievo', { exact: true })).toHaveCount(0);
    // The deactivated student data is retained in the panel, not deleted.
    await expect(studentSection.getByText('Data inizio corso: 01/03/2026')).toBeVisible();
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
