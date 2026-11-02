import type { ParsedApiError } from '@/lib/api-field-errors';

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
 * The value an OPTIONAL anagrafica input (email, phone, address) holds in the
 * form: blank is `null` (review 19.4 F1). `updatePersonSchema` refuses `''`
 * (`min(1)`), so a field typed into and emptied again would block the whole
 * Salva on "Campo obbligatorio."; as `null` it is valid, unchanged when it was
 * empty on the server, and sent as `null` (cleared) when it was not. The
 * `setValueAs` of those inputs in both person editors.
 */
export function blankToNull(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? null : value;
}

/**
 * Which section of a person editor a failed save belongs to — never a 409
 * read as "email already used" when it was an expiry or the instructor
 * profile (that is why every 409 of the composite but the email's carries its
 * own code).
 */
export type PersonSaveSection = 'identity' | 'profiles' | 'expiries' | 'payoutRate' | 'instructorRate' | 'form';

/**
 * Why a Salva failed (review 19.4 F2): every refusal the server would repeat
 * on a retry has a message that says what to change, never "riprova". Two
 * mark a field instead of showing a message — `invalidField` (a shape 422 on
 * an anagrafica field) and `rateValidFromPast` (the student rate's "In vigore
 * da"); `generic` is left to what the contract does not name: an
 * `INTERNAL_ERROR`, a network failure, a body that is not an API envelope.
 */
export type PersonSaveReason =
  | 'invalidField'
  | 'rateValidFromPast'
  | 'conflictEmail'
  | 'profilesExclusive'
  | 'personArchived'
  | 'expiryTypeNotFound'
  | 'expiryTypeInactive'
  | 'scopeMismatch'
  | 'expiryConflict'
  | 'instructorProfileInactive'
  | 'invalid'
  | 'forbidden'
  | 'notFound'
  | 'unauthenticated'
  | 'generic';

/** The reasons an editor shows as a message. */
export type PersonSaveMessageReason = Exclude<PersonSaveReason, 'invalidField' | 'rateValidFromPast'>;

export type PersonSaveErrorLabels = Record<PersonSaveMessageReason, string>;

export type PersonSaveError = {
  section: PersonSaveSection;
  reason: PersonSaveReason;
  /** The expiry row the server refused (`details.expiryTypeId`) — the editor shows the error on it; `null` when the error is not about one row. */
  expiryTypeId: string | null;
};

const IDENTITY_FIELD_SET = new Set<string>(IDENTITY_FIELDS);

const SECTION_OF_FIELD: Record<string, PersonSaveSection> = {
  profiles: 'profiles',
  expiries: 'expiries',
  payoutRateCents: 'payoutRate',
  instructorRate: 'instructorRate',
};

/** The composite's errors about ONE expiry row — the server names it in `details.expiryTypeId`. */
const EXPIRY_ROW_REASONS: Record<string, PersonSaveMessageReason> = {
  EXPIRY_TYPE_NOT_FOUND: 'expiryTypeNotFound',
  EXPIRY_TYPE_INACTIVE: 'expiryTypeInactive',
  SCOPE_MISMATCH: 'scopeMismatch',
  EXPIRY_CONFLICT: 'expiryConflict',
};

/**
 * Reads a failed `PATCH /api/v1/people/{id}` (`parseApiError`'s result) into
 * the section and the reason the editor shows. `sentPayoutRate` says whether
 * the body carried the compensation, the only way to tell which of the two
 * instructor sections a 409 `INSTRUCTOR_PROFILE_INACTIVE` is about. A 403 (a
 * block without its permission, AD-7), a 404, a 401 and anything unknown land
 * on the form-wide banner.
 */
export function personSaveError({ code, fieldErrors, details }: ParsedApiError, sentPayoutRate = false): PersonSaveError {
  const rowReason = code === null ? undefined : EXPIRY_ROW_REASONS[code];
  if (rowReason) {
    const expiryTypeId = details?.['expiryTypeId'];
    return { section: 'expiries', reason: rowReason, expiryTypeId: typeof expiryTypeId === 'string' ? expiryTypeId : null };
  }
  const error = (section: PersonSaveSection, reason: PersonSaveReason): PersonSaveError => ({ section, reason, expiryTypeId: null });
  switch (code) {
    case 'CONFLICT':
      return error('identity', 'conflictEmail');
    case 'STUDENT_PROFILE_EXCLUSIVE':
      return error('profiles', 'profilesExclusive');
    case 'PERSON_ARCHIVED':
      return error('expiries', 'personArchived');
    case 'RATE_VALID_FROM_IN_PAST':
      return error('instructorRate', 'rateValidFromPast');
    case 'INSTRUCTOR_PROFILE_INACTIVE':
      return error(sentPayoutRate ? 'payoutRate' : 'instructorRate', 'instructorProfileInactive');
    case 'VALIDATION_ERROR': {
      // Zod's `flattenError` groups by the FIRST key of the path: the top-level block.
      for (const field of fieldErrors) {
        if (IDENTITY_FIELD_SET.has(field)) return error('identity', 'invalidField');
        const section = SECTION_OF_FIELD[field];
        if (section) return error(section, 'invalid');
      }
      return error('form', 'invalid');
    }
    case 'FORBIDDEN':
      return error('form', 'forbidden');
    case 'NOT_FOUND':
      return error('form', 'notFound');
    case 'UNAUTHENTICATED':
      return error('form', 'unauthenticated');
    default:
      return error('form', 'generic');
  }
}
