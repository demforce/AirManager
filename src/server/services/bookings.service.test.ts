import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarBookingsQuerySchema, createBookingSchema, listBookingsQuerySchema, updateBookingSchema } from '@/lib/schemas/bookings';
import type { Actor } from '@/server/auth/rbac';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    instructorProfile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    aircraft: {
      findMany: vi.fn(),
    },
    booking: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

const { prisma } = await import('@/server/db/prisma');
const {
  createBooking,
  listBookings,
  listCalendarBookings,
  updateBooking,
  cancelBooking,
  listBookableAircraft,
  listBookableStudents,
  listActiveInstructors,
  getOwnInstructorProfileId,
} = await import('./bookings.service');
const { ForbiddenError, NotFoundError, ConflictError, ValidationError } = await import('./errors');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const personFindManyMock = vi.mocked(prisma.person.findMany);
const instructorProfileFindUniqueMock = vi.mocked(prisma.instructorProfile.findUnique);
const instructorProfileFindManyMock = vi.mocked(prisma.instructorProfile.findMany);
const aircraftFindManyMock = vi.mocked(prisma.aircraft.findMany);
const bookingCreateMock = vi.mocked(prisma.booking.create);
const bookingFindFirstMock = vi.mocked(prisma.booking.findFirst);
const bookingFindManyMock = vi.mocked(prisma.booking.findMany);
const bookingFindUniqueMock = vi.mocked(prisma.booking.findUnique);
const bookingFindUniqueOrThrowMock = vi.mocked(prisma.booking.findUniqueOrThrow);
const bookingCountMock = vi.mocked(prisma.booking.count);
const bookingUpdateManyMock = vi.mocked(prisma.booking.updateMany);
const transactionMock = vi.mocked(prisma.$transaction);
const queryRawMock = vi.mocked(prisma.$queryRaw);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as every other `*.service.test.ts`).
type Fixture = Record<string, unknown> | null;
const personFindUnique = personFindUniqueMock as unknown as {
  mockImplementation: (fn: (args: { where: { id: string } }) => Promise<Fixture>) => void;
  mockResolvedValue: (v: Fixture) => void;
};
const bookingCreate = bookingCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const bookingFindFirst = bookingFindFirstMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const bookingFindMany = bookingFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const bookingFindUnique = bookingFindUniqueMock as unknown as {
  mockResolvedValue: (v: Fixture) => void;
  mockImplementation: (fn: (args: { where: { id: string } }) => Promise<Fixture>) => void;
};
const bookingFindUniqueOrThrow = bookingFindUniqueOrThrowMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const bookingCount = bookingCountMock as unknown as { mockResolvedValue: (v: number) => void };
const bookingUpdateMany = bookingUpdateManyMock as unknown as { mockResolvedValue: (v: { count: number }) => void };
const instructorProfileFindUnique = instructorProfileFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const queryRaw = queryRawMock as unknown as { mockResolvedValue: (v: unknown[]) => void };
const aircraftFindMany = aircraftFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const personFindMany = personFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const instructorProfileFindMany = instructorProfileFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };

/** Same batch/interactive `$transaction` stand-in as `flights.service.test.ts`. */
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };
function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
}

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function pilotActor(personId: string | null = 'person_pilot'): Actor {
  return { userId: 'pilot_1', personId, roles: ['PILOT'] };
}

function instructorActor(personId: string | null = 'person_instructor'): Actor {
  return { userId: 'instructor_1', personId, roles: ['INSTRUCTOR'] };
}

function studentActor(): Actor {
  return { userId: 'student_1', personId: 'person_student', roles: ['STUDENT'] };
}

/** Safely far in the future no matter when this suite runs (same convention as the e2e specs' `PAST_DATE`, inverted). */
const FUTURE_STARTS_AT = '2099-06-01T10:00:00.000Z';
const FUTURE_ENDS_AT = '2099-06-01T11:00:00.000Z';
const PAST_STARTS_AT = '2020-01-01T10:00:00.000Z';
const PAST_ENDS_AT = '2020-01-01T11:00:00.000Z';

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    aircraftId: 'aircraft_1',
    personId: 'person_pilot',
    startsAt: FUTURE_STARTS_AT,
    endsAt: FUTURE_ENDS_AT,
    ...overrides,
  };
}

const ACTIVE_PILOT_PERSON = {
  id: 'person_pilot',
  archivedAt: null,
  pilotProfile: { deactivatedAt: null },
  studentProfile: null,
  instructorProfile: null,
};

const DEACTIVATED_PILOT_PERSON = {
  id: 'person_pilot',
  archivedAt: null,
  pilotProfile: { deactivatedAt: new Date('2025-01-01T00:00:00.000Z') },
  studentProfile: null,
  instructorProfile: null,
};

const ACTIVE_STUDENT_PERSON = {
  id: 'person_student',
  archivedAt: null,
  pilotProfile: null,
  studentProfile: { deactivatedAt: null },
  instructorProfile: null,
};

const NO_PROFILE_PERSON = {
  id: 'person_other',
  archivedAt: null,
  pilotProfile: null,
  studentProfile: null,
  instructorProfile: null,
};

const ACTIVE_INSTRUCTOR_ACTOR_PERSON = {
  instructorProfile: { id: 'instr_profile_1', deactivatedAt: null },
};

const LOCKED_OPERATIONAL_AIRCRAFT = [{ id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, archivedAt: null }];

