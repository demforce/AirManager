import { toDateOnlyString } from '@/lib/date-only';

/**
 * The `details` payload of EVERY `AIRCRAFT_OUT_OF_SERVICE` 422 (story AOG-1a,
 * AD-3) — ONE shape for all four call sites (`bookings.service.ts`'s create /
 * move / approve guards, plus `flights.service.ts#resolveFlightInput`), because
 * they are the same domain error and this API is also consumed by the future
 * Flutter app: three different shapes for one code would be the defect, not the
 * economy.
 *
 * It lives in its OWN module rather than inside `bookings.service.ts` (where
 * `findBlockingExpiredDocuments`, the other flights↔bookings shared helper,
 * does live) for one concrete reason: `flights.service.test.ts` mocks
 * `./bookings.service` wholesale — importing the real one there would drag
 * `@/server/adapters/mail` and `@/lib/env`'s EAGER validation into a unit test
 * (the 3-occurrence failure class recorded in `CLAUDE.md`). With the helper
 * here, that test asserts the REAL `details` shape instead of a stand-in.
 *
 * The SERVER MESSAGE that accompanies these details is deliberately unchanged
 * by story AOG-1a: it is a log line, not a user surface — the sentence the
 * operator reads is composed client-side from the i18n labels.
 *
 * `outOfServiceUntil` is the `YYYY-MM-DD` LAST GROUNDED day, INCLUSIVE — the
 * semantics are written once in `schema.prisma`'s doc-comment on
 * `Aircraft.outOfServiceUntil` and are never re-interpreted here — or `null`
 * when the return date is not yet known. Additive: every consumer that predates
 * the field simply ignores it.
 */
export function outOfServiceDetails(aircraft: { statusReason: string | null; outOfServiceUntil: Date | null }): {
  reason: string | null;
  outOfServiceUntil: string | null;
} {
  return {
    reason: aircraft.statusReason,
    outOfServiceUntil: aircraft.outOfServiceUntil === null ? null : toDateOnlyString(aircraft.outOfServiceUntil),
  };
}
