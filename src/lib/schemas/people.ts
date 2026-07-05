import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { z } from './zod-with-openapi';

/**
 * Shared by the create/edit person forms and `POST`/`PATCH /api/v1/people`
 * (Consistency Conventions: "Uno schema Zod per input/output per endpoint").
 * `email`/`phone`/`address`/`fiscalCode` are all optional — the story only
 * requires `firstName`/`lastName`; everything else may be filled in later
 * (e.g. via the future profile story 2.2).
 */
export const createPersonSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()).nullish(),
  phone: z.string().trim().min(1).nullish(),
  address: z.string().trim().min(1).nullish(),
  fiscalCode: z.string().trim().toUpperCase().min(1).nullish(),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;

/**
 * Partial update — every field optional so a caller can patch just one.
 * Archiving/unarchiving are separate endpoints (AC 2), not part of this
 * schema — `archivedAt` is never client-settable directly.
 */
export const updatePersonSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email()).nullish(),
  phone: z.string().trim().min(1).nullish(),
  address: z.string().trim().min(1).nullish(),
  fiscalCode: z.string().trim().toUpperCase().min(1).nullish(),
});

export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;

/**
 * `GET /api/v1/people` query (story 2.1, AC 1): the shared pagination shape
 * (story 1.5) plus a case-insensitive search term (`q`, matched against
 * first/last name and email in the service) and the archived-inclusion
 * toggle (AC 2 — archived persons are hidden from the default list).
 */
export const listPeopleQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).optional(),
  // `z.coerce.boolean()` would treat the *string* `"false"` as truthy
  // (`Boolean("false")` is `true`) — a real footgun for a query-string
  // boolean. Only the literal `"true"` (or an actual `true`, e.g. if this
  // schema is ever reused off a JSON body) turns the flag on; anything else,
  // including an explicit `"false"` or an absent param, is `false`.
  includeArchived: z.preprocess((value) => value === 'true' || value === true, z.boolean()).default(false),
});

export type ListPeopleQuery = z.infer<typeof listPeopleQuerySchema>;

/**
 * Active-profile flags shown as list badges (story 2.2, AC 1) — `true` iff
 * the corresponding profile exists and `deactivatedAt` is `null`. Full
 * profile data is only in the single-person detail response
 * (`personDetailSchema`), not the list, to keep `GET /api/v1/people` light.
 */
export const profileFlagsSchema = z.object({
  pilot: z.boolean(),
  student: z.boolean(),
  instructor: z.boolean(),
});

/**
 * Response shape of one list item (`people.service.ts#PersonListItem`).
 * Documentation only — the service's TS type remains the runtime source of
 * truth — registered in the OpenAPI registry (story 1.5 pattern). `Date`
 * fields are ISO 8601 UTC on the wire (AD-8).
 */
export const personListItemSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  fiscalCode: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  profiles: profileFlagsSchema,
});

export type PersonListItemDto = z.infer<typeof personListItemSchema>;

/** `GET /api/v1/people` response — AD-8 paginated shape. */
export const personListResponseSchema = paginatedResponseSchema(personListItemSchema);

/**
 * Profile types a `Person` may activate (story 2.2, AC 1) — 1-to-0/1 with
 * `Person` (AD-11), never a second anagrafica. Used both to validate the
 * `[type]` path segment of the profile routes (unknown value → 404, chosen
 * over 422 because the URL itself doesn't address a route — see the route
 * handler) and as the discriminant for the per-type request/response shapes
 * below.
 */
export const profileTypeSchema = z.enum(['pilot', 'student', 'instructor']);

export type ProfileType = z.infer<typeof profileTypeSchema>;

/** `PUT /api/v1/people/{id}/profiles/pilot` request body. */
export const pilotProfileRequestSchema = z.object({
  licenseNumber: z.string().trim().min(1),
  licenseType: z.string().trim().min(1),
});

export type PilotProfileRequestInput = z.infer<typeof pilotProfileRequestSchema>;

/**
 * `PUT /api/v1/people/{id}/profiles/student` request body. `courseStartDate`
 * is a calendar date only (no time-of-day) — `YYYY-MM-DD` on the wire
 * (Dev Notes: `@db.Date` in Prisma, presented in Europe/Rome without a
 * day-shift). `z.iso.date()` both validates the format and matches the
 * `<input type="date">` value the UI sends verbatim.
 */
export const studentProfileRequestSchema = z.object({
  courseStartDate: z.iso.date(),
});

export type StudentProfileRequestInput = z.infer<typeof studentProfileRequestSchema>;

/** `PUT /api/v1/people/{id}/profiles/instructor` request body. */
export const instructorProfileRequestSchema = z.object({
  ratings: z.string().trim().min(1),
});

export type InstructorProfileRequestInput = z.infer<typeof instructorProfileRequestSchema>;

/** Pilot profile as returned by the API — `deactivatedAt: null` means active. */
export const pilotProfileSchema = z.object({
  licenseNumber: z.string(),
  licenseType: z.string(),
  deactivatedAt: z.iso.datetime().nullable(),
});

export type PilotProfileDto = z.infer<typeof pilotProfileSchema>;

/** Student profile as returned by the API — `courseStartDate` stays `YYYY-MM-DD` (no time). */
export const studentProfileSchema = z.object({
  courseStartDate: z.iso.date(),
  deactivatedAt: z.iso.datetime().nullable(),
});

export type StudentProfileDto = z.infer<typeof studentProfileSchema>;

/** Instructor profile as returned by the API. */
export const instructorProfileSchema = z.object({
  ratings: z.string(),
  deactivatedAt: z.iso.datetime().nullable(),
});

export type InstructorProfileDto = z.infer<typeof instructorProfileSchema>;

/**
 * `GET /api/v1/people/{id}` response (story 2.2, AC 1): the list item shape
 * plus the three profiles in full — `null` when the profile was never
 * activated, an object (with `deactivatedAt` possibly set) once it has been.
 */
export const personDetailSchema = personListItemSchema.extend({
  pilotProfile: pilotProfileSchema.nullable(),
  studentProfile: studentProfileSchema.nullable(),
  instructorProfile: instructorProfileSchema.nullable(),
});

export type PersonDetailDto = z.infer<typeof personDetailSchema>;