const CREATED_BOOKING_ROW = {
  id: 'booking_1',
  aircraftId: 'aircraft_1',
  aircraft: { registration: 'I-ABCD' },
  personId: 'person_pilot',
  person: { firstName: 'Mario', lastName: 'Rossi' },
  instructorProfileId: null as string | null,
  instructorProfile: null as { person: { firstName: string; lastName: string } } | null,
  startsAt: new Date(FUTURE_STARTS_AT),
  endsAt: new Date(FUTURE_ENDS_AT),
  notes: null,
  // Story 7.3: `BOOKING_SELECT` now includes `status`/`cancelledAt` — every
  // fixture that stands in for a `booking.create`/`findMany` row needs them.
  status: 'ACTIVE' as 'ACTIVE' | 'CANCELLED',
  cancelledAt: null as Date | null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction();
  queryRaw.mockResolvedValue(LOCKED_OPERATIONAL_AIRCRAFT);
  bookingFindFirst.mockResolvedValue(null);
  bookingCreate.mockResolvedValue(CREATED_BOOKING_ROW);
  // Story 7.3: `updateBooking`/`cancelBooking`'s atomic guard+write default to
  // "succeeded, one row" — individual race/already-cancelled tests override.
  bookingUpdateMany.mockResolvedValue({ count: 1 });
  bookingFindUniqueOrThrow.mockResolvedValue(CREATED_BOOKING_ROW);
});

