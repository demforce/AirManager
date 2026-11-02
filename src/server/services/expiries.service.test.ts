import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { parseDateOnlyUtc } from '@/lib/date-only';
import { EXPIRY_WARNING_DAYS } from '@/lib/expiry-status';
import { expiryDashboardItemSchema, listAllExpiriesQuerySchema, registerExpirySchema, updateExpirySchema } from '@/lib/schemas/expiries';
import { APP_TIMEZONE } from '@/lib/time';
import { addDaysDateOnly, todayDateOnlyInZone } from '@/lib/zoned-time';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: {
      findUnique: vi.fn(),
    },
    expiryType: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    expiry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    sentAlert: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

// `app-settings.service.ts` drags `@/server/crypto/secret-box` -> `@/lib/env`
// (eager validation) into the test: mocked at the boundary (CLAUDE.md). The
// registry (story 19.7b) reads the currency settings X/Y from it.
const getCurrencySettingsMock = vi.fn();
vi.mock('./app-settings.service', () => ({ getCurrencySettings: (...args: unknown[]) => getCurrencySettingsMock(...args) }));

const { prisma } = await import('@/server/db/prisma');
const {
  deleteExpiry,
  getExpiryTierCounts,
  getMedicalRequirementFailure,
  listAllExpiries,
  listBlockingExpiriesByPerson,
  listPersonExpiries,
  registerExpiry,
  updateExpiry,
  updateExpiryDateCore,
} = await import('./expiries.service');
const { ConflictError, NotFoundError, ValidationError } = await import('./errors');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const typeFindUniqueMock = vi.mocked(prisma.expiryType.findUnique);
const typeFindManyMock = vi.mocked(prisma.expiryType.findMany);
const expiryFindUniqueMock = vi.mocked(prisma.expiry.findUnique);
const expiryFindManyMock = vi.mocked(prisma.expiry.findMany);
const expiryCreateMock = vi.mocked(prisma.expiry.create);
const expiryUpdateMock = vi.mocked(prisma.expiry.update);
const expiryDeleteMock = vi.mocked(prisma.expiry.delete);
const sentAlertDeleteManyMock = vi.mocked(prisma.sentAlert.deleteMany);
const transactionMock = vi.mocked(prisma.$transaction);
const queryRawMock = vi.mocked(prisma.$queryRaw);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as every other `*.service.test.ts`).
type Fixture = Record<string, unknown> | null;
const personFindUnique = personFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const typeFindUnique = typeFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const expiryFindUnique = expiryFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const expiryFindMany = expiryFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const expiryCreate = expiryCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };
const expiryUpdate = expiryUpdateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const expiryDelete = expiryDeleteMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };
const sentAlertDeleteMany = sentAlertDeleteManyMock as unknown as { mockResolvedValue: (v: { count: number }) => void };

/** Same batch/interactive `$transaction` stand-in as `cash.service.test.ts`/`flights.service.test.ts`. */
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };
function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
}

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(personId: string | null = 'person_1'): Actor {
  return { userId: 'pilot_1', personId, roles: ['PILOT'] };
}

/** A Prisma error shape with a `.code`, same helper style as other `*.service.test.ts` files. */
function prismaError(code: string): unknown {
  return { code };
}

function personFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'person_1',
    archivedAt: null,
    pilotProfile: null,
    studentProfile: null,
    instructorProfile: null,
    ...overrides,
  };
}

function expiryFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'exp_1',
    expiryTypeId: 'type_1',
    expiryType: { name: 'Visita medica classe 2', scope: 'ALL', kind: 'MEDICAL' },
    expiresAt: parseDateOnlyUtc('2026-12-31'),
    notes: null,
    proposals: [],
    ...overrides,
  };
}

/** One row as the registry SQL returns it (story 19.7b): dates already `YYYY-MM-DD` strings (`to_char`), the window `total` on every row. */
function registryRowFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'exp_1',
    source: 'DOCUMENT',
    category: 'MEDICAL',
    personId: 'person_1',
    personFirstName: 'Mario',
    personLastName: 'Rossi',
    expiryTypeId: 'type_1',
    typeName: 'Visita medica classe 2',
    typeScope: 'ALL',
    expiresAt: '2026-12-31',
    notes: null,
    lastFlightDate: null,
    flightsInWindow: null,
    total: 1,
    ...overrides,
  };
}

/** The SQL text and bound values of the n-th `$queryRaw` call, nested `Prisma.sql` fragments flattened the way Prisma does (same helper as `currency.service.test.ts`). */
function rawCall(index = 0): { sql: string; values: unknown[] } {
  const [strings, ...values] = queryRawMock.mock.calls[index] as unknown as [TemplateStringsArray, ...unknown[]];
  const query = Prisma.sql(strings, ...values);
  return { sql: query.sql.trim(), values: query.values };
}

/** The WHERE clause of the registry list query — the text between `JOIN "Person" p …` and `ORDER BY`. */
function whereOf(sql: string): string {
  const afterJoin = sql.split('JOIN "Person" p ON p."id" = r."personId"')[1] ?? '';
  return afterJoin.split('ORDER BY')[0]!.trim();
}

const romeToday = () => todayDateOnlyInZone(APP_TIMEZONE);

