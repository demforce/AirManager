import { apiRoute } from '@/lib/api/handler';
import { readMailHealth, sendSmtpTestEmail } from '@/server/services/smtp-test-email.service';

export const GET = apiRoute({ handle: ({ actor }) => readMailHealth(actor) });
export const POST = apiRoute({ sanitizeUnexpected: true, handle: ({ actor }) => sendSmtpTestEmail(actor) });
