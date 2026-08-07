import { describe, expect, it } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { APP_TIMEZONE } from '@/lib/time';
import { zonedMidnightUtc } from '@/lib/zoned-time';
import { computeAogImpact } from './aog-impact';

/**
 * Story AOG-1b, AC 1 — the six cases of the ONE domain function, with EXACT
 * numbers.
 *
 * The Prisma client is a PARAMETER of `computeAogImpact` (see the module's own
 * doc-comment), so these tests need no `vi.mock` at all: the fake below
 * EVALUATES the `where` the function emits against a fixture list, implementing
 * only the three documented Prisma operators the query uses (`in`, `gte`,
 * `lt`). That makes every assertion behavioural — "this booking counts, that
 * one does not" — instead of a shape-match on a query object, which is what
 * the inclusive boundary of R-AOG-a actually needs to be pinned by.
 */

type Row = { id: string; aircraftId: string; status: string; personId: string; startsAt: Date };

type EmittedWhere = {
  aircraftId: string;
  status: { in: string[] };
  startsAt: { gte: Date; lt?: Date };
};

function fakeClient(rows: Row[]): Prisma.TransactionClient {
  return {
    booking: {
      findMany: async ({ where }: { where: EmittedWhere }) =>
        rows
          .filter((row) => row.aircraftId === where.aircraftId)
          .filter((row) => where.status.in.includes(row.status))
          .filter((row) => row.startsAt.getTime() >= where.startsAt.gte.getTime())
          .filter((row) => where.startsAt.lt === undefined || row.startsAt.getTime() < where.startsAt.lt.getTime())
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    },
  } as unknown as Prisma.TransactionClient;
}

const AIRCRAFT = 'aircraft_1';
const OTHER_AIRCRAFT = 'aircraft_2';
/** Fixed instants, never `new Date()`: a window test whose result depends on the wall clock proves nothing (lezione 15.4 F1). */
const NOW = new Date('2026-08-07T09:00:00.000Z');
/** `@db.Date` round-trips as a UTC-midnight `Date` — that is the exact shape `setOutOfService` reads back and hands to the function. */
const UNTIL = new Date(Date.UTC(2026, 7, 20));

function booking(id: string, status: string, startsAt: string, overrides: Partial<Row> = {}): Row {
  return { id, aircraftId: AIRCRAFT, status, personId: `person_${id}`, startsAt: new Date(startsAt), ...overrides };
}

