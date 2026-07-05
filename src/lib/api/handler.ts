import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionActor, type SessionActor } from '@/server/auth/session';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@/server/services/errors';

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
  const { auth = 'required' as TAuth, querySchema, bodySchema, successStatus = 200, handle } = config;

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

      const args = { actor, query, body, params, request } as ApiHandlerArgs<TQuery, TBody, TParams, TAuth>;
      const result = await handle(args);
      return NextResponse.json(result === undefined ? null : result, { status: successStatus });
    } catch (error) {
      if (error instanceof DomainError) {
        return domainErrorResponse(error);
      }
      return internalErrorResponse(error);
    }
  };
}
