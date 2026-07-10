import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Client } from 'pg';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/school.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/** Run-unique names (same pattern as the other specs, for the dirty/parallel DB — `fullyParallel: true`). */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

/** A safely-in-the-past date, before any run-unique person/flight/expiry created below. */
const PAST_DATE = '2020-01-01';

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as the other e2e specs. */
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

/** Creates a fresh person with an active INSTRUCTOR profile — a BRAND NEW person every call (never the shared seed, `fullyParallel: true`). */
async function createInstructorPerson(page: Page, tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Istruttore';
  const lastName = `${tag}-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, { data: { ratings: 'FI(A)' } });
  expect(profileResponse.status()).toBe(200);

  return { personId: person.id, firstName, lastName };
}

/** Same as `createInstructorPerson`, but also creates a login user and sets its password (Mailpit invite flow). */
async function createInstructorWithLogin(page: Page, password: string, tag: string): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const instructor = await createInstructorPerson(page, tag);

  const email = uniqueEmail('instructor-school');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['INSTRUCTOR'], personId: instructor.personId } });
  expect(userResponse.status()).toBe(201);

  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(inviteEmail.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();

  return { ...instructor, email };
}

/** Creates a fresh person with an active STUDENT profile — a BRAND NEW person every call. */
async function createStudentPerson(page: Page, tag: string, courseStartDate = PAST_DATE): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Allievo';
  const lastName = `${tag}-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/student`, { data: { courseStartDate } });
  expect(profileResponse.status()).toBe(200);

  return { personId: person.id, firstName, lastName };
}

/** Same as `createInstructorWithLogin`, but for a STUDENT (pattern `bookings.spec.ts#createStudentWithLogin`). */
async function createStudentWithLogin(
  page: Page,
  password: string,
  tag: string,
): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const student = await createStudentPerson(page, tag);

  const email = uniqueEmail('student-school');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['STUDENT'], personId: student.personId } });
  expect(userResponse.status()).toBe(201);

  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(inviteEmail.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();

  return { ...student, email };
}

/**
 * Backdates a `TrainingNote.createdAt` directly in the DB (Story 9.2, AC 3
 * — the only way to test the 7-day immutability window without waiting 7
 * real days; sanctioned by the story's Dev Notes). Raw `pg`, same connection
 * string the app itself uses (`DATABASE_URL`, loaded by `playwright.config.ts`'s
 * `dotenv/config`).
 */
async function backdateTrainingNote(noteId: string, daysAgo: number): Promise<void> {
  const client = new Client({ connectionString: process.env['DATABASE_URL'] });
  await client.connect();
  try {
    await client.query('UPDATE "TrainingNote" SET "createdAt" = now() - ($1 || \' days\')::interval WHERE id = $2', [daysAgo, noteId]);
  } finally {
    await client.end();
  }
}

