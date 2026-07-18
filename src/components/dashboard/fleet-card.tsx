'use client';

/**
 * Fleet card-grid — EXTRACTED (story 12.12 AC 3) from
 * `dashboard/fleet/fleet-console.tsx:199-221`'s `.fleet-grid`/`.ac-card`
 * markup (story 12.5 origin, port of
 * `docs/design-reference/airops/src/Fleet.jsx#FleetCard`) so the full
 * `/dashboard/fleet` console AND the Overview's compact widget share ONE
 * implementation — `fleet-console.tsx` now CONSUMES `FleetCardGrid` (no
 * divergence, story 12.5's own e2e stays green). `FleetCardItem`/`badgeFor`
 * are the single source of truth for both callers.
 */
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icons';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatCents } from '@/lib/money';

export type FleetCardItem = {
  id: string;
  registration: string;
  type: string;
  model: string;
  hourMeterMinutes: number;
  notes: string | null;
  status: 'OPERATIONAL' | 'OUT_OF_SERVICE';
  statusReason: string | null;
  seats: number | null;
  fuelType: string | null;
  owner: 'CLUB' | 'PRIVATE';
  based: boolean;
  /** ISO string or `null` — active. */
  archivedAt: string | null;
  /** The wet hourly rate in effect TODAY (batched `getEffectiveRates`), or `null` if none is on file. */
  wetRateCents: number | null;
  /** Derived, presentational: an APPROVED booking covers `now`. */
  reserved: boolean;
};

export type FleetCardBadgeLabels = { aog: string; reserved: string; available: string; archived: string };

export function badgeFor(item: FleetCardItem, labels: FleetCardBadgeLabels): ReactNode {
  if (item.archivedAt !== null) {
    return <Badge dot>{labels.archived}</Badge>;
  }
  if (item.status === 'OUT_OF_SERVICE') {
    return (
      <Badge tone="bad" dot>
        {labels.aog}
      </Badge>
    );
  }
  if (item.reserved) {
    return (
      <Badge tone="warn" dot>
        {labels.reserved}
      </Badge>
    );
  }
  return (
    <Badge tone="ok" dot>
      {labels.available}
    </Badge>
  );
}

export type FleetCardGridProps = {
  items: FleetCardItem[];
  locale: 'it' | 'en';
  rateLabel: string;
  badgeLabels: FleetCardBadgeLabels;
  /** Present for `fleet-console.tsx` (opens the aircraft editor); absent on the Overview widget (read-only glance, AC 3: "niente search/paginazione"). */
  onCardClick?: (item: FleetCardItem) => void;
};

export function FleetCardGrid({ items, locale, rateLabel, badgeLabels, onCardClick }: FleetCardGridProps) {
  return (
    <div className="fleet-grid">
      {items.map((ac) => (
        <div
          key={ac.id}
          className={`ac-card ${ac.status === 'OUT_OF_SERVICE' ? 'aog' : ''}`}
          onClick={onCardClick ? () => onCardClick(ac) : undefined}
          data-testid={`ac-card-${ac.id}`}
        >
          <div className="ac-head">
            <div className="ac-tail">{ac.registration}</div>
            {badgeFor(ac, badgeLabels)}
          </div>
          <div className="ac-silhouette">
            <Icon.acsmall />
          </div>
          <div className="ac-model">{ac.model}</div>
          <div className="meter-row" style={{ marginTop: 2 }}>
            <span>{rateLabel}</span>
            <span className="v mono">{ac.wetRateCents === null ? '—' : `${formatCents(ac.wetRateCents, locale)}/h`}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export type FleetCardLabels = {
  cardTitle: string;
  summary: string;
  addAircraft: string;
  empty: string;
  rateLabel: string;
  badge: FleetCardBadgeLabels;
};

export type FleetCardProps = {
  items: FleetCardItem[];
  totalCount: number;
  availableCount: number;
  aogCount: number;
  locale: 'it' | 'en';
  /** `aircraft.manage` (AC 3: "Aggiungi aeromobile" visibile solo aircraft.manage"). */
  canManageAircraft: boolean;
  addHref: string;
  labels: FleetCardLabels;
};

/**
 * The Overview's "Aeromobili" widget (AC 3) — port of
 * `docs/design-reference/airops/src/Fleet.jsx#FleetCard`'s own `.card`
 * wrapper, using the SAME `FleetCardGrid` the full console renders. No
 * search/pagination (Contesto), "Aggiungi aeromobile" navigates to the full
 * `/dashboard/fleet` console rather than opening an editor inline.
 */
export function FleetCard({ items, totalCount, availableCount, aogCount, locale, canManageAircraft, addHref, labels }: FleetCardProps) {
  return (
    <div className="card" data-testid="fleet-card-widget">
      <div className="card-head">
        <div className="card-title">{labels.cardTitle}</div>
        <span className="card-sub">{labels.summary.replace('{total}', String(totalCount)).replace('{available}', String(availableCount)).replace('{aog}', String(aogCount))}</span>
        <div className="spacer" />
        {canManageAircraft ? (
          <Link href={addHref} locale={locale as AppLocale} className="btn primary" data-testid="fleet-card-widget-add">
            <Icon.plus /> {labels.addAircraft}
          </Link>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="card-body" data-testid="fleet-card-widget-empty">
          {labels.empty}
        </p>
      ) : (
        <FleetCardGrid items={items} locale={locale} rateLabel={labels.rateLabel} badgeLabels={labels.badge} />
      )}
    </div>
  );
}
