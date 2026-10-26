/**
 * Pure derivations behind the phone faces of the two registries (story 15.5,
 * AD-6) — the fleet's hours bar, the pilot row's flag, and the avatar of a
 * person row. They live here, not in the consoles, because they are the part
 * an e2e cannot prove in a discriminating way: "nobody flew this month", "one
 * aircraft flew everything", "the person has BOTH a suspension and an expired
 * document" are boundary cases a fixture can barely fabricate and never
 * cheaply.
 *
 * Nothing here imports a service, so `@/lib/env` never rides along into the
 * unit tests (the 3-occurrence lesson in CLAUDE.md).
 */
import type { AvatarColor } from '@/components/ui/avatar';
import { tierOf } from '@/lib/expiry-status';

/**
 * Width of a fleet card's hours bar, in percent of the track.
 *
 * The template normalizes on the aircraft that flew the MOST
 * (`barW = hours/maxH*100%`, script 640-644) and so does this — but the max is
 * the one of the CURRENT PAGE (20 cards), not of the whole fleet: the reader
 * that feeds it (`sumFlightMinutesByAircraft`) is batched over the page's ids,
 * exactly like `getEffectiveRates`/`listReservedAircraftIds` beside it. The bar
 * is therefore a comparison INSIDE the page, and the caption above it names the
 * window ("Ore mese") so the number itself is never ambiguous.
 *
 * `maxMinutes <= 0` (nobody flew) yields 0 rather than the template's
 * `Math.max(1, …)` fudge: an empty track says "no activity", a full one on a
 * fleet that never flew would say the opposite.
 */
export function hoursBarPercent(minutes: number, maxMinutes: number): number {
  if (maxMinutes <= 0 || minutes <= 0) return 0;
  const bounded = Math.min(minutes, maxMinutes);
  return Math.round((bounded / maxMinutes) * 100);
}

/** A blocking document (`ExpiryType.blocksBooking`) of one person, already reduced to whole days from today. */
export type BlockingDocument = { typeName: string; daysUntil: number };

export type PilotRowFlag =
  | { kind: 'suspended' }
  | { kind: 'expired'; typeName: string }
  | { kind: 'expiring'; typeName: string; daysUntil: number };

/**
 * The single chip the pilot row shows on its right, or `null` (ratifica
 * R-15.5-c).
 *
 * Priority is the template's — suspended beats everything — but the document
 * half is the app's own `ExpiryType.blocksBooking`, not the template's
 * "medico": the domain has ALREADY decided which documents stop a booking
 * (story 7.4) and a flight registration (14.4), so the chip says "this pilot
 * cannot fly today" instead of naming one document category and staying silent
 * about a licence that blocks just as hard.
 *
 * Thresholds come from the shared `tierOf` (0 = scaduto, 1 = <=7g, 2 = <=30g):
 * an expired blocking document is `expired`, one due within 30 days is
 * `expiring`, anything further out gets no chip — a row that always carries a
 * chip carries no signal.
 *
 * Ties are broken by `typeName` so two documents expiring the same day always
 * produce the same chip (a row that flickers between two labels across renders
 * would be a heisenbug in every screenshot test).
 */
export function pilotRowFlag(input: { suspended: boolean; blockingDocuments: BlockingDocument[] }): PilotRowFlag | null {
  if (input.suspended) return { kind: 'suspended' };

  const mostUrgent = input.blockingDocuments.reduce<BlockingDocument | null>((best, document) => {
    if (best === null) return document;
    if (document.daysUntil !== best.daysUntil) return document.daysUntil < best.daysUntil ? document : best;
    return document.typeName < best.typeName ? document : best;
  }, null);

  if (mostUrgent === null) return null;

  const tier = tierOf(mostUrgent.daysUntil);
  if (tier === 0) return { kind: 'expired', typeName: mostUrgent.typeName };
  if (tier === 1 || tier === 2) return { kind: 'expiring', typeName: mostUrgent.typeName, daysUntil: mostUrgent.daysUntil };
  return null;
}

/**
 * The five `.avatar` tones of the design system, in the template's own order
 * (`avColors`, script 653). The template picks by `p.id % 5` on a numeric id;
 * ours are cuids, so the index is a checksum of the string — DETERMINISTIC by
 * requirement (AC 2): the same person must keep the same colour across renders,
 * pages and reloads, or the list becomes a disco on every `router.refresh()`.
 */
const AVATAR_COLORS: readonly AvatarColor[] = ['', 'amber', 'green', 'violet', 'red'];

export function avatarColorFor(id: string): AvatarColor {
  let sum = 0;
  for (let index = 0; index < id.length; index += 1) sum += id.charCodeAt(index);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]!;
}

/**
 * Two initials for the row's avatar, in the order the row's title uses
 * (`lastName firstName`). Empty parts are skipped rather than rendered as
 * spaces, and the result is uppercased — the `.avatar` box is 30px and mono, so
 * a lowercase or blank glyph reads as a rendering bug.
 */
export function initialsOf(firstName: string, lastName: string): string {
  const first = lastName.trim().charAt(0) + firstName.trim().charAt(0);
  return (first.trim() === '' ? (firstName.trim().charAt(0) || lastName.trim().charAt(0)) : first).toUpperCase();
}
