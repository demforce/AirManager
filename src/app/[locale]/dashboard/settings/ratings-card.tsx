'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Field, Input, InputGroup, Select } from '@/components/ui/field';
import { Icon } from '@/components/ui/icons';
import { useRouter } from '@/i18n/navigation';

export type ExpiryScopeValue = 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' | 'ALL';

export type ExpiryTypeRow = {
  id: string;
  name: string;
  scope: ExpiryScopeValue;
  isActive: boolean;
  blocksBooking: boolean;
  validityMonths: number | null;
};

export type RatingsCardLabels = {
  title: string;
  sub: string;
  addAction: string;
  table: { name: string; scope: string; validity: string; status: string; actions: string; empty: string; monthsSuffix: string; noExpiry: string };
  scope: Record<ExpiryScopeValue, string>;
  status: { active: string; inactive: string };
  blocksBooking: { yes: string };
  actions: { edit: string; deactivate: string; reactivate: string; delete: string; confirmDelete: string; confirmYes: string; confirmCancel: string };
  form: {
    createTitle: string;
    editTitle: string;
    name: string;
    scope: string;
    validity: string;
    validityHint: string;
    blocksBooking: string;
    blocksBookingHint: string;
    submitCreate: string;
    submitSave: string;
    cancel: string;
    requiredField: string;
    conflictError: string;
    genericError: string;
  };
  feedback: { created: string; updated: string; deactivated: string; reactivated: string; deleted: string; deleteInUseError: string; genericError: string };
  hint: string;
};

type RatingsCardProps = {
  expiryTypes: ExpiryTypeRow[];
  labels: RatingsCardLabels;
};

type Panel = { mode: 'create' } | { mode: 'edit'; expiryType: ExpiryTypeRow };

const SCOPE_VALUES: ExpiryScopeValue[] = ['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL'];
const COLS = '1fr 130px 150px 120px 220px';

/**
 * "Abilitazioni" card (story 12.11, AC 2, ratifica utente 2) — the
 * expiry-type catalogue, moved here from the removed `/dashboard/expiries/types`
 * page (`expiry-types` API unchanged). AirOps `.students` table restyle of
 * `types-manager.tsx`'s proven create/edit/deactivate/delete flow, plus the
 * NEW `validityMonths` field (precompiles `expiresAt` at registration —
 * `people/[id]` scheda persona) and its "senza scadenza" badge (0/absent).
 */
