import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import type { CreatePersonInput, ListPeopleQuery, UpdatePersonInput } from '@/lib/schemas/people';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from './errors';

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
export type InstructorProfileInput = { ratings: string };

export type PilotProfileDto = { licenseNumber: string; licenseType: string; deactivatedAt: Date | null };
/** `courseStartDate` stays a `YYYY-MM-DD` string on the way out — never a full datetime (Dev Notes). */
export type StudentProfileDto = { courseStartDate: string; deactivatedAt: Date | null };
export type InstructorProfileDto = { ratings: string; deactivatedAt: Date | null };

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
  instructorProfile: { select: { ratings: true, deactivatedAt: true } },
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
  instructorProfile: { ratings: string; deactivatedAt: Date | null } | null;
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
    instructorProfile: person.instructorProfile
      ? { ratings: person.instructorProfile.ratings, deactivatedAt: person.instructorProfile.deactivatedAt }
      : null,
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
  const where = {
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' as const } },
            { lastName: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.person.findMany({
      where,
      select: PERSON_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      ...paginationOffset(query),
    }),
    prisma.person.count({ where }),
  ]);

  return paginate(items.map(toListItem), total, query);
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

/** Creates a person (AC 1). Write access: `people.manage` (staff/admin). */
export async function createPerson(actor: Actor, input: CreatePersonInput): Promise<PersonListItem> {
  authorize(actor, 'people.manage');

  await assertUnique({ email: input.email, fiscalCode: input.fiscalCode });

  let person;
  try {
    person = await prisma.person.create({
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
    // assertUnique is check-then-write: a concurrent request can win the
    // race and the unique constraint fires here instead.
    if (isUniqueViolation(error)) {
      throw new ConflictError('A person with this email or fiscal code already exists.');
    }
    throw error;
  }

  return toListItem(person);
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
 * Activates or updates one of a person's profiles (story 2.2, AC 1/2).
 * Creates the profile row if it doesn't exist yet; if it does — active or
 * previously deactivated — updates its data and clears `deactivatedAt`
 * (AC 2: reactivating, e.g. the student→pilot transition, is just an
 * upsert). `Person.id` never changes across this. Write access:
 * `people.manage`. Allowed on an archived person (Dev Notes, consistent with
 * review 2.1 F3: editing an archived person is by-design).
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
    const profile = await prisma.pilotProfile.upsert({
      where: { personId },
      create: { personId, licenseNumber: input.licenseNumber, licenseType: input.licenseType },
      update: { licenseNumber: input.licenseNumber, licenseType: input.licenseType, deactivatedAt: null },
      select: { licenseNumber: true, licenseType: true, deactivatedAt: true },
    });
    return profile;
  }

  if (type === 'student') {
    const input = data as StudentProfileInput;
    const courseStartDate = new Date(input.courseStartDate);
    const profile = await prisma.studentProfile.upsert({
      where: { personId },
      create: { personId, courseStartDate },
      update: { courseStartDate, deactivatedAt: null },
      select: { courseStartDate: true, deactivatedAt: true },
    });
    return { courseStartDate: toDateOnlyString(profile.courseStartDate), deactivatedAt: profile.deactivatedAt };
  }

  const input = data as InstructorProfileInput;
  const profile = await prisma.instructorProfile.upsert({
    where: { personId },
    create: { personId, ratings: input.ratings },
    update: { ratings: input.ratings, deactivatedAt: null },
    select: { ratings: true, deactivatedAt: true },
  });
  return profile;
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
