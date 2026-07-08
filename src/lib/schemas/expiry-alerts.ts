import { z } from './zod-with-openapi';

// --- Expiry alerts job (epic 6, story 6.3, FR-37) ---------------------------
// The JSON result of `POST /api/v1/jobs/expiry-alerts` — the external
// cron's log, and this story's own e2e assertion surface. Mirrors
// `expiry-alerts.service.ts`'s `ExpiryAlertsJobResult`.

export const expiryAlertsJobResultSchema = z.object({
  candidates: z.number().int().nonnegative(),
  alertsCreated: z.number().int().nonnegative(),
  holderEmailsSent: z.number().int().nonnegative(),
  holdersWithoutEmail: z.number().int().nonnegative(),
  digestEmailsSent: z.number().int().nonnegative(),
});

export type ExpiryAlertsJobResultDto = z.infer<typeof expiryAlertsJobResultSchema>;
