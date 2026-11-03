import type { Prisma } from '@/generated/prisma/client';
import type { ExpiryScope, Role } from '@/generated/prisma/enums';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import { parseDateOnlyUtc } from '@/lib/date-only';
import type { CreatePersonInput, ListPeopleQuery, UpdatePersonCompositeInput } from '@/lib/schemas/people';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { sendInviteEmail } from './auth-tokens.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';
import { assertScopeCompatible, updateExpiryDateCore } from './expiries.service';
import { upsertInstructorRateCore } from './instructor-rates.service';
import { assertRateValidFromNotPast } from './rates.service';
import { createUserCore, emailLocale } from './users.service';

/** Story 2.2, AC 1: which profiles (pilot/student/instructor) are currently active. */
export type ProfileFlags = {
  pilot: boolean;
  student: boolean;
  instructor: boolean;
};

export type PersonListItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  profiles: ProfileFlags;
};

/**
 * `GET /api/v1/people/{id}` shape (story 2.2, AC 1): the list item plus the
 * three profiles in full. `null` means the profile was never activated for
 * this person; an object (possibly with `deactivatedAt` set) means it was.
 */
export type PersonDetail = PersonListItem & {
  pilotProfile: PilotProfileDto | null;
  studentProfile: StudentProfileDto | null;
  instructorProfile: InstructorProfileDto | null;
};

/** AD-8 paginated shape, via the shared helper (story 1.5). */
export type PersonListResult = PaginatedResult<PersonListItem>;

/** Story 2.2: a `Person` may activate any of these 1-to-0/1 profiles (AD-11). */
export type ProfileType = 'pilot' | 'student' | 'instructor';

export type PilotProfileInput = { licenseNumber: string; licenseType: string };
/** `courseStartDate` arrives as the wire's `YYYY-MM-DD` string (AD-8). */
export type StudentProfileInput = { courseStartDate: string };
/** Empty (story 13.1, R-13.1-b): the free-text `ratings` field is gone — activating/reactivating is all this does now. */
export type InstructorProfileInput = Record<string, never>;

export type PilotProfileDto = { licenseNumber: string; licenseType: string; deactivatedAt: Date | null };
/** `courseStartDate` stays a `YYYY-MM-DD` string on the way out — never a full datetime (Dev Notes). */
export type StudentProfileDto = { courseStartDate: string; deactivatedAt: Date | null };
/** `ratings` removed (story 13.1, R-13.1-b) — abilitazioni now live as `Expiry` rows on `INSTRUCTORS`-scoped types. */
export type InstructorProfileDto = { deactivatedAt: Date | null };

const PROFILE_FLAG_SELECT = {
  pilotProfile: { select: { deactivatedAt: true } },
  studentProfile: { select: { deactivatedAt: true } },
  instructorProfile: { select: { deactivatedAt: true } },
} as const;

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  address: true,
  archivedAt: true,
  createdAt: true,
  ...PROFILE_FLAG_SELECT,
} as const;

/** `getPerson` needs the full profile data, not just the active flags. */
const PERSON_DETAIL_SELECT = {
  ...PERSON_SELECT,
  pilotProfile: { select: { licenseNumber: true, licenseType: true, deactivatedAt: true } },
  studentProfile: { select: { courseStartDate: true, deactivatedAt: true } },
  instructorProfile: { select: { deactivatedAt: true } },
} as const;

type SelectedPerson = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  pilotProfile: { deactivatedAt: Date | null } | null;
  studentProfile: { deactivatedAt: Date | null } | null;
  instructorProfile: { deactivatedAt: Date | null } | null;
};

type SelectedPersonDetail = SelectedPerson & {
  pilotProfile: { licenseNumber: string; licenseType: string; deactivatedAt: Date | null } | null;
  studentProfile: { courseStartDate: Date; deactivatedAt: Date | null } | null;
  instructorProfile: { deactivatedAt: Date | null } | null;
};

/** `@db.Date` round-trips as a UTC-midnight `Date` — format with UTC parts so no server timezone can shift the calendar day. */
function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toListItem(person: SelectedPerson): PersonListItem {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    phone: person.phone,
    address: person.address,
    archivedAt: person.archivedAt,
    createdAt: person.createdAt,
    profiles: {
      pilot: person.pilotProfile !== null && person.pilotProfile.deactivatedAt === null,
      student: person.studentProfile !== null && person.studentProfile.deactivatedAt === null,
      instructor: person.instructorProfile !== null && person.instructorProfile.deactivatedAt === null,
    },
  };
}

function toPersonDetail(person: SelectedPersonDetail): PersonDetail {
  return {
    ...toListItem(person),
    pilotProfile: person.pilotProfile
      ? { licenseNumber: person.pilotProfile.licenseNumber, licenseType: person.pilotProfile.licenseType, deactivatedAt: person.pilotProfile.deactivatedAt }
      : null,
    studentProfile: person.studentProfile
      ? { courseStartDate: toDateOnlyString(person.studentProfile.courseStartDate), deactivatedAt: person.studentProfile.deactivatedAt }
      : null,
    instructorProfile: person.instructorProfile ? { deactivatedAt: person.instructorProfile.deactivatedAt } : null,
  };
}

/** Prisma unique-constraint violation (concurrent duplicate email). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

/**
 * Pre-check for the check-then-write race the `try`/`catch` around
 * `create`/`update` backstops (same pattern as `users.service.ts`'s
 * `assertPersonAvailable`). A falsy `email` (undefined or the `null` that
 * clears the field) is never a conflict — Postgres treats multiple `NULL`s in
 * a unique column as distinct.
 */
