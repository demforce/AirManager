import { NextResponse, type NextRequest } from 'next/server';
import { getSessionActor } from '@/server/auth/session';
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from '@/server/services/errors';
import { resendInvite } from '@/server/services/users.service';

type RouteParams = { params: Promise<{ id: string }> };

// See `/api/v1/users/route.ts` for why this mapping is duplicated per route.
function statusForDomainError(error: DomainError): number {
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ValidationError) return 422;
  return 409;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } },
      { status: 401 },
    );
  }

  const { id } = await params;

  try {
    await resendInvite(actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: statusForDomainError(error) });
    }
    throw error;
  }
}
