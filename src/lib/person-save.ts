/**
 * Client side of the person composite save (story 19.4): both person editors
 * (`pilots/pilot-editor.tsx`, `instructors/instructor-editor.tsx`) send ONE
 * `PATCH /api/v1/people/{id}` with only what changed (D-3), and route its
 * error back to the section that caused it (AD-5).
 */

export const IDENTITY_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'address'] as const;

export type IdentityField = (typeof IDENTITY_FIELDS)[number];

type IdentityLike = Partial<Record<IdentityField, string | null | undefined>>;

/**
 * The value a field SAVES as — trimmed (and lower-cased for the email), like
 * `updatePersonSchema` — with `null` and `''` the same: a field empty on the
 * server is `''` in its input, and must not read as a change the moment the
 * editor opens (trap 13), nor once the user retypes the value they removed.
 */
function savedFormOf(field: IdentityField, value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return field === 'email' ? trimmed.toLowerCase() : trimmed;
}

/** The anagrafica fields whose value would save differently from the loaded one — the only ones the Salva sends. */
export function changedIdentityFields(values: IdentityLike, loaded: IdentityLike | undefined): IdentityField[] {
  return IDENTITY_FIELDS.filter((field) => savedFormOf(field, values[field]) !== savedFormOf(field, loaded?.[field]));
}

/**
 * Which section of a person editor a failed save belongs to — never a 409
 * read as "email already used" when it was an expiry or the instructor
 * profile (that is why every 409 of the composite but the email's carries its
 * own code).
 */
export type PersonSaveSection = 'identity' | 'profiles' | 'expiries' | 'payoutRate' | 'instructorRate' | 'form';

const IDENTITY_FIELD_SET = new Set<string>(IDENTITY_FIELDS);

const SECTION_OF_FIELD: Record<string, PersonSaveSection> = {
  profiles: 'profiles',
  expiries: 'expiries',
  payoutRateCents: 'payoutRate',
  instructorRate: 'instructorRate',
};

/**
 * `code`/`fieldErrors` come from `parseApiError`; `sentPayoutRate` says
 * whether the body carried the compensation, the only way to tell which of
 * the two instructor sections a 409 `INSTRUCTOR_PROFILE_INACTIVE` is about.
 * A 403 (a block without its permission, AD-7) and anything unknown land on
 * the form-wide banner.
 */
export function personSaveErrorSection(code: string | null, fieldErrors: Set<string>, sentPayoutRate = false): PersonSaveSection {
  switch (code) {
    case 'CONFLICT':
      return 'identity';
    case 'STUDENT_PROFILE_EXCLUSIVE':
      return 'profiles';
    case 'EXPIRY_TYPE_NOT_FOUND':
    case 'EXPIRY_TYPE_INACTIVE':
    case 'SCOPE_MISMATCH':
    case 'PERSON_ARCHIVED':
    case 'EXPIRY_CONFLICT':
      return 'expiries';
    case 'RATE_VALID_FROM_IN_PAST':
      return 'instructorRate';
    case 'INSTRUCTOR_PROFILE_INACTIVE':
      return sentPayoutRate ? 'payoutRate' : 'instructorRate';
    case 'VALIDATION_ERROR': {
      // Zod's `flattenError` groups by the FIRST key of the path: the top-level block.
      for (const field of fieldErrors) {
        if (IDENTITY_FIELD_SET.has(field)) return 'identity';
        const section = SECTION_OF_FIELD[field];
        if (section) return section;
      }
      return 'form';
    }
    default:
      return 'form';
  }
}
