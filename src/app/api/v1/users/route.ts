import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createUserSchema, listUsersQuerySchema } from '@/lib/schemas/users';
import { getSessionActor } from '@/server/auth/session';
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from '@/server/services/errors';
import { createUser, listUsers } from '@/server/services/users.service';

/**
 * Thin routes (AD-1): validate, call the service, present the result. All
 * authorization lives in `users.service.ts` (AD-5) — the `getSessionActor()`
 * check below is defense in depth, same pattern as `/api/v1/me`.
 *
 * The `DomainError` → HTTP mapping is a local, minimal stand-in duplicated
 * per route, matching the precedent set by `/api/v1/me` and story 1.3's
 * review (F2): the shared envelope helper every route will reuse arrives in
 * story 1.5.
 */
function statusForDomainError(error: DomainError): number {
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ValidationError) return 422;
  return 409; // the only remaining case in today's hierarchy is ConflictError
}

function unauthenticatedResponse() {
  return NextResponse.json(
    { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } },
    { status: 401 },
  );
}

function validationErrorResponse(error: z.ZodError) {
  return NextResponse.json(
    { error: { code: 'VALIDATION_ERROR', message: 'Invalid input.', details: z.flattenError(error) } },
    { status: 422 },
  );
}

export async function GET(request: NextRequest) {
  const actor = await getSessionActor();
  if (!actor) {
    return unauthenticatedResponse();
  }

  const query = listUsersQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return validationErrorResponse(query.error);
  }

  try {
    const result = await listUsers(actor, query.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: statusForDomainError(error) });
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const actor = await getSessionActor();
  if (!actor) {
    return unauthenticatedResponse();
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  try {
    const user = await createUser(actor, parsed.data);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: statusForDomainError(error) });
    }
    throw error;
  }
}
