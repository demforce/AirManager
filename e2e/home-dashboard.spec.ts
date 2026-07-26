import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Home dashboard per ruolo (story 12.12, AC 1/4/5/6/7). The home
 * (`/dashboard`) is now AirOps-native: admin/staff land on the AdminOverview
 * console (real KPIs + embedded Schedule/BookingsTable + Scadenze/Fleet
 * widgets), an istruttore lands on "la mia giornata" (own compensation KPIs,
 * no creation CTA — ratifica 3), a pilota/allievo land on the personal
 * landing (saldo/scadenze/prossimi voli) — the allievo WITHOUT the "Prenota
 * volo" CTA (an allievo never books solo, ratifica spec §3:49). The legacy
 * widget-grid home this replaces is gone entirely.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const STAFF_EMAIL = 'staff@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const STUDENT_EMAIL = 'student@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/home-dashboard.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

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

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

function addDaysUtc(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as the other e2e specs. */
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

/** Creates a fresh pilot person plus a login user (invite flow via Mailpit). */
async function createPilotWithLogin(page: Page, password: string, tag: string): Promise<{ personId: string; email: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Pilota';
  const lastName = `${tag}-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail('pilot-home');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId: person.id } });
  expect(userResponse.status()).toBe(201);
  await setPasswordFromInvite(page, email, password);
  return { personId: person.id, email };
}

/** Creates a fresh run-unique aircraft. */
async function createAircraft(page: Page, tag: string): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-HD${tag}${suffix}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 50 },
  });
  expect(response.status()).toBe(201);
  const aircraft = (await response.json()) as { id: string };
  return { id: aircraft.id, registration };
}

const ADMIN_OVERVIEW_KPI_TESTIDS = ['kpi-flights-today', 'kpi-fleet-available', 'kpi-ppr-pending', 'kpi-bookings-pending', 'kpi-revenue'];
const PILOT_LANDING_KPI_TESTIDS = ['kpi-balance', 'kpi-license', 'kpi-medical', 'kpi-ratings'];
const INSTRUCTOR_LANDING_KPI_TESTIDS = ['kpi-hours-month', 'kpi-payout-rate', 'kpi-owed-month', 'kpi-flights-today'];

test.describe('Home dashboard — role-based landing (story 12.12, AC 1/4/5/6)', () => {
  test('admin lands on the AdminOverview console: 5 real KPIs, embedded Schedule + BookingsTable, Scadenze/Fleet widgets, dispatch CTA', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await expect(page.getByRole('heading', { name: 'Panoramica operativa' })).toBeVisible();

    for (const testId of ADMIN_OVERVIEW_KPI_TESTIDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    await expect(page.getByTestId('dispatch-flight-button')).toBeVisible();
    await expect(page.getByTestId('schedule-section')).toBeVisible();
    await expect(page.getByTestId('bookings-list-section')).toBeVisible();
    await expect(page.getByTestId('scadenze-widget')).toBeVisible();
    await expect(page.getByTestId('fleet-card-widget')).toBeVisible();
  });

  test('staff sees the SAME AdminOverview console as admin (both hold finance.manage)', async ({ page }) => {
    await loginExpectingDashboard(page, STAFF_EMAIL);
    await expect(page.getByRole('heading', { name: 'Panoramica operativa' })).toBeVisible();
    for (const testId of ADMIN_OVERVIEW_KPI_TESTIDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
  });

  test('a pilot lands on the personal landing: greeting, 4 real KPIs, "Prenota volo" CTA visible (bookings.manage.own)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await expect(page.getByRole('heading', { name: /^Ciao, /u })).toBeVisible();

    for (const testId of PILOT_LANDING_KPI_TESTIDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    // PO ratification 2026-07-18: the license is LIFETIME — the KPI shows the
    // license TYPE from the pilot profile (seed: PPL(A)), never an expiry date.
    await expect(page.getByTestId('kpi-license')).toContainText('PPL(A)');
    await expect(page.getByTestId('pilot-landing-logbook-cta')).toBeVisible();
    await expect(page.getByTestId('pilot-landing-book-cta')).toBeVisible();

    // Never the admin/instructor faces.
    await expect(page.getByTestId('dispatch-flight-button')).toHaveCount(0);
  });

  test('an allievo lands on the SAME personal landing, but WITHOUT the "Prenota volo" CTA (an allievo never books solo, ratifica spec §3:49)', async ({ page }) => {
    await loginExpectingDashboard(page, STUDENT_EMAIL);
    await expect(page.getByRole('heading', { name: /^Ciao, /u })).toBeVisible();

    for (const testId of PILOT_LANDING_KPI_TESTIDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    await expect(page.getByTestId('pilot-landing-logbook-cta')).toBeVisible();
    await expect(page.getByTestId('pilot-landing-book-cta')).toHaveCount(0);
  });

  test('a pure istruttore lands on InstructorLanding: greeting, own compensation KPIs, "La mia giornata", NO creation CTA at all (ratifica 3, D13)', async ({ page }) => {
    await loginExpectingDashboard(page, INSTRUCTOR_EMAIL);
    await expect(page.getByRole('heading', { name: /^Buongiorno, /u })).toBeVisible();

    for (const testId of INSTRUCTOR_LANDING_KPI_TESTIDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    await expect(page.getByTestId('instructor-landing-logbook-cta')).toBeVisible();

    // Ratifica 3: the prototype's "Nuovo volo" CTA is DROPPED (no
    // flights.manage) — no dispatch/creation CTA anywhere on this landing.
    await expect(page.getByTestId('dispatch-flight-button')).toHaveCount(0);
    await expect(page.getByTestId('pilot-landing-book-cta')).toHaveCount(0);
  });
});

test.describe('Home dashboard — data-driven (story 12.12, AC 1)', () => {
  test('a fresh PENDING booking appears in the AdminOverview\'s embedded "Prenotazioni" card, which reads startsAt-ascending like /dashboard/bookings, and is reflected in the KPI', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'PF');
    const password = 'PendingFirstHome123!';
    const pilot = await createPilotWithLogin(page, password, 'PendingFirst');

    // A pilot's own booking (no `bookings.manage.any`) defaults to PENDING
    // (`bookings.service.ts#createBooking`).
    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, password);
    const tomorrow = addDaysUtc(1);
    const bookingResponse = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${tomorrow}T09:00:00.000Z`, endsAt: `${tomorrow}T10:00:00.000Z` },
    });
    expect(bookingResponse.status()).toBe(201);
    expect((await bookingResponse.json()).booking.status).toBe('PENDING');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const ourRow = page.getByTestId('booking-row').filter({ hasText: aircraft.registration });
    await expect(ourRow).toBeVisible();
    await expect(ourRow.getByText('In attesa', { exact: true })).toBeVisible();

    // Ordering invariant (PO decision 2026-07-26, replacing story 12.12's
    // pending-first ordering): the embedded card reads `startsAt` ascending,
    // exactly like `/dashboard/bookings`. Read from the row's own start cell
    // (`booking-row-starts-at`) and compare the underlying ISO instants, never
    // the rendered `DD/MM · HH:MM` text — a string compare on that format
    // would order 01/08 before 27/07.
    const startCells = page.getByTestId('booking-row').getByTestId('booking-row-starts-at');
    const startsAt = await startCells.evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-starts-at') ?? ''));
    expect(startsAt.length).toBeGreaterThan(0);
    const sorted = [...startsAt].sort();
    expect(startsAt, `embedded card rows must be startsAt-ascending, got ${startsAt.join(' | ')}`).toEqual(sorted);

    // The "Prenotazioni in attesa" KPI reflects the real pending count (>= 1: this fixture, possibly more from concurrent specs).
    const kpiValue = page.getByTestId('kpi-bookings-pending').locator('.kpi-value');
    expect(Number(await kpiValue.innerText())).toBeGreaterThanOrEqual(1);
  });
});
