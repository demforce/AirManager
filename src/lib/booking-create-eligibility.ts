/** UI mirror of createBooking's own-profile gate; the service remains authoritative. */
export function canOfferBookingCreate(input: {
  canManageAny: boolean;
  canManageOwn: boolean;
  hasActivePilotProfile: boolean;
  hasActiveInstructorProfile: boolean;
}): boolean {
  return input.canManageAny || (input.canManageOwn && (input.hasActivePilotProfile || input.hasActiveInstructorProfile));
}
