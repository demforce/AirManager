import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calendarBookingsQuerySchema,
  createBookingSchema,
  listBookingsQuerySchema,
  transitionBookingSchema,
  updateBookingSchema,
} from '@/lib/schemas/bookings';
import type { Actor } from '@/server/auth/rbac';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    instructorProfile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    aircraft: {
      findMany: vi.fn(),
    },
    expiry: {
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

const sendMock = vi.fn();
vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: sendMock })),
}));

vi.mock('@/server/adapters/mail/templates', () => ({
  buildBookingDeniedEmail: vi.fn(async () => ({ subject: 'Booking denied subject', text: 'Booking denied text' })),
}));

// Story 12.11, AC 4: `assertWithinSchedulingWindow` reads `getSchedulingSettings`
// from the SIBLING `app-settings.service.ts` — mocked (not Prisma) per the
// established "sibling-service mock" convention (`stats.service.test.ts`'s
// doc-comment), defaulted to "no settings configured" (`beforeEach` below) so
// every PRE-EXISTING test keeps its old backward-safe "no constraint" behavior.
vi.mock('./app-settings.service', () => ({ getSchedulingSettings: vi.fn() }));

const { prisma } = await import('@/server/db/prisma');
const { buildBookingDeniedEmail } = await import('@/server/adapters/mail/templates');
const { getSchedulingSettings } = await import('./app-settings.service');
const {
  createBooking,
  listBookings,
  listCalendarBookings,
  updateBooking,
  cancelBooking,
  transitionBooking,
  listBookableAircraft,
  listBookableStudents,
  listActiveInstructors,
  getOwnInstructorProfileId,
  listReservedAircraftIds,
} = await import('./bookings.service');
const { ForbiddenError, NotFoundError, ConflictError, ValidationError } = await import('./errors');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const personFindManyMock = vi.mocked(prisma.person.findMany);
const userFindUniqueMock = vi.mocked(prisma.user.findUnique);
const instructorProfileFindUniqueMock = vi.mocked(prisma.instructorProfile.findUnique);
const instructorProfileFindManyMock = vi.mocked(prisma.instructorProfile.findMany);
const aircraftFindManyMock = vi.mocked(prisma.aircraft.findMany);
const expiryFindManyMock = vi.mocked(prisma.expiry.findMany);
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
const userFindUnique = userFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const queryRaw = queryRawMock as unknown as { mockResolvedValue: (v: unknown[]) => void; mockResolvedValueOnce: (v: unknown[]) => void };
const aircraftFindMany = aircraftFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const expiryFindMany = expiryFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
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
  // Story 12.2: default `APPROVED` (was `ACTIVE`) — the enum was renamed in
  // place, and this fixture models a staff-created (already-live) booking.
  status: 'APPROVED' as 'PENDING' | 'APPROVED' | 'DENIED' | 'FLOWN' | 'NO_SHOW' | 'CANCELLED',
  cancelledAt: null as Date | null,
  // Story 7.4: `BOOKING_SELECT` now also includes `forcedAt`.
  forcedAt: null as Date | null,
  // Story 12.2: `BOOKING_SELECT` now also includes `denyReason`/`decidedAt`.
  denyReason: null as string | null,
  decidedAt: null as Date | null,
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
  // Story 7.4: no registered scadenze by default — individual expiry-block
  // tests override with their own fixture rows.
  expiryFindMany.mockResolvedValue([]);
  // Story 12.2: `transitionBooking`'s post-commit deny email — a person with
  // an email and no linked `User` (locale falls back to `it`) by default;
  // individual email tests override with their own fixtures.
  personFindUnique.mockImplementation(async () => ({ email: 'pilot@example.com' }));
  userFindUnique.mockResolvedValue(null);
  sendMock.mockReset();
  sendMock.mockResolvedValue(undefined);
  // Story 12.11, AC 4: no scheduling window configured by default (backward-safe,
  // "chiavi assenti -> nessun vincolo") — individual window tests override.
  vi.mocked(getSchedulingSettings).mockResolvedValue({
    openTime: null,
    closeTime: null,
    minSlotMinutes: null,
    turnaroundMinutes: null,
    maxAdvanceDays: null,
  });
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

    expect(result.booking.id).toBe('booking_1');
    expect(result.warnings).toEqual([]);
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

    expect(result.booking.id).toBe('booking_1');
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

    expect(result.booking.id).toBe('booking_1');
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

    expect(result.booking.id).toBe('booking_1');
    expect(bookingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ personId: 'person_student', instructorProfileId: null, actorUserId: 'staff_1' }) }),
    );
  });

  it('staff books for someone with an instructor indicated (any active instructor)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    instructorProfileFindUnique.mockResolvedValue({ id: 'instr_profile_9', deactivatedAt: null });

    const result = await createBooking(staffActor(), baseInput({ personId: 'person_student', instructorProfileId: 'instr_profile_9' }));

    expect(result.booking.id).toBe('booking_1');
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

  // --- Scheduling window (Story 12.11, AC 4, ratifica utente 3) -----------
  // FUTURE_STARTS_AT/FUTURE_ENDS_AT are 12:00-13:00 Europe/Rome (CEST,
  // UTC+2) on 2099-06-01 — `beforeEach` defaults every `sched.*` key to
  // `null` (no constraint); each test below overrides only what it needs.

  it('absent scheduling keys impose no window constraint (backward-safe default)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);

    await expect(createBooking(staffActor(), baseInput({ personId: 'person_student' }))).resolves.toBeDefined();
  });

  it('a booking within the configured openTime–closeTime window is allowed', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '07:00', closeTime: '21:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    await expect(createBooking(staffActor(), baseInput({ personId: 'person_student' }))).resolves.toBeDefined();
  });

  it('the window bounds are INCLUSIVE — startsAt exactly at openTime and endsAt exactly at closeTime are allowed', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '12:00', closeTime: '13:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    await expect(createBooking(staffActor(), baseInput({ personId: 'person_student' }))).resolves.toBeDefined();
  });

  it('startsAt before openTime answers 422 BOOKING_OUTSIDE_WINDOW, checked BEFORE the transaction ever opens', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '13:00', closeTime: '21:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    const error = await createBooking(staffActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('endsAt after closeTime answers 422 BOOKING_OUTSIDE_WINDOW', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '07:00', closeTime: '12:30', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    const error = await createBooking(staffActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
  });

  it('midnight edge: a booking crossing into the next Europe/Rome calendar day is outside the window regardless of the numeric bounds', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    // 21:00Z/22:30Z = 23:00/00:30 Europe/Rome (CEST) — crosses midnight into 2099-06-02.
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '00:00', closeTime: '23:59', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    const error = await createBooking(
      staffActor(),
      baseInput({ personId: 'person_student', startsAt: '2099-06-01T21:00:00.000Z', endsAt: '2099-06-01T22:30:00.000Z' }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
  });

  it('startsAt beyond maxAdvanceDays answers 422 BOOKING_OUTSIDE_WINDOW', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: null, closeTime: null, minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: 1 });

    // FUTURE_STARTS_AT (2099-06-01) is always > 1 day beyond "now", any time this suite runs.
    const error = await createBooking(staffActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
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
          status: 'APPROVED',
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

  // --- Initial status stamping (Story 12.2, AC 2) -------------------------

  it('a staff actor (bookings.manage.any) creates with status APPROVED, stamped explicitly — never the column default', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);

    await createBooking(staffActor(), baseInput({ personId: 'person_student' }));

    expect(bookingCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }));
  });

  it('a pilot (bookings.manage.own) self-booking creates with status PENDING', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_PILOT_PERSON);

    await createBooking(pilotActor('person_pilot'), baseInput({ personId: 'person_pilot' }));

    expect(bookingCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }));
  });

  it('an instructor (bookings.manage.own) booking for an allievo creates with status PENDING', async () => {
    personFindUnique.mockImplementation(async (args) =>
      args.where.id === 'person_instructor' ? ACTIVE_INSTRUCTOR_ACTOR_PERSON : ACTIVE_STUDENT_PERSON,
    );

    await createBooking(
      instructorActor('person_instructor'),
      baseInput({ personId: 'person_student', instructorProfileId: 'instr_profile_1' }),
    );

    expect(bookingCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }));
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
          status: 'APPROVED',
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
      expect.objectContaining({ where: { status: 'APPROVED', aircraftId: 'aircraft_9', personId: 'person_9' } }),
    );
  });

  it('excludes CANCELLED bookings (story 7.3: a cancelled booking frees its slot and disappears from the list)', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(staffActor(), { page: 1, pageSize: 20 });

    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'APPROVED' }) }));
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

  // --- Optional status filter (Story 12.2, AC 4) --------------------------

  it('an explicit status array overrides the APPROVED-only default with an IN filter', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(staffActor(), { page: 1, pageSize: 20, status: ['PENDING', 'APPROVED'] });

    expect(bookingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ['PENDING', 'APPROVED'] } }) }),
    );
  });

  it('a single-element status array still uses the IN filter, not a bare equality', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(staffActor(), { page: 1, pageSize: 20, status: ['DENIED'] });

    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: ['DENIED'] } }) }));
  });
});

