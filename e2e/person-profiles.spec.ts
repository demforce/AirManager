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

/**
 * Story 19.3 (R-19-e, Q-19.3-c): the student profile excludes the pilot AND
 * the instructor profile — 422 `STUDENT_PROFILE_EXCLUSIVE` on every path
 * that could make them coexist, nothing written. These API tests are the
 * permanent proof of the rule; the two UI tests at the end prove the message
 * mapping of the CURRENT editor (story 19.4 replaces those controls).
 */
test.describe('Exclusive student profile (Story 19.3, AC 13-16)', () => {
  const PILOT_BODY = { licenseNumber: 'IT-PPL-EXCL', licenseType: 'PPL(A)' };
  const STUDENT_BODY = { courseStartDate: '2026-03-01' };

  async function createPerson(page: Page, prefix: string): Promise<string> {
    const response = await page.request.post('/api/v1/people', { data: uniquePerson(prefix) });
    expect(response.status()).toBe(201);
    return ((await response.json()) as { id: string }).id;
  }

  type ProfileState = { deactivatedAt: string | null } | null;
  async function profilesOf(page: Page, personId: string): Promise<{ pilotProfile: ProfileState; studentProfile: ProfileState; instructorProfile: ProfileState }> {
    const response = await page.request.get(`/api/v1/people/${personId}`);
    expect(response.status()).toBe(200);
    return response.json();
  }

  test('PUT pilot on an active student, and PUT student on an active pilot: 422 and nothing written; the same type again stays 200 (AC 13)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const studentId = await createPerson(page, 'ExclS');
    expect((await page.request.put(`/api/v1/people/${studentId}/profiles/student`, { data: STUDENT_BODY })).status()).toBe(200);
    const pilotOnStudent = await page.request.put(`/api/v1/people/${studentId}/profiles/pilot`, { data: PILOT_BODY });
    expect(pilotOnStudent.status()).toBe(422);
    expect((await pilotOnStudent.json()).error.code).toBe('STUDENT_PROFILE_EXCLUSIVE');
    // The core's write was rolled back with the check: no pilot profile at all.
    expect((await profilesOf(page, studentId)).pilotProfile).toBeNull();
    expect((await page.request.put(`/api/v1/people/${studentId}/profiles/student`, { data: STUDENT_BODY })).status()).toBe(200);

    const pilotId = await createPerson(page, 'ExclP');
    expect((await page.request.put(`/api/v1/people/${pilotId}/profiles/pilot`, { data: PILOT_BODY })).status()).toBe(200);
    const studentOnPilot = await page.request.put(`/api/v1/people/${pilotId}/profiles/student`, { data: STUDENT_BODY });
    expect(studentOnPilot.status()).toBe(422);
    expect((await studentOnPilot.json()).error.code).toBe('STUDENT_PROFILE_EXCLUSIVE');
    expect((await profilesOf(page, pilotId)).studentProfile).toBeNull();
  });

  test('the instructor profile excludes the student one too, both ways (Q-19.3-c); pilot + instructor stays allowed (AC 13)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructorId = await createPerson(page, 'ExclI');
    expect((await page.request.put(`/api/v1/people/${instructorId}/profiles/instructor`, { data: {} })).status()).toBe(200);
    const studentOnInstructor = await page.request.put(`/api/v1/people/${instructorId}/profiles/student`, { data: STUDENT_BODY });
    expect(studentOnInstructor.status()).toBe(422);
    expect((await studentOnInstructor.json()).error.code).toBe('STUDENT_PROFILE_EXCLUSIVE');
    expect((await profilesOf(page, instructorId)).studentProfile).toBeNull();
    // Pilot + instructor: no rule against it.
    expect((await page.request.put(`/api/v1/people/${instructorId}/profiles/pilot`, { data: PILOT_BODY })).status()).toBe(200);

    const studentId = await createPerson(page, 'ExclSI');
    expect((await page.request.put(`/api/v1/people/${studentId}/profiles/student`, { data: STUDENT_BODY })).status()).toBe(200);
    const instructorOnStudent = await page.request.put(`/api/v1/people/${studentId}/profiles/instructor`, { data: {} });
    expect(instructorOnStudent.status()).toBe(422);
    expect((await instructorOnStudent.json()).error.code).toBe('STUDENT_PROFILE_EXCLUSIVE');
    expect((await profilesOf(page, studentId)).instructorProfile).toBeNull();
  });

  test('PUT pilot and PUT student in parallel on a fresh person: exactly one 200 and one 422 (AC 14, the Person row lock)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createPerson(page, 'ExclRace');

    const [pilot, student] = await Promise.all([
      page.request.put(`/api/v1/people/${personId}/profiles/pilot`, { data: PILOT_BODY }),
      page.request.put(`/api/v1/people/${personId}/profiles/student`, { data: STUDENT_BODY }),
    ]);

    expect([pilot.status(), student.status()].sort()).toEqual([200, 422]);
    const profiles = await profilesOf(page, personId);
    const active = (profile: ProfileState) => profile !== null && profile.deactivatedAt === null;
    expect(active(profiles.pilotProfile) !== active(profiles.studentProfile)).toBe(true);
  });

  test('POST /people with profiles.student AND profiles.pilot (or .instructor): 422 and the person is never created (AC 15)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    for (const other of [{ pilot: PILOT_BODY }, { instructor: {} }]) {
      const person = uniquePerson('ExclNew');
      const response = await page.request.post('/api/v1/people', { data: { ...person, profiles: { student: STUDENT_BODY, ...other } } });
      expect(response.status()).toBe(422);
      expect((await response.json()).error.code).toBe('STUDENT_PROFILE_EXCLUSIVE');
      const search = await page.request.get(`/api/v1/people?q=${encodeURIComponent(person.lastName)}`);
      expect(((await search.json()) as { items: unknown[] }).items).toHaveLength(0);
    }
  });

  test('the editor maps the 422 onto the section: activating Pilota while Allievo is active shows the exclusivity message (AC 16, until story 19.4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('ExclUi');
    await createPilot(page, person);
    const listed = (await (await page.request.get(`/api/v1/people?q=${encodeURIComponent(person.lastName)}`)).json()) as { items: Array<{ id: string }> };
    expect((await page.request.put(`/api/v1/people/${listed.items[0]!.id}/profiles/student`, { data: STUDENT_BODY })).status()).toBe(200);

    await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(person.lastName)}`);
    await openEditor(page, person.lastName);
    const pilotSection = page.getByTestId('pilot-editor-profile-pilot');
    await pilotSection.getByRole('button', { name: 'Attiva' }).click();
    await pilotSection.getByLabel('Numero licenza').fill('IT-PPL-UI');
    await pilotSection.getByLabel('Tipo licenza').fill('PPL(A)');
    await pilotSection.getByRole('button', { name: 'Salva' }).click();

    await expect(pilotSection.getByRole('alert')).toHaveText("Allievo non può essere attivo insieme a Pilota o Istruttore: disattiva prima l'altro profilo.");
    await expect(pilotSection.getByText('Non attivato', { exact: true })).toBeVisible();
  });

  test('the "Nuovo" form maps the 422 onto its banner when Pilota and Allievo are both ticked (AC 16, until story 19.4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('ExclForm');

    await page.goto('/it/dashboard/pilots');
    await page.getByTestId('pilots-new-button').click();
    const form = page.getByTestId('pilot-identity-form');
    await form.getByLabel('Nome', { exact: true }).fill(person.firstName);
    await form.getByLabel('Cognome', { exact: true }).fill(person.lastName);
    await form.getByTestId('new-person-activate-pilot').check();
    await form.getByTestId('new-person-pilot-license-number').fill('IT-PPL-FORM');
    await form.getByTestId('new-person-pilot-license-type').fill('PPL(A)');
    await form.getByTestId('new-person-activate-student').check();
    await form.getByTestId('new-person-student-course-start').fill('2026-03-01');
    await page.getByTestId('pilot-identity-submit').click();

    await expect(page.getByTestId('pilot-identity-error')).toHaveText('Il profilo allievo non può essere attivato insieme a pilota o istruttore.');
    await expect(page.getByTestId('toast').filter({ hasText: 'Pilota creato' })).toHaveCount(0);
  });
});
