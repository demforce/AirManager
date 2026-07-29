import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * "I miei compensi" — self-service instructor compensation page (story
 * 14.7). A dedicated sidebar-linked page for INSTRUCTOR, distinct from the
 * staff-facing roster (`instructor-compensation.spec.ts`). Covers AC 2
 * (sidebar + page content), AC 3 (self-only reads — no id in the URL/query,
 * the staff-facing `finance.manage`/`payouts.manage` endpoints stay
 * untouched), AC 4 (profile-active gating, not role), and AC 6 (a real
 * admin-recorded payout shows up in the instructor's own history; a pilot
 * never sees the nav item or the data; IDOR probe).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const STAFF_EMAIL = 'staff@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const STUDENT_EMAIL = 'student@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/my-compensation.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/** Creates a fresh instructor person (active `InstructorProfile`) plus a real login (invite flow via Mailpit) — isolated from the shared seeded `instructor@airmanager.local` (needed for exact KPI assertions). */
async function createInstructorWithLogin(page: Page, password: string, tag: string): Promise<{ personId: string; email: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Istruttore';
  const lastName = `${tag}-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, { data: {} });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail('instructor-comp');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['INSTRUCTOR'], personId: person.id } });
  expect(userResponse.status()).toBe(201);
  await setPasswordFromInvite(page, email, password);
  return { personId: person.id, email };
}

async function setPayoutRate(page: Page, personId: string, payoutRateCents: number): Promise<void> {
  const response = await page.request.put(`/api/v1/instructor-compensation/${personId}/rate`, { data: { payoutRateCents } });
  expect(response.status()).toBe(200);
}

/** A fixed PAST date (same convention as `instructor-compensation.spec.ts`'s `PAST_DATE`) — always outside any "month-to-date"/"year-to-date" window, so `mtdOwedCents` stays deterministically `0` regardless of the day this suite runs, while `totalOwedCents` (unbounded) deterministically includes it. */
const PAST_DATE = '2020-01-15';

/** Records a payout as the currently-authenticated (ADMIN) actor — the "admin registra un pagamento" leg of the AC 6 fixture. */
async function recordPayout(page: Page, personId: string, amountCents: number, method: 'CASH' | 'BANK_TRANSFER' | 'POS' = 'CASH'): Promise<void> {
  const response = await page.request.post('/api/v1/instructor-payouts', {
    headers: { 'Idempotency-Key': `e2e-my-compensation-${uniqueSuffix()}` },
    data: { instructorPersonId: personId, amountCents, periodStart: PAST_DATE, periodEnd: PAST_DATE, method, notes: null },
  });
  expect(response.status()).toBe(201);
}

/** Scoped to the sidebar landmark (CLAUDE.md convention — never a page-level `getByRole('link', ...)`, the name-match is substring). */
function myCompensationNavLink(page: Page) {
  return page.getByRole('navigation', { name: 'Aree operative' }).getByRole('link', { name: 'I miei compensi', exact: true });
}

test.describe('Sidebar + profile-active visibility (AC 2/4)', () => {
  test('INSTRUCTOR sees "I miei compensi"; PILOT/STUDENT/ADMIN/STAFF do not', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await expect(myCompensationNavLink(page)).toHaveCount(0);

    await loginExpectingDashboard(page, STUDENT_EMAIL);
    await expect(myCompensationNavLink(page)).toHaveCount(0);

    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await expect(myCompensationNavLink(page)).toHaveCount(0);

    await loginExpectingDashboard(page, STAFF_EMAIL);
    await expect(myCompensationNavLink(page)).toHaveCount(0);

    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'MyCompensationNav123!';
    const instructor = await createInstructorWithLogin(page, password, 'Nav');
    await loginExpectingDashboard(page, instructor.email, password);
    await expect(myCompensationNavLink(page)).toBeVisible();
  });

  test('an instructor whose profile gets DEACTIVATED stops seeing the nav item; the page itself falls back to the coherent "no profile" state, never a 403 (AC 4)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'MyCompensationDeact123!';
    const instructor = await createInstructorWithLogin(page, password, 'Deact');

    await loginExpectingDashboard(page, instructor.email, password);
    await expect(myCompensationNavLink(page)).toBeVisible();

    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const deactivateResponse = await page.request.post(`/api/v1/people/${instructor.personId}/profiles/instructor/deactivate`);
    expect(deactivateResponse.status()).toBe(200);

    await loginExpectingDashboard(page, instructor.email, password);
    await expect(myCompensationNavLink(page)).toHaveCount(0);

    // Direct navigation (URL still reachable, `self.read` — same convention
    // as `my-account`'s universal self-access) never 403s and never shows a
    // dead role-gated end: coherent "no active profile" empty state.
    await page.goto('/it/dashboard/my-compensation');
    await expect(page.getByTestId('my-compensation-empty')).toBeVisible();
    await expect(page.getByTestId('my-compensation-kpis')).toHaveCount(0);
  });
});

test.describe('Own compensation only (AC 2/3/5/6)', () => {
  test('an instructor sees a payout the ADMIN registered — date, period, method, amount — in their OWN history, plus the accrual KPIs', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'MyCompensationOwn123!';
    const instructor = await createInstructorWithLogin(page, password, 'Own');

    await setPayoutRate(page, instructor.personId, 5000); // 50,00 €/h
    await recordPayout(page, instructor.personId, 20000, 'CASH'); // 200,00 €, dated in the past — outside any mtd/ytd window

    await loginExpectingDashboard(page, instructor.email, password);
    await page.goto('/it/dashboard/my-compensation');
    await expect(page.getByRole('heading', { level: 1, name: 'I miei compensi' })).toBeVisible();

    const kpis = page.getByTestId('my-compensation-kpis');
    await expect(kpis).toContainText('50,00 €');
    await expect(kpis).toContainText('0:00'); // no flights ever -> 0 hours this month
    await expect(kpis).toContainText('0,00 €'); // maturato nel mese: no flights, no payout inside the mtd window
    await expect(kpis).toContainText('-200,00 €'); // residuo dovuto: 0 gross - 200,00 € paid (all-time)

    const rows = page.getByTestId('my-compensation-payout-row');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('15/01/2020');
    await expect(rows).toContainText('Contanti');
    await expect(rows).toContainText('200,00 €');
  });

  test('a pilot never sees the nav item nor any compensation data on direct navigation (AC 5 — never the staff roster, never another instructor\'s)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await expect(myCompensationNavLink(page)).toHaveCount(0);

    await page.goto('/it/dashboard/my-compensation');
    await expect(page.getByTestId('my-compensation-empty')).toBeVisible();
    await expect(page.getByTestId('my-compensation-kpis')).toHaveCount(0);
    await expect(page.getByTestId('my-compensation-payout-row')).toHaveCount(0);
  });

  test('IDOR probe: spurious instructorProfileId/personId query params never surface another instructor\'s data (there is no id parameter for the self-service read to accept)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const victim = await createInstructorWithLogin(page, 'MyCompensationVictim123!', 'Victim');
    await setPayoutRate(page, victim.personId, 9999);
    await recordPayout(page, victim.personId, 77777, 'BANK_TRANSFER');

    const password = 'MyCompensationAttacker123!';
    const attacker = await createInstructorWithLogin(page, password, 'Attacker');

    await loginExpectingDashboard(page, attacker.email, password);
    await page.goto(`/it/dashboard/my-compensation?instructorProfileId=${victim.personId}&personId=${victim.personId}`);

    // The attacker has no rate/payouts of their own — their OWN (empty) shape shows, never the victim's.
    const kpis = page.getByTestId('my-compensation-kpis');
    await expect(kpis).toBeVisible();
    await expect(kpis).not.toContainText('99,99 €');
    await expect(page.getByTestId('my-compensation-payout-row')).toHaveCount(0);
    await expect(page.getByTestId('my-compensation-payouts-empty')).toBeVisible();
  });
});
