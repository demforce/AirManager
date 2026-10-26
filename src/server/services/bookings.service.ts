import { Prisma, type AircraftStatus, type BookingStatus } from '@/generated/prisma/client';
import type { AppLocale } from '@/i18n/routing';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import type { CalendarBookingsQuery, CreateBookingInput, ListBookingsQuery, TransitionBookingInput, UpdateBookingInput } from '@/lib/schemas/bookings';
import { APP_TIMEZONE } from '@/lib/time';
import { dateOnlyInZone, zonedWallTime } from '@/lib/zoned-time';
import { getMailSender } from '@/server/adapters/mail';
import { buildBookingDeniedEmail } from '@/server/adapters/mail/templates';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { outOfServiceDetails } from './aircraft-status';
import { getSchedulingSettings } from './app-settings.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

/**
 * Aircraft bookings (epic 7, story 7.1; FR-18) — see `Booking`'s Prisma
 * doc-comment for the full domain rationale (mirrors `Flight`'s shape,
 * semi-open `[startsAt, endsAt)` interval, no status/cancellation field yet).
 *
 * **Creation matrix** (AD-5: `authorize()` first, then own-checks against
 * `actor.personId` in the service — never in the UI):
 * - `bookings.manage.any` (ADMIN-only): `personId` = anyone; an optional
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
 * → `force` 403 without `bookings.manage.any` (story 7.4, AC 2 — before any
 * further query) → target person 404/409/422 `PERSON_NOT_BOOKABLE` →
 * expiry-based block 422 `EXPIRED_DOCUMENTS`/force bypass (story 7.4, AC 1/2)
 * → `startsAt` in the past 422 `BOOKING_IN_PAST` → scheduling-window 422
 * `BOOKING_OUTSIDE_WINDOW` (story 12.11, AC 4) → [transaction: aircraft
 * lock + 404/409/422 `AIRCRAFT_OUT_OF_SERVICE` → person/instructor locks →
 * overlap pre-check 409 (`CONFLICT` aircraft → `PERSON_BUSY` →
 * `INSTRUCTOR_BUSY`, story 16.3) → create]. Person/instructor RESOLUTION
 * (404/409/422) runs OUTSIDE the transaction: it keeps the error order above
 * (a state 422 before a conflict 409) and the 403-before-target-query rule,
 * and it reads nothing the overlap invariant depends on. What the invariant
 * DOES depend on — that no other booking of the same person/instructor gets
 * approved in between — is guarded by their row LOCKS, taken inside the
 * transaction (story 16.3, below). The aircraft is resolved and validated
 * INSIDE the transaction, on the SAME locked row the overlap pre-check reads
 * — a single `SELECT ... FOR UPDATE` serves both purposes with one fetch (no
 * TOCTOU).
 *
 * **Concurrency (AC 2; three subjects since story 16.3)**: the overlap
 * invariant has three subjects — the aircraft, the person, the instructor
 * (`findBookingConflict`, the ONE implementation of the three predicates) —
 * and each is serialized by a row lock inside `prisma.$transaction`, the
 * pattern of `flights.service.ts#registerFlight` (`SELECT ... FOR UPDATE` on
 * the aircraft, `FOR NO KEY UPDATE` on the two people — see
 * `lockBookingPeople`). The `Aircraft` lock is the FIRST statement of
 * `createBooking`/`updateBooking` (`transitionBooking` locks its `Booking`
 * row before it): it serializes the writers of the SAME aircraft. The `Person` lock and, when
 * the booking has one, the `InstructorProfile` lock (`lockBookingPeople`)
 * serialize the writers of the same person/instructor on DIFFERENT aircraft,
 * which the aircraft lock alone never did (ops F2): without them the person
 * predicate would be a check-then-write. The global lock order is the same on
 * all three paths — `Booking` (transition only) → `Aircraft` (one row, or N
 * `ORDER BY id`) → `Person` → `InstructorProfile` — and each transaction locks
 * at most ONE person and ONE instructor (both immutable on a booking), so two
 * booking writers can never wait on each other in a cycle; no other service
 * locks `Person`/`InstructorProfile` rows (census in the story 16.3 file).
 * The pre-check immediately followed by the write, inside the same locked
 * transaction, is therefore airtight against two concurrent requests both
 * seeing "no overlap". No Postgres exclusion constraint (`btree_gist`) —
 * deliberate, re-evaluated with three subjects in story 16.3 (see `Booking`'s
 * Prisma doc-comment): it would need three partial constraints the load DB
 * already violates, would surface as one SQL error code to be told apart by
 * constraint NAME, and would not remove the aircraft lock, which also guards
 * the aircraft's STATE read. The person re-checks of an approval (archived,
 * profile) stay check-then-act, exactly like the expiry block and the
 * scheduling window: the locks close the OVERLAP race, nothing more (TD
 * 16.3-d).
 *
 * **Soft-cancel and edit tracking (story 7.3, AC 1/2)**: see `Booking`'s
 * Prisma doc-comment for the `status`/`cancelledAt`/`cancelledByUserId`/
 * `updatedByUserId` shape. `updateBooking`/`cancelBooking` are documented at
 * their own definitions below; every overlap predicate in this file
 * (`createBooking`'s pre-check, `updateBooking`'s pre-check, `listBookings`,
 * `listCalendarBookings`) filters `status: 'APPROVED'` (story 12.2: only an
 * APPROVED booking occupies a slot) — a cancelled OR not-yet-approved
 * booking frees/never held its slot and disappears from every list/calendar.
 *
 * **Approval workflow (epic 12, story 12.2)**: `createBooking` now stamps
 * `status` explicitly — `APPROVED` for a `bookings.manage.any` actor,
 * `PENDING` for a `bookings.manage.own` one — instead of relying on the
 * column default. `transitionBooking` (below) moves a booking through the
 * rest of the matrix (approve/deny/flown/no-show/riapri); `updateBooking`/
 * `cancelBooking` are now permitted from BOTH `PENDING` and `APPROVED` (was
 * `ACTIVE` only) — see `Booking`'s Prisma doc-comment for the full picture.
 *
 * **Expiry-based booking block (story 7.4, AC 1/2; FR-21; extended by TD-5,
 * AC 5)**: `createBooking` runs the full rule unconditionally (see its own
 * doc-comment for ordering/force/warning semantics). `updateBooking` reruns
 * the SAME partition (`findBlockingExpiredDocuments`, the shared helper) but
 * ONLY when the edit actually changes the flight DAY (`APP_TIMEZONE`
 * date-only) — a same-day edit (time/aircraft/notes) never re-checks, so a
 * booking created with `force` past a blocking document stays editable
 * within that day. There is no `force` on `updateBooking` (deferred,
 * Contesto: staff who must deliberately move past a scadenza cancels and
 * recreates with `force`) — any blocking document on the NEW day is a hard
 * 422, no bypass.
 */

export type BookingListItem = {
  id: string;
  aircraftId: string;
  aircraftRegistration: string;
  personId: string;
  /** `null` on a masked (non-own, no `bookings.read.names`) entry — see `maskBookingNames`'s doc-comment (story 14.5). */
  personName: string | null;
  instructorProfileId: string | null;
  instructorName: string | null;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  status: BookingStatus;
  cancelledAt: Date | null;
  /** Set only when staff bypassed a blocking expired document at creation time (story 7.4, AC 2) — see `Booking.forcedAt`'s doc-comment. */
  forcedAt: Date | null;
  /** Set only after a DENIED decision (story 12.2, AC 3) — see `Booking.denyReason`'s doc-comment. */
  denyReason: string | null;
  /** Set on a PENDING -> APPROVED/DENIED decision, cleared on "riapri" (story 12.2, AC 3) — see `Booking.decidedAt`'s doc-comment. */
  decidedAt: Date | null;
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
  status: true,
  cancelledAt: true,
  forcedAt: true,
  denyReason: true,
  decidedAt: true,
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
  status: BookingStatus;
  cancelledAt: Date | null;
  forcedAt: Date | null;
  denyReason: string | null;
  decidedAt: Date | null;
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
    status: booking.status,
    cancelledAt: booking.cancelledAt,
    forcedAt: booking.forcedAt,
    denyReason: booking.denyReason,
    decidedAt: booking.decidedAt,
    createdAt: booking.createdAt,
  };
}

