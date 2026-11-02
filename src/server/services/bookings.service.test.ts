import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calendarBookingsQuerySchema,
  createBookingSchema,
  listBookingsQuerySchema,
  transitionBookingSchema,
  updateBookingSchema,
} from '@/lib/schemas/bookings';
import { requirementsNotMetDetailsSchema } from '@/lib/schemas/requirements';
import { ROLE_PERMISSIONS, type Actor } from '@/server/auth/rbac';
import type { RequirementsInput } from './requirements.service';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
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
    // Story 19.10 (AD-2): the estimated cost reads the rates in effect on the flight day.
    aircraftRate: {
      findFirst: vi.fn(),
    },
    instructorRate: {
      findFirst: vi.fn(),
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

// Story 19.10 (§4.1): the ONE evaluation of the requirements is story 19.9's,
// proved in `requirements.service.test.ts` — mocked here at module level
// (no failure by default, `beforeEach`), so this file proves the
// ORCHESTRATION: when it is called, with which input, where the decision
// sits and what gets written. `throwRequirementsNotMet` stays the real helper.
const evaluateRequirementsMock = vi.fn();
vi.mock('./requirements.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./requirements.service')>()),
  evaluateRequirements: (...args: unknown[]) => evaluateRequirementsMock(...args),
}));

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
const personFindUniqueOrThrowMock = vi.mocked(prisma.person.findUniqueOrThrow);
const personFindManyMock = vi.mocked(prisma.person.findMany);
const userFindUniqueMock = vi.mocked(prisma.user.findUnique);
const instructorProfileFindUniqueMock = vi.mocked(prisma.instructorProfile.findUnique);
const instructorProfileFindManyMock = vi.mocked(prisma.instructorProfile.findMany);
const aircraftFindManyMock = vi.mocked(prisma.aircraft.findMany);
const expiryFindManyMock = vi.mocked(prisma.expiry.findMany);
const aircraftRateFindFirstMock = vi.mocked(prisma.aircraftRate.findFirst);
const instructorRateFindFirstMock = vi.mocked(prisma.instructorRate.findFirst);
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
const personFindUniqueOrThrow = personFindUniqueOrThrowMock as unknown as { mockResolvedValue: (v: Fixture) => void };
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
const aircraftRateFindFirst = aircraftRateFindFirstMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const instructorRateFindFirst = instructorRateFindFirstMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const personFindMany = personFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const instructorProfileFindMany = instructorProfileFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };

/** Same batch/interactive `$transaction` stand-in as `flights.service.test.ts`. */
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };
function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
}

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
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

// Story 19.10: `BOOKABLE_PERSON_SELECT` now also reads the name and the
// account (the requirements label a failure with the name; no account = no
// balance check, D-6).
const ACTIVE_PILOT_PERSON = {
  id: 'person_pilot',
  firstName: 'Mario',
  lastName: 'Rossi',
  archivedAt: null,
  pilotProfile: { deactivatedAt: null },
  studentProfile: null,
  instructorProfile: null,
  account: { id: 'account_pilot' },
};

const DEACTIVATED_PILOT_PERSON = {
  ...ACTIVE_PILOT_PERSON,
  pilotProfile: { deactivatedAt: new Date('2025-01-01T00:00:00.000Z') },
};

const ACTIVE_STUDENT_PERSON = {
  id: 'person_student',
  firstName: 'Anna',
  lastName: 'Bianchi',
  archivedAt: null,
  pilotProfile: null,
  studentProfile: { deactivatedAt: null },
  instructorProfile: null,
  account: { id: 'account_student' },
};

const NO_PROFILE_PERSON = {
  id: 'person_other',
  firstName: 'Nessun',
  lastName: 'Profilo',
  archivedAt: null,
  pilotProfile: null,
  studentProfile: null,
  instructorProfile: null,
  account: null,
};

const ACTIVE_INSTRUCTOR_ACTOR_PERSON = {
  firstName: 'Ivo',
  lastName: 'Istruttore',
  instructorProfile: { id: 'instr_profile_1', deactivatedAt: null },
};

/** `assertActiveInstructorProfile`'s row (story 19.10: the holder and its name come with it). */
function instructorProfileRow(id = 'instr_profile_1', overrides: Record<string, unknown> = {}): Fixture {
  return { id, deactivatedAt: null, personId: 'person_instructor', person: { firstName: 'Ivo', lastName: 'Istruttore' }, ...overrides };
}

/** Story AOG-1a: `outOfServiceUntil` joined the three `SELECT ... FOR UPDATE`s, so every locked-aircraft row literal in this file carries it (the service reads it to build the 422's `details`). */
const LOCKED_OPERATIONAL_AIRCRAFT = [{ id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null, archivedAt: null }];

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
  // Story 7.4 / 19.10 (D-10): no expired non-blocking rating by default.
  expiryFindMany.mockResolvedValue([]);
  // Story 19.10: every requirement met, and no rate in effect (cost 0), by default.
  evaluateRequirementsMock.mockResolvedValue([]);
  aircraftRateFindFirst.mockResolvedValue(null);
  instructorRateFindFirst.mockResolvedValue(null);
  // Story 12.2: `transitionBooking`'s post-commit deny email — a person with
  // an email and no linked `User` (locale falls back to `it`) by default;
  // individual email tests override with their own fixtures.
  personFindUnique.mockImplementation(async () => ({ email: 'pilot@example.com' }));
  // Story 16.3 (ops F4): `transitionBooking` -> APPROVED re-loads the booking's
  // person (`findUniqueOrThrow`, the FK guarantees the row) — a bookable one by
  // default; the F4 tests override it with an archived/profile-less person.
  personFindUniqueOrThrow.mockResolvedValue(ACTIVE_PILOT_PERSON);
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

    const result = await createBooking(adminActor(), baseInput({ personId: 'person_student' }));

    expect(result.booking.id).toBe('booking_1');
    expect(bookingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ personId: 'person_student', instructorProfileId: null, actorUserId: 'admin_1' }) }),
    );
  });

  it('staff books for someone with an instructor indicated (any active instructor)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    instructorProfileFindUnique.mockResolvedValue(instructorProfileRow('instr_profile_9'));

    const result = await createBooking(adminActor(), baseInput({ personId: 'person_student', instructorProfileId: 'instr_profile_9' }));

    expect(result.booking.id).toBe('booking_1');
    expect(bookingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ instructorProfileId: 'instr_profile_9' }) }),
    );
  });

  it('staff with a person having no bookable profile at all gets 422 PERSON_NOT_BOOKABLE', async () => {
    personFindUnique.mockImplementation(async () => NO_PROFILE_PERSON);

    const error = await createBooking(adminActor(), baseInput({ personId: 'person_other' })).catch((e: unknown) => e);

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

    await expect(createBooking(adminActor(), baseInput({ personId: 'ghost' }))).rejects.toThrow(NotFoundError);
  });

  it('an archived person answers 409', async () => {
    personFindUnique.mockImplementation(async () => ({ ...ACTIVE_PILOT_PERSON, archivedAt: new Date('2025-01-01T00:00:00.000Z') }));

    await expect(createBooking(adminActor(), baseInput({ personId: 'person_pilot' }))).rejects.toThrow(ConflictError);
  });

  it('an unknown aircraft (empty lock result) answers 404', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    queryRaw.mockResolvedValue([]);

    await expect(createBooking(adminActor(), baseInput({ personId: 'person_student' }))).rejects.toThrow(NotFoundError);
  });

  it('an archived aircraft answers 409', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    queryRaw.mockResolvedValue([{ id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null, archivedAt: new Date('2025-01-01T00:00:00.000Z') }]);

    await expect(createBooking(adminActor(), baseInput({ personId: 'person_student' }))).rejects.toThrow(ConflictError);
  });

  it('an out-of-service aircraft answers 422 AIRCRAFT_OUT_OF_SERVICE with the reason in BOTH details and the message', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    queryRaw.mockResolvedValue([{ id: 'aircraft_1', status: 'OUT_OF_SERVICE', statusReason: 'Revisione motore', outOfServiceUntil: null, archivedAt: null }]);

    const error = await createBooking(adminActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    const validationError = error as InstanceType<typeof ValidationError>;
    expect(validationError.code).toBe('AIRCRAFT_OUT_OF_SERVICE');
    expect(validationError.message).toContain('Revisione motore');
    // Story AOG-1a, AC 7(a): `details` gained `outOfServiceUntil` — `null` when
    // the grounding has no expected return date (invariant [b]). The server
    // MESSAGE is unchanged (AD-3: it is a log line, not a user surface).
    expect(validationError.details).toEqual({ reason: 'Revisione motore', outOfServiceUntil: null });
  });

  it('carries the expected-return date as a YYYY-MM-DD calendar day in details (story AOG-1a, AC 7a)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    queryRaw.mockResolvedValue([
      // `@db.Date` round-trips through `$queryRaw` as a UTC-midnight `Date`
      // (measured on this repo's Prisma 7 + adapter-pg).
      { id: 'aircraft_1', status: 'OUT_OF_SERVICE', statusReason: 'Revisione 100h', outOfServiceUntil: new Date(Date.UTC(2031, 4, 12)), archivedAt: null },
    ]);

    const error = await createBooking(adminActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    const validationError = error as InstanceType<typeof ValidationError>;
    expect(validationError.code).toBe('AIRCRAFT_OUT_OF_SERVICE');
    // A calendar day, never the instant: the UI reads this back with
    // `formatDateOnly`, and R-AOG-a's semantics are "the LAST grounded day".
    expect(validationError.details).toEqual({ reason: 'Revisione 100h', outOfServiceUntil: '2031-05-12' });
    // The message itself is BYTE-IDENTICAL to the no-date case (AD-3).
    expect(validationError.message).toBe('Aircraft is out of service: Revisione 100h.');
  });

  it('startsAt not in the future answers 422 BOOKING_IN_PAST — checked BEFORE the transaction ever opens', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);

    const error = await createBooking(
      adminActor(),
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

    await expect(createBooking(adminActor(), baseInput({ personId: 'person_student' }))).resolves.toBeDefined();
  });

  it('a booking within the configured openTime–closeTime window is allowed', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '07:00', closeTime: '21:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    await expect(createBooking(adminActor(), baseInput({ personId: 'person_student' }))).resolves.toBeDefined();
  });

  it('the window bounds are INCLUSIVE — startsAt exactly at openTime and endsAt exactly at closeTime are allowed', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '12:00', closeTime: '13:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    await expect(createBooking(adminActor(), baseInput({ personId: 'person_student' }))).resolves.toBeDefined();
  });

  it('startsAt before openTime answers 422 BOOKING_OUTSIDE_WINDOW, checked BEFORE the transaction ever opens', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '13:00', closeTime: '21:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    const error = await createBooking(adminActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('endsAt after closeTime answers 422 BOOKING_OUTSIDE_WINDOW', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '07:00', closeTime: '12:30', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    const error = await createBooking(adminActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
  });

  it('midnight edge: a booking crossing into the next Europe/Rome calendar day is outside the window regardless of the numeric bounds', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    // 21:00Z/22:30Z = 23:00/00:30 Europe/Rome (CEST) — crosses midnight into 2099-06-02.
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '00:00', closeTime: '23:59', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    const error = await createBooking(
      adminActor(),
      baseInput({ personId: 'person_student', startsAt: '2099-06-01T21:00:00.000Z', endsAt: '2099-06-01T22:30:00.000Z' }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
  });

  it('startsAt beyond maxAdvanceDays answers 422 BOOKING_OUTSIDE_WINDOW', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: null, closeTime: null, minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: 1 });

    // FUTURE_STARTS_AT (2099-06-01) is always > 1 day beyond "now", any time this suite runs.
    const error = await createBooking(adminActor(), baseInput({ personId: 'person_student' })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
  });

  // --- Concurrency (AC 2) -------------------------------------------------

  it('an overlapping interval answers 409, and the aircraft lock ($queryRaw) runs BEFORE the overlap pre-check (findFirst)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
    bookingFindFirst.mockResolvedValue({ id: 'existing_booking' });

    await expect(createBooking(adminActor(), baseInput({ personId: 'person_student' }))).rejects.toThrow(ConflictError);

    expect(queryRawMock).toHaveBeenCalled();
    expect(bookingFindFirstMock).toHaveBeenCalled();
    const lockOrder = queryRawMock.mock.invocationCallOrder[0]!;
    const overlapOrder = bookingFindFirstMock.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(overlapOrder);
  });

  it('the overlap pre-check uses the semi-open interval semantics (startsAt < endsAt AND endsAt > startsAt on the same aircraft)', async () => {
    personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);

    await createBooking(adminActor(), baseInput({ personId: 'person_student' }));

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

    await createBooking(adminActor(), baseInput({ personId: 'person_student' }));

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

    await listBookings(adminActor(), { page: 1, pageSize: 20, from: '2026-08-01T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z' });

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

    await listBookings(adminActor(), { page: 1, pageSize: 20, aircraftId: 'aircraft_9', personId: 'person_9' });

    expect(bookingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'APPROVED', aircraftId: 'aircraft_9', personId: 'person_9' } }),
    );
  });

  it('excludes CANCELLED bookings (story 7.3: a cancelled booking frees its slot and disappears from the list)', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(adminActor(), { page: 1, pageSize: 20 });

    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'APPROVED' }) }));
  });

  it('orders by startsAt asc, id asc', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(adminActor(), { page: 1, pageSize: 20 });

    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] }));
  });

  it('paginates (skip/take derived from page/pageSize)', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(adminActor(), { page: 2, pageSize: 10 });

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

    const result = await listBookings(adminActor(), { page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({
      personName: 'Mario Rossi',
      instructorName: 'Livia Bernasconi',
      aircraftRegistration: 'I-ABCD',
    });
  });

  it('instructorName is null when no instructor is on the booking', async () => {
    bookingFindMany.mockResolvedValue([CREATED_BOOKING_ROW]);
    bookingCount.mockResolvedValue(1);

    const result = await listBookings(adminActor(), { page: 1, pageSize: 20 });

    expect(result.items[0]?.instructorName).toBeNull();
  });

  // --- Optional status filter (Story 12.2, AC 4) --------------------------

  it('an explicit status array overrides the APPROVED-only default with an IN filter', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(adminActor(), { page: 1, pageSize: 20, status: ['PENDING', 'APPROVED'] });

    expect(bookingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ['PENDING', 'APPROVED'] } }) }),
    );
  });

  it('a single-element status array still uses the IN filter, not a bare equality', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await listBookings(adminActor(), { page: 1, pageSize: 20, status: ['DENIED'] });

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

  it("masks personName/instructorProfileId/instructorName/notes/denyReason on a booking that is NOT the actor's own, for a pilot without bookings.read.names", async () => {
    bookingFindMany.mockResolvedValue([OTHERS_BOOKING_ROW]);
    bookingCount.mockResolvedValue(1);

    const result = await listBookings(pilotActor('someone_else'), { page: 1, pageSize: 20 });

    // Review F1: `instructorProfileId` is masked TOO, not just the two name
    // fields — this was the actual bypass (a client-side instructor filter
    // joined the unmasked id against a full instructor roster to
    // de-anonymize every masked block).
    expect(result.items[0]).toMatchObject({ personName: null, instructorProfileId: null, instructorName: null, notes: null, denyReason: null });
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
    // Review F4 — a "resolved once per request, only when it can matter"
    // guard: an actor who already reads every name never needs the extra
    // `getOwnInstructorProfileId` query at all.
    expect(instructorProfileFindUniqueMock).not.toHaveBeenCalled();
  });

  it('does NOT mask for ADMIN either (bookings.read.names)', async () => {
    bookingFindMany.mockResolvedValue([OTHERS_BOOKING_ROW]);
    bookingCount.mockResolvedValue(1);

    const result = await listBookings(adminActor(), { page: 1, pageSize: 20 });

    expect(result.items[0]?.personName).toBe('Mario Rossi');
  });

  it("treats booking.instructorProfileId === the actor's OWN active InstructorProfile as own too (review F4 — aligned with assertOwnAccessAndTiming's own definition, used by update/cancel), even for an actor without bookings.read.names", async () => {
    bookingFindMany.mockResolvedValue([OTHERS_BOOKING_ROW]); // instructorProfileId: 'instr_profile_1'
    bookingCount.mockResolvedValue(1);
    instructorProfileFindUnique.mockResolvedValue(instructorProfileRow());

    const result = await listBookings(pilotActor('someone_else'), { page: 1, pageSize: 20 });

    expect(result.items[0]?.personName).toBe('Mario Rossi');
    expect(result.items[0]?.instructorName).toBe('Livia Bernasconi');
  });

  it("does NOT treat a DEACTIVATED own InstructorProfile as own (getOwnInstructorProfileId's own active-only rule applies here too)", async () => {
    bookingFindMany.mockResolvedValue([OTHERS_BOOKING_ROW]); // instructorProfileId: 'instr_profile_1'
    bookingCount.mockResolvedValue(1);
    instructorProfileFindUnique.mockResolvedValue(instructorProfileRow('instr_profile_1', { deactivatedAt: new Date('2025-01-01T00:00:00.000Z') }));

    const result = await listBookings(pilotActor('someone_else'), { page: 1, pageSize: 20 });

    expect(result.items[0]?.personName).toBeNull();
  });
});

