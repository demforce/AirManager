import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { updateUserSchema } from '@/lib/schemas/users';
import { getSessionActor } from '@/server/auth/session';
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from '@/server/services/errors';
import { getUser, updateUser } from '@/server/services/users.service';

type RouteParams = { params: Promise<{ id: string }> };

// See `/api/v1/users/route.ts` for why this mapping is duplicated per route
// (story 1.3 review F2 — the shared helper arrives in story 1.5).
function statusForDomainError(error: DomainError): number {
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ValidationError) return 422;
  return 409;
}

function unauthenticatedResponse() {
  return NextResponse.json(
    { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } },
    { status: 401 },
  );
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const actor = await getSessionActor();
  if (!actor) {
    return unauthenticatedResponse();
  }

  const { id } = await params;

  try {
    const user = await getUser(actor, id);
    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: statusForDomainError(error) });
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const actor = await getSessionActor();
  if (!actor) {
    return unauthenticatedResponse();
  }

  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input.', details: z.flattenError(parsed.error) } },
      { status: 422 },
    );
  }

  try {
    const user = await updateUser(actor, id, parsed.data);
    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: statusForDomainError(error) });
    }
    throw error;
  }
}
