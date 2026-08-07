import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    aircraft: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    hourMeterAdjustment: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    // Story 14.8: the composite `createAircraft` + rate transaction path.
    aircraftRate: {
      create: vi.fn(),
    },
    // Story 15.5: `sumFlightMinutesByAircraft`, the fleet card's hours bar.
    flight: {
      groupBy: vi.fn(),
    },
    // Story AOG-1b: the impacted-booking count (`aog-impact.ts`) and the
    // grounding email's two batched recipient look-ups.
    booking: {
      findMany: vi.fn(),
    },
    person: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

/**
 * Story AOG-1b: `aircraft.service.ts` now sends the grounding email, so this
 * test file imports the mail chain for the first time — and that chain reaches
 * `@/lib/env`'s EAGER validation through `SmtpMailSender`. Mocked here (same
 * shape as `bookings.service.test.ts`), which is what keeps
 * `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` green: the
 * three-occurrence rule of CLAUDE.md.
 */
const sendMock = vi.fn();
vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: sendMock })),
}));

vi.mock('@/server/adapters/mail/templates', () => ({
  buildAircraftGroundedEmail: vi.fn(async () => ({ subject: 'Aircraft grounded subject', text: 'Aircraft grounded text' })),
}));

const { prisma } = await import('@/server/db/prisma');
const { buildAircraftGroundedEmail } = await import('@/server/adapters/mail/templates');
const {
  adjustHourMeter,
  archiveAircraft,
  createAircraft,
  getAircraft,
  listAircraft,
  listHourMeterAdjustments,
  listOutOfServiceAircraft,
  previewOutOfServiceImpact,
  returnToService,
  setOutOfService,
  sumFlightMinutesByAircraft,
  unarchiveAircraft,
  updateAircraft,
} = await import('./aircraft.service');
const { ConflictError, NotFoundError } = await import('./errors');

const findUniqueMock = vi.mocked(prisma.aircraft.findUnique);
const findUniqueOrThrowMock = vi.mocked(prisma.aircraft.findUniqueOrThrow);
const findFirstMock = vi.mocked(prisma.aircraft.findFirst);
const findManyMock = vi.mocked(prisma.aircraft.findMany);
const countMock = vi.mocked(prisma.aircraft.count);
const createMock = vi.mocked(prisma.aircraft.create);
const updateMock = vi.mocked(prisma.aircraft.update);
const updateManyMock = vi.mocked(prisma.aircraft.updateMany);
const hourMeterAdjustmentCreateMock = vi.mocked(prisma.hourMeterAdjustment.create);
const hourMeterAdjustmentFindManyMock = vi.mocked(prisma.hourMeterAdjustment.findMany);
const hourMeterAdjustmentCountMock = vi.mocked(prisma.hourMeterAdjustment.count);
const aircraftRateCreateMock = vi.mocked(prisma.aircraftRate.create);
const flightGroupByMock = vi.mocked(prisma.flight.groupBy);
const bookingFindManyMock = vi.mocked(prisma.booking.findMany);
const personFindManyMock = vi.mocked(prisma.person.findMany);
const userFindManyMock = vi.mocked(prisma.user.findMany);
const transactionMock = vi.mocked(prisma.$transaction);
const queryRawMock = vi.mocked(prisma.$queryRaw);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as people.service.test.ts).
type AircraftFixture = Record<string, unknown> | null;
const aircraftFindUnique = findUniqueMock as unknown as { mockResolvedValue: (v: AircraftFixture) => void };
const aircraftFindUniqueOrThrow = findUniqueOrThrowMock as unknown as { mockResolvedValue: (v: AircraftFixture) => void };
const aircraftFindFirst = findFirstMock as unknown as { mockResolvedValue: (v: AircraftFixture) => void };
const aircraftCreate = createMock as unknown as { mockResolvedValue: (v: AircraftFixture) => void };
const aircraftUpdate = updateMock as unknown as { mockResolvedValue: (v: AircraftFixture) => void };
const aircraftUpdateMany = updateManyMock as unknown as { mockResolvedValue: (v: { count: number }) => void };
// Same workaround, array-shaped — `listOutOfServiceAircraft` (story 10.3) is the first direct (non-transaction) `findMany` fixture in this file.
const aircraftFindMany = findManyMock as unknown as { mockResolvedValue: (v: AircraftFixture[]) => void };
// Story AOG-1b: same overload workaround for the three delegates the grounding
// count and its email fan-out read.
const bookingFindMany = bookingFindManyMock as unknown as { mockResolvedValue: (v: Array<Record<string, unknown>>) => void };
const personFindMany = personFindManyMock as unknown as { mockResolvedValue: (v: Array<Record<string, unknown>>) => void };
const userFindMany = userFindManyMock as unknown as { mockResolvedValue: (v: Array<Record<string, unknown>>) => void };
// The FOR UPDATE locked read in `adjustHourMeter` (review 2.5 F1) — returns rows.
const queryRaw = queryRawMock as unknown as { mockResolvedValue: (v: Array<{ hourMeterMinutes: number }>) => void };
const hourMeterAdjustmentCreate = hourMeterAdjustmentCreateMock as unknown as { mockResolvedValue: (v: unknown) => void };
const transaction = transactionMock as unknown as { mockResolvedValue: (v: unknown) => void; mockImplementation: (fn: (arg: unknown) => unknown) => void };

/**
 * `adjustHourMeter` runs its work inside `prisma.$transaction(async (tx) =>
 * ...)` — the interactive-transaction overload. The mocked module's
 * `prisma.aircraft`/`prisma.hourMeterAdjustment` delegates ARE what the
 * service calls whether reached directly or via `tx`, so handing the same
 * mocked `prisma` back as `tx` is a faithful stand-in for Prisma's real
 * per-transaction client.
 */
function mockInteractiveTransaction(): void {
  transaction.mockImplementation((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : arg));
}

/** Story 14.9: the only role left with `aircraft.manage` — also holds `settings.manage`, so the composite create's `rate` block (story 14.8) never sees the two permissions apart. */
function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

