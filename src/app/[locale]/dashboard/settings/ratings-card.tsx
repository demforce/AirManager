'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { Field, Input, InputGroup, Select } from '@/components/ui/field';
import { Icon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { expiryTypeSheetSub, expiryTypeSubLine } from '@/lib/mobile-settings';

export type ExpiryScopeValue = 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' | 'ALL';

export type ExpiryTypeRow = {
  id: string;
  name: string;
  scope: ExpiryScopeValue;
  isActive: boolean;
  blocksBooking: boolean;
  validityMonths: number | null;
};

/**
 * Test-id namespace for one instance of this card (story 13.1, AC 3) —
 * defaults below match the ORIGINAL "Abilitazioni" ids verbatim (zero
 * change for `e2e/expiry-types.spec.ts`'s existing assertions); the new
 * "Visite mediche" card passes its own set from `settings/page.tsx`.
 */
export type ExpiryTypeCardTestIds = {
  card: string;
  addButton: string;
  feedback: string;
  row: string;
  editButton: string;
  form: string;
  nameInput: string;
  scopeSelect: string;
  validityInput: string;
  formSubmit: string;
  formError: string;
  /** Phone face (story 15.8b). Convention of the epic (15.1): a surface that DUPLICATES a desktop one takes the desktop name plus `-mobile`; one that exists only on a phone takes a new name prefixed `mobile-`. */
  mobileList: string;
  mobileEmpty: string;
  mobileRow: string;
  mobileSheet: string;
  mobileEditButton: string;
  mobileToggleButton: string;
  mobileDeleteButton: string;
  mobileDeleteConfirm: string;
  mobileDeleteCancel: string;
};

const DEFAULT_TEST_IDS: ExpiryTypeCardTestIds = {
  card: 'ratings-settings-card',
  addButton: 'ratings-add-button',
  feedback: 'ratings-feedback',
  row: 'rating-row',
  editButton: 'rating-edit-button',
  form: 'rating-form',
  nameInput: 'rating-name-input',
  scopeSelect: 'rating-scope-select',
  validityInput: 'rating-validity-input',
  formSubmit: 'rating-form-submit',
  formError: 'rating-form-error',
  mobileList: 'mobile-rating-list',
  mobileEmpty: 'mobile-rating-empty',
  mobileRow: 'rating-row-mobile',
  mobileSheet: 'mobile-rating-sheet',
  mobileEditButton: 'rating-edit-button-mobile',
  mobileToggleButton: 'rating-toggle-button-mobile',
  mobileDeleteButton: 'rating-delete-button-mobile',
  mobileDeleteConfirm: 'rating-delete-confirm-mobile',
  mobileDeleteCancel: 'rating-delete-cancel-mobile',
};

export type RatingsCardLabels = {
  title: string;
  sub: string;
  addAction: string;
  table: { name: string; scope: string; validity: string; status: string; actions: string; empty: string; monthsSuffix: string; noExpiry: string };
  scope: Record<ExpiryScopeValue, string>;
  status: { active: string; inactive: string };
  blocksBooking: { yes: string };
  actions: { edit: string; deactivate: string; reactivate: string; delete: string; confirmDelete: string; confirmYes: string; confirmCancel: string };
  form: {
    createTitle: string;
    editTitle: string;
    name: string;
    scope: string;
    validity: string;
    validityHint: string;
    blocksBooking: string;
    blocksBookingHint: string;
    submitCreate: string;
    submitSave: string;
    cancel: string;
    requiredField: string;
    conflictError: string;
    genericError: string;
  };
  feedback: { created: string; updated: string; deactivated: string; reactivated: string; deleted: string; deleteInUseError: string; genericError: string };
  hint: string;
  /** Phone face (story 15.8b, R-15.8b-d) — the wording the card list and its sheet need on top of the desktop's own. */
  mobile: { openDetail: string; close: string; empty: string; yes: string; no: string };
};

type RatingsCardProps = {
  expiryTypes: ExpiryTypeRow[];
  labels: RatingsCardLabels;
  /** `ExpiryType.kind` this instance manages (story 13.1, AC 3) — sets `kind` on every create, default `'RATING'` (retro-compatible: the pre-13.1 "Abilitazioni" card only ever created RATING types). */
  kind?: 'RATING' | 'MEDICAL';
  /** Test-id namespace override for this instance — default is the ORIGINAL "Abilitazioni" ids, unchanged. */
  testIds?: ExpiryTypeCardTestIds;
};

type Panel = { mode: 'create' } | { mode: 'edit'; expiryType: ExpiryTypeRow };

const SCOPE_VALUES: ExpiryScopeValue[] = ['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL'];
const COLS = '1fr 130px 150px 120px 220px';

/**
 * Expiry-type catalogue card (story 12.11, AC 2, ratifica utente 2; story
 * 13.1, AC 3) — moved here from the removed `/dashboard/expiries/types` page
 * (`expiry-types` API unchanged). AirOps `.students` table restyle of
 * `types-manager.tsx`'s proven create/edit/deactivate/delete flow, plus the
 * `validityMonths` field (precompiles `expiresAt` at registration —
 * `people/[id]` scheda persona) and its "senza scadenza" badge (0/absent).
 *
 * Story 13.1 (R-13.1-a): this ONE component now backs TWO cards in
 * Impostazioni — "Abilitazioni" (`kind="RATING"`, the default, unchanged
 * testids) and "Visite mediche" (`kind="MEDICAL"`, its own testids) — rather
 * than a duplicated ~250-line twin file, since the two are otherwise
 * pixel-for-pixel identical (same fields, same CRUD, same service).
 */
export function RatingsCard({ expiryTypes, labels, kind = 'RATING', testIds = DEFAULT_TEST_IDS }: RatingsCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  // Phone face (story 15.8b): the row sheet, and the delete confirmation as a
  // `secondStep` INSIDE it (R-15.8b-d) — never a second overlay on top of the
  // sheet (AD-8).
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetStep, setSheetStep] = useState<'detail' | 'delete'>('detail');
  const sheetDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const sheetConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Set only by the sheet's "Modifica": the form lives ABOVE the list, off-screen on a phone. The desktop never sets it, so its scroll position is untouched by construction (the 15.8a `preventScroll` lesson). */
  const revealPanelRef = useRef(false);

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => {
    setSheetId(null);
    setSheetStep('detail');
  }, []);

  // Same fix as review 15.2 F1 / 15.8a MINOR-2: swapping the sheet's body
  // removes the very button that was pressed, and `document.activeElement`
  // falls back to `<body>` — losing the dialog context — even though the
  // dialog node survives. Each step takes the focus to what it is about, in
  // BOTH directions; inert while no sheet is open (both refs are null then).
  useEffect(() => {
    if (sheetStep === 'delete') sheetConfirmButtonRef.current?.focus();
    else sheetDeleteButtonRef.current?.focus();
  }, [sheetStep]);

  // The inline form is the SAME node for both faces (R-15.8b-d option A keeps
  // the forms in the page), and it renders above the table — on a phone that
  // is several screens up from the card the finger just tapped.
  useEffect(() => {
    if (panel === null || !revealPanelRef.current) return;
    revealPanelRef.current = false;
    panelRef.current?.scrollIntoView({ block: 'center' });
  }, [panel]);

  function handleSuccess(message: string): void {
    setPanel(null);
    setFeedback({ text: message, isError: false });
    router.refresh();
  }

  // --- the network, shared by the two faces (AD-7) -------------------------
  // One request per action, one contract: `PATCH`/`DELETE /expiry-types/{id}`,
  // with the 409 "in use" kept DISTINCT from the generic failure. What differs
  // between the faces is only WHERE the outcome is announced — the desktop's
  // own `<p role="status">` for the inline flow, a toast for anything started
  // in the sheet (grammar R-15.6-d ii / R-15.7-g / R-15.8a-j). The two
  // channels can never both fire for one action, because each entry point
  // calls exactly one of the wrappers below.
  async function requestToggleActive(expiryType: ExpiryTypeRow): Promise<boolean> {
    setPendingActionId(expiryType.id);
    const response = await fetch(`/api/v1/expiry-types/${expiryType.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !expiryType.isActive }),
    });
    setPendingActionId(null);
    router.refresh();
    return response.ok;
  }

  async function requestDelete(expiryType: ExpiryTypeRow): Promise<'ok' | 'in-use' | 'error'> {
    setPendingActionId(expiryType.id);
    const response = await fetch(`/api/v1/expiry-types/${expiryType.id}`, { method: 'DELETE' });
    setPendingActionId(null);
    router.refresh();
    if (response.ok) return 'ok';
    return response.status === 409 ? 'in-use' : 'error';
  }

  function toggleMessage(expiryType: ExpiryTypeRow, ok: boolean): { text: string; isError: boolean } {
    if (!ok) return { text: labels.feedback.genericError, isError: true };
    return { text: expiryType.isActive ? labels.feedback.deactivated : labels.feedback.reactivated, isError: false };
  }

  function deleteMessage(outcome: 'ok' | 'in-use' | 'error'): { text: string; isError: boolean } {
    if (outcome === 'ok') return { text: labels.feedback.deleted, isError: false };
    if (outcome === 'in-use') return { text: labels.feedback.deleteInUseError, isError: true };
    return { text: labels.feedback.genericError, isError: true };
  }

  async function handleToggleActive(expiryType: ExpiryTypeRow): Promise<void> {
    setFeedback(toggleMessage(expiryType, await requestToggleActive(expiryType)));
  }

  async function handleDelete(expiryType: ExpiryTypeRow): Promise<void> {
    const outcome = await requestDelete(expiryType);
    setConfirmingDeleteId(null);
    setFeedback(deleteMessage(outcome));
  }

  async function handleSheetToggleActive(expiryType: ExpiryTypeRow): Promise<void> {
    const message = toggleMessage(expiryType, await requestToggleActive(expiryType));
    toast.show(message.text, message.isError ? 'bad' : 'ok');
  }

  async function handleSheetDelete(expiryType: ExpiryTypeRow): Promise<void> {
    const outcome = await requestDelete(expiryType);
    const message = deleteMessage(outcome);
    toast.show(message.text, message.isError ? 'bad' : 'ok');
    closeSheet();
  }

  const sheetRow = expiryTypes.find((expiryType) => expiryType.id === sheetId) ?? null;

  function sheetRows(expiryType: ExpiryTypeRow): BottomSheetRow[] {
    return [
      { k: labels.table.scope, v: labels.scope[expiryType.scope] },
      { k: labels.table.validity, v: expiryType.validityMonths ? `${expiryType.validityMonths} ${labels.table.monthsSuffix}` : labels.table.noExpiry },
      { k: labels.table.status, v: expiryType.isActive ? labels.status.active : labels.status.inactive },
      { k: labels.form.blocksBooking, v: expiryType.blocksBooking ? labels.mobile.yes : labels.mobile.no },
    ];
  }

  return (
    <div className="card settings-card" data-testid={testIds.card}>
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
        <div className="spacer" />
        <button type="button" className="btn primary" onClick={() => setPanel({ mode: 'create' })} data-testid={testIds.addButton}>
          <Icon.plus /> {labels.addAction}
        </button>
      </div>

      {feedback ? (
        <p role="status" data-testid={testIds.feedback} style={{ padding: '10px 20px 0', fontSize: 12.5, color: feedback.isError ? 'var(--bad)' : 'var(--ok)' }}>
          {feedback.text}
        </p>
      ) : null}

      {panel ? (
        <div ref={panelRef} style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <ExpiryTypeForm
            key={panel.mode === 'edit' ? panel.expiryType.id : 'create'}
            expiryType={panel.mode === 'edit' ? panel.expiryType : null}
            kind={kind}
            labels={labels}
            testIds={testIds}
            onCancel={() => setPanel(null)}
            onSuccess={(mode) => handleSuccess(mode === 'create' ? labels.feedback.created : labels.feedback.updated)}
          />
        </div>
      ) : null}

      <div className="students expiry-types-desktop-body">
        <div className="student-row header" style={{ gridTemplateColumns: COLS }}>
          <div>{labels.table.name}</div>
          <div>{labels.table.scope}</div>
          <div>{labels.table.validity}</div>
          <div>{labels.table.status}</div>
          <div>{labels.table.actions}</div>
        </div>
        {expiryTypes.length === 0 ? (
          <div className="student-row" style={{ gridTemplateColumns: '1fr' }}>
            <div style={{ color: 'var(--ink-3)', padding: '8px 0' }}>{labels.table.empty}</div>
          </div>
        ) : (
          expiryTypes.map((expiryType) => (
            <div key={expiryType.id} className="student-row" data-testid={testIds.row} style={{ gridTemplateColumns: COLS, alignItems: 'center' }}>
              <div>
                <div className="student-name">{expiryType.name}</div>
                {expiryType.blocksBooking ? (
                  <div style={{ marginTop: 2 }}>
                    <Badge tone="warn">{labels.blocksBooking.yes}</Badge>
                  </div>
                ) : null}
              </div>
              <div>
                <Badge>{labels.scope[expiryType.scope]}</Badge>
              </div>
              <div className="mono" style={{ fontSize: 12.5 }}>
                {expiryType.validityMonths ? (
                  `${expiryType.validityMonths} ${labels.table.monthsSuffix}`
                ) : (
                  <span className="badge" style={{ fontSize: 9.5 }} title={labels.table.noExpiry}>
                    {labels.table.noExpiry}
                  </span>
                )}
              </div>
              <div>
                <Badge tone={expiryType.isActive ? 'ok' : ''} dot>
                  {expiryType.isActive ? labels.status.active : labels.status.inactive}
                </Badge>
              </div>
              <div>
                {confirmingDeleteId === expiryType.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{labels.actions.confirmDelete}</span>
                    <button type="button" className="btn mini bad" disabled={pendingActionId === expiryType.id} onClick={() => void handleDelete(expiryType)}>
                      {labels.actions.confirmYes}
                    </button>
                    <button type="button" className="btn mini" onClick={() => setConfirmingDeleteId(null)}>
                      {labels.actions.confirmCancel}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn mini" onClick={() => setPanel({ mode: 'edit', expiryType })} data-testid={testIds.editButton}>
                      {labels.actions.edit}
                    </button>
                    <button type="button" className="btn mini" disabled={pendingActionId === expiryType.id} onClick={() => void handleToggleActive(expiryType)}>
                      {expiryType.isActive ? labels.actions.deactivate : labels.actions.reactivate}
                    </button>
                    <button type="button" className="btn mini bad" disabled={pendingActionId === expiryType.id} onClick={() => setConfirmingDeleteId(expiryType.id)}>
                      {labels.actions.delete}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      {/* --- the phone face of this catalogue (story 15.8b, R-15.8b-d) -------
          The five-column table becomes one card per type; the four actions
          (Modifica, Disattiva/Riattiva, Elimina) move INTO the sheet, which is
          the only place a thumb can reach them — as `.btn.mini`s they measured
          24.67x61 at x=503-637 in a 375px viewport, i.e. past the right edge.
          The card is ONE `<button>` with `<span>` children: zero nested
          interactives, so a tap can only mean "open the detail". */}
      <div className="expiry-types-mobile" data-testid={testIds.mobileList}>
        {expiryTypes.length === 0 ? (
          // Deliberately NOT the desktop's own `table.empty` string: a second
          // node carrying it would break any page-level `getByText` at 1280px
          // (the class of defect `expiry-dashboard.spec.ts:135` already has).
          <p className="mobile-card-empty" data-testid={testIds.mobileEmpty}>
            {labels.mobile.empty}
          </p>
        ) : (
          expiryTypes.map((expiryType) => (
            <button
              key={expiryType.id}
              type="button"
              className="mobile-row mobile-row-catalog"
              aria-label={`${labels.mobile.openDetail}: ${expiryType.name}`}
              onClick={() => {
                setSheetStep('detail');
                setSheetId(expiryType.id);
              }}
              data-testid={testIds.mobileRow}
            >
              <span className="mobile-row-main">
                <span className="mobile-row-title">
                  <span className="mobile-row-name">{expiryType.name}</span>
                </span>
                <span className="mobile-row-sub">
                  {expiryTypeSubLine({
                    scopeLabel: labels.scope[expiryType.scope],
                    validityLabel: expiryType.validityMonths ? `${expiryType.validityMonths} ${labels.table.monthsSuffix}` : labels.table.noExpiry,
                    blocksLabel: expiryType.blocksBooking ? labels.blocksBooking.yes : null,
                  })}
                </span>
              </span>
              <span className="mobile-row-side">
                <Badge tone={expiryType.isActive ? 'ok' : ''} dot>
                  {expiryType.isActive ? labels.status.active : labels.status.inactive}
                </Badge>
              </span>
            </button>
          ))
        )}
      </div>

      <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--ink-3)' }}>{labels.hint}</div>

      {/* Rendered conditionally, so the sheet's testid is always exactly ONE
          node (AD-6); the "one sheet at a time" invariant itself belongs to
          the chassis (fix 15.3 F4) — which matters here, because the page
          mounts THREE independent catalogue cards that do not know each
          other. */}
      {sheetRow ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId={testIds.mobileSheet}
          sub={expiryTypeSheetSub({
            catalogLabel: labels.title,
            scopeLabel: labels.scope[sheetRow.scope],
            blocksLabel: sheetRow.blocksBooking ? labels.blocksBooking.yes : null,
          })}
          title={sheetRow.name}
          badge={
            <Badge tone={sheetRow.isActive ? 'ok' : ''} dot>
              {sheetRow.isActive ? labels.status.active : labels.status.inactive}
            </Badge>
          }
          rows={sheetRows(sheetRow)}
          closeLabel={labels.mobile.close}
          actions={
            <>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  revealPanelRef.current = true;
                  setPanel({ mode: 'edit', expiryType: sheetRow });
                  closeSheet();
                }}
                data-testid={testIds.mobileEditButton}
              >
                {labels.actions.edit}
              </button>
              <button
                type="button"
                className="btn"
                disabled={pendingActionId === sheetRow.id}
                onClick={() => void handleSheetToggleActive(sheetRow)}
                data-testid={testIds.mobileToggleButton}
              >
                {sheetRow.isActive ? labels.actions.deactivate : labels.actions.reactivate}
              </button>
              {/* Destructive and last: deleting a type is irreversible, so it
                  is never the button a thumb lands on by default. */}
              <button
                type="button"
                className="btn mini bad"
                ref={sheetDeleteButtonRef}
                disabled={pendingActionId === sheetRow.id}
                onClick={() => setSheetStep('delete')}
                data-testid={testIds.mobileDeleteButton}
              >
                {labels.actions.delete}
              </button>
            </>
          }
          secondStep={
            sheetStep === 'delete' ? (
              <div className="catalog-sheet-step">
                <p className="fld-hint">{labels.actions.confirmDelete}</p>
                <div className="bottom-sheet-actions">
                  <button
                    type="button"
                    className="btn mini bad"
                    ref={sheetConfirmButtonRef}
                    disabled={pendingActionId === sheetRow.id}
                    onClick={() => void handleSheetDelete(sheetRow)}
                    data-testid={testIds.mobileDeleteConfirm}
                  >
                    {labels.actions.confirmYes}
                  </button>
                  <button type="button" className="btn" onClick={() => setSheetStep('detail')} data-testid={testIds.mobileDeleteCancel}>
                    {labels.actions.confirmCancel}
                  </button>
                </div>
              </div>
            ) : undefined
          }
        />
      ) : null}
    </div>
  );
}

const expiryTypeFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scope: z.enum(['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL']),
  validityMonths: z.string(),
  blocksBooking: z.boolean(),
});

type ExpiryTypeFormValues = z.infer<typeof expiryTypeFormSchema>;

type ExpiryTypeFormProps = {
  expiryType: ExpiryTypeRow | null;
  kind: 'RATING' | 'MEDICAL';
  labels: RatingsCardLabels;
  testIds: ExpiryTypeCardTestIds;
  onCancel: () => void;
  onSuccess: (mode: 'create' | 'edit') => void;
};

function ExpiryTypeForm({ expiryType, kind, labels, testIds, onCancel, onSuccess }: ExpiryTypeFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExpiryTypeFormValues>({
    resolver: zodResolver(expiryTypeFormSchema),
    defaultValues: {
      name: expiryType?.name ?? '',
      scope: expiryType?.scope ?? 'ALL',
      validityMonths: String(expiryType?.validityMonths ?? 0),
      blocksBooking: expiryType?.blocksBooking ?? false,
    },
  });

  async function onSubmit(values: ExpiryTypeFormValues): Promise<void> {
    setFormError(null);
    const validityMonths = Number(values.validityMonths);
    // `kind` is never a form field (AC 3: implicit per card, not user-chosen)
    // — set only on CREATE, an edit never re-sends/changes it.
    const body = {
      name: values.name.trim(),
      scope: values.scope,
      blocksBooking: values.blocksBooking,
      validityMonths: Number.isFinite(validityMonths) && validityMonths > 0 ? validityMonths : null,
      ...(expiryType ? {} : { kind }),
    };

    const response = expiryType
      ? await fetch(`/api/v1/expiry-types/${expiryType.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/v1/expiry-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.form.conflictError : labels.form.genericError);
      return;
    }

    onSuccess(expiryType ? 'edit' : 'create');
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid={testIds.form}>
      <div className="fld-label" style={{ marginBottom: 10 }}>
        {expiryType ? labels.form.editTitle : labels.form.createTitle}
      </div>
      <div className="form-grid">
        <Field label={labels.form.name} wide error={errors.name ? labels.form.requiredField : undefined}>
          <Input maxLength={100} aria-invalid={Boolean(errors.name)} data-testid={testIds.nameInput} {...register('name')} />
        </Field>
        <Field label={labels.form.scope}>
          <Select data-testid={testIds.scopeSelect} {...register('scope')}>
            {SCOPE_VALUES.map((scope) => (
              <option key={scope} value={scope}>
                {labels.scope[scope]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels.form.validity}>
          <InputGroup suffix={labels.table.monthsSuffix}>
            <Input type="number" min={0} data-testid={testIds.validityInput} {...register('validityMonths')} />
          </InputGroup>
        </Field>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        {labels.form.validityHint}
      </p>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
        <input type="checkbox" style={{ marginTop: 3 }} {...register('blocksBooking')} />
        <span style={{ fontSize: 12.5 }}>
          <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>{labels.form.blocksBooking}</span>
          <span style={{ display: 'block', color: 'var(--ink-3)' }}>{labels.form.blocksBookingHint}</span>
        </span>
      </label>

      {formError ? (
        <p role="alert" data-testid={testIds.formError} style={{ marginTop: 8, fontSize: 12.5, color: 'var(--bad)' }}>
          {formError}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="submit" className="btn primary" disabled={isSubmitting} data-testid={testIds.formSubmit}>
          {expiryType ? labels.form.submitSave : labels.form.submitCreate}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {labels.form.cancel}
        </button>
      </div>
    </form>
  );
}
