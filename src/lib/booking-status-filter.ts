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
 */
export function sanitizeBookingStatusFilter(raw: string | undefined): BookingStatusFilter {
  if (!raw) return { statuses: ALL_STATUSES, param: null };

  const requested = new Set(raw.split(',').map((value) => value.trim().toUpperCase()));
  const statuses = BOOKING_STATUS_VALUES.filter((status) => requested.has(status));

  if (statuses.length === 0 || statuses.length === BOOKING_STATUS_VALUES.length) {
    return { statuses: ALL_STATUSES, param: null };
  }
  return { statuses: [...statuses], param: statuses.join(',') };
}
