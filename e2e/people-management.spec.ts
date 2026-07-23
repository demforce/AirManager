import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/people-management.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Pilots registry (story 12.6; rebuilt from the legacy `/dashboard/people`
 * list, story 2.1). Behavioral assertions (409/403/401 envelopes) are
 * UNCHANGED; UI-structural ones are rewritten onto the new AirOps
 * table/slide-over shape (Dev Notes: same "riscritti sui nuovi selettori"
 * convention as `aircraft-management.spec.ts`, story 12.5 — testids renamed
 * from `people-*` to the new component's own `pilots-*`/`pilot-*` set). The
 * RBAC redirect check now targets `/dashboard/pilots` (AC 7).
 */

/** Login that must succeed: waits for the dashboard redirect so the session
 * cookie is in place before the test navigates elsewhere. `admin` also holds
 * `people.manage`/`people.read` (ADMIN gets every permission, story 1.3), so
 * it exercises the same staff-only perimeter the story's AC 2/3 describe. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniquePerson(prefix: string): { firstName: string; lastName: string; email: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    firstName: prefix,
    lastName: `Test-${suffix}`,
    email: `${prefix.toLowerCase()}-${suffix}@airmanager.local`,
  };
}

/** Search-scoped row locator (the table is paginated 20/page, ordered by lastName — a fresh run-unique person can sort past page 1 on an accumulated DB, same T0 lesson as the legacy spec). */
function rowFor(page: Page, lastName: string) {
  return page.locator('[data-testid^="pilot-row-"]').filter({ hasText: lastName });
}

/** Creates a pilot via the "Aggiungi pilota" slide-over (story 12.6, AC 4's create form). */
async function createPilot(page: Page, person: { firstName: string; lastName: string; email: string }): Promise<void> {
  await page.goto('/it/dashboard/pilots');
  await page.getByTestId('pilots-new-button').click();
  const form = page.getByTestId('pilot-identity-form');
  await form.getByLabel('Nome', { exact: true }).fill(person.firstName);
  await form.getByLabel('Cognome', { exact: true }).fill(person.lastName);
  await form.getByLabel('Email', { exact: true }).fill(person.email);
  await page.getByTestId('pilot-identity-submit').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Pilota creato' })).toBeVisible();

  // Same T0 hardening as the legacy spec: search by this test's own
  // run-unique lastName instead of assuming the row lands on page 1.
  await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(person.lastName)}`);
  await expect(rowFor(page, person.lastName)).toBeVisible();
}

test.describe('Pilots registry with archiving (Story 12.6, rebuilt from Story 2.1)', () => {
  test('staff/admin creates a pilot, who appears in the paginated searchable list (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Giulia');

    await createPilot(page, person);

    const row = rowFor(page, person.lastName);
    await expect(row).toBeVisible();
    await expect(row.getByText('Senza accesso')).toBeVisible();
  });

  test('search filters the list by first name, last name or email (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Marco');
    await createPilot(page, person);

    await page.goto('/it/dashboard/pilots');
    await page.getByTestId('pilots-search').fill(person.lastName);

    await expect(rowFor(page, person.lastName)).toBeVisible();
    // Debounced search: give the client time to push the new URL/refetch.
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(person.lastName)}`));
  });

  test('archiving a pilot (via the editor) removes them from the default list and shows them with the archived filter (AC 4/2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Sara');
    await createPilot(page, person);

    // `createPilot` already left the page on `?q=<lastName>` (T0 hardening) —
    // every navigation below preserves that filter, so every row lookup
    // stays volume-independent.
    const row = rowFor(page, person.lastName);
    await row.getByRole('button', { name: 'Modifica' }).click();
    await page.getByTestId('pilot-archive-toggle').click();
    await page.getByTestId('pilot-archive-confirm').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'archiviata' })).toBeVisible();
    await page.getByRole('button', { name: 'Chiudi' }).first().click();

    // The default (includeArchived=false) list drops the row as soon as the
    // archive call resolves and `router.refresh()` re-fetches.
    await expect(row).toHaveCount(0);

    // Fresh navigation, same `?q=` filter: still gone from the default list.
    await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(person.lastName)}`);
    await expect(rowFor(page, person.lastName)).toHaveCount(0);

    // With the archived filter: still there.
    await page.getByLabel('Mostra archiviati').check();
    const archivedRow = rowFor(page, person.lastName);
    await expect(archivedRow).toBeVisible();

    // Restoring: the row stays visible under "Mostra archiviati" (unarchived
    // persons are always included, the filter only adds archived ones).
    await archivedRow.getByRole('button', { name: 'Modifica' }).click();
    await page.getByTestId('pilot-archive-toggle').click();
    await page.getByTestId('pilot-archive-confirm').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'ripristinata' })).toBeVisible();
    await page.getByRole('button', { name: 'Chiudi' }).first().click();

    await page.getByLabel('Mostra archiviati').uncheck();
    await expect(rowFor(page, person.lastName)).toBeVisible();
  });

  test('a pilot (without people.read) is redirected away from /dashboard/pilots (AD-5, AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.goto('/it/dashboard/pilots');
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });

  test('opens the read-only pilot profile slide-over and renders saldo, ultimo volo, certificazioni and voli recenti from real fixtures (AC 5/7)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Profilo');

    const personResponse = await page.request.post('/api/v1/people', {
      data: { firstName: person.firstName, lastName: person.lastName, email: person.email },
    });
    expect(personResponse.status()).toBe(201);
    const { id: personId } = (await personResponse.json()) as { id: string };

    const pilotProfileResponse = await page.request.put(`/api/v1/people/${personId}/profiles/pilot`, {
      data: { licenseNumber: `IT-PPL-${Date.now()}`, licenseType: 'PPL(A)' },
    });
    expect(pilotProfileResponse.status()).toBe(200);

    // A UNIQUE aircraft (never reuse seed I-ABCD — avoids rate-collision with
    // parallel specs), created directly via the API (same shape as
    // `flight-log.spec.ts`'s `createAircraftWithRate`).
    const registration = `I-PRF${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase().slice(0, 20);
    const aircraftResponse = await page.request.post('/api/v1/aircraft', {
      data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 100 },
    });
    expect(aircraftResponse.status()).toBe(201);
    const { id: aircraftId } = (await aircraftResponse.json()) as { id: string };

    const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraftId}/rates`, {
      data: { priceCentsPerHour: 16000, validFrom: '2026-01-01' },
    });
    expect(rateResponse.status()).toBe(201);

    // Gives ultimo-volo + voli-recenti (90 minutes -> "1:30").
    const flightResponse = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId,
        personId,
        departureAirfield: 'LIMW',
        arrivalAirfield: 'LIME',
        flightType: 'TOURISM',
        takeoffAt: '2026-06-15T10:00:00.000Z',
        landingAt: '2026-06-15T11:30:00.000Z',
      },
    });
    expect(flightResponse.status()).toBe(201);

    // A non-trivial saldo (the exact figure is coupled to the flight charge
    // above — asserted generically below, never hardcoded).
    const topUpResponse = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
      data: { amountCents: 20000, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
    });
    expect(topUpResponse.status()).toBe(200);

    const expiryTypeName = `Licenza ${Date.now()}`;
    const expiryTypeResponse = await page.request.post('/api/v1/expiry-types', {
      data: { name: expiryTypeName, scope: 'ALL' },
    });
    expect(expiryTypeResponse.status()).toBe(201);
    const { id: expiryTypeId } = (await expiryTypeResponse.json()) as { id: string };

    const expiryResponse = await page.request.post('/api/v1/expiries', {
      data: { personId, expiryTypeId, expiresAt: '2027-01-31' },
    });
    expect(expiryResponse.status()).toBe(201);

    await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(person.lastName)}`);
    await page.getByTestId(`pilot-name-${personId}`).click();

    // Saldo: a real currency value, not the loading "…".
    await expect(page.getByText(/\d,\d{2}\s*€/).first()).toBeVisible();
    // Ultimo volo.
    await expect(page.getByText('15/06/2026').first()).toBeVisible();
    // Certificazioni: filter by the unique expiry-type name to disambiguate.
    const cert = page.getByTestId('pilot-profile-certification-row').filter({ hasText: expiryTypeName });
    await expect(cert).toContainText('31/01/2027');
    // Voli recenti.
    const flightRow = page.getByTestId('pilot-profile-flight-row');
    await expect(flightRow).toContainText('LIMW → LIME');
    await expect(flightRow).toContainText('1:30');
  });

  test('a pilot gets a 403 AD-8 envelope from GET /api/v1/people directly (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.get('/api/v1/people');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('GET /api/v1/people returns the AD-8 401 envelope without a session', async ({ request }) => {
    const response = await request.get('/api/v1/people');
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });
});
