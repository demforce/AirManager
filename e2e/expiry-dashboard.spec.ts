import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/expiry-dashboard.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

function uniquePerson(prefix: string): { firstName: string; lastName: string } {
  return { firstName: prefix, lastName: `Dashboard-${uniqueSuffix()}` };
}

function uniqueTypeName(prefix: string): string {
  return `${prefix} ${uniqueSuffix()}`;
}

/** A day `days` from NOW (can be negative), `YYYY-MM-DD` UTC — same helper as `expiry-registration.spec.ts` (dates stay relative to actual test-run time, since computed status depends on real "today"). */
function addDaysUtc(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Creates a run-unique, always-usable (scope `ALL`) expiry type via the admin API and returns its id/name. */
async function createExpiryType(page: Page, scope: 'ALL' | 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' = 'ALL'): Promise<{ id: string; name: string }> {
  const name = uniqueTypeName('Tipo dashboard');
  const response = await page.request.post('/api/v1/expiry-types', { data: { name, scope } });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return { id: created.id, name };
}

/** Creates a person via the admin API with an ACTIVE pilot profile (mirrors `expiry-registration.spec.ts#createPilotPerson`). */
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

async function registerExpiry(
  page: Page,
  input: { personId: string; expiryTypeId: string; issuedAt: string; expiresAt: string },
): Promise<void> {
  const response = await page.request.post('/api/v1/expiries', { data: input });
  expect(response.status()).toBe(201);
}

/** Looks up the seed pilot's `Person.id` via the admin people search (same helper as `expiry-registration.spec.ts`). */
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

test.describe('Scadenze registry: AirOps registry, stat cards, segmented window, row tint, own-face (Story 12.11, AC 3)', () => {
  test('staff registers 3 run-unique scadenze across the 3 tiers; window=all orders by urgency with the right status badges and row tint; the type filter narrows; a person link opens the scheda', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const type = await createExpiryType(page, 'PILOTS');

    const okPerson = uniquePerson('Ok');
    const within30Person = uniquePerson('Within30');
    const expiredPerson = uniquePerson('Expired');

    const okPersonId = await createPilotPerson(page, okPerson);
    const within30PersonId = await createPilotPerson(page, within30Person);
    const expiredPersonId = await createPilotPerson(page, expiredPerson);

    await registerExpiry(page, { personId: okPersonId, expiryTypeId: type.id, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(120) });
    await registerExpiry(page, { personId: within30PersonId, expiryTypeId: type.id, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(20) });
    await registerExpiry(page, { personId: expiredPersonId, expiryTypeId: type.id, issuedAt: addDaysUtc(-1000), expiresAt: addDaysUtc(-10) });

    // window=all (the default ≤60g window would exclude the +120d "ok" row) + the run-unique type filter (isolation on a dirty DB).
    await page.goto(`/it/dashboard/expiries?window=all&expiryTypeId=${type.id}`);
    await expect(page.getByRole('heading', { name: 'Scadenze', level: 1 })).toBeVisible();

    const rows = page.getByTestId('scadenze-row');
    await expect(rows).toHaveCount(3);
    // Ordered expired -> within60(30d here) -> ok (urgency first, expiresAt asc).
    await expect(rows.nth(0)).toContainText(expiredPerson.lastName);
    await expect(rows.nth(0).getByTestId('scadenze-status-badge')).toHaveText('Scaduto');
    await expect(rows.nth(1)).toContainText(within30Person.lastName);
    await expect(rows.nth(1).getByTestId('scadenze-status-badge')).toHaveText('≤ 30 giorni');
    await expect(rows.nth(2)).toContainText(okPerson.lastName);
    await expect(rows.nth(2).getByTestId('scadenze-status-badge')).toHaveText('Valido');

    // Row tint: the expired row's background is a non-transparent tint (Contesto: `TIER_ROW_TINT`).
    const expiredRowBg = await rows.nth(0).evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(expiredRowBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(expiredRowBg).not.toBe('transparent');

    // The persona link opens the scheda.
    await rows.nth(0).getByRole('link', { name: new RegExp(expiredPerson.lastName) }).click();
    await expect(page).toHaveURL(new RegExp(`/it/dashboard/people/${expiredPersonId}$`));
    await expect(page.getByRole('heading', { name: new RegExp(expiredPerson.lastName) })).toBeVisible();
  });

  test('the default segmented window (≤60g) excludes a scadenza far in the future; the "Tutte" segment shows it; the type filter is AND-combined with the window', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const type = await createExpiryType(page, 'ALL');
    const person = uniquePerson('FarFuture');
    const personId = await createPilotPerson(page, person);
    await registerExpiry(page, { personId, expiryTypeId: type.id, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(200) });

    await page.goto(`/it/dashboard/expiries?expiryTypeId=${type.id}`);
    await expect(page.getByTestId('scadenze-row')).toHaveCount(0);
    await expect(page.getByText('Nulla in questa finestra.')).toBeVisible();

    await page.getByTestId('scadenze-window-all').click();
    await expect(page).toHaveURL(/window=all/);
    const rows = page.getByTestId('scadenze-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(person.lastName);
  });

  test('stat cards are GLOBAL counts, unaffected by the table\'s own type/window filters', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const type = await createExpiryType(page, 'ALL');
    const person = uniquePerson('StatCard');
    const personId = await createPilotPerson(page, person);
    await registerExpiry(page, { personId, expiryTypeId: type.id, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(3) });

    await page.goto('/it/dashboard/expiries');
    const before = await page.getByTestId('scadenze-stat-within7').locator('.kpi-value').innerText();

    // Filtering the TABLE by an unrelated type must not change the stat card count.
    await page.goto(`/it/dashboard/expiries?expiryTypeId=nonexistent-type-id`);
    const after = await page.getByTestId('scadenze-stat-within7').locator('.kpi-value').innerText();
    expect(after).toBe(before);
  });

  test('AC 2: a scadenza registered for the seed pilot shows in their home widget; navigating to "Tutte le mie scadenze" lands on the own-face heading; a pilot cannot GET /api/v1/expiries (staff-only)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.goto('/it/dashboard');
    await expect(page.getByTestId('my-expiries-widget')).toHaveCount(0);

    const pilotPersonId = await getSeedPilotPersonId(page);
    const type = await createExpiryType(page, 'ALL');
    await registerExpiry(page, { personId: pilotPersonId, expiryTypeId: type.id, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(30) });

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const widget = page.getByTestId('my-expiries-widget');
    await expect(widget).toBeVisible();

    await page.getByRole('link', { name: 'Tutte le mie scadenze' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/expiries$/);
    await expect(page.getByRole('heading', { name: 'Le mie scadenze' })).toBeVisible();

    const forbiddenResponse = await page.request.get('/api/v1/expiries');
    expect(forbiddenResponse.status()).toBe(403);
    expect((await forbiddenResponse.json()).error.code).toBe('FORBIDDEN');
  });

  test('expiryTypeId filter for an id that does not exist yields an empty page (a filter, never a lookup)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.goto('/it/dashboard/expiries?window=all&expiryTypeId=nonexistent-type-id');
    await expect(page.getByRole('heading', { name: 'Scadenze', level: 1 })).toBeVisible();
    await expect(page.getByTestId('scadenze-row')).toHaveCount(0);
  });

  test('a self-service actor (no expiries.manage) reaching /dashboard/expiries sees the own-access face, never the staff registry', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.goto('/it/dashboard/expiries');
    await expect(page.getByRole('heading', { name: 'Le mie scadenze' })).toBeVisible();
    await expect(page.getByTestId('scadenze-row')).toHaveCount(0);
  });
});
