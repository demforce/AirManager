import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/person-detail.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniquePerson(prefix: string): { firstName: string; lastName: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { firstName: prefix, lastName: `Scheda-${suffix}` };
}

/**
 * Creates a person via the Piloti page's "Aggiungi pilota" slide-over
 * (story 12.6 — the legacy `/dashboard/people` create form is gone) and
 * returns the fresh `Person.id`. `/dashboard/people/[id]` itself (this
 * spec's subject) stays alive and unchanged (story 12.6, AC 6) — it is just
 * no longer reached by clicking a list row, so this helper resolves the id
 * via the (unchanged) list API instead of a UI click-through.
 */
async function createPerson(page: Page, person: { firstName: string; lastName: string }): Promise<string> {
  await page.goto('/it/dashboard/pilots');
  await page.getByTestId('pilots-new-button').click();
  const form = page.getByTestId('pilot-identity-form');
  await form.getByLabel('Nome', { exact: true }).fill(person.firstName);
  await form.getByLabel('Cognome', { exact: true }).fill(person.lastName);
  await page.getByTestId('pilot-identity-submit').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Pilota creato' })).toBeVisible();

  const response = await page.request.get(`/api/v1/people?q=${encodeURIComponent(person.lastName)}`);
  const body = (await response.json()) as { items: Array<{ id: string }> };
  return body.items[0]!.id;
}

async function ownPersonId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/me');
  const body = await response.json();
  return body.person.id as string;
}