describe('createBooking (Story 7.1, AC 1/2/3)', () => {
  // --- Permission matrix ------------------------------------------------

  it('a student (no bookings.manage.own) gets 403 straight from authorize() — no queries at all', async () => {
    await expect(createBooking(studentActor(), baseInput())).rejects.toThrow(ForbiddenError);
    expect(personFindUniqueMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('a pilot booking for themself succeeds', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_PILOT_PERSON);

    const result = await createBooking(pilotActor('person_pilot'), baseInput({ personId: 'person_pilot' }));

    expect(result.id).toBe('booking_1');
    expect(bookingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ personId: 'person_pilot', instructorProfileId: null, actorUserId: 'pilot_1' }) }),
    );
  });

  it('a pilot booking for someone else gets 403 WITHOUT ever querying the target person (403-before-target-query)', async () => {
    personFindUnique.mockImplementation(async (args) => (args.where.id === 'person_pilot' ? { instructorProfile: null } : NO_PROFILE_PERSON));

    await expect(createBooking(pilotActor('person_pilot'), baseInput({ personId: 'person_someone_else' }))).rejects.toThrow(ForbiddenError);

    expect(personFindUniqueMock).toHaveBeenCalledTimes(1);
    expect(personFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'person_pilot' } }));
  });

  it('a pilot with a deactivated pilot profile (and no instructor profile) gets 403 booking for themself', async () => {
    personFindUnique.mockImplementation(async () => DEACTIVATED_PILOT_PERSON);

    await expect(createBooking(pilotActor('person_pilot'), baseInput({ personId: 'person_pilot' }))).rejects.toThrow(ForbiddenError);
  });

  it('an instructor booking for themself succeeds (no instructorProfileId on a self-booking)', async () => {
    const activeInstructorSelf = { id: 'person_instructor', archivedAt: null, pilotProfile: null, studentProfile: null, instructorProfile: { deactivatedAt: null } };
    personFindUnique.mockImplementation(async () => activeInstructorSelf);

    const result = await createBooking(instructorActor('person_instructor'), baseInput({ personId: 'person_instructor' }));

    expect(result.id).toBe('booking_1');
    expect(bookingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ personId: 'person_instructor', instructorProfileId: null }) }),
    );
  });

  it('an instructor booking for an active allievo, indicating their own instructorProfileId, succeeds', async () => {
    personFindUnique.mockImplementation(async (args) =>
      args.where.id === 'person_instructor' ? ACTIVE_INSTRUCTOR_ACTOR_PERSON : ACTIVE_STUDENT_PERSON,
    );

    const result = await createBooking(
      instructorActor('person_instructor'),
      baseInput({ personId: 'person_student', instructorProfileId: 'instr_profile_1' }),
    );

    expect(result.id).toBe('booking_1');
    expect(bookingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ personId: 'person_student', instructorProfileId: 'instr_profile_1' }),
      }),
    );
  });

  it('an instructor indicating an instructorProfileId that is NOT their own gets 403', async () => {
    personFindUnique.mockImplementation(async (args) =>
      args.where.id === 'person_instructor' ? ACTIVE_INSTRUCTOR_ACTOR_PERSON : ACTIVE_STUDENT_PERSON,
    );

    await expect(
      createBooking(instructorActor('person_instructor'), baseInput({ personId: 'person_student', instructorProfileId: 'someone_elses_profile' })),
    ).rejects.toThrow(ForbiddenError);
  });

  it('an instructor with NO instructorProfileId in the body, booking for someone else, gets 403', async () => {
    personFindUnique.mockImplementation(async (args) => (args.where.id === 'person_instructor' ? ACTIVE_INSTRUCTOR_ACTOR_PERSON : ACTIVE_STUDENT_PERSON));

    await expect(createBooking(instructorActor('person_instructor'), baseInput({ personId: 'person_student' }))).rejects.toThrow(ForbiddenError);
  });

  it('an instructor without an active own instructor profile gets 403 booking for someone else, before any target query', async () => {
    personFindUnique.mockImplementation(async (args) =>
      args.where.id === 'person_instructor' ? { instructorProfile: { id: 'x', deactivatedAt: new Date() } } : ACTIVE_STUDENT_PERSON,
    );

    await expect(
      createBooking(instructorActor('person_instructor'), baseInput({ personId: 'person_student', instructorProfileId: 'x' })),
    ).rejects.toThrow(ForbiddenError);
    expect(personFindUniqueMock).toHaveBeenCalledTimes(1);
  });

  it('an instructor booking for a person WITHOUT an active student profile gets 422 PERSON_NOT_BOOKABLE', async () => {
    personFindUnique.mockImplementation(async (args) => (args.where.id === 'person_instructor' ? ACTIVE_INSTRUCTOR_ACTOR_PERSON : NO_PROFILE_PERSON));

    const error = await createBooking(
      instructorActor('person_instructor'),
      baseInput({ personId: 'person_other', instructorProfileId: 'instr_profile_1' }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('PERSON_NOT_BOOKABLE');
  });

  it('staff books for anyone (any active profile), no instructor indicated', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);

    const result = await createBooking(staffActor(), baseInput({ personId: 'person_student' }));

    expect(result.id).toBe('booking_1');
    expect(bookingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ personId: 'person_student', instructorProfileId: null, actorUserId: 'staff_1' }) }),
    );
  });

  it('staff books for someone with an instructor indicated (any active instructor)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    instructorProfileFindUnique.mockResolvedValue({ id: 'instr_profile_9', deactivatedAt: null });

    const result = await createBooking(staffActor(), baseInput({ personId: 'person_student', instructorProfileId: 'instr_profile_9' }));

    expect(result.id).toBe('booking_1');
    expect(bookingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ instructorProfileId: 'instr_profile_9' }) }),
    );
  });

  it('staff with a person having no bookable profile at all gets 422 PERSON_NOT_BOOKABLE', async () => {
    personFindUnique.mockImplementation(async () => NO_PROFILE_PERSON);

    const error = await createBooking(staffActor(), baseInput({ personId: 'person_other' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('PERSON_NOT_BOOKABLE');
  });

  it('an actor with no linked personId in the own-path gets 403 (self or otherwise)', async () => {
    await expect(createBooking(pilotActor(null), baseInput({ personId: 'person_pilot' }))).rejects.toThrow(ForbiddenError);
    expect(personFindUniqueMock).not.toHaveBeenCalled();
  });

  it('a self-booking WITH an instructorProfileId in the body is rejected (422) — staff creates those', async () => {
    await expect(
      createBooking(pilotActor('person_pilot'), baseInput({ personId: 'person_pilot', instructorProfileId: 'instr_profile_1' })),
    ).rejects.toThrow(ValidationError);
    expect(personFindUniqueMock).not.toHaveBeenCalled();
  });

  // --- Existence/state ordering ------------------------------------------

  it('an unknown person answers 404', async () => {
    personFindUnique.mockImplementation(async () => null);

    await expect(createBooking(staffActor(), baseInput({ personId: 'ghost' }))).rejects.toThrow(NotFoundError);
  });

  it('an archived person answers 409', async () => {
    personFindUnique.mockImplementation(async () => ({ ...ACTIVE_PILOT_PERSON, archivedAt: new Date('2025-01-01T00:00:00.000Z') }));

    await expect(createBooking(staffActor(), baseInput({ personId: 'person_pilot' }))).rejects.toThrow(ConflictError);
  });

  it('an unknown aircraft (empty lock result) answers 404', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    queryRaw.mockResolvedValue([]);

    await expect(createBooking(staffActor(), baseInput({ personId: 'person_student' }))).rejects.toThrow(NotFoundError);
  });

  it('an archived aircraft answers 409', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    queryRaw.mockResolvedValue([{ id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, archivedAt: new Date('2025-01-01T00:00:00.000Z') }]);

    await expect(createBooking(staffActor(), baseInput({ personId: 'person_student' }))).rejects.toThrow(ConflictError);
  });

  it('an out-of-service aircraft answers 422 AIRCRAFT_OUT_OF_SERVICE with the reason in BOTH details and the message', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    queryRaw.mockResolvedValue([{ id: 'aircraft_1', status: 'OUT_OF_SERVICE', statusReason: 'Revisione motore', archivedAt: null }]);

    const error = await createBooking(staffActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    const validationError = error as InstanceType<typeof ValidationError>;
    expect(validationError.code).toBe('AIRCRAFT_OUT_OF_SERVICE');
    expect(validationError.message).toContain('Revisione motore');
    expect(validationError.details).toEqual({ reason: 'Revisione motore' });
  });

  it('startsAt not in the future answers 422 BOOKING_IN_PAST — checked BEFORE the transaction ever opens', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);

    const error = await createBooking(
      staffActor(),
      baseInput({ personId: 'person_student', startsAt: PAST_STARTS_AT, endsAt: PAST_ENDS_AT }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_IN_PAST');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  // --- Concurrency (AC 2) -------------------------------------------------

  it('an overlapping interval answers 409, and the aircraft lock ($queryRaw) runs BEFORE the overlap pre-check (findFirst)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    bookingFindFirst.mockResolvedValue({ id: 'existing_booking' });

    await expect(createBooking(staffActor(), baseInput({ personId: 'person_student' }))).rejects.toThrow(ConflictError);

    expect(queryRawMock).toHaveBeenCalled();
    expect(bookingFindFirstMock).toHaveBeenCalled();
    const lockOrder = queryRawMock.mock.invocationCallOrder[0]!;
    const overlapOrder = bookingFindFirstMock.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(overlapOrder);
  });

  it('the overlap pre-check uses the semi-open interval semantics (startsAt < endsAt AND endsAt > startsAt on the same aircraft)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);

    await createBooking(staffActor(), baseInput({ personId: 'person_student' }));

    expect(bookingFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          aircraftId: 'aircraft_1',
          status: 'ACTIVE',
          startsAt: { lt: new Date(FUTURE_ENDS_AT) },
          endsAt: { gt: new Date(FUTURE_STARTS_AT) },
        },
      }),
    );
  });

  it('creates with the actor userId as actorUserId', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_PILOT_PERSON);

    await createBooking(pilotActor('person_pilot'), baseInput({ personId: 'person_pilot' }));

    expect(bookingCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: 'pilot_1' }) }));
  });
});