async function assertUnique(email: string | null | undefined, excludeId?: string): Promise<void> {
  if (!email) return;

  const existing = await prisma.person.findFirst({
    where: { email, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('A person with this email already exists.');
  }
}

/**
 * List persons, paginated and searchable (AC 1: FR-4's single anagrafica,
 * browsable/searchable). `q` matches first name, last name or email,
 * case-insensitively; archived persons (AC 2) are excluded by default and
 * only surfaced with `includeArchived: true`. Read access: `people.read`
 * (ADMIN-only).
 */
export async function listPeople(actor: Actor, query: ListPeopleQuery): Promise<PersonListResult> {
  authorize(actor, 'people.read');

  const q = query.q?.trim();
  // Story TD-3 (AC 1/3): `q` and `profile` are now independent, COMBINABLE
  // filters (the flight form's person/istruttore pickers search AND narrow
  // by profile in the SAME request) — each condition that applies is pushed
  // as its own entry and Prisma ANDs the array. A flat object with two
  // `OR:` keys (one for the name/email search, one for the profile check)
  // would silently collide (the later spread overwrites the earlier one in
  // a plain JS object literal), which is exactly the bug this `AND` array
  // avoids.
  const conditions: Array<Record<string, unknown>> = [];
  if (query.archivedOnly) conditions.push({ archivedAt: { not: null } });
  else if (!query.includeArchived) conditions.push({ archivedAt: null });
  if (q) {
    conditions.push({
      OR: [
        { firstName: { contains: q, mode: 'insensitive' as const } },
        { lastName: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } },
      ],
    });
  }
  // A to-one relation filter with a plain object requires the relation to
  // EXIST and match (Prisma's implicit `is`), so `pilotProfile: {
  // deactivatedAt: null }` already excludes a person with no pilot profile
  // at all — exactly the `pilotProfile !== null && pilotProfile.deactivatedAt
  // === null` semantics `toListItem` derives (same rule the client-side
  // filter in `flights/page.tsx` used to apply on the first 100 rows only).
  if (query.profile === 'pilot-or-student') {
    conditions.push({ OR: [{ pilotProfile: { deactivatedAt: null } }, { studentProfile: { deactivatedAt: null } }] });
  }
  if (query.profile === 'instructor') {
    conditions.push({ instructorProfile: { deactivatedAt: null } });
  }
  const where = conditions.length > 0 ? { AND: conditions } : {};

  // Interactive transaction (story TD-1, AC 3) — a batch `$transaction([...])`
  // sends both queries over the shared driver-adapter connection without
  // waiting for the first to finish, which the underlying `pg` driver flags
  // as a deprecated "client already executing a query" (only ever surfaces
  // once per process, per Node's warning dedup — reproduced empirically on a
  // fresh dev server before this fix). The awaited callback form serializes
  // the two reads while staying in the SAME transaction (still one
  // consistent snapshot for items/total under concurrent writes).
  const [items, total] = await prisma.$transaction(async (tx) => {
    const items = await tx.person.findMany({
      where,
      select: PERSON_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      ...paginationOffset(query),
    });
    const total = await tx.person.count({ where });
    return [items, total] as const;
  });

  return paginate(items.map(toListItem), total, query);
}

/** Story 12.6, AC 1: linked-user summary for the Piloti page's "Accesso"/"Stato" columns — `null` when the person has no linked user at all. */
export type PilotUserInfo = {
  id: string;
  email: string;
  roles: Role[];
  isActive: boolean;
  /** Whether the user completed their invite — never exposes the hash (same convention as `users.service.ts#UserListItem`). */
  passwordSet: boolean;
} | null;

export type PilotsPageItem = PersonListItem & {
  /** Always `SUM(AccountMovement.amountCents)` for the person's account (AD-3) — `0` when the person never activated one (same "no account" convention as `AccountOverview`). */
  balanceCents: number;
  /** The most recent flight's date (`YYYY-MM-DD`), or `null` if the person never flew. */
  lastFlightDate: string | null;
  user: PilotUserInfo;
};

export type PilotsPageResult = {
  items: PilotsPageItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Fleet-wide (unfiltered by `q`/pagination — same convention as `fleet/page.tsx`'s own header counts), non-archived total: the page-head "N persone". */
  totalCount: number;
  /** Fleet-wide, non-archived count of persons whose linked user has `isActive: false`: the page-head "N sospese". */
  suspendedCount: number;
};

/**
 * Composite reader for the Piloti page (story 12.6, AC 1) — wraps
 * `listPeople` (which already authorizes `people.read` and does the
 * search/pagination) and enriches that SAME page of ids with three derived
 * reads that have no multi-person variant anywhere else in the codebase:
 * account balance, last flight date, and linked-user status. Every one is a
 * single batched `groupBy`/`findMany` over the page's ids — NEVER a per-row
 * loop calling `getAccountOverview`/`listFlights` (that would be N+1, the
 * exact thing this composite exists to avoid). The pattern mirrors
 * `accounts.service.ts#listNegativeBalances`'s own two-step groupBy-then-join
 * (here scoped to the page's ids instead of a `having` filter).
 */
export async function listPilotsPageData(actor: Actor, query: ListPeopleQuery): Promise<PilotsPageResult> {
  const listResult = await listPeople(actor, query);
  const ids = listResult.items.map((item) => item.id);

  const [accounts, flightGroups, users, totalCount, suspendedCount] = await Promise.all([
    ids.length > 0 ? prisma.account.findMany({ where: { personId: { in: ids } }, select: { id: true, personId: true } }) : [],
    ids.length > 0
      ? prisma.flight.groupBy({ by: ['personId'], where: { personId: { in: ids } }, _max: { flightDate: true } })
      : [],
    ids.length > 0
      ? prisma.user.findMany({
          where: { personId: { in: ids } },
          select: { id: true, personId: true, email: true, roles: true, isActive: true, passwordHash: true },
        })
      : [],
    prisma.person.count({ where: { archivedAt: null } }),
    prisma.user.count({ where: { isActive: false, person: { archivedAt: null } } }),
  ]);

  const accountIds = accounts.map((account) => account.id);
  const balanceGroups =
    accountIds.length > 0
      ? await prisma.accountMovement.groupBy({ by: ['accountId'], where: { accountId: { in: accountIds } }, _sum: { amountCents: true } })
      : [];
  const balanceByAccountId = new Map(balanceGroups.map((group) => [group.accountId, group._sum.amountCents ?? 0]));
  const balanceByPersonId = new Map(accounts.map((account) => [account.personId, balanceByAccountId.get(account.id) ?? 0]));
  const lastFlightByPersonId = new Map(flightGroups.map((group) => [group.personId, group._max.flightDate]));
  const userByPersonId = new Map(users.map((user) => [user.personId, user]));

  const items: PilotsPageItem[] = listResult.items.map((item) => {
    const user = userByPersonId.get(item.id);
    const lastFlightDate = lastFlightByPersonId.get(item.id);
    return {
      ...item,
      balanceCents: balanceByPersonId.get(item.id) ?? 0,
      lastFlightDate: lastFlightDate ? toDateOnlyString(lastFlightDate) : null,
      user: user ? { id: user.id, email: user.email, roles: user.roles, isActive: user.isActive, passwordSet: user.passwordHash !== null } : null,
    };
  });

  return { items, total: listResult.total, page: listResult.page, pageSize: listResult.pageSize, totalCount, suspendedCount };
}

/**
 * Returns a single person with the three profiles in full (story 2.2, AC 1).
 * Read access: `people.read` (ADMIN-only, any person) OR "own" access
 * (story 2.3, AC 2) — an actor with `self.read` but not `people.read` may
 * only read the record matching `actor.personId`. This is the "own"
 * resource-level scoping documented in `rbac.ts`'s module doc: `authorize()`
 * only ever checks the coarse permission, so the `personId` comparison lives
 * here, never there.
 */
export async function getPerson(actor: Actor, id: string): Promise<PersonDetail> {
  if (!hasPermission(actor, 'people.read')) {
    authorize(actor, 'self.read');
    if (actor.personId !== id) {
      throw new ForbiddenError('Actor may only read their own person record.');
    }
  }

  const person = await prisma.person.findUnique({ where: { id }, select: PERSON_DETAIL_SELECT });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }
  return toPersonDetail(person);
}

/**
 * Story 13.3 (R-13.3-c): the linked-user summary for a SINGLE person — same
 * shape/derivation as `listPilotsPageData`'s per-row `user` (`PilotUserInfo`),
 * extracted here so the scheda persona page can build the `PilotRow`-shaped
 * object its embedded `PilotEditor` (13.2) needs without a second N+1-style
 * batched reader. No RBAC of its own: callers only reach this after their own
 * `people.read`/own-access check (same convention as `getPerson`'s callers
 * mirroring the page-level redirect, AD-5) and the value only ever feeds the
 * editor's `AccessSection`, itself gated by `canManageUsers` at render time.
 */
export async function getPersonUser(personId: string): Promise<PilotUserInfo> {
  const user = await prisma.user.findUnique({
    where: { personId },
    select: { id: true, email: true, roles: true, isActive: true, passwordHash: true },
  });
  return user ? { id: user.id, email: user.email, roles: user.roles, isActive: user.isActive, passwordSet: user.passwordHash !== null } : null;
}

/**
 * The raw `Person` insert behind `createPerson` (AC 1) — extracted (story
 * 13.1, Dev Notes: "helper condivisi, mai duplicazione", same
 * `getFlightTotals` 12.8 precedent) so the one-step composite below can run
 * it, and every profile/expiry/access write that follows, inside ONE
 * transaction (`tx`).
 */
async function createPersonCore(tx: Prisma.TransactionClient, input: CreatePersonInput): Promise<SelectedPerson> {
  try {
    return await tx.person.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
      },
      select: PERSON_SELECT,
    });
  } catch (error) {
    // assertUnique (below) is check-then-write: a concurrent request can win
    // the race and the unique constraint fires here instead.
    if (isUniqueViolation(error)) {
      throw new ConflictError('A person with this email already exists.');
    }
    throw error;
  }
}

