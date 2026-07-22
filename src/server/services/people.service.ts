import type { Prisma } from '@/generated/prisma/client';
import type { Role } from '@/generated/prisma/enums';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import { parseDateOnlyUtc, todayDateOnlyUtc } from '@/lib/date-only';
import type { CreatePersonInput, ListPeopleQuery, UpdatePersonInput } from '@/lib/schemas/people';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { sendInviteEmail } from './auth-tokens.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';
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
  fiscalCode: string | null;
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
  fiscalCode: true,
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
  fiscalCode: string | null;
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
    fiscalCode: person.fiscalCode,
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

/** Prisma unique-constraint violation (concurrent duplicate email/fiscalCode). */
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
 * `assertPersonAvailable`). Falsy `email`/`fiscalCode` (undefined or the
 * `null` that clears the field) is never a conflict — Postgres treats
 * multiple `NULL`s in a unique column as distinct.
 */
async function assertUnique(fields: { email?: string | null; fiscalCode?: string | null }, excludeId?: string): Promise<void> {
  const conditions: Array<Record<string, string>> = [];
  if (fields.email) conditions.push({ email: fields.email });
  if (fields.fiscalCode) conditions.push({ fiscalCode: fields.fiscalCode });
  if (conditions.length === 0) return;

  const existing = await prisma.person.findFirst({
    where: { OR: conditions, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('A person with this email or fiscal code already exists.');
  }
}

/**
 * List persons, paginated and searchable (AC 1: FR-4's single anagrafica,
 * browsable/searchable). `q` matches first name, last name or email,
 * case-insensitively; archived persons (AC 2) are excluded by default and
 * only surfaced with `includeArchived: true`. Read access: `people.read`
 * (staff/admin).
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
  if (!query.includeArchived) conditions.push({ archivedAt: null });
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
  /** The most recent REGISTERED flight's date (`YYYY-MM-DD`), or `null` if the person never flew. */
  lastFlightDate: string | null;
  user: PilotUserInfo;
};

export type PilotsPageResult = {
  items: PilotsPageItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Fleet-wide (unfiltered by `q`/pagination — same convention as `fleet/page.tsx`'s own header counts), non-archived total: the page-head "N in archivio". */
  totalCount: number;
  /** Fleet-wide, non-archived count of persons whose linked user has `isActive: false`: the page-head "N sospesi". */
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
      ? prisma.flight.groupBy({ by: ['personId'], where: { personId: { in: ids }, status: 'REGISTERED' }, _max: { flightDate: true } })
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
 * Read access: `people.read` (staff/admin, any person) OR "own" access
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
        fiscalCode: input.fiscalCode ?? null,
      },
      select: PERSON_SELECT,
    });
  } catch (error) {
    // assertUnique (below) is check-then-write: a concurrent request can win
    // the race and the unique constraint fires here instead.
    if (isUniqueViolation(error)) {
      throw new ConflictError('A person with this email or fiscal code already exists.');
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
 */
export async function createPerson(actor: Actor, input: CreatePersonInput): Promise<PersonListItem> {
  authorize(actor, 'people.manage');
  if (input.access) {
    authorize(actor, 'users.manage');
  }

  await assertUnique({ email: input.email, fiscalCode: input.fiscalCode });

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
      // A single "issued today" date for every expiry in this batch — the
      // wire shape (AC 5) only carries `expiresAt`, never `issuedAt` (unlike
      // `registerExpiry`'s own standalone schema): a person just being
      // created has no prior issue date to ask for, so "today" is the only
      // sensible default for a one-step create.
      const issuedAt = todayDateOnlyUtc();
      for (const expiry of input.expiries) {
        await tx.expiry.create({
          data: {
            personId: person.id,
            expiryTypeId: expiry.expiryTypeId,
            issuedAt,
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

/** Partial update: name, contact details, fiscal code. Archiving is separate (AC 2). */
export async function updatePerson(actor: Actor, id: string, patch: UpdatePersonInput): Promise<PersonListItem> {
  authorize(actor, 'people.manage');

  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Person not found.');
  }

  await assertUnique({ email: patch.email, fiscalCode: patch.fiscalCode }, id);

  let person;
  try {
    person = await prisma.person.update({
      where: { id },
      data: {
        ...(patch.firstName !== undefined && { firstName: patch.firstName }),
        ...(patch.lastName !== undefined && { lastName: patch.lastName }),
        ...(patch.email !== undefined && { email: patch.email }),
        ...(patch.phone !== undefined && { phone: patch.phone }),
        ...(patch.address !== undefined && { address: patch.address }),
        ...(patch.fiscalCode !== undefined && { fiscalCode: patch.fiscalCode }),
      },
      select: PERSON_SELECT,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('A person with this email or fiscal code already exists.');
    }
    throw error;
  }

  return toListItem(person);
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

/**
 * Activates or updates one of a person's profiles (story 2.2, AC 1/2).
 * Creates the profile row if it doesn't exist yet; if it does — active or
 * previously deactivated — updates its data and clears `deactivatedAt`
 * (AC 2: reactivating, e.g. the student→pilot transition, is just an
 * upsert). `Person.id` never changes across this. Write access:
 * `people.manage`. Allowed on an archived person (Dev Notes, consistent with
 * review 2.1 F3: editing an archived person is by-design). Each branch
 * below wraps its `*Core` helper in a trivial `$transaction` — same
 * interactive-callback idiom as `accounts.service.ts#readOverview`, kept
 * even for the instructor branch (no companion write) so all three stay
 * uniform and reusable by `createPerson`'s composite the same way.
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

  const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }

  if (type === 'pilot') {
    const input = data as PilotProfileInput;
    return prisma.$transaction((tx) => upsertPilotProfileCore(tx, personId, input));
  }

  if (type === 'student') {
    const input = data as StudentProfileInput;
    return prisma.$transaction((tx) => upsertStudentProfileCore(tx, personId, input));
  }

  return prisma.$transaction((tx) => upsertInstructorProfileCore(tx, personId));
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
  const where = { personId, deactivatedAt: null };
  const update = { deactivatedAt: new Date() };
  const { count } =
    type === 'pilot'
      ? await prisma.pilotProfile.updateMany({ where, data: update })
      : type === 'student'
        ? await prisma.studentProfile.updateMany({ where, data: update })
        : await prisma.instructorProfile.updateMany({ where, data: update });
  if (count === 0) {
    const label = type === 'pilot' ? 'Pilot' : type === 'student' ? 'Student' : 'Instructor';
    throw new ConflictError(`${label} profile is not active.`);
  }
}
