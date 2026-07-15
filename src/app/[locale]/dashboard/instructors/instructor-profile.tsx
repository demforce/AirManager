'use client';

/**
 * Read-only instructor profile slide-over (story 12.7, AC 7) — port of
 * `docs/design-reference/airops/src/InstructorProfile.jsx` onto the real
 * domain: avatar+identity+ratings (as `Badge`s), a KPI grid (ore totali/ore
 * nel mese/dovuto totale/tariffa payout), "Allievi recenti" and "Voli
 * recenti come CFI" (last 5) — the latter two from REAL flights
 * (`GET /api/v1/instructor-compensation?personId=`, never the prototype's
 * mock `LOGBOOK`/`[...new Set(...)]` data). Footer: Chiudi / Modifica.
 */
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { SlideOver } from '@/components/ui/slide-over';
import { formatCents } from '@/lib/money';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import type { InstructorRow } from './instructors-console';

export type InstructorProfileLabels = {
  closeLabel: string;
  edit: string;
  kpi: { hoursTotal: string; hoursMtd: string; owedTotal: string; rate: string };
  recentStudents: { sectionTitle: string; empty: string };
  recentFlights: { sectionTitle: string; empty: string };
  noValue: string;
};

type InstructorDetail = {
  mtdMinutes: number;
  recentFlights: Array<{ id: string; flightDate: string; personFirstName: string; personLastName: string; minutes: number }>;
  recentStudents: Array<{ personId: string; firstName: string; lastName: string }>;
};

async function fetchDetail(personId: string): Promise<InstructorDetail | null> {
  const response = await fetch(`/api/v1/instructor-compensation?personId=${personId}`);
  if (!response.ok) return null;
  return (await response.json()) as InstructorDetail;
}

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function ratingsList(ratings: string): string[] {
  return ratings
    .split(',')
    .map((rating) => rating.trim())
    .filter((rating) => rating.length > 0);
}

type InstructorProfileProps = {
  instructor: InstructorRow | null;
  onClose: () => void;
  onEdit: (instructor: InstructorRow) => void;
  locale: 'it' | 'en';
  labels: InstructorProfileLabels;
};

export function InstructorProfile({ instructor, onClose, onEdit, locale, labels }: InstructorProfileProps) {
  const [detail, setDetail] = useState<InstructorDetail | null>(null);

  // The caller remounts this component per `instructor.personId` (`key={...}`
  // in `instructors-console.tsx`, same convention as `PilotProfile`) so only
  // this one fetch needs the `cancelled` guard.
  useEffect(() => {
    if (!instructor) return;
    let cancelled = false;
    void fetchDetail(instructor.personId).then((result) => {
      if (!cancelled) setDetail(result);
    });
    return () => {
      cancelled = true;
    };
  }, [instructor]);

  if (!instructor) return null;

  return (
    <SlideOver
      open={instructor !== null}
      onClose={onClose}
      title={`${instructor.lastName} ${instructor.firstName}`}
      subtitle={instructor.ratings}
      closeLabel={labels.closeLabel}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {labels.closeLabel}
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              onClose();
              onEdit(instructor);
            }}
            data-testid="instructor-profile-edit"
          >
            {labels.edit}
          </button>
        </>
      }
    >
      {/* Avatar + identity */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 24,
          padding: '16px 20px',
          background: 'var(--bg-sunken)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'oklch(0.62 0.14 300)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            flexShrink: 0,
          }}
        >
          {initialsOf(instructor.firstName, instructor.lastName)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em' }}>
            {instructor.lastName} {instructor.firstName}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {ratingsList(instructor.ratings).map((rating) => (
              <Badge key={rating} tone="info">
                {rating}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { label: labels.kpi.hoursTotal, value: formatMinutes(instructor.totalMinutes) },
          { label: labels.kpi.hoursMtd, value: detail ? formatMinutes(detail.mtdMinutes) : '…' },
          { label: labels.kpi.owedTotal, value: instructor.owedTotalCents === null ? labels.noValue : formatCents(instructor.owedTotalCents, locale) },
          { label: labels.kpi.rate, value: instructor.payoutRateCents === null ? labels.noValue : `${formatCents(instructor.payoutRateCents, locale)}/h` },
        ].map((kpi) => (
          <div key={kpi.label} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{kpi.label}</div>
            <div className="mono num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Allievi recenti */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 10 }}>
          {labels.recentStudents.sectionTitle}
        </div>
        {detail === null ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>…</p>
        ) : detail.recentStudents.length === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>{labels.recentStudents.empty}</p>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {detail.recentStudents.map((student) => (
              <div
                key={student.personId}
                data-testid="instructor-profile-student-chip"
                style={{ padding: '4px 10px', borderRadius: 'var(--radius-xs)', background: 'var(--panel)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 500 }}
              >
                {student.lastName} {student.firstName}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voli recenti come CFI */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 10 }}>
          {labels.recentFlights.sectionTitle}
        </div>
        {detail === null ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13, padding: '16px 0' }}>…</p>
        ) : detail.recentFlights.length === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13, padding: '16px 0' }}>{labels.recentFlights.empty}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {detail.recentFlights.map((flight, i) => (
              <div
                key={flight.id}
                data-testid="instructor-profile-flight-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: i % 2 === 0 ? 'var(--panel)' : 'var(--panel-2)',
                  fontSize: 12,
                }}
              >
                <div className="mono" style={{ color: 'var(--ink-2)', fontSize: 11 }}>
                  {formatDateOnly(flight.flightDate, locale)}
                </div>
                <div>
                  {flight.personLastName} {flight.personFirstName}
                </div>
                <div className="mono num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {formatMinutes(flight.minutes)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SlideOver>
  );
}
