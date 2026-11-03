/**
 * The medical requirement of story 19.7a (R-19-j, D-4) — PURE, so the flight
 * and booking scans (`expiries.service.ts#getMedicalRequirementFailure`) and
 * the checks of stories 19.9/19.10 all judge a person with the SAME rule.
 *
 * The rule: whoever is on board needs ONE valid medical visit of ANY class.
 * - It applies only while at least one MEDICAL type is ACTIVE: an
 *   installation with no medical visits configured never blocks anybody.
 * - It is satisfied by ANY registered MEDICAL row — of an active type or not —
 *   whose `expiresAt` is on or after the date (the expiry day itself is still
 *   valid, the convention of `computeExpiryStatus`).
 *
 * When it fails it yields ONE document, never one per class ("you need all
 * three" is exactly what R-19-j overturned): the most recently expired visit,
 * or — no visit registered at all — a "missing" document named after the
 * active MEDICAL types, alphabetical, joined by `' / '`, with `expiresAt:
 * null` (the shape the flight form already renders for a missing document).
 *
 * Dates are `YYYY-MM-DD` strings compared as strings (the convention of
 * `requirements.service.ts#evaluateRequirements`).
 */
export type MedicalRequirementFailure = { typeName: string; expiresAt: string | null };

const compareNames = (left: string, right: string): number => left.localeCompare(right, 'it');

export function evaluateMedicalRequirement(
  input: { activeMedicalTypeNames: string[]; medicals: Array<{ typeName: string; expiresAt: string }> },
  dateOnly: string,
): MedicalRequirementFailure | null {
  if (input.activeMedicalTypeNames.length === 0) return null;
  if (input.medicals.some((medical) => medical.expiresAt >= dateOnly)) return null;

  if (input.medicals.length === 0) {
    return { typeName: [...input.activeMedicalTypeNames].sort(compareNames).join(' / '), expiresAt: null };
  }

  const latest = input.medicals.reduce((best, medical) => {
    if (medical.expiresAt !== best.expiresAt) return medical.expiresAt > best.expiresAt ? medical : best;
    return compareNames(medical.typeName, best.typeName) < 0 ? medical : best;
  });
  return { typeName: latest.typeName, expiresAt: latest.expiresAt };
}
