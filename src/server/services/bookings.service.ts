import type { AircraftStatus } from '@/generated/prisma/client';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import type { CalendarBookingsQuery, CreateBookingInput, ListBookingsQuery } from '@/lib/schemas/bookings';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

/**
 * Aircraft bookings (epic 7, story 7.1; FR-18) — see `Booking`'s Prisma
 * doc-comment for the full domain rationale (mirrors `Flight`'s shape,
 * semi-open `[startsAt, endsAt)` interval, no status/cancellation field yet).
 *
 * **Creation matrix** (AD-5: `authorize()` first, then own-checks against
 * `actor.personId` in the service — never in the UI):
 * - `bookings.manage.any` (staff/admin): `personId` = anyone; an optional
 *   `instructorProfileId` may reference ANY active instructor.
 * - `bookings.manage.own` with `personId === actor.personId` (a pilot or an
 *   instructor booking for themself): allowed only if the actor's own
 *   person has an ACTIVE `PilotProfile` OR `InstructorProfile` — otherwise a
 *   403 (a role without an active flying profile does not get to book,
 *   Contesto: "piloti brevettati"). `instructorProfileId` MUST be absent —
 *   a self-booking WITH an instructor is created by staff, out of this
 *   story's scope.
 * - `bookings.manage.own` with `personId !== actor.personId` (an instructor
 *   indicating an allievo): the actor MUST have an ACTIVE
 *   `InstructorProfile` — checked and rejected with a 403 BEFORE any query
 *   on the target person (the 403-before-target-query pattern from story
 *   5.4: a pilot probing for another person's existence must never learn
 *   anything). `instructorProfileId` is MANDATORY and must equal the
 *   actor's own profile id. The target person must have an ACTIVE
 *   `StudentProfile` — otherwise 422 `PERSON_NOT_BOOKABLE` (allievo↔
 *   istruttore assignment is epic 9's concern; any active allievo qualifies
 *   here).
 *
 * **Verification order** (no state leak, pattern story 6.2/5.4): authorize
 * 403 → own-rules 403 (before any target-person query, where noted above)
 * → target person 404/409/422 `PERSON_NOT_BOOKABLE` → `startsAt` in the
 * past 422 `BOOKING_IN_PAST` → [transaction: aircraft lock + 404/409/422
 * `AIRCRAFT_OUT_OF_SERVICE` → overlap pre-check 409 → create]. Person/
 * instructor resolution runs OUTSIDE the transaction (Dev Notes: it never
 * participates in the overlap invariant, so it needs no lock) — the
 * aircraft is resolved and validated INSIDE the transaction, on the SAME
 * locked row the overlap pre-check reads, because both are governed by the
 * same invariant (AC 2) and a single `SELECT ... FOR UPDATE` serves both
 * purposes with one fetch (no TOCTOU).
 *
 * **Concurrency (AC 2)**: the lock is `SELECT ... FOR UPDATE` on the
 * `Aircraft` row inside `prisma.$transaction`, the EXACT pattern of
 * `flights.service.ts#registerFlight` (its module doc-comment/~766-788) —
 * it is deliberately the FIRST statement in the transaction. Locking the
 * aircraft serializes every concurrent `createBooking` call targeting the
 * SAME aircraft, so the overlap pre-check (`booking.findFirst`) immediately
 * followed by `booking.create`, both inside the same locked transaction, is
 * airtight against two concurrent requests both seeing "no overlap" and
 * both inserting. No Postgres exclusion constraint (`btree_gist`) is used —
 * a deliberate choice (Contesto): the lock alone is sufficient, and story
 * 7.3 will reuse the same discipline for booking moves.
 */

export type BookingListItem = {
  id: string;
  aircraftId: string;
  aircraftRegistration: string;
  personId: string;
  personName: string;
  instructorProfileId: string | null;
  instructorName: string | null;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  createdAt: Date;
};

