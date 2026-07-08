import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SessionActor } from '@/server/auth/session';

vi.mock('@/server/auth/session', () => ({
  getSessionActor: vi.fn(),
}));

const { getSessionActor } = await import('@/server/auth/session');
const { apiRoute } = await import('./handler');
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } = await import('@/server/services/errors');

const getSessionActorMock = vi.mocked(getSessionActor);

const ACTOR: SessionActor = { userId: 'user_1', roles: ['ADMIN'], personId: null, email: 'admin@airmanager.local' };

function req(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new Request(url, init));
}

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

describe('apiRoute (Story 1.5 — shared API wrapper, AD-8)', () => {
  beforeEach(() => {
    getSessionActorMock.mockReset();
  });

  describe('authentication', () => {
    it('answers the AD-8 401 envelope and never calls `handle` when there is no session (auth: required, the default)', async () => {
      getSessionActorMock.mockResolvedValue(null);
      const handle = vi.fn();

      const GET = apiRoute({ handle });
      const response = await GET(req('http://localhost/api/v1/x'));

      expect(response.status).toBe(401);
      await expect(readJson(response)).resolves.toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
      });
      expect(handle).not.toHaveBeenCalled();
    });

    it('resolves the actor and passes it to `handle` when a session exists', async () => {
      getSessionActorMock.mockResolvedValue(ACTOR);
      const handle = vi.fn().mockResolvedValue({ ok: true });

      const GET = apiRoute({ handle });
      await GET(req('http://localhost/api/v1/x'));

      expect(handle).toHaveBeenCalledWith(expect.objectContaining({ actor: ACTOR }));
    });

    it('never checks the session for `auth: "public"` routes — `actor` is null', async () => {
      const handle = vi.fn().mockResolvedValue({ ok: true });

      const POST = apiRoute({ auth: 'public', handle });
      await POST(req('http://localhost/api/v1/x', { method: 'POST' }));

      expect(getSessionActorMock).not.toHaveBeenCalled();
      expect(handle).toHaveBeenCalledWith(expect.objectContaining({ actor: null }));
    });
  });

  describe('query validation', () => {
    beforeEach(() => {
      getSessionActorMock.mockResolvedValue(ACTOR);
    });

    it('answers 422 with Zod details on an invalid query and never calls `handle`', async () => {
      const handle = vi.fn();
      const GET = apiRoute({
        querySchema: z.object({ page: z.coerce.number().int().min(1) }),
        handle,
      });

      const response = await GET(req('http://localhost/api/v1/x?page=0'));

      expect(response.status).toBe(422);
      const body = (await readJson(response)) as { error: { code: string; details?: unknown } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toBeDefined();
      expect(handle).not.toHaveBeenCalled();
    });

    it('parses and coerces a valid query, passing it through to `handle`', async () => {
      const handle = vi.fn().mockResolvedValue({ ok: true });
      const GET = apiRoute({
        querySchema: z.object({ page: z.coerce.number().int().min(1) }),
        handle,
      });

      await GET(req('http://localhost/api/v1/x?page=3'));

      expect(handle).toHaveBeenCalledWith(expect.objectContaining({ query: { page: 3 } }));
    });
  });

  describe('body validation', () => {
    beforeEach(() => {
      getSessionActorMock.mockResolvedValue(ACTOR);
    });

    it('answers 422 with Zod details on an invalid body and never calls `handle`', async () => {
      const handle = vi.fn();
      const POST = apiRoute({
        bodySchema: z.object({ email: z.email() }),
        handle,
      });

      const response = await POST(
        req('http://localhost/api/v1/x', {
          method: 'POST',
          body: JSON.stringify({ email: 'not-an-email' }),
          headers: { 'content-type': 'application/json' },
        }),
      );

      expect(response.status).toBe(422);
      const body = (await readJson(response)) as { error: { code: string; details?: unknown } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toBeDefined();
      expect(handle).not.toHaveBeenCalled();
    });

    it('treats a non-JSON body as a 422 instead of throwing', async () => {
      const handle = vi.fn();
      const POST = apiRoute({ bodySchema: z.object({ email: z.email() }), handle });

      const response = await POST(req('http://localhost/api/v1/x', { method: 'POST', body: 'not json' }));

      expect(response.status).toBe(422);
      expect(handle).not.toHaveBeenCalled();
    });
  });

  describe('params', () => {
    it('awaits and passes the dynamic route params through to `handle`', async () => {
      getSessionActorMock.mockResolvedValue(ACTOR);
      const handle = vi.fn().mockResolvedValue({ ok: true });

      const GET = apiRoute<undefined, undefined, { id: string }>({ handle });
      await GET(req('http://localhost/api/v1/x/abc'), { params: Promise.resolve({ id: 'abc' }) });

      expect(handle).toHaveBeenCalledWith(expect.objectContaining({ params: { id: 'abc' } }));
    });
  });

  describe('success response', () => {
    it('serializes the `handle` result as JSON with the default 200 status', async () => {
      getSessionActorMock.mockResolvedValue(ACTOR);
      const GET = apiRoute({ handle: async () => ({ hello: 'world' }) });

      const response = await GET(req('http://localhost/api/v1/x'));

      expect(response.status).toBe(200);
      await expect(readJson(response)).resolves.toEqual({ hello: 'world' });
    });

    it('honors a configured `successStatus` (e.g. 201 for a create endpoint)', async () => {
      getSessionActorMock.mockResolvedValue(ACTOR);
      const POST = apiRoute({ successStatus: 201, handle: async () => ({ id: 'new_1' }) });

      const response = await POST(req('http://localhost/api/v1/x', { method: 'POST' }));

      expect(response.status).toBe(201);
    });
  });

  describe('DomainError mapping (AD-8)', () => {
    beforeEach(() => {
      getSessionActorMock.mockResolvedValue(ACTOR);
    });

    it.each([
      [new ForbiddenError('nope'), 403, 'FORBIDDEN'],
      [new NotFoundError('missing'), 404, 'NOT_FOUND'],
      [new ConflictError('conflict'), 409, 'CONFLICT'],
    ] as const)('maps %o to %i %s', async (error, expectedStatus, expectedCode) => {
      const GET = apiRoute({
        handle: async () => {
          throw error;
        },
      });

      const response = await GET(req('http://localhost/api/v1/x'));

      expect(response.status).toBe(expectedStatus);
      const body = (await readJson(response)) as { error: { code: string; message: string } };
      expect(body.error.code).toBe(expectedCode);
      expect(body.error.message).toBe(error.message);
    });

    it('maps a domain-level ValidationError to 422 with its `details`', async () => {
      const GET = apiRoute({
        handle: async () => {
          throw new ValidationError('bad domain input', { field: 'roles' });
        },
      });

      const response = await GET(req('http://localhost/api/v1/x'));

      expect(response.status).toBe(422);
      const body = (await readJson(response)) as { error: { code: string; details?: unknown } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual({ field: 'roles' });
    });

    it('maps a domain-level ValidationError with a custom code to 422 with THAT code (story 5.1, AC 3)', async () => {
      const GET = apiRoute({
        handle: async () => {
          throw new ValidationError('hour meter end must be after start', undefined, 'HOUR_METER_INVALID');
        },
      });

      const response = await GET(req('http://localhost/api/v1/x'));

      expect(response.status).toBe(422);
      const body = (await readJson(response)) as { error: { code: string } };
      expect(body.error.code).toBe('HOUR_METER_INVALID');
    });
  });

  describe('unexpected errors (AD-8 / story 1.3 review F2)', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      getSessionActorMock.mockResolvedValue(ACTOR);
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('maps a generic thrown Error to 500 INTERNAL_ERROR without leaking its message', async () => {
      const GET = apiRoute({
        handle: async () => {
          throw new Error('some internal secret detail (e.g. a SQL error)');
        },
      });

      const response = await GET(req('http://localhost/api/v1/x'));

      expect(response.status).toBe(500);
      const body = (await readJson(response)) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).not.toContain('secret');
      expect(JSON.stringify(body)).not.toContain('secret');
    });

    it('logs the real error server-side', async () => {
      const boom = new Error('boom');
      const GET = apiRoute({
        handle: async () => {
          throw boom;
        },
      });

      await GET(req('http://localhost/api/v1/x'));

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(String), boom);
    });

    it('also maps a thrown non-Error value (e.g. a string) to the same safe 500 envelope', async () => {
      const GET = apiRoute({
        handle: async () => {
          throw 'not an Error instance';
        },
      });

      const response = await GET(req('http://localhost/api/v1/x'));

      expect(response.status).toBe(500);
      const body = (await readJson(response)) as { error: { code: string } };
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