describe('listBookings — personId filter guard (Story 14.5 review F3)', () => {
  it("rejects a PILOT filtering by someone ELSE's personId with a 403, before any query — same guard shape as flights.service.ts#authorizeFlightsQuery (masked names alone would still let this actor enumerate one person's bookings)", async () => {
    await expect(listBookings(pilotActor('person_pilot'), { page: 1, pageSize: 20, personId: 'someone_else' })).rejects.toThrow(ForbiddenError);
    expect(bookingFindManyMock).not.toHaveBeenCalled();
  });

  it('allows a PILOT filtering by their OWN personId', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await expect(listBookings(pilotActor('person_pilot'), { page: 1, pageSize: 20, personId: 'person_pilot' })).resolves.toBeDefined();
  });

  it('allows ADMIN (holds bookings.read.names) to filter by ANY personId', async () => {
    bookingFindMany.mockResolvedValue([]);
    bookingCount.mockResolvedValue(0);

    await expect(listBookings(adminActor(), { page: 1, pageSize: 20, personId: 'someone_else' })).resolves.toBeDefined();
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
    const error = await listCalendarBookings(adminActor(), { from: FROM, to: FROM }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(bookingFindManyMock).not.toHaveBeenCalled();
  });

  it('rejects to < from with a 422', async () => {
    const error = await listCalendarBookings(adminActor(), { from: TO, to: FROM }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('rejects a range wider than 8 days with 422 RANGE_TOO_WIDE', async () => {
    const error = await listCalendarBookings(adminActor(), { from: '2026-08-01T00:00:00.000Z', to: '2026-08-10T00:00:01.000Z' }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('RANGE_TOO_WIDE');
    expect(bookingFindManyMock).not.toHaveBeenCalled();
  });

  it('accepts an EXACT 8-day range (boundary, not RANGE_TOO_WIDE)', async () => {
    bookingFindMany.mockResolvedValue([]);
    await expect(
      listCalendarBookings(adminActor(), { from: '2026-08-01T00:00:00.000Z', to: '2026-08-09T00:00:00.000Z' }),
    ).resolves.toEqual([]);
  });

  it('uses the semi-open overlap predicate (startsAt < to AND endsAt > from)', async () => {
    bookingFindMany.mockResolvedValue([]);

    await listCalendarBookings(adminActor(), { from: FROM, to: TO });

    expect(bookingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'APPROVED', startsAt: { lt: new Date(TO) }, endsAt: { gt: new Date(FROM) } },
      }),
    );
  });

  it('excludes CANCELLED bookings (story 7.3: a cancelled booking frees its slot and disappears from the calendar)', async () => {
    bookingFindMany.mockResolvedValue([]);

    await listCalendarBookings(adminActor(), { from: FROM, to: TO });

    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'APPROVED' }) }));
  });

  it('a booking that ENDS exactly at `from` is EXCLUDED (semi-open)', async () => {
    // `findMany` is mocked directly (not filtered in-memory), so this
    // documents/asserts the WHERE clause sent to Prisma is exactly the
    // semi-open predicate that would exclude such a row — the DB, not this
    // test, performs the actual filtering (same convention as
    // `listBookings`'s equivalent assertion above).
    bookingFindMany.mockResolvedValue([]);
    await listCalendarBookings(adminActor(), { from: FROM, to: TO });
    const where = bookingFindManyMock.mock.calls[0]?.[0]?.where as { endsAt: { gt: Date } };
    expect(new Date(FROM).getTime()).not.toBeGreaterThan(where.endsAt.gt.getTime());
  });

  it('orders by startsAt asc, id asc, with a take: 1000 safety bound (not pagination)', async () => {
    bookingFindMany.mockResolvedValue([]);

    await listCalendarBookings(adminActor(), { from: FROM, to: TO });

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

    const result = await listCalendarBookings(adminActor(), { from: FROM, to: TO });

    expect(result[0]).toMatchObject({ personName: 'Mario Rossi', instructorName: 'Livia Bernasconi', aircraftRegistration: 'I-ABCD' });
  });

  // --- Privacy masking (Story 14.5, AC 1/2/6, ratifica R3) — the timeline is
  // fed straight from this function, so it must mask exactly like `listBookings`.
  it("masks personName/instructorProfileId/instructorName on a non-own booking for a pilot (the timeline must not leak names, OR the raw instructor id, either)", async () => {
    bookingFindMany.mockResolvedValue([
      { ...CREATED_BOOKING_ROW, instructorProfileId: 'instr_profile_1', instructorProfile: { person: { firstName: 'Livia', lastName: 'Bernasconi' } } },
    ]);

    const result = await listCalendarBookings(pilotActor('someone_else'), { from: FROM, to: TO });

    // Review F1: `instructorProfileId` masked too — this is the field
    // `schedule.tsx`'s client-side instructor filter matched against the
    // (previously unmasked) roster to de-anonymize a masked block.
    expect(result[0]).toMatchObject({ personName: null, instructorProfileId: null, instructorName: null });
  });

  it("does NOT mask the pilot's own booking on the timeline", async () => {
    bookingFindMany.mockResolvedValue([CREATED_BOOKING_ROW]); // personId: 'person_pilot'

    const result = await listCalendarBookings(pilotActor('person_pilot'), { from: FROM, to: TO });

    expect(result[0]?.personName).toBe('Mario Rossi');
  });

  it("treats booking.instructorProfileId === the actor's OWN active InstructorProfile as own too (review F4, same alignment as listBookings), even without bookings.read.names", async () => {
    bookingFindMany.mockResolvedValue([
      { ...CREATED_BOOKING_ROW, instructorProfileId: 'instr_profile_1', instructorProfile: { person: { firstName: 'Livia', lastName: 'Bernasconi' } } },
    ]);
    instructorProfileFindUnique.mockResolvedValue(instructorProfileRow());

    const result = await listCalendarBookings(pilotActor('someone_else'), { from: FROM, to: TO });

    expect(result[0]?.personName).toBe('Mario Rossi');
    expect(result[0]?.instructorName).toBe('Livia Bernasconi');
  });

  it('does NOT query getOwnInstructorProfileId for an actor who already holds bookings.read.names (review F4 — once per request, only when it can matter)', async () => {
    bookingFindMany.mockResolvedValue([CREATED_BOOKING_ROW]);

    await listCalendarBookings(adminActor(), { from: FROM, to: TO });

    expect(instructorProfileFindUniqueMock).not.toHaveBeenCalled();
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
  // Story 19.10: `updateBooking` reads who the requirements and the R-19-o
  // locks are about — the person (`BOOKABLE_PERSON_SELECT`) and the holder of
  // the instructor profile (`null` without one, the FK keeps the two in step).
  person: ACTIVE_PILOT_PERSON as Fixture,
  instructorProfile: null as { personId: string; person: { firstName: string; lastName: string } } | null,
};

/** The holder of `instr_profile_1` as `updateBooking` reads it with the booking. */
const INSTRUCTOR_HOLDER = { personId: 'person_instructor', person: { firstName: 'Ivo', lastName: 'Istruttore' } };

describe('updateBooking (Story 7.3, AC 1/2)', () => {
  it('a student (no bookings.manage.own) gets 403 straight from authorize() — no queries at all', async () => {
    await expect(updateBooking(studentActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(ForbiddenError);
    expect(bookingFindUniqueMock).not.toHaveBeenCalled();
  });

  it('an unknown booking id answers 404', async () => {
    bookingFindUnique.mockResolvedValue(null);

    await expect(updateBooking(adminActor(), 'ghost', { notes: 'x' })).rejects.toThrow(NotFoundError);
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
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, personId: 'person_student', person: ACTIVE_STUDENT_PERSON, instructorProfileId: 'instr_profile_1', instructorProfile: INSTRUCTOR_HOLDER });
    instructorProfileFindUnique.mockResolvedValue(instructorProfileRow());

    const result = await updateBooking(instructorActor('person_instructor'), 'booking_1', { notes: 'x' });

    expect(result.id).toBe('booking_1');
  });

  it('an instructor whose OWN instructor profile is deactivated gets 403 even when instructorProfileId matches', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, personId: 'person_student', person: ACTIVE_STUDENT_PERSON, instructorProfileId: 'instr_profile_1', instructorProfile: INSTRUCTOR_HOLDER });
    instructorProfileFindUnique.mockResolvedValue(instructorProfileRow('instr_profile_1', { deactivatedAt: new Date('2025-01-01T00:00:00.000Z') }));

    await expect(updateBooking(instructorActor('person_instructor'), 'booking_1', { notes: 'x' })).rejects.toThrow(ForbiddenError);
  });

  it('staff editing someone else\'s ALREADY-STARTED booking succeeds — no BOOKING_ALREADY_STARTED for staff ("lo staff può sempre")', async () => {
    bookingFindUnique.mockResolvedValue({
      ...EXISTING_OWN_BOOKING,
      personId: 'someone_else',
      startsAt: new Date(PAST_STARTS_AT),
      endsAt: new Date(PAST_ENDS_AT),
    });

    const result = await updateBooking(adminActor(), 'booking_1', { notes: 'x' });

    expect(result.id).toBe('booking_1');
  });

  it('staff\'s edit is exempt from BOOKING_IN_PAST on the new interval (deliberate asymmetry with own-path/create)', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    const result = await updateBooking(adminActor(), 'booking_1', { startsAt: PAST_STARTS_AT, endsAt: PAST_ENDS_AT });

    expect(result.id).toBe('booking_1');
  });

  // --- Scheduling window on the MOVE path (story 15.4 review, PO decision
  // 2026-08-03) — `assertWithinSchedulingWindow` used to run on create and on
  // `PENDING -> APPROVED` only, so a PATCH could park a booking outside the
  // airfield's opening hours and answer 200 (measured end-to-end), which also
  // made the "Sposta" panel's own `BOOKING_OUTSIDE_WINDOW` branch unreachable.
  // FUTURE_STARTS_AT/FUTURE_ENDS_AT are 12:00-13:00 Europe/Rome (CEST).

  it('moving a booking OUTSIDE the configured window answers 422 BOOKING_OUTSIDE_WINDOW — for STAFF too, before the transaction opens', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '14:00', closeTime: '18:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    const error = await updateBooking(adminActor(), 'booking_1', { startsAt: FUTURE_STARTS_AT, endsAt: FUTURE_ENDS_AT }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('moving a booking INSIDE the configured window still succeeds (the check reads the RESULTING interval)', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '07:00', closeTime: '21:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    const result = await updateBooking(adminActor(), 'booking_1', { startsAt: FUTURE_STARTS_AT, endsAt: FUTURE_ENDS_AT });

    expect(result.id).toBe('booking_1');
  });

  it('moving a booking beyond maxAdvanceDays answers 422 BOOKING_OUTSIDE_WINDOW as well', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: null, closeTime: null, minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: 1 });

    // 2099-06-01 is always more than 1 day ahead, whenever this suite runs.
    const error = await updateBooking(adminActor(), 'booking_1', { startsAt: FUTURE_STARTS_AT, endsAt: FUTURE_ENDS_AT }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
  });

  it('an own-path actor with no linked personId (and no instructorProfileId on the booking) gets 403', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    await expect(updateBooking(pilotActor(null), 'booking_1', { notes: 'x' })).rejects.toThrow(ForbiddenError);
  });

  it('partial merge: only notes provided keeps the existing aircraft/interval', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    await updateBooking(adminActor(), 'booking_1', { notes: 'Solo una nota' });

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

    const error = await updateBooking(adminActor(), 'booking_1', { startsAt: afterCurrentEndsAt }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('notes: null explicitly clears the field', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, notes: 'Nota precedente' });

    await updateBooking(adminActor(), 'booking_1', { notes: null });

    expect(bookingUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ notes: null }) }));
  });

  it('a resulting endsAt <= startsAt answers 422 (merged values, not the raw patch)', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    const error = await updateBooking(adminActor(), 'booking_1', { endsAt: FUTURE_STARTS_AT }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
  });

  it('an unknown destination aircraft (empty lock result) answers 404', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    queryRaw.mockResolvedValue([]);

    await expect(updateBooking(adminActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('an archived destination aircraft answers 409', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    queryRaw.mockResolvedValue([{ id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null, archivedAt: new Date('2025-01-01T00:00:00.000Z') }]);

    await expect(updateBooking(adminActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(ConflictError);
  });

  it('an OUT_OF_SERVICE destination aircraft answers 422 AIRCRAFT_OUT_OF_SERVICE, even for staff', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    queryRaw.mockResolvedValue([{ id: 'aircraft_2', status: 'OUT_OF_SERVICE', statusReason: 'Revisione motore', outOfServiceUntil: null, archivedAt: null }]);

    const error = await updateBooking(adminActor(), 'booking_1', { aircraftId: 'aircraft_2' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('AIRCRAFT_OUT_OF_SERVICE');
  });

  it('changing aircraft locks BOTH the current and destination Aircraft ids in ONE ordered IN (...) query', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING); // current aircraft_1
    queryRaw.mockResolvedValue([
      { id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null, archivedAt: null },
      { id: 'aircraft_2', status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null, archivedAt: null },
    ]);

    await updateBooking(adminActor(), 'booking_1', { aircraftId: 'aircraft_2' });

    // Story 16.3 (AD-2) + review MAJOR-2: THREE `$queryRaw` now — this
    // booking's own row (next test), every Aircraft row in the ONE ordered
    // query below, then the booking's people in ONE `Person` statement (story
    // 19.10, AD-5; no instructor on this booking, so one id), `FOR NO KEY
    // UPDATE` (lead decision 2026-09-27: never blocks a foreign-key check).
    expect(queryRawMock).toHaveBeenCalledTimes(3);
    const [strings, joined] = queryRawMock.mock.calls[1] as unknown as [TemplateStringsArray, { values: string[] }];
    expect(strings.join('?')).toContain('FOR UPDATE');
    expect(strings.join('?')).toContain('IN');
    expect(strings.join('?')).toContain('ORDER BY');
    expect(joined.values.slice().sort()).toEqual(['aircraft_1', 'aircraft_2']);
    const [personStrings, personIds] = queryRawMock.mock.calls[2] as unknown as [TemplateStringsArray, { values: string[] }];
    expect(personStrings.join('?')).toBe('SELECT "id" FROM "Person" WHERE "id" IN (?) ORDER BY "id" FOR NO KEY UPDATE');
    expect(personIds.values).toEqual(['person_pilot']);
  });

  it('locks THIS booking row FIRST — before the Aircraft lock and the guarded updateMany, the order transitionBooking uses — so a move and an approval of the same booking serialize instead of deadlocking (review 16.3 MAJOR-2)', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    await updateBooking(adminActor(), 'booking_1', { notes: 'x' });

    const [bookingStrings, bookingId] = queryRawMock.mock.calls[0] as unknown as [TemplateStringsArray, string];
    expect(bookingStrings.join('?')).toBe('SELECT "id" FROM "Booking" WHERE "id" = ? FOR UPDATE');
    expect(bookingId).toBe('booking_1');
    const [bookingLock, aircraftLock] = queryRawMock.mock.invocationCallOrder;
    expect(bookingLock).toBeLessThan(aircraftLock!);
    expect(aircraftLock).toBeLessThan(bookingUpdateManyMock.mock.invocationCallOrder[0]!);
  });

  it('a same-aircraft edit locks only ONE id (the 1-element set collapses, same as createBooking)', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    await updateBooking(adminActor(), 'booking_1', { notes: 'x' });

    const [, joined] = queryRawMock.mock.calls[1] as unknown as [TemplateStringsArray, { values: string[] }];
    expect(joined.values).toEqual(['aircraft_1']);
  });

  it('the overlap pre-check excludes THIS booking and every CANCELLED row', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);

    await updateBooking(adminActor(), 'booking_1', { notes: 'x' });

    expect(bookingFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'booking_1' }, status: 'APPROVED' }),
      }),
    );
  });

  it('an overlapping destination interval answers 409', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    bookingFindFirst.mockResolvedValue({ id: 'other_booking' });

    await expect(updateBooking(adminActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(ConflictError);
  });

  it('a concurrent cancel racing the atomic guard (updateMany count 0) answers 409', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    bookingUpdateMany.mockResolvedValue({ count: 0 });

    await expect(updateBooking(adminActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(ConflictError);
  });

  // --- PENDING/APPROVED editable set (Story 12.2, AC 4) -------------------

  it('a PENDING booking is also editable (was ACTIVE-only) — the atomic guard keys off the CURRENT status', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, status: 'PENDING' });

    const result = await updateBooking(adminActor(), 'booking_1', { notes: 'x' });

    expect(result.id).toBe('booking_1');
    expect(bookingUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'booking_1', status: 'PENDING' } }));
  });

  it.each(['DENIED', 'FLOWN', 'NO_SHOW'] as const)('a %s booking is NOT editable — 409 from the fast pre-check', async (status) => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, status });

    await expect(updateBooking(adminActor(), 'booking_1', { notes: 'x' })).rejects.toThrow(ConflictError);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe('cancelBooking (Story 7.3, AC 1/2)', () => {
  it('a student (no bookings.manage.own) gets 403 straight from authorize() — no queries at all', async () => {
    await expect(cancelBooking(studentActor(), 'booking_1')).rejects.toThrow(ForbiddenError);
    expect(bookingFindUniqueMock).not.toHaveBeenCalled();
  });

  it('an unknown booking id answers 404', async () => {
    bookingFindUnique.mockResolvedValue(null);

    await expect(cancelBooking(adminActor(), 'ghost')).rejects.toThrow(NotFoundError);
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

    const result = await cancelBooking(adminActor(), 'booking_1');

    expect(result.id).toBe('booking_1');
  });

  it('an instructor cancelling a booking via a matching instructorProfileId succeeds', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, personId: 'person_student', person: ACTIVE_STUDENT_PERSON, instructorProfileId: 'instr_profile_1', instructorProfile: INSTRUCTOR_HOLDER });
    instructorProfileFindUnique.mockResolvedValue(instructorProfileRow());

    const result = await cancelBooking(instructorActor('person_instructor'), 'booking_1');

    expect(result.id).toBe('booking_1');
  });

  it('a double-cancel race (updateMany count 0) answers 409, safe against a concurrent cancel', async () => {
    bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
    bookingUpdateMany.mockResolvedValue({ count: 0 });

    await expect(cancelBooking(adminActor(), 'booking_1')).rejects.toThrow(ConflictError);
  });

  // --- PENDING/APPROVED cancellable set (Story 12.2, AC 4) ----------------

  it('a PENDING booking is also cancellable (was ACTIVE-only) — the atomic guard keys off the CURRENT status', async () => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, status: 'PENDING' });

    const result = await cancelBooking(adminActor(), 'booking_1');

    expect(result.id).toBe('booking_1');
    expect(bookingUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'booking_1', status: 'PENDING' } }),
    );
  });

  it.each(['DENIED', 'FLOWN', 'NO_SHOW'] as const)('a %s booking is NOT cancellable — 409 from the fast pre-check', async (status) => {
    bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, status });

    await expect(cancelBooking(adminActor(), 'booking_1')).rejects.toThrow(ConflictError);
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });
});