/**
 * Pre-validates the composite create's `expiries` block (AC 5, R-13.1-c):
 * every referenced type must exist, be ACTIVE, and have a scope compatible
 * with the profiles about to be activated in THIS SAME call. Unlike
 * `expiries.service.ts#assertScopeCompatible` (which reads the person's
 * CURRENT profiles from the DB), compatibility here is checked against the
 * request's OWN `profiles` block — the person doesn't exist yet, so there is
 * nothing to read. Every failure is a 422 (AC 7: "tipo inesistente/inattivo
 * → 422"), deliberately NOT the 404/409 `registerExpiry` itself uses — this
 * validates a batch of a request body, not a single resource lookup.
 */
async function assertExpiryTypesValidForComposite(
  expiries: NonNullable<CreatePersonInput['expiries']>,
  profiles: CreatePersonInput['profiles'],
): Promise<void> {
  const ids = expiries.map((expiry) => expiry.expiryTypeId);
  const types = await prisma.expiryType.findMany({ where: { id: { in: ids } }, select: { id: true, scope: true, isActive: true } });
  const typeById = new Map(types.map((type) => [type.id, type]));

  for (const id of ids) {
    const type = typeById.get(id);
    if (!type) {
      throw new ValidationError(`Expiry type ${id} not found.`, undefined, 'EXPIRY_TYPE_NOT_FOUND');
    }
    if (!type.isActive) {
      throw new ValidationError(`Expiry type ${id} is deactivated.`, undefined, 'EXPIRY_TYPE_INACTIVE');
    }
    const compatible =
      type.scope === 'ALL' ||
      (type.scope === 'PILOTS' && Boolean(profiles?.pilot)) ||
      (type.scope === 'STUDENTS' && Boolean(profiles?.student)) ||
      (type.scope === 'INSTRUCTORS' && Boolean(profiles?.instructor));
    if (!compatible) {
      throw new ValidationError(`Expiry type ${id}'s scope does not match any profile being activated.`, undefined, 'SCOPE_MISMATCH');
    }
  }
}

