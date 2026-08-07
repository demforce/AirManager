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
import { FlightEditor, type AircraftOption, type FlightEditorLabels } from './logbook/flight-editor';


type PersonOption = { id: string; firstName: string; lastName: string };
/** The "person" (pilot/allievo) picker's own option shape (story 14.3, AC 2) — see `flight-editor.tsx`'s own `PilotStudentOption` doc-comment. */
type PilotStudentOption = PersonOption & { profiles: { pilot: boolean; student: boolean } };

export type DispatchFlightButtonProps = {
  label: string;
  aircraftOptions: AircraftOption[];
  personOptions: PilotStudentOption[];
  instructorOptions: PersonOption[];
  airfieldName: string;
  moneyLocale: 'it' | 'en';
  /** Story 14.4, AC 2 (ratifica R4) — forwarded to `FlightEditor` as-is; see that component's own doc-comment. */
  canForce: boolean;
  labels: FlightEditorLabels;
};

export function DispatchFlightButton({ label, aircraftOptions, personOptions, instructorOptions, airfieldName, moneyLocale, canForce, labels }: DispatchFlightButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)} data-testid="dispatch-flight-button">
        <Icon.plus /> {label}
      </button>
      {/* Review F1 (BLOCKER): unlike `logbook-console.tsx` (`key={editorTarget
          === null ? 'closed' : ...}`), this single always-mounted `FlightEditor`
          used to carry `pendingForceBody`/`blockedDocuments` (and every other
          form field) across a close+reopen — "Forza registrazione" could
          resend a STALE body for the person shown in a PREVIOUS blocked
          attempt after the operator picked a different, clean pilot. Same
          `key` idiom as the sibling console: a fresh `open`/`closed` key
          forces a full remount (fresh state) on every open. */}
      <FlightEditor
        key={open ? 'open' : 'closed'}
        target={open ? { mode: 'new' } : null}
        onClose={() => setOpen(false)}
        onMutated={() => router.refresh()}
        aircraftOptions={aircraftOptions}
        personOptions={personOptions}
        instructorOptions={instructorOptions}
        airfieldName={airfieldName}
        moneyLocale={moneyLocale}
        canForce={canForce}
        labels={labels}
      />
    </>
  );
}