describe('listBookings (Story 7.1, AC 1, FR-19)', () => {
  it('any authenticated role (self.read) can list — a student succeeds', async () => {
    bookingFindMany.mockResolvedValue([CREATED_BOOKING_ROW]);
    bookingCount.mockResolvedValue(1);

    const result = await listBookings(studentActor(), { page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe('booking_1');
  });

  it('applies the semi-open from/to filters (endsAt > from, startsAt < to)', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(staffActor(), { page: 1, pageSize: 20, from: '2026-08-01T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z' });

    expect(bookingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          endsAt: { gt: new Date('2026-08-01T00:00:00.000Z') },
          startsAt: { lt: new Date('2026-08-02T00:00:00.000Z') },
        },
      }),
    );
  });

  it('applies aircraftId/personId exact-match filters', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(staffActor(), { page: 1, pageSize: 20, aircraftId: 'aircraft_9', personId: 'person_9' });

    expect(bookingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE', aircraftId: 'aircraft_9', personId: 'person_9' } }),
    );
  });

  it('excludes CANCELLED bookings (story 7.3: a cancelled booking frees its slot and disappears from the list)', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(staffActor(), { page: 1, pageSize: 20 });

    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }));
  });

  it('orders by startsAt asc, id asc', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(staffActor(), { page: 1, pageSize: 20 });

    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] }));
  });

  it('paginates (skip/take derived from page/pageSize)', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(staffActor(), { page: 2, pageSize: 10 });

    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
  });

  it('the DTO composes personName/instructorName from firstName+lastName', async () => {
    bookingFindMany.mockResolvedValue([
      {
        ...CREATED_BOOKING_ROW,
        instructorProfileId: 'instr_profile_1',
        instructorProfile: { person: { firstName: 'Livia', lastName: 'Bernasconi' } },
      },
    ]);
    bookingCount.mockResolvedValue(1);

    const result = await listBookings(staffActor(), { page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({
      personName: 'Mario Rossi',
      instructorName: 'Livia Bernasconi',
      aircraftRegistration: 'I-ABCD',
    });
  });

  it('instructorName is null when no instructor is on the booking', async () => {
    bookingFindMany.mockResolvedValue([CREATED_BOOKING_ROW]);
    bookingCount.mockResolvedValue(1);

    const result = await listBookings(staffActor(), { page: 1, pageSize: 20 });

    expect(result.items[0]?.instructorName).toBeNull();
  });
});

describe('listCalendarBookings (Story 7.2, Task 2, AC 1)', () => {
  const FROM = '2026-08-03T00:00:00.000Z';
  const TO = '2026-08-04T00:00:00.000Z';

  it('any authenticated role (self.read) can list — a student succeeds', async () => {
    bookingFindMany.mockResolvedValue([CREATED_BOOKING_ROW]);

    const result = await listCalendarBookings(studentActor(), { from: FROM, to: TO });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('booking_1');
  });

  it('rejects to <= from with a 422 (equal instants)', async () => {
    const error = await listCalendarBookings(staffActor(), { from: FROM, to: FROM }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(bookingFindManyMock).not.toHaveBeenCalled();
  });

  it('rejects to < from with a 422', async () => {
    const error = await listCalendarBookings(staffActor(), { from: TO, to: FROM }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('rejects a range wider than 8 days with 422 RANGE_TOO_WIDE', async () => {
    const error = await listCalendarBookings(staffActor(), { from: '2026-08-01T00:00:00.000Z', to: '2026-08-10T00:00:01.000Z' }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('RANGE_TOO_WIDE');
    expect(bookingFindManyMock).not.toHaveBeenCalled();
  });

  it('accepts an EXACT 8-day range (boundary, not RANGE_TOO_WIDE)', async () => {
    bookingFindMany.mockResolvedValue([]);
    await expect(
      listCalendarBookings(staffActor(), { from: '2026-08-01T00:00:00.000Z', to: '2026-08-09T00:00:00.000Z' }),
    ).resolves.toEqual([]);
  });

  it('uses the semi-open overlap predicate (startsAt < to AND endsAt > from)', async () => {
    bookingFindMany.mockResolvedValue([]);

    await listCalendarBookings(staffActor(), { from: FROM, to: TO });

    expect(bookingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', startsAt: { lt: new Date(TO) }, endsAt: { gt: new Date(FROM) } },
      }),
    );
  });

  it('excludes CANCELLED bookings (story 7.3: a cancelled booking frees its slot and disappears from the calendar)', async () => {
    bookingFindMany.mockResolvedValue([]);

    await listCalendarBookings(staffActor(), { from: FROM, to: TO });

    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }));
  });

  it('a booking that ENDS exactly at `from` is EXCLUDED (semi-open)', async () => {
    // `findMany` is mocked directly (not filtered in-memory), so this
    // documents/asserts the WHERE clause sent to Prisma is exactly the
    // semi-open predicate that would exclude such a row — the DB, not this
    // test, performs the actual filtering (same convention as
    // `listBookings`'s equivalent assertion above).
    bookingFindMany.mockResolvedValue([]);
    await listCalendarBookings(staffActor(), { from: FROM, to: TO });
    const where = bookingFindManyMock.mock.calls[0]?.[0]?.where as { endsAt: { gt: Date } };
    expect(new Date(FROM).getTime()).not.toBeGreaterThan(where.endsAt.gt.getTime());
  });

  it('orders by startsAt asc, id asc, with a take: 1000 safety bound (not pagination)', async () => {
    bookingFindMany.mockResolvedValue([]);

    await listCalendarBookings(staffActor(), { from: FROM, to: TO });

    expect(bookingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], take: 1000 }),
    );
    // No `skip`/pagination args at all (Contesto: "un calendario non si pagina").
    expect(bookingFindManyMock.mock.calls[0]?.[0]).not.toHaveProperty('skip');
  });

  it('reuses BOOKING_SELECT/toListItem — the DTO composes personName/instructorName', async () => {
    bookingFindMany.mockResolvedValue([
      { ...CREATED_BOOKING_ROW, instructorProfileId: 'instr_profile_1', instructorProfile: { person: { firstName: 'Livia', lastName: 'Bernasconi' } } },
    ]);

    const result = await listCalendarBookings(staffActor(), { from: FROM, to: TO });

    expect(result[0]).toMatchObject({ personName: 'Mario Rossi', instructorName: 'Livia Bernasconi', aircraftRegistration: 'I-ABCD' });
  });
});

