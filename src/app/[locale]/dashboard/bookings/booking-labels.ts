/**
 * `BookingsPage` label builders — extracted from `bookings/page.tsx` (story
 * 12.12 AC 1, alongside the day-block data-prep move to
 * `@/lib/booking-schedule`): the Overview's embedded `Schedule`/
 * `BookingsTable` (AdminOverview) reuse the SAME `BookingsPage` translation
 * namespace, so this label-building has exactly one implementation instead
 * of drifting between the full Pianificazione page and the Overview widget.
 * Pure, server-only functions — `bookings/page.tsx` itself renders
 * byte-identical output to before this extraction.
 */
import type { getTranslations } from 'next-intl/server';
import type { EditBookingFormLabels } from './edit-booking-form';
import type { BookingsTableLabels } from './bookings-table';
import type { NewBookingFormLabels } from './new-booking-form';
import type { ScheduleLabels } from './schedule';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * The human description of the airfield's booking window (story 15.4, ratifica
 * R-15.4-g) — the tail of the `BOOKING_OUTSIDE_WINDOW` message.
 *
 * The server raises that one code for TWO independent settings (the
 * `openTime`-`closeTime` window and `maxAdvanceDays`,
 * `bookings.service.ts#assertWithinSchedulingWindow`) and carries no details
 * telling them apart, so the message states whichever of the two is actually
 * configured — the pair when both are, and nothing at all when neither is
 * (in which case the 422 cannot be raised in the first place, and the callers
 * below fall back to the generic message).
 */
export function buildSchedulingWindowSummary(
  t: Translator,
  settings: { openTime: string | null; closeTime: string | null; maxAdvanceDays: number | null },
): string {
  const parts: string[] = [];
  if (settings.openTime && settings.closeTime) {
    parts.push((t.raw('form.schedulingWindow.hours') as string).replace('{open}', settings.openTime).replace('{close}', settings.closeTime));
  }
  if (settings.maxAdvanceDays !== null) {
    parts.push((t.raw('form.schedulingWindow.advance') as string).replace('{days}', String(settings.maxAdvanceDays)));
  }
  return parts.join(', ');
}

/** Shared by both booking forms: the window message when there IS a window to state, the existing generic one otherwise. */
function outsideWindowMessage(t: Translator, windowSummary: string, genericKey: string): string {
  if (windowSummary.length === 0) return t(genericKey);
  return (t.raw('form.errors.BOOKING_OUTSIDE_WINDOW') as string).replace('{window}', windowSummary);
}

export function buildScheduleLabels(t: Translator): ScheduleLabels {
  return {
    cardTitle: t('schedule.cardTitle'),
    cardTitleToday: t('schedule.cardTitleToday'),
    prev: t('calendar.toolbar.prev'),
    today: t('calendar.toolbar.today'),
    next: t('calendar.toolbar.next'),
    dayView: t('calendar.toolbar.dayView'),
    weekView: t('calendar.toolbar.weekView'),
    viewToggleLabel: t('calendar.toolbar.viewToggleLabel'),
    filters: t('schedule.filters'),
    filtersDone: t('schedule.filtersDone'),
    filtersReset: t('schedule.filtersReset'),
    filtersAll: t('schedule.filtersAll'),
    filtersAircraft: t('schedule.filtersAircraft'),
    filtersInstructor: t('schedule.filtersInstructor'),
    prevMonth: t('schedule.prevMonth'),
    nextMonth: t('schedule.nextMonth'),
    aog: t('schedule.aog'),
    available: t('schedule.available'),
    outOfService: t('calendar.outOfService'),
    dayEmpty: t('calendar.dayEmpty'),
    noAircraft: t('calendar.noAircraft'),
    clampedStartHint: t('calendar.clampedStartHint'),
    clampedEndHint: t('calendar.clampedEndHint'),
    weekBookingsCountTemplate: t.raw('schedule.weekBookingsCount') as string,
    occupied: t('occupied'),
    mobile: {
      agendaCountTemplate: t.raw('schedule.mobile.agendaCount') as string,
      nowTemplate: t.raw('schedule.mobile.now') as string,
      aogTitleTemplate: t.raw('schedule.mobile.aogTitle') as string,
      openDetail: t('schedule.mobile.openDetail'),
      close: t('schedule.mobile.close'),
      today: t('schedule.mobile.today'),
      time: t('schedule.mobile.time'),
      pilot: t('list.table.pilot'),
      instructor: t('schedule.filtersInstructor'),
      aircraft: t('list.table.aircraft'),
      notes: t('form.notes'),
      reason: t('schedule.mobile.reason'),
      phase: {
        inProgress: t('schedule.mobile.phase.inProgress'),
        completed: t('schedule.mobile.phase.completed'),
        scheduled: t('schedule.mobile.phase.scheduled'),
      },
    },
  };
}

