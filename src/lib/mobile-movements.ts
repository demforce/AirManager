/**
 * Pure derivations of the mobile "Voli in transito" register (story 15.7,
 * AD-6) — the phone card's sub-line and the detail sheet's over-line. They
 * live here, outside `movements-table.tsx`, for the same reason
 * `mobile-logbook.ts`/`mobile-registries.ts`/`mobile-agenda.ts` do: they
 * encode edge cases that are invisible on a happy-path screenshot (a PENDING
 * or REJECTED request has NO `pprNumber`, a request with no ETD) and are
 * cheaper to prove with a unit test than with a fixture.
 *
 * The movement STATUS itself is deliberately absent: it is already derived
 * once, server-side, by `lib/ppr-movement-status.ts` +
 * `movements/page.tsx#movementStatusOf`, and there must never be a second
 * implementation of that boundary (AD-6).
 *
 * Pure by construction: no import of a service, hence no `@/lib/env` dragged
 * into the test (CLAUDE.md's eager-env rule).
 */
import { joinSegments } from './mobile-sub-line';

/**
 * `LIRN Napoli → LIRU Urbe`, the desktop "Rotta" cell's own form
 * (`movements-table.tsx:243-245`), or `null` when either end is missing.
 * Both fields are non-nullable in the DTO (`schemas/ppr.ts`), so `null` here
 * is the defensive branch, not the normal one; the caller decides whether it
 * becomes the "—" placeholder (a sheet row) or simply disappears (a composed
 * line).
 */
export function transitRouteLabel(origin: string, destination: string): string | null {
  const from = origin.trim();
  const to = destination.trim();
  if (from === '' || to === '') return null;
  return `${from} → ${to}`;
}

/** `Nome Cognome`, the desktop requester cell's own order (`movements-table.tsx:248`). */
export function requesterLabel(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

/**
 * The card's mono sub-line — the template's own `rotta · pilota · ETA`
 * (`AirOps Mobile` script 646), minus whatever this request does not have.
 * `etaLabel` arrives already formatted (time of day) and already prefixed by
 * its own translated word, because the formatter is locale-bound and this
 * module is not.
 */
export function transitCardSubLine(parts: { route: string | null; requester: string; etaLabel: string }): string {
  return joinSegments([parts.route, parts.requester, parts.etaLabel]);
}

/**
 * The detail sheet's mono over-line — the template's own `openVisit` sub
 * (`id · tipo`, script 601).
 *
 * `pprNumber` is `null` while a request is PENDING and stays `null` forever
 * on a REJECTED one (`schemas/ppr.ts:176`), and the `'ALL'` filter surfaces
 * both on this page. It is therefore OMITTED, never replaced by the "—"
 * placeholder: this string becomes half of the dialog's accessible name
 * (`${sub} — ${title}`, `bottom-sheet.tsx:61`), where a placeholder would be
 * read out as a second separator (review 15.5 F1).
 */
export function transitSheetSub(parts: { pprNumber: string | null; aircraftType: string }): string {
  return joinSegments([parts.pprNumber, parts.aircraftType]);
}
