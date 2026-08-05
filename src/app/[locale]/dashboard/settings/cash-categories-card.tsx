'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { Field, Input } from '@/components/ui/field';
import { Icon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { cashCategorySheetSub, cashCategorySubLine } from '@/lib/mobile-settings';

export type CashCategoryRow = {
  id: string;
  name: string;
  isActive: boolean;
  movementCount: number;
  /** Reserved for automatic flows (`cash.service.ts`'s `SYSTEM_CASH_CATEGORY_NAMES`, e.g. "Ricariche") — rename/delete are refused server-side, so the delete action is hidden here (same choice as the pre-12.13 `categories-manager.tsx`). */
  isSystem: boolean;
};

export type CashCategoriesCardLabels = {
  title: string;
  sub: string;
  addAction: string;
  table: { name: string; movements: string; status: string; actions: string; empty: string };
  status: { active: string; inactive: string };
  systemBadge: string;
  actions: { rename: string; deactivate: string; reactivate: string; delete: string; confirmDelete: string; confirmYes: string; confirmCancel: string };
  form: {
    createTitle: string;
    renameTitle: string;
    name: string;
    submitCreate: string;
    submitRename: string;
    cancel: string;
    requiredField: string;
    conflictError: string;
    genericError: string;
  };
  feedback: { created: string; renamed: string; deactivated: string; reactivated: string; deleted: string; deleteInUseError: string; genericError: string };
  /** Phone face (story 15.8b, R-15.8b-d). `movementsCount` carries a `{count}` placeholder interpolated client-side ⇒ pass it with `t.raw`. */
  mobile: { openDetail: string; close: string; empty: string; movementsCount: string };
};

type CashCategoriesCardProps = {
  categories: CashCategoryRow[];
  labels: CashCategoriesCardLabels;
};

type Panel = { mode: 'create' } | { mode: 'rename'; category: CashCategoryRow };

const COLS = '1fr 110px 130px 220px';

/**
 * "Categorie di cassa" card (story 12.13 review, F2 — PO decision
 * 2026-07-20): a minimal management UI for the `cash-categories` API, which
 * lost its dedicated page (`dashboard/finance/categories`) in this same
 * story's AC1 without a replacement. AirOps `.card`/`.students` structure,
 * ported 1:1 from `RatingsCard` (the "Abilitazioni" card just above); domain
 * logic (create/rename/deactivate/reactivate/delete, hide delete for a
 * system category) ported from the removed `categories-manager.tsx`. Backend
 * untouched — same `cash.service.ts` functions, same `settings.manage` gate
 * this page already enforces.
 */
export function CashCategoriesCard({ categories, labels }: CashCategoriesCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  // Phone face (story 15.8b): same shape as the two `RatingsCard` catalogues
  // above — a row sheet whose delete confirmation is a `secondStep` inside it.
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetStep, setSheetStep] = useState<'detail' | 'delete'>('detail');
  const sheetDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const sheetConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Set only by the sheet's "Rinomina" — the desktop never scrolls (the 15.8a `preventScroll` lesson). */
  const revealPanelRef = useRef(false);

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => {
    setSheetId(null);
    setSheetStep('detail');
  }, []);

  useEffect(() => {
    if (sheetStep === 'delete') sheetConfirmButtonRef.current?.focus();
    else sheetDeleteButtonRef.current?.focus();
  }, [sheetStep]);

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

  // --- the network, shared by the two faces (AD-7) — see `ratings-card.tsx`
  // for the same split: one request, one contract, two announcement channels.
  async function requestLifecycleAction(category: CashCategoryRow, action: 'deactivate' | 'reactivate'): Promise<boolean> {
    setPendingActionId(category.id);
    const response = await fetch(`/api/v1/cash-categories/${category.id}/${action}`, { method: 'POST' });
    setPendingActionId(null);
    router.refresh();
    return response.ok;
  }

  async function requestDelete(category: CashCategoryRow): Promise<'ok' | 'in-use' | 'error'> {
    setPendingActionId(category.id);
    const response = await fetch(`/api/v1/cash-categories/${category.id}`, { method: 'DELETE' });
    setPendingActionId(null);
    router.refresh();
    if (response.ok) return 'ok';
    // A category with recorded movements is not deletable (AC 1 of story 3.4)
    // — the service already refused, this only explains why.
    return response.status === 409 ? 'in-use' : 'error';
  }

  function lifecycleMessage(action: 'deactivate' | 'reactivate', ok: boolean): { text: string; isError: boolean } {
    if (!ok) return { text: labels.feedback.genericError, isError: true };
    return { text: action === 'deactivate' ? labels.feedback.deactivated : labels.feedback.reactivated, isError: false };
  }

  function deleteMessage(outcome: 'ok' | 'in-use' | 'error'): { text: string; isError: boolean } {
    if (outcome === 'ok') return { text: labels.feedback.deleted, isError: false };
    if (outcome === 'in-use') return { text: labels.feedback.deleteInUseError, isError: true };
    return { text: labels.feedback.genericError, isError: true };
  }

  async function handleLifecycleAction(category: CashCategoryRow, action: 'deactivate' | 'reactivate'): Promise<void> {
    setFeedback(lifecycleMessage(action, await requestLifecycleAction(category, action)));
  }

  async function handleDelete(category: CashCategoryRow): Promise<void> {
    const outcome = await requestDelete(category);
    setConfirmingDeleteId(null);
    setFeedback(deleteMessage(outcome));
  }

  async function handleSheetLifecycleAction(category: CashCategoryRow, action: 'deactivate' | 'reactivate'): Promise<void> {
    const message = lifecycleMessage(action, await requestLifecycleAction(category, action));
    toast.show(message.text, message.isError ? 'bad' : 'ok');
  }

  async function handleSheetDelete(category: CashCategoryRow): Promise<void> {
    const message = deleteMessage(await requestDelete(category));
    toast.show(message.text, message.isError ? 'bad' : 'ok');
    closeSheet();
  }

  const sheetRow = categories.find((category) => category.id === sheetId) ?? null;

  function movementsLabel(category: CashCategoryRow): string {
    return labels.mobile.movementsCount.replace('{count}', String(category.movementCount));
  }

  function sheetRows(category: CashCategoryRow): BottomSheetRow[] {
    return [
      { k: labels.table.movements, v: String(category.movementCount) },
      { k: labels.table.status, v: category.isActive ? labels.status.active : labels.status.inactive },
    ];
  }

  return (
    <div className="card settings-card" data-testid="cash-categories-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
        <div className="spacer" />
        <button type="button" className="btn primary" onClick={() => setPanel({ mode: 'create' })} data-testid="cash-category-add-button">
          <Icon.plus /> {labels.addAction}
        </button>
      </div>

      {feedback ? (
        <p role="status" data-testid="cash-categories-feedback" style={{ padding: '10px 20px 0', fontSize: 12.5, color: feedback.isError ? 'var(--bad)' : 'var(--ok)' }}>
          {feedback.text}
        </p>
      ) : null}

      {panel ? (
        <div ref={panelRef} style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <CashCategoryForm
            // Remount on target change (create <-> rename A <-> rename B) —
            // react-hook-form reads defaultValues only at mount (review 2.4 F1).
            key={panel.mode === 'rename' ? panel.category.id : 'create'}
            category={panel.mode === 'rename' ? panel.category : null}
            labels={labels.form}
            onCancel={() => setPanel(null)}
            onSuccess={(mode) => handleSuccess(mode === 'create' ? labels.feedback.created : labels.feedback.renamed)}
          />
        </div>
      ) : null}

      <div className="students cash-categories-desktop-body">
        <div className="student-row header" style={{ gridTemplateColumns: COLS }}>
          <div>{labels.table.name}</div>
          <div>{labels.table.movements}</div>
          <div>{labels.table.status}</div>
          <div>{labels.table.actions}</div>
        </div>
        {categories.length === 0 ? (
          <div className="student-row" style={{ gridTemplateColumns: '1fr' }}>
            <div style={{ color: 'var(--ink-3)', padding: '8px 0' }}>{labels.table.empty}</div>
          </div>
        ) : (
          categories.map((category) => (
            <div key={category.id} className="student-row" data-testid="cash-category-row" style={{ gridTemplateColumns: COLS, alignItems: 'center' }}>
              <div>
                <div className="student-name">{category.name}</div>
                {category.isSystem ? (
                  <div style={{ marginTop: 2 }}>
                    <Badge tone="info">{labels.systemBadge}</Badge>
                  </div>
                ) : null}
              </div>
              <div className="mono" style={{ fontSize: 12.5 }}>
                {category.movementCount}
              </div>
              <div>
                <Badge tone={category.isActive ? 'ok' : ''} dot>
                  {category.isActive ? labels.status.active : labels.status.inactive}
                </Badge>
              </div>
              <div>
                {confirmingDeleteId === category.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{labels.actions.confirmDelete}</span>
                    <button type="button" className="btn mini bad" disabled={pendingActionId === category.id} onClick={() => void handleDelete(category)}>
                      {labels.actions.confirmYes}
                    </button>
                    <button type="button" className="btn mini" onClick={() => setConfirmingDeleteId(null)}>
                      {labels.actions.confirmCancel}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn mini" onClick={() => setPanel({ mode: 'rename', category })} data-testid="cash-category-rename-button">
                      {labels.actions.rename}
                    </button>
                    <button type="button" className="btn mini" disabled={pendingActionId === category.id} onClick={() => void handleLifecycleAction(category, category.isActive ? 'deactivate' : 'reactivate')}>
                      {category.isActive ? labels.actions.deactivate : labels.actions.reactivate}
                    </button>
                    {category.isSystem ? null : (
                      <button type="button" className="btn mini bad" disabled={pendingActionId === category.id} onClick={() => setConfirmingDeleteId(category.id)} data-testid="cash-category-delete-button">
                        {labels.actions.delete}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* --- the phone face of this catalogue (story 15.8b, R-15.8b-d) ------
          Same shape as the two expiry-type catalogues above. The one rule that
          differs is domain, not layout: on a SYSTEM category ("Ricariche",
          "Compensi istruttori", "PPR") the "Elimina" action stays ABSENT — not
          disabled — exactly as on the desktop row (`cash.service.ts:52`). */}
      <div className="cash-categories-mobile" data-testid="mobile-cash-category-list">
        {categories.length === 0 ? (
          <p className="mobile-card-empty" data-testid="mobile-cash-category-empty">
            {labels.mobile.empty}
          </p>
        ) : (
          categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="mobile-row mobile-row-catalog"
              aria-label={`${labels.mobile.openDetail}: ${category.name}`}
              onClick={() => {
                setSheetStep('detail');
                setSheetId(category.id);
              }}
              data-testid="cash-category-row-mobile"
            >
              <span className="mobile-row-main">
                <span className="mobile-row-title">
                  <span className="mobile-row-name">{category.name}</span>
                </span>
                <span className="mobile-row-sub">
                  {cashCategorySubLine({
                    movementsLabel: movementsLabel(category),
                    systemLabel: category.isSystem ? labels.systemBadge : null,
                  })}
                </span>
              </span>
              <span className="mobile-row-side">
                <Badge tone={category.isActive ? 'ok' : ''} dot>
                  {category.isActive ? labels.status.active : labels.status.inactive}
                </Badge>
              </span>
            </button>
          ))
        )}
      </div>

      {sheetRow ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-cash-category-sheet"
          sub={cashCategorySheetSub({ catalogLabel: labels.title, systemLabel: sheetRow.isSystem ? labels.systemBadge : null })}
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
                  setPanel({ mode: 'rename', category: sheetRow });
                  closeSheet();
                }}
                data-testid="cash-category-rename-button-mobile"
              >
                {labels.actions.rename}
              </button>
              <button
                type="button"
                className="btn"
                disabled={pendingActionId === sheetRow.id}
                onClick={() => void handleSheetLifecycleAction(sheetRow, sheetRow.isActive ? 'deactivate' : 'reactivate')}
                data-testid="cash-category-toggle-button-mobile"
              >
                {sheetRow.isActive ? labels.actions.deactivate : labels.actions.reactivate}
              </button>
              {sheetRow.isSystem ? null : (
                <button
                  type="button"
                  className="btn mini bad"
                  ref={sheetDeleteButtonRef}
                  disabled={pendingActionId === sheetRow.id}
                  onClick={() => setSheetStep('delete')}
                  data-testid="cash-category-delete-button-mobile"
                >
                  {labels.actions.delete}
                </button>
              )}
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
                    data-testid="cash-category-delete-confirm-mobile"
                  >
                    {labels.actions.confirmYes}
                  </button>
                  <button type="button" className="btn" onClick={() => setSheetStep('detail')} data-testid="cash-category-delete-cancel-mobile">
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

const cashCategoryFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

type CashCategoryFormValues = z.infer<typeof cashCategoryFormSchema>;

type CashCategoryFormProps = {
  /** `null` = create mode; a row = rename mode. */
  category: CashCategoryRow | null;
  labels: CashCategoriesCardLabels['form'];
  onCancel: () => void;
  onSuccess: (mode: 'create' | 'rename') => void;
};

function CashCategoryForm({ category, labels, onCancel, onSuccess }: CashCategoryFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CashCategoryFormValues>({
    resolver: zodResolver(cashCategoryFormSchema),
    defaultValues: { name: category?.name ?? '' },
  });

  async function onSubmit(values: CashCategoryFormValues): Promise<void> {
    setFormError(null);
    const body = JSON.stringify({ name: values.name.trim() });
    const response = category
      ? await fetch(`/api/v1/cash-categories/${category.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
      : await fetch('/api/v1/cash-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    onSuccess(category ? 'rename' : 'create');
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="cash-category-form">
      <div className="fld-label" style={{ marginBottom: 10 }}>
        {category ? labels.renameTitle : labels.createTitle}
      </div>
      <div className="form-grid">
        <Field label={labels.name} wide error={errors.name ? labels.requiredField : undefined}>
          <Input maxLength={100} aria-invalid={Boolean(errors.name)} data-testid="cash-category-name-input" {...register('name')} />
        </Field>
      </div>

      {formError ? (
        <p role="alert" data-testid="cash-category-form-error" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--bad)' }}>
          {formError}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="submit" className="btn primary" disabled={isSubmitting} data-testid="cash-category-form-submit">
          {category ? labels.submitRename : labels.submitCreate}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
