import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import {
  getAirfieldBranding,
  getAirfieldContactEmail,
  getAirfieldIcao,
  getMembershipFeeCents,
  getMetarStation,
  getPprLandingFeeDefaultCents,
  getPprOperatingInstructions,
  getSchedulingSettings,
  getSmtpSettings,
} from '@/server/services/app-settings.service';
import { listCashCategories } from '@/server/services/cash.service';
import { listExpiryTypes } from '@/server/services/expiry-types.service';
import { CashCategoriesCard } from './cash-categories-card';
import { ClubCard } from './club-card';
import { RatingsCard } from './ratings-card';
import { SchedulingCard } from './scheduling-card';
import { SmtpCard } from './smtp-card';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Impostazioni (epic 12, story 12.11, AC 2) — AirOps-native, complete
 * rewrite of the branding-only legacy page (`SettingsForm`'s name/logo
 * control survives UNCHANGED inside the new "Club" card, same
 * `data-testid`s — `pdf-exports.spec.ts` drives it). Four cards, port of
 * `docs/design-reference/airops/src/SettingsView.jsx`: Club (identity +
 * ICAO + contact email + METAR station + PPR default fee/instructions +
 * quota associativa default), Pianificazione (booking window), Email
 * (SMTP, settings-first mailer + real test send), Abilitazioni (the
 * expiry-type catalogue, moved here from the removed
 * `/dashboard/expiries/types`), Categorie di cassa (story 12.13 review, F2 —
 * a minimal management UI for the `cash-categories` API, whose own page,
 * `/dashboard/finance/categories`, was removed in 12.13 AC1 without one).
 *
 * `settings.manage` (ADMIN-only) gates the whole page — `hasPermission`
 * here only decides the redirect; every card's own write action re-checks
 * via its own service function (AD-5).
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

  const [branding, icao, contactEmail, metarStation, landingFeeCents, operatingInstructions, membershipFeeCents, schedulingSettings, smtpSettings, expiryTypes, cashCategories] =
    await Promise.all([
      getAirfieldBranding(),
      getAirfieldIcao(),
      getAirfieldContactEmail(),
      getMetarStation(),
      getPprLandingFeeDefaultCents(actor),
      getPprOperatingInstructions(actor),
      getMembershipFeeCents(actor),
      getSchedulingSettings(),
      getSmtpSettings(actor),
      listExpiryTypes(actor, { includeInactive: true }),
      listCashCategories(actor, { includeInactive: true }),
    ]);

  const t = await getTranslations('SettingsPage');

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub')}</div>
        </div>
      </div>

      <ClubCard
        branding={branding}
        icao={icao}
        contactEmail={contactEmail}
        // `getMetarStation` already resolves the ICAO fallback (AC 1) — when
        // no explicit override is stored, its return value equals `icao`,
        // so the input starts EMPTY (icao shown only as a placeholder,
        // never as a value the admin didn't actually set) rather than
        // looking like a redundant override.
        metarStation={metarStation === icao ? '' : metarStation}
        landingFeeCents={landingFeeCents}
        operatingInstructions={operatingInstructions}
        membershipFeeCents={membershipFeeCents}
        labels={{
          title: t('club.title'),
          sub: t('club.sub'),
          identityHeading: t('club.identityHeading'),
          settingsForm: {
            nameLabel: t('club.form.nameLabel'),
            logoLabel: t('club.form.logoLabel'),
            logoHint: t('club.form.logoHint'),
            logoUpload: t('club.form.logoUpload'),
            logoRemove: t('club.form.logoRemove'),
            logoPreviewAlt: t('club.form.logoPreviewAlt'),
            logoTooLarge: t('club.form.logoTooLarge'),
            logoInvalidType: t('club.form.logoInvalidType'),
            save: t('club.form.save'),
            saved: t('club.form.saved'),
            error: t('club.form.error'),
          },
          icao: t('club.icao'),
          contactEmail: t('club.contactEmail'),
          metarStation: t('club.metarStation'),
          metarStationHint: t('club.metarStationHint'),
          landingFee: t('club.landingFee'),
          landingFeeHint: t('club.landingFeeHint'),
          operatingInstructionsIt: t('club.operatingInstructionsIt'),
          operatingInstructionsEn: t('club.operatingInstructionsEn'),
          membershipFee: t('club.membershipFee'),
          membershipFeeHint: t('club.membershipFeeHint'),
          save: t('club.save'),
          saved: t('club.saved'),
          error: t('club.error'),
        }}
      />

      <SchedulingCard
        initial={schedulingSettings}
        labels={{
          title: t('scheduling.title'),
          sub: t('scheduling.sub'),
          openTime: t('scheduling.openTime'),
          closeTime: t('scheduling.closeTime'),
          minSlotMinutes: t('scheduling.minSlotMinutes'),
          turnaroundMinutes: t('scheduling.turnaroundMinutes'),
          maxAdvanceDays: t('scheduling.maxAdvanceDays'),
          minutesSuffix: t('scheduling.minutesSuffix'),
          daysSuffix: t('scheduling.daysSuffix'),
          // `t.raw` (not `t`): the message carries `{open}`/`{close}`/`{slot}`/`{days}`
          // ICU placeholders interpolated CLIENT-SIDE from live form state
          // (`scheduling-card.tsx`'s own `.replace(...)` calls) — `t()` would
          // try to interpolate them immediately server-side and throw
          // `FORMATTING_ERROR` since no values are provided here.
          hint: t.raw('scheduling.hint') as string,
          save: t('scheduling.save'),
          saved: t('scheduling.saved'),
          error: t('scheduling.error'),
        }}
      />

      <SmtpCard
        initial={smtpSettings}
        labels={{
          title: t('smtp.title'),
          sub: t('smtp.sub'),
          testEmail: t('smtp.testEmail'),
          testEmailSent: t('smtp.testEmailSent'),
          testEmailFailed: t('smtp.testEmailFailed'),
          testEmailNoContact: t('smtp.testEmailNoContact'),
          host: t('smtp.host'),
          port: t('smtp.port'),
          security: t('smtp.security'),
          securityOptions: { NONE: t('smtp.securityOptions.NONE'), STARTTLS: t('smtp.securityOptions.STARTTLS'), SSL_TLS: t('smtp.securityOptions.SSL_TLS') },
          from: t('smtp.from'),
          user: t('smtp.user'),
          pass: t('smtp.pass'),
          passHint: t('smtp.passHint'),
          passConfigured: t('smtp.passConfigured'),
          save: t('smtp.save'),
          saved: t('smtp.saved'),
          error: t('smtp.error'),
        }}
      />

      <RatingsCard
        expiryTypes={expiryTypes}
        labels={{
          title: t('ratings.title'),
          sub: t('ratings.sub'),
          addAction: t('ratings.addAction'),
          table: {
            name: t('ratings.table.name'),
            scope: t('ratings.table.scope'),
            validity: t('ratings.table.validity'),
            status: t('ratings.table.status'),
            actions: t('ratings.table.actions'),
            empty: t('ratings.table.empty'),
            monthsSuffix: t('ratings.table.monthsSuffix'),
            noExpiry: t('ratings.table.noExpiry'),
          },
          scope: {
            PILOTS: t('ratings.scope.PILOTS'),
            STUDENTS: t('ratings.scope.STUDENTS'),
            INSTRUCTORS: t('ratings.scope.INSTRUCTORS'),
            ALL: t('ratings.scope.ALL'),
          },
          status: { active: t('ratings.status.active'), inactive: t('ratings.status.inactive') },
          blocksBooking: { yes: t('ratings.blocksBooking.yes') },
          actions: {
            edit: t('ratings.actions.edit'),
            deactivate: t('ratings.actions.deactivate'),
            reactivate: t('ratings.actions.reactivate'),
            delete: t('ratings.actions.delete'),
            confirmDelete: t('ratings.actions.confirmDelete'),
            confirmYes: t('ratings.actions.confirmYes'),
            confirmCancel: t('ratings.actions.confirmCancel'),
          },
          form: {
            createTitle: t('ratings.form.createTitle'),
            editTitle: t('ratings.form.editTitle'),
            name: t('ratings.form.name'),
            scope: t('ratings.form.scope'),
            validity: t('ratings.form.validity'),
            validityHint: t('ratings.form.validityHint'),
            blocksBooking: t('ratings.form.blocksBooking'),
            blocksBookingHint: t('ratings.form.blocksBookingHint'),
            submitCreate: t('ratings.form.submitCreate'),
            submitSave: t('ratings.form.submitSave'),
            cancel: t('ratings.form.cancel'),
            requiredField: t('ratings.form.requiredField'),
            conflictError: t('ratings.form.conflictError'),
            genericError: t('ratings.form.genericError'),
          },
          feedback: {
            created: t('ratings.feedback.created'),
            updated: t('ratings.feedback.updated'),
            deactivated: t('ratings.feedback.deactivated'),
            reactivated: t('ratings.feedback.reactivated'),
            deleted: t('ratings.feedback.deleted'),
            deleteInUseError: t('ratings.feedback.deleteInUseError'),
            genericError: t('ratings.feedback.genericError'),
          },
          hint: t('ratings.hint'),
        }}
      />

      <CashCategoriesCard
        categories={cashCategories}
        labels={{
          title: t('cashCategories.title'),
          sub: t('cashCategories.sub'),
          addAction: t('cashCategories.addAction'),
          table: {
            name: t('cashCategories.table.name'),
            movements: t('cashCategories.table.movements'),
            status: t('cashCategories.table.status'),
            actions: t('cashCategories.table.actions'),
            empty: t('cashCategories.table.empty'),
          },
          status: { active: t('cashCategories.status.active'), inactive: t('cashCategories.status.inactive') },
          systemBadge: t('cashCategories.systemBadge'),
          actions: {
            rename: t('cashCategories.actions.rename'),
            deactivate: t('cashCategories.actions.deactivate'),
            reactivate: t('cashCategories.actions.reactivate'),
            delete: t('cashCategories.actions.delete'),
            confirmDelete: t('cashCategories.actions.confirmDelete'),
            confirmYes: t('cashCategories.actions.confirmYes'),
            confirmCancel: t('cashCategories.actions.confirmCancel'),
          },
          form: {
            createTitle: t('cashCategories.form.createTitle'),
            renameTitle: t('cashCategories.form.renameTitle'),
            name: t('cashCategories.form.name'),
            submitCreate: t('cashCategories.form.submitCreate'),
            submitRename: t('cashCategories.form.submitRename'),
            cancel: t('cashCategories.form.cancel'),
            requiredField: t('cashCategories.form.requiredField'),
            conflictError: t('cashCategories.form.conflictError'),
            genericError: t('cashCategories.form.genericError'),
          },
          feedback: {
            created: t('cashCategories.feedback.created'),
            renamed: t('cashCategories.feedback.renamed'),
            deactivated: t('cashCategories.feedback.deactivated'),
            reactivated: t('cashCategories.feedback.reactivated'),
            deleted: t('cashCategories.feedback.deleted'),
            deleteInUseError: t('cashCategories.feedback.deleteInUseError'),
            genericError: t('cashCategories.feedback.genericError'),
          },
        }}
      />
    </main>
  );
}
