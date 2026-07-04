import { z } from 'zod';

/**
 * Shared login form schema — used by the client-side form (react-hook-form +
 * zodResolver) and re-validated server-side inside the Credentials
 * provider's `authorize()`. Not registered in the OpenAPI registry: the
 * NextAuth `/api/auth/*` routes are framework-owned, not a `/api/v1/*`
 * domain endpoint (the registry lands in story 1.5).
 */
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