// --- transitionBooking (Story 12.2, AC 3/5/6/7) -----------------------------
// The booking approval workflow: PENDING/APPROVED/DENIED/FLOWN/NO_SHOW.

/** The `FOR UPDATE` lock row `transitionBooking` reads first — shape of the raw `$queryRaw` result, NOT `BOOKING_SELECT` (no joins). */
type LockedBookingFixture = { id: string; status: string; personId: string; instructorProfileId: string | null; aircraftId: string; startsAt: Date; endsAt: Date };

const BASE_LOCKED_BOOKING: LockedBookingFixture = {
  id: 'booking_1',
  status: 'PENDING',
  personId: 'person_pilot',
  // Story 16.3 (AD-1/AD-4): the lock row now carries the instructor too.
  instructorProfileId: null,
  aircraftId: 'aircraft_1',
  startsAt: new Date(FUTURE_STARTS_AT),
  endsAt: new Date(FUTURE_ENDS_AT),
};

/** Queues the booking-row lock read (`transitionBooking`'s FIRST `$queryRaw` call) — a `mockResolvedValueOnce`, so it is consumed by that first call only. A SECOND `$queryRaw` call (the Aircraft lock, APPROVE only) falls through to `beforeEach`'s base `queryRaw.mockResolvedValue(LOCKED_OPERATIONAL_AIRCRAFT)`. */
function mockBookingLock(overrides: Partial<LockedBookingFixture> = {}): void {
  queryRaw.mockResolvedValueOnce([{ ...BASE_LOCKED_BOOKING, ...overrides }]);
}

