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

async function createPerson(page: Page, person: { firstName: string; lastName: string }): Promise<void> {
  await page.goto('/it/dashboard/people');
  await page.getByRole('button', { name: 'Nuovo pilota' }).click();
  await page.getByLabel('Nome', { exact: true }).fill(person.firstName);
  await page.getByLabel('Cognome', { exact: true }).fill(person.lastName);
  await page.getByRole('button', { name: 'Crea persona' }).click();
  await expect(page.getByTestId('people-feedback')).toBeVisible();
}

async function ownPersonId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/me');
  const body = await response.json();
  return body.person.id as string;
}

test.describe('Person detail page (Story 2.3)', () => {
  test('staff opens the scheda from the list: anagrafica, profiles and the 5 structural placeholders (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Chiara');
    await createPerson(page, person);

    await page.goto(`/it/dashboard/people?q=${encodeURIComponent(person.lastName)}`);
    await page.getByRole('link', { name: new RegExp(`${person.lastName} ${person.firstName}`) }).click();

    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/]+$/);
    await expect(page.getByRole('heading', { name: `${person.lastName} ${person.firstName}` })).toBeVisible();
    await expect(page.getByText('Dati anagrafici')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Profili' })).toBeVisible();

    // The heading "Ultimi voli" + "Prossime prenotazioni" (the ONE remaining
    // structural placeholder — story 11.2 turns "Ultimi voli" into a real panel).
    for (const title of ['Scadenze', 'Saldo conto', 'Pacchetti ore', 'Ultimi voli', 'Prossime prenotazioni']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    // "Prossime prenotazioni" is still a placeholder — "Ultimi voli" is now real (Story 11.2, AC 4).
    await expect(page.getByText('Disponibile prossimamente.').first()).toBeVisible();

    // Staff (flights.manage): a REAL "Ultimi voli" panel — this fresh person has zero flights,
    // so the panel shows its own empty state (never "Disponibile prossimamente.") plus a
    // "Vedi tutti" link pre-filtered to this person (Story 11.2, AC 4).
    const personId = page.url().split('/').pop()!;
    const flightsPanel = page.getByTestId('recent-flights-panel');
    await expect(flightsPanel).toBeVisible();
    await expect(flightsPanel.getByText('Nessun volo registrato.')).toBeVisible();
    await expect(flightsPanel.getByTestId('recent-flights-view-all')).toHaveAttribute('href', `/it/dashboard/flights?personId=${personId}`);

    // Staff has people.manage: the pilot profile section is interactive (activate control present).
    const pilotSection = page.getByTestId('profile-section-pilot');
    await expect(pilotSection.getByRole('button', { name: 'Attiva' })).toBeVisible();
  });

  test('a pilot opens their own scheda: data visible, profiles read-only, no edit controls (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.getByRole('link', { name: 'La mia scheda' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/]+$/);

    await expect(page.getByRole('heading', { name: 'Volante Piero' })).toBeVisible();
    await expect(page.getByText('Dati anagrafici')).toBeVisible();

    // The seeded pilot profile is active — data shows, but with no activate/edit/deactivate controls (Task 3).
    const pilotSection = page.getByTestId('profile-section-pilot');
    await expect(pilotSection.getByText('IT-PPL-100200', { exact: false })).toBeVisible();
    await expect(pilotSection.getByRole('button', { name: 'Modifica' })).toHaveCount(0);
    await expect(pilotSection.getByRole('button', { name: 'Disattiva' })).toHaveCount(0);

    // Titolare (own access, no flights.manage): also a REAL "Ultimi voli" panel,
    // but its "Vedi tutti" link has NO personId (own-scope is automatic on the
    // registry page for a non-staff actor — Story 11.2, AC 4).
    const flightsPanel = page.getByTestId('recent-flights-panel');
    await expect(flightsPanel).toBeVisible();
    await expect(flightsPanel.getByTestId('recent-flights-view-all')).toHaveAttribute('href', '/it/dashboard/flights');
  });

  test('a pilot cannot open someone else’s scheda: redirected away (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Davide');
    await createPerson(page, person);
    await page.goto(`/it/dashboard/people?q=${encodeURIComponent(person.lastName)}`);
    await page.getByRole('link', { name: new RegExp(`${person.lastName} ${person.firstName}`) }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/]+$/);
    const otherPersonId = page.url().split('/').pop();

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
    await createPerson(page, person);
    await page.goto(`/it/dashboard/people?q=${encodeURIComponent(person.lastName)}`);
    await page.getByRole('link', { name: new RegExp(`${person.lastName} ${person.firstName}`) }).click();
    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/]+$/);
    const personId = page.url().split('/').pop()!;

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
    // TD-8 (review fix): the person was just created at 0,00 € and the
    // insufficient-balance guard now 422s the charge — top up first.
    const topUpResponse = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
      data: { amountCents: 50_000_000, paymentMethod: 'CASH', effectiveDate: '2020-01-01' },
    });
    expect(topUpResponse.status()).toBe(200);
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
    await expect(viewAllLink).toHaveAttribute('href', `/it/dashboard/flights?personId=${personId}`);
    await viewAllLink.click();
    await expect(page).toHaveURL(new RegExp(`/it/dashboard/flights\\?personId=${personId}`));
    await expect(page.getByTestId('flight-row').filter({ hasText: 'Campo Prova' })).toBeVisible();
  });
});
