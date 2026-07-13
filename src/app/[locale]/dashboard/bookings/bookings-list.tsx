'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';
import { formatDateTime, formatTimeOfDay } from '@/lib/time';
import type { AircraftOption } from './new-booking-form';
import { TruncatedCell } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { DateTimeField, type DateTimeFieldLabels } from '@/components/ui/date-time-field';
import { CircleXIcon, MoveIcon } from '@/components/ui/icons';

export type BookingRowDto = {
  id: string;
  aircraftId: string;
  aircraftRegistration: string;
  personId: string;
  personName: string;
  instructorProfileId: string | null;
  instructorName: string | null;
  /** ISO 8601 string (server `Date` already serialized, `page.tsx`). */
  startsAt: string;
  /** ISO 8601 string (server `Date` already serialized, `page.tsx`). */
  endsAt: string;
  notes: string | null;
};

export type BookingsListLabels = {
  table: {
    aircraft: string;
    date: string;
    time: string;
    person: string;
    instructor: string;
    noInstructor: string;
    actions: string;
  };
  empty: string;
  /** Reused from `NewBookingFormLabels` (Task 4: same fields, same copy — no point translating "Velivolo"/"Inizio"/"Fine"/"Note" a second time). */
  form: {
    selectPlaceholder: string;
    aircraft: string;
    outOfServiceSuffix: string;
    startsAt: string;
    endsAt: string;
    startsAtTime: string;
    endsAtTime: string;
    notes: string;
    requiredField: string;
    invalidRange: string;
    errors: {
      AIRCRAFT_OUT_OF_SERVICE: string;
      BOOKING_IN_PAST: string;
    };
    /** Story 12.5 (AC 1) — shared `DateTimeField` a11y/error strings for `startsAt`/`endsAt`. */
    dateTimeField: DateTimeFieldLabels;
  };
  actions: {
    move: string;
    cancel: string;
    cancelPrompt: string;
    cancelConfirm: string;
    dismiss: string;
    moveTitle: string;
    save: string;
    moveSuccess: string;
    cancelSuccess: string;
    errors: {
      BOOKING_ALREADY_STARTED: string;
      /** TD-5, AC 5: the "moving to a different day" 422 — `{documents}` placeholder, same `details.documents` shape as the create form's own `EXPIRED_DOCUMENTS`. */
      EXPIRED_DOCUMENTS: string;
      /** Covers BOTH 409 causes (overlap on move, already-cancelled race) — see module doc-comment. */
      conflict: string;
      generic: string;
    };
  };
};

type BookingsListProps = {
  items: BookingRowDto[];
  aircraftOptions: AircraftOption[];
  /** `bookings.manage.any` (staff/admin) — sees Sposta/Cancella on EVERY row. */
  canManageAny: boolean;
  /** `bookings.manage.own` (pilot/instructor) — sees Sposta/Cancella only on OWN rows (see `isOwnRow`). Absent entirely for STUDENT, so a row that happens to match `ownPersonId` never renders a dead-end action for them. */
  canManageOwn: boolean;
  ownPersonId: string | null;
  ownInstructorProfileId: string | null;
  locale: 'it' | 'en';
  labels: BookingsListLabels;
};

/** TD-5, AC 5: `details` also carries `documents` on an `EXPIRED_DOCUMENTS` 422 (`{ typeName, expiresAt }[]`, same shape as `createBooking`'s, `new-booking-form.tsx`'s own `ApiErrorBody`). */
type ApiErrorBody = { error?: { code?: string; details?: { reason?: string; documents?: Array<{ typeName: string; expiresAt: string }> } } };

async function errorCodeOf(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return (body as ApiErrorBody | null)?.error?.code ?? null;
}

async function errorReasonOf(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  return (body as ApiErrorBody | null)?.error?.details?.reason ?? '';
}

/** TD-5, AC 5 — the blocking document type names off an `EXPIRED_DOCUMENTS` 422, same extraction as `new-booking-form.tsx`. */
async function errorDocumentNamesOf(response: Response): Promise<string[]> {
  const body: unknown = await response.json().catch(() => null);
  return ((body as ApiErrorBody | null)?.error?.details?.documents ?? []).map((document) => document.typeName);
}

