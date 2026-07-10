import { roleSchema } from './users';
import { z } from './zod-with-openapi';

/**
 * Response shape of `GET /api/v1/me` (`me.service.ts#getMe`). Documentation
 * only for now (the service's `MeResult` TS type remains the runtime
 * source of truth) — registered in the OpenAPI registry (story 1.5).
 */
export const meResponseSchema = z.object({
  userId: z.string(),
  email: z.string(),
  roles: z.array(roleSchema),
  person: z
    .object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      hasActiveStudentProfile: z.boolean(),
    })
    .nullable(),
});

export type MeResponseDto = z.infer<typeof meResponseSchema>;
