'use client';

/**
 * Pilot slide-over editor (story 12.6, AC 3/4; rebuilt story 13.2) — port of
 * `docs/design-reference/airops/src/People.jsx#PilotEditor` extended to
 * sections carrying the REAL domain concepts the prototype's flat
 * name/license/medical form has no counterpart for (same rationale as
 * `fleet/aircraft-editor.tsx`'s own extension over its own prototype):
 * anagrafica, profili (pilota/allievo/istruttore), ratings + visita medica,
 * accesso (ADMIN-only), archivio.
 *
 * Story 13.2 (AC 1, "form unico"): the CREATE flow (`NewPersonForm` below)
 * is ONE form bundling anagrafica + profile activation + ratings/medical
 * chips + accesso into a SINGLE `POST /api/v1/people` composite call.
 * Story 19.4 (R-19-m, A17) brings the same model to the EDIT flow
 * (`EditPersonForm`): ONE form — anagrafica, profiles, ratings and visita
 * medica, all in draft — and ONE "Salva" in the panel footer, which sends
 * ONE `PATCH /api/v1/people/{id}` with only what changed (D-3); the server
 * saves it all or nothing. Accesso and Archivio stay actions of their own,
 * outside that form.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { Role } from '@/generated/prisma/client';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import {
  ExpiryDraftEditor,
  fetchExpiryTypes,
  usePersonExpiryDraft,
  type ExpiryCatalogEntry,
  type ExpiryDraftEditorLabels,
  type ExpiryKind,
} from '@/components/dashboard/expiry-editor';
import { isExpiryScopeCompatible, type ProfileFlags } from '@/lib/expiry-scope';
import { formatDateOnly } from '@/lib/time';
import { parseApiError } from '@/lib/api-field-errors';
import { focusFirstInvalid } from '@/lib/dom-focus';
import { blankToNull, changedIdentityFields, IDENTITY_FIELDS, personSaveError, type PersonSaveErrorLabels, type PersonSaveSection } from '@/lib/person-save';
import {
  createPersonBaseSchema,
  updatePersonSchema,
  type CreatePersonInput,
  type PersonDetailDto,
  type UpdatePersonCompositeInput,
  type UpdatePersonInput,
} from '@/lib/schemas/people';
import type { PilotRow, PilotUser } from './pilots-console';

export type PilotEditorLabels = {
  newTitle: string;
  newSubtitle: string;
  closeLabel: string;
  cancel: string;
  submitCreate: string;
  submitEdit: string;
  identity: { sectionTitle: string; firstName: string; lastName: string; email: string; phone: string; address: string };
  profiles: {
    sectionTitle: string;
    status: { active: string; inactive: string; notActivated: string };
    /** `exclusive` — story 19.3: the 422 `STUDENT_PROFILE_EXCLUSIVE` (Student with Pilot or Instructor); since story 19.4 also the hint beside the profile controls that rule disables. */
    errors: { requiredField: string; generic: string; exclusive: string };
    pilot: { title: string; licenseNumber: string; licenseType: string };
    student: { title: string; courseStartDate: string };
    instructor: { title: string };
  };
  /** `sectionTitle` wraps BOTH the Ratings and the Visita medica editors (AC 2: "stessa sezione") — the rest mirrors `ExpiryDraftEditorLabels`. */
  ratings: { sectionTitle: string } & ExpiryDraftEditorLabels;
  /** `subHeading` is the in-section label above the medical picker (AC 2/1) — the rest mirrors `ExpiryDraftEditorLabels`. */
  medical: { subHeading: string } & ExpiryDraftEditorLabels;
  access: {
    sectionTitle: string;
    noUser: string;
    email: string;
    roles: string;
    roleOptions: Record<Role, string>;
    rolesRequired: string;
    createSubmit: string;
    userSummary: string;
    statusActive: string;
    statusPending: string;
    resendInvite: string;
    emailConflict: string;
    genericError: string;
    /** New person form only (story 13.2, AC 1): the "grant access" checkbox that folds the `access` block into the composite create. */
    grantLabel: string;
    invalidEmail: string;
  };
  archive: { sectionTitle: string; archive: string; unarchive: string; confirmArchive: string; confirmUnarchive: string; confirmYes: string; confirmCancel: string };
  /** `profilesExclusive` — story 19.3: the create's 422 `STUDENT_PROFILE_EXCLUSIVE`, in the form banner. */
  errors: { required: string; generic: string; conflictEmail: string; profilesExclusive: string };
  /** The edit form's failed Salva, one message per reason (review 19.4 F2) — shared with the instructor editor. */
  saveErrors: PersonSaveErrorLabels;
};

export type ToastLabels = {
  created: string;
  updated: string;
  archived: string;
  unarchived: string;
  userCreated: string;
  inviteResent: string;
  genericError: string;
};

type ToastHandle = { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };

type EditorTarget = { mode: 'new' } | { mode: 'edit'; pilot: PilotRow };

type PilotEditorProps = {
  target: EditorTarget | null;
  onClose: () => void;
  /** Refreshes the server-rendered list (AD-1) — called after every successful mutation. */
  onMutated: () => void;
  canManageUsers: boolean;
  locale: 'it' | 'en';
  labels: PilotEditorLabels;
  toastLabels: ToastLabels;
};

type ApiErrorBody = { error?: { code?: string } };

async function errorCodeOf(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return (body as ApiErrorBody | null)?.error?.code ?? null;
}

