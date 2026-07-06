import { apiRoute } from '@/lib/api/handler';
import {
  instructorProfileRequestSchema,
  pilotProfileRequestSchema,
  profileTypeSchema,
  studentProfileRequestSchema,
} from '@/lib/schemas/people';
import { z } from '@/lib/schemas/zod-with-openapi';
import { NotFoundError, ValidationError } from '@/server/services/errors';
import { upsertProfile } from '@/server/services/people.service';

type RouteParams = { id: string; type: string };

/**
 * `type` is a URL segment, not a query/body field — `apiRoute` has no
 * path-param validation hook, so it is checked here first against
 * `profileTypeSchema`. An unknown type answers 404, not 422 (story 2.2 Dev
 * Notes: "scegliere e documentare") — the path itself doesn't address a
 * resource for an unrecognized type, closer to "no such route" than "bad
 * input". The request body is per-type (pilot/student/instructor each has
 * different fields), so it can't be validated through `apiRoute`'s single
 * `bodySchema` slot the way every other route in this codebase does — it is
 * parsed here, against the schema matching the now-validated `type`, once
 * that's known.
 */
export const PUT = apiRoute<undefined, unknown, RouteParams>({
  handle: async ({ actor, params, request }) => {
    const parsedType = profileTypeSchema.safeParse(params.type);
    if (!parsedType.success) {
      throw new NotFoundError('Unknown profile type.');
    }
    const type = parsedType.data;

    const raw: unknown = await request.json().catch(() => null);

    if (type === 'pilot') {
      const parsedBody = pilotProfileRequestSchema.safeParse(raw);
      if (!parsedBody.success) {
        throw new ValidationError('Invalid input.', z.flattenError(parsedBody.error));
      }
      return upsertProfile(actor, params.id, 'pilot', parsedBody.data);
    }

    if (type === 'student') {
      const parsedBody = studentProfileRequestSchema.safeParse(raw);
      if (!parsedBody.success) {
        throw new ValidationError('Invalid input.', z.flattenError(parsedBody.error));
      }
      return upsertProfile(actor, params.id, 'student', parsedBody.data);
    }

    const parsedBody = instructorProfileRequestSchema.safeParse(raw);
    if (!parsedBody.success) {
      throw new ValidationError('Invalid input.', z.flattenError(parsedBody.error));
    }
    return upsertProfile(actor, params.id, 'instructor', parsedBody.data);
  },
});
