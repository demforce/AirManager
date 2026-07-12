import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/flight-log.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Same `SearchCombobox` typeahead helper as `flights.spec.ts` (story TD-3) — the filter bar's velivolo/persona pickers. */
async function selectFromCombobox(combobox: Locator, query: string, optionLabel: string): Promise<void> {
  await combobox.click();
  await combobox.fill(query);
  await combobox.page().getByRole('option', { name: optionLabel, exact: true }).click();
}

/**
 * Clicks "Azzera filtri" and waits for the reset NAVIGATION to land (story
 * TD-3 review M1): the manager subtree is keyed on the query string, so the
 * reset's `router.push` REMOUNTS every filter control — typing into a picker
 * before the remount settles gets discarded with the old subtree (reproduced
 * deterministically on a high-volume DB, where the server round-trip is slow
 * enough to lose the race). `dirtyFilter` is a control that held a value
 * before the reset — it reading empty proves the remounted tree is the one
 * on screen.
 */
async function resetFiltersAndSettle(page: Page, dirtyFilter: Locator, dirtyValue: string): Promise<void> {
  await page.getByTestId('flight-filter-reset').click();
  await expect(page).toHaveURL(/\/dashboard\/flights$/);
  // The remounted control shows its own empty-state label (e.g. "Tutti i
  // velivoli"), never the value it held before the reset — waiting for the
  // DIRTY value to disappear is the remount-complete signal that works for
  // combobox and date inputs alike.
  await expect(dirtyFilter).not.toHaveValue(dirtyValue);
}

/** Run-unique names (same pattern as the other specs, for the dirty/parallel DB). */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

