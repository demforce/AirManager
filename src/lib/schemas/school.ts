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
 * student has no scadenze registered yet (no badge to show).
 */
export const ownStudentItemSchema = z.object({
  personId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  courseStartDate: z.iso.date(),
  totalMinutes: z.number().int().nonnegative(),
  expiryStatus: expiryStatusSchema.nullable(),
});

export type OwnStudentItemDto = z.infer<typeof ownStudentItemSchema>;

/** A plain array (same no-pagination choice as `assignedInstructorListResponseSchema` — one instructor's own student roster is always small). */
export const ownStudentListResponseSchema = z.array(ownStudentItemSchema);

export type OwnStudentListResponseDto = z.infer<typeof ownStudentListResponseSchema>;
