import { getTranslations, setRequestLocale } from 'next-intl/server';
import { KPI } from '@/components/ui/kpi';
import { redirect } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';
import { formatDateOnly, formatDateTime, formatMinutes } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getOwnCompensationOverview, type OwnPayoutHistoryItem } from '@/server/services/instructor-compensation.service';

type PageProps = {
  params: Promise<{ locale: string }>;
};

// Review F2: the amount lives in a non-collapsible `minmax(110px, 1fr)`
// track — a bare `1fr` gets squeezed to 0 by `.student-row > * { min-width:
// 0 }` (airops.css) once the fixed tracks alone exceed a 390px viewport,
// making the amount cell unreachable even after a full horizontal scroll.
// Same fixed-track-for-money convention as the 14.6 twin (`account-section.tsx`).
const TABLE_COLUMNS = '150px 200px 120px minmax(110px, 1fr)';

function methodLabel(method: OwnPayoutHistoryItem['method'], t: Awaited<ReturnType<typeof getTranslations>>): string {
  switch (method) {
    case 'CASH':
      return t('pay.methods.cash');
    case 'BANK_TRANSFER':
      return t('pay.methods.bankTransfer');
    case 'POS':
      return t('pay.methods.pos');
  }
}

/**
 * "I miei compensi" (story 14.7, AC 2/3) — a dedicated, sidebar-linked
 * self-service compensation page for INSTRUCTOR, distinct from the
 * staff-facing roster (`/dashboard/instructors`, out of scope per the
 * story's "fuori scope dichiarato"). Reads `getOwnCompensationOverview`
 * ONLY (AC 3: no personId ever leaves the session) — an actor with no
 * ACTIVE own instructor profile gets the same coherent empty state an
 * unlinked/deactivated actor gets everywhere else in this app (`my-account`
 * story 14.6's own precedent), never a 403, never another instructor's
 * data. Reachable by ANY authenticated actor (`self.read`, granted to every
 * role — same universal-self-access convention as `my-account/page.tsx`):
 * the sidebar entry is INSTRUCTOR-only AND further gated on the ACTIVE
 * profile (`dashboard/layout.tsx`, AC 4), but a pilot/admin who navigates
 * here directly just sees the SAME empty state (no instructor profile at
 * all) — never a privacy concern, since the read resolves the actor's own
 * person only.
 */
export default async function MyCompensationPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  // Belt-and-braces (AD-5): `self.read` is granted to every role today (same
  // rationale as `me.service.ts#getMe`'s own comment), so this never actually
  // rejects a logged-in user — the call establishes the pattern regardless.
  if (!hasPermission(actor, 'self.read')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const displayLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';
  const t = await getTranslations('MyCompensationPage');
  const tPay = await getTranslations('InstructorsPage');

  const overview = await getOwnCompensationOverview(actor);

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub')}</div>
        </div>
      </div>

      {overview === null ? (
        <div className="card">
          <div className="card-body">
            <p className="fld-label" data-testid="my-compensation-empty" style={{ textTransform: 'none' }}>
              {t('noProfile')}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="kpi-row" data-testid="my-compensation-kpis">
            <div data-testid="kpi-rate">
              <KPI
                label={t('kpi.rate')}
                value={overview.payoutRateCents === null ? '—' : formatCents(overview.payoutRateCents, displayLocale)}
                unit={overview.payoutRateCents === null ? undefined : '/h'}
              />
            </div>
            <div data-testid="kpi-hours-mtd">
              <KPI label={t('kpi.hoursMtd')} value={formatMinutes(overview.mtdMinutes)} />
            </div>
            {/* Ratifica PO (review F4): "Maturato nel mese" is the GROSS accrual
                (ore x tariffa) and "Dovuto nel mese" is the NET owed (same
                number the staff-facing card shows) — shown side by side so the
                two adjacent KPIs reconcile instead of one silently being netted. */}
            <div data-testid="kpi-gross-mtd">
              <KPI label={t('kpi.grossMtd')} value={overview.mtdGrossCents === null ? '—' : formatCents(overview.mtdGrossCents, displayLocale)} />
            </div>
            <div data-testid="kpi-owed-mtd">
              <KPI label={t('kpi.owedMtd')} value={overview.mtdOwedCents === null ? '—' : formatCents(overview.mtdOwedCents, displayLocale)} />
            </div>
            <div data-testid="kpi-owed-total">
              <KPI label={t('kpi.owedTotal')} value={overview.totalOwedCents === null ? '—' : formatCents(overview.totalOwedCents, displayLocale)} />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2 className="card-title">{t('table.heading')}</h2>
            </div>
            <div className="card-body">
              {overview.payouts.length === 0 ? (
                <p className="fld-label" data-testid="my-compensation-payouts-empty" style={{ textTransform: 'none' }}>
                  {t('table.empty')}
                </p>
              ) : (
                <div className="students">
                  <div className="student-row header" data-testid="my-compensation-header-row" style={{ gridTemplateColumns: TABLE_COLUMNS }}>
                    <div>{t('table.date')}</div>
                    <div>{t('table.period')}</div>
                    <div>{t('table.method')}</div>
                    <div style={{ textAlign: 'right' }}>{t('table.amount')}</div>
                  </div>
                  {overview.payouts.map((payout) => (
                    <div key={payout.id} className="student-row" data-testid="my-compensation-payout-row" style={{ gridTemplateColumns: TABLE_COLUMNS }}>
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                        {formatDateTime(payout.createdAt, displayLocale)}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                        {formatDateOnly(payout.periodStart, displayLocale)} – {formatDateOnly(payout.periodEnd, displayLocale)}
                      </div>
                      <div>{methodLabel(payout.method, tPay)}</div>
                      <div className="mono num" style={{ fontWeight: 600, textAlign: 'right', color: 'var(--ok)' }}>
                        {formatCents(payout.amountCents, displayLocale)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
