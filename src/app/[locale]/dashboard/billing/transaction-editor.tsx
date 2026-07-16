'use client';

/**
 * "Nuova transazione" SlideOver (story 12.9, AC 4 — D13) — port of
 * `docs/design-reference/airops/src/Forms.jsx#NewTransactionForm` onto the
 * REAL domain: 3 branches (D13, not the prototype's 6 free-text `type`
 * labels), each posting the discriminated union `POST /api/v1/transactions`
 * expects. The Addebito conto branch shows "Data" as a DISABLED field
 * defaulting to today (never sent to the API) — purely for visual
 * consistency with the other two branches: `recordAdjustment` always dates a
 * rettifica as today, server-side, no `effectiveDate` input exists on that
 * model (Dev Notes/`accounts.service.ts`).
 */
import { useMemo, useState } from 'react';
import { Field, Input, InputGroup, Select } from '@/components/ui/field';
import { Icon } from '@/components/ui/icons';
import { SlideOver } from '@/components/ui/slide-over';
import { SearchCombobox, type SearchComboboxOption } from '@/components/search-combobox';
import { formatCents, parseCents } from '@/lib/money';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';

type PersonOption = { id: string; firstName: string; lastName: string };
type CategoryOption = { id: string; name: string };
type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'POS';
type Kind = 'payment' | 'adjustment' | 'cash';

export type TransactionEditorLabels = {
  title: string;
  subtitle: string;
  closeLabel: string;
  kind: string;
  kinds: { payment: string; adjustment: string; cash: string };
  fields: {
    pilot: string;
    amount: string;
    method: string;
    methods: { CASH: string; BANK_TRANSFER: string; POS: string };
    date: string;
    description: string;
    reason: string;
    category: string;
    direction: string;
    directionIn: string;
    directionOut: string;
  };
  submit: string;
  cancel: string;
  requiredField: string;
  invalidAmount: string;
  conflictError: string;
  genericError: string;
  result: { title: string; newBalance: string; close: string };
  picker: { placeholder: string; noResults: string };
};

type TransactionEditorProps = {
  open: boolean;
  onClose: () => void;
  /** Refreshes the server-rendered table/KPI (`router.refresh()`) — the slide-over stays open to show the result panel (same ratifica-1 pattern as `flight-editor.tsx`). */
  onMutated: () => void;
  personOptions: PersonOption[];
  categoryOptions: CategoryOption[];
  moneyLocale: 'it' | 'en';
  labels: TransactionEditorLabels;
};