async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-SC${suffix}`.toUpperCase().slice(0, 20);

  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 100 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };

  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, { data: { priceCentsPerHour, validFrom: PAST_DATE } });
  expect(rateResponse.status()).toBe(201);

  return { id: aircraft.id };
}

async function createInstructorRate(page: Page, instructorPersonId: string, priceCentsPerHour: number): Promise<void> {
  const rateResponse = await page.request.post(`/api/v1/people/${instructorPersonId}/instructor-rates`, {
    data: { priceCentsPerHour, validFrom: PAST_DATE },
  });
  expect(rateResponse.status()).toBe(201);
}

/** `isSolo` (story 9.4) defaults to `false` (dual) when omitted — pass `true` for the "solista" fixture (still SCHOOL, still carries the instructor, only the PIC differs). */
async function registerSchoolFlight(
  page: Page,
  params: { aircraftId: string; personId: string; instructorPersonId: string; flightDate: string; minutes: number; isSolo?: boolean },
): Promise<{ id: string }> {
  const response = await page.request.post('/api/v1/flights', { data: { ...params, flightType: 'SCHOOL' } });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { flight: { id: string } };
  return body.flight;
}

/** Registers a TOURISM flight with NO instructor — story 9.4 regression fixture: this must NOT count as "solista" (the 9.3 "no instructor" derivation was wrong; a real solista is a SCHOOL flight, see `registerSchoolFlight`). */
async function registerFlightNoInstructor(
  page: Page,
  params: { aircraftId: string; personId: string; flightDate: string; minutes: number },
): Promise<{ id: string }> {
  const response = await page.request.post('/api/v1/flights', { data: { ...params, flightType: 'TOURISM' } });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { flight: { id: string } };
  return body.flight;
}

/** Registers a TOURISM flight WITH an instructor (e.g. a checkride) — never a SCHOOL flight, so it matches neither the dual nor the solo bucket (not a declared "edge case" anymore, story 9.4: it simply is not `flightType: 'SCHOOL'`). */
async function registerPrivateFlightWithInstructor(
  page: Page,
  params: { aircraftId: string; personId: string; instructorPersonId: string; flightDate: string; minutes: number },
): Promise<{ id: string }> {
  const response = await page.request.post('/api/v1/flights', { data: { ...params, flightType: 'TOURISM' } });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { flight: { id: string } };
  return body.flight;
}

async function cancelFlight(page: Page, flightId: string, reason: string): Promise<void> {
  const response = await page.request.post(`/api/v1/flights/${flightId}/cancel`, { data: { reason } });
  expect(response.status()).toBe(200);
}

/** Registers an EXPIRED "Visita medica LAPL" scadenza (seeded type, scope STUDENTS) for a student — the worst-status badge fixture. */
async function registerExpiredExpiry(page: Page, personId: string): Promise<void> {
  const typesResponse = await page.request.get('/api/v1/expiry-types');
  expect(typesResponse.status()).toBe(200);
  const types = (await typesResponse.json()) as Array<{ id: string; name: string }>;
  const lapl = types.find((type) => type.name === 'Visita medica LAPL');
  if (!lapl) {
    throw new Error('Seed expiry type "Visita medica LAPL" not found.');
  }

  const response = await page.request.post('/api/v1/expiries', {
    data: { personId, expiryTypeId: lapl.id, issuedAt: '2019-01-01', expiresAt: PAST_DATE },
  });
  expect(response.status()).toBe(201);
}

test.describe('Student-instructor assignment (Story 9.1, FR-32)', () => {
  test('staff assigns and removes an instructor from the scheda persona (AC 1/2); a repeat assignment is rejected with 409', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorPerson(page, 'Assegnazione');
    const student = await createStudentPerson(page, 'Assegnazione');

    await page.goto(`/it/dashboard/people/${student.personId}`);
    const panel = page.getByTestId('assigned-instructors-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Nessun istruttore assegnato.');

    await panel.getByRole('button', { name: 'Assegna istruttore' }).click();
    await page.getByLabel('Istruttore').selectOption({ label: `${instructor.lastName} ${instructor.firstName}` });
    await panel.getByRole('button', { name: 'Assegna' }).click();

    await expect(panel.getByTestId('assigned-instructors-feedback')).toContainText('Istruttore assegnato.');
    const row = panel.getByTestId('assigned-instructor-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${instructor.lastName} ${instructor.firstName}`);

    // AC 1: a duplicate assignment of the SAME pair is a 409.
    const duplicateResponse = await page.request.post(`/api/v1/people/${student.personId}/instructors`, {
      data: { instructorPersonId: instructor.personId },
    });
    expect(duplicateResponse.status()).toBe(409);

    // AC 2: two-step removal (confirm, existing pattern).
    await row.getByRole('button', { name: 'Rimuovi' }).click();
    await expect(panel).toContainText('Confermi la rimozione?');
    await panel.getByRole('button', { name: 'Sì, rimuovi' }).click();

    await expect(panel.getByTestId('assigned-instructors-feedback')).toContainText('Istruttore rimosso.');
    await expect(panel).toContainText('Nessun istruttore assegnato.');
    await expect(panel.getByTestId('assigned-instructor-row')).toHaveCount(0);
  });

  test('two concurrent DELETEs of the same assignment answer one 204 + one 404, never a 500 (AC 2, TD-1 pattern)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorPerson(page, 'DoppiaRimozione');
    const student = await createStudentPerson(page, 'DoppiaRimozione');

    const assignResponse = await page.request.post(`/api/v1/people/${student.personId}/instructors`, {
      data: { instructorPersonId: instructor.personId },
    });
    expect(assignResponse.status()).toBe(201);

    const [first, second] = await Promise.all([
      page.request.delete(`/api/v1/people/${student.personId}/instructors/${instructor.personId}`),
      page.request.delete(`/api/v1/people/${student.personId}/instructors/${instructor.personId}`),
    ]);
    const statuses = [first.status(), second.status()].sort();
    expect(statuses).toEqual([204, 404]);
  });

  test('an instructor sees ONLY their own students, with total school hours (batched, ACROSS instructors) and the worst scadenza status badge (AC 3/4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructorA = await createInstructorWithLogin(page, 'InstructorSchool123!', 'A');
    const instructorB = await createInstructorPerson(page, 'B');
    const studentX = await createStudentPerson(page, 'X', '2026-01-15');
    const studentY = await createStudentPerson(page, 'Y');

    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructorA.personId, 4000);
    // studentX's SCHOOL flight is flown with instructor A — 90 minutes -> "1:30".
    await registerSchoolFlight(page, {
      aircraftId: aircraft.id,
      personId: studentX.personId,
      instructorPersonId: instructorA.personId,
      flightDate: '2020-02-01',
      minutes: 90,
    });
    await registerExpiredExpiry(page, studentX.personId);

    // studentY is assigned to instructor B only — must NEVER show up in A's own roster.
    const assignXtoA = await page.request.post(`/api/v1/people/${studentX.personId}/instructors`, { data: { instructorPersonId: instructorA.personId } });
    expect(assignXtoA.status()).toBe(201);
    const assignYtoB = await page.request.post(`/api/v1/people/${studentY.personId}/instructors`, { data: { instructorPersonId: instructorB.personId } });
    expect(assignYtoB.status()).toBe(201);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, instructorA.email, 'InstructorSchool123!');
    await page.goto('/it/dashboard/school');

    const rows = page.getByTestId('own-student-row');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(`${studentX.lastName} ${studentX.firstName}`);
    await expect(rows).toContainText('2026-01-15');
    await expect(rows).toContainText('1:30');
    await expect(rows.getByTestId('own-student-status-badge')).toContainText('Scaduta');
    await expect(page.getByText(`${studentY.lastName} ${studentY.firstName}`)).toHaveCount(0);
  });

  test('an instructor gets 403 (AD-8 FORBIDDEN) from the staff-only people/{id}/instructors API (needs school.manage.any)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const student = await createStudentPerson(page, 'Api403');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, INSTRUCTOR_EMAIL);

    const getResponse = await page.request.get(`/api/v1/people/${student.personId}/instructors`);
    expect(getResponse.status()).toBe(403);
    const getBody = await getResponse.json();
    expect(getBody.error.code).toBe('FORBIDDEN');

    const postResponse = await page.request.post(`/api/v1/people/${student.personId}/instructors`, { data: { instructorPersonId: student.personId } });
    expect(postResponse.status()).toBe(403);
  });

  test('a pilot gets 403 (AD-8 FORBIDDEN) from GET /api/v1/school/students', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.get('/api/v1/school/students');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

test.describe('Training notes (Story 9.2, FR-33)', () => {
  test('an assigned instructor creates a note with a linked SCHOOL flight; it appears in the diary (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorWithLogin(page, 'TrainingNotes123!', 'Crea');
    const student = await createStudentPerson(page, 'Crea');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructor.personId, 4000);
    const flight = await registerSchoolFlight(page, {
      aircraftId: aircraft.id,
      personId: student.personId,
      instructorPersonId: instructor.personId,
      flightDate: '2020-02-01',
      minutes: 60,
    });

    const assignResponse = await page.request.post(`/api/v1/people/${student.personId}/instructors`, {
      data: { instructorPersonId: instructor.personId },
    });
    expect(assignResponse.status()).toBe(201);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, instructor.email, 'TrainingNotes123!');
    await page.goto(`/it/dashboard/school/${student.personId}`);

    await page.getByTestId('new-training-note-action').click();
    await page.getByLabel('Data addestramento').fill('2020-02-05');
    await page.getByLabel('Volo collegato').selectOption(flight.id);
    await page.getByLabel('Esercizi svolti').fill('Circuiti, decolli e atterraggi');
    await page.getByLabel('Giudizio').fill('Buon controllo direzionale');
    await page.getByRole('button', { name: 'Salva annotazione' }).click();

    const row = page.getByTestId('training-note-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Circuiti, decolli e atterraggi');
    await expect(row).toContainText('Buon controllo direzionale');
    await expect(row).toContainText('Volo collegato');
    await expect(row.getByTestId('edit-training-note-action')).toBeVisible();
  });

  test('rejects a flightId that is not a SCHOOL flight of this student (AC 1, 422 FLIGHT_NOT_LINKABLE)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorWithLogin(page, 'TrainingNotesFlight123!', 'Volo');
    const student = await createStudentPerson(page, 'Volo');
    const otherStudent = await createStudentPerson(page, 'VoloAltro');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructor.personId, 4000);
    // A SCHOOL flight belonging to a DIFFERENT student.
    const otherFlight = await registerSchoolFlight(page, {
      aircraftId: aircraft.id,
      personId: otherStudent.personId,
      instructorPersonId: instructor.personId,
      flightDate: '2020-02-01',
      minutes: 60,
    });

    const assignResponse = await page.request.post(`/api/v1/people/${student.personId}/instructors`, {
      data: { instructorPersonId: instructor.personId },
    });
    expect(assignResponse.status()).toBe(201);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, instructor.email, 'TrainingNotesFlight123!');

    const createResponse = await page.request.post(`/api/v1/people/${student.personId}/training-notes`, {
      data: { noteDate: '2020-02-05', exercises: 'x', flightId: otherFlight.id },
    });
    expect(createResponse.status()).toBe(422);
    const body = await createResponse.json();
    expect(body.error.code).toBe('FLIGHT_NOT_LINKABLE');
  });

  test('a student reads their OWN diary read-only (no new-note action) but a DIFFERENT student\'s diary is 403 (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorWithLogin(page, 'TrainingNotesRead123!', 'Lettura');
    const student = await createStudentWithLogin(page, 'AllievoDiario123!', 'Lettura');
    const otherStudent = await createStudentPerson(page, 'LetturaAltro');

    const assignResponse = await page.request.post(`/api/v1/people/${student.personId}/instructors`, {
      data: { instructorPersonId: instructor.personId },
    });
    expect(assignResponse.status()).toBe(201);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, instructor.email, 'TrainingNotesRead123!');
    const createResponse = await page.request.post(`/api/v1/people/${student.personId}/training-notes`, {
      data: { noteDate: '2026-07-05', exercises: 'Esercizi di navigazione' },
    });
    expect(createResponse.status()).toBe(201);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, student.email, 'AllievoDiario123!');
    await page.goto(`/it/dashboard/school/${student.personId}`);

    await expect(page.getByTestId('training-note-row')).toContainText('Esercizi di navigazione');
    await expect(page.getByTestId('new-training-note-action')).toHaveCount(0);
    await expect(page.getByTestId('edit-training-note-action')).toHaveCount(0);

    // AC 2: another student's diary is a 403, degraded to the dashboard redirect.
    await page.goto(`/it/dashboard/school/${otherStudent.personId}`);
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });

  test('the author edits their own note within the 7-day window (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorWithLogin(page, 'TrainingNotesEdit123!', 'Modifica');
    const student = await createStudentPerson(page, 'Modifica');

    const assignResponse = await page.request.post(`/api/v1/people/${student.personId}/instructors`, {
      data: { instructorPersonId: instructor.personId },
    });
    expect(assignResponse.status()).toBe(201);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, instructor.email, 'TrainingNotesEdit123!');
    await page.goto(`/it/dashboard/school/${student.personId}`);

    await page.getByTestId('new-training-note-action').click();
    await page.getByLabel('Data addestramento').fill('2026-07-05');
    await page.getByLabel('Esercizi svolti').fill('Circuiti iniziali');
    await page.getByRole('button', { name: 'Salva annotazione' }).click();

    await page.getByTestId('edit-training-note-action').click();
    await page.getByLabel('Esercizi svolti').fill('Circuiti iniziali (rivisto)');
    await page.getByRole('button', { name: 'Salva' }).click();

    const row = page.getByTestId('training-note-row');
    await expect(row).toContainText('Circuiti iniziali (rivisto)');
    await expect(row).toContainText('modificata');
  });

  test('a note older than 7 days is immutable for EVERYONE, admin included (AC 3, 409 NOTE_IMMUTABLE)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorWithLogin(page, 'TrainingNotesImmutable123!', 'Scaduta');
    const student = await createStudentPerson(page, 'Scaduta');

    const assignResponse = await page.request.post(`/api/v1/people/${student.personId}/instructors`, {
      data: { instructorPersonId: instructor.personId },
    });
    expect(assignResponse.status()).toBe(201);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, instructor.email, 'TrainingNotesImmutable123!');
    const createResponse = await page.request.post(`/api/v1/people/${student.personId}/training-notes`, {
      data: { noteDate: '2026-06-01', exercises: 'Esercizio vecchio' },
    });
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()) as { id: string };

    await backdateTrainingNote(created.id, 8);

    const authorEditResponse = await page.request.patch(`/api/v1/people/${student.personId}/training-notes/${created.id}`, {
      data: { noteDate: '2026-06-01', exercises: 'Tentativo di modifica' },
    });
    expect(authorEditResponse.status()).toBe(409);
    const authorEditBody = await authorEditResponse.json();
    expect(authorEditBody.error.code).toBe('NOTE_IMMUTABLE');

    // The UI hides the edit action once the window has elapsed.
    await page.goto(`/it/dashboard/school/${student.personId}`);
    await expect(page.getByTestId('edit-training-note-action')).toHaveCount(0);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const adminEditResponse = await page.request.patch(`/api/v1/people/${student.personId}/training-notes/${created.id}`, {
      data: { noteDate: '2026-06-01', exercises: 'Tentativo admin' },
    });
    expect(adminEditResponse.status()).toBe(409);
    const adminEditBody = await adminEditResponse.json();
    expect(adminEditBody.error.code).toBe('NOTE_IMMUTABLE');
  });
});

