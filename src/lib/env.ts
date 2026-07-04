import { z } from 'zod';

/**
 * Server-side environment schema. Validated eagerly (see below) so a
 * misconfigured deployment fails fast at boot instead of surfacing as an
 * obscure runtime error deep inside a request handler.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ error: 'DATABASE_URL must be a valid connection string' }),
  // Auth.js v5 — signs/encrypts the JWT session cookie. Generate with `npx auth secret`.
  AUTH_SECRET: z.string().min(1, { error: 'AUTH_SECRET is required' }),
  // Password for the demo admin user created by `prisma/seed.ts` (dev/test only).
  SEED_ADMIN_PASSWORD: z.string().min(1, { error: 'SEED_ADMIN_PASSWORD is required' }),
  // Base URL used to build absolute links in emails (invite/reset). Story 1.4.
  APP_URL: z.url({ error: 'APP_URL must be a valid URL' }).default('http://localhost:3000'),
  // SMTP transport for the MailSender adapter (story 1.4) — Mailpit in dev/test.
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().min(1).default('AirManager <no-reply@airmanager.local>'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = z.prettifyError(parsed.error);
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}

export const env: Env = loadEnv();
