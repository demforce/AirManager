import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

/**
 * Edge-runtime Auth.js instance (no providers — see auth.config.ts). Used
 * exclusively by `src/proxy.ts` to read the JWT session cookie without
 * pulling `@node-rs/argon2` into the Edge bundle. Decodes the same cookie,
 * signed with the same `AUTH_SECRET`, as the full instance in `auth.ts`.
 */
export const { auth: authEdge } = NextAuth(authConfig);
