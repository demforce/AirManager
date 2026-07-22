'use client';

/**
 * Instructors table console (story 12.7, AC 4/5) — port of
 * `docs/design-reference/airops/src/People.jsx#InstructorsView` onto real,
 * unpaginated data (small platea, same convention as the school hour
 * summaries this twins) — same shell idiom as `pilots/pilots-console.tsx`
 * (`.card` + `.card-head`, `.students`/`.student-row` table).
 *
 * "Ciclo pagamenti" / "Aggiungi istruttore" live in the `card-head` (unlike
 * the prototype's page-head) — same convention every other AirOps-native
 * page in this app already settled on (`pilots-console.tsx`/
 * `fleet-console.tsx`: every row-affecting action lives in the card, the
 * page-head is title+KPIs only).
 */
import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ExportMenu } from '@/components/ui/export-menu';
import { Field, Input, Select } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { Icon } from '@/components/ui/icons';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { formatCents, parseCents } from '@/lib/money';
import { formatMinutes } from '@/lib/time';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';
import type { PersonListItemDto } from '@/lib/schemas/people';
import { InstructorEditor, type InstructorEditorLabels } from './instructor-editor';
import { InstructorProfile, type InstructorProfileLabels } from './instructor-profile';

export type InstructorRow = {
  personId: string;
  firstName: string;
  lastName: string;
  payoutRateCents: number | null;
  totalMinutes: number;
  owedTotalCents: number | null;
};

export type InstructorsConsoleLabels = {
  cardTitle: string;
  empty: string;
  newInstructor: string;
  paymentCycleButton: string;
  exportLabel: string;
  table: { name: string; rate: string; hours: string; owed: string; actions: string; noValue: string };
  actions: { edit: string; pay: string };
  addInstructor: {
    title: string;
    subtitle: string;
    searchLabel: string;
    searchPlaceholder: string;
    noResults: string;
    submit: string;
    cancel: string;
    requiredField: string;
    genericError: string;
  };
  editor: InstructorEditorLabels;
  profile: InstructorProfileLabels;
  pay: {
    title: string;
    amount: string;
    method: string;
    methods: { cash: string; bankTransfer: string; pos: string };
    periodStart: string;
    periodEnd: string;
    notes: string;
    submit: string;
    cancel: string;
    invalidAmount: string;
    invalidPeriod: string;
    requiredField: string;
    genericError: string;
  };
  paymentCycle: { title: string; subtitle: string; empty: string; pay: string; closeLabel: string };
  toast: { rateSet: string; payoutRecorded: string; instructorAdded: string; genericError: string; identitySaved: string };
};

type InstructorsConsoleProps = {
  items: InstructorRow[];
  canManagePeople: boolean;
  canManagePayouts: boolean;
  canManageSettings: boolean;
  exportHref?: string;
  locale: 'it' | 'en';
  labels: InstructorsConsoleLabels;
};

