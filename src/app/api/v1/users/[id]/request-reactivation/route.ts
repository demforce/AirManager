import { apiRoute } from '@/lib/api/handler';
import { requestReactivation } from '@/server/services/credential-mail.service';

export const POST = apiRoute<undefined, undefined, { id: string }>({
  sanitizeUnexpected: true,
  handle: ({ actor, params, request }) => requestReactivation(actor, params.id, request.headers.get('Idempotency-Key') ?? undefined),
});
