import { z } from './zod-with-openapi';

/**
 * The ONE warning-and-deroga contract of flights and bookings (story 19.9,
 * CR §4.4; consumed by story 19.10): when any requirement of an operation
 * fails, the server answers 422 `REQUIREMENTS_NOT_MET` with
 * `details: { failures }` — EVERY failure at once, in a deterministic order
 * (`requirements.service.ts#evaluateRequirements`), so the admin sees the
 * whole picture before resending the same request with `force: true`. A
 * client's rule is exactly one: `REQUIREMENTS_NOT_MET` ⇒ list + "proceed
 * anyway" (for whoever holds `requirements.force`), any other 4xx ⇒ a plain
 * error.
 *
 * Dates are `YYYY-MM-DD`. `expiresAt: null` = the document or the fee was
 * never registered (missing); `lastFlightDate: null` = never flown on board.
 * `balanceCents` is the balance the check compared — on an edit it already
 * includes the operation's own current charge (story 19.9, Q-19.9-b).
 * `AIRCRAFT_OUT_OF_SERVICE` is added by the flight caller only (on bookings
 * the grounding stays a non-derogable 422 of its own).
 *
 * Imports nothing but Zod: the client formatter and components read it too.
 */
const roleSchema = z.enum(['person', 'instructor']);

export const requirementFailureSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('EXPIRY'), role: roleSchema, personName: z.string(), typeName: z.string(), expiresAt: z.iso.date().nullable() }),
  z.object({ type: z.literal('MEMBERSHIP'), role: roleSchema, personName: z.string(), expiresAt: z.iso.date().nullable() }),
  z.object({
    type: z.literal('CURRENCY'),
    role: z.literal('person'),
    personName: z.string(),
    lastFlightDate: z.iso.date().nullable(),
    daysSinceLastFlight: z.number().int().nullable(),
    flightsInWindow: z.number().int(),
    minFlights: z.number().int(),
    windowDays: z.number().int(),
  }),
  z.object({ type: z.literal('BALANCE'), role: z.literal('person'), personName: z.string(), balanceCents: z.number().int(), costCents: z.number().int() }),
  z.object({ type: z.literal('AIRCRAFT_OUT_OF_SERVICE'), registration: z.string(), reason: z.string().nullable(), outOfServiceUntil: z.iso.date().nullable() }),
]);

export type RequirementFailure = z.infer<typeof requirementFailureSchema>;

export const requirementsNotMetDetailsSchema = z.object({ failures: z.array(requirementFailureSchema) });

export type RequirementsNotMetDetails = z.infer<typeof requirementsNotMetDetailsSchema>;
