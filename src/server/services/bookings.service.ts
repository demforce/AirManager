import { Prisma, type AircraftPriceCategory, type AircraftStatus, type BookingStatus } from '@/generated/prisma/client';
import type { AppLocale } from '@/i18n/routing';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import type { CalendarBookingsQuery, CreateBookingInput, ListBookingsQuery, TransitionBookingInput, UpdateBookingInput } from '@/lib/schemas/bookings';
import type { SchedulingSettingsDto } from '@/lib/schemas/settings';
import { APP_TIMEZONE } from '@/lib/time';
import { dateOnlyInZone, todayDateOnlyInZone, zonedWallTime } from '@/lib/zoned-time';
import { getMailSender } from '@/server/adapters/mail';
import { buildBookingDeniedEmail } from '@/server/adapters/mail/templates';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { outOfServiceDetails } from './aircraft-status';
import { getSchedulingSettings } from './app-settings.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';
import { evaluateRequirements, throwRequirementsNotMet, type RequirementFailure } from './requirements.service';

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
 * → `force` 403 without `requirements.force` (story 19.10 — before any
 * further query) → target person 404/409/422 `PERSON_NOT_BOOKABLE` → the
 * indicated instructor 404/409, 422 `INSTRUCTOR_SAME_AS_PILOT` (story 19.10,
 * D-8) → `startsAt` in the past 422 `BOOKING_IN_PAST` → scheduling-window 422
 * `BOOKING_OUTSIDE_WINDOW` (story 12.11, AC 4) → the requirements EVALUATED
 * (story 19.10, below) → [transaction: aircraft lock + 404/409/422
 * `AIRCRAFT_OUT_OF_SERVICE` → person locks → overlap pre-check 409
 * (`CONFLICT` aircraft → `PERSON_BUSY` → `INSTRUCTOR_BUSY`, story 16.3) →
 * the requirements DECIDED: 422 `REQUIREMENTS_NOT_MET` or the deroga →
 * create]. Person/instructor RESOLUTION (404/409/422) runs OUTSIDE the
 * transaction: it keeps the error order above (a state 422 before a
 * conflict 409) and the 403-before-target-query rule, and it reads nothing
 * the overlap invariant depends on. What the invariant DOES depend on — that
 * no other booking of the same person/instructor gets approved in between —
 * is guarded by their row LOCKS, taken inside the transaction (story 16.3,
 * below). The aircraft is resolved and validated INSIDE the transaction, on
 * the SAME locked row the overlap pre-check reads — a single `SELECT ... FOR
 * UPDATE` serves both purposes with one fetch (no TOCTOU).
 *
 * **Concurrency (AC 2; three subjects since story 16.3, one human in two
 * roles since story 19.10)**: the overlap invariant has three subjects — the
 * aircraft, the person, the instructor (`findBookingConflict`, the ONE
 * implementation of the three predicates) — and each is serialized by a row
 * lock inside `prisma.$transaction`, the pattern of
 * `flights.service.ts#registerFlight` (`SELECT ... FOR UPDATE` on the
 * aircraft, `FOR NO KEY UPDATE` on the people — see `lockBookingPeople`). The
 * `Aircraft` lock is the FIRST statement of `createBooking`; `updateBooking`
 * and `transitionBooking` lock the `Booking` row they write before it. The
 * aircraft lock serializes the writers of the SAME aircraft. The `Person`
 * locks (`lockBookingPeople`: the booking's person and, when it has one, the
 * instructor's own person — R-19-o, one human is busy in EITHER role) serialize
 * the writers of the same people on DIFFERENT aircraft, which the aircraft
 * lock alone never did (ops F2): without them the person predicate would be a
 * check-then-write. The global lock order is the same on all three paths —
 * `Booking` (move and transition: the ONE row they write) → `Aircraft` (one
 * row, or N `ORDER BY id`) → `Person` (one or two rows, in ONE statement
 * `ORDER BY id`, so two writers locking the same two people in opposite roles
 * take them in the same order). Each transaction locks at most ONE booking (a
 * create inserts a row nobody else can hold yet) and the TWO people of that
 * booking (both immutable on a booking); the guarded `updateMany` that ends a
 * move or a transition locks the booking row it already holds;
 * `cancelBooking` takes a single lock (its `updateMany`'s row), which cannot
 * close a cycle. So two booking writers can never wait on each other in a
 * cycle; no other service locks `Booking` rows, and the two other `Person`
 * locks — `people.service.ts#upsertProfile` (story 19.3) and the person
 * composite `people.service.ts#updatePerson` (story 19.4), same `FOR NO KEY
 * UPDATE` — lock ONE row as the FIRST statement of their transaction and are
 * followed only by that SAME person's own rows (profiles, `Account`, expiries,
 * its `InstructorProfile` and rates, the `Person` update last), never an
 * `Aircraft`, a `Booking` or another person, so they cannot close a cycle
 * with these paths, and no table references `Booking` by foreign key, so its
 * `FOR UPDATE` blocks no FK check (census in the story 16.3 and 19.10 files).
 * The `InstructorProfile` lock of story 16.3 is gone (story 19.10, AD-5):
 * `InstructorProfile.personId` is unique, so the `Person` lock of its holder
 * serializes every writer the profile lock did. The implicit row lock of that
 * guarded `updateMany` is what the first census missed (review 16.3
 * MAJOR-2): `updateBooking` took it AFTER the aircraft, and deadlocked
 * against an approval of the same booking (40P01, a 500).
 * The pre-check immediately followed by the write, inside the same locked
 * transaction, is therefore airtight against two concurrent requests both
 * seeing "no overlap". No Postgres exclusion constraint (`btree_gist`) —
 * deliberate, re-evaluated with three subjects in story 16.3 (see `Booking`'s
 * Prisma doc-comment): it would need three partial constraints the load DB
 * already violates, would surface as one SQL error code to be told apart by
 * constraint NAME, and would not remove the aircraft lock, which also guards
 * the aircraft's STATE read. The person re-checks of an approval (archived,
 * profile) stay check-then-act, exactly like the requirements and the
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
 * **Requirements (story 19.10, CR §4.4, punto PO 15; was the story 7.4
 * expiry block)**: creating, moving and approving a booking judge the SAME
 * four requirements as registering a flight, with the ONE evaluation of
 * story 19.9 (`requirements.service.ts#evaluateRequirements`, policy in
 * `evaluateBookingRequirements` below): the blocking documents (expired or
 * missing, of the person and of the instructor), the membership fee of both,
 * the currency of a booking WITHOUT an instructor (a solo, R-19-l), and the
 * balance against the ESTIMATED cost (`estimateBookingCostCents`, A9). Any
 * failure is ONE 422 `REQUIREMENTS_NOT_MET` with every failure listed;
 * only an admin (`requirements.force`) derogates, resending the same request
 * with `force: true` — no motivo — and the write is stamped
 * `forcedAt`/`forcedByUserId`. Everyone else is blocked with the same list.
 * The deroga is decided LAST, inside the transaction, after every check it
 * cannot derogate (the past, the window, the aircraft, the overlaps — TD
 * 16.3-g): the warning only appears when the request would otherwise pass,
 * and «Procedi comunque» fails only to a race. Every move re-judges them on
 * the MERGED booking (D-3, the rule of the scheduling window). They are
 * EVALUATED before the transaction on all three paths, the approval included
 * (review 19.10 F2): every read inside a booking transaction goes through its
 * `tx`, so a request never asks the pool for a second connection while it
 * holds one.
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
  /** Set only when an admin derogated a failed requirement (story 19.10) — see `Booking.forcedAt`'s doc-comment. */
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
  firstName: string;
  lastName: string;
  archivedAt: Date | null;
  pilotProfile: { deactivatedAt: Date | null } | null;
  studentProfile: { deactivatedAt: Date | null } | null;
  /** `id` (story 19.10, R-19-o): the person predicate finds the bookings where this person is the instructor through it. */
  instructorProfile: { id: string; deactivatedAt: Date | null } | null;
  /** Story 19.10 (D-6): `null` for an instructor-only person, who never gets one — and whose balance is then never judged. */
  account: { id: string } | null;
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

