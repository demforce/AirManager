import type { Role } from '@/generated/prisma/client';
import { auth } from './auth';

/** The authenticated principal, as carried by the JWT (AD-10). */
export type SessionActor = {
  userId: string;
  roles: Role[];
  personId: string | null;
  email: string | null;
};

/**
 * Reads the current server-side session and returns the actor future
 * stories will pass to `authorize(actor, permission, resource?)` (AD-5,
 * story 1.3). Returns `null` when there is no session — callers decide
 * whether that means "render the public view" or "redirect to login".
 */
export async function getSessionActor(): Promise<SessionActor | null> {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  return {
    userId: session.user.userId,
    roles: session.user.roles,
    personId: session.user.personId,
    email: session.user.email ?? null,
  };
}
