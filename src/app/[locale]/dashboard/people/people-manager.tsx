'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useRef, useState } from 'react';
import { PersonFormDialog } from './person-form-dialog';
import type { ProfilesPanelLabels } from './profiles-panel';
import { DataTable, TruncatedCell } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { ArchiveIcon, PencilIcon, RestoreIcon } from '@/components/ui/icons';

/** Mirrors `users.service.ts`'s `Role` (kept as a local string union — no server-only Prisma import in a client component). */
export type RoleKey = 'ADMIN' | 'STAFF' | 'INSTRUCTOR' | 'PILOT' | 'STUDENT';

/** App-access summary for the row's linked `User` (story TD-7, AC 2) — `null` when the person has no account. */
export type PersonAccessRow = {
  userId: string;
  isActive: boolean;
  passwordSet: boolean;
  roles: RoleKey[];
  locale: string;
};

export type PersonRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  fiscalCode: string | null;
  /** ISO 8601 string (server `Date` already serialized) or `null` if active. */
  archivedAt: string | null;
  /** Active-profile flags (story 2.2, AC 1) — rendered as P/A/I badges in the list. */
  profiles: { pilot: boolean; student: boolean; instructor: boolean };
  access: PersonAccessRow | null;
};

/** Access-section labels (story TD-7, AC 3) — migrated from the retired `UsersPage.*` under `PeoplePage.form.access.*`. */
export type PersonAccessLabels = {
  heading: string;
  toggle: string;
  rolesLabel: string;
  rolesRequired: string;
  roles: Record<RoleKey, string>;
  localeLabel: string;
  locales: { it: string; en: string };
  emailRequired: string;
  emailConflict: string;
  status: { active: string; invited: string; deactivated: string };
  resendInvite: string;
  inviteResent: string;
  /** Partial-failure message (AC 5) — the person/profiles were saved, the access step alone failed. */
  stepFailed: string;
};

/** Exported so `person-form-dialog.tsx` (story TD-7 — evolved from `person-create-dialog.tsx`, story 12.3 AC 4) can share the exact same label shape — one source of truth passed down from `page.tsx`. */
export type Labels = {
  newPerson: string;
  searchPlaceholder: string;
  includeArchivedLabel: string;
  table: { name: string; email: string; phone: string; status: string; profiles: string; access: string; actions: string; noValue: string; empty: string };
  status: { active: string; archived: string };
  actions: {
    edit: string;
    archive: string;
    unarchive: string;
    confirmArchive: string;
    confirmUnarchive: string;
    confirmYes: string;
    confirmCancel: string;
  };
  profilesPanel: ProfilesPanelLabels;
  form: {
    createTitle: string;
    editTitle: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    fiscalCode: string;
    submitCreate: string;
    submitEdit: string;
    cancel: string;
    requiredField: string;
    genericError: string;
    conflictError: string;
    /** Shown when the person was saved but a profile step failed — the person EXISTS, no rollback (AC 5). */
    profileError: string;
    /** Link text to the person's scheda, shown both on full success and on the partial (`profileError`) case. */
    completeProfile: string;
    access: PersonAccessLabels;
  };
  feedback: { created: string; updated: string; archived: string; unarchived: string };
};

type PeopleManagerProps = {
  people: PersonRow[];
  initialQuery: string;
  initialIncludeArchived: boolean;
  /** Story 12.6 (AC 3) — the command palette's "Nuova persona" deep-link (`?new=1`): opens the create dialog from the very first render. */
  initialCreateOpen?: boolean;
  /** Story TD-7 (AC 3) — whether the actor has `users.manage`: gates the form's "Accesso all'app" section client-side (the API is the real guardian, AD-5). */
  canManageAccess: boolean;
  /** Story 10.1 (AC 5) — the SAME `q`/`includeArchived` this page was fetched with, `?format=xlsx` appended. */
  exportHref: string;
  exportLabel: string;
  labels: Labels;
};

/**
 * Story TD-7 (AC 3) — the unified `PersonFormDialog` replaces BOTH the old
 * create dialog (12.3) and this manager's inline 'edit'/'profiles' panels:
 * one state slot drives create OR edit, `null` means closed.
 */
type FormState = { mode: 'create' } | { mode: 'edit'; person: PersonRow };
type ConfirmState = { id: string; type: 'archive' | 'unarchive' };

function statusLabel(person: PersonRow, labels: Labels): string {
  return person.archivedAt ? labels.status.archived : labels.status.active;
}

function statusBadgeTone(person: PersonRow): StatusTone {
  return person.archivedAt ? 'warning' : 'ok';
}

/** Story TD-7 (AC 2) — the "Accesso" column's tri-state StatusPill: same active/invited(pending password)/deactivated precedence as the retired `UsersManager`. */
function accessLabel(access: PersonAccessRow | null, labels: Labels): string {
  if (!access) return labels.table.noValue;
  if (!access.isActive) return labels.form.access.status.deactivated;
  if (!access.passwordSet) return labels.form.access.status.invited;
  return labels.form.access.status.active;
}