/** The `select` the three write paths load the booking's person with (story 16.3, AD-4; story 19.10 adds the name and the account the requirements read): `createBooking` for every actor, `transitionBooking` on approval, `updateBooking` nested in its booking — one shape, three loads. */
const BOOKABLE_PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  archivedAt: true,
  pilotProfile: { select: { deactivatedAt: true } },
  studentProfile: { select: { deactivatedAt: true } },
  instructorProfile: { select: { id: true, deactivatedAt: true } },
  account: { select: { id: true } },
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

/** A booking's instructor as the write paths need it: the profile written on the row, the person who holds it (the lock and the R-19-o predicates, story 19.10) and the name a requirement of theirs is labelled with. */
type BookingInstructor = { profileId: string; personId: string; name: string };

/** The indicated instructor's 404/409 — staff `createBooking` and the approval re-check (story 16.3, ops F4) — returning the instructor `createBooking` writes. */
async function assertActiveInstructorProfile(client: Prisma.TransactionClient, instructorProfileId: string): Promise<BookingInstructor> {
  const instructorProfile = await client.instructorProfile.findUnique({
    where: { id: instructorProfileId },
    select: { id: true, deactivatedAt: true, personId: true, person: { select: { firstName: true, lastName: true } } },
  });
  if (!instructorProfile) {
    throw new NotFoundError('Instructor profile not found.');
  }
  if (instructorProfile.deactivatedAt !== null) {
    throw new ConflictError('This instructor profile is deactivated.');
  }
  return {
    profileId: instructorProfile.id,
    personId: instructorProfile.personId,
    name: `${instructorProfile.person.firstName} ${instructorProfile.person.lastName}`,
  };
}

/**
 * Story 19.10 (D-8): the instructor of a booking cannot be its own person —
 * the code and message of the flights (`flights.service.ts`), raised on the
 * staff create and on the approval re-check, never derogable. It is the
 * degenerate case of R-19-o: the person predicate excludes the booking being
 * written, so without this the most absurd case of all would pass.
 */