/**
 * Masks the personal identifiers on a booking that is NOT the actor's own
 * (story 14.5, ratifica R3: pilots/students see "Occupato" — aircraft and
 * time stay visible — on someone else's booking; admin/instructor,
 * `bookings.read.names`, see everyone's name unmasked). "Own" (review F4,
 * aligned with `assertOwnAccessAndTiming`'s own definition — the same shape
 * used by update/cancel) is `booking.personId === actor.personId` OR
 * `booking.instructorProfileId === ownInstructorProfileId` (the actor's own
 * ACTIVE `InstructorProfile`, resolved ONCE per request by the caller via
 * `getOwnInstructorProfileId` — never per row): today every role that can
 * hold an `InstructorProfile` (INSTRUCTOR) also holds `bookings.read.names`,
 * so this second branch is latent, not reachable — but the 14.9 role
 * removal (or any future RBAC change) would otherwise let an instructor
 * without the read permission see their OWN lesson mis-rendered as
 * "Occupato" while still being allowed to edit/cancel it via the unmasked
 * DTO update/cancel return — closing it now costs one query.
 *
 * `personName: null` is the client's ONLY masking signal (Contesto AC 1: "+
 * flag/shape") — a real booking never has a null person, so the client
 * renders "Occupato" purely off that, no separate boolean to keep in sync.
 * `instructorProfileId`/`instructorName`/`notes`/`denyReason` are masked TOO,
 * not just the two name fields (AC 4: "valuta note/tipo e motiva"; review
 * F1: `instructorProfileId` was the actual bypass — a client-side instructor
 * filter matched it against an unmasked roster to de-anonymize every masked
 * block) — all are either free text (or, for `instructorName`, a second
 * identity) that could reference a person, or a raw id joinable against an
 * anagrafica, so leaving any of them on the wire would defeat the point of
 * nulling `personName`; nulling `instructorName`/`instructorProfileId`
 * unconditionally also means a masked dual-instruction booking renders
 * IDENTICALLY to a masked solo one — no layout tell (AC 4's other
 * requirement). `status`/`cancelledAt`/etc. are left untouched — none of
 * them name a person, and hiding them would be an unrequested behavior
 * change (AC 5: admin/instructor/own bookings stay pixel-identical).
 */
function maskBookingNames(actor: Actor, canReadNames: boolean, ownInstructorProfileId: string | null, booking: BookingListItem): BookingListItem {
  const isOwn = booking.personId === actor.personId || (booking.instructorProfileId !== null && booking.instructorProfileId === ownInstructorProfileId);
  if (canReadNames || isOwn) return booking;
  return { ...booking, personName: null, instructorProfileId: null, instructorName: null, notes: null, denyReason: null };
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

/** The `select` both paths load the booking's target person with (story 16.3, AD-4): `createBooking` for every actor, `transitionBooking` on approval — one shape, two loads. */
const BOOKABLE_PERSON_SELECT = {
  id: true,
  archivedAt: true,
  pilotProfile: { select: { deactivatedAt: true } },
  studentProfile: { select: { deactivatedAt: true } },
  instructorProfile: { select: { deactivatedAt: true } },
} as const;

/**
 * The archived-person 409, shared by `createBooking` (every actor's path) and
 * the approval re-check (story 16.3, ops F4). Deliberately NOT folded into
 * {@link assertPersonHasActiveFlyingProfile}: on `createBooking` this 409
 * precedes all THREE profile gates (staff 422, own-self 403, cross-person
 * 422), so bundling the two would turn the own-self answer into a 403.
 */
function assertPersonNotArchived(person: TargetPerson): void {
  if (person.archivedAt !== null) {
    throw new ConflictError('Cannot book an aircraft for an archived person.');
  }
}

/** The staff gate "at least one ACTIVE flying profile" — `createBooking`'s `bookings.manage.any` branch, reused verbatim by the approval re-check (story 16.3, ops F4; approving is staff-only too). */
function assertPersonHasActiveFlyingProfile(person: TargetPerson): void {
  if (!isActivePilot(person) && !isActiveStudent(person) && !isActiveInstructor(person)) {
    throw new ValidationError('Person must have an active pilot, student or instructor profile to be booked.', undefined, 'PERSON_NOT_BOOKABLE');
  }
}

/** The indicated instructor's 404/409 — staff `createBooking` and the approval re-check (story 16.3, ops F4) — returning the id `createBooking` writes. */
async function assertActiveInstructorProfile(client: Prisma.TransactionClient, instructorProfileId: string): Promise<string> {
  const instructorProfile = await client.instructorProfile.findUnique({
    where: { id: instructorProfileId },
    select: { id: true, deactivatedAt: true },
  });
  if (!instructorProfile) {
    throw new NotFoundError('Instructor profile not found.');
  }
  if (instructorProfile.deactivatedAt !== null) {
    throw new ConflictError('This instructor profile is deactivated.');
  }
  return instructorProfile.id;
}

// --- The overlap invariant on its three subjects (story 16.3, ops F2) -------

/**
 * Row locks on the booking's PERSON and, when it has one, its INSTRUCTOR
 * (story 16.3, AD-2) — taken by the three write paths inside their
 * transaction, AFTER their `Aircraft` lock(s) and BEFORE
 * {@link findBookingConflict}. The `Aircraft` lock serializes only the writers
 * of the SAME aircraft: two approvals of the same person on two DIFFERENT
 * aircraft would serialize on nothing, and the person predicate alone would be
 * a check-then-write (ops F2, "serve un secondo lock"). The rows exist by
 * construction (FKs on `Booking`), so there is no 404 to raise: the result is
 * never read, the effect IS the lock — same idiom as the `Account` lock of
 * `accounts.service.ts#recordAdjustment`.
 *
 * `FOR NO KEY UPDATE`, not `FOR UPDATE` (decision of the main session,
 * 2026-09-27): it conflicts with itself, so two booking writers on the same
 * person/instructor still serialize, but NOT with the `FOR KEY SHARE` every
 * foreign-key check takes on its parent row. So an insert elsewhere that
 * references the same person (a flight, an expiry, an account movement) is
 * never blocked by a booking transaction — and no lock cycle can form with a
 * transaction whose FK checks visit `InstructorProfile` before `Person`
 * (today none does, but that order is decided by trigger OIDs, not by code).
 */
async function lockBookingPeople(tx: Prisma.TransactionClient, personId: string, instructorProfileId: string | null): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Person" WHERE "id" = ${personId} FOR NO KEY UPDATE`;
  if (instructorProfileId) {
    await tx.$queryRaw`SELECT "id" FROM "InstructorProfile" WHERE "id" = ${instructorProfileId} FOR NO KEY UPDATE`;
  }
}

/** The occupied subject behind an overlap 409 (story 16.3, AD-1). */
type BookingConflict =
  | { subject: 'AIRCRAFT'; booking: { id: string } }
  | { subject: 'PERSON' | 'INSTRUCTOR'; booking: { id: string; startsAt: Date; endsAt: Date } };

/**
 * The ONLY implementation of the three overlap predicates (story 16.3, ops
 * F2), called by the three write paths (`createBooking`, `updateBooking`,
 * `transitionBooking` -> APPROVED) inside their transaction and after their
 * locks, never copied: the three subjects share the semi-open
 * `[startsAt, endsAt)` semantics and the `status: 'APPROVED'` filter (story
 * 12.2: only an APPROVED booking occupies a slot — two PENDING ones coexist on
 * any subject, the conflict surfaces at approval).
 *
 * Three `findFirst`s in sequence, not one `OR`: the precedence
 * AIRCRAFT -> PERSON -> INSTRUCTOR is code, not a classification of whichever
 * row an `OR` returned. The aircraft goes FIRST because it is the answer the
 * three paths gave before this story and the one the UI and the e2e read (a
 * request that is ALSO person-busy keeps answering "aircraft already booked"),
 * and its `where`/`select` are the pre-story ones verbatim. The instructor
 * predicate does not run for a booking without one. Each extra predicate is an
 * index scan (`Booking_personId_idx`/`Booking_instructorProfileId_idx`, story
 * file: 0.17 ms on the 40 000-booking load DB) — no new index.
 *
 * NOT covered, declared (TD 16.3-a): the same human as the `personId` of one
 * booking and the instructor of another — the two predicates key on different
 * columns.
 */