const SELECTED_AIRCRAFT = {
  id: 'aircraft_1',
  registration: 'I-ABCD',
  type: 'Ultraleggero 3 assi',
  model: 'Tecnam P92 Eaglet',
  hourMeterMinutes: 750,
  notes: 'Velivolo scuola volo demo.',
  status: 'OPERATIONAL',
  statusReason: null,
  // Story AOG-1a: `@db.Date` at rest (a `Date` on the raw row), `YYYY-MM-DD` on
  // the DTO — `null` here, the state every pre-existing row starts in.
  outOfServiceUntil: null,
  // Story 12.5, AC 1: additive fleet fields.
  seats: 2,
  fuelType: 'AVGAS 100LL',
  based: true,
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('aircraft.service (story 2.4 — aircraft.manage RBAC + CRUD/archiving)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    findUniqueOrThrowMock.mockReset();
    findFirstMock.mockReset();
    findManyMock.mockReset();
    countMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    updateManyMock.mockReset();
    hourMeterAdjustmentCreateMock.mockReset();
    hourMeterAdjustmentFindManyMock.mockReset();
    hourMeterAdjustmentCountMock.mockReset();
    aircraftRateCreateMock.mockReset();
    flightGroupByMock.mockReset();
    bookingFindManyMock.mockReset();
    personFindManyMock.mockReset();
    userFindManyMock.mockReset();
    sendMock.mockReset();
    vi.mocked(buildAircraftGroundedEmail).mockClear();
    // Story AOG-1b defaults: no impacted booking, hence no recipient — every
    // PRE-EXISTING test keeps behaving exactly as it did.
    bookingFindMany.mockResolvedValue([]);
    personFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([]);
    transactionMock.mockReset();
    queryRawMock.mockReset();
  });

  describe('authorization (AD-5, AC 1/2)', () => {
    it('listAircraft rejects an actor without aircraft.manage', async () => {
      await expect(listAircraft(pilotActor(), { page: 1, pageSize: 20, includeArchived: false })).rejects.toThrow(
        ForbiddenError,
      );
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('getAircraft rejects an actor without aircraft.manage', async () => {
      await expect(getAircraft(pilotActor(), 'aircraft_1')).rejects.toThrow(ForbiddenError);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('createAircraft rejects an actor without aircraft.manage', async () => {
      await expect(
        createAircraft(pilotActor(), {
          registration: 'I-XYZW',
          type: 'Ultraleggero',
          model: 'Test',
          hourMeterMinutes: 0,
          notes: null,
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(findFirstMock).not.toHaveBeenCalled();
    });

    it('updateAircraft rejects an actor without aircraft.manage', async () => {
      await expect(updateAircraft(pilotActor(), 'aircraft_1', { notes: 'x' })).rejects.toThrow(ForbiddenError);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('archiveAircraft rejects an actor without aircraft.manage', async () => {
      await expect(archiveAircraft(pilotActor(), 'aircraft_1')).rejects.toThrow(ForbiddenError);
    });

    it('unarchiveAircraft rejects an actor without aircraft.manage', async () => {
      await expect(unarchiveAircraft(pilotActor(), 'aircraft_1')).rejects.toThrow(ForbiddenError);
    });

    it('setOutOfService rejects an actor without aircraft.manage', async () => {
      await expect(setOutOfService(pilotActor(), 'aircraft_1', { reason: 'Engine inspection' })).rejects.toThrow(ForbiddenError);
      expect(findUniqueMock).not.toHaveBeenCalled();
      expect(updateManyMock).not.toHaveBeenCalled();
    });

    it('returnToService rejects an actor without aircraft.manage', async () => {
      await expect(returnToService(pilotActor(), 'aircraft_1')).rejects.toThrow(ForbiddenError);
      expect(updateManyMock).not.toHaveBeenCalled();
    });

    it('adjustHourMeter rejects an actor without aircraft.manage', async () => {
      await expect(
        adjustHourMeter(pilotActor(), 'aircraft_1', { newMinutes: 800, reason: 'Correction' }),
      ).rejects.toThrow(ForbiddenError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('listHourMeterAdjustments rejects an actor without aircraft.manage', async () => {
      await expect(
        listHourMeterAdjustments(pilotActor(), 'aircraft_1', { page: 1, pageSize: 20 }),
      ).rejects.toThrow(ForbiddenError);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('listOutOfServiceAircraft rejects an actor without aircraft.manage', async () => {
      await expect(listOutOfServiceAircraft(pilotActor())).rejects.toThrow(ForbiddenError);
      expect(findManyMock).not.toHaveBeenCalled();
    });
  });

  describe('listAircraft', () => {
    it('returns the AD-8 paginated shape', async () => {
      transaction.mockResolvedValue([[SELECTED_AIRCRAFT], 1]);

      const result = await listAircraft(adminActor(), { page: 1, pageSize: 20, includeArchived: false });

      expect(result).toEqual({
        items: [
          {
            id: 'aircraft_1',
            registration: 'I-ABCD',
            type: 'Ultraleggero 3 assi',
            model: 'Tecnam P92 Eaglet',
            hourMeterMinutes: 750,
            notes: 'Velivolo scuola volo demo.',
            status: 'OPERATIONAL',
            statusReason: null,
            outOfServiceUntil: null,
            seats: 2,
            fuelType: 'AVGAS 100LL',
            based: true,
            archivedAt: null,
            createdAt: SELECTED_AIRCRAFT.createdAt,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('excludes archived aircraft by default (AC 2)', async () => {
      // Interactive-callback transaction (story TD-1, AC 3): opt into the
      // interactive-callback stand-in (invokes the callback with `prisma`
      // as `tx`, same as `adjustHourMeter`'s own tests already use) and mock
      // `findMany`/`count` on their OWN mocks — a `transaction.mockResolvedValue(...)`
      // override would skip invoking the callback entirely (never calling `findMany`).
      mockInteractiveTransaction();
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listAircraft(adminActor(), { page: 1, pageSize: 20, includeArchived: false });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).toMatchObject({ archivedAt: null });
    });

    it('includes archived aircraft when includeArchived is true (AC 2)', async () => {
      mockInteractiveTransaction();
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listAircraft(adminActor(), { page: 1, pageSize: 20, includeArchived: true });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).not.toHaveProperty('archivedAt');
    });

    it('searches registration and model case-insensitively (AC 1)', async () => {
      mockInteractiveTransaction();
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listAircraft(adminActor(), { page: 1, pageSize: 20, includeArchived: false, q: 'abcd' });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).toMatchObject({
        OR: [
          { registration: { contains: 'abcd', mode: 'insensitive' } },
          { model: { contains: 'abcd', mode: 'insensitive' } },
        ],
      });
    });
  });

  describe('listOutOfServiceAircraft (story 10.3, AC 1 — home dashboard widget)', () => {
    it('filters to OUT_OF_SERVICE, non-archived aircraft (unpaginated)', async () => {
      aircraftFindMany.mockResolvedValue([
        { ...SELECTED_AIRCRAFT, status: 'OUT_OF_SERVICE', statusReason: 'Engine inspection' },
      ]);

      const result = await listOutOfServiceAircraft(adminActor());

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'OUT_OF_SERVICE', archivedAt: null } }),
      );
      expect(result).toEqual([{ ...SELECTED_AIRCRAFT, status: 'OUT_OF_SERVICE', statusReason: 'Engine inspection' }]);
    });

    it('returns an empty array when nothing is out of service', async () => {
      aircraftFindMany.mockResolvedValue([]);

      const result = await listOutOfServiceAircraft(adminActor());

      expect(result).toEqual([]);
    });
  });

  describe('getAircraft', () => {
    it('throws NotFoundError for a missing id', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(getAircraft(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('returns the mapped aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      const result = await getAircraft(adminActor(), 'aircraft_1');
      expect(result.id).toBe('aircraft_1');
      expect(result.hourMeterMinutes).toBe(750);
    });
  });

  describe('createAircraft', () => {
    const input = {
      registration: 'I-ABCD',
      type: 'Ultraleggero 3 assi',
      model: 'Tecnam P92 Eaglet',
      hourMeterMinutes: 750,
      notes: 'Velivolo scuola volo demo.',
    };

    it('creates the aircraft (AC 1)', async () => {
      aircraftFindFirst.mockResolvedValue(null); // no existing conflict
      aircraftCreate.mockResolvedValue(SELECTED_AIRCRAFT);

      const result = await createAircraft(adminActor(), input);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ registration: 'I-ABCD', hourMeterMinutes: 750 }),
        }),
      );
      expect(result.id).toBe('aircraft_1');
    });

    it('throws ConflictError when the registration is already taken', async () => {
      aircraftFindFirst.mockResolvedValue({ id: 'other_aircraft' });

      await expect(createAircraft(adminActor(), input)).rejects.toThrow(ConflictError);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('maps a race-condition P2002 to ConflictError', async () => {
      aircraftFindFirst.mockResolvedValue(null);
      createMock.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

      await expect(createAircraft(adminActor(), input)).rejects.toThrow(ConflictError);
    });

    it('never stores hourMeterMinutes as anything but the integer provided (AD-2)', async () => {
      aircraftFindFirst.mockResolvedValue(null);
      aircraftCreate.mockResolvedValue({ ...SELECTED_AIRCRAFT, hourMeterMinutes: 90 });

      await createAircraft(adminActor(), { ...input, hourMeterMinutes: 90 });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ hourMeterMinutes: 90 }) }),
      );
    });

    it('persists the additive fleet fields when provided (story 12.5, AC 1)', async () => {
      aircraftFindFirst.mockResolvedValue(null);
      aircraftCreate.mockResolvedValue({ ...SELECTED_AIRCRAFT, seats: 4, fuelType: 'Jet A-1', based: false });

      await createAircraft(adminActor(), { ...input, seats: 4, fuelType: 'Jet A-1', based: false });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ seats: 4, fuelType: 'Jet A-1', based: false }) }),
      );
    });

    it('leaves based undefined (DB default true) when omitted, and seats/fuelType null (story 12.5, AC 1)', async () => {
      aircraftFindFirst.mockResolvedValue(null);
      aircraftCreate.mockResolvedValue(SELECTED_AIRCRAFT);

      await createAircraft(adminActor(), input);

      const dataArg = createMock.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(dataArg.data.seats).toBeNull();
      expect(dataArg.data.fuelType).toBeNull();
      expect(dataArg.data.based).toBeUndefined();
    });

    // Story 14.8 ("form velivolo unificato", AC 1/2): the composite create
    // path — an optional `rate` block written in the SAME transaction as
    // the aircraft.
    describe('composite create with a rate (story 14.8)', () => {
      it('creates the aircraft and its first rate in ONE transaction (AC 1/2)', async () => {
        // Review 14.8 F4: a DISTINCT tx client (instead of echoing the global
        // `prisma` back, which makes tx.* and prisma.* the SAME spy) lets this
        // test FAIL if either write ever escapes the transaction onto the
        // global client — the atomicity is asserted, not assumed.
        const txAircraftCreate = vi.fn().mockResolvedValue(SELECTED_AIRCRAFT);
        const txRateCreate = vi.fn().mockResolvedValue({});
        transaction.mockImplementation((arg: unknown) =>
          typeof arg === 'function'
            ? (arg as (tx: unknown) => unknown)({ aircraft: { create: txAircraftCreate }, aircraftRate: { create: txRateCreate } })
            : arg,
        );
        aircraftFindFirst.mockResolvedValue(null);

        const result = await createAircraft(adminActor(), {
          ...input,
          rate: { priceCentsPerHour: 16000, dryHourlyRateCents: 11500, validFrom: '2026-01-01' },
        });

        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(txAircraftCreate).toHaveBeenCalledTimes(1);
        expect(txRateCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              aircraftId: SELECTED_AIRCRAFT.id,
              priceCentsPerHour: 16000,
              dryHourlyRateCents: 11500,
              actorUserId: 'admin_1',
            }),
          }),
        );
        // The GLOBAL client must never be touched by the composite path.
        expect(aircraftCreate).not.toHaveBeenCalled();
        expect(aircraftRateCreateMock).not.toHaveBeenCalled();
        expect(result.id).toBe(SELECTED_AIRCRAFT.id);
      });

      it('never touches the transaction/rate insert when `rate` is absent (pre-14.8 shape, unchanged)', async () => {
        aircraftFindFirst.mockResolvedValue(null);
        aircraftCreate.mockResolvedValue(SELECTED_AIRCRAFT);

        await createAircraft(adminActor(), input);

        expect(transactionMock).not.toHaveBeenCalled();
        expect(aircraftRateCreateMock).not.toHaveBeenCalled();
        expect(createMock).toHaveBeenCalledTimes(1);
      });

      it('a failure inside the transaction (e.g. the rate insert) propagates — never a silently half-created aircraft (AC 2)', async () => {
        mockInteractiveTransaction();
        aircraftFindFirst.mockResolvedValue(null);
        aircraftCreate.mockResolvedValue(SELECTED_AIRCRAFT);
        aircraftRateCreateMock.mockRejectedValue(new Error('rate insert failed'));

        await expect(
          createAircraft(adminActor(), { ...input, rate: { priceCentsPerHour: 16000, validFrom: '2026-01-01' } }),
        ).rejects.toThrow('rate insert failed');
      });
    });
  });

  describe('updateAircraft', () => {
    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(updateAircraft(adminActor(), 'missing', { notes: 'x' })).rejects.toThrow(NotFoundError);
    });

    it('updates only the provided fields', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      aircraftUpdate.mockResolvedValue({ ...SELECTED_AIRCRAFT, model: 'Tecnam P2008' });

      const result = await updateAircraft(adminActor(), 'aircraft_1', { model: 'Tecnam P2008' });

      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'aircraft_1' }, data: { model: 'Tecnam P2008' } }));
      expect(result.model).toBe('Tecnam P2008');
    });

    it('never accepts hourMeterMinutes (story 2.5): the contaore changes only via a tracked adjustment', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      aircraftUpdate.mockResolvedValue(SELECTED_AIRCRAFT);

      // UpdateAircraftInput no longer has this field at the type level; cast
      // to simulate a caller (e.g. a stale client) still sending it — it must
      // be silently ignored, never forwarded to Prisma.
      await updateAircraft(adminActor(), 'aircraft_1', { notes: 'x', hourMeterMinutes: 999 } as unknown as Parameters<
        typeof updateAircraft
      >[2]);

      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { notes: 'x' } }));
    });

    it('does not check registration uniqueness when registration is not part of the patch', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      aircraftUpdate.mockResolvedValue(SELECTED_AIRCRAFT);

      await updateAircraft(adminActor(), 'aircraft_1', { notes: 'updated' });

      expect(findFirstMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError when re-using a registration already taken by another aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      aircraftFindFirst.mockResolvedValue({ id: 'someone_else' });

      await expect(
        updateAircraft(adminActor(), 'aircraft_1', { registration: 'I-TAKEN' }),
      ).rejects.toThrow(ConflictError);
    });

    it('patches only the provided additive fleet fields (story 12.5, AC 1)', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      aircraftUpdate.mockResolvedValue({ ...SELECTED_AIRCRAFT, seats: 4, based: false });

      await updateAircraft(adminActor(), 'aircraft_1', { seats: 4, based: false });

      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { seats: 4, based: false } }));
    });
  });

  describe('archiveAircraft', () => {
    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(archiveAircraft(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when already archived', async () => {
      aircraftFindUnique.mockResolvedValue({ ...SELECTED_AIRCRAFT, archivedAt: new Date('2026-02-01T00:00:00.000Z') });
      await expect(archiveAircraft(adminActor(), 'aircraft_1')).rejects.toThrow(ConflictError);
    });

    it('sets archivedAt (AC 2)', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      aircraftUpdate.mockResolvedValue({ ...SELECTED_AIRCRAFT, archivedAt: new Date('2026-02-01T00:00:00.000Z') });

      const result = await archiveAircraft(adminActor(), 'aircraft_1');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'aircraft_1' }, data: { archivedAt: expect.any(Date) } }),
      );
      expect(result.archivedAt).not.toBeNull();
    });
  });

  describe('unarchiveAircraft', () => {
    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(unarchiveAircraft(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when not archived', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      await expect(unarchiveAircraft(adminActor(), 'aircraft_1')).rejects.toThrow(ConflictError);
    });

    it('clears archivedAt', async () => {
      aircraftFindUnique.mockResolvedValue({ ...SELECTED_AIRCRAFT, archivedAt: new Date('2026-02-01T00:00:00.000Z') });
      aircraftUpdate.mockResolvedValue({ ...SELECTED_AIRCRAFT, archivedAt: null });

      const result = await unarchiveAircraft(adminActor(), 'aircraft_1');

      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { archivedAt: null } }));
      expect(result.archivedAt).toBeNull();
    });
  });

  describe('setOutOfService (story 2.5, AC 1)', () => {
    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(setOutOfService(adminActor(), 'missing', { reason: 'Engine inspection' })).rejects.toThrow(NotFoundError);
      expect(updateManyMock).not.toHaveBeenCalled();
    });

    it('sets status/statusReason via the atomic OPERATIONAL-guarded updateMany (review 2.2 F1 pattern)', async () => {
      mockInteractiveTransaction();
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue({
        ...SELECTED_AIRCRAFT,
        status: 'OUT_OF_SERVICE',
        statusReason: 'Engine inspection',
      });

      const result = await setOutOfService(adminActor(), 'aircraft_1', { reason: 'Engine inspection' });

      expect(updateManyMock).toHaveBeenCalledWith({
        where: { id: 'aircraft_1', status: 'OPERATIONAL' },
        // Story AOG-1a, invariant [b]: no date supplied -> the column is written
        // `null` EXPLICITLY, never left at whatever a previous grounding left.
        // Story AOG-1b (AD-3/AD-8): the `$transaction` wraps this call, it does
        // NOT change it — asserted EXACTLY, never relaxed to `objectContaining`
        // (lezione 14.6), because "the guard is byte-identical" IS the claim.
        data: { status: 'OUT_OF_SERVICE', statusReason: 'Engine inspection', outOfServiceUntil: null },
      });
      expect(result.aircraft.status).toBe('OUT_OF_SERVICE');
      expect(result.aircraft.statusReason).toBe('Engine inspection');
      // Story AOG-1b, AD-5: the count travels WITH the aircraft, beside it.
      expect(result.impactedBookings).toEqual({ pending: 0, approved: 0 });
    });

    it('throws ConflictError when the atomic guard matches zero rows (already out of service)', async () => {
      mockInteractiveTransaction();
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 0 });

      await expect(setOutOfService(adminActor(), 'aircraft_1', { reason: 'Engine inspection' })).rejects.toThrow(ConflictError);
      expect(findUniqueOrThrowMock).not.toHaveBeenCalled();
      // Story AOG-1b: a 409 produces NO count and NO email — nothing was written.
      expect(bookingFindManyMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    // --- story AOG-1a: the expected-return date -------------------------------

    it('writes outOfServiceUntil as a UTC-midnight calendar date, in the SAME guarded updateMany as the reason (AC 1/AC 3)', async () => {
      mockInteractiveTransaction();
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue({
        ...SELECTED_AIRCRAFT,
        status: 'OUT_OF_SERVICE',
        statusReason: 'Revisione 100h',
        outOfServiceUntil: new Date(Date.UTC(2031, 4, 12)),
      });

      const result = await setOutOfService(adminActor(), 'aircraft_1', { reason: 'Revisione 100h', outOfServiceUntil: '2031-05-12' });

      expect(updateManyMock).toHaveBeenCalledWith({
        // The atomic guard of review 2.2 F1 is BYTE-IDENTICAL — this story adds
        // one key to `data` and nothing to `where`.
        where: { id: 'aircraft_1', status: 'OPERATIONAL' },
        data: { status: 'OUT_OF_SERVICE', statusReason: 'Revisione 100h', outOfServiceUntil: new Date(Date.UTC(2031, 4, 12)) },
      });
      // Never a timestamp (review 3.5 F1): a `@db.Date` binding must carry no
      // time-of-day at all.
      const written = updateManyMock.mock.calls[0]![0].data.outOfServiceUntil as Date;
      expect(written.toISOString()).toBe('2031-05-12T00:00:00.000Z');
      // ...and the DTO hands the caller back the calendar day, not the instant.
      expect(result.aircraft.outOfServiceUntil).toBe('2031-05-12');
    });

    it('accepts a date in the PAST and still leaves the aircraft grounded — invariant [a] (AC 2a/AC 3)', async () => {
      mockInteractiveTransaction();
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue({
        ...SELECTED_AIRCRAFT,
        status: 'OUT_OF_SERVICE',
        statusReason: 'Revisione 100h',
        outOfServiceUntil: new Date(Date.UTC(2020, 0, 1)),
      });

      const result = await setOutOfService(adminActor(), 'aircraft_1', { reason: 'Revisione 100h', outOfServiceUntil: '2020-01-01' });

      // A past date is a LEGITIMATE input (no "must be in the future" rule is
      // added: the field decides nothing, so such a rule would be semantically
      // wrong) and the aircraft stays OUT_OF_SERVICE regardless.
      expect(result.aircraft.status).toBe('OUT_OF_SERVICE');
      expect(result.aircraft.outOfServiceUntil).toBe('2020-01-01');
    });

    it('listOutOfServiceAircraft still returns an aircraft whose outOfServiceUntil is in the past — invariant [a] (AC 2a)', async () => {
      aircraftFindMany.mockResolvedValue([
        { ...SELECTED_AIRCRAFT, status: 'OUT_OF_SERVICE', statusReason: 'Revisione 100h', outOfServiceUntil: new Date(Date.UTC(2020, 0, 1)) },
      ]);

      const result = await listOutOfServiceAircraft(adminActor());

      // The `where` is UNCHANGED: `status` alone decides. Nothing filters on
      // the date, so an "expired" grounding is still a grounding.
      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'OUT_OF_SERVICE', archivedAt: null } }));
      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe('OUT_OF_SERVICE');
      expect(result[0]!.outOfServiceUntil).toBe('2020-01-01');
    });

    it('getAircraft still reports a past-dated grounding as OUT_OF_SERVICE — invariant [a] (AC 2a)', async () => {
      aircraftFindUnique.mockResolvedValue({
        ...SELECTED_AIRCRAFT,
        status: 'OUT_OF_SERVICE',
        statusReason: 'Revisione 100h',
        outOfServiceUntil: new Date(Date.UTC(2020, 0, 1)),
      });

      const result = await getAircraft(adminActor(), 'aircraft_1');

      expect(result.status).toBe('OUT_OF_SERVICE');
      expect(result.outOfServiceUntil).toBe('2020-01-01');
    });
  });

  /**
   * Story AOG-1b — the count in the transaction (AC 4), the fan-out (AC 10) and
   * its best-effort contract (AC 11). `mockInteractiveTransaction` hands the
   * SAME mocked `prisma` back as `tx`, so a `booking.findMany` reached through
   * `tx` and one reached directly are the same spy — which is why the "inside
   * the transaction" claims below are asserted on ORDER, not on identity.
   */
  describe('setOutOfService — impacted-booking count and grounding email (story AOG-1b)', () => {
    function groundedFixture(overrides: Record<string, unknown> = {}) {
      return { ...SELECTED_AIRCRAFT, status: 'OUT_OF_SERVICE', statusReason: 'Revisione 100h', ...overrides };
    }

    it('recounts INSIDE the transaction, AFTER the guarded write, and returns the number beside the aircraft (AC 4)', async () => {
      const order: string[] = [];
      transaction.mockImplementation(async (arg: unknown) => {
        order.push('tx-start');
        const result = typeof arg === 'function' ? await (arg as (tx: unknown) => unknown)(prisma) : arg;
        order.push('tx-end');
        return result;
      });
      updateManyMock.mockImplementation((async () => {
        order.push('updateMany');
        return { count: 1 };
      }) as never);
      bookingFindManyMock.mockImplementation((async () => {
        order.push('booking.findMany');
        return [
          { id: 'b1', status: 'PENDING', personId: 'person_1', startsAt: new Date('2031-05-01T09:00:00.000Z') },
          { id: 'b2', status: 'APPROVED', personId: 'person_2', startsAt: new Date('2031-05-02T09:00:00.000Z') },
          { id: 'b3', status: 'APPROVED', personId: 'person_3', startsAt: new Date('2031-05-03T09:00:00.000Z') },
        ];
      }) as never);
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftFindUniqueOrThrow.mockResolvedValue(groundedFixture({ outOfServiceUntil: new Date(Date.UTC(2031, 4, 12)) }));

      const result = await setOutOfService(adminActor(), 'aircraft_1', { reason: 'Revisione 100h', outOfServiceUntil: '2031-05-12' });

      expect(result.impactedBookings).toEqual({ pending: 1, approved: 2 });
      // The count is a REPORT of the write, so it runs after it, and it runs on
      // the transaction's own connection: no TOCTOU between the two.
      expect(order).toEqual(['tx-start', 'updateMany', 'booking.findMany', 'tx-end']);
    });

    it('counts against the date it JUST WROTE, read back from the row — not against the raw input', async () => {
      mockInteractiveTransaction();
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue(groundedFixture({ outOfServiceUntil: new Date(Date.UTC(2031, 4, 12)) }));

      await setOutOfService(adminActor(), 'aircraft_1', { reason: 'Revisione 100h', outOfServiceUntil: '2031-05-12' });

      const where = bookingFindManyMock.mock.calls[0]![0]!.where as {
        aircraftId: string;
        status: { in: string[] };
        startsAt: { gte: Date; lt?: Date };
      };
      expect(where.aircraftId).toBe('aircraft_1');
      expect(where.status).toEqual({ in: ['PENDING', 'APPROVED'] });
      // 13/05/2031 00:00 Europe/Rome (CEST, UTC+2) — the INCLUSIVE end of the
      // 12th, i.e. R-AOG-a expressed as an instant.
      expect(where.startsAt.lt?.toISOString()).toBe('2031-05-12T22:00:00.000Z');
    });

    it('emails ONE holder per impacted APPROVED booking and NOTHING to a PENDING holder (AC 10)', async () => {
      mockInteractiveTransaction();
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue(groundedFixture({ outOfServiceUntil: new Date(Date.UTC(2031, 4, 12)) }));
      bookingFindMany.mockResolvedValue([
        { id: 'b1', status: 'PENDING', personId: 'person_pending', startsAt: new Date('2031-05-01T09:00:00.000Z') },
        { id: 'b2', status: 'APPROVED', personId: 'person_approved', startsAt: new Date('2031-05-02T09:00:00.000Z') },
      ]);
      personFindMany.mockResolvedValue([{ id: 'person_approved', firstName: 'Anna', email: 'anna@example.test' }]);
      userFindMany.mockResolvedValue([{ personId: 'person_approved', locale: 'en' }]);

      await setOutOfService(adminActor(), 'aircraft_1', { reason: 'Revisione 100h', outOfServiceUntil: '2031-05-12' });

      // The PENDING holder is not even LOOKED UP: the recipient set is the
      // APPROVED subset, decided by the one domain function (R-AOG-i).
      expect(personFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['person_approved'] } } }));
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledWith({ to: 'anna@example.test', subject: 'Aircraft grounded subject', text: 'Aircraft grounded text' });
      // Recipient locale is the holder's OWN `User.locale` (AD-7), and the mail
      // names the aircraft, the reason, the window and THEIR booking.
      expect(buildAircraftGroundedEmail).toHaveBeenCalledWith('en', {
        firstName: 'Anna',
        aircraftRegistration: 'I-ABCD',
        startsAt: new Date('2031-05-02T09:00:00.000Z'),
        reason: 'Revisione 100h',
        outOfServiceUntil: '2031-05-12',
      });
    });

    it('falls back to `it` with no linked User, and names the UNDELIMITED window when there is no date (invariant [b])', async () => {
      mockInteractiveTransaction();
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue(groundedFixture({ statusReason: 'Attesa pezzo', outOfServiceUntil: null }));
      bookingFindMany.mockResolvedValue([{ id: 'b1', status: 'APPROVED', personId: 'person_1', startsAt: new Date('2031-05-02T09:00:00.000Z') }]);
      personFindMany.mockResolvedValue([{ id: 'person_1', firstName: 'Bruno', email: 'bruno@example.test' }]);
      userFindMany.mockResolvedValue([]);

      await setOutOfService(adminActor(), 'aircraft_1', { reason: 'Attesa pezzo' });

      expect(buildAircraftGroundedEmail).toHaveBeenCalledWith('it', expect.objectContaining({ outOfServiceUntil: null, reason: 'Attesa pezzo' }));
      // No date => no upper bound at all in the count either.
      const where = bookingFindManyMock.mock.calls[0]![0]!.where as { startsAt: { gte: Date; lt?: Date } };
      expect(where.startsAt.lt).toBeUndefined();
    });

    it('sends ONE email per HOLDER, naming their EARLIEST impacted booking', async () => {
      mockInteractiveTransaction();
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue(groundedFixture({ outOfServiceUntil: null }));
      bookingFindMany.mockResolvedValue([
        { id: 'b1', status: 'APPROVED', personId: 'person_1', startsAt: new Date('2031-05-02T09:00:00.000Z') },
        { id: 'b2', status: 'APPROVED', personId: 'person_1', startsAt: new Date('2031-05-09T09:00:00.000Z') },
      ]);
      personFindMany.mockResolvedValue([{ id: 'person_1', firstName: 'Carla', email: 'carla@example.test' }]);
      userFindMany.mockResolvedValue([]);

      const result = await setOutOfService(adminActor(), 'aircraft_1', { reason: 'Revisione 100h' });

      // The COUNT still says two bookings — the fan-out is what dedupes.
      expect(result.impactedBookings).toEqual({ pending: 0, approved: 2 });
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(buildAircraftGroundedEmail).toHaveBeenCalledWith('it', expect.objectContaining({ startsAt: new Date('2031-05-02T09:00:00.000Z') }));
    });

    it('a holder with NO email on file is skipped in silence, and does not stop the others (AC 11)', async () => {
      mockInteractiveTransaction();
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue(groundedFixture({ outOfServiceUntil: null }));
      bookingFindMany.mockResolvedValue([
        { id: 'b1', status: 'APPROVED', personId: 'person_no_email', startsAt: new Date('2031-05-02T09:00:00.000Z') },
        { id: 'b2', status: 'APPROVED', personId: 'person_with_email', startsAt: new Date('2031-05-03T09:00:00.000Z') },
      ]);
      personFindMany.mockResolvedValue([
        { id: 'person_no_email', firstName: 'Dario', email: null },
        { id: 'person_with_email', firstName: 'Elena', email: 'elena@example.test' },
      ]);
      userFindMany.mockResolvedValue([]);

      const result = await setOutOfService(adminActor(), 'aircraft_1', { reason: 'Revisione 100h' });

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'elena@example.test' }));
      expect(result.impactedBookings).toEqual({ pending: 0, approved: 2 });
    });

    it('a MailSender that THROWS cannot fail the grounding — 200, row written, count in the response (AC 11)', async () => {
      mockInteractiveTransaction();
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue(groundedFixture({ outOfServiceUntil: null }));
      bookingFindMany.mockResolvedValue([
        { id: 'b1', status: 'APPROVED', personId: 'person_1', startsAt: new Date('2031-05-02T09:00:00.000Z') },
        { id: 'b2', status: 'APPROVED', personId: 'person_2', startsAt: new Date('2031-05-03T09:00:00.000Z') },
      ]);
      personFindMany.mockResolvedValue([
        { id: 'person_1', firstName: 'Fabio', email: 'fabio@example.test' },
        { id: 'person_2', firstName: 'Gina', email: 'gina@example.test' },
      ]);
      userFindMany.mockResolvedValue([]);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      sendMock.mockRejectedValueOnce(new Error('SMTP down'));

      const result = await setOutOfService(adminActor(), 'aircraft_1', { reason: 'Revisione 100h' });

      expect(result.aircraft.status).toBe('OUT_OF_SERVICE');
      expect(result.impactedBookings).toEqual({ pending: 0, approved: 2 });
      expect(updateManyMock).toHaveBeenCalledTimes(1);
      // ...and the SECOND recipient still got their mail: one bad address does
      // not swallow the rest of the fan-out.
      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('sends AFTER the transaction has closed, never inside it (AC 11)', async () => {
      const order: string[] = [];
      transaction.mockImplementation(async (arg: unknown) => {
        order.push('tx-start');
        const result = typeof arg === 'function' ? await (arg as (tx: unknown) => unknown)(prisma) : arg;
        order.push('tx-end');
        return result;
      });
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue(groundedFixture({ outOfServiceUntil: null }));
      bookingFindMany.mockResolvedValue([{ id: 'b1', status: 'APPROVED', personId: 'person_1', startsAt: new Date('2031-05-02T09:00:00.000Z') }]);
      personFindMany.mockResolvedValue([{ id: 'person_1', firstName: 'Hugo', email: 'hugo@example.test' }]);
      userFindMany.mockResolvedValue([]);
      sendMock.mockImplementation(async () => {
        order.push('send');
      });

      await setOutOfService(adminActor(), 'aircraft_1', { reason: 'Revisione 100h' });

      expect(order).toEqual(['tx-start', 'tx-end', 'send']);
    });
  });

  describe('previewOutOfServiceImpact (story AOG-1b, AC 2 — the estimate before the act)', () => {
    it('rejects an actor without aircraft.manage, before any query', async () => {
      await expect(previewOutOfServiceImpact(pilotActor(), 'aircraft_1', {})).rejects.toThrow(ForbiddenError);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(previewOutOfServiceImpact(adminActor(), 'missing', {})).rejects.toThrow(NotFoundError);
      expect(bookingFindManyMock).not.toHaveBeenCalled();
    });

    it('runs the SAME domain function against the CANDIDATE date and answers counts only', async () => {
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      bookingFindMany.mockResolvedValue([
        { id: 'b1', status: 'PENDING', personId: 'person_1', startsAt: new Date('2031-05-01T09:00:00.000Z') },
        { id: 'b2', status: 'APPROVED', personId: 'person_2', startsAt: new Date('2031-05-02T09:00:00.000Z') },
      ]);

      const impact = await previewOutOfServiceImpact(adminActor(), 'aircraft_1', { until: '2031-05-12' });

      // Counts ONLY: the recipient list never leaves the service.
      expect(impact).toEqual({ pending: 1, approved: 1 });
      const where = bookingFindManyMock.mock.calls[0]![0]!.where as { startsAt: { lt?: Date } };
      expect(where.startsAt.lt?.toISOString()).toBe('2031-05-12T22:00:00.000Z');
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('with NO candidate date the window is not delimited (invariant [b])', async () => {
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      bookingFindMany.mockResolvedValue([]);

      await previewOutOfServiceImpact(adminActor(), 'aircraft_1', {});

      const where = bookingFindManyMock.mock.calls[0]![0]!.where as { startsAt: { gte: Date; lt?: Date } };
      expect(where.startsAt.lt).toBeUndefined();
    });
  });

  describe('returnToService (story 2.5, AC 1)', () => {
    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(returnToService(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
      expect(updateManyMock).not.toHaveBeenCalled();
    });

    it('clears statusReason via the atomic OUT_OF_SERVICE-guarded updateMany', async () => {
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue({ ...SELECTED_AIRCRAFT, status: 'OPERATIONAL', statusReason: null });

      const result = await returnToService(adminActor(), 'aircraft_1');

      expect(updateManyMock).toHaveBeenCalledWith({
        where: { id: 'aircraft_1', status: 'OUT_OF_SERVICE' },
        // Story AOG-1a, AC 3: the date is cleared in the SAME statement as the
        // reason — asserted EXACTLY (never relaxed to `objectContaining`,
        // lezione 14.6), because "both keys, one statement" IS the invariant.
        data: { status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null },
      });
      expect(result.status).toBe('OPERATIONAL');
      expect(result.statusReason).toBeNull();
    });

    it('throws ConflictError when the atomic guard matches zero rows (already operational)', async () => {
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 0 });

      await expect(returnToService(adminActor(), 'aircraft_1')).rejects.toThrow(ConflictError);
    });

    it('sends NO email and counts NOTHING (story AOG-1b, R-AOG-i: the return to service is silent)', async () => {
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      aircraftUpdateMany.mockResolvedValue({ count: 1 });
      aircraftFindUniqueOrThrow.mockResolvedValue({ ...SELECTED_AIRCRAFT, status: 'OPERATIONAL', statusReason: null });

      await returnToService(adminActor(), 'aircraft_1');

      expect(sendMock).not.toHaveBeenCalled();
      expect(buildAircraftGroundedEmail).not.toHaveBeenCalled();
      expect(bookingFindManyMock).not.toHaveBeenCalled();
    });
  });

  describe('adjustHourMeter (story 2.5, AC 2)', () => {
    it('throws NotFoundError for a missing aircraft, inside the same transaction', async () => {
      mockInteractiveTransaction();
      queryRaw.mockResolvedValue([]);

      await expect(adjustHourMeter(adminActor(), 'missing', { newMinutes: 800, reason: 'Correction' })).rejects.toThrow(
        NotFoundError,
      );
      expect(hourMeterAdjustmentCreateMock).not.toHaveBeenCalled();
    });

    it('creates the adjustment (previous = row-locked current value, actorUserId = actor.userId) and updates the aircraft, in one transaction', async () => {
      mockInteractiveTransaction();
      queryRaw.mockResolvedValue([{ hourMeterMinutes: 750 }]);
      hourMeterAdjustmentCreate.mockResolvedValue({});
      aircraftUpdate.mockResolvedValue({ ...SELECTED_AIRCRAFT, hourMeterMinutes: 800 });

      const result = await adjustHourMeter(adminActor(), 'aircraft_1', { newMinutes: 800, reason: 'Correction' });

      expect(hourMeterAdjustmentCreateMock).toHaveBeenCalledWith({
        data: {
          aircraftId: 'aircraft_1',
          actorUserId: 'admin_1',
          previousMinutes: 750,
          newMinutes: 800,
          reason: 'Correction',
        },
      });
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'aircraft_1' }, data: { hourMeterMinutes: 800 } }),
      );
      expect(result.hourMeterMinutes).toBe(800);
    });

    it('allows a negative delta (a correction can go either direction)', async () => {
      mockInteractiveTransaction();
      queryRaw.mockResolvedValue([{ hourMeterMinutes: 750 }]);
      hourMeterAdjustmentCreate.mockResolvedValue({});
      aircraftUpdate.mockResolvedValue({ ...SELECTED_AIRCRAFT, hourMeterMinutes: 600 });

      await adjustHourMeter(adminActor(), 'aircraft_1', { newMinutes: 600, reason: 'Reset after gauge swap' });

      expect(hourMeterAdjustmentCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ previousMinutes: 750, newMinutes: 600 }) }),
      );
    });
  });

  describe('listHourMeterAdjustments (story 2.5, AC 2)', () => {
    const ADJUSTMENT = {
      id: 'adj_1',
      aircraftId: 'aircraft_1',
      actorUserId: 'staff_1',
      actorUser: { email: 'staff@airmanager.local' },
      previousMinutes: 750,
      newMinutes: 800,
      reason: 'Correction',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    };

    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(listHourMeterAdjustments(adminActor(), 'missing', { page: 1, pageSize: 20 })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('returns the AD-8 paginated shape, most recent first, with the joined actor email', async () => {
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1' });
      // Interactive-callback transaction (story TD-1, AC 3): same
      // `mockInteractiveTransaction()` stand-in `adjustHourMeter`'s own
      // tests already use — invokes the callback with `prisma` as `tx`, so
      // the underlying delegate mocks below must resolve directly (a
      // `transaction.mockResolvedValue(...)` override would skip invoking
      // the callback, so `hourMeterAdjustmentFindManyMock` would never be
      // called).
      mockInteractiveTransaction();
      hourMeterAdjustmentFindManyMock.mockResolvedValue([ADJUSTMENT]);
      hourMeterAdjustmentCountMock.mockResolvedValue(1);

      const result = await listHourMeterAdjustments(adminActor(), 'aircraft_1', { page: 1, pageSize: 20 });

      expect(result).toEqual({
        items: [
          {
            id: 'adj_1',
            aircraftId: 'aircraft_1',
            actorUserId: 'staff_1',
            actorEmail: 'staff@airmanager.local',
            previousMinutes: 750,
            newMinutes: 800,
            reason: 'Correction',
            createdAt: ADJUSTMENT.createdAt,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
      expect(hourMeterAdjustmentFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { aircraftId: 'aircraft_1' }, orderBy: [{ createdAt: 'desc' }] }),
      );
    });
  });
  describe('sumFlightMinutesByAircraft (story 15.5 — the fleet card hours bar)', () => {
    it('rejects an actor without aircraft.manage', async () => {
      await expect(sumFlightMinutesByAircraft(pilotActor(), ['aircraft_1'], new Date(Date.UTC(2026, 7, 1)), new Date(Date.UTC(2026, 7, 31)))).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('never queries when the page has no aircraft (an empty `in ()` is a wasted round-trip)', async () => {
      const result = await sumFlightMinutesByAircraft(adminActor(), [], new Date(Date.UTC(2026, 7, 1)), new Date(Date.UTC(2026, 7, 31)));

      expect(result.size).toBe(0);
      expect(flightGroupByMock).not.toHaveBeenCalled();
    });

    it('sums REGISTERED minutes only, inside the given date-only window, batched over the page ids', async () => {
      flightGroupByMock.mockResolvedValue([
        { aircraftId: 'aircraft_1', _sum: { minutes: 320 } },
        { aircraftId: 'aircraft_2', _sum: { minutes: null } },
      ] as never);

      const from = new Date(Date.UTC(2026, 7, 1));
      const to = new Date(Date.UTC(2026, 7, 31));
      const result = await sumFlightMinutesByAircraft(adminActor(), ['aircraft_1', 'aircraft_2', 'aircraft_3'], from, to);

      expect(flightGroupByMock).toHaveBeenCalledWith({
        by: ['aircraftId'],
        where: { aircraftId: { in: ['aircraft_1', 'aircraft_2', 'aircraft_3'] }, status: 'REGISTERED', flightDate: { gte: from, lte: to } },
        _sum: { minutes: true },
      });
      expect(result.get('aircraft_1')).toBe(320);
      // A group with a null sum is still a group — it must read as 0, not undefined.
      expect(result.get('aircraft_2')).toBe(0);
      // An aircraft that did not fly is simply absent (callers read `?? 0`).
      expect(result.has('aircraft_3')).toBe(false);
    });
  });
});
