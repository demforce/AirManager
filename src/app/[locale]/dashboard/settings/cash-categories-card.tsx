'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/field';
import { Icon } from '@/components/ui/icons';
import { useRouter } from '@/i18n/navigation';

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
  const [panel, setPanel] = useState<Panel | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  function handleSuccess(message: string): void {
    setPanel(null);
    setFeedback({ text: message, isError: false });
    router.refresh();
  }

  async function handleLifecycleAction(category: CashCategoryRow, action: 'deactivate' | 'reactivate'): Promise<void> {
    setPendingActionId(category.id);
    const response = await fetch(`/api/v1/cash-categories/${category.id}/${action}`, { method: 'POST' });
    setPendingActionId(null);
    setFeedback(
      response.ok
        ? { text: action === 'deactivate' ? labels.feedback.deactivated : labels.feedback.reactivated, isError: false }
        : { text: labels.feedback.genericError, isError: true },
    );
    router.refresh();
  }

  async function handleDelete(category: CashCategoryRow): Promise<void> {
    setPendingActionId(category.id);
    const response = await fetch(`/api/v1/cash-categories/${category.id}`, { method: 'DELETE' });
    setPendingActionId(null);
    setConfirmingDeleteId(null);
    if (response.ok) {
      setFeedback({ text: labels.feedback.deleted, isError: false });
    } else if (response.status === 409) {
      // A category with recorded movements is not deletable (AC 1 of story
      // 3.4) — the service already refused, this only explains why.
      setFeedback({ text: labels.feedback.deleteInUseError, isError: true });
    } else {
      setFeedback({ text: labels.feedback.genericError, isError: true });
    }
    router.refresh();
  }

  return (
    <div className="card" data-testid="cash-categories-settings-card">
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
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
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

      <div className="students">
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
        <Field label={labels.name} wide>
          <Input maxLength={100} aria-invalid={Boolean(errors.name)} data-testid="cash-category-name-input" {...register('name')} />
        </Field>
      </div>

      {errors.name ? <p style={{ marginTop: 6, fontSize: 12, color: 'var(--bad)' }}>{labels.requiredField}</p> : null}
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
