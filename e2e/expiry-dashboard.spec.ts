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

/** Creates a run-unique, always-usable (scope `ALL`) expiry type via the admin API and returns its id/name — same pattern as `expiry-registration.spec.ts`. */
async function createExpiryType(page: Page, scope: 'ALL' | 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' = 'ALL'): Promise<{ id: string; name: string }> {
  const name = uniqueTypeName('Tipo dashboard');
  const response = await page.request.post('/api/v1/expiry-types', { data: { name, scope } });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return { id: created.id, name };
}

/** Creates a person via the admin API (mirrors `expiry-registration.spec.ts#createPilotPerson`) with an ACTIVE pilot profile — needed for a non-`ALL`-scope registration (`assertScopeCompatible`). */
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

test.describe('Expiry dashboard: urgency ordering, filters, home widget (Story 6.4, AC 1/2, FR-38)', () => {
  test('staff (admin) registers 3 run-unique scadenze across the 3 status bands; the dashboard orders them by urgency with the right badges, and type/status/scope filters narrow correctly; a person link opens the scheda', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // Scope `PILOTS` (not `ALL`) so the ambito filter test below is
    // meaningful: `scope` filters on the TYPE's ambito, never the person's
    // profile — `assertScopeCompatible` still requires each person to hold
    // an ACTIVE pilot profile to register against it.
    const type = await createExpiryType(page, 'PILOTS');

    const okPerson = uniquePerson('Ok');
    const expiringPerson = uniquePerson('Expiring');
    const expiredPerson = uniquePerson('Expired');

    const okPersonId = await createPilotPerson(page, okPerson);
    const expiringPersonId = await createPilotPerson(page, expiringPerson);
    const expiredPersonId = await createPilotPerson(page, expiredPerson);

    await registerExpiry(page, { personId: okPersonId, expiryTypeId: type.id, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(120) });
    await registerExpiry(page, {
      personId: expiringPersonId,
      expiryTypeId: type.id,
      issuedAt: addDaysUtc(0),
      expiresAt: addDaysUtc(30),
    });
    await registerExpiry(page, {
      personId: expiredPersonId,
      expiryTypeId: type.id,
      issuedAt: addDaysUtc(-1000),
      expiresAt: addDaysUtc(-10),
    });

    // AC 1: the "Tutte le scadenze" dashboard, filtered by the run-unique
    // type (isolation on a dirty DB) — 3 rows, ORDERED expired -> expiring
    // -> ok (urgency first), each with the matching colored badge.
    await page.goto(`/it/dashboard/expiries?expiryTypeId=${type.id}`);
    await expect(page.getByRole('heading', { name: 'Tutte le scadenze' })).toBeVisible();

    const rows = page.getByTestId('expiry-dashboard-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(expiredPerson.lastName);
    await expect(rows.nth(0).getByTestId('expiry-dashboard-status-badge')).toHaveText('Scaduta');
    await expect(rows.nth(1)).toContainText(expiringPerson.lastName);
    await expect(rows.nth(1).getByTestId('expiry-dashboard-status-badge')).toHaveText('In scadenza');
    await expect(rows.nth(2)).toContainText(okPerson.lastName);
    await expect(rows.nth(2).getByTestId('expiry-dashboard-status-badge')).toHaveText('In regola');

    // AC 1: status filter (+ the same run-unique type) -> only the red row.
    await page.goto(`/it/dashboard/expiries?expiryTypeId=${type.id}&status=expired`);
    const expiredOnlyRows = page.getByTestId('expiry-dashboard-row');
    await expect(expiredOnlyRows).toHaveCount(1);
    await expect(expiredOnlyRows.first()).toContainText(expiredPerson.lastName);
    await expect(expiredOnlyRows.first().getByTestId('expiry-dashboard-status-badge')).toHaveText('Scaduta');

    // AC 1: ambito filter is on the TYPE's scope (PILOTS here), never the
    // person — a MISMATCHED scope + the same type filter yields zero rows;
    // the MATCHING scope yields all 3 again (filters combine in AND).
    await page.goto(`/it/dashboard/expiries?expiryTypeId=${type.id}&scope=STUDENTS`);
    await expect(page.getByTestId('expiry-dashboard-row')).toHaveCount(0);
    await expect(page.getByText('Nessuna scadenza registrata.')).toBeVisible();

    await page.goto(`/it/dashboard/expiries?expiryTypeId=${type.id}&scope=PILOTS`);
    await expect(page.getByTestId('expiry-dashboard-row')).toHaveCount(3);

    // AC 1: the persona link opens the scheda persona.
    await page.goto(`/it/dashboard/expiries?expiryTypeId=${type.id}&status=expired`);
    await page.getByTestId('expiry-dashboard-row').first().getByRole('link', { name: new RegExp(expiredPerson.lastName) }).click();
    await expect(page).toHaveURL(new RegExp(`/it/dashboard/people/${expiredPersonId}$`));
    await expect(page.getByRole('heading', { name: new RegExp(expiredPerson.lastName) })).toBeVisible();
  });

  test('AC 2: a scadenza registered for the seed pilot shows in their home widget with the right badge; the admin home shows no widget; a pilot cannot GET /api/v1/expiries', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // Admin's own home: `expiries.manage` holders never see the widget
    // (Contesto's asymmetric-tile rule — staff has the real dashboard).
    await page.goto('/it/dashboard');
    await expect(page.getByTestId('my-expiries-widget')).toHaveCount(0);

    const pilotPersonId = await getSeedPilotPersonId(page);
    const type = await createExpiryType(page, 'ALL');
    await registerExpiry(page, { personId: pilotPersonId, expiryTypeId: type.id, issuedAt: addDaysUtc(0), expiresAt: addDaysUtc(30) });

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const widget = page.getByTestId('my-expiries-widget');
    await expect(widget).toBeVisible();
    await expect(widget.getByText('Le mie scadenze', { exact: true })).toBeVisible();

    const widgetRow = page.getByTestId('my-expiries-widget-row').filter({ hasText: type.name });
    await expect(widgetRow).toBeVisible();
    await expect(widgetRow.getByTestId('my-expiries-widget-badge')).toHaveText('In scadenza');

    await page.getByRole('link', { name: 'Tutte le mie scadenze' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/expiries$/);
    await expect(page.getByRole('heading', { name: 'Le mie scadenze' })).toBeVisible();

    // A pilot (no `expiries.manage`) cannot reach the staff dashboard endpoint.
    const forbiddenResponse = await page.request.get('/api/v1/expiries');
    expect(forbiddenResponse.status()).toBe(403);
    expect((await forbiddenResponse.json()).error.code).toBe('FORBIDDEN');
  });

  test('AC 1: expiryTypeId filter for an id that does not exist yields an empty page (a filter, never a lookup)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.goto('/it/dashboard/expiries?expiryTypeId=nonexistent-type-id');
    await expect(page.getByRole('heading', { name: 'Tutte le scadenze' })).toBeVisible();
    await expect(page.getByTestId('expiry-dashboard-row')).toHaveCount(0);
    await expect(page.getByText('Nessuna scadenza registrata.')).toBeVisible();
  });

  test('a self-service actor (no expiries.manage) reaching /dashboard/expiries sees the own-access face, never the staff dashboard', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.goto('/it/dashboard/expiries');
    await expect(page.getByRole('heading', { name: 'Tutte le scadenze' })).toHaveCount(0);
    await expect(page.getByTestId('expiry-dashboard-filters')).toHaveCount(0);
  });
});
