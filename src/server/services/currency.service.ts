import { Prisma } from '@/generated/prisma/client';
import { computeCurrency, type CurrencyResult, type CurrencySettings } from '@/lib/currency';
import { parseDateOnlyUtc } from '@/lib/date-only';
import { daysUntilUtc } from '@/lib/expiry-status';
import { addDaysDateOnly } from '@/lib/zoned-time';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { getCurrencySettings } from './app-settings.service';

/**
 * Currency of pilots and students (story 19.7a, R-19-i, CR §4.5) — DERIVED
 * from the registered flights, never stored. The window rule is the pure
 * `@/lib/currency#computeCurrency`; this module only feeds it the dates.
 *
 * "On board" (D-7) = the flight's `personId` OR the person behind its
 * instructor profile: a flight flown as instructor counts like one flown as
 * pilot, and a dual flight counts for both. A SOLO (`isSolo`, a SCHOOL flight
 * the student flies alone) counts for the student only: its instructor
 * supervises from the ground, not on board (CR §4.5, review 19.7a F2). A
 * flight counts ONCE per person. Every `Flight` row is a registered flight
 * (story 19.6 removed the cancelled state).
 */

/**
 * The on-board flight dates (`YYYY-MM-DD`, most recent first) of each of
 * `personIds` up to `atDate`, trimmed to what `computeCurrency` needs: per
 * person the `minFlights` most recent (for the expiry date) plus every flight
 * inside the window `[atDate − windowDays, atDate]` (for the count). One
 * batched query; people with no flight are absent from the map.
 *
 * Dates go in as strings cast `::date` and come out through `to_char` — a JS
 * `Date` bound here would be a `timestamptz` and could shift the day.
 * `excludeFlightId` leaves one flight out (the one being edited, story 19.6's
 * `PUT /flights/{id}`, for the checks of stories 19.9/19.10).
 */
export async function loadOnBoardFlightDates(
  personIds: string[],
  atDate: string,
  settings: CurrencySettings,
  excludeFlightId?: string,
): Promise<Map<string, string[]>> {
  if (personIds.length === 0) {
    return new Map();
  }

  const windowStart = addDaysDateOnly(atDate, -settings.windowDays);
  const excluded = excludeFlightId === undefined ? Prisma.empty : Prisma.sql`AND f."id" <> ${excludeFlightId}`;
  const rows = await prisma.$queryRaw<Array<{ personId: string; flightDate: string }>>`
    WITH on_board AS (
      SELECT f."id", f."personId", f."flightDate"
      FROM "Flight" f
      WHERE f."personId" IN (${Prisma.join(personIds)}) AND f."flightDate" <= ${atDate}::date ${excluded}
      UNION
      SELECT f."id", ip."personId", f."flightDate"
      FROM "Flight" f
      JOIN "InstructorProfile" ip ON ip."id" = f."instructorProfileId"
      WHERE ip."personId" IN (${Prisma.join(personIds)}) AND f."isSolo" = false AND f."flightDate" <= ${atDate}::date ${excluded}
    ),
    ranked AS (
      SELECT "personId", "flightDate", ROW_NUMBER() OVER (PARTITION BY "personId" ORDER BY "flightDate" DESC, "id" DESC) AS "rank"
      FROM on_board
    )
    SELECT "personId", to_char("flightDate", 'YYYY-MM-DD') AS "flightDate"
    FROM ranked
    WHERE "rank" <= ${settings.minFlights} OR "flightDate" >= ${windowStart}::date
    ORDER BY "personId", "flightDate" DESC`;

  const byPerson = new Map<string, string[]>();
  for (const row of rows) {
    const dates = byPerson.get(row.personId) ?? [];
    dates.push(row.flightDate);
    byPerson.set(row.personId, dates);
  }
  return byPerson;
}

/**
 * The currency of ONE person at `atDate` (`YYYY-MM-DD`, Rome — A16), with the
 * settings read on every call. No actor and no subject filter: the checks of
 * stories 19.9/19.10 call it for whoever flies solo.
 */
export async function getCurrencyStatus(personId: string, atDate: string, options?: { excludeFlightId?: string }): Promise<CurrencyResult> {
  const settings = await getCurrencySettings();
  const dates = await loadOnBoardFlightDates([personId], atDate, settings, options?.excludeFlightId);
  return computeCurrency(dates.get(personId) ?? [], atDate, settings);
}

/** One row of the Pilots page's currency (story 19.7a, AD-6): `daysUntil` = whole days from `today` to `expiresAt` (negative once expired). */
export type PersonCurrency = { current: boolean; expiresAt: string | null; daysUntil: number | null };

/**
 * The currency of the currency SUBJECTS among `personIds` (D-8: not archived,
 * with an ACTIVE pilot or student profile — an instructor without a pilot
 * profile has none) at `today` (Rome). Batched over the ids of the current
 * page, same rationale as `listBlockingExpiriesByPerson`, and gated the same
 * way: `people.read`, the permission of the page it is a column of. People
 * who are not subjects are ABSENT from the map.
 */
export async function listCurrencyByPerson(actor: Actor, personIds: string[], today: string): Promise<Map<string, PersonCurrency>> {
  authorize(actor, 'people.read');

  if (personIds.length === 0) {
    return new Map();
  }

  const subjects = await prisma.person.findMany({
    where: {
      id: { in: personIds },
      archivedAt: null,
      OR: [{ pilotProfile: { deactivatedAt: null } }, { studentProfile: { deactivatedAt: null } }],
    },
    select: { id: true },
  });
  if (subjects.length === 0) {
    return new Map();
  }

  const settings = await getCurrencySettings();
  const subjectIds = subjects.map((subject) => subject.id);
  const datesByPerson = await loadOnBoardFlightDates(subjectIds, today, settings);
  const todayDate = parseDateOnlyUtc(today);

  const byPerson = new Map<string, PersonCurrency>();
  for (const id of subjectIds) {
    const result = computeCurrency(datesByPerson.get(id) ?? [], today, settings);
    byPerson.set(id, {
      current: result.current,
      expiresAt: result.expiresAt,
      daysUntil: result.expiresAt === null ? null : daysUntilUtc(parseDateOnlyUtc(result.expiresAt), todayDate),
    });
  }
  return byPerson;
}
