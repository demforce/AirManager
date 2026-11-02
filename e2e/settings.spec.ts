// This spec writes GLOBAL AppSetting rows (club, METAR, membership fee,
// currency, `sched.*`, SMTP, treasury) and runs in the `settings` Playwright
// project, serialized AFTER the main `chromium` project (playwright.config.ts)
// so its writes never race a concurrent booking create elsewhere. Every key it
// writes is restored in `afterAll`. Running this file alone locally:
// `npx playwright test settings.spec.ts --no-deps` (otherwise Playwright
// first runs the `chromium` dependency project).
//
// Story 19.8: the page has ONE "Salva" (`settings-save`) and ONE request,
// `PATCH /api/v1/settings` — every assertion on a write reads THAT request
// and its answer (same request, no window for another spec's writer on the
// same global keys: the reason the 12.11 tests asserted the PUT responses).
import { expect, test } from '@playwright/test';
import type { Browser, Page, Request } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/settings.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/** A page of its own for a second actor, closed by the caller. */
async function pageAs(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginExpectingDashboard(page, email);
  return page;
}

/**
 * Same hydration-race hardening as `bookings.spec.ts`'s
 * `gotoBookingsAndWaitForHydration`: a `.fill()` that lands BEFORE React
 * attaches its event listeners updates the DOM value but never reaches the
 * draft. Test-only hardening; no application code is touched.
 */
async function gotoSettingsAndWaitForHydration(page: Page): Promise<void> {
  await page.goto('/it/dashboard/settings');
  await page.waitForLoadState('networkidle');
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Every write the page sends to the API (`router.refresh()` RSC requests are not API calls). */
function trackApiWrites(page: Page): Request[] {
  const writes: Request[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/v1/')) writes.push(request);
  });
  return writes;
}

/** Clicks the Salva and returns the ONE `PATCH /api/v1/settings` it sent, with its answer. */
async function saveAndWait(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/v1/settings') && r.request().method() === 'PATCH'),
    page.getByTestId('settings-save').click(),
  ]);
  return { response, body: response.request().postDataJSON() as Record<string, unknown> };
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitSearchResult = { messages: MailpitMessageSummary[] };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as the other e2e specs. */
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

// `mode: 'serial'`: every test in this file writes GLOBAL `AppSetting` keys.
test.describe.configure({ mode: 'serial' });

/** Same permissive baseline as `booking-window.spec.ts`'s `PERMISSIVE_SCHEDULING`: a PUT has no unset, so restoring to a maximally permissive window is the only way to neutralize leftover state. */
const PERMISSIVE_SCHEDULING = { openTime: '00:00', closeTime: '23:59', minSlotMinutes: 30, turnaroundMinutes: 0, maxAdvanceDays: 3650 };

/**
 * The SMTP config that still reaches Mailpit — `localhost:1025`, the
 * `SMTP_HOST`/`SMTP_PORT` of `.env.example` the mailer would fall back to
 * anyway (and the one host the SSRF check exempts) — the ONLY values this
 * file ever saves, so every later email of the chain still arrives.
 */
const MAILPIT_SMTP = { host: 'localhost', port: 1025, security: 'NONE' as const, user: '' };

/**
 * A FIXED METAR station, never run-unique: the dashboard layout fetches the
 * METAR of the configured station on every page (`dashboard/layout.tsx`,
 * TD 19.7b-e: no timeout), cached 10 minutes per station — one fixed code
 * pays the upstream at most once per series. Restored to `''` in `afterAll`.
 */
const METAR_FOR_TESTS = 'LIZZ';

type Restore = { airfieldName: string; club: { icao: string; contactEmail: string }; annualFeeCents: number; currency: { minFlights: number; windowDays: number } };
let restore: Restore | null = null;

test.beforeAll(async ({ browser }) => {
  const page = await pageAs(browser, ADMIN_EMAIL);
  const [airfield, club, fee, currency] = await Promise.all([
    page.request.get('/api/v1/settings/airfield'),
    page.request.get('/api/v1/settings/club'),
    page.request.get('/api/v1/settings/membership-fee'),
    page.request.get('/api/v1/settings/currency'),
  ]);
  restore = {
    airfieldName: ((await airfield.json()) as { name: string }).name,
    club: (await club.json()) as Restore['club'],
    annualFeeCents: ((await fee.json()) as { annualFeeCents: number }).annualFeeCents,
    currency: (await currency.json()) as Restore['currency'],
  };
  await page.context().close();
});

test.afterAll(async ({ browser }) => {
  // Through the SINGLE routes (D-8), one key family each, read back where a GET exists.
  const page = await pageAs(browser, ADMIN_EMAIL);
  expect((await page.request.put('/api/v1/settings/scheduling', { data: PERMISSIVE_SCHEDULING })).status()).toBe(200);
  expect((await page.request.put('/api/v1/settings/metar-station', { data: { station: '' } })).status()).toBe(200);
  expect((await page.request.put('/api/v1/settings/treasury', { data: { openingCashCents: 0, openingBankCents: 0, openingDate: '2000-01-01' } })).status()).toBe(200);
  if (restore) {
    expect((await page.request.put('/api/v1/settings/airfield', { data: { name: restore.airfieldName } })).status()).toBe(200);
    expect((await page.request.put('/api/v1/settings/club', { data: restore.club })).status()).toBe(200);
    expect((await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents: restore.annualFeeCents } })).status()).toBe(200);
    expect((await page.request.put('/api/v1/settings/currency', { data: restore.currency })).status()).toBe(200);
    expect(await (await page.request.get('/api/v1/settings/currency')).json()).toEqual(restore.currency);
  }
  await page.context().close();
});

