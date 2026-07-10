import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { getSessionActor, type SessionActor } from '@/server/auth/session';
import { prisma } from '@/server/db/prisma';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from '@/server/services/errors';

/**
 * Shared API infrastructure (story 1.5, AD-8): every `/api/v1/*` route
 * builds its handler with {@link apiRoute} instead of hand-rolling
 * validation + `DomainError` mapping. This is what closes story 1.3's
 * review deferral F2 (non-`DomainError` failures used to fall through to
 * Next's default 500, without the AD-8 envelope) and removes the
 * per-route `statusForDomainError`/`unauthenticatedResponse`/
 * `validationErrorResponse` duplication introduced (deliberately, per
 * those stories' Dev Notes) in 1.3/1.4.
 */

/** AD-8 error envelope: `{ error: { code, message, details? } }`. */
export type ErrorEnvelope = {
  error: { code: string; message: string; details?: unknown };
};

export function errorEnvelope(code: string, message: string, details?: unknown): ErrorEnvelope {
  return details === undefined ? { error: { code, message } } : { error: { code, message, details } };
}

/** `DomainError` subclass → HTTP status (Consistency Conventions: "mappata una sola volta ... nel layer API"). */
function statusForDomainError(error: DomainError): number {
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ValidationError) return 422;
  if (error instanceof ConflictError) return 409;
  if (error instanceof RateLimitError) return 429;
  // Exhaustive for today's hierarchy. A future `DomainError` subclass added
  // without updating this mapping falls through to a safe 500 rather than
  // silently guessing a status code.
  return 500;
}

export function unauthenticatedResponse(): NextResponse {
  return NextResponse.json(errorEnvelope('UNAUTHENTICATED', 'Authentication required.'), { status: 401 });
}

export function validationErrorResponse(error: z.ZodError): NextResponse {
  return NextResponse.json(errorEnvelope('VALIDATION_ERROR', 'Invalid input.', z.flattenError(error)), {
    status: 422,
  });
}

export function domainErrorResponse(error: DomainError): NextResponse {
  const status = statusForDomainError(error);
  if (status === 500) {
    // A DomainError subclass with no explicit HTTP mapping is a programming
    // gap, not a user-facing condition: emit the generic AD-8 500 envelope
    // instead of leaking a domain code at the wrong status.
    return internalErrorResponse(error);
  }
  const details = error instanceof ValidationError ? error.details : undefined;
  return NextResponse.json(errorEnvelope(error.code, error.message, details), { status });
}

/**
 * Any error that is not one of our own `DomainError`s: a bug, a Prisma
 * error the service forgot to translate, a network failure, etc. AD-8 /
 * story 1.3 review F2 requires the client never sees its message or stack —
 * only a generic envelope — while the real detail is logged server-side.
 */
export function internalErrorResponse(error: unknown): NextResponse {
  console.error('Unhandled /api/v1 error', error);
  return NextResponse.json(errorEnvelope('INTERNAL_ERROR', 'An unexpected error occurred.'), { status: 500 });
}

type EmptyParams = Record<string, never>;
type AuthMode = 'required' | 'public';

/**
 * Request-level idempotency (story TD-2, closes 3.1 review deferral O2): an
 * opt-in `Idempotency-Key` request header lets a network retry of a
 * money-mutating POST replay the FIRST response instead of re-executing the
 * mutation. See `IdempotencyRecord`'s doc-comment in `schema.prisma` for the
 * full design (per-user uniqueness, PENDING→completed/deleted lifecycle,
 * the documented crash-window trade-off, why there is no cleanup job).
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
const IDEMPOTENCY_REPLAYED_HEADER = 'Idempotency-Replayed';

export interface IdempotencyConfig {
  /**
   * Stable identifier for this route in the `IdempotencyRecord` unique key
   * (`[userId, endpoint, key]`) — NOT the URL path (which can change): a
   * short, hand-picked, never-reused name (e.g. `'account-topup'`).
   */
  endpoint: string;
}

type IdempotencyGate =
  | { outcome: 'proceed'; recordId: string }
  | { outcome: 'short-circuit'; response: NextResponse };

/** Local predicate for a Prisma unique-constraint violation — same per-module convention as every service's `isUniqueViolation`. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/**
 * Inserts the PENDING `IdempotencyRecord` (AC 1/2). On a unique-constraint
 * conflict (another attempt already exists for this exact
 * `[userId, endpoint, key]`), rereads it: a COMPLETED row replays its exact
 * response (`Idempotency-Replayed: true`); a still-PENDING row (or the
 * extremely rare race where the conflicting row was deleted concurrently by
 * the OTHER attempt's own failure cleanup between our failed insert and this
 * reread) answers 409 `IDEMPOTENCY_IN_PROGRESS` — never risking a second
 * `create` that could race a genuinely concurrent attempt into double
 * execution.
 */