const BOOKING_SELECT = {
  id: true,
  aircraftId: true,
  aircraft: { select: { registration: true } },
  personId: true,
  person: { select: { firstName: true, lastName: true } },
  instructorProfileId: true,
  instructorProfile: { select: { person: { select: { firstName: true, lastName: true } } } },
  startsAt: true,
  endsAt: true,
  notes: true,
  createdAt: true,
} as const;

type SelectedBooking = {
  id: string;
  aircraftId: string;
  aircraft: { registration: string };
  personId: string;
  person: { firstName: string; lastName: string };
  instructorProfileId: string | null;
  instructorProfile: { person: { firstName: string; lastName: string } } | null;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  createdAt: Date;
};

function toListItem(booking: SelectedBooking): BookingListItem {
  return {
    id: booking.id,
    aircraftId: booking.aircraftId,
    aircraftRegistration: booking.aircraft.registration,
    personId: booking.personId,
    personName: `${booking.person.firstName} ${booking.person.lastName}`,
    instructorProfileId: booking.instructorProfileId,
    instructorName: booking.instructorProfile
      ? `${booking.instructorProfile.person.firstName} ${booking.instructorProfile.person.lastName}`
      : null,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    notes: booking.notes,
    createdAt: booking.createdAt,
  };
}

type TargetPerson = {
  id: string;
  archivedAt: Date | null;
  pilotProfile: { deactivatedAt: Date | null } | null;
  studentProfile: { deactivatedAt: Date | null } | null;
  instructorProfile: { deactivatedAt: Date | null } | null;
};

function isActivePilot(person: TargetPerson): boolean {
  return person.pilotProfile !== null && person.pilotProfile.deactivatedAt === null;
}

function isActiveStudent(person: TargetPerson): boolean {
  return person.studentProfile !== null && person.studentProfile.deactivatedAt === null;
}

function isActiveInstructor(person: TargetPerson): boolean {
  return person.instructorProfile !== null && person.instructorProfile.deactivatedAt === null;
}

/**
 * Creates a booking (AC 1/2/3) — see the module doc-comment for the full
 * matrix/ordering rationale.
 */
