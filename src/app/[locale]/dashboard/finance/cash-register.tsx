'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { useRouter } from '@/i18n/navigation';
import { buildExportHref } from '@/lib/export-href';
import { formatSignedCents, parseCents } from '@/lib/money';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';

export type CashMovementRow = {
  id: string;
  categoryId: string;
  categoryName: string;
  amountCents: number;
  effectiveDate: string;
  description: string | null;
  actorEmail: string;
  /** Set on a storno row — drives the "storno di ..." badge (AD-3, same pattern as the 3.3 adjustment badge). */
  reversalOfId: string | null;
  /** True when a linked storno already exists — hides the row's "Storna" action. */
  hasReversal: boolean;
  /** True for the automatic top-up twin (story 3.1) — never reversible from the register (Dev Notes). */
  isAutomatic: boolean;
};

export type CashCategoryOption = {
  id: string;
  name: string;
  isActive: boolean;
  /** Reserved for automatic flows — excluded from the new-movement picker (review 3.4 F1). */
  isSystem: boolean;
};

export type CashRegisterFilters = {
  from: string;
  to: string;
  categoryId: string;
  sign: '' | 'in' | 'out';
};

export type CashRegisterLabels = {
  newMovement: string;
  filters: { from: string; to: string; category: string; sign: string; allCategories: string; allSigns: string; signIn: string; signOut: string };
  table: {
    date: string;
    category: string;
    description: string;
    amount: string;
    recordedBy: string;
    actions: string;
    noValue: string;
    empty: string;
  };
  /** Badge on a storno row; `{date}` is replaced with the original movement's date when it is on the same page. */
  reversalOfDate: string;
  /** Badge fallback when the original movement is not on the current page. */
  reversalLinked: string;
  /** Badge on the automatic top-up twin rows (story 3.1). */
  automaticBadge: string;
  form: {
    title: string;
    direction: string;
    directionIn: string;
    directionOut: string;
    category: string;
    amount: string;
    amountHint: string;
    effectiveDate: string;
    description: string;
    submit: string;
    cancel: string;
    invalidAmount: string;
    requiredField: string;
    conflictError: string;
    genericError: string;
    success: string;
  };
  reverse: {
    action: string;
    reason: string;
    confirm: string;
    cancel: string;
    requiredReason: string;
    conflictError: string;
    genericError: string;
    success: string;
  };
};

type CashRegisterProps = {
  rows: CashMovementRow[];
  /** Every category (inactive included) — the filter select must cover historical movements; the new-movement picker filters to active ones itself. */
  categories: CashCategoryOption[];
  initialFilters: CashRegisterFilters;
  moneyLocale: 'it' | 'en';
  /** Story 10.1 (AC 5) — "Esporta Excel" label; the href is built here from the LIVE `filters` state. */
  exportLabel: string;
  labels: CashRegisterLabels;
};

/**
 * The cash-register section of `/dashboard/finance` (story 3.4, Task 3, AC
 * 2): URL-driven filters (period/category/sign — pattern of the people
 * search, story 2.1), a paginated table with signed colored amounts and
 * storno/automatic badges, a "Nuovo movimento" panel and a per-row two-step
 * "Storna" action. A client component so `ColumnDef`'s function-valued
 * fields never cross the server/client boundary as props (RSC lesson,
 * story 3.2). Reversibility: the "Storna" action is hidden on rows that are
 * already reversed (`hasReversal`), are themselves a storno
 * (`reversalOfId`), or are automatic top-up twins (`isAutomatic` — their
 * correction goes through the account rettifica, story 3.3, never the cash
 * register); `reverseCashMovement` re-enforces all three server-side (AD-5).
 */
