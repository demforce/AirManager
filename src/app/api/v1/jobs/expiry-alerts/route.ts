import { NextResponse, type NextRequest } from 'next/server';
import { errorEnvelope, internalErrorResponse } from '@/lib/api/handler';
import { env } from '@/lib/env';
import { verifyJobsBearer } from '@/server/auth/jobs-bearer';
import { runExpiryAlertsJob } from '@/server/services/expiry-alerts.service';

/**
 * `POST /api/v1/jobs/expiry-alerts` (story 6.3, AC 1/2; FR-37; AD-9) —
 * invoked by an EXTERNAL cron, never a browser session.
 *
 * Deliberately NOT built on `apiRoute()` (`src/lib/api/handler.ts`, read
 * before writing this): that helper's only auth modes are `'required'`
 * (looks up the Auth.js session, answers 401 if absent) and `'public'`
 * (skips auth entirely, `actor: null`) — neither lets `handle` itself
 * answer a 401. `unauthenticatedResponse()` is only ever called INTERNALLY
 * by `apiRoute` for a missing session; there is no `DomainError` subclass
 * that maps to 401 either (`domainErrorResponse` only knows 403/404/409/
 * 422, else 500). A bearer check has no session to look up and must be
 * able to answer 401 on its own terms, so this route is a hand-rolled
 * `POST` instead — reusing the exact same AD-8 envelope helpers
 * (`errorEnvelope`/`internalErrorResponse`) as `apiRoute` so the wire shape
 * never diverges from every other route.
 *
 * Order: missing `JOBS_SECRET` (server misconfiguration) is checked FIRST
 * and answers 500 — Contesto: "mai fallback insicuro", so an unconfigured
 * secret must never be treated as "no auth required". Only once a secret
 * IS configured does the bearer comparison run, timing-safe
 * (`verifyJobsBearer`). The received bearer value itself is never logged
 * (Dev Notes: "niente segreti loggati") — only the fact that one was
 * missing/wrong, or that the env var itself is unset.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = env.JOBS_SECRET;
  if (!secret) {
    console.error('POST /api/v1/jobs/expiry-alerts: JOBS_SECRET is not configured.');
    return NextResponse.json(errorEnvelope('INTERNAL_ERROR', 'An unexpected error occurred.'), { status: 500 });
  }

  if (!verifyJobsBearer(request.headers.get('authorization'), secret)) {
    return NextResponse.json(errorEnvelope('UNAUTHENTICATED', 'Authentication required.'), { status: 401 });
  }

  try {
    const result = await runExpiryAlertsJob();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
