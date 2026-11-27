import { apiRoute } from '@/lib/api/handler';
import { loginPauseSchema } from '@/lib/schemas/settings';
import { inspectAccessSecurity, setLoginPause } from '@/server/services/access-security';

export const GET = apiRoute({ sanitizeUnexpected: true, handle: ({ actor }) => inspectAccessSecurity(actor) });
export const PUT = apiRoute({ sanitizeUnexpected: true, bodySchema: loginPauseSchema,
  handle: ({ actor, body }) => setLoginPause(actor, body.paused) });