/**
 * Creates a person (AC 1) — and, since story 13.1 (AC 5), OPTIONALLY in the
 * SAME atomic transaction: activates one or more profiles, registers
 * expiries against them, and creates a linked user + sends its invite (the
 * one-step "Aggiungi pilota" flow). Write access: `people.manage`; the
 * `access` block additionally requires `users.manage` — checked BEFORE any
 * write, so an actor without it gets a 403 and the block is never silently
 * dropped (AC 5). A failure in ANY block (duplicate email, unknown/inactive
 * expiry type, scope mismatch, `access.email` already taken, ...) rolls
 * back the ENTIRE person — every write below shares the SAME `tx`. The
 * invite email (only if `access` was given) is sent AFTER the transaction
 * commits (fire-and-forget, same pattern as the standalone
 * `POST /api/v1/users`) — never before, so a rolled-back create never sends
 * an invite for a user that doesn't exist.
 *
 * Calling this with none of `profiles`/`expiries`/`access` behaves IDENTICALLY
 * to the pre-13.1 `createPerson` (retro-compatibility, AC 5) — the pilot
 * editor's existing "new person" flow is completely unaffected.
 *
 * The `expiries` block's `expiresAt` can be in the past (Contesto: an
 * already-expired scadenza is legal to register — same stance
 * `registerExpiry`'s own doc-comment takes). Before review R6 this batch
 * ALSO stamped `issuedAt` as today, which for a caller-supplied past
 * `expiresAt` produced a row `expiresAt < issuedAt` the standalone `POST
 * /api/v1/expiries` would have rejected (review F1) — R6 (PO ratifica
 * 2026-07-23) removed `issuedAt` from the domain entirely, so that
 * inconsistency no longer exists: there is nothing left to compare
 * `expiresAt` against.
 */
export async function createPerson(actor: Actor, input: CreatePersonInput): Promise<PersonListItem> {
  authorize(actor, 'people.manage');
  if (input.access) {
    // Review 14.9 F5: since 14.9, `people.manage` is ADMIN-only, and ADMIN
    // always also holds `users.manage` — no role can pass the guard above
    // and fail this one, so this branch is structurally unreachable today.
    // Kept for a future role holding `people.manage` without
    // `users.manage`; coverage for it is no longer expressible (an
    // adjacent test can only reach the OUTER `people.manage` gate).
    authorize(actor, 'users.manage');
  }
  // Story 19.3 (R-19-e, Q-19.3-c): the body alone decides it for a person who
  // does not exist yet — no concurrency to serialize, so no need for
  // `assertStudentProfileExclusive`'s read; same code, before any query.
  if (input.profiles?.student && (input.profiles.pilot || input.profiles.instructor)) {
    throw studentProfileExclusiveError();
  }

  await assertUnique(input.email);

  if (input.access) {
    const existingUser = await prisma.user.findUnique({ where: { email: input.access.email }, select: { id: true } });
    if (existingUser) {
      throw new ConflictError('A user with this email already exists.');
    }
  }
  if (input.expiries) {
    await assertExpiryTypesValidForComposite(input.expiries, input.profiles);
  }

  const { person, user } = await prisma.$transaction(async (tx) => {
    const person = await createPersonCore(tx, input);

    if (input.profiles?.pilot) {
      await upsertPilotProfileCore(tx, person.id, input.profiles.pilot);
    }
    if (input.profiles?.student) {
      await upsertStudentProfileCore(tx, person.id, input.profiles.student);
    }
    if (input.profiles?.instructor) {
      await upsertInstructorProfileCore(tx, person.id);
    }

    if (input.expiries) {
      for (const expiry of input.expiries) {
        await tx.expiry.create({
          data: {
            personId: person.id,
            expiryTypeId: expiry.expiryTypeId,
            expiresAt: parseDateOnlyUtc(expiry.expiresAt),
            actorUserId: actor.userId,
          },
        });
      }
    }

    const user = input.access
      ? // `locale: 'it'` matches `createUserSchema`'s own default — the
        // composite's `access` block (AC 5) has no locale field of its own.
        await createUserCore(tx, { email: input.access.email, roles: input.access.roles, locale: 'it', personId: person.id })
      : null;

    return { person, user };
  });

  if (user) {
    try {
      await sendInviteEmail(user.id, user.email, emailLocale(user.locale));
    } catch (error) {
      console.error('createPerson: failed to send invite email', error);
    }
  }

  return {
    ...toListItem(person),
    profiles: {
      pilot: Boolean(input.profiles?.pilot),
      student: Boolean(input.profiles?.student),
      instructor: Boolean(input.profiles?.instructor),
    },
  };
}

