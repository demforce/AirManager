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

/** Input failed domain-level validation (beyond Zod's schema shape) → HTTP 422. */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.details = details;
  }
}

/** Action conflicts with the current state of the resource → HTTP 409. */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}