async function findBookingConflict(
  tx: Prisma.TransactionClient,
  args: { aircraftId: string; personId: string; instructorProfileId: string | null; startsAt: Date; endsAt: Date; excludeBookingId?: string },
): Promise<BookingConflict | null> {
  const excludeSelf = args.excludeBookingId === undefined ? {} : { id: { not: args.excludeBookingId } };
  const overlapping = { status: 'APPROVED' as const, startsAt: { lt: args.endsAt }, endsAt: { gt: args.startsAt } };

  const aircraftConflict = await tx.booking.findFirst({
    where: { aircraftId: args.aircraftId, ...excludeSelf, ...overlapping },
    select: { id: true },
  });
  if (aircraftConflict) {
    return { subject: 'AIRCRAFT', booking: aircraftConflict };
  }

  // The earliest conflicting booking is the one `details` names (same rule as
  // `flights.service.ts#assertNoOverlappingFlight`, story 16.2).
  const personConflict = await tx.booking.findFirst({
    where: { personId: args.personId, ...excludeSelf, ...overlapping },
    orderBy: { startsAt: 'asc' },
    select: { id: true, startsAt: true, endsAt: true },
  });
  if (personConflict) {
    return { subject: 'PERSON', booking: personConflict };
  }

  if (!args.instructorProfileId) {
    return null;
  }
  const instructorConflict = await tx.booking.findFirst({
    where: { instructorProfileId: args.instructorProfileId, ...excludeSelf, ...overlapping },
    orderBy: { startsAt: 'asc' },
    select: { id: true, startsAt: true, endsAt: true },
  });
  return instructorConflict ? { subject: 'INSTRUCTOR', booking: instructorConflict } : null;
}

/**
 * The 409 for a {@link findBookingConflict} hit (story 16.3, AD-3). The
 * aircraft one is the pre-story error byte for byte — code `CONFLICT`, same
 * message, and NO `details`: that booking belongs to someone ELSE, and putting
 * its interval on the wire would be the correlation channel the story 14.5
 * masking exists to close. `PERSON_BUSY`/`INSTRUCTOR_BUSY` name the
 * conflicting booking, which by construction of their predicate belongs to the
 * very person/instructor the request names — nothing new about a third party.
 * The instants are ISO 8601 UTC written by hand (story 16.2's discipline: the
 * wire format is written down, not inferred).
 */
function bookingConflictError(conflict: BookingConflict): ConflictError {
  if (conflict.subject === 'AIRCRAFT') {
    return new ConflictError('This aircraft is already booked for an overlapping interval.');
  }
  const details = { bookingId: conflict.booking.id, startsAt: conflict.booking.startsAt.toISOString(), endsAt: conflict.booking.endsAt.toISOString() };
  return conflict.subject === 'PERSON'
    ? new ConflictError('This person already has an approved booking for an overlapping interval.', details, 'PERSON_BUSY')
    : new ConflictError('This instructor already has an approved booking for an overlapping interval.', details, 'INSTRUCTOR_BUSY');
}


/** One non-blocking expired document surfaced by a successful `createBooking` (story 7.4, AC 1) — see the function's own doc-comment. */
export type BookingExpiryWarning = { typeName: string; expiresAt: string };

/** `createBooking`'s return shape (story 7.4, AC 1/2) — REPLACES the bare `BookingListItem` this function returned before this story (see its doc-comment). */
export type CreateBookingResult = { booking: BookingListItem; warnings: BookingExpiryWarning[] };

/** A single expired document surfaced by {@link findBlockingExpiredDocuments} — exported (story 14.4) so `flights.service.ts` can share its return shape without redeclaring it. */
export type ExpiredDocument = { typeName: string; expiresAt: string };

/**
 * `personId`'s REGISTERED expiries, partitioned against `flightDateOnly`
 * (`YYYY-MM-DD`, `APP_TIMEZONE`) into `blockingDocuments`
 * (`ExpiryType.blocksBooking`) and non-blocking `warnings` — the shared core
 * of `createBooking`'s expiry-based block (story 7.4, AC 1/2) and
 * `updateBooking`'s day-change recheck (story TD-5, AC 5). Identical query
 * and date-only filter as `createBooking`'s original inline logic (module
 * doc-comment: "anchored to the flight day, not today"). Deciding what to DO
 * with `blockingDocuments` — `createBooking`'s `force` bypass vs
 * `updateBooking`'s unconditional 422 — is each caller's own concern; this
 * helper never throws.
 *
 * Exported (story 14.4, AC 1; ratifica R4) — `flights.service.ts#resolveFlightInput`
 * reuses this EXACT function (called once for the pilot/student, once more
 * for the instructor when present) rather than reimplementing the
 * `ExpiryType.blocksBooking` scan a second time. The flight side only ever
 * consumes `blockingDocuments` (flights have no `warnings` concept, AC 1/2
 * of that story).
 */
export async function findBlockingExpiredDocuments(
  personId: string,
  flightDateOnly: string,
): Promise<{ blockingDocuments: ExpiredDocument[]; warnings: BookingExpiryWarning[] }> {
  const expiries = await prisma.expiry.findMany({
    where: { personId },
    select: { expiresAt: true, expiryType: { select: { name: true, blocksBooking: true } } },
  });
  const expiredDocuments = expiries
    .filter((expiry) => toDateOnlyString(expiry.expiresAt) < flightDateOnly)
    .map((expiry) => ({ typeName: expiry.expiryType.name, expiresAt: toDateOnlyString(expiry.expiresAt), blocksBooking: expiry.expiryType.blocksBooking }));

  return {
    blockingDocuments: expiredDocuments.filter((document) => document.blocksBooking).map((document) => ({ typeName: document.typeName, expiresAt: document.expiresAt })),
    warnings: expiredDocuments.filter((document) => !document.blocksBooking).map((document) => ({ typeName: document.typeName, expiresAt: document.expiresAt })),
  };
}

// --- Booking window (story 12.11, AC 4; ratifica utente 3) -----------------

const MS_PER_DAY = 86_400_000;

/** `"HH:MM"` -> minutes since midnight. */
function minutesOfDay(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number) as [number, number];
  return hour * 60 + minute;
}

/**
 * Rejects a booking whose `startsAt`/`endsAt` fall outside the configured
 * `sched.openTime`–`sched.closeTime` window (Europe/Rome) or whose
 * `startsAt` is more than `sched.maxAdvanceDays` ahead of today — 422
 * `BOOKING_OUTSIDE_WINDOW` (ratifica utente 3). `minSlotMinutes`/
 * `turnaroundMinutes` are deliberately NOT read here — they stay ADVISORY
 * (UI-only defaults/validation, never a server rejection).
 *
 * ANY of the three settings being absent (`null`) disables ONLY that half of
 * the check (Contesto: "chiavi assenti -> nessun vincolo nuovo",
 * backward-safe) — `openTime`/`closeTime` are checked together (both or
 * neither: a half-configured window would otherwise reject every booking
 * against a bound of `0`), `maxAdvanceDays` is independent.
 *
 * The open/close bounds are INCLUSIVE (`startsAt` may equal `openTime`,
 * `endsAt` may equal `closeTime`) and both instants must fall on the SAME
 * Europe/Rome calendar day — a booking crossing midnight is always outside
 * the window (a `closeTime` at or before midnight makes that geometrically
 * inevitable).
 */
async function assertWithinSchedulingWindow(startsAt: Date, endsAt: Date): Promise<void> {
  const settings = await getSchedulingSettings();

  if (settings.openTime && settings.closeTime) {
    const startDay = dateOnlyInZone(startsAt, APP_TIMEZONE);
    const endDay = dateOnlyInZone(endsAt, APP_TIMEZONE);
    const openMinutes = minutesOfDay(settings.openTime);
    const closeMinutes = minutesOfDay(settings.closeTime);
    const startMinutes = zonedWallTime(startsAt, APP_TIMEZONE).hour * 60 + zonedWallTime(startsAt, APP_TIMEZONE).minute;
    const endMinutes = zonedWallTime(endsAt, APP_TIMEZONE).hour * 60 + zonedWallTime(endsAt, APP_TIMEZONE).minute;

    const withinWindow = startDay === endDay && startMinutes >= openMinutes && endMinutes <= closeMinutes;
    if (!withinWindow) {
      throw new ValidationError(
        `Booking must fall within the ${settings.openTime}–${settings.closeTime} operating window.`,
        undefined,
        'BOOKING_OUTSIDE_WINDOW',
      );
    }
  }

  if (settings.maxAdvanceDays !== null) {
    const startDay = dateOnlyInZone(startsAt, APP_TIMEZONE);
    const today = dateOnlyInZone(new Date(), APP_TIMEZONE);
    const daysAhead = Math.round((parseDateOnlyUtc(startDay).getTime() - parseDateOnlyUtc(today).getTime()) / MS_PER_DAY);
    if (daysAhead > settings.maxAdvanceDays) {
      throw new ValidationError(
        `Booking cannot be made more than ${settings.maxAdvanceDays} day(s) in advance.`,
        undefined,
        'BOOKING_OUTSIDE_WINDOW',
      );
    }
  }
}

