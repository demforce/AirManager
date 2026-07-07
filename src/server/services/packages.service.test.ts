import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sellPackageSchema } from '@/lib/schemas/packages';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: {
      findUnique: vi.fn(),
    },
    packageType: {
      findUnique: vi.fn(),
    },
    cashCategory: {
      findUnique: vi.fn(),
    },
    account: {
      upsert: vi.fn(),
    },
    accountMovement: {
      create: vi.fn(),
    },
    hourPackage: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    cashMovement: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const getAccountOverviewMock = vi.fn();
vi.mock('./accounts.service', () => ({
  getAccountOverview: (...args: unknown[]) => getAccountOverviewMock(...args),
}));

const { prisma } = await import('@/server/db/prisma');
const { computeRemainingMinutes, listPersonPackages, sellPackage } = await import('./packages.service');
const { ConflictError, NotFoundError } = await import('./errors');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const packageTypeFindUniqueMock = vi.mocked(prisma.packageType.findUnique);
const cashCategoryFindUniqueMock = vi.mocked(prisma.cashCategory.findUnique);
const accountUpsertMock = vi.mocked(prisma.account.upsert);
const accountMovementCreateMock = vi.mocked(prisma.accountMovement.create);
const hourPackageCreateMock = vi.mocked(prisma.hourPackage.create);
const hourPackageFindManyMock = vi.mocked(prisma.hourPackage.findMany);
const cashMovementCreateMock = vi.mocked(prisma.cashMovement.create);
const transactionMock = vi.mocked(prisma.$transaction);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as every other `*.service.test.ts`).
type Fixture = Record<string, unknown> | null;
const personFindUnique = personFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const packageTypeFindUnique = packageTypeFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const cashCategoryFindUnique = cashCategoryFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const accountUpsert = accountUpsertMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const accountMovementCreate = accountMovementCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const hourPackageCreate = hourPackageCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const hourPackageFindMany = hourPackageFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };

/** Same batch/interactive `$transaction` stand-in as `accounts.service.test.ts`/`package-types.service.test.ts`. */
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };
function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
}

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(personId: string | null = 'person_pilot'): Actor {
  return { userId: 'pilot_1', personId, roles: ['PILOT'] };
}

function instructorActor(): Actor {
  return { userId: 'instructor_1', personId: 'person_instructor', roles: ['INSTRUCTOR'] };
}

const ACTIVE_TYPE = {
  id: 'pt_1',
  name: 'Pacchetto 10 ore',
  includedMinutes: 600,
  priceCents: 140000,
  validityMonths: 12,
  isActive: true,
};

const PERSON = { id: 'person_1', firstName: 'Mario', lastName: 'Rossi', archivedAt: null };

const SELL_INPUT = sellPackageSchema.parse({
  packageTypeId: 'pt_1',
  paymentMethod: 'POS' as const,
  effectiveDate: '2026-07-07',
  description: 'Nota facoltativa',
});