/** A run-unique, NON-blocking expiry type created through the single route (deleted by the caller). */
async function createExpiryType(page: Page, prefix: string, kind: 'RATING' | 'MEDICAL' = 'RATING'): Promise<{ id: string; name: string }> {
  const response = await page.request.post('/api/v1/expiry-types', { data: kind === 'RATING' ? { name: `${prefix} ${uniqueSuffix()}`, kind, scope: 'ALL', blocksBooking: false } : { name: `${prefix} ${uniqueSuffix()}`, kind } });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; name: string };
}

async function createCategory(page: Page, prefix: string): Promise<{ id: string; name: string }> {
  const response = await page.request.post('/api/v1/cash-categories', { data: { name: `${prefix}-${uniqueSuffix()}` } });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; name: string };
}

async function createCategoryWithMovement(page: Page, prefix: string): Promise<{ id: string; name: string }> {
  const category = await createCategory(page, prefix);
  const movement = await page.request.post('/api/v1/cash-movements', {
    data: { categoryId: category.id, amountCents: 1000, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
  });
  expect(movement.status()).toBe(201);
  return category;
}

test.describe('Impostazioni — PATCH /api/v1/settings, the composite contract (story 19.8, AC 1/3/5/6)', () => {
  test('redirects a non-ADMIN (pilot) actor away from /dashboard/settings', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await gotoSettingsAndWaitForHydration(page);
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });

  test('AC 1: a pilot and an instructor get 403 FORBIDDEN and nothing is written; shape 422s name the FULL path of the refused field', async ({ page, browser }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const feeBefore = ((await (await page.request.get('/api/v1/settings/membership-fee')).json()) as { annualFeeCents: number }).annualFeeCents;

    for (const email of [PILOT_EMAIL, INSTRUCTOR_EMAIL]) {
      const other = await pageAs(browser, email);
      const response = await other.request.patch('/api/v1/settings', { data: { membershipFee: { annualFeeCents: feeBefore + 4321 } } });
      expect(response.status(), email).toBe(403);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
      await other.context().close();
    }
    expect(((await (await page.request.get('/api/v1/settings/membership-fee')).json()) as { annualFeeCents: number }).annualFeeCents).toBe(feeBefore);

    const fieldErrorsOf = async (data: unknown): Promise<string[]> => {
      const response = await page.request.patch('/api/v1/settings', { data });
      expect(response.status()).toBe(422);
      const body = (await response.json()) as { error: { code: string; details: { fieldErrors: Record<string, string[]> } } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      return Object.keys(body.error.details.fieldErrors);
    };
    expect(await fieldErrorsOf({})).toEqual(['']);
    expect(await fieldErrorsOf({ smtp: { ...MAILPIT_SMTP, host: '127.0.0.1', from: 'X <x@example.com>' } })).toEqual(['smtp.host']);
    expect(await fieldErrorsOf({ scheduling: { ...PERMISSIVE_SCHEDULING, openTime: '20:00', closeTime: '08:00' } })).toEqual(['scheduling.closeTime']);
    expect(await fieldErrorsOf({ club: { icao: 'LIRB', contactEmail: 'not-an-email' } })).toEqual(['club.contactEmail']);
    expect(await fieldErrorsOf({ cashCategories: { create: [{ name: 'Doppia' }, { name: 'Doppia' }] } })).toEqual(['cashCategories.create.1.name']);
  });

  test('AC 3 (a): a refused row in the LAST list rolls back the scalar blocks saved before it — METAR and scheduling unchanged', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const existing = await createExpiryType(page, 'Atomicità');
    try {
      const metarBefore = await (await page.request.get('/api/v1/settings/metar-station')).json();
      const schedulingBefore = await (await page.request.get('/api/v1/settings/scheduling')).json();
      const minute = String(10 + Math.floor(Math.random() * 49));

      const response = await page.request.patch('/api/v1/settings', {
        data: {
          metarStation: { station: `Q${uniqueSuffix().slice(-3).replace(/[^a-z0-9]/gi, 'X')}` },
          scheduling: { openTime: `06:${minute}`, closeTime: `22:${minute}`, minSlotMinutes: 45, turnaroundMinutes: 5, maxAdvanceDays: 120 },
          expiryTypes: { create: [{ name: existing.name, kind: 'RATING', scope: 'ALL' }] },
        },
      });
      expect(response.status()).toBe(409);
      const body = (await response.json()) as { error: { code: string; details: { reason: string; item: unknown } } };
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.details.reason).toBe('NAME_TAKEN');
      expect(body.error.details.item).toEqual({ list: 'expiryTypes', op: 'create', index: 0 });

      expect(await (await page.request.get('/api/v1/settings/metar-station')).json()).toEqual(metarBefore);
      expect(await (await page.request.get('/api/v1/settings/scheduling')).json()).toEqual(schedulingBefore);
    } finally {
      await page.request.delete(`/api/v1/expiry-types/${existing.id}`);
    }
  });

  test('AC 3 (b)/(c): a category in use refused at delete leaves the new category uncreated and the fee unchanged; an update of a vanished row is a 409 NOT_FOUND', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const inUse = await createCategoryWithMovement(page, 'AtomInUso');
    const feeBefore = ((await (await page.request.get('/api/v1/settings/membership-fee')).json()) as { annualFeeCents: number }).annualFeeCents;
    const newName = `AtomNuova-${uniqueSuffix()}`;

    const refused = await page.request.patch('/api/v1/settings', {
      data: { membershipFee: { annualFeeCents: feeBefore + 1234 }, cashCategories: { create: [{ name: newName }], delete: [inUse.id] } },
    });
    expect(refused.status()).toBe(409);
    const refusedBody = (await refused.json()) as { error: { details: { reason: string; item: { op: string; id: string } } } };
    expect(refusedBody.error.details.reason).toBe('IN_USE');
    expect(refusedBody.error.details.item).toEqual({ list: 'cashCategories', op: 'delete', index: 0, id: inUse.id });

    const categories = (await (await page.request.get('/api/v1/cash-categories?includeInactive=true')).json()) as { name: string }[];
    expect(categories.map((category) => category.name)).not.toContain(newName);
    expect(((await (await page.request.get('/api/v1/settings/membership-fee')).json()) as { annualFeeCents: number }).annualFeeCents).toBe(feeBefore);

    const metarBefore = await (await page.request.get('/api/v1/settings/metar-station')).json();
    const stale = await page.request.patch('/api/v1/settings', {
      data: { metarStation: { station: 'QSTL' }, expiryTypes: { update: [{ id: `missing-${uniqueSuffix()}`, isActive: false }] } },
    });
    expect(stale.status()).toBe(409);
    expect(((await stale.json()) as { error: { details: { reason: string } } }).error.details.reason).toBe('NOT_FOUND');
    expect(await (await page.request.get('/api/v1/settings/metar-station')).json()).toEqual(metarBefore);
  });

  test('AC 5: one PATCH creates, renames and deactivates types and categories; delete of a vanished id and isActive:false on an inactive category are no-ops; system category and in-use type refused', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const toRename = await createExpiryType(page, 'Da rinominare');
    const toDeactivate = await createExpiryType(page, 'Da disattivare', 'MEDICAL');
    const category = await createCategory(page, 'CatLista');
    const categoryToDelete = await createCategory(page, 'CatElimina');
    const createdType = `Creato ${uniqueSuffix()}`;
    const renamedType = `${toRename.name} bis`;
    const renamedCategory = `${category.name}-bis`;
    const createdCategory = `CatNuova-${uniqueSuffix()}`;
    const cleanup: Array<() => Promise<unknown>> = [];

    try {
      const response = await page.request.patch('/api/v1/settings', {
        data: {
          expiryTypes: {
            create: [{ name: createdType, kind: 'RATING', scope: 'STUDENTS', blocksBooking: false, validityMonths: 12 }],
            update: [
              { id: toRename.id, name: renamedType },
              { id: toDeactivate.id, isActive: false },
            ],
          },
          cashCategories: { create: [{ name: createdCategory }], update: [{ id: category.id, name: renamedCategory, isActive: false }], delete: [categoryToDelete.id] },
        },
      });
      expect(response.status()).toBe(200);
      const snapshot = (await response.json()) as {
        expiryTypes: { id: string; name: string; isActive: boolean; scope: string; validityMonths: number | null }[];
        cashCategories: { id: string; name: string; isActive: boolean }[];
      };
      const created = snapshot.expiryTypes.find((type) => type.name === createdType);
      expect(created).toMatchObject({ scope: 'STUDENTS', validityMonths: 12, isActive: true });
      cleanup.push(() => page.request.delete(`/api/v1/expiry-types/${created!.id}`));
      expect(snapshot.expiryTypes.find((type) => type.id === toRename.id)?.name).toBe(renamedType);
      expect(snapshot.expiryTypes.find((type) => type.id === toDeactivate.id)?.isActive).toBe(false);
      expect(snapshot.cashCategories.find((item) => item.id === category.id)).toMatchObject({ name: renamedCategory, isActive: false });
      expect(snapshot.cashCategories.some((item) => item.id === categoryToDelete.id)).toBe(false);
      const createdCat = snapshot.cashCategories.find((item) => item.name === createdCategory);
      expect(createdCat).toBeDefined();
      cleanup.push(() => page.request.delete(`/api/v1/cash-categories/${createdCat!.id}`));

      // No-ops: the row already gone, the category already inactive.
      const noOps = await page.request.patch('/api/v1/settings', {
        data: { cashCategories: { delete: [categoryToDelete.id], update: [{ id: category.id, isActive: false }] } },
      });
      expect(noOps.status()).toBe(200);

      // "Delete X and create a new X" in one save.
      const recreate = await page.request.patch('/api/v1/settings', { data: { cashCategories: { delete: [category.id], create: [{ name: renamedCategory }] } } });
      expect(recreate.status()).toBe(200);
      const recreated = ((await recreate.json()) as { cashCategories: { id: string; name: string }[] }).cashCategories.find((item) => item.name === renamedCategory);
      expect(recreated?.id).not.toBe(category.id);
      cleanup.push(() => page.request.delete(`/api/v1/cash-categories/${recreated!.id}`));

      // The system category keeps its name.
      const categories = (await (await page.request.get('/api/v1/cash-categories?includeInactive=true')).json()) as { id: string; name: string }[];
      const ricariche = categories.find((item) => item.name === 'Ricariche')!;
      const system = await page.request.patch('/api/v1/settings', { data: { cashCategories: { update: [{ id: ricariche.id, name: 'Ricariche-x' }] } } });
      expect(system.status()).toBe(409);
      expect(((await system.json()) as { error: { code: string; details: { reason: string } } }).error).toMatchObject({ code: 'CONFLICT', details: { reason: 'SYSTEM_CATEGORY' } });

      // A type with a recorded scadenza is in use.
      const person = await page.request.post('/api/v1/people', { data: { firstName: 'Composito', lastName: `InUso-${uniqueSuffix()}` } });
      expect(person.status()).toBe(201);
      const personId = ((await person.json()) as { id: string }).id;
      expect((await page.request.post('/api/v1/expiries', { data: { personId, expiryTypeId: toRename.id, expiresAt: '2099-01-01' } })).status()).toBe(201);
      const inUse = await page.request.patch('/api/v1/settings', { data: { expiryTypes: { delete: [toRename.id] } } });
      expect(inUse.status()).toBe(409);
      expect(((await inUse.json()) as { error: { details: { reason: string; item: unknown } } }).error.details).toEqual({ reason: 'IN_USE', item: { list: 'expiryTypes', op: 'delete', index: 0, id: toRename.id } });
      await page.request.patch(`/api/v1/expiry-types/${toRename.id}`, { data: { isActive: false } });
      await page.request.post(`/api/v1/people/${personId}/archive`);
    } finally {
      for (const run of cleanup) await run();
      await page.request.delete(`/api/v1/expiry-types/${toDeactivate.id}`);
      await page.request.delete(`/api/v1/expiry-types/${toRename.id}`);
    }
  });

  test('AC 6/17: the 200 is the whole snapshot — no password ever, hasPassword after a save with one, no membership type; the page shows the same values', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const from = `AirManager Test ${uniqueSuffix()} <ops@example.com>`;
    const response = await page.request.patch('/api/v1/settings', { data: { smtp: { ...MAILPIT_SMTP, from, pass: 'a-secret-password' } } });
    expect(response.status()).toBe(200);
    const snapshot = (await response.json()) as Record<string, unknown> & { smtp: Record<string, unknown>; expiryTypes: { kind: string; name: string }[] };
    expect(Object.keys(snapshot).sort()).toEqual(['airfield', 'cashCategories', 'club', 'currency', 'expiryTypes', 'membershipFee', 'metarStation', 'scheduling', 'smtp', 'treasury']);
    expect(snapshot.smtp).not.toHaveProperty('pass');
    expect(snapshot.smtp).toMatchObject({ from, hasPassword: true });
    expect(snapshot.expiryTypes.some((type) => type.kind === 'MEMBERSHIP' || type.name === 'Quota associativa')).toBe(false);

    // A save WITHOUT pass keeps the stored one (P5).
    const keep = await page.request.patch('/api/v1/settings', { data: { smtp: { ...MAILPIT_SMTP, from } } });
    expect(((await keep.json()) as { smtp: { hasPassword: boolean } }).smtp.hasPassword).toBe(true);
    const getBody = (await (await page.request.get('/api/v1/settings/smtp')).json()) as Record<string, unknown>;
    expect(getBody).not.toHaveProperty('pass');

    await gotoSettingsAndWaitForHydration(page);
    await expect(page.getByTestId('smtp-from-input')).toHaveValue(from);
    await expect(page.getByTestId('smtp-pass-input')).toHaveValue('');
    await expect(page.getByTestId('smtp-pass-input')).toHaveAttribute('placeholder', 'Password già configurata');
  });
});

