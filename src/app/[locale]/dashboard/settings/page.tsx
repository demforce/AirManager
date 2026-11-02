import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getSettingsSnapshot } from '@/server/services/settings.service';
import type { RatingsCardLabels } from './ratings-card';
import { SettingsConsole } from './settings-console';

type PageProps = {
  params: Promise<{ locale: string }>;
};

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * The (identical-shape) labels of one expiry-type card from its i18n
 * namespace (story 13.1, AC 3) — `ns` is `'ratings'` or `'medical'`, each a
 * sibling block of `SettingsPage`. Only the Ratings get the scope and the
 * "Blocca prenotazioni e voli" wording (story 19.8, R-19-j: a medical visit
 * has neither).
 */
function expiryTypeCardLabels(t: Translator, ns: 'ratings' | 'medical'): RatingsCardLabels & { errors: { nameTaken: string; inUse: string } } {
  return {
    title: t(`${ns}.title`),
    sub: t(`${ns}.sub`),
    addAction: t(`${ns}.addAction`),
    table: {
      name: t(`${ns}.table.name`),
      validity: t(`${ns}.table.validity`),
      status: t(`${ns}.table.status`),
      actions: t(`${ns}.table.actions`),
      empty: t(`${ns}.table.empty`),
      monthsSuffix: t(`${ns}.table.monthsSuffix`),
      noExpiry: t(`${ns}.table.noExpiry`),
    },
    status: { active: t(`${ns}.status.active`), inactive: t(`${ns}.status.inactive`) },
    actions: {
      edit: t(`${ns}.actions.edit`),
      deactivate: t(`${ns}.actions.deactivate`),
      reactivate: t(`${ns}.actions.reactivate`),
      delete: t(`${ns}.actions.delete`),
      restore: t('actions.restore'),
    },
    rowState: { new: t('rowState.new'), changed: t('rowState.changed'), removed: t('rowState.removed') },
    form: {
      createTitle: t(`${ns}.form.createTitle`),
      editTitle: t(`${ns}.form.editTitle`),
      name: t(`${ns}.form.name`),
      validity: t(`${ns}.form.validity`),
      validityHint: t(`${ns}.form.validityHint`),
      close: t(`${ns}.mobile.close`),
    },
    hint: t(`${ns}.hint`),
    mobile: { openDetail: t(`${ns}.mobile.openDetail`), empty: t(`${ns}.mobile.empty`) },
    ...(ns === 'ratings'
      ? {
          rating: {
            scopeColumn: t('ratings.table.scope'),
            scopeField: t('ratings.form.scope'),
            scope: {
              PILOTS: t('ratings.scope.PILOTS'),
              STUDENTS: t('ratings.scope.STUDENTS'),
              INSTRUCTORS: t('ratings.scope.INSTRUCTORS'),
              ALL: t('ratings.scope.ALL'),
            },
            blocksBadge: t('ratings.blocksBooking.yes'),
            blocksField: t('ratings.form.blocksBooking'),
            blocksHint: t('ratings.form.blocksBookingHint'),
            yes: t('ratings.mobile.yes'),
            no: t('ratings.mobile.no'),
          },
        }
      : {}),
    errors: { nameTaken: t(`${ns}.form.conflictError`), inUse: t(`${ns}.feedback.deleteInUseError`) },
  };
}

