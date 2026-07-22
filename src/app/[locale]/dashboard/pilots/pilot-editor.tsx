'use client';

/**
 * Pilot slide-over editor (story 12.6, AC 3/4) — port of
 * `docs/design-reference/airops/src/People.jsx#PilotEditor` extended to
 * sections carrying the REAL domain concepts the prototype's flat
 * name/license/medical form has no counterpart for (same rationale as
 * `fleet/aircraft-editor.tsx`'s own extension over its own prototype):
 * anagrafica, profili (pilota/allievo/istruttore), certificazioni
 * (READ-ONLY — the registration write-path stays on the Scadenze page,
 * D13), accesso (ADMIN-only), archivio. Only the identity section shares a
 * Cancel/Submit pair with the create flow; every other section is
 * self-contained, closed only via the slide-over's own `X` — same
 * convention as `AircraftEditor`.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Role } from '@/generated/prisma/client';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { formatDateOnly } from '@/lib/time';
import {
  createPersonSchema,
  instructorProfileRequestSchema,
  pilotProfileRequestSchema,
  studentProfileRequestSchema,
  updatePersonSchema,
  type CreatePersonInput,
  type InstructorProfileRequestInput,
  type PilotProfileRequestInput,
  type StudentProfileRequestInput,
  type UpdatePersonInput,
} from '@/lib/schemas/people';
import { groupExpiriesByTypeName, type ExpiryGroupSource } from './expiry-grouping';
import type { PilotRow, PilotUser } from './pilots-console';

export type PilotEditorLabels = {
  newTitle: string;
  newSubtitle: string;
  closeLabel: string;
  cancel: string;
  submitCreate: string;
  submitEdit: string;
  identity: { sectionTitle: string; firstName: string; lastName: string; email: string; phone: string; address: string; fiscalCode: string };
  profiles: {
    sectionTitle: string;
    status: { active: string; inactive: string; notActivated: string };
    actions: {
      activate: string;
      edit: string;
      reactivate: string;
      deactivate: string;
      confirmDeactivate: string;
      confirmYes: string;
      confirmCancel: string;
      cancel: string;
      save: string;
    };
    errors: { requiredField: string; generic: string };
    pilot: { title: string; licenseNumber: string; licenseType: string };
    student: { title: string; courseStartDate: string };
    instructor: { title: string };
  };
  ratings: { sectionTitle: string; empty: string; manageLink: string; status: { ok: string; expiring: string; expired: string } };
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
  };
  archive: { sectionTitle: string; archive: string; unarchive: string; confirmArchive: string; confirmUnarchive: string; confirmYes: string; confirmCancel: string };
  errors: { required: string; generic: string; conflictEmail: string };
};

type ToastLabels = {
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

  /** Merges a partial API response into the editor's own working copy (same rationale as `AircraftEditor`'s `handleMutated`) and tells the parent list to refresh. */
  function applyPatch(patch: Partial<PilotRow>): void {
    setCurrent((existing) => (existing ? { ...existing, ...patch } : existing));
    onMutated();
  }

  return (
    <SlideOver open={open} onClose={onClose} title={title} subtitle={subtitle} closeLabel={labels.closeLabel}>
      {isNew ? (
        <IdentitySection mode="new" labels={labels} toast={toast} toastLabels={toastLabels} onClose={onClose} onCreated={onMutated} />
      ) : current ? (
        <>
          <IdentitySection mode="edit" pilot={current} labels={labels} toast={toast} toastLabels={toastLabels} onClose={onClose} onSaved={applyPatch} />

          <Section title={labels.profiles.sectionTitle}>
            <ProfilesSection personId={current.id} locale={locale} labels={labels.profiles} onChanged={(profiles) => applyPatch({ profiles })} />
          </Section>

          <Section title={labels.ratings.sectionTitle}>
            <RatingsSection personId={current.id} labels={labels.ratings} locale={locale} />
          </Section>

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

// --- Identity (anagrafica) --------------------------------------------------

type IdentitySectionProps =
  | { mode: 'new'; labels: PilotEditorLabels; toast: ToastHandle; toastLabels: ToastLabels; onClose: () => void; onCreated: () => void }
  | {
      mode: 'edit';
      pilot: PilotRow;
      labels: PilotEditorLabels;
      toast: ToastHandle;
      toastLabels: ToastLabels;
      onClose: () => void;
      onSaved: (patch: Partial<PilotRow>) => void;
    };

function IdentitySection(props: IdentitySectionProps): React.JSX.Element {
  const { labels } = props;
  const [formError, setFormError] = useState<string | null>(null);
  const isNew = props.mode === 'new';

  const defaultValues = isNew
    ? { firstName: '', lastName: '', email: null, phone: null, address: null, fiscalCode: null }
    : {
        firstName: props.pilot.firstName,
        lastName: props.pilot.lastName,
        email: props.pilot.email,
        phone: props.pilot.phone,
        address: props.pilot.address,
        fiscalCode: props.pilot.fiscalCode,
      };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createPersonSchema> | UpdatePersonInput, unknown, CreatePersonInput | UpdatePersonInput>({
    resolver: zodResolver(isNew ? createPersonSchema : updatePersonSchema),
    defaultValues,
  });

  async function onSubmit(values: CreatePersonInput | UpdatePersonInput): Promise<void> {
    setFormError(null);

    const response = isNew
      ? await fetch('/api/v1/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) })
      : await fetch(`/api/v1/people/${props.pilot.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });

    if (!response.ok) {
      const code = await errorCodeOf(response);
      setFormError(code === 'CONFLICT' ? labels.errors.conflictEmail : labels.errors.generic);
      return;
    }

    const updated = (await response.json()) as {
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      address: string | null;
      fiscalCode: string | null;
      archivedAt: string | null;
      profiles: { pilot: boolean; student: boolean; instructor: boolean };
    };

    if (props.mode === 'new') {
      props.toast.show(props.toastLabels.created, 'ok');
      props.onClose();
      props.onCreated();
    } else {
      props.toast.show(props.toastLabels.updated, 'ok');
      props.onSaved({
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        phone: updated.phone,
        address: updated.address,
        fiscalCode: updated.fiscalCode,
        archivedAt: updated.archivedAt,
        profiles: updated.profiles,
      });
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="pilot-identity-form">
      <div className="form-grid">
        <Field label={labels.identity.firstName}>
          <Input aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
        </Field>
        <Field label={labels.identity.lastName}>
          <Input aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
        </Field>
        <Field label={labels.identity.email} wide>
          <Input type="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
        </Field>
        <Field label={labels.identity.phone}>
          <Input type="tel" {...register('phone')} />
        </Field>
        <Field label={labels.identity.address} wide>
          <Input {...register('address')} />
        </Field>
        <Field label={labels.identity.fiscalCode}>
          <Input {...register('fiscalCode')} />
        </Field>
      </div>

      {formError ? (
        <p role="alert" data-testid="pilot-identity-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
          {formError}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn" onClick={props.onClose}>
          {labels.cancel}
        </button>
        <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="pilot-identity-submit">
          {isNew ? labels.submitCreate : labels.submitEdit}
        </button>
      </div>
    </form>
  );
}

// --- Profili (pilota/allievo/istruttore) ------------------------------------

type PersonProfilesDetail = {
  pilotProfile: { licenseNumber: string; licenseType: string; deactivatedAt: string | null } | null;
  studentProfile: { courseStartDate: string; deactivatedAt: string | null } | null;
  instructorProfile: { deactivatedAt: string | null } | null;
};

async function fetchProfilesDetail(personId: string): Promise<PersonProfilesDetail | null> {
  const response = await fetch(`/api/v1/people/${personId}`);
  if (!response.ok) return null;
  return (await response.json()) as PersonProfilesDetail;
}

function profileStatusLabel(profile: { deactivatedAt: string | null } | null, labels: PilotEditorLabels['profiles']): string {
  if (!profile) return labels.status.notActivated;
  return profile.deactivatedAt ? labels.status.inactive : labels.status.active;
}

function profileStatusTone(profile: { deactivatedAt: string | null } | null): BadgeTone {
  if (!profile) return '';
  return profile.deactivatedAt ? 'warn' : 'ok';
}

function ProfilesSection({
  personId,
  locale,
  labels,
  onChanged,
}: {
  personId: string;
  locale: 'it' | 'en';
  labels: PilotEditorLabels['profiles'];
  /** Called after a successful activate/update/deactivate (never on the initial load) — derives the same three boolean flags `PilotRow['profiles']` carries, so the row/badges behind this slide-over stay in sync (AD-1: no separate re-fetch of the list needed). */
  onChanged: (profiles: { pilot: boolean; student: boolean; instructor: boolean }) => void;
}) {
  const [detail, setDetail] = useState<PersonProfilesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchProfilesDetail(personId).then((result) => {
      if (cancelled) return;
      if (!result) {
        setError(true);
        setLoading(false);
        return;
      }
      setError(false);
      setDetail(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  async function refresh(): Promise<void> {
    const result = await fetchProfilesDetail(personId);
    if (!result) return;
    setDetail(result);
    onChanged({
      pilot: result.pilotProfile !== null && result.pilotProfile.deactivatedAt === null,
      student: result.studentProfile !== null && result.studentProfile.deactivatedAt === null,
      instructor: result.instructorProfile !== null && result.instructorProfile.deactivatedAt === null,
    });
  }

  if (loading) return <p className="fld-label">…</p>;
  if (error || !detail) {
    return (
      <p className="fld-label" style={{ color: 'var(--bad)' }}>
        {labels.errors.generic}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PilotProfileForm personId={personId} profile={detail.pilotProfile} labels={labels} onSaved={refresh} />
      <StudentProfileForm personId={personId} locale={locale} profile={detail.studentProfile} labels={labels} onSaved={refresh} />
      <InstructorProfileForm personId={personId} profile={detail.instructorProfile} labels={labels} onSaved={refresh} />
    </div>
  );
}

/** Shared chrome (title/status badge/activate·edit·deactivate) for one profile sub-form — same behavior as the legacy `profiles-panel.tsx`'s `SectionShell`+per-type sections, restyled to the AirOps `Field`/`Badge` primitives. */
function ProfileSubShell({
  title,
  profile,
  labels,
  testId,
  children,
}: {
  title: string;
  profile: { deactivatedAt: string | null } | null;
  labels: PilotEditorLabels['profiles'];
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }} data-testid={testId}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</span>
        <Badge tone={profileStatusTone(profile)} dot>
          {profileStatusLabel(profile, labels)}
        </Badge>
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function PilotProfileForm({
  personId,
  profile,
  labels,
  onSaved,
}: {
  personId: string;
  profile: { licenseNumber: string; licenseType: string; deactivatedAt: string | null } | null;
  labels: PilotEditorLabels['profiles'];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PilotProfileRequestInput>({
    resolver: zodResolver(pilotProfileRequestSchema),
    values: { licenseNumber: profile?.licenseNumber ?? '', licenseType: profile?.licenseType ?? '' },
  });

  async function onSubmit(values: PilotProfileRequestInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${personId}/profiles/pilot`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setFormError(labels.errors.generic);
      await onSaved();
      return;
    }
    setEditing(false);
    await onSaved();
  }

  async function handleDeactivate(): Promise<void> {
    setPending(true);
    const response = await fetch(`/api/v1/people/${personId}/profiles/pilot/deactivate`, { method: 'POST' });
    setPending(false);
    setConfirmingDeactivate(false);
    if (!response.ok) {
      setFormError(labels.errors.generic);
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <ProfileSubShell title={labels.pilot.title} profile={profile} labels={labels} testId="pilot-editor-profile-pilot">
      {editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
          <div className="form-grid">
            <Field label={labels.pilot.licenseNumber}>
              <Input aria-invalid={Boolean(errors.licenseNumber)} {...register('licenseNumber')} />
            </Field>
            <Field label={labels.pilot.licenseType}>
              <Input aria-invalid={Boolean(errors.licenseType)} {...register('licenseType')} />
            </Field>
          </div>
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
              {formError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="submit" disabled={isSubmitting} className="btn primary">
              {labels.actions.save}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              {labels.actions.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className="fld-label" style={{ textTransform: 'none' }}>
            {profile ? `${labels.pilot.licenseNumber}: ${profile.licenseNumber} · ${labels.pilot.licenseType}: ${profile.licenseType}` : ''}
          </span>
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)' }}>
              {formError}
            </p>
          ) : null}
          {confirmingDeactivate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="fld-label">{labels.actions.confirmDeactivate}</span>
              <button type="button" disabled={pending} className="btn mini bad" onClick={() => void handleDeactivate()}>
                {labels.actions.confirmYes}
              </button>
              <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(false)}>
                {labels.actions.confirmCancel}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn mini" onClick={() => setEditing(true)}>
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </button>
              {isActive ? (
                <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(true)}>
                  {labels.actions.deactivate}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </ProfileSubShell>
  );
}

function StudentProfileForm({
  personId,
  locale,
  profile,
  labels,
  onSaved,
}: {
  personId: string;
  locale: 'it' | 'en';
  profile: { courseStartDate: string; deactivatedAt: string | null } | null;
  labels: PilotEditorLabels['profiles'];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentProfileRequestInput>({
    resolver: zodResolver(studentProfileRequestSchema),
    values: { courseStartDate: profile?.courseStartDate ?? '' },
  });

  async function onSubmit(values: StudentProfileRequestInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${personId}/profiles/student`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setFormError(labels.errors.generic);
      await onSaved();
      return;
    }
    setEditing(false);
    await onSaved();
  }

  async function handleDeactivate(): Promise<void> {
    setPending(true);
    const response = await fetch(`/api/v1/people/${personId}/profiles/student/deactivate`, { method: 'POST' });
    setPending(false);
    setConfirmingDeactivate(false);
    if (!response.ok) {
      setFormError(labels.errors.generic);
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <ProfileSubShell title={labels.student.title} profile={profile} labels={labels} testId="pilot-editor-profile-student">
      {editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
          <div className="form-grid">
            <Field label={labels.student.courseStartDate}>
              <DateInput aria-invalid={Boolean(errors.courseStartDate)} {...register('courseStartDate')} />
            </Field>
          </div>
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
              {formError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="submit" disabled={isSubmitting} className="btn primary">
              {labels.actions.save}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              {labels.actions.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className="fld-label" style={{ textTransform: 'none' }}>
            {profile ? `${labels.student.courseStartDate}: ${formatDateOnly(profile.courseStartDate, locale)}` : ''}
          </span>
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)' }}>
              {formError}
            </p>
          ) : null}
          {confirmingDeactivate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="fld-label">{labels.actions.confirmDeactivate}</span>
              <button type="button" disabled={pending} className="btn mini bad" onClick={() => void handleDeactivate()}>
                {labels.actions.confirmYes}
              </button>
              <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(false)}>
                {labels.actions.confirmCancel}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn mini" onClick={() => setEditing(true)}>
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </button>
              {isActive ? (
                <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(true)}>
                  {labels.actions.deactivate}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </ProfileSubShell>
  );
}

function InstructorProfileForm({
  personId,
  profile,
  labels,
  onSaved,
}: {
  personId: string;
  profile: { deactivatedAt: string | null } | null;
  labels: PilotEditorLabels['profiles'];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<InstructorProfileRequestInput>({
    resolver: zodResolver(instructorProfileRequestSchema),
    values: {},
  });

  async function onSubmit(values: InstructorProfileRequestInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${personId}/profiles/instructor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setFormError(labels.errors.generic);
      await onSaved();
      return;
    }
    setEditing(false);
    await onSaved();
  }

  async function handleDeactivate(): Promise<void> {
    setPending(true);
    const response = await fetch(`/api/v1/people/${personId}/profiles/instructor/deactivate`, { method: 'POST' });
    setPending(false);
    setConfirmingDeactivate(false);
    if (!response.ok) {
      setFormError(labels.errors.generic);
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <ProfileSubShell title={labels.instructor.title} profile={profile} labels={labels} testId="pilot-editor-profile-instructor">
      {editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
              {formError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="submit" disabled={isSubmitting} className="btn primary">
              {labels.actions.save}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              {labels.actions.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className="fld-label" style={{ textTransform: 'none' }} />
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)' }}>
              {formError}
            </p>
          ) : null}
          {confirmingDeactivate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="fld-label">{labels.actions.confirmDeactivate}</span>
              <button type="button" disabled={pending} className="btn mini bad" onClick={() => void handleDeactivate()}>
                {labels.actions.confirmYes}
              </button>
              <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(false)}>
                {labels.actions.confirmCancel}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn mini" onClick={() => setEditing(true)}>
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </button>
              {isActive ? (
                <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(true)}>
                  {labels.actions.deactivate}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </ProfileSubShell>
  );
}

// --- Certificazioni (read-only) ---------------------------------------------

type ExpiryListEntry = { typeName: string; status: 'ok' | 'expiring' | 'expired'; expiresAt: string };

async function fetchExpiries(personId: string): Promise<ExpiryListEntry[]> {
  const response = await fetch(`/api/v1/people/${personId}/expiries`);
  if (!response.ok) return [];
  return (await response.json()) as ExpiryListEntry[];
}

function expiryStatusTone(status: 'ok' | 'expiring' | 'expired'): BadgeTone {
  if (status === 'expired') return 'bad';
  if (status === 'expiring') return 'warn';
  return 'ok';
}

/**
 * READ-ONLY (D13, AC 4): registering/editing a scadenza stays on the
 * Scadenze page — this section only surfaces what already exists, grouped
 * by `typeName` (`groupExpiriesByTypeName`, shared with `pilot-profile.tsx`).
 */
function RatingsSection({ personId, labels, locale }: { personId: string; labels: PilotEditorLabels['ratings']; locale: 'it' | 'en' }) {
  const [groups, setGroups] = useState<Array<ExpiryGroupSource> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchExpiries(personId).then((result) => {
      if (cancelled) return;
      setGroups(groupExpiriesByTypeName(result));
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const statusLabelOf = (status: 'ok' | 'expiring' | 'expired'): string =>
    status === 'expired' ? labels.status.expired : status === 'expiring' ? labels.status.expiring : labels.status.ok;

  return (
    <div>
      {groups === null ? (
        <p className="fld-label">…</p>
      ) : groups.length === 0 ? (
        <p className="fld-label" style={{ textTransform: 'none' }}>
          {labels.empty}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.map((group) => (
            <div key={group.typeName} className="meter-row" data-testid={`pilot-certification-${group.typeName}`}>
              <span>{group.typeName}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono">{formatDateOnly(group.expiresAt, locale)}</span>
                <Badge tone={expiryStatusTone(group.status)}>{statusLabelOf(group.status)}</Badge>
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <Link href="/dashboard/expiries" className="fld-label" style={{ textTransform: 'none', textDecoration: 'underline' }}>
          {labels.manageLink}
        </Link>
      </div>
    </div>
  );
}

// --- Accesso (ADMIN-only) ----------------------------------------------------

const ALL_ROLES: readonly Role[] = ['ADMIN', 'STAFF', 'INSTRUCTOR', 'PILOT', 'STUDENT'];

const createAccessUserSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  roles: z.array(z.enum(['ADMIN', 'STAFF', 'INSTRUCTOR', 'PILOT', 'STUDENT'])).min(1),
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
          <Field label={labels.email} wide>
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
          <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
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