describe('listBookings — privacy masking (Story 14.5, AC 1/2/6, ratifica R3)', () => {
  // `CREATED_BOOKING_ROW.personId` is 'person_pilot' — every masking test
  // below picks an actor `personId` that either matches it (own, unmasked)
  // or doesn't (masked, unless the actor holds `bookings.read.names`).
  const OTHERS_BOOKING_ROW = {
    ...CREATED_BOOKING_ROW,
    instructorProfileId: 'instr_profile_1',
    instructorProfile: { person: { firstName: 'Livia', lastName: 'Bernasconi' } },
    notes: 'Recupero volo di gruppo',
    status: 'DENIED' as const,
    denyReason: 'Aeromobile non disponibile',
  };

  it("masks personName/instructorName/notes/denyReason on a booking that is NOT the actor's own, for a pilot without bookings.read.names", async () => {
    bookingFindMany.mockResolvedValue([OTHERS_BOOKING_ROW]);
    bookingCount.mockResolvedValue(1);

    const result = await listBookings(pilotActor('someone_else'), { page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({ personName: null, instructorName: null, notes: null, denyReason: null });
    // Untouched: masking never hides operational fields, only identity-bearing ones.
    expect(result.items[0]?.status).toBe('DENIED');
    expect(result.items[0]?.aircraftRegistration).toBe('I-ABCD');
    expect(result.items[0]?.personId).toBe('person_pilot');
  });

  it("does NOT mask a pilot's OWN booking (personId === actor.personId)", async () => {
    bookingFindMany.mockResolvedValue([OTHERS_BOOKING_ROW]); // personId: 'person_pilot'
    bookingCount.mockResolvedValue(1);

    const result = await listBookings(pilotActor('person_pilot'), { page: 1, pageSize: 20 });

    expect(result.items[0]?.personName).toBe('Mario Rossi');
    expect(result.items[0]?.instructorName).toBe('Livia Bernasconi');
    expect(result.items[0]?.notes).toBe('Recupero volo di gruppo');
    expect(result.items[0]?.denyReason).toBe('Aeromobile non disponibile');
  });

  it('masks the SAME way for a student (no bookings.read.names either)', async () => {
    bookingFindMany.mockResolvedValue([OTHERS_BOOKING_ROW]);
    bookingCount.mockResolvedValue(1);

    const result = await listBookings(studentActor(), { page: 1, pageSize: 20 }); // personId 'person_student' !== 'person_pilot'

    expect(result.items[0]?.personName).toBeNull();
  });

  it("does NOT mask for an INSTRUCTOR (holds bookings.read.names) even on a booking that is neither theirs nor their own", async () => {
    bookingFindMany.mockResolvedValue([OTHERS_BOOKING_ROW]);
    bookingCount.mockResolvedValue(1);

    const result = await listBookings(instructorActor('someone_else'), { page: 1, pageSize: 20 });

    expect(result.items[0]?.personName).toBe('Mario Rossi');
    expect(result.items[0]?.instructorName).toBe('Livia Bernasconi');
  });

  it('does NOT mask for STAFF/ADMIN either (bookings.read.names)', async () => {
    bookingFindMany.mockResolvedValue([OTHERS_BOOKING_ROW]);
    bookingCount.mockResolvedValue(1);

    const result = await listBookings(staffActor(), { page: 1, pageSize: 20 });

    expect(result.items[0]?.personName).toBe('Mario Rossi');
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
        where: { status: 'APPROVED', startsAt: { lt: new Date(TO) }, endsAt: { gt: new Date(FROM) } },
      }),
    );
  });

  it('excludes CANCELLED bookings (story 7.3: a cancelled booking frees its slot and disappears from the calendar)', async () => {
    bookingFindMany.mockResolvedValue([]);

    await listCalendarBookings(staffActor(), { from: FROM, to: TO });

    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'APPROVED' }) }));
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

  // --- Privacy masking (Story 14.5, AC 1/2/6, ratifica R3) — the timeline is
  // fed straight from this function, so it must mask exactly like `listBookings`.
  it("masks personName/instructorName on a non-own booking for a pilot (the timeline must not leak names either)", async () => {
    bookingFindMany.mockResolvedValue([
      { ...CREATED_BOOKING_ROW, instructorProfileId: 'instr_profile_1', instructorProfile: { person: { firstName: 'Livia', lastName: 'Bernasconi' } } },
    ]);

    const result = await listCalendarBookings(pilotActor('someone_else'), { from: FROM, to: TO });

    expect(result[0]).toMatchObject({ personName: null, instructorName: null });
  });

  it("does NOT mask the pilot's own booking on the timeline", async () => {
    bookingFindMany.mockResolvedValue([CREATED_BOOKING_ROW]); // personId: 'person_pilot'

    const result = await listCalendarBookings(pilotActor('person_pilot'), { from: FROM, to: TO });

    expect(result[0]?.personName).toBe('Mario Rossi');
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
  // Story 12.2: default `APPROVED` (was `ACTIVE`) — the enum was renamed in
  // place; individual tests override with `PENDING` where the AC 4 broadened
  // editable/cancellable set needs exercising.
  status: 'APPROVED' as 'PENDING' | 'APPROVED' | 'DENIED' | 'FLOWN' | 'NO_SHOW' | 'CANCELLED',
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
      where: { id: 'booking_1', status: 'APPROVED' },
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
        where: expect.objectContaining({ id: { not: 'booking_1' }, status: 'APPROVED' }),
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

  // --- PENDING/APPROVED editable set (Story 12.2, AC 4) -------------------

  it('a PENDING booking is also editable (was ACTIVE-only) — the atomic guard keys off the CURRENT status', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, status: 'PENDING' });

    const result = await updateBooking(staffActor(), 'booking_1', { notes: 'x' });

    expect(result.id).toBe('booking_1');
    expect(bookingUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'booking_1', status: 'PENDING' } }));
  });

  it.each(['DENIED', 'FLOWN', 'NO_SHOW'] as const)('a %s booking is NOT editable — 409 from the fast pre-check', async (status) => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, status });

    await expect(updateBooking(staffActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(ConflictError);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe('updateBooking — expiry-based booking block on a DAY change (Story TD-5, AC 5)', () => {
  // EXISTING_OWN_BOOKING's startsAt (FUTURE_STARTS_AT, 2099-06-01T10:00Z) is
  // 12:00 CEST in Rome (June, +2h, no day shift) — its flight day is
  // 2099-06-01, same convention as the create-expiry suite above.
  const SAME_DAY_LATER_STARTS_AT = '2099-06-01T18:00:00.000Z'; // still 2099-06-01 in Rome
  const SAME_DAY_LATER_ENDS_AT = '2099-06-01T19:00:00.000Z';
  const NEXT_DAY_STARTS_AT = '2099-06-02T10:00:00.000Z'; // 2099-06-02 in Rome
  const NEXT_DAY_ENDS_AT = '2099-06-02T11:00:00.000Z';

  /** Expired relative to the NEW flight day (06-02) but valid on the ORIGINAL one (06-01) — proves the recheck uses the NEW day. */
  function expiredBeforeNextDayRow() {
    return { expiresAt: new Date('2099-06-01T00:00:00.000Z'), expiryType: { name: 'Licenza', blocksBooking: true } };
  }

  function validOnNextDayRow() {
    return { expiresAt: new Date('2099-06-02T00:00:00.000Z'), expiryType: { name: 'Licenza', blocksBooking: true } };
  }

  function nonBlockingWarningRow() {
    return { expiresAt: new Date('2099-06-01T00:00:00.000Z'), expiryType: { name: 'Rating SEP', blocksBooking: false } };
  }

  it('moving to a DIFFERENT flight day with a blocking expired document (relative to the NEW day) answers 422 EXPIRED_DOCUMENTS, same shape as create', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    expiryFindMany.mockResolvedValue([expiredBeforeNextDayRow()]);

    const error = await updateBooking(staffActor(), 'booking_1', { startsAt: NEXT_DAY_STARTS_AT, endsAt: NEXT_DAY_ENDS_AT }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ValidationError);
    const validationError = error as InstanceType<typeof ValidationError>;
    expect(validationError.code).toBe('EXPIRED_DOCUMENTS');
    expect(validationError.message).toContain('Licenza');
    expect(validationError.details).toEqual({ documents: [{ typeName: 'Licenza', expiresAt: '2099-06-01' }] });
    // Queried by the booking's OWN personId (`existing.personId`), not the staff actor's (null).
    expect(expiryFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { personId: 'person_pilot' } }));
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('moving to a DIFFERENT flight day where the document expires AFTER the new day succeeds', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    expiryFindMany.mockResolvedValue([validOnNextDayRow()]);

    const result = await updateBooking(staffActor(), 'booking_1', { startsAt: NEXT_DAY_STARTS_AT, endsAt: NEXT_DAY_ENDS_AT });

    expect(result.id).toBe('booking_1');
  });

  it('changing ONLY the time within the SAME flight day never rechecks — a booking created with force past a blocking document stays editable that day', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    // A row that WOULD block if rechecked — proves this is a genuine skip, not a lucky empty result.
    expiryFindMany.mockResolvedValue([expiredBeforeNextDayRow()]);

    const result = await updateBooking(staffActor(), 'booking_1', { startsAt: SAME_DAY_LATER_STARTS_AT, endsAt: SAME_DAY_LATER_ENDS_AT });

    expect(result.id).toBe('booking_1');
    expect(expiryFindManyMock).not.toHaveBeenCalled();
  });

  it('moving to a DIFFERENT flight day with only a non-blocking expired document never blocks', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    expiryFindMany.mockResolvedValue([nonBlockingWarningRow()]);

    const result = await updateBooking(staffActor(), 'booking_1', { startsAt: NEXT_DAY_STARTS_AT, endsAt: NEXT_DAY_ENDS_AT });

    expect(result.id).toBe('booking_1');
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
      where: { id: 'booking_1', status: 'APPROVED' },
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

  // --- PENDING/APPROVED cancellable set (Story 12.2, AC 4) ----------------

  it('a PENDING booking is also cancellable (was ACTIVE-only) — the atomic guard keys off the CURRENT status', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, status: 'PENDING' });

    const result = await cancelBooking(staffActor(), 'booking_1');

    expect(result.id).toBe('booking_1');
    expect(bookingUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'booking_1', status: 'PENDING' } }),
    );
  });

  it.each(['DENIED', 'FLOWN', 'NO_SHOW'] as const)('a %s booking is NOT cancellable — 409 from the fast pre-check', async (status) => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, status });

    await expect(cancelBooking(staffActor(), 'booking_1')).rejects.toThrow(ConflictError);
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });
});