/**
 * Creates a booking (AC 1/2/3) — see the module doc-comment for the full
 * matrix/ordering rationale.
 *
 * **Expiry-based block (story 7.4, AC 1/2; FR-21)**: after the target
 * person's own checks pass, every `Expiry` REGISTERED for that person
 * (`input.personId` — the person WHO FLIES: the allievo on a school
 * booking, never the instructor/staff actor) is compared against the FLIGHT
 * DAY, not "today" — `dateOnlyInZone(startsAt, APP_TIMEZONE)` — because a
 * booking made now for a future day must be judged against THAT day's
 * validity (Contesto: prenotare per dopodomani con la medica che scade
 * stanotte DEVE bloccare). The expiry day itself is still valid (same
 * boundary as `computeExpiryStatus`/package eligibility, story 5.2/6.2):
 * `toDateOnlyString(expiry.expiresAt) < flightDateOnly` is "expired for this
 * flight". A document with no registered `Expiry` row is NEVER blocking —
 * only a REGISTERED, EXPIRED one is (missing-document enforcement is out of
 * scope, Contesto: staff's own dashboard, story 6.4, carries that picture).
 * Every expired document whose `ExpiryType.blocksBooking` is `true` is
 * BLOCKING; every other expired document is a non-blocking `warnings` entry
 * on the successful result — `details.documents`/the message list ONLY the
 * blocking ones (Task 5's decision: warnings never appear in the 422).
 *
 * `force`/`forceReason` (AC 2): a plain `force: true` from a non-staff actor
 * is REJECTED with 403 immediately after the own-rules block above — BEFORE
 * the target-person query, let alone any expiry query (own-path booking
 * never bypasses a block, full stop). For staff, a real block (≥1 blocking
 * document) is bypassed ONLY when `force` is set — the schema's own refine
 * already guarantees `forceReason` is present whenever `force` is `true` —
 * and the bypass STAMPS `forcedAt`/`forcedByUserId`/`forceReason` on the
 * created row. `force: true` with NOTHING to bypass (no blocking document)
 * creates the booking normally, stamping NOTHING (Contesto: the tracking
 * means "scavalcato un blocco", not "ha spuntato una checkbox").
 *
 * Runs AFTER every person check and BEFORE `BOOKING_IN_PAST` (module
 * doc-comment's "ordine complessivo") — scadenze participate in NEITHER the
 * overlap invariant NOR the aircraft lock, so this stays entirely outside
 * `prisma.$transaction`, same rationale as the person checks above it.
 */
