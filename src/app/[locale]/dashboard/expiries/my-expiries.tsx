'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/field';
import type { ExpiryItemDto, ExpiryStatusDto } from '@/lib/schemas/expiries';
import { formatDateOnly } from '@/lib/time';

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
  };
};

type MyExpiriesProps = {
  expiries: ExpiryItemDto[];
  labels: MyExpiriesLabels;
};

const STATUS_TONE: Record<ExpiryStatusDto, BadgeTone> = { ok: 'ok', expiring: 'warn', expired: 'bad' };
const COLS = 'minmax(150px,1.4fr) 120px 120px 130px minmax(140px,1.4fr) 180px';

/**
 * "Le mie scadenze" (story 6.2, AC 2; AirOps restyle, story 12.11 AC 3) —
 * own-access view, `.students` grid instead of a raw `<table>`. SAME
 * `data-testid`s/behavior as before (`expiry-registration.spec.ts` drives
 * this exact flow) — "Proponi aggiornamento" INTATTO fino alla 12.13 (D10):
 * proposing replaces the row's data with the pending values LOCALLY (the
 * `Expiry` itself stays untouched server-side, AC 2).
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
    return (
      <div className="card" data-testid="my-expiries">
        <p style={{ padding: '16px 20px', color: 'var(--ink-3)', fontSize: 13 }}>{labels.empty}</p>
      </div>
    );
  }

  return (
    <div className="card" data-testid="my-expiries">
      {feedback ? (
        <p role="status" data-testid="my-expiries-feedback" style={{ padding: '12px 20px 0', fontSize: 12.5, color: 'var(--ok)' }}>
          {feedback}
        </p>
      ) : null}

      <div className="students">
        <div className="student-row header" style={{ gridTemplateColumns: COLS }}>
          <div>{labels.table.type}</div>
          <div>{labels.table.issuedAt}</div>
          <div>{labels.table.expiresAt}</div>
          <div>{labels.table.statusHeader}</div>
          <div>{labels.table.notes}</div>
          <div>{labels.proposeAction}</div>
        </div>
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
      </div>
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
      <div data-testid="my-expiry-row" className="student-row" style={{ gridTemplateColumns: COLS }}>
        <div>
          <div className="student-name">{expiry.typeName}</div>
          {expiry.pendingProposal ? (
            <span data-testid="my-expiry-pending-badge" className="badge" style={{ marginTop: 4, fontSize: 10 }}>
              {labels.table.pendingBadge}
            </span>
          ) : null}
        </div>
        <div className="mono" style={{ fontSize: 12 }}>
          {formatDateOnly(expiry.issuedAt, moneyLocale)}
        </div>
        <div className="mono" style={{ fontSize: 12 }}>
          {formatDateOnly(expiry.expiresAt, moneyLocale)}
        </div>
        <div data-testid="my-expiry-status-badge">
          <Badge tone={STATUS_TONE[expiry.status]} dot>
            {labels.table.status[expiry.status]}
          </Badge>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{expiry.notes ?? labels.table.noNotes}</div>
        <div>
          {expiry.pendingProposal ? (
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{labels.table.pendingHint}</span>
          ) : (
            <button type="button" className="btn mini" onClick={onOpenPropose}>
              {labels.proposeAction}
            </button>
          )}
        </div>
      </div>
      {isProposing ? (
        <div data-testid="propose-expiry-row" className="student-row" style={{ gridTemplateColumns: '1fr' }}>
          <ProposeExpiryForm expiry={expiry} labels={labels.form} onCancel={onCancelPropose} onSuccess={onProposed} />
        </div>
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
 * CURRENT values, so the titolare edits just what changed (typically the
 * new expiry date after a renewal). Conditionally mounted (only while
 * `isProposing`), so `defaultValues` are read fresh every time (same fix as
 * `expiries-panel.tsx`'s `EditExpiryRowForm`).
 */
function ProposeExpiryForm({ expiry, labels, onCancel, onSuccess }: ProposeExpiryFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
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

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="propose-expiry-form">
      <div className="fld-label" style={{ marginBottom: 10 }}>
        {labels.title}
      </div>
      <div className="form-grid">
        <Field label={labels.issuedAt}>
          <Input type="date" aria-invalid={Boolean(errors.issuedAt)} {...register('issuedAt')} />
        </Field>
        {errors.issuedAt ? <p style={{ marginTop: -8, fontSize: 11, color: 'var(--bad)' }}>{labels.requiredField}</p> : null}
        <Field label={labels.expiresAt}>
          <Input type="date" aria-invalid={Boolean(errors.expiresAt)} {...register('expiresAt')} />
        </Field>
        {errors.expiresAt ? <p style={{ marginTop: -8, fontSize: 11, color: 'var(--bad)' }}>{labels.invalidRange}</p> : null}
        <Field label={labels.notes}>
          <Input maxLength={500} {...register('notes')} />
        </Field>
      </div>

      {formError ? (
        <p role="alert" data-testid="propose-expiry-form-error" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--bad)' }}>
          {formError}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="submit" className="btn primary" disabled={isSubmitting}>
          {labels.submit}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
