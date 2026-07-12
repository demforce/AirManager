'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';
import { formatCents, parseCents } from '@/lib/money';
import type { InstructorRateItemDto } from '@/lib/schemas/people';
import { formatDateOnly, formatDateTime } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export type InstructorRatesPanelLabels = {
  heading: string;
  current: string;
  noCurrentRate: string;
  loadError: string;
  newRateTitle: string;
  addAction: string;
  price: string;
  validFrom: string;
  submit: string;
  cancel: string;
  requiredField: string;
  invalidPrice: string;
  invalidDate: string;
  genericError: string;
  conflictError: string;
  readOnlyHint: string;
  historyTitle: string;
  historyEmpty: string;
  historyValidFrom: string;
  historyPrice: string;
  historyActor: string;
  historyWhen: string;
};

type InstructorRatesPanelProps = {
  personId: string;
  /**
   * Effective-today rate (AD-4), computed server-side via
   * `getEffectiveInstructorRate(actor, personId, today)` and passed as a
   * prop — never recomputed client-side, same rationale as
   * `AircraftRow.currentRatePriceCentsPerHour` (`aircraft-manager.tsx`).
   */
  currentRatePriceCentsPerHour: number | null;
  /**
   * Derived server-side from `hasPermission(actor, 'settings.manage')` AND
   * the instructor profile being active (`instructorProfile.deactivatedAt
   * === null`) — hides the "Nuova tariffa" form otherwise (a deactivated
   * instructor's rates stay visible, read-only, per the story's Dev Notes).
   * `createInstructorRate`'s own `authorize(actor, 'settings.manage')` and
   * active-profile check remain the real guardians (AD-5).
   */
  canAddRate: boolean;
  labels: InstructorRatesPanelLabels;
};

/**
 * Local, UI-only schema (never sent over the wire): the price input stays a
 * euro-with-2-decimals string end to end while the user types (same
 * pattern/rationale as `aircraft-manager.tsx`'s `newRateFormSchema`) — only
 * `onSubmit` converts it to integer cents via `parseCents`, exactly at the
 * API-call boundary (AD-2).
 */
const newInstructorRateFormSchema = z
  .object({
    price: z.string().trim().min(1),
    validFrom: z.string().trim().min(1),
  })
  .refine(
    (values) => {
      let cents: number;
      try {
        cents = parseCents(values.price);
      } catch {
        return false;
      }
      return cents > 0 && cents <= 2_147_483_647;
    },
    { message: 'invalidPrice', path: ['price'] },
  );

type NewInstructorRateFormValues = z.infer<typeof newInstructorRateFormSchema>;

/** `<input type="date">` default — same browser-local-time convention as `aircraft-manager.tsx#todayDateOnly`. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "Tariffe istruttore" section of the "scheda persona" (story 4.2, AC 1/2,
 * AD-4) — the deliberate twin of `aircraft-manager.tsx`'s `RatesPanel`, just
 * embedded directly on the person page (rendered only when the person has an
 * instructor profile) rather than opened from a per-row action. Shows the
 * current rate (from `currentRatePriceCentsPerHour`, server-computed), the
 * full append-only history (fetched once per mount, i.e. per
 * `key={personId}` remount), and — for `canAddRate` actors only — a "Nuova
 * tariffa" form.
 */
