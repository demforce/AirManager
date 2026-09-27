import { z } from 'zod';

// The .env.example placeholders — booting production with either of these
// would mean a known, public secret signs sessions or authorizes jobs.
const PLACEHOLDER_AUTH_SECRET = 'replace-with-a-random-32-byte-secret';
const PLACEHOLDER_JOBS_SECRET = 'dev-jobs-secret-change-me';

/**
 * Server-side environment schema. Validated eagerly (see below) so a
 * misconfigured deployment fails fast at boot instead of surfacing as an
 * obscure runtime error deep inside a request handler.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url({ error: 'DATABASE_URL must be a valid connection string' }),
    // `pg`'s own implicit default (`pg-pool` v3.14.0: `this.options.max ||
    // this.options.poolSize || 10`) — declaring it here just makes the
    // number visible and tunable (story 17.1, AD-5). Unset ⇒ 10, byte-
    // identical to today's behaviour. A production build of this app opens
    // this pool TWICE per Node process — route handlers and page rendering
    // each instantiate `src/server/db/prisma.ts` in their own Next layer
    // (measured: 6 client backends at DATABASE_POOL_MAX=3, one process, one
    // API+page burst) — so keep DATABASE_POOL_MAX × 2 × instances <=
    // max_connections (100 by default, `SHOW max_connections`) minus
    // whatever Postgres reserves for itself (`superuser_reserved_connections`,
    // 3 by default). No upper bound enforced here — that ceiling depends on
    // the deployment, not on this schema.
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    // Auth.js v5 — signs/encrypts the JWT session cookie. Generate with `npx auth secret`.
    AUTH_SECRET: z.string().min(32, { error: 'AUTH_SECRET must be at least 32 characters' }),
    // Password for the demo admin user created by `prisma/seed.ts` /
    // `prisma/seed-demo.ts` (dev/test only — both scripts refuse to run
    // when NODE_ENV=production, so this is never required in prod).
    SEED_ADMIN_PASSWORD: z.string().min(1).optional(),
    // Base URL used to build absolute links in emails (invite/reset). Story 1.4.
    APP_URL: z.url({ error: 'APP_URL must be a valid URL' }).default('http://localhost:3000'),
    // SMTP transport for the MailSender adapter (story 1.4) — Mailpit in dev/test.
    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    MAIL_FROM: z.string().min(1).default('AirManager <no-reply@airmanager.local>'),
    // Bearer token for POST /api/v1/jobs/* (story 6.3, AD-9). Deliberately
    // OPTIONAL here (no default) so a deployment that forgot to set it still
    // boots normally — only the job route itself answers 500 for a missing
    // secret (Contesto: "mai fallback insicuro"), never the whole app.
    JOBS_SECRET: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    // Public placeholders from .env.example must never boot in production —
    // a known secret would let an attacker forge sessions (AUTH_SECRET) or
    // call the jobs API (JOBS_SECRET). Dev/test keep booting with them.
    //
    // Enforce at production RUNTIME only, not during `next build`: the Next
    // CLI forces NODE_ENV=production for the build too (page-data collection
    // imports this module), so a local/CI build with the placeholder .env
    // would otherwise fail. `NEXT_PHASE === 'phase-production-build'` marks
    // the build; a real `next start` never carries it, so the guard still
    // fires when the server actually boots to serve traffic.
    if (value.NODE_ENV !== 'production') return;
    if (process.env.NEXT_PHASE === 'phase-production-build') return;

    if (value.AUTH_SECRET === PLACEHOLDER_AUTH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_SECRET'],
        message: 'AUTH_SECRET is still the .env.example placeholder — set a real secret in production',
      });
    }
    if (value.JOBS_SECRET === PLACEHOLDER_JOBS_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JOBS_SECRET'],
        message: 'JOBS_SECRET is still the .env.example placeholder — set a real secret in production',
      });
    }
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
