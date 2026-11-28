import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { decode, encode } from 'next-auth/jwt';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];
// The same secret the server under test signs its sessions with (`.env` locally, the e2e job's env in CI).
const AUTH_SECRET = process.env['AUTH_SECRET'];

if (!SEED_PASSWORD || !AUTH_SECRET) {
  throw new Error('e2e/session-identity.spec.ts requires SEED_ADMIN_PASSWORD and AUTH_SECRET (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';

/** The session cookie over http — Auth.js also uses its name as the salt of the JWE key (`src/proxy.ts`). */
const SESSION_COOKIE = 'authjs.session-token';

/** One minute past `ACTIVE_RECHECK_INTERVAL_MS` (15 min): the next request runs `applyActiveRecheck`. */
const AGED_BY_MS = 16 * 60 * 1000;

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Run-unique names (same pattern as the other specs, for the dirty DB). */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

/** A run-unique person with an active pilot profile (caller authenticated as admin). */
async function createPilotPerson(page: Page): Promise<{ id: string }> {
  const suffix = uniqueSuffix();
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName: 'Sessione', lastName: `Identita-${suffix}` } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  return person;
}

/** A run-unique PILOT user linked to `personId`, with its password set through the invite email (caller authenticated as admin). */
async function createPilotUser(page: Page, personId: string, password: string): Promise<{ id: string; email: string }> {
  const email = `session-identity-${uniqueSuffix()}@airmanager.local`;
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId } });
  expect(userResponse.status()).toBe(201);
  const user = (await userResponse.json()) as { id: string };

  const invite = await waitForMailpitMessage(email, 'invito');
  const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(invite.Text);
  if (!match) throw new Error(`Invite email had no /set-password link:\n${invite.Text}`);
  const url = new URL(match[1]!);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();

  return { id: user.id, email };
}

/** A fresh browser context logged in as `email` — its own cookie jar, so the admin's session in `page` is never touched. */
async function signedInContext(context: BrowserContext, email: string, password: string): Promise<BrowserContext> {
  await loginExpectingDashboard(await context.newPage(), email, password);
  return context;
}

/**
 * Story 16.7, AD-5: the recheck only runs once `lastActiveCheck` is 15 min
 * old, so a test cannot wait for it. It re-encodes the SAME session payload
 * (same `tokenVersion`, same `personId`) with `lastActiveCheck` 16 min in
 * the past — exactly the token that context would carry a quarter of an
 * hour later.
 */
async function ageSession(context: BrowserContext): Promise<void> {
  const cookie = (await context.cookies()).find((candidate) => candidate.name === SESSION_COOKIE);
  if (!cookie) throw new Error(`No ${SESSION_COOKIE} cookie in this context.`);
  const token = await decode({ token: cookie.value, secret: AUTH_SECRET!, salt: SESSION_COOKIE });
  if (!token) throw new Error(`Could not decode the ${SESSION_COOKIE} cookie with AUTH_SECRET.`);
  const aged = await encode({ token: { ...token, lastActiveCheck: Date.now() - AGED_BY_MS }, secret: AUTH_SECRET!, salt: SESSION_COOKIE });
  await context.addCookies([{ ...cookie, value: aged }]);
}

/** A run-unique far-future day in 2029: after the near-term bookings of the suite, before the shared `2031-03-*` piles of `bookings.spec.ts`. */
function runUniqueDay2029(): string {
  const date = new Date(Date.UTC(2029, 0, 1) + Math.floor(Math.random() * 365) * 24 * 3_600_000);
  return date.toISOString().slice(0, 10);
}

/** Walks the APPROVED list page by page (`?page=N`, clamped server-side) until a row matches — same approach as `bookings.spec.ts#findBookingRow`. */
async function findApprovedBookingRow(page: Page, registration: string): Promise<ReturnType<Page['getByTestId']>> {
  const MAX_PAGES = 50;
  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    await page.goto(`/it/dashboard/bookings?status=APPROVED&page=${pageNumber}`);
    await page.waitForLoadState('networkidle');
    const row = page.getByTestId('booking-row').filter({ hasText: registration });
    if ((await row.count()) > 0) return row;
    const statusLocator = page.getByTestId('booking-pagination-status');
    if ((await statusLocator.count()) === 0) break;
    const totalPages = Number.parseInt(((await statusLocator.textContent()) ?? '').split('/')[1]?.trim() ?? '1', 10);
    if (pageNumber >= totalPages) break;
  }
  throw new Error(`Booking row for ${registration} not found within ${MAX_PAGES} pages of /dashboard/bookings`);
}