// --- Booking edit/cancel (Story 7.3, AC 1/2) --------------------------------

const EXISTING_OWN_BOOKING = {
  id: 'booking_1',
  personId: 'person_pilot',
  instructorProfileId: null as string | null,
  aircraftId: 'aircraft_1',
  startsAt: new Date(FUTURE_STARTS_AT),
  endsAt: new Date(FUTURE_ENDS_AT),
  notes: null as string | null,
  status: 'ACTIVE' as 'ACTIVE' | 'CANCELLED',
};

describe('updateBooking (Story 7.3, AC 1/2)', () => {
  it('a student (no bookings.manage.own) gets 403 straight from authorize() — no queries at all', async () => {
    await expect(updateBooking(studentActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(ForbiddenError);
    expect(bookingFindUniqueMock).not.toHaveBeenCalled();
  });

  it('an unknown booking id answers 404', async () => {
    bookingFindUnique.mockResolvedValue(null);

    await expect(updateBooking(staffActor(), 'ghost', { notes: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('an already-cancelled booking answers 409 from the fast pre-check (before own/temporal checks)', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, status: 'CANCELLED' });

    await expect(updateBooking(pilotActor('person_pilot'), 'booking_1', { notes: 'x' })).rejects.toThrow(ConflictError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('a pilot editing their own future booking succeeds, with updatedByUserId set to the actor', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    const result = await updateBooking(pilotActor('person_pilot'), 'booking_1', { notes: 'Updated note' });

    expect(result.id).toBe('booking_1');
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: 'ACTIVE' },
      data: {
        aircraftId: 'aircraft_1',
        startsAt: new Date(FUTURE_STARTS_AT),
        endsAt: new Date(FUTURE_ENDS_AT),
        notes: 'Updated note',
        updatedByUserId: 'pilot_1',
      },
    });
  });

  it('a pilot editing someone else\'s booking gets 403', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, personId: 'someone_else' });

    await expect(updateBooking(pilotActor('person_pilot'), 'booking_1', { notes: 'x' })).rejects.toThrow(ForbiddenError);
  });

  it('a pilot editing their own ALREADY-STARTED booking gets 422 BOOKING_ALREADY_STARTED', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, startsAt: new Date(PAST_STARTS_AT), endsAt: new Date(PAST_ENDS_AT) });

    const error = await updateBooking(pilotActor('person_pilot'), 'booking_1', { notes: 'x' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_ALREADY_STARTED');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('an instructor editing a booking via a matching instructorProfileId succeeds', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, personId: 'person_student', instructorProfileId: 'instr_profile_1' });
    instructorProfileFindUnique.mockResolvedValue({ id: 'instr_profile_1', deactivatedAt: null });

    const result = await updateBooking(instructorActor('person_instructor'), 'booking_1', { notes: 'x' });

    expect(result.id).toBe('booking_1');
  });

  it('an instructor whose OWN instructor profile is deactivated gets 403 even when instructorProfileId matches', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, personId: 'person_student', instructorProfileId: 'instr_profile_1' });
    instructorProfileFindUnique.mockResolvedValue({ id: 'instr_profile_1', deactivatedAt: new Date('2025-01-01T00:00:00.000Z') });

    await expect(updateBooking(instructorActor('person_instructor'), 'booking_1', { notes: 'x' })).rejects.toThrow(ForbiddenError);
  });

  it('staff editing someone else\'s ALREADY-STARTED booking succeeds — no BOOKING_ALREADY_STARTED for staff ("lo staff può sempre")', async () => {
    bookingFindUnique.mockResolvedValue({
      ...EXISTING_OWN_BOOKING,
      personId: 'someone_else',
      startsAt: new Date(PAST_STARTS_AT),
      endsAt: new Date(PAST_ENDS_AT),
    });

    const result = await updateBooking(staffActor(), 'booking_1', { notes: 'x' });

    expect(result.id).toBe('booking_1');
  });

  it('staff\'s edit is exempt from BOOKING_IN_PAST on the new interval (deliberate asymmetry with own-path/create)', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    const result = await updateBooking(staffActor(), 'booking_1', { startsAt: PAST_STARTS_AT, endsAt: PAST_ENDS_AT });

    expect(result.id).toBe('booking_1');
  });

  it('an own-path actor with no linked personId (and no instructorProfileId on the booking) gets 403', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    await expect(updateBooking(pilotActor(null), 'booking_1', { notes: 'x' })).rejects.toThrow(ForbiddenError);
  });

  it('partial merge: only notes provided keeps the existing aircraft/interval', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    await updateBooking(staffActor(), 'booking_1', { notes: 'Solo una nota' });

    expect(bookingUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aircraftId: 'aircraft_1',
          startsAt: new Date(FUTURE_STARTS_AT),
          endsAt: new Date(FUTURE_ENDS_AT),
          notes: 'Solo una nota',
        }),
      }),
    );
  });

  it('partial merge: only startsAt provided validates against the CURRENT endsAt', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    const afterCurrentEndsAt = new Date(EXISTING_OWN_BOOKING.endsAt.getTime() + 60_000).toISOString();

    const error = await updateBooking(staffActor(), 'booking_1', { startsAt: afterCurrentEndsAt }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('notes: null explicitly clears the field', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, notes: 'Nota precedente' });

    await updateBooking(staffActor(), 'booking_1', { notes: null });

    expect(bookingUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ notes: null }) }));
  });

  it('a resulting endsAt <= startsAt answers 422 (merged values, not the raw patch)', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    const error = await updateBooking(staffActor(), 'booking_1', { endsAt: FUTURE_STARTS_AT }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
  });

  it('an unknown destination aircraft (empty lock result) answers 404', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    queryRaw.mockResolvedValue([]);

    await expect(updateBooking(staffActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('an archived destination aircraft answers 409', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    queryRaw.mockResolvedValue([{ id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, archivedAt: new Date('2025-01-01T00:00:00.000Z') }]);

    await expect(updateBooking(staffActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(ConflictError);
  });

  it('an OUT_OF_SERVICE destination aircraft answers 422 AIRCRAFT_OUT_OF_SERVICE, even for staff', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    queryRaw.mockResolvedValue([{ id: 'aircraft_2', status: 'OUT_OF_SERVICE', statusReason: 'Revisione motore', archivedAt: null }]);

    const error = await updateBooking(staffActor(), 'booking_1', { aircraftId: 'aircraft_2' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('AIRCRAFT_OUT_OF_SERVICE');
  });

  it('changing aircraft locks BOTH the current and destination Aircraft ids in ONE ordered IN (...) query', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING); // current aircraft_1
    queryRaw.mockResolvedValue([
      { id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, archivedAt: null },
      { id: 'aircraft_2', status: 'OPERATIONAL', statusReason: null, archivedAt: null },
    ]);

    await updateBooking(staffActor(), 'booking_1', { aircraftId: 'aircraft_2' });

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    const [strings, joined] = queryRawMock.mock.calls[0] as unknown as [TemplateStringsArray, { values: string[] }];
    expect(strings.join('?')).toContain('FOR UPDATE');
    expect(strings.join('?')).toContain('IN');
    expect(strings.join('?')).toContain('ORDER BY');
    expect(joined.values.slice().sort()).toEqual(['aircraft_1', 'aircraft_2']);
  });

  it('a same-aircraft edit locks only ONE id (the 1-element set collapses, same as createBooking)', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    await updateBooking(staffActor(), 'booking_1', { notes: 'x' });

    const [, joined] = queryRawMock.mock.calls[0] as unknown as [TemplateStringsArray, { values: string[] }];
    expect(joined.values).toEqual(['aircraft_1']);
  });

  it('the overlap pre-check excludes THIS booking and every CANCELLED row', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    await updateBooking(staffActor(), 'booking_1', { notes: 'x' });

    expect(bookingFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'booking_1' }, status: 'ACTIVE' }),
      }),
    );
  });

  it('an overlapping destination interval answers 409', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    bookingFindFirst.mockResolvedValue({ id: 'other_booking' });

    await expect(updateBooking(staffActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(ConflictError);
  });

  it('a concurrent cancel racing the atomic guard (updateMany count 0) answers 409', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    bookingUpdateMany.mockResolvedValue({ count: 0 });

    await expect(updateBooking(staffActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(ConflictError);
  });
});