export function buildNewBookingFormLabels(t: Translator, schedulingWindowSummary: string): NewBookingFormLabels {
  return {
    title: t('form.title'),
    subtitle: t('list.cardTitle'),
    selectPlaceholder: t('form.selectPlaceholder'),
    aircraft: t('form.aircraft'),
    outOfServiceSuffix: t.raw('form.outOfServiceSuffix') as string,
    person: t('form.person'),
    noPersonAvailable: t('form.noPersonAvailable'),
    instructorOptional: t('form.instructorOptional'),
    noInstructor: t('form.noInstructor'),
    bookingTarget: t('form.bookingTarget'),
    bookForMe: t('form.bookForMe'),
    bookForStudent: t('form.bookForStudent'),
    student: t('form.student'),
    noStudentAvailable: t('form.noStudentAvailable'),
    startsAt: t('form.startsAt'),
    endsAt: t('form.endsAt'),
    notes: t('form.notes'),
    submit: t('form.submit'),
    requiredField: t('form.requiredField'),
    invalidRange: t('form.invalidRange'),
    errors: {
      AIRCRAFT_OUT_OF_SERVICE: t.raw('form.errors.AIRCRAFT_OUT_OF_SERVICE') as string,
      BOOKING_IN_PAST: t('form.errors.BOOKING_IN_PAST'),
      PERSON_NOT_BOOKABLE: t('form.errors.PERSON_NOT_BOOKABLE'),
      EXPIRED_DOCUMENTS: t.raw('form.errors.EXPIRED_DOCUMENTS') as string,
      BOOKING_OUTSIDE_WINDOW: outsideWindowMessage(t, schedulingWindowSummary, 'form.errors.generic'),
      overlap: t('form.errors.overlap'),
      generic: t('form.errors.generic'),
    },
    success: t('form.success'),
    successWithWarnings: t('form.successWithWarnings'),
    force: {
      title: t('form.force.title'),
      description: t('form.force.description'),
      reasonLabel: t('form.force.reasonLabel'),
      submit: t('form.force.submit'),
      cancel: t('form.force.cancel'),
      requiredReason: t('form.force.requiredReason'),
      generic: t('form.force.generic'),
    },
  };
}

export function buildEditBookingFormLabels(t: Translator, schedulingWindowSummary: string): EditBookingFormLabels {
  return {
    title: t('list.actions.moveTitle'),
    subtitle: t('list.cardTitle'),
    cancel: t('list.actions.dismiss'),
    save: t('list.actions.save'),
    selectPlaceholder: t('form.selectPlaceholder'),
    aircraft: t('form.aircraft'),
    outOfServiceSuffix: t.raw('form.outOfServiceSuffix') as string,
    startsAt: t('form.startsAt'),
    endsAt: t('form.endsAt'),
    notes: t('form.notes'),
    requiredField: t('form.requiredField'),
    invalidRange: t('form.invalidRange'),
    errors: {
      BOOKING_ALREADY_STARTED: t('list.actions.errors.BOOKING_ALREADY_STARTED'),
      BOOKING_IN_PAST: t('form.errors.BOOKING_IN_PAST'),
      AIRCRAFT_OUT_OF_SERVICE: t.raw('form.errors.AIRCRAFT_OUT_OF_SERVICE') as string,
      EXPIRED_DOCUMENTS: t.raw('list.actions.errors.EXPIRED_DOCUMENTS') as string,
      BOOKING_OUTSIDE_WINDOW: outsideWindowMessage(t, schedulingWindowSummary, 'list.actions.errors.generic'),
      conflict: t('list.actions.errors.conflict'),
      generic: t('list.actions.errors.generic'),
    },
  };
}

