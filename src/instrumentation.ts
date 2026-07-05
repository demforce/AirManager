/**
 * Next.js instrumentation hook — runs once when the server starts, in both
 * the Node.js and edge runtimes. Used here purely to force environment
 * validation (`src/lib/env.ts`) to run at boot, so a misconfigured
 * deployment fails immediately instead of on the first request that
 * happens to touch the database.
 *
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register(): Promise<void> {
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    await import('@/lib/env');
  }
}