test.describe('Person detail page (Story 2.3; rebuilt AirOps-native, Story 13.3)', () => {
  test('staff opens the scheda from the list: anagrafica, profiles, estratto conto and the placeholder (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Chiara');
    const personId = await createPerson(page, person);

    await page.goto(`/it/dashboard/people/${personId}`);
    await expect(page.getByRole('heading', { name: `${person.lastName} ${person.firstName}` })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dati anagrafici' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Profili' })).toBeVisible();

    // Story 13.3, AC 2: the standalone "estratto conto" drill-down is now a
    // SECTION here ("Estratto conto"), replacing the old "Saldo conto" panel.
    for (const title of ['Scadenze', 'Estratto conto', 'Ultimi voli', 'Prossime prenotazioni']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    // "Prossime prenotazioni" is still a placeholder — "Ultimi voli" is now real (Story 11.2, AC 4).
    await expect(page.getByText('Disponibile prossimamente.').first()).toBeVisible();

    // Staff (flights.manage): a REAL "Ultimi voli" panel — this fresh person has zero flights,
    // so the panel shows its own empty state (never "Disponibile prossimamente.") plus a
    // "Vedi tutti" link pre-filtered to this person (Story 11.2, AC 4).
    const flightsPanel = page.getByTestId('recent-flights-panel');
    await expect(flightsPanel).toBeVisible();
    await expect(flightsPanel.getByText('Nessun volo registrato.')).toBeVisible();
    await expect(flightsPanel.getByTestId('recent-flights-view-all')).toHaveAttribute('href', `/it/dashboard/logbook?personId=${personId}`);

    // Story 13.3 (AC 1/R-13.3-c): the dossier is READ-ONLY — a fresh person has
    // no pilot profile activated ("Non attivato"), and activating it happens
    // through "Modifica" (people.manage), never an inline control here.
    const pilotSection = page.getByTestId('profile-section-pilot');
    await expect(pilotSection).toContainText('Non attivato');
    await expect(pilotSection.getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('person-edit-button')).toBeVisible();
  });

  test('a pilot opens their own scheda: data visible, profiles read-only, no "Modifica" (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.getByRole('link', { name: 'La mia scheda' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/]+$/);

    await expect(page.getByRole('heading', { name: 'Volante Piero' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dati anagrafici' })).toBeVisible();

    // The seeded pilot profile is active — data shows, no edit affordance
    // anywhere on the page (Story 13.3: editing lives ONLY behind "Modifica",
    // itself hidden for an own-access viewer without `people.manage`).
    const pilotSection = page.getByTestId('profile-section-pilot');
    await expect(pilotSection.getByText('IT-PPL-100200', { exact: false })).toBeVisible();
    await expect(pilotSection.getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('person-edit-button')).toHaveCount(0);

    // Titolare (own access, no flights.manage): also a REAL "Ultimi voli" panel,
    // but its "Vedi tutti" link has NO personId (own-scope is automatic on the
    // registry page for a non-staff actor — Story 11.2, AC 4).
    const flightsPanel = page.getByTestId('recent-flights-panel');
    await expect(flightsPanel).toBeVisible();
    await expect(flightsPanel.getByTestId('recent-flights-view-all')).toHaveAttribute('href', '/it/dashboard/logbook');
  });

  test('a pilot cannot open someone else’s scheda: redirected away (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Davide');
    const otherPersonId = await createPerson(page, person);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await page.goto(`/it/dashboard/people/${otherPersonId}`);
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });

  test('GET /api/v1/people/{id}: 200 for a pilot’s own record, 403 AD-8 envelope for someone else’s (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const myId = await ownPersonId(page);

    const ownResponse = await page.request.get(`/api/v1/people/${myId}`);
    expect(ownResponse.status()).toBe(200);
    const ownBody = await ownResponse.json();
    expect(ownBody.id).toBe(myId);

    const otherResponse = await page.request.get('/api/v1/people/some-other-person-id');
    expect(otherResponse.status()).toBe(403);
    const otherBody = await otherResponse.json();
    expect(otherBody.error.code).toBe('FORBIDDEN');
  });

  test('the "Ultimi voli" panel shows the person\'s flights (data, tratta, durata, stato) and "Vedi tutti" opens the pre-filtered registry (Story 11.2, AC 4)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Diego');
    const personId = await createPerson(page, person);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // A flight requires an active pilot/student profile on the person (PERSON_NOT_PILOT_OR_STUDENT otherwise).
    const profileResponse = await page.request.put(`/api/v1/people/${personId}/profiles/pilot`, {
      data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
    });
    expect(profileResponse.status()).toBe(200);
    const aircraftResponse = await page.request.post('/api/v1/aircraft', {
      data: { registration: `I-PD${suffix}`.toUpperCase().slice(0, 20), type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 50 },
    });
    expect(aircraftResponse.status()).toBe(201);
    const aircraft = (await aircraftResponse.json()) as { id: string };
    const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
      data: { priceCentsPerHour: 10000, validFrom: '2020-01-01' },
    });
    expect(rateResponse.status()).toBe(201);
    const flightResponse = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId,
        departureAirfield: 'Campo Prova',
        arrivalAirfield: 'Base Prova',
        flightType: 'TOURISM',
        takeoffAt: '2020-01-01T10:00:00.000Z',
        landingAt: '2020-01-01T10:40:00.000Z',
      },
    });
    expect(flightResponse.status()).toBe(201);

    await page.goto(`/it/dashboard/people/${personId}`);
    const panel = page.getByTestId('recent-flights-panel');
    await expect(panel).toBeVisible();
    const row = panel.getByTestId('recent-flight-row');
    await expect(row).toContainText('01/01/2020');
    await expect(row).toContainText('Campo Prova → Base Prova');
    await expect(row).toContainText('0:40');
    await expect(row).toContainText('Registrato');

    const viewAllLink = panel.getByTestId('recent-flights-view-all');
    await expect(viewAllLink).toHaveAttribute('href', `/it/dashboard/logbook?personId=${personId}`);
    await viewAllLink.click();
    await expect(page).toHaveURL(new RegExp(`/it/dashboard/logbook\\?personId=${personId}`));
    await expect(page.getByTestId('flight-row').filter({ hasText: 'Campo Prova' })).toBeVisible();
  });

  test('"Modifica" opens the SAME PilotEditor slide-over the Piloti table uses, pre-filled, and a save refreshes the read-only dossier (Story 13.3, AC 1/R-13.3-c)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Edoardo');
    const personId = await createPerson(page, person);

    await page.goto(`/it/dashboard/people/${personId}`);
    await page.getByTestId('person-edit-button').click();

    const form = page.getByTestId('pilot-identity-form');
    await expect(form.getByLabel('Nome', { exact: true })).toHaveValue(person.firstName);
    await expect(form.getByLabel('Cognome', { exact: true })).toHaveValue(person.lastName);

    const updatedPhone = '333' + Date.now().toString().slice(-7);
    await form.getByLabel('Telefono').fill(updatedPhone);
    await page.getByTestId('pilot-identity-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Dati aggiornati' })).toBeVisible();

    // The slide-over's own save refreshes the server-rendered dossier
    // (`router.refresh()`) — the anagrafica card shows the new value with no
    // manual reload. The run-unique suffix makes the phone number safe to
    // match anywhere on the page.
    await expect(page.getByText(updatedPhone)).toBeVisible();
  });
});
