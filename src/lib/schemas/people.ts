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
});

export type PersonListItemDto = z.infer<typeof personListItemSchema>;

/** `GET /api/v1/people` response — AD-8 paginated shape. */
export const personListResponseSchema = paginatedResponseSchema(personListItemSchema);
