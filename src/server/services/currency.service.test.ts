import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

// `app-settings.service.ts` drags `@/server/crypto/secret-box` -> `@/lib/env`
// (eager validation) into the test: mocked at the boundary (CLAUDE.md).
const getCurrencySettingsMock = vi.fn();
vi.mock('./app-settings.service', () => ({ getCurrencySettings: (...args: unknown[]) => getCurrencySettingsMock(...args) }));

const { prisma } = await import('@/server/db/prisma');
const { getCurrencyStatus, listCurrencyByPerson, loadOnBoardFlightDates } = await import('./currency.service');

const queryRawMock = vi.mocked(prisma.$queryRaw);
const personFindManyMock = vi.mocked(prisma.person.findMany);

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function studentActor(): Actor {
  return { userId: 'student_1', personId: 'person_student', roles: ['STUDENT'] };
}

/** The SQL text and the bound values of the n-th `$queryRaw` tagged-template call, reassembled the way Prisma does (nested `Prisma.sql` fragments flattened). */
function rawCall(index = 0): { sql: string; values: unknown[] } {
  const [strings, ...values] = queryRawMock.mock.calls[index] as unknown as [TemplateStringsArray, ...unknown[]];
  const query = Prisma.sql(strings, ...values);
  return { sql: query.sql, values: query.values };
}

