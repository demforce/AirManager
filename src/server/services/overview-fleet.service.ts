import type { AircraftStatus } from '@/generated/prisma/client';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';

type PreviewRow = {
  id: string;
  registration: string;
  type: string;
  model: string;
  status: AircraftStatus;
  statusReason: string | null;
  reserved: boolean;
  total: number;
  grounded: number;
  availableNow: number;
};

/** Rank the active fleet before limiting the cards. Counts and badges share one snapshot. */
export async function getOverviewFleet(actor: Actor, today: string, start: Date, end: Date, now: Date) {
  authorize(actor, 'aircraft.manage');
  // Like the “flights today” KPI, activity includes both logged flights (Rome
  // calendar date) and approved bookings overlapping that day. Each aircraft
  // occupies one row even when it flew or was booked more than once.
  const rows = await prisma.$queryRaw<PreviewRow[]>`
    WITH booked AS (
      SELECT "aircraftId", bool_or("startsAt" <= ${now} AND "endsAt" > ${now}) AS reserved
      FROM "Booking"
      WHERE status = 'APPROVED' AND "startsAt" < ${end} AND "endsAt" > ${start}
      GROUP BY "aircraftId"
    ), flown AS (
      SELECT DISTINCT "aircraftId" FROM "Flight" WHERE "flightDate" = ${today}::date
    )
    SELECT a.id, a.registration, a.type, a.model, a.status, a."statusReason",
           coalesce(b.reserved, false) AS reserved,
           (count(*) OVER ())::int AS total,
           (count(*) FILTER (WHERE a.status = 'OUT_OF_SERVICE') OVER ())::int AS grounded,
           (count(*) FILTER (WHERE a.status = 'OPERATIONAL' AND NOT coalesce(b.reserved, false)) OVER ())::int AS "availableNow"
    FROM "Aircraft" a
    LEFT JOIN booked b ON b."aircraftId" = a.id
    LEFT JOIN flown f ON f."aircraftId" = a.id
    WHERE a."archivedAt" IS NULL
    ORDER BY CASE WHEN a.status = 'OUT_OF_SERVICE' THEN 0
                  WHEN b."aircraftId" IS NOT NULL OR f."aircraftId" IS NOT NULL THEN 1
                  ELSE 2 END, a.registration, a.id
    LIMIT 8
  `;
  const { total = 0, grounded = 0, availableNow = 0 } = rows[0] ?? {};
  return {
    items: rows.map(({ id, registration, type, model, status, statusReason, reserved }) => ({
      id, registration, type, model, status, statusReason, reserved, archivedAt: null,
    })),
    total,
    grounded,
    availableNow,
  };
}