/** Story 16.3 (ops F9, AD-5): `FLOWN`/`NO_SHOW` need a slot that has STARTED — BASE_LOCKED_BOOKING starts in 2099, so every closing test spreads this in. */
const STARTED_SLOT = { startsAt: new Date(PAST_STARTS_AT), endsAt: new Date(PAST_ENDS_AT) };

describe('transitionBooking (Story 12.2, AC 3)', () => {
  it('a non-staff actor (no bookings.manage.any) gets 403 straight from authorize() — no queries at all, not even for "riapri"', async () => {
    await expect(transitionBooking(pilotActor(), 'booking_1', { to: 'APPROVED' })).rejects.toThrow(ForbiddenError);
    await expect(transitionBooking(instructorActor(), 'booking_1', { to: 'PENDING' })).rejects.toThrow(ForbiddenError);
    await expect(transitionBooking(studentActor(), 'booking_1', { to: 'DENIED', reason: 'x' })).rejects.toThrow(ForbiddenError);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('an unknown booking id (empty lock result) answers 404', async () => {
    queryRaw.mockResolvedValueOnce([]);

    await expect(transitionBooking(adminActor(), 'ghost', { to: 'APPROVED' })).rejects.toThrow(NotFoundError);
  });

  it('DENY without a reason answers 422 BOOKING_DENY_REASON_REQUIRED, checked BEFORE the transaction ever opens', async () => {
    const error = await transitionBooking(adminActor(), 'booking_1', { to: 'DENIED' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_DENY_REASON_REQUIRED');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('PENDING -> APPROVED stamps decidedAt/decidedByUserId', async () => {
    mockBookingLock({ status: 'PENDING' });

    const result = await transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' });

    expect(result.id).toBe('booking_1');
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: 'PENDING' },
      data: { status: 'APPROVED', decidedAt: expect.any(Date), decidedByUserId: 'admin_1' },
    });
  });

  it('PENDING -> DENIED with a reason stamps denyReason/decidedAt/decidedByUserId', async () => {
    mockBookingLock({ status: 'PENDING' });

    await transitionBooking(adminActor(), 'booking_1', { to: 'DENIED', reason: 'Aeromobile richiesto per manutenzione' });

    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: 'PENDING' },
      data: {
        status: 'DENIED',
        decidedAt: expect.any(Date),
        decidedByUserId: 'admin_1',
        denyReason: 'Aeromobile richiesto per manutenzione',
      },
    });
  });

  it('APPROVED -> FLOWN stamps closedAt/closedByUserId', async () => {
    mockBookingLock({ status: 'APPROVED', ...STARTED_SLOT });

    await transitionBooking(adminActor(), 'booking_1', { to: 'FLOWN' });

    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: 'APPROVED' },
      data: { status: 'FLOWN', closedAt: expect.any(Date), closedByUserId: 'admin_1' },
    });
  });

  it('APPROVED -> NO_SHOW stamps closedAt/closedByUserId', async () => {
    mockBookingLock({ status: 'APPROVED', ...STARTED_SLOT });

    await transitionBooking(adminActor(), 'booking_1', { to: 'NO_SHOW' });

    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: 'APPROVED' },
      data: { status: 'NO_SHOW', closedAt: expect.any(Date), closedByUserId: 'admin_1' },
    });
  });

  it.each(['DENIED', 'FLOWN', 'NO_SHOW'] as const)('%s -> PENDING ("riapri") clears every decision/closure field', async (from) => {
    mockBookingLock({ status: from });

    await transitionBooking(adminActor(), 'booking_1', { to: 'PENDING' });

    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking_1', status: from },
      data: { status: 'PENDING', decidedAt: null, decidedByUserId: null, denyReason: null, closedAt: null, closedByUserId: null },
    });
  });

  it('a race where the atomic guard finds 0 rows (status changed since the lock) answers 409', async () => {
    mockBookingLock({ status: 'PENDING' });
    bookingUpdateMany.mockResolvedValue({ count: 0 });

    await expect(transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' })).rejects.toThrow(ConflictError);
  });

  // --- PENDING -> APPROVED re-checks (same rules as createBooking) --------

  it('a booking outside the configured scheduling window answers 422 BOOKING_OUTSIDE_WINDOW on APPROVE (Story 12.11, AC 4)', async () => {
    mockBookingLock({ status: 'PENDING' });
    vi.mocked(getSchedulingSettings).mockResolvedValue({ openTime: '13:00', closeTime: '21:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });

    const error = await transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_OUTSIDE_WINDOW');
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });

  it('an OUT_OF_SERVICE aircraft answers 422 AIRCRAFT_OUT_OF_SERVICE', async () => {
    mockBookingLock({ status: 'PENDING' });
    queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1', status: 'OUT_OF_SERVICE', statusReason: 'Revisione motore', outOfServiceUntil: null, archivedAt: null }]);

    const error = await transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('AIRCRAFT_OUT_OF_SERVICE');
  });

  it('an archived aircraft answers 409', async () => {
    mockBookingLock({ status: 'PENDING' });
    queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null, archivedAt: new Date('2025-01-01T00:00:00.000Z') }]);

    await expect(transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' })).rejects.toThrow(ConflictError);
  });

  it('an overlapping APPROVED booking on the same aircraft/interval answers 409, excluding this booking itself', async () => {
    mockBookingLock({ status: 'PENDING' });
    bookingFindFirst.mockResolvedValue({ id: 'other_booking' });

    await expect(transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' })).rejects.toThrow(ConflictError);

    expect(bookingFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 'booking_1' }, status: 'APPROVED' }) }),
    );
  });

  it('no re-checks happen for DENY/FLOWN/NO_SHOW/riapri — only APPROVE re-runs expiry/aircraft/overlap', async () => {
    mockBookingLock({ status: 'APPROVED', ...STARTED_SLOT });

    await transitionBooking(adminActor(), 'booking_1', { to: 'FLOWN' });

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
        // Story 16.3: a closing target runs on a STARTED slot (STARTED_SLOT) — the matrix stays exhaustive on status.
        mockBookingLock(to === 'FLOWN' || to === 'NO_SHOW' ? { status: from, ...STARTED_SLOT } : { status: from });
        const reason = to === 'DENIED' ? 'Motivo di test' : undefined;

        if (legal) {
          const result = await transitionBooking(adminActor(), 'booking_1', { to, reason });
          expect(result.id).toBe('booking_1');
          expect(bookingUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'booking_1', status: from } }));
        } else {
          const error = await transitionBooking(adminActor(), 'booking_1', { to, reason }).catch((e: unknown) => e);
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

    await transitionBooking(adminActor(), 'booking_1', { to: 'DENIED', reason: 'Manutenzione straordinaria' });

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

    await transitionBooking(adminActor(), 'booking_1', { to: 'DENIED', reason: 'x' });

    expect(buildBookingDeniedEmail).toHaveBeenCalledWith('it', expect.anything());
  });

  it('a person with no email on file is a SILENT skip — no send, no throw, transition still succeeds', async () => {
    mockBookingLock({ status: 'PENDING' });
    personFindUnique.mockImplementation(async () => ({ email: null }));

    const result = await transitionBooking(adminActor(), 'booking_1', { to: 'DENIED', reason: 'x' });

    expect(result.id).toBe('booking_1');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('a failing SMTP send never fails the transition — swallowed with console.error, no throw', async () => {
    mockBookingLock({ status: 'PENDING' });
    sendMock.mockRejectedValue(new Error('SMTP down'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await transitionBooking(adminActor(), 'booking_1', { to: 'DENIED', reason: 'x' });

    expect(result.id).toBe('booking_1');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it.each(['APPROVED', 'FLOWN', 'NO_SHOW', 'PENDING'] as const)('%s never sends an email (only DENIED does, AC 5)', async (to) => {
    mockBookingLock({ status: to === 'APPROVED' ? 'PENDING' : to === 'PENDING' ? 'DENIED' : 'APPROVED', ...STARTED_SLOT });

    await transitionBooking(adminActor(), 'booking_1', { to });

    expect(sendMock).not.toHaveBeenCalled();
  });
});

// --- Story 16.3: one person in one place (ops F2/F4/F9) ----------------------
// The recon probe's twelve cases carry their ids (A0..C3, story file AC 12):
// nine were RED on the pre-fix (A1-A4, B1-B3, C1-C2), three are pins GREEN on
// both sides (A0 the aircraft control, B4 ratifica R-16-b, C3 the started slot).

describe('Story 16.3 — person/instructor overlap on the three write paths (ops F2, AD-1/AD-2/AD-3)', () => {
  /** The conflicting APPROVED booking every overlap below answers with — `details` must name exactly this row (P1). */
  const ELSEWHERE = { id: 'booking_elsewhere', startsAt: new Date(FUTURE_STARTS_AT), endsAt: new Date(FUTURE_ENDS_AT) };
  const ELSEWHERE_DETAILS = { bookingId: 'booking_elsewhere', startsAt: FUTURE_STARTS_AT, endsAt: FUTURE_ENDS_AT };

  type OverlapKey = 'aircraftId' | 'personId' | 'instructorProfileId';
  const bookingFindFirstImpl = bookingFindFirstMock as unknown as {
    mockImplementation: (fn: (args: { where: Record<string, unknown> }) => Promise<Fixture>) => void;
  };

  /**
   * The three predicates are three separate `findFirst`s (AD-1), told apart by
   * their `where`: the aircraft one by its `aircraftId`, the person and the
   * instructor ones (story 19.10, R-19-o: an `OR` over the two roles) by the
   * key of their FIRST branch.
   */
  function subjectOf(where: Record<string, unknown>): OverlapKey {
    if ('aircraftId' in where) return 'aircraftId';
    const [first] = where['OR'] as Array<Record<string, unknown>>;
    return 'personId' in first! ? 'personId' : 'instructorProfileId';
  }

  /** The predicates of the subjects in `keys` find ELSEWHERE, every other one finds nothing. */
  function overlapOn(...keys: OverlapKey[]): void {
    bookingFindFirstImpl.mockImplementation(async (args) => (keys.includes(subjectOf(args.where)) ? ELSEWHERE : null));
  }

  type WritePath = 'create' | 'move' | 'approve';

  /** Runs one of the three call sites on a booking whose person is `person_student` (create) / `person_pilot` (move, approve) and whose instructor, when `withInstructor`, is `instr_profile_1`. */
  function runPath(path: WritePath, withInstructor = true): Promise<unknown> {
    const instructorProfileId = withInstructor ? 'instr_profile_1' : null;
    switch (path) {
      case 'create':
        personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
        return createBooking(adminActor(), baseInput({ personId: 'person_student', ...(instructorProfileId ? { instructorProfileId } : {}) }));
      case 'move':
        bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, instructorProfileId, instructorProfile: instructorProfileId ? INSTRUCTOR_HOLDER : null });
        return updateBooking(adminActor(), 'booking_1', { startsAt: '2099-06-01T12:00:00.000Z', endsAt: '2099-06-01T13:00:00.000Z' });
      case 'approve':
        mockBookingLock({ status: 'PENDING', instructorProfileId });
        return transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' });
    }
  }

  /** The person every path books for, and the interval every path ends up writing (the move's NEW interval). */
  const PATH_PERSON: Record<WritePath, string> = { create: 'person_student', move: 'person_pilot', approve: 'person_pilot' };
  const PATH_INTERVAL: Record<WritePath, { startsAt: Date; endsAt: Date }> = {
    create: { startsAt: new Date(FUTURE_STARTS_AT), endsAt: new Date(FUTURE_ENDS_AT) },
    move: { startsAt: new Date('2099-06-01T12:00:00.000Z'), endsAt: new Date('2099-06-01T13:00:00.000Z') },
    approve: { startsAt: new Date(FUTURE_STARTS_AT), endsAt: new Date(FUTURE_ENDS_AT) },
  };

  function expectNothingWritten(): void {
    expect(bookingCreateMock).not.toHaveBeenCalled();
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  }

  async function conflictOf(promise: Promise<unknown>): Promise<InstanceType<typeof ConflictError>> {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    return error as InstanceType<typeof ConflictError>;
  }

  /** The SQL text of every `$queryRaw` call so far (tagged templates: the strings array joined on the placeholders). */
  function rawSqls(): string[] {
    return queryRawMock.mock.calls.map((call) => (call[0] as unknown as TemplateStringsArray).join('?'));
  }

  beforeEach(() => {
    instructorProfileFindUnique.mockResolvedValue(instructorProfileRow());
  });

  it('A0 create (control, green before AND after): the SAME aircraft already APPROVED over the interval answers the aircraft 409 byte-identical — CONFLICT, same message, NO details', async () => {
    overlapOn('aircraftId');

    const error = await conflictOf(runPath('create', false));

    expect(error.code).toBe('CONFLICT');
    expect(error.message).toBe('This aircraft is already booked for an overlapping interval.');
    expect(error.details).toBeUndefined();
    expectNothingWritten();
  });

  it.each([
    { probe: 'A1', path: 'create' as const },
    { probe: 'A3', path: 'move' as const },
    { probe: 'A4', path: 'approve' as const },
  ])('$probe $path: the same person already APPROVED elsewhere over an overlapping interval answers 409 PERSON_BUSY naming the conflicting booking', async ({ path }) => {
    overlapOn('personId');

    const error = await conflictOf(runPath(path));

    expect(error.code).toBe('PERSON_BUSY');
    expect(error.message).toBe('This person already has an approved booking for an overlapping interval.');
    expect(error.details).toEqual(ELSEWHERE_DETAILS);
    expectNothingWritten();
  });

  it.each([
    { probe: 'A2', path: 'create' as const },
    { probe: 'A2m', path: 'move' as const },
    { probe: 'A2a', path: 'approve' as const },
  ])('$probe $path: the same instructor already APPROVED elsewhere over an overlapping interval answers 409 INSTRUCTOR_BUSY naming the conflicting booking', async ({ path }) => {
    overlapOn('instructorProfileId');

    const error = await conflictOf(runPath(path));

    expect(error.code).toBe('INSTRUCTOR_BUSY');
    expect(error.message).toBe('This instructor already has an approved booking for an overlapping interval.');
    expect(error.details).toEqual(ELSEWHERE_DETAILS);
    expectNothingWritten();
  });

  it.each(['create', 'move', 'approve'] as const)('%s: precedence AIRCRAFT -> PERSON -> INSTRUCTOR — with all three busy the answer is the aircraft 409, unchanged (AC 1/4)', async (path) => {
    overlapOn('aircraftId', 'personId', 'instructorProfileId');

    const error = await conflictOf(runPath(path));

    expect(error.code).toBe('CONFLICT');
    expect(error.message).toBe('This aircraft is already booked for an overlapping interval.');
    expect(error.details).toBeUndefined();
    // The aircraft answered first: the other two predicates never ran.
    expect(bookingFindFirstMock).toHaveBeenCalledTimes(1);
  });

  it.each(['create', 'move', 'approve'] as const)('%s: with the person AND the instructor busy, the person wins (PERSON_BUSY)', async (path) => {
    overlapOn('personId', 'instructorProfileId');

    const error = await conflictOf(runPath(path));

    expect(error.code).toBe('PERSON_BUSY');
  });

  it.each(['create', 'move', 'approve'] as const)(
    '%s: the person and instructor predicates are the aircraft one re-keyed on ONE human in either role (story 19.10, R-19-o) — APPROVED only [I-c], semi-open [I-b], self excluded where the aircraft one excludes it, earliest first',
    async (path) => {
      await runPath(path);

      const { startsAt, endsAt } = PATH_INTERVAL[path];
      const excludeSelf = path === 'create' ? {} : { id: { not: 'booking_1' } };
      const shared = { ...excludeSelf, status: 'APPROVED', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } };
      // The aircraft predicate is untouched by story 19.10, byte for byte.
      expect(bookingFindFirstMock).toHaveBeenNthCalledWith(1, { where: { aircraftId: 'aircraft_1', ...shared }, select: { id: true } });
      // The booking's person holds no instructor profile here: the R-19-o half is the next test.
      expect(bookingFindFirstMock).toHaveBeenNthCalledWith(2, {
        where: { OR: [{ personId: PATH_PERSON[path] }], ...shared },
        orderBy: { startsAt: 'asc' },
        select: { id: true, startsAt: true, endsAt: true },
      });
      expect(bookingFindFirstMock).toHaveBeenNthCalledWith(3, {
        where: { OR: [{ instructorProfileId: 'instr_profile_1' }, { personId: 'person_instructor' }], ...shared },
        orderBy: { startsAt: 'asc' },
        select: { id: true, startsAt: true, endsAt: true },
      });
    },
  );

  it.each(['create', 'move', 'approve'] as const)(
    '%s: a person who ALSO holds an instructor profile is busy as the instructor of another booking too — the predicate reads that profile id, never a join (story 19.10, R-19-o, §E)',
    async (path) => {
      const withProfile = (person: Fixture) => ({ ...person, instructorProfile: { id: 'ip_of_person', deactivatedAt: null } });
      personFindUnique.mockImplementation(async () => withProfile(ACTIVE_STUDENT_PERSON));
      personFindUniqueOrThrow.mockResolvedValue(withProfile(ACTIVE_PILOT_PERSON));
      if (path === 'create') {
        await createBooking(adminActor(), baseInput({ personId: 'person_student', instructorProfileId: 'instr_profile_1' }));
      } else if (path === 'move') {
        bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, person: withProfile(ACTIVE_PILOT_PERSON), instructorProfileId: 'instr_profile_1', instructorProfile: INSTRUCTOR_HOLDER });
        await updateBooking(adminActor(), 'booking_1', { startsAt: '2099-06-01T12:00:00.000Z', endsAt: '2099-06-01T13:00:00.000Z' });
      } else {
        mockBookingLock({ status: 'PENDING', instructorProfileId: 'instr_profile_1' });
        await transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' });
      }

      const personWhere = (bookingFindFirstMock.mock.calls[1]![0] as { where: { OR: unknown[] } }).where.OR;
      expect(personWhere).toEqual([{ personId: PATH_PERSON[path] }, { instructorProfileId: 'ip_of_person' }]);
    },
  );

  it.each(['create', 'move', 'approve'] as const)('%s: a booking WITHOUT an instructor never runs the third predicate (2 findFirst, not 3) and locks ONE person', async (path) => {
    await runPath(path, false);

    expect(bookingFindFirstMock).toHaveBeenCalledTimes(2);
    const personLock = queryRawMock.mock.calls.find((call) => (call[0] as unknown as TemplateStringsArray).join('?').includes('FROM "Person"'));
    expect((personLock![1] as unknown as { values: string[] }).values).toEqual([PATH_PERSON[path]]);
  });

  it.each(['create', 'move', 'approve'] as const)(
    '%s: the booking\'s two people are locked in ONE Person statement (IN, ORDER BY id, FOR NO KEY UPDATE), right AFTER the Aircraft lock and BEFORE the first overlap predicate — no InstructorProfile lock (story 19.10, AD-5, AC 19)',
    async (path) => {
      await runPath(path);

      const sqls = rawSqls();
      const lockedTables = sqls.map((sql) => /FROM "(\w+)"/.exec(sql)?.[1]);
      // A move and an approval lock the booking they write FIRST (review 16.3
      // MAJOR-2); a create has no booking row yet.
      expect(lockedTables).toEqual(path === 'create' ? ['Aircraft', 'Person'] : ['Booking', 'Aircraft', 'Person']);
      expect(sqls.some((sql) => sql.includes('"InstructorProfile"'))).toBe(false);
      const personLock = lockedTables.indexOf('Person');
      // The Booking/Aircraft locks stay FOR UPDATE; the people one is FOR NO
      // KEY UPDATE (lead decision 2026-09-27, `lockBookingPeople`).
      expect(sqls.slice(0, personLock).every((sql) => /FOR UPDATE$/.test(sql.trim()))).toBe(true);
      expect(sqls[personLock]).toBe('SELECT "id" FROM "Person" WHERE "id" IN (?) ORDER BY "id" FOR NO KEY UPDATE');
      expect((queryRawMock.mock.calls[personLock]![1] as unknown as { values: string[] }).values).toEqual([PATH_PERSON[path], 'person_instructor']);
      expect(queryRawMock.mock.invocationCallOrder[personLock]!).toBeLessThan(bookingFindFirstMock.mock.invocationCallOrder[0]!);
    },
  );

  it('move: a legacy booking whose instructor holder IS its person locks that one person once', async () => {
    bookingFindUnique.mockResolvedValue({
      ...EXISTING_OWN_BOOKING,
      instructorProfileId: 'instr_profile_1',
      instructorProfile: { personId: 'person_pilot', person: { firstName: 'Mario', lastName: 'Rossi' } },
    });

    await updateBooking(adminActor(), 'booking_1', { notes: 'x' });

    const personLock = queryRawMock.mock.calls.find((call) => (call[0] as unknown as TemplateStringsArray).join('?').includes('FROM "Person"'));
    expect((personLock![1] as unknown as { values: string[] }).values).toEqual(['person_pilot']);
  });

  it("approve: the Booking row lock reads the booking's instructorProfileId (without it the INSTRUCTOR_BUSY predicate and the F4 re-check have no data — story §5)", async () => {
    await runPath('approve');

    expect(rawSqls()[0]).toContain('"instructorProfileId"');
  });
});

