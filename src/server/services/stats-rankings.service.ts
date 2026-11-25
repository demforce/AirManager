import { Prisma } from '@/generated/prisma/client';
import { paginate, type PaginationQuery } from '@/lib/api/pagination';
import { STATS_RANKING_PREVIEW_SIZE, type StatsRankingKey, type StatsRankingQuery, type StatsRankingResponseDto } from '@/lib/schemas/stats';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { getCompensationSummary } from './instructor-compensation.service';
import { resolveStatsPeriod, type StatsDateRange } from './stats-period';

type RankingRow = {
  key: string | null;
  label: string;
  minutes: bigint;
  cents: bigint | null;
  total: bigint;
};

function rankingSource(rank: StatsRankingKey, range: StatsDateRange): Prisma.Sql {
  const dateWindow = Prisma.sql`f."flightDate" BETWEEN ${range.from}::date AND ${range.to}::date`;
  if (rank === 'fleet-hours' || rank === 'fleet-revenue') {
    return Prisma.sql`
      SELECT a.id AS key, a.registration AS label,
             COALESCE(f.minutes, 0) AS minutes, COALESCE(f.cents, 0) AS cents
      FROM "Aircraft" a
      LEFT JOIN (
        SELECT f."aircraftId", SUM(f.minutes) AS minutes, SUM(f."aircraftAmountCents") AS cents
        FROM "Flight" f WHERE ${dateWindow} GROUP BY f."aircraftId"
      ) f ON f."aircraftId" = a.id
      WHERE a."archivedAt" IS NULL AND a.status = 'OPERATIONAL'
    `;
  }
  if (rank === 'instructor-hours') {
    return Prisma.sql`
      SELECT p.id AS key, concat_ws(' ', p."firstName", p."lastName") AS label, SUM(f.minutes) AS minutes, NULL::bigint AS cents
      FROM "Flight" f
      JOIN "InstructorProfile" i ON i.id = f."instructorProfileId"
      JOIN "Person" p ON p.id = i."personId"
      WHERE ${dateWindow} AND f."flightType" = 'SCHOOL'
      GROUP BY p.id
    `;
  }
  return Prisma.sql`
    SELECT p.id AS key, concat_ws(' ', p."firstName", p."lastName") AS label, SUM(f.minutes) AS minutes,
           SUM(f."aircraftAmountCents"::bigint + COALESCE(f."instructorAmountCents", 0)::bigint)::bigint AS cents
    FROM "Flight" f JOIN "Person" p ON p.id = f."personId"
    WHERE ${dateWindow} GROUP BY p.id
  `;
}

function rankingItem(row: RankingRow, key: string) {
  return { key, label: row.label, minutes: Number(row.minutes), cents: row.cents === null ? null : Number(row.cents) };
}

const tieBreak = Prisma.sql`label COLLATE "C", key`;
const orderByHours = Prisma.sql`minutes DESC, ${tieBreak}`;
const orderByCents = Prisma.sql`cents DESC, ${tieBreak}`;

/** Query both rows and total, including when the requested page is empty. */
export async function readStatsRankingPage(rank: StatsRankingKey, range: StatsDateRange, query: PaginationQuery) {
  const order = rank === 'fleet-revenue' || rank === 'pilot-spent' ? orderByCents : orderByHours;
  const offset = BigInt(query.page - 1) * BigInt(query.pageSize);
  const rows = await prisma.$queryRaw<RankingRow[]>(Prisma.sql`
    WITH ranked AS (${rankingSource(rank, range)}),
    totals AS (SELECT COUNT(*) AS total FROM ranked),
    page_rows AS (
      SELECT * FROM ranked ORDER BY ${order} LIMIT ${query.pageSize} OFFSET ${offset}
    )
    SELECT page_rows.*, totals.total
    FROM totals LEFT JOIN page_rows ON true
    ORDER BY ${order}
  `);
  const items = rows.flatMap((row) => row.key === null ? [] : [rankingItem(row, row.key)]);
  return paginate(items, Number(rows[0]?.total ?? BigInt(0)), query);
}

/** Score both metrics over the same aggregation, returning at most 16 distinct rows. */
export async function readStatsRankingPreviewPair(scope: 'fleet' | 'pilot', range: StatsDateRange) {
  type ScoredRow = RankingRow & { key: string; rankHours: bigint; rankCents: bigint };
  const limit = STATS_RANKING_PREVIEW_SIZE;
  const rows = await prisma.$queryRaw<ScoredRow[]>(Prisma.sql`
    WITH ranked AS (${rankingSource(`${scope}-hours`, range)}),
    scored AS (
      SELECT *,
             ROW_NUMBER() OVER (ORDER BY ${orderByHours}) AS "rankHours",
             ROW_NUMBER() OVER (ORDER BY ${orderByCents}) AS "rankCents",
             COUNT(*) OVER () AS total
      FROM ranked
    )
    SELECT * FROM scored WHERE "rankHours" <= ${limit} OR "rankCents" <= ${limit}
  `);
  const total = Number(rows[0]?.total ?? BigInt(0));
  const preview = (column: 'rankHours' | 'rankCents') => ({
    total,
    items: rows.filter((row) => Number(row[column]) <= limit)
      .sort((a, b) => Number(a[column]) - Number(b[column]))
      .map((row) => rankingItem(row, row.key)),
  });
  return { hours: preview('rankHours'), money: preview('rankCents') };
}

export async function listStatsRanking(actor: Actor, query: StatsRankingQuery, now = new Date()): Promise<StatsRankingResponseDto> {
  authorize(actor, 'finance.manage');
  const { ref, isCurrentPeriod, range } = resolveStatsPeriod(query, now);
  const [page, compensation] = await Promise.all([
    readStatsRankingPage(query.rank, range, query),
    query.rank === 'instructor-hours' && isCurrentPeriod ? getCompensationSummary(actor) : Promise.resolve(null),
  ]);
  const owed = new Map(compensation?.map((person) => [person.personId, query.period === 'month' ? person.owedMtdCents : person.owedYtdCents]));
  return {
    ...page,
    items: query.rank === 'instructor-hours' ? page.items.map((item) => ({ ...item, cents: owed.get(item.key) ?? null })) : page.items,
    ref,
    period: query.period,
  };
}