/**
 * Impostazioni (epic 12, story 12.11; story 19.8 — ONE "Salva" for the whole
 * page, R-19-m). Port of `docs/design-reference/airops/src/SettingsView.jsx`:
 * Club, Quota associativa (R-19-k), Currency (R-19-i), Pianificazione, Email
 * (SMTP), Tesoreria, and the three catalogues Ratings, Visite mediche (no
 * scope, R-19-j) and Categorie di cassa — every section controlled by
 * `SettingsConsole`'s draft and saved together, all or nothing, by
 * `PATCH /api/v1/settings` (A17).
 *
 * `settings.manage` (ADMIN-only) gates the whole page — `hasPermission` here
 * only decides the redirect; the snapshot read and the save re-check it in
 * `settings.service.ts` (AD-5).
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

  const snapshot = await getSettingsSnapshot(actor);

  const t = await getTranslations('SettingsPage');

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub')}</div>
        </div>
      </div>

      <SettingsConsole
        snapshot={snapshot}
        labels={{
          save: t('save'),
          saved: t('saved'),
          saveBar: {
            clean: t('saveBar.clean'),
            // `t.raw`: `{sections}` is filled client-side from the live draft
            // (same reason as `scheduling.hint` below).
            dirty: t.raw('saveBar.dirty') as string,
            saving: t('saveBar.saving'),
          },
          sections: {
            club: t('club.title'),
            membership: t('membership.title'),
            currency: t('currency.title'),
            scheduling: t('scheduling.title'),
            smtp: t('smtp.title'),
            treasury: t('treasury.title'),
            ratings: t('ratings.title'),
            medical: t('medical.title'),
            cashCategories: t('cashCategories.title'),
          },
          errors: {
            required: t('errors.required'),
            invalidEmail: t('club.invalidEmail'),
            invalidRange: t('scheduling.invalidRange'),
            invalidHost: t('smtp.invalidHost'),
            invalidAmount: t('errors.invalidAmount'),
            requiredDate: t('treasury.requiredDate'),
            invalidValue: t('errors.invalidValue'),
            // `t.raw`: `{min}`/`{max}` come from the rule that failed, client-side.
            integerRange: t.raw('errors.integerRange') as string,
            duplicateName: t('errors.duplicateName'),
            invalidItem: t('errors.invalidItem'),
            stale: t('errors.stale'),
            systemCategory: t('errors.systemCategory'),
            checkFields: t('errors.checkFields'),
            forbidden: t('errors.forbidden'),
            generic: t('errors.generic'),
          },
          club: {
            title: t('club.title'),
            sub: t('club.sub'),
            nameLabel: t('club.form.nameLabel'),
            icao: t('club.icao'),
            contactEmail: t('club.contactEmail'),
            contactEmailHint: t('club.contactEmailHint'),
            metarStation: t('club.metarStation'),
            metarStationHint: t('club.metarStationHint'),
          },
          membership: {
            title: t('membership.title'),
            sub: t('membership.sub'),
            fee: t('membership.fee'),
            feeHint: t('membership.feeHint'),
          },
          currency: {
            title: t('currency.title'),
            sub: t('currency.sub'),
            minFlights: t('currency.minFlights'),
            windowDays: t('currency.windowDays'),
            flightsSuffix: t('currency.flightsSuffix'),
            daysSuffix: t('currency.daysSuffix'),
            hint: t('currency.hint'),
          },
          scheduling: {
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
          },
          smtp: {
            title: t('smtp.title'),
            sub: t('smtp.sub'),
            testEmail: t('smtp.testEmail'),
            testEmailSent: t('smtp.testEmailSent'),
            testEmailFailed: t('smtp.testEmailFailed'),
            testEmailNoContact: t('smtp.testEmailNoContact'),
            testEmailNeedsSave: t('smtp.testEmailNeedsSave'),
            host: t('smtp.host'),
            port: t('smtp.port'),
            security: t('smtp.security'),
            securityOptions: { NONE: t('smtp.securityOptions.NONE'), STARTTLS: t('smtp.securityOptions.STARTTLS'), SSL_TLS: t('smtp.securityOptions.SSL_TLS') },
            from: t('smtp.from'),
            user: t('smtp.user'),
            pass: t('smtp.pass'),
            passHint: t('smtp.passHint'),
            passConfigured: t('smtp.passConfigured'),
          },
          treasury: {
            title: t('treasury.title'),
            sub: t('treasury.sub'),
            openingCash: t('treasury.openingCash'),
            openingBank: t('treasury.openingBank'),
            openingDate: t('treasury.openingDate'),
            hint: t('treasury.hint'),
          },
          ratings: expiryTypeCardLabels(t, 'ratings'),
          medical: expiryTypeCardLabels(t, 'medical'),
          cashCategories: {
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
              restore: t('actions.restore'),
            },
            rowState: { new: t('rowState.new'), changed: t('rowState.changed'), removed: t('rowState.removed') },
            form: {
              createTitle: t('cashCategories.form.createTitle'),
              renameTitle: t('cashCategories.form.renameTitle'),
              name: t('cashCategories.form.name'),
              close: t('cashCategories.mobile.close'),
            },
            mobile: {
              openDetail: t('cashCategories.mobile.openDetail'),
              empty: t('cashCategories.mobile.empty'),
              // `t.raw`: `{count}` is interpolated client-side from the row's own
              // `movementCount` (same reason as `scheduling.hint` above).
              movementsCount: t.raw('cashCategories.mobile.movementsCount') as string,
            },
            errors: { nameTaken: t('cashCategories.form.conflictError'), inUse: t('cashCategories.feedback.deleteInUseError') },
          },
        }}
      />
    </main>
  );
}
