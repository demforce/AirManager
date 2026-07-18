'use client';

/**
 * AdminOverview's "Pianifica volo" CTA (story 12.12 AC 1) — port of
 * `App.jsx#AdminOverview`'s `NewFlightSlideOver` trigger onto the REAL
 * domain form: opening a NEW flight-log entry (`flights.manage`, story
 * 12.8's `FlightEditor`, unmodified/reused as-is), not a booking — `flights.manage`
 * is exactly the permission ratifica 3 says INSTRUCTOR lacks (their own CTA
 * is dropped for that reason), and every actor who reaches AdminOverview
 * (`finance.manage`) holds it.
 */
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Icon } from '@/components/ui/icons';
import { FlightEditor, type FlightEditorLabels } from './logbook/flight-editor';

type AircraftOption = { id: string; registration: string };
type PersonOption = { id: string; firstName: string; lastName: string };

export type DispatchFlightButtonProps = {
  label: string;
  aircraftOptions: AircraftOption[];
  personOptions: PersonOption[];
  instructorOptions: PersonOption[];
  airfieldName: string;
  moneyLocale: 'it' | 'en';
  labels: FlightEditorLabels;
};

export function DispatchFlightButton({ label, aircraftOptions, personOptions, instructorOptions, airfieldName, moneyLocale, labels }: DispatchFlightButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)} data-testid="dispatch-flight-button">
        <Icon.plus /> {label}
      </button>
      <FlightEditor
        target={open ? { mode: 'new' } : null}
        onClose={() => setOpen(false)}
        onMutated={() => router.refresh()}
        aircraftOptions={aircraftOptions}
        personOptions={personOptions}
        instructorOptions={instructorOptions}
        airfieldName={airfieldName}
        moneyLocale={moneyLocale}
        labels={labels}
      />
    </>
  );
}