export function PilotEditor({ target, onClose, onMutated, canManageUsers, locale, labels, toastLabels }: PilotEditorProps) {
  const toast = useToast();
  const isNew = target?.mode === 'new';
  const [current, setCurrent] = useState<PilotRow | null>(target?.mode === 'edit' ? target.pilot : null);

  const open = target !== null;
  const title = isNew ? labels.newTitle : current ? `${current.lastName} ${current.firstName}` : '';
  const subtitle = isNew ? labels.newSubtitle : (current?.email ?? '');

  /** Mirrors `EditPersonForm`: `dirty` = the Salva has something to send (D-5), `busy` = a save is in flight. */
  const [editState, setEditState] = useState<{ dirty: boolean; busy: boolean }>({ dirty: false, busy: false });

  /** Merges a partial API response into the editor's own working copy (same rationale as `AircraftEditor`'s `handleMutated`) and tells the parent list to refresh. */
  function applyPatch(patch: Partial<PilotRow>): void {
    setCurrent((existing) => (existing ? { ...existing, ...patch } : existing));
    onMutated();
  }

  /* The panel's ONE "Salva" (story 19.4, R-19-m) lives in `SlideOver`'s
     `footer` — `.so-foot`, OUTSIDE the scrolling `.so-body` (story 15.10:
     measured at 375px, a submit inside the body ended above the viewport and
     was not hit-testable) — and reaches its form through
     `form="pilot-identity-form"`. Disabled while there is nothing to save or a
     save is in flight (D-5). */
  const identityFooter =
    !isNew && current ? (
      <>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          {labels.cancel}
        </button>
        <button
          type="submit"
          form="pilot-identity-form"
          disabled={!editState.dirty || editState.busy}
          className="btn primary"
          data-testid="pilot-identity-submit"
        >
          {labels.submitEdit}
        </button>
      </>
    ) : undefined;

  return (
    <SlideOver open={open} onClose={onClose} title={title} subtitle={subtitle} closeLabel={labels.closeLabel} footer={identityFooter}>
      {isNew ? (
        <NewPersonForm labels={labels} toast={toast} toastLabels={toastLabels} canManageUsers={canManageUsers} onClose={onClose} onCreated={onMutated} />
      ) : current ? (
        <>
          <EditPersonForm pilot={current} locale={locale} labels={labels} toast={toast} toastLabels={toastLabels} onStateChange={setEditState} onSaved={applyPatch} />

          {/* Siblings of the form, never children (AD-6): a nested `<form>` is
              invalid HTML, and Invio in the invite's email must send the
              invite, not the Salva. Both are actions with effects of their own
              and leave the draft above untouched. */}
          {canManageUsers ? (
            <Section title={labels.access.sectionTitle}>
              <AccessSection
                personId={current.id}
                email={current.email}
                user={current.user}
                labels={labels.access}
                toast={toast}
                toastLabels={toastLabels}
                onMutated={(user) => applyPatch({ user })}
              />
            </Section>
          ) : null}

          <Section title={labels.archive.sectionTitle}>
            <ArchiveSection pilot={current} labels={labels.archive} toast={toast} toastLabels={toastLabels} onMutated={applyPatch} />
          </Section>
        </>
      ) : null}
    </SlideOver>
  );
}

/** Shared section wrapper — same convention as `aircraft-editor.tsx#Section`. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <div className="fld-label" style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// --- Profiles: shared by the create form and the edit form ------------------

type PersonProfilesDetail = Pick<PersonDetailDto, 'pilotProfile' | 'studentProfile' | 'instructorProfile'>;

async function fetchProfilesDetail(personId: string): Promise<PersonProfilesDetail | null> {
  const response = await fetch(`/api/v1/people/${personId}`);
  if (!response.ok) return null;
  return (await response.json()) as PersonProfilesDetail;
}

function isActiveProfile(profile: { deactivatedAt: string | null } | null): boolean {
  return profile !== null && profile.deactivatedAt === null;
}

function profileStatusLabel(profile: { deactivatedAt: string | null } | null, labels: PilotEditorLabels['profiles']): string {
  if (!profile) return labels.status.notActivated;
  return profile.deactivatedAt ? labels.status.inactive : labels.status.active;
}

function profileStatusTone(profile: { deactivatedAt: string | null } | null): BadgeTone {
  if (!profile) return '';
  return profile.deactivatedAt ? 'warn' : 'ok';
}

/**
 * Story 19.4 (AD-9; R-19-e extended by Q-19.3-c): the student profile
 * excludes the pilot AND the instructor one, and the form shows it instead of
 * waiting for the server's 422 — an UNCHECKED profile control is disabled
 * while a profile it excludes is checked (a checked one can always be
 * unchecked, so even a person saved in a forbidden state is never stuck).
 * Pilot + instructor stays allowed. Same rule in the create and edit forms.
 */
function isProfileBlocked(type: keyof ProfileFlags, flags: ProfileFlags): boolean {
  if (flags[type]) return false;
  return type === 'student' ? flags.pilot || flags.instructor : flags.student;
}

function anyProfileBlocked(flags: ProfileFlags): boolean {
  return (['pilot', 'student', 'instructor'] as const).some((type) => isProfileBlocked(type, flags));
}

// --- Edit — form unico (story 19.4, AD-6) ------------------------------------

const PILOT_EXPIRY_KINDS: readonly ExpiryKind[] = ['RATING', 'MEDICAL'];

type IdentityValues = Pick<UpdatePersonInput, (typeof IDENTITY_FIELDS)[number]>;

function identityOf(person: { firstName: string; lastName: string; email: string | null; phone: string | null; address: string | null }): IdentityValues {
  return { firstName: person.firstName, lastName: person.lastName, email: person.email, phone: person.phone, address: person.address };
}

/** The profiles as the Salva would leave them; the fields keep the saved data of a deactivated profile (reactivating reuses it, like the upsert). */
type ProfileDraft = {
  pilot: { active: boolean; licenseNumber: string; licenseType: string };
  student: { active: boolean; courseStartDate: string };
  instructor: { active: boolean };
};

function profileDraftOf(detail: PersonProfilesDetail): ProfileDraft {
  return {
    pilot: {
      active: isActiveProfile(detail.pilotProfile),
      licenseNumber: detail.pilotProfile?.licenseNumber ?? '',
      licenseType: detail.pilotProfile?.licenseType ?? '',
    },
    student: { active: isActiveProfile(detail.studentProfile), courseStartDate: detail.studentProfile?.courseStartDate ?? '' },
    instructor: { active: isActiveProfile(detail.instructorProfile) },
  };
}

function profileFlagsOf(draft: ProfileDraft): ProfileFlags {
  return { pilot: draft.pilot.active, student: draft.student.active, instructor: draft.instructor.active };
}

/** The `profiles` block of the composite (D-2, D-3): only the profiles whose final state differs from the saved one. */
function profileChangesOf(detail: PersonProfilesDetail, draft: ProfileDraft): NonNullable<UpdatePersonCompositeInput['profiles']> {
  const changes: NonNullable<UpdatePersonCompositeInput['profiles']> = {};
  const pilot = { licenseNumber: draft.pilot.licenseNumber.trim(), licenseType: draft.pilot.licenseType.trim() };
  if (draft.pilot.active) {
    if (!isActiveProfile(detail.pilotProfile) || pilot.licenseNumber !== detail.pilotProfile?.licenseNumber || pilot.licenseType !== detail.pilotProfile.licenseType) {
      changes.pilot = { active: true, ...pilot };
    }
  } else if (isActiveProfile(detail.pilotProfile)) {
    changes.pilot = { active: false };
  }
  if (draft.student.active) {
    if (!isActiveProfile(detail.studentProfile) || draft.student.courseStartDate !== detail.studentProfile?.courseStartDate) {
      changes.student = { active: true, courseStartDate: draft.student.courseStartDate };
    }
  } else if (isActiveProfile(detail.studentProfile)) {
    changes.student = { active: false };
  }
  if (draft.instructor.active !== isActiveProfile(detail.instructorProfile)) {
    changes.instructor = { active: draft.instructor.active };
  }
  return changes;
}

