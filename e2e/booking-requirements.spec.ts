import { expect, test } from '@playwright/test';
import type { APIResponse, Browser, Page } from '@playwright/test';
import { seedAircraftRate } from './db-fixtures';
import {
  addDaysIso,
  ensureBookingRequirements,
  ensureValidSeedExpiries,
  ownFailures,
  registerExpiry,
  registerFlightOn,
  selectFromCombobox,
  todayRome,
  type E2eRequirementFailure,
} from './helpers';

/**
 * Story 19.10 — the requirements of a BOOKING (create, move, approve): the
 * four checks of a flight through story 19.9's one evaluation, the one 422
 * `REQUIREMENTS_NOT_MET`, the admin's deroga with `force` decided LAST, the
 * own-path blocked with the same list, and R-19-o (one human in two roles).
 *
 * Every subject is run-unique (AD-9 rule 3) and nothing here writes an
 * AppSettings key: the currency runs on the defaults (X = 1, Y = 90). A
 * blocking RATING is the one GLOBAL thing a test can need: it is created
 * non-blocking, registered, made blocking for the single request that reads
 * it and deactivated in a `finally` (`withBlockingRating`), so the window in
 * which it is a missing document of everybody else is one request wide — and
 * the failures every assertion reads go through `ownFailures` (the e2e
 * catalogue is shared, TD 16.2-g).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];
const OWN_PASSWORD = 'RequisitiPrenotazione123!';

if (!SEED_PASSWORD) {
  throw new Error('e2e/booking-requirements.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 };
const TODAY = todayRome();
/**
 * The day the API bookings below are made for: far ahead, so "at the flight
 * day" and "today" differ by years (Q-19.10-a = B — what is judged on today
 * cannot be passing by accident), and AFTER the `2031-03-*` piles of
 * `bookings.spec.ts`: the paginated, startsAt-ascending list other specs walk
 * page by page never gets these ~55 rows in front of theirs (measured: walks
 * timing out at 30 s on a twin DB run twice). Still inside the
 * `maxAdvanceDays` (3650) a used DB may carry.
 */
const D = '2032-06-15';
const at = (day: string, hhmm: string): string => `${day}T${hhmm}:00.000Z`;

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

type Person = { id: string; firstName: string; lastName: string; name: string };

