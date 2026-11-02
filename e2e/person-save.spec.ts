import { expect, test } from '@playwright/test';
import type { APIResponse, Page } from '@playwright/test';
import { addDaysIso, todayRome } from './helpers';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/person-save.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Story 19.4 — the person editors' single "Salva" (R-19-m) and the composite
 * behind it: `PATCH /api/v1/people/{id}` saves anagrafica, profiles,
 * expiries, instructor compensation and student rate in ONE transaction
 * (A17). The API tests prove the contract on the real database (atomicity,
 * idempotency, the `Person` row lock, RBAC); the UI tests prove that each
 * editor sends ONE request with only what changed and routes an error to its
 * section. Fixtures are run-unique; nothing here touches global settings.
 */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniquePerson(prefix: string): { firstName: string; lastName: string; email: string } {
  const suffix = uniqueSuffix();
  return { firstName: prefix, lastName: `Salva-${suffix}`, email: `${prefix.toLowerCase()}-${suffix}@airmanager.local` };
}

async function createPerson(page: Page, data: Record<string, unknown>): Promise<string> {
  const response = await page.request.post('/api/v1/people', { data });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

async function createExpiryType(page: Page, scope: 'ALL' | 'PILOTS' | 'INSTRUCTORS', kind: 'RATING' | 'MEDICAL' = 'RATING'): Promise<string> {
  const response = await page.request.post('/api/v1/expiry-types', { data: { name: `Salva ${kind} ${scope} ${uniqueSuffix()}`, scope, kind } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

async function patchPerson(page: Page, personId: string, data: Record<string, unknown>): Promise<APIResponse> {
  return page.request.patch(`/api/v1/people/${personId}`, { data });
}

type ProfileState = { deactivatedAt: string | null } | null;
type PersonDetail = {
  firstName: string;
  email: string | null;
  phone: string | null;
  profiles: { pilot: boolean; student: boolean; instructor: boolean };
  pilotProfile: ProfileState;
  studentProfile: ProfileState;
  instructorProfile: ProfileState;
};

async function getPerson(page: Page, personId: string): Promise<PersonDetail> {
  const response = await page.request.get(`/api/v1/people/${personId}`);
  expect(response.status()).toBe(200);
  return response.json();
}

async function getExpiries(page: Page, personId: string): Promise<Array<{ expiryTypeId: string; expiresAt: string }>> {
  const response = await page.request.get(`/api/v1/people/${personId}/expiries`);
  expect(response.status()).toBe(200);
  return response.json();
}

/** The instructor's row of the compensation summary (every ACTIVE instructor) — `undefined` when not listed. */
async function compensationOf(page: Page, personId: string): Promise<{ payoutRateCents: number | null } | undefined> {
  const response = await page.request.get('/api/v1/instructor-compensation');
  expect(response.status()).toBe(200);
  return ((await response.json()) as Array<{ personId: string; payoutRateCents: number | null }>).find((row) => row.personId === personId);
}

/** Records every write the page sends to the API (the router refresh's RSC requests are page URLs, never `/api/v1/`). */
function recordWrites(page: Page): Array<{ method: string; url: string; body: unknown }> {
  const writes: Array<{ method: string; url: string; body: unknown }> = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/v1/')) {
      writes.push({ method: request.method(), url: request.url(), body: request.postDataJSON() });
    }
  });
  return writes;
}

async function openPilotEditor(page: Page, lastName: string): Promise<void> {
  await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(lastName)}`);
  await page.locator('[data-testid^="pilot-row-"]').filter({ hasText: lastName }).getByRole('button', { name: 'Modifica' }).click();
  // The profiles load with the panel: wait for them before touching anything.
  await expect(page.getByTestId('pilot-editor-profile-pilot-active')).toBeVisible();
}

const PILOT_BODY = { licenseNumber: 'IT-PPL-SALVA', licenseType: 'PPL(A)' };

test.describe('Person composite PATCH (story 19.4, AD-1/AD-2) — the contract on the real database', () => {
  test('atomicity: a SCOPE_MISMATCH found inside the transaction, after the deactivation, saves no part (AC 6a)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('AtomA');
    const personId = await createPerson(page, { ...person, phone: '+39 333 0000001', profiles: { pilot: PILOT_BODY } });
    const pilotsType = await createExpiryType(page, 'PILOTS');

    const response = await patchPerson(page, personId, {
      phone: '+39 333 0000002',
      profiles: { pilot: { active: false } },
      expiries: { set: [{ expiryTypeId: pilotsType, expiresAt: '2099-01-01' }] },
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe('SCOPE_MISMATCH');

    const after = await getPerson(page, personId);
    expect(after.phone).toBe('+39 333 0000001');
    expect(after.profiles.pilot).toBe(true);
    expect((await getExpiries(page, personId)).some((expiry) => expiry.expiryTypeId === pilotsType)).toBe(false);
  });

  test('atomicity: compensation without an instructor profile active on the FINAL state is 409 INSTRUCTOR_PROFILE_INACTIVE and saves no part (AC 6b)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('AtomB');
    const personId = await createPerson(page, { ...person, profiles: { instructor: {} } });
    expect((await page.request.put(`/api/v1/instructor-compensation/${personId}/rate`, { data: { payoutRateCents: 3000 } })).status()).toBe(200);

    const response = await patchPerson(page, personId, { firstName: 'AtomBNuovo', profiles: { instructor: { active: false } }, payoutRateCents: 4500 });
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe('INSTRUCTOR_PROFILE_INACTIVE');

    const after = await getPerson(page, personId);
    expect(after.firstName).toBe(person.firstName);
    expect(after.profiles.instructor).toBe(true);
    expect((await compensationOf(page, personId))?.payoutRateCents).toBe(3000);
  });

  test('a rate dated yesterday is 422 RATE_VALID_FROM_IN_PAST and the new name is not saved either (AC 21, API)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Ieri');
    const personId = await createPerson(page, { ...person, profiles: { instructor: {} } });

    const response = await patchPerson(page, personId, {
      firstName: 'IeriNuovo',
      instructorRate: { priceCentsPerHour: 5000, validFrom: addDaysIso(todayRome(), -1) },
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe('RATE_VALID_FROM_IN_PAST');
    expect((await getPerson(page, personId)).firstName).toBe(person.firstName);
  });

  test('idempotency: the same full body twice answers 200 twice and leaves the same state (AC 10)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Idem');
    const keptType = await createExpiryType(page, 'ALL');
    const droppedType = await createExpiryType(page, 'ALL');
    const personId = await createPerson(page, {
      ...person,
      profiles: { pilot: PILOT_BODY, instructor: {} },
      expiries: [
        { expiryTypeId: keptType, expiresAt: '2098-01-01' },
        { expiryTypeId: droppedType, expiresAt: '2098-01-01' },
      ],
    });
    const body = {
      phone: '+39 333 4444444',
      profiles: { pilot: { active: false } },
      expiries: { set: [{ expiryTypeId: keptType, expiresAt: '2099-06-30' }], remove: [droppedType] },
      payoutRateCents: 4200,
      instructorRate: { priceCentsPerHour: 5100, validFrom: todayRome() },
    };

    const snapshot = async () => ({
      person: await getPerson(page, personId),
      expiries: await getExpiries(page, personId),
      rates: await (await page.request.get(`/api/v1/people/${personId}/instructor-rates`)).json(),
      compensation: await compensationOf(page, personId),
    });

    expect((await patchPerson(page, personId, body)).status()).toBe(200);
    const afterFirst = await snapshot();
    expect((await patchPerson(page, personId, body)).status()).toBe(200);
    const afterSecond = await snapshot();

    expect(afterSecond).toEqual(afterFirst);
    expect(afterFirst.person.phone).toBe('+39 333 4444444');
    expect(afterFirst.person.profiles.pilot).toBe(false);
    expect(afterFirst.expiries.map((expiry) => [expiry.expiryTypeId, expiry.expiresAt])).toEqual([[keptType, '2099-06-30']]);
    expect(afterFirst.compensation?.payoutRateCents).toBe(4200);
  });

  test('concurrency: Pilota and Allievo activated by two PATCH in parallel — exactly one 200 and one 422, never a 500 (AC 11, the Person row lock)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createPerson(page, uniquePerson('Gara'));

    const [pilot, student] = await Promise.all([
      patchPerson(page, personId, { profiles: { pilot: { active: true, ...PILOT_BODY } } }),
      patchPerson(page, personId, { profiles: { student: { active: true, courseStartDate: '2026-03-01' } } }),
    ]);

    expect([pilot.status(), student.status()].sort()).toEqual([200, 422]);
    const rejected = pilot.status() === 422 ? pilot : student;
    expect((await rejected.json()).error.code).toBe('STUDENT_PROFILE_EXCLUSIVE');
    const profiles = (await getPerson(page, personId)).profiles;
    expect(Number(profiles.pilot) + Number(profiles.student)).toBe(1);
  });

  test('a pilot and an instructor get 403 FORBIDDEN from the composite (AC 9)', async ({ page }) => {
    for (const email of [PILOT_EMAIL, INSTRUCTOR_EMAIL]) {
      await page.context().clearCookies();
      await loginExpectingDashboard(page, email);
      const response = await patchPerson(page, 'any-person-id', { firstName: 'X', payoutRateCents: 100 });
      expect(response.status(), email).toBe(403);
      expect((await response.json()).error.code).toBe('FORBIDDEN');
    }
  });
});

test.describe('Pilot editor — one Salva (story 19.4, AD-6)', () => {
  test('phone, Pilota, a new rating and a moved medical date leave in ONE PATCH, and are all there after a reload (AC 13, AC 14)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Tutto');
    const ratingType = await createExpiryType(page, 'ALL');
    const medicalType = await createExpiryType(page, 'ALL', 'MEDICAL');
    await createPerson(page, { ...person, phone: '+39 333 1000000', expiries: [{ expiryTypeId: medicalType, expiresAt: '2098-05-01' }] });

    await openPilotEditor(page, person.lastName);

    // ONE save in the panel: no other control saves data (AC 13).
    const body = page.locator('.so-body');
    await expect(body.getByRole('button', { name: 'Salva', exact: true })).toHaveCount(0);
    for (const name of ['Attiva', 'Modifica', 'Riattiva', 'Disattiva', 'Aggiungi']) {
      await expect(body.getByRole('button', { name, exact: true }), name).toHaveCount(0);
    }
    for (const testId of ['expiry-add-form', 'expiry-add-date', 'expiry-add-confirm', `expiry-edit-${medicalType}`, `expiry-remove-confirm-${medicalType}`]) {
      await expect(page.getByTestId(testId), testId).toHaveCount(0);
    }
    await expect(page.locator('.so-foot').getByTestId('pilot-identity-submit')).toHaveAttribute('form', 'pilot-identity-form');

    const writes = recordWrites(page);
    await page.getByTestId('pilot-identity-form').getByLabel('Telefono', { exact: true }).fill('+39 333 2000000');
    await page.getByTestId('pilot-editor-profile-pilot-active').check();
    await page.getByTestId('pilot-editor-profile-pilot-license-number').fill('IT-PPL-TUTTO');
    await page.getByTestId('pilot-editor-profile-pilot-license-type').fill('PPL(A)');
    await page.getByTestId(`expiry-chip-${ratingType}`).click();
    await page.getByTestId(`expiry-date-${ratingType}`).fill('2099-02-01');
    await page.getByTestId('pilot-medical-editor').getByTestId(`expiry-date-${medicalType}`).fill('2099-05-01');
    await page.getByTestId('pilot-identity-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Dati aggiornati.' })).toBeVisible();

    expect(writes.map((write) => write.method)).toEqual(['PATCH']);
    expect(writes[0]!.url).toMatch(/\/api\/v1\/people\/[^/]+$/);

    await page.reload();
    await expect(page.getByTestId('pilot-editor-profile-pilot-active')).toHaveCount(0);
    await openPilotEditor(page, person.lastName);
    await expect(page.getByTestId('pilot-identity-form').getByLabel('Telefono', { exact: true })).toHaveValue('+39 333 2000000');
    await expect(page.getByTestId('pilot-editor-profile-pilot-active')).toBeChecked();
    await expect(page.getByTestId('pilot-editor-profile-pilot-license-number')).toHaveValue('IT-PPL-TUTTO');
    await expect(page.getByTestId(`expiry-date-${ratingType}`)).toHaveValue('2099-02-01');
    await expect(page.getByTestId(`expiry-date-${medicalType}`)).toHaveValue('2099-05-01');
  });

  test('the Salva is enabled only by a real change, and sends only what changed (AC 15, D-3/D-5)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Diff');
    await createPerson(page, { ...person, profiles: { pilot: PILOT_BODY } });

    await openPilotEditor(page, person.lastName);
    const submit = page.getByTestId('pilot-identity-submit');
    const phone = page.getByTestId('pilot-identity-form').getByLabel('Telefono', { exact: true });
    // Just opened: nothing to save, even with empty optional fields (null on the server, '' in the input).
    await expect(submit).toBeDisabled();
    await phone.fill('+39 333 5550000');
    await expect(submit).toBeEnabled();
    // Undoing the change by hand leaves nothing to save again.
    await phone.fill('');
    await expect(submit).toBeDisabled();

    const writes = recordWrites(page);
    await phone.fill('+39 333 5551111');
    await submit.click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Dati aggiornati.' })).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.body).toEqual({ phone: '+39 333 5551111' });
    // Realigned on the saved state: nothing left to save.
    await expect(submit).toBeDisabled();
  });

  test('an error in one part shows in its section, keeps the whole draft and saves nothing (AC 16, P7)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Errore');
    const ratingType = await createExpiryType(page, 'ALL');
    const personId = await createPerson(page, { ...person, phone: '+39 333 6000000' });
    const taken = uniquePerson('Occupata');
    await createPerson(page, taken);

    await openPilotEditor(page, person.lastName);
    const phone = page.getByTestId('pilot-identity-form').getByLabel('Telefono', { exact: true });
    await phone.fill('+39 333 6111111');
    await page.getByTestId(`expiry-chip-${ratingType}`).click();
    await page.getByTestId(`expiry-date-${ratingType}`).fill('2099-07-01');
    // Meanwhile the type is deactivated: the row the Salva would create is refused.
    expect((await page.request.patch(`/api/v1/expiry-types/${ratingType}`, { data: { isActive: false } })).status()).toBe(200);

    await page.getByTestId('pilot-identity-submit').click();
    // Review 19.4 F2: the refusal says what to do, on the row it is about — not «Riprova» for the whole section.
    const rowError = page.getByTestId(`expiry-error-${ratingType}`);
    await expect(rowError).toHaveText('Questo tipo è stato disattivato: togli la riga.');
    await expect(rowError).toBeFocused();
    await expect(page.getByTestId('pilot-ratings-error')).toHaveCount(0);
    await expect(phone).toHaveValue('+39 333 6111111');
    await expect(page.getByTestId(`expiry-row-${ratingType}`)).toHaveAttribute('data-state', 'new');
    expect((await getPerson(page, personId)).phone).toBe('+39 333 6000000');

    // An email already used: the error is the anagrafica's — and still nothing is saved.
    await page.getByTestId(`expiry-chip-${ratingType}`).click();
    await page.getByTestId('pilot-identity-form').getByLabel('Email', { exact: true }).fill(taken.email);
    await page.getByTestId('pilot-identity-submit').click();
    await expect(page.getByTestId('pilot-identity-error')).toHaveText('Esiste già una persona con questa email.');
    await expect(page.getByTestId('pilot-ratings-error')).toHaveCount(0);
    await expect(page.getByTestId(`expiry-error-${ratingType}`)).toHaveCount(0);

    await page.reload();
    await openPilotEditor(page, person.lastName);
    await expect(page.getByTestId('pilot-identity-form').getByLabel('Telefono', { exact: true })).toHaveValue('+39 333 6000000');
    await expect(page.getByTestId('pilot-identity-form').getByLabel('Email', { exact: true })).toHaveValue(person.email);
  });

  test('a new scadenza on a person archived meanwhile: the section says why instead of «Riprova», nothing is saved (review 19.4 F2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Archiviata');
    const ratingType = await createExpiryType(page, 'ALL');
    const personId = await createPerson(page, person);

    await openPilotEditor(page, person.lastName);
    await page.getByTestId('pilot-identity-form').getByLabel('Telefono', { exact: true }).fill('+39 333 9000000');
    await page.getByTestId(`expiry-chip-${ratingType}`).click();
    await page.getByTestId(`expiry-date-${ratingType}`).fill('2099-04-01');
    expect((await page.request.post(`/api/v1/people/${personId}/archive`)).status()).toBe(200);

    await page.getByTestId('pilot-identity-submit').click();
    const ratingsError = page.getByTestId('pilot-ratings-error');
    await expect(ratingsError).toHaveText('La persona è archiviata: ripristinala per aggiungere nuove scadenze.');
    await expect(ratingsError).toBeFocused();
    expect((await getPerson(page, personId)).phone).toBeNull();
  });

  test('an optional field typed into and emptied again does not block the Salva; a saved one emptied is cleared (review 19.4 F1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Svuota');
    const ratingType = await createExpiryType(page, 'ALL');
    const personId = await createPerson(page, { ...person, phone: '+39 333 8000000' });

    await openPilotEditor(page, person.lastName);
    const form = page.getByTestId('pilot-identity-form');
    const submit = page.getByTestId('pilot-identity-submit');
    // Empty on the server, typed into and emptied again: unchanged, nothing to save.
    await form.getByLabel('Indirizzo', { exact: true }).fill('Via Roma 1');
    await form.getByLabel('Indirizzo', { exact: true }).fill('');
    await expect(submit).toBeDisabled();
    // Saved, then emptied: a change — the phone is cleared.
    await form.getByLabel('Telefono', { exact: true }).fill('');
    await page.getByTestId(`expiry-chip-${ratingType}`).click();
    await page.getByTestId(`expiry-date-${ratingType}`).fill('2099-03-01');

    const writes = recordWrites(page);
    await submit.click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Dati aggiornati.' })).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.body).toEqual({ phone: null, expiries: { set: [{ expiryTypeId: ratingType, expiresAt: '2099-03-01' }] } });
    expect((await getPerson(page, personId)).phone).toBeNull();
    expect((await getExpiries(page, personId)).map((expiry) => expiry.expiryTypeId)).toContain(ratingType);
  });

  test('the «Nuovo» form: an optional field typed into and emptied again does not block the creation (review 19.4 F1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('NuovoVuoto');

    await page.goto('/it/dashboard/pilots');
    await page.getByTestId('pilots-new-button').click();
    const form = page.getByTestId('pilot-identity-form');
    await form.getByLabel('Nome', { exact: true }).fill(person.firstName);
    await form.getByLabel('Cognome', { exact: true }).fill(person.lastName);
    await form.getByLabel('Telefono', { exact: true }).fill('+39 1');
    await form.getByLabel('Telefono', { exact: true }).fill('');

    const writes = recordWrites(page);
    await page.getByTestId('pilot-identity-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Pilota creato' })).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.body).toMatchObject({ firstName: person.firstName, lastName: person.lastName, phone: null });
  });

  test('"Archivia" is an action of its own: it neither sends nor drops the draft (AC 22)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Bozza');
    await createPerson(page, person);

    await openPilotEditor(page, person.lastName);
    const phone = page.getByTestId('pilot-identity-form').getByLabel('Telefono', { exact: true });
    await phone.fill('+39 333 7000000');
    const writes = recordWrites(page);
    await page.getByTestId('pilot-archive-toggle').click();
    await page.getByTestId('pilot-archive-confirm').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'archiviata' })).toBeVisible();

    expect(writes.map((write) => write.url)).toEqual([expect.stringMatching(/\/archive$/)]);
    await expect(phone).toHaveValue('+39 333 7000000');
    await expect(page.getByTestId('pilot-identity-submit')).toBeEnabled();
  });
});

test.describe('Instructor editor — one Salva (story 19.4, AD-10)', () => {
  test('name, a rating, the compensation and the student rate leave in ONE PATCH, and are all there after a reload (AC 20)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('IstrSalva');
    const personId = await createPerson(page, { ...person, profiles: { instructor: {} } });
    const ratingType = await createExpiryType(page, 'INSTRUCTORS');
    const today = todayRome();

    await page.goto('/it/dashboard/instructors');
    await page.getByTestId(`instructor-edit-${personId}`).click();
    const form = page.getByTestId('instructor-identity-form');
    await expect(form.getByLabel('Nome', { exact: true })).toHaveValue(person.firstName);
    await expect(page.locator('.so-foot')).toContainText('Annulla');
    for (const testId of ['instructor-payout-rate-submit', 'instructor-rates-submit']) {
      await expect(page.getByTestId(testId), testId).toHaveCount(0);
    }

    const writes = recordWrites(page);
    await form.getByLabel('Nome', { exact: true }).fill('IstrSalvaNuovo');
    await page.getByTestId(`expiry-chip-${ratingType}`).click();
    await page.getByTestId(`expiry-date-${ratingType}`).fill('2099-08-01');
    await page.getByTestId('instructor-payout-rate').fill('33,50');
    await page.getByTestId('instructor-rate-price').fill('47,00');
    await page.getByTestId('instructor-identity-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Modifiche salvate.' })).toBeVisible();

    expect(writes).toHaveLength(1);
    expect(writes[0]!.method).toBe('PATCH');
    expect(writes[0]!.body).toEqual({
      firstName: 'IstrSalvaNuovo',
      expiries: { set: [{ expiryTypeId: ratingType, expiresAt: '2099-08-01' }] },
      payoutRateCents: 3350,
      instructorRate: { priceCentsPerHour: 4700, validFrom: today },
    });

    await page.reload();
    await page.getByTestId(`instructor-edit-${personId}`).click();
    await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('IstrSalvaNuovo');
    await expect(page.getByTestId(`expiry-row-${ratingType}`)).toHaveAttribute('data-state', 'saved');
    await expect(page.getByTestId('instructor-payout-rate')).toHaveValue('33,50');
    await expect(page.getByTestId('instructor-rate-price')).toHaveAttribute('placeholder', '47,00');
  });

  test('an optional field typed into and emptied again does not block the Salva; the saved email emptied is cleared (review 19.4 F1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('IstrSvuota');
    const personId = await createPerson(page, { ...person, profiles: { instructor: {} } });

    await page.goto('/it/dashboard/instructors');
    await page.getByTestId(`instructor-edit-${personId}`).click();
    const form = page.getByTestId('instructor-identity-form');
    await expect(form.getByLabel('Email', { exact: true })).toHaveValue(person.email);
    await form.getByLabel('Telefono', { exact: true }).fill('+39 1');
    await form.getByLabel('Telefono', { exact: true }).fill('');
    await form.getByLabel('Email', { exact: true }).fill('');
    await page.getByTestId('instructor-payout-rate').fill('30,00');

    const writes = recordWrites(page);
    await page.getByTestId('instructor-identity-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Modifiche salvate.' }).last()).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.body).toEqual({ email: null, payoutRateCents: 3000 });
    expect((await getPerson(page, personId)).email).toBeNull();
  });

  test('the instructor profile deactivated meanwhile: the compensation section says so instead of «Riprova» (review 19.4 F2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('IstrSpento');
    const personId = await createPerson(page, { ...person, profiles: { instructor: {} } });

    await page.goto('/it/dashboard/instructors');
    await page.getByTestId(`instructor-edit-${personId}`).click();
    await page.getByTestId('instructor-payout-rate').fill('31,00');
    expect((await page.request.post(`/api/v1/people/${personId}/profiles/instructor/deactivate`)).status()).toBe(200);

    await page.getByTestId('instructor-identity-submit').click();
    const payoutError = page.getByTestId('instructor-payout-rate-error');
    await expect(payoutError).toHaveText('Il profilo istruttore non è più attivo: compenso e tariffa allievo non si possono salvare.');
    await expect(payoutError).toBeFocused();
  });
});