/** Every testid of the per-card saves and of the immediate-write lists that the single Salva retired (AD-8). */
const RETIRED_TESTIDS = [
  'club-settings-save', 'club-settings-feedback', 'club-membership-fee-input', 'airfield-settings-save', 'airfield-settings-feedback',
  'scheduling-settings-save', 'scheduling-settings-feedback', 'smtp-settings-save', 'smtp-settings-feedback', 'treasury-settings-save', 'treasury-settings-feedback',
  'rating-form-submit', 'medical-form-submit', 'cash-category-form-submit', 'rating-form-error', 'medical-form-error', 'cash-category-form-error',
  'ratings-feedback', 'medical-feedback', 'cash-categories-feedback', 'medical-scope-select',
];

test.describe('Impostazioni — one page, one Salva (story 19.8, AC 8-13, 16-17)', () => {
  test('AC 8: ONE button saves — the last child of the form, in the bar; none of the retired controls is left', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);

    await expect(page.getByTestId('settings-save')).toHaveCount(1);
    await expect(page.getByTestId('settings-save')).toHaveAttribute('type', 'submit');
    await expect(page.getByTestId('settings-save-bar').getByTestId('settings-save')).toHaveCount(1);
    expect(await page.getByTestId('settings-form').evaluate((form) => form.lastElementChild?.getAttribute('data-testid'))).toBe('settings-save-bar');
    await expect(page.getByRole('button', { name: 'Salva', exact: true })).toHaveCount(1);
    for (const testId of RETIRED_TESTIDS) await expect(page.getByTestId(testId), testId).toHaveCount(0);
    // Every other button of the page is a plain button: nothing else can submit the form.
    expect(await page.getByTestId('settings-form').locator('button[type="submit"]').count()).toBe(1);
  });

  test('AC 9: every section changed in one session, ONE request on one click, the toast, and after a reload everything is there', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const visit = await createExpiryType(page, 'Visita sessione', 'MEDICAL');
    const category = await createCategory(page, 'CatSessione');
    const suffix = uniqueSuffix();
    const ratingName = `Rating sessione ${suffix}`;
    const renamedCategory = `${category.name}-ok`;
    let createdRatingId: string | null = null;

    try {
      await gotoSettingsAndWaitForHydration(page);
      const writes = trackApiWrites(page);

      const fee = (20 + Math.floor(Math.random() * 70)).toFixed(2);
      const minFlights = String(2 + Math.floor(Math.random() * 5));
      await page.getByTestId('airfield-name-input').fill(`Aviosuperficie ${suffix}`);
      await page.getByTestId('club-icao-input').fill('LIZY');
      await page.getByTestId('club-contact-email-input').fill(`ops-${suffix}@example.com`);
      await page.getByTestId('club-metar-station-input').fill(METAR_FOR_TESTS);
      await page.getByTestId('membership-settings-fee-input').fill(fee);
      await page.getByTestId('currency-min-flights-input').fill(minFlights);
      await page.getByTestId('currency-window-days-input').fill('60');
      await page.getByTestId('scheduling-open-time-input').fill('06:30');
      await page.getByTestId('scheduling-close-time-input').fill('22:30');
      await page.getByTestId('smtp-host-input').fill(MAILPIT_SMTP.host);
      await page.getByTestId('smtp-port-input').fill(String(MAILPIT_SMTP.port));
      await page.getByTestId('smtp-security-select').selectOption(MAILPIT_SMTP.security);
      await page.getByTestId('smtp-from-input').fill(`Sessione ${suffix} <ops@example.com>`);
      await page.getByTestId('treasury-opening-cash-input').fill('12.34');
      await page.getByTestId('treasury-opening-bank-input').fill('56.78');
      await page.getByTestId('treasury-opening-date-input').fill('2000-01-01');
      await page.getByTestId('ratings-add-button').click();
      await page.getByTestId('rating-name-input').fill(ratingName);
      await page.getByTestId('rating-form-close').click();
      await page.getByTestId('medical-row').filter({ hasText: visit.name }).getByTestId('medical-toggle-button').click();
      await page.getByTestId('cash-category-row').filter({ hasText: category.name }).getByTestId('cash-category-rename-button').click();
      await page.getByTestId('cash-category-name-input').fill(renamedCategory);
      await page.getByTestId('cash-category-form-close').click();

      await expect(page.getByTestId('settings-dirty-summary')).toHaveText(
        'Modifiche non salvate: Club, Quota associativa, Currency, Pianificazione, Email (SMTP), Tesoreria, Ratings, Visite mediche, Categorie di cassa',
      );
      expect(writes).toHaveLength(0);

      const { response, body } = await saveAndWait(page);
      expect(response.status()).toBe(200);
      expect(Object.keys(body).sort()).toEqual(['airfield', 'cashCategories', 'club', 'currency', 'expiryTypes', 'membershipFee', 'metarStation', 'scheduling', 'smtp', 'treasury']);
      await expect(page.getByTestId('toast').filter({ hasText: 'Impostazioni salvate.' })).toBeVisible();
      await expect(page.getByTestId('settings-dirty-summary')).toHaveText('Nessuna modifica');
      await expect(page.getByTestId('settings-save')).toBeDisabled();
      expect(writes.map((request) => `${request.method()} ${new URL(request.url()).pathname}`)).toEqual(['PATCH /api/v1/settings']);
      const snapshot = (await response.json()) as { expiryTypes: { id: string; name: string }[] };
      createdRatingId = snapshot.expiryTypes.find((type) => type.name === ratingName)?.id ?? null;

      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('airfield-name-input')).toHaveValue(`Aviosuperficie ${suffix}`);
      await expect(page.getByTestId('club-icao-input')).toHaveValue('LIZY');
      await expect(page.getByTestId('club-contact-email-input')).toHaveValue(`ops-${suffix}@example.com`);
      await expect(page.getByTestId('club-metar-station-input')).toHaveValue(METAR_FOR_TESTS);
      await expect(page.getByTestId('membership-settings-fee-input')).toHaveValue(fee);
      await expect(page.getByTestId('currency-min-flights-input')).toHaveValue(minFlights);
      await expect(page.getByTestId('currency-window-days-input')).toHaveValue('60');
      await expect(page.getByTestId('scheduling-open-time-input')).toHaveValue('06:30');
      await expect(page.getByTestId('smtp-from-input')).toHaveValue(`Sessione ${suffix} <ops@example.com>`);
      await expect(page.getByTestId('treasury-opening-cash-input')).toHaveValue('12.34');
      await expect(page.getByTestId('rating-row').filter({ hasText: ratingName })).toHaveAttribute('data-state', 'saved');
      await expect(page.getByTestId('medical-row').filter({ hasText: visit.name })).toContainText('Disattivato');
      await expect(page.getByTestId('cash-category-row').filter({ hasText: renamedCategory })).toHaveCount(1);
    } finally {
      if (createdRatingId) await page.request.delete(`/api/v1/expiry-types/${createdRatingId}`);
      await page.request.delete(`/api/v1/expiry-types/${visit.id}`);
      await page.request.delete(`/api/v1/cash-categories/${category.id}`);
    }
  });

  test('AC 10: clean on arrival, dirty on a change, clean again when the value is typed back ("0" = "0.00"); the body carries ONLY the touched blocks', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);
    const save = page.getByTestId('settings-save');
    const summary = page.getByTestId('settings-dirty-summary');

    await expect(save).toBeDisabled();
    await expect(summary).toHaveText('Nessuna modifica');

    const feeInput = page.getByTestId('membership-settings-fee-input');
    const original = await feeInput.inputValue();
    await feeInput.fill(String(Number(original) + 5));
    await expect(save).toBeEnabled();
    await expect(summary).toHaveText('Modifiche non salvate: Quota associativa');
    await feeInput.fill(String(Number(original)));
    await expect(save).toBeDisabled();
    await expect(summary).toHaveText('Nessuna modifica');

    // Pressing Enter in a field of a clean page sends nothing (the default button is disabled — trap 7).
    const writes = trackApiWrites(page);
    await feeInput.press('Enter');
    await page.waitForTimeout(300);
    expect(writes).toHaveLength(0);

    await page.getByTestId('airfield-name-input').fill(`Aviosuperficie diff ${uniqueSuffix()}`);
    const windowInput = page.getByTestId('currency-window-days-input');
    await windowInput.fill((await windowInput.inputValue()) === '45' ? '46' : '45');
    const { response, body } = await saveAndWait(page);
    expect(response.status()).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['airfield', 'currency']);
    await expect(save).toBeDisabled();
    await expect(summary).toHaveText('Nessuna modifica');
  });

  test('AC 11 (a): a server-refused host marks the host, keeps the draft, saves nothing — the ICAO changed alongside is still the old one after a reload', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);
    const icaoBefore = await page.getByTestId('club-icao-input').inputValue();

    await page.getByTestId('club-icao-input').fill('LIZW');
    await page.getByTestId('smtp-host-input').fill('127.0.0.1');
    await page.getByTestId('smtp-port-input').fill('1025');
    await page.getByTestId('smtp-from-input').fill('Host rifiutato <ops@example.com>');
    const { response } = await saveAndWait(page);
    expect(response.status()).toBe(422);

    const host = page.getByTestId('smtp-host-input');
    await expect(host).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Host non valido: non può essere un indirizzo privato, locale o interno.')).toBeVisible();
    await expect(host).toBeFocused();
    await expect(page.getByTestId('settings-save-error')).toHaveText('Nulla è stato salvato: correggi i campi evidenziati.');
    await expect(page.getByTestId('club-icao-input')).toHaveValue('LIZW');
    await expect(host).toHaveValue('127.0.0.1');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('club-icao-input')).toHaveValue(icaoBefore);
  });

  test('AC 11 (b): a name taken AFTER the page loaded comes back as a 409 on the NEW row, and the METAR changed alongside is not saved', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);
    const metarBefore = await page.getByTestId('club-metar-station-input').inputValue();
    const taken = await createExpiryType(page, 'Preso dopo');

    try {
      await page.getByTestId('ratings-add-button').click();
      await page.getByTestId('rating-name-input').fill(taken.name);
      await page.getByTestId('rating-form-close').click();
      await page.getByTestId('club-metar-station-input').fill(metarBefore === 'QTKN' ? 'QTKM' : 'QTKN');
      const { response } = await saveAndWait(page);
      expect(response.status()).toBe(409);

      const newRow = page.locator('[data-testid="rating-row"][data-state="new"]');
      await expect(newRow.getByTestId('rating-row-error')).toHaveText('Esiste già un tipo con questo nome.');
      await expect(newRow.getByTestId('rating-row-error')).toBeFocused();

      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('club-metar-station-input')).toHaveValue(metarBefore);
    } finally {
      await page.request.delete(`/api/v1/expiry-types/${taken.id}`);
    }
  });

  test('AC 11 (c)/12: a malformed contact email and an empty airfield name are stopped by the client — zero requests, the message ONE node on the field', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);
    const writes = trackApiWrites(page);

    // The Club section: four fields, the email's hint, the METAR placeholder follows the ICAO on screen.
    await expect(page.getByTestId('club-settings-card').getByText('Riceve l\'email di prova SMTP.')).toBeVisible();
    await page.getByTestId('club-icao-input').fill('LIZV');
    await expect(page.getByTestId('club-metar-station-input')).toHaveAttribute('placeholder', 'LIZV');

    const email = page.getByTestId('club-contact-email-input');
    await email.fill('not-an-email');
    await page.getByTestId('airfield-name-input').fill('   ');
    await page.getByTestId('settings-save').click();

    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Inserisci un indirizzo email valido.')).toHaveCount(1);
    await expect(page.getByTestId('airfield-name-input')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('airfield-name-input')).toBeFocused();
    await page.waitForTimeout(300);
    expect(writes).toHaveLength(0);

    // Correcting the field clears its message.
    await email.fill('');
    await expect(email).toHaveAttribute('aria-invalid', 'false');
  });

  test('review F1: while the Salva is in flight the nine sections are read-only — an edit can no longer vanish when the answer becomes the new draft', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const fee = ((await (await page.request.get('/api/v1/settings/membership-fee')).json()) as { annualFeeCents: number }).annualFeeCents;
    await gotoSettingsAndWaitForHydration(page);

    // The PATCH is held until the in-flight page has been looked at.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/v1/settings', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      await held;
      return route.continue();
    });

    const nextFee = fee + 1000;
    const feeInput = page.getByTestId('membership-settings-fee-input');
    await feeInput.fill((nextFee / 100).toFixed(2));
    const answer = page.waitForResponse((r) => r.url().endsWith('/api/v1/settings') && r.request().method() === 'PATCH');
    await page.getByTestId('settings-save').click();

    await expect(page.getByTestId('settings-dirty-summary')).toHaveText('Salvataggio in corso…');
    await expect(page.getByTestId('settings-save')).toBeDisabled();
    // Fields, list actions and the test email of every section — nothing takes an edit the answer would overwrite.
    for (const testId of ['airfield-name-input', 'membership-settings-fee-input', 'currency-min-flights-input', 'scheduling-open-time-input', 'smtp-host-input', 'ratings-add-button', 'medical-add-button', 'cash-category-add-button', 'smtp-test-email-button']) {
      await expect(page.getByTestId(testId), testId).toBeDisabled();
    }

    release();
    expect((await answer).status()).toBe(200);
    await expect(page.getByTestId('settings-dirty-summary')).toHaveText('Nessuna modifica');
    await expect(feeInput).toBeEnabled();
    await expect(feeInput).toHaveValue((nextFee / 100).toFixed(2));
    // Editable again, and an edit is a change of its own.
    await feeInput.fill((fee / 100).toFixed(2));
    await expect(page.getByTestId('settings-dirty-summary')).toHaveText('Modifiche non salvate: Quota associativa');
  });

  test('review F5: a 422 on an SMTP field the client has no rule of its own for (user, password) marks THAT field and takes the focus', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);
    // Simulated (the inputs' own limit stops it, below): nothing reaches the database.
    await page.route('**/api/v1/settings', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input.', details: { fieldErrors: { 'smtp.user': ['Too big: expected string to have <=255 characters'] } } } }),
          })
        : route.fallback(),
    );

    await page.getByTestId('smtp-host-input').fill(MAILPIT_SMTP.host);
    await page.getByTestId('smtp-port-input').fill(String(MAILPIT_SMTP.port));
    await page.getByTestId('smtp-from-input').fill('Utente rifiutato <ops@example.com>');
    const user = page.getByTestId('smtp-user-input');
    await user.fill(`rifiutato-${uniqueSuffix()}`);
    await page.getByTestId('settings-save').click();

    await expect(user).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('smtp-settings-card').getByText('Valore non valido.')).toBeVisible();
    await expect(user).toBeFocused();
    await expect(page.getByTestId('settings-save-error')).toHaveText('Nulla è stato salvato: correggi i campi evidenziati.');

    // The schema's 255 is the inputs' own limit: the UI cannot produce that 422 any more.
    for (const testId of ['smtp-host-input', 'smtp-from-input', 'smtp-user-input', 'smtp-pass-input']) {
      await expect(page.getByTestId(testId), testId).toHaveAttribute('maxlength', '255');
    }
  });

  test('review F6: a name used in the OTHER expiry list, or held by the membership-fee type (listed nowhere), says so on the row', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const visit = await createExpiryType(page, 'Visita altra lista', 'MEDICAL');

    try {
      await gotoSettingsAndWaitForHydration(page);
      const newRow = page.locator('[data-testid="rating-row"][data-state="new"]');

      // The seed's membership-fee type: refused by the server, on the new row.
      await page.getByTestId('ratings-add-button').click();
      await page.getByTestId('rating-name-input').fill('Quota associativa');
      await page.getByTestId('rating-form-close').click();
      const { response } = await saveAndWait(page);
      expect(response.status()).toBe(409);
      expect(((await response.json()) as { error: { details: { reason: string } } }).error.details.reason).toBe('NAME_RESERVED');
      await expect(newRow.getByTestId('rating-row-error')).toHaveText('Questo nome è riservato alla quota associativa.');

      // A visit's name on a rating: stopped by the client, zero requests.
      const writes = trackApiWrites(page);
      await newRow.getByTestId('rating-edit-button').click();
      await page.getByTestId('rating-name-input').fill(visit.name);
      await page.getByTestId('rating-form-close').click();
      await page.getByTestId('settings-save').click();
      await expect(newRow.getByTestId('rating-row-error')).toHaveText("Questo nome è già usato da un tipo di scadenza nell'altra lista.");
      await page.waitForTimeout(300);
      expect(writes).toHaveLength(0);
    } finally {
      await page.request.delete(`/api/v1/expiry-types/${visit.id}`);
    }
  });

  test('AC 13: Quota associativa and Currency show what is saved, save in their own blocks, and stop out-of-range values on the field', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const currency = (await (await page.request.get('/api/v1/settings/currency')).json()) as { minFlights: number; windowDays: number };
    const fee = ((await (await page.request.get('/api/v1/settings/membership-fee')).json()) as { annualFeeCents: number }).annualFeeCents;
    await gotoSettingsAndWaitForHydration(page);

    await expect(page.getByTestId('membership-settings-fee-input')).toHaveValue((fee / 100).toFixed(2));
    await expect(page.getByTestId('currency-min-flights-input')).toHaveValue(String(currency.minFlights));
    await expect(page.getByTestId('currency-window-days-input')).toHaveValue(String(currency.windowDays));

    const writes = trackApiWrites(page);
    await page.getByTestId('currency-min-flights-input').fill('0');
    await page.getByTestId('currency-window-days-input').fill('3651');
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('currency-settings-card').getByText('Inserisci un numero intero da 1 a 99.')).toBeVisible();
    await expect(page.getByTestId('currency-settings-card').getByText('Inserisci un numero intero da 1 a 3650.')).toBeVisible();
    await page.waitForTimeout(300);
    expect(writes).toHaveLength(0);

    const nextFee = fee + 1500;
    // Values that differ from the saved ones whatever an earlier test left.
    const next = { minFlights: currency.minFlights === 3 ? 4 : 3, windowDays: currency.windowDays === 120 ? 121 : 120 };
    await page.getByTestId('currency-min-flights-input').fill(String(next.minFlights));
    await page.getByTestId('currency-window-days-input').fill(String(next.windowDays));
    await page.getByTestId('membership-settings-fee-input').fill((nextFee / 100).toFixed(2));
    const { response, body } = await saveAndWait(page);
    expect(response.status()).toBe(200);
    expect(body).toEqual({ membershipFee: { annualFeeCents: nextFee }, currency: next });
    expect(await response.json()).toMatchObject({ membershipFee: { annualFeeCents: nextFee }, currency: next });
    // The Scadenze "Quota associativa" action prefills from the same key.
    expect(await (await page.request.get('/api/v1/settings/membership-fee')).json()).toEqual({ annualFeeCents: nextFee });
  });

  test('AC 16/17: the test email waits for the Salva of SMTP and contact email, then sends through the SAVED mailer to the SAVED contact; the typed password goes out once and clears', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);
    const contactEmail = `smtp-test-${uniqueSuffix()}@example.com`;
    const testButton = page.getByTestId('smtp-test-email-button');

    await page.getByTestId('club-contact-email-input').fill(contactEmail);
    await expect(testButton).toBeDisabled();
    await expect(page.getByTestId('smtp-test-email-hint')).toHaveText('Salva le modifiche prima di inviare l\'email di prova.');

    await page.getByTestId('smtp-host-input').fill(MAILPIT_SMTP.host);
    await page.getByTestId('smtp-port-input').fill(String(MAILPIT_SMTP.port));
    await page.getByTestId('smtp-security-select').selectOption(MAILPIT_SMTP.security);
    await page.getByTestId('smtp-from-input').fill('AirManager Test <ops@example.com>');
    await page.getByTestId('smtp-user-input').fill('');
    await page.getByTestId('smtp-pass-input').fill('a-secret-password');
    const { response, body } = await saveAndWait(page);
    expect(response.status()).toBe(200);
    expect((body['smtp'] as Record<string, unknown>)['pass']).toBe('a-secret-password');
    expect(JSON.stringify(await response.json())).not.toContain('a-secret-password');
    await expect(page.getByTestId('smtp-pass-input')).toHaveValue('');
    await expect(page.getByTestId('smtp-pass-input')).toHaveAttribute('placeholder', 'Password già configurata');

    await expect(testButton).toBeEnabled();
    await expect(page.getByTestId('smtp-test-email-hint')).toHaveCount(0);

    // A draft in ANOTHER section does not block the test, and the test does not touch it.
    await page.getByTestId('currency-window-days-input').fill('77');
    await expect(testButton).toBeEnabled();
    const writes = trackApiWrites(page);
    await testButton.click();
    await expect(page.getByTestId('smtp-test-email-feedback')).toBeVisible();
    const testEmail = await waitForMailpitMessage(contactEmail, 'prova');
    expect(testEmail.Text.toLowerCase()).toContain('prova');
    expect(writes.map((request) => new URL(request.url()).pathname)).toEqual(['/api/v1/settings/smtp/test-email']);
    await expect(page.getByTestId('currency-window-days-input')).toHaveValue('77');

    // An SMTP change with the password left empty sends no `pass`, and the stored one stays.
    await page.getByTestId('smtp-from-input').fill('AirManager Test 2 <ops@example.com>');
    const second = await saveAndWait(page);
    expect(second.body['smtp']).not.toHaveProperty('pass');
    expect(((await second.response.json()) as { smtp: { hasPassword: boolean } }).smtp.hasPassword).toBe(true);
  });
});