describe('cancelBooking (Story 7.3, AC 1/2)', () => {
  it('a student (no bookings.manage.own) gets 403 straight from authorize() — no queries at all', async () => {
    await expect(cancelBooking(studentActor(), 'booking_1')).rejects.toThrow(ForbiddenError);
    expect(bookingFindUniqueMock).not.toHaveBeenCalled();
  });

  it('an unknown booking id answers 404', async () => {
    bookingFindUnique.mockResolvedValue(null);

    await expect(cancelBooking(staffActor(), 'ghost')).rejects.toThrow(NotFoundError);
  });

  it('an already-cancelled booking answers 409 from the fast pre-check', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, status: 'CANCELLED' });

    await expect(cancelBooking(pilotActor('person_pilot'), 'booking_1')).rejects.toThrow(ConflictError);
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });

  it('a pilot cancelling their own future booking succeeds — no Aircraft lock at all ($queryRaw never called)', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    const result = await cancelBooking(pilotActor('person_pilot'), 'booking_1');

    expect(result.id).toBe('booking_1');
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('cancels with status/cancelledAt/cancelledByUserId set via the atomic updateMany guard', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    await cancelBooking(pilotActor('person_pilot'), 'booking_1');

    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: 'ACTIVE' },
      data: { status: 'CANCELLED', cancelledAt: expect.any(Date), cancelledByUserId: 'pilot_1' },
    });
  });

  it('a pilot cancelling someone else\'s booking gets 403', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, personId: 'someone_else' });

    await expect(cancelBooking(pilotActor('person_pilot'), 'booking_1')).rejects.toThrow(ForbiddenError);
  });

  it('a pilot cancelling their own ALREADY-STARTED booking gets 422 BOOKING_ALREADY_STARTED', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, startsAt: new Date(PAST_STARTS_AT), endsAt: new Date(PAST_ENDS_AT) });

    const error = await cancelBooking(pilotActor('person_pilot'), 'booking_1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_ALREADY_STARTED');
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });

  it('staff cancelling an ALREADY-STARTED booking succeeds ("lo staff può sempre")', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, startsAt: new Date(PAST_STARTS_AT), endsAt: new Date(PAST_ENDS_AT) });

    const result = await cancelBooking(staffActor(), 'booking_1');

    expect(result.id).toBe('booking_1');
  });

  it('an instructor cancelling a booking via a matching instructorProfileId succeeds', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, personId: 'person_student', instructorProfileId: 'instr_profile_1' });
    instructorProfileFindUnique.mockResolvedValue({ id: 'instr_profile_1', deactivatedAt: null });

    const result = await cancelBooking(instructorActor('person_instructor'), 'booking_1');

    expect(result.id).toBe('booking_1');
  });

  it('a double-cancel race (updateMany count 0) answers 409, safe against a concurrent cancel', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    bookingUpdateMany.mockResolvedValue({ count: 0 });

    await expect(cancelBooking(staffActor(), 'booking_1')).rejects.toThrow(ConflictError);
  });
});

