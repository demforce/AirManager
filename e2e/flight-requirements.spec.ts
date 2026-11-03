import { expect, test } from '@playwright/test';
import type { APIResponse, Page, Request } from '@playwright/test';
import { seedAircraftRate, seedInstructorRate } from './db-fixtures';
import {
  addDaysIso,
  ensureFlightRequirements,
  ensureValidSeedExpiries,
  ownFailures,
  registerExpiry,
  registerFlightOn,
  selectFromCombobox,
  sendInRegola,
  todayRome,
  type E2eRequirementFailure,
} from './helpers';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/flight-requirements.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Story 19.9 — the ONE requirements warning of a flight (CR §4.4): documents
 * (person and instructor ON BOARD), membership fee, currency of a solo,
 * balance against the cost; one 422 `REQUIREMENTS_NOT_MET` listing them all,
 * and the admin's «Procedi comunque» resending the same request with `force`.
 *
 * Isolation: every test builds its own run-unique aircraft and people and
 * writes no AppSettings (X and Y of the currency stay what the DB holds —
 * read, never assumed), so the file stays in the `fullyParallel` project.
 * The catalogue is GLOBAL and dirtied by parallel specs (TD 16.2-g): every
 * asserted list goes through `ownFailures` (E-R6), and every write that must
 * pass unwarned through `sendInRegola` (review F5). The one blocking RATING
 * this file creates is scoped to STUDENTS (every "in regola" case here is a
 * pilot) and deactivated as soon as its case is asserted.
 */

const TODAY = todayRome();
/** The flight under test, two days ago: the edits below can still move it one day LATER without reaching the future. */
const FLIGHT_DAY = addDaysIso(TODAY, -2);
/** A no-charge fixture flight in the currency window (E-R5): it builds a currency without touching the balance. */
const CURRENCY_DAY = addDaysIso(TODAY, -10);
/** 120,00 €/h: a 30-minute flight costs 60,00 €. */
const PRICE_CENTS = 12_000;

type RequirementsBody = { error: { code: string; details: { failures: E2eRequirementFailure[] } } };

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** The SAME rendering as `formatDateOnly` (it-IT / en-IE are both dd/mm/yyyy). */
function formatDay(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-');
  return `${day}/${month}/${year}`;
}

