import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { setPasswordSchema } from '@/lib/schemas/auth-tokens';
import { setPasswordWithToken } from '@/server/services/auth-tokens.service';
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from '@/server/services/errors';

/**
 * Public route (`src/proxy.ts` `PUBLIC_API_PATHS`) — used before the caller
 * has a session, by both the invite flow and the password-reset flow (AC
 * 1/3): both end with "consume a single-use token and set a password".
 */
function statusForDomainError(error: DomainError): number {
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ValidationError) return 422;
  return 409;
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = setPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input.', details: z.flattenError(parsed.error) } },
      { status: 422 },
    );
  }

  try {
    await setPasswordWithToken(parsed.data.token, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: statusForDomainError(error) });
    }
    throw error;
  }
}