/** Focuses where a failed Salva points: the first invalid control of that section, else its error message (story 19.4, AD-5). */
function focusSection(section: HTMLElement | null): void {
  if (!section) return;
  (section.querySelector<HTMLElement>('[aria-invalid="true"]') ?? section.querySelector<HTMLElement>('[role="alert"]'))?.focus();
}

/** A section's error after a failed Salva — `role="alert"` (announced) and focusable, so the focus can land on it when no field is to blame. */
function SectionError({ message, testId }: { message: string; testId: string }) {
  return (
    <p role="alert" tabIndex={-1} data-testid={testId} className="fld-label" style={{ color: 'var(--bad)', marginTop: 14, textTransform: 'none' }}>
      {message}
    </p>
  );
}

/**
 * The EDIT flow (story 19.4, AD-6): anagrafica (react-hook-form +
 * `updatePersonSchema`, as before), profiles and expiries (plain draft state)
 * in ONE form whose submit is the panel footer's "Salva". The Salva sends
 * only what differs from what was loaded (D-3) — so a part nobody touched
 * never overwrites a change made meanwhile by someone else — validated here
 * first (mirror of the server's rules: licence fields of an active pilot,
 * course start of an active student, a date on every expiry row), then ONE
 * `PATCH`. A failure leaves the whole draft as it was and shows the error in
 * the section that caused it (P7, AD-5); a success realigns every part on the
 * saved state, so there is nothing left to save (D-4, D-5).
 */
