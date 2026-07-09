/**
 * Domain error hierarchy (Consistency Conventions: "Errori nei service").
 *
 * Every service throws one of these instead of a bare `Error`; a single
 * mapping point per API layer turns them into the AD-8 HTTP envelope
 * (`{ "error": { "code", "message", "details"? } }`). Story 1.3 only wires
 * that mapping locally in `GET /api/v1/me` — the shared helper that every
 * future route will reuse arrives in story 1.5.
 *
 * `code` is a stable SCREAMING_SNAKE identifier: it is part of the API
 * contract (clients may branch on it) and must not change once shipped.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Actor lacks the permission required for the action (AD-5) → HTTP 403. */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}

/** Requested resource does not exist (or is not visible to the actor) → HTTP 404. */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
}

/**
 * Input failed domain-level validation (beyond Zod's schema shape) → HTTP
 * 422. `code` defaults to the generic `VALIDATION_ERROR` (every existing
 * caller keeps that behavior unchanged) but a domain guard can pass a
 * stable SCREAMING_SNAKE code instead (story 5.1, AC 3) so a 422 caused by
 * e.g. an invalid hour-meter reading is distinguishable, on the wire, from
 * one caused by a missing rate — `flights.service.ts#registerFlight` is the
 * first caller to do so.
 */
export class ValidationError extends DomainError {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>, code: string = 'VALIDATION_ERROR') {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/**
 * Action conflicts with the current state of the resource → HTTP 409.
 * `code` defaults to the generic `CONFLICT` (every existing caller keeps
 * that behavior unchanged — none of them pass a second/third argument) but,
 * same shape as `ValidationError` above, a caller can pass a stable
 * SCREAMING_SNAKE code instead (story 8.2, AC 1/2, closing handoff deferral
 * 7.3 D1) so a 409 caused by e.g. a PPR request already decided by another
 * staff member is distinguishable, on the wire, from a generic conflict —
 * `ppr.service.ts#approvePprRequest`/`rejectPprRequest` (`PPR_ALREADY_DECIDED`)
 * are the first callers to do so. `details` mirrors `ValidationError`'s
 * shape too, even though no caller populates it yet — kept for the same
 * "one error hierarchy, one constructor shape" reason.
 */
export class ConflictError extends DomainError {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>, code: string = 'CONFLICT') {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/**
 * Too many requests from the same source in a time window (story 8.1, AC 2)
 * → HTTP 429. First (and, as of this story, only) caller is the public PPR
 * form's per-IP DB-backed limit (`ppr.service.ts#createPprRequest`) — a
 * generic domain error rather than a PPR-specific one, so any future public
 * endpoint can reuse it. `code` is fixed (unlike `ValidationError`'s
 * pluggable code) since there is exactly one reason this error exists today.
 */
export class RateLimitError extends DomainError {
  readonly code = 'RATE_LIMITED';
}
