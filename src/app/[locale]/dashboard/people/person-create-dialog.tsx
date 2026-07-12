'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { createPersonSchema, type CreatePersonInput } from '@/lib/schemas/people';
import type { Labels } from './people-manager';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input, inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog } from '@/components/ui/dialog';

type PersonRole = '' | 'pilot' | 'student' | 'instructor';

/** The role-specific fields, ALL kept as plain strings regardless of role (same "plain state, not RHF" pattern as `RegisterFlightForm`'s picker fields) — only the currently selected role's subset is read/validated. */
type ProfileFields = { licenseNumber: string; licenseType: string; courseStartDate: string; ratings: string };

function emptyProfileFields(): ProfileFields {
  return { licenseNumber: '', licenseType: '', courseStartDate: '', ratings: '' };
}

export type PersonCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  labels: Labels;
  /** Called once the person is fully created (and, if a role was chosen, its profile activated) — `personId` for the "Completa la scheda" link. */
  onCreated: (personId: string, message: string) => void;
};

/**
 * "Nuova persona" dialog (story 12.3, AC 4) — a MINIMAL create form (nome,
 * cognome, email, telefono) plus an OPTIONAL "Ruolo" select that, when
 * chosen, reveals that profile's own required fields (ratifica utente
 * 2026-07-12). `address`/`fiscalCode` are deliberately absent here
 * (progressive disclosure — they stay in the edit form/scheda,
 * `people-manager.tsx`'s `EditPersonForm`, untouched by this story).
 *
 * Submit is TWO sequential calls: `POST /api/v1/people`, then — only if a
 * role was picked — `PUT /api/v1/people/{id}/profiles/{type}`. If the
 * second call fails the person ALREADY EXISTS (no rollback, Dev Notes): the
 * dialog stays open with an error and a link to the scheda to finish the
 * profile manually, instead of the generic form error.
 */