describe('expiries.service (story 6.2 — person expiries, computed status, FR-36)', () => {
  beforeEach(() => {
    personFindUniqueMock.mockReset();
    typeFindUniqueMock.mockReset();
    typeFindManyMock.mockReset();
    expiryFindUniqueMock.mockReset();
    expiryFindManyMock.mockReset();
    expiryCreateMock.mockReset();
    expiryUpdateMock.mockReset();
    expiryDeleteMock.mockReset();
    sentAlertDeleteManyMock.mockReset();
    transactionMock.mockReset();
    mockTransaction();
    queryRawMock.mockReset();
    getCurrencySettingsMock.mockReset();
    getCurrencySettingsMock.mockResolvedValue({ minFlights: 1, windowDays: 90 });
  });

  // --- Authorization matrix (AD-5) -------------------------------------

  describe('authorization matrix', () => {
    it('registerExpiry rejects a pilot (needs expiries.manage) without querying anything', async () => {
      await expect(
        registerExpiry(pilotActor(), { personId: 'person_1', expiryTypeId: 'type_1', expiresAt: '2026-12-31' }),
      ).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('listPersonExpiries: a pilot reading their OWN person id succeeds without a person lookup (own access by definition)', async () => {
      expiryFindMany.mockResolvedValue([]);

      await expect(listPersonExpiries(pilotActor('person_1'), 'person_1')).resolves.toEqual([]);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it("listPersonExpiries: a pilot reading ANOTHER person's expiries is Forbidden", async () => {
      await expect(listPersonExpiries(pilotActor('person_1'), 'person_OTHER')).rejects.toThrow(ForbiddenError);
      expect(expiryFindManyMock).not.toHaveBeenCalled();
    });

    it('listPersonExpiries: staff (expiries.manage) may read any person, 404 pre-checked', async () => {
      personFindUnique.mockResolvedValue(null);

      await expect(listPersonExpiries(adminActor(), 'person_1')).rejects.toThrow(NotFoundError);
    });

    it('listAllExpiries rejects a pilot (needs expiries.manage) without querying anything', async () => {
      await expect(listAllExpiries(pilotActor(), { page: 1, pageSize: 20 })).rejects.toThrow(ForbiddenError);
      expect(queryRawMock).not.toHaveBeenCalled();
      expect(getCurrencySettingsMock).not.toHaveBeenCalled();
    });

    it('listAllExpiries allows staff', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await expect(listAllExpiries(adminActor(), { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0 });
    });
  });

  // --- listPersonExpiries: computed status + pending proposal ----------

  describe('listPersonExpiries', () => {
    it('maps computed status and the pending-proposal summary onto each row', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      expiryFindMany.mockResolvedValue([
        expiryFixture({ id: 'exp_ok', expiresAt: parseDateOnlyUtc('2099-01-01') }),
        expiryFixture({ id: 'exp_expired', expiresAt: parseDateOnlyUtc('2020-01-01') }),
        expiryFixture({
          id: 'exp_pending',
          proposals: [
            {
              id: 'prop_1',
              proposedIssuedAt: parseDateOnlyUtc('2026-02-01'),
              proposedExpiresAt: parseDateOnlyUtc('2027-02-01'),
              proposedNotes: 'nuova nota',
              createdAt: new Date('2026-07-08T08:00:00.000Z'),
            },
          ],
        }),
      ]);

      const result = await listPersonExpiries(adminActor(), 'person_1');
      expect(result.find((r) => r.id === 'exp_ok')?.status).toBe('ok');
      expect(result.find((r) => r.id === 'exp_expired')?.status).toBe('expired');
      expect(result.find((r) => r.id === 'exp_pending')?.pendingProposal).toMatchObject({
        id: 'prop_1',
        proposedIssuedAt: '2026-02-01',
        proposedExpiresAt: '2027-02-01',
        proposedNotes: 'nuova nota',
      });
    });
  });

  // --- listAllExpiries: the UNIFIED registry (story 6.4 AC 1; story 19.7b) ---

  describe('listAllExpiries — the unified registry SQL (story 19.7b, AD-1)', () => {
    it('ONE query: documents ∪ dated currency rows, the window total on every row', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await listAllExpiries(adminActor(), { page: 1, pageSize: 20 });

      expect(queryRawMock).toHaveBeenCalledTimes(1);
      const { sql } = rawCall();
      // Documents: the type's kind is the category — of people NOT archived (review 19.7b F1).
      const documents = sql.slice(sql.indexOf(`'DOCUMENT' AS "source"`), sql.indexOf("'currency:'"));
      expect(documents).toMatch(/FROM "Expiry" e JOIN "ExpiryType" t ON t\."id" = e\."expiryTypeId" JOIN "Person" pd ON pd\."id" = e\."personId"\s+WHERE pd\."archivedAt" IS NULL\s+UNION ALL/);
      // Currency subjects (19.7a D-8): not archived, ACTIVE pilot or student profile — no instructor.
      const subjects = sql.slice(sql.indexOf('"currencySubjects" AS ('), sql.indexOf('"onBoard" AS ('));
      expect(subjects).toMatch(/p\."archivedAt" IS NULL/);
      expect(subjects).toMatch(/"PilotProfile" pp WHERE pp\."personId" = p\."id" AND pp\."deactivatedAt" IS NULL/);
      expect(subjects).toMatch(/"StudentProfile" sp WHERE sp\."personId" = p\."id" AND sp\."deactivatedAt" IS NULL/);
      expect(subjects).not.toMatch(/InstructorProfile/);
      expect(sql).toMatch(/'currency:' \|\| s\."id", 'DERIVED', 'CURRENCY'/);
      expect(sql).toMatch(/\(COUNT\(\*\) OVER \(\)\)::int AS "total"/);
    });

    it('nothing is derived for what is MISSING (PO 2026-11-02): no fee never paid, no visit never registered, no currency without a date', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await listAllExpiries(adminActor(), { page: 1, pageSize: 20 });

      const { sql } = rawCall();
      expect(sql).not.toMatch(/'membership:'|'medical:'|"members"/);
      // Exactly two branches: the documents and the currency.
      const rows = sql.slice(sql.indexOf('"registryRows" AS ('), sql.indexOf('SELECT r."id"'));
      expect(rows.match(/\bUNION ALL\b/g)).toHaveLength(1);
      // The currency row only for a subject with at least X flights: an INNER join, and a date.
      expect(rows).toMatch(/FROM "currencySubjects" s JOIN "currency" c ON c\."personId" = s\."id"\s+WHERE c\."xthFlightDate" IS NOT NULL/);
      expect(rows).not.toMatch(/LEFT JOIN|COALESCE/);
    });

    it('currency = the SQL twin of computeCurrency (D-15): both seats, a supervised solo skipped, flights up to today, X-th date + Y', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T10:00:00.000Z'));
      try {
        getCurrencySettingsMock.mockResolvedValue({ minFlights: 3, windowDays: 45 });
        queryRawMock.mockResolvedValue([] as never);

        await listAllExpiries(adminActor(), { page: 1, pageSize: 20 });

        const { sql, values } = rawCall();
        const onBoard = sql.slice(sql.indexOf('"onBoard" AS ('), sql.indexOf('"currency" AS ('));
        const [personSeat, instructorSeat] = onBoard.split(/\bUNION ALL\b/) as [string, string];
        expect(personSeat).toMatch(/SELECT f\."personId", f\."flightDate" FROM "Flight" f WHERE f\."flightDate" <= \?::date/);
        expect(personSeat).not.toMatch(/isSolo/);
        // Review 19.7a F2: the instructor of a SOLO is not on board. `<>` makes UNION ALL count what the TS UNION counts.
        expect(instructorSeat).toMatch(/JOIN "InstructorProfile" ip ON ip\."id" = f\."instructorProfileId"/);
        expect(instructorSeat).toMatch(/WHERE f\."isSolo" = false AND ip\."personId" <> f\."personId" AND f\."flightDate" <= \?::date/);
        const currency = sql.slice(sql.indexOf('"currency" AS ('), sql.indexOf('"registryRows" AS ('));
        expect(currency).toMatch(/ORDER BY d DESC OFFSET \?::int - 1 LIMIT 1\) AS "xthFlightDate"/);
        expect(currency).toMatch(/COUNT\(\*\) FILTER \(WHERE ob\."flightDate" >= \?::date - \?::int\)/);
        expect(sql).toMatch(/c\."xthFlightDate" \+ \?::int, NULL, c\."lastFlightDate", c\."flightsInWindow"/);
        // today twice (seats), X, today and Y (window), Y (expiry): X and Y from the settings, today as a string.
        expect(values.slice(0, 6)).toEqual(['2026-06-15', '2026-06-15', 3, '2026-06-15', 45, 45]);
        expect(getCurrencySettingsMock).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('ONE "today" for every row, Rome\'s (D-21): at 00:30 in Rome (23:30Z the day before) today is already Rome\'s day', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-14T23:30:00.000Z'));
      try {
        queryRawMock.mockResolvedValue([registryRowFixture({ expiresAt: '2026-03-15' })] as never);

        const result = await listAllExpiries(adminActor(), { page: 1, pageSize: 20 });

        const { values } = rawCall();
        expect(values).toContain('2026-03-15');
        expect(values).not.toContain('2026-03-14');
        expect(result.items[0]).toMatchObject({ daysUntil: 0, status: 'expiring' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('orders by expiresAt, id (most overdue first, stable pagination)', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await listAllExpiries(adminActor(), { page: 1, pageSize: 20 });

      const { sql, values } = rawCall();
      expect(sql).toMatch(/ORDER BY r\."expiresAt", r\."id"\s+LIMIT \? OFFSET \?$/);
      expect(values.slice(-2)).toEqual([20, 0]);
    });

    it('paginates with LIMIT/OFFSET from page/pageSize, the total from the SAME query', async () => {
      queryRawMock.mockResolvedValue([registryRowFixture({ total: 57 })] as never);

      const result = await listAllExpiries(adminActor(), { page: 3, pageSize: 20 });

      expect(rawCall().values.slice(-2)).toEqual([20, 40]);
      expect(result).toMatchObject({ total: 57, page: 3, pageSize: 20 });
      expect(queryRawMock).toHaveBeenCalledTimes(1);
    });

    it('a page past the end has no row to carry the total: ONE count with the SAME filters', async () => {
      queryRawMock.mockResolvedValueOnce([] as never).mockResolvedValueOnce([{ total: 41 }] as never);

      const result = await listAllExpiries(adminActor(), { category: 'CURRENCY', page: 9, pageSize: 20 });

      expect(queryRawMock).toHaveBeenCalledTimes(2);
      const count = rawCall(1);
      expect(count.sql).toMatch(/SELECT \(COUNT\(\*\)\)::int AS "total" FROM "registryRows" r JOIN "Person" p ON p\."id" = r\."personId"\s+WHERE r\."category" = \?$/);
      expect(count.values.at(-1)).toBe('CURRENCY');
      expect(result).toMatchObject({ items: [], total: 41, page: 9 });
    });

    it('an empty FIRST page is simply total 0 — no second query', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await expect(listAllExpiries(adminActor(), { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0, items: [] });
      expect(queryRawMock).toHaveBeenCalledTimes(1);
    });

    it('no filter -> no WHERE', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await listAllExpiries(adminActor(), { page: 1, pageSize: 20 });

      expect(whereOf(rawCall().sql)).toBe('');
    });

    it.each(['MEDICAL', 'RATING', 'MEMBERSHIP', 'CURRENCY'] as const)('category=%s -> r."category" = ? (bound, never interpolated)', async (category) => {
      queryRawMock.mockResolvedValue([] as never);

      await listAllExpiries(adminActor(), { category, page: 1, pageSize: 20 });

      const { sql, values } = rawCall();
      expect(whereOf(sql)).toBe('WHERE r."category" = ?');
      expect(values).toContain(category);
    });

    it('expiryTypeId, scope and personId are exact matches on the row; rows without a type never match the first two', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await listAllExpiries(adminActor(), { expiryTypeId: 'type_1', personId: 'person_1', scope: 'PILOTS', page: 1, pageSize: 20 });

      const { sql, values } = rawCall();
      expect(whereOf(sql)).toBe('WHERE r."expiryTypeId" = ? AND r."personId" = ? AND r."typeScope" = ?');
      expect(values).toEqual(expect.arrayContaining(['type_1', 'person_1', 'PILOTS']));
    });

    it('personQuery: case-insensitive substring of first or last name, with %, _ and \\ escaped (parity with Prisma contains)', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await listAllExpiries(adminActor(), { personQuery: '50%_x\\', page: 1, pageSize: 20 });

      const { sql, values } = rawCall();
      expect(whereOf(sql)).toBe(`WHERE (p."firstName" ILIKE ? ESCAPE '\\' OR p."lastName" ILIKE ? ESCAPE '\\')`);
      expect(values.filter((value) => value === '%50\\%\\_x\\\\%')).toHaveLength(2);
    });

    it('window=expired -> expiresAt < today', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await listAllExpiries(adminActor(), { window: 'expired', page: 1, pageSize: 20 });

      const { sql, values } = rawCall();
      expect(whereOf(sql)).toBe('WHERE r."expiresAt" < ?::date');
      expect(values.at(-3)).toBe(romeToday());
    });

    it.each([
      ['7', 7],
      ['30', 30],
      ['60', 60],
    ] as const)('window=%s -> expiresAt <= today + %d, NO lower bound', async (window, days) => {
      queryRawMock.mockResolvedValue([] as never);

      await listAllExpiries(adminActor(), { window, page: 1, pageSize: 20 });

      const { sql, values } = rawCall();
      expect(whereOf(sql)).toBe('WHERE r."expiresAt" <= ?::date + ?::int');
      expect(values.slice(-4, -2)).toEqual([romeToday(), days]);
    });

    it.each([
      ['expired', 'WHERE r."expiresAt" < ?::date', []],
      ['expiring', 'WHERE r."expiresAt" >= ?::date AND r."expiresAt" <= ?::date + ?::int', [EXPIRY_WARNING_DAYS]],
      ['ok', 'WHERE r."expiresAt" > ?::date + ?::int', [EXPIRY_WARNING_DAYS]],
    ] as const)('status=%s -> the same boundary as the per-row status', async (status, where, extra) => {
      queryRawMock.mockResolvedValue([] as never);

      await listAllExpiries(adminActor(), { status, page: 1, pageSize: 20 });

      const { sql, values } = rawCall();
      expect(whereOf(sql)).toBe(where);
      for (const value of extra) expect(values).toContain(value);
    });

    it('window wins over status (one or the other, never both), and every filter is AND-combined', async () => {
      queryRawMock.mockResolvedValue([] as never);

      await listAllExpiries(adminActor(), { category: 'RATING', personQuery: 'Ros', window: '7', status: 'ok', page: 1, pageSize: 20 });

      expect(whereOf(rawCall().sql)).toBe(
        `WHERE r."category" = ? AND (p."firstName" ILIKE ? ESCAPE '\\' OR p."lastName" ILIKE ? ESCAPE '\\') AND r."expiresAt" <= ?::date + ?::int`,
      );
    });
  });

  describe('listAllExpiries — row -> DTO (story 19.7b, AD-2)', () => {
    async function mapOne(row: Record<string, unknown>) {
      queryRawMock.mockResolvedValue([row] as never);
      const result = await listAllExpiries(adminActor(), { page: 1, pageSize: 20 });
      // Every mapped item satisfies the wire schema the OpenAPI document publishes.
      expect(expiryDashboardItemSchema.safeParse(result.items[0]).success).toBe(true);
      return result.items[0]!;
    }

    it('a document: source DOCUMENT, its type, status/daysUntil from today, no currency', async () => {
      const item = await mapOne(registryRowFixture({ expiresAt: addDaysDateOnly(romeToday(), -5), notes: 'nota' }));

      expect(item).toEqual({
        id: 'exp_1',
        source: 'DOCUMENT',
        category: 'MEDICAL',
        personId: 'person_1',
        personFirstName: 'Mario',
        personLastName: 'Rossi',
        expiryTypeId: 'type_1',
        typeName: 'Visita medica classe 2',
        typeScope: 'ALL',
        expiresAt: addDaysDateOnly(romeToday(), -5),
        notes: 'nota',
        status: 'expired',
        daysUntil: -5,
        currency: null,
      });
    });

    it('a currency row: no type, its facts and the settings it was computed with', async () => {
      getCurrencySettingsMock.mockResolvedValue({ minFlights: 2, windowDays: 60 });
      const item = await mapOne(
        registryRowFixture({
          id: 'currency:person_1',
          source: 'DERIVED',
          category: 'CURRENCY',
          expiryTypeId: null,
          typeName: null,
          typeScope: null,
          expiresAt: addDaysDateOnly(romeToday(), 12),
          lastFlightDate: addDaysDateOnly(romeToday(), -3),
          flightsInWindow: 4,
        }),
      );

      expect(item).toMatchObject({
        id: 'currency:person_1',
        source: 'DERIVED',
        category: 'CURRENCY',
        expiryTypeId: null,
        typeName: null,
        typeScope: null,
        status: 'expiring',
        daysUntil: 12,
        currency: { lastFlightDate: addDaysDateOnly(romeToday(), -3), flightsInWindow: 4, minFlights: 2, windowDays: 60 },
      });
    });

    it('the wire schema has no row without a date (PO 2026-11-02): expiresAt, daysUntil and the currency\'s lastFlightDate are required, `missing` is no status', () => {
      const valid = { ...registryRowFixture(), status: 'ok', daysUntil: 3, currency: null } as Record<string, unknown>;
      delete valid['lastFlightDate'];
      delete valid['flightsInWindow'];
      delete valid['total'];
      expect(expiryDashboardItemSchema.safeParse(valid).success).toBe(true);
      expect(expiryDashboardItemSchema.safeParse({ ...valid, expiresAt: null }).success).toBe(false);
      expect(expiryDashboardItemSchema.safeParse({ ...valid, daysUntil: null }).success).toBe(false);
      expect(expiryDashboardItemSchema.safeParse({ ...valid, status: 'missing' }).success).toBe(false);
      const currency = { lastFlightDate: '2026-01-01', flightsInWindow: 1, minFlights: 1, windowDays: 90 };
      expect(expiryDashboardItemSchema.safeParse({ ...valid, currency }).success).toBe(true);
      expect(expiryDashboardItemSchema.safeParse({ ...valid, currency: { ...currency, lastFlightDate: null } }).success).toBe(false);
      expect(listAllExpiriesQuerySchema.safeParse({ status: 'missing' }).success).toBe(false);
    });

    // The per-row status and the status filter MUST agree at the EXPIRY_WARNING_DAYS edge.
    it('a row at exactly today + EXPIRY_WARNING_DAYS is `expiring`, one day later `ok`', async () => {
      queryRawMock.mockResolvedValue([
        registryRowFixture({ id: 'at', expiresAt: addDaysDateOnly(romeToday(), EXPIRY_WARNING_DAYS), total: 2 }),
        registryRowFixture({ id: 'beyond', expiresAt: addDaysDateOnly(romeToday(), EXPIRY_WARNING_DAYS + 1), total: 2 }),
      ] as never);

      const result = await listAllExpiries(adminActor(), { page: 1, pageSize: 20 });

      expect(result.items.map((item) => item.status)).toEqual(['expiring', 'ok']);
    });
  });

  // --- getExpiryTierCounts: the registry's 4 stat cards (story 12.11, AC 3; 19.7b) ---

  describe('getExpiryTierCounts', () => {
    it('is gated expiries.manage', async () => {
      await expect(getExpiryTierCounts(pilotActor())).rejects.toThrow(ForbiddenError);
      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('ONE query over the whole unified registry, EXCLUSIVE bands', async () => {
      queryRawMock.mockResolvedValue([{ expired: 2, within7: 3, within30: 5, within60: 7 }] as never);

      const result = await getExpiryTierCounts(adminActor());

      expect(result).toEqual({ expired: 2, within7: 3, within30: 5, within60: 7 });
      expect(queryRawMock).toHaveBeenCalledTimes(1);
      const { sql } = rawCall();
      expect(sql).toMatch(/COUNT\(\*\) FILTER \(WHERE r\."expiresAt" < \?::date\)\)::int AS "expired"/);
      expect(sql).not.toMatch(/IS NULL OR/);
      expect(sql).toMatch(/COUNT\(\*\) FILTER \(WHERE r\."expiresAt" >= \?::date AND r\."expiresAt" <= \?::date \+ 7\)\)::int AS "within7"/);
      expect(sql).toMatch(/COUNT\(\*\) FILTER \(WHERE r\."expiresAt" > \?::date \+ 7 AND r\."expiresAt" <= \?::date \+ 30\)\)::int AS "within30"/);
      expect(sql).toMatch(/COUNT\(\*\) FILTER \(WHERE r\."expiresAt" > \?::date \+ 30 AND r\."expiresAt" <= \?::date \+ 60\)\)::int AS "within60"/);
      // Unfiltered: the stat cards count the full set, whatever the table shows.
      expect(sql).toMatch(/FROM "registryRows" r$/);
      expect(sql).toMatch(/'currency:'/);
      // The same rows as the list: archived people's documents are out of the counts too (review 19.7b F1).
      expect(sql).toMatch(/WHERE pd\."archivedAt" IS NULL/);
      expect(getCurrencySettingsMock).toHaveBeenCalledTimes(1);
    });
  });

  // --- registerExpiry: verification order + guards ----------------------

  describe('registerExpiry — verification order (404 -> 409 -> 422, no state leak)', () => {
    const input = { personId: 'person_1', expiryTypeId: 'type_1', expiresAt: '2026-12-31' };

    it('person not found -> NotFoundError, before the type is even looked up', async () => {
      personFindUnique.mockResolvedValue(null);

      await expect(registerExpiry(adminActor(), input)).rejects.toThrow(NotFoundError);
      expect(typeFindUniqueMock).not.toHaveBeenCalled();
    });

    it('archived person -> ConflictError, before the type is looked up', async () => {
      personFindUnique.mockResolvedValue(personFixture({ archivedAt: new Date('2026-01-01T00:00:00.000Z') }));

      await expect(registerExpiry(adminActor(), input)).rejects.toThrow(ConflictError);
      expect(typeFindUniqueMock).not.toHaveBeenCalled();
    });

    it('expiry type not found -> NotFoundError', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue(null);

      await expect(registerExpiry(adminActor(), input)).rejects.toThrow(NotFoundError);
    });

    it('deactivated expiry type -> ConflictError, before the scope check', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope: 'ALL', isActive: false });

      await expect(registerExpiry(adminActor(), input)).rejects.toThrow(ConflictError);
    });

    it('duplicate (person, type) -> ConflictError, pre-check', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope: 'ALL', isActive: true });
      expiryFindUnique.mockResolvedValue({ id: 'exp_existing' });

      await expect(registerExpiry(adminActor(), input)).rejects.toThrow(ConflictError);
      expect(expiryCreateMock).not.toHaveBeenCalled();
    });

    it('duplicate (person, type) race -> P2002 backstop maps to ConflictError', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope: 'ALL', isActive: true });
      expiryFindUnique.mockResolvedValue(null);
      expiryCreate.mockRejectedValue(prismaError('P2002'));

      await expect(registerExpiry(adminActor(), input)).rejects.toThrow(ConflictError);
    });

    it('succeeds and stamps actorUserId when everything checks out', async () => {
      personFindUnique.mockResolvedValue(personFixture({ pilotProfile: { deactivatedAt: null } }));
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope: 'PILOTS', isActive: true });
      expiryFindUnique.mockResolvedValue(null);
      expiryCreate.mockResolvedValue(expiryFixture());

      await registerExpiry(adminActor(), input);

      expect(expiryCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: 'person_1',
            expiryTypeId: 'type_1',
            expiresAt: parseDateOnlyUtc('2026-12-31'),
            notes: null,
            actorUserId: 'admin_1',
          }),
        }),
      );
    });
  });

  describe('registerExpiry — SCOPE_MISMATCH (422, stable code)', () => {
    const baseInput = { personId: 'person_1', expiryTypeId: 'type_1', expiresAt: '2026-12-31' };

    it.each(['PILOTS', 'STUDENTS', 'INSTRUCTORS'] as const)('scope %s with no matching profile -> 422 SCOPE_MISMATCH', async (scope) => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope, isActive: true });

      const error = await registerExpiry(adminActor(), baseInput).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as InstanceType<typeof ValidationError>).code).toBe('SCOPE_MISMATCH');
    });

    it.each([
      ['PILOTS', 'pilotProfile'],
      ['STUDENTS', 'studentProfile'],
      ['INSTRUCTORS', 'instructorProfile'],
    ] as const)('scope %s with a DEACTIVATED matching profile -> 422 SCOPE_MISMATCH', async (scope, profileKey) => {
      personFindUnique.mockResolvedValue(personFixture({ [profileKey]: { deactivatedAt: new Date('2026-01-01T00:00:00.000Z') } }));
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope, isActive: true });

      await expect(registerExpiry(adminActor(), baseInput)).rejects.toThrow(ValidationError);
    });

    it.each([
      ['PILOTS', 'pilotProfile'],
      ['STUDENTS', 'studentProfile'],
      ['INSTRUCTORS', 'instructorProfile'],
    ] as const)('scope %s with an ACTIVE matching profile -> compatible, proceeds to the duplicate check', async (scope, profileKey) => {
      personFindUnique.mockResolvedValue(personFixture({ [profileKey]: { deactivatedAt: null } }));
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope, isActive: true });
      expiryFindUnique.mockResolvedValue(null);
      expiryCreate.mockResolvedValue(expiryFixture());

      await expect(registerExpiry(adminActor(), baseInput)).resolves.toBeDefined();
    });

    it('scope ALL is always compatible, even with no profiles at all', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope: 'ALL', isActive: true });
      expiryFindUnique.mockResolvedValue(null);
      expiryCreate.mockResolvedValue(expiryFixture());

      await expect(registerExpiry(adminActor(), baseInput)).resolves.toBeDefined();
    });
  });

  // --- updateExpiry: merge-validation ------------------------------------

  describe('updateExpiry', () => {
    it('404 on an unknown id', async () => {
      expiryFindUnique.mockResolvedValue(null);

      await expect(updateExpiry(adminActor(), 'missing', { notes: 'x' })).rejects.toThrow(NotFoundError);
    });

    it('patches notes to null explicitly (distinct from leaving it untouched)', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', expiresAt: parseDateOnlyUtc('2026-12-31') });
      expiryUpdate.mockResolvedValue(expiryFixture({ notes: null }));

      await updateExpiry(adminActor(), 'exp_1', { notes: null });

      expect(expiryUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ notes: null, actorUserId: 'admin_1' }) }),
      );
    });

    // --- SentAlert wipe-on-renewal (story 6.3, AD-9) -----------------------

    it('expiresAt CHANGES value -> wipes SentAlert in the same transaction (renewal re-earns its alert cycle)', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', expiresAt: parseDateOnlyUtc('2026-12-31') });
      sentAlertDeleteMany.mockResolvedValue({ count: 2 });
      expiryUpdate.mockResolvedValue(expiryFixture({ expiresAt: parseDateOnlyUtc('2027-06-30') }));

      await updateExpiry(adminActor(), 'exp_1', { expiresAt: '2027-06-30' });

      expect(transactionMock).toHaveBeenCalled();
      expect(sentAlertDeleteManyMock).toHaveBeenCalledWith({ where: { expiryId: 'exp_1' } });
    });

    it('expiresAt stays the SAME value (re-submitted, or only notes patched) -> does NOT touch SentAlert', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', expiresAt: parseDateOnlyUtc('2026-12-31') });
      expiryUpdate.mockResolvedValue(expiryFixture());

      await updateExpiry(adminActor(), 'exp_1', { expiresAt: '2026-12-31', notes: 'stessa data' });

      expect(sentAlertDeleteManyMock).not.toHaveBeenCalled();
    });

    it('only notes patched (expiresAt absent from the input) -> does NOT touch SentAlert', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', expiresAt: parseDateOnlyUtc('2026-12-31') });
      expiryUpdate.mockResolvedValue(expiryFixture());

      await updateExpiry(adminActor(), 'exp_1', { notes: 'solo note' });

      expect(sentAlertDeleteManyMock).not.toHaveBeenCalled();
    });
  });

  // --- updateExpiryDateCore (story 19.4, AD-4: the AD-9 rule in one place) ---

  describe('updateExpiryDateCore', () => {
    it('writes the date on the given tx and wipes SentAlert only when the date changes', async () => {
      const tx = { sentAlert: { deleteMany: vi.fn(async () => ({ count: 1 })) }, expiry: { update: vi.fn(async () => ({})) } };

      await updateExpiryDateCore(tx as never, 'exp_1', parseDateOnlyUtc('2027-06-30'), parseDateOnlyUtc('2026-12-31'), 'admin_1');
      expect(tx.sentAlert.deleteMany).toHaveBeenCalledWith({ where: { expiryId: 'exp_1' } });
      expect(tx.expiry.update).toHaveBeenCalledWith({ where: { id: 'exp_1' }, data: { expiresAt: parseDateOnlyUtc('2027-06-30'), actorUserId: 'admin_1' } });

      tx.sentAlert.deleteMany.mockClear();
      await updateExpiryDateCore(tx as never, 'exp_1', parseDateOnlyUtc('2027-06-30'), parseDateOnlyUtc('2027-06-30'), 'admin_1');
      expect(tx.sentAlert.deleteMany).not.toHaveBeenCalled();
      expect(sentAlertDeleteManyMock).not.toHaveBeenCalled();
    });
  });

  // --- deleteExpiry -------------------------------------------------------

  describe('deleteExpiry', () => {
    it('404 on an unknown id', async () => {
      expiryFindUnique.mockResolvedValue(null);

      await expect(deleteExpiry(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
      expect(expiryDeleteMock).not.toHaveBeenCalled();
    });

    it('deletes an existing expiry', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1' });
      expiryDelete.mockResolvedValue({ id: 'exp_1' });

      await expect(deleteExpiry(adminActor(), 'exp_1')).resolves.toBeUndefined();
      expect(expiryDeleteMock).toHaveBeenCalledWith({ where: { id: 'exp_1' } });
    });

    it('maps a concurrent double-DELETE race (P2025 — the loser of the race) to NotFoundError, not a raw 500 (TD-1, AC 1)', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1' });
      expiryDelete.mockRejectedValue(prismaError('P2025'));

      await expect(deleteExpiry(adminActor(), 'exp_1')).rejects.toThrow(NotFoundError);
    });
  });

  // --- Schema validation (422s at the Zod boundary, before the service) ---

  describe('schema validation', () => {
    it('registerExpirySchema rejects a malformed expiresAt date (story 13.1 review R6: the format check on expiresAt itself is NOT removed, only the cross-field issuedAt one)', () => {
      expect(registerExpirySchema.safeParse({ personId: 'p', expiryTypeId: 't', expiresAt: '31-12-2026' }).success).toBe(false);
    });

    it('registerExpirySchema rejects a missing expiresAt', () => {
      expect(registerExpirySchema.safeParse({ personId: 'p', expiryTypeId: 't' }).success).toBe(false);
    });

    it('registerExpirySchema accepts an expiresAt in the past (R6: an already-expired scadenza is legal to register, no more issuedAt to compare against)', () => {
      expect(registerExpirySchema.safeParse({ personId: 'p', expiryTypeId: 't', expiresAt: '2020-01-01' }).success).toBe(true);
    });

    it('registerExpirySchema rejects notes over 500 chars', () => {
      expect(
        registerExpirySchema.safeParse({
          personId: 'p',
          expiryTypeId: 't',
          expiresAt: '2026-12-31',
          notes: 'x'.repeat(501),
        }).success,
      ).toBe(false);
    });

    it('updateExpirySchema rejects an empty body', () => {
      expect(updateExpirySchema.safeParse({}).success).toBe(false);
    });

    it('updateExpirySchema accepts a single-field patch (no cross-field check possible here — the service merges)', () => {
      expect(updateExpirySchema.safeParse({ expiresAt: '2026-01-01' }).success).toBe(true);
    });

    it('listAllExpiriesQuerySchema rejects a status outside the enum', () => {
      expect(listAllExpiriesQuerySchema.safeParse({ status: 'overdue' }).success).toBe(false);
    });

    it('listAllExpiriesQuerySchema rejects a scope outside the enum', () => {
      expect(listAllExpiriesQuerySchema.safeParse({ scope: 'EVERYONE' }).success).toBe(false);
    });

    it('listAllExpiriesQuerySchema rejects a pageSize beyond the max (100)', () => {
      expect(listAllExpiriesQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    });

    it('listAllExpiriesQuerySchema accepts an empty query (every filter optional, defaults applied)', () => {
      const result = listAllExpiriesQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject({ page: 1, pageSize: 20 });
      }
    });
  });
  // Story 19.7a (AC 16, D-12): every reader gets the type's `kind`, never a name heuristic.
  describe('kind on the rows (story 19.7a)', () => {
    it('listPersonExpiries carries typeKind', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      expiryFindMany.mockResolvedValue([expiryFixture(), expiryFixture({ id: 'exp_quota', expiryType: { name: 'Quota associativa', scope: 'ALL', kind: 'MEMBERSHIP' } })]);

      const result = await listPersonExpiries(adminActor(), 'person_1');

      expect(result.map((row) => row.typeKind)).toEqual(['MEDICAL', 'MEMBERSHIP']);
    });

    it('listAllExpiries carries category = the type kind (the SQL reads it from ExpiryType.kind, never the name)', async () => {
      queryRawMock.mockResolvedValue([
        registryRowFixture({ total: 3 }),
        registryRowFixture({ id: 'exp_r', category: 'RATING', typeName: 'Rating SEP', typeScope: 'PILOTS', total: 3 }),
        registryRowFixture({ id: 'exp_q', category: 'MEMBERSHIP', typeName: 'Quota associativa', total: 3 }),
      ] as never);

      const result = await listAllExpiries(adminActor(), { page: 1, pageSize: 20 });

      expect(result.items.map((item) => item.category)).toEqual(['MEDICAL', 'RATING', 'MEMBERSHIP']);
      expect(rawCall().sql).toMatch(/'DOCUMENT' AS "source", t\."kind"::text AS "category"/);
    });
  });

  // Story 19.7a (R-19-j, D-4): the service half of the medical requirement.
  describe('getMedicalRequirementFailure (story 19.7a)', () => {
    const ACTIVE = [{ name: 'Visita medica LAPL' }, { name: 'Visita medica classe 1' }];

    it('no active MEDICAL type -> null, without even reading the person\'s visits', async () => {
      typeFindManyMock.mockResolvedValue([] as never);

      await expect(getMedicalRequirementFailure('person_1', '2026-06-15')).resolves.toBeNull();
      expect(typeFindManyMock).toHaveBeenCalledWith({ where: { kind: 'MEDICAL', isActive: true }, select: { name: true } });
      expect(expiryFindManyMock).not.toHaveBeenCalled();
    });

    it('reads only the MEDICAL rows of THIS person and returns the most recently expired one', async () => {
      typeFindManyMock.mockResolvedValue(ACTIVE as never);
      expiryFindManyMock.mockResolvedValue([
        { expiresAt: parseDateOnlyUtc('2026-01-10'), expiryType: { name: 'Visita medica classe 1' } },
        { expiresAt: parseDateOnlyUtc('2026-06-14'), expiryType: { name: 'Visita medica LAPL' } },
      ] as never);

      await expect(getMedicalRequirementFailure('person_1', '2026-06-15')).resolves.toEqual({ typeName: 'Visita medica LAPL', expiresAt: '2026-06-14' });
      expect(expiryFindManyMock).toHaveBeenCalledWith({
        where: { personId: 'person_1', expiryType: { kind: 'MEDICAL' } },
        select: { expiresAt: true, expiryType: { select: { name: true } } },
      });
    });

    it('a visit expiring ON the date covers the person -> null', async () => {
      typeFindManyMock.mockResolvedValue(ACTIVE as never);
      expiryFindManyMock.mockResolvedValue([{ expiresAt: parseDateOnlyUtc('2026-06-15'), expiryType: { name: 'Visita medica classe 1' } }] as never);

      await expect(getMedicalRequirementFailure('person_1', '2026-06-15')).resolves.toBeNull();
    });

    it('no visit at all -> ONE missing document named after the active types', async () => {
      typeFindManyMock.mockResolvedValue(ACTIVE as never);
      expiryFindManyMock.mockResolvedValue([] as never);

      await expect(getMedicalRequirementFailure('person_1', '2026-06-15')).resolves.toEqual({ typeName: 'Visita medica classe 1 / Visita medica LAPL', expiresAt: null });
    });
  });

  describe('listBlockingExpiriesByPerson (story 15.5 — the pilot row flag)', () => {
    it('rejects an actor without people.read', async () => {
      await expect(listBlockingExpiriesByPerson(pilotActor(), ['person_1'], parseDateOnlyUtc('2026-08-03'))).rejects.toThrow(ForbiddenError);
      expect(expiryFindManyMock).not.toHaveBeenCalled();
    });

    it('never queries for an empty page of people', async () => {
      const result = await listBlockingExpiriesByPerson(adminActor(), [], parseDateOnlyUtc('2026-08-03'));

      expect(result.size).toBe(0);
      expect(expiryFindManyMock).not.toHaveBeenCalled();
    });

    /** Story 19.7a: two reads — blocking RATINGs inside the horizon, and EVERY medical visit of the page. Honours an `expiresAt.lte` filter like SQL would, so a horizon applied to the visits shows in the result. */
    function mockBadgeRows(rows: { ratings: Array<Record<string, unknown> & { expiresAt: Date }>; medicals: Array<Record<string, unknown> & { expiresAt: Date }> }): void {
      expiryFindManyMock.mockImplementation((async (args: { where: { expiresAt?: { lte: Date }; expiryType: { kind: string } } }) => {
        const selected = args.where.expiryType.kind === 'MEDICAL' ? rows.medicals : rows.ratings;
        const horizon = args.where.expiresAt?.lte;
        return horizon === undefined ? selected : selected.filter((row) => row.expiresAt.getTime() <= horizon.getTime());
      }) as never);
    }
    const medical = (personId: string, expiresAt: string, name: string) => ({ personId, expiresAt: parseDateOnlyUtc(expiresAt), expiryType: { name } });

    it('asks for blocking RATINGs at most 30 days out and for EVERY medical visit, batched over the page ids', async () => {
      expiryFindManyMock.mockResolvedValue([] as never);
      const today = parseDateOnlyUtc('2026-08-03');

      await listBlockingExpiriesByPerson(adminActor(), ['person_1', 'person_2'], today);

      expect(expiryFindManyMock).toHaveBeenCalledWith({
        where: {
          personId: { in: ['person_1', 'person_2'] },
          expiresAt: { lte: parseDateOnlyUtc('2026-09-02') },
          expiryType: { kind: 'RATING', blocksBooking: true },
        },
        select: { personId: true, expiresAt: true, expiryType: { select: { name: true } } },
      });
      // No horizon on the visits: the best one is chosen FIRST (D-13, trap §5.4).
      expect(expiryFindManyMock).toHaveBeenCalledWith({
        where: { personId: { in: ['person_1', 'person_2'] }, expiryType: { kind: 'MEDICAL' } },
        select: { personId: true, expiresAt: true, expiryType: { select: { name: true } } },
      });
    });

    it('groups by person and reduces each document to whole days from today (negative = already expired)', async () => {
      mockBadgeRows({
        ratings: [
          { personId: 'person_1', expiresAt: parseDateOnlyUtc('2026-08-15'), expiryType: { name: 'Rating bloccante' } },
          { personId: 'person_2', expiresAt: parseDateOnlyUtc('2026-08-03'), expiryType: { name: 'Rating bloccante' } },
        ],
        medicals: [medical('person_1', '2026-07-24', 'Visita medica classe 2')],
      });

      const result = await listBlockingExpiriesByPerson(adminActor(), ['person_1', 'person_2', 'person_3'], parseDateOnlyUtc('2026-08-03'));

      expect(result.get('person_1')).toEqual([
        { typeName: 'Rating bloccante', daysUntil: 12 },
        { typeName: 'Visita medica classe 2', daysUntil: -10 },
      ]);
      expect(result.get('person_2')).toEqual([{ typeName: 'Rating bloccante', daysUntil: 0 }]);
      // A person with nothing blocking is simply absent (callers read `?? []`).
      expect(result.has('person_3')).toBe(false);
    });

    // Story 19.7a (AC 9, D-13): one valid visit of any class covers the person.
    it('class 2 expired + class 1 at +200 days -> no entry at all (the best visit is valid and far)', async () => {
      mockBadgeRows({ ratings: [], medicals: [medical('person_1', '2026-07-22', 'Visita medica classe 2'), medical('person_1', '2027-02-19', 'Visita medica classe 1')] });

      const result = await listBlockingExpiriesByPerson(adminActor(), ['person_1'], parseDateOnlyUtc('2026-08-03'));

      expect(result.has('person_1')).toBe(false);
    });

    it('only class 2, expired 12 days ago -> an entry for it', async () => {
      mockBadgeRows({ ratings: [], medicals: [medical('person_1', '2026-07-22', 'Visita medica classe 2')] });

      const result = await listBlockingExpiriesByPerson(adminActor(), ['person_1'], parseDateOnlyUtc('2026-08-03'));

      expect(result.get('person_1')).toEqual([{ typeName: 'Visita medica classe 2', daysUntil: -12 }]);
    });

    it('class 1 at +20 and class 2 at −5 -> ONE entry, class 1 at +20 (the best visit, inside the horizon)', async () => {
      mockBadgeRows({ ratings: [], medicals: [medical('person_1', '2026-07-29', 'Visita medica classe 2'), medical('person_1', '2026-08-23', 'Visita medica classe 1')] });

      const result = await listBlockingExpiriesByPerson(adminActor(), ['person_1'], parseDateOnlyUtc('2026-08-03'));

      expect(result.get('person_1')).toEqual([{ typeName: 'Visita medica classe 1', daysUntil: 20 }]);
    });

    it('two visits expiring the SAME day -> the smaller type name, whatever order the rows come in (review 19.7a F5)', async () => {
      const class1 = medical('person_1', '2026-08-20', 'Visita medica classe 1');
      const class2 = medical('person_1', '2026-08-20', 'Visita medica classe 2');
      for (const medicals of [
        [class1, class2],
        [class2, class1],
      ]) {
        mockBadgeRows({ ratings: [], medicals });

        const result = await listBlockingExpiriesByPerson(adminActor(), ['person_1'], parseDateOnlyUtc('2026-08-03'));

        expect(result.get('person_1')).toEqual([{ typeName: 'Visita medica classe 1', daysUntil: 17 }]);
      }
    });

    it('the reduction is per person: one person\'s valid visit never covers another', async () => {
      mockBadgeRows({ ratings: [], medicals: [medical('person_1', '2027-01-01', 'Visita medica classe 1'), medical('person_2', '2026-07-30', 'Visita medica LAPL')] });

      const result = await listBlockingExpiriesByPerson(adminActor(), ['person_1', 'person_2'], parseDateOnlyUtc('2026-08-03'));

      expect(result.has('person_1')).toBe(false);
      expect(result.get('person_2')).toEqual([{ typeName: 'Visita medica LAPL', daysUntil: -4 }]);
    });
  });
});
