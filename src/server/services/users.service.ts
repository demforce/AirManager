import type { Prisma } from '@/generated/prisma/client';
import type { Role } from '@/generated/prisma/enums';
import type { CreateUserInput, UpdateUserInput } from '@/lib/schemas/users';
import { authorize, type Actor } from '@/server/auth/rbac';
import { credentialEligible, emailTrialEnabled, verifiedTrialAddress } from '@/server/auth/email-trial-policy';
import { prisma } from '@/server/db/prisma';
import { accountMailboxUncontested, assertContactAvailable, lockMailboxWrites } from './account-mailbox';
import { databaseNow, enqueueCredential, lockMailAccount, revokeAccountCredentials } from './credential-mail.service';
export { resendInvite } from './credential-mail.service';
import { ConflictError, NotFoundError, ValidationError } from './errors';

export type UserListItem = {
  id: string;
  email: string;
  roles: Role[];
  isActive: boolean;
  locale: string;
  /** Whether the user has completed their invite (set a password). Never
   * exposes the hash itself — only used by the UI's "pending invite" badge. */
  passwordSet: boolean;
  emailVerified?: boolean;
  canResendVerificationInvite?: boolean;
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
  emailVerification: { select: { email: true, verifiedAt: true } },
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
  emailVerification?: { email: string; verifiedAt: Date | null } | null;
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
    ...(user.emailVerification && { emailVerified: verifiedTrialAddress(user) }),
    ...(emailTrialEnabled() && { canResendVerificationInvite: credentialEligible(user, 'VERIFY_EMAIL') }),
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
async function assertPersonAvailable(personId: string, excludeUserId?: string, db: Prisma.TransactionClient = prisma): Promise<void> {
  const person = await db.person.findUnique({
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
  const verificationRequired = emailTrialEnabled();
  if (input.verificationInvite && !verificationRequired) throw new ValidationError('Verification invitations are unavailable.');
  if (verificationRequired) {
    await lockMailboxWrites(tx);
    await assertContactAvailable(tx, input.email, input.personId ?? null);
  }
  let user;
  try {
    user = await tx.user.create({
      data: {
        email: input.email,
        roles: input.roles,
        locale: input.locale,
        personId: input.personId ?? null,
        passwordHash: null,
        ...(verificationRequired && { emailVerification: { create: { email: input.email } } }),
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
  await enqueueCredential(tx, user.id, verificationRequired ? 'VERIFY_EMAIL' : 'INVITE');
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

async function hasOtherActiveAdmin(db: Prisma.TransactionClient, id: string, trial: boolean): Promise<boolean> {
  const where = { id: { not: id }, isActive: true, roles: { has: 'ADMIN' as const } };
  if (!trial) return await db.user.count({ where }) > 0;
  const candidates = await db.user.findMany({ where, select: {
    id: true, email: true, isActive: true, roles: true, passwordHash: true, emailVerification: true,
  } });
  for (const user of candidates) {
    if (user.passwordHash && (!user.emailVerification || verifiedTrialAddress(user))) return true;
    if (credentialEligible(user, 'LOGIN_LINK') && await accountMailboxUncontested(db, user.id, user.email)) return true;
  }
  return false;
}

/** Partial update: roles, locale, linked person (incl. unlinking with `null`), active status (AC 2). */
export async function updateUser(actor: Actor, id: string, patch: UpdateUserInput): Promise<UserListItem> {
  authorize(actor, 'users.manage');

  const trial = emailTrialEnabled();
  async function apply(db: Prisma.TransactionClient) {
    if (trial) {
      // Membership, last-admin count and state transitions share this short transaction.
      await lockMailboxWrites(db);
      await lockMailAccount(db, id);
    }
    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('User not found.');
    if (trial && !existing.isActive && patch.isActive === true) {
      throw new ConflictError('Confirmation of the registered mailbox is required to reactivate access.', undefined, 'REACTIVATION_REQUIRED');
    }
    if (patch.personId != null) await assertPersonAvailable(patch.personId, id, db);
    const losesAdmin = existing.isActive && existing.roles.includes('ADMIN') &&
      (patch.isActive === false || (patch.roles !== undefined && !patch.roles.includes('ADMIN')));
    if (losesAdmin && !await hasOtherActiveAdmin(db, id, trial)) {
      throw new ConflictError('Cannot deactivate or demote the last active admin.');
    }
    const personChanges = patch.personId !== undefined && patch.personId !== existing.personId;
    const suspending = trial && existing.isActive && patch.isActive === false;
    // A pending reactivation belongs to the identity and privileges the admin reviewed.
    const newRoles = patch.roles;
    const rolesChange = newRoles && (newRoles.some(role => !existing.roles.includes(role))
      || existing.roles.some(role => !newRoles.includes(role)));
    if (trial && (patch.isActive === false || (!existing.isActive && (personChanges || rolesChange)))) {
      await revokeAccountCredentials(db, id, await databaseNow(db));
    }
    const updated = await db.user.update({
      where: { id },
      data: {
        ...patch,
        ...((patch.isActive === false || (patch.roles && !patch.roles.includes('ADMIN'))) && {
          adminPasswordVersion: { increment: 1 },
        }),
        ...((personChanges || suspending) && { tokenVersion: { increment: 1 } }),
      },
      select: USER_SELECT,
    });
    if (trial && patch.personId !== undefined && updated.emailVerification
      && !await accountMailboxUncontested(db, updated.id, updated.email)) {
      throw new ConflictError('The registered account email belongs to a different record.');
    }
    return updated;
  }
  try {
    return toListItem(trial ? await prisma.$transaction(apply) : await apply(prisma));
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError('Email or person already linked to another user.');
    throw error;
  }
}