describe('Story 16.3 — the approval re-checks WHO is approved, with createBooking\'s own codes (ops F4, AD-4, R-16-b)', () => {
  /** Runs `createBooking` (staff) and the approval of a PENDING booking against the SAME person/instructor fixture and returns both errors — the proof of "lo stesso codice che createBooking darebbe" (P3). */
  async function createVsApprove(
    person: Fixture,
    instructorProfileId: string | null = null,
  ): Promise<{ onCreate: unknown; onApprove: unknown }> {
    personFindUnique.mockImplementation(async () => person);
    const onCreate = await createBooking(adminActor(), baseInput(instructorProfileId ? { instructorProfileId } : {})).catch((e: unknown) => e);

    personFindUniqueOrThrow.mockResolvedValue(person);
    mockBookingLock({ status: 'PENDING', instructorProfileId });
    const onApprove = await transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' }).catch((e: unknown) => e);
    return { onCreate, onApprove };
  }

  function shapeOf(error: unknown): [unknown, string, string] {
    const domainError = error as { constructor: unknown; code: string; message: string };
    return [domainError.constructor, domainError.code, domainError.message];
  }

  it('B1 approve: an ARCHIVED person cannot be approved — the SAME 409 createBooking gives', async () => {
    const { onCreate, onApprove } = await createVsApprove({ ...ACTIVE_PILOT_PERSON, archivedAt: new Date('2025-01-01T00:00:00.000Z') });

    expect(onApprove).toBeInstanceOf(ConflictError);
    expect(shapeOf(onApprove)).toEqual([ConflictError, 'CONFLICT', 'Cannot book an aircraft for an archived person.']);
    expect(shapeOf(onApprove)).toEqual(shapeOf(onCreate));
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });

  it('B2 approve: a person whose ONLY flying profile is DEACTIVATED cannot be approved — 422 PERSON_NOT_BOOKABLE, as on create', async () => {
    const { onCreate, onApprove } = await createVsApprove(DEACTIVATED_PILOT_PERSON);

    expect(onApprove).toBeInstanceOf(ValidationError);
    expect(shapeOf(onApprove)).toEqual([ValidationError, 'PERSON_NOT_BOOKABLE', 'Person must have an active pilot, student or instructor profile to be booked.']);
    expect(shapeOf(onApprove)).toEqual(shapeOf(onCreate));
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });

  it('B3 approve: a DEACTIVATED instructor profile on the booking cannot be approved — 409, as on create', async () => {
    instructorProfileFindUnique.mockResolvedValue(instructorProfileRow('instr_profile_1', { deactivatedAt: new Date('2025-01-01T00:00:00.000Z') }));

    const { onCreate, onApprove } = await createVsApprove(ACTIVE_PILOT_PERSON, 'instr_profile_1');

    expect(onApprove).toBeInstanceOf(ConflictError);
    expect(shapeOf(onApprove)).toEqual([ConflictError, 'CONFLICT', 'This instructor profile is deactivated.']);
    expect(shapeOf(onApprove)).toEqual(shapeOf(onCreate));
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });

  it("re-loads the booking's OWN person (the one read under the Booking lock) with the same select createBooking uses", async () => {
    mockBookingLock({ status: 'PENDING', personId: 'person_someone' });

    await transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' });

    expect(personFindUniqueOrThrowMock).toHaveBeenCalledWith({
      where: { id: 'person_someone' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        archivedAt: true,
        pilotProfile: { select: { deactivatedAt: true } },
        studentProfile: { select: { deactivatedAt: true } },
        instructorProfile: { select: { id: true, deactivatedAt: true } },
        account: { select: { id: true } },
      },
    });
  });

  it('precedence: an archived person WITH a failed requirement answers the 409 archived (as createBooking would), not 422 REQUIREMENTS_NOT_MET — the person re-checks run FIRST', async () => {
    personFindUniqueOrThrow.mockResolvedValue({ ...ACTIVE_PILOT_PERSON, archivedAt: new Date('2025-01-01T00:00:00.000Z') });
    evaluateRequirementsMock.mockResolvedValue([{ type: 'MEMBERSHIP', role: 'person', personName: 'Mario Rossi', expiresAt: null }]);
    mockBookingLock({ status: 'PENDING' });

    const error = await transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as InstanceType<typeof ConflictError>).message).toBe('Cannot book an aircraft for an archived person.');
    expect(evaluateRequirementsMock).not.toHaveBeenCalled();
  });

  it('B4 approve (pin, green before AND after — ratifica R-16-b): approving a booking that ALREADY STARTED stays permitted — no temporal guard on APPROVED', async () => {
    mockBookingLock({ status: 'PENDING', startsAt: new Date(PAST_STARTS_AT), endsAt: new Date(PAST_ENDS_AT) });

    const result = await transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' });

    expect(result.id).toBe('booking_1');
    expect(bookingUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }));
  });

  it('DENY re-checks nothing about the person (only APPROVE re-runs createBooking\'s checks)', async () => {
    personFindUniqueOrThrow.mockResolvedValue({ ...ACTIVE_PILOT_PERSON, archivedAt: new Date('2025-01-01T00:00:00.000Z') });
    mockBookingLock({ status: 'PENDING' });

    await transitionBooking(adminActor(), 'booking_1', { to: 'DENIED', reason: 'x' });

    expect(personFindUniqueOrThrowMock).not.toHaveBeenCalled();
  });
});