// --- transitionBooking (Story 12.2, AC 3/5/6/7) -----------------------------
// The booking approval workflow: PENDING/APPROVED/DENIED/FLOWN/NO_SHOW.

/** The `FOR UPDATE` lock row `transitionBooking` reads first — shape of the raw `$queryRaw` result, NOT `BOOKING_SELECT` (no joins). */
type LockedBookingFixture = { id: string; status: string; personId: string; aircraftId: string; startsAt: Date; endsAt: Date };

const BASE_LOCKED_BOOKING: LockedBookingFixture = {
  id: 'booking_1',
  status: 'PENDING',
  personId: 'person_pilot',
  aircraftId: 'aircraft_1',
  startsAt: new Date(FUTURE_STARTS_AT),
  endsAt: new Date(FUTURE_ENDS_AT),
};

/** Queues the booking-row lock read (`transitionBooking`'s FIRST `$queryRaw` call) — same `mockResolvedValueOnce` ordering trick as `ppr.service.test.ts`'s `mockLockedRequest`. A SECOND `$queryRaw` call (the Aircraft lock, APPROVE only) falls through to `beforeEach`'s base `queryRaw.mockResolvedValue(LOCKED_OPERATIONAL_AIRCRAFT)`. */
function mockBookingLock(overrides: Partial<LockedBookingFixture> = {}): void {
  queryRaw.mockResolvedValueOnce([{ ...BASE_LOCKED_BOOKING, ...overrides }]);
}

