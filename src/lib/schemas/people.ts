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
  // Story TD-3 (AC 3) — additive, optional profile filter for the flight
  // form's typeahead pickers: `pilot-or-student` narrows to an ACTIVE pilot
  // or student profile (the "Pilota o allievo" picker's domain rule),
  // `instructor` to an ACTIVE instructor profile (the "Istruttore" picker's
  // rule) — same semantics as the client-side filter it replaces
  // (`flights/page.tsx`'s old `person.profiles.pilot || person.profiles.student`
  // / `person.profiles.instructor`). Omitted entirely for the filter bar
  // (Dev Notes: "la barra filtri non filtra per profilo, com'è oggi").
  profile: z.enum(['pilot-or-student', 'instructor']).optional(),
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

// --- Instructor rates (story 4.2, Task 1/2/3, AC 1/2) -----------------------
// The deliberate twin of `aircraft.ts`'s rate schemas (story 4.1): same
// shape, same rules — the only difference is the subject (an instructor,
// resolved from the person-scoped route's `{id}`, instead of an aircraft).

/**
 * `POST /api/v1/people/{id}/instructor-rates` body (story 4.2, AC 1/2): a new
 * historicized rate. `priceCentsPerHour` is an integer number of euro cents
 * (AD-2) — an HOURLY price, always > 0, capped at the Postgres INTEGER max
 * (identical to `createAircraftRateSchema.priceCentsPerHour`). `validFrom` is
 * a calendar date only (`YYYY-MM-DD`, same `z.iso.date()` pattern) — two
 * rates sharing the same `(instructorProfileId, validFrom)` are a 409 (AC 2),
 * never silently overwritten.
 */
export const createInstructorRateSchema = z.object({
  priceCentsPerHour: z.number().int().positive().max(2_147_483_647),
  validFrom: z.iso.date(),
});

export type CreateInstructorRateInput = z.infer<typeof createInstructorRateSchema>;

/**
 * One entry of `GET /api/v1/people/{id}/instructor-rates` (story 4.2).
 * Documentation only, mirroring `instructor-rates.service.ts`'s
 * `InstructorRateListItem` TS type — same pattern as `aircraftRateItemSchema`.
 * `actorEmail` is a display-only join over the stored `actorUserId`.
 */
export const instructorRateItemSchema = z.object({
  id: z.string(),
  instructorProfileId: z.string(),
  priceCentsPerHour: z.number().int().positive(),
  validFrom: z.iso.date(),
  actorUserId: z.string(),
  actorEmail: z.string(),
  createdAt: z.iso.datetime(),
});

export type InstructorRateItemDto = z.infer<typeof instructorRateItemSchema>;

/**
 * `GET /api/v1/people/{id}/instructor-rates` response — a plain array, not
 * the AD-8 paginated envelope (same no-pagination choice as
 * `aircraftRateListResponseSchema`, defensively capped at `take: 500` in the
 * service).
 */
export const instructorRateListResponseSchema = z.array(instructorRateItemSchema);

export type InstructorRateListResponseDto = z.infer<typeof instructorRateListResponseSchema>;
