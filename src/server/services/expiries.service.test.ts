import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDateOnlyUtc, todayDateOnlyUtc } from '@/lib/date-only';
import { EXPIRY_WARNING_DAYS } from '@/lib/expiry-status';
import {
  decideProposalSchema,
  listAllExpiriesQuerySchema,
  proposeExpirySchema,
  registerExpirySchema,
  updateExpirySchema,
} from '@/lib/schemas/expiries';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: {
      findUnique: vi.fn(),
    },
    expiryType: {
      findUnique: vi.fn(),
    },
    expiry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    expiryUpdateProposal: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    sentAlert: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import('@/server/db/prisma');
const {
  decideExpiryProposal,
  deleteExpiry,
  listAllExpiries,
  listExpiryProposals,
  listPersonExpiries,
  proposeExpiryUpdate,
  registerExpiry,
  updateExpiry,
} = await import('./expiries.service');
const { ConflictError, NotFoundError, ValidationError } = await import('./errors');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const typeFindUniqueMock = vi.mocked(prisma.expiryType.findUnique);
const expiryFindUniqueMock = vi.mocked(prisma.expiry.findUnique);
const expiryFindManyMock = vi.mocked(prisma.expiry.findMany);
const expiryCountMock = vi.mocked(prisma.expiry.count);
const expiryCreateMock = vi.mocked(prisma.expiry.create);
const expiryUpdateMock = vi.mocked(prisma.expiry.update);
const expiryDeleteMock = vi.mocked(prisma.expiry.delete);
const proposalFindFirstMock = vi.mocked(prisma.expiryUpdateProposal.findFirst);
const proposalFindUniqueMock = vi.mocked(prisma.expiryUpdateProposal.findUnique);
const proposalFindUniqueOrThrowMock = vi.mocked(prisma.expiryUpdateProposal.findUniqueOrThrow);
const proposalFindManyMock = vi.mocked(prisma.expiryUpdateProposal.findMany);
const proposalCountMock = vi.mocked(prisma.expiryUpdateProposal.count);
const proposalCreateMock = vi.mocked(prisma.expiryUpdateProposal.create);
const proposalUpdateManyMock = vi.mocked(prisma.expiryUpdateProposal.updateMany);
const sentAlertDeleteManyMock = vi.mocked(prisma.sentAlert.deleteMany);
const transactionMock = vi.mocked(prisma.$transaction);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as every other `*.service.test.ts`).
type Fixture = Record<string, unknown> | null;
const personFindUnique = personFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const typeFindUnique = typeFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const expiryFindUnique = expiryFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const expiryFindMany = expiryFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const expiryCount = expiryCountMock as unknown as { mockResolvedValue: (v: number) => void };
const expiryCreate = expiryCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };
const expiryUpdate = expiryUpdateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const expiryDelete = expiryDeleteMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };
const proposalFindFirst = proposalFindFirstMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const proposalFindUnique = proposalFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const proposalFindUniqueOrThrow = proposalFindUniqueOrThrowMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const proposalFindMany = proposalFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const proposalCount = proposalCountMock as unknown as { mockResolvedValue: (v: number) => void };
const proposalCreate = proposalCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };
const proposalUpdateMany = proposalUpdateManyMock as unknown as { mockResolvedValue: (v: { count: number }) => void };
const sentAlertDeleteMany = sentAlertDeleteManyMock as unknown as { mockResolvedValue: (v: { count: number }) => void };

/** Same batch/interactive `$transaction` stand-in as `cash.service.test.ts`/`flights.service.test.ts`. */
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };
function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
}

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
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
    expiryType: { name: 'Visita medica classe 2', scope: 'PILOTS' },
    issuedAt: parseDateOnlyUtc('2026-01-01'),
    expiresAt: parseDateOnlyUtc('2026-12-31'),
    notes: null,
    proposals: [],
    ...overrides,
  };
}

function dashboardExpiryFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'exp_1',
    personId: 'person_1',
    person: { firstName: 'Mario', lastName: 'Rossi' },
    expiryTypeId: 'type_1',
    expiryType: { name: 'Visita medica classe 2', scope: 'PILOTS' },
    issuedAt: parseDateOnlyUtc('2026-01-01'),
    expiresAt: parseDateOnlyUtc('2026-12-31'),
    notes: null,
    ...overrides,
  };
}

function proposalCreateFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'prop_1',
    proposedIssuedAt: parseDateOnlyUtc('2026-02-01'),
    proposedExpiresAt: parseDateOnlyUtc('2027-02-01'),
    proposedNotes: null,
    createdAt: new Date('2026-07-08T08:00:00.000Z'),
    ...overrides,
  };
}

function proposalListFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'prop_1',
    expiryId: 'exp_1',
    proposedIssuedAt: parseDateOnlyUtc('2026-02-01'),
    proposedExpiresAt: parseDateOnlyUtc('2027-02-01'),
    proposedNotes: null,
    status: 'PENDING',
    decidedAt: null,
    createdAt: new Date('2026-07-08T08:00:00.000Z'),
    expiry: {
      personId: 'person_1',
      person: { firstName: 'Mario', lastName: 'Rossi' },
      expiryTypeId: 'type_1',
      expiryType: { name: 'Visita medica classe 2' },
      issuedAt: parseDateOnlyUtc('2026-01-01'),
      expiresAt: parseDateOnlyUtc('2026-12-31'),
      notes: null,
    },
    proposedByUser: { email: 'pilot@airmanager.local' },
    decidedByUser: null,
    ...overrides,
  };
}

describe('expiries.service (story 6.2 — person expiries, computed status, proposal queue, FR-36)', () => {
  beforeEach(() => {
    personFindUniqueMock.mockReset();
    typeFindUniqueMock.mockReset();
    expiryFindUniqueMock.mockReset();
    expiryFindManyMock.mockReset();
    expiryCountMock.mockReset();
    expiryCreateMock.mockReset();
    expiryUpdateMock.mockReset();
    expiryDeleteMock.mockReset();
    proposalFindFirstMock.mockReset();
    proposalFindUniqueMock.mockReset();
    proposalFindUniqueOrThrowMock.mockReset();
    proposalFindManyMock.mockReset();
    proposalCountMock.mockReset();
    proposalCreateMock.mockReset();
    proposalUpdateManyMock.mockReset();
    sentAlertDeleteManyMock.mockReset();
    transactionMock.mockReset();
    mockTransaction();
  });

  // --- Authorization matrix (AD-5) -------------------------------------

  describe('authorization matrix', () => {
    it('registerExpiry rejects a pilot (needs expiries.manage) without querying anything', async () => {
      await expect(
        registerExpiry(pilotActor(), { personId: 'person_1', expiryTypeId: 'type_1', issuedAt: '2026-01-01', expiresAt: '2026-12-31' }),
      ).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('proposeExpiryUpdate rejects staff (staff deliberately lacks expiries.propose.own — it edits directly)', async () => {
      await expect(
        proposeExpiryUpdate(staffActor(), 'exp_1', { issuedAt: '2026-01-01', expiresAt: '2026-12-31' }),
      ).rejects.toThrow(ForbiddenError);
      expect(expiryFindUniqueMock).not.toHaveBeenCalled();
    });

    it('proposeExpiryUpdate allows a pilot proposing on their OWN expiry', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', personId: 'person_1' });
      proposalFindFirst.mockResolvedValue(null);
      proposalCreate.mockResolvedValue(proposalCreateFixture());

      await expect(
        proposeExpiryUpdate(pilotActor('person_1'), 'exp_1', { issuedAt: '2026-01-01', expiresAt: '2026-12-31' }),
      ).resolves.toMatchObject({ id: 'prop_1' });
    });

    it('proposeExpiryUpdate rejects a pilot proposing on ANOTHER person\'s expiry (403, not a 404 — same "own" rule as bookings/flights)', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', personId: 'person_OTHER' });

      await expect(
        proposeExpiryUpdate(pilotActor('person_1'), 'exp_1', { issuedAt: '2026-01-01', expiresAt: '2026-12-31' }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('proposeExpiryUpdate rejects an actor with no linked personId', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', personId: 'person_1' });

      await expect(
        proposeExpiryUpdate(pilotActor(null), 'exp_1', { issuedAt: '2026-01-01', expiresAt: '2026-12-31' }),
      ).rejects.toThrow(ForbiddenError);
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

      await expect(listPersonExpiries(staffActor(), 'person_1')).rejects.toThrow(NotFoundError);
    });

    it('decideExpiryProposal rejects a pilot', async () => {
      await expect(decideExpiryProposal(pilotActor(), 'prop_1', 'APPROVE')).rejects.toThrow(ForbiddenError);
      expect(proposalFindUniqueMock).not.toHaveBeenCalled();
    });

    it('listExpiryProposals rejects a pilot', async () => {
      await expect(listExpiryProposals(pilotActor(), { page: 1, pageSize: 20, status: 'PENDING' })).rejects.toThrow(ForbiddenError);
    });

    it('listAllExpiries rejects a pilot (needs expiries.manage) without querying anything', async () => {
      await expect(listAllExpiries(pilotActor(), { page: 1, pageSize: 20 })).rejects.toThrow(ForbiddenError);
      expect(expiryFindManyMock).not.toHaveBeenCalled();
    });

    it('listAllExpiries allows staff', async () => {
      expiryFindMany.mockResolvedValue([]);
      expiryCount.mockResolvedValue(0);

      await expect(listAllExpiries(staffActor(), { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0 });
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

      const result = await listPersonExpiries(staffActor(), 'person_1');
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

  // --- listAllExpiries: the urgency dashboard (story 6.4, AC 1) ---------

  describe('listAllExpiries', () => {
    it('maps rows into ExpiryDashboardItem shape (personFirstName/personLastName/typeName/typeScope denormalized, status computed)', async () => {
      expiryFindMany.mockResolvedValue([dashboardExpiryFixture({ expiresAt: parseDateOnlyUtc('2020-01-01') })]);
      expiryCount.mockResolvedValue(1);

      const result = await listAllExpiries(staffActor(), { page: 1, pageSize: 20 });

      expect(result.items[0]).toMatchObject({
        id: 'exp_1',
        personId: 'person_1',
        personFirstName: 'Mario',
        personLastName: 'Rossi',
        expiryTypeId: 'type_1',
        typeName: 'Visita medica classe 2',
        typeScope: 'PILOTS',
        issuedAt: '2026-01-01',
        expiresAt: '2020-01-01',
        status: 'expired',
      });
    });

    it('orders by expiresAt asc, id asc (urgency first, stable tie-break)', async () => {
      expiryFindMany.mockResolvedValue([]);
      expiryCount.mockResolvedValue(0);

      await listAllExpiries(staffActor(), { page: 1, pageSize: 20 });

      expect(expiryFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }] }),
      );
    });

    it('paginates via skip/take derived from page/pageSize, and total reflects the SAME filtered where', async () => {
      expiryFindMany.mockResolvedValue([]);
      expiryCount.mockResolvedValue(57);

      const result = await listAllExpiries(staffActor(), { page: 3, pageSize: 20 });

      expect(expiryFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20 }));
      expect(result).toMatchObject({ total: 57, page: 3, pageSize: 20 });
    });

    it('expiryTypeId filter: an id that does not exist yields an empty page, not an error (a filter, never a lookup)', async () => {
      expiryFindMany.mockResolvedValue([]);
      expiryCount.mockResolvedValue(0);

      const result = await listAllExpiries(staffActor(), { expiryTypeId: 'type_missing', page: 1, pageSize: 20 });

      expect(expiryFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { expiryTypeId: 'type_missing' } }));
      expect(result).toMatchObject({ total: 0, items: [] });
    });

    it('scope filter maps to the TYPE relation, not a field on Expiry itself', async () => {
      expiryFindMany.mockResolvedValue([]);
      expiryCount.mockResolvedValue(0);

      await listAllExpiries(staffActor(), { scope: 'INSTRUCTORS', page: 1, pageSize: 20 });

      expect(expiryFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { expiryType: { scope: 'INSTRUCTORS' } } }),
      );
    });

    it('expiryTypeId + scope + status combine in AND (all three keys present in the same where)', async () => {
      expiryFindMany.mockResolvedValue([]);
      expiryCount.mockResolvedValue(0);

      await listAllExpiries(staffActor(), { expiryTypeId: 'type_1', scope: 'PILOTS', status: 'ok', page: 1, pageSize: 20 });

      const where = expiryFindManyMock.mock.calls[0]?.[0]?.where as Record<string, unknown>;
      expect(where).toMatchObject({ expiryTypeId: 'type_1', expiryType: { scope: 'PILOTS' } });
      expect(where).toHaveProperty('expiresAt');
    });

    // --- status -> expiresAt range mapping (Contesto: never post-filtered in JS) ---

    describe('status filter -> expiresAt date range (same today/EXPIRY_WARNING_DAYS boundary as computeExpiryStatus)', () => {
      it('status=expired -> expiresAt < today', async () => {
        expiryFindMany.mockResolvedValue([]);
        expiryCount.mockResolvedValue(0);

        await listAllExpiries(staffActor(), { status: 'expired', page: 1, pageSize: 20 });

        const where = expiryFindManyMock.mock.calls[0]?.[0]?.where as { expiresAt: { lt: Date } };
        expect(where.expiresAt).toEqual({ lt: todayDateOnlyUtc() });
      });

      it('status=expiring -> today <= expiresAt <= today + EXPIRY_WARNING_DAYS (inclusive both ends)', async () => {
        expiryFindMany.mockResolvedValue([]);
        expiryCount.mockResolvedValue(0);

        await listAllExpiries(staffActor(), { status: 'expiring', page: 1, pageSize: 20 });

        const today = todayDateOnlyUtc();
        const horizon = new Date(today.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
        const where = expiryFindManyMock.mock.calls[0]?.[0]?.where as { expiresAt: { gte: Date; lte: Date } };
        expect(where.expiresAt).toEqual({ gte: today, lte: horizon });
      });

      it('status=ok -> expiresAt > today + EXPIRY_WARNING_DAYS', async () => {
        expiryFindMany.mockResolvedValue([]);
        expiryCount.mockResolvedValue(0);

        await listAllExpiries(staffActor(), { status: 'ok', page: 1, pageSize: 20 });

        const today = todayDateOnlyUtc();
        const horizon = new Date(today.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
        const where = expiryFindManyMock.mock.calls[0]?.[0]?.where as { expiresAt: { gt: Date } };
        expect(where.expiresAt).toEqual({ gt: horizon });
      });

      // Boundary: the filter range and the per-row `computeExpiryStatus` MUST
      // agree exactly at the EXPIRY_WARNING_DAYS edge (Contesto: "i due
      // DEVONO combaciare").
      it('a scadenza at exactly today + EXPIRY_WARNING_DAYS is `expiring` in BOTH the filter and the per-row status', async () => {
        const today = todayDateOnlyUtc();
        const atHorizon = new Date(today.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
        expiryFindMany.mockResolvedValue([dashboardExpiryFixture({ expiresAt: atHorizon })]);
        expiryCount.mockResolvedValue(1);

        const filtered = await listAllExpiries(staffActor(), { status: 'expiring', page: 1, pageSize: 20 });
        expect(filtered.items).toHaveLength(1);
        expect(filtered.items[0]?.status).toBe('expiring');
      });

      it('a scadenza at today + EXPIRY_WARNING_DAYS + 1 day is `ok` in BOTH the filter and the per-row status', async () => {
        const today = todayDateOnlyUtc();
        const beyondHorizon = new Date(today.getTime() + (EXPIRY_WARNING_DAYS + 1) * 86_400_000);
        expiryFindMany.mockResolvedValue([dashboardExpiryFixture({ expiresAt: beyondHorizon })]);
        expiryCount.mockResolvedValue(1);

        const filtered = await listAllExpiries(staffActor(), { status: 'ok', page: 1, pageSize: 20 });
        expect(filtered.items).toHaveLength(1);
        expect(filtered.items[0]?.status).toBe('ok');
      });
    });
  });

  // --- registerExpiry: verification order + guards ----------------------

  describe('registerExpiry — verification order (404 -> 409 -> 422, no state leak)', () => {
    const input = { personId: 'person_1', expiryTypeId: 'type_1', issuedAt: '2026-01-01', expiresAt: '2026-12-31' };

    it('person not found -> NotFoundError, before the type is even looked up', async () => {
      personFindUnique.mockResolvedValue(null);

      await expect(registerExpiry(staffActor(), input)).rejects.toThrow(NotFoundError);
      expect(typeFindUniqueMock).not.toHaveBeenCalled();
    });

    it('archived person -> ConflictError, before the type is looked up', async () => {
      personFindUnique.mockResolvedValue(personFixture({ archivedAt: new Date('2026-01-01T00:00:00.000Z') }));

      await expect(registerExpiry(staffActor(), input)).rejects.toThrow(ConflictError);
      expect(typeFindUniqueMock).not.toHaveBeenCalled();
    });

    it('expiry type not found -> NotFoundError', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue(null);

      await expect(registerExpiry(staffActor(), input)).rejects.toThrow(NotFoundError);
    });

    it('deactivated expiry type -> ConflictError, before the scope check', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope: 'ALL', isActive: false });

      await expect(registerExpiry(staffActor(), input)).rejects.toThrow(ConflictError);
    });

    it('duplicate (person, type) -> ConflictError, pre-check', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope: 'ALL', isActive: true });
      expiryFindUnique.mockResolvedValue({ id: 'exp_existing' });

      await expect(registerExpiry(staffActor(), input)).rejects.toThrow(ConflictError);
      expect(expiryCreateMock).not.toHaveBeenCalled();
    });

    it('duplicate (person, type) race -> P2002 backstop maps to ConflictError', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope: 'ALL', isActive: true });
      expiryFindUnique.mockResolvedValue(null);
      expiryCreate.mockRejectedValue(prismaError('P2002'));

      await expect(registerExpiry(staffActor(), input)).rejects.toThrow(ConflictError);
    });

    it('succeeds and stamps actorUserId when everything checks out', async () => {
      personFindUnique.mockResolvedValue(personFixture({ pilotProfile: { deactivatedAt: null } }));
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope: 'PILOTS', isActive: true });
      expiryFindUnique.mockResolvedValue(null);
      expiryCreate.mockResolvedValue(expiryFixture());

      await registerExpiry(staffActor(), input);

      expect(expiryCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: 'person_1',
            expiryTypeId: 'type_1',
            issuedAt: parseDateOnlyUtc('2026-01-01'),
            expiresAt: parseDateOnlyUtc('2026-12-31'),
            notes: null,
            actorUserId: 'staff_1',
          }),
        }),
      );
    });
  });

  describe('registerExpiry — SCOPE_MISMATCH (422, stable code)', () => {
    const baseInput = { personId: 'person_1', expiryTypeId: 'type_1', issuedAt: '2026-01-01', expiresAt: '2026-12-31' };

    it.each(['PILOTS', 'STUDENTS', 'INSTRUCTORS'] as const)('scope %s with no matching profile -> 422 SCOPE_MISMATCH', async (scope) => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope, isActive: true });

      const error = await registerExpiry(staffActor(), baseInput).catch((e: unknown) => e);
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

      await expect(registerExpiry(staffActor(), baseInput)).rejects.toThrow(ValidationError);
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

      await expect(registerExpiry(staffActor(), baseInput)).resolves.toBeDefined();
    });

    it('scope ALL is always compatible, even with no profiles at all', async () => {
      personFindUnique.mockResolvedValue(personFixture());
      typeFindUnique.mockResolvedValue({ id: 'type_1', scope: 'ALL', isActive: true });
      expiryFindUnique.mockResolvedValue(null);
      expiryCreate.mockResolvedValue(expiryFixture());

      await expect(registerExpiry(staffActor(), baseInput)).resolves.toBeDefined();
    });
  });

  // --- updateExpiry: merge-validation ------------------------------------

  describe('updateExpiry', () => {
    it('404 on an unknown id', async () => {
      expiryFindUnique.mockResolvedValue(null);

      await expect(updateExpiry(staffActor(), 'missing', { notes: 'x' })).rejects.toThrow(NotFoundError);
    });

    it('patching only expiresAt to before the CURRENT issuedAt -> 422 (merge-validation against stored issuedAt)', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', issuedAt: parseDateOnlyUtc('2026-06-01'), expiresAt: parseDateOnlyUtc('2026-12-31') });

      await expect(updateExpiry(staffActor(), 'exp_1', { expiresAt: '2026-01-01' })).rejects.toThrow(ValidationError);
      expect(expiryUpdateMock).not.toHaveBeenCalled();
    });

    it('patching only issuedAt to after the CURRENT expiresAt -> 422 (merge-validation against stored expiresAt)', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', issuedAt: parseDateOnlyUtc('2026-01-01'), expiresAt: parseDateOnlyUtc('2026-06-01') });

      await expect(updateExpiry(staffActor(), 'exp_1', { issuedAt: '2026-12-31' })).rejects.toThrow(ValidationError);
    });

    it('patches notes to null explicitly (distinct from leaving it untouched)', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', issuedAt: parseDateOnlyUtc('2026-01-01'), expiresAt: parseDateOnlyUtc('2026-12-31') });
      expiryUpdate.mockResolvedValue(expiryFixture({ notes: null }));

      await updateExpiry(staffActor(), 'exp_1', { notes: null });

      expect(expiryUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ notes: null, actorUserId: 'staff_1' }) }),
      );
    });

    // --- SentAlert wipe-on-renewal (story 6.3, AD-9) -----------------------

    it('expiresAt CHANGES value -> wipes SentAlert in the same transaction (renewal re-earns its alert cycle)', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', issuedAt: parseDateOnlyUtc('2026-01-01'), expiresAt: parseDateOnlyUtc('2026-12-31') });
      sentAlertDeleteMany.mockResolvedValue({ count: 2 });
      expiryUpdate.mockResolvedValue(expiryFixture({ expiresAt: parseDateOnlyUtc('2027-06-30') }));

      await updateExpiry(staffActor(), 'exp_1', { expiresAt: '2027-06-30' });

      expect(transactionMock).toHaveBeenCalled();
      expect(sentAlertDeleteManyMock).toHaveBeenCalledWith({ where: { expiryId: 'exp_1' } });
    });

    it('expiresAt stays the SAME value (re-submitted, or only notes patched) -> does NOT touch SentAlert', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', issuedAt: parseDateOnlyUtc('2026-01-01'), expiresAt: parseDateOnlyUtc('2026-12-31') });
      expiryUpdate.mockResolvedValue(expiryFixture());

      await updateExpiry(staffActor(), 'exp_1', { expiresAt: '2026-12-31', notes: 'stessa data' });

      expect(sentAlertDeleteManyMock).not.toHaveBeenCalled();
    });

    it('only notes patched (expiresAt absent from the input) -> does NOT touch SentAlert', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', issuedAt: parseDateOnlyUtc('2026-01-01'), expiresAt: parseDateOnlyUtc('2026-12-31') });
      expiryUpdate.mockResolvedValue(expiryFixture());

      await updateExpiry(staffActor(), 'exp_1', { notes: 'solo note' });

      expect(sentAlertDeleteManyMock).not.toHaveBeenCalled();
    });
  });

  // --- deleteExpiry -------------------------------------------------------

  describe('deleteExpiry', () => {
    it('404 on an unknown id', async () => {
      expiryFindUnique.mockResolvedValue(null);

      await expect(deleteExpiry(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
      expect(expiryDeleteMock).not.toHaveBeenCalled();
    });

    it('deletes an existing expiry', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1' });
      expiryDelete.mockResolvedValue({ id: 'exp_1' });

      await expect(deleteExpiry(staffActor(), 'exp_1')).resolves.toBeUndefined();
      expect(expiryDeleteMock).toHaveBeenCalledWith({ where: { id: 'exp_1' } });
    });

    it('maps a concurrent double-DELETE race (P2025 — the loser of the race) to NotFoundError, not a raw 500 (TD-1, AC 1)', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1' });
      expiryDelete.mockRejectedValue(prismaError('P2025'));

      await expect(deleteExpiry(staffActor(), 'exp_1')).rejects.toThrow(NotFoundError);
    });
  });

  // --- proposeExpiryUpdate -------------------------------------------------

  describe('proposeExpiryUpdate', () => {
    const input = { issuedAt: '2026-01-01', expiresAt: '2026-12-31' };

    it('404 on an unknown expiry', async () => {
      expiryFindUnique.mockResolvedValue(null);

      await expect(proposeExpiryUpdate(pilotActor('person_1'), 'missing', input)).rejects.toThrow(NotFoundError);
    });

    it('a PENDING proposal already exists -> 409 pre-check, no create attempted', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', personId: 'person_1' });
      proposalFindFirst.mockResolvedValue({ id: 'prop_existing' });

      await expect(proposeExpiryUpdate(pilotActor('person_1'), 'exp_1', input)).rejects.toThrow(ConflictError);
      expect(proposalCreateMock).not.toHaveBeenCalled();
    });

    it('race on the partial unique index -> P2002 backstop maps to ConflictError', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', personId: 'person_1' });
      proposalFindFirst.mockResolvedValue(null);
      proposalCreate.mockRejectedValue(prismaError('P2002'));

      await expect(proposeExpiryUpdate(pilotActor('person_1'), 'exp_1', input)).rejects.toThrow(ConflictError);
    });

    it('does NOT touch the Expiry itself (AC 2 — value stays authoritative until staff decides)', async () => {
      expiryFindUnique.mockResolvedValue({ id: 'exp_1', personId: 'person_1' });
      proposalFindFirst.mockResolvedValue(null);
      proposalCreate.mockResolvedValue(proposalCreateFixture());

      await proposeExpiryUpdate(pilotActor('person_1'), 'exp_1', input);

      expect(expiryUpdateMock).not.toHaveBeenCalled();
      expect(proposalCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ expiryId: 'exp_1', proposedByUserId: 'pilot_1' }) }),
      );
    });
  });

  // --- listExpiryProposals --------------------------------------------------

  describe('listExpiryProposals', () => {
    it('returns the AD-8 paginated envelope, defaulting to status PENDING', async () => {
      proposalFindMany.mockResolvedValue([proposalListFixture()]);
      proposalCount.mockResolvedValue(1);

      const result = await listExpiryProposals(staffActor(), { page: 1, pageSize: 20, status: 'PENDING' });

      expect(result).toMatchObject({ total: 1, page: 1, pageSize: 20 });
      expect(result.items[0]).toMatchObject({
        id: 'prop_1',
        personName: 'Mario Rossi',
        typeName: 'Visita medica classe 2',
        proposedByEmail: 'pilot@airmanager.local',
        status: 'PENDING',
      });
    });
  });

  // --- decideExpiryProposal -------------------------------------------------

  describe('decideExpiryProposal', () => {
    it('404 on an unknown proposal', async () => {
      proposalFindUnique.mockResolvedValue(null);

      await expect(decideExpiryProposal(staffActor(), 'missing', 'APPROVE')).rejects.toThrow(NotFoundError);
    });

    it('already decided -> 409, before opening the transaction', async () => {
      proposalFindUnique.mockResolvedValue({
        id: 'prop_1',
        status: 'APPROVED',
        expiryId: 'exp_1',
        proposedIssuedAt: parseDateOnlyUtc('2026-01-01'),
        proposedExpiresAt: parseDateOnlyUtc('2026-12-31'),
        proposedNotes: null,
      });

      await expect(decideExpiryProposal(staffActor(), 'prop_1', 'APPROVE')).rejects.toThrow(ConflictError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('race: the optimistic updateMany guard returns count 0 -> 409, even though the pre-check saw PENDING', async () => {
      proposalFindUnique.mockResolvedValue({
        id: 'prop_1',
        status: 'PENDING',
        expiryId: 'exp_1',
        proposedIssuedAt: parseDateOnlyUtc('2026-01-01'),
        proposedExpiresAt: parseDateOnlyUtc('2026-12-31'),
        proposedNotes: null,
        expiry: { expiresAt: parseDateOnlyUtc('2026-06-01') },
      });
      proposalUpdateMany.mockResolvedValue({ count: 0 });

      await expect(decideExpiryProposal(staffActor(), 'prop_1', 'APPROVE')).rejects.toThrow(ConflictError);
    });

    it('APPROVE applies the proposed values to the Expiry in the same transaction', async () => {
      proposalFindUnique.mockResolvedValue({
        id: 'prop_1',
        status: 'PENDING',
        expiryId: 'exp_1',
        proposedIssuedAt: parseDateOnlyUtc('2026-02-01'),
        proposedExpiresAt: parseDateOnlyUtc('2027-02-01'),
        proposedNotes: 'nuova nota',
        expiry: { expiresAt: parseDateOnlyUtc('2026-12-31') },
      });
      proposalUpdateMany.mockResolvedValue({ count: 1 });
      proposalFindUniqueOrThrow.mockResolvedValue(proposalListFixture({ status: 'APPROVED' }));

      const result = await decideExpiryProposal(staffActor(), 'prop_1', 'APPROVE');

      expect(expiryUpdateMock).toHaveBeenCalledWith({
        where: { id: 'exp_1' },
        data: {
          issuedAt: parseDateOnlyUtc('2026-02-01'),
          expiresAt: parseDateOnlyUtc('2027-02-01'),
          notes: 'nuova nota',
          actorUserId: 'staff_1',
        },
      });
      expect(result.status).toBe('APPROVED');
    });

    it('REJECT leaves the Expiry untouched', async () => {
      proposalFindUnique.mockResolvedValue({
        id: 'prop_1',
        status: 'PENDING',
        expiryId: 'exp_1',
        proposedIssuedAt: parseDateOnlyUtc('2026-02-01'),
        proposedExpiresAt: parseDateOnlyUtc('2027-02-01'),
        proposedNotes: null,
        expiry: { expiresAt: parseDateOnlyUtc('2026-12-31') },
      });
      proposalUpdateMany.mockResolvedValue({ count: 1 });
      proposalFindUniqueOrThrow.mockResolvedValue(proposalListFixture({ status: 'REJECTED' }));

      await decideExpiryProposal(staffActor(), 'prop_1', 'REJECT');

      expect(expiryUpdateMock).not.toHaveBeenCalled();
    });

    // --- SentAlert wipe-on-renewal (story 6.3, AD-9) -----------------------

    it('APPROVE with a proposedExpiresAt DIFFERENT from the current value -> wipes SentAlert in the same transaction', async () => {
      proposalFindUnique.mockResolvedValue({
        id: 'prop_1',
        status: 'PENDING',
        expiryId: 'exp_1',
        proposedIssuedAt: parseDateOnlyUtc('2026-02-01'),
        proposedExpiresAt: parseDateOnlyUtc('2027-02-01'),
        proposedNotes: null,
        expiry: { expiresAt: parseDateOnlyUtc('2026-12-31') },
      });
      proposalUpdateMany.mockResolvedValue({ count: 1 });
      sentAlertDeleteMany.mockResolvedValue({ count: 3 });
      proposalFindUniqueOrThrow.mockResolvedValue(proposalListFixture({ status: 'APPROVED' }));

      await decideExpiryProposal(staffActor(), 'prop_1', 'APPROVE');

      expect(sentAlertDeleteManyMock).toHaveBeenCalledWith({ where: { expiryId: 'exp_1' } });
    });

    it('APPROVE with a proposedExpiresAt EQUAL to the current value -> does NOT touch SentAlert', async () => {
      proposalFindUnique.mockResolvedValue({
        id: 'prop_1',
        status: 'PENDING',
        expiryId: 'exp_1',
        proposedIssuedAt: parseDateOnlyUtc('2026-02-01'),
        proposedExpiresAt: parseDateOnlyUtc('2026-12-31'),
        proposedNotes: 'solo note aggiornate',
        expiry: { expiresAt: parseDateOnlyUtc('2026-12-31') },
      });
      proposalUpdateMany.mockResolvedValue({ count: 1 });
      proposalFindUniqueOrThrow.mockResolvedValue(proposalListFixture({ status: 'APPROVED' }));

      await decideExpiryProposal(staffActor(), 'prop_1', 'APPROVE');

      expect(sentAlertDeleteManyMock).not.toHaveBeenCalled();
    });

    it('REJECT never touches SentAlert, even when proposedExpiresAt differs from the current value', async () => {
      proposalFindUnique.mockResolvedValue({
        id: 'prop_1',
        status: 'PENDING',
        expiryId: 'exp_1',
        proposedIssuedAt: parseDateOnlyUtc('2026-02-01'),
        proposedExpiresAt: parseDateOnlyUtc('2027-02-01'),
        proposedNotes: null,
        expiry: { expiresAt: parseDateOnlyUtc('2026-12-31') },
      });
      proposalUpdateMany.mockResolvedValue({ count: 1 });
      proposalFindUniqueOrThrow.mockResolvedValue(proposalListFixture({ status: 'REJECTED' }));

      await decideExpiryProposal(staffActor(), 'prop_1', 'REJECT');

      expect(sentAlertDeleteManyMock).not.toHaveBeenCalled();
    });
  });

  // --- Schema validation (422s at the Zod boundary, before the service) ---

  describe('schema validation', () => {
    it('registerExpirySchema rejects a malformed date', () => {
      expect(
        registerExpirySchema.safeParse({ personId: 'p', expiryTypeId: 't', issuedAt: '01-01-2026', expiresAt: '2026-12-31' }).success,
      ).toBe(false);
    });

    it('registerExpirySchema rejects a missing issuedAt', () => {
      expect(registerExpirySchema.safeParse({ personId: 'p', expiryTypeId: 't', expiresAt: '2026-12-31' }).success).toBe(false);
    });

    it('registerExpirySchema rejects expiresAt before issuedAt', () => {
      expect(
        registerExpirySchema.safeParse({ personId: 'p', expiryTypeId: 't', issuedAt: '2026-12-31', expiresAt: '2026-01-01' }).success,
      ).toBe(false);
    });

    it('registerExpirySchema rejects notes over 500 chars', () => {
      expect(
        registerExpirySchema.safeParse({
          personId: 'p',
          expiryTypeId: 't',
          issuedAt: '2026-01-01',
          expiresAt: '2026-12-31',
          notes: 'x'.repeat(501),
        }).success,
      ).toBe(false);
    });

    it('proposeExpirySchema rejects expiresAt before issuedAt', () => {
      expect(proposeExpirySchema.safeParse({ issuedAt: '2026-12-31', expiresAt: '2026-01-01' }).success).toBe(false);
    });

    it('updateExpirySchema rejects an empty body', () => {
      expect(updateExpirySchema.safeParse({}).success).toBe(false);
    });

    it('updateExpirySchema rejects expiresAt before issuedAt WHEN BOTH are in the body', () => {
      expect(updateExpirySchema.safeParse({ issuedAt: '2026-12-31', expiresAt: '2026-01-01' }).success).toBe(false);
    });

    it('updateExpirySchema accepts a single-field patch (no cross-field check possible here — the service merges)', () => {
      expect(updateExpirySchema.safeParse({ expiresAt: '2026-01-01' }).success).toBe(true);
    });

    it('decideProposalSchema rejects a decision outside the enum', () => {
      expect(decideProposalSchema.safeParse({ decision: 'MAYBE' }).success).toBe(false);
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
});
