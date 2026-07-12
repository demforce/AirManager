import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { PprForm } from './ppr-form';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Per-page metadata (story 8.1) — the FIRST page in this codebase with its
 * OWN `generateMetadata`, rather than relying solely on the root layout's
 * (`src/app/[locale]/layout.tsx`, `Metadata` namespace): `/[locale]/ppr` is
 * the first public page meant to be indexable/shareable on its own terms
 * (an external pilot might land here from a search engine or a link, not
 * only from inside the app) — a new pattern, deliberately, per the story's
 * Contesto.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'PprPage.metadata' });

  return {
    title: t('title'),
    description: t('description'),
  };
}

/**
 * Public PPR request page (epic 8, story 8.1; FR-22) — `src/proxy.ts`
 * `PUBLIC_WEB_PATHS`, reachable by anyone with the URL, no session. Lives
 * OUTSIDE the `(auth)` route group (that group is for the pre-session
 * account flows — login/set-password/forgot-password; this is a standing
 * public page, not a one-time token flow) — same top-level placement as
 * `HomePage`. Labels are resolved server-side and handed to the client
 * form (`PprForm`), same pattern as `set-password/page.tsx`.
 */
export default async function PprPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('PprPage');
  const otherLocale: AppLocale = locale === 'it' ? 'en' : 'it';

  return (
    <main className="flex flex-1 justify-center px-6 py-16 sm:px-16 sm:py-24">
      <div className="w-full max-w-2xl">
        <div className="mb-10 flex items-center justify-between">
          <span className="rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-mid-gray">
            {t('kicker')}
          </span>
          <Link
            href="/ppr"
            locale={otherLocale}
            className="text-sm font-medium text-ink underline decoration-hairline underline-offset-4 transition-colors hover:decoration-ink"
          >
            {t('switchTo')}
          </Link>
        </div>

        <h1 className="text-4xl font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-[1.6] text-mid-gray">{t('description')}</p>

        <div className="mt-10">
          <PprForm
            locale={locale as AppLocale}
            labels={{
              firstName: t('form.firstName'),
              lastName: t('form.lastName'),
              email: t('form.email'),
              phone: t('form.phone'),
              aircraftRegistration: t('form.aircraftRegistration'),
              aircraftType: t('form.aircraftType'),
              origin: t('form.origin'),
              destination: t('form.destination'),
              eta: t('form.eta'),
              etd: t('form.etd'),
              personsOnBoard: t('form.personsOnBoard'),
              notes: t('form.notes'),
              submit: t('form.submit'),
              submitting: t('form.submitting'),
              requiredField: t('form.requiredField'),
              invalidEmail: t('form.invalidEmail'),
              invalidRange: t('form.invalidRange'),
              invalidPersons: t('form.invalidPersons'),
              errors: {
                ETA_IN_PAST: t('form.errors.ETA_IN_PAST'),
                ETD_NOT_AFTER_ETA: t('form.errors.ETD_NOT_AFTER_ETA'),
                RATE_LIMITED: t('form.errors.RATE_LIMITED'),
                generic: t('form.errors.generic'),
              },
              success: {
                title: t('success.title'),
                message: t('success.message'),
              },
            }}
          />
        </div>

        <p className="mt-10 text-center text-xs text-mid-gray">{t('footer')}</p>
      </div>
    </main>
  );
}
