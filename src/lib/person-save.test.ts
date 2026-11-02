import { describe, expect, it } from 'vitest';
import { changedIdentityFields, personSaveErrorSection } from './person-save';

describe('personSaveErrorSection (story 19.4, AD-5)', () => {
  const none = new Set<string>();

  it('routes each composite code to the section that caused it', () => {
    expect(personSaveErrorSection('CONFLICT', none)).toBe('identity');
    expect(personSaveErrorSection('STUDENT_PROFILE_EXCLUSIVE', none)).toBe('profiles');
    for (const code of ['EXPIRY_TYPE_NOT_FOUND', 'EXPIRY_TYPE_INACTIVE', 'SCOPE_MISMATCH', 'PERSON_ARCHIVED', 'EXPIRY_CONFLICT']) {
      expect(personSaveErrorSection(code, none), code).toBe('expiries');
    }
  });

  it('a RATE_VALID_FROM_IN_PAST the client did not catch (midnight between render and Salva) lands on the instructor rate (AC 21)', () => {
    expect(personSaveErrorSection('RATE_VALID_FROM_IN_PAST', none)).toBe('instructorRate');
  });

  it('INSTRUCTOR_PROFILE_INACTIVE goes to the compensation when the body carried it, else to the rate', () => {
    expect(personSaveErrorSection('INSTRUCTOR_PROFILE_INACTIVE', none, true)).toBe('payoutRate');
    expect(personSaveErrorSection('INSTRUCTOR_PROFILE_INACTIVE', none, false)).toBe('instructorRate');
  });

  it('a shape 422 goes to the block of its first field key', () => {
    expect(personSaveErrorSection('VALIDATION_ERROR', new Set(['email']))).toBe('identity');
    expect(personSaveErrorSection('VALIDATION_ERROR', new Set(['profiles']))).toBe('profiles');
    expect(personSaveErrorSection('VALIDATION_ERROR', new Set(['expiries']))).toBe('expiries');
    expect(personSaveErrorSection('VALIDATION_ERROR', new Set(['payoutRateCents']))).toBe('payoutRate');
    expect(personSaveErrorSection('VALIDATION_ERROR', new Set(['instructorRate']))).toBe('instructorRate');
    expect(personSaveErrorSection('VALIDATION_ERROR', none)).toBe('form');
  });

  it('a 403, a 404 or anything unknown lands on the form-wide banner — never on "email already used"', () => {
    expect(personSaveErrorSection('FORBIDDEN', none)).toBe('form');
    expect(personSaveErrorSection('NOT_FOUND', none)).toBe('form');
    expect(personSaveErrorSection(null, none)).toBe('form');
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
