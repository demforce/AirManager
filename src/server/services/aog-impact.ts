/**
 * The ONE domain function behind "Stai per impattare N prenotazioni" (story
 * AOG-1b, AD-1 / ratifica R-AOG-b). Both call sites — the PREVIEW the admin
 * sees before grounding an aircraft and the AUTHORITATIVE recount inside
 * `setOutOfService`'s own transaction — call {@link computeAogImpact}; there
 * is deliberately no second implementation to keep aligned (that duplication
 * is exactly what AD-1 exists to prevent).
 *
 * Why its own module rather than a function inside `aircraft.service.ts`
 * (AD-1 asks the choice to be justified):
 * - **no import cycle, by construction**: the count reads `Booking` while its
 *   caller writes `Aircraft`, so the obvious placements would have coupled
 *   `aircraft.service.ts` and `bookings.service.ts` in one direction or the
 *   other. This module imports NOTHING from `services/` — only the two pure
 *   date helpers and Prisma's types — and only `aircraft.service.ts` imports
 *   it. There is no edge to close a cycle with.
 * - **its unit tests run in a clean shell** (AC 16): the Prisma client is a
 *   PARAMETER, not the `@/server/db/prisma` singleton, so the six boundary
 *   cases of AC 1 are exercised without dragging in `@/lib/env`'s eager
 *   validation through the mail chain their caller now imports. Same reasoning
 *   that put `outOfServiceDetails` in `aircraft-status.ts` in story AOG-1a.
 *
 * **The window** (ratifica R-AOG-a, semantica INCLUSIVA): `[now, end of the
 * `until` calendar day]` — a booking that starts ON the day of `until` is
 * INSIDE. The semantics itself is written ONCE, in `schema.prisma`'s
 * doc-comment on `Aircraft.outOfServiceUntil`; this module implements it and
 * never re-interprets it. With `until === null` (invariant [b], "return date
 * not yet known") the window is `[now, ∞)`: NOT delimited, which is a
 * different statement from "delimited by today".
 *
 * **An upper bound already in the past is NOT a bound** (AC 9, and the reason
 * it spells the rule out): a grounding whose expected return day has come and
 * gone is still a grounding — invariant [a], only `returnToService` re-opens
 * an aircraft — so the arithmetic answer for `[now, end of a past day]` (an
 * empty window, count zero) would silence the warning EXACTLY when the fermo
 * has overrun, which is when it matters most. Such a bound therefore falls
 * back to the undelimited window, in this ONE place, for both call sites.
 *
 * **The states**: exactly `PENDING` and `APPROVED`. `DENIED`/`CANCELLED`/
 * `FLOWN`/`NO_SHOW` are CLOSED states and never count. The split is not
 * decorative: `PENDING` is already frozen by the 422 an approval would hit,
 * while `APPROVED` survives untouched — which is precisely the subset the
 * grounding email goes to (R-AOG-i).
 */
import type { Prisma } from '@/generated/prisma/client';
import { toDateOnlyString } from '@/lib/date-only';
import { APP_TIMEZONE } from '@/lib/time';
import { addDaysDateOnly, zonedMidnightUtc } from '@/lib/zoned-time';

/** The advisory number itself, split by state — the shape the preview, the response DTO and the persistent row all render. */
export type AogBookingImpact = {
  /** Bookings a 422 already freezes at approval time (`bookings.service.ts#transitionBooking`). */
  pending: number;
  /** Bookings nothing in the app stops — the ones a human has to deal with, and the email recipients (R-AOG-i). */
  approved: number;
};

/** One impacted APPROVED booking, reduced to what the grounding email needs (story AOG-1b, AC 10). */
export type ImpactedApprovedBooking = {
  id: string;
  personId: string;
  startsAt: Date;
};

export type AogImpact = AogBookingImpact & {
  /**
   * The impacted APPROVED bookings, `startsAt`-ascending — the email
   * recipients. Empty for the preview's purposes; the caller decides whether
   * to use it (the preview ignores it, the grounding fans out over it).
   */
  approvedBookings: ImpactedApprovedBooking[];
};

/**
 * Upper bound of the counting window, EXCLUSIVE: wall-clock midnight of the
 * day AFTER `until`, in `APP_TIMEZONE`. That is what "fino a fine giornata di
 * `until`, compreso" means as an instant, and it is built from the two
 * existing DST-aware primitives (`addDaysDateOnly` + `zonedMidnightUtc`, the
 * same composition `todayTomorrowRangeUtc` already uses) rather than from new
 * date arithmetic. `until` is a `@db.Date` value, i.e. a UTC-midnight `Date`
 * carrying no time-of-day — `toDateOnlyString` reads its calendar day back
 * with the UTC parts, per `date-only.ts`'s own rule.
 */
function windowEndExclusive(until: Date): Date {
  return zonedMidnightUtc(addDaysDateOnly(toDateOnlyString(until), 1), APP_TIMEZONE);
}

/**
 * Counts the bookings a grounding would impact, split by state, and returns
 * the APPROVED ones (the email recipients) in the same pass — ONE query, ONE
 * window, ONE definition (AD-1).
 *
 * `client` is `prisma` for the preview and the transaction's `tx` for the
 * authoritative recount, so the number in the response is computed on the
 * SAME connection that just wrote the grounding: no TOCTOU between the write
 * and the number that reports it.
 *
 * A booking that has ALREADY STARTED does not count (`startsAt >= now`): the
 * grounding cannot un-fly it, and the admin is being told what is still ahead.
 */
export async function computeAogImpact(
  client: Prisma.TransactionClient,
  params: { aircraftId: string; until: Date | null; now: Date },
): Promise<AogImpact> {
  // An `until` whose day has already ended is not a bound at all (module
  // doc-comment, AC 9): `undefined` here IS the undelimited window.
  const end = params.until === null ? undefined : windowEndExclusive(params.until);
  const upperBound = end !== undefined && end.getTime() > params.now.getTime() ? end : undefined;

  const rows = await client.booking.findMany({
    where: {
      aircraftId: params.aircraftId,
      status: { in: ['PENDING', 'APPROVED'] },
      startsAt: {
        gte: params.now,
        ...(upperBound === undefined ? {} : { lt: upperBound }),
      },
    },
    select: { id: true, status: true, personId: true, startsAt: true },
    orderBy: { startsAt: 'asc' },
  });

  let pending = 0;
  const approvedBookings: ImpactedApprovedBooking[] = [];
  for (const row of rows) {
    if (row.status === 'PENDING') {
      pending += 1;
    } else {
      approvedBookings.push({ id: row.id, personId: row.personId, startsAt: row.startsAt });
    }
  }

  return { pending, approved: approvedBookings.length, approvedBookings };
}
