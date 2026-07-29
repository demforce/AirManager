import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * "Le mie transazioni" — self-service estratto conto (story 14.6). A
 * dedicated sidebar-linked page for PILOT/STUDENT, distinct from the
 * staff-facing scheda persona (`account-statement.spec.ts`). Covers AC 1
 * (sidebar visibility), AC 2/5 (self-only reads — no personId in the URL,
 * the staff-facing endpoint's existing 403-for-another-id contract stays
 * intact), AC 3 (pilota-centric rendering: no "Registrato da"/actions
 * column, no top-up/rettifica buttons), and AC 6 (fixtures with a REAL
 * top-up + flight charge).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const STAFF_EMAIL = 'staff@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const STUDENT_EMAIL = 'student@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/my-account.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as the other e2e specs (aircraft-rates.spec.ts, home-dashboard.spec.ts). */
async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<MailpitFullMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const searchResponse = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const searchBody = (await searchResponse.json()) as { messages: MailpitMessageSummary[] };
    const found = searchBody.messages.find((message) => message.Subject.includes(subjectIncludes));
    if (found) {
      const messageResponse = await fetch(`http://localhost:8025/api/v1/message/${found.ID}`);
      return (await messageResponse.json()) as MailpitFullMessage;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

function extractSetPasswordUrl(emailText: string): URL {
  const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(emailText);
  if (!match) throw new Error(`Email body did not contain a /set-password link:\n${emailText}`);
  return new URL(match[1]);
}

async function setPasswordFromInvite(page: Page, email: string, password: string): Promise<void> {
  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(inviteEmail.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();
}

/** Creates a fresh person + PILOT or STUDENT profile + a real login (invite flow via Mailpit) — isolated from the shared seeded accounts (lesson: exact-total assertions need a fresh fixture, never the seeded pilot@/student@). */
async function createPersonWithLogin(
  page: Page,
  profileType: 'pilot' | 'student',
  password: string,
  tag: string,
): Promise<{ personId: string; email: string }> {
  const suffix = uniqueSuffix();
  const firstName = profileType === 'pilot' ? 'Pilota' : 'Allievo';
  const lastName = `${tag}-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileBody = profileType === 'pilot' ? { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' } : { courseStartDate: '2026-01-15' };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/${profileType}`, { data: profileBody });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail(`${profileType}-myaccount`);
  const role = profileType === 'pilot' ? 'PILOT' : 'STUDENT';
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: [role], personId: person.id } });
  expect(userResponse.status()).toBe(201);
  await setPasswordFromInvite(page, email, password);
  return { personId: person.id, email };
}

