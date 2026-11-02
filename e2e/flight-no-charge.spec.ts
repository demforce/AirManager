import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedAircraftRate, seedInstructorRate } from './db-fixtures';
import { ensureValidSeedExpiries, selectFromCombobox, submitPastRequirements } from './helpers';

/**
 * Story 19.6 (P1 — R-19-d; Q-19.6-a = B): the admin's «Senza addebito»
 * flight. The rates are still required and frozen on the flight, both
 * amounts and the `FLIGHT_CHARGE` are 0, the statement line says so at its
 * head, and the instructor's compensation still accrues.
 *
 * Every fixture is run-unique (persons, aircraft, rates): nothing here mutates
 * a global setting nor asserts a global aggregate, so the spec lives in the
 * parallel `chromium` project (CLAUDE.md).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/flight-no-charge.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PAST_DATE = '2020-01-01';
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };

async function loginExpectingDashboard(page: Page): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function flightTimes(dateOnly: string, minutes: number): { takeoffAt: string; landingAt: string } {
  const takeoffAt = `${dateOnly}T10:00:00.000Z`;
  return { takeoffAt, landingAt: new Date(new Date(takeoffAt).getTime() + minutes * 60_000).toISOString() };
}

async function createPerson(page: Page, profile: 'pilot' | 'student' | 'instructor', tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Gratis';
  const lastName = `${tag}-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileData =
    profile === 'pilot'
      ? { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' }
      : profile === 'student'
        ? { courseStartDate: PAST_DATE }
        : { ratings: 'FI(A)' };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/${profile}`, { data: profileData });
  expect(profileResponse.status()).toBe(200);
  await ensureValidSeedExpiries(page, person.id, profile === 'pilot' ? 'PILOTS' : profile === 'student' ? 'STUDENTS' : 'INSTRUCTORS');
  return { personId: person.id, firstName, lastName };
}

/** An aircraft, with a rate in effect since `PAST_DATE` unless `priceCents` is `null`. */
async function createAircraft(page: Page, priceCents: number | null): Promise<{ id: string; registration: string }> {
  const registration = `I-NC${uniqueSuffix()}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', { data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model' } });
  expect(response.status()).toBe(201);
  const aircraft = (await response.json()) as { id: string };
  if (priceCents !== null) {
    await seedAircraftRate(aircraft.id, { studentPriceCents: priceCents, pilotPriceCents: priceCents, validFrom: PAST_DATE });
  }
  return { id: aircraft.id, registration };
}

/** `force: true` (story 19.9, E-R1): the flag is this spec's subject, never the flight's requirements (a fresh person has no fee). */
function flightBody(aircraftId: string, personId: string, dateOnly: string, minutes: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { aircraftId, personId, departureAirfield: 'Base Airfield', arrivalAirfield: 'Base Airfield', flightType: 'TOURISM', ...flightTimes(dateOnly, minutes), force: true, ...extra };
}

async function readAccount(page: Page, personId: string): Promise<{ balanceCents: number; flightCharges: Array<{ id: string; amountCents: number; description: string | null }> }> {
  const overview = (await (await page.request.get(`/api/v1/people/${personId}/account`)).json()) as { balanceCents: number };
  const movements = (await (await page.request.get(`/api/v1/people/${personId}/account/movements?pageSize=100`)).json()) as {
    items: Array<{ id: string; type: string; amountCents: number; description: string | null }>;
  };
  return {
    balanceCents: overview.balanceCents,
    flightCharges: movements.items.filter((item) => item.type === 'FLIGHT_CHARGE').map(({ id, amountCents, description }) => ({ id, amountCents, description })),
  };
}

test.describe('Flight «senza addebito» (Story 19.6, P1 — R-19-d)', () => {
  test('without an aircraft rate the flag changes nothing (422 NO_AIRCRAFT_RATE both ways); with one, rates are frozen and amounts, total and charge are 0 (AC 19, Q-19.6-a = B)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page);
    const pilot = await createPerson(page, 'pilot', 'Senza');
    const unrated = await createAircraft(page, null);

    for (const noCharge of [false, true]) {
      const refused = await page.request.post('/api/v1/flights', { data: flightBody(unrated.id, pilot.personId, PAST_DATE, 60, { noCharge }) });
      expect(refused.status(), `noCharge: ${noCharge}`).toBe(422);
      expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('NO_AIRCRAFT_RATE');
    }

    const aircraft = await createAircraft(page, 15000);
    const instructor = await createPerson(page, 'instructor', 'Istruttore');
    await seedInstructorRate(instructor.personId, { priceCentsPerHour: 4000, validFrom: PAST_DATE });
    const registered = await page.request.post('/api/v1/flights', {
      data: flightBody(aircraft.id, pilot.personId, PAST_DATE, 60, { instructorPersonId: instructor.personId, noCharge: true }),
    });
    expect(registered.status()).toBe(201);
    const { flight } = (await registered.json()) as {
      flight: { noCharge: boolean; breakdown: { aircraftRateCentsPerHour: number; aircraftAmountCents: number; instructorRateCentsPerHour?: number; instructorAmountCents?: number; totalAmountCents: number } };
    };
    expect(flight.noCharge).toBe(true);
    expect(flight.breakdown).toEqual(
      expect.objectContaining({ aircraftRateCentsPerHour: 15000, aircraftAmountCents: 0, instructorRateCentsPerHour: 4000, instructorAmountCents: 0, totalAmountCents: 0 }),
    );

    const account = await readAccount(page, pilot.personId);
    expect(account.balanceCents).toBe(0);
    expect(account.flightCharges).toHaveLength(1);
    expect(account.flightCharges[0]!.amountCents).toBe(0);
    expect(account.flightCharges[0]!.description).toMatch(/^Volo senza addebito /);
  });

  test('a PUT that turns the flag on gives the charge back to the account; one that turns it off (here: by omitting it) charges the rate again (AC 20)', async ({ page }) => {
    await loginExpectingDashboard(page);
    const pilot = await createPerson(page, 'pilot', 'Toggle');
    const aircraft = await createAircraft(page, 15000);
    const registered = await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.personId, PAST_DATE, 60) });
    expect(registered.status()).toBe(201);
    const flightId = ((await registered.json()) as { flight: { id: string } }).flight.id;
    const before = await readAccount(page, pilot.personId);
    expect(before.balanceCents).toBe(-15000);

    const on = await page.request.put(`/api/v1/flights/${flightId}`, { data: flightBody(aircraft.id, pilot.personId, PAST_DATE, 60, { noCharge: true }) });
    expect(on.status()).toBe(200);
    const afterOn = await readAccount(page, pilot.personId);
    expect(afterOn.balanceCents).toBe(0);
    expect(afterOn.flightCharges).toEqual([expect.objectContaining({ id: before.flightCharges[0]!.id, amountCents: 0 })]);

    // PUT is a full replacement: the omitted flag goes back to `false`.
    const off = await page.request.put(`/api/v1/flights/${flightId}`, { data: flightBody(aircraft.id, pilot.personId, PAST_DATE, 60) });
    expect(off.status()).toBe(200);
    expect(((await off.json()) as { flight: { noCharge: boolean } }).flight.noCharge).toBe(false);
    const afterOff = await readAccount(page, pilot.personId);
    expect(afterOff.balanceCents).toBe(-15000);
    expect(afterOff.flightCharges).toEqual([expect.objectContaining({ id: before.flightCharges[0]!.id, amountCents: -15000 })]);
    expect(afterOff.flightCharges[0]!.description).toMatch(/^Volo I-/);
  });

  test('a SCHOOL flight without charge still accrues its instructor compensation: minutes and owed grow by round(minutes × payout / 60) (AC 21)', async ({ page }) => {
    await loginExpectingDashboard(page);
    const instructor = await createPerson(page, 'instructor', 'Compenso');
    const student = await createPerson(page, 'student', 'Allievo');
    const aircraft = await createAircraft(page, 15000);
    await seedInstructorRate(instructor.personId, { priceCentsPerHour: 4000, validFrom: PAST_DATE });
    expect((await page.request.put(`/api/v1/instructor-compensation/${instructor.personId}/rate`, { data: { payoutRateCents: 6000 } })).status()).toBe(200);

    const registered = await page.request.post('/api/v1/flights', {
      data: flightBody(aircraft.id, student.personId, PAST_DATE, 90, { flightType: 'SCHOOL', instructorPersonId: instructor.personId, noCharge: true }),
    });
    expect(registered.status()).toBe(201);
    expect((await readAccount(page, student.personId)).balanceCents).toBe(0);

    const summaryResponse = await page.request.get('/api/v1/instructor-compensation');
    expect(summaryResponse.status()).toBe(200);
    const row = ((await summaryResponse.json()) as Array<{ personId: string; totalMinutes: number; owedTotalCents: number | null }>).find(
      (item) => item.personId === instructor.personId,
    );
    expect(row).toEqual(expect.objectContaining({ totalMinutes: 90, owedTotalCents: 9000 }));
  });

  test('UI: the switch in the new and the edit form, the summary, the registry row and card, the KPI and the statement line at 0 € (AC 22/23)', async ({ page }) => {
    test.slow();
    await page.setViewportSize(DESKTOP);
    await loginExpectingDashboard(page);
    const pilot = await createPerson(page, 'pilot', 'Interfaccia');
    const aircraft = await createAircraft(page, 15000);

    // New entry: the switch is there on a TOURISM flight, off by default.
    await page.goto(`/it/dashboard/logbook?aircraftId=${aircraft.id}`);
    await expect(page).toHaveURL(/aircraftId=/);
    await page.getByTestId('logbook-new-button').click();
    const form = page.getByTestId('flight-form');
    await expect(form).toBeVisible();
    const toggle = form.getByTestId('flight-no-charge-toggle');
    await expect(toggle).toHaveAttribute('role', 'switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(form.getByRole('switch', { name: 'Senza addebito', exact: true })).toBeVisible();
    await selectFromCombobox(form.getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(form.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await form.getByLabel('Data volo').fill(PAST_DATE);
    await form.getByLabel('Ora decollo').fill('10:00');
    await form.getByLabel('Ora atterraggio').fill('11:00');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Registra volo' }).click();
    // Story 19.9: no balance check on a no-charge flight, but the fee and the currency still apply.
    await submitPastRequirements(page);

    const resultPanel = page.getByTestId('flight-result-panel');
    await expect(resultPanel.getByTestId('flight-result-total')).toHaveText(/^0,00\s€$/);
    await expect(resultPanel.getByTestId('flight-result-no-charge')).toHaveText('Senza addebito');
    await page.getByTestId('flight-result-close').click();

    // AC 22: the only flight of this aircraft is worth 0 of revenue.
    await page.reload();
    await expect(page.locator('.kpi', { hasText: 'Ricavo' }).locator('.kpi-value')).toHaveText(/^0,00\s€$/);

    // A normal flight on the same aircraft, to prove the wording shows ONLY on the no-charge one.
    expect((await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.personId, '2020-01-02', 60) })).status()).toBe(201);
    await page.reload();
    const rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId('flight-no-charge')).toHaveCount(1);
    const noChargeRow = rows.filter({ hasText: '01/01/2020' });
    await expect(noChargeRow.getByTestId('flight-no-charge')).toHaveText('Senza addebito');
    await expect(rows.filter({ hasText: '02/01/2020' }).getByTestId('flight-no-charge')).toHaveCount(0);

    // Edit form: the switch comes back ON, from the flight itself.
    await noChargeRow.getByTestId('flight-correct-action').click();
    await expect(page.getByTestId('flight-form').getByTestId('flight-no-charge-toggle')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('flight-form').getByLabel('Ora atterraggio').fill('10:45');
    // No warning: same person and date (documents, fee and currency exempt, D-8) and no charge (no balance).
    await page.getByRole('button', { name: 'Salva modifiche' }).click();
    await expect(page.getByTestId('flight-result-panel').getByTestId('flight-result-no-charge')).toBeVisible();
    await expect(page.getByTestId('flight-result-panel').getByTestId('flight-result-total')).toHaveText(/^0,00\s€$/);
    await page.getByTestId('flight-result-close').click();

    // The statement line: 0,00 €, the wording at the HEAD of the description.
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    const noChargeLine = page.getByTestId('account-movement-row').filter({ hasText: 'Volo senza addebito' });
    await expect(noChargeLine).toHaveCount(1);
    await expect(noChargeLine.locator('div').nth(2)).toHaveText(/^Volo senza addebito /);
    await expect(noChargeLine).toContainText(/0,00\s€/);

    // Phone: the card's sub-line (date · description) keeps the wording right
    // after the date, ahead of the part the end-truncation eats…
    await page.setViewportSize(PHONE);
    await page.reload();
    const card = page.getByTestId('account-movement-row-mobile').filter({ hasText: 'Volo senza addebito' });
    await expect(card).toHaveCount(1);
    await expect(card.locator('.mobile-row-sub')).toHaveText(/^\d{2}\/\d{2}\/\d{4} · Volo senza addebito /);

    // …the registry card shows the wording instead of the amount, on that card only…
    await page.goto(`/it/dashboard/logbook?aircraftId=${aircraft.id}`);
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(2);
    await expect(page.getByTestId('flight-no-charge-mobile')).toHaveCount(1);
    await expect(page.getByTestId('flight-row-mobile').filter({ hasText: '01/01/2020' }).getByTestId('flight-no-charge-mobile')).toHaveText('Senza addebito');

    // …and the phone form carries the switch too.
    await page.getByTestId('logbook-new-button').click();
    await expect(page.getByTestId('flight-form').getByTestId('flight-no-charge-toggle')).toBeVisible();
  });
});
