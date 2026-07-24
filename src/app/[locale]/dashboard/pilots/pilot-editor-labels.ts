/**
 * `PilotEditor` label builders (story 13.3, R-13.3-c) — extracted from
 * `pilots/page.tsx` (same `booking-labels.ts` precedent: one implementation
 * instead of drifting between every page that mounts the 13.2 slide-over)
 * so the scheda persona's own "Modifica" button (`people/[id]/page.tsx`)
 * reuses the EXACT SAME translation wiring, not a second hand-copied one.
 * Pure, server-only — `pilots/page.tsx` renders byte-identical output to
 * before this extraction.
 */
import type { getTranslations } from 'next-intl/server';
import type { PilotEditorLabels, ToastLabels } from './pilot-editor';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * `t` = `PilotsPage` (the editor's own copy, generic across any person —
 * not pilot-specific despite the namespace name), `tProfiles` =
 * `PeoplePage` (profile activate/edit copy shared with the legacy
 * `ProfilesPanel`), `tUsers` = `UsersPage` (role names shared with
 * `/dashboard/users`).
 */
export function buildPilotEditorLabels(t: Translator, tProfiles: Translator, tUsers: Translator): PilotEditorLabels {
  return {
    newTitle: t('editor.newTitle'),
    newSubtitle: t('editor.newSubtitle'),
    closeLabel: t('editor.closeLabel'),
    cancel: t('editor.cancel'),
    submitCreate: t('editor.submitCreate'),
    submitEdit: t('editor.submitEdit'),
    identity: {
      sectionTitle: t('editor.identity.sectionTitle'),
      firstName: t('editor.identity.firstName'),
      lastName: t('editor.identity.lastName'),
      email: t('editor.identity.email'),
      phone: t('editor.identity.phone'),
      address: t('editor.identity.address'),
      fiscalCode: t('editor.identity.fiscalCode'),
    },
    profiles: {
      sectionTitle: t('editor.profiles.sectionTitle'),
      status: {
        active: tProfiles('profilesPanel.status.active'),
        inactive: tProfiles('profilesPanel.status.inactive'),
        notActivated: tProfiles('profilesPanel.status.notActivated'),
      },
      actions: {
        activate: tProfiles('profilesPanel.actions.activate'),
        edit: tProfiles('profilesPanel.actions.edit'),
        reactivate: tProfiles('profilesPanel.actions.reactivate'),
        deactivate: tProfiles('profilesPanel.actions.deactivate'),
        confirmDeactivate: tProfiles('profilesPanel.actions.confirmDeactivate'),
        confirmYes: tProfiles('profilesPanel.actions.confirmYes'),
        confirmCancel: tProfiles('profilesPanel.actions.confirmCancel'),
        cancel: tProfiles('profilesPanel.actions.cancel'),
        save: tProfiles('profilesPanel.actions.save'),
      },
      errors: { requiredField: tProfiles('profilesPanel.errors.requiredField'), generic: tProfiles('profilesPanel.errors.generic') },
      pilot: {
        title: tProfiles('profilesPanel.pilot.title'),
        licenseNumber: tProfiles('profilesPanel.pilot.licenseNumber'),
        licenseType: tProfiles('profilesPanel.pilot.licenseType'),
      },
      student: { title: tProfiles('profilesPanel.student.title'), courseStartDate: tProfiles('profilesPanel.student.courseStartDate') },
      instructor: { title: tProfiles('profilesPanel.instructor.title') },
    },
    ratings: {
      sectionTitle: t('editor.ratings.sectionTitle'),
      empty: t('editor.ratings.empty'),
      status: { ok: t('editor.ratings.status.ok'), expiring: t('editor.ratings.status.expiring'), expired: t('editor.ratings.status.expired') },
      dateLabel: t('editor.ratings.dateLabel'),
      addAction: t('editor.ratings.addAction'),
      cancel: t('editor.ratings.cancel'),
      save: t('editor.ratings.save'),
      edit: t('editor.ratings.edit'),
      remove: t('editor.ratings.remove'),
      confirmRemove: t('editor.ratings.confirmRemove'),
      confirmYes: t('editor.ratings.confirmYes'),
      confirmCancel: t('editor.ratings.confirmCancel'),
      requiredDate: t('editor.ratings.requiredDate'),
      genericError: t('editor.ratings.genericError'),
    },
    medical: {
      subHeading: t('editor.medical.subHeading'),
      empty: t('editor.medical.empty'),
      status: { ok: t('editor.ratings.status.ok'), expiring: t('editor.ratings.status.expiring'), expired: t('editor.ratings.status.expired') },
      dateLabel: t('editor.medical.dateLabel'),
      addAction: t('editor.medical.addAction'),
      cancel: t('editor.medical.cancel'),
      save: t('editor.medical.save'),
      edit: t('editor.medical.edit'),
      remove: t('editor.medical.remove'),
      confirmRemove: t('editor.medical.confirmRemove'),
      confirmYes: t('editor.medical.confirmYes'),
      confirmCancel: t('editor.medical.confirmCancel'),
      requiredDate: t('editor.medical.requiredDate'),
      genericError: t('editor.medical.genericError'),
    },
    access: {
      sectionTitle: t('editor.access.sectionTitle'),
      noUser: t('editor.access.noUser'),
      email: t('editor.access.email'),
      roles: t('editor.access.roles'),
      roleOptions: {
        ADMIN: tUsers('roles.ADMIN'),
        STAFF: tUsers('roles.STAFF'),
        INSTRUCTOR: tUsers('roles.INSTRUCTOR'),
        PILOT: tUsers('roles.PILOT'),
        STUDENT: tUsers('roles.STUDENT'),
      },
      rolesRequired: t('editor.access.rolesRequired'),
      createSubmit: t('editor.access.createSubmit'),
      // `t.raw` (not `t`): the literal `{email}`/`{roles}` placeholders are
      // filled CLIENT-side in `AccessSection` — `t()` would throw
      // FORMATTING_ERROR for an unprovided ICU var.
      userSummary: t.raw('editor.access.userSummary') as string,
      statusActive: t('editor.access.statusActive'),
      statusPending: t('editor.access.statusPending'),
      resendInvite: t('editor.access.resendInvite'),
      emailConflict: t('editor.access.emailConflict'),
      genericError: t('editor.access.genericError'),
      grantLabel: t('editor.access.grantLabel'),
      invalidEmail: t('editor.access.invalidEmail'),
    },
    archive: {
      sectionTitle: t('editor.archive.sectionTitle'),
      archive: t('editor.archive.archive'),
      unarchive: t('editor.archive.unarchive'),
      confirmArchive: t('editor.archive.confirmArchive'),
      confirmUnarchive: t('editor.archive.confirmUnarchive'),
      confirmYes: t('editor.archive.confirmYes'),
      confirmCancel: t('editor.archive.confirmCancel'),
    },
    errors: {
      required: t('editor.errors.required'),
      generic: t('editor.errors.generic'),
      conflictEmail: t('editor.errors.conflictEmail'),
    },
  };
}

export function buildPilotEditorToastLabels(t: Translator): ToastLabels {
  return {
    created: t('toast.created'),
    updated: t('toast.updated'),
    archived: t('toast.archived'),
    unarchived: t('toast.unarchived'),
    userCreated: t('toast.userCreated'),
    inviteResent: t('toast.inviteResent'),
    genericError: t('toast.genericError'),
  };
}