/** One expiry type of the composite's `expiries.set`, as read before the transaction (AD-2 step 4). */
type CompositeExpiryType = { id: string; scope: ExpiryScope; isActive: boolean };

/** A row the composite is about to CREATE needs an active type (same 422 codes as the composite create, `assertExpiryTypesValidForComposite`). */
function assertExpiryTypeCreatable(type: CompositeExpiryType): void {
  if (!type.isActive) {
    throw new ValidationError(`Expiry type ${type.id} is deactivated.`, { expiryTypeId: type.id }, 'EXPIRY_TYPE_INACTIVE');
  }
}

/**
 * Updates a person (AC 2: name, contact details — archiving stays separate)
 * and, since story 19.4 (A17, R-19-m), OPTIONALLY saves in the SAME
 * transaction everything the person editors' single "Salva" carries: profiles
 * (activated, updated or deactivated), expiries (by type), the instructor
 * compensation and the student-charged instructor rate. All or nothing: a
 * failure in any block saves nothing. The body is declarative on the FINAL
 * state (D-2), so the same body twice gives the same state and no error
 * (activations are upserts, deactivations and removals are no-ops once done,
 * an equal expiry date writes nothing, the rate rewrites its own row). A body
 * with only the anagrafica keys behaves as before, with the richer
 * `PersonDetail` response.
 *
 * Order (AD-2), binding. Outside the transaction — nothing written, every
 * failure before any lock: the permission of each block present (403 before
 * any query, never a block silently dropped — `profiles` rides on
 * `people.manage`), the person (404), the email (409 `CONFLICT`), the types of
 * the expiry rows that will be created (422) and the rate's decorrenza (422
 * `RATE_VALID_FROM_IN_PAST`). Inside ONE `$transaction`, every write on `tx`:
 * 1. the `Person` row lock, `FOR NO KEY UPDATE`, FIRST statement — the same
 *    lock and mode as `upsertProfile` (so a composite and a `PUT
 *    …/profiles/{type}` on the same person serialize) and as
 *    `bookings.service.ts#lockBookingPeople`: it does not conflict with the
 *    `FOR KEY SHARE` of the FK checks of rows pointing at the person (a
 *    `FOR UPDATE` here, taken before the `Account` upsert, would close a
 *    `Person ↔ Account` cycle with `flights.service.ts#registerFlight`). It
 *    also reads `archivedAt` under the lock, so a concurrent archive cannot
 *    slip between the check and a new expiry;
 * 2. profiles: deactivations, then activations through the `*Core` writers,
 *    then ONE `assertStudentProfileExclusive` on the final state — so
 *    "deactivate Student + activate Pilot" passes and "activate Pilot" with
 *    Student still active rolls back everything, the `Account` included;
 * 3. expiries: removals, then `set` by type — a missing row is created (person
 *    archived → 409 `PERSON_ARCHIVED`, type active, scope compatible with the
 *    profiles of step 2 → else 422), an existing one with another date moves
 *    through `updateExpiryDateCore` (sent alerts wiped), an equal date is not
 *    written;
 * 4. compensation and rate, on an instructor profile active AFTER step 2
 *    (else 409 `INSTRUCTOR_PROFILE_INACTIVE`) — the compensation is a plain
 *    column assignment here, the twin of
 *    `instructor-compensation.service.ts#setPayoutRate` (that module pulls
 *    the eager env chain through `bookings.service.ts`, so it is not
 *    imported), the rate goes through `upsertInstructorRateCore`;
 * 5. the anagrafica LAST: an `UPDATE` that changes `email` (a unique column)
 *    takes the `FOR UPDATE` row lock, the one mode that waits on `KEY SHARE`
 *    holders — taken last, after it the transaction waits on nothing more, so
 *    it cannot sit inside a cycle. It also reads back the `PersonDetail`
 *    (without anagrafica keys, a plain read does).
 * Lock order: `Person` (no key update) → profile rows/`Account` →
 * `Expiry`/`SentAlert` → `InstructorProfile` → `InstructorRate` → `Person`
 * (update) — consistent with the bookings' `Booking → Aircraft → Person →
 * InstructorProfile` and the flight registry's `Aircraft → Account`.
 *
 * Every 409 but the email's carries its own code (AD-5), so a client can tell
 * which section failed; the expiry errors about ONE row (`EXPIRY_TYPE_NOT_FOUND`,
 * `EXPIRY_TYPE_INACTIVE`, `SCOPE_MISMATCH`, `EXPIRY_CONFLICT`) also name it in
 * `details.expiryTypeId` (review 19.4 F2), so the editor shows the error on it.
 */