export function InstructorsConsole({ items, canManagePeople, canManagePayouts, canManageSettings, exportHref, locale, labels }: InstructorsConsoleProps) {
  const router = useRouter();
  const toast = useToast();
  const [editorTarget, setEditorTarget] = useState<InstructorRow | null>(null);
  const [profileTarget, setProfileTarget] = useState<InstructorRow | null>(null);
  const [payTarget, setPayTarget] = useState<InstructorRow | null>(null);
  const [addInstructorOpen, setAddInstructorOpen] = useState(false);
  const [paymentCycleOpen, setPaymentCycleOpen] = useState(false);

  const cols = 'minmax(160px,1.8fr) 120px 110px 130px minmax(160px,1.2fr)';

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">{labels.cardTitle}</div>
          <div className="spacer" />
          {canManagePayouts ? (
            <button type="button" className="btn" onClick={() => setPaymentCycleOpen(true)} data-testid="instructors-payment-cycle-button">
              <Icon.cash /> {labels.paymentCycleButton}
            </button>
          ) : null}
          {exportHref ? <ExportMenu label={labels.exportLabel} xlsLabel={labels.exportLabel} xlsHref={exportHref} pdfLabel="" /> : null}
          {canManagePeople ? (
            <button type="button" className="btn primary" onClick={() => setAddInstructorOpen(true)} data-testid="instructors-new-button">
              <Icon.plus /> {labels.newInstructor}
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="card-body" data-testid="instructors-empty">
            {labels.empty}
          </p>
        ) : (
          <div className="students">
            <div className="student-row header" style={{ gridTemplateColumns: cols }}>
              <div>{labels.table.name}</div>
              <div>{labels.table.rate}</div>
              <div>{labels.table.hours}</div>
              <div>{labels.table.owed}</div>
              <div>{labels.table.actions}</div>
            </div>
            {items.map((instructor) => (
              <div key={instructor.personId} className="student-row" data-testid={`instructor-row-${instructor.personId}`} style={{ gridTemplateColumns: cols }}>
                <div>
                  <div
                    className="student-name"
                    style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-strong)', textUnderlineOffset: 3 }}
                    onClick={() => setProfileTarget(instructor)}
                    data-testid={`instructor-name-${instructor.personId}`}
                  >
                    {instructor.lastName} {instructor.firstName}
                  </div>
                </div>
                <div className="mono num">{instructor.payoutRateCents === null ? labels.table.noValue : `${formatCents(instructor.payoutRateCents, locale)}/h`}</div>
                <div className="mono num">{formatMinutes(instructor.totalMinutes)}</div>
                <div className="mono num" style={{ fontWeight: 600 }}>
                  {instructor.owedTotalCents === null ? labels.table.noValue : formatCents(instructor.owedTotalCents, locale)}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button type="button" className="btn mini" onClick={() => setEditorTarget(instructor)} data-testid={`instructor-edit-${instructor.personId}`}>
                    {labels.actions.edit}
                  </button>
                  {canManagePayouts ? (
                    <button type="button" className="btn mini ok" onClick={() => setPayTarget(instructor)} data-testid={`instructor-pay-${instructor.personId}`}>
                      {labels.actions.pay}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <InstructorEditor
        // Distinct key NAMESPACE from `InstructorProfile` below (`editor-`/
        // `profile-` prefixes) — same rationale as `pilots-console.tsx`.
        key={editorTarget === null ? 'editor-closed' : `editor-${editorTarget.personId}`}
        instructor={editorTarget}
        onClose={() => setEditorTarget(null)}
        onMutated={() => router.refresh()}
        canManagePeople={canManagePeople}
        canManagePayouts={canManagePayouts}
        canManageSettings={canManageSettings}
        locale={locale}
        labels={labels.editor}
        toast={toast}
        toastLabels={labels.toast}
      />

      <InstructorProfile
        key={profileTarget === null ? 'profile-closed' : `profile-${profileTarget.personId}`}
        instructor={profileTarget}
        onClose={() => setProfileTarget(null)}
        onEdit={(instructor) => setEditorTarget(instructor)}
        locale={locale}
        labels={labels.profile}
      />

      <PaySlideOver
        instructor={payTarget}
        onClose={() => setPayTarget(null)}
        onMutated={() => router.refresh()}
        labels={labels.pay}
        closeLabel={labels.editor.closeLabel}
        successMessage={labels.toast.payoutRecorded}
      />

      <PaymentCycleSlideOver
        open={paymentCycleOpen}
        onClose={() => setPaymentCycleOpen(false)}
        items={items.filter((instructor) => (instructor.owedTotalCents ?? 0) > 0)}
        locale={locale}
        labels={labels.paymentCycle}
        onPay={(instructor) => {
          setPaymentCycleOpen(false);
          setPayTarget(instructor);
        }}
      />

      <AddInstructorSlideOver
        open={addInstructorOpen}
        onClose={() => setAddInstructorOpen(false)}
        onMutated={() => router.refresh()}
        labels={labels.addInstructor}
        successMessage={labels.toast.instructorAdded}
      />
    </>
  );
}

// --- "Paga" payout slide-over -------------------------------------------------

const payFormSchema = z
  .object({
    amount: z.string().trim().min(1),
    method: z.enum(['CASH', 'BANK_TRANSFER', 'POS']),
    periodStart: z.string().trim().min(1),
    periodEnd: z.string().trim().min(1),
    notes: z.string(),
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
  )
  .refine((values) => values.periodStart <= values.periodEnd, { message: 'invalidPeriod', path: ['periodEnd'] });

type PayFormValues = z.infer<typeof payFormSchema>;

/** Browser-local `YYYY-MM-DD` — same convention as every other `<input type="date">` default in this codebase (`todayDateOnly` in `pilots-console.tsx`/`fleet/aircraft-editor.tsx`). */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Default `periodStart` (AC 5: "inizio del periodo scoperto", editable) — the start of the current calendar year, a simple, always-available anchor since the summary API does not expose a precise "last paid up to" date. */
function yearStartDateOnly(): string {
  return `${todayDateOnly().slice(0, 4)}-01-01`;
}

type PaySlideOverProps = {
  instructor: InstructorRow | null;
  onClose: () => void;
  onMutated: () => void;
  labels: InstructorsConsoleLabels['pay'];
  closeLabel: string;
  successMessage: string;
};

/** "Paga" row action (AC 5, `payouts.manage`) — same Idempotency-Key flow as `pilots-console.tsx#TopUpSlideOver`, MANDATORY server-side here (route rejects a missing header, story 12.7 AC 3). */
function PaySlideOver({ instructor, onClose, onMutated, labels, closeLabel, successMessage }: PaySlideOverProps) {
  const toast = useToast();
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();
  const [formError, setFormError] = useState<string | null>(null);

  const values: PayFormValues = instructor
    ? {
        amount: (Math.max(instructor.owedTotalCents ?? 0, 0) / 100).toFixed(2).replace('.', ','),
        method: 'CASH',
        periodStart: yearStartDateOnly(),
        periodEnd: todayDateOnly(),
        notes: '',
      }
    : { amount: '', method: 'CASH', periodStart: '', periodEnd: '', notes: '' };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PayFormValues>({ resolver: zodResolver(payFormSchema), values });

  async function onSubmit(formValues: PayFormValues): Promise<void> {
    if (!instructor) return;
    setFormError(null);
    const amountCents = parseCents(formValues.amount);

    let response: Response;
    try {
      response = await fetch('/api/v1/instructor-payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        body: JSON.stringify({
          instructorPersonId: instructor.personId,
          amountCents,
          periodStart: formValues.periodStart,
          periodEnd: formValues.periodEnd,
          method: formValues.method,
          notes: formValues.notes.trim() === '' ? null : formValues.notes.trim(),
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

    reset({ amount: '', method: 'CASH', periodStart: '', periodEnd: '', notes: '' });
    toast.show(successMessage, 'ok');
    onClose();
    onMutated();
  }

  return (
    <SlideOver open={instructor !== null} onClose={onClose} title={labels.title} subtitle={instructor ? `${instructor.lastName} ${instructor.firstName}` : ''} closeLabel={closeLabel}>
      {instructor ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="instructor-pay-form">
          <div className="form-grid">
            <Field label={labels.amount}>
              <Input inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(errors.amount)} {...register('amount')} />
            </Field>
            <Field label={labels.method}>
              <Select {...register('method')}>
                <option value="CASH">{labels.methods.cash}</option>
                <option value="BANK_TRANSFER">{labels.methods.bankTransfer}</option>
                <option value="POS">{labels.methods.pos}</option>
              </Select>
            </Field>
            <Field label={labels.periodStart}>
              <DateInput aria-invalid={Boolean(errors.periodStart)} {...register('periodStart')} />
            </Field>
            <Field label={labels.periodEnd}>
              <DateInput aria-invalid={Boolean(errors.periodEnd)} {...register('periodEnd')} />
            </Field>
            <Field label={labels.notes} wide>
              <Input {...register('notes')} />
            </Field>
          </div>
          {formError ? (
            <p role="alert" data-testid="instructor-pay-form-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
              {formError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" className="btn" onClick={onClose}>
              {labels.cancel}
            </button>
            <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="instructor-pay-submit">
              {labels.submit}
            </button>
          </div>
        </form>
      ) : null}
    </SlideOver>
  );
}

// --- "Ciclo pagamenti" slide-over ---------------------------------------------

type PaymentCycleSlideOverProps = {
  open: boolean;
  onClose: () => void;
  items: InstructorRow[];
  locale: 'it' | 'en';
  labels: InstructorsConsoleLabels['paymentCycle'];
  onPay: (instructor: InstructorRow) => void;
};

/** AC 5: "SOLI istruttori con dovuto>0", a per-row "Paga" that closes this panel and opens `PaySlideOver` for that row (batch manual — one POST per row). */
function PaymentCycleSlideOver({ open, onClose, items, locale, labels, onPay }: PaymentCycleSlideOverProps) {
  return (
    <SlideOver open={open} onClose={onClose} title={labels.title} subtitle={labels.subtitle} closeLabel={labels.closeLabel}>
      {items.length === 0 ? (
        <p className="fld-label" style={{ textTransform: 'none' }} data-testid="payment-cycle-empty">
          {labels.empty}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {items.map((instructor, i) => (
            <div
              key={instructor.personId}
              data-testid={`payment-cycle-row-${instructor.personId}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 12,
                alignItems: 'center',
                padding: '10px 14px',
                background: i % 2 === 0 ? 'var(--panel)' : 'var(--panel-2)',
                fontSize: 13,
              }}
            >
              <span>
                {instructor.lastName} {instructor.firstName}
              </span>
              <span className="mono num" style={{ fontWeight: 600 }}>
                {formatCents(instructor.owedTotalCents ?? 0, locale)}
              </span>
              <button type="button" className="btn mini ok" onClick={() => onPay(instructor)} data-testid={`payment-cycle-pay-${instructor.personId}`}>
                {labels.pay}
              </button>
            </div>
          ))}
        </div>
      )}
    </SlideOver>
  );
}

// --- "Aggiungi istruttore" slide-over -----------------------------------------
// AC 4: activates the instructor profile on an EXISTING person (or one just
// created via the Pilots page, story 12.6) — reuses the SAME
// `PUT /api/v1/people/{id}/profiles/instructor` endpoint the pilots editor's
// `ProfilesSection` already uses, never a parallel "create person" flow.
// Story 13.1 (R-13.1-b): the free-text "abilitazioni" field this form used
// to require is GONE — `PUT .../profiles/instructor` now just activates the
// profile, no body needed, so this is a plain search-then-confirm (no
// react-hook-form/zod left to validate).

type PeopleSearchResponse = { items: PersonListItemDto[] };

async function searchPeople(query: string): Promise<PersonListItemDto[]> {
  const response = await fetch(`/api/v1/people?q=${encodeURIComponent(query)}&pageSize=10`);
  if (!response.ok) return [];
  const body = (await response.json()) as PeopleSearchResponse;
  return body.items;
}

type AddInstructorSlideOverProps = {
  open: boolean;
  onClose: () => void;
  onMutated: () => void;
  labels: InstructorsConsoleLabels['addInstructor'];
  successMessage: string;
};

function AddInstructorSlideOver({ open, onClose, onMutated, labels, successMessage }: AddInstructorSlideOverProps) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonListItemDto[]>([]);
  const [selected, setSelected] = useState<PersonListItemDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function handleQueryChange(value: string): void {
    setQuery(value);
    setSelected(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(() => {
      void searchPeople(value.trim()).then(setResults);
    }, 300);
  }

  function handleClose(): void {
    setQuery('');
    setResults([]);
    setSelected(null);
    setFormError(null);
    onClose();
  }

  async function handleConfirm(): Promise<void> {
    if (!selected) return;
    setFormError(null);
    setSubmitting(true);
    const response = await fetch(`/api/v1/people/${selected.id}/profiles/instructor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setSubmitting(false);
    if (!response.ok) {
      setFormError(labels.genericError);
      return;
    }
    toast.show(successMessage, 'ok');
    handleClose();
    onMutated();
  }

  return (
    <SlideOver open={open} onClose={handleClose} title={labels.title} subtitle={labels.subtitle} closeLabel={labels.cancel}>
      <div className="form-grid">
        <Field label={labels.searchLabel} wide>
          <Input placeholder={labels.searchPlaceholder} value={query} onChange={(event) => handleQueryChange(event.target.value)} data-testid="add-instructor-search" />
        </Field>
      </div>

      {query.trim().length >= 2 && !selected ? (
        <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {results.length === 0 ? (
            <p className="fld-label" style={{ padding: 10, textTransform: 'none' }} data-testid="add-instructor-no-results">
              {labels.noResults}
            </p>
          ) : (
            results.map((person) => (
              <button
                key={person.id}
                type="button"
                className="btn"
                style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0 }}
                onClick={() => {
                  setSelected(person);
                  setQuery(`${person.lastName} ${person.firstName}`);
                  setResults([]);
                }}
                data-testid={`add-instructor-result-${person.id}`}
              >
                {person.lastName} {person.firstName}
              </button>
            ))
          )}
        </div>
      ) : null}

      {selected ? (
        <div style={{ marginTop: 16 }} data-testid="add-instructor-form">
          {formError ? (
            <p role="alert" data-testid="add-instructor-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 10 }}>
              {formError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn" onClick={handleClose}>
              {labels.cancel}
            </button>
            <button type="button" disabled={submitting} className="btn primary" onClick={() => void handleConfirm()} data-testid="add-instructor-submit">
              {labels.submit}
            </button>
          </div>
        </div>
      ) : null}
    </SlideOver>
  );
}
