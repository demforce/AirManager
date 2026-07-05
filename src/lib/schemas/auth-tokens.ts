import { z } from './zod-with-openapi';

/**
 * Shared by `/set-password` (form + `POST /api/v1/auth/set-password`) for
 * both the invite flow and the password-reset flow — the same token/password
 * shape sets a password either way (story 1.4, AC 1/3).
 */
export const setPasswordSchema = z.object({
  token: z.string().min(1),
  // "min 10 char" (story Task 5).
  password: z.string().min(10).max(256),
});

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

/** `/forgot-password` (form + `POST /api/v1/auth/forgot-password`). */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