async function beginIdempotentRequest(userId: string, endpoint: string, key: string): Promise<IdempotencyGate> {
  try {
    const created = await prisma.idempotencyRecord.create({
      data: { userId, endpoint, key },
      select: { id: true },
    });
    return { outcome: 'proceed', recordId: created.id };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  const existing = await prisma.idempotencyRecord.findUnique({
    where: { userId_endpoint_key: { userId, endpoint, key } },
  });

  if (existing && existing.responseStatus !== null) {
    return {
      outcome: 'short-circuit',
      response: NextResponse.json(existing.responseBody, {
        status: existing.responseStatus,
        headers: { [IDEMPOTENCY_REPLAYED_HEADER]: 'true' },
      }),
    };
  }

  return {
    outcome: 'short-circuit',
    response: NextResponse.json(
      errorEnvelope('IDEMPOTENCY_IN_PROGRESS', 'The same request is still being processed — retry in a moment.'),
      { status: 409 },
    ),
  };
}

/**
 * Frees a PENDING record after `handle` failed (AC 4) — best-effort: if the
 * delete itself fails (e.g. the row was already gone, or the process is
 * failing hard), the record is left as an orphaned PENDING. That is the
 * documented crash-window trade-off (`IdempotencyRecord`'s doc-comment), not
 * a new failure mode introduced by this catch.
 */
async function freeIdempotencyRecord(recordId: string): Promise<void> {
  await prisma.idempotencyRecord.delete({ where: { id: recordId } }).catch(() => {});
}

export type ApiHandlerArgs<TQuery, TBody, TParams, TAuth extends AuthMode = 'required'> = {
  /**
   * `'required'` routes (the default) are guaranteed a non-null actor here
   * — `apiRoute` already answered 401 and returned before `handle` runs
   * otherwise. Only `auth: 'public'` routes see `actor: null`.
   */
  actor: TAuth extends 'public' ? SessionActor | null : SessionActor;
  query: TQuery;
  body: TBody;
  params: TParams;
  request: NextRequest;
};

export interface ApiRouteConfig<TQuery, TBody, TParams extends Record<string, string>, TAuth extends AuthMode> {
  /**
   * `'required'` (default): resolves the session actor and answers the
   * AD-8 401 envelope if there is none. `src/proxy.ts` already gates every
   * non-public `/api/v1/*` route this way — this check is defense in depth
   * (same rationale as the pre-1.5 routes), not the primary guard.
   * `'public'`: skip the session lookup entirely (`actor` is always
   * `null`) — for routes reachable before a session exists
   * (`auth/set-password`, `auth/forgot-password`, `openapi.json`, `health`).
   */
  auth?: TAuth;
  /** Validates `request.nextUrl.searchParams` (coerced from strings) before `handle` runs. */
  querySchema?: z.ZodType<TQuery>;
  /** Validates the parsed JSON body before `handle` runs; a non-JSON body is treated as a 422. */
  bodySchema?: z.ZodType<TBody>;
  /** HTTP status for a successful response. Default 200. */
  successStatus?: number;
  /**
   * Opt-in request-level idempotency (story TD-2, AC 1-4): when set AND the
   * caller sends the `Idempotency-Key` header, a retry with the same key
   * replays the first response instead of re-executing `handle`. Absent
   * config, or config present but no header sent, behaves byte-identically
   * to a route without this option (AC 3). Requires `auth` !== `'public'`
   * (the record needs a `userId`) and `successStatus` !== `204` (no body to
   * replay) — both are programming errors, checked at route-construction
   * time below, not at request time.
   */
  idempotency?: IdempotencyConfig;
  /** Thin business logic glue: call the service, return the value to serialize as JSON. Throw `DomainError` for expected failures. */
  handle: (args: ApiHandlerArgs<TQuery, TBody, TParams, TAuth>) => Promise<unknown>;
}

type RouteHandlerContext<TParams> = { params: Promise<TParams> };

/**
 * Builds a Next.js route handler (the exported `GET`/`POST`/`PATCH`/...
 * function) that validates its input with Zod, invokes `handle`, and maps
 * the result/error to an HTTP response — `DomainError` → 403/404/422/409,
 * anything else → 500, per AD-8.
 */
export function apiRoute<
  TQuery = undefined,
  TBody = undefined,
  TParams extends Record<string, string> = EmptyParams,
  TAuth extends AuthMode = 'required',
>(config: ApiRouteConfig<TQuery, TBody, TParams, TAuth>) {
  const { auth = 'required' as TAuth, querySchema, bodySchema, successStatus = 200, idempotency, handle } = config;

  if (idempotency) {
    // Both are programming errors caught at construction (module load)
    // time, not request time — per the story's binding design (never a
    // runtime surprise on the first real request).
    if (auth === 'public') {
      throw new Error(
        `apiRoute: idempotency (endpoint "${idempotency.endpoint}") requires auth !== 'public' — an IdempotencyRecord needs a userId, which a public route never has.`,
      );
    }
    if (successStatus === 204) {
      // `IdempotencyRecord.responseBody` replays what `handle` returned; a
      // 204 has no body to replay (and the 204 branch below returns before
      // any serialization happens). No route needs this combination today
      // (TD-2 covers 5 DTO-returning endpoints) — guarded so a FUTURE 204 +
      // idempotency route fails loudly at startup instead of silently never
      // replaying.
      throw new Error(`apiRoute: idempotency (endpoint "${idempotency.endpoint}") cannot be combined with successStatus: 204.`);
    }
  }

  return async function routeHandler(
    request: NextRequest,
    context?: RouteHandlerContext<TParams>,
  ): Promise<NextResponse> {
    try {
      let actor: SessionActor | null = null;
      if (auth !== 'public') {
        actor = await getSessionActor();
        if (!actor) {
          return unauthenticatedResponse();
        }
      }

      const params = context ? await context.params : ({} as TParams);

      let query: TQuery = undefined as TQuery;
      if (querySchema) {
        const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
        if (!parsed.success) {
          return validationErrorResponse(parsed.error);
        }
        query = parsed.data;
      }

      let body: TBody = undefined as TBody;
      if (bodySchema) {
        const raw: unknown = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return validationErrorResponse(parsed.error);
        }
        body = parsed.data;
      }

      // --- Idempotency gate (story TD-2, AC 1-4) ---------------------------
      // Runs AFTER query/body validation succeeds: a request that fails
      // Zod validation never touches the idempotency table at all (its key,
      // if any, stays fully available for a well-formed retry) — simpler
      // than creating-then-freeing a PENDING row for a request that was
      // never going to reach `handle` anyway.
      let idempotencyRecordId: string | null = null;
      if (idempotency) {
        const keyHeader = request.headers.get(IDEMPOTENCY_KEY_HEADER);
        if (keyHeader !== null) {
          if (keyHeader.length < 1 || keyHeader.length > 200) {
            return NextResponse.json(
              errorEnvelope('VALIDATION_ERROR', `The ${IDEMPOTENCY_KEY_HEADER} header must be between 1 and 200 characters.`),
              { status: 422 },
            );
          }
          if (!actor) {
            // Unreachable in practice: idempotency requires auth !== 'public'
            // (thrown at construction, above), and the branch above already
            // resolved a non-null actor or returned 401 before this point.
            // Kept as an explicit typed guard rather than a non-null
            // assertion.
            return internalErrorResponse(new Error('apiRoute: idempotency reached with no resolved actor.'));
          }
          const gate = await beginIdempotentRequest(actor.userId, idempotency.endpoint, keyHeader);
          if (gate.outcome === 'short-circuit') {
            return gate.response;
          }
          idempotencyRecordId = gate.recordId;
        }
      }

      const args = { actor, query, body, params, request } as ApiHandlerArgs<TQuery, TBody, TParams, TAuth>;
      let result: unknown;
      try {
        result = await handle(args);
      } catch (error) {
        if (idempotencyRecordId) {
          // AC 4: a failed attempt frees the key immediately — the user
          // corrects the input and retries with the SAME key without ever
          // being stuck. Services are transactional (their own commit is
          // all-or-nothing), so an error here means no mutation happened.
          await freeIdempotencyRecord(idempotencyRecordId);
        }
        throw error;
      }

      // Story 10.1 (AC 1): a `handle` that already built its own `Response`
      // (the binary xlsx export) is returned as-is, bypassing the JSON/204
      // envelope below entirely — same pass-through `NextResponse` already
      // gets from `routeHandler`'s own return type. Idempotency replay only
      // ever wraps a JSON-serializable `responseBody` (TD-2) and is opt-in
      // per-route via `idempotency: {...}`; no export route sets it (GET-only,
      // idempotency covers mutating POSTs), so the two never combine — no
      // runtime guard needed here.
      if (result instanceof Response) {
        return result as NextResponse;
      }

      if (successStatus === 204) {
        // A 204 is a "null body status" per the Fetch spec (the WHATWG
        // Response constructor throws if a body is set alongside it) —
        // `NextResponse.json(...)` always serializes a body, even for
        // `null`, so it cannot be used here (story 4.3, `DELETE
        // /api/v1/package-types/{id}`, the first 204 route in this codebase).
        return new NextResponse(null, { status: 204 });
      }

      const responseBody = result === undefined ? null : result;

      if (idempotencyRecordId) {
        // `responseBody` is a nullable Json column: Prisma requires the
        // explicit `Prisma.JsonNull` sentinel for a real JSON `null` value
        // (a plain JS `null` is ambiguous between "no value"/DbNull and
        // "JSON null" and Prisma rejects it) — none of the 5 endpoints this
        // story wires up return `undefined`/`null` today, but the wrapper
        // stays correct for a future one that does.
        await prisma.idempotencyRecord.update({
          where: { id: idempotencyRecordId },
          data: {
            responseStatus: successStatus,
            responseBody: responseBody === null ? Prisma.JsonNull : (responseBody as Prisma.InputJsonValue),
            completedAt: new Date(),
          },
        });
      }

      return NextResponse.json(responseBody, { status: successStatus });
    } catch (error) {
      if (error instanceof DomainError) {
        return domainErrorResponse(error);
      }
      return internalErrorResponse(error);
    }
  };
}
