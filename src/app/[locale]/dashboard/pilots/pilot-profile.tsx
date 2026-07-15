'use client';

/**
 * Read-only pilot profile slide-over (story 12.6, AC 5) — port of
 * `docs/design-reference/airops/src/PilotProfile.jsx` onto the real domain:
 * avatar+identity, KPI row (saldo/ultimo volo/voli recenti), certifications
 * (grouped by `typeName`, D13 — no license/medical enum), and the 5 most
 * recent flights (same source/shape as the `person/[id]` scheda's own
 * "Ultimi voli" panel, story 11.2). Footer: Chiudi / Modifica.
 */
import { useEffect, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { SlideOver } from '@/components/ui/slide-over';
import { Link } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { groupExpiriesByTypeName, type ExpiryGroupSource } from './expiry-grouping';
import type { PilotRow } from './pilots-console';

export type PilotProfileLabels = {
  closeLabel: string;
  edit: string;
  kpi: { balance: string; lastFlight: string; recentFlights: string };
  noAccount: string;
  certifications: { sectionTitle: string; empty: string; status: { ok: string; expiring: string; expired: string } };
  recentFlights: { sectionTitle: string; empty: string; viewAll: string; statement: string };
  /** Same three profile badges / account-status badges as the table (AC 2), reused here for the identity header (AC 5). */
  role: { pilot: string; student: string; instructor: string };
  status: { active: string; suspended: string; none: string };
  archivedBadge: string;
};

type PilotProfileProps = {
  pilot: PilotRow | null;
  onClose: () => void;
  onEdit: (pilot: PilotRow) => void;
  locale: 'it' | 'en';
  labels: PilotProfileLabels;
};

type RecentFlight = {
  id: string;
  flightDate: string;
  departureAirfield: string | null;
  arrivalAirfield: string | null;
  minutes: number;
  status: 'REGISTERED' | 'CANCELLED';
};

async function fetchBalanceCents(personId: string): Promise<number | null> {
  const response = await fetch(`/api/v1/people/${personId}/account`);
  if (!response.ok) return null;
  const body = (await response.json()) as { account: unknown; balanceCents: number };
  return body.account ? body.balanceCents : null;
}

async function fetchExpiries(personId: string): Promise<ExpiryGroupSource[]> {
  const response = await fetch(`/api/v1/people/${personId}/expiries`);
  if (!response.ok) return [];
  return (await response.json()) as ExpiryGroupSource[];
}

async function fetchRecentFlights(personId: string): Promise<RecentFlight[]> {
  const response = await fetch(`/api/v1/flights?personId=${personId}&page=1&pageSize=5`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items: RecentFlight[] };
  return body.items;
}

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function expiryStatusTone(status: 'ok' | 'expiring' | 'expired'): BadgeTone {
  if (status === 'expired') return 'bad';
  if (status === 'expiring') return 'warn';
  return 'ok';
}

export function PilotProfile({ pilot, onClose, onEdit, locale, labels }: PilotProfileProps) {
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [certGroups, setCertGroups] = useState<ReturnType<typeof groupExpiriesByTypeName> | null>(null);
  const [recentFlights, setRecentFlights] = useState<RecentFlight[] | null>(null);

  // The caller remounts this component per `pilot.id` (`key={...}` in
  // `pilots-console.tsx`, same convention as `PilotEditor`/`AircraftEditor`)
  // so `useState`'s own initial values already reset on a different pilot —
  // no manual `setState(null)` needed here (only the three fetches below).
  useEffect(() => {
    if (!pilot) return;
    let cancelled = false;
    void fetchBalanceCents(pilot.id).then((result) => {
      if (!cancelled) setBalanceCents(result ?? 0);
    });
    void fetchExpiries(pilot.id).then((result) => {
      if (!cancelled) setCertGroups(groupExpiriesByTypeName(result));
    });
    void fetchRecentFlights(pilot.id).then((result) => {
      if (!cancelled) setRecentFlights(result);
    });
    return () => {
      cancelled = true;
    };
  }, [pilot]);

  if (!pilot) return null;

  const statusLabelOf = (status: 'ok' | 'expiring' | 'expired'): string =>
    status === 'expired' ? labels.certifications.status.expired : status === 'expiring' ? labels.certifications.status.expiring : labels.certifications.status.ok;

  return (
    <SlideOver
      open={pilot !== null}
      onClose={onClose}
      title={`${pilot.lastName} ${pilot.firstName}`}
      subtitle={pilot.email ?? ''}
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
              onEdit(pilot);
            }}
            data-testid="pilot-profile-edit"
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
            background: 'oklch(0.55 0.12 250)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            flexShrink: 0,
          }}
        >
          {initialsOf(pilot.firstName, pilot.lastName)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em' }}>
            {pilot.lastName} {pilot.firstName}
          </div>
          <div style={{ color: 'var(--ink-2)', fontSize: 12, marginTop: 2 }}>{pilot.email ?? ''}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {pilot.profiles.pilot ? <Badge tone="info">{labels.role.pilot}</Badge> : null}
            {pilot.profiles.student ? <Badge tone="ok">{labels.role.student}</Badge> : null}
            {pilot.profiles.instructor ? <Badge tone="warn">{labels.role.instructor}</Badge> : null}
            <Badge tone={pilot.user ? (pilot.user.isActive ? 'ok' : 'bad') : ''} dot>
              {pilot.user ? (pilot.user.isActive ? labels.status.active : labels.status.suspended) : labels.status.none}
            </Badge>
            {pilot.archivedAt ? <Badge dot>{labels.archivedBadge}</Badge> : null}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          {
            label: labels.kpi.balance,
            value: balanceCents === null ? '…' : formatCents(balanceCents, locale),
            bad: balanceCents !== null && balanceCents < 0,
          },
          { label: labels.kpi.lastFlight, value: pilot.lastFlightDate ? formatDateOnly(pilot.lastFlightDate, locale) : '—', bad: false },
          { label: labels.kpi.recentFlights, value: recentFlights === null ? '…' : String(recentFlights.length), bad: false },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}
          >
            <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{kpi.label}</div>
            <div className="mono num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: kpi.bad ? 'var(--bad)' : 'var(--ink)' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Certifications */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 10 }}>
          {labels.certifications.sectionTitle}
        </div>
        {certGroups === null ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>…</p>
        ) : certGroups.length === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>{labels.certifications.empty}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {certGroups.map((group, i) => (
              <div
                key={group.typeName}
                data-testid="pilot-profile-certification-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 14px',
                  background: i % 2 === 0 ? 'var(--panel)' : 'var(--panel-2)',
                  fontSize: 12,
                }}
              >
                <span>{group.typeName}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono">{formatDateOnly(group.expiresAt, locale)}</span>
                  <Badge tone={expiryStatusTone(group.status)}>{statusLabelOf(group.status)}</Badge>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent flights */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)' }}>
            {labels.recentFlights.sectionTitle}
          </span>
          <span style={{ display: 'flex', gap: 10 }}>
            <Link
              href={{ pathname: '/dashboard/logbook', query: { personId: pilot.id } }}
              className="fld-label"
              style={{ textTransform: 'none', textDecoration: 'underline' }}
              data-testid="pilot-profile-view-all-flights"
            >
              {labels.recentFlights.viewAll}
            </Link>
            <Link
              href={`/dashboard/people/${pilot.id}/account`}
              className="fld-label"
              style={{ textTransform: 'none', textDecoration: 'underline' }}
              data-testid="pilot-profile-statement"
            >
              {labels.recentFlights.statement}
            </Link>
          </span>
        </div>

        {recentFlights === null ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13, padding: '16px 0' }}>…</p>
        ) : recentFlights.length === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13, padding: '16px 0' }}>{labels.recentFlights.empty}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {recentFlights.map((flight, i) => (
              <div
                key={flight.id}
                data-testid="pilot-profile-flight-row"
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
                  {flight.departureAirfield && flight.arrivalAirfield ? `${flight.departureAirfield} → ${flight.arrivalAirfield}` : '—'}
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
