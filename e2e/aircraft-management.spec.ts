import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/aircraft-management.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Fleet page (story 2.4; rebuilt AirOps epic 12, story 12.5): the legacy
 * `<table>`-based `/dashboard/aircraft` page is GONE — this file exercises
 * the card-grid `/dashboard/fleet` + slide-over editor instead. Behavioral
 * assertions (409 duplicate registration, 403 RBAC, 401 envelope) are
 * UNCHANGED; UI-structural ones are rewritten onto the new card-grid/
 * slide-over shape (Dev Notes: "i test riscritti possono rinominare
 * coerentemente" — testids renamed from `aircraft-*` to the new component's
 * own `identity-form`/`archive-*`/`ac-card-{id}` set).
 */

/** Login that must succeed: waits for the dashboard redirect so the session
 * cookie is in place before the test navigates elsewhere. `admin` also holds
 * `aircraft.manage` (ADMIN gets every permission, story 1.3), so it exercises
 * the same staff-only perimeter the story's AC 1/2 describe. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueAircraft(prefix: string): { registration: string; type: string; model: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    registration: `I-${prefix}${suffix}`.toUpperCase().slice(0, 20),
    type: 'Ultraleggero 3 assi',
    model: `Test Model ${suffix}`,
  };
}

/** Search-scoped card locator (TD-1 lesson: the grid is paginated 20/page, ordered by registration — a fresh run-unique registration can sort past page 1 on an accumulated DB). */
function cardFor(page: Page, registration: string) {
  return page.locator('[data-testid^="ac-card-"]').filter({ hasText: registration });
}

