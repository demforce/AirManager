import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ensureValidSeedExpiries } from './helpers';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/aircraft-out-of-service-until.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Story AOG-1a — `Aircraft.outOfServiceUntil`, its two ratified surfaces
 * (the Disponibilità editor and the three enriched `AIRCRAFT_OUT_OF_SERVICE`
 * 422s) and the flight-registration guard with its admin deroga.
 *
 * **Isolation (AC 17)**: grounding an aircraft is GLOBAL state, but every test
 * here creates its OWN run-unique aircraft and grounds THAT one — the exact
 * discipline the three pre-existing specs that ground aircraft already follow
 * (`bookings.spec.ts`, `mobile-planning.spec.ts`, `mobile-registries.spec.ts`,
 * all in the main `fullyParallel` project). Nothing here reads a GLOBAL
 * aggregate, so this file needs no serialized project. The ONE guard that does
 * read one — the Panoramica's fleet-wide AOG count, AC 13 — lives in its own
 * serialized project instead (`aog-overview-count.spec.ts`).
 *
 * **Dates (AC 17)**: every fixture date is COMPUTED relative to "now"
 * (`dateOnlyFromToday`), never a literal that could lapse mid-run (lezione
 * 15.4 F1), and the formatted date is only ever asserted as message CONTENT —
 * never used to disambiguate a row (lezione 11.2).
 */

/** Same login helper as the sibling specs. */
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

/** A `YYYY-MM-DD` calendar day `offsetDays` from today, UTC — relative and computed, never a literal (lezione 15.4 F1). */
function dateOnlyFromToday(offsetDays: number): string {
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
  return day.toISOString().slice(0, 10);
}

