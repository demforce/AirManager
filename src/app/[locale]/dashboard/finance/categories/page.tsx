import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listCashCategories } from '@/server/services/cash.service';
import { CategoriesManager } from './categories-manager';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Admin cash-category management (story 3.4, Task 3, AC 1) — reachable only
 * with `settings.manage` (the redirect here hides navigation; every service
 * call re-checks it, AD-5). Lists ALL categories (inactive included) with
 * their movement count, so the admin sees at a glance which ones are
 * deletable (count 0) and which can only be deactivated.
 */
export default async function CashCategoriesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  if (!hasPermission(actor, 'settings.manage')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const categories = await listCashCategories(actor, { includeInactive: true });

  const t = await getTranslations('CashCategoriesPage');

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-mid-gray">
              {t('kicker')}
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-ink">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-xl text-base leading-[1.6] text-mid-gray">{t('description')}</p>
          </div>
          <Link
            href="/dashboard/finance"
            locale={locale as AppLocale}
            className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
          >
            {t('backToFinance')}
          </Link>
        </div>

        <div className="mt-10">
          <CategoriesManager
            categories={categories.map((category) => ({
              id: category.id,
              name: category.name,
              isActive: category.isActive,
              movementCount: category.movementCount,
              isSystem: category.isSystem,
            }))}
            labels={{
              newCategory: t('newCategory'),
              table: {
                name: t('table.name'),
                status: t('table.status'),
                movements: t('table.movements'),
                actions: t('table.actions'),
                empty: t('table.empty'),
              },
              status: {
                active: t('status.active'),
                inactive: t('status.inactive'),
              },
              actions: {
                rename: t('actions.rename'),
                deactivate: t('actions.deactivate'),
                reactivate: t('actions.reactivate'),
                delete: t('actions.delete'),
                confirmDelete: t('actions.confirmDelete'),
                confirmYes: t('actions.confirmYes'),
                confirmCancel: t('actions.confirmCancel'),
              },
              form: {
                createTitle: t('form.createTitle'),
                renameTitle: t('form.renameTitle'),
                name: t('form.name'),
                submitCreate: t('form.submitCreate'),
                submitRename: t('form.submitRename'),
                cancel: t('form.cancel'),
                requiredField: t('form.requiredField'),
                conflictError: t('form.conflictError'),
                genericError: t('form.genericError'),
              },
              feedback: {
                created: t('feedback.created'),
                renamed: t('feedback.renamed'),
                deactivated: t('feedback.deactivated'),
                reactivated: t('feedback.reactivated'),
                deleted: t('feedback.deleted'),
                deleteInUseError: t('feedback.deleteInUseError'),
                genericError: t('feedback.genericError'),
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}
