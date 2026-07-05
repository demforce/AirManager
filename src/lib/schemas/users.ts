import { Role } from '@/generated/prisma/enums';
import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { z } from './zod-with-openapi';

/** Mirrors `next-intl`'s `AppLocale` — kept local to avoid a schema → i18n
 * routing import cycle; the two must be extended together if a locale is
 * ever added. */
export const localeSchema = z.enum(['it', 'en']);

export const roleSchema = z.enum(Role);

/**
 * Shared by the create-user form and `POST /api/v1/users` (Consistency
 * Conventions: "Uno schema Zod per input/output per endpoint").
 */
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  roles: z.array(roleSchema).min(1),
  locale: localeSchema.default('it'),
  // An existing, not-yet-linked `Person` to attach (story: "solo select di
  // Person esistenti" — full Person management arrives in epic 2).
  personId: z.string().min(1).nullish(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Partial update — every field optional so a caller can patch just one
 * (e.g. only `isActive` to deactivate). At least one field must be present;
 * enforced in the service, not here (an empty PATCH is a no-op, not invalid
 * shape).
 */
export const updateUserSchema = z.object({
  roles: z.array(roleSchema).min(1).optional(),
  locale: localeSchema.optional(),
  personId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// `GET /api/v1/users` was already paginated (story 1.4); it now reuses the
// shared `page`/`pageSize` schema (story 1.5, AD-8) instead of redefining
// the same shape.
export const listUsersQuerySchema = paginationQuerySchema;

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/**
 * Response shape of one list item (`users.service.ts#UserListItem`).
 * Documentation only — the service's TS type remains the runtime source of
 * truth — registered in the OpenAPI registry (story 1.5). `createdAt` is
 * ISO 8601 UTC on the wire (AD-8; `Date` → `JSON.stringify` already emits
 * this format).
 */
export const userListItemSchema = z.object({
  id: z.string(),
  email: z.string(),
  roles: z.array(roleSchema),
  isActive: z.boolean(),
  locale: localeSchema,
  passwordSet: z.boolean(),
  person: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
});

/** `GET /api/v1/users` response — AD-8 paginated shape. */
export const userListResponseSchema = paginatedResponseSchema(userListItemSchema);
