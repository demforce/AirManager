import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

/**
 * Public PPR request form (epic 8, story 8.1; FR-22, AC 1/2). Unlike every
 * other e2e spec in this suite, NONE of these tests log in — that is the
 * whole point of `/[locale]/ppr` (Dev Notes: "NIENTE login nei test del
 * form").
 *
 * **Run-unique fake IP per test** (Dev Notes): the per-IP rate limit
 * (`ppr.service.ts`) is DB-backed and this dev database is never reset
 * between runs, so a shared `x-forwarded-for` value across tests (or across
 * runs) would make the rate-limit test flaky and could even 429 an
 * unrelated happy-path test. `submitterIp` is a plain `TEXT` column with no
 * IP-format validation, so any unique string works as the header value —
 * `uniqueFakeIp()` below.
 */

const MAILPIT_API = 'http://localhost:8025/api/v1';

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueFakeIp(): string {
  return `e2e-ppr-${uniqueSuffix()}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@e2e.airmanager.local`;
}

/** Same polling pattern as `waitForMailpitMessage` in the other e2e specs. */
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

/**
 * The honeypot's negative case (AC 2): asserts NO message ever lands for
 * `to`. A short fixed wait (Dev Notes: "attesa NEGATIVA honeypot corta ~3s
 * per non gonfiare la suite") rather than the full 15s positive-poll
 * timeout — there is nothing to poll FOR, so a long wait would only slow
 * the suite down without adding confidence.
 */
async function expectNoMailpitMessage(to: string, waitMs = 3_000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const searchResponse = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
  const searchBody = (await searchResponse.json()) as { messages: MailpitMessageSummary[] };
  expect(searchBody.messages).toHaveLength(0);
}

/** `datetime-local` value (no timezone) for `hoursFromNow` from now, UTC (the browser context below pins `timezoneId: 'UTC'`). */
function futureDatetimeLocal(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** ISO 8601 UTC (AD-8 wire format) for `hoursFromNow` from now, for the direct-API tests. */
function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

const LABELS = {
  it: {
    firstName: 'Nome',
    lastName: 'Cognome',
    email: 'Email',
    phone: 'Telefono',
    aircraftRegistration: 'Marche',
    aircraftType: 'Tipo aeromobile',
    origin: 'Provenienza',
    destination: 'Destinazione',
    eta: 'ETA (arrivo previsto)',
    personsOnBoard: 'Persone a bordo',
    submit: 'Invia richiesta',
    receiptSubject: 'Richiesta PPR ricevuta',
  },
  en: {
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    aircraftRegistration: 'Registration',
    aircraftType: 'Aircraft type',
    origin: 'Origin',
    destination: 'Destination',
    eta: 'ETA (estimated arrival)',
    personsOnBoard: 'Persons on board',
    submit: 'Send request',
    receiptSubject: 'PPR request received',
  },
} as const;

type PprLocale = keyof typeof LABELS;

type PprFormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  aircraftRegistration: string;
  aircraftType: string;
  origin: string;
  destination: string;
  etaHoursFromNow: number;
  personsOnBoard: string;
};

/** Fills every required field of the public PPR form (`ppr-form.tsx`) via its locale-specific labels. */
async function fillPprForm(page: Page, locale: PprLocale, data: PprFormData): Promise<void> {
  const labels = LABELS[locale];
  await page.getByLabel(labels.firstName, { exact: true }).fill(data.firstName);
  await page.getByLabel(labels.lastName, { exact: true }).fill(data.lastName);
  await page.getByLabel(labels.email, { exact: true }).fill(data.email);
  await page.getByLabel(labels.phone, { exact: true }).fill(data.phone);
  await page.getByLabel(labels.aircraftRegistration, { exact: true }).fill(data.aircraftRegistration);
  await page.getByLabel(labels.aircraftType, { exact: true }).fill(data.aircraftType);
  await page.getByLabel(labels.origin, { exact: true }).fill(data.origin);
  await page.getByLabel(labels.destination, { exact: true }).fill(data.destination);
  await page.getByLabel(labels.eta, { exact: true }).fill(futureDatetimeLocal(data.etaHoursFromNow));
  await page.getByLabel(labels.personsOnBoard, { exact: true }).fill(data.personsOnBoard);
}

