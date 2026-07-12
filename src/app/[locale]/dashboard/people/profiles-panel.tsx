'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale } from 'next-intl';
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
import { formatDateOnly } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Card } from '@/components/ui/card';

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
  /** Omitted when the panel is embedded read-only (story 2.3) — no "close" affordance for a permanent page section. */
  onClose?: () => void;
  /** Called after any successful activate/update/deactivate so the parent list (badges) can refresh. Never invoked in `readOnly` mode (no mutations). */
  onChanged?: () => void;
  /**
   * Story 2.3, Task 3: hides every form/activate/deactivate control, leaving
   * only the read data — derived server-side from `hasPermission(actor,
   * 'people.manage')` by the caller. The UI hides; the service (whose writes
   * already `authorize(actor, 'people.manage')`) remains the actual guardian
   * (AD-5).
   */
  readOnly?: boolean;
};

async function fetchDetail(personId: string): Promise<PersonProfilesDetail | null> {
  const response = await fetch(`/api/v1/people/${personId}`);
  if (!response.ok) return null;
  return (await response.json()) as PersonProfilesDetail;
}

export function ProfilesPanel({ personId, personLabel, labels, onClose, onChanged, readOnly = false }: ProfilesPanelProps) {
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
    onChanged?.();
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
            {labels.heading}
          </h3>
          <p className="mt-1 text-sm text-mid-gray">{personLabel}</p>
        </div>
        {onClose ? (
          <Button variant="outline" size="sm"
            type="button"
            onClick={onClose}
          >
            {labels.close}
          </Button>
        ) : null}
      </div>

      {loading ? <p className="mt-6 text-sm text-mid-gray">…</p> : null}
      {error ? <p className="mt-6 text-sm text-ember">{labels.loadError}</p> : null}

      {!loading && !error && detail ? (
        <div className="mt-6 space-y-6">
          <PilotSection personId={personId} profile={detail.pilotProfile} labels={labels} onSaved={refresh} readOnly={readOnly} />
          <StudentSection personId={personId} profile={detail.studentProfile} labels={labels} onSaved={refresh} readOnly={readOnly} />
          <InstructorSection personId={personId} profile={detail.instructorProfile} labels={labels} onSaved={refresh} readOnly={readOnly} />
        </div>
      ) : null}
    </Card>
  );
}

function sectionStatusLabel(profile: { deactivatedAt: string | null } | null, labels: ProfilesPanelLabels): string {
  if (!profile) return labels.status.notActivated;
  return profile.deactivatedAt ? labels.status.inactive : labels.status.active;
}

function sectionBadgeTone(profile: { deactivatedAt: string | null } | null): StatusTone | string {
  if (!profile) return 'bg-canvas text-mid-gray';
  return profile.deactivatedAt ? 'warning' : 'ok';
}

type SectionShellProps = {
  title: string;
  status: string;
  badgeTone: StatusTone | string;
  testId: string;
  children: React.ReactNode;
};