export async function updatePerson(actor: Actor, id: string, patch: UpdatePersonCompositeInput): Promise<PersonDetail> {
  authorize(actor, 'people.manage');
  if (patch.expiries) authorize(actor, 'expiries.manage');
  if (patch.payoutRateCents !== undefined) authorize(actor, 'payouts.manage');
  if (patch.instructorRate) authorize(actor, 'settings.manage');

  const existing = await prisma.person.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new NotFoundError('Person not found.');
  }

  await assertUnique(patch.email, id);

  const expirySet = patch.expiries?.set ?? [];
  const expiryTypeById = new Map<string, CompositeExpiryType>();
  if (expirySet.length > 0) {
    const ids = expirySet.map((entry) => entry.expiryTypeId);
    const [types, existingRows] = await Promise.all([
      prisma.expiryType.findMany({ where: { id: { in: ids } }, select: { id: true, scope: true, isActive: true } }),
      prisma.expiry.findMany({ where: { personId: id, expiryTypeId: { in: ids } }, select: { expiryTypeId: true } }),
    ]);
    for (const type of types) expiryTypeById.set(type.id, type);
    const registered = new Set(existingRows.map((row) => row.expiryTypeId));
    for (const typeId of ids) {
      const type = expiryTypeById.get(typeId);
      if (!type) {
        throw new ValidationError(`Expiry type ${typeId} not found.`, { expiryTypeId: typeId }, 'EXPIRY_TYPE_NOT_FOUND');
      }
      // An existing row may still move its date on a since-deactivated type (as `updateExpiry` allows).
      if (!registered.has(typeId)) assertExpiryTypeCreatable(type);
    }
  }
  if (patch.instructorRate) {
    assertRateValidFromNotPast(patch.instructorRate.validFrom);
  }

  return prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; archivedAt: Date | null }>>`
      SELECT "id", "archivedAt" FROM "Person" WHERE "id" = ${id} FOR NO KEY UPDATE`;
    if (!locked) {
      throw new NotFoundError('Person not found.');
    }

    const profiles = patch.profiles ?? {};
    for (const type of ['pilot', 'student', 'instructor'] as const) {
      if (profiles[type]?.active === false) await deactivateProfileCore(tx, id, type);
    }
    if (profiles.pilot?.active) {
      await upsertPilotProfileCore(tx, id, { licenseNumber: profiles.pilot.licenseNumber, licenseType: profiles.pilot.licenseType });
    }
    if (profiles.student?.active) {
      await upsertStudentProfileCore(tx, id, { courseStartDate: profiles.student.courseStartDate });
    }
    if (profiles.instructor?.active) {
      await upsertInstructorProfileCore(tx, id);
    }
    if (profiles.pilot || profiles.student || profiles.instructor) {
      await assertStudentProfileExclusive(tx, id);
    }

    const touchesInstructor = patch.payoutRateCents !== undefined || patch.instructorRate !== undefined;
    // The profiles as step 2 left them: the scope of a new expiry and the instructor parts are judged on these.
    const finalProfiles =
      expirySet.length > 0 || touchesInstructor
        ? await tx.person.findUniqueOrThrow({
            where: { id },
            select: {
              pilotProfile: { select: { deactivatedAt: true } },
              studentProfile: { select: { deactivatedAt: true } },
              instructorProfile: { select: { id: true, deactivatedAt: true, payoutRateCents: true } },
            },
          })
        : null;

    const expiryRemove = patch.expiries?.remove ?? [];
    if (expiryRemove.length > 0) {
      await tx.expiry.deleteMany({ where: { personId: id, expiryTypeId: { in: expiryRemove } } });
    }
    if (finalProfiles && expirySet.length > 0) {
      const rows = await tx.expiry.findMany({
        where: { personId: id, expiryTypeId: { in: expirySet.map((entry) => entry.expiryTypeId) } },
        select: { id: true, expiryTypeId: true, expiresAt: true },
      });
      const rowByType = new Map(rows.map((row) => [row.expiryTypeId, row]));
      for (const entry of expirySet) {
        const nextExpiresAt = parseDateOnlyUtc(entry.expiresAt);
        const row = rowByType.get(entry.expiryTypeId);
        if (row) {
          if (row.expiresAt.getTime() !== nextExpiresAt.getTime()) {
            await updateExpiryDateCore(tx, row.id, nextExpiresAt, row.expiresAt, actor.userId);
          }
          continue;
        }
        if (locked.archivedAt !== null) {
          throw new ConflictError('This person is archived.', undefined, 'PERSON_ARCHIVED');
        }
        // Read before the transaction (step 4); re-checked here for a row deleted meanwhile.
        const type = expiryTypeById.get(entry.expiryTypeId)!;
        assertExpiryTypeCreatable(type);
        assertScopeCompatible(type.scope, finalProfiles, { expiryTypeId: entry.expiryTypeId });
        try {
          await tx.expiry.create({
            data: { personId: id, expiryTypeId: entry.expiryTypeId, expiresAt: nextExpiresAt, actorUserId: actor.userId },
          });
        } catch (error) {
          // A concurrent `POST /expiries` created the same (person, type) row first.
          if (isUniqueViolation(error)) {
            throw new ConflictError('An expiry of this type was registered meanwhile.', { expiryTypeId: entry.expiryTypeId }, 'EXPIRY_CONFLICT');
          }
          throw error;
        }
      }
    }

    if (finalProfiles && touchesInstructor) {
      const instructorProfile = finalProfiles.instructorProfile;
      if (!instructorProfile || instructorProfile.deactivatedAt !== null) {
        throw new ConflictError('This person has no active instructor profile.', undefined, 'INSTRUCTOR_PROFILE_INACTIVE');
      }
      if (patch.payoutRateCents !== undefined && patch.payoutRateCents !== instructorProfile.payoutRateCents) {
        await tx.instructorProfile.update({ where: { id: instructorProfile.id }, data: { payoutRateCents: patch.payoutRateCents } });
      }
      if (patch.instructorRate) {
        await upsertInstructorRateCore(tx, instructorProfile.id, patch.instructorRate, actor.userId);
      }
    }

    const identity = {
      ...(patch.firstName !== undefined && { firstName: patch.firstName }),
      ...(patch.lastName !== undefined && { lastName: patch.lastName }),
      ...(patch.email !== undefined && { email: patch.email }),
      ...(patch.phone !== undefined && { phone: patch.phone }),
      ...(patch.address !== undefined && { address: patch.address }),
    };
    if (Object.keys(identity).length === 0) {
      return toPersonDetail(await tx.person.findUniqueOrThrow({ where: { id }, select: PERSON_DETAIL_SELECT }));
    }
    try {
      return toPersonDetail(await tx.person.update({ where: { id }, data: identity, select: PERSON_DETAIL_SELECT }));
    } catch (error) {
      // assertUnique (above) is check-then-write: a concurrent request can win the race.
      if (isUniqueViolation(error)) {
        throw new ConflictError('A person with this email already exists.');
      }
      throw error;
    }
  });
}

