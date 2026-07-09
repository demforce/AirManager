'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { formatCents, formatSignedCents, parseCents } from '@/lib/money';
import { paymentMethodSchema, type AccountMovementListItemDto, type AccountOverviewDto } from '@/lib/schemas/accounts';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';
import { useAccountRefresh } from './account-refresh-context';

export type AccountPanelLabels = {
  heading: string;
  balanceLabel: string;
  noAccount: string;
  loadError: string;
  recentTitle: string;
  recentEmpty: string;
  /** Story 3.2: link to the full, paginated `/account` statement page (the drill-down behind this preview). */
  viewStatement: string;
  movementType: { topUp: string; adjustment: string; packagePurchase: string; flightCharge: string; flightChargeReversal: string };
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
};

type AccountPanelProps = {
  personId: string;
  /**
   * Derived server-side from `hasPermission(actor, 'finance.manage')`
   * (story 2.3's `readOnly` pattern) — hides the "Registra ricarica" action
   * for anyone without it. The UI hides; `recordTopUp`'s own
   * `authorize(actor, 'finance.manage')` remains the real guardian (AD-5).
   */
  canManageFinance: boolean;
  labels: AccountPanelLabels;
};

async function fetchOverview(personId: string): Promise<AccountOverviewDto | null> {
  const response = await fetch(`/api/v1/people/${personId}/account`);
  if (!response.ok) return null;
  return (await response.json()) as AccountOverviewDto;
}

/** `<input type="date">` value in the browser's local time — same convention as the student profile's `courseStartDate` field. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function movementTypeLabel(type: AccountMovementListItemDto['type'], labels: AccountPanelLabels['movementType']): string {
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

/**
 * The prepaid-account section of the "scheda persona" (story 3.1, AC 1/3):
 * replaces the 2.3 "Saldo conto" placeholder with the real balance (always
 * `SUM(amountCents)`, AD-3 — never a stored column), a "Registra ricarica"
 * action for `finance.manage` actors, and a lightweight preview of the 5
 * most recent movements. The full paginated statement is story 3.2 — not
 * built here (Dev Notes). Own-access (staff or the account holder) is
 * already enforced by the page that embeds this panel and, independently,
 * by `getAccountOverview` itself.
 */
