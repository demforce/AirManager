import { z } from 'zod';

/**
 * Server-side environment schema. Validated eagerly (see below) so a
 * misconfigured deployment fails fast at boot instead of surfacing as an
 * obscure runtime error deep inside a request handler.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ error: 'DATABASE_URL must be a valid connection string' }),
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