describe('transitionBooking (Story 12.2, AC 3)', () => {
  it('a non-staff actor (no bookings.manage.any) gets 403 straight from authorize() — no queries at all, not even for "riapri"', async () => {
    await expect(transitionBooking(pilotActor(), 'booking_1', { to: 'APPROVED' })).rejects.toThrow(ForbiddenError);
    await expect(transitionBooking(instructorActor(), 'booking_1', { to: 'PENDING' })).rejects.toThrow(ForbiddenError);
    await expect(transitionBooking(studentActor(), 'booking_1', { to: 'DENIED', reason: 'x' })).rejects.toThrow(ForbiddenError);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('an unknown booking id (empty lock result) answers 404', async () => {
    queryRaw.mockResolvedValueOnce([]);

    await expect(transitionBooking(staffActor(), 'ghost', { to: 'APPROVED' })).rejects.toThrow(NotFoundError);
  });

  it('DENY without a reason answers 422 BOOKING_DENY_REASON_REQUIRED, checked BEFORE the transaction ever opens', async () => {
    const error = await transitionBooking(staffActor(), 'booking_1', { to: 'DENIED' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_DENY_REASON_REQUIRED');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('PENDING -> APPROVED stamps decidedAt/decidedByUserId', async () => {
    mockBookingLock({ status: 'PENDING' });

    const result = await transitionBooking(staffActor(), 'booking_1', { to: 'APPROVED' });

    expect(result.id).toBe('booking_1');
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: 'PENDING' },
      data: { status: 'APPROVED', decidedAt: expect.any(Date), decidedByUserId: 'staff_1' },
    });
  });

  it('PENDING -> DENIED with a reason stamps denyReason/decidedAt/decidedByUserId', async () => {
    mockBookingLock({ status: 'PENDING' });

    await transitionBooking(staffActor(), 'booking_1', { to: 'DENIED', reason: 'Aeromobile richiesto per manutenzione' });

    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: 'PENDING' },
      data: {
        status: 'DENIED',
        decidedAt: expect.any(Date),
        decidedByUserId: 'staff_1',
        denyReason: 'Aeromobile richiesto per manutenzione',
      },
    });
  });

  it('APPROVED -> FLOWN stamps closedAt/closedByUserId', async () => {
    mockBookingLock({ status: 'APPROVED' });

    await transitionBooking(staffActor(), 'booking_1', { to: 'FLOWN' });

    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: 'APPROVED' },
      data: { status: 'FLOWN', closedAt: expect.any(Date), closedByUserId: 'staff_1' },
    });
  });

  it('APPROVED -> NO_SHOW stamps closedAt/closedByUserId', async () => {
    mockBookingLock({ status: 'APPROVED' });

    await transitionBooking(staffActor(), 'booking_1', { to: 'NO_SHOW' });

    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: 'APPROVED' },
      data: { status: 'NO_SHOW', closedAt: expect.any(Date), closedByUserId: 'staff_1' },
    });
  });

  it.each(['DENIED', 'FLOWN', 'NO_SHOW'] as const)('%s -> PENDING ("riapri") clears every decision/closure field', async (from) => {
    mockBookingLock({ status: from });

    await transitionBooking(staffActor(), 'booking_1', { to: 'PENDING' });

    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: from },
      data: { status: 'PENDING', decidedAt: null, decidedByUserId: null, denyReason: null, closedAt: null, closedByUserId: null },
    });
  });

  it('a race where the atomic guard finds 0 rows (status changed since the lock) answers 409', async () => {
    mockBookingLock({ status: 'PENDING' });
    bookingUpdateMany.mockResolvedValue({ count: 0 });

    await expect(transitionBooking(staffActor(), 'booking_1', { to: 'APPROVED' })).rejects.toThrow(ConflictError);
  });

  // --- PENDING -> APPROVED re-checks (same rules as createBooking) --------

  it('a blocking expired document (relative to the flight day) answers 422 EXPIRED_DOCUMENTS, same shape as create', async () => {
    mockBookingLock({ status: 'PENDING' });
    expiryFindMany.mockResolvedValue([{ expiresAt: new Date('2020-01-01T00:00:00.000Z'), expiryType: { name: 'Licenza', blocksBooking: true } }]);

    const error = await transitionBooking(staffActor(), 'booking_1', { to: 'APPROVED' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    const validationError = error as InstanceType<typeof ValidationError>;
    expect(validationError.code).toBe('EXPIRED_DOCUMENTS');
    expect(validationError.details).toEqual({ documents: [{ typeName: 'Licenza', expiresAt: '2020-01-01' }] });
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });

  it('a booking outside the configured scheduling window answers 422 BOOKING_OUTSIDE_WINDOW on APPROVE (Story 12.11, AC 4)', async () => {
    mockBookingLock({ status: 'PENDING' });
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '13:00', closeTime: '21:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    const error = await transitionBooking(staffActor(), 'booking_1', { to: 'APPROVED' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });

  it('an OUT_OF_SERVICE aircraft answers 422 AIRCRAFT_OUT_OF_SERVICE', async () => {
    mockBookingLock({ status: 'PENDING' });
    queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1', status: 'OUT_OF_SERVICE', statusReason: 'Revisione motore', archivedAt: null }]);

    const error = await transitionBooking(staffActor(), 'booking_1', { to: 'APPROVED' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('AIRCRAFT_OUT_OF_SERVICE');
  });

  it('an archived aircraft answers 409', async () => {
    mockBookingLock({ status: 'PENDING' });
    queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, archivedAt: new Date('2025-01-01T00:00:00.000Z') }]);

    await expect(transitionBooking(staffActor(), 'booking_1', { to: 'APPROVED' })).rejects.toThrow(ConflictError);
  });

  it('an overlapping APPROVED booking on the same aircraft/interval answers 409, excluding this booking itself', async () => {
    mockBookingLock({ status: 'PENDING' });
    bookingFindFirst.mockResolvedValue({ id: 'other_booking' });

    await expect(transitionBooking(staffActor(), 'booking_1', { to: 'APPROVED' })).rejects.toThrow(ConflictError);

    expect(bookingFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 'booking_1' }, status: 'APPROVED' }) }),
    );
  });

  it('no re-checks happen for DENY/FLOWN/NO_SHOW/riapri — only APPROVE re-runs expiry/aircraft/overlap', async () => {
    mockBookingLock({ status: 'APPROVED' });

    await transitionBooking(staffActor(), 'booking_1', { to: 'FLOWN' });

    expect(expiryFindManyMock).not.toHaveBeenCalled();
    // Exactly ONE `$queryRaw` call: the booking lock — no Aircraft lock for a non-APPROVE transition.
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });
});

