import { apiRoute } from '@/lib/api/handler';
import {
  listTrainingNotesQuerySchema,
  trainingNoteInputSchema,
  type ListTrainingNotesQuery,
  type TrainingNoteInput,
} from '@/lib/schemas/school';
import { createTrainingNote, listTrainingNotes } from '@/server/services/school.service';

type RouteParams = { id: string };

/**
 * Thin routes (AD-1) — the AC 2 triple access (`school.manage.any` OR
 * assigned instructor OR own-access) and AC 1's authoring rules stay in
 * `school.service.ts` (AD-5). `{id}` is the STUDENT's `Person.id` (existing
 * convention: routes never expose profile ids).
 */
export const GET = apiRoute<ListTrainingNotesQuery, undefined, RouteParams>({
  querySchema: listTrainingNotesQuerySchema,
  handle: async ({ actor, params, query }) => listTrainingNotes(actor, params.id, query),
});

export const POST = apiRoute<undefined, TrainingNoteInput, RouteParams>({
  bodySchema: trainingNoteInputSchema,
  successStatus: 201,
  handle: async ({ actor, params, body }) => createTrainingNote(actor, params.id, body),
});
