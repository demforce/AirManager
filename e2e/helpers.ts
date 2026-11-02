import { expect } from '@playwright/test';
import type { APIResponse, Locator, Page } from '@playwright/test';

/** A comfortably far-future date — never itself the boundary under test. */
export const FAR_FUTURE_DATE = '2099-12-31';

/** Registers a scadenza for a person via the staff API (story 14.4; `expiries` API of story 6.2). */
export async function registerExpiry(page: Page, personId: string, expiryTypeId: string, expiresAt: string): Promise<void> {
  const response = await page.request.post('/api/v1/expiries', { data: { personId, expiryTypeId, expiresAt } });
  expect(response.status()).toBe(201);
}

/**
 * Story 14.4 (review F5, ratifica R-14.4-a): a person with NO `Expiry` row at
 * all for an ACTIVE blocking RATING applicable to their role (`scope` ALL or
 * their own) fails the flight's documents exactly like an expired one
 * (`requirements.service.ts#evaluateRequirements`, story 19.9). Several OTHER specs
 * (`bookings.spec.ts#createExpiryTypeForBooking`, `flights.spec.ts`'s custom
 * types) create run-unique `scope: 'ALL'` blocking ratings for their own
 * purposes and never deactivate them, so on this suite's long-lived,
 * never-reset e2e DB they accumulate and block EVERY later fresh person too.
 * This is therefore a full DYNAMIC scan (mirrors that function's
 * `kind`/`isActive`/`blocksBooking`/`scope in [ALL, <scope>]` filter) that
 * registers a FAR-FUTURE (valid) `Expiry` for every currently-active
 * applicable blocking rating.
 *
 * Medical visits (story 19.7a, R-19-j, D-4) are ONE requirement, not one per
 * class: whoever is on board needs one valid visit of ANY class. So this
 * registers ONE visit — the first active MEDICAL type by name — and ONLY when
 * the person has no visit at all. Registering all of them would make "a
 * person whose only visit is expired" impossible to build.
 *
 * Caller ordering matters:
 * - for a VISIT the test wants (an expired class 2, say), register it FIRST,
 *   then call this — it then adds no visit of its own;
 * - for a custom blocking RATING the test creates (several `flights.spec.ts`
 *   tests register one as EXPIRED), call this FIRST — otherwise this scan
 *   would already register a VALID expiry for that brand-new type and the
 *   test's own EXPIRED registration would collide on the `Expiry` unique
 *   constraint (personId+expiryTypeId).
 *
 * Idempotent (skips ratings the person already has, and any visit): a few
 * specs call this for the long-lived SEEDED pilot/student/instructor too.
 *
 * A registration 409 (`expiries.service.ts`: type deactivated in the
 * meantime, OR the same unique-constraint race the idempotent pre-check
 * above already covers for the non-concurrent case) is swallowed, never
 * asserted: this scan's own type list is a snapshot, and under
 * `fullyParallel: true` a SIBLING test can legitimately deactivate one of
 * its OWN custom types (`flights.spec.ts`'s cleanup) between this
 * function's GET and its POST — either 409 cause means the type is no
 * longer something this person needs covered, never a real failure.
 *
 * Returns how many blocking RATINGs it registered (story 19.9, review F5:
 * `sendInRegola`'s callers read a non-zero count on a person already "in
 * regola" as a sibling spec's type gone active in between).
 */
export async function ensureValidSeedExpiries(page: Page, personId: string, scope: 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS'): Promise<number> {
  const typesResponse = await page.request.get('/api/v1/expiry-types');
  expect(typesResponse.status()).toBe(200);
  // Active types only, ordered by name (the endpoint's defaults).
  const types = (await typesResponse.json()) as { id: string; scope: string; kind: string; blocksBooking: boolean }[];
  const ratings = types.filter((type) => type.kind === 'RATING' && type.blocksBooking && (type.scope === 'ALL' || type.scope === scope));
  const firstMedical = types.find((type) => type.kind === 'MEDICAL');
  if (ratings.length === 0 && firstMedical === undefined) return 0;

  const existingResponse = await page.request.get(`/api/v1/expiries?personId=${personId}&pageSize=100`);
  expect(existingResponse.status()).toBe(200);
  // The registry also lists rows DERIVED at read time (story 19.7b, AD-5): the
  // currency rows. Only registered documents count.
  const existing = ((await existingResponse.json()) as { items: { source: string; expiryTypeId: string | null; category: string }[] }).items.filter(
    (item) => item.source === 'DOCUMENT',
  );
  const alreadyRegisteredTypeIds = new Set(existing.map((item) => item.expiryTypeId));
  const hasVisit = existing.some((item) => item.category === 'MEDICAL');

  const toRegister = [...ratings.filter((type) => !alreadyRegisteredTypeIds.has(type.id)), ...(firstMedical !== undefined && !hasVisit ? [firstMedical] : [])];
  let registeredRatings = 0;
  for (const type of toRegister) {
    const response = await page.request.post('/api/v1/expiries', { data: { personId, expiryTypeId: type.id, expiresAt: FAR_FUTURE_DATE } });
    if (response.status() === 409) continue;
    expect(response.status()).toBe(201);
    if (type.kind === 'RATING') registeredRatings += 1;
  }
  return registeredRatings;
}

