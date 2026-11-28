import { apiRoute } from '@/lib/api/handler';
import { env } from '@/lib/env';
import { requestAddressChange } from '@/server/services/account-email-change';
import { ForbiddenError, ValidationError } from '@/server/services/errors';

export const POST = apiRoute<undefined, undefined, { id: string }>({
  sanitizeUnexpected: true,
  handle: async ({ actor, params, request }) => {
    if (request.headers.get('origin') !== new URL(env.APP_URL).origin) throw new ForbiddenError('Origin unavailable.');
    // In the Node adapter even a zero-byte POST can have a readable body.
    const reader = request.body?.getReader();
    if (reader) {
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (chunk.value.byteLength) {
            void reader.cancel().catch(() => {});
            throw new ValidationError('No input is accepted at this step.');
          }
        }
      } finally { reader.releaseLock(); }
    }
    return requestAddressChange(actor, params.id, request.headers.get('Idempotency-Key') ?? undefined);
  },
});
