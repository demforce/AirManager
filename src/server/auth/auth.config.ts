import type { NextAuthConfig } from 'next-auth';
import { env } from '@/lib/env';

/**
 * Edge-safe Auth.js v5 config: session strategy, secret and the jwt/session
 * callbacks only — no `providers` here. The Credentials provider (`auth.ts`)
 * pulls in `@node-rs/argon2`, a native Node addon that cannot run in the
 * Edge runtime used by `src/proxy.ts`. Splitting the config this way keeps
 * `src/proxy.ts` (which reads the session with `getToken`, TD-4) free of the
 * Node-only provider, while `auth.ts` (Node runtime: route handlers, server
 * components) spreads this same config and adds the real provider.
 *
 * AD-5 note: the JWT only carries userId/roles/personId for identification.
 * The permission map and `authorize(actor, permission, resource)` live in
 * `rbac.ts`, added in story 1.3 — not anticipated here.
 */
export const authConfig = {
  secret: env.AUTH_SECRET,
  // TD-4 trade-off: no `maxAge` override — default 30 days, absolute from
  // sign-in. Before TD-4, `src/proxy.ts` re-issued the session cookie (with
  // a fresh +30-day expiry) on every navigation, which acted as a de facto
  // sliding expiration; fixing that (middleware no longer emits any
  // Set-Cookie) means the session now always expires 30 days after login
  // regardless of activity. Accepted for the MVP (internal users, re-login
  // is cheap) — revisit only if that trade-off stops being acceptable.
  session: { strategy: 'jwt' as const },
  pages: {
    // Locale-less fallback; the actual redirect target used by src/proxy.ts
    // always includes the current locale (e.g. `/it/login`).
    signIn: '/login',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id ?? token.sub ?? '';
        token.roles = user.roles;
        token.personId = user.personId;
        // Story 1.4, AC 2: stamps when `isActive` was last verified against
        // the DB. The Node instance (`auth.ts`) recheck-and-possibly-expires
        // logic reads this; this edge-safe callback only ever *sets* it at
        // sign-in (no DB access happens here, or in `src/proxy.ts`).
        token.lastActiveCheck = Date.now();
        // Story TD-6, F1 (CWE-613): snapshot of `User.tokenVersion` at
        // sign-in time. `authorizeCredentials` already fetched the user row,
        // so `user.tokenVersion` here is fresh — `applyActiveRecheck`
        // compares it against the DB on every future recheck.
        token.tokenVersion = user.tokenVersion;
      }
      return token;
    },
    session({ session, token }) {
      session.user.userId = token.userId;
      session.user.roles = token.roles;
      session.user.personId = token.personId;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
