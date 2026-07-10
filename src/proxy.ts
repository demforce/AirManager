import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { env } from '@/lib/env';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

// Web paths (locale prefix already stripped) that never require a session.
// Anything not listed here is protected by default (AC 3) — add future
// public pages explicitly. `/ppr` (story 8.1, FR-22) is the first
// "biglietto da visita" public page reachable by an external pilot with no
// AirManager account at all — it never redirects to `/login`.
const PUBLIC_WEB_PATHS = new Set(['', '/login', '/set-password', '/forgot-password', '/ppr']);

// Auth.js's own endpoints (sign-in, callback, csrf, session, sign-out) must
// stay reachable without a session — they are how a session gets created.
const AUTH_API_PREFIX = '/api/auth';

// `/api/v1/*` endpoints that stay public. AD-8's 401 envelope applies to
// every other `/api/v1/*` route. The two auth-token endpoints (story 1.4)
// are necessarily public: they are what an invited/locked-out user calls
// *before* they have a session. `openapi.json` (story 1.5) is public too —
// it exposes only contracts (request/response shapes), never data, and a
// future Flutter client needs to be able to fetch it without a session.
// `jobs/expiry-alerts` (story 6.3, AD-9) is "public" from THIS gate's point
// of view for the same reason: it's called by an EXTERNAL cron that never
// carries a browser session. "Public" here only means "skip the session
// check" — the route itself
// (`src/app/api/v1/jobs/expiry-alerts/route.ts`) still enforces its OWN
// auth, a timing-safe `JOBS_SECRET` bearer check, before doing anything
// (401/500 on its own terms). Any future `/api/v1/jobs/*` route needs the
// same entry here.
// `/api/v1/ppr-requests` (story 8.1, AC 1/2) backs the public `/ppr` form
// above — its own anti-abuse (honeypot + per-IP rate limit,
// `ppr.service.ts`) stands in for the session check this gate would
// otherwise perform, same rationale as the auth-token endpoints.
const PUBLIC_API_PATHS = new Set([
  '/api/v1/health',
  '/api/v1/auth/set-password',
  '/api/v1/auth/forgot-password',
  '/api/v1/openapi.json',
  '/api/v1/jobs/expiry-alerts',
  '/api/v1/ppr-requests',
]);

function unauthenticatedApiResponse(): NextResponse {
  return NextResponse.json(
    { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } },
    { status: 401 },
  );
}

/**
 * Next.js 16 allows a single proxy file (see story 1.1's Review Record), so
 * next-intl's locale middleware and the Auth.js session gate are composed
 * here rather than living in two files.
 *
 * TD-4 root cause: the previous implementation used the `authEdge` wrapper
 * (`NextAuth(authConfig).auth`, formerly `auth-edge.ts`), which internally
 * re-signs the session JWT and PROPAGATES a `Set-Cookie` on every request it
 * lets through (`@auth/core`'s JWT strategy has no `updateAge` throttle —
 * that only applies to database sessions). RSC reads via `auth()` discard
 * this Set-Cookie, but the middleware wrapper does not: every ordinary
 * navigation re-issued the session cookie with a fresh +30-day expiry. That
 * refresh could race and beat the deletion `Set-Cookie` from `signOut()`
 * (`logoutAction`, `src/app/[locale]/dashboard/page.tsx`), leaving a "resurrected"
 * session after logout on `next start` builds (invisible in `next dev`).
 *
 * Fix: read the token with `getToken` (`next-auth/jwt`) instead — pure JWE
 * decryption, no side effects, no Set-Cookie ever leaves this function. This
 * is gate-equivalent to the old wrapper: neither one ran the DB
 * active-user recheck (`applyActiveRecheck`, Node-only, lives in `auth.ts`)
 * — a deactivated user's session still decays via the Node-runtime page
 * reads (`getSessionActor`, `src/server/auth/session.ts`), same as before.
 * Trade-off: with no middleware-side refresh, the session now expires
 * `maxAge` (30 days, Auth.js default) after login rather than sliding on
 * activity — see `auth.config.ts` for the accepted-for-MVP note.
 *
 * `secureCookie` must mirror how the cookie was actually set: the
 * `/api/auth/*` route handler (`auth.ts`'s `handlers`) derives it from the
 * request protocol Next.js resolves for that connection — which folds in
 * `x-forwarded-proto` when the proxy is trusted — and `getToken` here reads
 * the same resolved source (`req.nextUrl.protocol`), so issuer and reader
 * agree on the cookie name/salt (`authjs.session-token` over http,
 * `__Secure-authjs.session-token` over https) both on direct http and
 * behind a uniform TLS-terminating reverse proxy. Verified empirically on
 * `next start` in both topologies (review TD-4; dev Debug Log for http).
 */
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith(AUTH_API_PREFIX)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: env.AUTH_SECRET,
    secureCookie: req.nextUrl.protocol === 'https:',
  });

  if (pathname.startsWith('/api/v1')) {
    if (PUBLIC_API_PATHS.has(pathname)) {
      return NextResponse.next();
    }
    if (!token) {
      return unauthenticatedApiResponse();
    }
    return NextResponse.next();
  }

  const localeMatch = /^\/(it|en)(\/.*)?$/.exec(pathname);
  if (!localeMatch) {
    // No locale prefix yet (e.g. "/", "/dashboard") — let next-intl add one
    // first; the redirected request is re-checked for auth on arrival.
    return intlMiddleware(req);
  }

  const [, locale, rest] = localeMatch;
  const restPath = rest ?? '';

  if (!PUBLIC_WEB_PATHS.has(restPath) && !token) {
    const loginUrl = new URL(`/${locale}/login`, req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(req);
}

export const config = {
  // First pattern: every path except Next.js internals and files with an
  // extension. Second pattern: ALL of /api unconditionally — the dot
  // exclusion must never exempt an API route from the 401 gate (a path like
  // /api/v1/exports/report.xlsx contains a dot). Auth.js's own /api/auth/*
  // is passed through above.
  matcher: ['/((?!_next|_vercel|.*\\..*).*)', '/api/:path*'],
};