/** The UTC instant of `hhmm` on `date` on the Europe/Rome wall clock (+01:00 in winter, +02:00 in summer). */
function romeWallClockIso(date: string, hhmm: string): string {
  for (const offset of ['+01:00', '+02:00']) {
    const instant = new Date(`${date}T${hhmm}:00${offset}`);
    const wall = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
    if (wall === hhmm) return instant.toISOString();
  }
  throw new Error(`romeWallClockIso: ${date} ${hhmm} does not exist on the Europe/Rome clock.`);
}

/**
 * Registers a 30-minute flight through `POST /api/v1/flights`, taking off at
 * 10:00 Rome on `date` — so its `flightDate` is `date` whatever the season
 * (story 19.7a, AD-9; reused by story 19.7b). The aircraft needs a rate in
 * effect on `date` (`db-fixtures.ts#seedAircraftRate`), the instructor one too
 * (`seedInstructorRate`). A FIXTURE (story 19.9, E-R1): sent with `force:
 * true`, so the requirements of the flight (documents, fee, currency,
 * balance) never refuse it — a test that is ABOUT them posts its own body.
 * `isSolo` marks a SCHOOL flight the student flies alone (the instructor
 * supervises, not on board); `noCharge` leaves the balance untouched (E-R5:
 * the way to build a currency). Returns the created flight's id.
 */
