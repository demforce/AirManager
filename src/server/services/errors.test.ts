import { describe, expect, it } from 'vitest';
import { ConflictError } from './errors';

/**
 * `ConflictError`'s optional `code` (story 8.2, closing handoff deferral
 * 7.3 D1) — every OTHER `DomainError` subclass already has dedicated
 * coverage via its consumers' own `*.service.test.ts`; this narrow file
 * exists specifically to lock down the new default/custom `code` behavior
 * at the class level, independent of any one caller.
 */
describe('ConflictError (story 8.2, AC 1/2 — optional stable code, handoff 7.3 D1)', () => {
  it('defaults code to CONFLICT when only a message is given (every pre-8.2 caller)', () => {
    const error = new ConflictError('Something conflicts.');

    expect(error.code).toBe('CONFLICT');
    expect(error.message).toBe('Something conflicts.');
    expect(error.details).toBeUndefined();
  });

  it('accepts an explicit stable code as the third argument, same shape as ValidationError', () => {
    const error = new ConflictError('This PPR request has already been decided.', undefined, 'PPR_ALREADY_DECIDED');

    expect(error.code).toBe('PPR_ALREADY_DECIDED');
    expect(error.message).toBe('This PPR request has already been decided.');
  });

  it('accepts details as the second argument (mirrors ValidationError, unused by any caller yet)', () => {
    const error = new ConflictError('Conflict with details.', { foo: 'bar' }, 'SOME_CODE');

    expect(error.details).toEqual({ foo: 'bar' });
    expect(error.code).toBe('SOME_CODE');
  });
});