export function CashRegister({ rows, categories, initialFilters, moneyLocale, exportLabel, labels }: CashRegisterProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<CashRegisterFilters>(initialFilters);
  const [panelOpen, setPanelOpen] = useState(false);
  const [reversing, setReversing] = useState<CashMovementRow | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const rowById = new Map(rows.map((row) => [row.id, row]));

  function navigate(next: CashRegisterFilters): void {
    const params = new URLSearchParams();
    if (next.from) params.set('from', next.from);
    if (next.to) params.set('to', next.to);
    if (next.categoryId) params.set('categoryId', next.categoryId);
    if (next.sign) params.set('sign', next.sign);
    const search = params.toString();
    // Any filter change resets the pagination to page 1 (the `page` param is
    // deliberately dropped here) — same behavior as the people search.
    router.push(`/dashboard/finance${search ? `?${search}` : ''}`);
  }

  function handleFilterChange(patch: Partial<CashRegisterFilters>): void {
    const next = { ...filters, ...patch };
    setFilters(next);
    navigate(next);
  }

  function handleSuccess(message: string): void {
    setPanelOpen(false);
    setReversing(null);
    setFeedback(message);
    router.refresh();
  }

  function reversalBadgeText(row: CashMovementRow): string {
    const original = row.reversalOfId ? rowById.get(row.reversalOfId) : undefined;
    return original ? labels.reversalOfDate.replace('{date}', original.effectiveDate) : labels.reversalLinked;
  }

  const columns: ColumnDef<CashMovementRow, unknown>[] = [
    {
      id: 'date',
      header: labels.table.date,
      cell: ({ row }) => row.original.effectiveDate,
    },
    {
      id: 'category',
      header: labels.table.category,
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-2">
          {row.original.categoryName}
          {row.original.reversalOfId ? (
            <span
              data-testid="cash-reversal-badge"
              className="rounded-full bg-[#FBF3DB] px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] text-[#956400]"
            >
              {reversalBadgeText(row.original)}
            </span>
          ) : null}
          {row.original.isAutomatic ? (
            <span
              data-testid="cash-automatic-badge"
              className="rounded-full bg-[#E1F3FE] px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] text-[#1F6C9F]"
            >
              {labels.automaticBadge}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'description',
      header: labels.table.description,
      cell: ({ row }) => row.original.description ?? labels.table.noValue,
    },
    {
      id: 'amount',
      header: labels.table.amount,
      cell: ({ row }) => (
        <span className={row.original.amountCents >= 0 ? 'text-[#346538]' : 'text-[#9F2F2D]'}>
          {formatSignedCents(row.original.amountCents, moneyLocale)}
        </span>
      ),
    },
    {
      id: 'actor',
      header: labels.table.recordedBy,
      cell: ({ row }) => row.original.actorEmail,
    },
    {
      id: 'actions',
      header: labels.table.actions,
      cell: ({ row }) =>
        row.original.hasReversal || row.original.reversalOfId !== null || row.original.isAutomatic ? null : (
          <button
            type="button"
            onClick={() => {
              setReversing(row.original);
              setPanelOpen(false);
            }}
            className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {labels.reverse.action}
          </button>
        ),
    },
  ];

  const selectClasses =
    'rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] outline-none transition-colors focus:border-[#2F3437]';

  // Story 10.1 (AC 5): built from the LIVE filter state (`filters`) on every render.
  const exportHref = buildExportHref(
    '/api/v1/cash-movements',
    { from: filters.from, to: filters.to, categoryId: filters.categoryId, sign: filters.sign },
    moneyLocale,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {feedback ? (
          <p role="status" data-testid="cash-feedback" className="text-sm text-[#346538]">
            {feedback}
          </p>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <ExportButton href={exportHref} label={exportLabel} testId="cash-export-button" />
          <button
            type="button"
            onClick={() => {
              setPanelOpen(true);
              setReversing(null);
            }}
            className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98]"
          >
            {labels.newMovement}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        {/* `<label htmlFor>` as a SIBLING of its control, never wrapping it
            (TD-1, AC 5): a wrapping `<label>` around a `<select>` folds every
            `<option>`'s text into the label's own accessible name (browsers
            compute it from textContent), which can accidentally collide with
            an unrelated label elsewhere on the page once option text is
            dynamic (e.g. a category name) — same footgun already fixed in
            `flights-manager.tsx`'s `FilterBar` (story 5.4) and in this same
            file's `NewMovementForm`/`ReverseForm` below (`cash-category`
            etc.); the layout classes move to a wrapping `<div>` so the
            visual result stays identical. */}
        <div className="flex flex-col gap-2 text-sm text-[#2F3437]">
          <label htmlFor="cash-filter-from">{labels.filters.from}</label>
          <input
            id="cash-filter-from"
            type="date"
            value={filters.from}
            onChange={(event) => handleFilterChange({ from: event.target.value })}
            className={selectClasses}
            data-testid="cash-filter-from"
          />
        </div>
        <div className="flex flex-col gap-2 text-sm text-[#2F3437]">
          <label htmlFor="cash-filter-to">{labels.filters.to}</label>
          <input
            id="cash-filter-to"
            type="date"
            value={filters.to}
            onChange={(event) => handleFilterChange({ to: event.target.value })}
            className={selectClasses}
            data-testid="cash-filter-to"
          />
        </div>
        <div className="flex flex-col gap-2 text-sm text-[#2F3437]">
          <label htmlFor="cash-filter-category">{labels.filters.category}</label>
          <select
            id="cash-filter-category"
            value={filters.categoryId}
            onChange={(event) => handleFilterChange({ categoryId: event.target.value })}
            className={selectClasses}
            data-testid="cash-filter-category"
          >
            <option value="">{labels.filters.allCategories}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 text-sm text-[#2F3437]">
          <label htmlFor="cash-filter-sign">{labels.filters.sign}</label>
          <select
            id="cash-filter-sign"
            value={filters.sign}
            onChange={(event) => handleFilterChange({ sign: event.target.value as CashRegisterFilters['sign'] })}
            className={selectClasses}
            data-testid="cash-filter-sign"
          >
            <option value="">{labels.filters.allSigns}</option>
            <option value="in">{labels.filters.signIn}</option>
            <option value="out">{labels.filters.signOut}</option>
          </select>
        </div>
      </div>

      {panelOpen ? (
        <div className="mt-6 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <NewMovementForm
            // System categories (e.g. "Ricariche") are written only by their
            // automatic flow — the service rejects them anyway (review 3.4 F1).
            categories={categories.filter((category) => category.isActive && !category.isSystem)}
            labels={labels.form}
            onCancel={() => setPanelOpen(false)}
            onSuccess={() => handleSuccess(labels.form.success)}
          />
        </div>
      ) : null}

      {reversing ? (
        <div className="mt-6 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <ReverseForm
            // Remount when the target row changes — react-hook-form reads
            // defaultValues only at mount (review 2.4 F1 pattern).
            key={reversing.id}
            movement={reversing}
            moneyLocale={moneyLocale}
            labels={labels.reverse}
            onCancel={() => setReversing(null)}
            onSuccess={() => handleSuccess(labels.reverse.success)}
          />
        </div>
      ) : null}

      <div className="mt-6" data-testid="cash-register-table">
        <DataTable columns={columns} data={rows} emptyMessage={labels.table.empty} />
      </div>
    </div>
  );
}

/**
 * Local, UI-only schema: the amount stays a POSITIVE euro string while the
 * user types — the entrata/uscita direction select decides the sign, applied
 * together with the `parseCents` conversion only at submit time (AD-2
 * boundary, same pattern as `TopUpForm`/`AdjustmentForm`).
 */
const newMovementFormSchema = z
  .object({
    direction: z.enum(['in', 'out']),
    categoryId: z.string().min(1),
    amount: z.string().trim().min(1),
    effectiveDate: z.string().trim().min(1),
    description: z.string(),
  })
  .refine(
    (values) => {
      let cents: number;
      try {
        cents = parseCents(values.amount);
      } catch {
        return false;
      }
      return cents > 0 && cents <= 2_147_483_647;
    },
    { message: 'invalidAmount', path: ['amount'] },
  );

type NewMovementFormValues = z.infer<typeof newMovementFormSchema>;

/** `<input type="date">` default — same convention as `TopUpForm.todayDateOnly`. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

type NewMovementFormProps = {
  /** Active categories only — a deactivated category must not receive new movements (AC 1/2). */
  categories: CashCategoryOption[];
  labels: CashRegisterLabels['form'];
  onCancel: () => void;
  onSuccess: () => void;
};

function NewMovementForm({ categories, labels, onCancel, onSuccess }: NewMovementFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewMovementFormValues>({
    resolver: zodResolver(newMovementFormSchema),
    defaultValues: {
      direction: 'in',
      categoryId: categories[0]?.id ?? '',
      amount: '',
      effectiveDate: todayDateOnly(),
      description: '',
    },
  });

  async function onSubmit(values: NewMovementFormValues): Promise<void> {
    setFormError(null);
    // Boundary conversion (AD-2): euros in the input, integer cents on the
    // wire — the direction select supplies the sign.
    const magnitudeCents = parseCents(values.amount);
    const amountCents = values.direction === 'out' ? -magnitudeCents : magnitudeCents;
    // Story TD-2 (AC 6): the key survives a network failure (the retry this
    // protects) but is regenerated once ANY HTTP response arrives.
    let response: Response;
    try {
      response = await fetch('/api/v1/cash-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        body: JSON.stringify({
          categoryId: values.categoryId,
          amountCents,
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
      // 409 = the category was deactivated in the meantime (Dev Notes).
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    onSuccess();
  }

  const inputClasses =
    'mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]';

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4" data-testid="cash-movement-form">
      <h4 className="text-base font-medium text-[#111111]">{labels.title}</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cash-direction" className="block text-sm font-medium text-[#2F3437]">
            {labels.direction}
          </label>
          <select id="cash-direction" className={inputClasses} {...register('direction')}>
            <option value="in">{labels.directionIn}</option>
            <option value="out">{labels.directionOut}</option>
          </select>
        </div>
        <div>
          <label htmlFor="cash-category" className="block text-sm font-medium text-[#2F3437]">
            {labels.category}
          </label>
          <select id="cash-category" aria-invalid={Boolean(errors.categoryId)} className={inputClasses} {...register('categoryId')}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.categoryId ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor="cash-amount" className="block text-sm font-medium text-[#2F3437]">
            {labels.amount}
          </label>
          <input
            id="cash-amount"
            inputMode="decimal"
            placeholder="0,00"
            aria-invalid={Boolean(errors.amount)}
            className={inputClasses}
            {...register('amount')}
          />
          <p className="mt-1 text-xs text-[#787774]">{labels.amountHint}</p>
          {errors.amount ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.invalidAmount}</p> : null}
        </div>
        <div>
          <label htmlFor="cash-effective-date" className="block text-sm font-medium text-[#2F3437]">
            {labels.effectiveDate}
          </label>
          <input
            id="cash-effective-date"
            type="date"
            aria-invalid={Boolean(errors.effectiveDate)}
            className={inputClasses}
            {...register('effectiveDate')}
          />
          {errors.effectiveDate ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredField}</p> : null}
        </div>
      </div>
      <div>
        <label htmlFor="cash-description" className="block text-sm font-medium text-[#2F3437]">
          {labels.description}
        </label>
        <input id="cash-description" maxLength={500} className={inputClasses} {...register('description')} />
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.submit}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}

const reverseFormSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

type ReverseFormValues = z.infer<typeof reverseFormSchema>;

type ReverseFormProps = {
  movement: CashMovementRow;
  moneyLocale: 'it' | 'en';
  labels: CashRegisterLabels['reverse'];
  onCancel: () => void;
  onSuccess: () => void;
};

/**
 * Two-step storno (AD-3, AC 2): the row action only opens this panel — the
 * reversal is recorded on explicit confirm, with a mandatory reason. A 409
 * (already reversed by a concurrent request, or an automatic movement)
 * surfaces a dedicated message instead of the generic error.
 */
function ReverseForm({ movement, moneyLocale, labels, onCancel, onSuccess }: ReverseFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReverseFormValues>({
    resolver: zodResolver(reverseFormSchema),
    defaultValues: { reason: '' },
  });

  async function onSubmit(values: ReverseFormValues): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/cash-movements/${movement.id}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: values.reason.trim() }),
    });

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    onSuccess();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4" data-testid="cash-reverse-form">
      <div>
        <h4 className="text-base font-medium text-[#111111]">
          {labels.action} — {movement.effectiveDate}, {formatSignedCents(movement.amountCents, moneyLocale)}
        </h4>
      </div>
      <div>
        <label htmlFor="cash-reverse-reason" className="block text-sm font-medium text-[#2F3437]">
          {labels.reason}
        </label>
        <input
          id="cash-reverse-reason"
          aria-invalid={Boolean(errors.reason)}
          className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          {...register('reason')}
        />
        {errors.reason ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredReason}</p> : null}
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.confirm}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
