import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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
 * their own) is rejected from flight registration exactly like an expired one
 * (`flights.service.ts#findMissingBlockingDocuments`). Several OTHER specs
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
 */
export async function ensureValidSeedExpiries(page: Page, personId: string, scope: 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS'): Promise<void> {
  const typesResponse = await page.request.get('/api/v1/expiry-types');
  expect(typesResponse.status()).toBe(200);
  // Active types only, ordered by name (the endpoint's defaults).
  const types = (await typesResponse.json()) as { id: string; scope: string; kind: string; blocksBooking: boolean }[];
  const ratings = types.filter((type) => type.kind === 'RATING' && type.blocksBooking && (type.scope === 'ALL' || type.scope === scope));
  const firstMedical = types.find((type) => type.kind === 'MEDICAL');
  if (ratings.length === 0 && firstMedical === undefined) return;

  const existingResponse = await page.request.get(`/api/v1/expiries?personId=${personId}&pageSize=100`);
  expect(existingResponse.status()).toBe(200);
  const existing = (await existingResponse.json()) as { items: { expiryTypeId: string; category: string }[] };
  const alreadyRegisteredTypeIds = new Set(existing.items.map((item) => item.expiryTypeId));
  const hasVisit = existing.items.some((item) => item.category === 'MEDICAL');

  const toRegister = [...ratings.filter((type) => !alreadyRegisteredTypeIds.has(type.id)), ...(firstMedical !== undefined && !hasVisit ? [firstMedical] : [])];
  for (const type of toRegister) {
    const response = await page.request.post('/api/v1/expiries', { data: { personId, expiryTypeId: type.id, expiresAt: FAR_FUTURE_DATE } });
    if (response.status() === 409) continue;
    expect(response.status()).toBe(201);
  }
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
 * (`seedInstructorRate`), and everyone on board their blocking documents
 * (`ensureValidSeedExpiries`). `isSolo` marks a SCHOOL flight the student
 * flies alone (the instructor supervises, not on board). Returns the created
 * flight's id.
 */
export async function registerFlightOn(
  page: Page,
  flight: { aircraftId: string; personId: string; instructorPersonId?: string; flightType: 'TOURISM' | 'SCHOOL'; date: string; isSolo?: boolean },
): Promise<string> {
  const takeoffAt = romeWallClockIso(flight.date, '10:00');
  const response = await page.request.post('/api/v1/flights', {
    data: {
      aircraftId: flight.aircraftId,
      personId: flight.personId,
      ...(flight.instructorPersonId !== undefined ? { instructorPersonId: flight.instructorPersonId } : {}),
      ...(flight.isSolo !== undefined ? { isSolo: flight.isSolo } : {}),
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      flightType: flight.flightType,
      takeoffAt,
      landingAt: new Date(new Date(takeoffAt).getTime() + 30 * 60_000).toISOString(),
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
