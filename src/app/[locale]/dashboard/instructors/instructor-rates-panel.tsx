'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { formatCents, parseCents } from '@/lib/money';
import type { InstructorRateItemDto } from '@/lib/schemas/people';
import { formatDateOnly, formatDateTime } from '@/lib/time';

export type InstructorRatesPanelLabels = {
  current: string;
  noCurrentRate: string;
  loadError: string;
  price: string;
  validFrom: string;
  submit: string;
  rateAdded: string;
  requiredField: string;
  invalidPrice: string;
  invalidDate: string;
  genericError: string;
  conflictError: string;
  historyTitle: string;
  historyEmpty: string;
  historyActor: string;
  historyWhen: string;
  /** `{count}` placeholder, client-filled — the hidden-row count behind the "show all" button. */
  historyShowAll: string;
};

type ToastHandle = { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };

type InstructorRatesPanelProps = {
  personId: string;
  toast: ToastHandle;
  labels: InstructorRatesPanelLabels;
};

/**
 * Local, UI-only schema (never sent over the wire): the price input stays a
 * euro-with-2-decimals string end to end while the user types (same
 * pattern/rationale as `fleet/aircraft-editor.tsx`'s `newRateFormSchema`) —
 * only `onSubmit` converts it to integer cents via `parseCents`, exactly at
 * the API-call boundary (AD-2).
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

/** `<input type="date">` default — same browser-local-time convention as `fleet/aircraft-editor.tsx#todayDateOnly`. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Pure fetch, no setState (see the mount effect's own doc-comment for why). */
async function fetchRatesHistory(personId: string): Promise<InstructorRateItemDto[]> {
  const response = await fetch(`/api/v1/people/${personId}/instructor-rates`);
  if (!response.ok) return [];
  return (await response.json()) as InstructorRateItemDto[];
}

/** Rate history is append-only (AD-4), so it only ever grows: show the most recent rows and keep the rest one click away — same cap and "Mostra tutte (N)" affordance as the fleet editor's own twin (`fleet/aircraft-editor.tsx#HISTORY_VISIBLE_COUNT`, story 13.4/R3). */
const HISTORY_VISIBLE_COUNT = 5;

/** The row with the MAXIMUM `validFrom <= today` (AD-4) — `history` is already `validFrom desc` from the API, so the first match IS the current one. Derived client-side, same pattern as `fleet/aircraft-editor.tsx#currentRateOf` (its own twin), rather than a separate server-computed prop. */
function currentRateOf(history: InstructorRateItemDto[]): InstructorRateItemDto | null {
  const today = todayDateOnly();
  return history.find((rate) => rate.validFrom <= today) ?? null;
}

/**
 * "Tariffa allievo" (student-charged rate, D8) section — the deliberate twin
 * of `fleet/aircraft-editor.tsx`'s `RatesSection`; same API/append-only
 * historicization (`instructor-rates.service.ts`, story 4.2, AC 1/2, AD-4),
 * unchanged since. Story 12.7 MOVES this panel here (the instructor editor,
 * `instructor-editor.tsx`) from the `people/[id]` scheda, where story 12.6
 * had temporarily left it — the DISTINCT payout rate (what the airfield
 * pays the instructor, `InstructorProfile.payoutRateCents`) lives in its own
 * section right next to it, clearly labeled so the two rates are never
 * confused. No outer heading here (rendered by the parent's own `Section`
 * wrapper, same convention as `pilot-editor.tsx`'s sub-sections).
 */
