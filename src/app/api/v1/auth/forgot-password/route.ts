import { NextResponse, type NextRequest } from 'next/server';
import { forgotPasswordSchema } from '@/lib/schemas/auth-tokens';
import { requestPasswordReset } from '@/server/services/auth-tokens.service';

/**
 * Public route (AC 3): always responds `200 { ok: true }`, whether or not
 * the email matches an active account — `requestPasswordReset` itself does
 * equivalent work either way and never throws, so there is nothing here
 * that could leak account existence via status code, body, or (server-side)
 * timing. A malformed email still gets a distinct 422 — rejecting an
 * obviously-invalid input shape isn't an enumeration channel.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input.' } },
      { status: 422 },
    );
  }

  await requestPasswordReset(parsed.data.email);
  return NextResponse.json({ ok: true });
}
