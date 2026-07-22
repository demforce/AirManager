import { paymentMethodSchema } from './accounts';
import { exportQuerySchema } from './common';
import { z } from './zod-with-openapi';

/**
 * `GET /api/v1/instructor-compensation` query (epic 12, story 12.7). Plain
 * summary (every ACTIVE instructor) unless `personId` is given, in which
 * case the SAME route answers the single-instructor DETAIL instead (KPI +
 * recent flights/students — AC 3, "niente endpoint aggiuntivi"). Also
 * carries the shared `?format=xlsx` export params (story 10.1 convention) —
 * the xlsx branch always exports the SUMMARY, `personId` is ignored there
 * (Dev Notes: the detail view has nothing to export, it's a slide-over).
 */
export const instructorCompensationQuerySchema = z.object({
  personId: z.string().optional(),
  ...exportQuerySchema.shape,
});

export type InstructorCompensationQuery = z.infer<typeof instructorCompensationQuerySchema>;

/**
 * One row of the compensation summary — mirrors
 * `instructor-compensation.service.ts`'s `InstructorCompensationSummaryItem`.
 * `payoutRateCents: null` means the admin never set a payout rate for this
 * instructor yet (UI shows "—"); `owed*Cents` is then ALWAYS `null` too
 * (there is nothing to owe against an unset rate). The three variants
 * (`mtd`/`ytd`/`total`) are Rome calendar windows — month-to-date,
 * year-to-date, all-time — computed server-side, never re-derived by a
 * client-side date calculation.
 */
export const instructorCompensationSummaryItemSchema = z.object({
  personId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  payoutRateCents: z.number().int().nullable(),
  mtdMinutes: z.number().int(),
  ytdMinutes: z.number().int(),
  totalMinutes: z.number().int(),
  owedMtdCents: z.number().int().nullable(),
  owedYtdCents: z.number().int().nullable(),
  owedTotalCents: z.number().int().nullable(),
});

export type InstructorCompensationSummaryItemDto = z.infer<typeof instructorCompensationSummaryItemSchema>;

/** `GET /api/v1/instructor-compensation` (no `personId`) response — a plain array, same no-pagination choice as the school hour summaries this twins (small platea). */
export const instructorCompensationSummaryResponseSchema = z.array(instructorCompensationSummaryItemSchema);

export type InstructorCompensationSummaryResponseDto = z.infer<typeof instructorCompensationSummaryResponseSchema>;

/** One of a detail's "voli recenti come CFI" (AC 7) — the flown SCHOOL flight and the student aboard. */
export const instructorCompensationRecentFlightSchema = z.object({
  id: z.string(),
  flightDate: z.iso.date(),
  personFirstName: z.string(),
  personLastName: z.string(),
  minutes: z.number().int(),
});

/** One of a detail's "allievi recenti" (AC 7) — DISTINCT students, derived from `recentFlights` (never a separate query, same as the prototype's own `[...new Set(...)]`). */
export const instructorCompensationRecentStudentSchema = z.object({
  personId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
});

/**
 * `GET /api/v1/instructor-compensation?personId=` response (AC 3, AC 7) —
 * the summary row PLUS the profile slide-over's two lists, capped at the 5
 * most recent SCHOOL flights this instructor flew as CFI.
 */
export const instructorCompensationDetailSchema = instructorCompensationSummaryItemSchema.extend({
  recentFlights: z.array(instructorCompensationRecentFlightSchema).max(5),
  recentStudents: z.array(instructorCompensationRecentStudentSchema),
});

export type InstructorCompensationDetailDto = z.infer<typeof instructorCompensationDetailSchema>;

/**
 * `POST /api/v1/instructor-payouts` body (AC 5) — `instructorPersonId` names
 * the instructor's `Person.id` (same `instructorPersonId` convention as
 * `assignInstructorSchema`, `school.ts`, since this route isn't nested under
 * `/people/{id}`). `amountCents` is always positive (a payout is never
 * negative — there is no reversal concept for this ledger, AD-3's spirit).
 * `periodStart`/`periodEnd` are calendar-only (`YYYY-MM-DD`); the `.refine`
 * below is the ONE cross-field rule the service itself does not re-check
 * (Dev Notes: "amount>0, periodStart ≤ periodEnd" validated once, at the
 * boundary).
 */
export const recordInstructorPayoutSchema = z
  .object({
    instructorPersonId: z.string().trim().min(1),
    amountCents: z.number().int().positive().max(2_147_483_647),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    method: paymentMethodSchema,
    notes: z.string().trim().min(1).max(500).nullish(),
  })
  .refine((value) => value.periodStart <= value.periodEnd, { message: 'periodStart must not be after periodEnd', path: ['periodEnd'] });

export type RecordInstructorPayoutInput = z.infer<typeof recordInstructorPayoutSchema>;

/** One entry of the instructor's payout ledger — mirrors `instructor-compensation.service.ts`'s `InstructorPayoutDto`. Documentation only (no dedicated list endpoint this story — the summary's `owed*Cents` is the only payout-derived value read back). */
export const instructorPayoutItemSchema = z.object({
  id: z.string(),
  instructorProfileId: z.string(),
  amountCents: z.number().int().positive(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  method: paymentMethodSchema,
  notes: z.string().nullable(),
  actorUserId: z.string(),
  createdAt: z.iso.datetime(),
});

export type InstructorPayoutItemDto = z.infer<typeof instructorPayoutItemSchema>;

/**
 * `PUT /api/v1/instructor-compensation/{personId}/rate` body (AC 6) — sets
 * or clears (`null`) the instructor's payout rate. Same shape as
 * `InstructorProfile.payoutRateCents`: an integer number of euro cents, `>=
 * 0` (a free/zero rate is a legitimate configuration, unlike the always-
 * positive student-charged `InstructorRate`), or `null` to unset it.
 */
export const setInstructorPayoutRateSchema = z.object({
  payoutRateCents: z.number().int().min(0).max(2_147_483_647).nullable(),
});

export type SetInstructorPayoutRateInput = z.infer<typeof setInstructorPayoutRateSchema>;

/** `PUT /api/v1/instructor-compensation/{personId}/rate` response. */
export const instructorPayoutRateSchema = z.object({
  payoutRateCents: z.number().int().nullable(),
});

export type InstructorPayoutRateDto = z.infer<typeof instructorPayoutRateSchema>;
