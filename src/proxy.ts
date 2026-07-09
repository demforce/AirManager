import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { authEdge } from './server/auth/auth-edge';

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
 * `authEdge` (from `auth-edge.ts`, no providers) decorates the request with
 * `.auth` by decoding the JWT session cookie — no database or
 * `@node-rs/argon2` call happens in this Edge-runtime function.
 */
export default authEdge((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith(AUTH_API_PREFIX)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/v1')) {
    if (PUBLIC_API_PATHS.has(pathname)) {
      return NextResponse.next();
    }
    if (!req.auth?.user) {
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

  if (!PUBLIC_WEB_PATHS.has(restPath) && !req.auth?.user) {
    const loginUrl = new URL(`/${locale}/login`, req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(req);
});

export const config = {
  // First pattern: every path except Next.js internals and files with an
  // extension. Second pattern: ALL of /api unconditionally — the dot
  // exclusion must never exempt an API route from the 401 gate (a path like
  // /api/v1/exports/report.xlsx contains a dot). Auth.js's own /api/auth/*
  // is passed through above.
  matcher: ['/((?!_next|_vercel|.*\\..*).*)', '/api/:path*'],
};
