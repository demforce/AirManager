'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { ExpiryItemDto, ExpiryStatusDto } from '@/lib/schemas/expiries';
import { formatDateOnly } from '@/lib/time';
import { ExpiryStatusBadge } from './expiry-status-badge';
import { TruncatedCell } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { DatePicker, type DatePickerLabels } from '@/components/ui/date-picker';

export type MyExpiriesLabels = {
  empty: string;
  table: {
    type: string;
    issuedAt: string;
    expiresAt: string;
    notes: string;
    noNotes: string;
    statusHeader: string;
    status: Record<ExpiryStatusDto, string>;
    pendingBadge: string;
    pendingHint: string;
  };
  proposeAction: string;
  form: {
    title: string;
    issuedAt: string;
    expiresAt: string;
    notes: string;
    submit: string;
    cancel: string;
    requiredField: string;
    invalidRange: string;
    conflictError: string;
    genericError: string;
    success: string;
    datePicker: DatePickerLabels;
  };
};

type MyExpiriesProps = {
  expiries: ExpiryItemDto[];
  labels: MyExpiriesLabels;
};

/**
 * "Le mie scadenze" (story 6.2, AC 2, Task 5) — a titolare's own-access
 * view: read-only status table plus a "Proponi aggiornamento" action per
 * row. Proposing replaces the row's data with the pending values LOCALLY
 * (the `Expiry` itself is untouched server-side, AC 2) and disables further
 * proposals on that row with a hint, exactly mirroring what
 * `listPersonExpiries` would show on next load.
 */