export function PersonCreateDialog({ open, onClose, labels, onCreated }: PersonCreateDialogProps) {
  const [role, setRole] = useState<PersonRole>('');
  const [profileFields, setProfileFields] = useState<ProfileFields>(emptyProfileFields());
  const [profileFieldErrors, setProfileFieldErrors] = useState<Partial<Record<keyof ProfileFields, boolean>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<{ personId: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createPersonSchema>, unknown, CreatePersonInput>({
    resolver: zodResolver(createPersonSchema),
    defaultValues: { firstName: '', lastName: '', email: null, phone: null },
  });

  function resetAll(): void {
    reset({ firstName: '', lastName: '', email: null, phone: null });
    setRole('');
    setProfileFields(emptyProfileFields());
    setProfileFieldErrors({});
    setFormError(null);
    setProfileError(null);
  }

  function handleClose(): void {
    resetAll();
    onClose();
  }

  /** Required-field check for the CURRENTLY selected role only — run before the first network call (AC 4: no wasted round-trip on an incomplete profile). */
  function validateProfileFields(): boolean {
    if (role === '') return true;
    const requiredKeys: Record<Exclude<PersonRole, ''>, (keyof ProfileFields)[]> = {
      pilot: ['licenseNumber', 'licenseType'],
      student: ['courseStartDate'],
      instructor: ['ratings'],
    };
    const nextErrors: Partial<Record<keyof ProfileFields, boolean>> = {};
    for (const key of requiredKeys[role]) {
      if (profileFields[key].trim() === '') nextErrors[key] = true;
    }
    setProfileFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function putProfile(personId: string): Promise<boolean> {
    if (role === '') return true;
    const body =
      role === 'pilot'
        ? { licenseNumber: profileFields.licenseNumber.trim(), licenseType: profileFields.licenseType.trim() }
        : role === 'student'
          ? { courseStartDate: profileFields.courseStartDate }
          : { ratings: profileFields.ratings.trim() };
    const response = await fetch(`/api/v1/people/${personId}/profiles/${role}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok;
  }

  async function onSubmit(values: CreatePersonInput): Promise<void> {
    setFormError(null);
    setProfileError(null);
    if (!validateProfileFields()) return;

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
    const person = (await response.json()) as { id: string };

    const profileOk = await putProfile(person.id);
    if (!profileOk) {
      // AC 4: the person EXISTS — no rollback. Keep the dialog open with a
      // retry link instead of resetting/closing as if nothing went wrong.
      setProfileError({ personId: person.id });
      return;
    }

    const message = labels.feedback.created;
    resetAll();
    onCreated(person.id, message);
  }

  return (
    <Dialog open={open} onClose={handleClose} title={labels.form.createTitle} className="max-w-md">
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="mt-5 space-y-5" data-testid="person-create-form">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="create-firstName" className="block text-sm font-medium text-ink">
              {labels.form.firstName}
            </label>
            <input
              id="create-firstName"
              className={cn(inputBaseClasses, 'mt-2 w-full')}
              aria-invalid={Boolean(errors.firstName)}
              {...register('firstName')}
            />
            {errors.firstName ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
          </div>
          <div>
            <label htmlFor="create-lastName" className="block text-sm font-medium text-ink">
              {labels.form.lastName}
            </label>
            <input
              id="create-lastName"
              className={cn(inputBaseClasses, 'mt-2 w-full')}
              aria-invalid={Boolean(errors.lastName)}
              {...register('lastName')}
            />
            {errors.lastName ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="create-email" className="block text-sm font-medium text-ink">
              {labels.form.email}
            </label>
            <input id="create-email" type="email" autoComplete="off" className={cn(inputBaseClasses, 'mt-2 w-full')} {...register('email')} />
          </div>
          <div>
            <label htmlFor="create-phone" className="block text-sm font-medium text-ink">
              {labels.form.phone}
            </label>
            <input id="create-phone" type="tel" className={cn(inputBaseClasses, 'mt-2 w-full')} {...register('phone')} />
          </div>
        </div>

        <div>
          <label htmlFor="create-role" className="block text-sm font-medium text-ink">
            {labels.form.role}
          </label>
          <select
            id="create-role"
            className={cn(inputBaseClasses, 'mt-2 w-full')}
            value={role}
            onChange={(event) => {
              setRole(event.target.value as PersonRole);
              setProfileFieldErrors({});
            }}
          >
            <option value="">{labels.form.roleNone}</option>
            <option value="pilot">{labels.profilesPanel.pilot.title}</option>
            <option value="student">{labels.profilesPanel.student.title}</option>
            <option value="instructor">{labels.profilesPanel.instructor.title}</option>
          </select>
        </div>

        {role === 'pilot' ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="create-licenseNumber" className="block text-sm font-medium text-ink">
                {labels.profilesPanel.pilot.licenseNumber}
              </label>
              <Input
                id="create-licenseNumber"
                className="mt-2 w-full"
                aria-invalid={Boolean(profileFieldErrors.licenseNumber)}
                value={profileFields.licenseNumber}
                onChange={(event) => setProfileFields((current) => ({ ...current, licenseNumber: event.target.value }))}
              />
              {profileFieldErrors.licenseNumber ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
            </div>
            <div>
              <label htmlFor="create-licenseType" className="block text-sm font-medium text-ink">
                {labels.profilesPanel.pilot.licenseType}
              </label>
              <Input
                id="create-licenseType"
                className="mt-2 w-full"
                aria-invalid={Boolean(profileFieldErrors.licenseType)}
                value={profileFields.licenseType}
                onChange={(event) => setProfileFields((current) => ({ ...current, licenseType: event.target.value }))}
              />
              {profileFieldErrors.licenseType ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
            </div>
          </div>
        ) : null}

        {role === 'student' ? (
          <div className="max-w-xs">
            <DatePicker
              id="create-courseStartDate"
              label={labels.profilesPanel.student.courseStartDate}
              value={profileFields.courseStartDate}
              onChange={(next) => setProfileFields((current) => ({ ...current, courseStartDate: next }))}
              labels={labels.profilesPanel.datePicker}
              ariaInvalid={Boolean(profileFieldErrors.courseStartDate)}
            />
            {profileFieldErrors.courseStartDate ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
          </div>
        ) : null}

        {role === 'instructor' ? (
          <div>
            <label htmlFor="create-ratings" className="block text-sm font-medium text-ink">
              {labels.profilesPanel.instructor.ratings}
            </label>
            <Input
              id="create-ratings"
              className="mt-2 w-full"
              aria-invalid={Boolean(profileFieldErrors.ratings)}
              value={profileFields.ratings}
              onChange={(event) => setProfileFields((current) => ({ ...current, ratings: event.target.value }))}
            />
            {profileFieldErrors.ratings ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
          </div>
        ) : null}

        {formError ? (
          <p role="alert" data-testid="person-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
            {formError}
          </p>
        ) : null}

        {profileError ? (
          <p role="alert" data-testid="person-profile-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
            {labels.form.profileError}{' '}
            <Link href={`/dashboard/people/${profileError.personId}`} className="underline underline-offset-4">
              {labels.form.completeProfile}
            </Link>
          </p>
        ) : null}

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {labels.form.submitCreate}
          </Button>
          <Button variant="outline" type="button" onClick={handleClose}>
            {labels.form.cancel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
