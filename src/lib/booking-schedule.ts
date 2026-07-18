/**
 * Booking calendar data-prep (story 7.2 origin; extracted story 12.12 AC 1
 * so the Overview's embedded day timeline and the full Pianificazione page
 * — `dashboard/bookings/page.tsx` — share the EXACT SAME projection, never
 * a second implementation). Pure, server-only functions: turns a flat list
 * of `BookingListItem`s into day/week timeline projections, positioned as
 * `top`/`height`/`left`/`width` PERCENTAGES of the configured opening-hours
 * window (Contesto: "cambia la PRESENTAZIONE, non la meccanica").
 */
import { APP_TIMEZONE } from '@/lib/time';
import { addDaysDateOnly, zonedMidnightUtc, zonedWallTime } from '@/lib/zoned-time';
import type { BookingListItem } from '@/server/services/bookings.service';

/** A day-view block, already positioned — `top`/`height` are percentages of the day-view window, reused as `left`/`width` by `schedule.tsx`. */
export type CalendarDayBlock = {
  id: string;
  aircraftId: string;
  top: number;
  height: number;
  clampedTop: boolean;
  clampedBottom: boolean;
  timeLabel: string;
  personName: string;
  instructorProfileId: string | null;
  instructorName: string | null;
};

/** A week-view (booking, day) overlap — story 12.3 only reads this for PER-DAY COUNTS, never individual chips. */
export type CalendarWeekChip = {
  id: string;
  aircraftId: string;
  dateOnly: string;
  timeLabel: string;
  clampedStart: boolean;
  clampedEnd: boolean;
  personName: string;
  instructorProfileId: string | null;
  instructorName: string | null;
};

/**
 * The day-view horizontal axis (Contesto: "06:00–22:00 Europe/Rome") —
 * DEFAULT bounds, in minutes from midnight, used whenever
 * `sched.openTime`/`sched.closeTime` are not configured (story 12.11, AC 4).
 */
export const DEFAULT_WINDOW_START_MINUTES = 6 * 60;
export const DEFAULT_WINDOW_END_MINUTES = 22 * 60;
const MINUTES_PER_DAY = 24 * 60;

/**
 * A block is never rendered with zero (or near-zero) visible width, even
 * for a booking that is entirely clamped away (Contesto: "MAI nascosti").
 */
const MIN_BLOCK_HEIGHT_PERCENT = 8;

/** `"HH:MM"` -> minutes since midnight — same tiny private parser as `bookings.service.ts#minutesOfDay`/`stats.service.ts#minutesOfDay`, not shared (Dev Notes: one-line, single-file-local helper over the identical `sched.*` string format). */
export function minutesOfDay(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number) as [number, number];
  return hour * 60 + minute;
}

/** Resolves the day-view axis bounds from `sched.openTime`/`closeTime` (AC 4) — BOTH must be present and form a real (`end > start`) window, or the default 06:00-22:00 wins (same backward-safe rule as the booking-window 422 check, `bookings.service.ts#assertWithinSchedulingWindow`). */
export function resolveWindowMinutes(openTime: string | null, closeTime: string | null): { start: number; end: number } {
  if (openTime && closeTime) {
    const start = minutesOfDay(openTime);
    const end = minutesOfDay(closeTime);
    if (end > start) return { start, end };
  }
  return { start: DEFAULT_WINDOW_START_MINUTES, end: DEFAULT_WINDOW_END_MINUTES };
}

export function wallMinutesOfDay(instant: Date): number {
  const { hour, minute } = zonedWallTime(instant, APP_TIMEZONE);
  return hour * 60 + minute;
}