export function MyExpiries({ expiries: initialExpiries, labels }: MyExpiriesProps) {
  const [expiries, setExpiries] = useState(initialExpiries);
  const [proposingId, setProposingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleProposed(expiryId: string, pendingProposal: NonNullable<ExpiryItemDto['pendingProposal']>): void {
    setProposingId(null);
    setFeedback(labels.form.success);
    setExpiries((current) => current.map((expiry) => (expiry.id === expiryId ? { ...expiry, pendingProposal } : expiry)));
  }

  if (expiries.length === 0) {
    return <p className="text-sm text-mid-gray">{labels.empty}</p>;
  }

  return (
    <div data-testid="my-expiries">
      {feedback ? (
        <p role="status" data-testid="my-expiries-feedback" className="mb-4 text-sm text-[#346538]">
          {feedback}
        </p>
      ) : null}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-[0.05em] text-mid-gray">
              <th className="py-2 pr-4 font-medium">{labels.table.type}</th>
              <th className="py-2 pr-4 font-medium">{labels.table.issuedAt}</th>
              <th className="py-2 pr-4 font-medium">{labels.table.expiresAt}</th>
              <th className="py-2 pr-4 font-medium">{labels.table.statusHeader}</th>
              <th className="py-2 pr-4 font-medium">{labels.table.notes}</th>
              <th className="py-2 font-medium">{labels.proposeAction}</th>
            </tr>
          </thead>
          <tbody>
            {expiries.map((expiry) => (
              <MyExpiryRow
                key={expiry.id}
                expiry={expiry}
                isProposing={proposingId === expiry.id}
                labels={labels}
                onOpenPropose={() => setProposingId(expiry.id)}
                onCancelPropose={() => setProposingId(null)}
                onProposed={(pendingProposal) => handleProposed(expiry.id, pendingProposal)}
              />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

type MyExpiryRowProps = {
  expiry: ExpiryItemDto;
  isProposing: boolean;
  labels: MyExpiriesLabels;
  onOpenPropose: () => void;
  onCancelPropose: () => void;
  onProposed: (pendingProposal: NonNullable<ExpiryItemDto['pendingProposal']>) => void;
};

function MyExpiryRow({ expiry, isProposing, labels, onOpenPropose, onCancelPropose, onProposed }: MyExpiryRowProps) {
  const moneyLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);

  return (
    <>
      <tr data-testid="my-expiry-row" className="border-b border-hairline align-top text-ink">
        <td className="py-3 pr-4">
          <TruncatedCell value={expiry.typeName} className="max-w-[180px] font-medium" />
          {expiry.pendingProposal ? (
            <Badge data-testid="my-expiry-pending-badge" className="mt-1">
              {labels.table.pendingBadge}
            </Badge>
          ) : null}
        </td>
        <td className="py-3 pr-4 whitespace-nowrap">{formatDateOnly(expiry.issuedAt, moneyLocale)}</td>
        <td className="py-3 pr-4 whitespace-nowrap">{formatDateOnly(expiry.expiresAt, moneyLocale)}</td>
        <td className="py-3 pr-4">
          <ExpiryStatusBadge status={expiry.status} label={labels.table.status[expiry.status]} data-testid="my-expiry-status-badge" />
        </td>
        <td className="py-3 pr-4 text-mid-gray">{expiry.notes ?? labels.table.noNotes}</td>
        <td className="py-3">
          {expiry.pendingProposal ? (
            <span className="text-xs text-mid-gray">{labels.table.pendingHint}</span>
          ) : (
            <Button variant="outline" size="sm"
              type="button"
              onClick={onOpenPropose}
            >
              {labels.proposeAction}
            </Button>
          )}
        </td>
      </tr>
      {isProposing ? (
        <tr data-testid="propose-expiry-row">
          <td colSpan={6} className="py-4">
            <ProposeExpiryForm expiry={expiry} labels={labels.form} onCancel={onCancelPropose} onSuccess={onProposed} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

const proposeFormSchema = z
  .object({
    issuedAt: z.string().trim().min(1),
    expiresAt: z.string().trim().min(1),
    notes: z.string(),
  })
  .refine((value) => value.expiresAt >= value.issuedAt, { message: 'invalidRange', path: ['expiresAt'] });

type ProposeFormValues = z.infer<typeof proposeFormSchema>;

type ProposeExpiryFormProps = {
  expiry: ExpiryItemDto;
  labels: MyExpiriesLabels['form'];
  onCancel: () => void;
  onSuccess: (pendingProposal: NonNullable<ExpiryItemDto['pendingProposal']>) => void;
};

/**
 * "Proponi aggiornamento" form (story 6.2, AC 2) — prefilled with the
 * CURRENT values (Dev Notes: "form prefilled coi valori correnti"), so the
 * titolare edits just what changed (typically the new expiry date after a
 * renewal). Conditionally mounted (only while `isProposing`), so
 * `defaultValues` are read fresh every time (same fix as
 * `expiries-panel.tsx`'s `EditExpiryRowForm`).
 */
function ProposeExpiryForm({ expiry, labels, onCancel, onSuccess }: ProposeExpiryFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [issuedAtValue, setIssuedAtValue] = useState(expiry.issuedAt);
  const [expiresAtValue, setExpiresAtValue] = useState(expiry.expiresAt);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProposeFormValues>({
    resolver: zodResolver(proposeFormSchema),
    defaultValues: { issuedAt: expiry.issuedAt, expiresAt: expiry.expiresAt, notes: expiry.notes ?? '' },
  });

  async function onSubmit(values: ProposeFormValues): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/expiries/${expiry.id}/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issuedAt: values.issuedAt,
        expiresAt: values.expiresAt,
        notes: values.notes.trim() === '' ? undefined : values.notes.trim(),
      }),
    });

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    const created = (await response.json()) as NonNullable<ExpiryItemDto['pendingProposal']>;
    onSuccess(created);
  }

  const inputClasses = cn(inputBaseClasses, 'mt-2 min-h-[44px] w-full');

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="space-y-4 rounded-nested border border-hairline p-4"
      data-testid="propose-expiry-form"
    >
      <h4 className="text-base font-medium text-ink">{labels.title}</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <DatePicker
            id={`propose-issued-at-${expiry.id}`}
            label={labels.issuedAt}
            value={issuedAtValue}
            onChange={(next) => {
              setIssuedAtValue(next);
              setValue('issuedAt', next);
            }}
            labels={labels.datePicker}
            ariaInvalid={Boolean(errors.issuedAt)}
          />
          {errors.issuedAt ? <p className="mt-1 text-xs text-ember">{labels.requiredField}</p> : null}
        </div>
        <div>
          <DatePicker
            id={`propose-expires-at-${expiry.id}`}
            label={labels.expiresAt}
            value={expiresAtValue}
            onChange={(next) => {
              setExpiresAtValue(next);
              setValue('expiresAt', next);
            }}
            labels={labels.datePicker}
            ariaInvalid={Boolean(errors.expiresAt)}
          />
          {errors.expiresAt ? <p className="mt-1 text-xs text-ember">{labels.invalidRange}</p> : null}
        </div>
        <div>
          <label htmlFor={`propose-notes-${expiry.id}`} className="block text-sm font-medium text-ink">
            {labels.notes}
          </label>
          <input id={`propose-notes-${expiry.id}`} maxLength={500} className={inputClasses} {...register('notes')} />
        </div>
      </div>

      {formError ? (
        <p role="alert" data-testid="propose-expiry-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="min-h-[44px]"
        >
          {labels.submit}
        </Button>
        <Button variant="outline"
          type="button"
          onClick={onCancel}
          className="min-h-[44px]"
        >
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}
