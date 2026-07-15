'use client';

/**
 * Pilots table console (story 12.6, AC 2/3) — port of
 * `docs/design-reference/airops/src/People.jsx#PilotsView` onto real,
 * paginated/searchable data, same shell idiom as `fleet-console.tsx`
 * (`.card` + `.card-head` search/toggle, `.students`/`.student-row` table).
 *
 * "Ruolo" badges (AC 2): the prototype's `ROLE_IT` dictionary names a
 * `Student`/`Member`/`Renter`/`Instructor`/`Visitor` ladder that does not
 * exist in this domain — only THREE independent profiles do
 * (pilot/student/instructor, `PersonListItem['profiles']`, D13). "Renter"/
 * "Visitor" are explicitly out (AC 2); "Socio"/"Member" has no domain
 * counterpart either (no such profile/column anywhere) — the badges shown
 * here are the same three activatable profiles the rest of the app already
 * knows, reusing `PeoplePage.profilesPanel`'s own labels, ALL active ones
 * shown together (never a single "role" pick, per AC 2's literal
 * instruction).
 */
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Role } from '@/generated/prisma/client';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ExportMenu } from '@/components/ui/export-menu';
import { Field, Input, Select } from '@/components/ui/field';
import { Icon } from '@/components/ui/icons';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatCents, parseCents } from '@/lib/money';
import { formatDateOnly } from '@/lib/time';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';
import { PilotEditor, type PilotEditorLabels } from './pilot-editor';
import { PilotProfile, type PilotProfileLabels } from './pilot-profile';

export type PilotUser = { id: string; email: string; roles: Role[]; isActive: boolean; passwordSet: boolean } | null;

export type PilotRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  fiscalCode: string | null;
  archivedAt: string | null;
  profiles: { pilot: boolean; student: boolean; instructor: boolean };
  balanceCents: number;
  lastFlightDate: string | null;
  user: PilotUser;
};

export type PilotsConsoleLabels = {
  cardTitle: string;
  searchPlaceholder: string;
  includeArchivedLabel: string;
  empty: string;
  newPilot: string;
  exportLabel: string;
  exportXls: string;
  pagination: { prev: string; next: string };
  table: { name: string; email: string; balance: string; lastFlight: string; role: string; status: string; actions: string; noValue: string };
  role: { pilot: string; student: string; instructor: string };
  profileBadge: { pilot: string; student: string; instructor: string };
  status: { active: string; suspended: string; none: string };
  actions: { edit: string; topUp: string; suspend: string; reactivate: string };
  topUp: {
    title: string;
    amount: string;
    paymentMethod: string;
    paymentMethods: { cash: string; bankTransfer: string; pos: string };
    effectiveDate: string;
    description: string;
    submit: string;
    cancel: string;
    invalidAmount: string;
    requiredField: string;
    genericError: string;
  };
  editor: PilotEditorLabels;
  /** `role`/`status` are injected from this same object's own top-level `role`/`status` fields at render time — not duplicated here. */
  profile: Omit<PilotProfileLabels, 'role' | 'status'>;
  toast: {
    created: string;
    updated: string;
    archived: string;
    unarchived: string;
    topUpRecorded: string;
    suspended: string;
    reactivated: string;
    userCreated: string;
    inviteResent: string;
    genericError: string;
    lastAdminError: string;
  };
};

type PilotsConsoleProps = {
  items: PilotRow[];
  page: number;
  totalPages: number;
  initialQuery: string;
  initialIncludeArchived: boolean;
  canManagePeople: boolean;
  canManageFinance: boolean;
  canManageUsers: boolean;
  exportHref: string;
  locale: 'it' | 'en';
  labels: PilotsConsoleLabels;
};

/** Same debounce-before-navigating idiom as `fleet-console.tsx`/`people-manager.tsx`. */
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

type EditorTarget = { mode: 'new' } | { mode: 'edit'; pilot: PilotRow };
type SuspendConfirm = { personId: string; userId: string; nextActive: boolean };

function userStatusTone(user: PilotUser): BadgeTone {
  if (!user) return '';
  return user.isActive ? 'ok' : 'bad';
}