export async function createBooking(actor: Actor, input: CreateBookingInput): Promise<CreateBookingResult> {
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

  // Story 7.4, AC 2: `force` without `bookings.manage.any` is rejected
  // BEFORE any further query (persona, let alone scadenze) — own-path
  // booking never bypasses a block.
  if (input.force && !canManageAny) {
    throw new ForbiddenError('Only an admin can force a blocked booking.');
  }

  // Target person (404/409/422) — resolved and validated OUTSIDE the
  // transaction, so the error order stays the one the module doc-comment
  // lists (and the 403-before-target-query rule above holds). The person's
  // part in the overlap invariant is its row LOCK, taken inside the
  // transaction below (story 16.3, AD-2). For the own-self path
  // `input.personId === actor.personId`, so this IS the actor's own row — the
  // same query also carries the self-eligibility check.
  const person = await prisma.person.findUnique({
    where: { id: input.personId },
    select: BOOKABLE_PERSON_SELECT,
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }
  assertPersonNotArchived(person);

  if (canManageAny) {
    // ADMIN-only (`bookings.manage.any`): any active pilot, student or instructor is bookable.
    assertPersonHasActiveFlyingProfile(person);

    if (input.instructorProfileId) {
      resolvedInstructorProfileId = await assertActiveInstructorProfile(prisma, input.instructorProfileId);
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

  // --- Expiry-based booking block (story 7.4, AC 1/2) — see this
  // function's own doc-comment for the full rationale. Deliberately NOT
  // `computeExpiryStatus` (Dev Notes: that helper is anchored to "today",
  // this rule is anchored to the FLIGHT DAY) — a direct date-only compare.
  const flightDateOnly = dateOnlyInZone(startsAt, APP_TIMEZONE);
  const { blockingDocuments, warnings } = await findBlockingExpiredDocuments(input.personId, flightDateOnly);

  let forceStamp: { forcedAt: Date; forcedByUserId: string; forceReason: string } | null = null;
  if (blockingDocuments.length > 0) {
    if (input.force) {
      // `force-403` above already guarantees `canManageAny` here, and the
      // schema's own refine guarantees `forceReason` is a non-empty string
      // whenever `force` is `true` — the `!` is safe.
      forceStamp = { forcedAt: new Date(), forcedByUserId: actor.userId, forceReason: input.forceReason! };
    } else {
      throw new ValidationError(
        `Cannot create this booking: the following documents are expired: ${blockingDocuments.map((document) => document.typeName).join(', ')}.`,
        { documents: blockingDocuments },
        'EXPIRED_DOCUMENTS',
      );
    }
  }

  if (startsAt.getTime() <= Date.now()) {
    throw new ValidationError('startsAt must be in the future.', undefined, 'BOOKING_IN_PAST');
  }

  // Story 12.11, AC 4 (ratifica utente 3): outside the transaction, same
  // rationale as the expiry-based block above — the scheduling window
  // participates in neither the overlap invariant nor the aircraft lock.
  await assertWithinSchedulingWindow(startsAt, endsAt);

  const created = await prisma.$transaction(async (tx) => {
    // Row lock (FOR UPDATE) — the FIRST statement in the transaction (module
    // doc-comment), same raw-query pattern as
    // `flights.service.ts#registerFlight`. One fetch serves both the
    // aircraft-state validation below and the overlap invariant (AC 2).
    const lockedAircraft = await tx.$queryRaw<Array<{ id: string; status: string; statusReason: string | null; outOfServiceUntil: Date | null; archivedAt: Date | null }>>`
      SELECT "id", "status", "statusReason", "outOfServiceUntil", "archivedAt" FROM "Aircraft" WHERE "id" = ${input.aircraftId} FOR UPDATE`;
    const aircraft = lockedAircraft[0];
    if (!aircraft) {
      throw new NotFoundError('Aircraft not found.');
    }
    if (aircraft.archivedAt !== null) {
      throw new ConflictError('Aircraft is archived.');
    }
    if (aircraft.status === 'OUT_OF_SERVICE') {
      throw new ValidationError(`Aircraft is out of service: ${aircraft.statusReason}.`, outOfServiceDetails(aircraft), 'AIRCRAFT_OUT_OF_SERVICE');
    }

    // Overlap pre-check (AC 2) on the aircraft, the person and the instructor
    // (story 16.3): semi-open `[startsAt, endsAt)` — two bookings that merely
    // touch at the boundary do NOT overlap — and only an APPROVED booking
    // occupies a slot (story 12.2), see `findBookingConflict`.
    await lockBookingPeople(tx, input.personId, resolvedInstructorProfileId);
    const conflict = await findBookingConflict(tx, {
      aircraftId: input.aircraftId,
      personId: input.personId,
      instructorProfileId: resolvedInstructorProfileId,
      startsAt,
      endsAt,
    });
    if (conflict) {
      throw bookingConflictError(conflict);
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
        // Story 12.2, AC 2: the service ALWAYS stamps status explicitly,
        // never the column default — ADMIN-only (`bookings.manage.any`)
        // bookings start APPROVED, everyone else's start PENDING.
        status: canManageAny ? 'APPROVED' : 'PENDING',
        // Story 7.4, AC 2: stamped ONLY when a real block was bypassed
        // (`forceStamp` above) — otherwise every field stays `null`.
        ...(forceStamp ?? {}),
      },
      select: BOOKING_SELECT,
    });
  });

  return { booking: toListItem(created), warnings };
}

/**
 * Lists bookings (FR-19, anticipated to its minimum for this story) —
 * `self.read` (every role holds it, Dev Notes: "qualunque autenticato").
 * Filters `from`/`to` use the SAME semi-open semantics as the overlap check
 * (`endsAt > from`, `startsAt < to`); `aircraftId`/`personId` are exact
 * matches — EXCEPT `personId` for an actor without `bookings.read.names`
 * (review F3), who may only ever filter by their OWN `personId` (403
 * otherwise, checked before any query) — same guard shape as
 * `flights.service.ts#authorizeFlightsQuery`: masked names alone would still
 * let such an actor enumerate "every booking of person X" via this filter,
 * a linkability channel the masking itself does nothing to close. Ordered
 * `startsAt asc, id asc` (soonest-first, deterministic tie-break). The DTO
 * includes the booking-holder and instructor NAMES and `notes` — but MASKED
 * (story 14.5, ratifica R3, superseding the original "an aeroclub is
 * transparent about who has the aircraft when" call) on every entry that
 * isn't the actor's own, unless the actor holds `bookings.read.names`
 * (`maskBookingNames`'s own doc-comment has the full rationale/shape).
 *
 * `status` (story 12.2, AC 4): defaults to `APPROVED` only — today's "vivi"
 * bookings, same set the legacy UI has always shown (was `ACTIVE`) — an
 * explicit `query.status` array (added ahead of its first consumer, story
 * 12.3's UI) overrides the default entirely with an `IN` filter.
 */
export async function listBookings(actor: Actor, query: ListBookingsQuery): Promise<PaginatedResult<BookingListItem>> {
  authorize(actor, 'self.read');
  const canReadNames = hasPermission(actor, 'bookings.read.names');

  if (!canReadNames && query.personId && query.personId !== actor.personId) {
    throw new ForbiddenError('Actor may only filter their own bookings.');
  }

  // Review F4 — resolved ONCE per request (never per row), only when it can
  // actually matter: an actor who already reads every name has no masking
  // decision left to make. See `maskBookingNames`'s doc-comment.
  const ownInstructorProfileId = canReadNames ? null : await getOwnInstructorProfileId(actor);

  const where = {
    status: query.status ? { in: query.status } : ('APPROVED' as const),
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

  return paginate(
    items.map((item) => maskBookingNames(actor, canReadNames, ownInstructorProfileId, toListItem(item))),
    total,
    query,
  );
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
 *
 * Same masking as `listBookings` (story 14.5, ratifica R3): every entry that
 * isn't the actor's own is run through `maskBookingNames` too — the
 * timeline (`schedule.tsx`'s day/week blocks) is fed straight from this
 * function, so it would otherwise leak names right past the list's own
 * masking. No `personId` filter on this endpoint (Contesto/F3), so the
 * linkability guard `listBookings` needs does not apply here.
 */
export async function listCalendarBookings(actor: Actor, query: CalendarBookingsQuery): Promise<BookingListItem[]> {
  authorize(actor, 'self.read');
  const canReadNames = hasPermission(actor, 'bookings.read.names');

  const from = new Date(query.from);
  const to = new Date(query.to);

  if (to.getTime() <= from.getTime()) {
    throw new ValidationError('to must be strictly after from.');
  }
  if (to.getTime() - from.getTime() > MAX_CALENDAR_RANGE_MS) {
    throw new ValidationError('The calendar range cannot exceed 8 days.', undefined, 'RANGE_TOO_WIDE');
  }

  // Review F4 — same "once per request" rationale as `listBookings`.
  const ownInstructorProfileId = canReadNames ? null : await getOwnInstructorProfileId(actor);

  const bookings = await prisma.booking.findMany({
    select: BOOKING_SELECT,
    // `status: 'APPROVED'` (story 12.2, AC 4): unlike `listBookings`, the
    // calendar stays APPROVED-only, no `status` param — a cancelled or
    // not-yet-approved booking has no slot to show here.
    where: { status: 'APPROVED', startsAt: { lt: to }, endsAt: { gt: from } },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    take: 1000,
  });

  return bookings.map((booking) => maskBookingNames(actor, canReadNames, ownInstructorProfileId, toListItem(booking)));
}

// --- Booking edit/cancel (story 7.3, AC 1/2) --------------------------------
// Soft-cancel + tracked edit — see `Booking`'s Prisma doc-comment for the
// `status`/`cancelledAt`/`cancelledByUserId`/`updatedByUserId` shape.

const EDITABLE_BOOKING_SELECT = {
  id: true,
  personId: true,
  instructorProfileId: true,
  aircraftId: true,
  startsAt: true,
  endsAt: true,
  notes: true,
  status: true,
} as const;

type EditableBooking = {
  id: string;
  personId: string;
  instructorProfileId: string | null;
  aircraftId: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  status: BookingStatus;
};

/**
 * Own-access + temporal gate shared by `updateBooking`/`cancelBooking`
 * (Contesto): "own" = the booking's `personId` matches the actor's own
 * person, OR its `instructorProfileId` matches the actor's own ACTIVE
 * `InstructorProfile` (an instructor manages the school bookings they are
 * involved in — the allievo never holds `bookings.manage.own` at all, story
 * 7.1). `bookings.manage.any` (ADMIN-only) skips BOTH checks entirely — no
 * ownership gate AND, deliberately, NO temporal constraint ("lo staff può
 * sempre" — the asymmetry with the own-path below is intentional).
 *
 * The own-path additionally requires the booking to still be FUTURE
 * (`startsAt > now`), for both edit and cancel — an already-started booking
 * answers 422 `BOOKING_ALREADY_STARTED`. This runs AFTER the caller's own
 * fetch (404) and already-cancelled check (409): bookings are visible to
 * every authenticated actor via `self.read` (Contesto: unlike the
 * cross-person case in `createBooking`, there is no existence-oracle to
 * protect here — fetching first to decide 404-vs-403 is safe).
 */
async function assertOwnAccessAndTiming(actor: Actor, canManageAny: boolean, booking: EditableBooking): Promise<void> {
  if (canManageAny) return;

  const isOwnPerson = booking.personId === actor.personId;
  let isOwnInstructor = false;
  if (!isOwnPerson && booking.instructorProfileId !== null) {
    const ownInstructorProfileId = await getOwnInstructorProfileId(actor);
    isOwnInstructor = ownInstructorProfileId !== null && ownInstructorProfileId === booking.instructorProfileId;
  }
  if (!isOwnPerson && !isOwnInstructor) {
    throw new ForbiddenError('Actor may only modify or cancel their own bookings.');
  }

  if (booking.startsAt.getTime() <= Date.now()) {
    throw new ValidationError(
      'This booking has already started and can no longer be modified or cancelled.',
      undefined,
      'BOOKING_ALREADY_STARTED',
    );
  }
}

/**
 * Edits a booking's `aircraftId`/`startsAt`/`endsAt`/`notes` (AC 1/2) — a
 * partial PATCH, merge-validated against the RESULTING values (Contesto:
 * `personId`/`instructorProfileId` are immutable, stripped by Zod — never
 * accepted here at all). Own-path: only a future booking may be edited
 * (`BOOKING_ALREADY_STARTED`, 422, `assertOwnAccessAndTiming`) and the NEW
 * interval must itself be future (`BOOKING_IN_PAST`, 422) — staff
 * (`bookings.manage.any`) is exempt from BOTH (deliberate asymmetry with
 * `createBooking`'s own rules, Contesto: staff can correct an in-progress
 * booking, e.g. shorten it).
 *
 * **Re-checks the scheduling window (story 15.4 review, PO decision
 * 2026-08-03)**: the resulting interval must satisfy
 * `assertWithinSchedulingWindow` — 422 `BOOKING_OUTSIDE_WINDOW` — exactly like
 * a create, staff INCLUDED (the deliberate staff exemptions above are about
 * TIME having passed, not about the airfield being open). Until this story the
 * window ran on create and on `PENDING -> APPROVED` only, so a booking could be
 * MOVED to 03:00 against a 14:00-18:00 window and answer 200 (measured), and
 * the "Sposta" panel's own `BOOKING_OUTSIDE_WINDOW` branch (ratifica R-15.4-g)
 * was unreachable code. Checked on the MERGED interval, like every other rule
 * here, so a notes-only PATCH of a booking already outside the CURRENT window
 * is refused too — the same answer the create path gives for that interval.
 *
 * **Re-evaluates expiries on a DAY change only (story 7.4 loophole closed by
 * TD-5, AC 5)**: moving this booking to a DIFFERENT flight day reruns the
 * SAME expiry-based block `createBooking` runs at creation
 * (`findBlockingExpiredDocuments`, the shared helper) against `personId`
 * (`existing.personId`, the person who flies) and the NEW day — a blocking
 * document is a hard 422 `EXPIRED_DOCUMENTS`, same shape as the create path,
 * with NO `force` bypass on this endpoint (staff who must deliberately move
 * past a scadenza cancels and recreates with `force`). A same-day edit
 * (time/aircraft/notes only) never re-checks — a booking created with
 * `force` past a blocking document stays editable within that same day
 * (Contesto: the loophole being closed is specifically the day-move, not
 * ordinary same-day corrections).
 *
 * **Concurrency (same discipline as `createBooking`, AC 2)**: inside
 * `prisma.$transaction`, ALL involved `Aircraft` rows — the destination and,
 * if different, the CURRENT one — are locked in ONE
 * `WHERE id IN (...) ORDER BY id FOR UPDATE` query (the exact multi-lock
 * pattern of `flights.service.ts#correctFlight`, anti-deadlock against two
 * concurrent moves crossing aircraft; a same-aircraft edit collapses to the
 * 1-element set `createBooking` already uses). Only the DESTINATION
 * aircraft's state is validated (404/409 archived/422
 * `AIRCRAFT_OUT_OF_SERVICE`, even for staff) — the booking is LEAVING the
 * current aircraft, not landing on it, so that aircraft's own state is
 * irrelevant to this write. The overlap pre-check excludes this booking
 * itself (`id: { not: bookingId }`) and every CANCELLED row.
 *
 * The final write is ONE atomic `updateMany({ where: { id, status: existing.status },
 * ... })` — folding the "still in the same status just read" guard INTO the
 * write, rather than a separate re-fetch followed by a plain `.update()`.
 * That distinction
 * matters: a concurrent `cancelBooking` racing between a re-fetch and a
 * later unconditional `.update()` could land its write in between, and while
 * this edit's `data` never touches `status` (so it would not literally
 * resurrect a cancelled booking), it WOULD still silently rewrite
 * aircraft/times/notes on a row that is supposed to be frozen the instant it
 * is cancelled. The single guarded `updateMany` (same pattern as
 * `cash.service.ts`'s reversal guard) closes that window entirely —
 * `count === 0` means a concurrent cancel won the race, 409, same
 * `ConflictError` message as the fast pre-check below.
 */
export async function updateBooking(actor: Actor, bookingId: string, input: UpdateBookingInput): Promise<BookingListItem> {
  const canManageAny = hasPermission(actor, 'bookings.manage.any');
  if (!canManageAny) {
    authorize(actor, 'bookings.manage.own');
  }

  const existing = await prisma.booking.findUnique({ where: { id: bookingId }, select: EDITABLE_BOOKING_SELECT });
  if (!existing) {
    throw new NotFoundError('Booking not found.');
  }
  // Story 12.2, AC 4: editable from BOTH PENDING and APPROVED (was ACTIVE
  // only) — any other status (DENIED/FLOWN/NO_SHOW/CANCELLED) is a 409,
  // same shape as before.
  if (existing.status !== 'PENDING' && existing.status !== 'APPROVED') {
    throw new ConflictError('This booking has already been cancelled.');
  }

  await assertOwnAccessAndTiming(actor, canManageAny, existing);

  const nextAircraftId = input.aircraftId ?? existing.aircraftId;
  const nextStartsAt = input.startsAt !== undefined ? new Date(input.startsAt) : existing.startsAt;
  const nextEndsAt = input.endsAt !== undefined ? new Date(input.endsAt) : existing.endsAt;
  const nextNotes = input.notes !== undefined ? input.notes : existing.notes;

  if (nextEndsAt.getTime() <= nextStartsAt.getTime()) {
    throw new ValidationError('endsAt must be strictly after startsAt.');
  }
  if (!canManageAny && nextStartsAt.getTime() <= Date.now()) {
    throw new ValidationError('startsAt must be in the future.', undefined, 'BOOKING_IN_PAST');
  }

  // TD-5, AC 5: rerun the create's expiry-based block, but ONLY when the
  // flight DAY actually changes (see this function's own doc-comment) —
  // scadenze participate in neither the overlap invariant nor the aircraft
  // lock, so this stays outside `prisma.$transaction`, same rationale as
  // `createBooking`'s own expiry check.
  const nextFlightDateOnly = dateOnlyInZone(nextStartsAt, APP_TIMEZONE);
  if (nextFlightDateOnly !== dateOnlyInZone(existing.startsAt, APP_TIMEZONE)) {
    const { blockingDocuments } = await findBlockingExpiredDocuments(existing.personId, nextFlightDateOnly);
    if (blockingDocuments.length > 0) {
      throw new ValidationError(
        `Cannot move this booking: the following documents are expired: ${blockingDocuments.map((document) => document.typeName).join(', ')}.`,
        { documents: blockingDocuments },
        'EXPIRED_DOCUMENTS',
      );
    }
  }

  // Story 15.4 review (PO decision, 2026-08-03): the scheduling window is
  // re-checked HERE too — see this function's own doc-comment. Same position
  // in the sequence as `createBooking`'s (after the expiry block, outside the
  // transaction), so the two paths report the same code first on the same
  // input, and on the MERGED interval like every other rule above.
  await assertWithinSchedulingWindow(nextStartsAt, nextEndsAt);

  const updated = await prisma.$transaction(async (tx) => {
    // ALL Aircraft ids first, ONE query, ORDER BY id FOR UPDATE — same
    // multi-lock pattern as `flights.service.ts#correctFlight` (module
    // doc-comment above): the destination aircraft, plus the CURRENT one if
    // different (a 1-element set covers the common "same aircraft" edit).
    const aircraftIds = Array.from(new Set([existing.aircraftId, nextAircraftId]));
    const lockedAircraftRows = await tx.$queryRaw<Array<{ id: string; status: string; statusReason: string | null; outOfServiceUntil: Date | null; archivedAt: Date | null }>>`
      SELECT "id", "status", "statusReason", "outOfServiceUntil", "archivedAt" FROM "Aircraft" WHERE "id" IN (${Prisma.join(aircraftIds)}) ORDER BY "id" FOR UPDATE`;

    const destinationAircraft = lockedAircraftRows.find((row) => row.id === nextAircraftId);
    if (!destinationAircraft) {
      throw new NotFoundError('Aircraft not found.');
    }
    if (destinationAircraft.archivedAt !== null) {
      throw new ConflictError('Aircraft is archived.');
    }
    if (destinationAircraft.status === 'OUT_OF_SERVICE') {
      throw new ValidationError(
        `Aircraft is out of service: ${destinationAircraft.statusReason}.`,
        outOfServiceDetails(destinationAircraft),
        'AIRCRAFT_OUT_OF_SERVICE',
      );
    }

    // Overlap pre-check (AC 2, same semantics as `createBooking`'s, on the
    // same three subjects — story 16.3): excludes THIS booking (it is moving,
    // not colliding with itself). The person and instructor are the booking's
    // own — immutable on a PATCH.
    await lockBookingPeople(tx, existing.personId, existing.instructorProfileId);
    const conflict = await findBookingConflict(tx, {
      aircraftId: nextAircraftId,
      personId: existing.personId,
      instructorProfileId: existing.instructorProfileId,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      excludeBookingId: bookingId,
    });
    if (conflict) {
      throw bookingConflictError(conflict);
    }

    // The atomic guard+write (module doc-comment above): folds the "still
    // in the SAME status just read" precondition INTO the update itself —
    // no separate re-fetch, no TOCTOU window between checking and writing.
    // `existing.status` (story 12.2: PENDING or APPROVED, both editable) —
    // a concurrent transitionBooking/cancelBooking racing in between would
    // move it away from this exact value, correctly losing this guard.
    const guard = await tx.booking.updateMany({
      where: { id: bookingId, status: existing.status },
      data: {
        aircraftId: nextAircraftId,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        notes: nextNotes,
        updatedByUserId: actor.userId,
      },
    });
    if (guard.count === 0) {
      throw new ConflictError('This booking has already been cancelled.');
    }

    return tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: BOOKING_SELECT });
  });

  return toListItem(updated);
}

/**
 * Cancels a booking (soft, AC 1/2) — flips `status` to `CANCELLED`
 * (`cancelledAt`/`cancelledByUserId` set together), which FREES the slot
 * (Booking's doc-comment). Own/temporal rules are IDENTICAL to
 * `updateBooking`'s (`assertOwnAccessAndTiming`, shared) — an own-path actor
 * cannot cancel a booking that already started (`BOOKING_ALREADY_STARTED`,
 * 422); staff always can ("lo staff può sempre").
 *
 * **No aircraft lock** (Contesto, unlike `updateBooking`/`createBooking`):
 * cancelling never touches the overlap invariant — it can only ever FREE a
 * slot, never create a conflict — so there is nothing to serialize against.
 * The guard against a double-cancel race is the SAME atomic
 * `updateMany({ where: { id, status: existing.status }, ... })` pattern as
 * `updateBooking` (and `cash.service.ts`'s reversal guard) —
 * `count === 0` means a concurrent cancel (or an edit-vs-cancel race) already
 * flipped this booking's status first, 409, race-safe. Cancellable from
 * BOTH `PENDING` and `APPROVED` (story 12.2, AC 4, was `ACTIVE` only) — any
 * other status is a 409, same shape as before.
 */
export async function cancelBooking(actor: Actor, bookingId: string): Promise<BookingListItem> {
  const canManageAny = hasPermission(actor, 'bookings.manage.any');
  if (!canManageAny) {
    authorize(actor, 'bookings.manage.own');
  }

  const existing = await prisma.booking.findUnique({ where: { id: bookingId }, select: EDITABLE_BOOKING_SELECT });
  if (!existing) {
    throw new NotFoundError('Booking not found.');
  }
  if (existing.status !== 'PENDING' && existing.status !== 'APPROVED') {
    throw new ConflictError('This booking has already been cancelled.');
  }

  await assertOwnAccessAndTiming(actor, canManageAny, existing);

  const guard = await prisma.booking.updateMany({
    where: { id: bookingId, status: existing.status },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: actor.userId },
  });
  if (guard.count === 0) {
    throw new ConflictError('This booking has already been cancelled.');
  }

  const cancelled = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: BOOKING_SELECT });
  return toListItem(cancelled);
}

