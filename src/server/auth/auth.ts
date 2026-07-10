import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { authorizeCredentials } from './authorize';
import { applyActiveRecheck } from './jwt-active-check';

/**
 * Full Auth.js v5 instance (Node runtime — route handlers, server
 * components, server actions). Adds the Credentials provider on top of the
 * edge-safe `authConfig`.
 *
 * Deviation from the architecture spine's stack table (AD-10 mentions
 * `@auth/prisma-adapter`): the adapter is intentionally **not** installed.
 * With the Credentials provider + JWT session strategy, Auth.js never
 * persists Account/Session/VerificationToken rows — the adapter exists to
 * back OAuth account linking and database sessions, neither of which this
 * app uses. Omitting it avoids three permanently-empty OAuth tables. See
 * the Dev Agent Record for the full reasoning; revisit if a future story
 * adds an OAuth provider or moves to database sessions.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Overrides the edge-safe `jwt` above: same sign-in field assignment,
    // plus the `isActive` DB recheck (AC 2) — Node runtime only, since this
    // instance (unlike `src/proxy.ts`'s `getToken` read) has Prisma available.
    async jwt(params) {
      const token = authConfig.callbacks.jwt(params);
      if (params.user) {
        // Fresh sign-in: authorizeCredentials() already required an active
        // user with a password — nothing to recheck yet.
        return token;
      }
      return applyActiveRecheck(token);
    },
  },
});
