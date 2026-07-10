import { apiRoute } from '@/lib/api/handler';
import { trainingNoteInputSchema, type TrainingNoteInput } from '@/lib/schemas/school';
import { updateTrainingNote } from '@/server/services/school.service';

type RouteParams = { id: string; noteId: string };

/**
 * `{id}` is the STUDENT's `Person.id`, `{noteId}` the `TrainingNote.id` — the
 * service 404s if `noteId` doesn't belong to `{id}`'s diary (AC 3). Author
 * or admin only, within the 7-day window (409 `NOTE_IMMUTABLE` after).
 */
export const PATCH = apiRoute<undefined, TrainingNoteInput, RouteParams>({
  bodySchema: trainingNoteInputSchema,
  handle: async ({ actor, params, body }) => updateTrainingNote(actor, params.id, params.noteId, body),
});
