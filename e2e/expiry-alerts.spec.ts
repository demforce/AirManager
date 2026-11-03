import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/expiry-alerts.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

// Story 6.3, Dev Notes: read from the environment, falling back to the
// `.env.example` dev value — same convention as `SEED_PASSWORD` above.
const JOBS_SECRET = process.env['JOBS_SECRET'] ?? 'dev-jobs-secret-change-me';

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

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

function uniqueTypeName(prefix: string): string {
  return `${prefix} ${uniqueSuffix()}`;
}

/** A day `days` from NOW (can be negative), `YYYY-MM-DD` UTC — same helper as `expiry-registration.spec.ts`. */
function addDaysUtc(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitSearchResult = { messages: MailpitMessageSummary[]; messages_count: number };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as `expiry-registration.spec.ts`/`expiry-types.spec.ts`. */
async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<MailpitFullMessage> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const searchResponse = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
    const searchBody = (await searchResponse.json()) as MailpitSearchResult;
    const found = searchBody.messages.find((message) => message.Subject.includes(subjectIncludes));

    if (found) {
      const messageResponse = await fetch(`${MAILPIT_API}/message/${found.ID}`);
      return (await messageResponse.json()) as MailpitFullMessage;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

/**
 * Polls for a Mailpit message to `to` whose BODY contains `textIncludes`
 * (review 6.3 F1: digest assertions must be scoped to a run-unique needle in
 * the CONTENT — the digest subject is fixed and the staff mailbox is polluted
 * by every other run of this file and by concurrent job calls).
 */
async function waitForMailpitMessageWithText(to: string, textIncludes: string, timeoutMs = 15_000): Promise<MailpitFullMessage> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const query = `to:${to} "${textIncludes}"`;
    const searchResponse = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(query)}`);
    const searchBody = (await searchResponse.json()) as MailpitSearchResult;
    const candidate = searchBody.messages[0];

    if (candidate) {
      const messageResponse = await fetch(`${MAILPIT_API}/message/${candidate.ID}`);
      const message = (await messageResponse.json()) as MailpitFullMessage;
      if (message.Text.includes(textIncludes)) {
        return message;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No Mailpit message to "${to}" containing "${textIncludes}" within ${timeoutMs}ms`);
}

/** Counts every Mailpit message to `to` right now (no polling — used to assert a count did NOT change, AC 2). */
async function countMailpitMessagesTo(to: string): Promise<number> {
  const searchResponse = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
  const searchBody = (await searchResponse.json()) as MailpitSearchResult;
  return searchBody.messages.length;
}

/** Creates a person via the admin API with a run-unique email (needed for the holder alert to be sent at all). */
async function createPersonWithEmail(page: Page, prefix: string): Promise<{ id: string; email: string }> {
  const email = uniqueEmail(prefix);
  const response = await page.request.post('/api/v1/people', {
    data: { firstName: prefix, lastName: `Alert-${uniqueSuffix()}`, email },
  });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return { id: created.id, email };
}

/** Creates a run-unique, always-usable (scope `ALL`) expiry type via the admin API. */
async function createExpiryType(page: Page): Promise<{ id: string; name: string }> {
  const name = uniqueTypeName('Tipo alert');
  const response = await page.request.post('/api/v1/expiry-types', { data: { name, scope: 'ALL' } });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return { id: created.id, name };
}

async function callJob(request: APIRequestContext, bearer?: string): Promise<{ status: number; body: unknown }> {
  const response = await request.post('/api/v1/jobs/expiry-alerts', {
    headers: bearer !== undefined ? { authorization: bearer } : {},
  });
  return { status: response.status(), body: await response.json() };
}