/**
 * Archives a person (AC 2): `archivedAt` is a timestamp, not a boolean, so it
 * also records *when*. There is deliberately no physical-delete API — an
 * archived person stays fully readable with all its history, it is just
 * excluded from `listPeople`'s default (non-`includeArchived`) results and
 * from new-operation pickers built on top of it. A `User` still linked to
 * this person keeps its access unchanged (out of scope here, per Dev Notes).
 */
export async function archivePerson(actor: Actor, id: string): Promise<PersonListItem> {
  authorize(actor, 'people.manage');

  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Person not found.');
  }
  if (existing.archivedAt !== null) {
    throw new ConflictError('Person is already archived.');
  }

  const person = await prisma.person.update({
    where: { id },
    data: { archivedAt: new Date() },
    select: PERSON_SELECT,
  });
  return toListItem(person);
}

/** Restores a previously archived person (AC 2). */
export async function unarchivePerson(actor: Actor, id: string): Promise<PersonListItem> {
  authorize(actor, 'people.manage');

  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Person not found.');
  }
  if (existing.archivedAt === null) {
    throw new ConflictError('Person is not archived.');
  }

  const person = await prisma.person.update({
    where: { id },
    data: { archivedAt: null },
    select: PERSON_SELECT,
  });
  return toListItem(person);
}

/**
 * Story 3.1, AC 1/AD-11: the pilot profile upsert and the Account upsert
 * must land together — a crash between the two must never leave a pilot
 * profile active with no account behind it. Extracted (story 13.1, Dev
 * Notes: "helper condivisi, mai duplicazione") so the one-step composite
 * `createPerson` can run this INSIDE its own transaction via the SAME `tx`,
 * instead of duplicating it.
 */
async function upsertPilotProfileCore(tx: Prisma.TransactionClient, personId: string, input: PilotProfileInput): Promise<PilotProfileDto> {
  const profile = await tx.pilotProfile.upsert({
    where: { personId },
    create: { personId, licenseNumber: input.licenseNumber, licenseType: input.licenseType },
    update: { licenseNumber: input.licenseNumber, licenseType: input.licenseType, deactivatedAt: null },
    select: { licenseNumber: true, licenseType: true, deactivatedAt: true },
  });
  await tx.account.upsert({ where: { personId }, create: { personId }, update: {} });
  return profile;
}

/** Student twin of {@link upsertPilotProfileCore} — same Account-upsert-alongside rationale. */
async function upsertStudentProfileCore(tx: Prisma.TransactionClient, personId: string, input: StudentProfileInput): Promise<StudentProfileDto> {
  const courseStartDate = new Date(input.courseStartDate);
  const profile = await tx.studentProfile.upsert({
    where: { personId },
    create: { personId, courseStartDate },
    update: { courseStartDate, deactivatedAt: null },
    select: { courseStartDate: true, deactivatedAt: true },
  });
  await tx.account.upsert({ where: { personId }, create: { personId }, update: {} });
  return { courseStartDate: toDateOnlyString(profile.courseStartDate), deactivatedAt: profile.deactivatedAt };
}

/**
 * Instructor twin of {@link upsertPilotProfileCore} — no companion `Account`
 * (instructors aren't billed like pilots/students, unchanged). No own field
 * to write either (story 13.1, R-13.1-b: `ratings` removed) — this call is
 * now a pure activate/reactivate.
 */
async function upsertInstructorProfileCore(tx: Prisma.TransactionClient, personId: string): Promise<InstructorProfileDto> {
  return tx.instructorProfile.upsert({
    where: { personId },
    create: { personId },
    update: { deactivatedAt: null },
    select: { deactivatedAt: true },
  });
}

function studentProfileExclusiveError(): ValidationError {
  return new ValidationError(
    'The student profile cannot be active together with the pilot or instructor profile.',
    undefined,
    'STUDENT_PROFILE_EXCLUSIVE',
  );
}

/**
 * The student profile excludes the pilot AND the instructor profile (story
 * 19.3, R-19-e — "a student has no licence" — extended by Q-19.3-c: an
 * instructor holds one too). Reads the person's three profiles FROM `tx` and
 * throws 422 `STUDENT_PROFILE_EXCLUSIVE` when the student one is active
 * together with either of the others. Called AFTER the profile writes of the
 * same transaction, so it judges the FINAL state and its throw rolls back
 * everything the transaction wrote (profile and `Account` alike): a "deactivate
 * Student + activate Pilot" pair in one save passes, "activate Pilot" with
 * Student still active does not. The caller must hold the `Person` row lock
 * (`upsertProfile`, the person composite `updatePerson`) so two concurrent
 * activations cannot both read the other profile inactive.
 */
