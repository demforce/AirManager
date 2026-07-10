import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
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

/** Display counterpart of {@link addDaysUtc} — `DD/MM/YYYY`, the registry's own `formatDateOnly` presentation (story 11.3) — for `toContainText` assertions against rendered rows. */
function addDaysDisplay(days: number): string {
  const [y, m, d] = addDaysUtc(days).split('-');
  return `${d}/${m}/${y}`;
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as `expiry-types.spec.ts`/`package-types.spec.ts`. */
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

/** Creates a run-unique, always-usable (scope `ALL`) expiry type via the admin API and returns its id. */
async function createExpiryType(page: Page, scope: 'ALL' | 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' = 'ALL'): Promise<{ id: string; name: string }> {
  const name = uniqueTypeName('Tipo scadenza');
  const response = await page.request.post('/api/v1/expiry-types', { data: { name, scope } });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return { id: created.id, name };
}

/** Looks up the seed pilot's `Person.id` via the admin people search. */
async function getSeedPilotPersonId(page: Page): Promise<string> {
  const response = await page.request.get(`/api/v1/people?q=${encodeURIComponent(PILOT_EMAIL)}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: { id: string; email: string | null }[] };
  const match = body.items.find((item) => item.email === PILOT_EMAIL);
  if (!match) {
    throw new Error(`Seed pilot (${PILOT_EMAIL}) not found via GET /api/v1/people`);
  }
  return match.id;
}

/** Drives the "Registra scadenza" form on the scheda persona through the actual UI (AC 1). */
async function registerExpiryViaUi(
  page: Page,
  values: { typeName: string; issuedAt: string; expiresAt: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Registra scadenza' }).click();
  const form = page.getByTestId('register-expiry-form');
  await form.getByLabel('Tipo di scadenza').selectOption(values.typeName);
  await form.getByLabel('Data rilascio').fill(values.issuedAt);
  await form.getByLabel('Data scadenza').fill(values.expiresAt);
  await form.getByRole('button', { name: 'Registra' }).click();
}

test.describe('Person expiries with computed status and proposal validation queue (Story 6.2, AC 1/2, FR-36)', () => {
  test('a staff actor registers scadenze via the UI with correct status badges, sees a duplicate rejected in-form, and a SCOPE_MISMATCH is rejected at the API; admin completes the 6.1 delete-constraint contract', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const pilot = uniquePerson('Chiara');
    const personId = await createPilotPerson(page, pilot);

    // AC 1: register three scadenze (each its own run-unique, always-usable
    // type) with dates chosen to land in each of the three status bands —
    // driven through the ACTUAL "Registra scadenza" form, by a STAFF actor
    // (created via the API, same pattern as `package-types.spec.ts`) —
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

    await registerExpiryViaUi(page, { typeName: okType.name, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(400) });
    await expect(page.getByTestId('expiries-panel-feedback')).toBeVisible();

    await registerExpiryViaUi(page, { typeName: expiringType.name, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(20) });
    await registerExpiryViaUi(page, { typeName: expiredType.name, issuedAt: addDaysUtc(-1000), expiresAt: addDaysUtc(-30) });

    const okRow = page.getByTestId('expiry-row').filter({ hasText: okType.name });
    await expect(okRow.getByTestId('expiry-status-badge')).toHaveText('In regola');

    const expiringRow = page.getByTestId('expiry-row').filter({ hasText: expiringType.name });
    await expect(expiringRow.getByTestId('expiry-status-badge')).toHaveText('In scadenza');

    const expiredRow = page.getByTestId('expiry-row').filter({ hasText: expiredType.name });
    await expect(expiredRow.getByTestId('expiry-status-badge')).toHaveText('Scaduta');

    // AC 1: a duplicate (person, type) — shown IN-FORM as the shared
    // conflict message (same "one message per 409 cause" convention as
    // `packages-panel.tsx`'s `SellPackageForm`).
    await registerExpiryViaUi(page, { typeName: okType.name, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(500) });
    await expect(page.getByTestId('register-expiry-form-error')).toBeVisible();
    await page.getByTestId('register-expiry-form').getByRole('button', { name: 'Annulla' }).click();

    // AC 1: an incompatible ambito (INSTRUCTORS on a pilot-only person) is
    // rejected with the stable SCOPE_MISMATCH code (422). The register
    // form's own select already filters this type out client-side (Dev
    // Notes: only active types compatible with the person's active
    // profiles are offered) — asserted directly against the API instead,
    // the only way to actually reach that guard, same as the story's own
    // service-level scope-check unit tests.
    const mismatchResponse = await page.request.post('/api/v1/expiries', {
      data: { personId, expiryTypeId: instructorsType.id, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(400) },
    });
    expect(mismatchResponse.status()).toBe(422);
    const mismatchBody = await mismatchResponse.json();
    expect(mismatchBody.error.code).toBe('SCOPE_MISMATCH');

    // Story 6.1's delete-constraint contract, completed here (Task 3) —
    // `settings.manage` only, so back to admin: a type now in use cannot be
    // deleted (409, "in use" message); it CAN still be deactivated.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/expiries/types');
    const okTypeRow = page.getByRole('row', { name: new RegExp(okType.name) });
    await okTypeRow.getByRole('button', { name: 'Elimina' }).click();
    await okTypeRow.getByRole('button', { name: 'Conferma' }).click();
    await expect(page.getByTestId('expiry-types-feedback')).toContainText('in uso');
    await expect(page.getByRole('row', { name: new RegExp(okType.name) })).toHaveCount(1);

    await okTypeRow.getByRole('button', { name: 'Disattiva' }).click();
    await expect(page.getByRole('row', { name: new RegExp(okType.name) })).toContainText('Disattivato');
  });

  test('the seed pilot proposes an update from "Le mie scadenze"; staff sees it in the queue, approves it, then a second proposal is rejected leaving values unchanged; a pilot cannot POST /api/v1/expiries directly', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const personId = await getSeedPilotPersonId(page);
    const expiryType = await createExpiryType(page);

    const registerResponse = await page.request.post('/api/v1/expiries', {
      data: { personId, expiryTypeId: expiryType.id, issuedAt: addDaysUtc(-10), expiresAt: addDaysUtc(10) },
    });
    expect(registerResponse.status()).toBe(201);

    // A pilot cannot register directly (403 AD-8 envelope) — asserted here,
    // before switching sessions, on the same expiryType/person pair.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const forbiddenResponse = await page.request.post('/api/v1/expiries', {
      data: { personId, expiryTypeId: expiryType.id, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(100) },
    });
    expect(forbiddenResponse.status()).toBe(403);
    expect((await forbiddenResponse.json()).error.code).toBe('FORBIDDEN');

    // AC 2: "Le mie scadenze" — the pilot proposes a renewal. The scadenza
    // itself must NOT change (still the ORIGINAL values) while pending.
    await page.goto('/it/dashboard/expiries');
    await expect(page.getByRole('heading', { name: 'Le mie scadenze' })).toBeVisible();

    const myRow = page.getByTestId('my-expiry-row').filter({ hasText: expiryType.name });
    await expect(myRow.getByTestId('my-expiry-status-badge')).toBeVisible();
    await myRow.getByRole('button', { name: 'Proponi aggiornamento' }).click();

    const proposeForm = page.getByTestId('propose-expiry-form');
    await proposeForm.getByLabel('Data scadenza').fill(addDaysUtc(500));
    await proposeForm.getByRole('button', { name: 'Invia proposta' }).click();

    await expect(page.getByTestId('my-expiries-feedback')).toBeVisible();
    const myRowAfterPropose = page.getByTestId('my-expiry-row').filter({ hasText: expiryType.name });
    await expect(myRowAfterPropose.getByTestId('my-expiry-pending-badge')).toBeVisible();
    // The current row still shows the ORIGINAL expiresAt (AC 2: value stays
    // authoritative until staff decides) — the proposed date must not leak in.
    await expect(myRowAfterPropose).toContainText(addDaysDisplay(10));
    await expect(myRowAfterPropose).not.toContainText(addDaysDisplay(500));

    // A second proposal is blocked while one is pending.
    await expect(myRowAfterPropose).toContainText('Una proposta è già in attesa di validazione.');

    // Staff opens the queue, sees current vs proposed, approves.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/expiries');

    const queueRow = page.getByTestId('proposal-row').filter({ hasText: expiryType.name });
    await expect(queueRow).toContainText(addDaysDisplay(10));
    await expect(queueRow).toContainText(addDaysDisplay(500));
    await queueRow.getByRole('button', { name: 'Approva' }).click();
    await queueRow.getByRole('button', { name: 'Conferma' }).click();
    await expect(page.getByTestId('proposals-queue-feedback')).toBeVisible();

    // The scheda persona now reflects the approved values, pending badge gone.
    await page.goto(`/it/dashboard/people/${personId}`);
    const approvedRow = page.getByTestId('expiry-row').filter({ hasText: expiryType.name });
    await expect(approvedRow).toContainText(addDaysDisplay(500));
    await expect(approvedRow.getByTestId('expiry-pending-badge')).toHaveCount(0);

    // A second proposal (now legal again, the first is decided) followed by
    // a REJECT must leave the (already-approved) values unchanged.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await page.goto('/it/dashboard/expiries');

    const myRowAgain = page.getByTestId('my-expiry-row').filter({ hasText: expiryType.name });
    await myRowAgain.getByRole('button', { name: 'Proponi aggiornamento' }).click();
    const secondProposeForm = page.getByTestId('propose-expiry-form');
    await secondProposeForm.getByLabel('Data scadenza').fill(addDaysUtc(900));
    await secondProposeForm.getByRole('button', { name: 'Invia proposta' }).click();
    await expect(page.getByTestId('my-expiry-row').filter({ hasText: expiryType.name }).getByTestId('my-expiry-pending-badge')).toBeVisible();

    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/expiries');

    const secondQueueRow = page.getByTestId('proposal-row').filter({ hasText: expiryType.name });
    await secondQueueRow.getByRole('button', { name: 'Rifiuta' }).click();
    await secondQueueRow.getByRole('button', { name: 'Conferma' }).click();
    await expect(page.getByTestId('proposals-queue-feedback')).toBeVisible();

    await page.goto(`/it/dashboard/people/${personId}`);
    const finalRow = page.getByTestId('expiry-row').filter({ hasText: expiryType.name });
    // Still the APPROVED (first proposal's) value — the rejected second
    // proposal's date must never have been applied.
    await expect(finalRow).toContainText(addDaysDisplay(500));
    await expect(finalRow).not.toContainText(addDaysDisplay(900));
  });
});