/** A run-unique person with the given profiles and NOTHING else (no document, no fee, no flight, balance 0). */
async function createPerson(page: Page, profiles: Array<'pilot' | 'student' | 'instructor'>, lastNamePrefix = 'Req'): Promise<Person> {
  const suffix = uniqueSuffix();
  const firstName = 'Requisiti';
  const lastName = `${lastNamePrefix}-${suffix}`;
  const response = await page.request.post('/api/v1/people', {
    data: {
      firstName,
      lastName,
      profiles: {
        ...(profiles.includes('pilot') ? { pilot: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' } } : {}),
        ...(profiles.includes('student') ? { student: { courseStartDate: '2026-01-01' } } : {}),
        ...(profiles.includes('instructor') ? { instructor: {} } : {}),
      },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return { id: ((await response.json()) as { id: string }).id, firstName, lastName, name: `${firstName} ${lastName}` };
}

/** An instructor rate from today (the API refuses a past `validFrom`) — and the `instructorProfileId` it answers with, which no person read exposes. */
async function instructorProfileIdOf(page: Page, personId: string, priceCentsPerHour = 3000): Promise<string> {
  const response = await page.request.post(`/api/v1/people/${personId}/instructor-rates`, { data: { priceCentsPerHour, validFrom: TODAY } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { instructorProfileId: string }).instructorProfileId;
}

/** A run-unique aircraft; with `pilotPriceCents` a rate from `rateSince` (SQL fixture for a past date, story 19.3 D-7). */
async function createAircraft(page: Page, rate?: { pilotPriceCents: number; studentPriceCents?: number; since?: string }): Promise<{ id: string; registration: string }> {
  const registration = `I-RQ${uniqueSuffix()}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', { data: { registration, type: 'Ultraleggero 3 assi', model: 'Requisiti 19.10' } });
  expect(response.status(), await response.text()).toBe(201);
  const id = ((await response.json()) as { id: string }).id;
  if (rate) await seedAircraftRate(id, { pilotPriceCents: rate.pilotPriceCents, studentPriceCents: rate.studentPriceCents ?? rate.pilotPriceCents, validFrom: rate.since ?? '2020-01-01' });
  return { id, registration };
}

async function topUp(page: Page, personId: string, amountCents: number): Promise<void> {
  const response = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, { data: { amountCents, paymentMethod: 'CASH', effectiveDate: TODAY } });
  expect(response.status(), await response.text()).toBe(200);
}

async function membershipTypeId(page: Page): Promise<string> {
  return ((await (await page.request.get('/api/v1/expiry-types?kind=MEMBERSHIP')).json()) as Array<{ id: string }>)[0]!.id;
}

async function medicalTypes(page: Page): Promise<Array<{ id: string; name: string }>> {
  return (await (await page.request.get('/api/v1/expiry-types?kind=MEDICAL')).json()) as Array<{ id: string; name: string }>;
}

type BookingBody = { aircraftId: string; personId: string; instructorProfileId?: string; startsAt: string; endsAt: string; force?: boolean };

async function book(page: Page, data: BookingBody): Promise<APIResponse> {
  return page.request.post('/api/v1/bookings', { data });
}

async function bookingIdOf(response: APIResponse): Promise<string> {
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { booking: { id: string } }).booking.id;
}

/** The `details.failures` of a 422 `REQUIREMENTS_NOT_MET` (asserted), minus the missing documents of types other specs own (`ownFailures`). */
async function failuresOf(response: APIResponse, ownTypeNames: string[] = []): Promise<E2eRequirementFailure[]> {
  expect(response.status(), await response.text()).toBe(422);
  const error = ((await response.json()) as { error: { code: string; details: { failures: E2eRequirementFailure[] } } }).error;
  expect(error.code).toBe('REQUIREMENTS_NOT_MET');
  return ownFailures(error.details.failures, ownTypeNames);
}

/**
 * A PENDING booking reached with staff calls only (the idiom of
 * `mobile-overview.spec.ts`): born APPROVED (with `force`), moved to the same
 * clock time three days ago (FLOWN needs a started slot), FLOWN, reopened,
 * moved back.
 */
async function pendingBooking(page: Page, data: Omit<BookingBody, 'force'>): Promise<string> {
  const id = await bookingIdOf(await book(page, { ...data, force: true }));
  const past = (iso: string): string => `${addDaysIso(TODAY, -3)}${iso.slice(10)}`;
  expect((await page.request.patch(`/api/v1/bookings/${id}`, { data: { startsAt: past(data.startsAt), endsAt: past(data.endsAt), force: true } })).status()).toBe(200);
  for (const to of ['FLOWN', 'PENDING'] as const) {
    expect((await page.request.post(`/api/v1/bookings/${id}/transition`, { data: { to } })).status()).toBe(200);
  }
  expect((await page.request.patch(`/api/v1/bookings/${id}`, { data: { startsAt: data.startsAt, endsAt: data.endsAt, force: true } })).status()).toBe(200);
  return id;
}

async function bookingItem(page: Page, aircraftId: string, bookingId: string): Promise<{ status: string; forcedAt: string | null }> {
  const response = await page.request.get(`/api/v1/bookings?aircraftId=${aircraftId}&status=PENDING,APPROVED,DENIED,FLOWN,NO_SHOW,CANCELLED&pageSize=100`);
  const item = ((await response.json()) as { items: Array<{ id: string; status: string; forcedAt: string | null }> }).items.find((row) => row.id === bookingId);
  if (!item) throw new Error(`booking ${bookingId} not found on aircraft ${aircraftId}`);
  return item;
}

/**
 * A blocking RATING for the duration of `run` only (see the file's doc-comment):
 * created non-blocking (no missing-document scan reads it), the expiries
 * registered, made blocking, `run`, deactivated whatever happens.
 */
async function withBlockingRating<T>(page: Page, registrations: Array<{ personId: string; expiresAt: string }>, run: (typeName: string) => Promise<T>): Promise<T> {
  const name = `Zz rating prenotazioni ${uniqueSuffix()}`;
  const created = await page.request.post('/api/v1/expiry-types', { data: { name, scope: 'ALL', blocksBooking: false } });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  try {
    for (const registration of registrations) await registerExpiry(page, registration.personId, id, registration.expiresAt);
    expect((await page.request.patch(`/api/v1/expiry-types/${id}`, { data: { blocksBooking: true } })).status()).toBe(200);
    return await run(name);
  } finally {
    await page.request.patch(`/api/v1/expiry-types/${id}`, { data: { isActive: false } });
  }
}

type MailpitSummary = { ID: string; Subject: string };

async function inviteLink(email: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const search = (await (await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as { messages: MailpitSummary[] };
    const invite = search.messages.find((message) => message.Subject.includes('invitato'));
    if (invite) {
      const text = ((await (await fetch(`http://localhost:8025/api/v1/message/${invite.ID}`)).json()) as { Text: string }).Text;
      const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(text);
      if (!match) throw new Error(`Invite email had no /set-password link:\n${text}`);
      const url = new URL(match[1]!);
      return url.pathname + url.search;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No invite for ${email}`);
}

/** A login for `person` (role `role`) in a context of its own, logged in. */
async function ownPage(browser: Browser, adminPage: Page, person: Person, role: 'PILOT' | 'INSTRUCTOR'): Promise<Page> {
  const email = `req-${role.toLowerCase()}-${uniqueSuffix()}@airmanager.local`;
  const user = await adminPage.request.post('/api/v1/users', { data: { email, roles: [role], personId: person.id } });
  expect(user.status(), await user.text()).toBe(201);
  const page = await (await browser.newContext()).newPage();
  await page.goto(await inviteLink(email));
  await page.getByLabel('Nuova password').fill(OWN_PASSWORD);
  await page.getByLabel('Conferma password').fill(OWN_PASSWORD);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();
  await loginExpectingDashboard(page, email, OWN_PASSWORD);
  return page;
}

test.describe('Story 19.10 — the four checks on a booking (AC 6-11-bis)', () => {
  test('EXPIRY: a blocking rating expiring BETWEEN today and the flight day fails (documents at D), a deactivated type never does, a missing visit is "mancante", the instructor\'s only visit expired is his (AC 6a-d, AC 7)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPerson(page, ['pilot']);
    const visits = await medicalTypes(page);

    await withBlockingRating(page, [{ personId: pilot.id, expiresAt: addDaysIso(TODAY, 2) }], async (typeName) => {
      const failures = await failuresOf(await book(page, { aircraftId: aircraft.id, personId: pilot.id, startsAt: at(D, '09:00'), endsAt: at(D, '10:00') }), [typeName]);
      const expiry = failures.filter((failure) => failure.type === 'EXPIRY');
      // (a) + AC 7: still valid today, expired on the flight day. (c): no visit at all = the medical requirement "mancante".
      expect(expiry).toEqual([
        { type: 'EXPIRY', role: 'person', personName: pilot.name, typeName, expiresAt: addDaysIso(TODAY, 2) },
        // The ONE medical requirement, named after every active visit type (19.7a D-4).
        { type: 'EXPIRY', role: 'person', personName: pilot.name, typeName: expect.stringContaining('Visita medica'), expiresAt: null },
      ]);
    });

    // (d) the same rating on a DEACTIVATED type (16.4 P1 on the booking path): no failure at all.
    const name = `Zz rating disattivato ${uniqueSuffix()}`;
    const created = await page.request.post('/api/v1/expiry-types', { data: { name, scope: 'ALL', blocksBooking: false } });
    const typeId = ((await created.json()) as { id: string }).id;
    await registerExpiry(page, pilot.id, typeId, '2020-06-01');
    expect((await page.request.patch(`/api/v1/expiry-types/${typeId}`, { data: { blocksBooking: true, isActive: false } })).status()).toBe(200);
    const withInactive = await failuresOf(await book(page, { aircraftId: aircraft.id, personId: pilot.id, startsAt: at(D, '11:00'), endsAt: at(D, '12:00') }), [name]);
    expect(withInactive.filter((failure) => failure.typeName === name)).toEqual([]);

    // (b) an instructor whose ONLY visit expired: his EXPIRY, labelled as the instructor's (before this story, nothing).
    const instructor = await createPerson(page, ['instructor']);
    await registerExpiry(page, instructor.id, visits[0]!.id, '2020-06-01');
    const instructorProfileId = await instructorProfileIdOf(page, instructor.id);
    const dual = await failuresOf(await book(page, { aircraftId: aircraft.id, personId: pilot.id, instructorProfileId, startsAt: at(D, '13:00'), endsAt: at(D, '14:00') }));
    expect(dual.filter((failure) => failure.type === 'EXPIRY' && failure.role === 'instructor')).toEqual([
      { type: 'EXPIRY', role: 'instructor', personName: instructor.name, typeName: visits[0]!.name, expiresAt: '2020-06-01' },
    ]);
  });

  test('CURRENCY, judged on TODAY (Q-19.10-a = B), on a booking without an instructor only: 91 days fails, 90 does not, 85 days with a booking far ahead does not; a dual and an instructor-only person never (AC 8)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const flightAircraft = await createAircraft(page, { pilotPriceCents: 9000 });
    const aircraft = await createAircraft(page);
    const pilotAt = async (daysAgo: number): Promise<Person> => {
      const pilot = await createPerson(page, ['pilot']);
      await registerFlightOn(page, { aircraftId: flightAircraft.id, personId: pilot.id, flightType: 'TOURISM', date: addDaysIso(TODAY, -daysAgo), noCharge: true });
      return pilot;
    };
    const currencyOf = async (response: APIResponse): Promise<E2eRequirementFailure[]> => (await failuresOf(response)).filter((failure) => failure.type === 'CURRENCY');

    // (a) the last flight 91 days ago, a solo: CURRENCY.
    const lapsed = await pilotAt(91);
    expect(await currencyOf(await book(page, { aircraftId: aircraft.id, personId: lapsed.id, startsAt: at(D, '07:00'), endsAt: at(D, '08:00') }))).toEqual([
      { type: 'CURRENCY', role: 'person', personName: lapsed.name, lastFlightDate: addDaysIso(TODAY, -91), daysSinceLastFlight: 91, flightsInWindow: 0, minFlights: 1, windowDays: 90 },
    ]);
    // (b) the same pilot WITH an instructor is a dual: no currency.
    const instructor = await createPerson(page, ['instructor']);
    const instructorProfileId = await instructorProfileIdOf(page, instructor.id);
    expect(await currencyOf(await book(page, { aircraftId: aircraft.id, personId: lapsed.id, instructorProfileId, startsAt: at(D, '09:00'), endsAt: at(D, '10:00') }))).toEqual([]);
    // (c) 90 days: still current (the boundary).
    const boundary = await pilotAt(90);
    expect(await currencyOf(await book(page, { aircraftId: aircraft.id, personId: boundary.id, startsAt: at(D, '11:00'), endsAt: at(D, '12:00') }))).toEqual([]);
    // (e) anchored on TODAY: 85 days ago, a solo booked far ahead (hundreds of days at D) still passes.
    const anchored = await pilotAt(85);
    expect(await currencyOf(await book(page, { aircraftId: aircraft.id, personId: anchored.id, startsAt: at(D, '13:00'), endsAt: at(D, '14:00') }))).toEqual([]);
    // (d) an instructor-only person booked for himself is no currency subject.
    const instructorOnly = await createPerson(page, ['instructor']);
    expect(await currencyOf(await book(page, { aircraftId: aircraft.id, personId: instructorOnly.id, startsAt: at(D, '15:00'), endsAt: at(D, '16:00') }))).toEqual([]);
  });

  test('BALANCE against the ESTIMATED cost: 90 minutes at 150,00 €/h plus an instructor at 40,00 €/h = 285,00 €; 284,99 € fails, one cent more covers it (AC 9)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, { pilotPriceCents: 15000, studentPriceCents: 9000 });
    const pilot = await createPerson(page, ['pilot']);
    const instructor = await createPerson(page, ['instructor']);
    const instructorProfileId = await instructorProfileIdOf(page, instructor.id, 4000);
    await topUp(page, pilot.id, 28_499);
    const body = { aircraftId: aircraft.id, personId: pilot.id, instructorProfileId, startsAt: at(D, '09:00'), endsAt: at(D, '10:30') };

    const short = await failuresOf(await book(page, body));
    expect(short.filter((failure) => failure.type === 'BALANCE')).toEqual([{ type: 'BALANCE', role: 'person', personName: pilot.name, balanceCents: 28_499, costCents: 28_500 }]);

    await topUp(page, pilot.id, 1);
    const covered = await failuresOf(await book(page, body));
    expect(covered.filter((failure) => failure.type === 'BALANCE')).toEqual([]);
  });

  test('MEMBERSHIP: never paid is the person\'s with expiresAt null, an expired fee of the instructor is his with its date (Q-19.9-a); judged on TODAY: a fee expiring in 5 days passes a booking far ahead, one expired yesterday fails whatever the day (AC 10, AC 11-bis)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const feeType = await membershipTypeId(page);
    const membershipOf = async (response: APIResponse): Promise<E2eRequirementFailure[]> => (await failuresOf(response)).filter((failure) => failure.type === 'MEMBERSHIP');

    const neverPaid = await createPerson(page, ['pilot']);
    const instructor = await createPerson(page, ['instructor']);
    await registerExpiry(page, instructor.id, feeType, addDaysIso(TODAY, -30));
    const instructorProfileId = await instructorProfileIdOf(page, instructor.id);
    expect(await membershipOf(await book(page, { aircraftId: aircraft.id, personId: neverPaid.id, instructorProfileId, startsAt: at(D, '09:00'), endsAt: at(D, '10:00') }))).toEqual([
      { type: 'MEMBERSHIP', role: 'person', personName: neverPaid.name, expiresAt: null },
      { type: 'MEMBERSHIP', role: 'instructor', personName: instructor.name, expiresAt: addDaysIso(TODAY, -30) },
    ]);

    const soonExpiring = await createPerson(page, ['pilot']);
    await registerExpiry(page, soonExpiring.id, feeType, addDaysIso(TODAY, 5));
    expect(await membershipOf(await book(page, { aircraftId: aircraft.id, personId: soonExpiring.id, startsAt: at(D, '11:00'), endsAt: at(D, '12:00') }))).toEqual([]);

    const expired = await createPerson(page, ['pilot']);
    await registerExpiry(page, expired.id, feeType, addDaysIso(TODAY, -1));
    for (const day of [addDaysIso(TODAY, 1), D]) {
      expect(await membershipOf(await book(page, { aircraftId: aircraft.id, personId: expired.id, startsAt: at(day, '13:00'), endsAt: at(day, '14:00') }))).toEqual([
        { type: 'MEMBERSHIP', role: 'person', personName: expired.name, expiresAt: addDaysIso(TODAY, -1) },
      ]);
    }
  });

  test('all four at once: ONE 422 listing EXPIRY, MEMBERSHIP, CURRENCY and BALANCE, in the shared order (AC 11)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, { pilotPriceCents: 12000 });
    const pilot = await createPerson(page, ['pilot']);

    await withBlockingRating(page, [{ personId: pilot.id, expiresAt: '2020-06-01' }], async (typeName) => {
      const failures = await failuresOf(await book(page, { aircraftId: aircraft.id, personId: pilot.id, startsAt: at(D, '09:00'), endsAt: at(D, '10:00') }), [typeName]);
      expect(failures.map((failure) => failure.type).filter((type, index, all) => all.indexOf(type) === index)).toEqual(['EXPIRY', 'MEMBERSHIP', 'CURRENCY', 'BALANCE']);
      expect(failures[0]).toMatchObject({ type: 'EXPIRY', typeName, expiresAt: '2020-06-01' });
      expect(failures.at(-1)).toEqual({ type: 'BALANCE', role: 'person', personName: pilot.name, balanceCents: 0, costCents: 12_000 });
    });
  });
});

test.describe('Story 19.10 — who derogates, and where the deroga sits (AC 3, 4, 12, 14-16, 21)', () => {
  test('admin: create, move and approval each answer 422 and pass with force: true, stamping forcedAt; force with nothing to derogate stamps nothing (AC 4, 14)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPerson(page, ['pilot']);
    const body = { aircraftId: aircraft.id, personId: pilot.id, startsAt: at(D, '09:00'), endsAt: at(D, '10:00') };

    await failuresOf(await book(page, body));
    const created = await book(page, { ...body, force: true });
    const createdId = await bookingIdOf(created);
    expect(((await created.json()) as { booking: { status: string; forcedAt: string | null } }).booking).toMatchObject({ status: 'APPROVED', forcedAt: expect.any(String) });

    const moveBody = { startsAt: at(D, '11:00'), endsAt: at(D, '12:00') };
    await failuresOf(await page.request.patch(`/api/v1/bookings/${createdId}`, { data: moveBody }));
    const moved = await page.request.patch(`/api/v1/bookings/${createdId}`, { data: { ...moveBody, force: true } });
    expect(moved.status(), await moved.text()).toBe(200);

    // A person "in regola": force with nothing to derogate writes no stamp.
    // Only a sibling spec's blocking type made active in between could stamp
    // it (TD 16.2-g): then the person is covered again and the request resent
    // on a free slot — never when the cover found nothing new (the stamp is
    // then real, and the assertion fails).
    const inRegola = await createPerson(page, ['pilot']);
    await ensureBookingRequirements(page, { personId: inRegola.id, scope: 'PILOTS', solo: true });
    let forcedAt: string | null = null;
    for (const hour of ['13', '15', '17']) {
      const clean = await book(page, { aircraftId: aircraft.id, personId: inRegola.id, startsAt: at(D, `${hour}:00`), endsAt: at(D, `${hour}:30`), force: true });
      expect(clean.status(), await clean.text()).toBe(201);
      forcedAt = ((await clean.json()) as { booking: { forcedAt: string | null } }).booking.forcedAt;
      if (forcedAt === null || (await ensureValidSeedExpiries(page, inRegola.id, 'PILOTS')) === 0) break;
    }
    expect(forcedAt).toBeNull();
  });

  test('approval of a PENDING whose balance dropped after it was booked: 422, then force -> APPROVED with the stamp; "riapri" keeps the stamp (AC 4, AC 12b)', async ({ page, browser }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    // 1 000,00 €/h: one hour is 100 000, the fresh pilot holds 400 000 after `ensureBookingRequirements`.
    const aircraft = await createAircraft(page, { pilotPriceCents: 100_000, since: TODAY });
    const pilot = await createPerson(page, ['pilot']);
    await ensureBookingRequirements(page, { personId: pilot.id, scope: 'PILOTS', solo: true });
    const pilotPage = await ownPage(browser, page, pilot, 'PILOT');
    const bookingId = await bookingIdOf(await book(pilotPage, { aircraftId: aircraft.id, personId: pilot.id, startsAt: at(D, '09:00'), endsAt: at(D, '10:00') }));
    expect(await bookingItem(page, aircraft.id, bookingId)).toEqual(expect.objectContaining({ status: 'PENDING', forcedAt: null }));
    await pilotPage.context().close();

    const adjustment = await page.request.post(`/api/v1/people/${pilot.id}/account/adjustments`, { data: { amountCents: -350_000, reason: 'Rettifica di prova 19.10' } });
    expect(adjustment.status(), await adjustment.text()).toBe(200);

    const refused = await failuresOf(await page.request.post(`/api/v1/bookings/${bookingId}/transition`, { data: { to: 'APPROVED' } }));
    expect(refused.filter((failure) => failure.type === 'BALANCE')).toEqual([{ type: 'BALANCE', role: 'person', personName: pilot.name, balanceCents: 50_000, costCents: 100_000 }]);
    const approved = await page.request.post(`/api/v1/bookings/${bookingId}/transition`, { data: { to: 'APPROVED', force: true } });
    expect(approved.status(), await approved.text()).toBe(200);
    const stamp = (await bookingItem(page, aircraft.id, bookingId)).forcedAt;
    expect(stamp).not.toBeNull();

    // `force` only on an approval (schema refine): never silently ignored elsewhere.
    const deniedWithForce = await page.request.post(`/api/v1/bookings/${bookingId}/transition`, { data: { to: 'DENIED', reason: 'x', force: true } });
    expect(deniedWithForce.status()).toBe(422);
    expect(((await deniedWithForce.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  test('own path: a pilot is blocked with the list, an instructor for himself and for an allievo too (their failures and the allievo\'s); force from any of them is a 403 on create AND on move; a self-booking with an instructor stays a 422 (AC 3, 15, 16)', async ({ page, browser }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPerson(page, ['pilot']);
    const instructor = await createPerson(page, ['instructor']);
    const student = await createPerson(page, ['student']);
    const instructorProfileId = await instructorProfileIdOf(page, instructor.id);

    const pilotPage = await ownPage(browser, page, pilot, 'PILOT');
    const ownBody = { aircraftId: aircraft.id, personId: pilot.id, startsAt: at(D, '09:00'), endsAt: at(D, '10:00') };
    const pilotFailures = await failuresOf(await book(pilotPage, ownBody));
    expect(pilotFailures.map((failure) => failure.type)).toEqual(expect.arrayContaining(['MEMBERSHIP', 'CURRENCY']));
    expect((await book(pilotPage, { ...ownBody, force: true })).status()).toBe(403);
    // R-19-l, pinned: a self-booking never carries an instructor.
    const withInstructor = await book(pilotPage, { ...ownBody, instructorProfileId });
    expect(withInstructor.status()).toBe(422);
    expect(((await withInstructor.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // A booking of the pilot made by the admin (forced), then moved by its owner: blocked, and force is a 403 before anything is read.
    const ownedId = await bookingIdOf(await book(page, { ...ownBody, force: true }));
    await failuresOf(await pilotPage.request.patch(`/api/v1/bookings/${ownedId}`, { data: { notes: 'sposta' } }));
    expect((await pilotPage.request.patch(`/api/v1/bookings/${ownedId}`, { data: { notes: 'sposta', force: true } })).status()).toBe(403);
    await pilotPage.context().close();

    const instructorPage = await ownPage(browser, page, instructor, 'INSTRUCTOR');
    const forSelf = { aircraftId: aircraft.id, personId: instructor.id, startsAt: at(D, '11:00'), endsAt: at(D, '12:00') };
    expect((await failuresOf(await book(instructorPage, forSelf))).map((failure) => failure.type)).toContain('MEMBERSHIP');
    expect((await book(instructorPage, { ...forSelf, force: true })).status()).toBe(403);

    const forStudent = { aircraftId: aircraft.id, personId: student.id, instructorProfileId, startsAt: at(D, '13:00'), endsAt: at(D, '14:00') };
    const schoolFailures = await failuresOf(await book(instructorPage, forStudent));
    expect(schoolFailures.filter((failure) => failure.type === 'MEMBERSHIP')).toEqual([
      { type: 'MEMBERSHIP', role: 'person', personName: student.name, expiresAt: null },
      { type: 'MEMBERSHIP', role: 'instructor', personName: instructor.name, expiresAt: null },
    ]);
    expect((await book(instructorPage, { ...forStudent, force: true })).status()).toBe(403);
    await instructorPage.context().close();
  });

  test('an instructor who IS the person: 422 INSTRUCTOR_SAME_AS_PILOT, with or without force (D-8, AC 21)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const both = await createPerson(page, ['pilot', 'instructor']);
    const instructorProfileId = await instructorProfileIdOf(page, both.id);
    for (const force of [false, true]) {
      const response = await book(page, { aircraftId: aircraft.id, personId: both.id, instructorProfileId, startsAt: at(D, '09:00'), endsAt: at(D, '10:00'), force });
      expect(response.status()).toBe(422);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('INSTRUCTOR_SAME_AS_PILOT');
    }
  });
});

test.describe('Story 19.10 — R-19-o: one human, one place, in either role (AC 17, 18, 20)', () => {
  test('PERSON_BUSY across roles: P the instructor of an APPROVED booking on A cannot be the person of an overlapping one on B — create, move, approval; touching is free; a PENDING never blocks (AC 17)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraftA = await createAircraft(page);
    const aircraftB = await createAircraft(page);
    // C keeps the touching booking off B: on B it would be the AIRCRAFT 409 of the approval below, which comes first.
    const aircraftC = await createAircraft(page);
    const p = await createPerson(page, ['pilot', 'instructor']);
    const student = await createPerson(page, ['student']);
    const pProfileId = await instructorProfileIdOf(page, p.id);

    // P's own PENDING on B, built BEFORE A exists: only an APPROVED booking occupies a slot.
    const pending = await pendingBooking(page, { aircraftId: aircraftB.id, personId: p.id, startsAt: at(D, '10:30'), endsAt: at(D, '11:30') });
    const onA = await bookingIdOf(await book(page, { aircraftId: aircraftA.id, personId: student.id, instructorProfileId: pProfileId, startsAt: at(D, '10:00'), endsAt: at(D, '11:00'), force: true }));
    const personBusy = { code: 'PERSON_BUSY', message: 'This person already has an approved booking for an overlapping interval.', details: { bookingId: onA, startsAt: at(D, '10:00'), endsAt: at(D, '11:00') } };

    const create = await book(page, { aircraftId: aircraftB.id, personId: p.id, startsAt: at(D, '10:30'), endsAt: at(D, '11:30'), force: true });
    expect(create.status()).toBe(409);
    expect(((await create.json()) as { error: unknown }).error).toEqual(personBusy);

    const touching = await bookingIdOf(await book(page, { aircraftId: aircraftC.id, personId: p.id, startsAt: at(D, '11:00'), endsAt: at(D, '12:00'), force: true }));
    const move = await page.request.patch(`/api/v1/bookings/${touching}`, { data: { startsAt: at(D, '10:45'), endsAt: at(D, '11:45'), force: true } });
    expect(move.status()).toBe(409);
    expect(((await move.json()) as { error: unknown }).error).toEqual(personBusy);

    const approval = await page.request.post(`/api/v1/bookings/${pending}/transition`, { data: { to: 'APPROVED', force: true } });
    expect(approval.status()).toBe(409);
    expect(((await approval.json()) as { error: unknown }).error).toEqual(personBusy);
  });

  test('INSTRUCTOR_BUSY across roles: P the person of an APPROVED booking on A cannot be the instructor of an overlapping one on B — create, move, approval (AC 18)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraftA = await createAircraft(page);
    const aircraftB = await createAircraft(page);
    const aircraftC = await createAircraft(page);
    const p = await createPerson(page, ['pilot', 'instructor']);
    const studentOne = await createPerson(page, ['student']);
    const studentTwo = await createPerson(page, ['student']);
    const pProfileId = await instructorProfileIdOf(page, p.id);

    const pending = await pendingBooking(page, { aircraftId: aircraftB.id, personId: studentOne.id, instructorProfileId: pProfileId, startsAt: at(D, '10:30'), endsAt: at(D, '11:30') });
    const onA = await bookingIdOf(await book(page, { aircraftId: aircraftA.id, personId: p.id, startsAt: at(D, '10:00'), endsAt: at(D, '11:00'), force: true }));
    const instructorBusy = { code: 'INSTRUCTOR_BUSY', message: 'This instructor already has an approved booking for an overlapping interval.', details: { bookingId: onA, startsAt: at(D, '10:00'), endsAt: at(D, '11:00') } };

    const create = await book(page, { aircraftId: aircraftB.id, personId: studentTwo.id, instructorProfileId: pProfileId, startsAt: at(D, '10:15'), endsAt: at(D, '10:45'), force: true });
    expect(create.status()).toBe(409);
    expect(((await create.json()) as { error: unknown }).error).toEqual(instructorBusy);

    const touching = await bookingIdOf(await book(page, { aircraftId: aircraftC.id, personId: studentTwo.id, instructorProfileId: pProfileId, startsAt: at(D, '11:00'), endsAt: at(D, '12:00'), force: true }));
    const move = await page.request.patch(`/api/v1/bookings/${touching}`, { data: { startsAt: at(D, '10:45'), endsAt: at(D, '11:45'), force: true } });
    expect(move.status()).toBe(409);
    expect(((await move.json()) as { error: unknown }).error).toEqual(instructorBusy);

    const approval = await page.request.post(`/api/v1/bookings/${pending}/transition`, { data: { to: 'APPROVED', force: true } });
    expect(approval.status()).toBe(409);
    expect(((await approval.json()) as { error: unknown }).error).toEqual(instructorBusy);
  });

  test('concurrency probe: P person of a PENDING on A and instructor of an overlapping PENDING on B, approved in PARALLEL — exactly [200, 409], 10 times out of 10 (AC 20)', async ({ page }) => {
    test.slow();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraftA = await createAircraft(page);
    const aircraftB = await createAircraft(page);
    const p = await createPerson(page, ['pilot', 'instructor']);
    const student = await createPerson(page, ['student']);
    const pProfileId = await instructorProfileIdOf(page, p.id);

    const outcomes: number[][] = [];
    for (let round = 0; round < 10; round += 1) {
      const day = addDaysIso(D, round);
      // Built one after the other on DISJOINT slots (an APPROVED fixture would
      // otherwise collide with its sibling), then both moved onto 10:00-11:00.
      const asPerson = await pendingBooking(page, { aircraftId: aircraftA.id, personId: p.id, startsAt: at(day, '06:00'), endsAt: at(day, '07:00') });
      const asInstructor = await pendingBooking(page, { aircraftId: aircraftB.id, personId: student.id, instructorProfileId: pProfileId, startsAt: at(day, '08:00'), endsAt: at(day, '09:00') });
      for (const id of [asPerson, asInstructor]) {
        expect((await page.request.patch(`/api/v1/bookings/${id}`, { data: { startsAt: at(day, '10:00'), endsAt: at(day, '11:00'), force: true } })).status()).toBe(200);
      }
      const responses = await Promise.all([asPerson, asInstructor].map((id) => page.request.post(`/api/v1/bookings/${id}/transition`, { data: { to: 'APPROVED', force: true } })));
      const statuses = responses.map((response) => response.status());
      outcomes.push(statuses);
      const loser = statuses.indexOf(409);
      if (loser !== -1) {
        const code = ((await responses[loser]!.json()) as { error: { code: string } }).error.code;
        expect(['PERSON_BUSY', 'INSTRUCTOR_BUSY']).toContain(code);
      }
      // The invariant itself, read back: one of the two APPROVED, never both.
      const approved = [(await bookingItem(page, aircraftA.id, asPerson)).status, (await bookingItem(page, aircraftB.id, asInstructor)).status].filter((status) => status === 'APPROVED');
      expect(approved).toHaveLength(1);
    }
    expect(outcomes.map((statuses) => statuses.slice().sort())).toEqual(Array.from({ length: 10 }, () => [200, 409]));
  });
});

/** The bookings list row of `registration`, walked page by page (the list is `startsAt asc`, never assumed page 1 — `bookings.spec.ts#findBookingRow`). */
async function findBookingRow(page: Page, registration: string): Promise<ReturnType<Page['getByTestId']>> {
  for (let pageNumber = 1; pageNumber <= 50; pageNumber += 1) {
    await page.goto(`/it/dashboard/bookings?page=${pageNumber}`);
    await page.waitForLoadState('networkidle');
    const row = page.getByTestId('booking-row').filter({ hasText: registration });
    if ((await row.count()) > 0) return row;
    const status = page.getByTestId('booking-pagination-status');
    if ((await status.count()) === 0) break;
    const [current, total] = ((await status.textContent()) ?? '1/1').split('/').map((part) => Number(part.trim()));
    if (!Number.isFinite(total) || current! >= total!) break;
  }
  throw new Error(`booking row ${registration} not found`);
}

/** The phone card of `registration` in the bookings list, same walk. */
async function findMobileCard(page: Page, registration: string): Promise<ReturnType<Page['getByTestId']>> {
  for (let pageNumber = 1; pageNumber <= 50; pageNumber += 1) {
    await page.goto(`/it/dashboard/bookings?page=${pageNumber}`);
    await page.waitForLoadState('networkidle');
    const card = page.getByTestId('booking-row-mobile').filter({ hasText: registration });
    if ((await card.count()) > 0) return card;
    const status = page.getByTestId('booking-pagination-status');
    if ((await status.count()) === 0) break;
    const [current, total] = ((await status.innerText()) ?? '1/1').split('/').map((part) => Number(part.trim()));
    if (!Number.isFinite(total) || current! >= total!) break;
  }
  throw new Error(`booking card ${registration} not found`);
}

/**
 * The day after tomorrow, 07:00Z: inside every window the suite ever sets,
 * early in the startsAt-ascending PENDING card of the Panoramica — and AFTER
 * tomorrow, whose first page `home-dashboard.spec.ts` and
 * `mobile-overview.spec.ts` read (a fixture of this file there crowded their
 * own off the 8-row card: measured on the first run).
 */
function uiSlot(): { startsAt: string; endsAt: string } {
  const day = addDaysIso(TODAY, 2);
  return { startsAt: at(day, '07:00'), endsAt: at(day, '07:30') };
}

test.describe('Story 19.10 — the one warning on every booking surface (AC 25-28)', () => {
  test('the resend of «Procedi comunque» meeting a race: an aircraft booked meanwhile, a person busy meanwhile, an aircraft grounded meanwhile — each closes the warning and says why in the banner, never "Riprova" (AC 25)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const reason = `Ispezione ${uniqueSuffix()}`;
    // Alphabetically early: the staff picker lists the first 100 people by lastName.
    const pilot = await createPerson(page, ['pilot'], '0Req');
    const other = await createPerson(page, ['pilot']);
    const label = `${pilot.lastName} ${pilot.firstName}`;

    const scenarios: Array<{ prepare: (aircraftId: string, day: string) => Promise<void>; message: string }> = [
      {
        // 06:30-12:00Z covers the form's LOCAL 09:00-10:00 in UTC and in Europe/Rome alike.
        prepare: async (aircraftId, day) => void (await bookingIdOf(await book(page, { aircraftId, personId: other.id, startsAt: at(day, '06:30'), endsAt: at(day, '12:00'), force: true }))),
        message: 'Il velivolo è già prenotato per un intervallo che si sovrappone a questo.',
      },
      {
        prepare: async (_aircraftId, day) => {
          const elsewhere = await createAircraft(page);
          await bookingIdOf(await book(page, { aircraftId: elsewhere.id, personId: pilot.id, startsAt: at(day, '06:30'), endsAt: at(day, '12:00'), force: true }));
        },
        message: 'Questa persona ha già una prenotazione approvata che si sovrappone a questo intervallo.',
      },
      {
        prepare: async (aircraftId) => {
          expect((await page.request.post(`/api/v1/aircraft/${aircraftId}/out-of-service`, { data: { reason } })).status()).toBe(200);
        },
        message: `Il velivolo è fuori servizio: ${reason}.`,
      },
    ];

    for (const [index, scenario] of scenarios.entries()) {
      const aircraft = await createAircraft(page);
      const day = addDaysIso(D, 20 + index);
      await page.goto('/it/dashboard/bookings');
      await page.waitForLoadState('networkidle');
      await page.getByTestId('new-booking-button').click();
      const form = page.getByTestId('new-booking-form');
      await selectFromCombobox(form.getByLabel('Velivolo'), aircraft.registration, aircraft.registration);
      await selectFromCombobox(form.getByLabel('Pilota o allievo'), label, label);
      await form.getByLabel('Inizio').fill(`${day}T09:00`);
      await form.getByLabel('Fine', { exact: true }).fill(`${day}T10:00`);
      await form.getByRole('button', { name: 'Prenota' }).click();

      const warning = form.getByTestId('requirements-warning');
      await expect(warning).toBeVisible();
      await scenario.prepare(aircraft.id, day);
      await warning.getByTestId('requirements-proceed').click();

      const banner = page.getByTestId('booking-form-error');
      await expect(banner).toHaveText(scenario.message);
      await expect(banner).toBeFocused();
      await expect(form.getByTestId('requirements-warning')).toHaveCount(0);
      await expect(form.getByTestId('requirements-proceed-error')).toHaveCount(0);
      // Leaves the panel for the next scenario (never with Escape: CLAUDE.md).
      await form.getByRole('button', { name: 'Annulla' }).click();
    }
  });

  test('the move form: the admin gets the warning and «Procedi comunque» moves the booking (200, AC 26)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPerson(page, ['pilot']);
    const slot = uiSlot();
    const bookingId = await bookingIdOf(await book(page, { aircraftId: aircraft.id, personId: pilot.id, ...slot, force: true }));

    const row = await findBookingRow(page, aircraft.registration);
    await row.getByTestId('booking-move-action').click();
    const moveForm = page.getByTestId('move-booking-form');
    await moveForm.getByLabel('Note', { exact: true }).fill('Spostata con deroga');
    await moveForm.getByTestId('move-booking-save').click();

    const warning = moveForm.getByTestId('requirements-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('La prenotazione non rispetta alcuni requisiti');
    // «Annulla» gives the focus back to «Salva» (review 19.9 F3), the form intact.
    await warning.getByTestId('requirements-cancel').click();
    await expect(moveForm.getByTestId('move-booking-save')).toBeFocused();
    await moveForm.getByTestId('move-booking-save').click();
    await moveForm.getByTestId('requirements-warning').getByTestId('requirements-proceed').click();

    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione modificata.' })).toBeVisible();
    const after = await page.request.get(`/api/v1/bookings?aircraftId=${aircraft.id}&pageSize=10`);
    const item = ((await after.json()) as { items: Array<{ id: string; notes: string | null }> }).items.find((candidate) => candidate.id === bookingId);
    expect(item?.notes).toBe('Spostata con deroga');
  });

  test('desktop approval: «Approva» on a PENDING that fails opens the modal with the list; «Annulla» leaves it PENDING; «Procedi comunque» approves it (AC 27)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const pilot = await createPerson(page, ['pilot']);
    const bookingId = await pendingBooking(page, { aircraftId: aircraft.id, personId: pilot.id, ...uiSlot() });

    let row = await findBookingRow(page, aircraft.registration);
    await row.getByTestId('booking-approve-action').click();
    const modal = page.getByTestId('booking-requirements-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("L'approvazione non rispetta alcuni requisiti");
    await expect(modal.locator('[data-testid="requirements-warning-item"][data-type="MEMBERSHIP"]')).toHaveText(`${pilot.name} (pilota/allievo) — Quota associativa mai pagata`);
    await expect(page.getByTestId('toast')).toHaveCount(0);

    await modal.getByTestId('requirements-cancel').click();
    await expect(modal).toHaveCount(0);
    await expect(row.getByTestId('booking-approve-action')).toBeFocused();
    expect((await bookingItem(page, aircraft.id, bookingId)).status).toBe('PENDING');

    await row.getByTestId('booking-approve-action').click();
    await page.getByTestId('booking-requirements-modal').getByTestId('requirements-proceed').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione approvata.' })).toBeVisible();
    await expect(page.getByTestId('booking-requirements-modal')).toHaveCount(0);
    row = await findBookingRow(page, aircraft.registration);
    await expect(row).toContainText('Approvato');
  });

  test('phone approval, from the bookings list sheet AND from the Panoramica sheet: a step with the list, the focus on its first button, «Procedi comunque» approves and closes the sheet (AC 28)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);

    // --- the bookings list -------------------------------------------------
    const listAircraft = await createAircraft(page);
    const listPilot = await createPerson(page, ['pilot']);
    const listBooking = await pendingBooking(page, { aircraftId: listAircraft.id, personId: listPilot.id, ...uiSlot() });
    await (await findMobileCard(page, listAircraft.registration)).click();
    const sheet = page.getByTestId('mobile-booking-sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByTestId('booking-approve-action-mobile').click();
    const step = sheet.getByTestId('booking-requirements-step-mobile');
    await expect(step).toBeVisible();
    await expect(step.locator('[data-testid="requirements-warning-item"][data-type="MEMBERSHIP"]')).toHaveCount(1);
    const proceed = step.getByTestId('requirements-proceed');
    await expect(proceed).toBeFocused();
    expect(await proceed.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(43.5);
    await expect(page.getByTestId('toast')).toHaveCount(0);
    await proceed.click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId('toast').filter({ hasText: 'Prenotazione approvata.' })).toBeVisible();
    expect((await bookingItem(page, listAircraft.id, listBooking)).status).toBe('APPROVED');

    // --- the Panoramica ----------------------------------------------------
    const overviewAircraft = await createAircraft(page);
    const overviewPilot = await createPerson(page, ['pilot']);
    const overviewBooking = await pendingBooking(page, { aircraftId: overviewAircraft.id, personId: overviewPilot.id, ...uiSlot() });
    await page.goto('/it/dashboard');
    const card = page.getByTestId('mobile-overview-pending-row').filter({ hasText: overviewPilot.lastName });
    await expect(card).toHaveCount(1);
    await card.click();
    const overviewSheet = page.getByTestId('mobile-booking-sheet');
    await overviewSheet.getByTestId('mobile-overview-approve').click();
    const overviewStep = overviewSheet.getByTestId('mobile-overview-requirements');
    await expect(overviewStep).toBeVisible();
    await expect(overviewStep.locator('[data-testid="requirements-warning-item"][data-type="MEMBERSHIP"]')).toHaveCount(1);
    await expect(overviewStep.getByTestId('requirements-proceed')).toBeFocused();
    await overviewStep.getByTestId('requirements-proceed').click();
    await expect(overviewSheet).toHaveCount(0);
    expect((await bookingItem(page, overviewAircraft.id, overviewBooking)).status).toBe('APPROVED');
  });
});