async function createAircraft(page: Page): Promise<{ id: string; registration: string }> {
  const registration = `I-RQ${uniqueSuffix()}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', { data: { registration, type: 'Ultraleggero 3 assi', model: 'Requisiti 19.9' } });
  expect(response.status(), await response.text()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  await seedAircraftRate(id, { studentPriceCents: PRICE_CENTS, pilotPriceCents: PRICE_CENTS, validFrom: '2020-01-01' });
  return { id, registration };
}

type Person = { id: string; firstName: string; lastName: string; serverName: string; label: string };

async function createPerson(page: Page, profile: 'pilot' | 'student' | 'instructor', tag: string): Promise<Person> {
  const firstName = 'Requisiti';
  const lastName = `${tag}-${uniqueSuffix()}`;
  const response = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  const body =
    profile === 'pilot' ? { licenseNumber: `IT-PPL-${uniqueSuffix()}`, licenseType: 'PPL(A)' } : profile === 'student' ? { courseStartDate: '2020-01-01' } : { ratings: 'FI(A)' };
  expect((await page.request.put(`/api/v1/people/${id}/profiles/${profile}`, { data: body })).status()).toBe(200);
  if (profile === 'instructor') await seedInstructorRate(id, { priceCentsPerHour: 4000, validFrom: '2020-01-01' });
  // `serverName` = how the server names a person in a failure; `label` = how the pickers list them.
  return { id, firstName, lastName, serverName: `${firstName} ${lastName}`, label: `${lastName} ${firstName}` };
}

/** A pilot "in regola" (E-R5): documents, fee, balance after the fee = `balanceCents`, and a currency from a no-charge fixture flight. */
async function pilotInRegola(page: Page, aircraftId: string, tag: string, balanceCents: number): Promise<Person> {
  const pilot = await createPerson(page, 'pilot', tag);
  await ensureFlightRequirements(page, { personId: pilot.id, scope: 'PILOTS', topUpCents: balanceCents + 1000 });
  await registerFlightOn(page, { aircraftId, personId: pilot.id, flightType: 'TOURISM', date: CURRENCY_DAY, noCharge: true });
  return pilot;
}

function flightBody(aircraftId: string, personId: string, day: string, extra: Record<string, unknown> = {}, minutes = 30, startHourUtc = '10'): Record<string, unknown> {
  const takeoffAt = `${day}T${startHourUtc}:00:00.000Z`;
  return {
    aircraftId,
    personId,
    departureAirfield: 'Base Airfield',
    arrivalAirfield: 'Base Airfield',
    flightType: 'TOURISM',
    takeoffAt,
    landingAt: new Date(new Date(takeoffAt).getTime() + minutes * 60_000).toISOString(),
    ...extra,
  };
}

async function failuresOf(response: APIResponse): Promise<E2eRequirementFailure[]> {
  expect(response.status(), await response.text()).toBe(422);
  const body = (await response.json()) as RequirementsBody;
  expect(body.error.code).toBe('REQUIREMENTS_NOT_MET');
  return body.error.details.failures;
}

async function currencySettings(page: Page): Promise<{ minFlights: number; windowDays: number }> {
  const response = await page.request.get('/api/v1/settings/currency');
  expect(response.status()).toBe(200);
  return (await response.json()) as { minFlights: number; windowDays: number };
}

async function medicalTypeId(page: Page, name: string): Promise<string> {
  const response = await page.request.get('/api/v1/expiry-types');
  expect(response.status()).toBe(200);
  const type = ((await response.json()) as Array<{ id: string; name: string; kind: string }>).find((item) => item.kind === 'MEDICAL' && item.name === name);
  expect(type, name).toBeTruthy();
  return type!.id;
}

const MEDICAL = expect.stringContaining('Visita medica');

test.describe('Requirements of a flight: each check alone, then together (story 19.9, AC 25)', () => {
  test('(a) a pilot in regola registers a solo without any warning, unstamped — also with a force that had nothing to derogate (AC 18)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await pilotInRegola(page, aircraft.id, 'InRegola', 20_000);
    const inRegola = [{ personId: pilot.id, scope: 'PILOTS' as const }];

    const plain = await sendInRegola(page, inRegola, () => page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.id, FLIGHT_DAY) }));
    expect(plain.status(), await plain.text()).toBe(201);
    expect(((await plain.json()) as { flight: { forcedAt: string | null } }).flight.forcedAt).toBeNull();

    // A force with nothing to derogate stamps nothing. A sibling spec's blocking type gone active in
    // between WOULD be something to derogate (TD 16.2-g): only when covering the pilot again finds
    // one is the request resent, on the next free slot (review F5).
    let forcedAt: string | null = null;
    for (const hour of ['12', '13', '14']) {
      const forcedForNothing = await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.id, FLIGHT_DAY, { force: true }, 30, hour) });
      expect(forcedForNothing.status(), await forcedForNothing.text()).toBe(201);
      forcedAt = ((await forcedForNothing.json()) as { flight: { forcedAt: string | null } }).flight.forcedAt;
      if (forcedAt === null || (await ensureValidSeedExpiries(page, pilot.id, 'PILOTS')) === 0) break;
    }
    expect(forcedAt).toBeNull();
  });

  test('(b) EXPIRY alone: a blocking RATING expired the day before is the only failure — and once its type is deactivated it is no failure at all (16.4)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    // A STUDENT on a dual lesson with an instructor in regola: no currency to build, and the type
    // below is scoped to STUDENTS so that no parallel PILOT ever meets it as a missing document (E-R6).
    const student = await createPerson(page, 'student', 'Scaduto');
    await ensureFlightRequirements(page, { personId: student.id, scope: 'STUDENTS', topUpCents: 20_000 });
    const instructor = await createPerson(page, 'instructor', 'Istruttore');
    await ensureFlightRequirements(page, { personId: instructor.id, scope: 'INSTRUCTORS', topUpCents: 1000 });
    const lesson = { flightType: 'SCHOOL', instructorPersonId: instructor.id };
    const typeName = `Rating 19.9 ${uniqueSuffix()}`;
    const created = await page.request.post('/api/v1/expiry-types', { data: { name: typeName, scope: 'STUDENTS', blocksBooking: true } });
    expect(created.status()).toBe(201);
    const typeId = ((await created.json()) as { id: string }).id;
    try {
      await registerExpiry(page, student.id, typeId, addDaysIso(FLIGHT_DAY, -1));

      const failures = ownFailures(await failuresOf(await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, student.id, FLIGHT_DAY, lesson) })), [typeName]);
      expect(failures).toEqual([{ type: 'EXPIRY', role: 'person', personName: student.serverName, typeName, expiresAt: addDaysIso(FLIGHT_DAY, -1) }]);
    } finally {
      expect((await page.request.patch(`/api/v1/expiry-types/${typeId}`, { data: { isActive: false } })).status()).toBe(200);
    }
    const afterDeactivation = await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, student.id, FLIGHT_DAY, lesson) });
    if (afterDeactivation.status() === 422) {
      // Only another spec's ambient MISSING type may remain (E-R6) — never this expired one.
      expect(ownFailures(await failuresOf(afterDeactivation), [typeName])).toEqual([]);
    } else {
      expect(afterDeactivation.status()).toBe(201);
    }
  });

  test('(c) MEMBERSHIP alone: a pilot who never paid the fee gets one failure with expiresAt null', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPerson(page, 'pilot', 'Quota');
    await ensureValidSeedExpiries(page, pilot.id, 'PILOTS');
    const topUp = await page.request.post(`/api/v1/people/${pilot.id}/account/top-ups`, { data: { amountCents: 20_000, paymentMethod: 'CASH', effectiveDate: TODAY } });
    // No fee: the one requirement this case leaves unmet.
    expect(topUp.status()).toBe(200);
    await registerFlightOn(page, { aircraftId: aircraft.id, personId: pilot.id, flightType: 'TOURISM', date: CURRENCY_DAY, noCharge: true });

    const failures = ownFailures(await failuresOf(await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.id, FLIGHT_DAY) })));
    expect(failures).toEqual([{ type: 'MEMBERSHIP', role: 'person', personName: pilot.serverName, expiresAt: null }]);
  });

  test('(d) CURRENCY alone: never flown, then last flown beyond the window — whole days since the last flight', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const { minFlights, windowDays } = await currencySettings(page);

    const never = await createPerson(page, 'pilot', 'MaiVolato');
    await ensureFlightRequirements(page, { personId: never.id, scope: 'PILOTS', topUpCents: 20_000 });
    expect(ownFailures(await failuresOf(await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, never.id, FLIGHT_DAY) })))).toEqual([
      { type: 'CURRENCY', role: 'person', personName: never.serverName, lastFlightDate: null, daysSinceLastFlight: null, flightsInWindow: 0, minFlights, windowDays },
    ]);

    // The last flight one day OUTSIDE the window [D − Y, D].
    const lapsed = await createPerson(page, 'pilot', 'Fuori');
    await ensureFlightRequirements(page, { personId: lapsed.id, scope: 'PILOTS', topUpCents: 20_000 });
    const lastFlight = addDaysIso(FLIGHT_DAY, -(windowDays + 1));
    await registerFlightOn(page, { aircraftId: aircraft.id, personId: lapsed.id, flightType: 'TOURISM', date: lastFlight, noCharge: true });
    const failures = ownFailures(await failuresOf(await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, lapsed.id, FLIGHT_DAY) })));
    expect(failures).toEqual([
      { type: 'CURRENCY', role: 'person', personName: lapsed.serverName, lastFlightDate: lastFlight, daysSinceLastFlight: windowDays + 1, flightsInWindow: 0, minFlights, windowDays },
    ]);
  });

  test('(e) BALANCE alone: a balance below the cost is one failure with both amounts', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await pilotInRegola(page, aircraft.id, 'Saldo', 4000);

    expect(ownFailures(await failuresOf(await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.id, FLIGHT_DAY) })))).toEqual([
      { type: 'BALANCE', role: 'person', personName: pilot.serverName, balanceCents: 4000, costCents: 6000 },
    ]);
  });

  test('(f) together, in the contract order: a SCHOOL dual lists the instructor on board and (g) no currency; a SCHOOL solo lists the currency and NOT the instructor; (h) force registers and stamps', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    // Fresh: no visit, no fee, no balance, no flight — for both.
    const student = await createPerson(page, 'student', 'Allievo');
    const instructor = await createPerson(page, 'instructor', 'Istruttore');
    const school = { flightType: 'SCHOOL', instructorPersonId: instructor.id };

    const dual = ownFailures(await failuresOf(await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, student.id, FLIGHT_DAY, school) })));
    expect(dual).toEqual([
      { type: 'EXPIRY', role: 'person', personName: student.serverName, typeName: MEDICAL, expiresAt: null },
      { type: 'EXPIRY', role: 'instructor', personName: instructor.serverName, typeName: MEDICAL, expiresAt: null },
      { type: 'MEMBERSHIP', role: 'person', personName: student.serverName, expiresAt: null },
      { type: 'MEMBERSHIP', role: 'instructor', personName: instructor.serverName, expiresAt: null },
      // 30' at 120,00 €/h + 30' at 40,00 €/h.
      { type: 'BALANCE', role: 'person', personName: student.serverName, balanceCents: 0, costCents: 8000 },
    ]);

    const { minFlights, windowDays } = await currencySettings(page);
    const solo = ownFailures(await failuresOf(await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, student.id, FLIGHT_DAY, { ...school, isSolo: true }) })));
    expect(solo).toEqual([
      { type: 'EXPIRY', role: 'person', personName: student.serverName, typeName: MEDICAL, expiresAt: null },
      { type: 'MEMBERSHIP', role: 'person', personName: student.serverName, expiresAt: null },
      { type: 'CURRENCY', role: 'person', personName: student.serverName, lastFlightDate: null, daysSinceLastFlight: null, flightsInWindow: 0, minFlights, windowDays },
      { type: 'BALANCE', role: 'person', personName: student.serverName, balanceCents: 0, costCents: 8000 },
    ]);

    const forced = await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, student.id, FLIGHT_DAY, { ...school, force: true }) });
    expect(forced.status(), await forced.text()).toBe(201);
    const flight = ((await forced.json()) as { flight: Record<string, unknown> & { forcedAt: string | null } }).flight;
    expect(flight.forcedAt).not.toBeNull();
    expect(Object.keys(flight)).not.toContain('forceReason');
  });

  test('(i) a pilot sending force gets 403 before anything else', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, PILOT_EMAIL);
    const response = await page.request.post('/api/v1/flights', { data: flightBody('whatever', 'whoever', FLIGHT_DAY, { force: true }) });
    expect(response.status()).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
    await context.close();
  });
});

test.describe('Requirements of an edit (story 19.9, AC 11, AC 12)', () => {
  test('(a) review F1: a SCHOOL solo made dual — same student, instructor and date — checks the instructor who now boards; made solo again, the instructor is let off', async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    // The student in regola, with a currency from a no-charge lesson; the instructor with no visit and no fee.
    const student = await createPerson(page, 'student', 'Sale');
    await ensureFlightRequirements(page, { personId: student.id, scope: 'STUDENTS', topUpCents: 20_000 });
    const instructor = await createPerson(page, 'instructor', 'ABordo');
    await registerFlightOn(page, { aircraftId: aircraft.id, personId: student.id, instructorPersonId: instructor.id, flightType: 'SCHOOL', date: CURRENCY_DAY, noCharge: true });
    const dual = { flightType: 'SCHOOL', instructorPersonId: instructor.id };
    const solo = await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, student.id, FLIGHT_DAY, { ...dual, isSolo: true, force: true }) });
    expect(solo.status(), await solo.text()).toBe(201);
    const flightId = ((await solo.json()) as { flight: { id: string } }).flight.id;

    // Solo -> dual: the instructor boards, so the documents and the fee are judged again (E-R6 for the catalogue).
    const boarded = await page.request.put(`/api/v1/flights/${flightId}`, { data: flightBody(aircraft.id, student.id, FLIGHT_DAY, dual) });
    expect(ownFailures(await failuresOf(boarded))).toEqual([
      { type: 'EXPIRY', role: 'instructor', personName: instructor.serverName, typeName: MEDICAL, expiresAt: null },
      { type: 'MEMBERSHIP', role: 'instructor', personName: instructor.serverName, expiresAt: null },
    ]);

    // Dual -> solo: nobody boards, the instructor is let off — the student's currency comes from the lesson above.
    const madeDual = await page.request.put(`/api/v1/flights/${flightId}`, { data: flightBody(aircraft.id, student.id, FLIGHT_DAY, { ...dual, force: true }) });
    expect(madeDual.status(), await madeDual.text()).toBe(200);
    const backToSolo = await page.request.put(`/api/v1/flights/${flightId}`, { data: flightBody(aircraft.id, student.id, FLIGHT_DAY, { ...dual, isSolo: true }) });
    expect(backToSolo.status(), await backToSolo.text()).toBe(200);
  });

  test('(b) the edited flight never counts for its own currency: its only solo, moved one day LATER, lists the currency', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPerson(page, 'pilot', 'Esclusa');
    await ensureFlightRequirements(page, { personId: pilot.id, scope: 'PILOTS', topUpCents: 20_000 });
    const flightId = await registerFlightOn(page, { aircraftId: aircraft.id, personId: pilot.id, flightType: 'TOURISM', date: FLIGHT_DAY, noCharge: true });

    // Counted for itself, the flight (dated FLIGHT_DAY) would make the pilot
    // current on FLIGHT_DAY + 1: excluded, the pilot has never flown.
    const moved = await page.request.put(`/api/v1/flights/${flightId}`, { data: flightBody(aircraft.id, pilot.id, addDaysIso(FLIGHT_DAY, 1), { noCharge: true }) });
    const { minFlights, windowDays } = await currencySettings(page);
    // The date changed: documents and fee are judged again (E-R6 for the catalogue).
    expect(ownFailures(await failuresOf(moved))).toEqual([
      { type: 'CURRENCY', role: 'person', personName: pilot.serverName, lastFlightDate: null, daysSinceLastFlight: null, flightsInWindow: 0, minFlights, windowDays },
    ]);
  });

  test('(c) [Q-19.9-b = SEMPRE] the balance of an edit is ALWAYS judged net of the current charge: longer is warned, shorter passes, and an unchanged cost on a negative balance is warned', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    // Exactly 0 € after fee and flight.
    const exact = await pilotInRegola(page, aircraft.id, 'Netto', 6000);
    const registered = await sendInRegola(page, [{ personId: exact.id, scope: 'PILOTS' }], () =>
      page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, exact.id, FLIGHT_DAY) }),
    );
    expect(registered.status(), await registered.text()).toBe(201);
    const flightId = ((await registered.json()) as { flight: { id: string } }).flight.id;

    const longer = await page.request.put(`/api/v1/flights/${flightId}`, { data: flightBody(aircraft.id, exact.id, FLIGHT_DAY, {}, 45) });
    expect(await failuresOf(longer)).toEqual([{ type: 'BALANCE', role: 'person', personName: exact.serverName, balanceCents: 6000, costCents: 9000 }]);
    const shorter = await page.request.put(`/api/v1/flights/${flightId}`, { data: flightBody(aircraft.id, exact.id, FLIGHT_DAY, {}, 15) });
    expect(shorter.status(), await shorter.text()).toBe(200);

    // The PO's discriminant: a balance already NEGATIVE after the flight (registered with force),
    // and an edit that changes the landings only — the cost does not move, the warning still comes.
    // Its own aircraft: the currency fixture flies at 10:00 Rome on CURRENCY_DAY, like the first pilot's.
    const negativeAircraft = await createAircraft(page);
    const negative = await pilotInRegola(page, negativeAircraft.id, 'Negativo', 4000);
    const forced = await page.request.post('/api/v1/flights', { data: flightBody(negativeAircraft.id, negative.id, FLIGHT_DAY, { force: true }) });
    expect(forced.status(), await forced.text()).toBe(201);
    const negativeId = ((await forced.json()) as { flight: { id: string } }).flight.id;
    const landingsOnly = await page.request.put(`/api/v1/flights/${negativeId}`, { data: flightBody(negativeAircraft.id, negative.id, FLIGHT_DAY, { landings: 3 }) });
    expect(await failuresOf(landingsOnly)).toEqual([{ type: 'BALANCE', role: 'person', personName: negative.serverName, balanceCents: 4000, costCents: 6000 }]);
  });

  test('a no-charge flight skips the balance: a pilot at 0 € is warned on a charged flight, and once in the red registers a no-charge one unwarned, unstamped (AC 12, A9)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await pilotInRegola(page, aircraft.id, 'SenzaAddebito', 0);

    expect(ownFailures(await failuresOf(await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.id, FLIGHT_DAY) })))).toEqual([
      { type: 'BALANCE', role: 'person', personName: pilot.serverName, balanceCents: 0, costCents: 6000 },
    ]);
    // Into the red with a derogated charged flight: a no-charge flight costs 0, so only a NEGATIVE
    // balance tells "not judged" (A9) from "judged and covered".
    const charged = await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.id, FLIGHT_DAY, { force: true }, 30, '13') });
    expect(charged.status(), await charged.text()).toBe(201);
    const noCharge = await sendInRegola(page, [{ personId: pilot.id, scope: 'PILOTS' }], () =>
      page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.id, FLIGHT_DAY, { noCharge: true }, 30, '15') }),
    );
    expect(noCharge.status(), await noCharge.text()).toBe(201);
    expect(((await noCharge.json()) as { flight: { forcedAt: string | null } }).flight.forcedAt).toBeNull();
  });
});

test.describe('The warning in the flight form (story 19.9, AC 13-15)', () => {
  /** Fills a new registration on the logbook page for `pilot` on `aircraft`, 10:00 -> 10:30 local, FLIGHT_DAY. */
  async function fillNewFlight(page: Page, aircraft: { registration: string }, pilot: Person): Promise<void> {
    await page.getByTestId('logbook-new-button').click();
    const form = page.getByTestId('flight-form');
    await expect(form).toBeVisible();
    await selectFromCombobox(form.getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, pilot.label);
    await page.getByLabel('Data volo').fill(FLIGHT_DAY);
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
  }

  function flightPosts(page: Page): Request[] {
    const posts: Request[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/flights') posts.push(request);
    });
    return posts;
  }

  test('one warning, in the server order, with readable texts; a change of the form or «Annulla» closes it without a request; «Procedi comunque» resends the SAME body plus force once (AC 13/14/15)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPerson(page, 'pilot', 'Avviso');
    const expired = addDaysIso(FLIGHT_DAY, -30);
    // An expired class 2 as the ONLY visit (registered first, so the helper adds none).
    await registerExpiry(page, pilot.id, await medicalTypeId(page, 'Visita medica classe 2'), expired);
    await ensureValidSeedExpiries(page, pilot.id, 'PILOTS');
    const { minFlights, windowDays } = await currencySettings(page);
    const posts = flightPosts(page);

    await page.goto('/it/dashboard/logbook');
    await fillNewFlight(page, aircraft, pilot);
    const answered = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/flights' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Registra volo' }).click();
    const serverFailures = ((await (await answered).json()) as RequirementsBody).error.details.failures;

    // AC 13: one item per failure, in the server's order, readable per type.
    const warning = page.getByTestId('requirements-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toBeFocused();
    await expect(warning.getByRole('heading', { name: 'Requisiti non soddisfatti', exact: true })).toBeVisible();
    const items = warning.getByTestId('requirements-warning-item');
    await expect(items).toHaveCount(serverFailures.length);
    expect(await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-type')))).toEqual(serverFailures.map((failure) => failure.type));
    const who = `${pilot.serverName} (pilota/allievo) — `;
    await expect(items.and(page.locator('[data-type="EXPIRY"]')).filter({ hasText: 'Visita medica classe 2' })).toHaveText(`${who}Visita medica classe 2: scaduto il ${formatDay(expired)}`);
    await expect(items.and(page.locator('[data-type="MEMBERSHIP"]'))).toHaveText(`${who}Quota associativa mai pagata`);
    await expect(items.and(page.locator('[data-type="CURRENCY"]'))).toHaveText(
      `${who}Currency scaduta: nessun volo registrato (minimo ${minFlights} ${minFlights === 1 ? 'volo' : 'voli'} ${windowDays === 1 ? "nell'ultimo giorno" : `negli ultimi ${windowDays} giorni`})`,
    );
    await expect(items.and(page.locator('[data-type="BALANCE"]'))).toHaveText(`${who}Saldo insufficiente: saldo 0,00 €, costo 60,00 €`);
    await expect(warning.getByTestId('requirements-proceed')).toHaveText('Procedi comunque');
    await expect(warning.getByTestId('requirements-cancel')).toHaveText('Annulla');
    // No motivo, and the list is never repeated in the banner.
    await expect(page.getByTestId('flight-form').locator('textarea')).toHaveCount(0);
    await expect(page.getByTestId('flight-form-error')).toHaveCount(0);
    expect(posts).toHaveLength(1);

    // AC 15: the stale-body guard — an RHF field, then a plain-state switch.
    await page.getByLabel('Ora atterraggio').fill('10:40');
    await expect(warning).toHaveCount(0);
    await page.getByRole('button', { name: 'Registra volo' }).click();
    await expect(page.getByTestId('requirements-warning')).toBeVisible();
    const noCharge = page.getByTestId('flight-form').getByTestId('flight-no-charge-toggle');
    await noCharge.click();
    await expect(page.getByTestId('requirements-warning')).toHaveCount(0);
    await noCharge.click();
    await page.getByRole('button', { name: 'Registra volo' }).click();
    await page.getByTestId('requirements-warning').getByTestId('requirements-cancel').click();
    await expect(page.getByTestId('requirements-warning')).toHaveCount(0);
    // Review F3: the focus goes back to the submit that opened the warning, never to the body.
    await expect(page.getByRole('button', { name: 'Registra volo' })).toBeFocused();
    expect(posts, 'no request from a change or from «Annulla» — only the three submits').toHaveLength(3);

    // AC 14: a failed resend keeps the warning open with its retry message...
    await page.getByRole('button', { name: 'Registra volo' }).click();
    await expect(page.getByTestId('requirements-warning')).toBeVisible();
    const refused = posts[3]!;
    await page.route('**/api/v1/flights', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 500, body: '' }) : route.continue()), { times: 1 });
    await page.getByTestId('requirements-proceed').click();
    await expect(page.getByTestId('requirements-proceed-error')).toHaveText('Impossibile completare l\'operazione. Riprova.');
    await expect(page.getByTestId('requirements-warning')).toBeVisible();
    // Review F3: disabled while it sent, the button had dropped the focus — it has it back for the retry.
    await expect(page.getByTestId('requirements-proceed')).toBeFocused();

    // ...and a successful one is the SAME body plus force, once, same endpoint and method.
    await page.getByTestId('requirements-proceed').click();
    await expect(page.getByTestId('flight-result-panel')).toBeVisible();
    expect(posts).toHaveLength(6);
    expect(posts[5]!.postDataJSON()).toEqual({ ...refused.postDataJSON(), force: true });
    await expect(page.getByTestId('flight-result-panel')).not.toContainText(/deroga/i);
  });

  test('an edit shows the warning too and «Procedi comunque» resends the PUT with force — no key (AC 14, AC 28)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPerson(page, 'pilot', 'Modifica');
    const registered = await page.request.post('/api/v1/flights', { data: flightBody(aircraft.id, pilot.id, FLIGHT_DAY, { force: true }) });
    expect(registered.status()).toBe(201);
    const flightId = ((await registered.json()) as { flight: { id: string } }).flight.id;
    const puts: Request[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PUT' && new URL(request.url()).pathname === `/api/v1/flights/${flightId}`) puts.push(request);
    });

    await page.goto(`/it/dashboard/logbook?aircraftId=${aircraft.id}`);
    await page.getByTestId('flight-row').first().getByTestId('flight-correct-action').click();
    await expect(page.getByTestId('flight-form')).toBeVisible();
    await page.getByLabel('Atterraggi', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Salva modifiche' }).click();

    // Same person and date: only the balance is re-judged (D-8, Q-19.9-b) — 0 € once the 60,00 € are credited back.
    const warning = page.getByTestId('requirements-warning');
    await expect(warning.getByTestId('requirements-warning-item')).toHaveText([`${pilot.serverName} (pilota/allievo) — Saldo insufficiente: saldo 0,00 €, costo 60,00 €`]);
    await warning.getByTestId('requirements-proceed').click();
    await expect(page.getByTestId('flight-result-panel')).toBeVisible();
    expect(puts).toHaveLength(2);
    expect(puts[1]!.postDataJSON()).toEqual({ ...puts[0]!.postDataJSON(), force: true });
    expect(puts.map((request) => request.headers()['idempotency-key'])).toEqual([undefined, undefined]);
  });

  test('EN: the ICU plurals of the currency read "flights"/"days" (AC 23)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const { minFlights, windowDays } = await currencySettings(page);
    const pilot = await createPerson(page, 'pilot', 'English');
    await ensureFlightRequirements(page, { personId: pilot.id, scope: 'PILOTS', topUpCents: 20_000 });
    const lastFlight = addDaysIso(FLIGHT_DAY, -(windowDays + 2));
    await registerFlightOn(page, { aircraftId: aircraft.id, personId: pilot.id, flightType: 'TOURISM', date: lastFlight, noCharge: true });

    await page.goto('/en/dashboard/logbook');
    await page.getByTestId('logbook-new-button').click();
    const form = page.getByTestId('flight-form');
    await selectFromCombobox(form.getByLabel('Aircraft'), aircraft.registration, aircraft.registration);
    await selectFromCombobox(form.getByLabel('Pilot or student'), pilot.lastName, pilot.label);
    await form.getByLabel('Flight date').fill(FLIGHT_DAY);
    await form.getByLabel('Takeoff time').fill('10:00');
    await form.getByLabel('Landing time').fill('10:30');
    await page.getByRole('button', { name: 'Log flight' }).click();

    const flights = (count: number) => `${count} ${count === 1 ? 'flight' : 'flights'}`;
    await expect(page.locator('[data-testid="requirements-warning-item"][data-type="CURRENCY"]')).toHaveText(
      `${pilot.serverName} (pilot/student) — Currency lapsed: ${flights(0)} in the last ${windowDays} days (minimum ${minFlights}); last flight on ${formatDay(lastFlight)}, ${windowDays + 2} days ago`,
    );
    await expect(page.getByTestId('requirements-warning').getByTestId('requirements-proceed')).toHaveText('Proceed anyway');
  });
});
