'use client';

import { flightPicPerson } from '@/lib/flight-pic';
import { formatCents } from '@/lib/money';
import type { FlightListItemDto } from '@/lib/schemas/flights';
import { formatDateOnly, formatMinutes, formatTimeOfDay } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/dialog';
import { FlightStatusCell, flightTypeLabel, personLabel, type FlightsManagerLabels } from './flights-manager';

type FlightDetailSheetProps = {
  /** `null` = closed (AC 5) — the sheet is driven by an already-in-memory row from the table's own `flights` state, no extra round-trip (the new `GET /flights/{id}`, AC 6, is an independent additive API surface, not this sheet's data source). */
  flight: FlightListItemDto | null;
  onClose: () => void;
  /** Gates the Correggi/Annulla actions (AC 5) — same `flights.manage` gate as the row's own actions. */
  canManage: boolean;
  onCorrect: (flight: FlightListItemDto) => void;
  onCancel: (flight: FlightListItemDto) => void;
  labels: FlightsManagerLabels;
  moneyLocale: 'it' | 'en';
};

/** One `dt`/`dd` row — same layout convention as the registration form's `flight-result-panel`. */
function Field({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 sm:justify-start">
      <dt className="text-mid-gray">{term}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

/**
 * Flight detail sheet (story 12.3, AC 5) — read-only summary of a single
 * flight (route, times, duration, movements, contaore, notes, tipo/solo,
 * PIC, status/lineage, addebito breakdown) with, for `canManage`, the SAME
 * Correggi/Annulla actions the row itself offers (handed off to the parent's
 * existing dialog/panel — this component never re-implements them). Voli
 * storici pre-11.1 (departure/arrival/times null) fall back to `noValue`
 * ("—"), same pattern as the registry table (story 11.2).
 */
export function FlightDetailSheet({ flight, onClose, canManage, onCorrect, onCancel, labels, moneyLocale }: FlightDetailSheetProps) {
  const pic = flight ? flightPicPerson(flight) : null;

  return (
    <Sheet open={flight !== null} onClose={onClose} title={labels.detail.title}>
      {flight ? (
        <div data-testid="flight-detail-sheet" className="mt-5 space-y-6 text-sm">
          <dl className="space-y-2">
            <Field term={labels.list.table.date} value={formatDateOnly(flight.flightDate, moneyLocale)} />
            <Field
              term={labels.list.table.route}
              value={flight.departureAirfield && flight.arrivalAirfield ? `${flight.departureAirfield} → ${flight.arrivalAirfield}` : labels.list.table.noValue}
            />
            <Field
              term={labels.list.table.times}
              value={
                flight.takeoffAt && flight.landingAt
                  ? `${formatTimeOfDay(new Date(flight.takeoffAt), moneyLocale)}–${formatTimeOfDay(new Date(flight.landingAt), moneyLocale)}`
                  : labels.list.table.noValue
              }
            />
            <Field term={labels.list.table.duration} value={formatMinutes(flight.minutes)} />
            <Field term={labels.list.table.movements} value={`${flight.takeoffs} / ${flight.landings}`} />
            <Field
              term={labels.form.hourMeterStart}
              value={flight.hourMeterStart !== null ? String(flight.hourMeterStart) : labels.list.table.noValue}
            />
            <Field
              term={labels.form.hourMeterEnd}
              value={flight.hourMeterEnd !== null ? String(flight.hourMeterEnd) : labels.list.table.noValue}
            />
            <Field term={labels.list.table.aircraft} value={flight.aircraft.registration} />
            <Field term={labels.list.table.person} value={personLabel(flight.person)} />
            <Field term={labels.list.table.instructor} value={flight.instructor ? personLabel(flight.instructor) : labels.list.table.noInstructor} />
            <Field
              term={labels.list.table.type}
              value={flightTypeLabel(flight.flightType, labels.form.flightTypes) + (flight.isSolo ? ` — ${labels.list.table.soloSuffix}` : '')}
            />
            <Field term={labels.list.table.pic} value={pic ? personLabel(pic) : labels.list.table.noValue} />
            <Field term={labels.form.notes} value={flight.notes ?? labels.list.table.noValue} />
          </dl>

          <div>
            <FlightStatusCell flight={flight} labels={labels.list.table} locale={moneyLocale} />
          </div>

          <div className="rounded-nested border border-hairline bg-canvas p-4">
            <h4 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{labels.result.title}</h4>
            <dl className="mt-3 space-y-2">
              <Field term={labels.result.aircraftRate} value={`${formatCents(flight.breakdown.aircraftRateCentsPerHour, moneyLocale)}/h`} />
              <Field term={labels.result.aircraftAmount} value={formatCents(flight.breakdown.aircraftAmountCents, moneyLocale)} />
              {flight.breakdown.packageCoveredMinutes > 0 ? (
                <>
                  <Field term={labels.result.packageCovered} value={formatMinutes(flight.breakdown.packageCoveredMinutes)} />
                  <Field term={labels.result.chargedMinutes} value={formatMinutes(flight.breakdown.chargedMinutes)} />
                </>
              ) : null}
              {flight.breakdown.instructorRateCentsPerHour !== undefined && flight.breakdown.instructorAmountCents !== undefined ? (
                <>
                  <Field term={labels.result.instructorRate} value={`${formatCents(flight.breakdown.instructorRateCentsPerHour, moneyLocale)}/h`} />
                  <Field term={labels.result.instructorAmount} value={formatCents(flight.breakdown.instructorAmountCents, moneyLocale)} />
                </>
              ) : null}
              <div className="flex justify-between gap-3 border-t border-hairline pt-2 sm:justify-start">
                <dt className="font-medium text-mid-gray">{labels.result.total}</dt>
                <dd data-testid="flight-detail-total" className="font-medium text-ink">
                  {formatCents(flight.breakdown.totalAmountCents, moneyLocale)}
                </dd>
              </div>
            </dl>
          </div>

          {canManage && flight.status === 'REGISTERED' ? (
            <div className="flex gap-3">
              <Button size="sm" type="button" onClick={() => onCorrect(flight)}>
                {labels.list.table.correctAction}
              </Button>
              <Button size="sm" variant="outline" type="button" onClick={() => onCancel(flight)}>
                {labels.list.table.cancelAction}
              </Button>
            </div>
          ) : null}

          <Button variant="outline" type="button" onClick={onClose}>
            {labels.detail.close}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