export async function registerFlightOn(
  page: Page,
  flight: {
    aircraftId: string;
    personId: string;
    instructorPersonId?: string;
    flightType: 'TOURISM' | 'SCHOOL';
    date: string;
    isSolo?: boolean;
    noCharge?: boolean;
  },
): Promise<string> {
  const takeoffAt = romeWallClockIso(flight.date, '10:00');
  const response = await page.request.post('/api/v1/flights', {
    data: {
      aircraftId: flight.aircraftId,
      personId: flight.personId,
      ...(flight.instructorPersonId !== undefined ? { instructorPersonId: flight.instructorPersonId } : {}),
      ...(flight.isSolo !== undefined ? { isSolo: flight.isSolo } : {}),
      ...(flight.noCharge !== undefined ? { noCharge: flight.noCharge } : {}),
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      flightType: flight.flightType,
      takeoffAt,
      landingAt: new Date(new Date(takeoffAt).getTime() + 30 * 60_000).toISOString(),
      force: true,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { flight: { id: string } }).flight.id;
}

/**
 * Today on the Europe/Rome calendar, `YYYY-MM-DD` (story 19.3, A16) — the
 * "today" the API's `RATE_VALID_FROM_IN_PAST` checks against. A UTC date
 * would be "yesterday" for Rome between 00:00 and 01:00/02:00, and a rate
 * written for it would be a 422.
 */
export function todayRome(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** `YYYY-MM-DD` plus `days` calendar days (negative to go back), UTC arithmetic on a date-only string. */
export function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Types into a `SearchCombobox` and clicks the matching option (story 19.5:
 * the booking forms' choice fields became comboboxes) — same body as the
 * local copy in `flights.spec.ts`. `combobox`
 * must already resolve to the specific `<input>`; the option lookup is scoped
 * to the popup (`role=listbox`) with `exact: true`, never page-level.
 */
export async function selectFromCombobox(combobox: Locator, query: string, optionLabel: string): Promise<void> {
  await combobox.click();
  await combobox.fill(query);
  await combobox.page().getByRole('listbox').getByRole('option', { name: optionLabel, exact: true }).click();
}

/** The membership fee `ensureFlightRequirements` charges (any positive amount: the fee setting only precompiles the UI field). */
export const E2E_MEMBERSHIP_FEE_CENTS = 1000;

/**
 * A person "in regola" for a flight's requirements (story 19.9, E-R5 — reused
 * by story 19.10): every currently active blocking document
 * (`ensureValidSeedExpiries`), then a top-up of `topUpCents`, then the
 * membership fee (`E2E_MEMBERSHIP_FEE_CENTS`, charged AFTER the top-up so the
 * fee needs no deroga of its own — `topUpCents` must cover it). Returns the
 * balance left. The currency is NOT built here: the test registers its own
 * flight in the window (`registerFlightOn` with `noCharge: true`, which leaves
 * the balance as it is).
 */
export async function ensureFlightRequirements(
  page: Page,
  person: { personId: string; scope: 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS'; topUpCents: number },
): Promise<{ balanceCents: number }> {
  await ensureValidSeedExpiries(page, person.personId, person.scope);
  const topUp = await page.request.post(`/api/v1/people/${person.personId}/account/top-ups`, {
    data: { amountCents: person.topUpCents, paymentMethod: 'CASH', effectiveDate: todayRome() },
  });
  expect(topUp.status(), await topUp.text()).toBe(200);
  const fee = await page.request.post(`/api/v1/people/${person.personId}/membership-fee`, {
    data: { amountCents: E2E_MEMBERSHIP_FEE_CENTS },
    headers: { 'Idempotency-Key': `e2e-fee-${person.personId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  });
  expect(fee.status(), await fee.text()).toBe(200);
  return { balanceCents: ((await fee.json()) as { balanceCents: number }).balanceCents };
}

/** One entry of a 422 `REQUIREMENTS_NOT_MET`'s `details.failures` (story 19.9) — the e2e view of `src/lib/schemas/requirements.ts`. */
export type E2eRequirementFailure = { type: string; role?: string; personName?: string; typeName?: string; expiresAt?: string | null; [key: string]: unknown };

/**
 * Story 19.9 (E-R6): the failures that belong to the test. The e2e catalogue
 * is GLOBAL and shared by parallel specs, which create blocking RATINGs of
 * their own (scope `ALL` included, TD 16.2-g): on any fresh person they show
 * up as MISSING documents (`expiresAt: null`). Those are dropped here; kept
 * are every non-EXPIRY failure, every expired document (a fresh person has
 * only the ones the test registered), the medical requirement and the types
 * the test itself names.
 */
export function ownFailures<T extends E2eRequirementFailure>(failures: T[], ownTypeNames: string[] = []): T[] {
  return failures.filter(
    (failure) =>
      failure.type !== 'EXPIRY' ||
      failure.expiresAt !== null ||
      ownTypeNames.includes(failure.typeName ?? '') ||
      (failure.typeName ?? '').includes('Visita medica'),
  );
}

/** A person `ensureFlightRequirements` made "in regola", with the scope it was covered for. */
export type InRegolaPerson = { personId: string; scope: 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' };

/** True when a flight write was refused ONLY for missing documents of types the test never named (`ownFailures` keeps none). */
async function refusedOnlyByForeignTypes(response: { status(): number; json(): Promise<unknown> }): Promise<boolean> {
  if (response.status() !== 422) return false;
  const failures = ((await response.json()) as { error?: { code?: string; details?: { failures?: E2eRequirementFailure[] } } }).error?.details?.failures;
  return failures !== undefined && failures.length > 0 && ownFailures(failures).length === 0;
}

/**
 * Story 19.9 (review F5, TD 16.2-g): a flight write that must meet NO
 * requirement, for people made "in regola" by `ensureFlightRequirements`.
 * That state is a snapshot of a GLOBAL catalogue: a sibling spec can
 * activate a blocking RATING (scope `ALL`) right after it, and the person
 * then misses that document. Only for that answer — a 422 whose every item
 * is such a missing document — are the people covered again and the request
 * resent (twice at most); any other answer, a failure the test owns
 * included, is returned as is for the caller to assert.
 */
export async function sendInRegola(page: Page, people: InRegolaPerson[], send: () => Promise<APIResponse>): Promise<APIResponse> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await send();
    if (attempt === 3 || !(await refusedOnlyByForeignTypes(response))) return response;
    for (const person of people) await ensureValidSeedExpiries(page, person.personId, person.scope);
  }
}

/**
 * The flight-form counterpart of `sendInRegola` (review F5): clicks `submit`
 * and waits for the flight write it sends; when that write was refused ONLY
 * for a sibling spec's missing documents, covers the people again, closes
 * the warning with «Annulla» and clicks again (twice at most). The caller
 * asserts the outcome it expects.
 */
export async function submitInRegola(page: Page, people: InRegolaPerson[], submit: Locator): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    const answered = page.waitForResponse(
      (response) => /^\/api\/v1\/flights(\/[^/]+)?$/.test(new URL(response.url()).pathname) && ['POST', 'PUT'].includes(response.request().method()),
    );
    await submit.click();
    if (attempt === 3 || !(await refusedOnlyByForeignTypes(await answered))) return;
    for (const person of people) await ensureValidSeedExpiries(page, person.personId, person.scope);
    await page.getByTestId('requirements-warning').getByTestId('requirements-cancel').click();
  }
}

/**
 * Story 19.9 (E-R2): a registration or edit from the flight form whose
 * subject is NOT the requirements warning — asserts the warning IS there (a
 * fixture person fails at least the fee and the balance by construction) and
 * clicks «Procedi comunque». Deliberately NOT conditional: a "click it if it
 * shows" helper would hide a regression of the warning itself.
 */
export async function submitPastRequirements(page: Page): Promise<void> {
  const warning = page.getByTestId('requirements-warning');
  await expect(warning).toBeVisible();
  await warning.getByTestId('requirements-proceed').click();
}
