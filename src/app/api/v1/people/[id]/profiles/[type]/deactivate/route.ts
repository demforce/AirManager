import { apiRoute } from '@/lib/api/handler';
import { profileTypeSchema } from '@/lib/schemas/people';
import { NotFoundError } from '@/server/services/errors';
import { deactivateProfile } from '@/server/services/people.service';

type RouteParams = { id: string; type: string };

/** Same 404-for-unknown-type choice as `PUT .../profiles/[type]` — see that route's doc comment. */
export const POST = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => {
    const parsedType = profileTypeSchema.safeParse(params.type);
    if (!parsedType.success) {
      throw new NotFoundError('Unknown profile type.');
    }
    await deactivateProfile(actor, params.id, parsedType.data);
    return { ok: true };
  },
});
