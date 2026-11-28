import { describe, expect, it } from 'vitest';
import { canOfferBookingCreate } from './booking-create-eligibility';

describe('booking create CTA eligibility (18.2b)', () => {
  it.each([
    ['active pilot', true, false, true],
    ['deactivated pilot profile', false, false, false],
    ['student only', false, false, false],
    ['student and pilot roles with active pilot profile', true, false, true],
    ['active instructor', false, true, true],
  ])('%s: follows the active profile, not the role name', (_case, pilot, instructor, expected) => {
    expect(canOfferBookingCreate({ canManageAny: false, canManageOwn: true, hasActivePilotProfile: pilot, hasActiveInstructorProfile: instructor })).toBe(expected);
  });

  it('allows staff to book on behalf of others without an own flying profile', () => {
    expect(canOfferBookingCreate({ canManageAny: true, canManageOwn: false, hasActivePilotProfile: false, hasActiveInstructorProfile: false })).toBe(true);
  });

  it('does not infer booking permission from a pilot profile on a student-only account', () => {
    expect(canOfferBookingCreate({ canManageAny: false, canManageOwn: false, hasActivePilotProfile: true, hasActiveInstructorProfile: false })).toBe(false);
  });
});