test.describe('Automatic expiry alert emails, idempotent job (Story 6.3, AC 1/2, FR-37, AD-9)', () => {
  test('a scadenza due in 7 days triggers a holder alert email; a second identical run creates no new alert and no duplicate email; the bearer guard rejects missing/wrong tokens', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const person = await createPersonWithEmail(page, 'Bearer');
    const expiryType = await createExpiryType(page);

    const registerResponse = await page.request.post('/api/v1/expiries', {
      data: { personId: person.id, expiryTypeId: expiryType.id, expiresAt: addDaysUtc(7) },
    });
    expect(registerResponse.status()).toBe(201);

    // AC 1: the bearer-protected job route runs and finds this scadenza.
    // NOTE (review 6.3 F1): the job-result counters are GLOBAL for one
    // invocation and race with concurrent tests/specs that also create due
    // expiries (a parallel job call may sweep this one first, or this call
    // may sweep theirs) — so AC 1/AC 2 are asserted ONLY via the run-unique
    // Mailpit mailbox below, never via the counters.
    const firstRun = await callJob(page.request, `Bearer ${JOBS_SECRET}`);
    expect(firstRun.status).toBe(200);

    // The titolare actually received ONE email, in their language, naming
    // the expiry type — filtered by the run-unique recipient address (the
    // DB/Mailpit are dirty from every other e2e spec).
    const holderEmail = await waitForMailpitMessage(person.email, expiryType.name);
    expect(holderEmail.Text).toContain(expiryType.name);

    const messageCountAfterFirstRun = await countMailpitMessagesTo(person.email);
    expect(messageCountAfterFirstRun).toBe(1);

    // AC 2: an identical second run is a complete no-op FOR THIS EXPIRY —
    // the Mailpit count for this run-unique recipient is UNCHANGED (no
    // duplicate). The global counters are deliberately NOT asserted (F1).
    const secondRun = await callJob(page.request, `Bearer ${JOBS_SECRET}`);
    expect(secondRun.status).toBe(200);

    const messageCountAfterSecondRun = await countMailpitMessagesTo(person.email);
    expect(messageCountAfterSecondRun).toBe(messageCountAfterFirstRun);

    // The AD-8 bearer guard: missing/wrong token -> 401, job never runs
    // (asserted indirectly — a run here would create no NEW alert anyway
    // since everything due was already consumed above, so the true guard is
    // the status code + envelope itself).
    const missingBearer = await callJob(page.request);
    expect(missingBearer.status).toBe(401);
    expect((missingBearer.body as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');

    const wrongBearer = await callJob(page.request, 'Bearer not-the-secret');
    expect(wrongBearer.status).toBe(401);
    expect((wrongBearer.body as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
  });

  test('a titolare with no email on file still has its thresholds consumed (no holder email, no crash) — the digest is the recovery net', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // No `email` given — the titolare has none on file. The run-unique last
    // name is the needle for the digest-content assertion below (F1: never
    // assert the global job counters).
    const lastName = `Alert-${uniqueSuffix()}`;
    const createResponse = await page.request.post('/api/v1/people', {
      data: { firstName: 'NoEmail', lastName },
    });
    expect(createResponse.status()).toBe(201);
    const person = (await createResponse.json()) as { id: string };

    const expiryType = await createExpiryType(page);
    const registerResponse = await page.request.post('/api/v1/expiries', {
      data: { personId: person.id, expiryTypeId: expiryType.id, expiresAt: addDaysUtc(7) },
    });
    expect(registerResponse.status()).toBe(201);

    const run = await callJob(page.request, `Bearer ${JOBS_SECRET}`);
    expect(run.status).toBe(200);

    // The digest (admin seed is always active, locale IT) is the recovery
    // net: whichever concurrent job invocation swept this expiry, exactly one
    // digest email names this run-unique person, flagged "senza email" —
    // asserted by CONTENT (F1: the staff mailbox is polluted by every run of
    // this file and the global result counters race with parallel tests).
    const digest = await waitForMailpitMessageWithText(ADMIN_EMAIL, lastName);
    expect(digest.Text).toContain(lastName);
    expect(digest.Text).toContain('senza email');
  });
});

test.describe('Session-authenticated trigger (Story 12.11, AC 3; ratifica utente 4) — reuses the SAME idempotent job, cron route untouched', () => {
  test('ADMIN triggers a run via the session route and gets the job counts back; a re-run right after is a no-op for the SAME expiry (idempotent, mirrors the cron route)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const person = await createPersonWithEmail(page, 'SessionTrigger');
    const expiryType = await createExpiryType(page);
    const registerResponse = await page.request.post('/api/v1/expiries', {
      data: { personId: person.id, expiryTypeId: expiryType.id, expiresAt: addDaysUtc(7) },
    });
    expect(registerResponse.status()).toBe(201);

    const firstRun = await page.request.post('/api/v1/expiry-alerts/trigger');
    expect(firstRun.status()).toBe(200);
    const firstBody = (await firstRun.json()) as { holderEmailsSent: number; digestEmailsSent: number };
    expect(typeof firstBody.holderEmailsSent).toBe('number');

    const holderEmail = await waitForMailpitMessage(person.email, expiryType.name);
    expect(holderEmail.Text).toContain(expiryType.name);
    const countAfterFirst = await countMailpitMessagesTo(person.email);
    expect(countAfterFirst).toBe(1);

    // Idempotent re-run: no NEW email for this same recipient/expiry.
    const secondRun = await page.request.post('/api/v1/expiry-alerts/trigger');
    expect(secondRun.status()).toBe(200);
    const countAfterSecond = await countMailpitMessagesTo(person.email);
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  test('the session trigger is gated settings.manage — a non-admin actor gets 403; the bearer cron endpoint stays untouched (still needs the secret, not a session)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    // Ratifica utente 4: the "Invia promemoria" button is visible ONLY to ADMIN.
    await page.goto('/it/dashboard/expiries');
    await expect(page.getByTestId('scadenze-send-reminders-button')).toHaveCount(0);

    const forbidden = await page.request.post('/api/v1/expiry-alerts/trigger');
    expect(forbidden.status()).toBe(403);
    expect((await forbidden.json()).error.code).toBe('FORBIDDEN');

    // The cron route is untouched: a session cookie alone (no bearer) still answers 401.
    const cronViaSession = await page.request.post('/api/v1/jobs/expiry-alerts');
    expect(cronViaSession.status()).toBe(401);
  });
});