export function RatingsCard({ expiryTypes, labels }: RatingsCardProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  function handleSuccess(message: string): void {
    setPanel(null);
    setFeedback({ text: message, isError: false });
    router.refresh();
  }

  async function handleToggleActive(expiryType: ExpiryTypeRow): Promise<void> {
    setPendingActionId(expiryType.id);
    const response = await fetch(`/api/v1/expiry-types/${expiryType.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !expiryType.isActive }),
    });
    setPendingActionId(null);
    setFeedback(
      response.ok
        ? { text: expiryType.isActive ? labels.feedback.deactivated : labels.feedback.reactivated, isError: false }
        : { text: labels.feedback.genericError, isError: true },
    );
    router.refresh();
  }

  async function handleDelete(expiryType: ExpiryTypeRow): Promise<void> {
    setPendingActionId(expiryType.id);
    const response = await fetch(`/api/v1/expiry-types/${expiryType.id}`, { method: 'DELETE' });
    setPendingActionId(null);
    setConfirmingDeleteId(null);
    if (response.ok) {
      setFeedback({ text: labels.feedback.deleted, isError: false });
    } else if (response.status === 409) {
      setFeedback({ text: labels.feedback.deleteInUseError, isError: true });
    } else {
      setFeedback({ text: labels.feedback.genericError, isError: true });
    }
    router.refresh();
  }

  return (
    <div className="card" data-testid="ratings-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
        <div className="spacer" />
        <button type="button" className="btn primary" onClick={() => setPanel({ mode: 'create' })} data-testid="ratings-add-button">
          <Icon.plus /> {labels.addAction}
        </button>
      </div>

      {feedback ? (
        <p role="status" data-testid="ratings-feedback" style={{ padding: '10px 20px 0', fontSize: 12.5, color: feedback.isError ? 'var(--bad)' : 'var(--ok)' }}>
          {feedback.text}
        </p>
      ) : null}

      {panel ? (
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <ExpiryTypeForm
            key={panel.mode === 'edit' ? panel.expiryType.id : 'create'}
            expiryType={panel.mode === 'edit' ? panel.expiryType : null}
            labels={labels}
            onCancel={() => setPanel(null)}
            onSuccess={(mode) => handleSuccess(mode === 'create' ? labels.feedback.created : labels.feedback.updated)}
          />
        </div>
      ) : null}

      <div className="students">
        <div className="student-row header" style={{ gridTemplateColumns: COLS }}>
          <div>{labels.table.name}</div>
          <div>{labels.table.scope}</div>
          <div>{labels.table.validity}</div>
          <div>{labels.table.status}</div>
          <div>{labels.table.actions}</div>
        </div>
        {expiryTypes.length === 0 ? (
          <div className="student-row" style={{ gridTemplateColumns: '1fr' }}>
            <div style={{ color: 'var(--ink-3)', padding: '8px 0' }}>{labels.table.empty}</div>
          </div>
        ) : (
          expiryTypes.map((expiryType) => (
            <div key={expiryType.id} className="student-row" data-testid="rating-row" style={{ gridTemplateColumns: COLS, alignItems: 'center' }}>
              <div>
                <div className="student-name">{expiryType.name}</div>
                {expiryType.blocksBooking ? (
                  <div style={{ marginTop: 2 }}>
                    <Badge tone="warn">{labels.blocksBooking.yes}</Badge>
                  </div>
                ) : null}
              </div>
              <div>
                <Badge>{labels.scope[expiryType.scope]}</Badge>
              </div>
              <div className="mono" style={{ fontSize: 12.5 }}>
                {expiryType.validityMonths ? (
                  `${expiryType.validityMonths} ${labels.table.monthsSuffix}`
                ) : (
                  <span className="badge" style={{ fontSize: 9.5 }} title={labels.table.noExpiry}>
                    {labels.table.noExpiry}
                  </span>
                )}
              </div>
              <div>
                <Badge tone={expiryType.isActive ? 'ok' : ''} dot>
                  {expiryType.isActive ? labels.status.active : labels.status.inactive}
                </Badge>
              </div>
              <div>
                {confirmingDeleteId === expiryType.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{labels.actions.confirmDelete}</span>
                    <button type="button" className="btn mini bad" disabled={pendingActionId === expiryType.id} onClick={() => void handleDelete(expiryType)}>
                      {labels.actions.confirmYes}
                    </button>
                    <button type="button" className="btn mini" onClick={() => setConfirmingDeleteId(null)}>
                      {labels.actions.confirmCancel}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn mini" onClick={() => setPanel({ mode: 'edit', expiryType })} data-testid="rating-edit-button">
                      {labels.actions.edit}
                    </button>
                    <button type="button" className="btn mini" disabled={pendingActionId === expiryType.id} onClick={() => void handleToggleActive(expiryType)}>
                      {expiryType.isActive ? labels.actions.deactivate : labels.actions.reactivate}
                    </button>
                    <button type="button" className="btn mini bad" disabled={pendingActionId === expiryType.id} onClick={() => setConfirmingDeleteId(expiryType.id)}>
                      {labels.actions.delete}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--ink-3)' }}>{labels.hint}</div>
    </div>
  );
}

const expiryTypeFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scope: z.enum(['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL']),
  validityMonths: z.string(),
  blocksBooking: z.boolean(),
});

type ExpiryTypeFormValues = z.infer<typeof expiryTypeFormSchema>;

type ExpiryTypeFormProps = {
  expiryType: ExpiryTypeRow | null;
  labels: RatingsCardLabels;
  onCancel: () => void;
  onSuccess: (mode: 'create' | 'edit') => void;
};

function ExpiryTypeForm({ expiryType, labels, onCancel, onSuccess }: ExpiryTypeFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExpiryTypeFormValues>({
    resolver: zodResolver(expiryTypeFormSchema),
    defaultValues: {
      name: expiryType?.name ?? '',
      scope: expiryType?.scope ?? 'ALL',
      validityMonths: String(expiryType?.validityMonths ?? 0),
      blocksBooking: expiryType?.blocksBooking ?? false,
    },
  });

  async function onSubmit(values: ExpiryTypeFormValues): Promise<void> {
    setFormError(null);
    const validityMonths = Number(values.validityMonths);
    const body = {
      name: values.name.trim(),
      scope: values.scope,
      blocksBooking: values.blocksBooking,
      validityMonths: Number.isFinite(validityMonths) && validityMonths > 0 ? validityMonths : null,
    };

    const response = expiryType
      ? await fetch(`/api/v1/expiry-types/${expiryType.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/v1/expiry-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.form.conflictError : labels.form.genericError);
      return;
    }

    onSuccess(expiryType ? 'edit' : 'create');
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="rating-form">
      <div className="fld-label" style={{ marginBottom: 10 }}>
        {expiryType ? labels.form.editTitle : labels.form.createTitle}
      </div>
      <div className="form-grid">
        <Field label={labels.form.name} wide>
          <Input maxLength={100} aria-invalid={Boolean(errors.name)} data-testid="rating-name-input" {...register('name')} />
        </Field>
        <Field label={labels.form.scope}>
          <Select data-testid="rating-scope-select" {...register('scope')}>
            {SCOPE_VALUES.map((scope) => (
              <option key={scope} value={scope}>
                {labels.scope[scope]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels.form.validity}>
          <InputGroup suffix={labels.table.monthsSuffix}>
            <Input type="number" min={0} data-testid="rating-validity-input" {...register('validityMonths')} />
          </InputGroup>
        </Field>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        {labels.form.validityHint}
      </p>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
        <input type="checkbox" style={{ marginTop: 3 }} {...register('blocksBooking')} />
        <span style={{ fontSize: 12.5 }}>
          <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>{labels.form.blocksBooking}</span>
          <span style={{ display: 'block', color: 'var(--ink-3)' }}>{labels.form.blocksBookingHint}</span>
        </span>
      </label>

      {errors.name ? <p style={{ marginTop: 6, fontSize: 12, color: 'var(--bad)' }}>{labels.form.requiredField}</p> : null}
      {formError ? (
        <p role="alert" data-testid="rating-form-error" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--bad)' }}>
          {formError}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="submit" className="btn primary" disabled={isSubmitting} data-testid="rating-form-submit">
          {expiryType ? labels.form.submitSave : labels.form.submitCreate}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {labels.form.cancel}
        </button>
      </div>
    </form>
  );
}
