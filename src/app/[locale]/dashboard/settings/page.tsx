import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getAirfieldBranding } from '@/server/services/app-settings.service';
import { SettingsForm } from './settings-form';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Admin-only airfield settings (story 10.2, AC 1 — `settings.manage`), same
 * gate pattern as `dashboard/users/page.tsx`: `hasPermission` here only
 * decides whether to *redirect*; `setAirfieldBranding`'s own `authorize()`
 * (`app-settings.service.ts`) is the real guardian (AD-5). `getAirfieldBranding`
 * itself needs no gate (every role reads it for its own PDF exports) — see
 * that function's doc-comment.
 */
export default async function SettingsPage({ params }: PageProps) {
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

  const branding = await getAirfieldBranding();
  const t = await getTranslations('SettingsPage');

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-3xl">
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
        </div>

        <div className="mt-10">
          <SettingsForm
            initial={branding}
            labels={{
              nameLabel: t('form.nameLabel'),
              logoLabel: t('form.logoLabel'),
              logoHint: t('form.logoHint'),
              logoUpload: t('form.logoUpload'),
              logoRemove: t('form.logoRemove'),
              logoPreviewAlt: t('form.logoPreviewAlt'),
              logoTooLarge: t('form.logoTooLarge'),
              logoInvalidType: t('form.logoInvalidType'),
              save: t('form.save'),
              saved: t('form.saved'),
              error: t('form.error'),
            }}
          />
        </div>
      </div>
    </main>
  );
}