/** A safely-in-the-past date, before any run-unique aircraft/rate created below. */
const PAST_DATE = '2020-01-01';

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as the other e2e specs. */
async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<MailpitFullMessage> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const searchResponse = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
    const searchBody = (await searchResponse.json()) as { messages: MailpitMessageSummary[] };
    const found = searchBody.messages.find((message) => message.Subject.includes(subjectIncludes));

    if (found) {
      const messageResponse = await fetch(`${MAILPIT_API}/message/${found.ID}`);
      return (await messageResponse.json()) as MailpitFullMessage;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

function extractSetPasswordUrl(emailText: string): URL {
  const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(emailText);
  if (!match) {
    throw new Error(`Email body did not contain a /set-password link:\n${emailText}`);
  }
  return new URL(match[1]);
}

/** Creates a fresh pilot person (active pilot profile) plus a linked login user — always a BRAND NEW person, never the shared seeded pilot (mutated by other, parallel e2e specs — `fullyParallel: true`). Mirrors `flights.spec.ts`'s `createPilotWithLogin`. */
async function createPilotWithLogin(page: Page, password: string, tag: string): Promise<{ personId: string; email: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Volo';
  const lastName = `${tag}-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  const email = uniqueEmail('pilot-flightlog');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId: person.id } });
  expect(userResponse.status()).toBe(201);

  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(inviteEmail.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();

  return { personId: person.id, email, firstName, lastName };
}

/** A plain pilot/student person (active pilot profile, no login needed) — for the "another person" side of a filter/own-access assertion. */
async function createPilotPerson(page: Page, tag: string): Promise<{ personId: string; firstName: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const firstName = 'Volo';
  const lastName = `${tag}-${suffix}`;

  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  return { personId: person.id, firstName, lastName };
}

async function createAircraftWithRate(page: Page, priceCentsPerHour: number): Promise<{ id: string; registration: string }> {
  // Same `.slice(0, 20)` convention as `aircraft-rates.spec.ts`'s `uniqueAircraft`.
  const suffix = uniqueSuffix();
  const registration = `I-FL${suffix}`.toUpperCase().slice(0, 20);

  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 100 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };

  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
    data: { priceCentsPerHour, validFrom: PAST_DATE },
  });
  expect(rateResponse.status()).toBe(201);

  return { id: aircraft.id, registration };
}

type RegisterFlightParams = {
  aircraftId: string;
  personId: string;
  flightDate: string;
  flightType: 'TOURISM' | 'SCHOOL' | 'AERIAL_WORK';
  minutes: number;
};

/**
 * Story 11.1: `POST /api/v1/flights` now takes `takeoffAt`/`landingAt`
 * (logbook instants) instead of `flightDate`/`minutes` — this helper keeps
 * every call site's `{ flightDate, minutes }` shape (least churn) and
 * composes the wire body itself. `10:00Z` is comfortably clear of the
 * Europe/Rome midnight boundary, so the server-derived `flightDate` always
 * equals `params.flightDate`.
 */
async function registerFlight(page: Page, params: RegisterFlightParams): Promise<{ id: string }> {
  const takeoffAt = `${params.flightDate}T10:00:00.000Z`;
  const landingAt = new Date(new Date(takeoffAt).getTime() + params.minutes * 60_000).toISOString();
  const response = await page.request.post('/api/v1/flights', {
    data: {
      aircraftId: params.aircraftId,
      personId: params.personId,
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      takeoffAt,
      landingAt,
      flightType: params.flightType,
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { flight: { id: string } };
  return body.flight;
}

test.describe('Flight log with filters and role-scoped visibility (Story 5.4, AC 1/2/3/4; FR-17)', () => {
  test('a pilot sees ONLY their own flights (own or as instructor), including a cancelled one, in their own-access registry — no form, no actions', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 15000);
    const pilot = await createPilotWithLogin(page, 'PilotOwnView123!', 'Titolare');
    const otherPerson = await createPilotPerson(page, 'AltroTitolare');

    // The pilot's own flight (stays REGISTERED).
    await registerFlight(page, { aircraftId: aircraft.id, personId: pilot.personId, flightDate: '2020-02-01', flightType: 'TOURISM', minutes: 30 });
    // A second flight for the pilot, later cancelled — AC 1: "storia completa", cancelled flights stay visible in own-access scope.
    const toCancel = await registerFlight(page, {
      aircraftId: aircraft.id,
      personId: pilot.personId,
      flightDate: '2020-03-01',
      flightType: 'AERIAL_WORK',
      minutes: 50,
    });
    const cancelResponse = await page.request.post(`/api/v1/flights/${toCancel.id}/cancel`, { data: { reason: 'Errore di prova' } });
    expect(cancelResponse.status()).toBe(200);
    // Someone else's flight on the SAME aircraft — must NEVER show up in the pilot's own registry.
    await registerFlight(page, { aircraftId: aircraft.id, personId: otherPerson.personId, flightDate: '2020-02-01', flightType: 'TOURISM', minutes: 40 });

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotOwnView123!');

    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(nav.getByRole('link', { name: 'Voli', exact: true })).toHaveAttribute('href', '/it/dashboard/flights');
    await nav.getByRole('link', { name: 'Voli', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'I miei voli' })).toBeVisible();
    // No registration dialog trigger/form, no per-row cancel/correct actions
    // for a non-staff actor (story 12.3: the whole canManage-gated block,
    // open button included, is simply not rendered).
    await expect(page.getByTestId('flight-open-register')).toHaveCount(0);
    await expect(page.getByTestId('flight-form')).toHaveCount(0);
    await expect(page.getByTestId('flight-cancel-action')).toHaveCount(0);
    await expect(page.getByTestId('flight-correct-action')).toHaveCount(0);
    // Only staff filters (aircraft/persona) are absent; period/tipo/stato remain.
    await expect(page.getByTestId('flight-filter-aircraft')).toHaveCount(0);
    await expect(page.getByTestId('flight-filter-person')).toHaveCount(0);

    // Exactly the pilot's own 2 flights (this pilot is brand new — nothing else could be theirs), never the other person's.
    const rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: otherPerson.lastName })).toHaveCount(0);
    await expect(rows.filter({ hasText: 'Annullato' })).toHaveCount(1);

    // Own-access filters (period/tipo/stato) narrow the results.
    await page.getByTestId('flight-filter-status').selectOption('CANCELLED');
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-row').first()).toContainText('Annullato');

    await page.getByTestId('flight-filter-reset').click();
    await expect(page.getByTestId('flight-row')).toHaveCount(2);

    await page.getByTestId('flight-filter-type').selectOption('TOURISM');
    const tourismRow = page.getByTestId('flight-row');
    await expect(tourismRow).toHaveCount(1);
    // "Tipo" (Turismo) moved out of the row into the detail sheet (story 12.4, AC 1).
    await tourismRow.first().getByTestId('flight-detail-action').click();
    await expect(page.getByTestId('flight-detail-sheet')).toContainText('Turismo');
  });

  test('a non-staff actor filtering GET /api/v1/flights by someone else\'s personId gets a 403 envelope (AC 4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotWithLogin(page, 'PilotForbidden123!', 'Forbidden');
    const otherPerson = await createPilotPerson(page, 'AltroForbidden');

    await page.context().clearCookies();
    await loginExpectingDashboard(page, pilot.email, 'PilotForbidden123!');

    const response = await page.request.get(`/api/v1/flights?personId=${otherPerson.personId}`);
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');

    // Filtering by their OWN id is redundant but allowed (never 403).
    const ownResponse = await page.request.get(`/api/v1/flights?personId=${pilot.personId}`);
    expect(ownResponse.status()).toBe(200);
  });

  test('staff: filters by velivolo, persona, tipo and periodo (combined) restrict the registry (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraftA = await createAircraftWithRate(page, 15000);
    const aircraftB = await createAircraftWithRate(page, 9000);
    const personA = await createPilotPerson(page, 'FiltroA');
    const personB = await createPilotPerson(page, 'FiltroB');

    // Four flights spanning two aircraft, two people, two types, two periods.
    await registerFlight(page, { aircraftId: aircraftA.id, personId: personA.personId, flightDate: '2020-05-01', flightType: 'TOURISM', minutes: 30 });
    await registerFlight(page, { aircraftId: aircraftB.id, personId: personB.personId, flightDate: '2020-06-15', flightType: 'AERIAL_WORK', minutes: 45 });

    await page.goto('/it/dashboard/flights');

    // Velivolo filter: only aircraftA's flight.
    await selectFromCombobox(page.getByTestId('flight-filter-aircraft'), aircraftA.registration, aircraftA.registration);
    let rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(aircraftA.registration);
    await expect(rows.first()).toContainText(personA.lastName);

    await resetFiltersAndSettle(page, page.getByTestId('flight-filter-aircraft'), aircraftA.registration);

    // Persona filter: only personB's flight.
    await selectFromCombobox(
      page.getByTestId('flight-filter-person'),
      personB.lastName,
      `${personB.lastName} ${personB.firstName}`,
    );
    rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(personB.lastName);

    await resetFiltersAndSettle(page, page.getByTestId('flight-filter-person'), `${personB.lastName} ${personB.firstName}`);

    // Combined persona + periodo + tipo: the RUN-UNIQUE person keyed with
    // dateFrom/dateTo bracketing only the June flight and tipo AERIAL_WORK -> that
    // one flight. The person filter is what keeps the assertion run-unique
    // (lesson 6.3 F1): periodo+tipo alone match the June/AERIAL_WORK flights EVERY
    // past execution of this very test left in an accumulated DB.
    await selectFromCombobox(
      page.getByTestId('flight-filter-person'),
      personB.lastName,
      `${personB.lastName} ${personB.firstName}`,
    );
    // EVERY filter change navigates and remounts the subtree (same M1 race
    // as the reset) — settle each step on its URL effect before touching the
    // next control, or the next fill can land on the node the remount is
    // about to discard.
    await expect(page).toHaveURL(/personId=/);
    await page.getByTestId('flight-filter-date-from').fill('2020-06-01');
    await expect(page).toHaveURL(/dateFrom=2020-06-01/);
    await page.getByTestId('flight-filter-date-to').fill('2020-06-30');
    await expect(page).toHaveURL(/dateTo=2020-06-30/);
    await page.getByTestId('flight-filter-type').selectOption('AERIAL_WORK');
    await expect(page).toHaveURL(/flightType=AERIAL_WORK/);
    rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(personB.lastName);
    // "Tipo" (Lavoro aereo) moved out of the row into the detail sheet (story 12.4, AC 1).
    await rows.first().getByTestId('flight-detail-action').click();
    const combinedSheet = page.getByTestId('flight-detail-sheet');
    await expect(combinedSheet).toContainText('Lavoro aereo');
    await combinedSheet.getByRole('button', { name: 'Chiudi' }).click();
    await expect(combinedSheet).toBeHidden();

    await resetFiltersAndSettle(page, page.getByTestId('flight-filter-date-from'), '2020-06-01');
    // Both flights still reachable after the reset — each located through its
    // run-unique aircraft filter, NOT on the unfiltered page 1: the registry
    // orders by flightDate desc with a 20-row page, so on an accumulated DB
    // recent-dated flights from other runs bury these 2020-dated rows past
    // the cap (review TD-3 M1/D1 lesson: assert on run-unique observables).
    await selectFromCombobox(page.getByTestId('flight-filter-aircraft'), aircraftA.registration, aircraftA.registration);
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-row').first()).toContainText(aircraftA.registration);
    await resetFiltersAndSettle(page, page.getByTestId('flight-filter-aircraft'), aircraftA.registration);
    await selectFromCombobox(page.getByTestId('flight-filter-aircraft'), aircraftB.registration, aircraftB.registration);
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-row').first()).toContainText(aircraftB.registration);
  });

  test('staff: load-more accumulates a second page once a filtered person has more than one page of flights (story 12.4, AC 4/NFR-6)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 6000);
    const person = await createPilotPerson(page, 'Paginazione');

    // 21 flights (the registry's page size is 20) for the SAME run-unique person — distinct dates so nothing collides.
    for (let day = 1; day <= 21; day += 1) {
      const flightDate = `2020-04-${String(day).padStart(2, '0')}`;
      await registerFlight(page, { aircraftId: aircraft.id, personId: person.personId, flightDate, flightType: 'TOURISM', minutes: 10 });
    }

    // `personId` is an active filter — the flat context (AC 3), same one the
    // load-more button's "Carica altri voli" label targets.
    await page.goto(`/it/dashboard/flights?personId=${person.personId}`);

    await expect(page.getByTestId('flight-row')).toHaveCount(20);
    const loadMore = page.getByTestId('flight-load-more');
    await expect(loadMore).toHaveText('Carica altri voli');
    await expect(page.getByTestId('flight-registry-count')).toHaveText('20 di 21 voli');
    // The numbered pager is gone (story 12.4, AC 4).
    await expect(page.getByTestId('flight-pagination-status')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '→' })).toHaveCount(0);

    await loadMore.click();
    await expect(page.getByTestId('flight-row')).toHaveCount(21);
    await expect(page.getByTestId('flight-registry-count')).toHaveText('21 di 21 voli');
    // Every row now loaded — the button disappears (`items.length === total`).
    await expect(loadMore).toHaveCount(0);
    // `?page` is never emitted by the UI anymore.
    await expect(page).not.toHaveURL(/page=/);
  });
});

test.describe('Registry rendering: day grouping, flat context, export menu (Story 12.4, AC 2/3/6)', () => {
  test('grouped context (no filter): 2 flights the same day share ONE day header, a different day gets its own header, no date column (AC 2)', async ({
    page,
  }) => {
    // The grouped (unfiltered) context has no run-unique scoping affordance
    // by definition (ANY filter would switch it to flat) — on a heavily
    // accumulated DB this run's 2020-dated flights can land past the FIRST
    // page (empirically observed on the full-suite run), so this test pages
    // through via load-more (exercising AC 4 too) instead of assuming page
    // 1. slow(): the extra load-more round-trips this affords.
    test.slow();
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 9000);
    const person = await createPilotPerson(page, 'Raggruppo');

    // `flightDate` is the primary sort key server-side (`flightDate desc,
    // createdAt desc, id desc`) — the two same-day flights are therefore
    // GUARANTEED to sort adjacently to each other regardless of whatever
    // else an accumulated/parallel-run DB holds, so the grouping below is
    // deterministic even on a dirty DB (same reasoning documented in
    // `flight-registry.ts#groupFlightsByDay`).
    await registerFlight(page, { aircraftId: aircraft.id, personId: person.personId, flightDate: '2020-07-10', flightType: 'TOURISM', minutes: 20 });
    await registerFlight(page, { aircraftId: aircraft.id, personId: person.personId, flightDate: '2020-07-10', flightType: 'TOURISM', minutes: 25 });
    await registerFlight(page, { aircraftId: aircraft.id, personId: person.personId, flightDate: '2020-07-09', flightType: 'TOURISM', minutes: 30 });

    // No UI filter applied anywhere below — the grouped context (AC 2).
    await page.goto('/it/dashboard/flights');

    const july10Header = page.getByTestId('flight-day-header').filter({ hasText: '10/07/2020' });
    const july9Header = page.getByTestId('flight-day-header').filter({ hasText: '09/07/2020' });
    const loadMore = page.getByTestId('flight-load-more');
    // Load further pages until both headers are visible or there is nothing
    // left to load — a generous bound (40 pages = up to 800 more flights).
    for (let i = 0; i < 40; i += 1) {
      if ((await july9Header.count()) > 0 && (await july10Header.count()) > 0) break;
      if ((await loadMore.count()) === 0) break;
      await loadMore.click();
    }

    await expect(july10Header).toHaveCount(1);
    await expect(july9Header).toHaveCount(1);
    // No "Data" column header at all in the grouped context.
    await expect(page.getByRole('columnheader', { name: 'Data', exact: true })).toHaveCount(0);
  });

  test('flat context (any filter active): the date column is present in the row and there is no day header (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 9000);
    const person = await createPilotPerson(page, 'ContestoFlat');
    await registerFlight(page, { aircraftId: aircraft.id, personId: person.personId, flightDate: '2020-08-15', flightType: 'TOURISM', minutes: 20 });

    await page.goto('/it/dashboard/flights');
    await selectFromCombobox(page.getByTestId('flight-filter-aircraft'), aircraft.registration, aircraft.registration);
    await expect(page).toHaveURL(/aircraftId=/);

    await expect(page.getByTestId('flight-day-header')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Data', exact: true })).toBeVisible();
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-row').first()).toContainText('15/08/2020');
  });

  test('export menu: items are reachable only once opened; clicking one downloads the file (AC 6)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 8000);
    const person = await createPilotPerson(page, 'MenuExport');
    await registerFlight(page, { aircraftId: aircraft.id, personId: person.personId, flightDate: '2020-09-01', flightType: 'TOURISM', minutes: 15 });

    await page.goto(`/it/dashboard/flights?aircraftId=${aircraft.id}`);
    await expect(page.getByTestId('flight-row')).toHaveCount(1);

    // The menu items exist in the DOM (native `<details>`) but are not
    // visible/reachable before the trigger opens the disclosure.
    await expect(page.getByTestId('flights-export-button')).toBeHidden();
    await expect(page.getByTestId('flights-export-pdf-button')).toBeHidden();

    await page.getByTestId('flights-export-menu-trigger').click();
    await expect(page.getByTestId('flights-export-button')).toBeVisible();
    await expect(page.getByTestId('flights-export-pdf-button')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('flights-export-button').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^airmanager-flights-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
