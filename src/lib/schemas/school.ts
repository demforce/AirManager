import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { expiryStatusSchema } from './expiries';
import { z } from './zod-with-openapi';

// --- School (epic 9, story 9.1, FR-32) --------------------------------------
// Student <-> instructor assignment (`StudentInstructorAssignment`, AD-11:
// links the existing `StudentProfile`/`InstructorProfile`, never a new
// person-like table) plus the instructor's own "I miei allievi" view.

/** `POST /api/v1/people/{id}/instructors` body — `{id}` is the STUDENT's `Person.id` (route param), this is the INSTRUCTOR's `Person.id` (never a profile id, same convention as every other person-scoped route). */
export const assignInstructorSchema = z.object({
  instructorPersonId: z.string().trim().min(1),
});

export type AssignInstructorInput = z.infer<typeof assignInstructorSchema>;

/**
 * One entry of `GET /api/v1/people/{id}/instructors` (the student's assigned
 * instructors) — `school.service.ts#AssignedInstructorItem`'s wire shape.
 * `personId` is the instructor's `Person.id`; `assignedAt` is the
 * assignment's `createdAt` (AD-8: ISO 8601 UTC).
 */
export const assignedInstructorItemSchema = z.object({
  personId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  assignedAt: z.iso.datetime(),
});

export type AssignedInstructorItemDto = z.infer<typeof assignedInstructorItemSchema>;

/** A plain array, not the AD-8 paginated envelope (same no-pagination choice as `instructorRateListResponseSchema` — a person's instructor set is always small). */
export const assignedInstructorListResponseSchema = z.array(assignedInstructorItemSchema);

export type AssignedInstructorListResponseDto = z.infer<typeof assignedInstructorListResponseSchema>;

/**
 * One row of `GET /api/v1/school/students` (the "I miei allievi" essential
 * overview, AC 3) — `school.service.ts#OwnStudentItem`'s wire shape.
 * `totalMinutes` is the SUM of the student's non-cancelled `SCHOOL` flight
 * minutes ACROSS every instructor (Dev Notes: the student's own progress,
 * not just the flights with THIS instructor). `expiryStatus` is the worst
 * status (`expiry-status.ts`'s ok < expiring < expired ordering) among the
 * student's registered scadenze, reusing the exact same
 * `expiryStatusSchema`/`ExpiryStatusBadge` as story 6.4 — `null` when the
 * student has no scadenze registered yet (no badge to show). `lastNoteDate`
 * (story 9.2, closing the 9.1 deferral) is the MOST RECENT `TrainingNote.noteDate`
 * across ALL of the student's instructors (batched `groupBy`, same "never
 * N+1" rule as `totalMinutes`/`expiryStatus`) — `null` when no note exists yet.
 */
export const ownStudentItemSchema = z.object({
  personId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  courseStartDate: z.iso.date(),
  totalMinutes: z.number().int().nonnegative(),
  expiryStatus: expiryStatusSchema.nullable(),
  lastNoteDate: z.iso.date().nullable(),
});

export type OwnStudentItemDto = z.infer<typeof ownStudentItemSchema>;

/** A plain array (same no-pagination choice as `assignedInstructorListResponseSchema` — one instructor's own student roster is always small). */
export const ownStudentListResponseSchema = z.array(ownStudentItemSchema);

export type OwnStudentListResponseDto = z.infer<typeof ownStudentListResponseSchema>;

// --- Training notes (epic 9, story 9.2, FR-33) ------------------------------
// The training diary (`TrainingNote`): an instructor's dated progress notes
// about an assigned student, visible read-only to the student. See
// `school.service.ts` for the full triple-access rule (any/own+assigned/self)
// and the 7-day edit window.

/**
 * `POST .../training-notes` and `PATCH .../training-notes/{noteId}` body —
 * the SAME shape for both (Dev Notes: the editable field set on a PATCH is
 * exactly the create input, a full replace of those fields, never a partial
 * per-field patch). `noteDate` is the training SESSION date, distinct from
 * `createdAt`. `flightId` is the linked `Flight.id` (never a package/rate
 * id) — optional; when provided the service verifies it is a `SCHOOL` flight
 * of THIS student (422 `FLIGHT_NOT_LINKABLE` otherwise). `exercises` is
 * mandatory; `assessment`/`nextSteps` are optional — same `.max(2000)` cap as
 * the other free-text fields in this domain (PPR/aircraft notes).
 */
export const trainingNoteInputSchema = z.object({
  noteDate: z.iso.date(),
  flightId: z.string().trim().min(1).optional(),
  exercises: z.string().trim().min(1).max(2000),
  assessment: z.string().trim().max(2000).optional(),
  nextSteps: z.string().trim().max(2000).optional(),
});

export type TrainingNoteInput = z.infer<typeof trainingNoteInputSchema>;

