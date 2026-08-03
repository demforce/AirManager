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
import { useCallback, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Role } from '@/generated/prisma/client';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { ExportMenu } from '@/components/ui/export-menu';
import { Field, Input, Select } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { Icon } from '@/components/ui/icons';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { avatarColorFor, initialsOf, pilotRowFlag, type BlockingDocument, type PilotRowFlag } from '@/lib/mobile-registries';
import { formatCents, parseCents } from '@/lib/money';
import { formatDateOnly } from '@/lib/time';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';
import { PilotEditor, type PilotEditorLabels } from './pilot-editor';

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
  status: { active: string; suspended: string; none: string };
  actions: { edit: string; topUp: string; suspend: string; reactivate: string };
  /** Story 15.5 — the phone face only (row flag, detail sheet, its actions). */
  mobile: {
    openDetail: string;
    close: string;
    openProfile: string;
    /** Carry a `{doc}`/`{days}` placeholder filled CLIENT-side — read with `t.raw`. */
    flagExpired: string;
    flagExpiring: string;
    confirmSuspend: string;
    confirmReactivate: string;
    dismiss: string;
    sheet: { email: string; phone: string; balance: string; lastFlight: string; profiles: string; access: string; documents: string };
  };
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
  initialArchivedOnly: boolean;
  canManagePeople: boolean;
  canManageFinance: boolean;
  canManageUsers: boolean;
  exportHref: string;
  locale: 'it' | 'en';
  /** Story 15.5 (R-15.5-c): blocking documents (`ExpiryType.blocksBooking`) of the people on THIS page, expired or due within 30 days. Missing key = nothing blocking. */
  blockingDocumentsById: Record<string, BlockingDocument[]>;
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
  initialArchivedOnly,
  canManagePeople,
  canManageFinance,
  canManageUsers,
  exportHref,
  locale,
  blockingDocumentsById,
  labels,
}: PilotsConsoleProps) {
  const router = useRouter();
  const toast = useToast();
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [archivedOnly, setArchivedOnly] = useState(initialArchivedOnly);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [topUpTarget, setTopUpTarget] = useState<PilotRow | null>(null);
  const [suspendConfirm, setSuspendConfirm] = useState<SuspendConfirm | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  // --- phone sheet (story 15.5) ------------------------------------------
  // Its own state, deliberately NOT the desktop's `suspendConfirm`: that one
  // renders the inline ✓/✕ pair inside a table row, which on a phone lives in
  // a `display: none` tree. The confirmation is the sheet's `secondStep`
  // instead (R-15.2-a), same shape as the planning list of 15.4.
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetStep, setSheetStep] = useState<'none' | 'suspend'>('none');
  const sheetPrimaryRef = useRef<HTMLButtonElement>(null);
  const sheetConfirmRef = useRef<HTMLButtonElement>(null);

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => {
    setSheetId(null);
    setSheetStep('none');
  }, []);

  const sheetPilot = items.find((item) => item.id === sheetId) ?? null;

  /**
   * Swapping the sheet's body removes the very button that was pressed and
   * `document.activeElement` falls back to `<body>` — the dialog context is
   * lost for assistive technology even though the node survives (review 15.2
   * F1). Inert while no sheet is open: every ref is null then.
   */
  useEffect(() => {
    if (sheetStep === 'suspend') sheetConfirmRef.current?.focus();
    else sheetPrimaryRef.current?.focus();
  }, [sheetStep]);

  function navigate(next: { q: string; archivedOnly: boolean }): void {
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.archivedOnly) params.set('archivedOnly', 'true');
    const search = params.toString();
    router.push(`/dashboard/pilots${search ? `?${search}` : ''}`);
  }

  const debouncedSearch = useDebouncedCallback((value: string) => {
    navigate({ q: value, archivedOnly });
  }, 400);

  function handleQueryChange(value: string): void {
    setQueryInput(value);
    debouncedSearch(value);
  }

  function handleArchivedOnlyChange(checked: boolean): void {
    setArchivedOnly(checked);
    navigate({ q: queryInput, archivedOnly: checked });
  }

  function pageHref(targetPage: number) {
    return {
      pathname: '/dashboard/pilots' as const,
      query: { page: targetPage, ...(queryInput ? { q: queryInput } : {}), ...(archivedOnly ? { archivedOnly: 'true' } : {}) },
    };
  }

  function roleBadges(profiles: PilotRow['profiles']): Array<{ key: string; label: string; tone: BadgeTone }> {
    const badges: Array<{ key: string; label: string; tone: BadgeTone }> = [];
    if (profiles.pilot) badges.push({ key: 'pilot', label: labels.role.pilot, tone: 'info' });
    if (profiles.student) badges.push({ key: 'student', label: labels.role.student, tone: 'ok' });
    if (profiles.instructor) badges.push({ key: 'instructor', label: labels.role.instructor, tone: 'warn' });
    return badges;
  }

  function statusLabel(user: PilotUser): string {
    if (!user) return labels.status.none;
    return user.isActive ? labels.status.active : labels.status.suspended;
  }

  /**
   * The PATCH behind "Sospendi"/"Riattiva" — extracted (story 15.5) so the
   * table row's inline confirmation and the phone sheet's `secondStep` run the
   * SAME request, the same 409 `CONFLICT` branch and the same toasts. Same
   * rationale as `booking-transition.ts` in 15.3: one behaviour, two faces.
   */
  async function setUserActive(userId: string, nextActive: boolean): Promise<void> {
    setPendingUserId(userId);
    const response = await fetch(`/api/v1/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: nextActive }),
    });
    setPendingUserId(null);

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = (body as { error?: { code?: string } } | null)?.error?.code;
      toast.show(code === 'CONFLICT' ? labels.toast.lastAdminError : labels.toast.genericError, 'bad');
      return;
    }

    toast.show(nextActive ? labels.toast.reactivated : labels.toast.suspended, 'ok');
    router.refresh();
  }

  async function handleSuspendConfirm(): Promise<void> {
    if (!suspendConfirm) return;
    const { userId, nextActive } = suspendConfirm;
    setSuspendConfirm(null);
    await setUserActive(userId, nextActive);
  }

  async function handleSheetSuspendConfirm(pilot: PilotRow): Promise<void> {
    if (!pilot.user) return;
    const nextActive = !pilot.user.isActive;
    const userId = pilot.user.id;
    closeSheet();
    await setUserActive(userId, nextActive);
  }

  /** The one chip the phone row shows on its right, or `null` (R-15.5-c). */
  function flagOf(pilot: PilotRow): PilotRowFlag | null {
    return pilotRowFlag({ suspended: pilot.user !== null && !pilot.user.isActive, blockingDocuments: blockingDocumentsById[pilot.id] ?? [] });
  }

  function flagLabel(flag: PilotRowFlag): string {
    if (flag.kind === 'suspended') return labels.status.suspended;
    if (flag.kind === 'expired') return labels.mobile.flagExpired.replace('{doc}', flag.typeName);
    return labels.mobile.flagExpiring.replace('{doc}', flag.typeName).replace('{days}', String(flag.daysUntil));
  }

  /** The mono over-line of the row and of the sheet: the active profiles, then the email — ellipsised, never truncated by hand. */
  function subLineOf(pilot: PilotRow): string {
    const parts = [...roleBadges(pilot.profiles).map((role) => role.label), pilot.email].filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(' · ') : labels.table.noValue;
  }

  const cols = 'minmax(150px,1.4fr) minmax(160px,1.4fr) 100px 110px minmax(160px,1.2fr) 120px minmax(200px,1.3fr)';

  return (
    <>
      <div className="card">
        {/* ONE head at every width (AD-3) — see `fleet-console.tsx`'s own note:
            the four controls keep their testids and their state, and ratifica
            R-15.5-g's phone layout is CSS on `.registry-head`. */}
        <div className="card-head registry-head">
          <div className="card-title">{labels.cardTitle}</div>
          <div className="spacer" />
          <button
            type="button"
            className={`btn ${archivedOnly ? 'on' : ''}`}
            aria-pressed={archivedOnly}
            onClick={() => handleArchivedOnlyChange(!archivedOnly)}
            data-testid="pilots-toggle-archived"
          >
            {archivedOnly ? <Icon.check /> : null}
            {labels.includeArchivedLabel}
          </button>
          <div className="search registry-search registry-search-lg">
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
          <p className="card-body pilots-desktop-body" data-testid="pilots-empty">
            {labels.empty}
          </p>
        ) : (
          <div className="students pilots-desktop-body">
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
              const roles = roleBadges(pilot.profiles);
              const hasUser = pilot.user !== null;
              return (
                <div key={pilot.id} className="student-row" data-testid={`pilot-row-${pilot.id}`} style={{ gridTemplateColumns: cols }}>
                  <div>
                    <Link
                      href={`/dashboard/people/${pilot.id}`}
                      locale={locale as AppLocale}
                      className="student-name"
                      style={{ textDecoration: 'underline', textDecorationColor: 'var(--border-strong)', textUnderlineOffset: 3 }}
                      data-testid={`pilot-name-${pilot.id}`}
                    >
                      {pilot.lastName} {pilot.firstName}
                    </Link>
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

        {/* --- the phone face of the same list (template 232-244) -------------
            One `<button>` per person: avatar, name + sub, and on the right the
            balance with, under it, the single flag chip of R-15.5-c. Every
            action of the desktop row lives in the sheet (R-15.2-b), so there is
            no nested interactive element and the touch target IS the row. */}
        <div className="pilots-mobile" data-testid="mobile-pilots-list">
          {items.length === 0 ? (
            <p className="mobile-card-empty" data-testid="mobile-pilots-empty">
              {labels.empty}
            </p>
          ) : (
            items.map((pilot) => {
              const flag = flagOf(pilot);
              const name = `${pilot.lastName} ${pilot.firstName}`;
              return (
                <button
                  key={pilot.id}
                  type="button"
                  className="mobile-row mobile-row-person"
                  aria-label={`${labels.mobile.openDetail}: ${name}`}
                  onClick={() => setSheetId(pilot.id)}
                  data-testid={`mobile-pilot-row-${pilot.id}`}
                >
                  <span className="mobile-row-avatar">
                    <Avatar as="span" init={initialsOf(pilot.firstName, pilot.lastName)} color={avatarColorFor(pilot.id)} />
                  </span>
                  <span className="mobile-row-main">
                    <span className="mobile-row-title">
                      <span className="mobile-row-name">{name}</span>
                    </span>
                    <span className="mobile-row-sub">{subLineOf(pilot)}</span>
                  </span>
                  <span className="mobile-row-side">
                    {/* `.stat-tone-bad`, not the desktop cell's raw `--bad`:
                        that token measures 3.96:1 on `--panel` in the light
                        theme (13.9's own canvas sweep), under the 4.5:1 AC 12
                        asks of text. `.stat-tone-bad` is the design system's
                        already-calibrated red TEXT — 9.82:1 light, `--bad` in
                        dark. */}
                    <span className={`mobile-row-amount ${pilot.balanceCents < 0 ? 'stat-tone-bad' : ''}`}>{formatCents(pilot.balanceCents, locale)}</span>
                  </span>
                  {flag ? (
                    <span className="mobile-row-flag">
                      <Badge tone={flag.kind === 'expiring' ? 'warn' : 'bad'}>{flagLabel(flag)}</Badge>
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {totalPages > 1 ? (
          <div className="card-body registry-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              data-testid="pilots-page-prev"
              className="btn"
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
              className="btn"
            >
              {labels.pagination.next}
            </Link>
          </div>
        ) : null}
      </div>

      <PilotEditor
        // Remounts per target (new vs a specific pilot) so `useState`'s
        // initial values are always fresh for the row just opened — same
        // convention as `TopUpSlideOver`'s own `key` below.
        key={editorTarget === null ? 'editor-closed' : editorTarget.mode === 'new' ? 'editor-new' : `editor-${editorTarget.pilot.id}`}
        target={editorTarget}
        onClose={() => setEditorTarget(null)}
        onMutated={() => router.refresh()}
        canManageUsers={canManageUsers}
        locale={locale}
        labels={labels.editor}
        toastLabels={labels.toast}
      />

      <TopUpSlideOver
        pilot={topUpTarget}
        onClose={() => setTopUpTarget(null)}
        onMutated={() => router.refresh()}
        labels={labels.topUp}
        closeLabel={labels.editor.closeLabel}
        successMessage={labels.toast.topUpRecorded}
      />

      {/* Rendered conditionally (AD-7): `mobile-pilot-sheet` is ONE node. Every
          action is the desktop row's, under the SAME permission gate; the two
          that open a `SlideOver` CLOSE the sheet first rather than stacking a
          z-50 panel on a z-40 sheet (R-15.4-d). */}
      {sheetPilot ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-pilot-sheet"
          sub={subLineOf(sheetPilot)}
          title={`${sheetPilot.lastName} ${sheetPilot.firstName}`}
          badge={
            <Badge tone={userStatusTone(sheetPilot.user)} dot>
              {statusLabel(sheetPilot.user)}
            </Badge>
          }
          rows={pilotSheetRows(sheetPilot, flagOf(sheetPilot), flagLabel, locale, labels)}
          closeLabel={labels.mobile.close}
          actions={
            <>
              {canManagePeople ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    const pilot = sheetPilot;
                    closeSheet();
                    setEditorTarget({ mode: 'edit', pilot });
                  }}
                  data-testid="pilot-edit-mobile"
                >
                  {labels.actions.edit}
                </button>
              ) : null}
              {canManageFinance ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const pilot = sheetPilot;
                    closeSheet();
                    setTopUpTarget(pilot);
                  }}
                  data-testid="pilot-topup-mobile"
                >
                  {labels.actions.topUp}
                </button>
              ) : null}
              {canManageUsers && sheetPilot.user ? (
                <button
                  type="button"
                  className={sheetPilot.user.isActive ? 'btn mini bad' : 'btn mini ok'}
                  ref={sheetPrimaryRef}
                  disabled={pendingUserId === sheetPilot.user.id}
                  onClick={() => setSheetStep('suspend')}
                  data-testid={sheetPilot.user.isActive ? 'pilot-suspend-toggle-mobile' : 'pilot-reactivate-toggle-mobile'}
                >
                  {sheetPilot.user.isActive ? labels.actions.suspend : labels.actions.reactivate}
                </button>
              ) : null}
              <Link
                href={`/dashboard/people/${sheetPilot.id}`}
                locale={locale as AppLocale}
                className="btn"
                onClick={closeSheet}
                data-testid="pilot-open-profile-mobile"
              >
                {labels.mobile.openProfile}
              </Link>
            </>
          }
          secondStep={
            sheetStep === 'suspend' && sheetPilot.user ? (
              <div className="bottom-sheet-step">
                <p className="fld-hint">{sheetPilot.user.isActive ? labels.mobile.confirmSuspend : labels.mobile.confirmReactivate}</p>
                <div className="bottom-sheet-actions">
                  <button type="button" className="btn" onClick={() => setSheetStep('none')} data-testid="pilot-suspend-dismiss-mobile">
                    {labels.mobile.dismiss}
                  </button>
                  <button
                    type="button"
                    className={sheetPilot.user.isActive ? 'btn mini bad' : 'btn mini ok'}
                    ref={sheetConfirmRef}
                    disabled={pendingUserId === sheetPilot.user.id}
                    onClick={() => void handleSheetSuspendConfirm(sheetPilot)}
                    data-testid="pilot-suspend-confirm-mobile"
                  >
                    {sheetPilot.user.isActive ? labels.actions.suspend : labels.actions.reactivate}
                  </button>
                </div>
              </div>
            ) : undefined
          }
        />
      ) : null}
    </>
  );
}

/** Detail rows of the pilot sheet — the template's own `openPilot` builder (script 594), with the app's fields and full parity toward the desktop table's seven columns. */
function pilotSheetRows(
  pilot: PilotRow,
  flag: PilotRowFlag | null,
  flagLabel: (flag: PilotRowFlag) => string,
  locale: 'it' | 'en',
  labels: PilotsConsoleLabels,
): BottomSheetRow[] {
  const profiles = [pilot.profiles.pilot ? labels.role.pilot : null, pilot.profiles.student ? labels.role.student : null, pilot.profiles.instructor ? labels.role.instructor : null].filter(
    (part): part is string => part !== null,
  );
  const rows: BottomSheetRow[] = [
    { k: labels.mobile.sheet.email, v: pilot.email ?? labels.table.noValue },
    { k: labels.mobile.sheet.phone, v: pilot.phone ?? labels.table.noValue },
    { k: labels.mobile.sheet.balance, v: formatCents(pilot.balanceCents, locale) },
    { k: labels.mobile.sheet.lastFlight, v: pilot.lastFlightDate ? formatDateOnly(pilot.lastFlightDate, locale) : labels.table.noValue },
    { k: labels.mobile.sheet.profiles, v: profiles.length > 0 ? profiles.join(' · ') : labels.table.noValue },
    { k: labels.mobile.sheet.access, v: pilot.user === null ? labels.status.none : pilot.user.isActive ? labels.status.active : labels.status.suspended },
  ];
  // Only when there IS something to say: "nessun documento in scadenza" would
  // over-claim — the reader only ever looked 30 days ahead.
  if (flag !== null && flag.kind !== 'suspended') {
    rows.push({ k: labels.mobile.sheet.documents, v: flagLabel(flag) });
  }
  return rows;
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
            <Field label={labels.amount} error={errors.amount ? labels.requiredField : undefined}>
              <Input inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(errors.amount)} {...register('amount')} />
            </Field>
            <Field label={labels.paymentMethod}>
              <Select {...register('paymentMethod')}>
                <option value="CASH">{labels.paymentMethods.cash}</option>
                <option value="BANK_TRANSFER">{labels.paymentMethods.bankTransfer}</option>
                <option value="POS">{labels.paymentMethods.pos}</option>
              </Select>
            </Field>
            <Field label={labels.effectiveDate} error={errors.effectiveDate ? labels.requiredField : undefined}>
              <DateInput aria-invalid={Boolean(errors.effectiveDate)} {...register('effectiveDate')} />
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
