import { NextResponse } from 'next/server';

/**
 * Public liveness check — intentionally excluded from the auth gate in
 * `src/proxy.ts` (AC 3). No domain logic, no DB call: a minimal stub is
 * enough for infra health checks; a richer version (DB ping, etc.) is out
 * of scope here.
 */
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