describe('transitionBooking — transition matrix (Story 12.2, AC 3/7)', () => {
  const ALL_STATUSES = ['PENDING', 'APPROVED', 'DENIED', 'FLOWN', 'NO_SHOW', 'CANCELLED'] as const;
  const TARGETS = ['PENDING', 'APPROVED', 'DENIED', 'FLOWN', 'NO_SHOW'] as const;

  /** The exhaustive legal-pair table (AC 3) — mirrors `bookings.service.ts#isLegalBookingTransition` one-for-one, independently re-derived rather than imported, so this test actually catches a drift between the two. */
  const LEGAL_FROM: Record<(typeof TARGETS)[number], readonly string[]> = {
    APPROVED: ['PENDING'],
    DENIED: ['PENDING'],
    FLOWN: ['APPROVED'],
    NO_SHOW: ['APPROVED'],
    PENDING: ['DENIED', 'FLOWN', 'NO_SHOW'],
  };

  for (const from of ALL_STATUSES) {
    for (const to of TARGETS) {
      const legal = LEGAL_FROM[to].includes(from);

      it(`${from} -> ${to} is ${legal ? 'LEGAL' : '422 BOOKING_TRANSITION_INVALID'}`, async () => {
        mockBookingLock({ status: from });
        const reason = to === 'DENIED' ? 'Motivo di test' : undefined;

        if (legal) {
          const result = await transitionBooking(staffActor(), 'booking_1', { to, reason });
          expect(result.id).toBe('booking_1');
          expect(bookingUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'booking_1', status: from } }));
        } else {
          const error = await transitionBooking(staffActor(), 'booking_1', { to, reason }).catch((e: unknown) => e);
          expect(error).toBeInstanceOf(ValidationError);
          expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_TRANSITION_INVALID');
          expect(bookingUpdateManyMock).not.toHaveBeenCalled();
        }
      });
    }
  }
});

