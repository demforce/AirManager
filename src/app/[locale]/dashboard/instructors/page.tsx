import { getTranslations, setRequestLocale } from 'next-intl/server';
import { KPI } from '@/components/ui/kpi';
import { buildExportHref } from '@/lib/export-href';
import { formatCents } from '@/lib/money';
import { formatMinutes } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { redirect } from '@/i18n/navigation';
import { getCompensationSummary } from '@/server/services/instructor-compensation.service';
import { InstructorsConsole, type InstructorRow } from './instructors-console';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Instructors page (story 12.7) — AirOps-native, port of
 * `docs/design-reference/airops/src/People.jsx#InstructorsView`: page-head
 * (KPI row) + roster table + payout actions (`payouts.manage`-gated) + the
 * compensation profile/editor slide-overs. `hasPermission` here only decides
 * whether to *redirect* (AD-5, same as `pilots/page.tsx`) — every service
 * call re-checks its own gate (`finance.manage` for the summary,
 * `payouts.manage` for the payout POST/PUT).
 *
 * Unpaginated (Dev Notes: small platea, same convention as the school hour
 * summaries `getCompensationSummary` twins) — no `?page=`/`?q=` here, unlike
 * `pilots/page.tsx`.
 */
export default async function InstructorsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  if (!hasPermission(actor, 'people.read')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const summary = await getCompensationSummary(actor);

  const displayLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';
  const t = await getTranslations('InstructorsPage');
  const tExport = await getTranslations('Export');

  const activeCount = summary.length;
  const totalMinutes = summary.reduce((sum, row) => sum + row.totalMinutes, 0);
  const totalOwedCents = summary.reduce((sum, row) => sum + (row.owedTotalCents ?? 0), 0);
  const ratedInstructors = summary.filter((row) => row.payoutRateCents !== null);
  const avgPayoutRateCents =
    ratedInstructors.length > 0 ? Math.round(ratedInstructors.reduce((sum, row) => sum + (row.payoutRateCents ?? 0), 0) / ratedInstructors.length) : null;

  const canManagePeople = hasPermission(actor, 'people.manage');
  const canManagePayouts = hasPermission(actor, 'payouts.manage');
  const canManageSettings = hasPermission(actor, 'settings.manage');
  const canExport = hasPermission(actor, 'finance.manage');

  const exportHref = buildExportHref('/api/v1/instructor-compensation', {}, locale);

  const items: InstructorRow[] = summary.map((row) => ({
    personId: row.personId,
    firstName: row.firstName,
    lastName: row.lastName,
    payoutRateCents: row.payoutRateCents,
    totalMinutes: row.totalMinutes,
    owedTotalCents: row.owedTotalCents,
  }));

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub', { active: activeCount, owed: formatCents(totalOwedCents, displayLocale) })}</div>
        </div>
      </div>

      <div className="kpi-row">
        <KPI label={t('kpi.active')} value={activeCount} />
        <KPI label={t('kpi.hours')} value={formatMinutes(totalMinutes)} />
        <KPI label={t('kpi.owed')} value={formatCents(totalOwedCents, displayLocale)} />
        <KPI label={t('kpi.avgRate')} value={avgPayoutRateCents === null ? '—' : formatCents(avgPayoutRateCents, displayLocale)} unit={avgPayoutRateCents === null ? undefined : '/h'} />
      </div>

      <InstructorsConsole
        key={JSON.stringify({ count: items.length })}
        items={items}
        canManagePeople={canManagePeople}
        canManagePayouts={canManagePayouts}
        canManageSettings={canManageSettings}
        exportHref={canExport ? exportHref : undefined}
        locale={displayLocale}
        labels={{
          cardTitle: t('cardTitle'),
          empty: t('empty'),
          newInstructor: t('newInstructor'),
          paymentCycleButton: t('paymentCycleButton'),
          exportLabel: tExport('button'),
          table: {
            name: t('table.name'),
            rate: t('table.rate'),
            hours: t('table.hours'),
            owed: t('table.owed'),
            actions: t('table.actions'),
            noValue: t('table.noValue'),
          },
          actions: { edit: t('actions.edit'), pay: t('actions.pay') },
          addInstructor: {
            title: t('addInstructor.title'),
            subtitle: t('addInstructor.subtitle'),
            searchLabel: t('addInstructor.searchLabel'),
            searchPlaceholder: t('addInstructor.searchPlaceholder'),
            noResults: t('addInstructor.noResults'),
            submit: t('addInstructor.submit'),
            cancel: t('addInstructor.cancel'),
            requiredField: t('addInstructor.requiredField'),
            genericError: t('addInstructor.genericError'),
          },
          editor: {
            closeLabel: t('editor.closeLabel'),
            cancel: t('editor.cancel'),
            identity: {
              sectionTitle: t('editor.identity.sectionTitle'),
              firstName: t('editor.identity.firstName'),
              lastName: t('editor.identity.lastName'),
              email: t('editor.identity.email'),
              phone: t('editor.identity.phone'),
              address: t('editor.identity.address'),
              fiscalCode: t('editor.identity.fiscalCode'),
              save: t('editor.identity.save'),
              loadError: t('editor.identity.loadError'),
            },
            payoutRate: {
              sectionTitle: t('editor.payoutRate.sectionTitle'),
              label: t('editor.payoutRate.label'),
              noValue: t('editor.payoutRate.noValue'),
              save: t('editor.payoutRate.save'),
              readOnlyHint: t('editor.payoutRate.readOnlyHint'),
            },
            readOnly: {
              sectionTitle: t('editor.readOnly.sectionTitle'),
              hoursTotal: t('editor.readOnly.hoursTotal'),
              owedTotal: t('editor.readOnly.owedTotal'),
            },
            studentRate: {
              heading: t('studentRate.heading'),
              current: t('studentRate.current'),
              noCurrentRate: t('studentRate.noCurrentRate'),
              loadError: t('studentRate.loadError'),
              price: t('studentRate.price'),
              validFrom: t('studentRate.validFrom'),
              submit: t('studentRate.submit'),
              rateAdded: t('studentRate.rateAdded'),
              requiredField: t('studentRate.requiredField'),
              invalidPrice: t('studentRate.invalidPrice'),
              invalidDate: t('studentRate.invalidDate'),
              genericError: t('studentRate.genericError'),
              conflictError: t('studentRate.conflictError'),
              readOnlyHint: t('studentRate.readOnlyHint'),
              historyTitle: t('studentRate.historyTitle'),
              historyEmpty: t('studentRate.historyEmpty'),
              historyActor: t('studentRate.historyActor'),
              historyWhen: t('studentRate.historyWhen'),
            },
            errors: { generic: t('editor.errors.generic'), invalidRate: t('editor.errors.invalidRate') },
          },
          profile: {
            closeLabel: t('profile.closeLabel'),
            edit: t('profile.edit'),
            kpi: {
              hoursTotal: t('profile.kpi.hoursTotal'),
              hoursMtd: t('profile.kpi.hoursMtd'),
              owedTotal: t('profile.kpi.owedTotal'),
              rate: t('profile.kpi.rate'),
            },
            recentStudents: { sectionTitle: t('profile.recentStudents.sectionTitle'), empty: t('profile.recentStudents.empty') },
            recentFlights: { sectionTitle: t('profile.recentFlights.sectionTitle'), empty: t('profile.recentFlights.empty') },
            noValue: t('table.noValue'),
          },
          pay: {
            title: t('pay.title'),
            amount: t('pay.amount'),
            method: t('pay.method'),
            methods: { cash: t('pay.methods.cash'), bankTransfer: t('pay.methods.bankTransfer'), pos: t('pay.methods.pos') },
            periodStart: t('pay.periodStart'),
            periodEnd: t('pay.periodEnd'),
            notes: t('pay.notes'),
            submit: t('pay.submit'),
            cancel: t('pay.cancel'),
            invalidAmount: t('pay.invalidAmount'),
            invalidPeriod: t('pay.invalidPeriod'),
            requiredField: t('pay.requiredField'),
            genericError: t('pay.genericError'),
          },
          paymentCycle: {
            title: t('paymentCycle.title'),
            subtitle: t('paymentCycle.subtitle'),
            empty: t('paymentCycle.empty'),
            pay: t('paymentCycle.pay'),
            closeLabel: t('paymentCycle.closeLabel'),
          },
          toast: {
            rateSet: t('toast.rateSet'),
            payoutRecorded: t('toast.payoutRecorded'),
            instructorAdded: t('toast.instructorAdded'),
            genericError: t('toast.genericError'),
            identitySaved: t('toast.identitySaved'),
          },
        }}
      />
    </main>
  );
}
