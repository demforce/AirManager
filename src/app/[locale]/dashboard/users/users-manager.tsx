'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { createUserSchema, updateUserSchema, type CreateUserInput, type UpdateUserInput } from '@/lib/schemas/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Card } from '@/components/ui/card';
import { MailIcon, PencilIcon, ToggleIcon } from '@/components/ui/icons';

type RoleKey = 'ADMIN' | 'STAFF' | 'INSTRUCTOR' | 'PILOT' | 'STUDENT';
const ALL_ROLES: readonly RoleKey[] = ['ADMIN', 'STAFF', 'INSTRUCTOR', 'PILOT', 'STUDENT'];

type PersonRef = { id: string; firstName: string; lastName: string };

export type UserRow = {
  id: string;
  email: string;
  roles: RoleKey[];
  isActive: boolean;
  locale: string;
  passwordSet: boolean;
  person: PersonRef | null;
};

type Labels = {
  newUser: string;
  table: {
    email: string;
    roles: string;
    status: string;
    person: string;
    locale: string;
    actions: string;
    noPerson: string;
    empty: string;
  };
  status: { active: string; inactive: string; pending: string };
  roles: Record<RoleKey, string>;
  locales: { it: string; en: string };
  actions: { edit: string; deactivate: string; activate: string; resendInvite: string };
  form: {
    createTitle: string;
    editTitle: string;
    email: string;
    roles: string;
    locale: string;
    person: string;
    personNone: string;
    isActive: string;
    submitCreate: string;
    submitEdit: string;
    cancel: string;
    rolesRequired: string;
    genericError: string;
    emailConflict: string;
  };
  feedback: { created: string; updated: string; inviteResent: string };
};

type UsersManagerProps = {
  users: UserRow[];
  persons: PersonRef[];
  labels: Labels;
};

type Panel = { mode: 'create' } | { mode: 'edit'; user: UserRow };

function statusLabel(user: UserRow, labels: Labels): string {
  if (!user.isActive) return labels.status.inactive;
  if (!user.passwordSet) return labels.status.pending;
  return labels.status.active;
}

function statusBadgeTone(user: UserRow): StatusTone {
  if (!user.isActive) return 'danger';
  if (!user.passwordSet) return 'warning';
  return 'ok';
}

