'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { createPersonSchema, type CreatePersonInput } from '@/lib/schemas/people';
import type { Labels, PersonRow, RoleKey } from './people-manager';
import { Button } from '@/components/ui/button';
import { Input, inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { MailIcon } from '@/components/ui/icons';

const ALL_ROLES: readonly RoleKey[] = ['ADMIN', 'STAFF', 'INSTRUCTOR', 'PILOT', 'STUDENT'];

type PilotFields = { licenseNumber: string; licenseType: string };
type StudentFields = { courseStartDate: string };
type InstructorFields = { ratings: string };

type ProfileSnapshot<TFields> = { active: boolean; fields: TFields };

/** Known account state, either loaded from `person.access` (edit) or set once `POST /users` succeeds mid-dialog (create). */
type AccountSnapshot = { userId: string; isActive: boolean; roles: RoleKey[]; locale: 'it' | 'en'; email: string };

type PersonDetailResponse = {
  pilotProfile: { licenseNumber: string; licenseType: string; deactivatedAt: string | null } | null;
  studentProfile: { courseStartDate: string; deactivatedAt: string | null } | null;
  instructorProfile: { ratings: string; deactivatedAt: string | null } | null;
};

async function fetchPersonDetail(personId: string): Promise<PersonDetailResponse | null> {
  const response = await fetch(`/api/v1/people/${personId}`);
  if (!response.ok) return null;
  return (await response.json()) as PersonDetailResponse;
}

function personFieldsFromRow(person: PersonRow | null): {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  fiscalCode: string | null;
} {
  return person
    ? {
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        phone: person.phone,
        address: person.address,
        fiscalCode: person.fiscalCode,
      }
    : { firstName: '', lastName: '', email: null, phone: null, address: null, fiscalCode: null };
}

export type PersonFormDialogProps = {
  open: boolean;
  mode: 'create' | 'edit';
  /** Ignored when `mode === 'create'`. Required when `mode === 'edit'`. */
  person: PersonRow | null;
  /** Story TD-7 (AC 3) — gates section (c); the API (`users.manage`) remains the real guardian (AD-5). */
  canManageAccess: boolean;
  labels: Labels;
  onClose: () => void;
  /** `showCompleteProfileLink` is true only right after a fresh creation (story 12.3, AC 4 UX — preserved). */
  onSuccess: (personId: string, message: string, showCompleteProfileLink: boolean) => void;
};

/**
 * Unified "Nuovo pilota"/"Modifica pilota" dialog (story TD-7, AC 3/5) —
 * evolves `person-create-dialog.tsx` (story 12.3) into one form covering
 * anagrafica (a), profiles (b) and — `users.manage` only — app access (c).
 * Replaces the create dialog's role-select, `people-manager.tsx`'s inline
 * edit panel AND its "Profili" row action/panel.
 *
 * Submit orchestrates the existing REST endpoints sequentially (Dev Notes:
 * "niente Promise.all cieco" — every step reports its own error and halts):
 * person (POST once, then PATCH every subsequent submit in edit mode) →
 * pilot/student/instructor profiles (diffed against a server snapshot,
 * loaded once at open) → access (`POST`/`PATCH /users`, diffed against an
 * account snapshot). A step failure leaves the dialog open with a
 * partial-failure message naming the failed part — no rollback; profile
 * PUTs/deactivates are idempotent, so re-pressing submit safely retries
 * (AC 5).
 */
export function PersonFormDialog({ open, mode, person, canManageAccess, labels, onClose, onSuccess }: PersonFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    // `createPersonSchema.email`'s `.pipe(z.email())` makes input/output
    // differ once `.nullish()` participates — same triple-generic pattern as
    // the retired `PersonCreateDialog`. Reused for BOTH create and edit
    // (edit's looser `updatePersonSchema` is a superset the same values
    // trivially satisfy) so the form validates identically either way.
  } = useForm<z.input<typeof createPersonSchema>, unknown, CreatePersonInput>({
    resolver: zodResolver(createPersonSchema),
    defaultValues: personFieldsFromRow(person),
  });

  const [formError, setFormError] = useState<string | null>(null);

  // --- Section (b): profiles ------------------------------------------------
  const [pilotOn, setPilotOn] = useState(() => (mode === 'edit' && person ? person.profiles.pilot : false));
  const [studentOn, setStudentOn] = useState(() => (mode === 'edit' && person ? person.profiles.student : false));
  const [instructorOn, setInstructorOn] = useState(() => (mode === 'edit' && person ? person.profiles.instructor : false));
  const [pilotFields, setPilotFields] = useState<PilotFields>({ licenseNumber: '', licenseType: '' });
  const [studentFields, setStudentFields] = useState<StudentFields>({ courseStartDate: '' });
  const [instructorFields, setInstructorFields] = useState<InstructorFields>({ ratings: '' });
  const [pilotErrors, setPilotErrors] = useState<{ licenseNumber?: boolean; licenseType?: boolean }>({});
  const [studentErrors, setStudentErrors] = useState<{ courseStartDate?: boolean }>({});
  const [instructorErrors, setInstructorErrors] = useState<{ ratings?: boolean }>({});
  const [profileStepError, setProfileStepError] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(mode === 'edit');

  // Server-known state for the diff-at-submit (Dev Notes: "tenere lo stato
  // del form come snapshot iniziale vs corrente e derivare le chiamate dal
  // DIFF"). Refs, not state: read only inside the submit handler.
  const pilotSnapshotRef = useRef<ProfileSnapshot<PilotFields>>({ active: false, fields: { licenseNumber: '', licenseType: '' } });
  const studentSnapshotRef = useRef<ProfileSnapshot<StudentFields>>({ active: false, fields: { courseStartDate: '' } });
  const instructorSnapshotRef = useRef<ProfileSnapshot<InstructorFields>>({ active: false, fields: { ratings: '' } });
  const personIdRef = useRef<string | null>(mode === 'edit' && person ? person.id : null);

  // Edit mode: precache the three profiles' actual data (story Dev Notes —
  // "si precaricano da GET /api/v1/people/{id}", the list row only carries
  // the active/inactive flags). Runs once per mount — this component is
  // remounted per distinct target via `people-manager.tsx`'s `key`.
  useEffect(() => {
    if (mode !== 'edit' || !person) return;
    let cancelled = false;
    void fetchPersonDetail(person.id).then((detail) => {
      if (cancelled) return;
      if (!detail) {
        setProfilesLoading(false);
        return;
      }
      const pilot: ProfileSnapshot<PilotFields> = {
        active: detail.pilotProfile !== null && detail.pilotProfile.deactivatedAt === null,
        fields: { licenseNumber: detail.pilotProfile?.licenseNumber ?? '', licenseType: detail.pilotProfile?.licenseType ?? '' },
      };
      const student: ProfileSnapshot<StudentFields> = {
        active: detail.studentProfile !== null && detail.studentProfile.deactivatedAt === null,
        fields: { courseStartDate: detail.studentProfile?.courseStartDate ?? '' },
      };
      const instructor: ProfileSnapshot<InstructorFields> = {
        active: detail.instructorProfile !== null && detail.instructorProfile.deactivatedAt === null,
        fields: { ratings: detail.instructorProfile?.ratings ?? '' },
      };
      pilotSnapshotRef.current = pilot;
      studentSnapshotRef.current = student;
      instructorSnapshotRef.current = instructor;
      setPilotOn(pilot.active);
      setStudentOn(student.active);
      setInstructorOn(instructor.active);
      setPilotFields(pilot.fields);
      setStudentFields(student.fields);
      setInstructorFields(instructor.fields);
      setProfilesLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount; this component remounts per target (create/edit-target) via the caller's `key`.
  }, []);

  // --- Section (c): app access (users.manage only) --------------------------
  const initialAccess = mode === 'edit' ? (person?.access ?? null) : null;
  const [accessOn, setAccessOn] = useState(() => initialAccess?.isActive ?? false);
  const [accessRoles, setAccessRoles] = useState<RoleKey[]>(() => initialAccess?.roles ?? []);
  const [accessLocale, setAccessLocale] = useState<'it' | 'en'>(() => (initialAccess?.locale === 'en' ? 'en' : 'it'));
  const [passwordSet, setPasswordSet] = useState(() => initialAccess?.passwordSet ?? true);
  const [accessEmailError, setAccessEmailError] = useState(false);
  const [accessRolesError, setAccessRolesError] = useState(false);
  const [accessStepError, setAccessStepError] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  // `accountId` is the render-facing "does an account exist yet" flag
  // (state, so JSX reacts to it — e.g. right after `POST /users` succeeds
  // mid-submit). `accountSnapshotRef` holds the full last-known-server
  // values purely for the diff-at-submit in `onSubmit` — refs must never be
  // read during render (React rule), so it stays out of JSX entirely; the
  // StatusPill below derives its tone/label from the LIVE `accessOn`/
  // `passwordSet` state instead.
  const [accountId, setAccountId] = useState<string | null>(initialAccess?.userId ?? null);
  const accountSnapshotRef = useRef<AccountSnapshot | null>(
    initialAccess
      ? { userId: initialAccess.userId, isActive: initialAccess.isActive, roles: initialAccess.roles, locale: initialAccess.locale === 'en' ? 'en' : 'it', email: person?.email ?? '' }
      : null,
  );

  function toggleRole(role: RoleKey, checked: boolean): void {
    setAccessRoles((current) => (checked ? [...current, role] : current.filter((r) => r !== role)));
  }

  async function handleResendInvite(): Promise<void> {
    if (!accountId) return;
    setResendPending(true);
    setResendMessage(null);
    const response = await fetch(`/api/v1/users/${accountId}/resend-invite`, { method: 'POST' });
    setResendPending(false);
    if (response.ok) setResendMessage(labels.form.access.inviteResent);
  }

  /** Derived from the LIVE toggle/passwordSet state, not the server snapshot ref — the pill previews what saving now will produce (same precedence as `people-manager.tsx`'s "Accesso" column). */
  function accountStatusTone(): StatusTone {
    if (!accessOn) return 'danger';
    if (!passwordSet) return 'warning';
    return 'ok';
  }

  function accountStatusLabel(): string {
    if (!accessOn) return labels.form.access.status.deactivated;
    if (!passwordSet) return labels.form.access.status.invited;
    return labels.form.access.status.active;
  }

  function validateProfileFields(): boolean {
    let ok = true;
    const pe: typeof pilotErrors = {};
    if (pilotOn) {
      if (!pilotFields.licenseNumber.trim()) {
        pe.licenseNumber = true;
        ok = false;
      }
      if (!pilotFields.licenseType.trim()) {
        pe.licenseType = true;
        ok = false;
      }
    }
    setPilotErrors(pe);

    const se: typeof studentErrors = {};
    if (studentOn && !studentFields.courseStartDate.trim()) {
      se.courseStartDate = true;
      ok = false;
    }
    setStudentErrors(se);

    const ie: typeof instructorErrors = {};
    if (instructorOn && !instructorFields.ratings.trim()) {
      ie.ratings = true;
      ok = false;
    }
    setInstructorErrors(ie);

    return ok;
  }

  function validateAccessFields(email: string | null | undefined): boolean {
    if (!canManageAccess || !accessOn) {
      setAccessEmailError(false);
      setAccessRolesError(false);
      return true;
    }
    const emailMissing = !email || email.trim() === '';
    setAccessEmailError(emailMissing);
    const rolesMissing = accessRoles.length === 0;
    setAccessRolesError(rolesMissing);
    return !emailMissing && !rolesMissing;
  }

  async function putProfile(personId: string, type: 'pilot' | 'student' | 'instructor'): Promise<boolean> {
    const body =
      type === 'pilot'
        ? { licenseNumber: pilotFields.licenseNumber.trim(), licenseType: pilotFields.licenseType.trim() }
        : type === 'student'
          ? { courseStartDate: studentFields.courseStartDate }
          : { ratings: instructorFields.ratings.trim() };
    const response = await fetch(`/api/v1/people/${personId}/profiles/${type}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok;
  }

  async function deactivateProfile(personId: string, type: 'pilot' | 'student' | 'instructor'): Promise<boolean> {
    const response = await fetch(`/api/v1/people/${personId}/profiles/${type}/deactivate`, { method: 'POST' });
    return response.ok;
  }

  /** One profile's diff-driven step: PUT (newly active, or active with changed fields), deactivate (turned off), or no-op. */
  async function runProfileStep(
    personId: string,
    type: 'pilot' | 'student' | 'instructor',
    desiredActive: boolean,
    snapshotActive: boolean,
    fieldsChanged: boolean,
  ): Promise<boolean> {
    if (desiredActive && !snapshotActive) return putProfile(personId, type);
    if (desiredActive && snapshotActive && fieldsChanged) return putProfile(personId, type);
    if (!desiredActive && snapshotActive) return deactivateProfile(personId, type);
    return true;
  }

  function resetAfterSuccess(): void {
    // Only meaningful for `mode === 'create'` — an edit-target dialog closes
    // for good once it succeeds (`people-manager.tsx` unmounts it via its
    // own `key` on the NEXT distinct target). Re-opening "Nuovo pilota"
    // reuses this same instance (same `key='create'`), so it must start
    // genuinely fresh (same idiom as `RegisterFlightForm`'s post-submit
    // `reset(blankValues)`).
    if (mode !== 'create') return;
    reset({ firstName: '', lastName: '', email: null, phone: null, address: null, fiscalCode: null });
    setPilotOn(false);
    setStudentOn(false);
    setInstructorOn(false);
    setPilotFields({ licenseNumber: '', licenseType: '' });
    setStudentFields({ courseStartDate: '' });
    setInstructorFields({ ratings: '' });
    pilotSnapshotRef.current = { active: false, fields: { licenseNumber: '', licenseType: '' } };
    studentSnapshotRef.current = { active: false, fields: { courseStartDate: '' } };
    instructorSnapshotRef.current = { active: false, fields: { ratings: '' } };
    personIdRef.current = null;
    accountSnapshotRef.current = null;
    setAccountId(null);
    setAccessOn(false);
    setAccessRoles([]);
    setAccessLocale('it');
    setPasswordSet(true);
    setFormError(null);
    setProfileStepError(false);
    setAccessStepError(false);
  }

  async function onSubmit(values: CreatePersonInput): Promise<void> {
    setFormError(null);
    setProfileStepError(false);
    setAccessStepError(false);

    if (!validateProfileFields()) return;
    if (!validateAccessFields(values.email)) return;

    // --- Step (a): person -----------------------------------------------
    let personId = personIdRef.current;
    if (personId === null) {
      const response = await fetch('/api/v1/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const code = (body as { error?: { code?: string } } | null)?.error?.code;
        setFormError(code === 'CONFLICT' ? labels.form.conflictError : labels.form.genericError);
        return;
      }
      const created = (await response.json()) as { id: string };
      personId = created.id;
      personIdRef.current = personId;
    } else {
      const response = await fetch(`/api/v1/people/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const code = (body as { error?: { code?: string } } | null)?.error?.code;
        setFormError(code === 'CONFLICT' ? labels.form.conflictError : labels.form.genericError);
        return;
      }
    }

    // --- Step (b): profiles, diffed against the server snapshot ---------
    const pilotChanged = pilotFields.licenseNumber !== pilotSnapshotRef.current.fields.licenseNumber || pilotFields.licenseType !== pilotSnapshotRef.current.fields.licenseType;
    if (!(await runProfileStep(personId, 'pilot', pilotOn, pilotSnapshotRef.current.active, pilotChanged))) {
      setProfileStepError(true);
      return;
    }
    pilotSnapshotRef.current = { active: pilotOn, fields: pilotFields };

    const studentChanged = studentFields.courseStartDate !== studentSnapshotRef.current.fields.courseStartDate;
    if (!(await runProfileStep(personId, 'student', studentOn, studentSnapshotRef.current.active, studentChanged))) {
      setProfileStepError(true);
      return;
    }
    studentSnapshotRef.current = { active: studentOn, fields: studentFields };

    const instructorChanged = instructorFields.ratings !== instructorSnapshotRef.current.fields.ratings;
    if (!(await runProfileStep(personId, 'instructor', instructorOn, instructorSnapshotRef.current.active, instructorChanged))) {
      setProfileStepError(true);
      return;
    }
    instructorSnapshotRef.current = { active: instructorOn, fields: instructorFields };

    // --- Step (c): access (users.manage only) ----------------------------
    if (canManageAccess) {
      const email = values.email ?? '';
      const account = accountSnapshotRef.current;
      if (accessOn && !account) {
        const response = await fetch('/api/v1/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, roles: accessRoles, locale: accessLocale, personId }),
        });
        if (!response.ok) {
          setAccessStepError(true);
          return;
        }
        const createdUser = (await response.json()) as { id: string };
        accountSnapshotRef.current = { userId: createdUser.id, isActive: true, roles: accessRoles, locale: accessLocale, email };
        setAccountId(createdUser.id);
        setPasswordSet(false);
      } else if (account) {
        const rolesChanged = accessRoles.length > 0 && JSON.stringify([...accessRoles].sort()) !== JSON.stringify([...account.roles].sort());
        const patch: { email?: string; roles?: RoleKey[]; locale?: 'it' | 'en'; isActive?: boolean } = {};
        if (email !== account.email) patch.email = email;
        if (rolesChanged) patch.roles = accessRoles;
        if (accessLocale !== account.locale) patch.locale = accessLocale;
        if (accessOn !== account.isActive) patch.isActive = accessOn;
        if (Object.keys(patch).length > 0) {
          const response = await fetch(`/api/v1/users/${account.userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          if (!response.ok) {
            setAccessStepError(true);
            return;
          }
          accountSnapshotRef.current = { userId: account.userId, isActive: accessOn, roles: accessRoles, locale: accessLocale, email };
        }
      }
    }

    const message = mode === 'create' ? labels.feedback.created : labels.feedback.updated;
    const showCompleteProfileLink = mode === 'create';
    resetAfterSuccess();
    onSuccess(personId, message, showCompleteProfileLink);
  }

  const inputClasses = cn(inputBaseClasses, 'mt-2 w-full');

  return (
    <Dialog open={open} onClose={onClose} title={mode === 'create' ? labels.form.createTitle : labels.form.editTitle} className="max-w-lg">
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="mt-5 space-y-6" data-testid="person-form">
        {/* (a) Anagrafica */}
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="pf-firstName" className="block text-sm font-medium text-ink">
                {labels.form.firstName}
              </label>
              <input id="pf-firstName" className={inputClasses} aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
              {errors.firstName ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
            </div>
            <div>
              <label htmlFor="pf-lastName" className="block text-sm font-medium text-ink">
                {labels.form.lastName}
              </label>
              <input id="pf-lastName" className={inputClasses} aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
              {errors.lastName ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="pf-email" className="block text-sm font-medium text-ink">
                {labels.form.email}
              </label>
              <input id="pf-email" type="email" autoComplete="off" className={inputClasses} aria-invalid={accessEmailError} {...register('email')} />
              {accessEmailError ? <p className="mt-1 text-xs text-ember">{labels.form.access.emailRequired}</p> : null}
            </div>
            <div>
              <label htmlFor="pf-phone" className="block text-sm font-medium text-ink">
                {labels.form.phone}
              </label>
              <input id="pf-phone" type="tel" className={inputClasses} {...register('phone')} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="pf-address" className="block text-sm font-medium text-ink">
                {labels.form.address}
              </label>
              <input id="pf-address" className={inputClasses} {...register('address')} />
            </div>
            <div>
              <label htmlFor="pf-fiscalCode" className="block text-sm font-medium text-ink">
                {labels.form.fiscalCode}
              </label>
              <input id="pf-fiscalCode" className={inputClasses} {...register('fiscalCode')} />
            </div>
          </div>
        </div>

        {/* (b) Profili */}
        <div className="space-y-5 border-t border-hairline pt-5">
          <h3 className="text-base font-medium text-ink">{labels.profilesPanel.heading}</h3>
          {profilesLoading ? <p className="text-sm text-mid-gray">…</p> : null}

          <div className="space-y-4">
            <Switch label={labels.profilesPanel.pilot.title} checked={pilotOn} disabled={profilesLoading} onChange={(event) => setPilotOn(event.target.checked)} />
            {pilotOn ? (
              <div className="grid grid-cols-1 gap-4 pl-1 sm:grid-cols-2">
                <div>
                  <label htmlFor="pf-licenseNumber" className="block text-sm font-medium text-ink">
                    {labels.profilesPanel.pilot.licenseNumber}
                  </label>
                  <Input
                    id="pf-licenseNumber"
                    className="mt-2 w-full"
                    aria-invalid={Boolean(pilotErrors.licenseNumber)}
                    value={pilotFields.licenseNumber}
                    onChange={(event) => setPilotFields((current) => ({ ...current, licenseNumber: event.target.value }))}
                  />
                  {pilotErrors.licenseNumber ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
                </div>
                <div>
                  <label htmlFor="pf-licenseType" className="block text-sm font-medium text-ink">
                    {labels.profilesPanel.pilot.licenseType}
                  </label>
                  <Input
                    id="pf-licenseType"
                    className="mt-2 w-full"
                    aria-invalid={Boolean(pilotErrors.licenseType)}
                    value={pilotFields.licenseType}
                    onChange={(event) => setPilotFields((current) => ({ ...current, licenseType: event.target.value }))}
                  />
                  {pilotErrors.licenseType ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <Switch label={labels.profilesPanel.student.title} checked={studentOn} disabled={profilesLoading} onChange={(event) => setStudentOn(event.target.checked)} />
            {studentOn ? (
              <div className="max-w-xs pl-1">
                <DatePicker
                  id="pf-courseStartDate"
                  label={labels.profilesPanel.student.courseStartDate}
                  value={studentFields.courseStartDate}
                  onChange={(next) => setStudentFields({ courseStartDate: next })}
                  labels={labels.profilesPanel.datePicker}
                  ariaInvalid={Boolean(studentErrors.courseStartDate)}
                />
                {studentErrors.courseStartDate ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <Switch label={labels.profilesPanel.instructor.title} checked={instructorOn} disabled={profilesLoading} onChange={(event) => setInstructorOn(event.target.checked)} />
            {instructorOn ? (
              <div className="pl-1">
                <label htmlFor="pf-ratings" className="block text-sm font-medium text-ink">
                  {labels.profilesPanel.instructor.ratings}
                </label>
                <Input
                  id="pf-ratings"
                  className="mt-2 w-full"
                  aria-invalid={Boolean(instructorErrors.ratings)}
                  value={instructorFields.ratings}
                  onChange={(event) => setInstructorFields({ ratings: event.target.value })}
                />
                {instructorErrors.ratings ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
              </div>
            ) : null}
          </div>

          {profileStepError ? (
            <p role="alert" data-testid="person-profile-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
              {labels.form.profileError}
            </p>
          ) : null}
        </div>

        {/* (c) Accesso all'app — users.manage only (AC 3) */}
        {canManageAccess ? (
          <div className="space-y-4 border-t border-hairline pt-5">
            <h3 className="text-base font-medium text-ink">{labels.form.access.heading}</h3>
            <Switch label={labels.form.access.toggle} checked={accessOn} onChange={(event) => setAccessOn(event.target.checked)} />

            {accountId ? (
              <div className="flex flex-wrap items-center gap-3 pl-1" data-testid="person-access-status">
                <StatusPill tone={accountStatusTone()}>{accountStatusLabel()}</StatusPill>
                {!passwordSet ? (
                  <Button variant="outline" size="sm" type="button" disabled={resendPending} onClick={() => void handleResendInvite()}>
                    <MailIcon />
                    <span className="ml-1.5">{labels.form.access.resendInvite}</span>
                  </Button>
                ) : null}
                {resendMessage ? (
                  <span role="status" className="text-xs text-[#346538]">
                    {resendMessage}
                  </span>
                ) : null}
              </div>
            ) : null}

            {accessOn ? (
              <div className="space-y-4 pl-1">
                <fieldset>
                  <legend className="block text-sm font-medium text-ink">{labels.form.access.rolesLabel}</legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {ALL_ROLES.map((role) => (
                      <Switch key={role} label={labels.form.access.roles[role]} checked={accessRoles.includes(role)} onChange={(event) => toggleRole(role, event.target.checked)} />
                    ))}
                  </div>
                  {accessRolesError ? <p className="mt-1 text-xs text-ember">{labels.form.access.rolesRequired}</p> : null}
                </fieldset>

                <div className="max-w-xs">
                  <label htmlFor="pf-locale" className="block text-sm font-medium text-ink">
                    {labels.form.access.localeLabel}
                  </label>
                  <select
                    id="pf-locale"
                    value={accessLocale}
                    onChange={(event) => setAccessLocale(event.target.value === 'en' ? 'en' : 'it')}
                    className={inputClasses}
                  >
                    <option value="it">{labels.form.access.locales.it}</option>
                    <option value="en">{labels.form.access.locales.en}</option>
                  </select>
                </div>
              </div>
            ) : null}

            {accessStepError ? (
              <p role="alert" data-testid="person-access-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
                {labels.form.access.stepFailed}
              </p>
            ) : null}
          </div>
        ) : null}

        {formError ? (
          <p role="alert" data-testid="person-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
            {formError}
          </p>
        ) : null}

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting || profilesLoading}>
            {mode === 'create' ? labels.form.submitCreate : labels.form.submitEdit}
          </Button>
          <Button variant="outline" type="button" onClick={onClose}>
            {labels.form.cancel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