async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-MA${suffix}`.toUpperCase().slice(0, 20);
  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 500 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };
  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
    data: { priceCentsPerHour, validFrom: '2020-01-01' },
  });
  expect(rateResponse.status()).toBe(201);
  return { id: aircraft.id };
}

/** A safely-in-the-past isolation date — `registerFlight` rejects a future `takeoffAt` (same rationale as billing.spec.ts's `uniquePastDateOnly`). */
function uniquePastDateOnly(): string {
  const dayOffset = Math.floor(Math.random() * 700);
  return new Date(Date.UTC(2022, 0, 1) - dayOffset * 86_400_000).toISOString().slice(0, 10);
}

async function recordTopUp(page: Page, personId: string, amountCents: number, effectiveDate: string): Promise<void> {
  const response = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
    data: { amountCents, paymentMethod: 'CASH', effectiveDate },
  });
  expect(response.status()).toBe(200);
}

/** Registers a TOURISM flight charge via the API — the "volo" leg of the fixture (AC 6). */
async function registerFlight(page: Page, aircraftId: string, personId: string, dateOnly: string, minutes: number): Promise<void> {
  const takeoffAt = `${dateOnly}T10:00:00.000Z`;
  const landingAt = new Date(new Date(takeoffAt).getTime() + minutes * 60_000).toISOString();
  const response = await page.request.post('/api/v1/flights', {
    data: { aircraftId, personId, departureAirfield: 'Base Airfield', arrivalAirfield: 'Base Airfield', flightType: 'TOURISM', takeoffAt, landingAt },
  });
  expect(response.status()).toBe(201);
}

/** Scoped to the sidebar landmark (CLAUDE.md convention — never a page-level `getByRole('link', ...)`, the name-match is substring). */
function myAccountNavLink(page: Page) {
  return page.getByRole('navigation', { name: 'Aree operative' }).getByRole('link', { name: 'Le mie transazioni' });
}

test.describe('Sidebar visibility (AC 1)', () => {
  test('PILOT and STUDENT see "Le mie transazioni"; ADMIN/STAFF/INSTRUCTOR do not', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await expect(myAccountNavLink(page)).toBeVisible();

    await loginExpectingDashboard(page, STUDENT_EMAIL);
    await expect(myAccountNavLink(page)).toBeVisible();

    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await expect(myAccountNavLink(page)).toHaveCount(0);

    await loginExpectingDashboard(page, STAFF_EMAIL);
    await expect(myAccountNavLink(page)).toHaveCount(0);

    await loginExpectingDashboard(page, INSTRUCTOR_EMAIL);
    await expect(myAccountNavLink(page)).toHaveCount(0);
  });
});

test.describe('Own movements only (AC 2/3/5/6)', () => {
  test('a pilot sees ONLY their own movements — a real top-up + flight charge, exact balance, no "Registrato da"/actions column, no top-up/rettifica actions', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'MyAccountPilot123!';
    const pilot = await createPersonWithLogin(page, 'pilot', password, 'Own');
    const aircraft = await createAircraftWithRate(page, 12000); // 120,00 €/h
    const flightDate = uniquePastDateOnly();

    await recordTopUp(page, pilot.personId, 20000, flightDate); // +200,00 €
    await registerFlight(page, aircraft.id, pilot.personId, flightDate, 30); // 30 min @ 120,00 €/h = -60,00 €
    // Expected balance: 200,00 - 60,00 = 140,00 €.

    await loginExpectingDashboard(page, pilot.email, password);
    await page.goto('/it/dashboard/my-account');
    await expect(page.getByRole('heading', { level: 1, name: 'Le mie transazioni' })).toBeVisible();

    await expect(page.getByTestId('account-balance')).toHaveText(/140,00\s€/);
    await expect(page.getByTestId('account-movement-row')).toHaveCount(2);
    await expect(page.getByTestId('account-statement-header-row')).not.toContainText('Registrato da');
    await expect(page.getByTestId('account-statement-header-row')).not.toContainText('Azioni');
    await expect(page.getByTestId('account-topup-toggle')).toHaveCount(0);
    await expect(page.getByTestId('account-adjustment-toggle')).toHaveCount(0);

    // Raw response check (AD-5: the service is the guardian, not just the render) — no actorEmail, exact total.
    const raw = await page.request.get('/api/v1/people/' + pilot.personId + '/account/movements');
    const body = (await raw.json()) as { items: Array<{ actorEmail?: string }>; total: number };
    expect(body.total).toBe(2);
    for (const item of body.items) expect(item).not.toHaveProperty('actorEmail');
  });

  test('pagination stays on /dashboard/my-account (review 14.6 F3: statementBasePath is the only behavior change to the shared component)', async ({
    page,
  }) => {
    test.slow();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'MyAccountPager123!';
    const pilot = await createPersonWithLogin(page, 'pilot', password, 'Pager');
    // 21 movements > the 20/page window, so page 2 exists.
    for (let index = 0; index < 21; index += 1) {
      await recordTopUp(page, pilot.personId, 1000, uniquePastDateOnly());
    }

    await loginExpectingDashboard(page, pilot.email, password);
    await page.goto('/it/dashboard/my-account');
    await expect(page.getByTestId('account-movement-row')).toHaveCount(20);

    // The pagination link must target THIS page, never the staff-shaped scheda persona.
    const next = page.getByTestId('account-statement-page-next');
    await expect(next).toHaveAttribute('href', /\/it\/dashboard\/my-account\?page=2/);
    await next.click();
    await expect(page).toHaveURL(/\/it\/dashboard\/my-account\?page=2/);
    await expect(page.getByTestId('account-movement-row')).toHaveCount(1);

    // Out-of-range page clamps instead of erroring.
    await page.goto('/it/dashboard/my-account?page=999');
    await expect(page.getByTestId('account-movement-row')).toHaveCount(1);
  });

  test('an allievo sees their own movements the same way (top-up + flight charge)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'MyAccountStudent123!';
    const student = await createPersonWithLogin(page, 'student', password, 'Own');
    // Story 14.3 (AC 1, ratifica R1): a student-ONLY active profile can only
    // log SCHOOL flights now — this fixture's own TOURISM `registerFlight`
    // call below only needs SOME flight charge to exist for the own-access
    // assertions, unrelated to `flightType`, so activating an ADDITIONAL
    // pilot profile (both active -> unrestricted, same as a plain pilot)
    // keeps this test's TOURISM charge legal without touching its balance
    // math or its STUDENT-role login/self-access assertions below.
    const pilotUpgrade = await page.request.put(`/api/v1/people/${student.personId}/profiles/pilot`, {
      data: { licenseNumber: `IT-PPL-${student.personId.slice(-8)}`, licenseType: 'PPL(A)' },
    });
    expect(pilotUpgrade.status()).toBe(200);
    const aircraft = await createAircraftWithRate(page, 10000); // 100,00 €/h
    const flightDate = uniquePastDateOnly();

    await recordTopUp(page, student.personId, 15000, flightDate); // +150,00 €
    await registerFlight(page, aircraft.id, student.personId, flightDate, 30); // 30 min @ 100,00 €/h = -50,00 €
    // Expected balance: 150,00 - 50,00 = 100,00 €.

    await loginExpectingDashboard(page, student.email, password);
    await page.goto('/it/dashboard/my-account');
    await expect(page.getByTestId('account-balance')).toHaveText(/100,00\s€/);
    await expect(page.getByTestId('account-movement-row')).toHaveCount(2);
    await expect(page.getByTestId('account-statement-header-row')).not.toContainText('Registrato da');
  });

  test('IDOR probe: a pilot cannot read another person\'s account via the staff-facing endpoint — id ignored/rejected, existing 403 contract untouched (AC 2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'MyAccountIdor123!';
    const victim = await createPersonWithLogin(page, 'pilot', password, 'Victim');
    await recordTopUp(page, victim.personId, 5000, uniquePastDateOnly());

    const attacker = await createPersonWithLogin(page, 'pilot', 'MyAccountAttacker123!', 'Attacker');

    await loginExpectingDashboard(page, attacker.email, 'MyAccountAttacker123!');
    // 1) the self-service page itself carries no personId at all — nothing to override.
    const ownRaw = await page.request.get('/api/v1/people/' + attacker.personId + '/account/movements');
    expect((await ownRaw.json()).total).toBe(0);
    // 2) the staff-facing endpoint (still gated own-or-staff) rejects the attacker's id substituted for the victim's.
    const idorResponse = await page.request.get(`/api/v1/people/${victim.personId}/account/movements`);
    expect(idorResponse.status()).toBe(403);
    const idorBody = await idorResponse.json();
    expect(idorBody.error.code).toBe('FORBIDDEN');

    // The victim's OWN session still sees their own top-up, untouched by the probe.
    await loginExpectingDashboard(page, victim.email, password);
    await page.goto('/it/dashboard/my-account');
    await expect(page.getByTestId('account-balance')).toHaveText(/50,00\s€/);
  });

  test('an actor with no linked person (admin-managed login unlinked from any Person) sees a coherent empty state, never an error (AC 5)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const email = uniqueEmail('personless-pilot');
    const password = 'PersonlessPilot123!';
    // No `personId` in the body — a PILOT-role login unlinked from any Person
    // (`users.service.ts#createUser`/`updateUser` allow this independently of roles).
    const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'] } });
    expect(userResponse.status()).toBe(201);
    await setPasswordFromInvite(page, email, password);

    await loginExpectingDashboard(page, email, password);
    await expect(myAccountNavLink(page)).toBeVisible();
    await myAccountNavLink(page).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/my-account$/);

    await expect(page.getByTestId('account-balance')).toHaveText('Nessun conto attivo');
    await expect(page.getByTestId('account-movement-row')).toHaveCount(0);
  });
});
