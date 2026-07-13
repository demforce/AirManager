import type { Role } from '@/generated/prisma/enums';
import { paginate, paginationOffset, type PaginatedResult, type PaginationQuery } from '@/lib/api/pagination';
import type { CreateUserInput, UpdateUserInput } from '@/lib/schemas/users';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { sendInviteEmail } from './auth-tokens.service';
import { ConflictError, NotFoundError } from './errors';

export type UserListItem = {
  id: string;
  email: string;
  roles: Role[];
  isActive: boolean;
  locale: string;
  /** Whether the user has completed their invite (set a password). Never
   * exposes the hash itself — only used by the UI's "pending invite" badge. */
  passwordSet: boolean;
  person: { id: string; firstName: string; lastName: string } | null;
  createdAt: Date;
};

/** AD-8 paginated shape, via the shared helper (story 1.5). */
export type UserListResult = PaginatedResult<UserListItem>;

const USER_SELECT = {
  id: true,
  email: true,
  roles: true,
  isActive: true,
  locale: true,
  passwordHash: true,
  person: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
} as const;

type SelectedUser = {
  id: string;
  email: string;
  roles: Role[];
  isActive: boolean;
  locale: string;
  passwordHash: string | null;
  person: { id: string; firstName: string; lastName: string } | null;
  createdAt: Date;
};

function toListItem(user: SelectedUser): UserListItem {
  return {
    id: user.id,
    email: user.email,
    roles: user.roles,
    isActive: user.isActive,
    locale: user.locale,
    passwordSet: user.passwordHash !== null,
    person: user.person,
    createdAt: user.createdAt,
  };
}

function emailLocale(locale: string): 'it' | 'en' {
  return locale === 'en' ? 'en' : 'it';
}

/** List users, paginated (AD-8: `{ items, total, page, pageSize }`). Admin-only (`users.manage`). */
export async function listUsers(actor: Actor, query: PaginationQuery): Promise<UserListResult> {
  authorize(actor, 'users.manage');

  // Interactive transaction (story TD-1, AC 3) — see
  // `people.service.ts#listPeople`'s doc-comment for the batch-vs-interactive
  // `pg` DeprecationWarning rationale.
  const [items, total] = await prisma.$transaction(async (tx) => {
    const items = await tx.user.findMany({
      select: USER_SELECT,
      // Newest first: keeps freshly invited users on page 1 for the admin.
      orderBy: { createdAt: 'desc' },
      ...paginationOffset(query),
    });
    const total = await tx.user.count();
    return [items, total] as const;
  });

  return paginate(items.map(toListItem), total, query);
}

export async function getUser(actor: Actor, id: string): Promise<UserListItem> {
  authorize(actor, 'users.manage');

  const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!user) {
    throw new NotFoundError('User not found.');
  }
  return toListItem(user);
}

/** Prisma unique-constraint violation (e.g. concurrent link to the same person). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

/** Throws if `personId` doesn't exist, or is already linked to a *different* user. */
async function assertPersonAvailable(personId: string, excludeUserId?: string): Promise<void> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, user: { select: { id: true } } },
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }
  if (person.user && person.user.id !== excludeUserId) {
    throw new ConflictError('This person is already linked to another user.');
  }
}

/**
 * Creates an invited user (AC 1): no password until the invite link is
 * followed (`passwordHash: null`), roles/locale/person set up-front. Sends
 * the invite email; an SMTP failure does not fail the creation itself — the
 * account exists regardless, and an admin can retry via `resendInvite`.
 */
