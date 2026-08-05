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
  getTreasurySettings,
} from '@/server/services/app-settings.service';
import { listCashCategories } from '@/server/services/cash.service';
import { listExpiryTypes } from '@/server/services/expiry-types.service';
import { CashCategoriesCard } from './cash-categories-card';
import { ClubCard } from './club-card';
import { RatingsCard, type RatingsCardLabels } from './ratings-card';
import { SchedulingCard } from './scheduling-card';
import { SmtpCard } from './smtp-card';
import { TreasuryCard } from './treasury-card';

type PageProps = {
  params: Promise<{ locale: string }>;
};

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Builds the (identical-shape) labels for one `RatingsCard` instance from
 * its i18n namespace (story 13.1, AC 3) — `ns` is `'ratings'` (Abilitazioni)
 * or `'medical'` (Visite mediche), each a full sibling block in
 * `messages/{it,en}.json`'s `SettingsPage`. Shared so the two cards below
 * don't duplicate this ~35-line lookup twice.
 */
function expiryTypeCardLabels(t: Translator, ns: 'ratings' | 'medical'): RatingsCardLabels {
  return {
    title: t(`${ns}.title`),
    sub: t(`${ns}.sub`),
    addAction: t(`${ns}.addAction`),
    table: {
      name: t(`${ns}.table.name`),
      scope: t(`${ns}.table.scope`),
      validity: t(`${ns}.table.validity`),
      status: t(`${ns}.table.status`),
      actions: t(`${ns}.table.actions`),
      empty: t(`${ns}.table.empty`),
      monthsSuffix: t(`${ns}.table.monthsSuffix`),
      noExpiry: t(`${ns}.table.noExpiry`),
    },
    scope: {
      PILOTS: t(`${ns}.scope.PILOTS`),
      STUDENTS: t(`${ns}.scope.STUDENTS`),
      INSTRUCTORS: t(`${ns}.scope.INSTRUCTORS`),
      ALL: t(`${ns}.scope.ALL`),
    },
    status: { active: t(`${ns}.status.active`), inactive: t(`${ns}.status.inactive`) },
    blocksBooking: { yes: t(`${ns}.blocksBooking.yes`) },
    actions: {
      edit: t(`${ns}.actions.edit`),
      deactivate: t(`${ns}.actions.deactivate`),
      reactivate: t(`${ns}.actions.reactivate`),
      delete: t(`${ns}.actions.delete`),
      confirmDelete: t(`${ns}.actions.confirmDelete`),
      confirmYes: t(`${ns}.actions.confirmYes`),
      confirmCancel: t(`${ns}.actions.confirmCancel`),
    },
    form: {
      createTitle: t(`${ns}.form.createTitle`),
      editTitle: t(`${ns}.form.editTitle`),
      name: t(`${ns}.form.name`),
      scope: t(`${ns}.form.scope`),
      validity: t(`${ns}.form.validity`),
      validityHint: t(`${ns}.form.validityHint`),
      blocksBooking: t(`${ns}.form.blocksBooking`),
      blocksBookingHint: t(`${ns}.form.blocksBookingHint`),
      submitCreate: t(`${ns}.form.submitCreate`),
      submitSave: t(`${ns}.form.submitSave`),
      cancel: t(`${ns}.form.cancel`),
      requiredField: t(`${ns}.form.requiredField`),
      conflictError: t(`${ns}.form.conflictError`),
      genericError: t(`${ns}.form.genericError`),
    },
    feedback: {
      created: t(`${ns}.feedback.created`),
      updated: t(`${ns}.feedback.updated`),
      deactivated: t(`${ns}.feedback.deactivated`),
      reactivated: t(`${ns}.feedback.reactivated`),
      deleted: t(`${ns}.feedback.deleted`),
      deleteInUseError: t(`${ns}.feedback.deleteInUseError`),
      genericError: t(`${ns}.feedback.genericError`),
    },
    hint: t(`${ns}.hint`),
    mobile: {
      openDetail: t(`${ns}.mobile.openDetail`),
      close: t(`${ns}.mobile.close`),
      empty: t(`${ns}.mobile.empty`),
      yes: t(`${ns}.mobile.yes`),
      no: t(`${ns}.mobile.no`),
    },
  };
}

