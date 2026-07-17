import { apiRoute } from '@/lib/api/handler';
import { sendSmtpTestEmail } from '@/server/services/smtp-test-email.service';

/**
 * Thin route (AD-1) — story 12.11, AC 1/2. `settings.manage` (real gate in
 * the service). `{ sent: boolean }` — `sent: false` on a mail-transport
 * failure, never a 5xx (the service's own contract).
 */
export const POST = apiRoute({
  handle: async ({ actor }) => sendSmtpTestEmail(actor),
});