test.describe('School hour summaries (Story 9.3, FR-34)', () => {
  // A fixed, out-of-the-way period — deterministic regardless of "today"
  // (unlike the page's own default of "current month") and safely isolated
  // from every other spec's PAST_DATE (2020-01-01) fixtures registered on
  // OTHER days of that same month.
  const PERIOD_FROM = '2021-03-01';
  const PERIOD_TO = '2021-03-31';
  // After PAST_DATE (the aircraft/instructor rates' validFrom, 2020-01-01) but
  // before PERIOD_FROM — otherwise a flight this early has no rate in effect (422).
  const OUTSIDE_PERIOD_DATE = '2020-06-01';

  test('gestore riepiloghi: doppio comando/solista/totale periodo e storico corretti, checkride e volo TOURISM senza istruttore esclusi (AC 1/3; story 9.4: solista = SCHOOL con istruttore pagato, isSolo=true)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructor = await createInstructorPerson(page, 'Riepilogo');
    const student = await createStudentPerson(page, 'Riepilogo');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructor.personId, 4000);

    // Dual command, in period: 90' -> "1:30".
    await registerSchoolFlight(page, {
      aircraftId: aircraft.id,
      personId: student.personId,
      instructorPersonId: instructor.personId,
      flightDate: '2021-03-05',
      minutes: 90,
    });
    // Solo (story 9.4 domain correction: STILL a SCHOOL flight WITH the paid
    // instructor — the student is PIC, `isSolo: true`), in period: 60' -> "1:00".
    await registerSchoolFlight(page, {
      aircraftId: aircraft.id,
      personId: student.personId,
      instructorPersonId: instructor.personId,
      flightDate: '2021-03-06',
      minutes: 60,
      isSolo: true,
    });
    // Checkride (TOURISM WITH an instructor) — never SCHOOL, so it matches
    // neither bucket: 45', must NOT count anywhere.
    await registerPrivateFlightWithInstructor(page, {
      aircraftId: aircraft.id,
      personId: student.personId,
      instructorPersonId: instructor.personId,
      flightDate: '2021-03-07',
      minutes: 45,
    });
    // Story 9.4 regression fixture: a TOURISM flight with NO instructor is no
    // longer a "solista" (the 9.3 "no instructor" derivation was wrong) — a
    // large value here would inflate the totals below if it were still
    // (wrongly) counted as solo.
    await registerFlightNoInstructor(page, { aircraftId: aircraft.id, personId: student.personId, flightDate: '2021-03-09', minutes: 500 });
    // A SCHOOL flight in period that gets CANCELLED — must NOT count anywhere.
    const cancelled = await registerSchoolFlight(page, {
      aircraftId: aircraft.id,
      personId: student.personId,
      instructorPersonId: instructor.personId,
      flightDate: '2021-03-08',
      minutes: 30,
    });
    await cancelFlight(page, cancelled.id, 'Test 9.3 — deve essere escluso dal riepilogo');
    // A SCHOOL flight OUTSIDE the period — counts in totalMinutesAllTime only: 20'.
    await registerSchoolFlight(page, {
      aircraftId: aircraft.id,
      personId: student.personId,
      instructorPersonId: instructor.personId,
      flightDate: OUTSIDE_PERIOD_DATE,
      minutes: 20,
    });

    await page.goto(`/it/dashboard/school?from=${PERIOD_FROM}&to=${PERIOD_TO}`);

    const row = page.getByTestId('school-summary-student-row').filter({ hasText: `${student.lastName} ${student.firstName}` });
    await expect(row).toHaveCount(1);
    // dual 1:30, solo 1:00, totalPeriod 2:30 (90+60; checkride/TOURISM-no-instructor/CANCELLED excluded), totalAllTime 2:50 (110 dual + 60 solo).
    await expect(row).toContainText('1:30');
    await expect(row).toContainText('1:00');
    await expect(row).toContainText('2:30');
    await expect(row).toContainText('2:50');

    // The instructor table (AC 2; story 9.4: dual + supervised solo both bill
    // the instructor) — period only: 90' dual + 60' solo = 2:30 (the CANCELLED
    // flight is excluded, the checkride was never SCHOOL).
    const instructorRow = page.getByTestId('school-summary-instructor-row').filter({ hasText: `${instructor.lastName} ${instructor.firstName}` });
    await expect(instructorRow).toHaveCount(1);
    await expect(instructorRow).toContainText('2:30');
    await expect(instructorRow.getByTestId('school-summary-open-register')).toBeVisible();
  });

  test('istruttore vede solo la propria riga in "Le mie ore scuola"; il drill-down apre il registro voli filtrato (AC 2/4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const instructorA = await createInstructorWithLogin(page, 'HourSummary123!', 'A');
    const instructorB = await createInstructorPerson(page, 'B');
    const student = await createStudentPerson(page, 'Ore');
    const aircraft = await createAircraftWithRate(page, 15000);
    await createInstructorRate(page, instructorA.personId, 4000);
    await createInstructorRate(page, instructorB.personId, 4000);

    await registerSchoolFlight(page, {
      aircraftId: aircraft.id,
      personId: student.personId,
      instructorPersonId: instructorA.personId,
      flightDate: '2021-03-05',
      minutes: 45,
    });
    // A much larger total for a DIFFERENT instructor — must never leak into A's card.
    await registerSchoolFlight(page, {
      aircraftId: aircraft.id,
      personId: student.personId,
      instructorPersonId: instructorB.personId,
      flightDate: '2021-03-06',
      minutes: 600,
    });

    await page.context().clearCookies();
    await loginExpectingDashboard(page, instructorA.email, 'HourSummary123!');
    await page.goto(`/it/dashboard/school?from=${PERIOD_FROM}&to=${PERIOD_TO}`);

    await expect(page.getByTestId('school-summaries-panel')).toHaveCount(0);
    await expect(page.getByTestId('own-hours-panel')).toBeVisible();
    await expect(page.getByTestId('own-hours-minutes')).toHaveText('0:45');

    await page.getByTestId('own-hours-open-register').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/flights\?/);
    await expect(page).toHaveURL(new RegExp(`instructorPersonId=${instructorA.personId}`));
    await expect(page.getByTestId('flight-instructor-filter-banner')).toBeVisible();

    const rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('0:45');
  });

  test('pilota riceve 403 dalle API riepiloghi; un istruttore non può filtrare il registro voli per un instructorPersonId altrui (AC 2/4)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const otherInstructor = await createInstructorPerson(page, 'Altrui');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const studentsResponse = await page.request.get(`/api/v1/school/summaries/students?from=${PERIOD_FROM}&to=${PERIOD_TO}`);
    expect(studentsResponse.status()).toBe(403);
    expect((await studentsResponse.json()).error.code).toBe('FORBIDDEN');

    const instructorsResponse = await page.request.get(`/api/v1/school/summaries/instructors?from=${PERIOD_FROM}&to=${PERIOD_TO}`);
    expect(instructorsResponse.status()).toBe(403);
    expect((await instructorsResponse.json()).error.code).toBe('FORBIDDEN');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, INSTRUCTOR_EMAIL);

    const flightsResponse = await page.request.get(`/api/v1/flights?instructorPersonId=${otherInstructor.personId}`);
    expect(flightsResponse.status()).toBe(403);
    expect((await flightsResponse.json()).error.code).toBe('FORBIDDEN');
  });
});