describe('createBooking on top of a CANCELLED booking (Story 7.3)', () => {
  it('creating over the exact interval of a CANCELLED booking succeeds (the slot was freed)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    // The overlap pre-check's own `where` already filters `status: 'ACTIVE'`
    // (asserted above) — mocking `findFirst` to resolve `null` here models a
    // DB that holds a CANCELLED row at this exact interval and correctly
    // excludes it.
    bookingFindFirst.mockResolvedValue(null);

    const result = await createBooking(staffActor(), baseInput({ personId: 'person_student' }));

    expect(result.id).toBe('booking_1');
  });
});

describe('calendarBookingsQuerySchema (Story 7.2, Task 2)', () => {
  it('accepts a valid from/to pair', () => {
    expect(
      calendarBookingsQuerySchema.safeParse({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z' }).success,
    ).toBe(true);
  });

  it('rejects missing from/to', () => {
    expect(calendarBookingsQuerySchema.safeParse({}).success).toBe(false);
    expect(calendarBookingsQuerySchema.safeParse({ from: '2026-08-01T00:00:00.000Z' }).success).toBe(false);
  });

  it('rejects malformed from/to', () => {
    expect(calendarBookingsQuerySchema.safeParse({ from: '2026-08-01', to: '2026-08-02T00:00:00.000Z' }).success).toBe(false);
  });

  it('rejects to <= from', () => {
    expect(
      calendarBookingsQuerySchema.safeParse({ from: '2026-08-02T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' }).success,
    ).toBe(false);
    expect(
      calendarBookingsQuerySchema.safeParse({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' }).success,
    ).toBe(false);
  });

  it('compares from/to as instants, not strings (same N1 lesson as createBookingSchema)', () => {
    const base = '2026-08-01T10:00:00';
    expect(calendarBookingsQuerySchema.safeParse({ from: `${base}Z`, to: `${base}.500Z` }).success).toBe(true);
    expect(calendarBookingsQuerySchema.safeParse({ from: `${base}.500Z`, to: `${base}Z` }).success).toBe(false);
  });
});

describe('booking-form picker helpers (Task 5)', () => {
  it('listBookableAircraft excludes archived aircraft and requires only self.read', async () => {
    aircraftFindMany.mockResolvedValue([{ id: 'a1', registration: 'I-ABCD', status: 'OPERATIONAL', statusReason: null }]);

    const result = await listBookableAircraft(studentActor());

    expect(result).toEqual([{ id: 'a1', registration: 'I-ABCD', status: 'OPERATIONAL', statusReason: null }]);
    expect(aircraftFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { archivedAt: null } }));
  });

  it('listBookableStudents returns only active students, requires only self.read', async () => {
    personFindMany.mockResolvedValue([{ id: 'p1', firstName: 'Marco', lastName: 'Ferraris' }]);

    const result = await listBookableStudents(instructorActor());

    expect(result).toEqual([{ id: 'p1', firstName: 'Marco', lastName: 'Ferraris' }]);
    expect(personFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { archivedAt: null, studentProfile: { deactivatedAt: null } } }),
    );
  });

  it('listActiveInstructors returns only active instructors, mapped to instructorProfileId', async () => {
    instructorProfileFindMany.mockResolvedValue([{ id: 'ip1', person: { firstName: 'Livia', lastName: 'Bernasconi' } }]);

    const result = await listActiveInstructors(staffActor());

    expect(result).toEqual([{ instructorProfileId: 'ip1', firstName: 'Livia', lastName: 'Bernasconi' }]);
  });

  it('getOwnInstructorProfileId returns null for an actor with no linked person', async () => {
    expect(await getOwnInstructorProfileId(pilotActor(null))).toBeNull();
    expect(personFindUniqueMock).not.toHaveBeenCalled();
  });

  it('getOwnInstructorProfileId returns null when the profile is deactivated', async () => {
    instructorProfileFindUnique.mockResolvedValue({ id: 'ip1', deactivatedAt: new Date() });

    expect(await getOwnInstructorProfileId(instructorActor('person_instructor'))).toBeNull();
  });

  it('getOwnInstructorProfileId returns the id when active', async () => {
    instructorProfileFindUnique.mockResolvedValue({ id: 'ip1', deactivatedAt: null });

    expect(await getOwnInstructorProfileId(instructorActor('person_instructor'))).toBe('ip1');
  });
});