// --- Booking approval workflow (epic 12, story 12.2) ------------------------
// PENDING/APPROVED/DENIED/FLOWN/NO_SHOW — see `Booking`'s Prisma doc-comment
// for the full transition matrix and rationale.

/** `transitionBooking`'s `to` (AC 6): the schema itself excludes `CANCELLED` — cancelling stays `cancelBooking`'s own endpoint, never part of this matrix. */
type TransitionTarget = Exclude<BookingStatus, 'CANCELLED'>;

/**
 * The legal `from -> to` pairs (AC 3) — every pair NOT covered here is
 * `BOOKING_TRANSITION_INVALID`. `CANCELLED` never appears as a `from` either
 * (it is a dead end reachable only via `cancelBooking`), and neither does a
 * same-state no-op (e.g. `PENDING -> PENDING`) — the matrix is exhaustive on
 * `to` by construction (switch), so an unmapped `from` for a given `to`
 * simply falls through to `false`.
 */
function isLegalBookingTransition(from: BookingStatus, to: TransitionTarget): boolean {
  switch (to) {
    case 'APPROVED':
      return from === 'PENDING';
    case 'DENIED':
      return from === 'PENDING';
    case 'FLOWN':
    case 'NO_SHOW':
      return from === 'APPROVED';
    case 'PENDING':
      // "Riapri" — from any decided/closed state back to PENDING.
      return from === 'DENIED' || from === 'FLOWN' || from === 'NO_SHOW';
  }
}