async function gotoSearched(page: Page, registration: string): Promise<void> {
  await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(registration)}`);
}

/** Creates an aircraft via the "Aggiungi aeromobile" slide-over (story 12.5, AC 3's create form). */
async function createAircraft(
  page: Page,
  aircraft: { registration: string; type: string; model: string },
): Promise<void> {
  await page.goto('/it/dashboard/fleet');
  await page.getByTestId('fleet-new-button').click();
  const form = page.getByTestId('identity-form');
  // AC 4, story 13.4: the "Proprietario" (owner) field is removed entirely — scoped to the form, never present.
  await expect(form.getByLabel('Proprietario')).toHaveCount(0);
  await form.getByLabel('Marche').fill(aircraft.registration);
  await form.getByLabel('Tipo').fill(aircraft.type);
  await form.getByLabel('Modello').fill(aircraft.model);
  await form.getByLabel('Contaore iniziale (minuti)').fill('750');
  await page.getByTestId('identity-submit').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Velivolo creato' })).toBeVisible();
}

test.describe('Aircraft fleet CRUD with archiving (Story 2.4; rebuilt AirOps epic 12 story 12.5)', () => {
  test('staff/admin creates an aircraft, which appears in the searchable card grid (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('AAA');

    await createAircraft(page, aircraft);

    await gotoSearched(page, aircraft.registration);
    const card = cardFor(page, aircraft.registration);
    await expect(card).toBeVisible();
    await expect(card.getByText('Disponibile')).toBeVisible();
    // The hour meter itself now lives inside the editor's "Contaore" section (AC 2: the card only shows the wet rate).
    await card.click();
    await expect(page.getByTestId('hour-meter-current')).toContainText('12:30');
  });

  test('duplicate registration is rejected with a 409/conflict message (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('BBB');
    await createAircraft(page, aircraft);

    await page.goto('/it/dashboard/fleet');
    await page.getByTestId('fleet-new-button').click();
    const form = page.getByTestId('identity-form');
    await form.getByLabel('Marche').fill(aircraft.registration);
    await form.getByLabel('Tipo').fill('Altro tipo');
    await form.getByLabel('Modello').fill('Altro modello');
    await form.getByLabel('Contaore iniziale (minuti)').fill('0');
    await page.getByTestId('identity-submit').click();

    await expect(page.getByTestId('identity-form-error')).toHaveText('Esiste già un velivolo con queste marche.');
  });

  test('archiving an aircraft removes it from the default list and shows it with the archived filter; restoring brings it back (AC 2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('CCC');
    await createAircraft(page, aircraft);

    await gotoSearched(page, aircraft.registration);
    await cardFor(page, aircraft.registration).click();
    await page.getByTestId('archive-toggle-button').click();
    await page.getByTestId('archive-confirm').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Velivolo archiviato' })).toBeVisible();
    await page.keyboard.press('Escape');

    // `router.refresh()` (AD-1) re-fetches the same (still non-archived) list — gone immediately.
    await expect(cardFor(page, aircraft.registration)).toHaveCount(0);

    // Fresh navigation: still gone from the default list.
    await gotoSearched(page, aircraft.registration);
    await expect(cardFor(page, aircraft.registration)).toHaveCount(0);

    // With the archived filter (AC 1, story 13.4: a toggle button, not a checkbox).
    await page.getByTestId('fleet-toggle-archived').click();
    const archivedCard = cardFor(page, aircraft.registration);
    await expect(archivedCard).toBeVisible();
    await expect(archivedCard.getByText('Archiviato')).toBeVisible();

    // Restoring: reopen the editor, "Ripristina" + two-step confirm.
    await archivedCard.click();
    await page.getByTestId('archive-toggle-button').click();
    await page.getByTestId('archive-confirm').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Velivolo ripristinato' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId('fleet-toggle-archived').click();
    await expect(cardFor(page, aircraft.registration)).toBeVisible();
  });

  test('a pilot (without aircraft.manage) is redirected away from /dashboard/fleet (AD-5, AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.goto('/it/dashboard/fleet');
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });

  test('a pilot gets a 403 AD-8 envelope from GET /api/v1/aircraft directly (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.get('/api/v1/aircraft');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('GET /api/v1/aircraft returns the AD-8 401 envelope without a session', async ({ request }) => {
    const response = await request.get('/api/v1/aircraft');
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });

  test('an aircraft with an APPROVED booking covering now shows the "Riservato" badge (story 12.5, AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = uniqueAircraft('RES');
    await createAircraft(page, aircraft);

    const listResponse = await page.request.get('/api/v1/aircraft', { params: { q: aircraft.registration } });
    const listed = (await listResponse.json()) as { items: Array<{ id: string }> };
    const aircraftId = listed.items[0]?.id;
    expect(aircraftId).toBeTruthy();

    const personResponse = await page.request.post('/api/v1/people', {
      data: { firstName: 'Prenota', lastName: `Riservato-${Date.now()}` },
    });
    expect(personResponse.status()).toBe(201);
    const person = (await personResponse.json()) as { id: string };
    const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
      data: { licenseNumber: `IT-PPL-${Date.now()}`, licenseType: 'PPL(A)' },
    });
    expect(profileResponse.status()).toBe(200);

    // A booking that COVERS "now" can't be created with a past startsAt —
    // createBooking rejects it (BOOKING_IN_PAST, 422). So create it starting a
    // few seconds in the FUTURE (passes the guard; ADMIN holds
    // `bookings.manage.any` → auto-APPROVED), then wait past startsAt before
    // loading the fleet page so the server-render `now` falls inside
    // [startsAt, endsAt) and the row derives to "Riservato".
    const now = Date.now();
    const bookingResponse = await page.request.post('/api/v1/bookings', {
      data: {
        aircraftId,
        personId: person.id,
        startsAt: new Date(now + 3_000).toISOString(),
        endsAt: new Date(now + 3_600_000).toISOString(),
      },
    });
    expect(bookingResponse.status()).toBe(201);
    // createBooking returns `{ booking, warnings }` — the booking is nested.
    const { booking } = (await bookingResponse.json()) as { booking: { status: string } };
    expect(booking.status).toBe('APPROVED');

    await page.waitForTimeout(6_000);
    await gotoSearched(page, aircraft.registration);
    const card = cardFor(page, aircraft.registration);
    await expect(card.getByText('Riservato')).toBeVisible();
  });
});
