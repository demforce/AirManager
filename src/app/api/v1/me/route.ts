import { NextResponse } from 'next/server';
import { getSessionActor } from '@/server/auth/session';
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from '@/server/services/errors';
import { getMe } from '@/server/services/me.service';

/**
 * Thin route (AD-1): validate/authenticate, call the service, present the
 * result. No domain logic here — that lives entirely in `me.service.ts`.
 *
 * `src/proxy.ts` already returns the AD-8 401 envelope for any
 * unauthenticated `/api/v1/*` request before it reaches this handler; the
 * check below is defense in depth (same pattern as the dashboard page),
 * not the primary guard.
 *
 * The `DomainError` → HTTP mapping below is a minimal, local stand-in — the
 * shared envelope helper every route will reuse arrives in story 1.5.
 */
export async function GET() {
  const actor = await getSessionActor();

  if (!actor) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } },
      { status: 401 },
    );
  }

  try {
    const me = await getMe(actor);
    return NextResponse.json(me);
  } catch (error) {
    if (error instanceof DomainError) {
      const status = statusForDomainError(error);
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
    }
    throw error;
  }
}

function statusForDomainError(error: DomainError): number {
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ValidationError) return 422;
  return 409; // the only remaining case in today's hierarchy is ConflictError
}
