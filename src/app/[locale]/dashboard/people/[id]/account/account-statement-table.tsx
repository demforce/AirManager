'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable } from '@/components/data-table';
import { useRouter } from '@/i18n/navigation';
import { formatSignedCents, parseCents } from '@/lib/money';
import type { AccountMovementTypeDto } from '@/lib/schemas/accounts';

export type AccountStatementRow = {
  id: string;
  type: AccountMovementTypeDto;
  amountCents: number;
  effectiveDate: string;
  description: string | null;
  actorEmail?: string;
  /** Story 3.3, AC 1: the original movement this ADJUSTMENT corrects — drives the "rettifica di ..." badge. */
  reversalOfId: string | null;
  /** Story 3.3: true when a linked adjustment already exists — hides the row's "Rettifica questo movimento" action. */
  hasReversal: boolean;
};

export type AccountStatementTableLabels = {
  date: string;
  type: string;
  description: string;
  amount: string;
  recordedBy: string;
  actions: string;
  noValue: string;
  empty: string;
  movementType: { topUp: string; adjustment: string };
  /** Badge on a linked ADJUSTMENT row; `{date}` is replaced with the original movement's date when it is on the same page. */
  adjustmentOfDate: string;
  /** Badge fallback when the original movement is not on the current page. */
  adjustmentLinked: string;
};

export type AdjustmentLabels = {
  action: string;
  rowAction: string;
  title: string;
  /** Panel subtitle when opened from a row; `{date}` is replaced with the original movement's date. */
  linkedTo: string;
  amount: string;
  amountHint: string;
  reason: string;
  submit: string;
  cancel: string;
  invalidAmount: string;
  requiredReason: string;
  conflictError: string;
  genericError: string;
  success: string;
};

type AccountStatementTableProps = {
  personId: string;
  rows: AccountStatementRow[];
  /** Whether to render the "registrato da" column (AC 2, `people.read` only) — the service already omits `actorEmail` for anyone without it (AD-5). */
  showActor: boolean;
  /**
   * Derived server-side from `hasPermission(actor, 'finance.manage')` (story
   * 2.3's `readOnly` pattern): shows the "Registra rettifica" header action
   * and the per-row "Rettifica questo movimento" action. The UI hides;
   * `recordAdjustment`'s own `authorize()` remains the real guardian (AD-5).
   */
  canManageFinance: boolean;
  moneyLocale: 'it' | 'en';
  labels: AccountStatementTableLabels;
  adjustmentLabels: AdjustmentLabels;
};

function movementTypeLabel(type: AccountMovementTypeDto, labels: AccountStatementTableLabels['movementType']): string {
  switch (type) {
    case 'TOP_UP':
      return labels.topUp;
    case 'ADJUSTMENT':
      return labels.adjustment;
    default:
      return type;
  }
}

/**
 * The account statement table (story 3.2, Task 2; story 3.3, Task 3): a
 * client component so `ColumnDef`'s function-valued `cell`/`header` fields
 * never cross the server/client boundary as props (Next.js RSC forbids
 * serializing functions into a Client Component) — same reason
 * `PeopleManager` builds its own `columns` locally instead of receiving
 * them from the server page. Story 3.3 adds, for `finance.manage` actors,
 * the "Registra rettifica" header action (standalone adjustment) and a
 * per-row "Rettifica questo movimento" action that pre-links the adjustment
 * to that movement (`originalMovementId`) — hidden on rows that already
 * have one (`hasReversal`); a concurrent duplicate still surfaces as a
 * clear 409 message. Linked ADJUSTMENT rows carry a "rettifica di ..."
 * badge next to their type.
 */
