/**
 * The three riquadri (story Billing-2, AC 1) — replaces the old 5-tile
 * `.kpi-row` (`getBillingKpis`, retired). Design
 * `docs/superpowers/specs/2026-07-26-billing-rework-design.md` §5: three
 * independent "books" that never mix into one signed column — Risultato
 * (P&L), Liquidità (running cash/bank), Acconti piloti (debito verso i
 * piloti). Server-rendered (no `'use client'` — plain stat rows plus two
 * `Link`s, same idiom as `pilots-console.tsx`'s server-side table cells);
 * every number arrives ALREADY computed by `getBillingSummary` (Billing-1),
 * this component only formats and lays them out.
 *
 * The "Istruttori" KPI tile the old row had (owed MTD, a single aggregate)
 * is NOT relocated here (Dev Notes, AC 1) — it doesn't fit the three-book
 * model (instructor payouts are already inside `result.costCents`, via
 * their AC4 gemello) and the existing "Compensi istruttori" detail card
 * below the ledger (unchanged, still fed by `getCompensationSummary`)
 * already shows the same figure per-instructor, in more detail.
 */
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatCents } from '@/lib/money';
import type { BillingSummary } from '@/server/services/billing-summary.service';

export type BillingPanelsLabels = {
  result: { title: string; revenue: string; cost: string; net: string };
  treasury: { title: string; cash: string; bank: string; deposits: string; available: string; unattributed: string };
  deposits: { title: string; total: string; exposure: string; inRed: string; detailLink: string };
};

export type BillingPanelsProps = {
  summary: BillingSummary;
  monthLabel: string;
  moneyLocale: 'it' | 'en';
  locale: 'it' | 'en';
  /** The secchiello's own filter link (story Billing-2, AC 3) — only rendered when `treasury.unattributedCents !== 0` (spec §8: never hidden while non-zero, but nothing to reach when it IS zero). */
  unattributedHref: { pathname: '/dashboard/billing'; query: Record<string, string> };
  labels: BillingPanelsLabels;
};

/** `--ok`/`--bad` raw are tuned for a small accent (a dot, a badge's own paired ink) and fail WCAG AA as body-sized TEXT directly on `--panel` in light theme (canvas-measured, see the `.stat-tone-*` doc-comment in airops.css) — `.stat-tone-ok`/`.stat-tone-bad` swap in a darker light-mode-only literal instead, same technique `.badge.*` already established. */
function toneClass(tone: 'ok' | 'bad' | undefined): string {
  return tone === 'ok' ? 'stat-tone-ok' : tone === 'bad' ? 'stat-tone-bad' : '';
}

function StatRow({ label, value, testId, tone }: { label: string; value: string; testId: string; tone?: 'ok' | 'bad' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
      <span style={{ color: 'var(--ink-2)' }}>{label}</span>
      <span className={`mono num ${toneClass(tone)}`} data-testid={testId} style={{ fontWeight: 500, color: tone ? undefined : 'var(--ink)' }}>
        {value}
      </span>
    </div>
  );
}

function TotalRow({ label, value, testId, tone }: { label: string; value: string; testId: string; tone: 'ok' | 'bad' }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 13,
        fontWeight: 700,
        marginTop: 4,
        paddingTop: 8,
        borderTop: '1px solid var(--border)',
      }}
    >
      <span>{label}</span>
      <span className={`mono num ${toneClass(tone)}`} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

export function BillingPanels({ summary, monthLabel, moneyLocale, locale, unattributedHref, labels }: BillingPanelsProps) {
  const { result, treasury, deposits } = summary;

  return (
    <div className="billing-panels">
      <div className="card" data-testid="billing-panel-result">
        <div className="card-head">
          <div className="card-title">{labels.result.title}</div>
          <span className="card-sub">{monthLabel}</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <StatRow label={labels.result.revenue} value={formatCents(result.revenueCents, moneyLocale)} testId="billing-panel-revenue" />
          <StatRow label={labels.result.cost} value={formatCents(-result.costCents, moneyLocale)} testId="billing-panel-cost" tone={result.costCents > 0 ? 'bad' : undefined} />
          <TotalRow label={labels.result.net} value={formatCents(result.netCents, moneyLocale)} testId="billing-panel-net" tone={result.netCents >= 0 ? 'ok' : 'bad'} />
        </div>
      </div>

      <div className="card" data-testid="billing-panel-treasury">
        <div className="card-head">
          <div className="card-title">{labels.treasury.title}</div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <StatRow label={labels.treasury.cash} value={formatCents(treasury.cashCents, moneyLocale)} testId="billing-panel-cash" />
          <StatRow label={labels.treasury.bank} value={formatCents(treasury.bankCents, moneyLocale)} testId="billing-panel-bank" />
          <StatRow label={labels.treasury.deposits} value={formatCents(deposits.totalCents, moneyLocale)} testId="billing-panel-deposits-note" />
          <TotalRow label={labels.treasury.available} value={formatCents(treasury.availableCents, moneyLocale)} testId="billing-panel-available" tone={treasury.availableCents >= 0 ? 'ok' : 'bad'} />
          {treasury.unattributedCents !== 0 ? (
            <Link
              href={unattributedHref}
              locale={locale as AppLocale}
              data-testid="billing-panel-unattributed-link"
              className="stat-tone-warn"
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginTop: 2, textDecoration: 'underline' }}
            >
              <span>{labels.treasury.unattributed}</span>
              <span className="mono num" data-testid="billing-panel-unattributed">
                {formatCents(treasury.unattributedCents, moneyLocale)}
              </span>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="card" data-testid="billing-panel-deposits">
        <div className="card-head">
          <div className="card-title">{labels.deposits.title}</div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <StatRow label={labels.deposits.total} value={formatCents(deposits.totalCents, moneyLocale)} testId="billing-panel-deposits-total" />
          <StatRow label={labels.deposits.exposure} value={formatCents(-deposits.exposureCents, moneyLocale)} testId="billing-panel-deposits-exposure" tone={deposits.exposureCents > 0 ? 'bad' : undefined} />
          <StatRow label={labels.deposits.inRed} value={String(deposits.inRedCount)} testId="billing-panel-deposits-inred" />
          {deposits.inRedCount > 0 ? (
            <Link
              href="/dashboard/pilots"
              locale={locale as AppLocale}
              data-testid="billing-panel-deposits-link"
              style={{ fontSize: 11.5, marginTop: 2, textDecoration: 'underline', color: 'var(--ink-2)' }}
            >
              {labels.deposits.detailLink}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
