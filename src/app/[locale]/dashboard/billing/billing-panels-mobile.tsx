'use client';

/**
 * The phone face of the three riquadri (story 15.8a, ratifica R-15.8a-c).
 *
 * Measured pre-fix at 375x812: the three stacked `.card`s occupy 579.92px —
 * 71% of the screen BEFORE the ledger starts, which is why the first
 * transaction row began at y=1068.23 (131% of the viewport, the worst
 * opening of the epic). Here they become one tappable KPI per riquadro, with
 * the FULL detail of that riquadro in a `BottomSheet` (R3 + parity 15.5 F2):
 * nothing is lost (R4), only moved one tap away.
 *
 * Where the state lives (AD-1): `billing-panels.tsx` stays a SERVER
 * component — the KPI strip is the only part that needs an open/closed
 * state, so only IT is a client island. Every number arrives already
 * computed inside `getBillingSummary`'s own `BillingSummary` (comportamento
 * 1, Billing-1's single definition of revenue): this component formats and
 * lays out, exactly like its desktop twin, and never re-derives.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatCents } from '@/lib/money';
import type { BillingSummary } from '@/server/services/billing-summary.service';
import type { BillingPanelsLabels } from './billing-panels';

export type BillingPanelsMobileLabels = {
  kpiResult: string;
  kpiAvailable: string;
  kpiDeposits: string;
  openPanel: string;
  treasurySub: string;
  depositsSub: string;
  close: string;
};

export type BillingPanelsMobileProps = {
  summary: BillingSummary;
  monthLabel: string;
  moneyLocale: 'it' | 'en';
  locale: 'it' | 'en';
  unattributedHref: { pathname: '/dashboard/billing'; query: Record<string, string> };
  labels: BillingPanelsLabels;
  mobile: BillingPanelsMobileLabels;
};

type PanelId = 'result' | 'treasury' | 'deposits';

export function BillingPanelsMobile({ summary, monthLabel, moneyLocale, locale, unattributedHref, labels, mobile }: BillingPanelsMobileProps) {
  const { result, treasury, deposits } = summary;
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  /** Referentially stable by contract — `MobileSheet` gates its focus effect on it. */
  const close = useCallback(() => setOpenPanel(null), []);

  const kpis: { id: PanelId; label: string; value: string }[] = [
    { id: 'result', label: mobile.kpiResult, value: formatCents(result.netCents, moneyLocale) },
    { id: 'treasury', label: mobile.kpiAvailable, value: formatCents(treasury.availableCents, moneyLocale) },
    { id: 'deposits', label: mobile.kpiDeposits, value: formatCents(deposits.totalCents, moneyLocale) },
  ];

  /** Parity with the desktop riquadro, row by row — the same labels, the same values, the same order (AC 4). */
  const sheets: Record<PanelId, { sub: string; title: string; rows: BottomSheetRow[]; actions?: ReactNode }> = {
    result: {
      sub: monthLabel,
      title: labels.result.title,
      rows: [
        { k: labels.result.revenue, v: formatCents(result.revenueCents, moneyLocale) },
        { k: labels.result.cost, v: formatCents(-result.costCents, moneyLocale) },
        { k: labels.result.net, v: formatCents(result.netCents, moneyLocale) },
      ],
    },
    treasury: {
      sub: mobile.treasurySub,
      title: labels.treasury.title,
      rows: [
        { k: labels.treasury.cash, v: formatCents(treasury.cashCents, moneyLocale) },
        { k: labels.treasury.bank, v: formatCents(treasury.bankCents, moneyLocale) },
        { k: labels.treasury.deposits, v: formatCents(deposits.totalCents, moneyLocale) },
        { k: labels.treasury.available, v: formatCents(treasury.availableCents, moneyLocale) },
      ],
      // Review Billing-2 F1 again, on the phone: gated on the COUNT, never on the
      // summed amount — two unattributed rows of opposite sign sum to 0 and the
      // secchiello is still non-empty.
      actions:
        treasury.unattributedCount > 0 ? (
          <Link
            href={unattributedHref}
            locale={locale as AppLocale}
            className="btn"
            onClick={close}
            data-testid="billing-panel-unattributed-link-mobile"
          >
            {labels.treasury.unattributed} · {formatCents(treasury.unattributedCents, moneyLocale)}
          </Link>
        ) : undefined,
    },
    deposits: {
      sub: mobile.depositsSub,
      title: labels.deposits.title,
      rows: [
        { k: labels.deposits.total, v: formatCents(deposits.totalCents, moneyLocale) },
        { k: labels.deposits.exposure, v: formatCents(-deposits.exposureCents, moneyLocale) },
        { k: labels.deposits.inRed, v: String(deposits.inRedCount) },
      ],
      actions:
        deposits.inRedCount > 0 ? (
          <Link href="/dashboard/pilots" locale={locale as AppLocale} className="btn" onClick={close} data-testid="billing-panel-deposits-link-mobile">
            {labels.deposits.detailLink}
          </Link>
        ) : undefined,
    },
  };

  const sheet = openPanel === null ? null : sheets[openPanel];

  return (
    <>
      <div className="kpi-row billing-kpi-row" data-testid="mobile-billing-kpis">
        {kpis.map((kpi) => (
          <button
            key={kpi.id}
            type="button"
            className="kpi billing-kpi"
            onClick={() => setOpenPanel(kpi.id)}
            aria-label={`${mobile.openPanel}: ${kpi.label} ${kpi.value}`}
            data-testid={`mobile-billing-kpi-${kpi.id}`}
          >
            <span className="kpi-label">{kpi.label}</span>
            <span className="kpi-value num">{kpi.value}</span>
          </button>
        ))}
      </div>

      {/* AD-7: rendered conditionally, so `mobile-billing-panel-sheet` is ONE node. */}
      {sheet ? (
        <BottomSheet
          open
          onClose={close}
          testId="mobile-billing-panel-sheet"
          sub={sheet.sub}
          title={sheet.title}
          rows={sheet.rows}
          actions={sheet.actions}
          closeLabel={mobile.close}
        />
      ) : null}
    </>
  );
}
