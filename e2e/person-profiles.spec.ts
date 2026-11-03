import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/person-profiles.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Person profiles (story 2.2), in the Piloti editor (story 12.6, AC 4/7):
 * each profile has its box in the editor's "Profili" section
 * (`pilot-editor-profile-{pilot,student,instructor}`). Since story 19.4
 * (R-19-m, A11) a profile is activated or deactivated by its checkbox
 * (`pilot-editor-profile-{type}-active`) in the editor's draft, and the
 * panel's single Salva (`pilot-identity-submit`) writes it — through the
 * person composite `PATCH /api/v1/people/{id}`. The single-profile routes
 * (`PUT /profiles/{type}`, `POST /profiles/{type}/deactivate`) stay for API
 * clients (D-8): their 403/404 contract is asserted below, unchanged.
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

    // The Pilota box starts "Non attivato" — tick it, fill its fields, one Salva.
    const pilotSection = page.getByTestId('pilot-editor-profile-pilot');
    await expect(pilotSection.getByText('Non attivato', { exact: true })).toBeVisible();
    await page.getByTestId('pilot-editor-profile-pilot-active').check();
    await page.getByTestId('pilot-editor-profile-pilot-license-number').fill('IT-PPL-77821');
    await page.getByTestId('pilot-editor-profile-pilot-license-type').fill('PPL(A)');
    await page.getByTestId('pilot-identity-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Dati aggiornati.' })).toBeVisible();

    // The box shows the saved state and keeps the saved data in its fields.
    await expect(pilotSection.getByText('Attivo', { exact: true })).toBeVisible();
    await expect(page.getByTestId('pilot-editor-profile-pilot-license-number')).toHaveValue('IT-PPL-77821');
    await expect(page.getByTestId('pilot-editor-profile-pilot-license-type')).toHaveValue('PPL(A)');

    // The list row now carries the "Pilota" role badge (router.refresh() re-fetched the flags).
    await expect(row.getByText('Pilota', { exact: true })).toBeVisible();
  });

  test('student → pilot transition in ONE Salva keeps the same person row (AC 2; story 19.4 AC 17)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Andrea');
    await createPilot(page, person);

    const row = await openEditor(page, person.lastName);

    // Activate the student profile.
    const studentSection = page.getByTestId('pilot-editor-profile-student');
    await page.getByTestId('pilot-editor-profile-student-active').check();
    await page.getByTestId('pilot-editor-profile-student-course-start').fill('2026-03-01');
    await page.getByTestId('pilot-identity-submit').click();
    await expect(studentSection.getByText('Attivo', { exact: true })).toBeVisible();
    await expect(row.getByText('Allievo', { exact: true })).toBeVisible();

    // With Allievo ticked, Pilota cannot be ticked (R-19-e): the control is disabled and says why.
    await expect(page.getByTestId('pilot-editor-profile-pilot-active')).toBeDisabled();
    await expect(page.getByTestId('pilot-editor-profile-pilot-active')).toHaveAccessibleDescription(
      "Il profilo allievo non può essere attivo insieme a pilota o istruttore: disattiva prima l'altro profilo.",
    );

    // The student gets the license: untick Allievo, tick Pilota, ONE Salva.
    const writes: Array<{ method: string; url: string; body: unknown }> = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/api/v1/')) writes.push({ method: request.method(), url: request.url(), body: request.postDataJSON() });
    });
    await page.getByTestId('pilot-editor-profile-student-active').uncheck();
    await page.getByTestId('pilot-editor-profile-pilot-active').check();
    await page.getByTestId('pilot-editor-profile-pilot-license-number').fill('IT-PPL-90455');
    await page.getByTestId('pilot-editor-profile-pilot-license-type').fill('PPL(A)');
    await page.getByTestId('pilot-identity-submit').click();
    const pilotSection = page.getByTestId('pilot-editor-profile-pilot');
    await expect(pilotSection.getByText('Attivo', { exact: true })).toBeVisible();
    await expect(studentSection.getByText('Disattivato', { exact: true })).toBeVisible();

    expect(writes).toHaveLength(1);
    expect(writes[0]!.method).toBe('PATCH');
    expect(writes[0]!.body).toEqual({
      profiles: { student: { active: false }, pilot: { active: true, licenseNumber: 'IT-PPL-90455', licenseType: 'PPL(A)' } },
    });

    // Same single person row: pilot badge on, student badge off — no second
    // anagrafica appeared (AD-11: the Person and its id survive the switch).
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Pilota', { exact: true })).toBeVisible();
    await expect(row.getByText('Allievo', { exact: true })).toHaveCount(0);
    // The deactivated student data is retained in the panel, not deleted.
    await expect(studentSection.getByText('Data inizio corso: 01/03/2026')).toBeVisible();
  });

  test('unticking a profile drops the NEW expiry rows it alone allowed, before any Salva (story 19.4 AC 17, AD-8)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Prune');
    await createPilot(page, person);
    const typeResponse = await page.request.post('/api/v1/expiry-types', { data: { name: `Rating piloti ${Date.now()}`, scope: 'PILOTS' } });
    expect(typeResponse.status()).toBe(201);
    const { id: typeId } = (await typeResponse.json()) as { id: string };

    await openEditor(page, person.lastName);
    const ratings = page.getByTestId('pilot-ratings-editor');
    // A PILOTS-scope chip is offered only once Pilota is ticked in the draft.
    await expect(ratings.getByTestId(`expiry-chip-${typeId}`)).toHaveCount(0);
    await page.getByTestId('pilot-editor-profile-pilot-active').check();
    await ratings.getByTestId(`expiry-chip-${typeId}`).click();
    await expect(ratings.getByTestId(`expiry-row-${typeId}`)).toHaveAttribute('data-state', 'new');

    await page.getByTestId('pilot-editor-profile-pilot-active').uncheck();
    await expect(ratings.getByTestId(`expiry-row-${typeId}`)).toHaveCount(0);
    await expect(ratings.getByTestId(`expiry-chip-${typeId}`)).toHaveCount(0);
    // Back to the state the editor opened with: nothing to save.
    await expect(page.getByTestId('pilot-identity-submit')).toBeDisabled();
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
 * permanent proof of the rule. Since story 19.4 (AD-9) the editor and the
 * "Nuovo" form do not let the two coexist in the first place (the UI tests
 * at the end); "Aggiungi istruttore", which activates the instructor on an
 * existing person, still maps the 422 onto its own message.
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

  test('the editor does not let Allievo coexist with Pilota or Istruttore: the excluded controls are disabled, with the reason (story 19.4 AD-9)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('ExclUi');
    await createPilot(page, person);
    const listed = (await (await page.request.get(`/api/v1/people?q=${encodeURIComponent(person.lastName)}`)).json()) as { items: Array<{ id: string }> };
    expect((await page.request.put(`/api/v1/people/${listed.items[0]!.id}/profiles/student`, { data: STUDENT_BODY })).status()).toBe(200);

    await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(person.lastName)}`);
    await openEditor(page, person.lastName);
    await expect(page.getByTestId('pilot-editor-profile-student-active')).toBeChecked();
    for (const type of ['pilot', 'instructor']) {
      await expect(page.getByTestId(`pilot-editor-profile-${type}-active`)).toBeDisabled();
      await expect(page.getByTestId(`pilot-editor-profile-${type}-active`)).toHaveAccessibleDescription(
        "Il profilo allievo non può essere attivo insieme a pilota o istruttore: disattiva prima l'altro profilo.",
      );
    }

    // Unticking Allievo frees both; ticking Istruttore blocks Allievo in turn.
    await page.getByTestId('pilot-editor-profile-student-active').uncheck();
    await expect(page.getByTestId('pilot-editor-profile-pilot-active')).toBeEnabled();
    await page.getByTestId('pilot-editor-profile-instructor-active').check();
    await expect(page.getByTestId('pilot-editor-profile-student-active')).toBeDisabled();
    await expect(page.getByTestId('pilot-editor-profile-pilot-active')).toBeEnabled();
  });

  test('the "Nuovo" form does not let Allievo be ticked with Pilota or Istruttore (story 19.4 AD-9, AC 25)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.goto('/it/dashboard/pilots');
    await page.getByTestId('pilots-new-button').click();
    const form = page.getByTestId('pilot-identity-form');
    await form.getByTestId('new-person-activate-pilot').check();
    await expect(form.getByTestId('new-person-activate-student')).toBeDisabled();
    await expect(form.getByTestId('new-person-activate-instructor')).toBeEnabled();
    await expect(form.getByTestId('new-person-activate-student')).toHaveAccessibleDescription(
      "Il profilo allievo non può essere attivo insieme a pilota o istruttore: disattiva prima l'altro profilo.",
    );

    await form.getByTestId('new-person-activate-pilot').uncheck();
    await form.getByTestId('new-person-activate-student').check();
    await expect(form.getByTestId('new-person-activate-pilot')).toBeDisabled();
    await expect(form.getByTestId('new-person-activate-instructor')).toBeDisabled();
  });

  test('"Aggiungi istruttore" on a person with an active student profile names the rule, and activates nothing (story 19.3 §H-4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('ExclAdd');
    const created = await page.request.post('/api/v1/people', { data: { ...person, profiles: { student: STUDENT_BODY } } });
    expect(created.status()).toBe(201);
    const { id: personId } = (await created.json()) as { id: string };

    await page.goto('/it/dashboard/instructors');
    await page.getByTestId('instructors-new-button').click();
    await page.getByTestId('add-instructor-search').fill(person.lastName);
    await page.getByTestId(`add-instructor-result-${personId}`).click();
    await page.getByTestId('add-instructor-submit').click();

    await expect(page.getByTestId('add-instructor-error')).toHaveText(
      "Questa persona ha un profilo allievo attivo: disattivalo prima di attivare l'istruttore.",
    );
    expect((await profilesOf(page, personId)).instructorProfile).toBeNull();
  });
});