export function InstructorRatesPanel({ personId, toast, labels }: InstructorRatesPanelProps) {
  // Money must follow the page locale (review 3.1 F1 — mandatory, same
  // pattern as `account-panel.tsx`): without this, `formatCents`' default
  // renders Italian separators on /en too.
  const moneyLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);
  const [history, setHistory] = useState<InstructorRateItemDto[] | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewInstructorRateFormValues>({
    resolver: zodResolver(newInstructorRateFormSchema),
    defaultValues: { price: '', validFrom: todayDateOnly() },
  });

  /** Same "custom message marker vs plain required" split as `fleet/aircraft-editor.tsx#RatesSection`'s own twin form. */
  function priceFieldError(fieldError: { message?: string } | undefined): string | undefined {
    if (!fieldError) return undefined;
    return fieldError.message === 'invalidPrice' ? labels.invalidPrice : labels.requiredField;
  }

  // Fetch-on-mount effect: the async function is declared INSIDE the effect
  // (same pattern as `fleet/aircraft-editor.tsx`'s `RatesSection`) rather
  // than referencing an outer-scope helper — that shape is what keeps the
  // React Compiler's `react-hooks/set-state-in-effect` check happy.
  useEffect(() => {
    let cancelled = false;
    void fetchRatesHistory(personId).then((result) => {
      if (!cancelled) setHistory(result);
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

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
    toast.show(labels.rateAdded, 'ok');
    setHistory(await fetchRatesHistory(personId));
  }

  const current = history ? currentRateOf(history) : null;

  return (
    <div data-testid="instructor-rates-panel">
      <p className="fld-label" style={{ textTransform: 'none' }}>
        {labels.current}:{' '}
        <span className="mono" data-testid="instructor-rates-current">
          {current ? `${formatCents(current.priceCentsPerHour, moneyLocale)}/h` : labels.noCurrentRate}
        </span>
      </p>

      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="instructor-rates-form" style={{ marginTop: 10 }}>
        <div className="form-grid">
          <Field label={labels.price} error={priceFieldError(errors.price)}>
            <Input inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(errors.price)} {...register('price')} />
          </Field>
          <Field label={labels.validFrom} error={errors.validFrom ? labels.requiredField : undefined}>
            <DateInput aria-invalid={Boolean(errors.validFrom)} {...register('validFrom')} />
          </Field>
        </div>
        {formError ? (
          <p role="alert" data-testid="instructor-rates-form-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
            {formError}
          </p>
        ) : null}
        <div style={{ marginTop: 10 }}>
          <button type="submit" disabled={isSubmitting} className="btn" data-testid="instructor-rates-submit">
            {labels.submit}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 14 }}>
        <div className="fld-label" style={{ fontWeight: 600 }}>
          {labels.historyTitle}
        </div>
        {history === null ? null : history.length === 0 ? (
          <p className="fld-label" style={{ marginTop: 6, textTransform: 'none' }}>
            {labels.historyEmpty}
          </p>
        ) : (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {(showAllHistory ? history : history.slice(0, HISTORY_VISIBLE_COUNT)).map((rate, i) => (
              <div
                key={rate.id}
                data-testid="instructor-rate-history-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 90px 1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  padding: '6px 10px',
                  background: i % 2 === 0 ? 'var(--panel)' : 'var(--panel-2)',
                  fontSize: 12,
                }}
              >
                <span className="mono">{formatDateOnly(rate.validFrom, moneyLocale)}</span>
                <span className="mono num" style={{ fontWeight: 600 }}>
                  {formatCents(rate.priceCentsPerHour, moneyLocale)}/h
                </span>
                <span style={{ color: 'var(--ink-2)' }} title={labels.historyActor}>
                  {rate.actorEmail}
                </span>
                <span className="mono" style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }} title={labels.historyWhen}>
                  {formatDateTime(new Date(rate.createdAt))}
                </span>
              </div>
            ))}
          </div>
        )}
        {history !== null && !showAllHistory && history.length > HISTORY_VISIBLE_COUNT ? (
          <button
            type="button"
            className="btn"
            onClick={() => setShowAllHistory(true)}
            data-testid="instructor-rate-history-show-all"
            style={{ marginTop: 8 }}
          >
            {labels.historyShowAll.replace('{count}', String(history.length - HISTORY_VISIBLE_COUNT))}
          </button>
        ) : null}
      </div>
    </div>
  );
}
