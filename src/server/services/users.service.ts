import type { Prisma } from '@/generated/prisma/client';
import type { Role } from '@/generated/prisma/enums';
import type { CreateUserInput, UpdateUserInput } from '@/lib/schemas/users';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { enqueueCredential } from './credential-mail.service';
export { resendInvite } from './credential-mail.service';
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

/** The account and its invitation are committed or rolled back together in both creation flows. */
export async function createUserCore(tx: Prisma.TransactionClient, input: CreateUserInput): Promise<SelectedUser> {
  let user;
  try {
    user = await tx.user.create({
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
    if (isUniqueViolation(error)) {
      throw new ConflictError('Email or person already linked to another user.');
    }
    throw error;
  }
  await enqueueCredential(tx, user.id, 'INVITE');
  return user;
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

  // assertPersonAvailable/email check are check-then-write: a concurrent
  // request can win the race and the unique constraint fires here instead
  // (`createUserCore`'s own P2002 catch).
  const user = await prisma.$transaction((tx) => createUserCore(tx, input));

  return toListItem(user);
}

/** Partial update: roles, locale, linked person (incl. unlinking with `null`), active status (AC 2). */
export async function updateUser(actor: Actor, id: string, patch: UpdateUserInput): Promise<UserListItem> {
  authorize(actor, 'users.manage');

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('User not found.');
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

  // Story 16.7 (ops F8, R-16-f): re-linking or unlinking the person is a
  // change of identity, and every "own" check reads `personId` from the
  // session — so it ends that user's sessions, through the same
  // `tokenVersion` bump as a password set (TD-6), in the same write.
  // `applyActiveRecheck` evicts a stale session at its next recheck (≤ 15
  // min). Only on a REAL change: an API client re-sending the current link
  // is not one. Roles and `isActive` do not bump: the recheck already
  // propagates them.
  const personIdChanges = patch.personId !== undefined && patch.personId !== existing.personId;

  let user;
  try {
    user = await prisma.user.update({
      where: { id },
      data: {
        ...(patch.roles !== undefined && { roles: patch.roles }),
        ...(patch.locale !== undefined && { locale: patch.locale }),
        ...(patch.personId !== undefined && { personId: patch.personId }),
        ...(patch.isActive !== undefined && { isActive: patch.isActive }),
        // Invalidate in the same write even if a later update restores eligibility.
        ...((patch.isActive === false || (patch.roles && !patch.roles.includes('ADMIN'))) && {
          adminPasswordVersion: { increment: 1 },
        }),
        ...(personIdChanges && { tokenVersion: { increment: 1 } }),
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