export function formatWallClock(instant: Date): string {
  const { hour, minute } = zonedWallTime(instant, APP_TIMEZONE);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function clampToWindowPercent(rawMinutes: number, windowSpanMinutes: number): number {
  return (Math.min(windowSpanMinutes, Math.max(0, rawMinutes)) / windowSpanMinutes) * 100;
}

/**
 * Projects every booking overlapping `dateOnly` (Europe/Rome) into an
 * ALREADY-POSITIONED block — SERVER-SIDE, via `zonedWallTime`/
 * `zonedMidnightUtc` (`zoned-time.ts`, story 7.2 Task 1): the client never
 * redoes this conversion (lesson 7.1: "container UTC vs display CEST").
 *
 * A booking that starts before this day (or before the window start) is
 * clamped to the top/left edge with `clampedTop`; one that ends after this
 * day (or after the window end) is clamped to the bottom/right edge with
 * `clampedBottom` — EITHER WAY IT IS STILL RENDERED (Contesto: "MAI
 * nascosti"), just clamped, with the REAL (unclamped) `HH:MM–HH:MM` always
 * shown as `timeLabel`.
 */
export function projectDayBlocks(bookings: BookingListItem[], dateOnly: string, windowStartMinutes: number, windowEndMinutes: number): CalendarDayBlock[] {
  const dayStart = zonedMidnightUtc(dateOnly, APP_TIMEZONE);
  const dayEnd = zonedMidnightUtc(addDaysDateOnly(dateOnly, 1), APP_TIMEZONE);
  const windowSpanMinutes = windowEndMinutes - windowStartMinutes;

  const blocks: CalendarDayBlock[] = [];
  for (const booking of bookings) {
    const startsAt = new Date(booking.startsAt);
    const endsAt = new Date(booking.endsAt);
    if (endsAt <= dayStart || startsAt >= dayEnd) continue; // does not overlap this day at all

    const startsBeforeDay = startsAt < dayStart;
    const endsAtOrAfterDay = endsAt >= dayEnd;
    const startMinutesOfDay = startsBeforeDay ? 0 : wallMinutesOfDay(startsAt);
    const endMinutesOfDay = endsAtOrAfterDay ? MINUTES_PER_DAY : wallMinutesOfDay(endsAt);

    const rawTop = startMinutesOfDay - windowStartMinutes;
    const rawBottom = endMinutesOfDay - windowStartMinutes;
    const top = clampToWindowPercent(rawTop, windowSpanMinutes);
    const bottom = clampToWindowPercent(rawBottom, windowSpanMinutes);

    // Review 7.2 F2: after the min-height inflation, re-anchor the top so
    // `top + height` never exceeds 100% — a bottom-clamped short block must
    // pin AT the bottom edge (the ▼ indicator shows), never render below the
    // grid (the exact mirror of the before-window-start min-height case above).
    const height = Math.max(bottom - top, MIN_BLOCK_HEIGHT_PERCENT);
    blocks.push({
      id: booking.id,
      aircraftId: booking.aircraftId,
      top: Math.min(top, 100 - height),
      height,
      clampedTop: rawTop < 0,
      clampedBottom: rawBottom > windowSpanMinutes,
      timeLabel: `${formatWallClock(startsAt)}–${formatWallClock(endsAt)}`,
      personName: booking.personName,
      instructorProfileId: booking.instructorProfileId,
      instructorName: booking.instructorName,
    });
  }
  return blocks;
}

/**
 * Projects every booking overlapping any of `weekDates` into a (booking,
 * day) overlap record — one PER (booking, day) it overlaps, so a booking
 * spanning midnight appears once in each neighboring day's count. Story
 * 12.3 reads this ONLY for per-day counts (Contesto: the prototype's own
 * week view has no per-aircraft chip matrix, just a 7-cell grid of counts).
 */
export function projectWeekChips(bookings: BookingListItem[], weekDates: string[]): CalendarWeekChip[] {
  const chips: CalendarWeekChip[] = [];
  for (const dateOnly of weekDates) {
    const dayStart = zonedMidnightUtc(dateOnly, APP_TIMEZONE);
    const dayEnd = zonedMidnightUtc(addDaysDateOnly(dateOnly, 1), APP_TIMEZONE);
    for (const booking of bookings) {
      const startsAt = new Date(booking.startsAt);
      const endsAt = new Date(booking.endsAt);
      if (endsAt <= dayStart || startsAt >= dayEnd) continue;

      chips.push({
        id: `${booking.id}:${dateOnly}`,
        aircraftId: booking.aircraftId,
        dateOnly,
        timeLabel: `${formatWallClock(startsAt)}–${formatWallClock(endsAt)}`,
        clampedStart: startsAt < dayStart,
        clampedEnd: endsAt >= dayEnd,
        personName: booking.personName,
        instructorProfileId: booking.instructorProfileId,
        instructorName: booking.instructorName,
      });
    }
  }
  return chips;
}
