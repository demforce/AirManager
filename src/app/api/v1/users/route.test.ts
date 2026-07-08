import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionActor } from '@/server/auth/session';

/**
 * Integration test for the real `/api/v1/users` route wired through the
 * shared wrapper (story 1.5, Task 4): exercises the actual `route.ts`
 * module — not a hand-rolled stand-in — with the service layer mocked at
 * its boundary. This is the "errore forzato → 500 envelope" check from the
 * story: forcing a genuine unhandled failure through a live HTTP server
 * would require crashing the database mid-request, which is exactly the
 * kind of flaky, environment-dependent setup this integration test avoids
 * while still exercising the production route + wrapper code end to end.
 */

vi.mock('@/server/auth/session', () => ({
  getSessionActor: vi.fn(),
}));

// Story TD-2: `@/lib/api/handler` (imported by the real `./route` below) now
// statically imports `@/server/db/prisma` for the `idempotency` option —
// unused by this route (no `idempotency` config here), but the real module
// eagerly validates `env.ts`'s `DATABASE_URL`, unset in the unit-test
// process. Mocked out for the same reason every service test mocks it.
vi.mock('@/server/db/prisma', () => ({
  prisma: {},
}));

vi.mock('@/server/services/users.service', () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
}));

const { getSessionActor } = await import('@/server/auth/session');
const { listUsers } = await import('@/server/services/users.service');
const { GET, POST } = await import('./route');

const getSessionActorMock = vi.mocked(getSessionActor);
const listUsersMock = vi.mocked(listUsers);

const ACTOR: SessionActor = { userId: 'user_1', roles: ['ADMIN'], personId: null, email: 'admin@airmanager.local' };

function req(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new Request(url, init));
}

describe('GET/POST /api/v1/users (integration, Story 1.5 Task 4)', () => {
  beforeEach(() => {
    getSessionActorMock.mockReset();
    listUsersMock.mockReset();
  });

  it('POST with an invalid body answers the AD-8 422 envelope', async () => {
    getSessionActorMock.mockResolvedValue(ACTOR);

    const response = await POST(
      req('http://localhost/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({ email: 'not-an-email', roles: [] }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string; details?: unknown } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeDefined();
  });

  describe('an unexpected service failure', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('answers the AD-8 500 INTERNAL_ERROR envelope, with no internal detail leaked to the client', async () => {
      getSessionActorMock.mockResolvedValue(ACTOR);
      listUsersMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

      const response = await GET(req('http://localhost/api/v1/users'));

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
      expect(JSON.stringify(body)).not.toContain('5432');
      // ... but the real detail is still logged server-side.
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
