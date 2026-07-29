import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ensureValidSeedExpiries } from './helpers';

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
  await expect(page).toHaveURL(/\/dashboard\/logbook$/);
  // The remounted control shows its own empty-state option (e.g. "Tutti i
  // velivoli"), never the value it held before the reset — waiting for the
  // DIRTY value (the entity ID for the selects) to disappear is the
  // remount-complete signal that works for select and date inputs alike.
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
  // Story 14.4 blast-radius fixture fix — see `ensureValidSeedExpiries`'s own doc-comment (e2e/helpers.ts).
  await ensureValidSeedExpiries(page, person.id, 'PILOTS');

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
  // Story 14.4 blast-radius fixture fix — see `ensureValidSeedExpiries`'s own doc-comment (e2e/helpers.ts).
  await ensureValidSeedExpiries(page, person.id, 'PILOTS');

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

    // Story 12.12: the legacy in-page "Aree operative" nav died with the
    // widget-grid home — same landmark name, now the AirOps Sidebar, whose
    // logbook nav item is labeled "Registro voli" (`shell.nav.logbook`).
    const nav = page.getByRole('navigation', { name: 'Aree operative' });
    await expect(nav.getByRole('link', { name: 'Registro voli', exact: true })).toHaveAttribute('href', '/it/dashboard/logbook');
    await nav.getByRole('link', { name: 'Registro voli', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Registro voli' })).toBeVisible();
    // No registration form, no per-row actions for a non-staff actor.
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

    // TRUE totals (review fix 12.8, MAJOR), own-scoped: 2 rows show (AC 1
    // "storia completa"), but the totals are REGISTERED-only AND scoped to
    // this pilot ALONE — so only the 30' TOURISM flight counts (75,00 € @
    // 150,00 €/h), never the cancelled 50' one, and NEVER otherPerson's 40'
    // flight on the SAME aircraft (SECURITY-CRITICAL: own-access totals must
    // never leak another person's data, same guard as the rows themselves).
    await expect(page.locator('.page-title-block .sub')).toHaveText('1 voce · solo i tuoi voli');
    const kpiValues = page.locator('.kpi-row .kpi .kpi-value');
    await expect(kpiValues.nth(0)).toHaveText('1');
    await expect(kpiValues.nth(1)).toHaveText('0:30');
    await expect(kpiValues.nth(2)).toHaveText('1 / 1');
    await expect(kpiValues.nth(3)).toHaveText(/^75,00\s€$/);
    const totalsRow = page.getByTestId('logbook-totals-row');
    await expect(totalsRow).toContainText('0:30');
    await expect(totalsRow).toContainText(/75,00\s€/);

    // Own-access filters (period/tipo/stato) narrow the results.
    await page.getByTestId('flight-filter-status').selectOption('CANCELLED');
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-row').first()).toContainText('Annullato');

    await page.getByTestId('flight-filter-reset').click();
    await expect(page.getByTestId('flight-row')).toHaveCount(2);

    await page.getByTestId('flight-filter-type').selectOption('TOURISM');
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-row').first()).toContainText('Turismo');
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

    await page.goto('/it/dashboard/logbook');

    // Velivolo filter: only aircraftA's flight. (Native selects since the
    // 2026-07-21 filter-UI change — the value they hold is the entity ID.)
    await page.getByTestId('flight-filter-aircraft').selectOption({ label: aircraftA.registration });
    let rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(aircraftA.registration);
    await expect(rows.first()).toContainText(personA.lastName);

    await resetFiltersAndSettle(page, page.getByTestId('flight-filter-aircraft'), aircraftA.id);

    // Persona filter: free-text like Piloti (story 13.5, AC 7) — only personB's flight.
    await page.getByTestId('flight-filter-person').fill(personB.lastName);
    await expect(page).toHaveURL(new RegExp(`personQuery=${encodeURIComponent(personB.lastName)}`));
    rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(personB.lastName);

    await resetFiltersAndSettle(page, page.getByTestId('flight-filter-person'), personB.lastName);

    // Combined persona + periodo + tipo: the RUN-UNIQUE person keyed with
    // dateFrom/dateTo bracketing only the June flight and tipo AERIAL_WORK -> that
    // one flight. The person filter is what keeps the assertion run-unique
    // (lesson 6.3 F1): periodo+tipo alone match the June/AERIAL_WORK flights EVERY
    // past execution of this very test left in an accumulated DB.
    await page.getByTestId('flight-filter-person').fill(personB.lastName);
    // EVERY filter change navigates and remounts the subtree (same M1 race
    // as the reset) — settle each step on its URL effect before touching the
    // next control, or the next fill can land on the node the remount is
    // about to discard.
    await expect(page).toHaveURL(/personQuery=/);
    await page.getByTestId('flight-filter-date-from').fill('2020-06-01');
    await expect(page).toHaveURL(/dateFrom=2020-06-01/);
    await page.getByTestId('flight-filter-date-to').fill('2020-06-30');
    await expect(page).toHaveURL(/dateTo=2020-06-30/);
    await page.getByTestId('flight-filter-type').selectOption('AERIAL_WORK');
    await expect(page).toHaveURL(/flightType=AERIAL_WORK/);
    rows = page.getByTestId('flight-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(personB.lastName);
    await expect(rows.first()).toContainText('Lavoro aereo');

    await resetFiltersAndSettle(page, page.getByTestId('flight-filter-date-from'), '2020-06-01');
    // Both flights still reachable after the reset — each located through its
    // run-unique aircraft filter, NOT on the unfiltered page 1: the registry
    // orders by flightDate desc with a 20-row page, so on an accumulated DB
    // recent-dated flights from other runs bury these 2020-dated rows past
    // the cap (review TD-3 M1/D1 lesson: assert on run-unique observables).
    await page.getByTestId('flight-filter-aircraft').selectOption({ label: aircraftA.registration });
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-row').first()).toContainText(aircraftA.registration);
    await resetFiltersAndSettle(page, page.getByTestId('flight-filter-aircraft'), aircraftA.id);
    await page.getByTestId('flight-filter-aircraft').selectOption({ label: aircraftB.registration });
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-row').first()).toContainText(aircraftB.registration);
  });

  test('staff: pagination shows a second page once a filtered person has more than one page of flights (NFR-6); the KPI row/Totali row/header count show the TRUE totals over the WHOLE filtered set, not just page 1 (review fix 12.8, MAJOR)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const aircraft = await createAircraftWithRate(page, 6000); // 60,00 €/h
    const person = await createPilotPerson(page, 'Paginazione');

    // 21 flights (the registry's page size is 20) for the SAME run-unique
    // person — distinct dates so nothing collides. Each is 10' @ 60,00 €/h
    // -> round(6000*10/60) = 1000 cents (10,00 €) — TOURISM, no instructor
    // (AC: avoid the SCHOOL/instructor requirement entirely). 21 flights:
    // 210 minutes total (3:30), 21 takeoffs/landings, 210,00 € total.
    for (let day = 1; day <= 21; day += 1) {
      const flightDate = `2020-04-${String(day).padStart(2, '0')}`;
      await registerFlight(page, { aircraftId: aircraft.id, personId: person.personId, flightDate, flightType: 'TOURISM', minutes: 10 });
    }

    await page.goto(`/it/dashboard/logbook?personId=${person.personId}`);

    await expect(page.getByTestId('flight-row')).toHaveCount(20);
    await expect(page.getByTestId('flight-pagination-status')).toHaveText('1 / 2');

    // Header count ("N voci registrate") — the FULL 21, not page 1's 20.
    await expect(page.locator('.page-title-block .sub')).toHaveText('21 voci registrate');

    // KPI row (entries/ore/decolli-atterraggi/ricavo), in DOM order — the
    // FULL filtered-set totals (`getFlightTotals`), never a per-page sum.
    // `.kpi-value` gives the EXACT rendered value, not a substring match
    // (currency still needs a `\s` regex — `Intl.NumberFormat('it-IT', ...)`
    // uses a NON-BREAKING space before "€", same convention as every other
    // money assertion in this suite).
    const kpiValues = page.locator('.kpi-row .kpi .kpi-value');
    await expect(kpiValues.nth(0)).toHaveText('21');
    await expect(kpiValues.nth(1)).toHaveText('3:30');
    await expect(kpiValues.nth(2)).toHaveText('21 / 21');
    await expect(kpiValues.nth(3)).toHaveText(/^210,00\s€$/);

    // Table's own "Totali" row — same FULL totals, not the 20 rows on screen.
    const totalsRow = page.getByTestId('logbook-totals-row');
    await expect(totalsRow).toContainText('3:30');
    await expect(totalsRow).toContainText(/210,00\s€/);

    await page.getByRole('link', { name: '→' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('flight-pagination-status')).toHaveText('2 / 2');

    // Page 2 (1 row) shows the exact SAME full totals as page 1 — proves the
    // totals are page-independent, not derived from whichever rows happen to
    // be on screen.
    await expect(page.locator('.page-title-block .sub')).toHaveText('21 voci registrate');
    await expect(kpiValues.nth(0)).toHaveText('21');
    await expect(kpiValues.nth(3)).toHaveText(/^210,00\s€$/);
    await expect(totalsRow).toContainText(/210,00\s€/);

    await page.getByRole('link', { name: '←' }).click();
    await expect(page.getByTestId('flight-pagination-status')).toHaveText('1 / 2');
  });
});