export function buildBookingsTableLabels(t: Translator): BookingsTableLabels {
  return {
    cardTitle: t('list.cardTitle'),
    pendingSummary: t.raw('list.pendingSummary') as string,
    filteredSummary: t.raw('list.filteredSummary') as string,
    newButton: t('list.newButton'),
    occupied: t('occupied'),
    exportLabel: t('list.exportLabel'),
    exportXls: t('list.exportXls'),
    exportPdf: t('list.exportPdf'),
    empty: t('list.empty'),
    table: {
      pilot: t('list.table.pilot'),
      startsAt: t('list.table.startsAt'),
      endsAt: t('list.table.endsAt'),
      aircraft: t('list.table.aircraft'),
      status: t('list.table.status'),
      actions: t('list.table.actions'),
    },
    status: {
      PENDING: t('list.status.PENDING'),
      APPROVED: t('list.status.APPROVED'),
      DENIED: t('list.status.DENIED'),
      FLOWN: t('list.status.FLOWN'),
      NO_SHOW: t('list.status.NO_SHOW'),
      CANCELLED: t('list.status.CANCELLED'),
    },
    actions: {
      approve: t('list.actions.approve'),
      reject: t('list.actions.reject'),
      move: t('list.actions.move'),
      markFlown: t('list.actions.markFlown'),
      markNoShow: t('list.actions.markNoShow'),
      cancel: t('list.actions.cancel'),
      reopen: t('list.actions.reopen'),
      cancelPrompt: t('list.actions.cancelPrompt'),
      cancelConfirm: t('list.actions.cancelConfirm'),
      dismiss: t('list.actions.dismiss'),
      moveTitle: t('list.actions.moveTitle'),
      save: t('list.actions.save'),
      approveSuccess: t('list.actions.approveSuccess'),
      rejectSuccess: t('list.actions.rejectSuccess'),
      reopenSuccess: t('list.actions.reopenSuccess'),
      flownSuccess: t('list.actions.flownSuccess'),
      noShowSuccess: t('list.actions.noShowSuccess'),
      moveSuccess: t('list.actions.moveSuccess'),
      cancelSuccess: t('list.actions.cancelSuccess'),
      errors: {
        BOOKING_ALREADY_STARTED: t('list.actions.errors.BOOKING_ALREADY_STARTED'),
        BOOKING_TRANSITION_INVALID: t('list.actions.errors.BOOKING_TRANSITION_INVALID'),
        BOOKING_DENY_REASON_REQUIRED: t('list.actions.errors.BOOKING_DENY_REASON_REQUIRED'),
        EXPIRED_DOCUMENTS: t.raw('list.actions.errors.EXPIRED_DOCUMENTS') as string,
        AIRCRAFT_OUT_OF_SERVICE: t.raw('list.actions.errors.AIRCRAFT_OUT_OF_SERVICE') as string,
        conflict: t('list.actions.errors.conflict'),
        generic: t('list.actions.errors.generic'),
      },
    },
    denyModal: {
      title: t('list.denyModal.title'),
      subtitle: t('list.denyModal.subtitle'),
      reasonPlaceholder: t('list.denyModal.reasonPlaceholder'),
      reasonRequired: t('list.denyModal.reasonRequired'),
      submit: t('list.denyModal.submit'),
      cancel: t('list.denyModal.cancel'),
    },
    mobile: {
      openDetail: t('list.mobile.openDetail'),
      close: t('list.mobile.close'),
      statusAll: t('list.mobile.statusAll'),
      startsAt: t('list.table.startsAt'),
      endsAt: t('list.table.endsAt'),
      aircraft: t('list.table.aircraft'),
      instructor: t('list.table.instructor'),
      notes: t('form.notes'),
      denyReason: t('list.mobile.denyReason'),
    },
  };
}