export function AccountPanel({ personId, canManageFinance, labels }: AccountPanelProps) {
  // Money must follow the page locale (review 3.1 F1 — mandatory): without
  // this, `formatCents`' default renders Italian separators on /en too.
  const moneyLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);
  const [overview, setOverview] = useState<AccountOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  // Story TD-1, AC 8: `version` bumps whenever the sibling `PackagesPanel`
  // sells a package on the SAME scheda persona (no-op default, see
  // `account-refresh-context.tsx`) — added to this effect's dependencies so
  // a sale re-fetches the overview without a full page reload.
  const { version } = useAccountRefresh();

  useEffect(() => {
    let cancelled = false;
    void fetchOverview(personId).then((result) => {
      if (cancelled) return;
      if (!result) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      // Explicit reset (needed now that `version` can re-run this effect
      // after a prior failed attempt, TD-1 AC 8 — a stale `loadError` must
      // not hide a subsequently successful refresh forever).
      setLoadError(false);
      setOverview(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [personId, version]);

  return (
    <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="account-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">{labels.heading}</h3>
        {canManageFinance && !formOpen ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {labels.topUp.action}
          </button>
        ) : null}
      </div>

      {loading ? <p className="mt-6 text-sm text-[#787774]">…</p> : null}
      {loadError ? <p className="mt-6 text-sm text-[#9F2F2D]">{labels.loadError}</p> : null}

      {!loading && !loadError && overview ? (
        <div className="mt-6 space-y-6">
          <div>
            <span className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.balanceLabel}</span>
            <p data-testid="account-balance" className="mt-1 text-2xl font-medium text-[#111111]">
              {overview.account ? formatCents(overview.balanceCents, moneyLocale) : labels.noAccount}
            </p>
          </div>

          {formOpen ? (
            <TopUpForm
              personId={personId}
              labels={labels.topUp}
              onCancel={() => setFormOpen(false)}
              onSuccess={(next) => {
                setOverview(next);
                setFormOpen(false);
              }}
            />
          ) : null}

          <div>
            <div className="flex items-center justify-between gap-4">
              <h4 className="text-sm font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.recentTitle}</h4>
              <Link
                href={`/dashboard/people/${personId}/account`}
                className="text-xs font-medium text-[#2F3437] underline-offset-4 hover:underline"
              >
                {labels.viewStatement}
              </Link>
            </div>
            {overview.recentMovements.length === 0 ? (
              <p className="mt-3 text-sm text-[#787774]">{labels.recentEmpty}</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#EAEAEA]">
                {overview.recentMovements.map((movement) => (
                  <li
                    key={movement.id}
                    data-testid="account-movement-row"
                    className="flex items-center justify-between gap-4 py-2 text-sm"
                  >
                    <div>
                      <p className="text-[#111111]">{movementTypeLabel(movement.type, labels.movementType)}</p>
                      <p className="text-xs text-[#787774]">{movement.effectiveDate}</p>
                    </div>
                    <span
                      className={`font-[family-name:var(--font-mono,monospace)] ${
                        movement.amountCents >= 0 ? 'text-[#346538]' : 'text-[#9F2F2D]'
                      }`}
                    >
                      {formatSignedCents(movement.amountCents, moneyLocale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Local, UI-only schema (never sent over the wire): the input stays a
 * euro-with-2-decimals string end to end while the user types (Dev Notes) —
 * only `TopUpForm.onSubmit` converts it to integer cents via
 * `parseCents` (`src/lib/money.ts`), exactly at the API-call boundary, per
 * AD-2 ("l'input euro della UI si converte in centesimi ... SOLO alla
 * boundary UI"). The refine re-validates with the same `parseCents` +
 * Postgres-INTEGER-max cap the server-side `recordTopUpSchema` enforces, so
 * an invalid amount is caught client-side before the round-trip.
 */
const topUpFormSchema = z
  .object({
    amount: z.string().trim().min(1),
    paymentMethod: paymentMethodSchema,
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

type TopUpFormValues = z.infer<typeof topUpFormSchema>;

type TopUpFormProps = {
  personId: string;
  labels: AccountPanelLabels['topUp'];
  onCancel: () => void;
  onSuccess: (overview: AccountOverviewDto) => void;
};

/**
 * "Registra ricarica" panel (story 3.1, AC 2). On success, the API already
 * returns the refreshed `AccountOverviewDto` (`recordTopUp`'s return value)
 * — the parent applies it directly, no separate re-fetch needed.
 */
function TopUpForm({ personId, labels, onCancel, onSuccess }: TopUpFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();

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
    // Boundary conversion (Dev Notes/AD-2): the user types euros, the wire
    // format is always integer cents — never a float past this point.
    const amountCents = parseCents(values.amount);
    // Story TD-2 (AC 6): the key survives a network failure (the retry this
    // protects) but is regenerated once ANY HTTP response arrives.
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

    const overview = (await response.json()) as AccountOverviewDto;
    onSuccess(overview);
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="space-y-4 rounded-[8px] border border-[#EAEAEA] p-4"
      data-testid="account-topup-form"
    >
      <h4 className="text-base font-medium text-[#111111]">{labels.title}</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="topup-amount" className="block text-sm font-medium text-[#2F3437]">
            {labels.amount}
          </label>
          <input
            id="topup-amount"
            inputMode="decimal"
            placeholder="0,00"
            aria-invalid={Boolean(errors.amount)}
            className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('amount')}
          />
          {errors.amount ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.invalidAmount}</p> : null}
        </div>
        <div>
          <label htmlFor="topup-payment-method" className="block text-sm font-medium text-[#2F3437]">
            {labels.paymentMethod}
          </label>
          <select
            id="topup-payment-method"
            className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('paymentMethod')}
          >
            <option value="CASH">{labels.paymentMethods.cash}</option>
            <option value="BANK_TRANSFER">{labels.paymentMethods.bankTransfer}</option>
            <option value="POS">{labels.paymentMethods.pos}</option>
          </select>
        </div>
        <div>
          <label htmlFor="topup-effective-date" className="block text-sm font-medium text-[#2F3437]">
            {labels.effectiveDate}
          </label>
          <input
            id="topup-effective-date"
            type="date"
            aria-invalid={Boolean(errors.effectiveDate)}
            className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('effectiveDate')}
          />
          {errors.effectiveDate ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor="topup-description" className="block text-sm font-medium text-[#2F3437]">
            {labels.description}
          </label>
          <input
            id="topup-description"
            maxLength={500}
            className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('description')}
          />
        </div>
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