export async function createUser(actor: Actor, input: CreateUserInput): Promise<UserListItem> {
  authorize(actor, 'users.manage');

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError('A user with this email already exists.');
  }

  if (input.personId) {
    await assertPersonAvailable(input.personId);
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email: input.email,
        roles: input.roles,
        locale: input.locale,
        personId: input.personId ?? null,
        passwordHash: null,
        isActive: true,
      },
      select: USER_SELECT,
    });
  } catch (error) {
    // assertPersonAvailable/email check are check-then-write: a concurrent
    // request can win the race and the unique constraint fires here instead.
    if (isUniqueViolation(error)) {
      throw new ConflictError('Email or person already linked to another user.');
    }
    throw error;
  }

  try {
    await sendInviteEmail(user.id, user.email, emailLocale(user.locale));
  } catch (error) {
    console.error('createUser: failed to send invite email', error);
  }

  return toListItem(user);
}

/** Prisma unique-constraint violation on `email` specifically vs. any other race — same shape as `createUser`'s check. */
async function assertEmailAvailable(email: string, excludeUserId: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== excludeUserId) {
    throw new ConflictError('A user with this email already exists.');
  }
}

/**
 * Partial update: email (story TD-7, AC 4/5 — the unified person+access
 * form propagates the anagrafica email here), roles, locale, linked person
 * (incl. unlinking with `null`), active status (AC 2).
 */
export async function updateUser(actor: Actor, id: string, patch: UpdateUserInput): Promise<UserListItem> {
  authorize(actor, 'users.manage');

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('User not found.');
  }

  if (patch.email !== undefined) {
    await assertEmailAvailable(patch.email, id);
  }

  if (patch.personId !== undefined && patch.personId !== null) {
    await assertPersonAvailable(patch.personId, id);
  }

  // Last-admin protection: user management must never lock itself out.
  // Deactivating (or de-admining) the last active ADMIN would leave nobody
  // able to manage users (FR-3), with no recovery path via UI/API.
  const losesAdmin =
    existing.isActive &&
    existing.roles.includes('ADMIN') &&
    (patch.isActive === false || (patch.roles !== undefined && !patch.roles.includes('ADMIN')));
  if (losesAdmin) {
    const otherActiveAdmins = await prisma.user.count({
      where: { id: { not: id }, isActive: true, roles: { has: 'ADMIN' } },
    });
    if (otherActiveAdmins === 0) {
      throw new ConflictError('Cannot deactivate or demote the last active admin.');
    }
  }

  let user;
  try {
    user = await prisma.user.update({
      where: { id },
      data: {
        ...(patch.email !== undefined && { email: patch.email }),
        ...(patch.roles !== undefined && { roles: patch.roles }),
        ...(patch.locale !== undefined && { locale: patch.locale }),
        ...(patch.personId !== undefined && { personId: patch.personId }),
        ...(patch.isActive !== undefined && { isActive: patch.isActive }),
      },
      select: USER_SELECT,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('Email or person already linked to another user.');
    }
    throw error;
  }

  return toListItem(user);
}

/** Re-sends the invite email for a user who has not yet set a password. */
export async function resendInvite(actor: Actor, id: string): Promise<void> {
  authorize(actor, 'users.manage');

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundError('User not found.');
  }
  if (user.passwordHash !== null) {
    throw new ConflictError('User already set a password; there is no pending invite to resend.');
  }

  await sendInviteEmail(user.id, user.email, emailLocale(user.locale));
}

export type AvailablePerson = { id: string; firstName: string; lastName: string };

/**
 * Persons selectable for linking to a user (story Dev Notes: "qui solo
 * select di Person esistenti per il collegamento" — full People CRUD is
 * epic 2). Available = not linked to any user yet, or already linked to the
 * user currently being edited (so its own selection still shows up).
 */
export async function listAvailablePersons(
  actor: Actor,
  options?: { excludeLinkedToUserId?: string },
): Promise<AvailablePerson[]> {
  authorize(actor, 'users.manage');

  const persons = await prisma.person.findMany({
    where: {
      OR: [
        { user: null },
        ...(options?.excludeLinkedToUserId ? [{ user: { id: options.excludeLinkedToUserId } }] : []),
      ],
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  return persons;
}