/** The SAME rendering `formatDateOnly` produces for that calendar day — so an assertion never hard-codes a format. */
function formatDateOnly(dateOnly: string, locale: 'it' | 'en'): string {
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-IE', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

async function createAircraft(page: Page, withRate = false): Promise<{ id: string; registration: string }> {
  const registration = `I-AOG${uniqueSuffix()}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'AOG Test', hourMeterMinutes: 100 },
  });
  expect(response.status()).toBe(201);
  const aircraft = (await response.json()) as { id: string };
  if (withRate) {
    const rate = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, { data: { priceCentsPerHour: 12000, validFrom: '2020-01-01' } });
    expect(rate.status()).toBe(201);
  }
  return { id: aircraft.id, registration };
}

async function createPilotPerson(page: Page): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Aog';
  const lastName = `Pilota-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  // TD 15.5: without this, `POST /api/v1/flights` answers FLIGHT_BLOCKED_BY_EXPIRY
  // long before it ever reaches the guard under test.
  await ensureValidSeedExpiries(page, person.id, 'PILOTS');
  return { personId: person.id, firstName, lastName };
}

/** Grounds an aircraft through the API, with or without the expected-return date. */
async function ground(page: Page, aircraftId: string, reason: string, outOfServiceUntil?: string): Promise<Record<string, unknown>> {
  const response = await page.request.post(`/api/v1/aircraft/${aircraftId}/out-of-service`, {
    data: outOfServiceUntil === undefined ? { reason } : { reason, outOfServiceUntil },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

/** Opens the fleet editor for a given registration, search-scoped (same TD-1 lesson as the other fleet specs). */
async function openFleetEditor(page: Page, registration: string, locale: 'it' | 'en' = 'it'): Promise<void> {
  await page.goto(`/${locale}/dashboard/fleet?q=${encodeURIComponent(registration)}`);
  await page.locator('[data-testid^="ac-card-"]').filter({ hasText: registration }).click();
  await expect(page.getByTestId('availability-current')).toBeVisible();
}

/**
 * Finds a run-unique aircraft's booking row, WALKING the pages instead of
 * assuming page 1. The list is `startsAt`-ascending from "now", 20 rows a page,
 * and this suite leaves ~90 bookings on a shared DB: which page a given booking
 * lands on is a property of everyone else's fixtures, not of this test. The
 * registration is a run-unique marker, never a date or an `H:MM` (lezione 11.2).
 */
async function findBookingRow(page: Page, registration: string): Promise<Locator> {
  for (let pageNumber = 1; pageNumber <= 25; pageNumber += 1) {
    await page.goto(`/it/dashboard/bookings?page=${pageNumber}`);
    await page.waitForLoadState('networkidle');
    const row = page.getByTestId('booking-row').filter({ hasText: registration });
    if ((await row.count()) > 0) return row;
    // The pager renders ONLY when there is more than one page, and `?page` is
    // clamped server-side to the last real one — so "no pager" and "already on
    // the last page" both mean there is nothing left to walk.
    const status = await page.getByTestId('booking-pagination-status').textContent().catch(() => null);
    if (status === null) break;
    const [current, total] = status.split('/').map((part) => Number(part.trim()));
    if (!Number.isFinite(total) || current >= total) break;
  }
  throw new Error(`No booking row for ${registration} on any page of /dashboard/bookings`);
}

/** Types into a `SearchCombobox` and clicks the matching option — same helper as `flights.spec.ts`. */
async function selectFromCombobox(combobox: Locator, query: string, optionLabel: string | RegExp): Promise<void> {
  await combobox.click();
  await combobox.fill(query);
  await combobox.page().getByRole('listbox').getByRole('option', { name: optionLabel }).click();
}

test.describe('Aircraft out-of-service expected return date (story AOG-1a, AC 1/3/5)', () => {
  test('the Disponibilità editor writes the date, states it INCLUSIVELY in "Stato attuale", says "rientro da definire" without one, and offers no date control where writing one would 409 (AD-9)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const until = dateOnlyFromToday(30);
    const reason = `Revisione 100h ${uniqueSuffix()}`;

    // --- face 1: OPERATIONAL — reason + the (optional) date, both writable ---
    await openFleetEditor(page, aircraft.registration);
    await expect(page.getByTestId('availability-current')).toHaveText('Stato attuale: —');
    const untilField = page.getByTestId('out-of-service-until');
    await expect(untilField).toBeVisible();
    // Label ABOVE the control and a hint that names what an empty value means
    // — never a placeholder-as-label.
    await expect(page.getByLabel('Fermo fino al (compreso)')).toBeVisible();
    await expect(page.getByText("Facoltativo: l'ultimo giorno di fermo. Vuoto = rientro da definire.")).toBeVisible();

    await page.getByTestId('out-of-service-reason').fill(reason);
    await untilField.fill(until);
    await page.getByTestId('out-of-service-submit').click();

    // --- face 2: OUT_OF_SERVICE — the date is STATED, and no longer writable ---
    await expect(page.getByTestId('return-to-service-button')).toBeVisible();
    await expect(page.getByTestId('availability-current')).toHaveText(`Stato attuale: ${reason} · fermo fino al ${formatDateOnly(until, 'it')} compreso`);
    // AD-9: `setOutOfService`'s atomic guard makes a second call a 409, so the
    // form (date included) must NOT be offered here — a control that can only
    // fail is the dead end of lezione 14.6 F2.
    await expect(page.getByTestId('out-of-service-until')).toHaveCount(0);
    await expect(page.getByTestId('out-of-service-submit')).toHaveCount(0);

    // --- invariant [b]: no date is a legitimate state, and it is NAMED -------
    await page.getByTestId('return-to-service-button').click();
    await expect(page.getByTestId('out-of-service-submit')).toBeVisible();
    const reasonNoDate = `Attesa pezzo ${uniqueSuffix()}`;
    await page.getByTestId('out-of-service-reason').fill(reasonNoDate);
    await page.getByTestId('out-of-service-submit').click();
    await expect(page.getByTestId('return-to-service-button')).toBeVisible();
    await expect(page.getByTestId('availability-current')).toHaveText(`Stato attuale: ${reasonNoDate} · rientro da definire`);

    // --- the DTO carries the calendar day, and returnToService clears it -----
    const afterReturn = await page.request.post(`/api/v1/aircraft/${aircraft.id}/return-to-service`);
    expect(afterReturn.status()).toBe(200);
    const operational = (await afterReturn.json()) as { status: string; statusReason: string | null; outOfServiceUntil: string | null };
    expect(operational.status).toBe('OPERATIONAL');
    expect(operational.statusReason).toBeNull();
    expect(operational.outOfServiceUntil).toBeNull();

    const grounded = await ground(page, aircraft.id, reason, until);
    expect(grounded['outOfServiceUntil']).toBe(until);

    // --- EN parity: the same two strings, in the other locale ---------------
    await openFleetEditor(page, aircraft.registration, 'en');
    await expect(page.getByTestId('availability-current')).toHaveText(`Current status: ${reason} · grounded until ${formatDateOnly(until, 'en')} inclusive`);
  });

  test('the Fuori servizio submit reaches the 44px touch floor on the phone and keeps its desktop box (AC 6, R-AOG-g)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    // `setViewportSize` INSIDE the test (pattern 13.10) — the project's own
    // viewport stays the desktop one.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
    await page.locator('[data-testid^="mobile-fleet-card-"]').first().click();
    await page.getByTestId('aircraft-edit-mobile').click();
    await expect(page.getByTestId('out-of-service-submit')).toBeVisible();
    const phoneBox = await page.getByTestId('out-of-service-submit').boundingBox();
    expect(phoneBox).not.toBeNull();
    expect(phoneBox!.height).toBeGreaterThanOrEqual(44);

    // The rule lives inside `@media (max-width: 640px)` and is anchored to this
    // one button: above the query the box is the pre-story one (34.84px),
    // unchanged to the hundredth.
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFleetEditor(page, aircraft.registration);
    const desktopBox = await page.getByTestId('out-of-service-submit').boundingBox();
    expect(desktopBox).not.toBeNull();
    expect(desktopBox!.height).toBeLessThan(44);
    expect(Number(desktopBox!.height.toFixed(2))).toBe(34.84);
  });
});

test.describe('The three enriched AIRCRAFT_OUT_OF_SERVICE 422s (story AOG-1a, AC 7)', () => {
  test('creating and moving a booking onto a grounded aircraft both say "fermo fino al {data} compreso", in IT and EN', async ({ page, browser }) => {
    // TWO contexts on purpose. `page` stays ADMIN, because only `aircraft.manage`
    // can create and ground an airframe — and the grounding has to happen with
    // the booking form ALREADY on screen. The form itself is driven by the SEED
    // pilot in its own context, in `pilot` mode: that mode has NO person picker,
    // and the staff one is capped at `OPTIONS_PAGE_SIZE = 100` people (open TD)
    // — a brand-new person falls off it on a post-suite DB, which is a property
    // of everyone else's fixtures, not of this story. Measured: on a DB with
    // ~160 aircraft and hundreds of people the staff picker no longer contains a
    // freshly created person at all.
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const target = await createAircraft(page);
    const until = dateOnlyFromToday(21);
    const reason = `Revisione 100h ${uniqueSuffix()}`;
    const futureDay = dateOnlyFromToday(120);

    const pilotContext = await browser.newContext();
    const pilotPage = await pilotContext.newPage();
    await loginExpectingDashboard(pilotPage, PILOT_EMAIL);
    const me = (await (await pilotPage.request.get('/api/v1/me')).json()) as { person: { id: string } };

    // The form's own `<select>` disables a grounded option, so the 422 is
    // reached the way it really happens: the aircraft is grounded AFTER the
    // page rendered, under the operator's feet.
    await pilotPage.goto('/it/dashboard/bookings');
    await pilotPage.getByTestId('new-booking-button').click();
    const form = pilotPage.getByTestId('new-booking-form');
    // Selected by VALUE (the id), never by option text: the label of a grounded
    // option carries the reason, and this test grounds the aircraft mid-flow.
    await form.locator('select[name="aircraftId"]').selectOption(aircraft.id);
    await form.getByLabel('Inizio').fill(`${futureDay}T09:00`);
    await form.getByLabel('Fine', { exact: true }).fill(`${futureDay}T10:00`);
    await ground(page, aircraft.id, reason, until);
    await form.getByRole('button', { name: 'Prenota' }).click();

    const createError = pilotPage.getByTestId('booking-form-error');
    await expect(createError).toContainText(reason);
    await expect(createError).toContainText(`Fermo fino al ${formatDateOnly(until, 'it')} compreso.`);

    // --- spostamento: a live booking moved ONTO a grounded aircraft ---------
    // A SECOND run-unique aircraft, grounded the same way and for the same
    // reason, mid-flow: the move form renders its option while the airframe is
    // still operational (a grounded one renders `disabled`), which is exactly
    // how an operator meets this 422 in real life.
    const moveTargetAog = await createAircraft(page);
    const booking = await pilotPage.request.post('/api/v1/bookings', {
      data: { aircraftId: target.id, personId: me.person.id, startsAt: `${futureDay}T11:00:00.000Z`, endsAt: `${futureDay}T12:00:00.000Z` },
    });
    expect(booking.status()).toBe(201);

    const row = await findBookingRow(pilotPage, target.registration);
    await row.getByTestId('booking-move-action').click();
    const moveForm = pilotPage.getByTestId('move-booking-form');
    await ground(page, moveTargetAog.id, reason, until);
    await moveForm.locator('select[name="aircraftId"]').selectOption(moveTargetAog.id);
    await moveForm.getByTestId('move-booking-save').click();
    const moveError = pilotPage.getByTestId('move-booking-form-error');
    await expect(moveError).toContainText(reason);
    await expect(moveError).toContainText(`Fermo fino al ${formatDateOnly(until, 'it')} compreso.`);

    // --- EN: the same constraint, said in the other language ---------------
    const enBooking = await createAircraft(page);
    await pilotPage.goto('/en/dashboard/bookings');
    await pilotPage.getByTestId('new-booking-button').click();
    const enForm = pilotPage.getByTestId('new-booking-form');
    await enForm.locator('select[name="aircraftId"]').selectOption(enBooking.id);
    await enForm.getByLabel('Starts').fill(`${futureDay}T14:00`);
    await enForm.getByLabel('Ends', { exact: true }).fill(`${futureDay}T15:00`);
    await ground(page, enBooking.id, reason, until);
    await enForm.getByRole('button', { name: 'Book' }).click();
    const enError = pilotPage.getByTestId('booking-form-error');
    await expect(enError).toContainText(reason);
    await expect(enError).toContainText(`Grounded until ${formatDateOnly(until, 'en')} inclusive.`);

    await pilotContext.close();
  });

  test('with NO expected return date the booking message is exactly the one this app has always shown (invariant [b])', async ({ page, browser }) => {
    // Same two-context split as the sibling above, and for the same measured
    // reason (the staff person picker's `OPTIONS_PAGE_SIZE` cap).
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const reason = `Attesa pezzo ${uniqueSuffix()}`;
    const futureDay = dateOnlyFromToday(130);

    const pilotContext = await browser.newContext();
    const pilotPage = await pilotContext.newPage();
    await loginExpectingDashboard(pilotPage, PILOT_EMAIL);

    await pilotPage.goto('/it/dashboard/bookings');
    await pilotPage.getByTestId('new-booking-button').click();
    const form = pilotPage.getByTestId('new-booking-form');
    await form.locator('select[name="aircraftId"]').selectOption(aircraft.id);
    await form.getByLabel('Inizio').fill(`${futureDay}T09:00`);
    await form.getByLabel('Fine', { exact: true }).fill(`${futureDay}T10:00`);
    await ground(page, aircraft.id, reason);
    await form.getByRole('button', { name: 'Prenota' }).click();

    // Byte-identical to the pre-story string: no clause, no dash, no "da
    // definire" — the absence of a date is not something to announce here.
    await expect(pilotPage.getByTestId('booking-form-error')).toHaveText(`Il velivolo è fuori servizio: ${reason}.`);

    await pilotContext.close();
  });
});

test.describe('The flight-registration guard and its admin deroga (story AOG-1a, AC 8/9/10/11/12)', () => {
  test('the picker NAMES the grounded aircraft and still lets it be picked; the 422 names aircraft, reason and fermo; the deroga registers the flight with a Deroga badge (both FlightEditor call sites)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, true);
    const pilot = await createPilotPerson(page);
    const until = dateOnlyFromToday(45);
    const reason = `Revisione 100h ${uniqueSuffix()}`;
    await ground(page, aircraft.id, reason, until);
    const flightDay = dateOnlyFromToday(-3);

    await page.goto('/it/dashboard/logbook');
    await page.getByTestId('logbook-new-button').click();
    await expect(page.getByTestId('flight-form')).toBeVisible();

    // AC 12 (R-AOG-d): same language as the booking form — "marca — motivo
    // (fuori servizio)" — and the option is SELECTABLE (no `disabled`), because
    // the deroga below exists and a historical flight on that airframe must
    // stay correctable. The date deliberately does NOT appear here (R-AOG-e).
    const aircraftCombo = page.getByTestId('flight-form').getByLabel('Velivolo');
    await aircraftCombo.click();
    await aircraftCombo.fill(aircraft.registration);
    const option = page.getByRole('listbox').getByRole('option', { name: new RegExp(`${aircraft.registration} — ${reason} \\(fuori servizio\\)`) });
    await expect(option).toBeVisible();
    await expect(option).not.toHaveAttribute('aria-disabled', 'true');
    await option.click();

    await selectFromCombobox(page.getByLabel('Pilota o allievo'), pilot.lastName, `${pilot.lastName} ${pilot.firstName}`);
    await page.getByLabel('Data volo').fill(flightDay);
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:30');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    // AC 11: never `labels.errors.generic` — the message names the airframe,
    // the reason and the fermo, in the inclusive wording.
    const formError = page.getByTestId('flight-form-error');
    await expect(formError).toContainText(aircraft.registration);
    await expect(formError).toContainText(reason);
    await expect(formError).toContainText(`Fermo fino al ${formatDateOnly(until, 'it')} compreso.`);
    await expect(formError).not.toContainText('Riprova');

    // AC 10: the SECOND trigger of the shared "Forza registrazione" section.
    const forceSection = page.getByTestId('force-flight-section');
    await expect(forceSection).toBeVisible();
    await forceSection.getByTestId('force-flight-submit').click();
    await expect(forceSection.getByTestId('force-flight-error')).toBeVisible();
    const forceReason = `Volo che ha causato il fermo ${uniqueSuffix()}`;
    await forceSection.getByTestId('force-flight-reason').fill(forceReason);
    await forceSection.getByTestId('force-flight-submit').click();
    await expect(page.getByTestId('flight-result-panel')).toBeVisible();

    // The override is tracked and shown: the registry's own "Deroga" badge.
    await page.goto(`/it/dashboard/logbook?aircraftId=${aircraft.id}`);
    const flightRow = page.getByTestId('flight-row').first();
    await expect(flightRow).toContainText('Deroga');

    // AC 10(g), inherited from the 14.4 BLOCKER: the OTHER call site of the very
    // same FlightEditor — the Panoramica CTA — remounts between opens, so no
    // `pendingForceBody` survives a close.
    await page.goto('/it/dashboard');
    await page.getByTestId('dispatch-flight-button').click();
    await expect(page.getByTestId('flight-form')).toBeVisible();
    await expect(page.getByTestId('force-flight-section')).toHaveCount(0);
    const ctaCombo = page.getByTestId('flight-form').getByLabel('Velivolo');
    await ctaCombo.click();
    await ctaCombo.fill(aircraft.registration);
    await expect(page.getByRole('listbox').getByRole('option', { name: new RegExp(`${aircraft.registration} — ${reason} \\(fuori servizio\\)`) })).toBeVisible();
  });

  test('a grounding whose date is already PAST still blocks both a booking and a flight — the date never returns an aircraft to service (invariant [a], AC 2c)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, true);
    const pilot = await createPilotPerson(page);
    const yesterday = dateOnlyFromToday(-1);
    const reason = `Fermo scaduto ${uniqueSuffix()}`;
    const grounded = await ground(page, aircraft.id, reason, yesterday);
    expect(grounded['outOfServiceUntil']).toBe(yesterday);
    // Still grounded for every reader, the date notwithstanding.
    expect(grounded['status']).toBe('OUT_OF_SERVICE');

    const futureDay = dateOnlyFromToday(140);
    const bookingResponse = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilot.personId, startsAt: `${futureDay}T09:00:00.000Z`, endsAt: `${futureDay}T10:00:00.000Z` },
    });
    expect(bookingResponse.status()).toBe(422);
    const bookingBody = (await bookingResponse.json()) as { error: { code: string; details: { reason: string; outOfServiceUntil: string | null } } };
    expect(bookingBody.error.code).toBe('AIRCRAFT_OUT_OF_SERVICE');
    expect(bookingBody.error.details.outOfServiceUntil).toBe(yesterday);

    const flightDay = dateOnlyFromToday(-2);
    const flightResponse = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        takeoffAt: `${flightDay}T10:00:00.000Z`,
        landingAt: `${flightDay}T10:30:00.000Z`,
      },
    });
    expect(flightResponse.status()).toBe(422);
    const flightBody = (await flightResponse.json()) as { error: { code: string; details: { reason: string; outOfServiceUntil: string | null } } };
    expect(flightBody.error.code).toBe('AIRCRAFT_OUT_OF_SERVICE');
    expect(flightBody.error.details.reason).toBe(reason);
    expect(flightBody.error.details.outOfServiceUntil).toBe(yesterday);
  });

  test('AD-4 perimeter over the API: a correction that KEEPS the grounded aircraft passes, one that MOVES a flight onto it is blocked, and a storno is never blocked', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const flown = await createAircraft(page, true);
    const grounded = await createAircraft(page, true);
    const pilot = await createPilotPerson(page);
    const flightDay = dateOnlyFromToday(-5);

    const registered = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: flown.id,
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        takeoffAt: `${flightDay}T10:00:00.000Z`,
        landingAt: `${flightDay}T11:00:00.000Z`,
      },
    });
    expect(registered.status()).toBe(201);
    const flightId = ((await registered.json()) as { flight: { id: string } }).flight.id;

    // The airframe it flew on goes into maintenance TODAY.
    await ground(page, flown.id, `Atterraggio duro ${uniqueSuffix()}`, dateOnlyFromToday(14));
    await ground(page, grounded.id, `Revisione ${uniqueSuffix()}`, dateOnlyFromToday(14));

    // (a) correction that KEEPS the same aircraft: allowed — correcting is not
    // registering anew (R-14.4-b), and the guard must not create the dead end.
    const keepSame = await page.request.post(`/api/v1/flights/${flightId}/correct`, {
      data: {
        aircraftId: flown.id,
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        takeoffAt: `${flightDay}T10:00:00.000Z`,
        landingAt: `${flightDay}T11:15:00.000Z`,
        reason: 'Minuti errati',
      },
    });
    expect(keepSame.status()).toBe(201);
    const corrected = (await keepSame.json()) as { flight: { id: string; forcedAt: string | null } };
    // ...and it is not an override either.
    expect(corrected.flight.forcedAt).toBeNull();

    // (b) correction that MOVES the flight onto a grounded airframe: blocked.
    const moveOntoGrounded = await page.request.post(`/api/v1/flights/${corrected.flight.id}/correct`, {
      data: {
        aircraftId: grounded.id,
        personId: pilot.personId,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        takeoffAt: `${flightDay}T10:00:00.000Z`,
        landingAt: `${flightDay}T11:15:00.000Z`,
        reason: 'Velivolo errato',
      },
    });
    expect(moveOntoGrounded.status()).toBe(422);
    expect(((await moveOntoGrounded.json()) as { error: { code: string } }).error.code).toBe('AIRCRAFT_OUT_OF_SERVICE');

    // (c) a storno is ALWAYS possible, grounded airframe or not.
    const cancelled = await page.request.post(`/api/v1/flights/${corrected.flight.id}/cancel`, { data: { reason: 'Errore inserimento' } });
    expect(cancelled.status()).toBe(200);
  });

  test('an actor without flights.manage gets no logbook affordance at all — no promise of a bypass it cannot use (AC 11)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await page.goto('/it/dashboard/logbook');
    // The editor (and with it the "Forza registrazione" section) is never
    // mounted for a non-manage actor, so there is no dead end to fall into.
    await expect(page.getByTestId('logbook-new-button')).toHaveCount(0);
    await expect(page.getByTestId('flight-form')).toHaveCount(0);
  });
});