test.describe('Session identity (Story 16.7, ops F8, R-16-f)', () => {
  test('re-linking a user to another person ends their open session at the next recheck; the same aging leaves a user who was not re-linked signed in', async ({
    page,
    browser,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL, SEED_PASSWORD!);
    const password = `Sessione${uniqueSuffix()}!`;
    const personA = await createPilotPerson(page);
    const personB = await createPilotPerson(page);
    const personC = await createPilotPerson(page);
    const relinked = await createPilotUser(page, personA.id, password);
    const control = await createPilotUser(page, personC.id, password);

    const relinkedContext = await signedInContext(await browser.newContext(), relinked.email, password);
    const controlContext = await signedInContext(await browser.newContext(), control.email, password);
    const before = await relinkedContext.request.get('/api/v1/me');
    expect(before.status()).toBe(200);
    expect(((await before.json()) as { person: { id: string } }).person.id).toBe(personA.id);

    const relink = await page.request.patch(`/api/v1/users/${relinked.id}`, { data: { personId: personB.id } });
    expect(relink.status()).toBe(200);

    // The session is still the one issued for person A: at the recheck its
    // `tokenVersion` no longer matches the DB, and the session ends.
    await ageSession(relinkedContext);
    const evicted = await relinkedContext.request.get('/api/v1/me');
    expect(evicted.status()).toBe(401);
    expect(((await evicted.json()) as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');

    // The decisive control: the SAME aging on a user nobody re-linked runs
    // the same recheck and passes it — the eviction above comes from the
    // version bump, not from the age of the token.
    await ageSession(controlContext);
    const survived = await controlContext.request.get('/api/v1/me');
    expect(survived.status()).toBe(200);
    expect(((await survived.json()) as { person: { id: string } }).person.id).toBe(personC.id);

    // A new login of the re-linked user reads the new identity.
    const reloggedContext = await signedInContext(await browser.newContext(), relinked.email, password);
    const after = await reloggedContext.request.get('/api/v1/me');
    expect(((await after.json()) as { person: { id: string } }).person.id).toBe(personB.id);

    await Promise.all([relinkedContext.close(), controlContext.close(), reloggedContext.close()]);
  });

  test('an unlinked pilot loses the old session, and once signed in again without a person sees no «Modifica»/«Annulla» on an «Occupato» row (AD-3)', async ({
    page,
    browser,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL, SEED_PASSWORD!);
    const password = `Sessione${uniqueSuffix()}!`;
    const person = await createPilotPerson(page);
    const user = await createPilotUser(page, person.id, password);
    const oldContext = await signedInContext(await browser.newContext(), user.email, password);

    // Someone else's booking, from the unlinked user's point of view: an
    // admin fixture on a run-unique aircraft (`force`: not about the requirements).
    const registration = `I-SI${uniqueSuffix()}`.toUpperCase().slice(0, 20);
    const aircraftResponse = await page.request.post('/api/v1/aircraft', { data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model' } });
    expect(aircraftResponse.status()).toBe(201);
    const aircraft = (await aircraftResponse.json()) as { id: string };
    const day = runUniqueDay2029();
    const bookingResponse = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: person.id, startsAt: `${day}T08:00:00.000Z`, endsAt: `${day}T09:00:00.000Z`, force: true },
    });
    expect(bookingResponse.status()).toBe(201);

    const unlink = await page.request.patch(`/api/v1/users/${user.id}`, { data: { personId: null } });
    expect(unlink.status()).toBe(200);

    await ageSession(oldContext);
    expect((await oldContext.request.get('/api/v1/me')).status()).toBe(401);

    // Signed in again: `ownPersonId` is now `null`, and every row of the
    // list is masked (`personId: null` on the wire) — before the guard in
    // `isOwnRow`, `null === null` made each of them look like the pilot's own.
    const newContext = await signedInContext(await browser.newContext(), user.email, password);
    const me = (await (await newContext.request.get('/api/v1/me')).json()) as { person: unknown };
    expect(me.person).toBeNull();

    const newPage = newContext.pages()[0]!;
    const row = await findApprovedBookingRow(newPage, registration);
    await expect(row).toContainText('Occupato');
    await expect(row.getByTestId('booking-move-action')).toHaveCount(0);
    await expect(row.getByTestId('booking-cancel-action')).toHaveCount(0);
    // Nor on any other row of that page: this actor owns none of them.
    await expect(newPage.getByTestId('booking-cancel-action')).toHaveCount(0);

    await Promise.all([oldContext.close(), newContext.close()]);
  });
});