/**
 * The field stamps/resets for each legal `to` (AC 3) — `reason` is only read
 * for `DENIED`, already guaranteed non-empty by `transitionBooking`'s own
 * check before this is called. `Unchecked` (not the plain
 * `BookingUpdateManyMutationInput`): `decidedByUserId`/`closedByUserId` are
 * FK scalars only exposed on the Unchecked variant, same as every other raw
 * `actorUserId`-shaped stamp in this file.
 */
function transitionUpdateData(to: TransitionTarget, actorUserId: string, reason: string | undefined, now: Date): Prisma.BookingUncheckedUpdateManyInput {
  switch (to) {
    case 'APPROVED':
      return { status: 'APPROVED', decidedAt: now, decidedByUserId: actorUserId };
    case 'DENIED':
      return { status: 'DENIED', decidedAt: now, decidedByUserId: actorUserId, denyReason: reason };
    case 'FLOWN':
    case 'NO_SHOW':
      return { status: to, closedAt: now, closedByUserId: actorUserId };
    case 'PENDING':
      // "Riapri": every decision/closure field resets together.
      return { status: 'PENDING', decidedAt: null, decidedByUserId: null, denyReason: null, closedAt: null, closedByUserId: null };
  }
}

type LockedBookingRow = { id: string; status: BookingStatus; personId: string; instructorProfileId: string | null; aircraftId: string; startsAt: Date; endsAt: Date };

/**
 * Moves a booking through the approval workflow (AC 3) — `bookings.manage.any`
 * only, for EVERY transition (including "riapri": staff-only, never an
 * own-path action — see the module doc-comment). Locks the `Booking` row
 * `FOR UPDATE` as the FIRST statement in the transaction (same discipline as
 * `ppr.service.ts#lockPprRequest`), so a race with another transition on the
 * SAME booking serializes rather than double-applying.
 *
 * `PENDING -> APPROVED` re-runs `createBooking`'s own checks against the
 * CURRENT booking, in `createBooking`'s own order and with its own codes —
 * the booking's person (409 archived, 422 `PERSON_NOT_BOOKABLE` without an
 * active flying profile) and instructor (409 deactivated), story 16.3 / ops
 * F4; the expiry-based block on the flight day (`findBlockingExpiredDocuments`,
 * no `force` bypass here, unlike create); the scheduling-window check (story
 * 12.11, AC 4, `assertWithinSchedulingWindow`); the `Aircraft` row locked
 * `FOR UPDATE` and validated (archived/out-of-service); the `Person`/
 * `InstructorProfile` locks; and the overlap pre-check on the aircraft, the
 * person and the instructor against every OTHER `APPROVED` booking
 * (`findBookingConflict`). An approval is, in effect, "would this booking
 * still be creatable today" — with ONE exception, ratified (R-16-b): a booking
 * that has ALREADY STARTED, or is entirely in the past, can still be approved
 * (no `BOOKING_IN_PAST` here), because staff regularize bookings after the
 * fact.
 *
 * `APPROVED -> FLOWN|NO_SHOW` is the mirror image of that exception, and has
 * the opposite answer (ratifica R-16-b, ops F9): a booking whose slot has not
 * STARTED yet (`startsAt > now`, read under the row lock) cannot be closed —
 * 422 `BOOKING_NOT_STARTED`. The bound is the START, not the end, on purpose:
 * a slot in progress can already be closed (the early return is the normal
 * case), and waiting for the full hour would be a rule nobody asked for. Two
 * instants compared, so no time zone is involved. "Riapri" is never guarded:
 * reopening a wrong closure must stay possible.
 *
 * `PENDING -> DENIED` requires a `reason` (422 `BOOKING_DENY_REASON_REQUIRED`
 * otherwise, checked BEFORE the transaction even opens) and fires a
 * best-effort email to the booking-holder AFTER commit (AC 5,
 * `sendBookingDeniedEmail` below) — same "the write already committed and
 * stays valid" rule as `accounts.service.ts#sendNegativeBalanceAlert`.
 *
 * The actual write is ONE atomic `updateMany({ where: { id, status: <the
 * status just read under the row lock> }, ... })` — same guard-folded-into-
 * the-write discipline as `updateBooking`/`cancelBooking`, kept here even
 * though the `FOR UPDATE` lock already makes a genuine race within this
 * transaction impossible, so every mutation in this file states its own
 * precondition on the write itself.
 */
