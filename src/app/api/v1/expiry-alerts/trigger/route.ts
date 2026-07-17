import { apiRoute } from '@/lib/api/handler';
import { authorize } from '@/server/auth/rbac';
import { runExpiryAlertsJob } from '@/server/services/expiry-alerts.service';

/**
 * Session-authenticated trigger for the expiry-alerts job (story 12.11, AC 3;
 * ratifica utente 4) — a SEPARATE endpoint from `POST /api/v1/jobs/expiry-alerts`
 * (the bearer-only cron route, INTACT). Re-runs the SAME `runExpiryAlertsJob()`
 * (idempotent via `SentAlert`, story 6.3, AD-9) — a manual re-run is a no-op
 * when nothing new is due.
 *
 * Gated `settings.manage` (ADMIN-only, ratifica 4) DIRECTLY in this route,
 * not inside `runExpiryAlertsJob` itself — a deliberate, narrow exception to
 * AD-1/AD-5's usual "authorize in the service": that function has NO `Actor`
 * parameter at all (its own doc-comment: the bearer check is its only
 * guardian for the cron path), so a session-based gate for THIS path has
 * nowhere else to live.
 */
export const POST = apiRoute({
  handle: async ({ actor }) => {
    authorize(actor, 'settings.manage');
    return runExpiryAlertsJob();
  },
});