/**
 * Impostazioni (epic 12, story 12.11, AC 2) — AirOps-native, complete
 * rewrite of the branding-only legacy page (`SettingsForm`'s name control
 * survives inside the new "Club" card, same `data-testid`s —
 * `pdf-exports.spec.ts` drives it; name-only since story 13.8, AC 4). Port
 * of
 * `docs/design-reference/airops/src/SettingsView.jsx`: Club (identity +
 * ICAO + contact email + METAR station + PPR default fee/instructions +
 * quota associativa default), Pianificazione (booking window), Email
 * (SMTP, settings-first mailer + real test send), Abilitazioni + Visite
 * mediche (story 13.1, AC 3, R-13.1-a — TWO instances of the SAME
 * `RatingsCard` component split by `ExpiryType.kind`, the expiry-type
 * catalogue moved here from the removed `/dashboard/expiries/types`),
 * Categorie di cassa (story 12.13 review, F2 — a minimal management UI for
 * the `cash-categories` API, whose own page, `/dashboard/finance/categories`,
 * was removed in 12.13 AC1 without one), Tesoreria (story Billing-2, AC 4 —
 * the opening cash/bank balances `getBillingSummary`'s treasury figures run
 * from; read here via a direct server-component call to
 * `getTreasurySettings`, no GET route registered — D5, this is the only
 * consumer).
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

  const [branding, icao, contactEmail, metarStation, landingFeeCents, operatingInstructions, membershipFeeCents, schedulingSettings, smtpSettings, treasurySettings, expiryTypes, cashCategories] =
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
      getTreasurySettings(actor),
      listExpiryTypes(actor, { includeInactive: true }),
      listCashCategories(actor, { includeInactive: true }),
    ]);

  // Story 13.1 (AC 3, R-13.1-a): ONE fetch, split client-side by `kind` — the
  // "Abilitazioni" card shows only RATING, the new "Visite mediche" card
  // only MEDICAL (the service also accepts a `kind` query filter, AC 2, for
  // consumers that want the DB to do the split instead).
  const ratingTypes = expiryTypes.filter((expiryType) => expiryType.kind === 'RATING');
  const medicalTypes = expiryTypes.filter((expiryType) => expiryType.kind === 'MEDICAL');

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
            save: t('club.form.save'),
            saved: t('club.form.saved'),
            error: t('club.form.error'),
            requiredField: t('club.form.requiredField'),
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
          invalidEmail: t('club.invalidEmail'),
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
          invalidRange: t('scheduling.invalidRange'),
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
          invalidHost: t('smtp.invalidHost'),
        }}
      />

      <TreasuryCard
        openingCashCents={treasurySettings.openingCashCents}
        openingBankCents={treasurySettings.openingBankCents}
        openingDate={treasurySettings.openingDate}
        labels={{
          title: t('treasury.title'),
          sub: t('treasury.sub'),
          openingCash: t('treasury.openingCash'),
          openingBank: t('treasury.openingBank'),
          openingDate: t('treasury.openingDate'),
          hint: t('treasury.hint'),
          save: t('treasury.save'),
          saved: t('treasury.saved'),
          error: t('treasury.error'),
          invalidAmount: t('treasury.invalidAmount'),
          requiredDate: t('treasury.requiredDate'),
        }}
      />

      <RatingsCard expiryTypes={ratingTypes} labels={expiryTypeCardLabels(t, 'ratings')} />

      <RatingsCard
        expiryTypes={medicalTypes}
        kind="MEDICAL"
        labels={expiryTypeCardLabels(t, 'medical')}
        testIds={{
          card: 'medical-settings-card',
          addButton: 'medical-add-button',
          feedback: 'medical-feedback',
          row: 'medical-row',
          editButton: 'medical-edit-button',
          form: 'medical-form',
          nameInput: 'medical-name-input',
          scopeSelect: 'medical-scope-select',
          validityInput: 'medical-validity-input',
          formSubmit: 'medical-form-submit',
          formError: 'medical-form-error',
          mobileList: 'mobile-medical-list',
          mobileEmpty: 'mobile-medical-empty',
          mobileRow: 'medical-row-mobile',
          mobileSheet: 'mobile-medical-sheet',
          mobileEditButton: 'medical-edit-button-mobile',
          mobileToggleButton: 'medical-toggle-button-mobile',
          mobileDeleteButton: 'medical-delete-button-mobile',
          mobileDeleteConfirm: 'medical-delete-confirm-mobile',
          mobileDeleteCancel: 'medical-delete-cancel-mobile',
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
          mobile: {
            openDetail: t('cashCategories.mobile.openDetail'),
            close: t('cashCategories.mobile.close'),
            empty: t('cashCategories.mobile.empty'),
            // `t.raw`: `{count}` is interpolated client-side from the row's own
            // `movementCount` (same reason as `scheduling.hint` above).
            movementsCount: t.raw('cashCategories.mobile.movementsCount') as string,
          },
        }}
      />
    </main>
  );
}
