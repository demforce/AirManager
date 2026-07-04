// Module augmentation for Auth.js v5: adds the fields story 1.2 puts on the
// JWT (userId, roles, personId) so every consumer (this story's UI, and
// future stories via `getSessionActor()`) gets them typed without casts.
import type { DefaultSession } from 'next-auth';
import type { Role } from '@/generated/prisma/client';

declare module 'next-auth' {
  // Returned by `authorize()` — `id` (standard) doubles as userId; `roles`
  // and `personId` are custom fields carried through to the JWT.
  interface User {
    roles: Role[];
    personId: string | null;
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
  }
}
