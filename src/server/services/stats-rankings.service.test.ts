import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError, ValidationError } from './errors';

vi.mock('@/server/db/prisma', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('./instructor-compensation.service', () => ({ getCompensationSummary: vi.fn() }));
const { prisma } = await import('@/server/db/prisma');
const { getCompensationSummary } = await import('./instructor-compensation.service');
const { listStatsRanking, readStatsRankingPreviewPair } = await import('./stats-rankings.service');

const sqlMock = vi.mocked(prisma.$queryRaw);
const compensationMock = vi.mocked(getCompensationSummary);
const admin: Actor = { userId: 'admin', personId: null, roles: ['ADMIN'] };
const pilot: Actor = { userId: 'pilot', personId: 'p', roles: ['PILOT'] };
const now = new Date('2026-01-31T23:30:00Z'); // February in Rome, January in UTC.
const query = { rank: 'fleet-revenue', period: 'month', page: 2, pageSize: 8 } as const;
const sql = () => sqlMock.mock.calls[0]?.[0] as Prisma.Sql;

beforeEach(() => {
  sqlMock.mockReset();
  compensationMock.mockReset();
});

describe('bounded reporting rankings (17.4)', () => {
  it('sorts revenue separately from hours and uses a stable label/id tiebreak and offset', async () => {
    sqlMock.mockResolvedValue([{ key: 'ac-a', label: 'I-A', minutes: BigInt(350), cents: BigInt(9200), total: BigInt(50) }]);
    const result = await listStatsRanking(admin, query, now);
    expect(result).toEqual({ items: [{ key: 'ac-a', label: 'I-A', minutes: 350, cents: 9200 }], total: 50, pageSize: 8, page: 2, ref: '2026-02', period: 'month' });
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(sql().text).toContain('LEFT JOIN');
    expect(sql().text).toContain('a."archivedAt" IS NULL');
    expect(sql().text).toContain("a.status = 'OPERATIONAL'");
    expect(sql().text).toContain('ORDER BY cents DESC, label COLLATE "C", key');
    expect(sql().values).toEqual(expect.arrayContaining(['2026-02-01', '2026-02-28', 8, BigInt(8)]));
  });

  it('preserves the exact count on an empty page and groups all spending components', async () => {
    sqlMock.mockResolvedValue([{ key: null, total: BigInt(21) }]);
    const data = await listStatsRanking(admin, { ...query, rank: 'pilot-spent', period: 'year', page: 100 }, now);
    expect(data).toMatchObject({ total: 21, page: 100, items: [] });
    expect(sql().text).toContain('COALESCE(f."instructorAmountCents", 0)');
    expect(sql().values).toEqual(expect.arrayContaining(['2026-01-01', '2026-12-31']));
  });

  it('adds currently owed amounts by person, not instructor profile, only for the current window', async () => {
    sqlMock.mockResolvedValue([{ key: 'p-1', label: 'Anna Neri', minutes: BigInt(60), cents: null, total: BigInt(1) }]);
    compensationMock.mockResolvedValue([{ personId: 'p-1', owedMtdCents: 5600, owedYtdCents: 8200 }] as never);
    const current = await listStatsRanking(admin, { ...query, rank: 'instructor-hours', page: 1 }, now);
    const past = await listStatsRanking(admin, { ...query, rank: 'instructor-hours', page: 1, ref: '2025-12' }, now);
    expect(current.items[0]?.cents).toBe(5600);
    expect(past.items[0]?.cents).toBeNull();
    expect(compensationMock).toHaveBeenCalledTimes(1);
    expect(sql().text).toContain("f.\"flightType\" = 'SCHOOL'");
  });

  it('derives the two metric previews from one grouped source without mixing their order', async () => {
    sqlMock.mockResolvedValue([
      { key: 'a', label: 'A', minutes: BigInt(100), cents: BigInt(5), rankHours: BigInt(1), rankCents: BigInt(20), total: BigInt(21) },
      { key: 'b', label: 'B', minutes: BigInt(5), cents: BigInt(300), rankHours: BigInt(20), rankCents: BigInt(1), total: BigInt(21) },
      { key: 'c', label: 'C', minutes: BigInt(50), cents: BigInt(250), rankHours: BigInt(2), rankCents: BigInt(2), total: BigInt(21) },
    ]);
    const pair = await readStatsRankingPreviewPair('pilot', { from: '2026-02-01', to: '2026-02-28' });
    expect(pair.hours.items.map(({ key }) => key)).toEqual(['a', 'c']);
    expect(pair.money.items.map(({ key }) => key)).toEqual(['b', 'c']);
    expect(pair.hours.total).toBe(21);
    expect(pair.money.total).toBe(21);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(sql().text).toContain('ROW_NUMBER() OVER (ORDER BY minutes DESC');
    expect(sql().text).toContain('ROW_NUMBER() OVER (ORDER BY cents DESC');
  });

  it('rejects a non-admin or a future month before making a query', async () => {
    await expect(listStatsRanking(pilot, query, now)).rejects.toThrow(ForbiddenError);
    await expect(listStatsRanking(admin, { ...query, ref: '2026-03' }, now)).rejects.toThrow(ValidationError);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