function personLabel(person: { firstName: string; lastName: string }): string {
  return `${person.lastName} ${person.firstName}`;
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Server-side pilot/student search (same profile-scoped picker as the logbook/billing filter). */
async function searchPeople(query: string): Promise<SearchComboboxOption[]> {
  const params = new URLSearchParams({ q: query, pageSize: '50', profile: 'pilot-or-student' });
  const response = await fetch(`/api/v1/people?${params.toString()}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items: { id: string; firstName: string; lastName: string }[] };
  return body.items.map((person) => ({ id: person.id, label: personLabel(person) }));
}

type ResultState = { kind: 'TOP_UP' | 'ADJUSTMENT'; balanceCents: number } | { kind: 'CASH' };

export function TransactionEditor({ open, onClose, onMutated, personOptions, categoryOptions, moneyLocale, labels }: TransactionEditorProps) {
  const [kind, setKind] = useState<Kind>('payment');
  const [personId, setPersonId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState(todayDateOnly());
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [categoryId, setCategoryId] = useState(categoryOptions[0]?.id ?? '');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();

  const personComboOptions = useMemo<SearchComboboxOption[]>(
    () => personOptions.map((person) => ({ id: person.id, label: personLabel(person) })),
    [personOptions],
  );

  function reset(): void {
    setKind('payment');
    setPersonId('');
    setAmount('');
    setMethod('CASH');
    setDate(todayDateOnly());
    setDescription('');
    setReason('');
    setCategoryId(categoryOptions[0]?.id ?? '');
    setDirection('in');
    setFormError(null);
    setResult(null);
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  async function submit(): Promise<void> {
    setFormError(null);

    let parsedAmount: number | null;
    try {
      parsedAmount = parseCents(amount);
    } catch {
      parsedAmount = null;
    }
    if (parsedAmount === null || parsedAmount <= 0) {
      setFormError(labels.invalidAmount);
      return;
    }
    if ((kind === 'payment' || kind === 'adjustment') && personId.trim() === '') {
      setFormError(labels.requiredField);
      return;
    }
    if (kind === 'adjustment' && reason.trim() === '') {
      setFormError(labels.requiredField);
      return;
    }
    if (kind === 'cash' && categoryId.trim() === '') {
      setFormError(labels.requiredField);
      return;
    }

    const trimmedDescription = description.trim();
    let body: Record<string, unknown>;
    if (kind === 'payment') {
      body = { kind: 'TOP_UP', personId, amountCents: parsedAmount, paymentMethod: method, effectiveDate: date, description: trimmedDescription || undefined };
    } else if (kind === 'adjustment') {
      body = { kind: 'ADJUSTMENT', personId, amountCents: parsedAmount, reason: reason.trim() };
    } else {
      body = { kind: 'CASH', categoryId, direction, amountCents: parsedAmount, effectiveDate: date, description: trimmedDescription || undefined };
    }

    setSubmitting(true);
    let response: Response;
    try {
      response = await fetch('/api/v1/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        body: JSON.stringify(body),
      });
    } catch {
      setSubmitting(false);
      setFormError(labels.genericError);
      return;
    }
    setSubmitting(false);
    regenerateIdempotencyKey();

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    const data = (await response.json()) as { kind: 'TOP_UP' | 'ADJUSTMENT' | 'CASH'; account?: { balanceCents: number } };
    setResult(data.kind === 'CASH' ? { kind: 'CASH' } : { kind: data.kind, balanceCents: data.account!.balanceCents });
    onMutated();
  }

  const footer =
    result !== null ? (
      <>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={handleClose} data-testid="transaction-result-close">
          {labels.result.close}
        </button>
      </>
    ) : (
      <>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={handleClose}>
          {labels.cancel}
        </button>
        <button type="submit" form="transaction-form" className="btn primary" disabled={submitting} data-testid="transaction-submit">
          <Icon.check /> {labels.submit}
        </button>
      </>
    );

  return (
    <SlideOver open={open} onClose={handleClose} title={labels.title} subtitle={labels.subtitle} closeLabel={labels.closeLabel} footer={footer}>
      {result !== null ? (
        <div data-testid="transaction-result-panel" style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel-2)', padding: 14 }}>
          {result.kind !== 'CASH' ? (
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 8, columnGap: 12, fontSize: 13 }}>
              <dt style={{ fontWeight: 600, color: 'var(--ink)' }}>{labels.result.newBalance}</dt>
              <dd className="mono num" style={{ fontWeight: 600 }} data-testid="transaction-result-balance">
                {formatCents(result.balanceCents, moneyLocale)}
              </dd>
            </dl>
          ) : (
            <p style={{ fontSize: 13 }}>{labels.result.title}</p>
          )}
        </div>
      ) : (
        <form id="transaction-form" data-testid="transaction-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
          <div className="form-grid">
            <Field label={labels.kind}>
              <Select value={kind} onChange={(event) => setKind(event.target.value as Kind)} data-testid="transaction-kind">
                <option value="payment">{labels.kinds.payment}</option>
                <option value="adjustment">{labels.kinds.adjustment}</option>
                <option value="cash">{labels.kinds.cash}</option>
              </Select>
            </Field>

            {kind === 'payment' || kind === 'adjustment' ? (
              <div className="fld wide">
                <SearchCombobox
                  id="transaction-person"
                  label={labels.fields.pilot}
                  value={personId}
                  onChange={setPersonId}
                  fetchOptions={searchPeople}
                  initialOptions={personComboOptions}
                  placeholder={labels.picker.placeholder}
                  emptyText={labels.picker.noResults}
                />
              </div>
            ) : null}

            {kind === 'cash' ? (
              <Field label={labels.fields.category}>
                <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} data-testid="transaction-category">
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field label={labels.fields.amount}>
              <InputGroup prefix="€">
                <Input type="number" step="0.01" min="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} data-testid="transaction-amount" />
              </InputGroup>
            </Field>

            {kind === 'payment' ? (
              <Field label={labels.fields.method}>
                <Select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)} data-testid="transaction-method">
                  <option value="CASH">{labels.fields.methods.CASH}</option>
                  <option value="BANK_TRANSFER">{labels.fields.methods.BANK_TRANSFER}</option>
                  <option value="POS">{labels.fields.methods.POS}</option>
                </Select>
              </Field>
            ) : null}

            {kind === 'cash' ? (
              <Field label={labels.fields.direction}>
                <Select value={direction} onChange={(event) => setDirection(event.target.value as 'in' | 'out')} data-testid="transaction-direction">
                  <option value="in">{labels.fields.directionIn}</option>
                  <option value="out">{labels.fields.directionOut}</option>
                </Select>
              </Field>
            ) : null}

            {kind === 'payment' || kind === 'cash' ? (
              <Field label={labels.fields.date}>
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} data-testid="transaction-date" />
              </Field>
            ) : (
              <Field label={labels.fields.date}>
                <Input type="date" value={todayDateOnly()} disabled data-testid="transaction-date" />
              </Field>
            )}

            {kind === 'adjustment' ? (
              <Field label={labels.fields.reason} wide>
                <Input value={reason} onChange={(event) => setReason(event.target.value)} data-testid="transaction-reason" />
              </Field>
            ) : (
              <Field label={labels.fields.description} wide>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} data-testid="transaction-description" />
              </Field>
            )}
          </div>

          {formError ? (
            <p role="alert" data-testid="transaction-form-error" style={{ color: 'var(--bad)', fontSize: 13, marginTop: 14 }}>
              {formError}
            </p>
          ) : null}
        </form>
      )}
    </SlideOver>
  );
}
