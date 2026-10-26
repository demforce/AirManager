/**
 * `?status` on `/dashboard/bookings` (story 15.4, ratifica R-15.4-e) — the
 * defensive URL contract of `?view`/`?date` (`bookings/page.tsx`), applied to
 * the list's status filter: an unknown, empty or malformed value NEVER errors,
 * it falls back to "every status".
 *
 * It exists because story 15.3 (review fix F3) shipped a deep link to
 * `/dashboard/bookings?status=PENDING` from the phone's pending queue, while
 * the page did not read `status` at all — the link landed on the unfiltered
 * list, and the e2e that guards it asserts only the URL, so the suite could
 * not see it.
 *
 * `param` is the CANONICAL echo of the filter, the string every href on the
 * page carries back (pagination, calendar navigation, export): `null` means
 * "no filter", which keeps the default URL exactly as clean as it is today.
 */

export const BOOKING_STATUS_VALUES = ['PENDING', 'APPROVED', 'DENIED', 'FLOWN', 'NO_SHOW', 'CANCELLED'] as const;

export type BookingStatusValue = (typeof BOOKING_STATUS_VALUES)[number];

export type BookingStatusFilter = {
  /** The statuses to fetch — never empty (an unrecognized filter means "all", not "none"). */
  statuses: BookingStatusValue[];
  /** Canonical `?status` value to re-emit in hrefs, or `null` when the filter is the default "all". */
  param: string | null;
};

const ALL_STATUSES: BookingStatusValue[] = [...BOOKING_STATUS_VALUES];

/**
 * Accepts one value or a comma-separated list, case-insensitively, and drops
 * whatever it does not recognize. The result is de-duplicated and re-ordered
 * canonically (`BOOKING_STATUS_VALUES`' own order) so the same filter always
 * produces the same href, whatever the user typed.
 *
 * **A REPEATED param is an ARRAY** (review 15.4 F2): in the App Router
 * `searchParams` hands `?status=PENDING&status=APPROVED` over as
 * `['PENDING','APPROVED']`, and `raw.split` threw on it — the page answered
 * **500**, breaking this module's own "never errors" contract on the very
 * channel this story added (`?view`/`?date` survive it: `includes`/`RegExp.test`
 * tolerate an array). Joining is the whole fix: the comma is ALREADY a valid
 * separator here, so `?status=A&status=B` and `?status=A,B` mean the same
 * filter and echo back the same canonical `param`.
 */
export function sanitizeBookingStatusFilter(raw: string | string[] | undefined): BookingStatusFilter {
  const value = Array.isArray(raw) ? raw.join(',') : raw;
  if (!value) return { statuses: ALL_STATUSES, param: null };

  const requested = new Set(value.split(',').map((entry) => entry.trim().toUpperCase()));
  const statuses = BOOKING_STATUS_VALUES.filter((status) => requested.has(status));

  if (statuses.length === 0 || statuses.length === BOOKING_STATUS_VALUES.length) {
    return { statuses: ALL_STATUSES, param: null };
  }
  return { statuses: [...statuses], param: statuses.join(',') };
}
