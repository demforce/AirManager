'use client';

/**
 * Instructor slide-over editor (story 12.7, AC 6) — port of
 * `docs/design-reference/airops/src/People.jsx#InstructorEditor` onto the
 * REAL domain: anagrafica (PATCH people, `people.manage`), ratings (PUT
 * profiles/instructor, `people.manage`), payout rate (PUT
 * instructor-compensation/{id}/rate, `payouts.manage` — the RATIFIED
 * permission, admin-only), the STUDENT-charged rate panel (moved here from
 * `people/[id]`, `settings.manage`, D8 — clearly labeled distinct from the
 * payout rate), and ore/dovuto READ-ONLY. NO "Cadenza pagamenti" (D13 — the
 * prototype's Mensile/Settimanale/Per volo selector has no domain
 * counterpart, not ported).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input, InputGroup } from '@/components/ui/field';
import { SlideOver } from '@/components/ui/slide-over';
import { formatCents, parseCents } from '@/lib/money';
import { instructorProfileRequestSchema, updatePersonSchema, type InstructorProfileRequestInput, type UpdatePersonInput } from '@/lib/schemas/people';
import { formatMinutes } from '@/lib/time';
import { InstructorRatesPanel, type InstructorRatesPanelLabels } from './instructor-rates-panel';
import type { InstructorRow } from './instructors-console';

export type InstructorEditorLabels = {
  closeLabel: string;
  cancel: string;
  identity: {
    sectionTitle: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    fiscalCode: string;
    save: string;
    loadError: string;
  };
  ratings: { sectionTitle: string; label: string; save: string };
  payoutRate: { sectionTitle: string; label: string; noValue: string; save: string; readOnlyHint: string };
  readOnly: { sectionTitle: string; hoursTotal: string; owedTotal: string };
  studentRate: InstructorRatesPanelLabels & { heading: string };
  errors: { generic: string; invalidRate: string };
};

type ToastLabels = { genericError: string; ratingsSaved: string; rateSet: string; identitySaved: string };
type ToastHandle = { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };

type InstructorEditorProps = {
  instructor: InstructorRow | null;
  onClose: () => void;
  onMutated: () => void;
  canManagePeople: boolean;
  canManagePayouts: boolean;
  canManageSettings: boolean;
  locale: 'it' | 'en';
  labels: InstructorEditorLabels;
  toast: ToastHandle;
  toastLabels: ToastLabels;
};

/** Shared section wrapper — same convention as `pilots/pilot-editor.tsx#Section`/`fleet/aircraft-editor.tsx`. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <div className="fld-label" style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function InstructorEditor({
  instructor,
  onClose,
  onMutated,
  canManagePeople,
  canManagePayouts,
  canManageSettings,
  locale,
  labels,
  toast,
  toastLabels,
}: InstructorEditorProps) {
  // Own working copy of the row (same rationale as `pilots/pilot-editor.tsx`'s
  // `current`/`applyPatch`): the parent's `items` prop only refreshes via
  // `onMutated` -> `router.refresh()`, which does NOT retroactively update
  // THIS already-open editor's `instructor` prop (`editorTarget` in
  // `instructors-console.tsx` is a stable snapshot captured at click time) —
  // without a local merge, the payout-rate/ratings fields (and this header)
  // would keep showing the PRE-save value until the slide-over is closed and
  // reopened. `initialRateCents`/`initialRatings` react to `current` (not
  // the original prop) so every sub-form re-syncs immediately after its own
  // save. The `Ore totali`/`Dovuto` readonly fields are the one exception —
  // they are server-COMPUTED from flight/payout data no sub-form response
  // carries, so they only refresh once the editor is reopened
  // (`onMutated`'s `router.refresh()` already keeps the TABLE row itself
  // correct in the meantime).
  const [current, setCurrent] = useState<InstructorRow | null>(instructor);

  function applyPatch(patch: Partial<InstructorRow>): void {
    setCurrent((existing) => (existing ? { ...existing, ...patch } : existing));
    onMutated();
  }

  const open = current !== null;
  const title = current ? `${current.lastName} ${current.firstName}` : '';
  const subtitle = current ? current.ratings : '';

  return (
    <SlideOver open={open} onClose={onClose} title={title} subtitle={subtitle} closeLabel={labels.closeLabel}>
      {current ? (
        <>
          <IdentitySection
            personId={current.personId}
            canManagePeople={canManagePeople}
            locale={locale}
            labels={labels.identity}
            toast={toast}
            toastLabels={toastLabels}
            onSaved={(patch) => applyPatch(patch)}
          />

          <Section title={labels.ratings.sectionTitle}>
            <RatingsForm
              personId={current.personId}
              initialRatings={current.ratings}
              canManagePeople={canManagePeople}
              labels={labels.ratings}
              toast={toast}
              toastLabels={toastLabels}
              onSaved={(patch) => applyPatch(patch)}
            />
          </Section>

          <Section title={labels.payoutRate.sectionTitle}>
            <PayoutRateForm
              personId={current.personId}
              initialRateCents={current.payoutRateCents}
              canManagePayouts={canManagePayouts}
              locale={locale}
              labels={labels.payoutRate}
              errorLabels={labels.errors}
              toast={toast}
              toastLabels={toastLabels}
              onSaved={(patch) => applyPatch(patch)}
            />
          </Section>

          <Section title={labels.studentRate.heading}>
            <InstructorRatesPanel
              // Remount on instructor change — same rationale as every
              // other per-id-keyed sub-panel in this codebase (review 2.4 F1).
              key={current.personId}
              personId={current.personId}
              toast={toast}
              canAddRate={canManageSettings}
              labels={labels.studentRate}
            />
          </Section>

          <Section title={labels.readOnly.sectionTitle}>
            <div className="form-grid">
              <Field label={labels.readOnly.hoursTotal}>
                <Input value={formatMinutes(current.totalMinutes)} disabled />
              </Field>
              <Field label={labels.readOnly.owedTotal}>
                <Input value={current.owedTotalCents === null ? labels.payoutRate.noValue : formatCents(current.owedTotalCents, locale)} disabled />
              </Field>
            </div>
          </Section>
        </>
      ) : null}
    </SlideOver>
  );
}

// --- Anagrafica (PATCH people, `people.manage`) -----------------------------

type PersonIdentity = { firstName: string; lastName: string; email: string | null; phone: string | null; address: string | null; fiscalCode: string | null };

async function fetchPersonIdentity(personId: string): Promise<PersonIdentity | null> {
  const response = await fetch(`/api/v1/people/${personId}`);
  if (!response.ok) return null;
  return (await response.json()) as PersonIdentity;
}

function IdentitySection({
  personId,
  canManagePeople,
  labels,
  toast,
  toastLabels,
  onSaved,
}: {
  personId: string;
  canManagePeople: boolean;
  locale: 'it' | 'en';
  labels: InstructorEditorLabels['identity'];
  toast: ToastHandle;
  toastLabels: ToastLabels;
  onSaved: (patch: Partial<InstructorRow>) => void;
}) {
  const [identity, setIdentity] = useState<PersonIdentity | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPersonIdentity(personId).then((result) => {
      if (cancelled) return;
      if (!result) {
        setLoadError(true);
        return;
      }
      setIdentity(result);
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<UpdatePersonInput>({
    resolver: zodResolver(updatePersonSchema),
    values: identity ?? undefined,
  });

  async function onSubmit(values: UpdatePersonInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${personId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setFormError(toastLabels.genericError);
      return;
    }
    const updated = (await response.json()) as PersonIdentity;
    toast.show(toastLabels.identitySaved, 'ok');
    onSaved({ firstName: updated.firstName, lastName: updated.lastName });
  }

  if (loadError) {
    return (
      <p className="fld-label" style={{ color: 'var(--bad)' }}>
        {labels.loadError}
      </p>
    );
  }
  if (!identity) {
    return <p className="fld-label">…</p>;
  }
  if (!canManagePeople) {
    return (
      <div className="form-grid">
        <Field label={labels.firstName}>
          <Input value={identity.firstName} disabled />
        </Field>
        <Field label={labels.lastName}>
          <Input value={identity.lastName} disabled />
        </Field>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="instructor-identity-form">
      <div className="form-grid">
        <Field label={labels.firstName}>
          <Input {...register('firstName')} />
        </Field>
        <Field label={labels.lastName}>
          <Input {...register('lastName')} />
        </Field>
        <Field label={labels.email} wide>
          <Input type="email" {...register('email')} />
        </Field>
        <Field label={labels.phone}>
          <Input type="tel" {...register('phone')} />
        </Field>
        <Field label={labels.address} wide>
          <Input {...register('address')} />
        </Field>
        <Field label={labels.fiscalCode}>
          <Input {...register('fiscalCode')} />
        </Field>
      </div>
      {formError ? (
        <p role="alert" data-testid="instructor-identity-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 10 }}>
          {formError}
        </p>
      ) : null}
      <div style={{ marginTop: 10 }}>
        <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="instructor-identity-submit">
          {labels.save}
        </button>
      </div>
    </form>
  );
}

// --- Abilitazioni (PUT profiles/instructor, `people.manage`) ----------------

function RatingsForm({
  personId,
  initialRatings,
  canManagePeople,
  labels,
  toast,
  toastLabels,
  onSaved,
}: {
  personId: string;
  initialRatings: string;
  canManagePeople: boolean;
  labels: InstructorEditorLabels['ratings'];
  toast: ToastHandle;
  toastLabels: ToastLabels;
  onSaved: (patch: Partial<InstructorRow>) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InstructorProfileRequestInput>({
    resolver: zodResolver(instructorProfileRequestSchema),
    values: { ratings: initialRatings },
  });

  async function onSubmit(values: InstructorProfileRequestInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${personId}/profiles/instructor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setFormError(toastLabels.genericError);
      return;
    }
    toast.show(toastLabels.ratingsSaved, 'ok');
    onSaved({ ratings: values.ratings });
  }

  if (!canManagePeople) {
    return <p className="fld-label" style={{ textTransform: 'none' }}>{initialRatings}</p>;
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="instructor-ratings-form">
      <div className="form-grid">
        <Field label={labels.label} wide>
          <Input aria-invalid={Boolean(errors.ratings)} {...register('ratings')} />
        </Field>
      </div>
      {formError ? (
        <p role="alert" data-testid="instructor-ratings-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
          {formError}
        </p>
      ) : null}
      <div style={{ marginTop: 10 }}>
        <button type="submit" disabled={isSubmitting} className="btn" data-testid="instructor-ratings-submit">
          {labels.save}
        </button>
      </div>
    </form>
  );
}

// --- Tariffa payout (PUT instructor-compensation/{id}/rate, `payouts.manage`) -----

const payoutRateFormSchema = z.object({ rate: z.string() }).refine(
  (values) => {
    const trimmed = values.rate.trim();
    if (trimmed.length === 0) return true;
    try {
      return parseCents(trimmed) >= 0 && parseCents(trimmed) <= 2_147_483_647;
    } catch {
      return false;
    }
  },
  { message: 'invalidRate', path: ['rate'] },
);

type PayoutRateFormValues = z.infer<typeof payoutRateFormSchema>;

function PayoutRateForm({
  personId,
  initialRateCents,
  canManagePayouts,
  locale,
  labels,
  errorLabels,
  toast,
  toastLabels,
  onSaved,
}: {
  personId: string;
  initialRateCents: number | null;
  canManagePayouts: boolean;
  locale: 'it' | 'en';
  labels: InstructorEditorLabels['payoutRate'];
  errorLabels: InstructorEditorLabels['errors'];
  toast: ToastHandle;
  toastLabels: ToastLabels;
  onSaved: (patch: Partial<InstructorRow>) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PayoutRateFormValues>({
    resolver: zodResolver(payoutRateFormSchema),
    values: { rate: initialRateCents === null ? '' : (initialRateCents / 100).toFixed(2).replace('.', ',') },
  });

  async function onSubmit(values: PayoutRateFormValues): Promise<void> {
    setFormError(null);
    const trimmed = values.rate.trim();
    const payoutRateCents = trimmed.length === 0 ? null : parseCents(trimmed);

    const response = await fetch(`/api/v1/instructor-compensation/${personId}/rate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payoutRateCents }),
    });
    if (!response.ok) {
      setFormError(toastLabels.genericError);
      return;
    }
    toast.show(toastLabels.rateSet, 'ok');
    onSaved({ payoutRateCents });
  }

  if (!canManagePayouts) {
    return (
      <p className="fld-label" style={{ textTransform: 'none' }}>
        {initialRateCents === null ? labels.noValue : `${formatCents(initialRateCents, locale)}/h`}
        {' — '}
        {labels.readOnlyHint}
      </p>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="instructor-payout-rate-form">
      <div className="form-grid">
        <Field label={labels.label}>
          <InputGroup prefix="€" suffix="/h">
            <Input inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(errors.rate)} {...register('rate')} />
          </InputGroup>
        </Field>
      </div>
      {errors.rate ? (
        <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
          {errorLabels.invalidRate}
        </p>
      ) : null}
      {formError ? (
        <p role="alert" data-testid="instructor-payout-rate-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
          {formError}
        </p>
      ) : null}
      <div style={{ marginTop: 10 }}>
        <button type="submit" disabled={isSubmitting} className="btn" data-testid="instructor-payout-rate-submit">
          {labels.save}
        </button>
      </div>
    </form>
  );
}
