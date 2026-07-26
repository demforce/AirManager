// Module augmentation for Auth.js v5: adds the fields story 1.2 puts on the
// JWT (userId, roles, personId) so every consumer (this story's UI, and
// future stories via `getSessionActor()`) gets them typed without casts.
import type { DefaultSession } from 'next-auth';
import type { Role } from '@/generated/prisma/client';

declare module 'next-auth' {
  // Returned by `authorize()` — `id` (standard) doubles as userId; `roles`,
  // `personId` and `tokenVersion` are custom fields carried through to the
  // JWT. `tokenVersion` (story TD-6, F1) is the sign-in-time snapshot of
  // `User.tokenVersion`, stamped into the token by `auth.config.ts`'s `jwt`
  // callback for `applyActiveRecheck` to compare against the DB later.
  interface User {
    roles: Role[];
    personId: string | null;
    tokenVersion: number;
  }

  interface Session {
    user: {
      userId: string;
      roles: Role[];
      personId: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    roles: Role[];
    personId: string | null;
    /** Epoch ms of the last `User.isActive` DB recheck (story 1.4, AC 2). */
    lastActiveCheck: number;
    /**
     * Sign-in-time snapshot of `User.tokenVersion` (story TD-6, F1,
     * CWE-613). `applyActiveRecheck` evicts the session (returns `null`) if
     * this no longer matches the DB — the mechanism `setPasswordWithToken`
     * relies on to end every other live session on a password change.
     */
    tokenVersion: number;
  }
}

// `next-auth/jwt` re-exports `JWT` from `@auth/core/jwt` via `export *`,
// which does NOT participate in interface declaration merging (only the
// module that originally declares the interface does). The callback types
// used internally by `next-auth`'s `NextAuthConfig` reference the
// `@auth/core/jwt` declaration directly, so it must be augmented too —
// otherwise `token.userId` etc. resolve to `unknown` via `JWT`'s
// `Record<string, unknown>` index signature.
declare module '@auth/core/jwt' {
  interface JWT {
    userId: string;
    roles: Role[];
    personId: string | null;
    lastActiveCheck: number;
    tokenVersion: number;
  }
}
