'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable } from '@/components/data-table';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { Card } from '@/components/ui/card';

export type CashCategoryRow = {
  id: string;
  name: string;
  isActive: boolean;
  movementCount: number;
  /** Reserved for automatic flows (review 3.4 F1/F2) — the delete action is hidden; the service rejects it regardless. */
  isSystem: boolean;
};

export type CategoriesManagerLabels = {
  newCategory: string;
  table: { name: string; status: string; movements: string; actions: string; empty: string };
  status: { active: string; inactive: string };
  actions: {
    rename: string;
    deactivate: string;
    reactivate: string;
    delete: string;
    confirmDelete: string;
    confirmYes: string;
    confirmCancel: string;
  };
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
  feedback: {
    created: string;
    renamed: string;
    deactivated: string;
    reactivated: string;
    deleted: string;
    deleteInUseError: string;
    genericError: string;
  };
};

type CategoriesManagerProps = {
  categories: CashCategoryRow[];
  labels: CategoriesManagerLabels;
};

type Panel = { mode: 'create' } | { mode: 'rename'; category: CashCategoryRow };

const categoryFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

/**
 * Admin cash-category management (story 3.4, Task 3, AC 1): list with
 * active/inactive status and movement count, create/rename panels,
 * deactivate/reactivate toggles and a two-step delete. The delete button is
 * always shown (Task 3: "il bottone può mostrarsi sempre") — a category in
 * use answers 409 server-side (count pre-check + FK RESTRICT backstop) and
 * gets a clear "deactivate instead" message here. The page that renders
 * this is already gated on `settings.manage`; the service re-checks it on
 * every call (AD-5).
 */
export function CategoriesManager({ categories, labels }: CategoriesManagerProps) {
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
    if (response.ok) {
      setFeedback({ text: action === 'deactivate' ? labels.feedback.deactivated : labels.feedback.reactivated, isError: false });
    } else {
      // e.g. a 409 from a concurrent state change (atomic guard, review 2.2
      // F1 pattern): surface it rather than leaving the row unexplained.
      setFeedback({ text: labels.feedback.genericError, isError: true });
    }
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
      // AC 1: a category in use is not deletable — clear message suggesting
      // deactivation (the service already refused; this only explains why).
      setFeedback({ text: labels.feedback.deleteInUseError, isError: true });
    } else {
      setFeedback({ text: labels.feedback.genericError, isError: true });
    }
    router.refresh();
  }

  const columns: ColumnDef<CashCategoryRow, unknown>[] = [
    {
      id: 'name',
      header: labels.table.name,
      cell: ({ row }) => <span className="font-medium text-ink">{row.original.name}</span>,
    },
    {
      id: 'status',
      header: labels.table.status,
      cell: ({ row }) => (
        <StatusPill tone={row.original.isActive ? 'ok' : 'warning'}>
          {row.original.isActive ? labels.status.active : labels.status.inactive}
        </StatusPill>
      ),
    },
    {
      id: 'movements',
      header: labels.table.movements,
      cell: ({ row }) => row.original.movementCount,
    },
    {
      id: 'actions',
      header: labels.table.actions,
      cell: ({ row }) => {
        const category = row.original;

        if (confirmingDeleteId === category.id) {
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-mid-gray">{labels.actions.confirmDelete}</span>
              <Button size="sm"
                type="button"
                disabled={pendingActionId === category.id}
                onClick={() => void handleDelete(category)}
              >
                {labels.actions.confirmYes}
              </Button>
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setConfirmingDeleteId(null)}
              >
                {labels.actions.confirmCancel}
              </Button>
            </div>
          );
        }

        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setPanel({ mode: 'rename', category })}>
              {labels.actions.rename}
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={pendingActionId === category.id}
              onClick={() => void handleLifecycleAction(category, category.isActive ? 'deactivate' : 'reactivate')}
            >
              {category.isActive ? labels.actions.deactivate : labels.actions.reactivate}
            </Button>
            {category.isSystem ? null : (
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={pendingActionId === category.id}
                onClick={() => setConfirmingDeleteId(category.id)}
              >
                {labels.actions.delete}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {feedback ? (
          <p
            role="status"
            data-testid="categories-feedback"
            className={`text-sm ${feedback.isError ? 'text-[#9F2F2D]' : 'text-[#346538]'}`}
          >
            {feedback.text}
          </p>
        ) : (
          <span />
        )}
        <Button
          type="button"
          onClick={() => setPanel({ mode: 'create' })}
        >
          {labels.newCategory}
        </Button>
      </div>

      {panel ? (
        <Card className="mt-6 p-6">
          <CategoryForm
            // Remount when the target changes (create ↔ rename A ↔ rename B):
            // react-hook-form reads defaultValues only at mount (review 2.4 F1).
            key={panel.mode === 'rename' ? panel.category.id : 'create'}
            category={panel.mode === 'rename' ? panel.category : null}
            labels={labels.form}
            onCancel={() => setPanel(null)}
            onSuccess={(mode) => handleSuccess(mode === 'create' ? labels.feedback.created : labels.feedback.renamed)}
          />
        </Card>
      ) : null}

      <div className="mt-6" data-testid="cash-categories-table">
        <DataTable columns={columns} data={categories} emptyMessage={labels.table.empty} />
      </div>
    </div>
  );
}

type CategoryFormProps = {
  /** `null` = create mode; a row = rename mode. */
  category: CashCategoryRow | null;
  labels: CategoriesManagerLabels['form'];
  onCancel: () => void;
  onSuccess: (mode: 'create' | 'rename') => void;
};

function CategoryForm({ category, labels, onCancel, onSuccess }: CategoryFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: category?.name ?? '' },
  });

  async function onSubmit(values: CategoryFormValues): Promise<void> {
    setFormError(null);
    const response = category
      ? await fetch(`/api/v1/cash-categories/${category.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name.trim() }),
        })
      : await fetch('/api/v1/cash-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name.trim() }),
        });

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    onSuccess(category ? 'rename' : 'create');
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4" data-testid="cash-category-form">
      <h4 className="text-base font-medium text-ink">{category ? labels.renameTitle : labels.createTitle}</h4>
      <div>
        <label htmlFor="category-name" className="block text-sm font-medium text-ink">
          {labels.name}
        </label>
        <Input
          id="category-name"
          maxLength={100}
          aria-invalid={Boolean(errors.name)}
          className="mt-2 w-full max-w-md"
          {...register('name')}
        />
        {errors.name ? <p className="mt-1 text-xs text-ember">{labels.requiredField}</p> : null}
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
        >
          {category ? labels.submitRename : labels.submitCreate}
        </Button>
        <Button variant="outline"
          type="button"
          onClick={onCancel}
        >
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}
