'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  instructorProfileRequestSchema,
  pilotProfileRequestSchema,
  studentProfileRequestSchema,
  type InstructorProfileRequestInput,
  type PilotProfileRequestInput,
  type StudentProfileRequestInput,
} from '@/lib/schemas/people';

/**
 * The three profiles a `Person` may activate (story 2.2, AC 1/2, AD-11).
 * Fetched in full only here (`GET /api/v1/people/{id}`) — the list row only
 * carries the active/inactive flags (`PersonRow['profiles']`) shown as
 * badges, kept light on purpose (`people-manager.tsx`).
 */
type PilotProfileData = { licenseNumber: string; licenseType: string; deactivatedAt: string | null };
type StudentProfileData = { courseStartDate: string; deactivatedAt: string | null };
type InstructorProfileData = { ratings: string; deactivatedAt: string | null };

type PersonProfilesDetail = {
  id: string;
  pilotProfile: PilotProfileData | null;
  studentProfile: StudentProfileData | null;
  instructorProfile: InstructorProfileData | null;
};

export type ProfilesPanelLabels = {
  heading: string;
  close: string;
  loadError: string;
  badges: { pilot: string; student: string; instructor: string };
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
  instructor: { title: string; ratings: string };
};

type ProfilesPanelProps = {
  personId: string;
  personLabel: string;
  labels: ProfilesPanelLabels;
  onClose: () => void;
  /** Called after any successful activate/update/deactivate so the parent list (badges) can refresh. */
  onChanged: () => void;
};

async function fetchDetail(personId: string): Promise<PersonProfilesDetail | null> {
  const response = await fetch(`/api/v1/people/${personId}`);
  if (!response.ok) return null;
  return (await response.json()) as PersonProfilesDetail;
}