export function InstructorRatesPanel({ personId, currentRatePriceCentsPerHour, canAddRate, labels }: InstructorRatesPanelProps) {
  // Money must follow the page locale (review 3.1 F1 — mandatory, same
  // pattern as `account-panel.tsx`): without this, `formatCents`' default
  // renders Italian separators on /en too.
  const moneyLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);
  const router = useRouter();
  const [history, setHistory] = useState<InstructorRateItemDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewInstructorRateFormValues>({
    resolver: zodResolver(newInstructorRateFormSchema),
    defaultValues: { price: '', validFrom: todayDateOnly() },
  });

  // Fetch-on-mount effect: the async function is declared INSIDE the effect
  // (same pattern as `aircraft-manager.tsx`'s `RatesPanel`/`HourMeterAdjustmentPanel`)
  // rather than referencing an outer-scope helper — that shape is what keeps
  // the React Compiler's `react-hooks/set-state-in-effect` check happy.
  useEffect(() => {
    let cancelled = false;
    async function loadHistoryOnMount(): Promise<void> {
      const response = await fetch(`/api/v1/people/${personId}/instructor-rates`);
      if (cancelled) return;
      if (!response.ok) {
        setLoadError(true);
        return;
      }
      setLoadError(false);
      const body = (await response.json()) as InstructorRateItemDto[];
      setHistory(body);
    }
    void loadHistoryOnMount();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  /**
   * Refetches the history after a successful submit (an `await` inside the
   * `onSubmit` event handler, not inside a `useEffect` body — a distinct call
   * site from the mount effect above, deliberately not shared, to keep both
   * shapes simple and each `set-state-in-effect`-safe on its own terms).
   */
  async function refetchHistory(): Promise<void> {
    const response = await fetch(`/api/v1/people/${personId}/instructor-rates`);
    if (!response.ok) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    const body = (await response.json()) as InstructorRateItemDto[];
    setHistory(body);
  }

  async function onSubmit(values: NewInstructorRateFormValues): Promise<void> {
    setFormError(null);
    // Boundary conversion (AD-2): the user types euros, the wire format is
    // always integer cents — never a float past this point.
    const priceCentsPerHour = parseCents(values.price);
    const response = await fetch(`/api/v1/people/${personId}/instructor-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceCentsPerHour, validFrom: values.validFrom }),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = (body as { error?: { code?: string } } | null)?.error?.code;
      setFormError(code === 'CONFLICT' ? labels.conflictError : labels.genericError);
      return;
    }

    reset({ price: '', validFrom: todayDateOnly() });
    setFormOpen(false);
    setFeedback(labels.submit);
    await refetchHistory();
    // The current-rate prop is server-computed (page.tsx) — refresh the page
    // data so it reflects the newly added rate (AD-4), same pattern as
    // `aircraft-manager.tsx`'s `handleFormSuccess`.
    router.refresh();
  }

  return (
    <Card className="p-6" data-testid="instructor-rates-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{labels.heading}</h3>
        {canAddRate && !formOpen ? (
          <Button variant="outline" size="sm"
            type="button"
            onClick={() => setFormOpen(true)}
          >
            {labels.addAction}
          </Button>
        ) : null}
      </div>

      {feedback ? (
        <p role="status" data-testid="instructor-rates-feedback" className="mt-4 text-sm text-[#346538]">
          {feedback}
        </p>
      ) : null}

      <div className="mt-6">
        <span className="text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">{labels.current}</span>
        <p data-testid="instructor-rates-current" className="mt-1 text-2xl font-medium text-ink">
          {currentRatePriceCentsPerHour === null ? labels.noCurrentRate : `${formatCents(currentRatePriceCentsPerHour, moneyLocale)}/h`}
        </p>
      </div>

      {formOpen ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="mt-6 space-y-5">
          <h4 className="text-base font-medium text-ink">{labels.newRateTitle}</h4>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="instructor-rate-price" className="block text-sm font-medium text-ink">
                {labels.price}
              </label>
              <Input
                id="instructor-rate-price"
                inputMode="decimal"
                placeholder="0,00"
                aria-invalid={Boolean(errors.price)}
                className="mt-2 w-full"
                {...register('price')}
              />
              {errors.price ? <p className="mt-1 text-xs text-ember">{labels.invalidPrice}</p> : null}
            </div>
            <div>
              <label htmlFor="instructor-rate-valid-from" className="block text-sm font-medium text-ink">
                {labels.validFrom}
              </label>
              <Input
                id="instructor-rate-valid-from"
                type="date"
                aria-invalid={Boolean(errors.validFrom)}
                className="mt-2 w-full"
                {...register('validFrom')}
              />
              {errors.validFrom ? <p className="mt-1 text-xs text-ember">{labels.invalidDate}</p> : null}
            </div>
          </div>

          {formError ? (
            <p role="alert" data-testid="instructor-rates-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
              {formError}
            </p>
          ) : null}

          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={isSubmitting}
            >
              {labels.submit}
            </Button>
            <Button variant="outline"
              type="button"
              onClick={() => {
                setFormOpen(false);
                setFormError(null);
                reset({ price: '', validFrom: todayDateOnly() });
              }}
            >
              {labels.cancel}
            </Button>
          </div>
        </form>
      ) : !canAddRate ? (
        <p className="mt-6 text-sm text-mid-gray">{labels.readOnlyHint}</p>
      ) : null}

      <div className="mt-8">
        <h4 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{labels.historyTitle}</h4>
        {loadError ? <p className="mt-3 text-sm text-ember">{labels.loadError}</p> : null}
        {!loadError && history !== null && history.length === 0 ? (
          <p className="mt-3 text-sm text-mid-gray">{labels.historyEmpty}</p>
        ) : null}
        {!loadError && history !== null && history.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-[0.05em] text-mid-gray">
                  <th className="py-2 pr-4 font-medium">{labels.historyValidFrom}</th>
                  <th className="py-2 pr-4 font-medium">{labels.historyPrice}</th>
                  <th className="py-2 pr-4 font-medium">{labels.historyActor}</th>
                  <th className="py-2 font-medium">{labels.historyWhen}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id} data-testid="instructor-rate-history-row" className="border-b border-hairline text-ink">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDateOnly(entry.validFrom, moneyLocale)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatCents(entry.priceCentsPerHour, moneyLocale)}/h</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{entry.actorEmail}</td>
                    <td className="py-2 whitespace-nowrap text-mid-gray">{formatDateTime(new Date(entry.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
