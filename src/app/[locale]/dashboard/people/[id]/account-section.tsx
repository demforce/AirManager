'use client';

/**
 * "Estratto conto" section of the scheda persona (story 13.3, AC 2,
 * R-13.3-a/b) — AirOps rebuild that MERGES the legacy `AccountPanel`
 * (balance + "Registra ricarica", story 3.1) and the legacy
 * `account/page.tsx` + `AccountStatementTable` (full paginated statement +
 * "Registra rettifica", story 3.2/3.3) into ONE embedded card, so both their
 * `DataTable`/`ExportButton`/Tailwind consumers disappear. Movements are
 * server-fetched by the parent page (`listAccountMovements`, `?page=`
 * pagination on the SAME `/people/{id}` URL — no more standalone `/account`
 * route) and passed down as `rows`; this component only owns the
 * interactive bits (top-up/rettifica panels, `router.refresh()` on success —
 * same eventually-consistent-via-refresh pattern the legacy
 * `AccountStatementTable#handleSuccess` already used, not an optimistic
 * local merge). RBAC is unchanged: the parent page's `getAccountOverview`/
 * `listAccountMovements` calls re-check the same permission the legacy pages
 * did (AD-5) — this component only decides what to SHOW.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DateInput } from '@/components/ui/date-input';
import { ExportMenu } from '@/components/ui/export-menu';
import { Field, Input, Select } from '@/components/ui/field';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatCents, formatSignedCents, parseCents } from '@/lib/money';
import type { AccountMovementTypeDto } from '@/lib/schemas/accounts';
import { formatDateOnly } from '@/lib/time';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';

export type AccountMovementRow = {
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

export type AccountSectionLabels = {
  heading: string;
  balanceLabel: string;
  noAccount: string;
  empty: string;
  pagination: { prev: string; next: string };
  table: { date: string; type: string; description: string; amount: string; recordedBy: string; actions: string; noValue: string };
  movementType: { topUp: string; adjustment: string; packagePurchase: string; flightCharge: string; flightChargeReversal: string };
  adjustmentBadge: { ofDate: string; linked: string };
  reversalBadge: { ofDate: string; linked: string };
  topUp: {
    action: string;
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
  adjustments: {
    action: string;
    rowAction: string;
    title: string;
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
};

type AccountSectionProps = {
  personId: string;
  locale: AppLocale;
  moneyLocale: 'it' | 'en';
  hasAccount: boolean;
  balanceCents: number;
  rows: AccountMovementRow[];
  page: number;
  totalPages: number;
  showActor: boolean;
  canManageFinance: boolean;
  exportHref: string;
  exportPdfHref: string;
  exportLabels: { label: string; xls: string; pdf: string };
  labels: AccountSectionLabels;
};

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function movementTypeLabel(type: AccountMovementTypeDto, labels: AccountSectionLabels['movementType']): string {
  switch (type) {
    case 'TOP_UP':
      return labels.topUp;
    case 'ADJUSTMENT':
      return labels.adjustment;
    case 'PACKAGE_PURCHASE':
      return labels.packagePurchase;
    case 'FLIGHT_CHARGE':
      return labels.flightCharge;
    case 'FLIGHT_CHARGE_REVERSAL':
      return labels.flightChargeReversal;
    default:
      return type;
  }
}

export function AccountSection({
  personId,
  locale,
  moneyLocale,
  hasAccount,
  balanceCents,
  rows,
  page,
  totalPages,
  showActor,
  canManageFinance,
  exportHref,
  exportPdfHref,
  exportLabels,
  labels,
}: AccountSectionProps) {
  const router = useRouter();
  const [topUpOpen, setTopUpOpen] = useState(false);
  // `originalMovement: null` = standalone rettifica opened from the header action.
  const [adjustPanel, setAdjustPanel] = useState<{ originalMovement: AccountMovementRow | null } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const rowById = new Map(rows.map((row) => [row.id, row]));

  function adjustmentBadgeText(row: AccountMovementRow): string {
    const original = row.reversalOfId ? rowById.get(row.reversalOfId) : undefined;
    return original ? labels.adjustmentBadge.ofDate.replace('{date}', formatDateOnly(original.effectiveDate, moneyLocale)) : labels.adjustmentBadge.linked;
  }

  function reversalBadgeText(row: AccountMovementRow): string {
    const original = row.reversalOfId ? rowById.get(row.reversalOfId) : undefined;
    return original ? labels.reversalBadge.ofDate.replace('{date}', formatDateOnly(original.effectiveDate, moneyLocale)) : labels.reversalBadge.linked;
  }

  function pageHref(targetPage: number) {
    return { pathname: `/dashboard/people/${personId}` as const, query: { page: targetPage } };
  }

  function handleTopUpSuccess(): void {
    setTopUpOpen(false);
    router.refresh();
  }

  function handleAdjustmentSuccess(): void {
    setAdjustPanel(null);
    setFeedback(labels.adjustments.success);
    router.refresh();
  }

  const cols = ['104px', '150px', '1fr', '120px', ...(showActor ? ['170px'] : []), ...(canManageFinance ? ['170px'] : [])].join(' ');

  return (
    <div className="card" data-testid="account-section">
      <div className="card-head">
        <h2 className="card-title">{labels.heading}</h2>
        <div className="spacer" />
        {feedback ? (
          <p role="status" data-testid="adjustment-feedback" className="card-sub" style={{ color: 'var(--ok)' }}>
            {feedback}
          </p>
        ) : null}
        <ExportMenu label={exportLabels.label} xlsLabel={exportLabels.xls} xlsHref={exportHref} pdfLabel={exportLabels.pdf} pdfHref={exportPdfHref} />
        {canManageFinance ? (
          <button type="button" className="btn" onClick={() => setTopUpOpen((current) => !current)} data-testid="account-topup-toggle">
            {labels.topUp.action}
          </button>
        ) : null}
        {canManageFinance ? (
          <button type="button" className="btn" onClick={() => setAdjustPanel({ originalMovement: null })} data-testid="account-adjustment-toggle">
            {labels.adjustments.action}
          </button>
        ) : null}
      </div>

      <div className="card-body">
        <div style={{ marginBottom: 18 }}>
          <div className="kpi-label">{labels.balanceLabel}</div>
          <div className="kpi-value" data-testid="account-balance" style={{ color: hasAccount && balanceCents < 0 ? 'var(--bad)' : 'var(--ink)' }}>
            {hasAccount ? formatCents(balanceCents, moneyLocale) : labels.noAccount}
          </div>
        </div>

        {topUpOpen ? (
          <div style={{ marginBottom: 18, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
            <TopUpForm personId={personId} labels={labels.topUp} onCancel={() => setTopUpOpen(false)} onSuccess={handleTopUpSuccess} />
          </div>
        ) : null}

        {adjustPanel ? (
          <div style={{ marginBottom: 18, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
            <AdjustmentForm
              // Remount when the target changes (header ↔ row A ↔ row B):
              // react-hook-form reads defaultValues only at mount.
              key={adjustPanel.originalMovement?.id ?? 'standalone'}
              personId={personId}
              originalMovement={adjustPanel.originalMovement}
              moneyLocale={moneyLocale}
              labels={labels.adjustments}
              onCancel={() => setAdjustPanel(null)}
              onSuccess={handleAdjustmentSuccess}
            />
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="fld-label" style={{ textTransform: 'none' }}>
            {labels.empty}
          </p>
        ) : (
          <div className="students">
            <div className="student-row header" data-testid="account-statement-header-row" style={{ gridTemplateColumns: cols }}>
              <div>{labels.table.date}</div>
              <div>{labels.table.type}</div>
              <div>{labels.table.description}</div>
              <div style={{ textAlign: 'right' }}>{labels.table.amount}</div>
              {showActor ? <div>{labels.table.recordedBy}</div> : null}
              {canManageFinance ? <div>{labels.table.actions}</div> : null}
            </div>
            {rows.map((row) => (
              <div key={row.id} className="student-row" data-testid="account-movement-row" style={{ gridTemplateColumns: cols }}>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                  {formatDateOnly(row.effectiveDate, moneyLocale)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <span>{movementTypeLabel(row.type, labels.movementType)}</span>
                  {row.type === 'ADJUSTMENT' && row.reversalOfId ? (
                    <span className="badge warn" data-testid="adjustment-badge">
                      {adjustmentBadgeText(row)}
                    </span>
                  ) : null}
                  {row.type === 'FLIGHT_CHARGE_REVERSAL' && row.reversalOfId ? (
                    <span className="badge bad" data-testid="reversal-badge">
                      {reversalBadgeText(row)}
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.description ?? labels.table.noValue}
                </div>
                <div className="mono num" style={{ fontWeight: 600, textAlign: 'right', color: row.amountCents >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
                  {formatSignedCents(row.amountCents, moneyLocale)}
                </div>
                {showActor ? (
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.actorEmail ?? labels.table.noValue}
                  </div>
                ) : null}
                {canManageFinance ? (
                  <div>
                    {row.hasReversal || row.type === 'PACKAGE_PURCHASE' ? null : (
                      <button type="button" className="btn mini" onClick={() => setAdjustPanel({ originalMovement: row })} data-testid={`account-adjustment-row-${row.id}`}>
                        {labels.adjustments.rowAction}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 }}>
            <Link
              href={pageHref(page - 1)}
              locale={locale}
              aria-disabled={page <= 1}
              data-testid="account-statement-page-prev"
              className={`btn ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
            >
              {labels.pagination.prev}
            </Link>
            <span className="mono" data-testid="account-statement-pagination-status">
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(page + 1)}
              locale={locale}
              aria-disabled={page >= totalPages}
              data-testid="account-statement-page-next"
              className={`btn ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
            >
              {labels.pagination.next}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// --- "Registra ricarica" (story 3.1, AC 2) ----------------------------------

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

function TopUpForm({
  personId,
  labels,
  onCancel,
  onSuccess,
}: {
  personId: string;
  labels: AccountSectionLabels['topUp'];
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TopUpFormValues>({
    resolver: zodResolver(topUpFormSchema),
    defaultValues: { amount: '', paymentMethod: 'CASH', effectiveDate: todayDateOnly(), description: '' },
  });

  async function onSubmit(values: TopUpFormValues): Promise<void> {
    setFormError(null);
    const amountCents = parseCents(values.amount);

    let response: Response;
    try {
      response = await fetch(`/api/v1/people/${personId}/account/top-ups`, {
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

    onSuccess();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="account-topup-form">
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
          <DateInput aria-invalid={Boolean(errors.effectiveDate)} {...register('effectiveDate')} />
        </Field>
        <Field label={labels.description} wide>
          <Input {...register('description')} />
        </Field>
      </div>
      {formError ? (
        <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 10 }}>
          {formError}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="account-topup-submit">
          {labels.submit}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}

// --- "Registra rettifica" (story 3.3, AC 1) ---------------------------------

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

function AdjustmentForm({
  personId,
  originalMovement,
  moneyLocale,
  labels,
  onCancel,
  onSuccess,
}: {
  personId: string;
  originalMovement: AccountMovementRow | null;
  moneyLocale: 'it' | 'en';
  labels: AccountSectionLabels['adjustments'];
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();

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
    const amountCents = parseCents(values.amount);
    let response: Response;
    try {
      response = await fetch(`/api/v1/people/${personId}/account/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        body: JSON.stringify({
          amountCents,
          reason: values.reason.trim(),
          originalMovementId: originalMovement?.id ?? null,
        }),
      });
    } catch {
      setFormError(labels.genericError);
      return;
    }
    regenerateIdempotencyKey();

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    onSuccess();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="account-adjustment-form">
      <div className="fld-label" style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', textTransform: 'none' }}>
        {labels.title}
      </div>
      {originalMovement ? (
        <p className="fld-label" style={{ textTransform: 'none', marginTop: 4 }}>
          {labels.linkedTo.replace('{date}', formatDateOnly(originalMovement.effectiveDate, moneyLocale))}
        </p>
      ) : null}
      <div className="form-grid" style={{ marginTop: 10 }}>
        <Field label={labels.amount}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            <Input inputMode="decimal" placeholder="-0,00" aria-invalid={Boolean(errors.amount)} {...register('amount')} />
            <p className="fld-label" style={{ textTransform: 'none' }}>
              {labels.amountHint}
            </p>
            {errors.amount ? (
              <p role="alert" className="fld-label" style={{ color: 'var(--bad)' }}>
                {labels.invalidAmount}
              </p>
            ) : null}
          </div>
        </Field>
        <Field label={labels.reason} wide>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            <Input aria-invalid={Boolean(errors.reason)} {...register('reason')} />
            {errors.reason ? (
              <p role="alert" className="fld-label" style={{ color: 'var(--bad)' }}>
                {labels.requiredReason}
              </p>
            ) : null}
          </div>
        </Field>
      </div>
      {formError ? (
        <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 6 }}>
          {formError}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="account-adjustment-submit">
          {labels.submit}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