function SectionShell({ title, status, badgeTone, testId, children }: SectionShellProps) {
  return (
    <div className="rounded-nested border border-hairline p-4" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-medium text-ink">{title}</h4>
        <StatusPill tone={badgeTone}>{status}</StatusPill>
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
  readOnly: boolean;
};

function PilotSection({ personId, profile, labels, onSaved, readOnly }: PilotSectionProps) {
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
      // Refetch even on failure: a 409/404 usually means this section was
      // stale (concurrent change) — show the server's current state along
      // with the error message (review 2.2 F2, same rationale as 2.1 F1).
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
      await onSaved();
      return;
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <SectionShell
      title={labels.pilot.title}
      status={sectionStatusLabel(profile, labels)}
      badgeTone={sectionBadgeTone(profile)}
      testId="profile-section-pilot"
    >
      {readOnly ? (
        profile ? (
          <p className="text-sm text-ink">
            {labels.pilot.licenseNumber}: {profile.licenseNumber} · {labels.pilot.licenseType}: {profile.licenseType}
          </p>
        ) : (
          <span />
        )
      ) : editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pilot-licenseNumber" className="block text-sm font-medium text-ink">
                {labels.pilot.licenseNumber}
              </label>
              <Input
                id="pilot-licenseNumber"
                className="mt-2 w-full"
                aria-invalid={Boolean(errors.licenseNumber)}
                {...register('licenseNumber')}
              />
              {errors.licenseNumber ? <p className="mt-1 text-xs text-ember">{labels.errors.requiredField}</p> : null}
            </div>
            <div>
              <label htmlFor="pilot-licenseType" className="block text-sm font-medium text-ink">
                {labels.pilot.licenseType}
              </label>
              <Input
                id="pilot-licenseType"
                className="mt-2 w-full"
                aria-invalid={Boolean(errors.licenseType)}
                {...register('licenseType')}
              />
              {errors.licenseType ? <p className="mt-1 text-xs text-ember">{labels.errors.requiredField}</p> : null}
            </div>
          </div>
          {formError ? (
            <p role="alert" className="text-sm text-ember">
              {formError}
            </p>
          ) : null}
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="disabled:opacity-60"
            >
              {labels.actions.save}
            </Button>
            <Button variant="outline"
              type="button"
              onClick={() => setEditing(false)}
            >
              {labels.actions.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {profile ? (
            <p className="text-sm text-ink">
              {labels.pilot.licenseNumber}: {profile.licenseNumber} · {labels.pilot.licenseType}: {profile.licenseType}
            </p>
          ) : (
            <span />
          )}
          {formError ? (
            <p role="alert" className="text-sm text-ember">
              {formError}
            </p>
          ) : null}
          {confirmingDeactivate ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-mid-gray">{labels.actions.confirmDeactivate}</span>
              <Button size="sm"
                type="button"
                disabled={pending}
                onClick={() => void handleDeactivate()}
              >
                {labels.actions.confirmYes}
              </Button>
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setConfirmingDeactivate(false)}
              >
                {labels.actions.confirmCancel}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setEditing(true)}
              >
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </Button>
              {isActive ? (
                <Button variant="outline" size="sm"
                  type="button"
                  onClick={() => setConfirmingDeactivate(true)}
                >
                  {labels.actions.deactivate}
                </Button>
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
  readOnly: boolean;
};

function StudentSection({ personId, profile, labels, onSaved, readOnly }: StudentSectionProps) {
  const moneyLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);
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
      // Refetch even on failure: a 409/404 usually means this section was
      // stale (concurrent change) — show the server's current state along
      // with the error message (review 2.2 F2, same rationale as 2.1 F1).
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
      await onSaved();
      return;
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <SectionShell
      title={labels.student.title}
      status={sectionStatusLabel(profile, labels)}
      badgeTone={sectionBadgeTone(profile)}
      testId="profile-section-student"
    >
      {readOnly ? (
        profile ? (
          <p className="text-sm text-ink">
            {labels.student.courseStartDate}: {formatDateOnly(profile.courseStartDate, moneyLocale)}
          </p>
        ) : (
          <span />
        )
      ) : editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
          <div>
            <label htmlFor="student-courseStartDate" className="block text-sm font-medium text-ink">
              {labels.student.courseStartDate}
            </label>
            <Input
              id="student-courseStartDate"
              type="date"
              className="mt-2 w-full max-w-xs"
              aria-invalid={Boolean(errors.courseStartDate)}
              {...register('courseStartDate')}
            />
            {errors.courseStartDate ? <p className="mt-1 text-xs text-ember">{labels.errors.requiredField}</p> : null}
          </div>
          {formError ? (
            <p role="alert" className="text-sm text-ember">
              {formError}
            </p>
          ) : null}
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="disabled:opacity-60"
            >
              {labels.actions.save}
            </Button>
            <Button variant="outline"
              type="button"
              onClick={() => setEditing(false)}
            >
              {labels.actions.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {profile ? (
            <p className="text-sm text-ink">
              {labels.student.courseStartDate}: {formatDateOnly(profile.courseStartDate, moneyLocale)}
            </p>
          ) : (
            <span />
          )}
          {formError ? (
            <p role="alert" className="text-sm text-ember">
              {formError}
            </p>
          ) : null}
          {confirmingDeactivate ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-mid-gray">{labels.actions.confirmDeactivate}</span>
              <Button size="sm"
                type="button"
                disabled={pending}
                onClick={() => void handleDeactivate()}
              >
                {labels.actions.confirmYes}
              </Button>
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setConfirmingDeactivate(false)}
              >
                {labels.actions.confirmCancel}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setEditing(true)}
              >
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </Button>
              {isActive ? (
                <Button variant="outline" size="sm"
                  type="button"
                  onClick={() => setConfirmingDeactivate(true)}
                >
                  {labels.actions.deactivate}
                </Button>
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
  readOnly: boolean;
};

function InstructorSection({ personId, profile, labels, onSaved, readOnly }: InstructorSectionProps) {
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
      // Refetch even on failure: a 409/404 usually means this section was
      // stale (concurrent change) — show the server's current state along
      // with the error message (review 2.2 F2, same rationale as 2.1 F1).
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
      await onSaved();
      return;
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <SectionShell
      title={labels.instructor.title}
      status={sectionStatusLabel(profile, labels)}
      badgeTone={sectionBadgeTone(profile)}
      testId="profile-section-instructor"
    >
      {readOnly ? (
        profile ? <p className="text-sm text-ink">{profile.ratings}</p> : <span />
      ) : editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
          <div>
            <label htmlFor="instructor-ratings" className="block text-sm font-medium text-ink">
              {labels.instructor.ratings}
            </label>
            <Input
              id="instructor-ratings"
              className="mt-2 w-full"
              aria-invalid={Boolean(errors.ratings)}
              {...register('ratings')}
            />
            {errors.ratings ? <p className="mt-1 text-xs text-ember">{labels.errors.requiredField}</p> : null}
          </div>
          {formError ? (
            <p role="alert" className="text-sm text-ember">
              {formError}
            </p>
          ) : null}
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="disabled:opacity-60"
            >
              {labels.actions.save}
            </Button>
            <Button variant="outline"
              type="button"
              onClick={() => setEditing(false)}
            >
              {labels.actions.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {profile ? <p className="text-sm text-ink">{profile.ratings}</p> : <span />}
          {formError ? (
            <p role="alert" className="text-sm text-ember">
              {formError}
            </p>
          ) : null}
          {confirmingDeactivate ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-mid-gray">{labels.actions.confirmDeactivate}</span>
              <Button size="sm"
                type="button"
                disabled={pending}
                onClick={() => void handleDeactivate()}
              >
                {labels.actions.confirmYes}
              </Button>
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setConfirmingDeactivate(false)}
              >
                {labels.actions.confirmCancel}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setEditing(true)}
              >
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </Button>
              {isActive ? (
                <Button variant="outline" size="sm"
                  type="button"
                  onClick={() => setConfirmingDeactivate(true)}
                >
                  {labels.actions.deactivate}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}