describe('currency.service (story 19.7a, R-19-i)', () => {
  beforeEach(() => {
    queryRawMock.mockReset();
    personFindManyMock.mockReset();
    getCurrencySettingsMock.mockReset();
    getCurrencySettingsMock.mockResolvedValue({ minFlights: 1, windowDays: 90 });
  });

  describe('loadOnBoardFlightDates', () => {
    it('never queries for no people', async () => {
      await expect(loadOnBoardFlightDates([], '2026-06-15', { minFlights: 1, windowDays: 90 })).resolves.toEqual(new Map());
      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('a flight flown as INSTRUCTOR counts like one flown as pilot: the query unions both seats, once per flight', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await loadOnBoardFlightDates(['person_1'], '2026-06-15', { minFlights: 2, windowDays: 30 });

      const { sql, values } = rawCall();
      expect(sql).toMatch(/FROM "Flight" f\s+WHERE f\."personId" IN \(\?\)/);
      expect(sql).toMatch(/JOIN "InstructorProfile" ip ON ip\."id" = f\."instructorProfileId"\s+WHERE ip\."personId" IN \(\?\)/);
      // UNION, not UNION ALL: a row is (flight id, person) — the same flight never counts twice for a person.
      expect(sql).toMatch(/\bUNION\s+SELECT/);
      expect(sql).not.toMatch(/UNION ALL/);
      expect(sql).toMatch(/ROW_NUMBER\(\) OVER \(PARTITION BY "personId" ORDER BY "flightDate" DESC, "id" DESC\)/);
      // atDate is bound AS GIVEN, cast to a date in SQL (never a JS Date); the window start is atDate − Y.
      expect(values).toEqual(['person_1', '2026-06-15', 'person_1', '2026-06-15', 2, '2026-05-16']);
      expect(sql.match(/f\."flightDate" <= \?::date/g)).toHaveLength(2);
      expect(sql).toMatch(/"rank" <= \? OR "flightDate" >= \?::date/);
    });

    it('excludeFlightId leaves that flight out of BOTH seats', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await loadOnBoardFlightDates(['person_1'], '2026-06-15', { minFlights: 1, windowDays: 90 }, 'flight_edited');

      const { sql, values } = rawCall();
      expect(sql.match(/AND f\."id" <> \?/g)).toHaveLength(2);
      expect(values.filter((value) => value === 'flight_edited')).toHaveLength(2);
    });

    it('groups the returned dates by person, in the order the query gives them', async () => {
      queryRawMock.mockResolvedValue([
        { personId: 'person_1', flightDate: '2026-06-10' },
        { personId: 'person_1', flightDate: '2026-05-01' },
        { personId: 'person_2', flightDate: '2026-06-01' },
      ] as never);

      const result = await loadOnBoardFlightDates(['person_1', 'person_2', 'person_3'], '2026-06-15', { minFlights: 1, windowDays: 90 });

      expect(result.get('person_1')).toEqual(['2026-06-10', '2026-05-01']);
      expect(result.get('person_2')).toEqual(['2026-06-01']);
      expect(result.has('person_3')).toBe(false);
    });
  });

  describe('getCurrencyStatus', () => {
    it('reads the settings on EVERY call (never cached) and applies them', async () => {
      queryRawMock.mockResolvedValue([{ personId: 'person_1', flightDate: '2026-05-20' }] as never);
      getCurrencySettingsMock.mockResolvedValueOnce({ minFlights: 1, windowDays: 90 }).mockResolvedValueOnce({ minFlights: 1, windowDays: 10 });

      const first = await getCurrencyStatus('person_1', '2026-06-15');
      const second = await getCurrencyStatus('person_1', '2026-06-15');

      expect(getCurrencySettingsMock).toHaveBeenCalledTimes(2);
      expect(first).toEqual({ current: true, expiresAt: '2026-08-18', lastFlightDate: '2026-05-20', flightsInWindow: 1 });
      expect(second).toMatchObject({ current: false, expiresAt: '2026-05-30' });
    });

    it('passes atDate as is and the excluded flight to the query', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await expect(getCurrencyStatus('person_1', '2026-01-01', { excludeFlightId: 'flight_x' })).resolves.toEqual({
        current: false,
        expiresAt: null,
        lastFlightDate: null,
        flightsInWindow: 0,
      });
      const { values } = rawCall();
      expect(values).toContain('2026-01-01');
      expect(values).toContain('flight_x');
    });
  });

  describe('listCurrencyByPerson', () => {
    it('is gated people.read, before any query', async () => {
      await expect(listCurrencyByPerson(studentActor(), ['person_1'], '2026-06-15')).rejects.toThrow(ForbiddenError);
      expect(personFindManyMock).not.toHaveBeenCalled();
      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('keeps only the currency SUBJECTS (not archived, active pilot or student profile)', async () => {
      personFindManyMock.mockResolvedValue([] as never);

      const result = await listCurrencyByPerson(adminActor(), ['person_1', 'person_instructor'], '2026-06-15');

      expect(personFindManyMock).toHaveBeenCalledWith({
        where: {
          id: { in: ['person_1', 'person_instructor'] },
          archivedAt: null,
          OR: [{ pilotProfile: { deactivatedAt: null } }, { studentProfile: { deactivatedAt: null } }],
        },
        select: { id: true },
      });
      expect(result.size).toBe(0);
      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('maps each subject to current / expiresAt / whole days until it; a subject with no flight is "not current, no date"', async () => {
      personFindManyMock.mockResolvedValue([{ id: 'person_a' }, { id: 'person_b' }, { id: 'person_c' }] as never);
      queryRawMock.mockResolvedValue([
        { personId: 'person_a', flightDate: '2026-03-17' },
        { personId: 'person_b', flightDate: '2026-03-16' },
      ] as never);

      const result = await listCurrencyByPerson(adminActor(), ['person_a', 'person_b', 'person_c'], '2026-06-15');

      expect(result.get('person_a')).toEqual({ current: true, expiresAt: '2026-06-15', daysUntil: 0 });
      expect(result.get('person_b')).toEqual({ current: false, expiresAt: '2026-06-14', daysUntil: -1 });
      expect(result.get('person_c')).toEqual({ current: false, expiresAt: null, daysUntil: null });
      // Only the subjects reach the flight query.
      expect(rawCall().values.slice(0, 3)).toEqual(['person_a', 'person_b', 'person_c']);
    });
  });
});
