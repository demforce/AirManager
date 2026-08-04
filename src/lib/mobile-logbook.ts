/**
 * Pure derivations of the mobile logbook (story 15.6, AD-5) — the phone card,
 * its status badge and the detail sheet's over-line. They live here, outside
 * the console, for the same reason `mobile-registries.ts`/`mobile-agenda.ts`
 * do: they encode edge cases that are invisible on a happy-path screenshot
 * (a historical flight with no airfields, a cancelled flight that is ALSO a
 * correction) and are cheaper to prove with a unit test than with a fixture.
 *
 * Pure by construction: no import of a service, hence no `@/lib/env` dragged
 * into the test (CLAUDE.md's eager-env rule).
 */

/**
 * The one status a row is allowed to shout about (ratifica R-15.6-b), in
 * DECREASING gravity. A flight can be several at once — a cancelled flight
 * may also be forced and may itself be a correction — and the list has room
 * for exactly one chip, so the order is a decision, not an accident:
 * "annullato" changes what the row MEANS (it is not in the totals anymore),
 * "deroga" says an admin bypassed a blocking document, "correzione" is
 * lineage the sheet spells out in full.
 */
export type FlightBadgeKind = 'cancelled' | 'forced' | 'correction';

export function flightBadgeKind(flight: {
  status: 'REGISTERED' | 'CANCELLED';
  forcedAt: string | null;
  correctionOfId: string | null;
  correctedByFlightId: string | null;
}): FlightBadgeKind | null {
  if (flight.status === 'CANCELLED') return 'cancelled';
  if (flight.forcedAt !== null) return 'forced';
  if (flight.correctionOfId !== null || flight.correctedByFlightId !== null) return 'correction';
  return null;
}

/**
 * `DEP→ARR`, the template's own form (script 666), or `null` when the flight
 * has no route to show. Both airfields are nullable on a pre-11.1 flight
 * (`schemas/flights.ts:163-164`) and the desktop prints its `noValue`
 * placeholder for the pair; the caller decides whether `null` becomes that
 * placeholder (a table cell) or simply disappears (a composed line).
 */
export function flightRouteLabel(departureAirfield: string | null, arrivalAirfield: string | null): string | null {
  const departure = (departureAirfield ?? '').trim();
  const arrival = (arrivalAirfield ?? '').trim();
  if (departure === '' || arrival === '') return null;
  return `${departure}→${arrival}`;
}

/**
 * Joins the segments of a composed line with the template's own separator,
 * DROPPING every absent one.
 *
 * This is the lesson of review 15.5 F1 turned into code: a placeholder
 * ("—") pushed into a composed string reads as a second separator, and an
 * empty segment leaves two separators adjacent. Both are defects of the
 * COMPOSITION, so they are killed once, here, instead of at each call site.
 */
function joinSegments(segments: readonly (string | null | undefined)[]): string {
  return segments.map((segment) => (segment ?? '').trim()).filter((segment) => segment !== '').join(' · ');
}

/**
 * The card's mono sub-line — the template's own `date · dep→arr · kind
 * [· CFI name]` (script 666), minus whatever this flight does not have.
 */
export function flightCardSubLine(parts: { date: string; route: string | null; typeLabel: string; instructorLabel: string | null }): string {
  return joinSegments([parts.date, parts.route, parts.typeLabel, parts.instructorLabel]);
}

/**
 * The detail sheet's mono over-line. It is NOT only displayed: `BottomSheet`
 * composes the dialog's accessible name out of it (`${sub} — ${title}`,
 * `bottom-sheet.tsx:61`), which is why it goes through `joinSegments` like
 * the card's does — an empty segment here would be audible.
 */
export function flightSheetSub(parts: { date: string; registration: string; typeLabel: string }): string {
  return joinSegments([parts.date, parts.registration, parts.typeLabel]);
}
