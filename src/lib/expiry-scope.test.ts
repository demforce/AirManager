import { describe, expect, it } from 'vitest';
import { isExpiryScopeCompatible, type ProfileFlags } from './expiry-scope';

const NONE: ProfileFlags = { pilot: false, student: false, instructor: false };

describe('isExpiryScopeCompatible', () => {
  it('ALL matches any profile combination, including none', () => {
    expect(isExpiryScopeCompatible('ALL', NONE)).toBe(true);
    expect(isExpiryScopeCompatible('ALL', { ...NONE, pilot: true })).toBe(true);
  });

  it('PILOTS matches only an active pilot profile', () => {
    expect(isExpiryScopeCompatible('PILOTS', { ...NONE, pilot: true })).toBe(true);
    expect(isExpiryScopeCompatible('PILOTS', NONE)).toBe(false);
    expect(isExpiryScopeCompatible('PILOTS', { ...NONE, student: true })).toBe(false);
  });

  it('STUDENTS matches only an active student profile', () => {
    expect(isExpiryScopeCompatible('STUDENTS', { ...NONE, student: true })).toBe(true);
    expect(isExpiryScopeCompatible('STUDENTS', NONE)).toBe(false);
  });

  it('INSTRUCTORS matches only an active instructor profile', () => {
    expect(isExpiryScopeCompatible('INSTRUCTORS', { ...NONE, instructor: true })).toBe(true);
    expect(isExpiryScopeCompatible('INSTRUCTORS', NONE)).toBe(false);
  });
});