export function ProfilesPanel({ personId, personLabel, labels, onClose, onChanged }: ProfilesPanelProps) {
  // The parent renders this panel with `key={personId}`, so switching person
  // remounts it — initial state is always fresh and the effect below only
  // ever needs to run the async fetch (setState happens in its callback,
  // never synchronously in the effect body).
  const [detail, setDetail] = useState<PersonProfilesDetail | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchDetail(personId).then((result) => {
      if (cancelled) return;
      if (!result) {
        setError(true);
        setLoading(false);
        return;
      }
      setDetail(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  async function refresh(): Promise<void> {
    const result = await fetchDetail(personId);
    if (result) setDetail(result);
    onChanged();
  }

  return (
    <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
            {labels.heading}
          </h3>
          <p className="mt-1 text-sm text-[#787774]">{personLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
        >
          {labels.close}
        </button>
      </div>

      {loading ? <p className="mt-6 text-sm text-[#787774]">…</p> : null}
      {error ? <p className="mt-6 text-sm text-[#9F2F2D]">{labels.loadError}</p> : null}

      {!loading && !error && detail ? (
        <div className="mt-6 space-y-6">
          <PilotSection personId={personId} profile={detail.pilotProfile} labels={labels} onSaved={refresh} />
          <StudentSection personId={personId} profile={detail.studentProfile} labels={labels} onSaved={refresh} />
          <InstructorSection personId={personId} profile={detail.instructorProfile} labels={labels} onSaved={refresh} />
        </div>
      ) : null}
    </div>
  );
}

function sectionStatusLabel(profile: { deactivatedAt: string | null } | null, labels: ProfilesPanelLabels): string {
  if (!profile) return labels.status.notActivated;
  return profile.deactivatedAt ? labels.status.inactive : labels.status.active;
}

function sectionBadgeClasses(profile: { deactivatedAt: string | null } | null): string {
  if (!profile) return 'bg-[#F7F6F3] text-[#787774]';
  return profile.deactivatedAt ? 'bg-[#FBF3DB] text-[#956400]' : 'bg-[#EDF3EC] text-[#346538]';
}

type SectionShellProps = {
  title: string;
  status: string;
  badgeClasses: string;
  testId: string;
  children: React.ReactNode;
};

function SectionShell({ title, status, badgeClasses, testId, children }: SectionShellProps) {
  return (
    <div className="rounded-[8px] border border-[#EAEAEA] p-4" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-medium text-[#111111]">{title}</h4>
        <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] ${badgeClasses}`}>{status}</span>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

type PilotSectionProps = {
  personId: string;
  profile: PilotProfileData | null;
  labels: ProfilesPanelLabels;
  onSaved: () => Promise<void>;
};

function PilotSection({ personId, profile, labels, onSaved }: PilotSectionProps) {
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
      return;
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <SectionShell
      title={labels.pilot.title}
      status={sectionStatusLabel(profile, labels)}
      badgeClasses={sectionBadgeClasses(profile)}
      testId="profile-section-pilot"
    >
      {editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pilot-licenseNumber" className="block text-sm font-medium text-[#2F3437]">
                {labels.pilot.licenseNumber}
              </label>
              <input
                id="pilot-licenseNumber"
                className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
                aria-invalid={Boolean(errors.licenseNumber)}
                {...register('licenseNumber')}
              />
              {errors.licenseNumber ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.errors.requiredField}</p> : null}
            </div>
            <div>
              <label htmlFor="pilot-licenseType" className="block text-sm font-medium text-[#2F3437]">
                {labels.pilot.licenseType}
              </label>
              <input
                id="pilot-licenseType"
                className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
                aria-invalid={Boolean(errors.licenseType)}
                {...register('licenseType')}
              />
              {errors.licenseType ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.errors.requiredField}</p> : null}
            </div>
          </div>
          {formError ? <p className="text-sm text-[#9F2F2D]">{formError}</p> : null}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-60"
            >
              {labels.actions.save}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {labels.actions.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {profile ? (
            <p className="text-sm text-[#2F3437]">
              {labels.pilot.licenseNumber}: {profile.licenseNumber} · {labels.pilot.licenseType}: {profile.licenseType}
            </p>
          ) : (
            <span />
          )}
          {formError ? <p className="text-sm text-[#9F2F2D]">{formError}</p> : null}
          {confirmingDeactivate ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#787774]">{labels.actions.confirmDeactivate}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => void handleDeactivate()}
                className="rounded-[6px] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-50"
              >
                {labels.actions.confirmYes}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDeactivate(false)}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {labels.actions.confirmCancel}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </button>
              {isActive ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDeactivate(true)}
                  className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
                >
                  {labels.actions.deactivate}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}

type StudentSectionProps = {
  personId: string;
  profile: StudentProfileData | null;
  labels: ProfilesPanelLabels;
  onSaved: () => Promise<void>;
};

function StudentSection({ personId, profile, labels, onSaved }: StudentSectionProps) {
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
      return;
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <SectionShell
      title={labels.student.title}
      status={sectionStatusLabel(profile, labels)}
      badgeClasses={sectionBadgeClasses(profile)}
      testId="profile-section-student"
    >
      {editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
          <div>
            <label htmlFor="student-courseStartDate" className="block text-sm font-medium text-[#2F3437]">
              {labels.student.courseStartDate}
            </label>
            <input
              id="student-courseStartDate"
              type="date"
              className="mt-2 w-full max-w-xs rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
              aria-invalid={Boolean(errors.courseStartDate)}
              {...register('courseStartDate')}
            />
            {errors.courseStartDate ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.errors.requiredField}</p> : null}
          </div>
          {formError ? <p className="text-sm text-[#9F2F2D]">{formError}</p> : null}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-60"
            >
              {labels.actions.save}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {labels.actions.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {profile ? (
            <p className="text-sm text-[#2F3437]">
              {labels.student.courseStartDate}: {profile.courseStartDate}
            </p>
          ) : (
            <span />
          )}
          {formError ? <p className="text-sm text-[#9F2F2D]">{formError}</p> : null}
          {confirmingDeactivate ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#787774]">{labels.actions.confirmDeactivate}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => void handleDeactivate()}
                className="rounded-[6px] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-50"
              >
                {labels.actions.confirmYes}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDeactivate(false)}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {labels.actions.confirmCancel}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </button>
              {isActive ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDeactivate(true)}
                  className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
                >
                  {labels.actions.deactivate}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}

type InstructorSectionProps = {
  personId: string;
  profile: InstructorProfileData | null;
  labels: ProfilesPanelLabels;
  onSaved: () => Promise<void>;
};

function InstructorSection({ personId, profile, labels, onSaved }: InstructorSectionProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InstructorProfileRequestInput>({
    resolver: zodResolver(instructorProfileRequestSchema),
    values: { ratings: profile?.ratings ?? '' },
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
      return;
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <SectionShell
      title={labels.instructor.title}
      status={sectionStatusLabel(profile, labels)}
      badgeClasses={sectionBadgeClasses(profile)}
      testId="profile-section-instructor"
    >
      {editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
          <div>
            <label htmlFor="instructor-ratings" className="block text-sm font-medium text-[#2F3437]">
              {labels.instructor.ratings}
            </label>
            <input
              id="instructor-ratings"
              className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
              aria-invalid={Boolean(errors.ratings)}
              {...register('ratings')}
            />
            {errors.ratings ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.errors.requiredField}</p> : null}
          </div>
          {formError ? <p className="text-sm text-[#9F2F2D]">{formError}</p> : null}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-60"
            >
              {labels.actions.save}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {labels.actions.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {profile ? <p className="text-sm text-[#2F3437]">{profile.ratings}</p> : <span />}
          {formError ? <p className="text-sm text-[#9F2F2D]">{formError}</p> : null}
          {confirmingDeactivate ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#787774]">{labels.actions.confirmDeactivate}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => void handleDeactivate()}
                className="rounded-[6px] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-50"
              >
                {labels.actions.confirmYes}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDeactivate(false)}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {labels.actions.confirmCancel}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </button>
              {isActive ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDeactivate(true)}
                  className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
                >
                  {labels.actions.deactivate}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}
