import { expect, test } from '@playwright/test';
import type { APIResponse, Page } from '@playwright/test';
import { seedAircraftRate, seedInstructorRate } from './db-fixtures';
import { addDaysIso, ensureValidSeedExpiries, FAR_FUTURE_DATE, registerExpiry, registerFlightOn, todayRome } from './helpers';

/**
 * Story 19.7a — the expiry model and rules (CR PO 2026-11-01):
 * - R-19-j: ONE valid medical visit of ANY class covers whoever is on board;
 * - R-19-k: "Quota associativa" is its own `MEMBERSHIP` kind, a system type;
 * - R-19-i: the currency (X flights in the last Y days, defaults 1/90) on the
 *   pilot rows.
 *
 * Every fixture is run-unique (persons, aircraft, rates, catalogue types) and
 * nothing here writes an AppSetting nor asserts a global aggregate, so the
 * spec lives in the parallel `chromium` project (CLAUDE.md). The catalogue
 * types the API test creates are named to sort AFTER the seeded visits
 * (`ensureValidSeedExpiries` registers the FIRST active visit by name) and
 * are deleted at its end.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/expiry-rules-currency.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';
const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 900 };
const TODAY = todayRome();
const YESTERDAY = addDaysIso(TODAY, -1);
const EXPIRED = addDaysIso(TODAY, -30);
/** A future day for bookings — far from any booking another spec makes on these run-unique aircraft. */
const BOOKING_DAY = '2031-03-11';