/**
 * `<input type="datetime-local">` value from an ISO instant, using the
 * BROWSER's own local wall-clock getters (`getFullYear`/.../`getMinutes`,
 * never the UTC ones) — the exact inverse of `new-booking-form.tsx`'s own
 * `new Date(value).toISOString()` write direction (Dev Notes 7.1: "il
 * valore datetime-local è wall-time del browser").
 */
function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * "Prossime prenotazioni" (story 7.1's table, story 7.3's row actions) — the
 * ONLY interactive surface for booking edit/cancel (Contesto: "il calendario
 * resta read-only"). Design choice (declared, Task 4): rather than a
 * separate `booking-row-actions.tsx` bolted onto a still-server-rendered
 * table, the WHOLE list (table + per-row state machine) is ONE client
 * component receiving the already-`status: 'ACTIVE'`-filtered, serialized
 * DTOs as a prop (`page.tsx` keeps the READ server-side, AD-1) — per-row
 * "is this row being moved / confirming cancel" state must be exclusive
 * across rows (same reasoning as `ExpiriesPanel`'s `editingId`/
 * `confirmingDeleteId`), which is far simpler to own in ONE parent than to
 * thread between a server-rendered table shell and scattered client islands.
 * `router.refresh()` on any success — no local list reconciliation (AD-1):
 * a cancelled row disappears because the server re-fetches with the SAME
 * `status: 'ACTIVE'` filter, a moved row's new time/aircraft appears the
 * same way.
 *
 * **Ownership gate mirrors the service exactly** (`assertOwnAccessAndTiming`,
 * `bookings.service.ts`) so the UI never dangles a button that would only
 * ever 403/422: `canManageAny` sees every row; `canManageOwn` sees a row
 * only when `personId === ownPersonId` OR `instructorProfileId ===
 * ownInstructorProfileId`; an actor with NEITHER (e.g. an allievo who
 * happens to be the `personId` on a school booking an instructor made for
 * them) sees no actions at all on any row — the service is still "il
 * guardiano" (AD-5), this is purely presentational.
 *
 * **409 is never split into "overlap" vs "already cancelled"** (Dev Notes,
 * declared deviation): `ConflictError` carries no distinguishing stable
 * `code` (unlike `ValidationError`) across the WHOLE codebase, and adding
 * one just for this story's UI would widen a shared base class used by
 * ~20 other services. One generic `errors.conflict` message covers both —
 * phrased to suggest a reload, which `router.refresh()` (called on every
 * OTHER successful action anyway) naturally satisfies.
 */
export function BookingsList({
  items,
  aircraftOptions,
  canManageAny,
  canManageOwn,
  ownPersonId,
  ownInstructorProfileId,
  locale,
  labels,
}: BookingsListProps) {
  const router = useRouter();
  const [movingId, setMovingId] = useState<string | null>(null);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function isOwnRow(booking: BookingRowDto): boolean {
    if (!canManageOwn) return false;
    if (booking.personId === ownPersonId) return true;
    return booking.instructorProfileId !== null && booking.instructorProfileId === ownInstructorProfileId;
  }

  function requestMove(id: string): void {
    setConfirmingCancelId(null);
    setCancelError(null);
    setMovingId(id);
  }

  function requestCancel(id: string): void {
    setMovingId(null);
    setCancelError(null);
    setConfirmingCancelId(id);
  }

  function handleMoved(): void {
    setMovingId(null);
    setFeedback(labels.actions.moveSuccess);
    router.refresh();
  }

  async function confirmCancel(id: string): Promise<void> {
    setCancelling(true);
    setCancelError(null);
    const response = await fetch(`/api/v1/bookings/${id}/cancel`, { method: 'POST' });
    setCancelling(false);

    if (!response.ok) {
      if (response.status === 409) {
        setCancelError(labels.actions.errors.conflict);
        return;
      }
      const code = await errorCodeOf(response);
      setCancelError(code === 'BOOKING_ALREADY_STARTED' ? labels.actions.errors.BOOKING_ALREADY_STARTED : labels.actions.errors.generic);
      return;
    }

    setConfirmingCancelId(null);
    setFeedback(labels.actions.cancelSuccess);
    router.refresh();
  }

  const showActionsColumn = canManageAny || canManageOwn;
  const columnCount = showActionsColumn ? 6 : 5;

  return (
    <div>
      {feedback ? (
        <p role="status" data-testid="bookings-list-feedback" className="mt-4 text-sm text-[#346538]">
          {feedback}
        </p>
      ) : null}

      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">
              <th className="px-5 py-3">{labels.table.aircraft}</th>
              <th className="px-5 py-3">{labels.table.date}</th>
              <th className="px-5 py-3">{labels.table.time}</th>
              <th className="px-5 py-3">{labels.table.person}</th>
              <th className="px-5 py-3">{labels.table.instructor}</th>
              {showActionsColumn ? <th className="px-5 py-3">{labels.table.actions}</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-5 py-8 text-center text-mid-gray">
                  {labels.empty}
                </td>
              </tr>
            ) : (
              items.map((booking) => {
                if (movingId === booking.id) {
                  return (
                    <tr key={booking.id} data-testid="booking-row-moving" className="border-b border-hairline last:border-b-0">
                      <td colSpan={columnCount} className="px-5 py-5">
                        <MoveBookingForm
                          booking={booking}
                          aircraftOptions={aircraftOptions}
                          labels={labels}
                          onCancel={() => setMovingId(null)}
                          onSuccess={handleMoved}
                        />
                      </td>
                    </tr>
                  );
                }

                const startsAt = new Date(booking.startsAt);
                const endsAt = new Date(booking.endsAt);
                const canManageRow = canManageAny || isOwnRow(booking);

                return (
                  <tr key={booking.id} className="border-b border-hairline last:border-b-0" data-testid="booking-row">
                    <td className="whitespace-nowrap px-5 py-3 align-middle font-medium text-ink">{booking.aircraftRegistration}</td>
                    <td className="px-5 py-3 align-middle whitespace-nowrap text-ink">
                      {/* `formatDateTime` is "DD/MM/YYYY, HH:MM" (Intl's it-IT/en-IE locale separator) — split on the comma, not a bare space. */}
                      {formatDateTime(startsAt, locale).split(',')[0]}
                    </td>
                    <td className="px-5 py-3 align-middle whitespace-nowrap text-ink">
                      {formatTimeOfDay(startsAt, locale)}–{formatTimeOfDay(endsAt, locale)}
                    </td>
                    <td className="px-5 py-3 align-middle text-ink"><TruncatedCell value={booking.personName} className="max-w-[180px]" /></td>
                    <td className="px-5 py-3 align-middle text-mid-gray">
                      {booking.instructorName ? <TruncatedCell value={booking.instructorName} className="max-w-[180px]" /> : labels.table.noInstructor}
                    </td>
                    {showActionsColumn ? (
                      <td className="px-5 py-3 align-middle" data-testid="booking-row-actions">
                        {confirmingCancelId === booking.id ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-mid-gray">{labels.actions.cancelPrompt}</span>
                              <Button size="sm"
                                type="button"
                                onClick={() => void confirmCancel(booking.id)}
                                disabled={cancelling}
                                data-testid="booking-cancel-confirm"
                                className="min-h-[36px]"
                              >
                                {labels.actions.cancelConfirm}
                              </Button>
                              <Button variant="outline" size="sm"
                                type="button"
                                onClick={() => setConfirmingCancelId(null)}
                                disabled={cancelling}
                                className="min-h-[36px]"
                              >
                                {labels.actions.dismiss}
                              </Button>
                            </div>
                            {cancelError ? (
                              <p role="alert" data-testid="booking-cancel-error" className="text-xs text-ember">
                                {cancelError}
                              </p>
                            ) : null}
                          </div>
                        ) : canManageRow ? (
                          <div className="flex gap-2">
                            <Button variant="outline" size="icon"
                              type="button"
                              onClick={() => requestMove(booking.id)}
                              data-testid="booking-move-action"
                              aria-label={labels.actions.move}
                              title={labels.actions.move}
                            >
                              <MoveIcon />
                            </Button>
                            <Button variant="outline" size="icon"
                              type="button"
                              onClick={() => requestCancel(booking.id)}
                              data-testid="booking-cancel-action"
                              aria-label={labels.actions.cancel}
                              title={labels.actions.cancel}
                            >
                              <CircleXIcon />
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

type MoveFormValues = {
  aircraftId: string;
  startsAt: string;
  endsAt: string;
  notes: string;
};

/** Same required-fields + range `superRefine` shape as `new-booking-form.tsx#buildFormSchema` — every field here is always required (unlike the create form's mode-conditional ones), so a plain refine suffices. */
const moveFormSchema = z.object({ aircraftId: z.string(), startsAt: z.string(), endsAt: z.string(), notes: z.string() }).superRefine((value, ctx) => {
  if (value.aircraftId.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'requiredField', path: ['aircraftId'] });
  }
  if (value.startsAt.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'requiredField', path: ['startsAt'] });
  }
  if (value.endsAt.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'requiredField', path: ['endsAt'] });
  } else if (value.startsAt.length > 0 && value.endsAt <= value.startsAt) {
    ctx.addIssue({ code: 'custom', message: 'invalidRange', path: ['endsAt'] });
  }
});

type MoveBookingFormProps = {
  booking: BookingRowDto;
  aircraftOptions: AircraftOption[];
  labels: BookingsListLabels;
  onCancel: () => void;
  onSuccess: () => void;
};

/**
 * "Sposta prenotazione" per-row sub-form (AC 1/2) — mounted ONLY while its
 * row is the one being moved (`BookingsList`'s `movingId === booking.id`),
 * so `useForm`'s `defaultValues` are read fresh from the CURRENT `booking`
 * prop every time it (re)opens (review 2.4 F1 lesson, same fix as
 * `ExpiriesPanel`'s `EditExpiryRowForm`). ALWAYS sends all four editable
 * fields (`aircraftId`/`startsAt`/`endsAt`/`notes`) on submit — simpler than
 * diffing against the original, and valid against `updateBookingSchema`'s
 * "at least one field" refine regardless (resending an unchanged value is a
 * no-op PATCH).
 */
function MoveBookingForm({ booking, aircraftOptions, labels, onCancel, onSuccess }: MoveBookingFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [startsAtValue, setStartsAtValue] = useState(toDatetimeLocalValue(booking.startsAt));
  const [endsAtValue, setEndsAtValue] = useState(toDatetimeLocalValue(booking.endsAt));

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MoveFormValues>({
    resolver: zodResolver(moveFormSchema),
    defaultValues: {
      aircraftId: booking.aircraftId,
      startsAt: toDatetimeLocalValue(booking.startsAt),
      endsAt: toDatetimeLocalValue(booking.endsAt),
      notes: booking.notes ?? '',
    },
  });

  function fieldErrorLabel(fieldError: { message?: string } | undefined): string | null {
    if (!fieldError?.message) return null;
    return fieldError.message === 'invalidRange' ? labels.form.invalidRange : labels.form.requiredField;
  }

  async function onSubmit(values: MoveFormValues): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/bookings/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aircraftId: values.aircraftId,
        startsAt: new Date(values.startsAt).toISOString(),
        endsAt: new Date(values.endsAt).toISOString(),
        notes: values.notes.trim() === '' ? null : values.notes.trim(),
      }),
    });

    if (!response.ok) {
      if (response.status === 409) {
        setFormError(labels.actions.errors.conflict);
        return;
      }
      // TD-5, AC 5: a `Response` body can only be read ONCE — with a 3rd
      // possible follow-up read now added (`errorDocumentNamesOf`, alongside
      // the pre-existing `errorReasonOf`), every helper below reads its OWN
      // `.clone()` so each stays independently readable regardless of which
      // branch fires.
      const code = await errorCodeOf(response.clone());
      if (code === 'AIRCRAFT_OUT_OF_SERVICE') {
        setFormError(labels.form.errors.AIRCRAFT_OUT_OF_SERVICE.replace('{reason}', await errorReasonOf(response.clone())));
      } else if (code === 'BOOKING_IN_PAST') {
        setFormError(labels.form.errors.BOOKING_IN_PAST);
      } else if (code === 'BOOKING_ALREADY_STARTED') {
        setFormError(labels.actions.errors.BOOKING_ALREADY_STARTED);
      } else if (code === 'EXPIRED_DOCUMENTS') {
        // No `force` bypass on this endpoint (module doc-comment) — just the
        // message, same document-names extraction as the create form.
        setFormError(labels.actions.errors.EXPIRED_DOCUMENTS.replace('{documents}', (await errorDocumentNamesOf(response.clone())).join(', ')));
      } else {
        setFormError(labels.actions.errors.generic);
      }
      return;
    }

    onSuccess();
  }

  const inputClasses = cn(inputBaseClasses, 'mt-2 min-h-[44px] w-full');

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      data-testid="move-booking-form"
      className="space-y-4"
    >
      <h4 className="text-base font-medium text-ink">{labels.actions.moveTitle}</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`move-aircraft-${booking.id}`} className="block text-sm font-medium text-ink">
            {labels.form.aircraft}
          </label>
          <select
            id={`move-aircraft-${booking.id}`}
            aria-invalid={Boolean(errors.aircraftId)}
            className={inputClasses}
            {...register('aircraftId')}
          >
            <option value="">{labels.form.selectPlaceholder}</option>
            {aircraftOptions.map((aircraft) => (
              <option key={aircraft.id} value={aircraft.id} disabled={aircraft.status === 'OUT_OF_SERVICE'}>
                {aircraft.status === 'OUT_OF_SERVICE'
                  ? `${aircraft.registration} — ${labels.form.outOfServiceSuffix.replace('{reason}', aircraft.statusReason ?? '')}`
                  : aircraft.registration}
              </option>
            ))}
          </select>
          {fieldErrorLabel(errors.aircraftId) ? <p className="mt-1 text-xs text-ember">{fieldErrorLabel(errors.aircraftId)}</p> : null}
        </div>

        <div className="sm:col-span-2">
          <DateTimeField
            id={`move-starts-at-${booking.id}`}
            dateLabel={labels.form.startsAt}
            timeLabel={labels.form.startsAtTime}
            value={startsAtValue}
            onChange={(next) => {
              setStartsAtValue(next);
              setValue('startsAt', next);
            }}
            labels={labels.form.dateTimeField}
            ariaInvalid={Boolean(errors.startsAt)}
          />
          {fieldErrorLabel(errors.startsAt) ? <p className="mt-1 text-xs text-ember">{fieldErrorLabel(errors.startsAt)}</p> : null}
        </div>

        <div className="sm:col-span-2">
          <DateTimeField
            id={`move-ends-at-${booking.id}`}
            dateLabel={labels.form.endsAt}
            timeLabel={labels.form.endsAtTime}
            value={endsAtValue}
            onChange={(next) => {
              setEndsAtValue(next);
              setValue('endsAt', next);
            }}
            labels={labels.form.dateTimeField}
            ariaInvalid={Boolean(errors.endsAt)}
          />
          {fieldErrorLabel(errors.endsAt) ? <p className="mt-1 text-xs text-ember">{fieldErrorLabel(errors.endsAt)}</p> : null}
        </div>

        <div>
          <label htmlFor={`move-notes-${booking.id}`} className="block text-sm font-medium text-ink">
            {labels.form.notes}
          </label>
          <input id={`move-notes-${booking.id}`} maxLength={500} className={inputClasses} {...register('notes')} />
        </div>
      </div>

      {formError ? (
        <p role="alert" data-testid="move-booking-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting}
          data-testid="move-booking-save"
          className="min-h-[44px]"
        >
          {labels.actions.save}
        </Button>
        <Button variant="outline"
          type="button"
          onClick={onCancel}
          className="min-h-[44px]"
        >
          {labels.actions.dismiss}
        </Button>
      </div>
    </form>
  );
}