/** Run-unique cash-category name — NEVER a seeded name (`Ricariche`/`Carburante`/`Assicurazione`/`Manutenzione`/`Utenze`/`Altro`, shared with `billing.spec.ts`/`cash-register.spec.ts`). */
function uniqueCategoryName(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}`;
}

/**
 * "Categorie di cassa" card (story 12.13 review, F2; story 19.8, D-7): a list
 * IN DRAFT — every change shows on the row and is written only by the Salva.
 * Not a global-settings write, but it lives on this page.
 */
test.describe('Impostazioni — Categorie di cassa in draft (story 12.13 review F2; story 19.8, AC 14)', () => {
  test('admin creates, renames, deactivates, reactivates and deletes a category — each step written by the Salva, none before it', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);
    const writes = trackApiWrites(page);
    const name = uniqueCategoryName('CategoriaE2E');

    await page.getByTestId('cash-category-add-button').click();
    await expect(page.getByTestId('cash-category-name-input')).toBeFocused();
    await page.getByTestId('cash-category-name-input').fill(name);
    const row = page.getByTestId('cash-category-row').filter({ hasText: name });
    await expect(row).toHaveAttribute('data-state', 'new');
    await expect(row).toContainText('Nuova');
    expect(writes).toHaveLength(0);
    let saved = await saveAndWait(page);
    expect(saved.body).toEqual({ cashCategories: { create: [{ name }] } });
    await expect(row).toHaveAttribute('data-state', 'saved');
    await expect(row).toContainText('Attiva');

    // A second category with the SAME name is stopped on the row, before any request.
    await page.getByTestId('cash-category-add-button').click();
    await page.getByTestId('cash-category-name-input').fill(name);
    await page.getByTestId('cash-category-form-close').click();
    const before = writes.length;
    await page.getByTestId('settings-save').click();
    const duplicate = page.locator('[data-testid="cash-category-row"][data-state="new"]');
    await expect(duplicate.getByTestId('cash-category-row-error')).toHaveText('Questo nome è già usato in questa lista.');
    await page.waitForTimeout(300);
    expect(writes.length).toBe(before);
    // "Elimina" on a NEW row simply drops it.
    await duplicate.getByTestId('cash-category-delete-button').click();
    await expect(page.locator('[data-testid="cash-category-row"][data-state="new"]')).toHaveCount(0);

    const renamedName = `${name}-rinominata`;
    await row.getByTestId('cash-category-rename-button').click();
    await page.getByTestId('cash-category-name-input').fill(renamedName);
    const rowAfterRename = page.getByTestId('cash-category-row').filter({ hasText: renamedName });
    await expect(rowAfterRename).toHaveAttribute('data-state', 'changed');
    saved = await saveAndWait(page);
    expect((saved.body['cashCategories'] as { update: unknown[] }).update).toEqual([expect.objectContaining({ name: renamedName })]);

    await rowAfterRename.getByTestId('cash-category-toggle-button').click();
    await expect(rowAfterRename).toContainText('Disattivata');
    await saveAndWait(page);
    await rowAfterRename.getByTestId('cash-category-toggle-button').click();
    await expect(rowAfterRename).toContainText('Attiva');
    await saveAndWait(page);

    await rowAfterRename.getByTestId('cash-category-delete-button').click();
    await expect(rowAfterRename).toHaveAttribute('data-state', 'removed');
    await expect(rowAfterRename.getByTestId('cash-category-delete-button')).toHaveText('Ripristina');
    saved = await saveAndWait(page);
    expect((saved.body['cashCategories'] as { delete: string[] }).delete).toHaveLength(1);
    await expect(page.getByTestId('cash-category-row').filter({ hasText: renamedName })).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('cash-category-row').filter({ hasText: renamedName })).toHaveCount(0);
  });

  test('deleting a category with recorded movements comes back from the Salva as a 409 on THAT row; the row is still there after a reload', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const category = await createCategoryWithMovement(page, 'CategoriaInUso');

    await gotoSettingsAndWaitForHydration(page);
    const row = page.getByTestId('cash-category-row').filter({ hasText: category.name });
    await row.getByTestId('cash-category-delete-button').click();
    const { response } = await saveAndWait(page);
    expect(response.status()).toBe(409);

    await expect(row.getByTestId('cash-category-row-error')).toHaveText('La categoria ha movimenti registrati e non può essere eliminata: disattivala invece.');
    await expect(row).toHaveAttribute('data-state', 'removed');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('cash-category-row').filter({ hasText: category.name })).toHaveAttribute('data-state', 'saved');
  });
});
