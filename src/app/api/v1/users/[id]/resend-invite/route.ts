import { apiRoute } from '@/lib/api/handler';
import { readInviteStatus, resendInvite } from '@/server/services/credential-mail.service';

type Params = { id: string };
export const POST = apiRoute<undefined, undefined, Params>({ sanitizeUnexpected: true,
  handle: ({ actor, params, request }) => resendInvite(actor, params.id, request.headers.get('Idempotency-Key') ?? undefined),
});
export const GET = apiRoute<undefined, undefined, Params>({
  handle: async ({ actor, params }) => ({ invite: await readInviteStatus(actor, params.id) }),
});
