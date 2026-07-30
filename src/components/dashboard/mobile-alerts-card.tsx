/**
 * "Avvisi" card of the mobile Panoramica (story 15.3, AC 4, template lines
 * 106-116) — a dumb SERVER renderer: the merge, the ratified urgency order and
 * the 5-row cap are the pure `buildOverviewAlerts` (`@/lib/overview-alerts`,
 * AD-4), and the titles/subs arrive already translated and formatted from
 * `dashboard/page.tsx`.
 *
 * No client JS at all: every row is a `<Link>` to the page where the voice can
 * be acted on (AC 4 — "ogni voce porta a una destinazione sensata"), so there
 * is nothing to open and nothing to hydrate. The tone squares reuse
 * `.list-icon.red`/`.list-icon.amber`, whose contrast was already calibrated in
 * story 13.9 for both themes — this card introduces no colour of its own.
 *
 * Admin face only: the template gives no Avvisi card to pilota/istruttore, and
 * their own scadenze are already the `kpi-medical`/`kpi-ratings` KPIs.
 */
import { Icon } from '@/components/ui/icons';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { OverviewAlertKind, OverviewAlertTone } from '@/lib/overview-alerts';

export type MobileAlertsCardItem = {
  key: string;
  kind: OverviewAlertKind;
  tone: OverviewAlertTone;
  href: string;
  title: string;
  sub: string;
};

export type MobileAlertsCardProps = {
  items: MobileAlertsCardItem[];
  locale: AppLocale;
  labels: {
    title: string;
    empty: string;
    /** `{count}` placeholder, filled here — shown only when the cap truncated. */
    seeAll: string;
  };
  /** How many voices the cap hid, and where the overflow row leads (`buildOverviewAlerts`). */
  hiddenCount: number;
  moreHref: string | null;
};

const KIND_ICON: Record<OverviewAlertKind, (typeof Icon)['clock']> = {
  expiry: Icon.clock,
  negativeBalance: Icon.cash,
  pprPending: Icon.plane,
};

export function MobileAlertsCard({ items, locale, labels, hiddenCount, moreHref }: MobileAlertsCardProps) {
  return (
    <div className="card" data-testid="mobile-overview-alerts">
      <div className="mobile-card-head">
        <span className="mobile-card-title">{labels.title}</span>
      </div>

      {items.length === 0 ? (
        <p className="mobile-card-empty" data-testid="mobile-overview-alerts-empty">
          {labels.empty}
        </p>
      ) : (
        items.map((item) => {
          const AlertIcon = KIND_ICON[item.kind];
          return (
            <Link key={item.key} href={item.href} locale={locale} className="mobile-alert-row" data-testid="mobile-overview-alert-row">
              <span className={`list-icon ${item.tone}`}>
                <AlertIcon />
              </span>
              <span className="mobile-alert-main">
                <span className="mobile-alert-title">{item.title}</span>
                <span className="mobile-alert-sub">{item.sub}</span>
              </span>
            </Link>
          );
        })
      )}

      {hiddenCount > 0 && moreHref ? (
        <div className="mobile-card-foot">
          <Link href={moreHref} locale={locale} className="btn" data-testid="mobile-overview-alerts-see-all">
            {labels.seeAll.replace('{count}', String(hiddenCount))}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
