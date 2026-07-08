'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { formatCents } from '@/lib/money';
import { paymentMethodSchema } from '@/lib/schemas/accounts';
import type { PackageTypeItemDto } from '@/lib/schemas/package-types';
import type { HourPackageItemDto } from '@/lib/schemas/packages';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';
import { useAccountRefresh } from './account-refresh-context';

export type PackagesPanelLabels = {
  heading: string;
  loadError: string;
  empty: string;
  addAction: string;
  feedback: string;
  table: {
    remaining: string;
    price: string;
    expiresAt: string;
    noExpiry: string;
    expiredBadge: string;
    /** Story 5.2 (AC 3) — literal `{duration}` placeholder, CLIENT-filled (t.raw, same pattern as `account-statement-table.tsx`'s `adjustmentOfDate`); shown only when `consumedMinutes > 0`. */
    consumedNote: string;
  };
  form: {
    title: string;
    packageType: string;
    noActiveTypes: string;
    paymentMethod: string;
    paymentMethods: { cash: string; bankTransfer: string; pos: string };
    effectiveDate: string;
    description: string;
    submit: string;
    cancel: string;
    requiredField: string;
    inactiveTypeError: string;
    genericError: string;
  };
};

type PackagesPanelProps = {
  personId: string;
  /**
   * Derived server-side from `hasPermission(actor, 'finance.manage')` (same
   * `readOnly`-style pattern as `AccountPanel`/`InstructorRatesPanel'): hides
   * the "Vendi pacchetto" action and form for anyone without it — a titolare
   * reading their OWN packages (`/account`, AC 2) always gets `false` here,
   * a staff/admin viewing the scheda persona gets `true`. `sellPackage`'s own
   * `authorize(actor, 'finance.manage')` remains the real guardian (AD-5).
   */
  canSell: boolean;
  labels: PackagesPanelLabels;
};

/**
 * `<input type="date">` default. Comment fix (story TD-1, AC 7 D3): despite
 * the "browser-local-time" wording this comment used to carry (copied
 * verbatim from the other panels' identical `todayDateOnly`), `toISOString()`
 * ALWAYS returns the UTC representation of the instant regardless of the
 * browser's timezone — this is the CURRENT UTC calendar day, not the
 * browser's local one (they only coincide when the browser's UTC offset
 * doesn't currently straddle midnight). The other panels
 * (`account-panel.tsx`, `flights-manager.tsx`) carry the identical
 * misleading comment on the identical implementation — out of this AC's
 * named scope (packages-panel.tsx:59 only), not touched here.
 */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchPackages(personId: string): Promise<HourPackageItemDto[] | null> {
  const response = await fetch(`/api/v1/people/${personId}/packages`);
  if (!response.ok) return null;
  return (await response.json()) as HourPackageItemDto[];
}

/**
 * "Pacchetti ore" section (story 4.4, AC 2) — replaces the 2.3
 * `hoursPackages` placeholder on the scheda persona, and is reused
 * read-only (`canSell={false}`) on the account statement page so the
 * titolare sees their own packages there too (Task 5). Lists every sold
 * package (type, residuo `H:MM`, price paid, scadenza or "no expiry", a
 * "scaduto" badge) and, for `canSell` actors only, a "Vendi pacchetto" form
 * (active package types, payment method, value date, optional note).
 */