export function AccountStatementTable({
  personId,
  rows,
  showActor,
  canManageFinance,
  moneyLocale,
  labels,
  adjustmentLabels,
}: AccountStatementTableProps) {
  const router = useRouter();
  // `originalMovement: null` = standalone adjustment from the header action.
  const [panel, setPanel] = useState<{ originalMovement: AccountStatementRow | null } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const rowById = new Map(rows.map((row) => [row.id, row]));

  function adjustmentBadgeText(row: AccountStatementRow): string {
    const original = row.reversalOfId ? rowById.get(row.reversalOfId) : undefined;
    return original ? labels.adjustmentOfDate.replace('{date}', original.effectiveDate) : labels.adjustmentLinked;
  }

  function handleSuccess(): void {
    setPanel(null);
    setFeedback(adjustmentLabels.success);
    // The balance in the page header and the rows (new ADJUSTMENT entry,
    // refreshed `hasReversal` flags) are server-rendered: re-render them
    // (same pattern as `AircraftManager.handleFormSuccess`).
    router.refresh();
  }

  const columns: ColumnDef<AccountStatementRow, unknown>[] = [
    {
      id: 'date',
      header: labels.date,
      cell: ({ row }) => row.original.effectiveDate,
    },
    {
      id: 'type',
      header: labels.type,
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-2">
          {movementTypeLabel(row.original.type, labels.movementType)}
          {row.original.type === 'ADJUSTMENT' && row.original.reversalOfId ? (
            <span
              data-testid="adjustment-badge"
              className="rounded-full bg-[#FBF3DB] px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] text-[#956400]"
            >
              {adjustmentBadgeText(row.original)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'description',
      header: labels.description,
      cell: ({ row }) => row.original.description ?? labels.noValue,
    },
    {
      id: 'amount',
      header: labels.amount,
      cell: ({ row }) => (
        <span className={row.original.amountCents >= 0 ? 'text-[#346538]' : 'text-[#9F2F2D]'}>
          {formatSignedCents(row.original.amountCents, moneyLocale)}
        </span>
      ),
    },
    ...(showActor
      ? ([
          {
            id: 'actor',
            header: labels.recordedBy,
            cell: ({ row }) => row.original.actorEmail ?? labels.noValue,
          },
        ] as ColumnDef<AccountStatementRow, unknown>[])
      : []),
    ...(canManageFinance
      ? ([
          {
            id: 'actions',
            header: labels.actions,
            cell: ({ row }) =>
              row.original.hasReversal ? null : (
                <button
                  type="button"
                  onClick={() => setPanel({ originalMovement: row.original })}
                  className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
                >
                  {adjustmentLabels.rowAction}
                </button>
              ),
          },
        ] as ColumnDef<AccountStatementRow, unknown>[])
      : []),
  ];

  return (
    <div>
      {canManageFinance ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          {feedback ? (
            <p role="status" data-testid="adjustment-feedback" className="text-sm text-[#346538]">
              {feedback}
            </p>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => setPanel({ originalMovement: null })}
            className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98]"
          >
            {adjustmentLabels.action}
          </button>
        </div>
      ) : null}

      {panel ? (
        <div className="mb-6 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <AdjustmentForm
            // Remount when the target changes (header ↔ row A ↔ row B):
            // react-hook-form reads defaultValues only at mount (review 2.4
            // F1 pattern) — without the key, switching rows would keep the
            // previous target's field values.
            key={panel.originalMovement?.id ?? 'standalone'}
            personId={personId}
            originalMovement={panel.originalMovement}
            labels={adjustmentLabels}
            onCancel={() => setPanel(null)}
            onSuccess={handleSuccess}
          />
        </div>
      ) : null}

      <DataTable columns={columns} data={rows} emptyMessage={labels.empty} />
    </div>
  );
}

/**
 * Local, UI-only schema (never sent over the wire): the amount stays a
 * euro string end to end while the user types — only `onSubmit` converts it
 * to integer cents via `parseCents` (`src/lib/money.ts`), exactly at the
 * API-call boundary (AD-2, same pattern as `TopUpForm`). Unlike a top-up,
 * an adjustment is SIGNED: `parseCents` accepts a leading `-` (review 3.1)
 * and the refine only rejects zero and out-of-INT-range values.
 */
const adjustmentFormSchema = z
  .object({
    amount: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500),
  })
  .refine(
    (values) => {
      let cents: number;
      try {
        cents = parseCents(values.amount);
      } catch {
        return false;
      }
      return cents !== 0 && Math.abs(cents) <= 2_147_483_647;
    },
    { message: 'invalidAmount', path: ['amount'] },
  );

type AdjustmentFormValues = z.infer<typeof adjustmentFormSchema>;

type AdjustmentFormProps = {
  personId: string;
  /** The movement this adjustment corrects (pre-fills `originalMovementId`), or `null` for a standalone rettifica. */
  originalMovement: AccountStatementRow | null;
  labels: AdjustmentLabels;
  onCancel: () => void;
  onSuccess: () => void;
};

/**
 * "Registra rettifica" panel (story 3.3, AC 1): signed EUR amount + mandatory
 * reason; `originalMovementId` is carried from the row that opened the panel,
 * never typed. A 409 (the original gained a linked adjustment in the
 * meantime) gets its own clear message instead of the generic error.
 */
function AdjustmentForm({ personId, originalMovement, labels, onCancel, onSuccess }: AdjustmentFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues: { amount: '', reason: '' },
  });

  async function onSubmit(values: AdjustmentFormValues): Promise<void> {
    setFormError(null);
    // Boundary conversion (AD-2): euros in the input, integer cents on the wire.
    const amountCents = parseCents(values.amount);
    const response = await fetch(`/api/v1/people/${personId}/account/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountCents,
        reason: values.reason.trim(),
        // The optional link is null unless the panel was opened from a row —
        // never an empty string on the wire.
        originalMovementId: originalMovement?.id ?? null,
      }),
    });

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    onSuccess();
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="space-y-4"
      data-testid="account-adjustment-form"
    >
      <div>
        <h4 className="text-base font-medium text-[#111111]">{labels.title}</h4>
        {originalMovement ? (
          <p className="mt-1 text-sm text-[#787774]">{labels.linkedTo.replace('{date}', originalMovement.effectiveDate)}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="adjustment-amount" className="block text-sm font-medium text-[#2F3437]">
            {labels.amount}
          </label>
          <input
            id="adjustment-amount"
            inputMode="decimal"
            placeholder="-0,00"
            aria-invalid={Boolean(errors.amount)}
            className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('amount')}
          />
          <p className="mt-1 text-xs text-[#787774]">{labels.amountHint}</p>
          {errors.amount ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.invalidAmount}</p> : null}
        </div>
        <div>
          <label htmlFor="adjustment-reason" className="block text-sm font-medium text-[#2F3437]">
            {labels.reason}
          </label>
          <input
            id="adjustment-reason"
            aria-invalid={Boolean(errors.reason)}
            className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('reason')}
          />
          {errors.reason ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredReason}</p> : null}
        </div>
      </div>

      {formError ? <p className="text-sm text-[#9F2F2D]">{formError}</p> : null}

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
