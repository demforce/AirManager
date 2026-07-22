import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SessionActor } from '@/server/auth/session';

vi.mock('@/server/auth/session', () => ({
  getSessionActor: vi.fn(),
}));

// Story TD-2: `apiRoute` now talks to `IdempotencyRecord` — mocked the same
// way every service test mocks `@/server/db/prisma` (the real module eagerly
// validates `env.ts`, which has no `DATABASE_URL` in the unit-test process).
vi.mock('@/server/db/prisma', () => ({
  prisma: {
    idempotencyRecord: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const { getSessionActor } = await import('@/server/auth/session');
const { prisma } = await import('@/server/db/prisma');
const { apiRoute, IDEMPOTENCY_KEY_HEADER } = await import('./handler');
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } = await import('@/server/services/errors');

const getSessionActorMock = vi.mocked(getSessionActor);
const idempotencyCreateMock = vi.mocked(prisma.idempotencyRecord.create);
const idempotencyFindUniqueMock = vi.mocked(prisma.idempotencyRecord.findUnique);
const idempotencyUpdateMock = vi.mocked(prisma.idempotencyRecord.update);
const idempotencyDeleteMock = vi.mocked(prisma.idempotencyRecord.delete);

/** Shape-compatible with a Prisma `P2002` unique-constraint violation error. */
function uniqueViolation(): { code: string } {
  return { code: 'P2002' };
}

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
    idempotencyCreateMock.mockReset();
    idempotencyFindUniqueMock.mockReset();
    idempotencyUpdateMock.mockReset();
    idempotencyDeleteMock.mockReset();
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

  describe('Response pass-through (story 10.1, AC 1 — binary xlsx export)', () => {
    it('returns a `Response` built by `handle` untouched, instead of wrapping it in the JSON envelope', async () => {
      getSessionActorMock.mockResolvedValue(ACTOR);
      const binaryResponse = new NextResponse(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      });
      const GET = apiRoute({ handle: async () => binaryResponse });

      const response = await GET(req('http://localhost/api/v1/x'));

      expect(response).toBe(binaryResponse);
      expect(response.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      await expect(response.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3]).buffer);
    });

    it('skips the idempotency-completion write for a `Response` result (pass-through runs before it) — no export route sets `idempotency` today, this only proves the ordering is safe', async () => {
      getSessionActorMock.mockResolvedValue(ACTOR);
      idempotencyCreateMock.mockResolvedValue({ id: 'idem_1' } as never);
      const binaryResponse = new NextResponse(new Uint8Array([9]), { status: 200 });
      const POST = apiRoute({ idempotency: { endpoint: 'irrelevant' }, handle: async () => binaryResponse });

      const response = await POST(
        req('http://localhost/api/v1/x', { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: 'k-1' } }),
      );

      expect(response).toBe(binaryResponse);
      expect(idempotencyUpdateMock).not.toHaveBeenCalled();
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

  describe('idempotency (story TD-2, AC 1-4)', () => {
    beforeEach(() => {
      getSessionActorMock.mockResolvedValue(ACTOR);
      idempotencyUpdateMock.mockResolvedValue(undefined as never);
      idempotencyDeleteMock.mockResolvedValue(undefined as never);
    });

    describe('construction-time guards (programming errors, thrown before any request)', () => {
      it('throws when combined with auth: "public" (no userId to key the record on)', () => {
        expect(() =>
          apiRoute({
            auth: 'public',
            idempotency: { endpoint: 'x' },
            handle: async () => ({ ok: true }),
          }),
        ).toThrow(/idempotency/i);
      });

      it('throws when combined with successStatus: 204 (no body to replay)', () => {
        expect(() =>
          apiRoute({
            successStatus: 204,
            idempotency: { endpoint: 'x' },
            handle: async () => undefined,
          }),
        ).toThrow(/idempotency/i);
      });
    });

    it('is a complete pass-through when `idempotency` is not configured, even if the header is sent (AC 3, "ignored on an unconfigured route")', async () => {
      const handle = vi.fn().mockResolvedValue({ hello: 'world' });
      const POST = apiRoute({ handle });

      const response = await POST(req('http://localhost/api/v1/x', { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: 'k-1' } }));

      expect(response.status).toBe(200);
      expect(idempotencyCreateMock).not.toHaveBeenCalled();
      expect(handle).toHaveBeenCalledTimes(1);
    });

    it('is a complete pass-through when `idempotency` IS configured but no header is sent (AC 3, byte-identical to no header)', async () => {
      const handle = vi.fn().mockResolvedValue({ hello: 'world' });
      const POST = apiRoute({ idempotency: { endpoint: 'x' }, handle });

      const response = await POST(req('http://localhost/api/v1/x', { method: 'POST' }));

      expect(response.status).toBe(200);
      await expect(readJson(response)).resolves.toEqual({ hello: 'world' });
      expect(idempotencyCreateMock).not.toHaveBeenCalled();
      expect(idempotencyFindUniqueMock).not.toHaveBeenCalled();
      expect(handle).toHaveBeenCalledTimes(1);
    });

    it('answers 422 VALIDATION_ERROR without calling `handle` when the header is present but out of the 1-200 char range', async () => {
      const handle = vi.fn();
      const POST = apiRoute({ idempotency: { endpoint: 'x' }, handle });

      const response = await POST(
        req('http://localhost/api/v1/x', { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: 'a'.repeat(201) } }),
      );

      expect(response.status).toBe(422);
      const body = (await readJson(response)) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(handle).not.toHaveBeenCalled();
      expect(idempotencyCreateMock).not.toHaveBeenCalled();
    });

    it('creates a PENDING record, calls `handle` once, then completes the record with the response on success', async () => {
      idempotencyCreateMock.mockResolvedValue({ id: 'idem_1' } as never);
      const handle = vi.fn().mockResolvedValue({ id: 'created_1' });
      const POST = apiRoute({ successStatus: 201, idempotency: { endpoint: 'account-topup' }, handle });

      const response = await POST(
        req('http://localhost/api/v1/x', { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: 'k-1' } }),
      );

      expect(idempotencyCreateMock).toHaveBeenCalledWith({
        data: { userId: ACTOR.userId, endpoint: 'account-topup', key: 'k-1', requestFingerprint: expect.any(String) },
        select: { id: true },
      });
      expect(handle).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(201);
      expect(response.headers.get('Idempotency-Replayed')).toBeNull();
      await expect(readJson(response)).resolves.toEqual({ id: 'created_1' });
      expect(idempotencyUpdateMock).toHaveBeenCalledWith({
        where: { id: 'idem_1' },
        data: expect.objectContaining({ responseStatus: 201, responseBody: { id: 'created_1' } }),
      });
    });

    it('replays the exact stored response (same status/body) with `Idempotency-Replayed: true` when the record already completed (AC 1)', async () => {
      idempotencyCreateMock.mockRejectedValue(uniqueViolation());
      idempotencyFindUniqueMock.mockResolvedValue({
        id: 'idem_1',
        // No stored fingerprint (a row predating the M1 column) — must not
        // be treated as a mismatch, see the "request fingerprint" describe
        // block below for the dedicated mismatch/match coverage.
        requestFingerprint: null,
        responseStatus: 201,
        responseBody: { id: 'created_1' },
      } as never);
      const handle = vi.fn();
      const POST = apiRoute({ successStatus: 201, idempotency: { endpoint: 'account-topup' }, handle });

      const response = await POST(
        req('http://localhost/api/v1/x', { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: 'k-1' } }),
      );

      expect(response.status).toBe(201);
      expect(response.headers.get('Idempotency-Replayed')).toBe('true');
      await expect(readJson(response)).resolves.toEqual({ id: 'created_1' });
      expect(handle).not.toHaveBeenCalled();
      expect(idempotencyUpdateMock).not.toHaveBeenCalled();
    });

    it('answers 409 IDEMPOTENCY_IN_PROGRESS without calling `handle` when the conflicting record is still PENDING (AC 2)', async () => {
      idempotencyCreateMock.mockRejectedValue(uniqueViolation());
      idempotencyFindUniqueMock.mockResolvedValue({
        id: 'idem_1',
        responseStatus: null,
        responseBody: null,
      } as never);
      const handle = vi.fn();
      const POST = apiRoute({ idempotency: { endpoint: 'account-topup' }, handle });

      const response = await POST(
        req('http://localhost/api/v1/x', { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: 'k-1' } }),
      );

      expect(response.status).toBe(409);
      const body = (await readJson(response)) as { error: { code: string } };
      expect(body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
      expect(handle).not.toHaveBeenCalled();
    });

    it('answers 409 IDEMPOTENCY_IN_PROGRESS (never proceeds) on the extremely rare race where the conflicting row vanished before the reread', async () => {
      idempotencyCreateMock.mockRejectedValue(uniqueViolation());
      idempotencyFindUniqueMock.mockResolvedValue(null);
      const handle = vi.fn();
      const POST = apiRoute({ idempotency: { endpoint: 'account-topup' }, handle });

      const response = await POST(
        req('http://localhost/api/v1/x', { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: 'k-1' } }),
      );

      expect(response.status).toBe(409);
      expect(handle).not.toHaveBeenCalled();
    });

    it.each([
      [new ConflictError('conflict'), 409],
      [new ValidationError('bad input'), 422],
    ] as const)('frees (deletes) the PENDING record when `handle` throws %o, so the key is reusable (AC 4)', async (error, expectedStatus) => {
      idempotencyCreateMock.mockResolvedValue({ id: 'idem_1' } as never);
      const handle = vi.fn().mockRejectedValue(error);
      const POST = apiRoute({ idempotency: { endpoint: 'account-topup' }, handle });

      const response = await POST(
        req('http://localhost/api/v1/x', { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: 'k-1' } }),
      );

      expect(response.status).toBe(expectedStatus);
      expect(idempotencyDeleteMock).toHaveBeenCalledWith({ where: { id: 'idem_1' } });
      expect(idempotencyUpdateMock).not.toHaveBeenCalled();
    });

    it('still answers the normal 500 envelope (and frees the key) when `handle` throws an unknown error', async () => {
      idempotencyCreateMock.mockResolvedValue({ id: 'idem_1' } as never);
      const handle = vi.fn().mockRejectedValue(new Error('boom'));
      const POST = apiRoute({ idempotency: { endpoint: 'account-topup' }, handle });

      const response = await POST(
        req('http://localhost/api/v1/x', { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: 'k-1' } }),
      );

      expect(response.status).toBe(500);
      expect(idempotencyDeleteMock).toHaveBeenCalledWith({ where: { id: 'idem_1' } });
    });

    it('never creates/reads an idempotency record for a request that fails Zod body validation (key stays fully available)', async () => {
      const handle = vi.fn();
      const POST = apiRoute({
        bodySchema: z.object({ email: z.email() }),
        idempotency: { endpoint: 'account-topup' },
        handle,
      });

      const response = await POST(
        req('http://localhost/api/v1/x', {
          method: 'POST',
          headers: { 'content-type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: 'k-1' },
          body: JSON.stringify({ email: 'not-an-email' }),
        }),
      );

      expect(response.status).toBe(422);
      expect(handle).not.toHaveBeenCalled();
      expect(idempotencyCreateMock).not.toHaveBeenCalled();
    });

    describe('request fingerprint (finding M1, CWE-840 — a reused key must not replay a DIFFERENT request)', () => {
      const bodySchema = z.object({ amountCents: z.number() });

      it('replays when a retry sends the IDENTICAL body (fingerprint matches)', async () => {
        idempotencyCreateMock.mockResolvedValueOnce({ id: 'idem_1' } as never);
        const handle = vi.fn().mockResolvedValue({ id: 'created_1' });
        const POST = apiRoute({ successStatus: 201, bodySchema, idempotency: { endpoint: 'account-topup' }, handle });
        const body = JSON.stringify({ amountCents: 100 });

        await POST(
          req('http://localhost/api/v1/x', {
            method: 'POST',
            headers: { 'content-type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: 'k-1' },
            body,
          }),
        );
        // Read back the fingerprint `beginIdempotentRequest` just stored —
        // proves round-trip consistency without reimplementing the hash here.
        const storedFingerprint = (idempotencyCreateMock.mock.calls[0]?.[0] as { data: { requestFingerprint: string } }).data
          .requestFingerprint;

        idempotencyCreateMock.mockRejectedValueOnce(uniqueViolation());
        idempotencyFindUniqueMock.mockResolvedValueOnce({
          id: 'idem_1',
          requestFingerprint: storedFingerprint,
          responseStatus: 201,
          responseBody: { id: 'created_1' },
        } as never);

        const response = await POST(
          req('http://localhost/api/v1/x', {
            method: 'POST',
            headers: { 'content-type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: 'k-1' },
            body,
          }),
        );

        expect(response.status).toBe(201);
        expect(response.headers.get('Idempotency-Replayed')).toBe('true');
        await expect(readJson(response)).resolves.toEqual({ id: 'created_1' });
        expect(handle).toHaveBeenCalledTimes(1);
      });

      it('answers 422 IDEMPOTENCY_KEY_MISMATCH (never replays, never calls `handle`) when the same key is reused for a DIFFERENT body', async () => {
        idempotencyCreateMock.mockRejectedValue(uniqueViolation());
        idempotencyFindUniqueMock.mockResolvedValue({
          id: 'idem_1',
          requestFingerprint: 'fingerprint-of-a-completely-different-original-request',
          responseStatus: 201,
          responseBody: { id: 'created_1', amountCents: 100 },
        } as never);
        const handle = vi.fn();
        const POST = apiRoute({ successStatus: 201, bodySchema, idempotency: { endpoint: 'account-topup' }, handle });

        const response = await POST(
          req('http://localhost/api/v1/x', {
            method: 'POST',
            headers: { 'content-type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: 'k-1' },
            body: JSON.stringify({ amountCents: 999 }),
          }),
        );

        expect(response.status).toBe(422);
        const body = (await readJson(response)) as { error: { code: string } };
        expect(body.error.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
        expect(handle).not.toHaveBeenCalled();
        expect(idempotencyUpdateMock).not.toHaveBeenCalled();
      });

      it('still replays (fingerprint unverifiable, not a mismatch) when the stored record predates this column — backfill-safe', async () => {
        idempotencyCreateMock.mockRejectedValue(uniqueViolation());
        idempotencyFindUniqueMock.mockResolvedValue({
          id: 'idem_1',
          requestFingerprint: null,
          responseStatus: 201,
          responseBody: { id: 'created_1' },
        } as never);
        const handle = vi.fn();
        const POST = apiRoute({ successStatus: 201, bodySchema, idempotency: { endpoint: 'account-topup' }, handle });

        const response = await POST(
          req('http://localhost/api/v1/x', {
            method: 'POST',
            headers: { 'content-type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: 'k-1' },
            body: JSON.stringify({ amountCents: 999 }),
          }),
        );

        expect(response.status).toBe(201);
        expect(response.headers.get('Idempotency-Replayed')).toBe('true');
        expect(handle).not.toHaveBeenCalled();
      });
    });

    describe('H3 safety property (post-commit failures must never free an already-committed key)', () => {
      it('a retry with the same key never re-executes the mutation, even when the FIRST attempt degraded (resolved, did not throw) after its own commit', async () => {
        let mutationCount = 0;
        const handle = vi.fn(async () => {
          // Models the H3-fixed services (`recordAdjustment`/`registerFlight`):
          // the money mutation "commits" here, and — thanks to the fix — the
          // function always resolves afterwards, even if some post-commit
          // enrichment read failed and had to degrade.
          mutationCount += 1;
          return { balanceCents: 100, recentMovements: [] as unknown[] };
        });
        const POST = apiRoute({ idempotency: { endpoint: 'account-topup' }, handle });
        const call = () =>
          POST(req('http://localhost/api/v1/x', { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: 'k-1' } }));

        idempotencyCreateMock.mockResolvedValueOnce({ id: 'idem_1' } as never);
        const first = await call();

        expect(mutationCount).toBe(1);
        expect(idempotencyDeleteMock).not.toHaveBeenCalled();

        // Retry with the SAME key: `create` now conflicts (the first attempt's
        // record is COMPLETED, never freed) and replays instead of re-running `handle`.
        idempotencyCreateMock.mockRejectedValueOnce(uniqueViolation());
        idempotencyFindUniqueMock.mockResolvedValueOnce({
          id: 'idem_1',
          requestFingerprint: null,
          responseStatus: 200,
          responseBody: { balanceCents: 100, recentMovements: [] },
        } as never);
        const second = await call();

        expect(mutationCount).toBe(1); // NOT executed a second time
        expect(second.headers.get('Idempotency-Replayed')).toBe('true');
        await expect(readJson(second)).resolves.toEqual(await readJson(first));
      });
    });
  });

  describe('request body size limit (finding M5, CWE-400 — no cap on `request.json()`)', () => {
    beforeEach(() => {
      getSessionActorMock.mockResolvedValue(ACTOR);
    });

    it('rejects an oversized body with 413 PAYLOAD_TOO_LARGE, without ever calling `handle`', async () => {
      const handle = vi.fn();
      const POST = apiRoute({ bodySchema: z.object({ amountCents: z.number() }), handle });
      const oversizedBody = JSON.stringify({ amountCents: 1, padding: 'x'.repeat(100_000) });

      const response = await POST(
        req('http://localhost/api/v1/x', {
          method: 'POST',
          // `undici`'s `Request` does not auto-compute `Content-Length` from
          // a string body in this test environment — set it explicitly,
          // same as any real HTTP client sending a non-streamed body would.
          headers: { 'content-type': 'application/json', 'content-length': String(oversizedBody.length) },
          body: oversizedBody,
        }),
      );

      expect(response.status).toBe(413);
      const body = (await readJson(response)) as { error: { code: string } };
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(handle).not.toHaveBeenCalled();
    });

    it('accepts a body at/under the cap normally', async () => {
      const handle = vi.fn().mockResolvedValue({ ok: true });
      const POST = apiRoute({ bodySchema: z.object({ amountCents: z.number() }), handle });

      const response = await POST(
        req('http://localhost/api/v1/x', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ amountCents: 1 }),
        }),
      );

      expect(response.status).toBe(200);
      expect(handle).toHaveBeenCalledTimes(1);
    });
  });
});
