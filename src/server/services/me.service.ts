import type { Role } from '@/generated/prisma/client';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { NotFoundError } from './errors';

export type MeResult = {
  userId: string;
  email: string;
  roles: Role[];
  person: {
    id: string;
    firstName: string;
    lastName: string;
    /** Story 9.2 (FR-33): whether this person has an ACTIVE `StudentProfile` — gates the "Il mio diario" home tile (`dashboard/page.tsx`). Not part of the wider scheda persona (`people.service.ts#getPerson`), just the minimal flag the home page needs. */
    hasActiveStudentProfile: boolean;
    /** Story 12.12 (ratifica PO 2026-07-18: la licenza è LIFETIME, non scade): the ACTIVE `PilotProfile`'s `licenseType`, shown as-is by the pilot landing's "Licenza" KPI — `null` when there is no active pilot profile. Same minimal-flag rationale as `hasActiveStudentProfile`. */
    activePilotLicenseType: string | null;
  } | null;
};

/**
 * First real domain service (AD-1/AD-5): returns the current user's own
 * data. Every service — this one included — receives the `Actor` and calls
 * `authorize()` before touching data; `self.read` is granted to every role
 * (see `rbac.ts`), so this never actually rejects a logged-in user, but the
 * call is here so the pattern is established from the very first service.
 */
export async function getMe(actor: Actor): Promise<MeResult> {
  authorize(actor, 'self.read');

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: {
      id: true,
      email: true,
      roles: true,
      person: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          studentProfile: { select: { deactivatedAt: true } },
          pilotProfile: { select: { licenseType: true, deactivatedAt: true } },
        },
      },
    },
  });

  if (!user) {
    // The session referenced a user id that no longer exists (e.g. deleted
    // between token issuance and this request) — treat it as "not found",
    // not as a crash.
    throw new NotFoundError('User not found.');
  }

  return {
    userId: user.id,
    email: user.email,
    roles: user.roles,
    person: user.person
      ? {
          id: user.person.id,
          firstName: user.person.firstName,
          lastName: user.person.lastName,
          hasActiveStudentProfile: user.person.studentProfile !== null && user.person.studentProfile.deactivatedAt === null,
          activePilotLicenseType:
            user.person.pilotProfile !== null && user.person.pilotProfile.deactivatedAt === null ? user.person.pilotProfile.licenseType : null,
        }
      : null,
  };
}
