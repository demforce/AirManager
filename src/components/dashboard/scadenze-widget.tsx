'use client';

/**
 * Overview "Scadenze" widget (story 12.12 AC 2) — port of
 * `docs/design-reference/airops/src/ScadenzeView.jsx#ScadenzeWidget`. Reuses
 * `listAllExpiries` (staff, `expiries.manage`) fetched ONCE server-side for
 * the widest window (60 days — `dashboard/page.tsx`), then filters/slices
 * client-side per the 7/30/60 toggle (same "all data already loaded,
 * client-side `useMemo` filter" idiom as the prototype) — no extra network
 * round-trip per toggle click. Tier/label logic (`tierOf`) is the SAME
 * shared function `scadenze-console.tsx` uses (`@/lib/expiry-status`,
 * story 12.11) — no second implementation of the day-count boundaries.
 */
import { useMemo, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icons';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { tierOf } from '@/lib/expiry-status';
import type { ExpiryDashboardItemDto } from '@/lib/schemas/expiries';

const WINDOWS = ['7', '30', '60'] as const;
type WindowChoice = (typeof WINDOWS)[number];

const TOP_ROWS = 6;

/** Icon tone: red for the two urgent tiers (scaduto/≤7g), amber otherwise (Contesto: `ScadenzeWidget`'s own `iconTone`). */
function iconToneOf(daysUntil: number): 'red' | 'amber' {
  return tierOf(daysUntil) <= 1 ? 'red' : 'amber';
}

/** Badge tone: bad for the two urgent tiers, warn for ≤30g, info for ≤60g (Contesto: `ScadenzeWidget`'s own `badgeTone`). */
function badgeToneOf(daysUntil: number): BadgeTone {
  const tier = tierOf(daysUntil);
  if (tier <= 1) return 'bad';
  if (tier === 2) return 'warn';
  return 'info';
}

export type ScadenzeWidgetLabels = {
  cardTitle: string;
  /** `t.raw` template, `"{count} entro {window}g"` — client-interpolated (values change with the client-only toggle). */
  countInWindow: string;
  /** `t.raw` template, `"Nessuna scadenza entro {window} giorni. 🎉"`. */
  empty: string;
  /** Plain record, NOT a function — Server -> Client Component props must be serializable. */
  windowLabels: Record<WindowChoice, string>;
  today: string;
  /** `t.raw` template, `"{n}g fa"`. */
  agoTemplate: string;
  /** `t.raw` template, `"tra {n}g"`. */
  inDaysTemplate: string;
  /** `t.raw` template, `"+{count} altre · Vedi tutte"`. */
  seeAll: string;
};

export type ScadenzeWidgetProps = {
  items: ExpiryDashboardItemDto[];
  locale: AppLocale;
  viewAllHref: string;
  labels: ScadenzeWidgetLabels;
};

export function ScadenzeWidget({ items, locale, viewAllHref, labels }: ScadenzeWidgetProps) {
  const [win, setWin] = useState<WindowChoice>('30');

  const inWindow = useMemo(() => items.filter((item) => item.daysUntil <= Number(win)), [items, win]);
  const shown = inWindow.slice(0, TOP_ROWS);
  const remaining = inWindow.length - shown.length;

  function dayLabel(daysUntil: number): string {
    if (daysUntil === 0) return labels.today;
    if (daysUntil < 0) return labels.agoTemplate.replace('{n}', String(Math.abs(daysUntil)));
    return labels.inDaysTemplate.replace('{n}', String(daysUntil));
  }

  return (
    <div className="card" data-testid="scadenze-widget">
      <div className="card-head">
        <div className="card-title">{labels.cardTitle}</div>
        <span className="card-sub">{labels.countInWindow.replace('{count}', String(inWindow.length)).replace('{window}', win)}</span>
        <div className="spacer" />
        <div className="segmented">
          {WINDOWS.map((w) => (
            <button key={w} type="button" className={win === w ? 'on' : ''} onClick={() => setWin(w)} data-testid={`scadenze-widget-window-${w}`}>
              {labels.windowLabels[w]}
            </button>
          ))}
        </div>
      </div>
      <div className="list">
        {shown.length === 0 ? (
          <p style={{ padding: 20, color: 'var(--ink-3)', fontSize: 13 }} data-testid="scadenze-widget-empty">
            {labels.empty.replace('{window}', win)}
          </p>
        ) : (
          shown.map((item) => (
            <div key={item.id} className="list-item" data-testid="scadenze-widget-row">
              <div className={`list-icon ${iconToneOf(item.daysUntil)}`}>
                <Icon.clock />
              </div>
              <div>
                <div className="list-title">
                  {item.personLastName} {item.personFirstName}
                </div>
                <div className="list-sub">{item.typeName}</div>
              </div>
              <Badge tone={badgeToneOf(item.daysUntil)} dot>
                {dayLabel(item.daysUntil)}
              </Badge>
            </div>
          ))
        )}
      </div>
      {remaining > 0 ? (
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
          <Link
            href={viewAllHref}
            locale={locale}
            className="btn"
            style={{ width: '100%', justifyContent: 'center' }}
            data-testid="scadenze-widget-see-all"
          >
            {labels.seeAll.replace('{count}', String(remaining))}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