export function PackagesPanel({ personId, canSell, labels }: PackagesPanelProps) {
  // Money must follow the page locale (review 3.1 F1 pattern — mandatory).
  const moneyLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);
  const [packages, setPackages] = useState<HourPackageItemDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Story TD-1, AC 8: bumps the sibling `AccountPanel`'s refresh signal on a
  // successful sale (no-op default when this panel is used outside the
  // scheda persona, see `account-refresh-context.tsx`).
  const { bump } = useAccountRefresh();

  useEffect(() => {
    let cancelled = false;
    void fetchPackages(personId).then((result) => {
      if (cancelled) return;
      if (result === null) {
        setLoadError(true);
        return;
      }
      setLoadError(false);
      setPackages(result);
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  async function handleSold(): Promise<void> {
    setFormOpen(false);
    setFeedback(labels.feedback);
    bump();
    const result = await fetchPackages(personId);
    if (result !== null) {
      setLoadError(false);
      setPackages(result);
    }
  }

  return (
    <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="packages-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">{labels.heading}</h3>
        {canSell && !formOpen ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="min-h-[44px] rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {labels.addAction}
          </button>
        ) : null}
      </div>

      {feedback ? (
        <p role="status" data-testid="packages-panel-feedback" className="mt-4 text-sm text-[#346538]">
          {feedback}
        </p>
      ) : null}

      {canSell && formOpen ? (
        <div className="mt-6">
          <SellPackageForm personId={personId} labels={labels.form} onCancel={() => setFormOpen(false)} onSuccess={() => void handleSold()} />
        </div>
      ) : null}

      <div className="mt-6">
        {loadError ? <p className="text-sm text-[#9F2F2D]">{labels.loadError}</p> : null}
        {!loadError && packages !== null && packages.length === 0 ? (
          <p className="text-sm text-[#787774]">{labels.empty}</p>
        ) : null}
        {!loadError && packages !== null && packages.length > 0 ? (
          <ul className="divide-y divide-[#EAEAEA]">
            {packages.map((pkg) => (
              <li key={pkg.id} data-testid="hour-package-row" className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-[#111111]">{pkg.typeName}</p>
                  <p className="text-xs text-[#787774]">
                    {labels.table.price} {formatCents(pkg.pricePaidCents, moneyLocale)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-right">
                    <span className="block font-[family-name:var(--font-mono,monospace)] text-base text-[#111111]">
                      {formatMinutes(pkg.remainingMinutes)}
                    </span>
                    <span className="block text-xs text-[#787774]">{labels.table.remaining}</span>
                    {pkg.consumedMinutes > 0 ? (
                      <span data-testid="hour-package-consumed-note" className="block text-xs text-[#787774]">
                        {labels.table.consumedNote.replace('{duration}', formatMinutes(pkg.consumedMinutes))}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-right">
                    <span className="block text-sm text-[#2F3437]">
                      {pkg.expiresAt ? formatDateOnly(pkg.expiresAt, moneyLocale) : labels.table.noExpiry}
                    </span>
                    <span className="block text-xs text-[#787774]">{labels.table.expiresAt}</span>
                  </span>
                  {pkg.isExpired ? (
                    <span
                      data-testid="hour-package-expired-badge"
                      className="rounded-full bg-[#FBF3DB] px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] text-[#956400]"
                    >
                      {labels.table.expiredBadge}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Local, UI-only schema (never sent over the wire as-is): the effective-date
 * and description inputs stay plain strings, mirroring `TopUpForm`. There is
 * no amount field here (Dev Notes: the price is the type's snapshot,
 * resolved server-side, never sent by the client).
 */
const sellPackageFormSchema = z.object({
  packageTypeId: z.string().trim().min(1),
  paymentMethod: paymentMethodSchema,
  effectiveDate: z.string().trim().min(1),
  description: z.string(),
});

type SellPackageFormValues = z.infer<typeof sellPackageFormSchema>;

type SellPackageFormProps = {
  personId: string;
  labels: PackagesPanelLabels['form'];
  onCancel: () => void;
  onSuccess: () => void;
};

/**
 * "Vendi pacchetto" panel (story 4.4, AC 1). Fetches the ACTIVE package-type
 * listino on mount (`GET /api/v1/package-types`, `finance.manage` — the
 * same permission this form is already gated behind) for the select's
 * options. A 409 (the selected type was deactivated between load and
 * submit, or the person got archived meanwhile) maps to a clear message,
 * same "one generic message per 409 cause" convention as
 * `packages-manager.tsx`'s form (accepted deferral, 4.3 review F2).
 */
function SellPackageForm({ personId, labels, onCancel, onSuccess }: SellPackageFormProps) {
  const [types, setTypes] = useState<PackageTypeItemDto[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();

  useEffect(() => {
    let cancelled = false;
    async function loadTypesOnMount(): Promise<void> {
      const response = await fetch('/api/v1/package-types');
      if (cancelled) return;
      if (!response.ok) {
        setTypes([]);
        return;
      }
      const body = (await response.json()) as PackageTypeItemDto[];
      setTypes(body);
    }
    void loadTypesOnMount();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SellPackageFormValues>({
    resolver: zodResolver(sellPackageFormSchema),
    defaultValues: { packageTypeId: '', paymentMethod: 'CASH', effectiveDate: todayDateOnly(), description: '' },
  });

  async function onSubmit(values: SellPackageFormValues): Promise<void> {
    setFormError(null);
    // Story TD-2 (AC 6): the key survives a network failure (the retry this
    // protects) but is regenerated once ANY HTTP response arrives.
    let response: Response;
    try {
      response = await fetch(`/api/v1/people/${personId}/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        body: JSON.stringify({
          packageTypeId: values.packageTypeId,
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
      setFormError(response.status === 409 ? labels.inactiveTypeError : labels.genericError);
      return;
    }

    onSuccess();
  }

  const noActiveTypes = types !== null && types.length === 0;

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="space-y-4 rounded-[8px] border border-[#EAEAEA] p-4"
      data-testid="sell-package-form"
    >
      <h4 className="text-base font-medium text-[#111111]">{labels.title}</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sell-package-type" className="block text-sm font-medium text-[#2F3437]">
            {labels.packageType}
          </label>
          <select
            id="sell-package-type"
            aria-invalid={Boolean(errors.packageTypeId)}
            disabled={noActiveTypes}
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437] disabled:cursor-not-allowed disabled:bg-[#F7F6F3]"
            {...register('packageTypeId')}
          >
            <option value="" disabled>
              {labels.packageType}
            </option>
            {(types ?? []).map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          {noActiveTypes ? <p className="mt-1 text-xs text-[#787774]">{labels.noActiveTypes}</p> : null}
          {errors.packageTypeId ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor="sell-package-payment-method" className="block text-sm font-medium text-[#2F3437]">
            {labels.paymentMethod}
          </label>
          <select
            id="sell-package-payment-method"
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('paymentMethod')}
          >
            <option value="CASH">{labels.paymentMethods.cash}</option>
            <option value="BANK_TRANSFER">{labels.paymentMethods.bankTransfer}</option>
            <option value="POS">{labels.paymentMethods.pos}</option>
          </select>
        </div>
        <div>
          <label htmlFor="sell-package-effective-date" className="block text-sm font-medium text-[#2F3437]">
            {labels.effectiveDate}
          </label>
          <input
            id="sell-package-effective-date"
            type="date"
            aria-invalid={Boolean(errors.effectiveDate)}
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('effectiveDate')}
          />
          {errors.effectiveDate ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor="sell-package-description" className="block text-sm font-medium text-[#2F3437]">
            {labels.description}
          </label>
          <input
            id="sell-package-description"
            maxLength={500}
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('description')}
          />
        </div>
      </div>

      {formError ? (
        <p role="alert" data-testid="sell-package-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting || noActiveTypes}
          className="min-h-[44px] rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.submit}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