export function UsersManager({ users, persons, labels }: UsersManagerProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  async function handleToggleActive(user: UserRow): Promise<void> {
    setPendingActionId(user.id);
    const response = await fetch(`/api/v1/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    setPendingActionId(null);
    if (response.ok) {
      setFeedback(labels.feedback.updated);
      router.refresh();
    }
  }

  async function handleResendInvite(user: UserRow): Promise<void> {
    setPendingActionId(user.id);
    const response = await fetch(`/api/v1/users/${user.id}/resend-invite`, { method: 'POST' });
    setPendingActionId(null);
    if (response.ok) {
      setFeedback(labels.feedback.inviteResent);
      router.refresh();
    }
  }

  function handleFormSuccess(message: string): void {
    setPanel(null);
    setFeedback(message);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        {feedback ? (
          <p role="status" data-testid="users-feedback" className="text-sm text-[#346538]">
            {feedback}
          </p>
        ) : (
          <span />
        )}
        <Button
          type="button"
          onClick={() => setPanel({ mode: 'create' })}
        >
          {labels.newUser}
        </Button>
      </div>

      {panel?.mode === 'create' ? (
        <Card className="mt-6 p-6">
          <CreateUserForm persons={persons} labels={labels} onCancel={() => setPanel(null)} onSuccess={handleFormSuccess} />
        </Card>
      ) : null}

      {panel?.mode === 'edit' ? (
        <Card className="mt-6 p-6">
          <EditUserForm
            user={panel.user}
            persons={persons}
            labels={labels}
            onCancel={() => setPanel(null)}
            onSuccess={handleFormSuccess}
          />
        </Card>
      ) : null}

      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">
              <th className="px-5 py-3">{labels.table.email}</th>
              <th className="px-5 py-3">{labels.table.roles}</th>
              <th className="px-5 py-3">{labels.table.status}</th>
              <th className="px-5 py-3">{labels.table.person}</th>
              <th className="px-5 py-3">{labels.table.locale}</th>
              <th className="px-5 py-3">{labels.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-mid-gray">
                  {labels.table.empty}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-hairline last:border-b-0">
                  <td className="px-5 py-3 text-ink">{user.email}</td>
                  <td className="px-5 py-3 text-ink">
                    {user.roles.map((role) => labels.roles[role]).join(', ')}
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill tone={statusBadgeTone(user)}>{statusLabel(user, labels)}</StatusPill>
                  </td>
                  <td className="px-5 py-3 text-ink">
                    {user.person ? `${user.person.firstName} ${user.person.lastName}` : labels.table.noPerson}
                  </td>
                  <td className="px-5 py-3 text-ink">{labels.locales[user.locale === 'en' ? 'en' : 'it']}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="icon"
                        type="button"
                        onClick={() => setPanel({ mode: 'edit', user })}
                        aria-label={labels.actions.edit}
                        title={labels.actions.edit}
                      >
                        <PencilIcon />
                      </Button>
                      <Button variant="outline" size="icon"
                        type="button"
                        disabled={pendingActionId === user.id}
                        onClick={() => void handleToggleActive(user)}
                        aria-label={user.isActive ? labels.actions.deactivate : labels.actions.activate}
                        title={user.isActive ? labels.actions.deactivate : labels.actions.activate}
                      >
                        <ToggleIcon />
                      </Button>
                      {!user.passwordSet ? (
                        <Button variant="outline" size="icon"
                          type="button"
                          disabled={pendingActionId === user.id}
                          onClick={() => void handleResendInvite(user)}
                          aria-label={labels.actions.resendInvite}
                          title={labels.actions.resendInvite}
                        >
                          <MailIcon />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function RoleCheckboxes({
  selected,
  onToggle,
  labels,
}: {
  selected: readonly RoleKey[];
  onToggle: (role: RoleKey, checked: boolean) => void;
  labels: Labels;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-4">
      {ALL_ROLES.map((role) => (
        <label key={role} className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={selected.includes(role)}
            onChange={(event) => onToggle(role, event.target.checked)}
          />
          {labels.roles[role]}
        </label>
      ))}
    </div>
  );
}

function PersonSelect({
  id,
  value,
  onChange,
  persons,
  labels,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  persons: PersonRef[];
  labels: Labels;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-2 w-full rounded-buttons border border-hairline bg-paper px-3 py-2 text-base text-ink outline-none transition-colors focus:border-ink"
    >
      <option value="">{labels.form.personNone}</option>
      {persons.map((person) => (
        <option key={person.id} value={person.id}>
          {person.firstName} {person.lastName}
        </option>
      ))}
    </select>
  );
}

type CreateUserFormProps = {
  persons: PersonRef[];
  labels: Labels;
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

function CreateUserForm({ persons, labels, onCancel, onSuccess }: CreateUserFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleKey[]>([]);
  const [personId, setPersonId] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    // `createUserSchema.locale` has a `.default()`, so the schema's input and
    // output types differ — RHF v7 + resolvers v5 need all three generics.
  } = useForm<z.input<typeof createUserSchema>, unknown, CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', roles: [], locale: 'it', personId: null },
  });

  function toggleRole(role: RoleKey, checked: boolean): void {
    const next = checked ? [...roles, role] : roles.filter((r) => r !== role);
    setRoles(next);
    setValue('roles', next, { shouldValidate: true });
  }

  function changePerson(value: string): void {
    setPersonId(value);
    setValue('personId', value === '' ? null : value);
  }

  async function onSubmit(values: CreateUserInput): Promise<void> {
    setFormError(null);
    const response = await fetch('/api/v1/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = (body as { error?: { code?: string } } | null)?.error?.code;
      setFormError(code === 'CONFLICT' ? labels.form.emailConflict : labels.form.genericError);
      return;
    }

    onSuccess(labels.feedback.created);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5">
      <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        {labels.form.createTitle}
      </h3>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          {labels.form.email}
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="off"
          className="mt-2 w-full"
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-ink">{labels.form.roles}</legend>
        <RoleCheckboxes selected={roles} onToggle={toggleRole} labels={labels} />
        {errors.roles ? <p className="mt-1 text-xs text-ember">{labels.form.rolesRequired}</p> : null}
      </fieldset>

      <div>
        <label htmlFor="locale" className="block text-sm font-medium text-ink">
          {labels.form.locale}
        </label>
        <select
          id="locale"
          className="mt-2 w-full rounded-buttons border border-hairline bg-paper px-3 py-2 text-base text-ink outline-none transition-colors focus:border-ink"
          {...register('locale')}
        >
          <option value="it">{labels.locales.it}</option>
          <option value="en">{labels.locales.en}</option>
        </select>
      </div>

      <div>
        <label htmlFor="personId" className="block text-sm font-medium text-ink">
          {labels.form.person}
        </label>
        <PersonSelect id="personId" value={personId} onChange={changePerson} persons={persons} labels={labels} />
      </div>

      {formError ? (
        <p role="alert" data-testid="user-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <FormActions submitLabel={labels.form.submitCreate} cancelLabel={labels.form.cancel} isSubmitting={isSubmitting} onCancel={onCancel} />
    </form>
  );
}

type EditUserFormProps = {
  user: UserRow;
  persons: PersonRef[];
  labels: Labels;
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

function EditUserForm({ user, persons, labels, onCancel, onSuccess }: EditUserFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleKey[]>(user.roles);
  const [personId, setPersonId] = useState(user.person?.id ?? '');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      roles: user.roles,
      locale: user.locale === 'en' ? 'en' : 'it',
      personId: user.person?.id ?? null,
      isActive: user.isActive,
    },
  });

  function toggleRole(role: RoleKey, checked: boolean): void {
    const next = checked ? [...roles, role] : roles.filter((r) => r !== role);
    setRoles(next);
    setValue('roles', next, { shouldValidate: true });
  }

  function changePerson(value: string): void {
    setPersonId(value);
    setValue('personId', value === '' ? null : value);
  }

  async function onSubmit(values: UpdateUserInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setFormError(labels.form.genericError);
      return;
    }

    onSuccess(labels.feedback.updated);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5">
      <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        {labels.form.editTitle}
      </h3>

      <p className="text-sm text-mid-gray">{user.email}</p>

      <fieldset>
        <legend className="block text-sm font-medium text-ink">{labels.form.roles}</legend>
        <RoleCheckboxes selected={roles} onToggle={toggleRole} labels={labels} />
        {errors.roles ? <p className="mt-1 text-xs text-ember">{labels.form.rolesRequired}</p> : null}
      </fieldset>

      <div>
        <label htmlFor="locale" className="block text-sm font-medium text-ink">
          {labels.form.locale}
        </label>
        <select
          id="locale"
          className="mt-2 w-full rounded-buttons border border-hairline bg-paper px-3 py-2 text-base text-ink outline-none transition-colors focus:border-ink"
          {...register('locale')}
        >
          <option value="it">{labels.locales.it}</option>
          <option value="en">{labels.locales.en}</option>
        </select>
      </div>

      <div>
        <label htmlFor="personId" className="block text-sm font-medium text-ink">
          {labels.form.person}
        </label>
        <PersonSelect id="personId" value={personId} onChange={changePerson} persons={persons} labels={labels} />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" {...register('isActive')} />
        {labels.form.isActive}
      </label>

      {formError ? (
        <p role="alert" data-testid="user-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <FormActions submitLabel={labels.form.submitEdit} cancelLabel={labels.form.cancel} isSubmitting={isSubmitting} onCancel={onCancel} />
    </form>
  );
}

function FormActions({
  submitLabel,
  cancelLabel,
  isSubmitting,
  onCancel,
}: {
  submitLabel: string;
  cancelLabel: string;
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-3">
      <Button
        type="submit"
        disabled={isSubmitting}
      >
        {submitLabel}
      </Button>
      <Button variant="outline"
        type="button"
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
    </div>
  );
}