/**
 * One entry of `GET .../training-notes` — `school.service.ts#TrainingNoteItem`'s
 * wire shape. `author` is the instructor who wrote it (immutable — never
 * changes on edit). `flight`, when present, is a bare id/date/duration
 * summary — NEVER accounting data (Dev Notes: "MAI dati contabili del
 * volo"). There is deliberately NO `editableBy`/`editable` flag here (Dev
 * Notes): the UI decides using `author.personId` + `createdAt` + its own
 * role, the server (`updateTrainingNote`) remains the real enforcement.
 * `updatedAt !== createdAt` is how the UI knows a note was edited.
 */
export const trainingNoteItemSchema = z.object({
  id: z.string(),
  noteDate: z.iso.date(),
  exercises: z.string(),
  assessment: z.string().nullable(),
  nextSteps: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  author: z.object({ personId: z.string(), firstName: z.string(), lastName: z.string() }),
  flight: z.object({ id: z.string(), flightDate: z.iso.date(), minutes: z.number().int().positive() }).nullable(),
});

export type TrainingNoteItemDto = z.infer<typeof trainingNoteItemSchema>;

/**
 * `GET .../training-notes` query — plain pagination (AD-8), no filters (the
 * diary is always scoped to the `{id}` route param). Unlike 9.1's small
 * arrays, the diary grows over time (Dev Notes) so it uses the standard
 * `{items,total,page,pageSize}` envelope via `paginate()`.
 */
export const listTrainingNotesQuerySchema = paginationQuerySchema;

export type ListTrainingNotesQuery = z.infer<typeof listTrainingNotesQuerySchema>;

/** `GET .../training-notes` response — AD-8 paginated shape. */
export const trainingNoteListResponseSchema = paginatedResponseSchema(trainingNoteItemSchema);

export type TrainingNoteListResponseDto = z.infer<typeof trainingNoteListResponseSchema>;

// --- Hour summaries (epic 9, story 9.3, FR-34) ------------------------------
// Read-only aggregations over `Flight` (NO new model, NO schema change) —
// see `school.service.ts#getStudentHourSummaries`/`getInstructorHourSummaries`
// for the dual-command/solo derivation.

/**
 * `GET /api/v1/school/summaries/students` and `.../summaries/instructors`
 * query — BOTH bounds mandatory (pattern `cashReportQuerySchema`, story 3.5:
 * there is no "all time" summary endpoint, only the derived `totalMinutesAllTime`
 * field on the student summary). Plain `YYYY-MM-DD` string comparison in the
 * `.refine` is safe because `z.iso.date()` guarantees the fixed-width ISO
 * format.
 */
export const schoolSummaryQuerySchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((value) => value.from <= value.to, { message: 'from must not be after to', path: ['to'] });

export type SchoolSummaryQuery = z.infer<typeof schoolSummaryQuerySchema>;

/**
 * One row of `GET /api/v1/school/summaries/students` (AC 1) —
 * `school.service.ts#StudentHourSummaryItem`'s wire shape. `dualMinutes`/
 * `soloMinutes` are the `Flight.isSolo`-derived doppio-comando/solista split
 * for the requested period (story 9.4 domain correction: a solista is a
 * `SCHOOL` flight with a paid instructor where the student is PIC — see the
 * service doc-comment for the exact derivation); `totalMinutes = dualMinutes
 * + soloMinutes` for the period, which by construction equals all
 * non-cancelled `SCHOOL` minutes; `totalMinutesAllTime` is the same sum with
 * NO period bound — distinct from the 9.1 roster's SCHOOL-only "ore scuola
 * totali" column (`OwnStudentItemDto.totalMinutes`), which stays unchanged.
 */
export const studentHourSummaryItemSchema = z.object({
  personId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  dualMinutes: z.number().int().nonnegative(),
  soloMinutes: z.number().int().nonnegative(),
  totalMinutes: z.number().int().nonnegative(),
  totalMinutesAllTime: z.number().int().nonnegative(),
});

export type StudentHourSummaryItemDto = z.infer<typeof studentHourSummaryItemSchema>;

/** A plain array (same no-pagination choice as `ownStudentListResponseSchema` — the active-student platea is always small). */
export const studentHourSummaryListResponseSchema = z.array(studentHourSummaryItemSchema);

export type StudentHourSummaryListResponseDto = z.infer<typeof studentHourSummaryListResponseSchema>;

/**
 * One row of `GET /api/v1/school/summaries/instructors` (AC 2) —
 * `school.service.ts#InstructorHourSummaryItem`'s wire shape. `minutes` is
 * non-cancelled SCHOOL flight time delivered in the requested period only —
 * NO compensi/tariffe (Contesto: "il compenso è calcolato FUORI dal
 * sistema", FR-34).
 */
export const instructorHourSummaryItemSchema = z.object({
  personId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  minutes: z.number().int().nonnegative(),
});

export type InstructorHourSummaryItemDto = z.infer<typeof instructorHourSummaryItemSchema>;

/** A plain array — self-scoped to a single row for an instructor, the full active platea for staff (Dev Notes: always small either way). */
export const instructorHourSummaryListResponseSchema = z.array(instructorHourSummaryItemSchema);

export type InstructorHourSummaryListResponseDto = z.infer<typeof instructorHourSummaryListResponseSchema>;