function assertInstructorIsNotThePerson(instructor: BookingInstructor | null, personId: string): void {
  if (instructor !== null && instructor.personId === personId) {
    throw new ValidationError('The instructor cannot be the same person as the pilot/student.', undefined, 'INSTRUCTOR_SAME_AS_PILOT');
  }
}

// --- The overlap invariant on its three subjects (story 16.3, ops F2) -------

/**
 * Row locks on the booking's PEOPLE (story 16.3, AD-2; story 19.10, AD-5) —
 * its person and, when it has one, the person who holds its instructor
 * profile — taken by the three write paths inside their transaction, AFTER
 * their `Aircraft` lock(s) and BEFORE {@link findBookingConflict}. The
 * `Aircraft` lock serializes only the writers of the SAME aircraft: two
 * approvals of the same person on two DIFFERENT aircraft would serialize on
 * nothing, and the person predicate alone would be a check-then-write (ops
 * F2, "serve un secondo lock"). Since R-19-o one human is busy in EITHER
 * role, so both people are `Person` rows: ONE statement, `ORDER BY "id"`
 * (Postgres locks in the order the sort emits them — the idiom of the
 * `Aircraft` multi-lock of `updateBooking`), so two writers holding the same
 * two people in opposite roles take them in the same order and never cross.
 * The `InstructorProfile` lock of story 16.3 is gone: `personId` is unique on
 * it, so whoever writes a booking of that instructor locks its holder's
 * `Person` row here — a second table to keep in the census, and nothing more.
 * The rows exist by construction (FKs on `Booking`), so there is no 404 to
 * raise: the lock's result is never read, the effect IS the lock — same idiom
 * as the `Account` lock of `accounts.service.ts#recordAdjustment`.
 *
 * Returns the booking person's OWN instructor profile id (the "instructor
 * elsewhere" half of its R-19-o predicate, {@link findBookingConflict}), read
 * HERE, after the lock (review 19.10 F4): a writer that makes that person the
 * instructor of another booking locks the same `Person` row, so once the lock
 * is held every such booking either committed — and so did the profile it
 * names, which this read (a fresh statement) sees — or waits for this
 * transaction. Read before the lock, a profile created in between was missed.
 *
 * `FOR NO KEY UPDATE`, not `FOR UPDATE` (decision of the main session,
 * 2026-09-27): it conflicts with itself, so two booking writers on the same
 * person still serialize, but NOT with the `FOR KEY SHARE` every foreign-key
 * check takes on its parent row. So an insert elsewhere that references the
 * same person (a flight, an expiry, an account movement) is never blocked by
 * a booking transaction.
 */
async function lockBookingPeople(tx: Prisma.TransactionClient, personId: string, instructorPersonId: string | null): Promise<string | null> {
  const personIds = instructorPersonId !== null && instructorPersonId !== personId ? [personId, instructorPersonId] : [personId];
  await tx.$queryRaw`SELECT "id" FROM "Person" WHERE "id" IN (${Prisma.join(personIds)}) ORDER BY "id" FOR NO KEY UPDATE`;
  const ownInstructorProfile = await tx.instructorProfile.findUnique({ where: { personId }, select: { id: true } });
  return ownInstructorProfile?.id ?? null;
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
 * any subject, the conflict surfacing at approval).
 *
 * Three `findFirst`s in sequence, not one `OR`: the precedence
 * AIRCRAFT -> PERSON -> INSTRUCTOR is code, not a classification of whichever
 * row an `OR` returned. The aircraft goes FIRST because it is the answer the
 * three paths gave before story 16.3 and the one the UI and the e2e read (a
 * request that is ALSO person-busy keeps answering "aircraft already booked"),
 * and its `where`/`select` are the pre-16.3 ones verbatim. The instructor
 * predicate does not run for a booking without one.
 *
 * Story 19.10 (R-19-o): a human is busy in EITHER role. The person predicate
 * matches a booking where the person is the PERSON or is its instructor —
 * through the person's OWN instructor profile id (`personInstructorProfileId`,
 * any profile it holds, deactivated included: its past bookings still name
 * it), never a join on `InstructorProfile.personId`: the two are the same set
 * (`personId` is unique on the profile), but the join made the `OR` a
 * sequential scan of every booking (measured 22 ms on the 40 000-booking load
 * DB, against 0.3 ms for two bitmap index scans — story 19.10 record, §E).
 * The instructor predicate matches one where the instructor's PROFILE is
 * indicated or its holder is the person. The code still names the subject OF
 * THE REQUEST that is busy (`PERSON_BUSY` / `INSTRUCTOR_BUSY`), whatever role
 * it has in the other booking, and `details` still names a booking that
 * involves that very human — nothing new about a third party. Each predicate
 * is an `OR` of the two existing index scans (`Booking_personId_idx`,
 * `Booking_instructorProfileId_idx`) — no new index.
 */