export function PilotsConsole({
  items,
  page,
  totalPages,
  initialQuery,
  initialIncludeArchived,
  canManagePeople,
  canManageFinance,
  canManageUsers,
  exportHref,
  locale,
  labels,
}: PilotsConsoleProps) {
  const router = useRouter();
  const toast = useToast();
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [includeArchived, setIncludeArchived] = useState(initialIncludeArchived);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [profileTarget, setProfileTarget] = useState<PilotRow | null>(null);
  const [topUpTarget, setTopUpTarget] = useState<PilotRow | null>(null);
  const [suspendConfirm, setSuspendConfirm] = useState<SuspendConfirm | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  function navigate(next: { q: string; includeArchived: boolean }): void {
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.includeArchived) params.set('includeArchived', 'true');
    const search = params.toString();
    router.push(`/dashboard/pilots${search ? `?${search}` : ''}`);
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

  function pageHref(targetPage: number) {
    return {
      pathname: '/dashboard/pilots' as const,
      query: { page: targetPage, ...(queryInput ? { q: queryInput } : {}), ...(includeArchived ? { includeArchived: 'true' } : {}) },
    };
  }

  function roleBadges(profiles: PilotRow['profiles']): Array<{ key: string; label: string; tone: BadgeTone }> {
    const badges: Array<{ key: string; label: string; tone: BadgeTone }> = [];
    if (profiles.pilot) badges.push({ key: 'pilot', label: labels.role.pilot, tone: 'info' });
    if (profiles.student) badges.push({ key: 'student', label: labels.role.student, tone: 'ok' });
    if (profiles.instructor) badges.push({ key: 'instructor', label: labels.role.instructor, tone: 'warn' });
    return badges;
  }

  function profileSubBadges(profiles: PilotRow['profiles']): Array<{ key: string; label: string }> {
    const badges: Array<{ key: string; label: string }> = [];
    if (profiles.pilot) badges.push({ key: 'pilot', label: labels.profileBadge.pilot });
    if (profiles.student) badges.push({ key: 'student', label: labels.profileBadge.student });
    if (profiles.instructor) badges.push({ key: 'instructor', label: labels.profileBadge.instructor });
    return badges;
  }

  function statusLabel(user: PilotUser): string {
    if (!user) return labels.status.none;
    return user.isActive ? labels.status.active : labels.status.suspended;
  }

  async function handleSuspendConfirm(): Promise<void> {
    if (!suspendConfirm) return;
    setPendingUserId(suspendConfirm.userId);
    const response = await fetch(`/api/v1/users/${suspendConfirm.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: suspendConfirm.nextActive }),
    });
    setPendingUserId(null);
    setSuspendConfirm(null);

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = (body as { error?: { code?: string } } | null)?.error?.code;
      toast.show(code === 'CONFLICT' ? labels.toast.lastAdminError : labels.toast.genericError, 'bad');
      return;
    }

    toast.show(suspendConfirm.nextActive ? labels.toast.reactivated : labels.toast.suspended, 'ok');
    router.refresh();
  }

  const cols = 'minmax(150px,1.4fr) minmax(160px,1.4fr) 100px 110px minmax(160px,1.2fr) 120px minmax(200px,1.3fr)';

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">{labels.cardTitle}</div>
          <div className="spacer" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={includeArchived} onChange={(event) => handleIncludeArchivedChange(event.target.checked)} />
            {labels.includeArchivedLabel}
          </label>
          <div className="search" style={{ width: 260 }}>
            <Icon.search />
            <input
              className="bare-input"
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchPlaceholder}
              value={queryInput}
              onChange={(event) => handleQueryChange(event.target.value)}
              data-testid="pilots-search"
            />
          </div>
          <ExportMenu label={labels.exportLabel} xlsLabel={labels.exportXls} xlsHref={exportHref} pdfLabel="" />
          <button type="button" className="btn primary" onClick={() => setEditorTarget({ mode: 'new' })} data-testid="pilots-new-button">
            <Icon.plus /> {labels.newPilot}
          </button>
        </div>

        {items.length === 0 ? (
          <p className="card-body" data-testid="pilots-empty">
            {labels.empty}
          </p>
        ) : (
          <div className="students">
            <div className="student-row header" style={{ gridTemplateColumns: cols }}>
              <div>{labels.table.name}</div>
              <div>{labels.table.email}</div>
              <div>{labels.table.balance}</div>
              <div>{labels.table.lastFlight}</div>
              <div>{labels.table.role}</div>
              <div>{labels.table.status}</div>
              <div>{labels.table.actions}</div>
            </div>
            {items.map((pilot) => {
              const badges = profileSubBadges(pilot.profiles);
              const roles = roleBadges(pilot.profiles);
              const hasUser = pilot.user !== null;
              return (
                <div key={pilot.id} className="student-row" data-testid={`pilot-row-${pilot.id}`} style={{ gridTemplateColumns: cols }}>
                  <div>
                    <div
                      className="student-name"
                      style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-strong)', textUnderlineOffset: 3 }}
                      onClick={() => setProfileTarget(pilot)}
                      data-testid={`pilot-name-${pilot.id}`}
                    >
                      {pilot.lastName} {pilot.firstName}
                    </div>
                    {badges.length > 0 ? (
                      <div className="student-sub" data-testid={`person-profile-badges-${pilot.id}`}>
                        {badges.map((badge) => badge.label).join(' · ')}
                      </div>
                    ) : null}
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pilot.email ?? labels.table.noValue}
                  </div>
                  <div className="mono num" style={{ fontWeight: 600, color: pilot.balanceCents < 0 ? 'var(--bad)' : 'var(--ink)' }}>
                    {formatCents(pilot.balanceCents, locale)}
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                    {pilot.lastFlightDate ? formatDateOnly(pilot.lastFlightDate, locale) : labels.table.noValue}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {roles.length === 0 ? labels.table.noValue : roles.map((role) => <Badge key={role.key} tone={role.tone}>{role.label}</Badge>)}
                  </div>
                  <div>
                    <Badge tone={userStatusTone(pilot.user)} dot>
                      {statusLabel(pilot.user)}
                    </Badge>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {canManagePeople ? (
                      <button
                        type="button"
                        className="btn mini"
                        onClick={() => setEditorTarget({ mode: 'edit', pilot })}
                        data-testid={`pilot-edit-${pilot.id}`}
                      >
                        {labels.actions.edit}
                      </button>
                    ) : null}
                    {canManageFinance ? (
                      <button type="button" className="btn mini" onClick={() => setTopUpTarget(pilot)} data-testid={`pilot-topup-${pilot.id}`}>
                        {labels.actions.topUp}
                      </button>
                    ) : null}
                    {canManageUsers && hasUser ? (
                      suspendConfirm?.personId === pilot.id ? (
                        <>
                          <button
                            type="button"
                            className="btn mini bad"
                            disabled={pendingUserId === pilot.user!.id}
                            onClick={() => void handleSuspendConfirm()}
                            data-testid={`pilot-suspend-confirm-${pilot.id}`}
                          >
                            ✓
                          </button>
                          <button type="button" className="btn mini" onClick={() => setSuspendConfirm(null)}>
                            ✕
                          </button>
                        </>
                      ) : pilot.user!.isActive ? (
                        <button
                          type="button"
                          className="btn mini bad"
                          onClick={() => setSuspendConfirm({ personId: pilot.id, userId: pilot.user!.id, nextActive: false })}
                          data-testid={`pilot-suspend-toggle-${pilot.id}`}
                        >
                          {labels.actions.suspend}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn mini ok"
                          onClick={() => setSuspendConfirm({ personId: pilot.id, userId: pilot.user!.id, nextActive: true })}
                          data-testid={`pilot-reactivate-toggle-${pilot.id}`}
                        >
                          {labels.actions.reactivate}
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              data-testid="pilots-page-prev"
              className={`btn ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
            >
              {labels.pagination.prev}
            </Link>
            <span className="mono" data-testid="pilots-pagination-status">
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(page + 1)}
              locale={locale as AppLocale}
              aria-disabled={page >= totalPages}
              data-testid="pilots-page-next"
              className={`btn ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
            >
              {labels.pagination.next}
            </Link>
          </div>
        ) : null}
      </div>

      <PilotEditor
        // Distinct key NAMESPACE from `PilotProfile` below (`editor-`/`profile-`
        // prefixes) — React validates key uniqueness across ALL keyed
        // siblings at this level regardless of element type, so both
        // components resting on a bare `'closed'` at once would collide.
        key={editorTarget === null ? 'editor-closed' : editorTarget.mode === 'new' ? 'editor-new' : `editor-${editorTarget.pilot.id}`}
        target={editorTarget}
        onClose={() => setEditorTarget(null)}
        onMutated={() => router.refresh()}
        canManageUsers={canManageUsers}
        locale={locale}
        labels={labels.editor}
        toastLabels={labels.toast}
      />

      <PilotProfile
        key={profileTarget === null ? 'profile-closed' : `profile-${profileTarget.id}`}
        pilot={profileTarget}
        onClose={() => setProfileTarget(null)}
        onEdit={(pilot) => setEditorTarget({ mode: 'edit', pilot })}
        locale={locale}
        labels={{ ...labels.profile, role: labels.role, status: labels.status }}
      />

      <TopUpSlideOver
        pilot={topUpTarget}
        onClose={() => setTopUpTarget(null)}
        onMutated={() => router.refresh()}
        labels={labels.topUp}
        closeLabel={labels.editor.closeLabel}
        successMessage={labels.toast.topUpRecorded}
      />
    </>
  );
}

// --- "Registra" top-up slide-over -------------------------------------------

const topUpFormSchema = z
  .object({
    amount: z.string().trim().min(1),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'POS']),
    effectiveDate: z.string().trim().min(1),
    description: z.string(),
  })
  .refine(
    (values) => {
      try {
        const cents = parseCents(values.amount);
        return cents > 0 && cents <= 2_147_483_647;
      } catch {
        return false;
      }
    },
    { message: 'invalidAmount', path: ['amount'] },
  );

type TopUpFormValues = z.infer<typeof topUpFormSchema>;

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

type TopUpSlideOverProps = {
  pilot: PilotRow | null;
  onClose: () => void;
  onMutated: () => void;
  labels: PilotsConsoleLabels['topUp'];
  closeLabel: string;
  successMessage: string;
};

/** "Registra" row action (AC 3, `finance.manage`) — same top-up endpoint/Idempotency-Key flow as the legacy `AccountPanel`'s `TopUpForm`. */
function TopUpSlideOver({ pilot, onClose, onMutated, labels, closeLabel, successMessage }: TopUpSlideOverProps) {
  const toast = useToast();
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TopUpFormValues>({
    resolver: zodResolver(topUpFormSchema),
    defaultValues: { amount: '', paymentMethod: 'CASH', effectiveDate: todayDateOnly(), description: '' },
  });

  async function onSubmit(values: TopUpFormValues): Promise<void> {
    if (!pilot) return;
    setFormError(null);
    const amountCents = parseCents(values.amount);

    let response: Response;
    try {
      response = await fetch(`/api/v1/people/${pilot.id}/account/top-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        body: JSON.stringify({
          amountCents,
          paymentMethod: values.paymentMethod,
          effectiveDate: values.effectiveDate,
          description: values.description.trim() === '' ? null : values.description.trim(),
        }),
      });
    } catch {
      setFormError(labels.genericError);
      return;
    }
    regenerateIdempotencyKey();

    if (!response.ok) {
      setFormError(labels.genericError);
      return;
    }

    reset({ amount: '', paymentMethod: 'CASH', effectiveDate: todayDateOnly(), description: '' });
    toast.show(successMessage, 'ok');
    onClose();
    onMutated();
  }

  return (
    <SlideOver open={pilot !== null} onClose={onClose} title={labels.title} subtitle={pilot ? `${pilot.lastName} ${pilot.firstName}` : ''} closeLabel={closeLabel}>
      {pilot ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="topup-form">
          <div className="form-grid">
            <Field label={labels.amount}>
              <Input inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(errors.amount)} {...register('amount')} />
            </Field>
            <Field label={labels.paymentMethod}>
              <Select {...register('paymentMethod')}>
                <option value="CASH">{labels.paymentMethods.cash}</option>
                <option value="BANK_TRANSFER">{labels.paymentMethods.bankTransfer}</option>
                <option value="POS">{labels.paymentMethods.pos}</option>
              </Select>
            </Field>
            <Field label={labels.effectiveDate}>
              <Input type="date" aria-invalid={Boolean(errors.effectiveDate)} {...register('effectiveDate')} />
            </Field>
            <Field label={labels.description} wide>
              <Input {...register('description')} />
            </Field>
          </div>
          {formError ? (
            <p role="alert" data-testid="topup-form-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
              {formError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" className="btn" onClick={onClose}>
              {labels.cancel}
            </button>
            <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="topup-submit">
              {labels.submit}
            </button>
          </div>
        </form>
      ) : null}
    </SlideOver>
  );
}
