'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { createUserSchema, updateUserSchema, type CreateUserInput, type UpdateUserInput } from '@/lib/schemas/users';

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

function statusBadgeClasses(user: UserRow): string {
  if (!user.isActive) return 'bg-[#FDEBEC] text-[#9F2F2D]';
  if (!user.passwordSet) return 'bg-[#FBF3DB] text-[#956400]';
  return 'bg-[#EDF3EC] text-[#346538]';
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
        <button
          type="button"
          onClick={() => setPanel({ mode: 'create' })}
          className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98]"
        >
          {labels.newUser}
        </button>
      </div>

      {panel?.mode === 'create' ? (
        <div className="mt-6 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <CreateUserForm persons={persons} labels={labels} onCancel={() => setPanel(null)} onSuccess={handleFormSuccess} />
        </div>
      ) : null}

      {panel?.mode === 'edit' ? (
        <div className="mt-6 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <EditUserForm
            user={panel.user}
            persons={persons}
            labels={labels}
            onCancel={() => setPanel(null)}
            onSuccess={handleFormSuccess}
          />
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-[12px] border border-[#EAEAEA] bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#EAEAEA] text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">
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
                <td colSpan={6} className="px-5 py-8 text-center text-[#787774]">
                  {labels.table.empty}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-[#EAEAEA] last:border-b-0">
                  <td className="px-5 py-3 text-[#111111]">{user.email}</td>
                  <td className="px-5 py-3 text-[#2F3437]">
                    {user.roles.map((role) => labels.roles[role]).join(', ')}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] ${statusBadgeClasses(user)}`}
                    >
                      {statusLabel(user, labels)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[#2F3437]">
                    {user.person ? `${user.person.firstName} ${user.person.lastName}` : labels.table.noPerson}
                  </td>
                  <td className="px-5 py-3 text-[#2F3437]">{labels.locales[user.locale === 'en' ? 'en' : 'it']}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPanel({ mode: 'edit', user })}
                        className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
                      >
                        {labels.actions.edit}
                      </button>
                      <button
                        type="button"
                        disabled={pendingActionId === user.id}
                        onClick={() => void handleToggleActive(user)}
                        className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3] disabled:opacity-50"
                      >
                        {user.isActive ? labels.actions.deactivate : labels.actions.activate}
                      </button>
                      {!user.passwordSet ? (
                        <button
                          type="button"
                          disabled={pendingActionId === user.id}
                          onClick={() => void handleResendInvite(user)}
                          className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3] disabled:opacity-50"
                        >
                          {labels.actions.resendInvite}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
        <label key={role} className="flex items-center gap-2 text-sm text-[#2F3437]">
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
      className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
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
      <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
        {labels.form.createTitle}
      </h3>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-[#2F3437]">
          {labels.form.email}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="off"
          className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-[#2F3437]">{labels.form.roles}</legend>
        <RoleCheckboxes selected={roles} onToggle={toggleRole} labels={labels} />
        {errors.roles ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.form.rolesRequired}</p> : null}
      </fieldset>

      <div>
        <label htmlFor="locale" className="block text-sm font-medium text-[#2F3437]">
          {labels.form.locale}
        </label>
        <select
          id="locale"
          className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          {...register('locale')}
        >
          <option value="it">{labels.locales.it}</option>
          <option value="en">{labels.locales.en}</option>
        </select>
      </div>

      <div>
        <label htmlFor="personId" className="block text-sm font-medium text-[#2F3437]">
          {labels.form.person}
        </label>
        <PersonSelect id="personId" value={personId} onChange={changePerson} persons={persons} labels={labels} />
      </div>

      {formError ? (
        <p role="alert" data-testid="user-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
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
      <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
        {labels.form.editTitle}
      </h3>

      <p className="text-sm text-[#787774]">{user.email}</p>

      <fieldset>
        <legend className="block text-sm font-medium text-[#2F3437]">{labels.form.roles}</legend>
        <RoleCheckboxes selected={roles} onToggle={toggleRole} labels={labels} />
        {errors.roles ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.form.rolesRequired}</p> : null}
      </fieldset>

      <div>
        <label htmlFor="locale" className="block text-sm font-medium text-[#2F3437]">
          {labels.form.locale}
        </label>
        <select
          id="locale"
          className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          {...register('locale')}
        >
          <option value="it">{labels.locales.it}</option>
          <option value="en">{labels.locales.en}</option>
        </select>
      </div>

      <div>
        <label htmlFor="personId" className="block text-sm font-medium text-[#2F3437]">
          {labels.form.person}
        </label>
        <PersonSelect id="personId" value={personId} onChange={changePerson} persons={persons} labels={labels} />
      </div>

      <label className="flex items-center gap-2 text-sm text-[#2F3437]">
        <input type="checkbox" {...register('isActive')} />
        {labels.form.isActive}
      </label>

      {formError ? (
        <p role="alert" data-testid="user-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
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
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
      >
        {cancelLabel}
      </button>
    </div>
  );
}