function EditPersonForm({
  pilot,
  locale,
  labels,
  toast,
  toastLabels,
  onStateChange,
  onSaved,
}: {
  pilot: PilotRow;
  locale: 'it' | 'en';
  labels: PilotEditorLabels;
  toast: ToastHandle;
  toastLabels: ToastLabels;
  /** `useState`'s setter — stable by contract, so the effect below cannot loop. */
  onStateChange: (state: { dirty: boolean; busy: boolean }) => void;
  onSaved: (patch: Partial<PilotRow>) => void;
}): React.JSX.Element {
  const formRef = useRef<HTMLFormElement | null>(null);
  const identityRef = useRef<HTMLDivElement | null>(null);
  const profilesRef = useRef<HTMLDivElement | null>(null);
  const expiriesRef = useRef<HTMLDivElement | null>(null);
  const formErrorRef = useRef<HTMLDivElement | null>(null);
  const exclusiveHintId = useId();

  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting, defaultValues },
  } = useForm<UpdatePersonInput>({ resolver: zodResolver(updatePersonSchema), defaultValues: identityOf(pilot) });
  const identityValues = useWatch({ control });

  const [profilesDetail, setProfilesDetail] = useState<PersonProfilesDetail | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [profilesLoadError, setProfilesLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchProfilesDetail(pilot.id).then((result) => {
      if (cancelled) return;
      if (!result) {
        setProfilesLoadError(true);
        return;
      }
      setProfilesDetail(result);
      setProfileDraft(profileDraftOf(result));
    });
    return () => {
      cancelled = true;
    };
  }, [pilot.id]);

  const expiries = usePersonExpiryDraft(pilot.id, PILOT_EXPIRY_KINDS);

  /** Same "did the user try to save" flag as `NewPersonForm` (story 14.2): the plain-state errors below derive from it. */
  const [submitAttempted, setSubmitAttempted] = useState(false);
  /** `expiryTypeId` — the expiry row the error is shown on instead of the section (review 19.4 F2). */
  const [saveError, setSaveError] = useState<{ section: PersonSaveSection; message: string; expiryTypeId: string | null } | null>(null);

  const changedIdentity = changedIdentityFields(identityValues, defaultValues);
  const profileChanges = profilesDetail && profileDraft ? profileChangesOf(profilesDetail, profileDraft) : {};
  const hasProfileChanges = Object.keys(profileChanges).length > 0;
  const hasExpiryChanges = expiries.changes.set.length > 0 || expiries.changes.remove.length > 0;
  const dirty = changedIdentity.length > 0 || hasProfileChanges || hasExpiryChanges;

  // The submit that runs this form lives in the panel's `.so-foot`, outside
  // this component: it needs to know whether there is anything to save and
  // whether a request is in flight.
  useEffect(() => {
    onStateChange({ dirty, busy: isSubmitting });
  }, [dirty, isSubmitting, onStateChange]);

  // A failed Salva moves the focus into the section it names — once the error
  // is committed (a deferred call measured on Chromium ran before it, and the
  // focus stayed on `<body>`, where the disabled-while-busy Salva had left it).
  useEffect(() => {
    if (!saveError) return;
    const section = saveError.section;
    focusSection((section === 'identity' ? identityRef : section === 'profiles' ? profilesRef : section === 'expiries' ? expiriesRef : formErrorRef).current);
  }, [saveError]);

  const flags = profileDraft ? profileFlagsOf(profileDraft) : pilot.profiles;
  const pilotFieldInvalid = !!profileDraft?.pilot.active && (!profileDraft.pilot.licenseNumber.trim() || !profileDraft.pilot.licenseType.trim());
  const studentFieldInvalid = !!profileDraft?.student.active && !profileDraft.student.courseStartDate;

  function setProfileActive(type: keyof ProfileFlags, active: boolean): void {
    if (!profileDraft) return;
    const next = { ...profileDraft, [type]: { ...profileDraft[type], active } };
    setProfileDraft(next);
    expiries.pruneForProfiles(profileFlagsOf(next));
  }

  /** RHF's INVALID branch (an anagrafica field failed `updatePersonSchema`): flips the plain-state errors on too, so every problem shows at once — and drops the previous attempt's server error. */
  function onInvalid(): void {
    setSubmitAttempted(true);
    setSaveError(null);
  }

  async function onSubmit(values: UpdatePersonInput): Promise<void> {
    setSubmitAttempted(true);
    setSaveError(null);
    if (pilotFieldInvalid || studentFieldInvalid || expiries.missingDateIds.size > 0) {
      setTimeout(() => focusFirstInvalid(formRef.current), 0);
      return;
    }

    const body: UpdatePersonCompositeInput = {};
    for (const field of changedIdentity) {
      (body as Record<string, unknown>)[field] = values[field] ?? null;
    }
    if (hasProfileChanges) body.profiles = profileChanges;
    if (hasExpiryChanges) {
      const { set, remove } = expiries.changes;
      body.expiries = { ...(set.length > 0 && { set }), ...(remove.length > 0 && { remove }) };
    }

    const response = await fetch(`/api/v1/people/${pilot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const parsed = await parseApiError(response);
      const error = personSaveError(parsed);
      if (error.reason === 'invalidField') {
        // Story 14.2, AC 3: a field-shaped 422 marks THAT field — the generic
        // `labels.errors.required` string, now targeted.
        for (const field of IDENTITY_FIELDS) {
          if (parsed.fieldErrors.has(field)) setError(field, { type: 'server', message: labels.errors.required });
        }
        setTimeout(() => focusFirstInvalid(identityRef.current), 0);
        return;
      }
      // Only these three sections exist here: anything else is the form-wide banner.
      const shown: PersonSaveSection = error.section === 'identity' || error.section === 'profiles' || error.section === 'expiries' ? error.section : 'form';
      setSaveError({
        section: shown,
        // The student rate is the instructor editor's: never sent from here.
        message: labels.saveErrors[error.reason === 'rateValidFromPast' ? 'generic' : error.reason],
        expiryTypeId: error.expiryTypeId !== null && error.expiryTypeId in expiries.rows ? error.expiryTypeId : null,
      });
      return;
    }

    const updated = (await response.json()) as PersonDetailDto;
    toast.show(toastLabels.updated, 'ok');
    // Realign every part on what the server saved (D-4): nothing left to save.
    reset(identityOf(updated));
    setProfilesDetail(updated);
    setProfileDraft(profileDraftOf(updated));
    setSubmitAttempted(false);
    onSaved({
      ...identityOf(updated),
      archivedAt: updated.archivedAt,
      profiles: updated.profiles,
    });
    await expiries.reload();
  }

  const profileLabels = labels.profiles;
  const blockedHint = anyProfileBlocked(flags) ? exclusiveHintId : undefined;
  const rowError = saveError?.expiryTypeId ? { typeId: saveError.expiryTypeId, message: saveError.message } : null;

  return (
    <form id="pilot-identity-form" ref={formRef} onSubmit={(event) => void handleSubmit(onSubmit, onInvalid)(event)} noValidate data-testid="pilot-identity-form">
      <div ref={identityRef}>
        <div className="form-grid">
          <Field label={labels.identity.firstName} error={errors.firstName ? labels.errors.required : undefined}>
            <Input aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
          </Field>
          <Field label={labels.identity.lastName} error={errors.lastName ? labels.errors.required : undefined}>
            <Input aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
          </Field>
          <Field label={labels.identity.email} error={errors.email ? labels.errors.required : undefined}>
            <Input type="email" aria-invalid={Boolean(errors.email)} {...register('email', { setValueAs: blankToNull })} />
          </Field>
          <Field label={labels.identity.phone} error={errors.phone ? labels.errors.required : undefined}>
            <Input type="tel" aria-invalid={Boolean(errors.phone)} {...register('phone', { setValueAs: blankToNull })} />
          </Field>
          <Field label={labels.identity.address} wide error={errors.address ? labels.errors.required : undefined}>
            <Input aria-invalid={Boolean(errors.address)} {...register('address', { setValueAs: blankToNull })} />
          </Field>
        </div>
        {saveError?.section === 'identity' ? <SectionError message={saveError.message} testId="pilot-identity-error" /> : null}
      </div>

      <Section title={profileLabels.sectionTitle}>
        <div ref={profilesRef}>
          {profilesLoadError ? (
            <p className="fld-label" style={{ color: 'var(--bad)' }}>
              {profileLabels.errors.generic}
            </p>
          ) : !profilesDetail || !profileDraft ? (
            <p className="fld-label">…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ProfileBox
                title={profileLabels.pilot.title}
                saved={profilesDetail.pilotProfile}
                labels={profileLabels}
                testId="pilot-editor-profile-pilot"
                checked={profileDraft.pilot.active}
                disabled={isProfileBlocked('pilot', flags)}
                describedBy={blockedHint}
                onToggle={(active) => setProfileActive('pilot', active)}
              >
                {profileDraft.pilot.active ? (
                  <div className="form-grid">
                    <Field label={profileLabels.pilot.licenseNumber} error={submitAttempted && pilotFieldInvalid ? profileLabels.errors.requiredField : undefined}>
                      <Input
                        value={profileDraft.pilot.licenseNumber}
                        onChange={(event) => setProfileDraft({ ...profileDraft, pilot: { ...profileDraft.pilot, licenseNumber: event.target.value } })}
                        aria-invalid={submitAttempted && pilotFieldInvalid}
                        data-testid="pilot-editor-profile-pilot-license-number"
                      />
                    </Field>
                    <Field label={profileLabels.pilot.licenseType} error={submitAttempted && pilotFieldInvalid ? profileLabels.errors.requiredField : undefined}>
                      <Input
                        value={profileDraft.pilot.licenseType}
                        onChange={(event) => setProfileDraft({ ...profileDraft, pilot: { ...profileDraft.pilot, licenseType: event.target.value } })}
                        aria-invalid={submitAttempted && pilotFieldInvalid}
                        data-testid="pilot-editor-profile-pilot-license-type"
                      />
                    </Field>
                  </div>
                ) : profilesDetail.pilotProfile ? (
                  <span className="fld-label" style={{ textTransform: 'none' }}>
                    {`${profileLabels.pilot.licenseNumber}: ${profilesDetail.pilotProfile.licenseNumber} · ${profileLabels.pilot.licenseType}: ${profilesDetail.pilotProfile.licenseType}`}
                  </span>
                ) : null}
              </ProfileBox>

              <ProfileBox
                title={profileLabels.student.title}
                saved={profilesDetail.studentProfile}
                labels={profileLabels}
                testId="pilot-editor-profile-student"
                checked={profileDraft.student.active}
                disabled={isProfileBlocked('student', flags)}
                describedBy={blockedHint}
                onToggle={(active) => setProfileActive('student', active)}
              >
                {profileDraft.student.active ? (
                  <div className="form-grid">
                    <Field label={profileLabels.student.courseStartDate} error={submitAttempted && studentFieldInvalid ? profileLabels.errors.requiredField : undefined}>
                      <DateInput
                        value={profileDraft.student.courseStartDate}
                        onChange={(event) => setProfileDraft({ ...profileDraft, student: { ...profileDraft.student, courseStartDate: event.target.value } })}
                        aria-invalid={submitAttempted && studentFieldInvalid}
                        data-testid="pilot-editor-profile-student-course-start"
                      />
                    </Field>
                  </div>
                ) : profilesDetail.studentProfile ? (
                  <span className="fld-label" style={{ textTransform: 'none' }}>
                    {`${profileLabels.student.courseStartDate}: ${formatDateOnly(profilesDetail.studentProfile.courseStartDate, locale)}`}
                  </span>
                ) : null}
              </ProfileBox>

              <ProfileBox
                title={profileLabels.instructor.title}
                saved={profilesDetail.instructorProfile}
                labels={profileLabels}
                testId="pilot-editor-profile-instructor"
                checked={profileDraft.instructor.active}
                disabled={isProfileBlocked('instructor', flags)}
                describedBy={blockedHint}
                onToggle={(active) => setProfileActive('instructor', active)}
              />

              {blockedHint ? (
                <p id={exclusiveHintId} className="fld-hint">
                  {profileLabels.errors.exclusive}
                </p>
              ) : null}
            </div>
          )}
          {saveError?.section === 'profiles' ? <SectionError message={saveError.message} testId="pilot-profiles-error" /> : null}
        </div>
      </Section>

      <Section title={labels.ratings.sectionTitle}>
        <div ref={expiriesRef}>
          <div data-testid="pilot-ratings-editor">
            <ExpiryDraftEditor draft={expiries} kind="RATING" profiles={flags} labels={labels.ratings} showMissingDates={submitAttempted} rowError={rowError} />
          </div>
          <div className="fld-label" style={{ fontWeight: 600, fontSize: 13, marginTop: 20, marginBottom: 10 }}>
            {labels.medical.subHeading}
          </div>
          <div data-testid="pilot-medical-editor">
            <ExpiryDraftEditor draft={expiries} kind="MEDICAL" profiles={flags} labels={labels.medical} showMissingDates={submitAttempted} rowError={rowError} />
          </div>
          {saveError?.section === 'expiries' && !rowError ? <SectionError message={saveError.message} testId="pilot-ratings-error" /> : null}
        </div>
      </Section>

      <div ref={formErrorRef}>{saveError?.section === 'form' ? <SectionError message={saveError.message} testId="pilot-save-error" /> : null}</div>
    </form>
  );
}

/** One profile of the edit form (AD-9): its activation control in the draft, the badge of its SAVED state, and its fields. */
function ProfileBox({
  title,
  saved,
  labels,
  testId,
  checked,
  disabled,
  describedBy,
  onToggle,
  children,
}: {
  title: string;
  saved: { deactivatedAt: string | null } | null;
  labels: PilotEditorLabels['profiles'];
  testId: string;
  checked: boolean;
  disabled: boolean;
  describedBy: string | undefined;
  onToggle: (active: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }} data-testid={testId}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <ProfileCheckbox label={title} checked={checked} disabled={disabled} describedBy={describedBy} onToggle={onToggle} testId={`${testId}-active`} />
        <Badge tone={profileStatusTone(saved)} dot>
          {profileStatusLabel(saved, labels)}
        </Badge>
      </div>
      {children ? <div style={{ marginTop: 10 }}>{children}</div> : null}
    </div>
  );
}

/** A profile's activation checkbox — the same control in the create and the edit form; a control disabled by the exclusivity rule says so (dimmed, `not-allowed`, and the hint it is described by). */
function ProfileCheckbox({
  label,
  checked,
  disabled,
  describedBy,
  onToggle,
  testId,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  describedBy: string | undefined;
  onToggle: (active: boolean) => void;
  testId: string;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13.5, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} aria-describedby={disabled ? describedBy : undefined} onChange={(event) => onToggle(event.target.checked)} data-testid={testId} />
      {label}
    </label>
  );
}

// --- New person — form unico (story 13.2, AC 1) ------------------------------

const ALL_ROLES: readonly Role[] = ['ADMIN', 'INSTRUCTOR', 'PILOT', 'STUDENT'];

type NewPersonFormProps = {
  labels: PilotEditorLabels;
  toast: ToastHandle;
  toastLabels: ToastLabels;
  canManageUsers: boolean;
  onClose: () => void;
  onCreated: () => void;
};

/**
 * Chip strip + inline date fields for the CREATE form (story 13.2, AC 1) — no
 * API call per selection: the whole batch travels in the ONE composite
 * `POST /api/v1/people` at submit. Story 14.2
 * (AC 2): `missingDateIds` marks each row that is STILL missing its date
 * individually — a form with 2+ selected chips only red-borders the ones
 * actually empty, not every chip just because one of them is.
 */
function NewExpiryChipGroup({
  types,
  selections,
  onToggle,
  onDateChange,
  dateLabel,
  requiredDateLabel,
  missingDateIds,
  testPrefix,
}: {
  types: ExpiryCatalogEntry[];
  selections: Record<string, string>;
  onToggle: (typeId: string) => void;
  onDateChange: (typeId: string, date: string) => void;
  dateLabel: string;
  requiredDateLabel: string;
  missingDateIds: Set<string>;
  testPrefix: string;
}) {
  if (types.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {types.map((type) => (
          <button
            key={type.id}
            type="button"
            className={`expiry-chip${type.id in selections ? ' selected' : ''}`}
            onClick={() => onToggle(type.id)}
            data-testid={`${testPrefix}-chip-${type.id}`}
          >
            {type.name}
          </button>
        ))}
      </div>
      {types
        .filter((type) => type.id in selections)
        .map((type) => (
          <Field key={type.id} label={`${type.name} — ${dateLabel}`} error={missingDateIds.has(type.id) ? requiredDateLabel : undefined}>
            <DateInput
              inline
              value={selections[type.id]}
              onChange={(event) => onDateChange(type.id, event.target.value)}
              aria-invalid={missingDateIds.has(type.id)}
              data-testid={`${testPrefix}-date-${type.id}`}
            />
          </Field>
        ))}
    </div>
  );
}

/**
 * ONE form, ONE submit (AC 1): anagrafica + profile activation (with the
 * SAME per-type fields and the same exclusivity rule as `EditPersonForm`) + Ratings/
 * Visita medica chips + accesso, all bundled into the SAME
 * `POST /api/v1/people` composite payload the 13.1 API already accepts.
 * Only the base identity fields go through `react-hook-form`+zod (matches
 * the edit form's own validation); the conditional composite blocks are
 * plain controlled state, validated imperatively at submit (client mirror of
 * the server's 422 rules — R-13.1-c's "expiresAt required per selection",
 * `pilotProfileRequestSchema`'s required license fields) — simpler than
 * fighting react-hook-form over deeply-nested, conditionally-rendered
 * optional objects for a one-shot form.
 */
function NewPersonForm({ labels, toast, toastLabels, canManageUsers, onClose, onCreated }: NewPersonFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createPersonBaseSchema>, unknown, z.infer<typeof createPersonBaseSchema>>({
    resolver: zodResolver(createPersonBaseSchema),
    defaultValues: { firstName: '', lastName: '', email: null, phone: null, address: null },
  });

  // Story 14.2 (AC 2): a single "did the user try to submit" flag instead of
  // one imperative boolean per non-RHF field — every `*FieldError` below is
  // DERIVED from it plus the field's own current value, so a correction
  // clears its error the instant it becomes valid (no separate onChange
  // wiring needed to "un-set" anything), and `handleSubmit`'s own resolver
  // path (the RHF-tracked base fields) is untouched.
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [activatePilot, setActivatePilot] = useState(false);
  const [pilotLicenseNumber, setPilotLicenseNumber] = useState('');
  const [pilotLicenseType, setPilotLicenseType] = useState('');
  const pilotFieldError = submitAttempted && activatePilot && (!pilotLicenseNumber.trim() || !pilotLicenseType.trim());

  const [activateStudent, setActivateStudent] = useState(false);
  const [studentCourseStartDate, setStudentCourseStartDate] = useState('');
  const studentFieldError = submitAttempted && activateStudent && !studentCourseStartDate;

  const [activateInstructor, setActivateInstructor] = useState(false);

  const [ratingCatalog, setRatingCatalog] = useState<ExpiryCatalogEntry[] | null>(null);
  const [medicalCatalog, setMedicalCatalog] = useState<ExpiryCatalogEntry[] | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void fetchExpiryTypes('RATING').then((types) => {
      if (!cancelled) setRatingCatalog(types);
    });
    void fetchExpiryTypes('MEDICAL').then((types) => {
      if (!cancelled) setMedicalCatalog(types);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const profileFlags: ProfileFlags = { pilot: activatePilot, student: activateStudent, instructor: activateInstructor };
  const exclusiveHintId = useId();
  const blockedHint = anyProfileBlocked(profileFlags) ? exclusiveHintId : undefined;

  /**
   * Review F1 (story 13.2): deselecting a profile can make a previously
   * selected chip scope-incompatible (`isExpiryScopeCompatible`) — it
   * disappears from view, but its entry lingered in `selections` and the
   * submit handler sent it anyway, so the server rejected the whole
   * composite with a 422 `SCOPE_MISMATCH` the user had no visible chip left
   * to fix. Called from the three profile checkboxes' `onChange` (the ONLY
   * places `profileFlags` changes) with the flags AS THEY WILL BE after this
   * toggle, so a selection is pruned the instant its chip would leave view.
   */
  function pruneSelectionsForFlags(nextFlags: ProfileFlags): void {
    const visibleIds = new Set(
      [...(ratingCatalog ?? []), ...(medicalCatalog ?? [])]
        .filter((type) => type.isActive && isExpiryScopeCompatible(type.scope, nextFlags))
        .map((type) => type.id),
    );
    setSelections((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([typeId]) => visibleIds.has(typeId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }

  function toggleSelection(typeId: string): void {
    setSelections((current) => {
      if (typeId in current) {
        const next = { ...current };
        delete next[typeId];
        return next;
      }
      return { ...current, [typeId]: '' };
    });
  }

  function setSelectionDate(typeId: string, date: string): void {
    setSelections((current) => ({ ...current, [typeId]: date }));
  }

  const [grantAccess, setGrantAccess] = useState(false);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessRoles, setAccessRoles] = useState<Role[]>([]);

  function isValidAccessEmail(value: string): boolean {
    return z.string().trim().toLowerCase().pipe(z.email()).safeParse(value).success;
  }

  const accessEmailError = submitAttempted && grantAccess && !isValidAccessEmail(accessEmail);
  const accessRolesError = submitAttempted && grantAccess && accessRoles.length === 0;
  const missingDateIds = submitAttempted
    ? new Set(Object.entries(selections).filter(([, expiresAt]) => !expiresAt).map(([typeId]) => typeId))
    : new Set<string>();

  function toggleAccessRole(role: Role, checked: boolean): void {
    setAccessRoles((current) => (checked ? [...current, role] : current.filter((r) => r !== role)));
  }

  /**
   * Review F2: `onSubmit` below is RHF's VALID callback — unreachable while
   * `firstName`/`lastName`/`email` fail their own zodResolver check, so a
   * submit with BOTH an empty base field AND an empty plain-state field
   * (e.g. pilot license) never got past `handleSubmit`'s RHF-error branch,
   * leaving `submitAttempted` `false` and every plain-state field mute.
   * `handleSubmit(onSubmit, onInvalid)` below runs this in that branch too —
   * flipping the SAME flag every `*FieldError` derives from is enough (no
   * separate per-field marking needed here, unlike `flight-editor.tsx`'s
   * imperative booleans). RHF's own `shouldFocusError` already focuses its
   * first invalid base field in this branch, so no explicit
   * `focusFirstInvalid` call is needed here.
   */
  function onInvalid(): void {
    setSubmitAttempted(true);
  }

  async function onSubmit(base: z.infer<typeof createPersonBaseSchema>): Promise<void> {
    setFormError(null);
    setSubmitAttempted(true);

    const nextPilotFieldError = activatePilot && (!pilotLicenseNumber.trim() || !pilotLicenseType.trim());
    const nextStudentFieldError = activateStudent && !studentCourseStartDate;
    const expiries = Object.entries(selections).map(([expiryTypeId, expiresAt]) => ({ expiryTypeId, expiresAt }));
    const missingDate = expiries.some((entry) => !entry.expiresAt);
    const emailValid = !grantAccess || isValidAccessEmail(accessEmail);
    const rolesValid = !grantAccess || accessRoles.length > 0;

    if (nextPilotFieldError || nextStudentFieldError || missingDate || !emailValid || !rolesValid) {
      setTimeout(() => focusFirstInvalid(formRef.current), 0);
      return;
    }

    const payload: CreatePersonInput = {
      firstName: base.firstName,
      lastName: base.lastName,
      email: base.email ?? null,
      phone: base.phone ?? null,
      address: base.address ?? null,
      ...(activatePilot || activateStudent || activateInstructor
        ? {
            profiles: {
              ...(activatePilot ? { pilot: { licenseNumber: pilotLicenseNumber.trim(), licenseType: pilotLicenseType.trim() } } : {}),
              ...(activateStudent ? { student: { courseStartDate: studentCourseStartDate } } : {}),
              ...(activateInstructor ? { instructor: {} } : {}),
            },
          }
        : {}),
      ...(expiries.length > 0 ? { expiries } : {}),
      ...(grantAccess ? { access: { email: accessEmail.trim().toLowerCase(), roles: accessRoles } } : {}),
    };

    const response = await fetch('/api/v1/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // The body is read ONCE (story 19.3: a 422 can now carry a domain code,
      // `STUDENT_PROFILE_EXCLUSIVE`, that a second read would lose).
      const { code, fieldErrors } = await parseApiError(response);
      if (response.status === 422) {
        // Story 14.2, AC 3: same field-shaped-422 mapping as `EditPersonForm`
        // above, reusing `labels.errors.required` per field.
        const known: Array<'firstName' | 'lastName' | 'email'> = ['firstName', 'lastName', 'email'];
        let mapped = false;
        for (const field of known) {
          if (fieldErrors.has(field)) {
            setError(field, { type: 'server', message: labels.errors.required });
            mapped = true;
          }
        }
        if (mapped) {
          setTimeout(() => focusFirstInvalid(formRef.current), 0);
          return;
        }
      }
      setFormError(
        code === 'CONFLICT' ? labels.errors.conflictEmail : code === 'STUDENT_PROFILE_EXCLUSIVE' ? labels.errors.profilesExclusive : labels.errors.generic,
      );
      return;
    }

    toast.show(toastLabels.created, 'ok');
    onClose();
    onCreated();
  }

  const ratingChips = (ratingCatalog ?? []).filter((type) => type.isActive && isExpiryScopeCompatible(type.scope, profileFlags));
  const medicalChips = (medicalCatalog ?? []).filter((type) => type.isActive && isExpiryScopeCompatible(type.scope, profileFlags));

  return (
    <form ref={formRef} onSubmit={(event) => void handleSubmit(onSubmit, onInvalid)(event)} noValidate data-testid="pilot-identity-form">
      <div className="form-grid">
        <Field label={labels.identity.firstName} error={errors.firstName ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
        </Field>
        <Field label={labels.identity.lastName} error={errors.lastName ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
        </Field>
        <Field label={labels.identity.email} error={errors.email ? labels.errors.required : undefined}>
          <Input type="email" aria-invalid={Boolean(errors.email)} {...register('email', { setValueAs: blankToNull })} />
        </Field>
        <Field label={labels.identity.phone} error={errors.phone ? labels.errors.required : undefined}>
          <Input type="tel" aria-invalid={Boolean(errors.phone)} {...register('phone', { setValueAs: blankToNull })} />
        </Field>
        <Field label={labels.identity.address} wide error={errors.address ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.address)} {...register('address', { setValueAs: blankToNull })} />
        </Field>
      </div>

      <Section title={labels.profiles.sectionTitle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <ProfileCheckbox
              label={labels.profiles.pilot.title}
              checked={activatePilot}
              disabled={isProfileBlocked('pilot', profileFlags)}
              describedBy={blockedHint}
              onToggle={(checked) => {
                setActivatePilot(checked);
                pruneSelectionsForFlags({ ...profileFlags, pilot: checked });
              }}
              testId="new-person-activate-pilot"
            />
            {activatePilot ? (
              <div className="form-grid" style={{ marginTop: 8 }}>
                <Field label={labels.profiles.pilot.licenseNumber} error={pilotFieldError ? labels.profiles.errors.requiredField : undefined}>
                  <Input
                    value={pilotLicenseNumber}
                    onChange={(event) => setPilotLicenseNumber(event.target.value)}
                    aria-invalid={pilotFieldError}
                    data-testid="new-person-pilot-license-number"
                  />
                </Field>
                <Field label={labels.profiles.pilot.licenseType} error={pilotFieldError ? labels.profiles.errors.requiredField : undefined}>
                  <Input
                    value={pilotLicenseType}
                    onChange={(event) => setPilotLicenseType(event.target.value)}
                    aria-invalid={pilotFieldError}
                    data-testid="new-person-pilot-license-type"
                  />
                </Field>
              </div>
            ) : null}
          </div>

          <div>
            <ProfileCheckbox
              label={labels.profiles.student.title}
              checked={activateStudent}
              disabled={isProfileBlocked('student', profileFlags)}
              describedBy={blockedHint}
              onToggle={(checked) => {
                setActivateStudent(checked);
                pruneSelectionsForFlags({ ...profileFlags, student: checked });
              }}
              testId="new-person-activate-student"
            />
            {activateStudent ? (
              <div className="form-grid" style={{ marginTop: 8 }}>
                <Field label={labels.profiles.student.courseStartDate} error={studentFieldError ? labels.profiles.errors.requiredField : undefined}>
                  <DateInput
                    value={studentCourseStartDate}
                    onChange={(event) => setStudentCourseStartDate(event.target.value)}
                    aria-invalid={studentFieldError}
                    data-testid="new-person-student-course-start"
                  />
                </Field>
              </div>
            ) : null}
          </div>

          <ProfileCheckbox
            label={labels.profiles.instructor.title}
            checked={activateInstructor}
            disabled={isProfileBlocked('instructor', profileFlags)}
            describedBy={blockedHint}
            onToggle={(checked) => {
              setActivateInstructor(checked);
              pruneSelectionsForFlags({ ...profileFlags, instructor: checked });
            }}
            testId="new-person-activate-instructor"
          />

          {blockedHint ? (
            <p id={exclusiveHintId} className="fld-hint">
              {labels.profiles.errors.exclusive}
            </p>
          ) : null}
        </div>
      </Section>

      <Section title={labels.ratings.sectionTitle}>
        <NewExpiryChipGroup
          types={ratingChips}
          selections={selections}
          onToggle={toggleSelection}
          onDateChange={setSelectionDate}
          dateLabel={labels.ratings.dateLabel}
          requiredDateLabel={labels.ratings.requiredDate}
          missingDateIds={missingDateIds}
          testPrefix="rating"
        />
        <div className="fld-label" style={{ fontWeight: 600, fontSize: 13, marginTop: 16, marginBottom: 8 }}>
          {labels.medical.subHeading}
        </div>
        <NewExpiryChipGroup
          types={medicalChips}
          selections={selections}
          onToggle={toggleSelection}
          onDateChange={setSelectionDate}
          dateLabel={labels.medical.dateLabel}
          requiredDateLabel={labels.medical.requiredDate}
          missingDateIds={missingDateIds}
          testPrefix="medical"
        />
      </Section>

      {canManageUsers ? (
        <Section title={labels.access.sectionTitle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13.5 }}>
            <input type="checkbox" checked={grantAccess} onChange={(event) => setGrantAccess(event.target.checked)} data-testid="new-person-grant-access" />
            {labels.access.grantLabel}
          </label>
          {grantAccess ? (
            <div style={{ marginTop: 10 }}>
              <div className="form-grid">
                <Field label={labels.access.email} wide error={accessEmailError ? labels.access.invalidEmail : undefined}>
                  <Input type="email" value={accessEmail} onChange={(event) => setAccessEmail(event.target.value)} aria-invalid={accessEmailError} data-testid="new-person-access-email" />
                </Field>
              </div>
              <div className="fld-label" style={{ marginTop: 10, marginBottom: 6 }}>
                {labels.access.roles}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {ALL_ROLES.map((role) => (
                  <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}>
                    <input
                      type="checkbox"
                      checked={accessRoles.includes(role)}
                      onChange={(event) => toggleAccessRole(role, event.target.checked)}
                      data-testid={`new-person-access-role-${role}`}
                    />
                    {labels.access.roleOptions[role]}
                  </label>
                ))}
              </div>
              {accessRolesError ? (
                <p role="alert" className="fld-error" style={{ marginTop: 8 }}>
                  {labels.access.rolesRequired}
                </p>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {formError ? (
        <p role="alert" data-testid="pilot-identity-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
          {formError}
        </p>
      ) : null}

      {/* The defect R-15.2-g was really about (story 15.5, §a.4): the CREATE
          flow is ONE form with ONE submit, and at 375x812 it measured `bottom
          926` in an 812px viewport — 114px under the fold and `elementFromPoint`
          returning null, i.e. not hit-testable without scrolling. `so-actions`
          pins it; above 640px the rule does not exist. */}
      <div className="so-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn" onClick={onClose}>
          {labels.cancel}
        </button>
        <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="pilot-identity-submit">
          {labels.submitCreate}
        </button>
      </div>
    </form>
  );
}


// --- Accesso (ADMIN-only) ----------------------------------------------------

const createAccessUserSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  roles: z.array(z.enum(['ADMIN', 'INSTRUCTOR', 'PILOT', 'STUDENT'])).min(1),
});

type CreateAccessUserValues = z.infer<typeof createAccessUserSchema>;

function AccessSection({
  personId,
  email,
  user,
  labels,
  toast,
  toastLabels,
  onMutated,
}: {
  personId: string;
  email: string | null;
  user: PilotUser;
  labels: PilotEditorLabels['access'];
  toast: ToastHandle;
  toastLabels: ToastLabels;
  onMutated: (user: PilotUser) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createAccessUserSchema>, unknown, CreateAccessUserValues>({
    resolver: zodResolver(createAccessUserSchema),
    defaultValues: { email: email ?? '', roles: [] },
  });

  function toggleRole(role: Role, checked: boolean): void {
    const next = checked ? [...roles, role] : roles.filter((r) => r !== role);
    setRoles(next);
    setValue('roles', next, { shouldValidate: true });
  }

  async function onCreateUser(values: CreateAccessUserValues): Promise<void> {
    setFormError(null);
    const response = await fetch('/api/v1/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: values.email, roles: values.roles, locale: 'it', personId }),
    });

    if (!response.ok) {
      const code = await errorCodeOf(response);
      setFormError(code === 'CONFLICT' ? labels.emailConflict : labels.genericError);
      return;
    }

    const created = (await response.json()) as { id: string; email: string; roles: Role[]; isActive: boolean; passwordSet: boolean };
    toast.show(toastLabels.userCreated, 'ok');
    onMutated({ id: created.id, email: created.email, roles: created.roles, isActive: created.isActive, passwordSet: created.passwordSet });
  }

  async function handleResendInvite(): Promise<void> {
    if (!user) return;
    setPending(true);
    const response = await fetch(`/api/v1/users/${user.id}/resend-invite`, { method: 'POST' });
    setPending(false);
    if (!response.ok) {
      toast.show(toastLabels.genericError, 'bad');
      return;
    }
    toast.show(toastLabels.inviteResent, 'ok');
  }

  if (user) {
    return (
      <div data-testid="pilot-access-existing">
        <p className="fld-label" style={{ textTransform: 'none' }}>
          {labels.userSummary
            .replace('{email}', user.email)
            .replace('{roles}', user.roles.map((role) => labels.roleOptions[role]).join(', '))}
        </p>
        <div style={{ marginTop: 6 }}>
          <Badge tone={user.passwordSet ? 'ok' : 'warn'} dot>
            {user.passwordSet ? labels.statusActive : labels.statusPending}
          </Badge>
        </div>
        {!user.passwordSet ? (
          <button type="button" className="btn mini" disabled={pending} onClick={() => void handleResendInvite()} style={{ marginTop: 10 }}>
            {labels.resendInvite}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="pilot-access-none">
      <p className="fld-label" style={{ textTransform: 'none', marginBottom: 10 }}>
        {labels.noUser}
      </p>
      <form onSubmit={(event) => void handleSubmit(onCreateUser)(event)} noValidate>
        <div className="form-grid">
          <Field label={labels.email} wide error={errors.email ? labels.invalidEmail : undefined}>
            <Input type="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
          </Field>
        </div>
        <div className="fld-label" style={{ marginTop: 10, marginBottom: 6 }}>
          {labels.roles}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {ALL_ROLES.map((role) => (
            <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}>
              <input type="checkbox" checked={roles.includes(role)} onChange={(event) => toggleRole(role, event.target.checked)} />
              {labels.roleOptions[role]}
            </label>
          ))}
        </div>
        {errors.roles ? (
          <p role="alert" className="fld-error" style={{ marginTop: 8 }}>
            {labels.rolesRequired}
          </p>
        ) : null}
        {formError ? (
          <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
            {formError}
          </p>
        ) : null}
        <div style={{ marginTop: 10 }}>
          <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="pilot-access-create">
            {labels.createSubmit}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Archivio -----------------------------------------------------------------

function ArchiveSection({
  pilot,
  labels,
  toast,
  toastLabels,
  onMutated,
}: {
  pilot: PilotRow;
  labels: PilotEditorLabels['archive'];
  toast: ToastHandle;
  toastLabels: ToastLabels;
  onMutated: (patch: Partial<PilotRow>) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const archived = pilot.archivedAt !== null;

  async function submit(): Promise<void> {
    setBusy(true);
    const response = await fetch(`/api/v1/people/${pilot.id}/${archived ? 'unarchive' : 'archive'}`, { method: 'POST' });
    setBusy(false);
    setConfirming(false);

    if (!response.ok) {
      toast.show(toastLabels.genericError, 'bad');
      return;
    }

    const updated = (await response.json()) as { archivedAt: string | null };
    toast.show(archived ? toastLabels.unarchived : toastLabels.archived, 'ok');
    onMutated({ archivedAt: updated.archivedAt });
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="fld-label">{archived ? labels.confirmUnarchive : labels.confirmArchive}</span>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void submit()} data-testid="pilot-archive-confirm">
          {labels.confirmYes}
        </button>
        <button type="button" className="btn" onClick={() => setConfirming(false)}>
          {labels.confirmCancel}
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="btn" onClick={() => setConfirming(true)} data-testid="pilot-archive-toggle">
      {archived ? labels.unarchive : labels.archive}
    </button>
  );
}
