import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requirementFailureSchema } from '@/lib/schemas/requirements';

// Story 19.9 (AC 2-6) — the ONE requirements evaluation. Every reader it calls
// is mocked at the module boundary: their own rules are proved by
// `currency.test.ts`, `medical-requirement.test.ts`, `membership.service.test.ts`;
// here only WHAT is asked, of WHOM, for WHICH day, and where the answers land.
// The currency/membership/expiries/settings modules drag `@/lib/env` and the
// mail adapter in (CLAUDE.md's eager-env rule), hence mocked whole.
vi.mock('@/server/db/prisma', () => ({
  prisma: {
    expiry: { findMany: vi.fn() },
    expiryType: { findMany: vi.fn() },
    accountMovement: { aggregate: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const getCurrencyStatusMock = vi.fn();
vi.mock('./currency.service', () => ({ getCurrencyStatus: (...args: unknown[]) => getCurrencyStatusMock(...args) }));
const getCurrencySettingsMock = vi.fn();
vi.mock('./app-settings.service', () => ({ getCurrencySettings: (...args: unknown[]) => getCurrencySettingsMock(...args) }));
const getMedicalRequirementFailureMock = vi.fn();
vi.mock('./expiries.service', () => ({ getMedicalRequirementFailure: (...args: unknown[]) => getMedicalRequirementFailureMock(...args) }));
const getMembershipStatusMock = vi.fn();
vi.mock('./membership.service', () => ({ getMembershipStatus: (...args: unknown[]) => getMembershipStatusMock(...args) }));
const authorizeMock = vi.fn();
vi.mock('@/server/auth/rbac', () => ({ authorize: (...args: unknown[]) => authorizeMock(...args) }));

const { prisma } = await import('@/server/db/prisma');
const { evaluateRequirements, throwRequirementsNotMet } = await import('./requirements.service');

type Row = Record<string, unknown>;
type RowsMock = { mockResolvedValueOnce: (v: Row[]) => RowsMock; mockResolvedValue: (v: Row[]) => RowsMock; mock: { calls: unknown[][] } };
const expiryFindMany = vi.mocked(prisma.expiry.findMany) as unknown as RowsMock;
const expiryTypeFindMany = vi.mocked(prisma.expiryType.findMany) as unknown as RowsMock;
const aggregate = vi.mocked(prisma.accountMovement.aggregate) as unknown as { mockResolvedValue: (v: { _sum: { amountCents: number | null } }) => unknown; mock: { calls: unknown[][] } };

const PERSON = { id: 'person_1', name: 'Mario Rossi', hasActivePilot: true, hasActiveStudent: false, hasActiveInstructor: false };
const INSTRUCTOR = { personId: 'person_instr', name: 'Anna Bianchi' };
const DAY = '2026-10-01';

/** Everything off: the baseline each test switches blocks on from. */
function input(overrides: Partial<Parameters<typeof evaluateRequirements>[0]> = {}): Parameters<typeof evaluateRequirements>[0] {
  return {
    expiryDateOnly: DAY,
    membershipDateOnly: DAY,
    person: PERSON,
    instructor: null,
    documents: false,
    currency: null,
    balance: null,
    ...overrides,
  };
}

function rating(name: string, expiresAt: string): Row {
  return { expiresAt: new Date(`${expiresAt}T00:00:00.000Z`), expiryType: { name } };
}

describe('evaluateRequirements (story 19.9)', () => {
  beforeEach(() => {
    vi.mocked(prisma.expiry.findMany).mockReset();
    vi.mocked(prisma.expiryType.findMany).mockReset();
    vi.mocked(prisma.accountMovement.aggregate).mockReset();
    vi.mocked(prisma.$transaction).mockReset();
    getCurrencyStatusMock.mockReset();
    getCurrencySettingsMock.mockReset();
    getMedicalRequirementFailureMock.mockReset();
    getMembershipStatusMock.mockReset();
    authorizeMock.mockReset();

    expiryFindMany.mockResolvedValue([]);
    expiryTypeFindMany.mockResolvedValue([]);
    getMedicalRequirementFailureMock.mockResolvedValue(null);
    getMembershipStatusMock.mockResolvedValue({ status: 'valid', expiresAt: '2027-01-01' });
    getCurrencyStatusMock.mockResolvedValue({ current: true, expiresAt: '2026-12-01', lastFlightDate: '2026-09-02', flightsInWindow: 1 });
    getCurrencySettingsMock.mockResolvedValue({ minFlights: 1, windowDays: 90 });
    aggregate.mockResolvedValue({ _sum: { amountCents: 50_000 } });
  });

  describe('contract and order (AC 2)', () => {
    it('with every check failing for the person AND the instructor, lists them in the contract order — each a valid RequirementFailure', async () => {
      // Person: two expired ratings given in reverse name order, one missing, the medical; instructor: one expired.
      expiryFindMany.mockResolvedValueOnce([rating('Rating Z', '2026-09-01'), rating('Rating A', '2026-08-01')]).mockResolvedValueOnce([rating('SEP istruttore', '2026-01-01')]);
      expiryTypeFindMany.mockResolvedValueOnce([{ name: 'Rating M' }]).mockResolvedValueOnce([]);
      getMedicalRequirementFailureMock.mockResolvedValueOnce({ typeName: 'Visita medica classe 2', expiresAt: '2026-05-01' }).mockResolvedValueOnce(null);
      getMembershipStatusMock.mockResolvedValueOnce({ status: 'missing', expiresAt: null }).mockResolvedValueOnce({ status: 'expired', expiresAt: '2026-03-01' });
      getCurrencyStatusMock.mockResolvedValue({ current: false, expiresAt: '2026-09-29', lastFlightDate: '2026-07-01', flightsInWindow: 0 });
      aggregate.mockResolvedValue({ _sum: { amountCents: 1000 } });

      const failures = await evaluateRequirements(
        input({ instructor: INSTRUCTOR, documents: true, currency: { dateOnly: DAY, excludeFlightId: null }, balance: { costCents: 5000, creditCents: 0 } }),
      );

      expect(failures).toEqual([
        { type: 'EXPIRY', role: 'person', personName: 'Mario Rossi', typeName: 'Rating A', expiresAt: '2026-08-01' },
        { type: 'EXPIRY', role: 'person', personName: 'Mario Rossi', typeName: 'Rating Z', expiresAt: '2026-09-01' },
        { type: 'EXPIRY', role: 'person', personName: 'Mario Rossi', typeName: 'Rating M', expiresAt: null },
        { type: 'EXPIRY', role: 'person', personName: 'Mario Rossi', typeName: 'Visita medica classe 2', expiresAt: '2026-05-01' },
        { type: 'EXPIRY', role: 'instructor', personName: 'Anna Bianchi', typeName: 'SEP istruttore', expiresAt: '2026-01-01' },
        { type: 'MEMBERSHIP', role: 'person', personName: 'Mario Rossi', expiresAt: null },
        { type: 'MEMBERSHIP', role: 'instructor', personName: 'Anna Bianchi', expiresAt: '2026-03-01' },
        {
          type: 'CURRENCY',
          role: 'person',
          personName: 'Mario Rossi',
          lastFlightDate: '2026-07-01',
          daysSinceLastFlight: 92,
          flightsInWindow: 0,
          minFlights: 1,
          windowDays: 90,
        },
        { type: 'BALANCE', role: 'person', personName: 'Mario Rossi', balanceCents: 1000, costCents: 5000 },
      ]);
      for (const failure of failures) expect(requirementFailureSchema.safeParse(failure).success).toBe(true);
    });

    it('with documents: false, currency: null and balance: null nothing is read at all and the list is empty', async () => {
      await expect(evaluateRequirements(input({ instructor: INSTRUCTOR }))).resolves.toEqual([]);

      expect(prisma.expiry.findMany).not.toHaveBeenCalled();
      expect(prisma.expiryType.findMany).not.toHaveBeenCalled();
      expect(getMedicalRequirementFailureMock).not.toHaveBeenCalled();
      expect(getMembershipStatusMock).not.toHaveBeenCalled();
      expect(getCurrencyStatusMock).not.toHaveBeenCalled();
      expect(getCurrencySettingsMock).not.toHaveBeenCalled();
      expect(prisma.accountMovement.aggregate).not.toHaveBeenCalled();
    });

    it('each check reads ITS reference day: EXPIRY and the medical the expiry day, MEMBERSHIP the membership day, CURRENCY the currency day (Q-19.10-a)', async () => {
      // Distinct days, each on the boundary of the expired scan so the string compare also reads the right one.
      expiryFindMany.mockResolvedValue([rating('Rating A', '2026-01-09')]);

      const failures = await evaluateRequirements({
        expiryDateOnly: '2026-01-10',
        membershipDateOnly: '2026-02-20',
        person: PERSON,
        instructor: INSTRUCTOR,
        documents: true,
        currency: { dateOnly: '2026-03-30', excludeFlightId: null },
        balance: null,
      });

      expect(getMedicalRequirementFailureMock.mock.calls).toEqual([
        ['person_1', '2026-01-10'],
        ['person_instr', '2026-01-10'],
      ]);
      expect(getMembershipStatusMock.mock.calls).toEqual([
        ['person_1', '2026-02-20'],
        ['person_instr', '2026-02-20'],
      ]);
      expect(getCurrencyStatusMock.mock.calls).toEqual([['person_1', '2026-03-30', { excludeFlightId: undefined }]]);
      expect(failures.filter((failure) => failure.type === 'EXPIRY')).toHaveLength(2);
    });

    it('is read-only and actor-free: no transaction, no authorize', async () => {
      await evaluateRequirements(input({ instructor: INSTRUCTOR, documents: true, currency: { dateOnly: DAY, excludeFlightId: null }, balance: { costCents: 1, creditCents: 0 } }));

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(authorizeMock).not.toHaveBeenCalled();
    });
  });

  describe('EXPIRY (AC 3, D-4)', () => {
    it('(a) a blocking active rating expired the day before the reference day is a failure with its date', async () => {
      expiryFindMany.mockResolvedValue([rating('Rating bloccante', '2026-09-30')]);

      await expect(evaluateRequirements(input({ documents: true }))).resolves.toEqual([
        { type: 'EXPIRY', role: 'person', personName: 'Mario Rossi', typeName: 'Rating bloccante', expiresAt: '2026-09-30' },
      ]);
    });

    it('(b)(f) the expired scan filters in SQL on RATING + blocksBooking + ACTIVE type — a deactivated type (16.4) or a MEMBERSHIP row never reaches it — and has NO scope filter (e)', async () => {
      await evaluateRequirements(input({ documents: true }));

      const where = (expiryFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
      expect(where).toEqual({ personId: 'person_1', expiryType: { kind: 'RATING', blocksBooking: true, isActive: true } });
    });

    it('(c) a document expiring ON the reference day is still valid', async () => {
      expiryFindMany.mockResolvedValue([rating('Rating bloccante', DAY)]);

      await expect(evaluateRequirements(input({ documents: true }))).resolves.toEqual([]);
    });

    it('(d) an applicable blocking active rating never registered is a failure with expiresAt: null — the SQL filters out deactivated, other-scope and registered types', async () => {
      expiryTypeFindMany.mockResolvedValue([{ name: 'Rating mancante' }]);

      await expect(evaluateRequirements(input({ documents: true }))).resolves.toEqual([
        { type: 'EXPIRY', role: 'person', personName: 'Mario Rossi', typeName: 'Rating mancante', expiresAt: null },
      ]);
      expect((expiryTypeFindMany.mock.calls[0]?.[0] as { where: unknown }).where).toEqual({
        kind: 'RATING',
        blocksBooking: true,
        isActive: true,
        scope: { in: ['ALL', 'PILOTS'] },
        expiries: { none: { personId: 'person_1' } },
      });
    });

    it('the missing scan of the person follows hasActive*: a student-only and a person flying as instructor (story 19.10) get their own scopes', async () => {
      await evaluateRequirements(input({ documents: true, person: { ...PERSON, hasActivePilot: false, hasActiveStudent: true } }));
      await evaluateRequirements(input({ documents: true, person: { ...PERSON, hasActivePilot: false, hasActiveInstructor: true } }));

      const scopes = expiryTypeFindMany.mock.calls.map((call) => ((call[0] as { where: { scope: { in: string[] } } }).where.scope.in));
      expect(scopes).toEqual([
        ['ALL', 'STUDENTS'],
        ['ALL', 'INSTRUCTORS'],
      ]);
    });

    it('(g) the medical document enters ONCE per person, asked with (personId, expiryDateOnly), last of that person', async () => {
      expiryFindMany.mockResolvedValue([rating('Rating A', '2026-01-01')]);
      getMedicalRequirementFailureMock.mockResolvedValue({ typeName: 'Visita medica classe 1 / Visita medica classe 2', expiresAt: null });

      const failures = await evaluateRequirements(input({ documents: true }));

      expect(getMedicalRequirementFailureMock.mock.calls).toEqual([['person_1', DAY]]);
      expect(failures.map((failure) => (failure.type === 'EXPIRY' ? failure.typeName : failure.type))).toEqual([
        'Rating A',
        'Visita medica classe 1 / Visita medica classe 2',
      ]);
    });

    it('(h) the instructor is scanned with ALL + INSTRUCTORS and tagged as instructor', async () => {
      expiryTypeFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ name: 'Rating istruttore' }]);

      const failures = await evaluateRequirements(input({ documents: true, instructor: INSTRUCTOR }));

      expect(((expiryTypeFindMany.mock.calls[1]?.[0] as { where: { scope: unknown; expiries: unknown } }).where)).toMatchObject({
        scope: { in: ['ALL', 'INSTRUCTORS'] },
        expiries: { none: { personId: 'person_instr' } },
      });
      expect(failures).toEqual([{ type: 'EXPIRY', role: 'instructor', personName: 'Anna Bianchi', typeName: 'Rating istruttore', expiresAt: null }]);
    });

    it('(i) inside one person: expired by name, then missing by name, then the medical', async () => {
      expiryFindMany.mockResolvedValue([rating('Volo notturno', '2026-01-01'), rating('Acrobazia', '2026-02-01')]);
      expiryTypeFindMany.mockResolvedValue([{ name: 'Traino' }, { name: 'Idro' }]);
      getMedicalRequirementFailureMock.mockResolvedValue({ typeName: 'Visita medica LAPL', expiresAt: '2025-12-31' });

      const failures = await evaluateRequirements(input({ documents: true }));

      expect(failures.map((failure) => (failure.type === 'EXPIRY' ? failure.typeName : ''))).toEqual(['Acrobazia', 'Volo notturno', 'Idro', 'Traino', 'Visita medica LAPL']);
    });
  });

  describe('MEMBERSHIP (AC 4, D-7, Q-19.9-a)', () => {
    it('asks the person AND the instructor on the membership day; valid is no failure', async () => {
      await expect(evaluateRequirements(input({ documents: true, instructor: INSTRUCTOR }))).resolves.toEqual([]);

      expect(getMembershipStatusMock.mock.calls).toEqual([
        ['person_1', DAY],
        ['person_instr', DAY],
      ]);
    });

    it('expired carries its date, missing carries null, each with its role and name', async () => {
      getMembershipStatusMock.mockResolvedValueOnce({ status: 'expired', expiresAt: '2026-09-30' }).mockResolvedValueOnce({ status: 'missing', expiresAt: null });

      await expect(evaluateRequirements(input({ documents: true, instructor: INSTRUCTOR }))).resolves.toEqual([
        { type: 'MEMBERSHIP', role: 'person', personName: 'Mario Rossi', expiresAt: '2026-09-30' },
        { type: 'MEMBERSHIP', role: 'instructor', personName: 'Anna Bianchi', expiresAt: null },
      ]);
    });
  });

  describe('CURRENCY (AC 5, D-5)', () => {
    it('is asked with the person, the currency day and the excluded flight as given; current is no failure and reads no settings', async () => {
      await expect(evaluateRequirements(input({ currency: { dateOnly: DAY, excludeFlightId: 'flight_9' } }))).resolves.toEqual([]);

      expect(getCurrencyStatusMock.mock.calls).toEqual([['person_1', DAY, { excludeFlightId: 'flight_9' }]]);
      expect(getCurrencySettingsMock).not.toHaveBeenCalled();
    });

    it('not current: the last flight, the whole days since it (2026-07-01 -> 2026-10-01 = 92), the count in the window and the X/Y it was judged with', async () => {
      getCurrencyStatusMock.mockResolvedValue({ current: false, expiresAt: '2026-08-31', lastFlightDate: '2026-07-01', flightsInWindow: 1 });
      getCurrencySettingsMock.mockResolvedValue({ minFlights: 2, windowDays: 60 });

      await expect(evaluateRequirements(input({ currency: { dateOnly: DAY, excludeFlightId: null } }))).resolves.toEqual([
        { type: 'CURRENCY', role: 'person', personName: 'Mario Rossi', lastFlightDate: '2026-07-01', daysSinceLastFlight: 92, flightsInWindow: 1, minFlights: 2, windowDays: 60 },
      ]);
    });

    it('never flown on board: lastFlightDate and daysSinceLastFlight are null', async () => {
      getCurrencyStatusMock.mockResolvedValue({ current: false, expiresAt: null, lastFlightDate: null, flightsInWindow: 0 });

      await expect(evaluateRequirements(input({ currency: { dateOnly: DAY, excludeFlightId: null } }))).resolves.toEqual([
        { type: 'CURRENCY', role: 'person', personName: 'Mario Rossi', lastFlightDate: null, daysSinceLastFlight: null, flightsInWindow: 0, minFlights: 1, windowDays: 90 },
      ]);
    });
  });

  describe('BALANCE (AC 6, D-6)', () => {
    it('SUM of the person account + credit below the cost is a failure quoting both (balance includes the credit)', async () => {
      aggregate.mockResolvedValue({ _sum: { amountCents: -2000 } });

      await expect(evaluateRequirements(input({ balance: { costCents: 10_000, creditCents: 10_000 } }))).resolves.toEqual([
        { type: 'BALANCE', role: 'person', personName: 'Mario Rossi', balanceCents: 8000, costCents: 10_000 },
      ]);
      expect((aggregate.mock.calls[0]?.[0] as { where: unknown }).where).toEqual({ account: { personId: 'person_1' } });
    });

    it('equal is covered', async () => {
      aggregate.mockResolvedValue({ _sum: { amountCents: 6000 } });

      await expect(evaluateRequirements(input({ balance: { costCents: 10_000, creditCents: 4000 } }))).resolves.toEqual([]);
    });

    it('a person without an account (null sum) has balance 0', async () => {
      aggregate.mockResolvedValue({ _sum: { amountCents: null } });

      await expect(evaluateRequirements(input({ balance: { costCents: 1, creditCents: 0 } }))).resolves.toEqual([
        { type: 'BALANCE', role: 'person', personName: 'Mario Rossi', balanceCents: 0, costCents: 1 },
      ]);
    });
  });

  describe('throwRequirementsNotMet', () => {
    it('throws the 422 of the shared contract: REQUIREMENTS_NOT_MET with details.failures', () => {
      const failures = [{ type: 'BALANCE' as const, role: 'person' as const, personName: 'Mario Rossi', balanceCents: 0, costCents: 1 }];

      expect(() => throwRequirementsNotMet(failures)).toThrow(expect.objectContaining({ code: 'REQUIREMENTS_NOT_MET', details: { failures } }));
    });
  });
});