function accessBadgeTone(access: PersonAccessRow | null): StatusTone {
  if (!access) return 'ok'; // unused when access is null — the cell renders plain text instead
  if (!access.isActive) return 'danger';
  if (!access.passwordSet) return 'warning';
  return 'ok';
}

/**
 * Debounces `q` before it hits the URL (and therefore the server-side
 * search) — otherwise every keystroke would trigger a full page navigation.
 */
function useDebouncedCallback(callback: (value: string) => void, delayMs: number): (value: string) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callback(value), delayMs);
  };
}

export function PeopleManager({
  people,
  initialQuery,
  initialIncludeArchived,
  initialCreateOpen,
  canManageAccess,
  exportHref,
  exportLabel,
  labels,
}: PeopleManagerProps) {
  const router = useRouter();
  // Story TD-7 (AC 3) — one dialog for create AND edit. Story 12.6 (AC 3):
  // `initialCreateOpen` (the command palette's `?new=1` deep-link) seeds it
  // open from the very first render — a lazy initializer, not an effect,
  // since this only ever matters at mount.
  const [formState, setFormState] = useState<FormState | null>(() => (initialCreateOpen ? { mode: 'create' } : null));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ConfirmState | null>(null);
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [includeArchived, setIncludeArchived] = useState(initialIncludeArchived);

  // Review 12.6, 126-F1: same-page `?new=1` never remounts this component,
  // so the lazy initializer misses the transition. Adjust-state-during-
  // render opens the dialog on the false->true edge (no setState in
  // effects, per the React compiler lint); the effect only strips the param
  // (`navigate` never emits `new`) so the deep-link stays repeatable and
  // the URL clean.
  const [prevCreateOpen, setPrevCreateOpen] = useState(() => Boolean(initialCreateOpen));
  if (Boolean(initialCreateOpen) !== prevCreateOpen) {
    setPrevCreateOpen(Boolean(initialCreateOpen));
    if (initialCreateOpen) setFormState({ mode: 'create' });
  }
  useEffect(() => {
    if (!initialCreateOpen) return;
    navigate({ q: queryInput, includeArchived }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- transition-triggered: only the prop matters
  }, [initialCreateOpen]);
  // Story 12.3 (AC 4) — "Completa la scheda" link shown alongside `feedback`
  // after a successful creation; cleared by every OTHER feedback-setting
  // action below so it never lingers past its own creation.
  const [completeProfileHref, setCompleteProfileHref] = useState<string | null>(null);

  function navigate(next: { q: string; includeArchived: boolean }, options?: { replace?: boolean }): void {
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.includeArchived) params.set('includeArchived', 'true');
    const search = params.toString();
    const href = `/dashboard/people${search ? `?${search}` : ''}`;
    if (options?.replace) router.replace(href);
    else router.push(href);
  }

  const debouncedSearch = useDebouncedCallback((value: string) => {
    navigate({ q: value, includeArchived });
  }, 400);

  function handleQueryChange(value: string): void {
    setQueryInput(value);
    debouncedSearch(value);
  }

  function handleIncludeArchivedChange(checked: boolean): void {
    setIncludeArchived(checked);
    navigate({ q: queryInput, includeArchived: checked });
  }

  async function handleArchiveToggle(person: PersonRow, type: 'archive' | 'unarchive'): Promise<void> {
    setPendingActionId(person.id);
    const response = await fetch(`/api/v1/people/${person.id}/${type}`, { method: 'POST' });
    setPendingActionId(null);
    setConfirming(null);
    setCompleteProfileHref(null);
    if (response.ok) {
      setFeedback(type === 'archive' ? labels.feedback.archived : labels.feedback.unarchived);
      router.refresh();
    } else {
      // e.g. 409 from a concurrent state change: surface it instead of
      // leaving the row untouched with no explanation (review 2.1 F1).
      setFeedback(labels.form.genericError);
      router.refresh();
    }
  }

  /**
   * Story TD-7 (AC 3/5) — the unified dialog's single success callback for
   * BOTH create and edit. `showCompleteProfileLink` keeps the exact
   * pre-existing UX split (story 12.3, AC 4): only a fresh creation gets the
   * "Completa la scheda" link, an edit-save does not.
   */
  function handleFormSuccess(personId: string, message: string, showCompleteProfileLink: boolean): void {
    setFormState(null);
    setFeedback(message);
    setCompleteProfileHref(showCompleteProfileLink ? `/dashboard/people/${personId}` : null);
    router.refresh();
  }

  const columns: ColumnDef<PersonRow, unknown>[] = [
    {
      id: 'name',
      header: labels.table.name,
      cell: ({ row }) => {
        const name = `${row.original.lastName} ${row.original.firstName}`;
        return (
          // Story 2.3: the name is the entry point into the scheda persona.
          <Link
            href={`/dashboard/people/${row.original.id}`}
            title={name}
            className="block max-w-[220px] truncate font-medium text-ink underline-offset-4 hover:underline"
          >
            {name}
          </Link>
        );
      },
    },
    {
      id: 'email',
      header: labels.table.email,
      cell: ({ row }) =>
        row.original.email ? <TruncatedCell value={row.original.email} className="max-w-[220px]" /> : labels.table.noValue,
    },
    {
      id: 'phone',
      header: labels.table.phone,
      cell: ({ row }) => row.original.phone ?? labels.table.noValue,
    },
    {
      id: 'status',
      header: labels.table.status,
      cell: ({ row }) => <StatusPill tone={statusBadgeTone(row.original)}>{statusLabel(row.original, labels)}</StatusPill>,
    },
    {
      id: 'profiles',
      header: labels.table.profiles,
      cell: ({ row }) => {
        const { profiles } = row.original;
        const badges: Array<{ key: string; label: string; title: string }> = [
          ...(profiles.pilot ? [{ key: 'pilot', label: labels.profilesPanel.badges.pilot, title: labels.profilesPanel.pilot.title }] : []),
          ...(profiles.student
            ? [{ key: 'student', label: labels.profilesPanel.badges.student, title: labels.profilesPanel.student.title }]
            : []),
          ...(profiles.instructor
            ? [{ key: 'instructor', label: labels.profilesPanel.badges.instructor, title: labels.profilesPanel.instructor.title }]
            : []),
        ];
        if (badges.length === 0) {
          return labels.table.noValue;
        }
        return (
          <div className="flex gap-1.5" data-testid={`person-profile-badges-${row.original.id}`}>
            {badges.map((badge) => (
              <span
                key={badge.key}
                title={badge.title}
                className="rounded-full bg-[#E1F3FE] px-2.5 py-1 text-xs font-medium uppercase tracking-[0.05em] text-[#1F6C9F]"
              >
                {badge.label}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: 'access',
      header: labels.table.access,
      cell: ({ row }) => {
        const { access } = row.original;
        if (!access) return labels.table.noValue;
        return <StatusPill tone={accessBadgeTone(access)}>{accessLabel(access, labels)}</StatusPill>;
      },
    },
    {
      id: 'actions',
      header: labels.table.actions,
      cell: ({ row }) => {
        const person = row.original;
        const isArchived = person.archivedAt !== null;
        const actionType: 'archive' | 'unarchive' = isArchived ? 'unarchive' : 'archive';

        if (confirming?.id === person.id) {
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-mid-gray">
                {isArchived ? labels.actions.confirmUnarchive : labels.actions.confirmArchive}
              </span>
              <Button size="sm"
                type="button"
                disabled={pendingActionId === person.id}
                onClick={() => void handleArchiveToggle(person, actionType)}
              >
                {labels.actions.confirmYes}
              </Button>
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setConfirming(null)}
              >
                {labels.actions.confirmCancel}
              </Button>
            </div>
          );
        }

        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="icon"
              type="button"
              onClick={() => setFormState({ mode: 'edit', person })}
              aria-label={labels.actions.edit}
              title={labels.actions.edit}
            >
              <PencilIcon />
            </Button>
            <Button variant="outline" size="icon"
              type="button"
              disabled={pendingActionId === person.id}
              onClick={() => setConfirming({ id: person.id, type: actionType })}
              aria-label={isArchived ? labels.actions.unarchive : labels.actions.archive}
              title={isArchived ? labels.actions.unarchive : labels.actions.archive}
            >
              {isArchived ? <RestoreIcon /> : <ArchiveIcon />}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {feedback ? (
          <p role="status" data-testid="people-feedback" className="text-sm text-[#346538]">
            {feedback}
            {completeProfileHref ? (
              <>
                {' '}
                <Link href={completeProfileHref} className="underline underline-offset-4">
                  {labels.form.completeProfile}
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <ExportButton href={exportHref} label={exportLabel} testId="people-export-button" />
          <Button
            type="button"
            onClick={() => setFormState({ mode: 'create' })}
          >
            {labels.newPerson}
          </Button>
        </div>
      </div>

      <PersonFormDialog
        // Story TD-7 (AC 3) — a fresh key per distinct target (create, or a
        // specific person's edit) forces a remount so internal form state
        // never leaks between targets — same latent stale-form bug class as
        // the retired `EditPersonForm`'s `key={panel.person.id}` (review 2.4
        // F1).
        key={formState?.mode === 'edit' ? formState.person.id : 'create'}
        open={formState !== null}
        mode={formState?.mode ?? 'create'}
        person={formState?.mode === 'edit' ? formState.person : null}
        canManageAccess={canManageAccess}
        labels={labels}
        onClose={() => setFormState(null)}
        onSuccess={handleFormSuccess}
      />

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Input
          type="search"
          value={queryInput}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="w-full max-w-xs"
        />
        <Switch
          label={labels.includeArchivedLabel}
          checked={includeArchived}
          onChange={(event) => handleIncludeArchivedChange(event.target.checked)}
        />
      </div>

      <div className="mt-6">
        <DataTable columns={columns} data={people} emptyMessage={labels.table.empty} />
      </div>
    </div>
  );
}

