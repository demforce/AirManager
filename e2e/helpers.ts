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
 * Story 14.4 (review F5, ratifica R-14.4-a): since that story, a person with
 * NO `Expiry` row at all for an ACTIVE `ExpiryType.blocksBooking` type
 * APPLICABLE to their role (`scope` ALL or their own) is rejected from
 * flight registration exactly like an expired one
 * (`flights.service.ts#findMissingBlockingDocuments`). The seed ships one
 * such type per PILOTS/STUDENTS/INSTRUCTORS scope (plus "Licenza", PILOTS)
 * — but several OTHER specs (`bookings.spec.ts#createExpiryTypeForBooking`,
 * this file's own custom-type tests) ALSO create run-unique `scope: 'ALL'`
 * blocking types for their own purposes and never deactivate them
 * afterward, so on this suite's long-lived, never-reset e2e DB they
 * accumulate and block EVERY later fresh person too — a fixed list of the
 * 4 known seed names is not enough. This is therefore a full DYNAMIC scan
 * (mirrors `findMissingBlockingDocuments`'s own `isActive`/`blocksBooking`/
 * `scope in [ALL, <scope>]` filter exactly) that registers a FAR-FUTURE
 * (valid) `Expiry` for every currently-active applicable blocking type, so
 * a spec's "happy path" flight registrations are never spuriously blocked
 * by ambient state.
 *
 * Caller ordering matters: call this RIGHT AFTER creating the person's
 * profile, BEFORE the test creates any custom blocking `ExpiryType` of its
 * OWN for that same person (several `flights.spec.ts` tests register one as
 * EXPIRED right after) — otherwise this scan would already register a VALID
 * expiry for that brand-new type and the test's own subsequent EXPIRED
 * registration would collide on the `Expiry` unique constraint
 * (personId+expiryTypeId).
 *
 * Idempotent (skips types the person already has an `Expiry` row for): most
 * callers pass a brand-new `personId` where this never matters, but a few
 * specs call this for the long-lived SEEDED pilot/student/instructor too —
 * re-running against the same never-reset e2e DB would otherwise hit the
 * SAME unique constraint on a type this exact function already covered on a
 * PRIOR run.
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
  const types = (await typesResponse.json()) as { id: string; scope: string; blocksBooking: boolean }[];
  const applicable = types.filter((type) => type.blocksBooking && (type.scope === 'ALL' || type.scope === scope));
  if (applicable.length === 0) return;

  const existingResponse = await page.request.get(`/api/v1/expiries?personId=${personId}&pageSize=100`);
  expect(existingResponse.status()).toBe(200);
  const existing = (await existingResponse.json()) as { items: { expiryTypeId: string }[] };
  const alreadyRegisteredTypeIds = new Set(existing.items.map((item) => item.expiryTypeId));

  for (const type of applicable) {
    if (alreadyRegisteredTypeIds.has(type.id)) continue;
    const response = await page.request.post('/api/v1/expiries', { data: { personId, expiryTypeId: type.id, expiresAt: FAR_FUTURE_DATE } });
    if (response.status() === 409) continue;
    expect(response.status()).toBe(201);
  }
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
 * local copies in `flights.spec.ts`/`flight-reversal.spec.ts`. `combobox`
 * must already resolve to the specific `<input>`; the option lookup is scoped
 * to the popup (`role=listbox`) with `exact: true`, never page-level.
 */
export async function selectFromCombobox(combobox: Locator, query: string, optionLabel: string): Promise<void> {
  await combobox.click();
  await combobox.fill(query);
  await combobox.page().getByRole('listbox').getByRole('option', { name: optionLabel, exact: true }).click();
}