export async function createBooking(actor: Actor, input: CreateBookingInput): Promise<BookingListItem> {
  const canManageAny = hasPermission(actor, 'bookings.manage.any');
  if (!canManageAny) {
    authorize(actor, 'bookings.manage.own');
  }

  const isSelf = input.personId === actor.personId;

  // Own-rules (403) that must run BEFORE any query on the TARGET person for
  // the cross-person case (Dev Notes: never leak whether an id belongs to
  // someone by querying it before the actor's own eligibility is settled).
  // `resolvedInstructorProfileId` is the FINAL value written on the booking
  // for a non-staff actor — already known here for the cross-person branch
  // (the actor's own profile id); the self-booking branch defers its
  // eligibility check to the single shared `person` lookup below (querying
  // "self" carries no leak risk, so there is no need for a second query).
  let resolvedInstructorProfileId: string | null = null;

  if (!canManageAny) {
    if (actor.personId === null) {
      // No linked person at all: nothing of "own" to book, self or otherwise.
      throw new ForbiddenError('Actor has no linked person and cannot create bookings.');
    }

    if (isSelf) {
      if (input.instructorProfileId) {
        throw new ValidationError(
          'A self-booking cannot indicate an instructor — an instructor-assisted booking for yourself is created by staff.',
        );
      }
    } else {
      const actorPerson = await prisma.person.findUnique({
        where: { id: actor.personId },
        select: { instructorProfile: { select: { id: true, deactivatedAt: true } } },
      });
      const actorInstructorProfile = actorPerson?.instructorProfile ?? null;
      if (!actorInstructorProfile || actorInstructorProfile.deactivatedAt !== null) {
        throw new ForbiddenError('Only an active instructor may book an aircraft on behalf of another person.');
      }
      if (input.instructorProfileId !== actorInstructorProfile.id) {
        throw new ForbiddenError('An instructor may only indicate their own instructorProfileId when booking for someone else.');
      }
      resolvedInstructorProfileId = actorInstructorProfile.id;
    }
  }

  // Target person (404/409/422) — outside the transaction (Dev Notes: it
  // never participates in the overlap invariant, so it needs no lock). For
  // the own-self path `input.personId === actor.personId`, so this IS the
  // actor's own row — the same query also carries the self-eligibility check.
  const person = await prisma.person.findUnique({
    where: { id: input.personId },
    select: {
      id: true,
      archivedAt: true,
      pilotProfile: { select: { deactivatedAt: true } },
      studentProfile: { select: { deactivatedAt: true } },
      instructorProfile: { select: { deactivatedAt: true } },
    },
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }
  if (person.archivedAt !== null) {
    throw new ConflictError('Cannot book an aircraft for an archived person.');
  }

  if (canManageAny) {
    // Staff/admin: any active pilot, student or instructor is bookable.
    if (!isActivePilot(person) && !isActiveStudent(person) && !isActiveInstructor(person)) {
      throw new ValidationError(
        'Person must have an active pilot, student or instructor profile to be booked.',
        undefined,
        'PERSON_NOT_BOOKABLE',
      );
    }

    if (input.instructorProfileId) {
      const instructorProfile = await prisma.instructorProfile.findUnique({
        where: { id: input.instructorProfileId },
        select: { id: true, deactivatedAt: true },
      });
      if (!instructorProfile) {
        throw new NotFoundError('Instructor profile not found.');
      }
      if (instructorProfile.deactivatedAt !== null) {
        throw new ConflictError('This instructor profile is deactivated.');
      }
      resolvedInstructorProfileId = instructorProfile.id;
    }
  } else if (isSelf) {
    // Own-self path (Contesto): a 403, not the staff/cross-path's 422 —
    // a role without an active flying profile does not get to book at all.
    if (!isActivePilot(person) && !isActiveInstructor(person)) {
      throw new ForbiddenError('Only a licensed pilot or an active instructor may book an aircraft for themselves.');
    }
  } else {
    // Cross-person own-path (instructor booking for an allievo): the target
    // must have an active student profile — the actor's own eligibility and
    // `instructorProfileId` match were already settled above.
    if (!isActiveStudent(person)) {
      throw new ValidationError('This person has no active student profile to be booked for.', undefined, 'PERSON_NOT_BOOKABLE');
    }
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (startsAt.getTime() <= Date.now()) {
    throw new ValidationError('startsAt must be in the future.', undefined, 'BOOKING_IN_PAST');
  }

  const created = await prisma.$transaction(async (tx) => {
    // Row lock (FOR UPDATE) — the FIRST statement in the transaction (module
    // doc-comment), same raw-query pattern as
    // `flights.service.ts#registerFlight`. One fetch serves both the
    // aircraft-state validation below and the overlap invariant (AC 2).
    const lockedAircraft = await tx.$queryRaw<Array<{ id: string; status: string; statusReason: string | null; archivedAt: Date | null }>>`
      SELECT "id", "status", "statusReason", "archivedAt" FROM "Aircraft" WHERE "id" = ${input.aircraftId} FOR UPDATE`;
    const aircraft = lockedAircraft[0];
    if (!aircraft) {
      throw new NotFoundError('Aircraft not found.');
    }
    if (aircraft.archivedAt !== null) {
      throw new ConflictError('Aircraft is archived.');
    }
    if (aircraft.status === 'OUT_OF_SERVICE') {
      throw new ValidationError(`Aircraft is out of service: ${aircraft.statusReason}.`, { reason: aircraft.statusReason }, 'AIRCRAFT_OUT_OF_SERVICE');
    }

    // Overlap pre-check (AC 2): semi-open `[startsAt, endsAt)` — two
    // bookings that merely touch at the boundary (one's `endsAt` equals the
    // other's `startsAt`) do NOT overlap (Dev Notes).
    const overlapping = await tx.booking.findFirst({
      where: { aircraftId: input.aircraftId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      select: { id: true },
    });
    if (overlapping) {
      throw new ConflictError('This aircraft is already booked for an overlapping interval.');
    }

    return tx.booking.create({
      data: {
        aircraftId: input.aircraftId,
        personId: input.personId,
        instructorProfileId: resolvedInstructorProfileId,
        startsAt,
        endsAt,
        notes: input.notes ?? null,
        actorUserId: actor.userId,
      },
      select: BOOKING_SELECT,
    });
  });

  return toListItem(created);
}

/**
 * Lists bookings (FR-19, anticipated to its minimum for this story) —
 * `self.read` (every role holds it, Dev Notes: "qualunque autenticato").
 * Filters `from`/`to` use the SAME semi-open semantics as the overlap check
 * (`endsAt > from`, `startsAt < to`); `aircraftId`/`personId` are exact
 * matches. Ordered `startsAt asc, id asc` (soonest-first, deterministic
 * tie-break). The DTO includes the booking-holder and instructor NAMES
 * (Dev Notes: no privacy requirement in the PRD, an aeroclub is transparent
 * about who has the aircraft when) and `notes`.
 */
export async function listBookings(actor: Actor, query: ListBookingsQuery): Promise<PaginatedResult<BookingListItem>> {
  authorize(actor, 'self.read');

  const where = {
    ...(query.from ? { endsAt: { gt: new Date(query.from) } } : {}),
    ...(query.to ? { startsAt: { lt: new Date(query.to) } } : {}),
    ...(query.aircraftId ? { aircraftId: query.aircraftId } : {}),
    ...(query.personId ? { personId: query.personId } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.booking.findMany({
      select: BOOKING_SELECT,
      where,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      ...paginationOffset(query),
    }),
    prisma.booking.count({ where }),
  ]);

  return paginate(items.map(toListItem), total, query);
}

/** The calendar's own maximum span (story 7.2, Task 2) — a calendar renders a week at most, so a wider range is always a client error, never a legitimate page. */
const MAX_CALENDAR_RANGE_MS = 8 * 24 * 60 * 60 * 1000;

/**
 * Lists EVERY booking overlapping `[from, to)` (FR-19, story 7.2, AC 1) —
 * the calendar's own read, deliberately UNPAGINATED (`listBookings` above
 * stays the paginated "Prossime prenotazioni" list). `self.read` (every
 * authenticated role, same rationale as `listBookings`). `from`/`to` are
 * BOTH required (unlike `listBookings`'s optional filters — a calendar
 * without a range makes no sense) and validated here too, independently of
 * `calendarBookingsQuerySchema`'s own refine (AD-5: the service is the real
 * guardian; `page.tsx` calls this directly, bypassing the API's Zod query
 * schema entirely):
 * - `to` must be strictly after `from` (compared as INSTANTS, same lesson
 *   as `createBookingSchema`'s N1 review fix — never a string compare).
 * - The range must not exceed 8 days (`RANGE_TOO_WIDE`) — generous enough
 *   for a week view plus one day of slack, tight enough that a malicious
 *   `from`/`to` can never turn this into an unbounded table scan.
 *
 * Same semi-open overlap predicate as `listBookings`/`createBooking`'s
 * pre-check (`startsAt < to AND endsAt > from`), same `startsAt asc, id
 * asc` order, same `BOOKING_SELECT`/`toListItem` DTO projection (Dev
 * Notes: never duplicate the projection). `take: 1000` is a SAFETY BOUND,
 * not pagination (Contesto: "un calendario non si pagina") — an 8-day
 * window with 1000 bookings across every aircraft is already an
 * operationally absurd volume; this only guards against a pathological DB
 * state turning a calendar render into an unbounded response.
 */
export async function listCalendarBookings(actor: Actor, query: CalendarBookingsQuery): Promise<BookingListItem[]> {
  authorize(actor, 'self.read');

  const from = new Date(query.from);
  const to = new Date(query.to);

  if (to.getTime() <= from.getTime()) {
    throw new ValidationError('to must be strictly after from.');
  }
  if (to.getTime() - from.getTime() > MAX_CALENDAR_RANGE_MS) {
    throw new ValidationError('The calendar range cannot exceed 8 days.', undefined, 'RANGE_TOO_WIDE');
  }

  const bookings = await prisma.booking.findMany({
    select: BOOKING_SELECT,
    where: { startsAt: { lt: to }, endsAt: { gt: from } },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    take: 1000,
  });

  return bookings.map(toListItem);
}

// --- Booking-form picker data (Task 5) --------------------------------------
// Minimal, `self.read`-gated data sources for the "Nuova prenotazione" form's
// pickers. None of these reuse the staff-only `aircraft.service.ts#listAircraft`
// (`aircraft.manage`) or `people.service.ts#listPeople` (`people.read`) —
// story 7.1 is the first to let a NON-staff actor (pilot/instructor) see a
// bare slice of the fleet/allievi at all (`aircraft.service.ts`'s own
// doc-comment already anticipated this: "pilots see the fleet via the future
// bookings epic" — this is that epic). The staff/`bookings.manage.any` form
// still reuses `listPeople` directly (page.tsx) since staff already holds
// `people.read`.

export type BookableAircraftOption = { id: string; registration: string; status: AircraftStatus; statusReason: string | null };

/**
 * Non-archived aircraft, for the booking form's aircraft picker (AC 1/3).
 * `self.read` (every role) — deliberately NOT `aircraft.manage`. OUT_OF_SERVICE
 * aircraft ARE included (the UI disables them with their reason, Contesto);
 * the service re-verifies regardless on submit (AD-5: the UI only hides).
 */
export async function listBookableAircraft(actor: Actor): Promise<BookableAircraftOption[]> {
  authorize(actor, 'self.read');

  return prisma.aircraft.findMany({
    where: { archivedAt: null },
    select: { id: true, registration: true, status: true, statusReason: true },
    orderBy: { registration: 'asc' },
  });
}

export type BookablePersonOption = { id: string; firstName: string; lastName: string };

/**
 * Active allievi, for an instructor's "book for a student" picker (AC 1).
 * `self.read` (every role) — an instructor holds neither `people.read` nor
 * `bookings.manage.any`, so it cannot reuse `listPeople` (staff-only) here.
 */
export async function listBookableStudents(actor: Actor): Promise<BookablePersonOption[]> {
  authorize(actor, 'self.read');

  return prisma.person.findMany({
    where: { archivedAt: null, studentProfile: { deactivatedAt: null } },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
}

export type InstructorOption = { instructorProfileId: string; firstName: string; lastName: string };

/** Active instructors, for the staff form's optional instructor picker (AC 1). `self.read` (every role, same rationale as the pickers above). */
export async function listActiveInstructors(actor: Actor): Promise<InstructorOption[]> {
  authorize(actor, 'self.read');

  const rows = await prisma.instructorProfile.findMany({
    where: { deactivatedAt: null },
    select: { id: true, person: { select: { firstName: true, lastName: true } } },
    orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
  });
  return rows.map((row) => ({ instructorProfileId: row.id, firstName: row.person.firstName, lastName: row.person.lastName }));
}

/**
 * The actor's own ACTIVE `InstructorProfile.id`, or `null` (no linked
 * person, no instructor profile, or a deactivated one) — lets the "Nuova
 * prenotazione" server component (page.tsx) decide whether to render the
 * instructor's "for me / for a student" toggle and, when it does, supplies
 * the exact value the form must send as `instructorProfileId` (Contesto: it
 * must equal the actor's own profile, never trusted from the client as a
 * free string). `self.read` (every role).
 */
export async function getOwnInstructorProfileId(actor: Actor): Promise<string | null> {
  authorize(actor, 'self.read');
  if (actor.personId === null) {
    return null;
  }

  const profile = await prisma.instructorProfile.findUnique({
    where: { personId: actor.personId },
    select: { id: true, deactivatedAt: true },
  });
  return profile && profile.deactivatedAt === null ? profile.id : null;
}