describe('Story 16.3 — FLOWN/NO_SHOW only once the slot has started (ops F9, AD-5, R-16-b)', () => {
  it.each([
    { probe: 'C1', to: 'FLOWN' as const },
    { probe: 'C2', to: 'NO_SHOW' as const },
  ])('$probe: $to on a booking that starts in the FUTURE answers 422 BOOKING_NOT_STARTED (the audit\'s 2027 probe, pinned on 2099 so it never ages)', async ({ to }) => {
    mockBookingLock({ status: 'APPROVED' }); // BASE_LOCKED_BOOKING starts 2099-06-01

    const error = await transitionBooking(adminActor(), 'booking_1', { to }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_NOT_STARTED');
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });

  it.each(['FLOWN', 'NO_SHOW'] as const)('C3 (pin, green before AND after): %s on a slot that HAS STARTED but not ended yet succeeds — the in-progress slot closes (AD-5: startsAt, not endsAt)', async (to) => {
    const now = Date.now();
    mockBookingLock({ status: 'APPROVED', startsAt: new Date(now - 30 * 60_000), endsAt: new Date(now + 30 * 60_000) });

    const result = await transitionBooking(adminActor(), 'booking_1', { to });

    expect(result.id).toBe('booking_1');
    expect(bookingUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: to }) }));
  });

  it.each(['FLOWN', 'NO_SHOW', 'DENIED'] as const)('"riapri" %s -> PENDING on a FUTURE booking still succeeds — the remedy for a wrong closure is never blocked', async (from) => {
    mockBookingLock({ status: from });
    expect(BASE_LOCKED_BOOKING.startsAt.getTime()).toBeGreaterThan(Date.now());

    const result = await transitionBooking(adminActor(), 'booking_1', { to: 'PENDING' });

    expect(result.id).toBe('booking_1');
  });

  it('an ILLEGAL pair on a future booking still answers BOOKING_TRANSITION_INVALID — the matrix is checked before the temporal guard', async () => {
    mockBookingLock({ status: 'PENDING' });

    const error = await transitionBooking(adminActor(), 'booking_1', { to: 'FLOWN' }).catch((e: unknown) => e);

    expect((error as InstanceType<typeof ValidationError>).code).toBe('BOOKING_TRANSITION_INVALID');
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

    const result = await createBooking(adminActor(), baseInput({ personId: 'person_student' }));

    expect(result.booking.id).toBe('booking_1');
  });
});

