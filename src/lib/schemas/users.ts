import { z } from 'zod';
import { Role } from '@/generated/prisma/enums';

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

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
