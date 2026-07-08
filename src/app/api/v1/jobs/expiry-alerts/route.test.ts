import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration test for the real `/api/v1/jobs/expiry-alerts` route (story
 * 6.3, Task 5) — same shape as `src/app/api/v1/users/route.test.ts`
 * (story 1.5): exercises the actual `route.ts` module, service mocked at
 * its boundary. This route has NO session — `env.JOBS_SECRET` is mocked
 * instead of `getSessionActor`.
 */

vi.mock('@/lib/env', () => ({
  env: { JOBS_SECRET: 'test-jobs-secret' },
}));

// This route never touches a session, but `@/lib/api/handler` (imported for
// the shared `errorEnvelope`/`internalErrorResponse` helpers) statically
// imports `@/server/auth/session`, which in turn pulls in the real Auth.js
// config — mocked out here for the same reason `users/route.test.ts` mocks
// it (that real chain fails to resolve `next/server` under Vitest).
vi.mock('@/server/auth/session', () => ({
  getSessionActor: vi.fn(),
}));

vi.mock('@/server/services/expiry-alerts.service', () => ({
  runExpiryAlertsJob: vi.fn(),
}));

const { env } = await import('@/lib/env');
const { runExpiryAlertsJob } = await import('@/server/services/expiry-alerts.service');
const { POST } = await import('./route');

const runExpiryAlertsJobMock = vi.mocked(runExpiryAlertsJob);

const RESULT = { candidates: 2, alertsCreated: 1, holderEmailsSent: 1, holdersWithoutEmail: 0, digestEmailsSent: 1 };

function req(headers?: Record<string, string>): NextRequest {
  return new NextRequest(new Request('http://localhost/api/v1/jobs/expiry-alerts', { method: 'POST', headers }));
}

describe('POST /api/v1/jobs/expiry-alerts (integration, story 6.3, AD-9)', () => {
  beforeEach(() => {
    runExpiryAlertsJobMock.mockReset();
    (env as { JOBS_SECRET: string | undefined }).JOBS_SECRET = 'test-jobs-secret';
  });

  it('correct bearer -> 200 with the job result', async () => {
    runExpiryAlertsJobMock.mockResolvedValue(RESULT);

    const response = await POST(req({ authorization: 'Bearer test-jobs-secret' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(RESULT);
    expect(runExpiryAlertsJobMock).toHaveBeenCalledTimes(1);
  });

  it('wrong bearer -> 401 AD-8 envelope, job never runs', async () => {
    const response = await POST(req({ authorization: 'Bearer wrong-secret' }));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(runExpiryAlertsJobMock).not.toHaveBeenCalled();
  });

  it('missing bearer -> 401, job never runs', async () => {
    const response = await POST(req());

    expect(response.status).toBe(401);
    expect(runExpiryAlertsJobMock).not.toHaveBeenCalled();
  });

  it('malformed header ("Bearer" with no token) -> 401', async () => {
    const response = await POST(req({ authorization: 'Bearer' }));

    expect(response.status).toBe(401);
  });

  it('JOBS_SECRET not configured -> 500, even with a bearer header present, job never runs', async () => {
    (env as { JOBS_SECRET: string | undefined }).JOBS_SECRET = undefined;

    const response = await POST(req({ authorization: 'Bearer test-jobs-secret' }));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(runExpiryAlertsJobMock).not.toHaveBeenCalled();
  });

  describe('an unexpected service failure', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('answers the AD-8 500 INTERNAL_ERROR envelope, with no internal detail leaked', async () => {
      runExpiryAlertsJobMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

      const response = await POST(req({ authorization: 'Bearer test-jobs-secret' }));

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    });
  });
});