describe('createBookingSchema (Story 7.1, Task 4)', () => {
  const VALID = { aircraftId: 'aircraft_1', personId: 'person_1', startsAt: FUTURE_STARTS_AT, endsAt: FUTURE_ENDS_AT };

  it('accepts a minimal valid body', () => {
    expect(createBookingSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts an optional instructorProfileId/notes', () => {
    expect(createBookingSchema.safeParse({ ...VALID, instructorProfileId: 'instr_1', notes: 'Volo prova' }).success).toBe(true);
  });

  it('rejects a malformed startsAt/endsAt', () => {
    expect(createBookingSchema.safeParse({ ...VALID, startsAt: '2026-08-01' }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...VALID, endsAt: 'not-a-date' }).success).toBe(false);
  });

  it('rejects endsAt <= startsAt', () => {
    expect(createBookingSchema.safeParse({ ...VALID, startsAt: FUTURE_ENDS_AT, endsAt: FUTURE_STARTS_AT }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...VALID, startsAt: FUTURE_STARTS_AT, endsAt: FUTURE_STARTS_AT }).success).toBe(false);
  });

  it('compares startsAt/endsAt as instants, not strings (review 7.1 N1: mixed fractional-second precision)', () => {
    // Lexicographically '.500Z' sorts BEFORE 'Z', but chronologically it is
    // 500ms later — a valid (if degenerate) interval a direct API client may send.
    const base = FUTURE_STARTS_AT.replace(/\.\d+Z$/, '');
    expect(createBookingSchema.safeParse({ ...VALID, startsAt: `${base}Z`, endsAt: `${base}.500Z` }).success).toBe(true);
    expect(createBookingSchema.safeParse({ ...VALID, startsAt: `${base}.500Z`, endsAt: `${base}Z` }).success).toBe(false);
  });

  it('rejects notes over 500 chars', () => {
    expect(createBookingSchema.safeParse({ ...VALID, notes: 'x'.repeat(501) }).success).toBe(false);
  });

  it('rejects an empty body', () => {
    expect(createBookingSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a missing aircraftId/personId', () => {
    expect(createBookingSchema.safeParse({ ...VALID, aircraftId: '' }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...VALID, personId: '' }).success).toBe(false);
  });
});

describe('updateBookingSchema (Story 7.3, Task 3)', () => {
  it('accepts a single-field patch (aircraftId only)', () => {
    expect(updateBookingSchema.safeParse({ aircraftId: 'aircraft_2' }).success).toBe(true);
  });

  it('accepts every field combined', () => {
    expect(
      updateBookingSchema.safeParse({ aircraftId: 'aircraft_2', startsAt: FUTURE_STARTS_AT, endsAt: FUTURE_ENDS_AT, notes: 'x' }).success,
    ).toBe(true);
  });

  it('rejects a completely empty body', () => {
    expect(updateBookingSchema.safeParse({}).success).toBe(false);
  });

  it('strips personId/instructorProfileId — they are not part of the schema at all', () => {
    const result = updateBookingSchema.safeParse({ personId: 'someone_else', instructorProfileId: 'instr_1', notes: 'x' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('personId');
      expect(result.data).not.toHaveProperty('instructorProfileId');
    }
  });

  it('notes: null explicitly clears it (nullable, distinct from omitted/undefined)', () => {
    const result = updateBookingSchema.safeParse({ notes: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });

  it('rejects malformed startsAt/endsAt', () => {
    expect(updateBookingSchema.safeParse({ startsAt: '2026-08-01' }).success).toBe(false);
  });

  it('rejects notes over 500 chars', () => {
    expect(updateBookingSchema.safeParse({ notes: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('listBookingsQuerySchema (Story 7.1, Task 4)', () => {
  it('accepts bare pagination with no filters', () => {
    const result = listBookingsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ page: 1, pageSize: 20 });
    }
  });

  it('accepts every filter combined', () => {
    expect(
      listBookingsQuerySchema.safeParse({
        from: FUTURE_STARTS_AT,
        to: FUTURE_ENDS_AT,
        aircraftId: 'aircraft_1',
        personId: 'person_1',
      }).success,
    ).toBe(true);
  });

  it('rejects a malformed from/to', () => {
    expect(listBookingsQuerySchema.safeParse({ from: '2026-08-01' }).success).toBe(false);
  });

  it('rejects a pageSize beyond the max (100)', () => {
    expect(listBookingsQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