describe('computeAogImpact (story AOG-1b, AD-1/AC 1 — the ONE counting function)', () => {
  it('(a) counts PENDING and APPROVED, SPLIT by state', async () => {
    const client = fakeClient([
      booking('p1', 'PENDING', '2026-08-08T08:00:00.000Z'),
      booking('p2', 'PENDING', '2026-08-09T08:00:00.000Z'),
      booking('a1', 'APPROVED', '2026-08-10T08:00:00.000Z'),
    ]);

    const impact = await computeAogImpact(client, { aircraftId: AIRCRAFT, until: UNTIL, now: NOW });

    expect(impact.pending).toBe(2);
    expect(impact.approved).toBe(1);
    // Only the APPROVED ones are handed back for the email (R-AOG-i): a PENDING
    // holder is never a recipient, and this is where that starts.
    expect(impact.approvedBookings.map((entry) => entry.id)).toEqual(['a1']);
  });

  it('(b) never counts the CLOSED states — DENIED, CANCELLED, FLOWN, NO_SHOW — even inside the window', async () => {
    const client = fakeClient([
      booking('a1', 'APPROVED', '2026-08-10T08:00:00.000Z'),
      booking('d1', 'DENIED', '2026-08-10T09:00:00.000Z'),
      booking('c1', 'CANCELLED', '2026-08-10T10:00:00.000Z'),
      booking('f1', 'FLOWN', '2026-08-10T11:00:00.000Z'),
      booking('n1', 'NO_SHOW', '2026-08-10T12:00:00.000Z'),
    ]);

    const impact = await computeAogImpact(client, { aircraftId: AIRCRAFT, until: UNTIL, now: NOW });

    expect(impact).toMatchObject({ pending: 0, approved: 1 });
    expect(impact.approvedBookings).toHaveLength(1);
  });

  it('(c) never counts a booking that has already started, nor one on ANOTHER aircraft', async () => {
    const client = fakeClient([
      booking('past', 'APPROVED', '2026-08-06T08:00:00.000Z'),
      // Same day as `now`, one hour EARLIER — "already started" is an instant
      // comparison, not a calendar-day one.
      booking('earlierToday', 'APPROVED', '2026-08-07T08:00:00.000Z'),
      // Exactly `now`: the window is closed on the left (`gte`), so it counts.
      booking('exactlyNow', 'APPROVED', '2026-08-07T09:00:00.000Z'),
      booking('elsewhere', 'APPROVED', '2026-08-10T08:00:00.000Z', { aircraftId: OTHER_AIRCRAFT }),
    ]);

    const impact = await computeAogImpact(client, { aircraftId: AIRCRAFT, until: UNTIL, now: NOW });

    expect(impact).toMatchObject({ pending: 0, approved: 1 });
    expect(impact.approvedBookings.map((entry) => entry.id)).toEqual(['exactlyNow']);
  });

  it('(d) INCLUSIVE boundary (R-AOG-a): the day BEFORE and the day OF `until` count, the day AFTER does not', async () => {
    // The three instants that decide this story, around `until` = 2026-08-20
    // (CEST, UTC+2): the last one is 00:30 Rome of 21/08, i.e. 22:30Z of 20/08 —
    // the trap an exclusive `until` (or a naive UTC end-of-day) would get wrong.
    const client = fakeClient([
      booking('dayBefore', 'APPROVED', '2026-08-19T10:00:00.000Z'),
      booking('onUntilDay', 'APPROVED', '2026-08-20T10:00:00.000Z'),
      booking('lateOnUntilDay', 'APPROVED', '2026-08-20T20:30:00.000Z'),
      booking('dayAfter', 'APPROVED', '2026-08-20T22:30:00.000Z'),
    ]);

    const impact = await computeAogImpact(client, { aircraftId: AIRCRAFT, until: UNTIL, now: NOW });

    expect(impact.approved).toBe(3);
    expect(impact.approvedBookings.map((entry) => entry.id)).toEqual(['dayBefore', 'onUntilDay', 'lateOnUntilDay']);
  });

  it('(d-bis) the exclusive upper bound IS wall-clock midnight of the day after `until`, in APP_TIMEZONE', async () => {
    const boundary = zonedMidnightUtc('2026-08-21', APP_TIMEZONE);
    const client = fakeClient([
      booking('oneMsBefore', 'APPROVED', new Date(boundary.getTime() - 1).toISOString()),
      booking('exactlyAt', 'APPROVED', boundary.toISOString()),
    ]);

    const impact = await computeAogImpact(client, { aircraftId: AIRCRAFT, until: UNTIL, now: NOW });

    expect(impact.approvedBookings.map((entry) => entry.id)).toEqual(['oneMsBefore']);
  });

  it('(e) with `until = null` the window is NOT delimited — every live future booking counts (invariant [b])', async () => {
    const client = fakeClient([
      booking('p1', 'PENDING', '2026-08-08T08:00:00.000Z'),
      booking('inside', 'APPROVED', '2026-08-10T08:00:00.000Z'),
      // Both of these fall OUTSIDE the dated window of case (d) and inside this one.
      booking('afterUntil', 'APPROVED', '2026-08-21T08:00:00.000Z'),
      booking('farFuture', 'APPROVED', '2031-05-04T08:00:00.000Z'),
      booking('past', 'APPROVED', '2026-08-06T08:00:00.000Z'),
    ]);

    const undelimited = await computeAogImpact(client, { aircraftId: AIRCRAFT, until: null, now: NOW });
    const delimited = await computeAogImpact(client, { aircraftId: AIRCRAFT, until: UNTIL, now: NOW });

    expect(undelimited).toMatchObject({ pending: 1, approved: 3 });
    // The SAME fixture, delimited: the two beyond `until` drop out. This pair is
    // the discriminance of invariant [b] — a "no date means today" reading would
    // make the two numbers equal.
    expect(delimited).toMatchObject({ pending: 1, approved: 1 });
  });

  it('(f) an aircraft with no live bookings counts ZERO — a result, not an error', async () => {
    const client = fakeClient([booking('c1', 'CANCELLED', '2026-08-10T08:00:00.000Z')]);

    await expect(computeAogImpact(client, { aircraftId: AIRCRAFT, until: UNTIL, now: NOW })).resolves.toEqual({
      pending: 0,
      approved: 0,
      approvedBookings: [],
    });
  });

  it('invariant [a] (AC 9): an `until` already in the PAST still counts every live future booking — an expired window NEVER zeroes the warning', async () => {
    const client = fakeClient([
      booking('p1', 'PENDING', '2026-08-08T08:00:00.000Z'),
      booking('a1', 'APPROVED', '2026-08-09T08:00:00.000Z'),
      booking('far', 'APPROVED', '2031-05-04T08:00:00.000Z'),
    ]);

    // `until` = the day BEFORE `now`. Taken literally, `[now, end of yesterday]`
    // is an empty window and the count would be 0 — which would silence the
    // warning exactly when the fermo has overrun. The rule (module doc-comment)
    // is that such a bound is no bound...
    const expired = await computeAogImpact(client, { aircraftId: AIRCRAFT, until: new Date(Date.UTC(2026, 7, 6)), now: NOW });
    expect(expired).toMatchObject({ pending: 1, approved: 2 });

    // ...i.e. IDENTICAL to the undelimited window, never to an empty one.
    const undelimited = await computeAogImpact(client, { aircraftId: AIRCRAFT, until: null, now: NOW });
    expect(expired).toEqual(undelimited);
  });
});
