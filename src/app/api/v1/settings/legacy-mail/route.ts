import { legacyMailChangeSchema, legacyMailPageSchema } from '@/lib/schemas/legacy-mail-routing';
import { apiRoute } from '@/lib/api/handler';
import { inspectLegacyMail, setLegacyMailRouting } from '@/server/services/legacy-mail-routing';

export const GET = apiRoute({ sanitizeUnexpected: true, querySchema: legacyMailPageSchema,
  handle: async ({ actor, query }) => Response.json(await inspectLegacyMail(actor, query.page),
    { headers: { 'Cache-Control': 'private, no-store' } }) });
export const PUT = apiRoute({ sanitizeUnexpected: true, bodySchema: legacyMailChangeSchema,
  handle: ({ actor, body }) => setLegacyMailRouting(actor, body.enabled, body.revision) });