const ACCOUNT_OVERVIEW = { account: { id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') }, balanceCents: 0, recentMovements: [] };

describe('packages.service (story 4.4 — package sale and residuals, FR-13)', () => {
  beforeEach(() => {
    personFindUniqueMock.mockReset();
    packageTypeFindUniqueMock.mockReset();
    cashCategoryFindUniqueMock.mockReset();
    accountUpsertMock.mockReset();
    accountMovementCreateMock.mockReset();
    hourPackageCreateMock.mockReset();
    hourPackageFindManyMock.mockReset();
    cashMovementCreateMock.mockReset();
    transactionMock.mockReset();
    getAccountOverviewMock.mockReset();
    getAccountOverviewMock.mockResolvedValue(ACCOUNT_OVERVIEW);
    mockTransaction();
  });

  describe('computeRemainingMinutes (AD-3 — single computation point, never a persisted counter)', () => {
    it('equals includedMinutes today (no consumption model yet, epic 5)', () => {
      expect(computeRemainingMinutes({ includedMinutes: 600 })).toBe(600);
      expect(computeRemainingMinutes({ includedMinutes: 0 })).toBe(0);
    });
  });

  describe('sellPackage — authorization (AD-5)', () => {
    it('rejects a pilot (finance.manage required), before touching the DB', async () => {
      await expect(sellPackage(pilotActor(), 'person_1', SELL_INPUT)).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('rejects an instructor (finance.manage required)', async () => {
      await expect(sellPackage(instructorActor(), 'person_1', SELL_INPUT)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('sellPackage — guards (AC 1, Dev Notes order: person 404 -> archived 409 -> type 404 -> inactive 409 -> category fail-fast)', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);

      await expect(sellPackage(staffActor(), 'missing', SELL_INPUT)).rejects.toThrow(NotFoundError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError for an archived person', async () => {
      personFindUnique.mockResolvedValue({ ...PERSON, archivedAt: new Date('2026-01-01T00:00:00.000Z') });

      await expect(sellPackage(staffActor(), 'person_1', SELL_INPUT)).rejects.toThrow(ConflictError);
      expect(packageTypeFindUniqueMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown package type', async () => {
      personFindUnique.mockResolvedValue(PERSON);
      packageTypeFindUnique.mockResolvedValue(null);

      await expect(sellPackage(staffActor(), 'person_1', SELL_INPUT)).rejects.toThrow(NotFoundError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError for an inactive package type', async () => {
      personFindUnique.mockResolvedValue(PERSON);
      packageTypeFindUnique.mockResolvedValue({ ...ACTIVE_TYPE, isActive: false });

      await expect(sellPackage(staffActor(), 'person_1', SELL_INPUT)).rejects.toThrow(ConflictError);
      expect(cashCategoryFindUniqueMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws an explicit error when the "Pacchetti" cash category is missing (Dev Notes: never silently create it)', async () => {
      personFindUnique.mockResolvedValue(PERSON);
      packageTypeFindUnique.mockResolvedValue(ACTIVE_TYPE);
      cashCategoryFindUnique.mockResolvedValue(null);

      await expect(sellPackage(staffActor(), 'person_1', SELL_INPUT)).rejects.toThrow(/Pacchetti/);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('looks up the "Pacchetti" category with isActive: true — a deactivated category also fails loudly', async () => {
      personFindUnique.mockResolvedValue(PERSON);
      packageTypeFindUnique.mockResolvedValue(ACTIVE_TYPE);
      cashCategoryFindUnique.mockResolvedValue(null);

      await expect(sellPackage(staffActor(), 'person_1', SELL_INPUT)).rejects.toThrow(/Pacchetti/);
      expect(cashCategoryFindUniqueMock).toHaveBeenCalledWith({
        where: { name: 'Pacchetti', isActive: true },
        select: { id: true },
      });
    });
  });

  describe('sellPackage — the transaction (AC 1: 3 records, amountCents 0 on the account, +price on cash)', () => {
    const HOUR_PACKAGE_ROW = {
      id: 'hp_1',
      includedMinutes: 600,
      pricePaidCents: 140000,
      paymentMethod: 'POS' as const,
      effectiveDate: new Date('2026-07-07T00:00:00.000Z'),
      expiresAt: new Date('2027-07-07T00:00:00.000Z'),
      createdAt: new Date('2026-07-07T10:00:00.000Z'),
      packageType: { name: 'Pacchetto 10 ore' },
      actorUser: { email: 'staff@airmanager.local' },
    };

    beforeEach(() => {
      personFindUnique.mockResolvedValue(PERSON);
      packageTypeFindUnique.mockResolvedValue(ACTIVE_TYPE);
      cashCategoryFindUnique.mockResolvedValue({ id: 'category_pacchetti' });
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      hourPackageCreate.mockResolvedValue(HOUR_PACKAGE_ROW);
    });

    it('upserts the Account, creates the PACKAGE_PURCHASE AccountMovement (amountCents: 0), the HourPackage snapshot and the linked CashMovement (+price), all inside one transaction', async () => {
      const result = await sellPackage(staffActor(), 'person_1', SELL_INPUT);

      expect(accountUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { personId: 'person_1' }, create: { personId: 'person_1' } }),
      );
      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'account_1',
            type: 'PACKAGE_PURCHASE',
            amountCents: 0,
            paymentMethod: 'POS',
            description: 'Nota facoltativa',
            effectiveDate: new Date('2026-07-07'),
            actorUserId: 'staff_1',
          }),
        }),
      );
      expect(hourPackageCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: 'person_1',
            packageTypeId: 'pt_1',
            includedMinutes: 600,
            pricePaidCents: 140000,
            paymentMethod: 'POS',
            effectiveDate: new Date('2026-07-07'),
            expiresAt: new Date('2027-07-07'),
            accountMovementId: 'movement_1',
            actorUserId: 'staff_1',
          }),
        }),
      );
      expect(cashMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: 'category_pacchetti',
            amountCents: 140000,
            description: 'Pacchetto Pacchetto 10 ore — Rossi Mario',
            effectiveDate: new Date('2026-07-07'),
            actorUserId: 'staff_1',
            accountMovementId: 'movement_1',
          }),
        }),
      );
      expect(result.package.id).toBe('hp_1');
      expect(result.account).toEqual(ACCOUNT_OVERVIEW);
      expect(getAccountOverviewMock).toHaveBeenCalledWith(staffActor(), 'person_1');
    });

    it('materializes expiresAt via addMonthsClampUtc when the type has validityMonths (end-of-month clamp)', async () => {
      packageTypeFindUnique.mockResolvedValue({ ...ACTIVE_TYPE, validityMonths: 1 });
      await sellPackage(
        staffActor(),
        'person_1',
        sellPackageSchema.parse({ packageTypeId: 'pt_1', paymentMethod: 'CASH', effectiveDate: '2026-01-31' }),
      );

      expect(hourPackageCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ expiresAt: new Date('2026-02-28') }) }),
      );
    });

    it('expiresAt is null when the type has no validityMonths', async () => {
      packageTypeFindUnique.mockResolvedValue({ ...ACTIVE_TYPE, validityMonths: null });
      await sellPackage(staffActor(), 'person_1', SELL_INPUT);

      expect(hourPackageCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ expiresAt: null }) }),
      );
    });

    it('normalizes an omitted description to null on the AccountMovement (cash description stays auto-generated regardless)', async () => {
      await sellPackage(
        staffActor(),
        'person_1',
        sellPackageSchema.parse({ packageTypeId: 'pt_1', paymentMethod: 'CASH', effectiveDate: '2026-07-07' }),
      );

      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ description: null }) }),
      );
      expect(cashMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ description: 'Pacchetto Pacchetto 10 ore — Rossi Mario' }) }),
      );
    });

    it('includes actorEmail when the caller has people.read (STAFF/ADMIN today)', async () => {
      const result = await sellPackage(adminActor(), 'person_1', SELL_INPUT);
      expect(result.package.actorEmail).toBe('staff@airmanager.local');
    });
  });

  describe('listPersonPackages — own-access (story 3.2 pattern, AC 2)', () => {
    it('rejects an actor with neither people.read nor self.read', async () => {
      await expect(listPersonPackages({ userId: 'ghost_1', personId: null, roles: [] }, 'person_1')).rejects.toThrow(
        ForbiddenError,
      );
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('a pilot may read their OWN packages', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_pilot' });
      hourPackageFindMany.mockResolvedValue([]);

      await expect(listPersonPackages(pilotActor('person_pilot'), 'person_pilot')).resolves.toEqual([]);
    });

    it('a pilot reading ANOTHER person is Forbidden, checked BEFORE any query', async () => {
      await expect(listPersonPackages(pilotActor('person_pilot'), 'person_other')).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('staff (people.read) may read ANY person', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      hourPackageFindMany.mockResolvedValue([]);

      await expect(listPersonPackages(staffActor(), 'person_1')).resolves.toEqual([]);
    });

    it('throws NotFoundError for an unknown person', async () => {
      personFindUnique.mockResolvedValue(null);

      await expect(listPersonPackages(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('listPersonPackages — DTO shape (AC 2)', () => {
    const ROW = {
      id: 'hp_1',
      includedMinutes: 600,
      pricePaidCents: 140000,
      paymentMethod: 'POS' as const,
      effectiveDate: new Date('2026-07-07T00:00:00.000Z'),
      expiresAt: new Date('2027-01-07T00:00:00.000Z'),
      createdAt: new Date('2026-07-07T10:00:00.000Z'),
      packageType: { name: 'Pacchetto 10 ore' },
      actorUser: { email: 'staff@airmanager.local' },
    };

    beforeEach(() => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
    });

    it('orders by effectiveDate desc, id desc, capped at take: 500', async () => {
      hourPackageFindMany.mockResolvedValue([]);

      await listPersonPackages(staffActor(), 'person_1');

      expect(hourPackageFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { personId: 'person_1' },
          orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
          take: 500,
        }),
      );
    });

    it('includes actorEmail for a people.read caller, omits it for own-access', async () => {
      hourPackageFindMany.mockResolvedValue([ROW]);
      const staffResult = await listPersonPackages(staffActor(), 'person_1');
      expect(staffResult[0]?.actorEmail).toBe('staff@airmanager.local');

      personFindUnique.mockResolvedValue({ id: 'person_pilot' });
      hourPackageFindMany.mockResolvedValue([{ ...ROW, id: 'hp_2' }]);
      const ownResult = await listPersonPackages(pilotActor('person_pilot'), 'person_pilot');
      expect(ownResult[0]?.actorEmail).toBeUndefined();
    });

    it('remainingMinutes equals includedMinutes (no consumption model yet)', async () => {
      hourPackageFindMany.mockResolvedValue([ROW]);
      const [item] = await listPersonPackages(staffActor(), 'person_1');
      expect(item?.remainingMinutes).toBe(600);
    });

    describe('isExpired boundary (Dev Notes: expired only if STRICTLY before today, expiry day itself is still valid)', () => {
      beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2027-01-07T12:00:00.000Z'));
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('expiresAt === today -> NOT expired', async () => {
        hourPackageFindMany.mockResolvedValue([{ ...ROW, expiresAt: new Date('2027-01-07T00:00:00.000Z') }]);
        const [item] = await listPersonPackages(staffActor(), 'person_1');
        expect(item?.isExpired).toBe(false);
      });

      it('expiresAt < today -> expired', async () => {
        hourPackageFindMany.mockResolvedValue([{ ...ROW, expiresAt: new Date('2027-01-06T00:00:00.000Z') }]);
        const [item] = await listPersonPackages(staffActor(), 'person_1');
        expect(item?.isExpired).toBe(true);
      });

      it('expiresAt > today -> not expired', async () => {
        hourPackageFindMany.mockResolvedValue([{ ...ROW, expiresAt: new Date('2027-01-08T00:00:00.000Z') }]);
        const [item] = await listPersonPackages(staffActor(), 'person_1');
        expect(item?.isExpired).toBe(false);
      });

      it('expiresAt: null -> never expired', async () => {
        hourPackageFindMany.mockResolvedValue([{ ...ROW, expiresAt: null }]);
        const [item] = await listPersonPackages(staffActor(), 'person_1');
        expect(item?.isExpired).toBe(false);
        expect(item?.expiresAt).toBeNull();
      });
    });
  });
});

describe('sellPackageSchema (story 4.4, AC 1; AD-2)', () => {
  it('accepts a valid body', () => {
    const result = sellPackageSchema.safeParse({
      packageTypeId: 'pt_1',
      paymentMethod: 'CASH',
      effectiveDate: '2026-07-07',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty packageTypeId', () => {
    expect(
      sellPackageSchema.safeParse({ packageTypeId: '', paymentMethod: 'CASH', effectiveDate: '2026-07-07' }).success,
    ).toBe(false);
  });

  it('rejects an invalid paymentMethod', () => {
    expect(
      sellPackageSchema.safeParse({ packageTypeId: 'pt_1', paymentMethod: 'BITCOIN', effectiveDate: '2026-07-07' })
        .success,
    ).toBe(false);
  });

  it('rejects a malformed effectiveDate', () => {
    expect(
      sellPackageSchema.safeParse({ packageTypeId: 'pt_1', paymentMethod: 'CASH', effectiveDate: '07/07/2026' })
        .success,
    ).toBe(false);
  });

  it('rejects a description over 500 chars', () => {
    expect(
      sellPackageSchema.safeParse({
        packageTypeId: 'pt_1',
        paymentMethod: 'CASH',
        effectiveDate: '2026-07-07',
        description: 'x'.repeat(501),
      }).success,
    ).toBe(false);
  });

  it('accepts an omitted or null description', () => {
    expect(
      sellPackageSchema.safeParse({ packageTypeId: 'pt_1', paymentMethod: 'CASH', effectiveDate: '2026-07-07' })
        .success,
    ).toBe(true);
    expect(
      sellPackageSchema.safeParse({
        packageTypeId: 'pt_1',
        paymentMethod: 'CASH',
        effectiveDate: '2026-07-07',
        description: null,
      }).success,
    ).toBe(true);
  });
});
