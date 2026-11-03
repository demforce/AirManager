import { describe, expect, it, vi } from 'vitest';
import type { ParsedApiError } from '@/lib/api-field-errors';
import { updatePersonSchema } from '@/lib/schemas/people';
import { blankToNull, changedIdentityFields, personSaveError } from './person-save';

// The OpenAPI document is the contract the codes below are read from;
// `settings.ts` pulls `@/lib/env` into it (same mock as `registry.test.ts`).
vi.mock('@/lib/env', () => ({ env: { SMTP_HOST: 'localhost' } }));

const { generateOpenApiDocument } = await import('@/lib/schemas/registry');

function parsed(code: string | null, fieldErrors: string[] = [], details: Record<string, unknown> | null = null): ParsedApiError {
  return { code, fieldErrors: new Set(fieldErrors), details };
}

describe('personSaveError (story 19.4, AD-5; review 19.4 F2)', () => {
  it('routes each composite code to the section that caused it', () => {
    expect(personSaveError(parsed('CONFLICT'))).toEqual({ section: 'identity', reason: 'conflictEmail', expiryTypeId: null });
    expect(personSaveError(parsed('STUDENT_PROFILE_EXCLUSIVE'))).toEqual({ section: 'profiles', reason: 'profilesExclusive', expiryTypeId: null });
    expect(personSaveError(parsed('PERSON_ARCHIVED'))).toEqual({ section: 'expiries', reason: 'personArchived', expiryTypeId: null });
  });

  it('an error about ONE expiry row names it (`details.expiryTypeId`), so the editor shows it on that row', () => {
    const rows = [
      ['EXPIRY_TYPE_NOT_FOUND', 'expiryTypeNotFound'],
      ['EXPIRY_TYPE_INACTIVE', 'expiryTypeInactive'],
      ['SCOPE_MISMATCH', 'scopeMismatch'],
      ['EXPIRY_CONFLICT', 'expiryConflict'],
    ] as const;
    for (const [code, reason] of rows) {
      expect(personSaveError(parsed(code, [], { expiryTypeId: 'type_1' })), code).toEqual({ section: 'expiries', reason, expiryTypeId: 'type_1' });
      // Without the id (or a non-string one) the section still says why.
      expect(personSaveError(parsed(code)), code).toEqual({ section: 'expiries', reason, expiryTypeId: null });
      expect(personSaveError(parsed(code, [], { expiryTypeId: 7 })).expiryTypeId, code).toBeNull();
    }
  });

  it('a RATE_VALID_FROM_IN_PAST the client did not catch (midnight between render and Salva) marks the instructor rate (AC 21)', () => {
    expect(personSaveError(parsed('RATE_VALID_FROM_IN_PAST'))).toMatchObject({ section: 'instructorRate', reason: 'rateValidFromPast' });
  });

  it('INSTRUCTOR_PROFILE_INACTIVE goes to the compensation when the body carried it, else to the rate', () => {
    expect(personSaveError(parsed('INSTRUCTOR_PROFILE_INACTIVE'), true)).toMatchObject({ section: 'payoutRate', reason: 'instructorProfileInactive' });
    expect(personSaveError(parsed('INSTRUCTOR_PROFILE_INACTIVE'), false)).toMatchObject({ section: 'instructorRate', reason: 'instructorProfileInactive' });
  });

  it('a shape 422 marks the anagrafica field, or goes to the block of its first field key', () => {
    expect(personSaveError(parsed('VALIDATION_ERROR', ['email']))).toMatchObject({ section: 'identity', reason: 'invalidField' });
    expect(personSaveError(parsed('VALIDATION_ERROR', ['profiles']))).toMatchObject({ section: 'profiles', reason: 'invalid' });
    expect(personSaveError(parsed('VALIDATION_ERROR', ['expiries']))).toMatchObject({ section: 'expiries', reason: 'invalid' });
    expect(personSaveError(parsed('VALIDATION_ERROR', ['payoutRateCents']))).toMatchObject({ section: 'payoutRate', reason: 'invalid' });
    expect(personSaveError(parsed('VALIDATION_ERROR', ['instructorRate']))).toMatchObject({ section: 'instructorRate', reason: 'invalid' });
    expect(personSaveError(parsed('VALIDATION_ERROR'))).toMatchObject({ section: 'form', reason: 'invalid' });
  });

  it('a 403, a 404 and a 401 land on the form-wide banner with their own message — never on "email already used"', () => {
    expect(personSaveError(parsed('FORBIDDEN'))).toMatchObject({ section: 'form', reason: 'forbidden' });
    expect(personSaveError(parsed('NOT_FOUND'))).toMatchObject({ section: 'form', reason: 'notFound' });
    expect(personSaveError(parsed('UNAUTHENTICATED'))).toMatchObject({ section: 'form', reason: 'unauthenticated' });
  });

  it('"riprova" is left to what the contract does not name: a 500, a network failure, a body that is not ours', () => {
    expect(personSaveError(parsed('INTERNAL_ERROR'))).toMatchObject({ section: 'form', reason: 'generic' });
    expect(personSaveError(parsed(null))).toMatchObject({ section: 'form', reason: 'generic' });
  });

  it('every error code of the PATCH /people/{id} contract has a reason of its own (a code documented later fails here until it is mapped)', () => {
    const operation = generateOpenApiDocument().paths?.['/api/v1/people/{id}']?.patch;
    const documented = [...(operation?.description ?? '').matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map((match) => match[1]!);
    // The domain codes the description names, plus the generic AD-8 ones of its 401/403/404/422 responses.
    const codes = new Set([...documented, 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_ERROR']);
    expect(documented).toEqual(expect.arrayContaining(['PERSON_ARCHIVED', 'EXPIRY_CONFLICT', 'INSTRUCTOR_PROFILE_INACTIVE', 'SCOPE_MISMATCH']));
    for (const code of codes) {
      expect(personSaveError(parsed(code)).reason, code).not.toBe('generic');
    }
  });
});

describe('blankToNull (review 19.4 F1)', () => {
  it('an optional anagrafica input left blank holds null — valid for updatePersonSchema, unlike an empty string', () => {
    expect(blankToNull('')).toBeNull();
    expect(blankToNull('   ')).toBeNull();
    expect(blankToNull('+39 1')).toBe('+39 1');
    expect(blankToNull(null)).toBeNull();
    expect(updatePersonSchema.safeParse({ phone: '' }).success).toBe(false);
    expect(updatePersonSchema.safeParse({ phone: blankToNull('') }).success).toBe(true);
  });
});

describe('changedIdentityFields (story 19.4, D-3)', () => {
  const loaded = { firstName: 'Maria', lastName: 'Bianchi', email: 'maria@airmanager.local', phone: null, address: null };

  it('an editor just opened has nothing to save: a null on the server and an empty input are the same value (trap 13)', () => {
    expect(changedIdentityFields({ ...loaded, phone: '', address: '' }, loaded)).toEqual([]);
  });

  it('only the fields whose saved value would differ — trimmed, the email case-insensitive', () => {
    expect(changedIdentityFields({ ...loaded, firstName: ' Maria ', email: 'MARIA@airmanager.local' }, loaded)).toEqual([]);
    expect(changedIdentityFields({ ...loaded, phone: '+39 333 1', lastName: 'Rossi' }, loaded)).toEqual(['lastName', 'phone']);
  });

  it('restoring a value by hand leaves nothing to save again (AC 15)', () => {
    expect(changedIdentityFields({ ...loaded, phone: '+39 1' }, loaded)).toEqual(['phone']);
    expect(changedIdentityFields({ ...loaded, phone: '' }, loaded)).toEqual([]);
  });
});