async function loginExpectingDashboard(page: Page, email: string = ADMIN_EMAIL, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The SAME rendering `src/lib/time.ts#formatDateOnly` produces — an assertion never hard-codes a format. */
function formatDateOnly(dateOnly: string, locale: 'it' | 'en'): string {
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-IE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

type Profile = 'pilot' | 'student' | 'instructor';
type Person = { id: string; firstName: string; lastName: string };

/** A person with the given profiles and NOTHING else — no expiry, no `ensureValidSeedExpiries` (callers decide the order, AD-9). */
async function createPerson(page: Page, lastName: string, profiles: Profile[]): Promise<Person> {
  const firstName = 'Regole';
  const response = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(response.status(), await response.text()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  for (const profile of profiles) {
    const data =
      profile === 'pilot' ? { licenseNumber: `IT-${uniqueSuffix()}`, licenseType: 'PPL(A)' } : profile === 'student' ? { courseStartDate: '2020-01-01' } : { ratings: 'FI(A)' };
    const profileResponse = await page.request.put(`/api/v1/people/${id}/profiles/${profile}`, { data });
    expect(profileResponse.status(), await profileResponse.text()).toBe(200);
  }
  return { id, firstName, lastName };
}

/** The seeded visit types, by name (story 19.7a: all `ALL`, all blocking). */
async function visitTypeIds(page: Page): Promise<Record<'class1' | 'class2' | 'lapl', string>> {
  const response = await page.request.get('/api/v1/expiry-types?kind=MEDICAL');
  expect(response.status()).toBe(200);
  const types = (await response.json()) as Array<{ id: string; name: string }>;
  const idOf = (name: string) => {
    const type = types.find((candidate) => candidate.name === name);
    expect(type, `seeded visit "${name}"`).toBeTruthy();
    return type!.id;
  };
  return { class1: idOf('Visita medica classe 1'), class2: idOf('Visita medica classe 2'), lapl: idOf('Visita medica LAPL') };
}

/** The names of the ACTIVE visit types, as the server joins them for a missing visit (alphabetical, `' / '`). */
async function activeVisitNames(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/expiry-types?kind=MEDICAL');
  expect(response.status()).toBe(200);
  const names = ((await response.json()) as Array<{ name: string }>).map((type) => type.name);
  return names.sort((left, right) => left.localeCompare(right, 'it')).join(' / ');
}

async function createAircraft(page: Page, rateSince: string): Promise<{ id: string; registration: string }> {
  const registration = `I-R7${uniqueSuffix()}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', { data: { registration, type: 'Ultraleggero 3 assi', model: 'Regole 19.7a' } });
  expect(response.status(), await response.text()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  await seedAircraftRate(id, { studentPriceCents: 11000, pilotPriceCents: 12000, validFrom: rateSince });
  return { id, registration };
}

/** A flight POST whose outcome the caller asserts (the 422 cases); `registerFlightOn` is the 201 path. */
async function postFlight(page: Page, body: { aircraftId: string; personId: string; instructorPersonId?: string; flightType: 'TOURISM' | 'SCHOOL'; date: string }): Promise<APIResponse> {
  return page.request.post('/api/v1/flights', {
    data: {
      aircraftId: body.aircraftId,
      personId: body.personId,
      ...(body.instructorPersonId !== undefined ? { instructorPersonId: body.instructorPersonId } : {}),
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      flightType: body.flightType,
      takeoffAt: `${body.date}T10:00:00.000Z`,
      landingAt: `${body.date}T10:30:00.000Z`,
    },
  });
}

type BlockedBody = { error: { code: string; details: { documents: Array<{ typeName: string; expiresAt: string | null; role: string }> } } };

/** The fee for a person with no balance: `override` (the admin holds `settings.manage`); the route requires an `Idempotency-Key`. */
async function chargeMembershipFee(page: Page, personId: string): Promise<APIResponse> {
  return page.request.post(`/api/v1/people/${personId}/membership-fee`, {
    data: { amountCents: 1000, override: true },
    headers: { 'Idempotency-Key': `e2e-197a-${uniqueSuffix()}` },
  });
}

async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<{ Text: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = (await (await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`)).json()) as { messages: Array<{ ID: string; Subject: string }> };
    const found = search.messages.find((message) => message.Subject.includes(subjectIncludes));
    if (found) return (await (await fetch(`${MAILPIT_API}/message/${found.ID}`)).json()) as { Text: string };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

test.describe('Story 19.7a — catalogue: visits without scope, the membership fee as a system type (AC 3, AC 4)', () => {
  test('the API resolves scope/flag by kind, rejects a scoped visit, and locks the MEMBERSHIP type', async ({ page }) => {
    await loginExpectingDashboard(page);
    const suffix = uniqueSuffix();
    const created: string[] = [];
    const create = async (data: Record<string, unknown>): Promise<APIResponse> => {
      const response = await page.request.post('/api/v1/expiry-types', { data });
      if (response.status() === 201) created.push(((await response.json()) as { id: string }).id);
      return response;
    };

    try {
      // AC 3 — a visit has no scope and always counts (D-3).
      const scoped = await create({ name: `Zz visita ${suffix} a`, kind: 'MEDICAL', scope: 'PILOTS' });
      expect(scoped.status()).toBe(422);
      expect(((await scoped.json()) as { error: { code: string } }).error.code).toBe('MEDICAL_TYPE_FIELDS');
      const nonBlocking = await create({ name: `Zz visita ${suffix} b`, kind: 'MEDICAL', blocksBooking: false });
      expect(nonBlocking.status()).toBe(422);
      expect(((await nonBlocking.json()) as { error: { code: string } }).error.code).toBe('MEDICAL_TYPE_FIELDS');

      const visit = await create({ name: `Zz visita ${suffix} c`, kind: 'MEDICAL' });
      expect(visit.status()).toBe(201);
      const visitBody = (await visit.json()) as { id: string; scope: string; blocksBooking: boolean; kind: string };
      expect(visitBody).toMatchObject({ kind: 'MEDICAL', scope: 'ALL', blocksBooking: true });

      const bare = await create({ name: `Zz rating ${suffix} d` });
      expect(bare.status()).toBe(201);
      expect(await bare.json()).toMatchObject({ kind: 'RATING', scope: 'ALL', blocksBooking: false });
      const instructors = await create({ name: `Zz rating ${suffix} e`, scope: 'INSTRUCTORS' });
      expect(instructors.status()).toBe(201);
      expect(await instructors.json()).toMatchObject({ kind: 'RATING', scope: 'INSTRUCTORS', blocksBooking: false });

      const visitScoped = await page.request.patch(`/api/v1/expiry-types/${visitBody.id}`, { data: { scope: 'STUDENTS' } });
      expect(visitScoped.status()).toBe(422);
      expect(((await visitScoped.json()) as { error: { code: string } }).error.code).toBe('MEDICAL_TYPE_FIELDS');

      const pilotsRating = await create({ name: `Zz rating ${suffix} f`, scope: 'PILOTS' });
      const pilotsRatingId = ((await pilotsRating.json()) as { id: string }).id;
      const toMedicalAlone = await page.request.patch(`/api/v1/expiry-types/${pilotsRatingId}`, { data: { kind: 'MEDICAL' } });
      expect(toMedicalAlone.status()).toBe(422);
      expect(((await toMedicalAlone.json()) as { error: { code: string } }).error.code).toBe('MEDICAL_TYPE_FIELDS');
      const toMedicalFixed = await page.request.patch(`/api/v1/expiry-types/${pilotsRatingId}`, { data: { kind: 'MEDICAL', scope: 'ALL', blocksBooking: true } });
      expect(toMedicalFixed.status()).toBe(200);
      expect(await toMedicalFixed.json()).toMatchObject({ kind: 'MEDICAL', scope: 'ALL', blocksBooking: true });

      // AC 4 — MEMBERSHIP: never written through the API, one row, locked.
      const membershipCreate = await create({ name: `Zz quota ${suffix}`, kind: 'MEMBERSHIP' });
      expect(membershipCreate.status()).toBe(422);
      expect(((await membershipCreate.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
      const toMembership = await page.request.patch(`/api/v1/expiry-types/${pilotsRatingId}`, { data: { kind: 'MEMBERSHIP' } });
      expect(toMembership.status()).toBe(422);
      expect(((await toMembership.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

      const membershipList = (await (await page.request.get('/api/v1/expiry-types?kind=MEMBERSHIP')).json()) as Array<{ id: string; name: string; kind: string }>;
      expect(membershipList).toHaveLength(1);
      expect(membershipList[0]).toMatchObject({ name: 'Quota associativa', kind: 'MEMBERSHIP' });
      const ratings = (await (await page.request.get('/api/v1/expiry-types?kind=RATING&includeInactive=true')).json()) as Array<{ name: string }>;
      expect(ratings.map((type) => type.name)).not.toContain('Quota associativa');

      for (const body of [{ isActive: false }, { name: 'Quota soci' }]) {
        const locked = await page.request.patch(`/api/v1/expiry-types/${membershipList[0]!.id}`, { data: body });
        expect(locked.status()).toBe(409);
        expect(((await locked.json()) as { error: { code: string } }).error.code).toBe('MEMBERSHIP_TYPE_LOCKED');
      }
      const deleted = await page.request.delete(`/api/v1/expiry-types/${membershipList[0]!.id}`);
      expect(deleted.status()).toBe(409);
      expect(((await deleted.json()) as { error: { code: string } }).error.code).toBe('MEMBERSHIP_TYPE_LOCKED');
      // Still there, still active.
      const after = (await (await page.request.get('/api/v1/expiry-types?kind=MEMBERSHIP')).json()) as Array<{ id: string }>;
      expect(after.map((type) => type.id)).toEqual([membershipList[0]!.id]);
    } finally {
      // Unused, hence deletable; deactivated instead if a parallel spec registered one in the meantime.
      for (const id of created) {
        const response = await page.request.delete(`/api/v1/expiry-types/${id}`);
        if (response.status() === 409) await page.request.patch(`/api/v1/expiry-types/${id}`, { data: { isActive: false } });
      }
    }
  });
});

test.describe('Story 19.7a — one valid visit of any class, for whoever is on board (AC 6, AC 7a)', () => {
  test('flights: a valid class 1 covers an expired class 2; only-expired, missing and instructor visits block with ONE document each', async ({ page }) => {
    await loginExpectingDashboard(page);
    const suffix = uniqueSuffix();
    const visits = await visitTypeIds(page);
    const aircraft = await createAircraft(page, addDaysIso(TODAY, -60));

    // (a) class 2 expired + class 1 valid -> 201 (before this story: 422, the class 2).
    const covered = await createPerson(page, `Visite-${suffix}-a`, ['pilot']);
    await registerExpiry(page, covered.id, visits.class2, EXPIRED);
    await registerExpiry(page, covered.id, visits.class1, FAR_FUTURE_DATE);
    await ensureValidSeedExpiries(page, covered.id, 'PILOTS');
    await registerFlightOn(page, { aircraftId: aircraft.id, personId: covered.id, flightType: 'TOURISM', date: YESTERDAY });

    // (b) the class 2 alone, expired -> ONE document, that visit.
    const expiredOnly = await createPerson(page, `Visite-${suffix}-b`, ['pilot']);
    await registerExpiry(page, expiredOnly.id, visits.class2, EXPIRED);
    await ensureValidSeedExpiries(page, expiredOnly.id, 'PILOTS');
    const expiredResponse = await postFlight(page, { aircraftId: aircraft.id, personId: expiredOnly.id, flightType: 'TOURISM', date: addDaysIso(TODAY, -2) });
    expect(expiredResponse.status()).toBe(422);
    const expiredBody = (await expiredResponse.json()) as BlockedBody;
    expect(expiredBody.error.code).toBe('FLIGHT_BLOCKED_BY_EXPIRY');
    expect(expiredBody.error.details.documents).toEqual([expect.objectContaining({ typeName: 'Visita medica classe 2', expiresAt: EXPIRED, role: 'person' })]);

    // (c) NO visit at all (the helper is deliberately NOT called): ONE missing
    // document naming the active visits; any other document is an ambient
    // custom rating another spec left active. The active list is read before
    // AND after, so a visit another spec creates in between cannot flake it.
    const noVisit = await createPerson(page, `Visite-${suffix}-c`, ['pilot']);
    const namesBefore = await activeVisitNames(page);
    const missingResponse = await postFlight(page, { aircraftId: aircraft.id, personId: noVisit.id, flightType: 'TOURISM', date: addDaysIso(TODAY, -3) });
    const namesAfter = await activeVisitNames(page);
    expect(missingResponse.status()).toBe(422);
    const missingDocuments = ((await missingResponse.json()) as BlockedBody).error.details.documents;
    const missingVisits = missingDocuments.filter((document) => document.typeName.includes('Visita medica classe 2'));
    expect(missingVisits).toHaveLength(1);
    expect(missingVisits[0]!.expiresAt).toBeNull();
    expect([namesBefore, namesAfter]).toContain(missingVisits[0]!.typeName);
    expect(missingVisits[0]!.typeName.split(' / ')).toEqual(expect.arrayContaining(['Visita medica classe 1', 'Visita medica classe 2', 'Visita medica LAPL']));

    // (d) SCHOOL: the student is covered, the instructor's only visit is expired -> ONE document, role instructor.
    const student = await createPerson(page, `Visite-${suffix}-d-allievo`, ['student']);
    await registerExpiry(page, student.id, visits.lapl, FAR_FUTURE_DATE);
    await ensureValidSeedExpiries(page, student.id, 'STUDENTS');
    const instructorExpired = await createPerson(page, `Visite-${suffix}-d-istruttore`, ['instructor']);
    await registerExpiry(page, instructorExpired.id, visits.class1, EXPIRED);
    await ensureValidSeedExpiries(page, instructorExpired.id, 'INSTRUCTORS');
    await seedInstructorRate(instructorExpired.id, { priceCentsPerHour: 4000, validFrom: addDaysIso(TODAY, -60) });
    const instructorResponse = await postFlight(page, {
      aircraftId: aircraft.id,
      personId: student.id,
      instructorPersonId: instructorExpired.id,
      flightType: 'SCHOOL',
      date: addDaysIso(TODAY, -4),
    });
    expect(instructorResponse.status()).toBe(422);
    expect(((await instructorResponse.json()) as BlockedBody).error.details.documents).toEqual([
      expect.objectContaining({ typeName: 'Visita medica classe 1', expiresAt: EXPIRED, role: 'instructor' }),
    ]);

    // (e) the student's class 2 and the instructor's LAPL: any class, for anyone -> 201.
    const student2 = await createPerson(page, `Visite-${suffix}-e-allievo`, ['student']);
    await registerExpiry(page, student2.id, visits.class2, FAR_FUTURE_DATE);
    await ensureValidSeedExpiries(page, student2.id, 'STUDENTS');
    const instructorLapl = await createPerson(page, `Visite-${suffix}-e-istruttore`, ['instructor']);
    await registerExpiry(page, instructorLapl.id, visits.lapl, FAR_FUTURE_DATE);
    await ensureValidSeedExpiries(page, instructorLapl.id, 'INSTRUCTORS');
    await seedInstructorRate(instructorLapl.id, { priceCentsPerHour: 4000, validFrom: addDaysIso(TODAY, -60) });
    await registerFlightOn(page, { aircraftId: aircraft.id, personId: student2.id, instructorPersonId: instructorLapl.id, flightType: 'SCHOOL', date: addDaysIso(TODAY, -5) });
  });

  test('bookings: an expired class 2 beside a valid class 1 neither blocks nor warns', async ({ page }) => {
    await loginExpectingDashboard(page);
    const visits = await visitTypeIds(page);
    const aircraft = await createAircraft(page, addDaysIso(TODAY, -60));
    const pilot = await createPerson(page, `Visite-${uniqueSuffix()}-prenota`, ['pilot']);
    await registerExpiry(page, pilot.id, visits.class2, EXPIRED);
    await registerExpiry(page, pilot.id, visits.class1, FAR_FUTURE_DATE);
    await ensureValidSeedExpiries(page, pilot.id, 'PILOTS');

    const response = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.id, startsAt: `${BOOKING_DAY}T09:00:00.000Z`, endsAt: `${BOOKING_DAY}T10:00:00.000Z` },
    });
    expect(response.status(), await response.text()).toBe(201);
    expect(((await response.json()) as { warnings: Array<{ typeName: string }> }).warnings).toEqual([]);
  });
});

test.describe('Story 19.7a — the membership fee has its own category (AC 11, AC 16)', () => {
  test('a charged fee shows the «Quota associativa» badge in the Scadenze registry, «Membership fee» in English', async ({ page }) => {
    await loginExpectingDashboard(page);
    const person = await createPerson(page, `Quota-${uniqueSuffix()}`, ['pilot']);
    const charge = await chargeMembershipFee(page, person.id);
    expect(charge.status(), await charge.text()).toBe(200);

    await page.setViewportSize(DESKTOP);
    for (const [locale, label] of [
      ['it', 'Quota associativa'],
      ['en', 'Membership fee'],
    ] as const) {
      await page.goto(`/${locale}/dashboard/expiries?window=all&personQuery=${encodeURIComponent(person.lastName)}`);
      const rows = page.getByTestId('scadenze-row');
      await expect(rows).toHaveCount(1);
      // The category cell is the row's second column (badge), the certificate the third.
      await expect(rows.first().locator(':scope > div').nth(1)).toHaveText(label);
      await expect(rows.first().locator(':scope > div').nth(2)).toHaveText('Quota associativa');
    }
  });

  test('pilot landing: «Scadenza medico» is the visit expiring LAST, and the fee is not a rating', async ({ page, browser }) => {
    await loginExpectingDashboard(page);
    const visits = await visitTypeIds(page);
    const suffix = uniqueSuffix();
    const pilot = await createPerson(page, `Landing-${suffix}`, ['pilot']);
    const class1Date = addDaysIso(TODAY, 200);
    await registerExpiry(page, pilot.id, visits.class2, EXPIRED);
    await registerExpiry(page, pilot.id, visits.class1, class1Date);
    const ratingsResponse = await page.request.get('/api/v1/expiry-types?kind=RATING');
    const ratingSep = ((await ratingsResponse.json()) as Array<{ id: string; name: string }>).find((type) => type.name === 'Rating SEP');
    expect(ratingSep).toBeTruthy();
    await registerExpiry(page, pilot.id, ratingSep!.id, FAR_FUTURE_DATE);
    const charge = await chargeMembershipFee(page, pilot.id);
    expect(charge.status(), await charge.text()).toBe(200);

    const email = `landing-${suffix}@airmanager.local`.toLowerCase();
    const password = 'LandingPilot197a!';
    const user = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId: pilot.id } });
    expect(user.status(), await user.text()).toBe(201);
    const invite = await waitForMailpitMessage(email, 'invitato');
    const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(invite.Text);
    expect(match, invite.Text).toBeTruthy();

    const pilotContext = await browser.newContext({ viewport: DESKTOP });
    try {
      const pilotPage = await pilotContext.newPage();
      const url = new URL(match![1]!);
      await pilotPage.goto(url.pathname + url.search);
      await pilotPage.getByLabel('Nuova password').fill(password);
      await pilotPage.getByLabel('Conferma password').fill(password);
      await pilotPage.getByRole('button', { name: 'Imposta password' }).click();
      await expect(pilotPage.getByTestId('set-password-success')).toBeVisible();

      await loginExpectingDashboard(pilotPage, email, password);
      await expect(pilotPage.getByTestId('kpi-medical')).toContainText(formatDateOnly(class1Date, 'it'));
      await expect(pilotPage.getByTestId('kpi-medical')).not.toContainText(formatDateOnly(EXPIRED, 'it'));
      await expect(pilotPage.getByTestId('kpi-ratings')).toContainText('Rating SEP');
      await expect(pilotPage.getByTestId('kpi-ratings')).not.toContainText('Quota associativa');
    } finally {
      await pilotContext.close();
    }
  });
});

test.describe('Story 19.7a — currency on the pilot rows (AC 15)', () => {
  test('X=1, Y=90: a flight at today−90 ends today, at today−91 it is over, a flight as instructor counts, a supervised solo does not, an instructor has none', async ({ page }) => {
    await loginExpectingDashboard(page);
    const tag = `Cur-${uniqueSuffix()}`;
    const aircraft = await createAircraft(page, addDaysIso(TODAY, -100));

    const a = await createPerson(page, `${tag}-A`, ['pilot']);
    const b = await createPerson(page, `${tag}-B`, ['student']);
    const c = await createPerson(page, `${tag}-C`, ['pilot']);
    const d = await createPerson(page, `${tag}-D`, ['pilot', 'instructor']);
    const e = await createPerson(page, `${tag}-E`, ['instructor']);
    const pupil = await createPerson(page, `${tag}-F`, ['student']);
    const g = await createPerson(page, `${tag}-G`, ['pilot', 'instructor']);
    const soloist = await createPerson(page, `${tag}-H`, ['student']);
    await ensureValidSeedExpiries(page, a.id, 'PILOTS');
    await ensureValidSeedExpiries(page, b.id, 'STUDENTS');
    await ensureValidSeedExpiries(page, d.id, 'PILOTS');
    await ensureValidSeedExpiries(page, d.id, 'INSTRUCTORS');
    await ensureValidSeedExpiries(page, e.id, 'INSTRUCTORS');
    await ensureValidSeedExpiries(page, pupil.id, 'STUDENTS');
    await ensureValidSeedExpiries(page, g.id, 'PILOTS');
    await ensureValidSeedExpiries(page, g.id, 'INSTRUCTORS');
    await ensureValidSeedExpiries(page, soloist.id, 'STUDENTS');
    await seedInstructorRate(d.id, { priceCentsPerHour: 4000, validFrom: addDaysIso(TODAY, -100) });
    await seedInstructorRate(e.id, { priceCentsPerHour: 4000, validFrom: addDaysIso(TODAY, -100) });
    await seedInstructorRate(g.id, { priceCentsPerHour: 4000, validFrom: addDaysIso(TODAY, -100) });

    await registerFlightOn(page, { aircraftId: aircraft.id, personId: a.id, flightType: 'TOURISM', date: addDaysIso(TODAY, -90) });
    await registerFlightOn(page, { aircraftId: aircraft.id, personId: b.id, instructorPersonId: e.id, flightType: 'SCHOOL', date: addDaysIso(TODAY, -91) });
    await registerFlightOn(page, { aircraftId: aircraft.id, personId: pupil.id, instructorPersonId: d.id, flightType: 'SCHOOL', date: addDaysIso(TODAY, -10) });
    await registerFlightOn(page, { aircraftId: aircraft.id, personId: soloist.id, instructorPersonId: g.id, flightType: 'SCHOOL', isSolo: true, date: addDaysIso(TODAY, -20) });

    await page.setViewportSize(DESKTOP);
    await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(tag)}`);
    for (const person of [a, b, c, d, e, g, soloist]) {
      await expect(page.getByTestId(`pilot-row-${person.id}`)).toBeVisible();
    }
    await expect(page.getByTestId(`pilot-currency-${a.id}`)).toHaveText('Currency 0gg');
    await expect(page.getByTestId(`pilot-currency-${b.id}`)).toHaveText('Non current');
    await expect(page.getByTestId(`pilot-currency-${c.id}`)).toHaveText('Non current');
    // D's only flight is one they INSTRUCTED, 10 days ago: 80 days left, no badge.
    await expect(page.getByTestId(`pilot-currency-${d.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`pilot-currency-${pupil.id}`)).toHaveCount(0);
    // G's only flight is a SOLO they supervised from the ground (review 19.7a F2, CR §4.5
    // "a bordo"): it counts for the student flying it, never for G.
    await expect(page.getByTestId(`pilot-currency-${g.id}`)).toHaveText('Non current');
    await expect(page.getByTestId(`pilot-currency-${soloist.id}`)).toHaveCount(0);
    // E flew (as B's instructor) but has no pilot/student profile: no currency at all.
    await expect(page.getByTestId(`pilot-currency-${e.id}`)).toHaveCount(0);

    // The badge sits UNDER the date, inside the 110px column (D-14).
    const fits = await page.getByTestId(`pilot-currency-${b.id}`).evaluate((node) => {
      const cell = node.parentElement!.getBoundingClientRect();
      const badge = node.querySelector('.badge')!.getBoundingClientRect();
      return badge.left >= cell.left - 1 && badge.right <= cell.right + 1;
    });
    expect(fits).toBe(true);

    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(tag)}`);
    await expect(page.getByTestId(`mobile-pilot-row-${c.id}`).locator('.mobile-row-flag')).toHaveText('Non current');
    await expect(page.getByTestId(`mobile-pilot-row-${d.id}`).locator('.mobile-row-flag')).toHaveCount(0);
    await page.getByTestId(`mobile-pilot-row-${a.id}`).click();
    const sheet = page.getByTestId('mobile-pilot-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Currency');
    await expect(sheet).toContainText(`Fino al ${formatDateOnly(TODAY, 'it')}`);
  });
});