export async function transitionBooking(actor: Actor, bookingId: string, input: TransitionBookingInput): Promise<BookingListItem> {
  authorize(actor, 'bookings.manage.any');

  const to = input.to;
  if (to === 'DENIED' && !input.reason) {
    throw new ValidationError('A reason is required to deny a booking.', undefined, 'BOOKING_DENY_REASON_REQUIRED');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<LockedBookingRow[]>`
      SELECT "id", "status", "personId", "instructorProfileId", "aircraftId", "startsAt", "endsAt" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
    const existing = lockedRows[0];
    if (!existing) {
      throw new NotFoundError('Booking not found.');
    }
    if (!isLegalBookingTransition(existing.status, to)) {
      throw new ValidationError(`Cannot transition a booking from ${existing.status} to ${to}.`, undefined, 'BOOKING_TRANSITION_INVALID');
    }

    // Story 16.3 (ops F9, ratifica R-16-b): a booking is closed as flown or
    // no-show only once its slot has STARTED — this function's doc-comment.
    if ((to === 'FLOWN' || to === 'NO_SHOW') && existing.startsAt.getTime() > Date.now()) {
      throw new ValidationError('This booking has not started yet and cannot be closed.', undefined, 'BOOKING_NOT_STARTED');
    }

    if (to === 'APPROVED') {
      // Re-run createBooking's own checks (this function's doc-comment), in
      // createBooking's own order: WHO is booked first (story 16.3, ops F4).
      const person = await tx.person.findUniqueOrThrow({ where: { id: existing.personId }, select: BOOKABLE_PERSON_SELECT });
      assertPersonNotArchived(person);
      assertPersonHasActiveFlyingProfile(person);
      if (existing.instructorProfileId) {
        await assertActiveInstructorProfile(tx, existing.instructorProfileId);
      }

      const flightDateOnly = dateOnlyInZone(existing.startsAt, APP_TIMEZONE);
      const { blockingDocuments } = await findBlockingExpiredDocuments(existing.personId, flightDateOnly);
      if (blockingDocuments.length > 0) {
        throw new ValidationError(
          `Cannot approve this booking: the following documents are expired: ${blockingDocuments.map((document) => document.typeName).join(', ')}.`,
          { documents: blockingDocuments },
          'EXPIRED_DOCUMENTS',
        );
      }

      // Story 12.11, AC 4: same scheduling-window check `createBooking` runs
      // at creation — "would this booking still be creatable today", minus
      // the one ratified exception (R-16-b, this function's doc-comment): no
      // `BOOKING_IN_PAST` here.
      await assertWithinSchedulingWindow(existing.startsAt, existing.endsAt);

      const lockedAircraft = await tx.$queryRaw<Array<{ id: string; status: string; statusReason: string | null; outOfServiceUntil: Date | null; archivedAt: Date | null }>>`
        SELECT "id", "status", "statusReason", "outOfServiceUntil", "archivedAt" FROM "Aircraft" WHERE "id" = ${existing.aircraftId} FOR UPDATE`;
      const aircraft = lockedAircraft[0];
      if (!aircraft) {
        throw new NotFoundError('Aircraft not found.');
      }
      if (aircraft.archivedAt !== null) {
        throw new ConflictError('Aircraft is archived.');
      }
      if (aircraft.status === 'OUT_OF_SERVICE') {
        throw new ValidationError(
          `Aircraft is out of service: ${aircraft.statusReason}.`,
          outOfServiceDetails(aircraft),
          'AIRCRAFT_OUT_OF_SERVICE',
        );
      }

      await lockBookingPeople(tx, existing.personId, existing.instructorProfileId);
      const conflict = await findBookingConflict(tx, {
        aircraftId: existing.aircraftId,
        personId: existing.personId,
        instructorProfileId: existing.instructorProfileId,
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
        excludeBookingId: bookingId,
      });
      if (conflict) {
        throw bookingConflictError(conflict);
      }
    }

    const guard = await tx.booking.updateMany({
      where: { id: bookingId, status: existing.status },
      data: transitionUpdateData(to, actor.userId, input.reason, new Date()),
    });
    if (guard.count === 0) {
      throw new ConflictError('This booking has changed status; please retry.');
    }

    return tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: BOOKING_SELECT });
  });

  if (to === 'DENIED') {
    await sendBookingDeniedEmail(updated);
  }

  return toListItem(updated);
}

/**
 * Best-effort DENIED-outcome email (AC 5), fire-and-forget — called AFTER
 * `transitionBooking`'s transaction commits, same "a slow/broken SMTP
 * server must never hold a lock or fail an otherwise-valid write" rule as
 * `accounts.service.ts#sendNegativeBalanceAlert`. Recipient locale is the
 * booking-holder's OWN `User.locale` (AD-7), resolved the SAME way as that
 * function (`prisma.user.findUnique({ where: { personId } })`, fallback
 * `it` with no linked `User`); a person with no email on file is a SILENT
 * skip (AC 5), distinct from an actual send failure (`console.error`, still
 * no throw).
 */
async function sendBookingDeniedEmail(booking: SelectedBooking): Promise<void> {
  const person = await prisma.person.findUnique({ where: { id: booking.personId }, select: { email: true } });
  if (!person?.email) return;

  try {
    const user = await prisma.user.findUnique({ where: { personId: booking.personId }, select: { locale: true } });
    const locale: AppLocale = user?.locale === 'en' ? 'en' : 'it';
    const { subject, text } = await buildBookingDeniedEmail(locale, {
      firstName: booking.person.firstName,
      aircraftRegistration: booking.aircraft.registration,
      startsAt: booking.startsAt,
      // Just written by transitionBooking's own transaction — safe to assert.
      reason: booking.denyReason!,
    });
    await getMailSender().send({ to: person.email, subject, text });
  } catch (error) {
    console.error('transitionBooking: failed to send booking-denied email', error);
  }
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

export type BookableAircraftOption = { id: string; registration: string; model: string; status: AircraftStatus; statusReason: string | null };

/**
 * Non-archived aircraft, for the booking form's aircraft picker (AC 1/3) AND
 * (story 12.3) the Pianificazione timeline's row list — `model` is additive
 * (story 12.3, AC 2: the timeline row shows registration + model, ported
 * from the prototype's `.res-type`), every pre-12.3 caller already ignores
 * unknown fields. `self.read` (every role) — deliberately NOT `aircraft.manage`.
 * OUT_OF_SERVICE aircraft ARE included (the UI disables them with their
 * reason, Contesto; story 12.3 renders them as the timeline's AOG row); the
 * service re-verifies regardless on submit (AD-5: the UI only hides).
 */
export async function listBookableAircraft(actor: Actor): Promise<BookableAircraftOption[]> {
  authorize(actor, 'self.read');

  return prisma.aircraft.findMany({
    where: { archivedAt: null },
    select: { id: true, registration: true, model: true, status: true, statusReason: true },
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

/**
 * The subset of `aircraftIds` currently "Riservato" (story 12.5, AC 2) — an
 * APPROVED booking whose `[startsAt, endsAt)` covers `now`. Batched (a
 * single `findMany` over every id on the fleet page's current page, NOT one
 * query per card) — same N+1-avoidance rationale as
 * `rates.service.ts#getEffectiveRates`. Presentational only (no field on
 * `Aircraft` itself): gated on `aircraft.manage` — the SAME permission its
 * only caller (the fleet page) requires — so the helper's gate can never
 * diverge from the page that reaches it (`rbac.ts`).
 */
export async function listReservedAircraftIds(actor: Actor, aircraftIds: string[], now: Date): Promise<Set<string>> {
  authorize(actor, 'aircraft.manage');

  if (aircraftIds.length === 0) {
    return new Set();
  }

  const bookings = await prisma.booking.findMany({
    where: { aircraftId: { in: aircraftIds }, status: 'APPROVED', startsAt: { lte: now }, endsAt: { gt: now } },
    select: { aircraftId: true },
  });
  return new Set(bookings.map((booking) => booking.aircraftId));
}
