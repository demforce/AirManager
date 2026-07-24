import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/expiry-registration.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniquePerson(prefix: string): { firstName: string; lastName: string } {
  return { firstName: prefix, lastName: `Scadenze-${uniqueSuffix()}` };
}

function uniqueTypeName(prefix: string): string {
  return `${prefix} ${uniqueSuffix()}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

/** A day `days` from NOW (can be negative), `YYYY-MM-DD` UTC — dates stay relative to actual test-run time (Dev Notes: computed status depends on real "today"). Used for API payloads and `<input type="date">` values, which stay ISO (AC 1). */
function addDaysUtc(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as `expiry-types.spec.ts`. */
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

/** Creates a STAFF-only user (`expiries.manage` but never `settings.manage`) and returns credentials — same helper shape as `expiry-types.spec.ts`. */
async function createStaffUserAndSetPassword(page: Page, password: string): Promise<string> {
  const email = uniqueEmail('staff-exp-reg');
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

/** Creates a person via the admin API and activates an ACTIVE pilot profile (mirrors `instructor-rates.spec.ts#createInstructorPerson`). */
async function createPilotPerson(page: Page, person: { firstName: string; lastName: string }): Promise<string> {
  const createResponse = await page.request.post('/api/v1/people', {
    data: { firstName: person.firstName, lastName: person.lastName },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${created.id}/profiles/pilot`, {
    data: { licenseNumber: `LIC-${uniqueSuffix()}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  return created.id;
}

/** Creates a run-unique, always-usable (scope `ALL`) expiry type via the admin API and returns its id — `validityMonths` optional (story 12.11, ratifica utente 2). */
async function createExpiryType(
  page: Page,
  scope: 'ALL' | 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' = 'ALL',
  validityMonths?: number,
): Promise<{ id: string; name: string }> {
  const name = uniqueTypeName('Tipo scadenza');
  const response = await page.request.post('/api/v1/expiry-types', { data: { name, scope, ...(validityMonths !== undefined ? { validityMonths } : {}) } });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return { id: created.id, name };
}

/**
 * Drives the chip-based "Ratings" add flow through the ACTUAL UI (AC 1) —
 * story 13.3 (R-13.3-c, AC 1 "gestione avviene via editor") retired the
 * page-level "Registra scadenza" form (`ExpiriesPanel`): the scheda persona
 * now shows a READ-ONLY list, and registering a scadenza goes through
 * "Modifica" → the SAME `PilotEditor` slide-over's "Ratings" section
 * (`LiveExpiryEditor`, story 13.2) the Piloti table already uses. Assumes
 * the editor is already OPEN (caller opens it once, adds every type in the
 * same session — `LiveExpiryEditor` refetches its own catalogue/current list
 * after each add, so a type registered earlier in the session correctly
 * disappears from the chip strip for the next one).
 */
async function registerExpiryViaUi(page: Page, values: { typeId: string; expiresAt: string }): Promise<void> {
  const ratingsEditor = page.getByTestId('pilot-ratings-editor');
  await ratingsEditor.getByTestId(`expiry-chip-${values.typeId}`).click();
  await ratingsEditor.getByTestId('expiry-add-date').fill(values.expiresAt);
  await ratingsEditor.getByTestId('expiry-add-confirm').click();
  // Wait for the add to actually settle (POST + `refresh()`'s refetch) before
  // returning: the caller registers several types back to back in the SAME
  // session, and starting the next chip click while this one is still
  // in-flight (`expiry-add-form` still mounted) is a real race, not just
  // test impatience — the new row is the definitive "done" signal.
  await expect(ratingsEditor.getByTestId('expiry-add-form')).toHaveCount(0);
  await expect(ratingsEditor.getByTestId(`expiry-row-${values.typeId}`)).toBeVisible();
}

test.describe('Person expiries with computed status (Story 6.2, AC 1; editor-driven since Story 13.3)', () => {
  test('a staff actor registers scadenze via the PilotEditor UI with correct status badges, a duplicate/SCOPE_MISMATCH are rejected at the API; admin completes the 6.1 delete-constraint contract', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const pilot = uniquePerson('Chiara');
    const personId = await createPilotPerson(page, pilot);

    // AC 1: register three scadenze (each its own run-unique, always-usable
    // type) with dates chosen to land in each of the three status bands —
    // driven through the ACTUAL "Modifica" → Ratings chip UI, by a STAFF
    // actor (created via the API, same pattern as `expiry-types.spec.ts`) —
    // `expiries.manage` is granted to staff too (story 6.1).
    const okType = await createExpiryType(page);
    const expiringType = await createExpiryType(page);
    const expiredType = await createExpiryType(page);
    const instructorsType = await createExpiryType(page, 'INSTRUCTORS');

    const staffPassword = 'StaffExpiryReg123!';
    const staffEmail = await createStaffUserAndSetPassword(page, staffPassword);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, staffEmail, staffPassword);

    await page.goto(`/it/dashboard/people/${personId}`);
    await page.getByTestId('person-edit-button').click();

    await registerExpiryViaUi(page, { typeId: okType.id, expiresAt: addDaysUtc(400) });
    await registerExpiryViaUi(page, { typeId: expiringType.id, expiresAt: addDaysUtc(20) });
    // R6 (`Expiry.issuedAt` dropped): an already-expired scadenza is simply
    // legal to register — no more "issue date" to compare `expiresAt`
    // against (review F1's root cause).
    await registerExpiryViaUi(page, { typeId: expiredType.id, expiresAt: addDaysUtc(-30) });

    // AC 1: a duplicate (person, type) has no UI path anymore — the chip
    // itself disappears once registered (13.2's `LiveExpiryEditor` only
    // offers UNregistered types) — verified directly against the endpoint
    // the chip flow calls, same as the SCOPE_MISMATCH check below.
    const duplicateResponse = await page.request.post('/api/v1/expiries', {
      data: { personId, expiryTypeId: okType.id, expiresAt: addDaysUtc(500) },
    });
    expect(duplicateResponse.status()).toBe(409);

    // Close the editor — the dossier's read-only "Scadenze" list refreshes
    // (`edit-person-button.tsx`'s `onClose` calls `router.refresh()`).
    await page.getByRole('button', { name: 'Chiudi' }).click();

    const okRow = page.getByTestId('person-expiry-row').filter({ hasText: okType.name });
    await expect(okRow).toContainText('In regola');

    const expiringRow = page.getByTestId('person-expiry-row').filter({ hasText: expiringType.name });
    await expect(expiringRow).toContainText('In scadenza');

    const expiredRow = page.getByTestId('person-expiry-row').filter({ hasText: expiredType.name });
    await expect(expiredRow).toContainText('Scaduta');

    // AC 1: an incompatible ambito (INSTRUCTORS on a pilot-only person) is
    // rejected with the stable SCOPE_MISMATCH code (422). The editor's own
    // chip strip already filters this type out client-side (only active
    // types compatible with the person's active profiles are offered) —
    // asserted directly against the API instead, the only way to actually
    // reach that guard, same as the story's own service-level scope-check
    // unit tests.
    const mismatchResponse = await page.request.post('/api/v1/expiries', {
      data: { personId, expiryTypeId: instructorsType.id, expiresAt: addDaysUtc(400) },
    });
    expect(mismatchResponse.status()).toBe(422);
    const mismatchBody = await mismatchResponse.json();
    expect(mismatchBody.error.code).toBe('SCOPE_MISMATCH');

    // Story 6.1's delete-constraint contract, completed here (Task 3) —
    // `settings.manage` only, so back to admin: a type now in use cannot be
    // deleted (409, "in use" message); it CAN still be deactivated. Story
    // 12.11: the catalogue moved onto the Impostazioni "Ratings" card.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/settings');
    const okTypeRow = page.getByTestId('rating-row').filter({ hasText: okType.name });
    await okTypeRow.getByRole('button', { name: 'Elimina' }).click();
    await okTypeRow.getByRole('button', { name: 'Sì' }).click();
    await expect(page.getByTestId('ratings-feedback')).toContainText('in uso');
    await expect(page.getByTestId('rating-row').filter({ hasText: okType.name })).toHaveCount(1);

    await okTypeRow.getByRole('button', { name: 'Disattiva' }).click();
    await expect(page.getByTestId('rating-row').filter({ hasText: okType.name })).toContainText('Disattivato');
  });

  // NOTE (story 13.3): the "story 12.11/13.1 (review R6): selecting a type
  // with a configured validityMonths precompiles 'Data scadenza'" coverage
  // that used to live here was dropped, not ported — it exercised the
  // page-level `ExpiriesPanel` register form's `useEffect`-driven precompile
  // (today + `validityMonths`), which no UI surface offers anymore: the
  // replacement, `LiveExpiryEditor` (story 13.2, shared by the Piloti/
  // Istruttori editors and now this page too), never had that precompile —
  // its "add" date field always starts blank, chip-selected or not. That is
  // a pre-existing gap in the shared 13.2 editor, not something introduced
  // here; fixing `LiveExpiryEditor` itself is out of this story's scope
  // (flagged in the Dev Agent Record / review notes instead of silently
  // dropping the coverage).
});