/** A fresh browser context with a run-unique fake `x-forwarded-for` and a pinned UTC timezone (so `futureDatetimeLocal`'s wall-clock math is deterministic regardless of the host's local timezone). */
async function newPprContext(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': uniqueFakeIp() },
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

const REQUIRED_API_FIELDS = {
  phone: '+39 333 0000000',
  aircraftType: 'Cessna 172',
  origin: 'AAAA',
  destination: 'BBBB',
  personsOnBoard: 1,
  locale: 'it' as const,
};

test.describe('Public PPR form (Story 8.1)', () => {
  test('IT: full submission from a not-authenticated visitor shows the confirmation view and a Mailpit receipt email in Italian (AC 1)', async ({
    browser,
  }) => {
    const { page, close } = await newPprContext(browser);
    try {
      await page.goto('/it/ppr');

      const email = uniqueEmail('ppr-it');
      await fillPprForm(page, 'it', {
        firstName: 'Giulia',
        lastName: 'Bianchi',
        email,
        phone: '+39 333 1234567',
        aircraftRegistration: `I-${uniqueSuffix().slice(-6).toUpperCase()}`,
        aircraftType: 'Cessna 172',
        origin: 'LIRN Napoli',
        destination: 'LIRU Urbe',
        etaHoursFromNow: 5,
        personsOnBoard: '2',
      });

      await page.getByRole('button', { name: LABELS.it.submit }).click();

      await expect(page.getByTestId('ppr-success')).toBeVisible();

      const message = await waitForMailpitMessage(email, LABELS.it.receiptSubject);
      expect(message.Text).toContain('Giulia');
      expect(message.Text).toContain('ETA:');
      expect(message.Text).toContain("Riceverai un'altra email");
    } finally {
      await close();
    }
  });

  test('EN: full submission shows the confirmation view and a Mailpit receipt email in English, in the SAME form locale (AC 1, NFR-1)', async ({
    browser,
  }) => {
    const { page, close } = await newPprContext(browser);
    try {
      await page.goto('/en/ppr');

      const email = uniqueEmail('ppr-en');
      await fillPprForm(page, 'en', {
        firstName: 'John',
        lastName: 'Smith',
        email,
        phone: '+44 7700 900123',
        aircraftRegistration: `G-${uniqueSuffix().slice(-6).toUpperCase()}`,
        aircraftType: 'Piper PA-28',
        origin: 'EGLL',
        destination: 'LIRU',
        etaHoursFromNow: 6,
        personsOnBoard: '1',
      });

      await page.getByRole('button', { name: LABELS.en.submit }).click();

      await expect(page.getByTestId('ppr-success')).toBeVisible();

      const message = await waitForMailpitMessage(email, LABELS.en.receiptSubject);
      expect(message.Text).toContain('John');
      expect(message.Text).toContain('ETA:');
      expect(message.Text).toContain('You will receive another email');
    } finally {
      await close();
    }
  });

  test('honeypot: a filled hidden "website" field still shows the confirmation view, but no receipt email is ever sent (AC 2)', async ({
    browser,
  }) => {
    const { page, close } = await newPprContext(browser);
    try {
      await page.goto('/it/ppr');

      const email = uniqueEmail('ppr-honeypot');
      await fillPprForm(page, 'it', {
        firstName: 'Bot',
        lastName: 'Spammer',
        email,
        phone: '0000000',
        aircraftRegistration: `I-${uniqueSuffix().slice(-6).toUpperCase()}`,
        aircraftType: 'Drone',
        origin: 'XXXX',
        destination: 'YYYY',
        etaHoursFromNow: 4,
        personsOnBoard: '1',
      });

      // Simulate a bot's generic autofill populating the hidden honeypot
      // (a real user's browser never does this — the field is off-screen,
      // `aria-hidden`, and out of the tab order, `ppr-form.tsx`). Setting
      // `.value` directly would go through React's own tracked setter
      // (installed on the DOM node to detect programmatic changes) and
      // leave its internal tracker in sync, so the subsequent 'input'
      // event would look like a no-op change and react-hook-form would
      // never see it. The native prototype setter bypasses that tracker,
      // so the following 'input' event is seen as a REAL change — the
      // same technique used for the interactive Playwright MCP
      // verification of this exact scenario during dev.
      await page.getByTestId('ppr-honeypot').evaluate((el: HTMLInputElement) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        nativeSetter.call(el, 'https://spam.example');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await page.getByRole('button', { name: LABELS.it.submit }).click();

      // Indistinguishable from a real success (AC 2: "respinta silenziosamente").
      await expect(page.getByTestId('ppr-success')).toBeVisible();

      await expectNoMailpitMessage(email);
    } finally {
      await close();
    }
  });

  test('rate limit: 6 direct POSTs from the same fake IP, the 6th answers 429 RATE_LIMITED (AC 2)', async ({ request }) => {
    const ip = uniqueFakeIp();
    let lastStatus = 0;
    let lastBody: unknown;

    for (let i = 0; i < 6; i += 1) {
      const response = await request.post('/api/v1/ppr-requests', {
        headers: { 'x-forwarded-for': ip },
        data: {
          ...REQUIRED_API_FIELDS,
          firstName: 'RateLimit',
          lastName: `Test${i}`,
          email: uniqueEmail(`ppr-ratelimit-${i}`),
          aircraftRegistration: `I-RL${i}${uniqueSuffix().slice(-4)}`,
          eta: futureIso(2),
        },
      });
      lastStatus = response.status();
      lastBody = await response.json();
    }

    expect(lastStatus).toBe(429);
    expect(lastBody).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });

  test('POST with an eta in the past answers 422 ETA_IN_PAST (AC 1)', async ({ request }) => {
    const response = await request.post('/api/v1/ppr-requests', {
      headers: { 'x-forwarded-for': uniqueFakeIp() },
      data: {
        ...REQUIRED_API_FIELDS,
        firstName: 'Past',
        lastName: 'Eta',
        email: uniqueEmail('ppr-past-eta'),
        aircraftRegistration: `I-PE${uniqueSuffix().slice(-4)}`,
        eta: new Date(Date.now() - 3_600_000).toISOString(),
      },
    });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: 'ETA_IN_PAST' } });
  });
});