describe('Story 19.10 — the requirements of a booking on its three write paths (AC 1-5, 7-9, 12, 13, 21)', () => {
  const FAILURE = { type: 'MEMBERSHIP' as const, role: 'person' as const, personName: 'Mario Rossi', expiresAt: null };
  type WritePath = 'create' | 'move' | 'approve';

  /** One write per path, for the pilot `person_pilot` on `aircraft_1` (the move keeps both, shifting the slot by an hour). */
  function runPath(path: WritePath, input: { force?: boolean; startsAt?: string; endsAt?: string } = {}, actor: Actor = adminActor()): Promise<unknown> {
    switch (path) {
      case 'create':
        personFindUnique.mockImplementation(async () => ACTIVE_PILOT_PERSON);
        return createBooking(actor, baseInput({ personId: 'person_pilot', ...input }));
      case 'move':
        bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
        return updateBooking(actor, 'booking_1', { startsAt: '2099-06-01T12:00:00.000Z', endsAt: '2099-06-01T13:00:00.000Z', ...input });
      case 'approve':
        mockBookingLock({ status: 'PENDING', ...(input.startsAt ? { startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt!) } : {}) });
        return transitionBooking(actor, 'booking_1', { to: 'APPROVED', ...(input.force !== undefined ? { force: input.force } : {}) });
    }
  }

  function writtenData(path: WritePath): Record<string, unknown> {
    const call = path === 'create' ? bookingCreateMock.mock.calls[0] : bookingUpdateManyMock.mock.calls[0];
    return (call?.[0] as unknown as { data: Record<string, unknown> }).data;
  }

  function lastInput(): RequirementsInput {
    return evaluateRequirementsMock.mock.calls.at(-1)![0] as RequirementsInput;
  }

  async function errorOf(promise: Promise<unknown>): Promise<{ code?: string; details?: unknown; constructor: unknown }> {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    return error as { code?: string; details?: unknown; constructor: unknown };
  }

  function expectNothingWritten(): void {
    expect(bookingCreateMock).not.toHaveBeenCalled();
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  }

  describe('AC 1 — one 422 REQUIREMENTS_NOT_MET, the failures in the shared shape', () => {
    it.each(['create', 'move', 'approve'] as const)('%s: a failed requirement answers 422 REQUIREMENTS_NOT_MET whose details the flights schema validates, nothing written', async (path) => {
      evaluateRequirementsMock.mockResolvedValue([FAILURE]);

      const error = await errorOf(runPath(path));

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe('REQUIREMENTS_NOT_MET');
      expect(error.details).toEqual({ failures: [FAILURE] });
      expect(requirementsNotMetDetailsSchema.safeParse(error.details).success).toBe(true);
      expectNothingWritten();
    });
  });

  describe('AC 2 — the deroga is the LAST gate (TD 16.3-g): every non-derogable answer wins, with and without force', () => {
    const outOfService = [{ id: 'aircraft_1', status: 'OUT_OF_SERVICE', statusReason: 'Manutenzione', outOfServiceUntil: null, archivedAt: null }];
    const archived = [{ id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null, archivedAt: new Date('2025-01-01T00:00:00.000Z') }];
    const window = { openTime: '08:00', closeTime: '09:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null };

    beforeEach(() => {
      evaluateRequirementsMock.mockResolvedValue([FAILURE]);
    });

    it.each([false, true])('create in the past (force %s): 422 BOOKING_IN_PAST', async (force) => {
      expect((await errorOf(runPath('create', { force, startsAt: PAST_STARTS_AT, endsAt: PAST_ENDS_AT }))).code).toBe('BOOKING_IN_PAST');
      expectNothingWritten();
    });

    it('own move into the past: 422 BOOKING_IN_PAST', async () => {
      expect((await errorOf(runPath('move', { startsAt: PAST_STARTS_AT, endsAt: PAST_ENDS_AT }, pilotActor('person_pilot')))).code).toBe('BOOKING_IN_PAST');
      expectNothingWritten();
    });

    it.each([
      ['create', false],
      ['create', true],
      ['move', false],
      ['move', true],
      ['approve', false],
      ['approve', true],
    ] as const)('%s outside the window (force %s): 422 BOOKING_OUTSIDE_WINDOW', async (path, force) => {
      vi.mocked(getSchedulingSettings).mockResolvedValue(window);

      expect((await errorOf(runPath(path, { force }))).code).toBe('BOOKING_OUTSIDE_WINDOW');
      expectNothingWritten();
    });

    it.each([
      ['create', false],
      ['create', true],
      ['move', false],
      ['move', true],
      ['approve', false],
      ['approve', true],
    ] as const)('%s on an aircraft out of service (force %s): 422 AIRCRAFT_OUT_OF_SERVICE; on an archived one: 409', async (path, force) => {
      queryRaw.mockResolvedValue(outOfService);
      expect((await errorOf(runPath(path, { force }))).code).toBe('AIRCRAFT_OUT_OF_SERVICE');

      queryRaw.mockResolvedValue(archived);
      const archivedError = await errorOf(runPath(path, { force }));
      expect(archivedError).toBeInstanceOf(ConflictError);
      expectNothingWritten();
    });

    it.each([
      ['create', false],
      ['create', true],
      ['move', false],
      ['move', true],
      ['approve', false],
      ['approve', true],
    ] as const)('%s with an overlap (force %s): the 409, never the 422 — the three predicates ran before the decision', async (path, force) => {
      bookingFindFirst.mockResolvedValue({ id: 'booking_elsewhere', startsAt: new Date(FUTURE_STARTS_AT), endsAt: new Date(FUTURE_ENDS_AT) });

      const error = await errorOf(runPath(path, { force }));

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.code).toBe('CONFLICT');
      expectNothingWritten();
    });

    it.each(['create', 'move'] as const)('%s: evaluated BEFORE the transaction opens (no lock held during its queries), decided after the overlap predicates', async (path) => {
      await errorOf(runPath(path));

      expect(evaluateRequirementsMock.mock.invocationCallOrder[0]!).toBeLessThan(transactionMock.mock.invocationCallOrder[0]!);
      expect(bookingFindFirstMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('AC 3 — `force` without requirements.force is a 403 before any query', () => {
    it('own-self create with force: 403, neither the person nor the requirements queried', async () => {
      await expect(runPath('create', { force: true }, pilotActor('person_pilot'))).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
      expect(evaluateRequirementsMock).not.toHaveBeenCalled();
    });

    it('instructor for an allievo with force: 403 after the own-rules query (the actor\'s own profile), never the target person nor the requirements', async () => {
      personFindUnique.mockImplementation(async () => ACTIVE_INSTRUCTOR_ACTOR_PERSON);

      await expect(
        createBooking(instructorActor('person_instructor'), baseInput({ personId: 'person_student', instructorProfileId: 'instr_profile_1', force: true })),
      ).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).toHaveBeenCalledTimes(1);
      expect(personFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'person_instructor' } }));
      expect(evaluateRequirementsMock).not.toHaveBeenCalled();
    });

    it('own move with force: 403 BEFORE the booking is even read', async () => {
      await expect(runPath('move', { force: true }, pilotActor('person_pilot'))).rejects.toThrow(ForbiddenError);
      expect(bookingFindUniqueMock).not.toHaveBeenCalled();
    });

    it.each(['create', 'move', 'approve'] as const)('%s: the gate is requirements.force, not bookings.manage.any — a role holding only the latter gets the 403 before any query', async (path) => {
      // No role has bookings.manage.any without requirements.force today (both
      // ADMIN-only): grant it to INSTRUCTOR for this test only (the idiom of
      // `flights.service.test.ts`).
      const saved = ROLE_PERMISSIONS.INSTRUCTOR;
      ROLE_PERMISSIONS.INSTRUCTOR = [...saved, 'bookings.manage.any'];
      try {
        await expect(runPath(path, { force: true }, instructorActor('person_instructor'))).rejects.toThrow(ForbiddenError);
      } finally {
        ROLE_PERMISSIONS.INSTRUCTOR = saved;
      }
      expect(personFindUniqueMock).not.toHaveBeenCalled();
      expect(bookingFindUniqueMock).not.toHaveBeenCalled();
      expect(queryRawMock).not.toHaveBeenCalled();
      // The approval's queued lock row was never consumed: drop it, or the next test reads it as its aircraft.
      queryRawMock.mockReset();
    });
  });

  describe('AC 4 — the deroga and its silent stamp (D-9)', () => {
    it.each(['create', 'move', 'approve'] as const)('%s: failures + force => written, stamped forcedAt/forcedByUserId', async (path) => {
      evaluateRequirementsMock.mockResolvedValue([FAILURE]);

      await runPath(path, { force: true });

      expect(writtenData(path)).toMatchObject({ forcedAt: expect.any(Date), forcedByUserId: 'admin_1' });
    });

    it.each(['create', 'move', 'approve'] as const)('%s: force with nothing to derogate stamps NOTHING', async (path) => {
      await runPath(path, { force: true });

      expect(writtenData(path)).not.toHaveProperty('forcedAt');
      expect(writtenData(path)).not.toHaveProperty('forcedByUserId');
    });

    it('a later move without a deroga never clears a stamp — the write does not touch it', async () => {
      await runPath('move');

      expect(writtenData('move')).not.toHaveProperty('forcedAt');
      expect(writtenData('move')).not.toHaveProperty('forcedByUserId');
    });

    it.each(['DENIED', 'FLOWN', 'NO_SHOW'] as const)('"riapri" %s -> PENDING leaves the stamp alone', async (from) => {
      mockBookingLock({ status: from });

      await transitionBooking(adminActor(), 'booking_1', { to: 'PENDING' });

      expect(writtenData('approve')).not.toHaveProperty('forcedAt');
      expect(evaluateRequirementsMock).not.toHaveBeenCalled();
    });

    it('the retired motivo is never written', async () => {
      evaluateRequirementsMock.mockResolvedValue([FAILURE]);

      await runPath('create', { force: true });

      expect(writtenData('create')).not.toHaveProperty('forceReason');
    });
  });

  describe('AC 7 — two reference days (Q-19.10-a = B): documents on the flight day, currency and fee on today in Rome', () => {
    // 22:59Z in summer time: already 2026-07-15 in Rome, still 07-14 in UTC.
    const NOW = new Date('2026-07-14T22:59:00.000Z');
    const TODAY_ROME = '2026-07-15';
    const D = '2026-07-25';
    const D_STARTS_AT = '2026-07-25T08:00:00.000Z';
    const D_ENDS_AT = '2026-07-25T09:00:00.000Z';

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each(['create', 'move', 'approve'] as const)('%s: expiryDateOnly = the Rome day of the (merged) startsAt, membershipDateOnly = currency.dateOnly = today in Rome', async (path) => {
      await runPath(path, { startsAt: D_STARTS_AT, endsAt: D_ENDS_AT });

      expect(lastInput()).toMatchObject({ expiryDateOnly: D, membershipDateOnly: TODAY_ROME, currency: { dateOnly: TODAY_ROME, excludeFlightId: null } });
    });

    it('approving a booking already in the past (R-16-b, D-7): documents on its own day, currency and fee still on today', async () => {
      await runPath('approve', { startsAt: '2026-07-01T08:00:00.000Z', endsAt: '2026-07-01T09:00:00.000Z' });

      expect(lastInput()).toMatchObject({ expiryDateOnly: '2026-07-01', membershipDateOnly: TODAY_ROME, currency: { dateOnly: TODAY_ROME } });
    });
  });

  describe('AC 8 — currency only on a booking without an instructor, for a currency subject (D-4)', () => {
    beforeEach(() => {
      instructorProfileFindUnique.mockResolvedValue(instructorProfileRow());
    });

    const SOLO = { dateOnly: expect.any(String), excludeFlightId: null };

    it.each(['create', 'move', 'approve'] as const)('%s without an instructor: a solo, the currency is judged', async (path) => {
      await runPath(path);

      expect(lastInput().currency).toEqual(SOLO);
      expect(lastInput().instructor).toBeNull();
    });

    it.each(['create', 'move', 'approve'] as const)('%s with an instructor: a dual, no currency — the instructor is checked instead', async (path) => {
      if (path === 'create') {
        personFindUnique.mockImplementation(async () => ACTIVE_PILOT_PERSON);
        await createBooking(adminActor(), baseInput({ personId: 'person_pilot', instructorProfileId: 'instr_profile_1' }));
      } else if (path === 'move') {
        bookingFindUnique.mockResolvedValue({ ...EXISTING_OWN_BOOKING, instructorProfileId: 'instr_profile_1', instructorProfile: INSTRUCTOR_HOLDER });
        await updateBooking(adminActor(), 'booking_1', { notes: 'x' });
      } else {
        mockBookingLock({ status: 'PENDING', instructorProfileId: 'instr_profile_1' });
        await transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED' });
      }

      expect(lastInput().currency).toBeNull();
      expect(lastInput().instructor).toEqual({ personId: 'person_instructor', name: 'Ivo Istruttore' });
    });

    it('an instructor-only person booking for themself is no currency subject (19.7a D-8)', async () => {
      const instructorOnly = { ...NO_PROFILE_PERSON, id: 'person_instructor', instructorProfile: { deactivatedAt: null } };
      personFindUnique.mockImplementation(async () => instructorOnly);

      await createBooking(instructorActor('person_instructor'), baseInput({ personId: 'person_instructor' }));

      expect(lastInput().currency).toBeNull();
      expect(lastInput().person).toEqual({ id: 'person_instructor', name: 'Nessun Profilo', hasActivePilot: false, hasActiveStudent: false, hasActiveInstructor: true });
    });

    it('the person and instructor handed over: names, the active profiles of the person (its MISSING scopes), documents always', async () => {
      personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);

      await createBooking(adminActor(), baseInput({ personId: 'person_student', instructorProfileId: 'instr_profile_1' }));

      expect(lastInput()).toMatchObject({
        person: { id: 'person_student', name: 'Anna Bianchi', hasActivePilot: false, hasActiveStudent: true, hasActiveInstructor: false },
        instructor: { personId: 'person_instructor', name: 'Ivo Istruttore' },
        documents: true,
      });
    });
  });

  describe('AC 9 — the estimated cost (A9, D-5, D-6)', () => {
    /** 90 minutes on 2099-06-01 (Rome), the default flight day. */
    const NINETY = { startsAt: '2099-06-01T10:00:00.000Z', endsAt: '2099-06-01T11:30:00.000Z' };

    it('pilot, 90 min at a pilot price of 150,00 €/h -> 22 500', async () => {
      aircraftRateFindFirst.mockResolvedValue({ studentPriceCents: 10000, pilotPriceCents: 15000 });
      personFindUnique.mockImplementation(async () => ACTIVE_PILOT_PERSON);

      await createBooking(adminActor(), baseInput({ personId: 'person_pilot', ...NINETY }));

      expect(lastInput().balance).toEqual({ costCents: 22500, creditCents: 0 });
    });

    it('student, same rate with a student price of 100,00 €/h -> 15 000; with an instructor at 40,00 €/h -> + 6 000', async () => {
      aircraftRateFindFirst.mockResolvedValue({ studentPriceCents: 10000, pilotPriceCents: 15000 });
      personFindUnique.mockImplementation(async () => ACTIVE_STUDENT_PERSON);
      await createBooking(adminActor(), baseInput({ personId: 'person_student', ...NINETY }));
      expect(lastInput().balance).toEqual({ costCents: 15000, creditCents: 0 });

      instructorRateFindFirst.mockResolvedValue({ priceCentsPerHour: 4000 });
      await createBooking(adminActor(), baseInput({ personId: 'person_student', instructorProfileId: 'instr_profile_1', ...NINETY }));
      expect(lastInput().balance).toEqual({ costCents: 21000, creditCents: 0 });
      expect(instructorRateFindFirstMock).toHaveBeenCalledWith({
        where: { instructorProfileId: 'instr_profile_1', validFrom: { lte: new Date('2099-06-01T00:00:00.000Z') } },
        orderBy: [{ validFrom: 'desc' }],
        select: { priceCentsPerHour: true },
      });
    });

    it('Math.round on each part: 50 min at 155,55 €/h -> 12 963', async () => {
      aircraftRateFindFirst.mockResolvedValue({ studentPriceCents: 15555, pilotPriceCents: 15555 });
      personFindUnique.mockImplementation(async () => ACTIVE_PILOT_PERSON);

      await createBooking(adminActor(), baseInput({ personId: 'person_pilot', startsAt: '2099-06-01T10:00:00.000Z', endsAt: '2099-06-01T10:50:00.000Z' }));

      expect(lastInput().balance).toEqual({ costCents: 12963, creditCents: 0 });
    });

    it('the rate in effect on the flight day: the greatest validFrom <= D (a row dated D + 1 can never match), typed on the date column; no rate -> 0', async () => {
      personFindUnique.mockImplementation(async () => ACTIVE_PILOT_PERSON);

      await createBooking(adminActor(), baseInput({ personId: 'person_pilot', ...NINETY }));

      expect(aircraftRateFindFirstMock).toHaveBeenCalledWith({
        where: { aircraftId: 'aircraft_1', validFrom: { lte: new Date('2099-06-01T00:00:00.000Z') } },
        orderBy: [{ validFrom: 'desc' }],
        select: { studentPriceCents: true, pilotPriceCents: true },
      });
      expect(lastInput().balance).toEqual({ costCents: 0, creditCents: 0 });
      // No instructor on the booking: the instructor rate is never read.
      expect(instructorRateFindFirstMock).not.toHaveBeenCalled();
    });

    it('a legacy person with BOTH profiles active is estimated at the pilot price, as the flight will charge (D-5); an instructor-only one too', async () => {
      aircraftRateFindFirst.mockResolvedValue({ studentPriceCents: 10000, pilotPriceCents: 15000 });
      personFindUnique.mockImplementation(async () => ({ ...ACTIVE_PILOT_PERSON, studentProfile: { deactivatedAt: null } }));
      await createBooking(adminActor(), baseInput({ personId: 'person_pilot', ...NINETY }));
      expect(lastInput().balance).toEqual({ costCents: 22500, creditCents: 0 });

      personFindUnique.mockImplementation(async () => ({ ...NO_PROFILE_PERSON, instructorProfile: { deactivatedAt: null }, account: { id: 'account_i' } }));
      await createBooking(adminActor(), baseInput({ personId: 'person_other', ...NINETY }));
      expect(lastInput().balance).toEqual({ costCents: 22500, creditCents: 0 });
    });

    it('a person without an account (instructor-only, D-6): the balance is not judged, no rate read', async () => {
      personFindUnique.mockImplementation(async () => ({ ...NO_PROFILE_PERSON, instructorProfile: { deactivatedAt: null } }));

      await createBooking(adminActor(), baseInput({ personId: 'person_other', ...NINETY }));

      expect(lastInput().balance).toBeNull();
      expect(aircraftRateFindFirstMock).not.toHaveBeenCalled();
    });
  });

  describe('AC 12 — every move re-judges the MERGED booking (D-3)', () => {
    it('the requirements see the merged aircraft, interval and cost — and a notes-only move is judged too', async () => {
      aircraftRateFindFirst.mockResolvedValue({ studentPriceCents: 10000, pilotPriceCents: 12000 });
      bookingFindUnique.mockResolvedValue(EXISTING_OWN_BOOKING);
      queryRaw.mockResolvedValue([
        { id: 'aircraft_1', status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null, archivedAt: null },
        { id: 'aircraft_2', status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null, archivedAt: null },
      ]);

      await updateBooking(adminActor(), 'booking_1', { aircraftId: 'aircraft_2', endsAt: '2099-06-01T12:00:00.000Z' });

      expect(aircraftRateFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ aircraftId: 'aircraft_2' }) }));
      // 10:00 -> 12:00 at 120,00 €/h.
      expect(lastInput()).toMatchObject({ expiryDateOnly: '2099-06-01', person: { id: 'person_pilot', name: 'Mario Rossi' }, balance: { costCents: 24000, creditCents: 0 } });

      await updateBooking(adminActor(), 'booking_1', { notes: 'solo una nota' });
      expect(evaluateRequirementsMock).toHaveBeenCalledTimes(2);
    });

    it('an own move with a failed requirement is blocked, with no way to derogate', async () => {
      evaluateRequirementsMock.mockResolvedValue([FAILURE]);

      expect((await errorOf(runPath('move', {}, pilotActor('person_pilot')))).code).toBe('REQUIREMENTS_NOT_MET');
      expectNothingWritten();
    });
  });

  describe('AC 13 — warnings stay the non-blocking expired ratings (D-10)', () => {
    it('reads only the active non-blocking RATINGs of the person, expired before the flight day; the expiry day itself is valid', async () => {
      personFindUnique.mockImplementation(async () => ACTIVE_PILOT_PERSON);
      expiryFindMany.mockResolvedValue([
        { expiresAt: new Date('2099-05-31T00:00:00.000Z'), expiryType: { name: 'Rating SEP' } },
        { expiresAt: new Date('2099-06-01T00:00:00.000Z'), expiryType: { name: 'Inglese ICAO' } },
      ]);

      const result = await createBooking(adminActor(), baseInput({ personId: 'person_pilot' }));

      expect(expiryFindManyMock).toHaveBeenCalledWith({
        where: { personId: 'person_pilot', expiryType: { kind: 'RATING', blocksBooking: false, isActive: true } },
        select: { expiresAt: true, expiryType: { select: { name: true } } },
      });
      expect(result.warnings).toEqual([{ typeName: 'Rating SEP', expiresAt: '2099-05-31' }]);
    });

    it('the failures never travel as warnings, nor the other way round', async () => {
      personFindUnique.mockImplementation(async () => ACTIVE_PILOT_PERSON);
      evaluateRequirementsMock.mockResolvedValue([FAILURE]);

      const result = await createBooking(adminActor(), baseInput({ personId: 'person_pilot', force: true }));

      expect(result.warnings).toEqual([]);
    });
  });

  describe('AC 21 — an instructor who IS the person (D-8): 422 INSTRUCTOR_SAME_AS_PILOT, never derogable', () => {
    const selfInstructor = () => instructorProfileRow('instr_profile_1', { personId: 'person_pilot' });

    it.each([false, true])('staff create (force %s)', async (force) => {
      personFindUnique.mockImplementation(async () => ACTIVE_PILOT_PERSON);
      instructorProfileFindUnique.mockResolvedValue(selfInstructor());

      const error = await errorOf(createBooking(adminActor(), baseInput({ personId: 'person_pilot', instructorProfileId: 'instr_profile_1', force })));

      expect(error.code).toBe('INSTRUCTOR_SAME_AS_PILOT');
      expect(evaluateRequirementsMock).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it.each([false, true])('approval re-check (force %s)', async (force) => {
      instructorProfileFindUnique.mockResolvedValue(selfInstructor());
      mockBookingLock({ status: 'PENDING', instructorProfileId: 'instr_profile_1' });

      const error = await errorOf(transitionBooking(adminActor(), 'booking_1', { to: 'APPROVED', force }));

      expect(error.code).toBe('INSTRUCTOR_SAME_AS_PILOT');
      expectNothingWritten();
    });
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

    const result = await listActiveInstructors(adminActor());

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

  // --- force (story 19.10: the deroga carries no motivo) -------------------

  it('accepts a body with or without force (story 19.10: the deroga carries no motivo)', () => {
    expect(createBookingSchema.safeParse(VALID).success).toBe(true);
    expect(createBookingSchema.safeParse({ ...VALID, force: true }).success).toBe(true);
    expect(createBookingSchema.safeParse({ ...VALID, force: false }).success).toBe(true);
  });

  it('a body still carrying the retired forceReason is accepted and the field stripped — never a 422 (story 19.10, AC 5)', () => {
    const parsed = createBookingSchema.parse({ ...VALID, force: true, forceReason: 'vecchio client' });

    expect(parsed).not.toHaveProperty('forceReason');
    expect(parsed.force).toBe(true);
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

  it('story 19.10 (AC 5): force alone is not a change — still the empty-body 422; with a field it is accepted', () => {
    expect(updateBookingSchema.safeParse({ force: true }).success).toBe(false);
    expect(updateBookingSchema.safeParse({ notes: 'x', force: true }).success).toBe(true);
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

  it('story 19.10 (AC 5): force only on an approval — refused with any other target, never ignored', () => {
    expect(transitionBookingSchema.safeParse({ to: 'APPROVED', force: true }).success).toBe(true);
    expect(transitionBookingSchema.safeParse({ to: 'DENIED', reason: 'x', force: true }).success).toBe(false);
    expect(transitionBookingSchema.safeParse({ to: 'PENDING', force: true }).success).toBe(false);
    expect(transitionBookingSchema.safeParse({ to: 'DENIED', reason: 'x', force: false }).success).toBe(true);
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
    const result = await listReservedAircraftIds(adminActor(), [], new Date('2026-07-15T10:00:00.000Z'));

    expect(result.size).toBe(0);
    expect(bookingFindManyMock).not.toHaveBeenCalled();
  });

  it('queries with the exact AD-2 shape: aircraftId in ids, APPROVED, startsAt <= now < endsAt', async () => {
    bookingFindMany.mockResolvedValue([]);
    const now = new Date('2026-07-15T10:00:00.000Z');

    await listReservedAircraftIds(adminActor(), ['aircraft_1', 'aircraft_2'], now);

    expect(bookingFindManyMock).toHaveBeenCalledWith({
      where: { aircraftId: { in: ['aircraft_1', 'aircraft_2'] }, status: 'APPROVED', startsAt: { lte: now }, endsAt: { gt: now } },
      select: { aircraftId: true },
    });
  });

  it('returns the Set of aircraftIds with a covering APPROVED booking, others absent', async () => {
    bookingFindMany.mockResolvedValue([{ aircraftId: 'aircraft_1' }, { aircraftId: 'aircraft_3' }]);

    const result = await listReservedAircraftIds(adminActor(), ['aircraft_1', 'aircraft_2', 'aircraft_3'], new Date('2026-07-15T10:00:00.000Z'));

    expect(result.has('aircraft_1')).toBe(true);
    expect(result.has('aircraft_2')).toBe(false);
    expect(result.has('aircraft_3')).toBe(true);
  });
});