describe('transitionBooking — booking-denied email (Story 12.2, AC 5)', () => {
  it('DENY sends the email AFTER commit, to the person\'s email, in their OWN User.locale', async () => {
    mockBookingLock({ status: 'PENDING' });
    personFindUnique.mockImplementation(async () => ({ email: 'mario@example.com' }));
    userFindUnique.mockResolvedValue({ locale: 'en' });
    // The post-write re-read (`tx.booking.findUniqueOrThrow`) reflects what the
    // transaction just wrote — the email body reads `denyReason` off of it.
    bookingFindUniqueOrThrow.mockResolvedValue({ ...CREATED_BOOKING_ROW, status: 'DENIED', denyReason: 'Manutenzione straordinaria' });

    await transitionBooking(staffActor(), 'booking_1', { to: 'DENIED', reason: 'Manutenzione straordinaria' });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'mario@example.com', subject: 'Booking denied subject' }));
    expect(buildBookingDeniedEmail).toHaveBeenCalledWith(
      'en',
      expect.objectContaining({ firstName: 'Mario', aircraftRegistration: 'I-ABCD', reason: 'Manutenzione straordinaria' }),
    );
  });

  it('DENY falls back to locale "it" when the booking-holder has no linked User', async () => {
    mockBookingLock({ status: 'PENDING' });
    personFindUnique.mockImplementation(async () => ({ email: 'mario@example.com' }));
    userFindUnique.mockResolvedValue(null);

    await transitionBooking(staffActor(), 'booking_1', { to: 'DENIED', reason: 'x' });

    expect(buildBookingDeniedEmail).toHaveBeenCalledWith('it', expect.anything());
  });

  it('a person with no email on file is a SILENT skip — no send, no throw, transition still succeeds', async () => {
    mockBookingLock({ status: 'PENDING' });
    personFindUnique.mockImplementation(async () => ({ email: null }));

    const result = await transitionBooking(staffActor(), 'booking_1', { to: 'DENIED', reason: 'x' });

    expect(result.id).toBe('booking_1');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('a failing SMTP send never fails the transition — swallowed with console.error, no throw', async () => {
    mockBookingLock({ status: 'PENDING' });
    sendMock.mockRejectedValue(new Error('SMTP down'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await transitionBooking(staffActor(), 'booking_1', { to: 'DENIED', reason: 'x' });

    expect(result.id).toBe('booking_1');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it.each(['APPROVED', 'FLOWN', 'NO_SHOW', 'PENDING'] as const)('%s never sends an email (only DENIED does, AC 5)', async (to) => {
    mockBookingLock({ status: to === 'APPROVED' ? 'PENDING' : to === 'PENDING' ? 'DENIED' : 'APPROVED' });

    await transitionBooking(staffActor(), 'booking_1', { to });

    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('createBooking on top of a CANCELLED booking (Story 7.3)', () => {
  it('creating over the exact interval of a CANCELLED booking succeeds (the slot was freed)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    // The overlap pre-check's own `where` already filters `status: 'APPROVED'`
    // (asserted above) — mocking `findFirst` to resolve `null` here models a
    // DB that holds a CANCELLED row at this exact interval and correctly
    // excludes it.
    bookingFindFirst.mockResolvedValue(null);

    const result = await createBooking(staffActor(), baseInput({ personId: 'person_student' }));

    expect(result.booking.id).toBe('booking_1');
  });
});

describe('createBooking — expiry-based booking block (Story 7.4, AC 1/2)', () => {
  // `baseInput()`'s default `startsAt` (`FUTURE_STARTS_AT`, 2099-06-01T10:00Z)
  // is 12:00 CEST in Rome (June, +2h, no day shift) — the flight day is
  // 2099-06-01. `EXPIRED_BEFORE_FLIGHT_DAY` is one calendar day earlier;
  // `VALID_ON_FLIGHT_DAY` is exactly on it (the boundary: the expiry day
  // itself is still valid, Contesto).
  const FLIGHT_DAY_ONLY = '2099-06-01';
  const EXPIRED_BEFORE_FLIGHT_DAY = new Date('2099-05-31T00:00:00.000Z');
  const VALID_ON_FLIGHT_DAY = new Date(`${FLIGHT_DAY_ONLY}T00:00:00.000Z`);

  function expiredBlockingLicenseRow() {
    return { expiresAt: EXPIRED_BEFORE_FLIGHT_DAY, expiryType: { name: 'Licenza', blocksBooking: true } };
  }

  function expiredWarningRatingRow() {
    return { expiresAt: EXPIRED_BEFORE_FLIGHT_DAY, expiryType: { name: 'Rating SEP', blocksBooking: false } };
  }

  it('a blocking expired document (e.g. medica/licenza) answers 422 EXPIRED_DOCUMENTS, with the type name in BOTH the message and details.documents', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    expiryFindMany.mockResolvedValue([expiredBlockingLicenseRow()]);

    const error = await createBooking(staffActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    const validationError = error as InstanceType<typeof ValidationError>;
    expect(validationError.code).toBe('EXPIRED_DOCUMENTS');
    expect(validationError.message).toContain('Licenza');
    expect(validationError.details).toEqual({ documents: [{ typeName: 'Licenza', expiresAt: '2099-05-31' }] });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('a non-blocking expired document (e.g. a rating) never blocks — the booking succeeds with it listed in warnings, no force stamp', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    expiryFindMany.mockResolvedValue([expiredWarningRatingRow()]);

    const result = await createBooking(staffActor(), baseInput({ personId: 'person_student' }));

    expect(result.booking.id).toBe('booking_1');
    expect(result.warnings).toEqual([{ typeName: 'Rating SEP', expiresAt: '2099-05-31' }]);
    const createArgs = bookingCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(createArgs.data).not.toHaveProperty('forcedAt');
    expect(createArgs.data).not.toHaveProperty('forcedByUserId');
    expect(createArgs.data).not.toHaveProperty('forceReason');
  });

  it('a blocking AND a non-blocking expired document together: the block wins (422), and details/message list ONLY the blocking document', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    expiryFindMany.mockResolvedValue([expiredBlockingLicenseRow(), expiredWarningRatingRow()]);

    const error = await createBooking(staffActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    const validationError = error as InstanceType<typeof ValidationError>;
    expect(validationError.code).toBe('EXPIRED_DOCUMENTS');
    expect(validationError.message).toContain('Licenza');
    expect(validationError.message).not.toContain('Rating SEP');
    expect(validationError.details).toEqual({ documents: [{ typeName: 'Licenza', expiresAt: '2099-05-31' }] });
  });

  it('a person with NO registered Expiry rows at all is never blocked (absence != expired)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    expiryFindMany.mockResolvedValue([]);

    const result = await createBooking(staffActor(), baseInput({ personId: 'person_student' }));

    expect(result.booking.id).toBe('booking_1');
    expect(result.warnings).toEqual([]);
  });

  it('boundary: expiresAt equal to the flight day itself is still VALID (no block, no warning) — the day before IS expired', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);

    expiryFindMany.mockResolvedValue([{ expiresAt: VALID_ON_FLIGHT_DAY, expiryType: { name: 'Licenza', blocksBooking: true } }]);
    const validResult = await createBooking(staffActor(), baseInput({ personId: 'person_student' }));
    expect(validResult.booking.id).toBe('booking_1');
    expect(validResult.warnings).toEqual([]);

    expiryFindMany.mockResolvedValue([expiredBlockingLicenseRow()]);
    const error = await createBooking(staffActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('EXPIRED_DOCUMENTS');
  });

  it('dateOnlyInZone boundary: an evening UTC startsAt that crosses into the next Rome day (CEST) uses the SHIFTED flight day, not the UTC calendar day', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    // 2099-07-15T22:30:00.000Z is 00:30 CEST on 2099-07-16 in Rome — the
    // correct flight day is the 16th.
    const startsAt = '2099-07-15T22:30:00.000Z';
    const endsAt = '2099-07-15T23:30:00.000Z';

    // Expired relative to the CORRECT (shifted) flight day 2099-07-16, even
    // though it is dated the SAME as startsAt's own UTC calendar day — proof
    // the rule does not naively use the UTC date.
    expiryFindMany.mockResolvedValue([{ expiresAt: new Date('2099-07-15T00:00:00.000Z'), expiryType: { name: 'Licenza', blocksBooking: true } }]);
    const error = await createBooking(staffActor(), baseInput({ personId: 'person_student', startsAt, endsAt })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('EXPIRED_DOCUMENTS');

    // Valid exactly ON the correct (shifted) flight day 2099-07-16.
    expiryFindMany.mockResolvedValue([{ expiresAt: new Date('2099-07-16T00:00:00.000Z'), expiryType: { name: 'Licenza', blocksBooking: true } }]);
    const result = await createBooking(staffActor(), baseInput({ personId: 'person_student', startsAt, endsAt }));
    expect(result.booking.id).toBe('booking_1');
  });

  it('school booking: the ALLIEVO (target person)\'s expired blocking document blocks the instructor who books for them — queried by the TARGET personId, not the actor\'s', async () => {
    personFindUnique.mockImplementation(async (args) =>
      args.where.id === 'person_instructor' ? ACTIVE_INSTRUCTOR_ACTOR_PERSON : ACTIVE_STUDENT_PERSON,
    );
    expiryFindMany.mockResolvedValue([expiredBlockingLicenseRow()]);

    const error = await createBooking(
      instructorActor('person_instructor'),
      baseInput({ personId: 'person_student', instructorProfileId: 'instr_profile_1' }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('EXPIRED_DOCUMENTS');
    expect(expiryFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { personId: 'person_student' } }));
  });

  it('order: a blocking expired document is checked BEFORE BOOKING_IN_PAST — EXPIRED_DOCUMENTS wins even when startsAt is also in the past', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    // Dated before PAST_STARTS_AT's OWN flight day (2020-01-01), so it is
    // genuinely expired relative to that (past) flight day too.
    expiryFindMany.mockResolvedValue([{ expiresAt: new Date('2019-01-01T00:00:00.000Z'), expiryType: { name: 'Licenza', blocksBooking: true } }]);

    const error = await createBooking(
      staffActor(),
      baseInput({ personId: 'person_student', startsAt: PAST_STARTS_AT, endsAt: PAST_ENDS_AT }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('EXPIRED_DOCUMENTS');
  });

  // --- Force (AC 2) -------------------------------------------------------

  it('a pilot (own-path) with force:true gets 403 BEFORE any query at all — persona included, not just scadenze', async () => {
    await expect(
      createBooking(pilotActor('person_pilot'), baseInput({ personId: 'person_pilot', force: true, forceReason: 'Tentativo non autorizzato' })),
    ).rejects.toThrow(ForbiddenError);
    expect(personFindUniqueMock).not.toHaveBeenCalled();
    expect(expiryFindManyMock).not.toHaveBeenCalled();
  });

  it('an instructor (own-path, booking for an allievo) with force:true also gets 403 — checked right after the existing own-rules block, before any TARGET-person or scadenze query', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_INSTRUCTOR_ACTOR_PERSON);

    await expect(
      createBooking(
        instructorActor('person_instructor'),
        baseInput({ personId: 'person_student', instructorProfileId: 'instr_profile_1', force: true, forceReason: 'x' }),
      ),
    ).rejects.toThrow(ForbiddenError);

    // The own-rules block's pre-existing query (7.1: the actor's OWN
    // instructor profile, never a leak) is the only one that ran — the
    // TARGET person ('person_student') was never queried, and neither was
    // `prisma.expiry.findMany`.
    expect(personFindUniqueMock).toHaveBeenCalledTimes(1);
    expect(personFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'person_instructor' } }));
    expect(expiryFindManyMock).not.toHaveBeenCalled();
  });

  it('staff without force on a real block still gets 422 EXPIRED_DOCUMENTS (force is opt-in, never automatic)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    expiryFindMany.mockResolvedValue([expiredBlockingLicenseRow()]);

    const error = await createBooking(staffActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('EXPIRED_DOCUMENTS');
  });

  it('staff force + forceReason bypasses a real block, stamping forcedAt/forcedByUserId/forceReason on the created booking', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    expiryFindMany.mockResolvedValue([expiredBlockingLicenseRow()]);

    const result = await createBooking(
      staffActor(),
      baseInput({ personId: 'person_student', force: true, forceReason: 'Autorizzato dal direttore' }),
    );

    expect(result.booking.id).toBe('booking_1');
    expect(bookingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          forcedAt: expect.any(Date),
          forcedByUserId: 'staff_1',
          forceReason: 'Autorizzato dal direttore',
        }),
      }),
    );
  });

  it('force:true with NO blocking expired documents creates normally, stamping NOTHING (Contesto: a real bypass, not a checked box)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    expiryFindMany.mockResolvedValue([]);

    const result = await createBooking(
      staffActor(),
      baseInput({ personId: 'person_student', force: true, forceReason: 'Nessun blocco da scavalcare' }),
    );

    expect(result.booking.id).toBe('booking_1');
    const createArgs = bookingCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(createArgs.data).not.toHaveProperty('forcedAt');
    expect(createArgs.data).not.toHaveProperty('forcedByUserId');
    expect(createArgs.data).not.toHaveProperty('forceReason');
  });

  it('force:true with only a non-blocking warning (no real block) also creates normally without stamping', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    expiryFindMany.mockResolvedValue([expiredWarningRatingRow()]);

    const result = await createBooking(
      staffActor(),
      baseInput({ personId: 'person_student', force: true, forceReason: 'Solo per sicurezza' }),
    );

    expect(result.booking.id).toBe('booking_1');
    expect(result.warnings).toEqual([{ typeName: 'Rating SEP', expiresAt: '2099-05-31' }]);
    const createArgs = bookingCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(createArgs.data).not.toHaveProperty('forcedAt');
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

  // --- force/forceReason (Story 7.4, AC 2) --------------------------------

  it('accepts a body with neither force nor forceReason (the common case)', () => {
    expect(createBookingSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts force: true WITH a non-empty forceReason', () => {
    expect(createBookingSchema.safeParse({ ...VALID, force: true, forceReason: 'Autorizzato dal direttore' }).success).toBe(true);
  });

  it('rejects force: true WITHOUT forceReason (422 refine)', () => {
    const result = createBookingSchema.safeParse({ ...VALID, force: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('forceReason'))).toBe(true);
    }
  });

  it('rejects force: true with an empty/whitespace-only forceReason (422 refine)', () => {
    expect(createBookingSchema.safeParse({ ...VALID, force: true, forceReason: '' }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...VALID, force: true, forceReason: '   ' }).success).toBe(false);
  });

  it('rejects forceReason over 500 chars', () => {
    expect(createBookingSchema.safeParse({ ...VALID, force: true, forceReason: 'x'.repeat(501) }).success).toBe(false);
  });

  it('a forceReason WITHOUT force: true is accepted (harmless — the service never reads it unless force is also true)', () => {
    expect(createBookingSchema.safeParse({ ...VALID, forceReason: 'Non necessario' }).success).toBe(true);
  });

  it('force: false with no forceReason is accepted (the refine only fires when force is true)', () => {
    expect(createBookingSchema.safeParse({ ...VALID, force: false }).success).toBe(true);
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

  // --- status filter (Story 12.2, AC 4) -----------------------------------

  it('accepts a comma-separated status list, parsed into an array', () => {
    const result = listBookingsQuerySchema.safeParse({ status: 'PENDING,APPROVED' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toEqual(['PENDING', 'APPROVED']);
    }
  });

  it('accepts a single status value', () => {
    const result = listBookingsQuerySchema.safeParse({ status: 'DENIED' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toEqual(['DENIED']);
    }
  });

  it('rejects an unknown status value', () => {
    expect(listBookingsQuerySchema.safeParse({ status: 'NOT_A_STATUS' }).success).toBe(false);
  });

  it('omitted status stays undefined (the service applies its own APPROVED-only default)', () => {
    const result = listBookingsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBeUndefined();
    }
  });
});

describe('transitionBookingSchema (Story 12.2, AC 6)', () => {
  it('accepts a minimal body for each non-CANCELLED target', () => {
    for (const to of ['PENDING', 'APPROVED', 'FLOWN', 'NO_SHOW'] as const) {
      expect(transitionBookingSchema.safeParse({ to }).success).toBe(true);
    }
  });

  it('accepts DENIED with a reason', () => {
    expect(transitionBookingSchema.safeParse({ to: 'DENIED', reason: 'Motivo' }).success).toBe(true);
  });

  it('accepts DENIED WITHOUT a reason at the schema level — the mandatory-reason rule is a SERVICE check (422 BOOKING_DENY_REASON_REQUIRED), not this shape-only schema', () => {
    expect(transitionBookingSchema.safeParse({ to: 'DENIED' }).success).toBe(true);
  });

  it('rejects to: CANCELLED — cancelling stays the dedicated /cancel endpoint', () => {
    expect(transitionBookingSchema.safeParse({ to: 'CANCELLED' }).success).toBe(false);
  });

  it('rejects an unknown to value', () => {
    expect(transitionBookingSchema.safeParse({ to: 'NOT_A_STATUS' }).success).toBe(false);
  });

  it('rejects a missing to', () => {
    expect(transitionBookingSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a reason over 500 chars', () => {
    expect(transitionBookingSchema.safeParse({ to: 'DENIED', reason: 'x'.repeat(501) }).success).toBe(false);
  });

  it('trims the reason', () => {
    const result = transitionBookingSchema.safeParse({ to: 'DENIED', reason: '  Motivo  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('Motivo');
    }
  });
});

describe('listReservedAircraftIds (story 12.5, AC 2 — fleet "Riservato" badge, batched)', () => {
  it('rejects an actor without aircraft.manage (e.g. a pilot)', async () => {
    await expect(listReservedAircraftIds(pilotActor(), ['aircraft_1'], new Date('2026-07-15T10:00:00.000Z'))).rejects.toThrow(
      ForbiddenError,
    );
    expect(bookingFindManyMock).not.toHaveBeenCalled();
  });

  it('an empty id list short-circuits to an empty Set without querying', async () => {
    const result = await listReservedAircraftIds(staffActor(), [], new Date('2026-07-15T10:00:00.000Z'));

    expect(result.size).toBe(0);
    expect(bookingFindManyMock).not.toHaveBeenCalled();
  });

  it('queries with the exact AD-2 shape: aircraftId in ids, APPROVED, startsAt <= now < endsAt', async () => {
    bookingFindMany.mockResolvedValue([]);
    const now = new Date('2026-07-15T10:00:00.000Z');

    await listReservedAircraftIds(staffActor(), ['aircraft_1', 'aircraft_2'], now);

    expect(bookingFindManyMock).toHaveBeenCalledWith({
      where: { aircraftId: { in: ['aircraft_1', 'aircraft_2'] }, status: 'APPROVED', startsAt: { lte: now }, endsAt: { gt: now } },
      select: { aircraftId: true },
    });
  });

  it('returns the Set of aircraftIds with a covering APPROVED booking, others absent', async () => {
    bookingFindMany.mockResolvedValue([{ aircraftId: 'aircraft_1' }, { aircraftId: 'aircraft_3' }]);

    const result = await listReservedAircraftIds(staffActor(), ['aircraft_1', 'aircraft_2', 'aircraft_3'], new Date('2026-07-15T10:00:00.000Z'));

    expect(result.has('aircraft_1')).toBe(true);
    expect(result.has('aircraft_2')).toBe(false);
    expect(result.has('aircraft_3')).toBe(true);
  });
});
