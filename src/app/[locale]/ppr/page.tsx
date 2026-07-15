import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { Icon } from '@/components/ui/icons';
import { getAirfieldBranding, getAirfieldIcao } from '@/server/services/app-settings.service';
import { PprForm } from './ppr-form';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Per-page metadata (story 8.1) — unchanged by story 12.4's rebuild.
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
 * Public PPR request page (epic 8, story 8.1; FR-22; rebuilt epic 12, story
 * 12.4, AC 4) — `src/proxy.ts` `PUBLIC_WEB_PATHS`, reachable by anyone with
 * the URL, no session. Rebuilt from
 * `docs/design-reference/airops/PPR Request.html` (`.ppr-*` classes, in
 * `airops.css` since story 12.1) — outside `dashboard/layout.tsx` entirely,
 * so no `airopsNative`/`LegacyBackdrop` opt-out applies here (Dev Notes:
 * `.ppr-page` sets its OWN `background`/`color` from the theme variables,
 * overriding the root `[locale]/layout.tsx`'s hardcoded legacy `<body>`
 * classes via plain CSS inheritance — no shim needed).
 *
 * The prototype's top-right AFIS/ELEV/OPS stats and the aside's
 * schedule/runway/circuit/fuel rows have NO backing setting (AC 4) and are
 * OMITTED entirely, not stubbed with placeholder text — the aside keeps
 * only "Come funziona" (static i18n copy) and a REDUCED airport card
 * (name + ICAO from `getAirfieldBranding()`/`getAirfieldIcao()`, the same
 * two facts the dashboard shell's own brand chip already shows). A contact
 * email for that reduced card has no setting yet either (story 12.11 if
 * ratified) — omitted, not fabricated.
 */
export default async function PprPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [branding, icao] = await Promise.all([getAirfieldBranding(), getAirfieldIcao()]);

  const t = await getTranslations('PprPage');
  const otherLocale: AppLocale = locale === 'it' ? 'en' : 'it';

  return (
    <div className="ppr-page" data-testid="ppr-page">
      <header className="ppr-top">
        <div className="ppr-top-in">
          <div className="ppr-mark">
            <Icon.logo />
          </div>
          <div>
            <div className="ppr-brand-name">
              {branding.name}
              {icao ? ` · ${icao}` : ''}
            </div>
            <div className="ppr-brand-sub">{t('top.brandSub')}</div>
          </div>
          <div className="ppr-top-right">
            <Link href="/ppr" locale={otherLocale} style={{ color: 'inherit' }}>
              {t('switchTo')}
            </Link>
          </div>
        </div>
      </header>

      <div className="ppr-hero">
        <div className="ppr-eyebrow">{t('hero.eyebrow')}</div>
        <h1>{t('hero.title')}</h1>
        <p>{t('hero.description')}</p>
      </div>

      <div className="ppr-grid" id="grid">
        <PprForm
          locale={locale as AppLocale}
          labels={{
            sections: {
              requester: t('form.sections.requester'),
              aircraft: t('form.sections.aircraft'),
              schedule: t('form.sections.schedule'),
              additional: t('form.sections.additional'),
            },
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
            requiredNote: t('form.requiredNote'),
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
              again: t('success.again'),
            },
          }}
        />

        <aside className="ppr-aside">
          <div className="info-card accent">
            <h3>{t('aside.howItWorks.title')}</h3>
            <ul>
              <li>{t('aside.howItWorks.item1')}</li>
              <li>{t('aside.howItWorks.item2')}</li>
              <li>{t('aside.howItWorks.item3')}</li>
            </ul>
          </div>
          <div className="info-card">
            <h3>{t('aside.airport.title')}</h3>
            <div className="info-row">
              <span className="k">{t('aside.airport.nameLabel')}</span>
              <span className="v">{branding.name}</span>
            </div>
            {icao ? (
              <div className="info-row">
                <span className="k">{t('aside.airport.icaoLabel')}</span>
                <span className="v">{icao}</span>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <footer className="ppr-foot">
        <div className="ppr-foot-in">
          <span>{branding.name}</span>
          <span>{t('footer')}</span>
        </div>
      </footer>
    </div>
  );
}