export async function assertStudentProfileExclusive(tx: Prisma.TransactionClient, personId: string): Promise<void> {
  const profiles = await tx.person.findUnique({
    where: { id: personId },
    select: {
      pilotProfile: { select: { deactivatedAt: true } },
      studentProfile: { select: { deactivatedAt: true } },
      instructorProfile: { select: { deactivatedAt: true } },
    },
  });
  const isActive = (profile: { deactivatedAt: Date | null } | null | undefined): boolean => profile != null && profile.deactivatedAt === null;
  if (isActive(profiles?.studentProfile) && (isActive(profiles?.pilotProfile) || isActive(profiles?.instructorProfile))) {
    throw studentProfileExclusiveError();
  }
}

/**
 * Activates or updates one of a person's profiles (story 2.2, AC 1/2).
 * Creates the profile row if it doesn't exist yet; if it does — active or
 * previously deactivated — updates its data and clears `deactivatedAt`.
 * Since story 19.3 the student profile excludes the pilot and the instructor
 * one (`assertStudentProfileExclusive`, 422 `STUDENT_PROFILE_EXCLUSIVE`): the
 * student→pilot transition is now "deactivate Student, then activate Pilot".
 * `Person.id` never changes across this. Write access:
 * `people.manage`. Allowed on an archived person (Dev Notes, consistent with
 * review 2.1 F3: editing an archived person is by-design).
 *
 * Each branch runs in ONE `$transaction` whose FIRST statement locks the
 * `Person` row — `FOR NO KEY UPDATE`, the same mode and the same reason as
 * `bookings.service.ts#lockBookingPeople` (it serializes the writers of this
 * person's profiles without blocking the `FOR KEY SHARE` of any FK check on
 * the person) — and doubles as the existence check (0 rows → 404). Then the
 * `*Core` helper (shared with `createPerson`'s composite), then the
 * exclusivity check on the final state. Lock order inside it: `Person` →
 * the profile row → `Account` (the core's upsert); no transaction in this
 * codebase takes `Account` and then `Person`.
 */
export async function upsertProfile(actor: Actor, personId: string, type: 'pilot', data: PilotProfileInput): Promise<PilotProfileDto>;
export async function upsertProfile(actor: Actor, personId: string, type: 'student', data: StudentProfileInput): Promise<StudentProfileDto>;
export async function upsertProfile(
  actor: Actor,
  personId: string,
  type: 'instructor',
  data: InstructorProfileInput,
): Promise<InstructorProfileDto>;
export async function upsertProfile(
  actor: Actor,
  personId: string,
  type: ProfileType,
  data: PilotProfileInput | StudentProfileInput | InstructorProfileInput,
): Promise<PilotProfileDto | StudentProfileDto | InstructorProfileDto> {
  authorize(actor, 'people.manage');

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Person" WHERE "id" = ${personId} FOR NO KEY UPDATE`;
    if (locked.length === 0) {
      throw new NotFoundError('Person not found.');
    }

    const profile =
      type === 'pilot'
        ? await upsertPilotProfileCore(tx, personId, data as PilotProfileInput)
        : type === 'student'
          ? await upsertStudentProfileCore(tx, personId, data as StudentProfileInput)
          : await upsertInstructorProfileCore(tx, personId);

    await assertStudentProfileExclusive(tx, personId);
    return profile;
  });
}

/**
 * Deactivates one of a person's profiles (story 2.2, AC 1/2) — soft, never a
 * physical delete (Dev Notes: future epics reference the profile row).
 * `ConflictError` covers both "never activated" and "already deactivated"
 * (same "nothing to do" shape as `archivePerson`/`unarchivePerson`); a
 * missing `Person` is a `NotFoundError` instead, same distinction as every
 * other write in this service. Write access: `people.manage`.
 */
export async function deactivateProfile(actor: Actor, personId: string, type: ProfileType): Promise<void> {
  authorize(actor, 'people.manage');

  const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }

  // Single guarded UPDATE (`deactivatedAt: null` in the where) so two
  // concurrent deactivations can't both pass a separate read-then-check: the
  // loser matches zero rows and gets the same ConflictError as a deactivate
  // on a never-activated or already-deactivated profile (review 2.2 F1).
  const count = await deactivateProfileCore(prisma, personId, type);
  if (count === 0) {
    const label = type === 'pilot' ? 'Pilot' : type === 'student' ? 'Student' : 'Instructor';
    throw new ConflictError(`${label} profile is not active.`);
  }
}

/**
 * The guarded deactivation of one profile — `deactivatedAt: null` in the
 * `where`, so it matches at most the ACTIVE row and returns how many it
 * changed (0 = never activated or already inactive). Shared by
 * `deactivateProfile` (0 is its 409) and the person composite of story 19.4
 * (0 is a no-op: the body states the final state, D-2).
 */
async function deactivateProfileCore(tx: Prisma.TransactionClient, personId: string, type: ProfileType): Promise<number> {
  const where = { personId, deactivatedAt: null };
  const update = { deactivatedAt: new Date() };
  const { count } =
    type === 'pilot'
      ? await tx.pilotProfile.updateMany({ where, data: update })
      : type === 'student'
        ? await tx.studentProfile.updateMany({ where, data: update })
        : await tx.instructorProfile.updateMany({ where, data: update });
  return count;
}