async function findBookingConflict(
  tx: Prisma.TransactionClient,
  args: {
    aircraftId: string;
    personId: string;
    /** The booking person's own instructor profile, when it holds one (the "instructor elsewhere" half of R-19-o) — as `lockBookingPeople` read it, under the lock. */
    personInstructorProfileId: string | null;
    instructor: { profileId: string; personId: string } | null;
    startsAt: Date;
    endsAt: Date;
    excludeBookingId?: string;
  },
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
    where: {
      OR: [{ personId: args.personId }, ...(args.personInstructorProfileId === null ? [] : [{ instructorProfileId: args.personInstructorProfileId }])],
      ...excludeSelf,
      ...overlapping,
    },
    orderBy: { startsAt: 'asc' },
    select: { id: true, startsAt: true, endsAt: true },
  });
  if (personConflict) {
    return { subject: 'PERSON', booking: personConflict };
  }

  if (args.instructor === null) {
    return null;
  }
  const instructorConflict = await tx.booking.findFirst({
    where: { OR: [{ instructorProfileId: args.instructor.profileId }, { personId: args.instructor.personId }], ...excludeSelf, ...overlapping },
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
 * conflicting booking, which by construction of their predicate involves the
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

// --- The requirements of a booking (story 19.10, CR §4.4) -------------------

/** One non-blocking expired document surfaced by a successful `createBooking` (story 7.4, AC 1) — see {@link findExpiryWarnings}. */
export type BookingExpiryWarning = { typeName: string; expiresAt: string };

/** `createBooking`'s return shape (story 7.4, AC 1/2) — REPLACES the bare `BookingListItem` this function returned before that story. */
export type CreateBookingResult = { booking: BookingListItem; warnings: BookingExpiryWarning[] };

/**
 * The `warnings` of a successful `createBooking` (story 7.4, AC 1; D-10 of
 * story 19.10): the person's NON-blocking ratings of an ACTIVE type, expired
 * before `flightDateOnly` (`YYYY-MM-DD`, Rome — the expiry day itself is
 * still valid). Information only, never a failure: what blocks is
 * `evaluateRequirements`'s. Visits (story 19.7a) and the membership fee (a
 * `MEMBERSHIP` requirement since story 19.10) never appear here, and a
 * deactivated type no more than it blocks (story 16.4, R-16-c).
 */
async function findExpiryWarnings(personId: string, flightDateOnly: string): Promise<BookingExpiryWarning[]> {
  const expiries = await prisma.expiry.findMany({
    where: { personId, expiryType: { kind: 'RATING', blocksBooking: false, isActive: true } },
    select: { expiresAt: true, expiryType: { select: { name: true } } },
  });
  return expiries
    .filter((expiry) => toDateOnlyString(expiry.expiresAt) < flightDateOnly)
    .map((expiry) => ({ typeName: expiry.expiryType.name, expiresAt: toDateOnlyString(expiry.expiresAt) }));
}

/**
 * The aircraft price column a booking is estimated with (story 19.10, D-5):
 * the one the flight registration will charge (`flights.service.ts`, story
 * 19.3, R-19-e) — `STUDENT` for a student-only person, `PILOT` otherwise,
 * including an instructor-only person ("un istruttore ha la licenza",
 * Q-19.3-c) and a legacy person with both profiles active (a pilot, as on the
 * flights).
 */
function bookingPriceCategory(person: TargetPerson): AircraftPriceCategory {
  return isActiveStudent(person) && !isActivePilot(person) ? 'STUDENT' : 'PILOT';
}

/**
 * The ESTIMATED cost of a booking (story 19.10, A9, R-19-g): the aircraft
 * price of `priceCategory` × the slot's duration, plus the instructor's
 * hourly rate × the same duration when there is one — each part
 * `Math.round(perHour × minutes / 60)`, the formula of the flight charge. The
 * rates are those in effect on the flight day (`validFrom` the greatest ≤ the
 * Rome day of `startsAt`, the rate the flight will freeze), read WITHOUT an
 * actor: `rates.service.ts#getEffectiveRate` is gated `aircraft.manage` and
 * a pilot booking for themself would get a 403. Typed queries on the
 * `@db.Date` column, never raw SQL (review 3.5 F1). A part with no rate in
 * effect costs 0 — no new 422 on a booking: the registration of the flight
 * refuses it with `NO_AIRCRAFT_RATE`/`NO_INSTRUCTOR_RATE` anyway.
 */
async function estimateBookingCostCents(
  client: Prisma.TransactionClient,
  booking: { aircraftId: string; instructorProfileId: string | null; startsAt: Date; endsAt: Date; priceCategory: AircraftPriceCategory },
): Promise<number> {
  const validFrom = { lte: parseDateOnlyUtc(dateOnlyInZone(booking.startsAt, APP_TIMEZONE)) };
  const aircraftRate = await client.aircraftRate.findFirst({
    where: { aircraftId: booking.aircraftId, validFrom },
    orderBy: [{ validFrom: 'desc' }],
    select: { studentPriceCents: true, pilotPriceCents: true },
  });
  const instructorRate =
    booking.instructorProfileId === null
      ? null
      : await client.instructorRate.findFirst({
          where: { instructorProfileId: booking.instructorProfileId, validFrom },
          orderBy: [{ validFrom: 'desc' }],
          select: { priceCentsPerHour: true },
        });
  const minutes = Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60_000);
  const aircraftPerHour = aircraftRate === null ? 0 : booking.priceCategory === 'PILOT' ? aircraftRate.pilotPriceCents : aircraftRate.studentPriceCents;
  return Math.round((aircraftPerHour * minutes) / 60) + Math.round(((instructorRate?.priceCentsPerHour ?? 0) * minutes) / 60);
}

/**
 * The POLICY of a booking's requirements (story 19.10, AD-1 — the evaluation
 * itself is story 19.9's `evaluateRequirements`), the same on create, move
 * (on the merged booking) and approval:
 * - documents and membership fee: always, for the person and for the
 *   instructor when there is one (R-19-j/k, Q-19.9-a); the person's MISSING
 *   scan covers the scopes of all its active profiles;
 * - currency: only on a booking WITHOUT an instructor — a solo by definition
 *   (R-19-l: a self-booking never has one) — and only for a currency subject,
 *   an active pilot or student (19.7a D-8);
 * - balance: the current balance against {@link estimateBookingCostCents},
 *   this booking alone (D-2); not judged for a person with no `Account`, an
 *   instructor-only person (D-6).
 * Two reference days (Q-19.10-a = B, PO): the documents and the rates on the
 * Rome day of `startsAt`, the currency and the fee on TODAY in Rome — also on
 * the approval of a booking already in the past (R-16-b, D-7).
 *
 * Read-only, through `prisma`, and NEVER inside a transaction (review 19.10
 * F2: the approval used to run it inside its own, so every approval held a
 * connection while asking the pool for another — ten at once, the pool's
 * size, waited on each other until the 5 s transaction timeout, and every
 * request of the app answered 500 meanwhile). The caller DECIDES on the
 * result later ({@link decideRequirements}). Not judged again under a lock
 * either (unlike a flight's balance, review 19.9 F2): a booking writes no
 * movement, so two bookings racing on the same balance spend nothing — each
 * is judged on its own cost, as D-2 wants; only a concurrent top-up or charge
 * can move the balance, the check-then-act of every other requirement (TD
 * 16.3-d).
 */
async function evaluateBookingRequirements(booking: {
  person: TargetPerson;
  instructor: BookingInstructor | null;
  aircraftId: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<RequirementFailure[]> {
  const { person, instructor } = booking;
  const hasActivePilot = isActivePilot(person);
  const hasActiveStudent = isActiveStudent(person);
  const today = todayDateOnlyInZone(APP_TIMEZONE);
  const costCents =
    person.account === null
      ? null
      : await estimateBookingCostCents(prisma, {
          aircraftId: booking.aircraftId,
          instructorProfileId: instructor?.profileId ?? null,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          priceCategory: bookingPriceCategory(person),
        });

  return evaluateRequirements({
    expiryDateOnly: dateOnlyInZone(booking.startsAt, APP_TIMEZONE),
    membershipDateOnly: today,
    person: { id: person.id, name: `${person.firstName} ${person.lastName}`, hasActivePilot, hasActiveStudent, hasActiveInstructor: isActiveInstructor(person) },
    instructor: instructor === null ? null : { personId: instructor.personId, name: instructor.name },
    documents: true,
    currency: instructor === null && (hasActivePilot || hasActiveStudent) ? { dateOnly: today, excludeFlightId: null } : null,
    balance: costCents === null ? null : { costCents, creditCents: 0 },
  });
}

/**
 * The LAST gate before the write (story 19.10, AD-3; closes TD 16.3-g): the
 * failures evaluated before the transaction, decided after every check
 * `force` does not derogate (the aircraft state and the three overlaps, under
 * their locks). Failures without `force` => the one 422
 * `REQUIREMENTS_NOT_MET`; with `force` (the 403 at the top of each path
 * already guarantees `requirements.force`) => the stamp to write. Nothing to
 * derogate => no stamp, even with `force: true` ("scavalcato un requisito, non
 * spuntata una checkbox", D-9).
 */
function decideRequirements(actor: Actor, failures: RequirementFailure[], force: boolean | undefined): { forcedAt: Date; forcedByUserId: string } | null {
  if (failures.length === 0) return null;
  if (!force) throwRequirementsNotMet(failures);
  return { forcedAt: new Date(), forcedByUserId: actor.userId };
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
 *
 * The settings are read by the caller (`getSchedulingSettings`) and passed
 * in: the approval reads them BEFORE its transaction and checks them inside
 * it (review 19.10 F2 — no `prisma` read while a transaction is held).
 */
function assertWithinSchedulingWindow(settings: SchedulingSettingsDto, startsAt: Date, endsAt: Date): void {
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
 * **Requirements (story 19.10)**: once the person, the instructor, the past
 * and the window have passed, the booking's requirements are EVALUATED
 * (`evaluateBookingRequirements`: the person WHO FLIES — the allievo on a
 * school booking, never the instructor/staff actor — and the instructor),
 * outside the transaction; they are DECIDED last, inside it, after the
 * aircraft and the overlaps (`decideRequirements`). `force: true` from an
 * actor without `requirements.force` is a 403 right after the own-rules block
 * — BEFORE the target-person query, let alone any requirement (an own-path
 * booking never derogates, R-19-h: pilot and instructor are blocked with the
 * same list). The non-blocking expired ratings are `warnings` of the 201
 * (`findExpiryWarnings`, D-10).
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
  // `instructor` is the FINAL instructor written on the booking for a
  // non-staff actor — already known here for the cross-person branch (the
  // actor's own profile); the self-booking branch defers its eligibility
  // check to the single shared `person` lookup below (querying "self" carries
  // no leak risk, so there is no need for a second query).
  let instructor: BookingInstructor | null = null;

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
        select: { firstName: true, lastName: true, instructorProfile: { select: { id: true, deactivatedAt: true } } },
      });
      const actorInstructorProfile = actorPerson?.instructorProfile ?? null;
      if (!actorPerson || !actorInstructorProfile || actorInstructorProfile.deactivatedAt !== null) {
        throw new ForbiddenError('Only an active instructor may book an aircraft on behalf of another person.');
      }
      if (input.instructorProfileId !== actorInstructorProfile.id) {
        throw new ForbiddenError('An instructor may only indicate their own instructorProfileId when booking for someone else.');
      }
      instructor = { profileId: actorInstructorProfile.id, personId: actor.personId, name: `${actorPerson.firstName} ${actorPerson.lastName}` };
    }
  }

  // Story 19.10 (P3, R-19-h): `force` without `requirements.force` is
  // rejected BEFORE any further query (persona, let alone requirements) —
  // only an admin derogates, an own-path booking never does.
  if (input.force && !hasPermission(actor, 'requirements.force')) {
    throw new ForbiddenError('Only an admin can derogate the requirements of a booking.');
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
      instructor = await assertActiveInstructorProfile(prisma, input.instructorProfileId);
      assertInstructorIsNotThePerson(instructor, input.personId);
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

  // Story 12.11, AC 4 (ratifica utente 3): outside the transaction — the
  // scheduling window participates in neither the overlap invariant nor the
  // aircraft lock.
  assertWithinSchedulingWindow(await getSchedulingSettings(), startsAt, endsAt);

  // Story 19.10 (AD-3): evaluated here, outside the transaction (no lock held
  // during their queries), DECIDED inside it, last.
  const failures = await evaluateBookingRequirements({ person, instructor, aircraftId: input.aircraftId, startsAt, endsAt });
  const warnings = await findExpiryWarnings(input.personId, dateOnlyInZone(startsAt, APP_TIMEZONE));

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
    // (story 16.3; R-19-o since story 19.10): semi-open `[startsAt, endsAt)` —
    // two bookings that merely touch at the boundary do NOT overlap — and only
    // an APPROVED booking occupies a slot (story 12.2), see `findBookingConflict`.
    const personInstructorProfileId = await lockBookingPeople(tx, input.personId, instructor?.personId ?? null);
    const conflict = await findBookingConflict(tx, {
      aircraftId: input.aircraftId,
      personId: input.personId,
      personInstructorProfileId,
      instructor,
      startsAt,
      endsAt,
    });
    if (conflict) {
      throw bookingConflictError(conflict);
    }

    const forceStamp = decideRequirements(actor, failures, input.force);

    return tx.booking.create({
      data: {
        aircraftId: input.aircraftId,
        personId: input.personId,
        instructorProfileId: instructor?.profileId ?? null,
        startsAt,
        endsAt,
        notes: input.notes ?? null,
        actorUserId: actor.userId,
        // Story 12.2, AC 2: the service ALWAYS stamps status explicitly,
        // never the column default — ADMIN-only (`bookings.manage.any`)
        // bookings start APPROVED, everyone else's start PENDING.
        status: canManageAny ? 'APPROVED' : 'PENDING',
        // Story 19.10 (D-9): stamped ONLY when a failed requirement was
        // derogated — otherwise both fields stay `null`.
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

/** `updateBooking`'s read (story 19.10): the editable fields plus who the requirements and the R-19-o locks are about — the booking's person (`BOOKABLE_PERSON_SELECT`) and its instructor's holder. `cancelBooking` reads none of it. */
const MOVABLE_BOOKING_SELECT = {
  ...EDITABLE_BOOKING_SELECT,
  person: { select: BOOKABLE_PERSON_SELECT },
  instructorProfile: { select: { personId: true, person: { select: { firstName: true, lastName: true } } } },
} as const;

type MovableBooking = Prisma.BookingGetPayload<{ select: typeof MOVABLE_BOOKING_SELECT }>;

/** The instructor of a booking read with {@link MOVABLE_BOOKING_SELECT}, as the requirements of a move — and of an approval (review 19.10 F2) — are evaluated on it. */
function movableBookingInstructor(booking: MovableBooking): BookingInstructor | null {
  return booking.instructorProfileId === null || booking.instructorProfile === null
    ? null
    : {
        profileId: booking.instructorProfileId,
        personId: booking.instructorProfile.personId,
        name: `${booking.instructorProfile.person.firstName} ${booking.instructorProfile.person.lastName}`,
      };
}

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
 * **Re-judges the requirements on EVERY edit (story 19.10, D-3)**: the
 * merged booking — its aircraft, interval and day — goes through the same
 * `evaluateBookingRequirements` as a create (the person and the instructor
 * are the booking's own, immutable), unconditionally like the window above:
 * with the balance and the currency in the picture the day alone no longer
 * says whether anything changed (the duration and the aircraft change the
 * cost). Decided last, inside the transaction (`decideRequirements`); `force`
 * (`requirements.force`, 403 otherwise, checked BEFORE the booking is even
 * read) derogates and stamps — an own-path move is blocked with the list.
 *
 * **Concurrency (same discipline as `createBooking`, AC 2)**: inside
 * `prisma.$transaction`, THIS booking's row is locked `FOR UPDATE` first
 * (review 16.3 MAJOR-2: the same first statement as `transitionBooking`, so a
 * move and an approval of the same booking serialize on it instead of
 * deadlocking — module doc-comment); then ALL involved `Aircraft` rows — the
 * destination and,
 * if different, the CURRENT one — are locked in ONE
 * `WHERE id IN (...) ORDER BY id FOR UPDATE` query (the exact multi-lock
 * pattern of `flights.service.ts#updateFlight`, anti-deadlock against two
 * concurrent moves crossing aircraft; a same-aircraft edit collapses to the
 * 1-element set `createBooking` already uses). Only the DESTINATION
 * aircraft's state is validated (404/409 archived/422
 * `AIRCRAFT_OUT_OF_SERVICE`, even for staff) — the booking is LEAVING the
 * current aircraft, not landing on it, so that aircraft's own state is
 * irrelevant to this write. The overlap pre-check excludes this booking
 * itself (`id: { not: bookingId }`) and counts only APPROVED rows (story
 * 12.2, `findBookingConflict`).
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
  // Story 19.10 (P3): before ANY query — not even the booking is read for an
  // actor who asks to derogate without the permission.
  if (input.force && !hasPermission(actor, 'requirements.force')) {
    throw new ForbiddenError('Only an admin can derogate the requirements of a booking.');
  }

  const existing = await prisma.booking.findUnique({ where: { id: bookingId }, select: MOVABLE_BOOKING_SELECT });
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

  // Story 15.4 review (PO decision, 2026-08-03): the scheduling window is
  // re-checked HERE too — see this function's own doc-comment. Same position
  // in the sequence as `createBooking`'s (outside the transaction), so the
  // two paths report the same code first on the same input, and on the
  // MERGED interval like every other rule above.
  assertWithinSchedulingWindow(await getSchedulingSettings(), nextStartsAt, nextEndsAt);

  // Story 19.10 (D-3): on the MERGED booking, evaluated before the locks and
  // decided after them, like `createBooking`.
  const instructor = movableBookingInstructor(existing);
  const failures = await evaluateBookingRequirements({
    person: existing.person,
    instructor,
    aircraftId: nextAircraftId,
    startsAt: nextStartsAt,
    endsAt: nextEndsAt,
  });

  const updated = await prisma.$transaction(async (tx) => {
    // Row lock on THIS booking FIRST (review 16.3 MAJOR-2) — the same first
    // statement as `transitionBooking`. The guarded `updateMany` below locks
    // this row anyway; taken there, AFTER the aircraft, it formed a cycle with
    // an approval of the same booking (`Booking` -> `Aircraft` there,
    // `Aircraft` -> `Booking` here): 40P01, a 500 to one of the two. The
    // result is never read, the effect IS the lock.
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;

    // ALL Aircraft ids next, ONE query, ORDER BY id FOR UPDATE — same
    // multi-lock pattern as `flights.service.ts#updateFlight` (module
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
    const personInstructorProfileId = await lockBookingPeople(tx, existing.personId, instructor?.personId ?? null);
    const conflict = await findBookingConflict(tx, {
      aircraftId: nextAircraftId,
      personId: existing.personId,
      personInstructorProfileId,
      instructor,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      excludeBookingId: bookingId,
    });
    if (conflict) {
      throw bookingConflictError(conflict);
    }

    const forceStamp = decideRequirements(actor, failures, input.force);

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
        // Story 19.10 (D-9): only a real deroga writes the stamp, and nothing
        // ever clears it — an edit without one keeps the previous stamp.
        ...(forceStamp ?? {}),
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

/** What an approval reads before its transaction (review 19.10 F2); `null` = no such booking (the transaction answers the 404, in its own order). */
async function readApprovalChecks(
  bookingId: string,
): Promise<{ booking: MovableBooking; failures: RequirementFailure[]; scheduling: SchedulingSettingsDto } | null> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: MOVABLE_BOOKING_SELECT });
  if (!booking) return null;
  const failures = await evaluateBookingRequirements({
    person: booking.person,
    instructor: movableBookingInstructor(booking),
    aircraftId: booking.aircraftId,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
  });
  return { booking, failures, scheduling: await getSchedulingSettings() };
}

/** Whether the row locked by an approval is still the slot its requirements were read on. */
function isSameSlot(read: MovableBooking, locked: LockedBookingRow): boolean {
  return (
    read.personId === locked.personId &&
    read.instructorProfileId === locked.instructorProfileId &&
    read.aircraftId === locked.aircraftId &&
    read.startsAt.getTime() === locked.startsAt.getTime() &&
    read.endsAt.getTime() === locked.endsAt.getTime()
  );
}

/**
 * Moves a booking through the approval workflow (AC 3) — `bookings.manage.any`
 * only, for EVERY transition (including "riapri": staff-only, never an
 * own-path action — see the module doc-comment). Locks the `Booking` row
 * `FOR UPDATE` as the FIRST statement in the transaction, so a race with
 * another transition on the SAME booking serializes rather than
 * double-applying.
 *
 * `PENDING -> APPROVED` re-runs `createBooking`'s own checks against the
 * CURRENT booking, in `createBooking`'s own order and with its own codes —
 * the booking's person (409 archived, 422 `PERSON_NOT_BOOKABLE` without an
 * active flying profile) and instructor (409 deactivated, 422
 * `INSTRUCTOR_SAME_AS_PILOT`), story 16.3 / ops F4 and story 19.10 (D-8); the
 * scheduling-window check (story 12.11, AC 4, `assertWithinSchedulingWindow`);
 * the `Aircraft` row locked
 * `FOR UPDATE` and validated (archived/out-of-service); the `Person` locks;
 * the overlap pre-check on the aircraft, the person and the instructor
 * against every OTHER `APPROVED` booking (`findBookingConflict`); and the
 * requirements DECIDED last — 422 `REQUIREMENTS_NOT_MET`, or with `force`
 * (`requirements.force`, 403 otherwise, before the transaction opens) the
 * deroga and its stamp. An approval is, in effect, "would this booking still
 * be creatable today" — with ONE exception, ratified (R-16-b): a booking that
 * has ALREADY STARTED, or is entirely in the past, can still be approved (no
 * `BOOKING_IN_PAST` here), because staff regularize bookings after the fact;
 * its currency and fee are judged on today, like every booking's (D-7).
 *
 * The requirements and the window's settings are READ before the transaction
 * ({@link readApprovalChecks}, review 19.10 F2), like `createBooking` and
 * `updateBooking` read theirs: inside it every read goes through `tx`, so an
 * approval never holds a connection while asking the pool for another. They
 * were judged on the booking as read then; under the row lock that slot —
 * person, instructor, aircraft, interval — must still be the booking's, or
 * the approval answers 409 (a move landed in between: resend it), never a
 * decision on a stale read.
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
  // Story 19.10 (P3): the same distinct gate as create and move. Both are
  // ADMIN-only today, so this is unreachable — kept for a future role holding
  // `bookings.manage.any` without `requirements.force`.
  if (input.force && !hasPermission(actor, 'requirements.force')) {
    throw new ForbiddenError('Only an admin can derogate the requirements of a booking.');
  }

  const to = input.to;
  if (to === 'DENIED' && !input.reason) {
    throw new ValidationError('A reason is required to deny a booking.', undefined, 'BOOKING_DENY_REASON_REQUIRED');
  }

  // Review 19.10 F2: read before the transaction (this function's doc-comment).
  const approvalChecks = to === 'APPROVED' ? await readApprovalChecks(bookingId) : null;

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

    let forceStamp: { forcedAt: Date; forcedByUserId: string } | null = null;
    if (to === 'APPROVED') {
      if (approvalChecks === null || !isSameSlot(approvalChecks.booking, existing)) {
        throw new ConflictError('This booking has changed; please retry.');
      }

      // Re-run createBooking's own checks (this function's doc-comment), in
      // createBooking's own order: WHO is booked first (story 16.3, ops F4).
      const person = await tx.person.findUniqueOrThrow({ where: { id: existing.personId }, select: BOOKABLE_PERSON_SELECT });
      assertPersonNotArchived(person);
      assertPersonHasActiveFlyingProfile(person);
      const instructor = existing.instructorProfileId ? await assertActiveInstructorProfile(tx, existing.instructorProfileId) : null;
      assertInstructorIsNotThePerson(instructor, existing.personId);

      // Story 12.11, AC 4: same scheduling-window check `createBooking` runs
      // at creation — "would this booking still be creatable today", minus
      // the one ratified exception (R-16-b, this function's doc-comment): no
      // `BOOKING_IN_PAST` here.
      assertWithinSchedulingWindow(approvalChecks.scheduling, existing.startsAt, existing.endsAt);

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

      const personInstructorProfileId = await lockBookingPeople(tx, existing.personId, instructor?.personId ?? null);
      const conflict = await findBookingConflict(tx, {
        aircraftId: existing.aircraftId,
        personId: existing.personId,
        personInstructorProfileId,
        instructor,
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
        excludeBookingId: bookingId,
      });
      if (conflict) {
        throw bookingConflictError(conflict);
      }

      forceStamp = decideRequirements(actor, approvalChecks.failures, input.force);
    }

    const guard = await tx.booking.updateMany({
      where: { id: bookingId, status: existing.status },
      // Story 19.10 (D-9): an approval that derogated stamps; nothing clears a stamp ("riapri" included).
      data: { ...transitionUpdateData(to, actor.userId, input.reason, new Date()), ...(forceStamp ?? {}) },
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
