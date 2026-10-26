'use client';

/**
 * Instructor slide-over editor (story 12.7, AC 6) — port of
 * `docs/design-reference/airops/src/People.jsx#InstructorEditor` onto the
 * REAL domain: anagrafica (PATCH people, `people.manage`), payout rate (PUT
 * instructor-compensation/{id}/rate, `payouts.manage` — the RATIFIED
 * permission, admin-only), the STUDENT-charged rate panel (moved here from
 * `people/[id]`, `settings.manage`, D8 — clearly labeled distinct from the
 * payout rate), and ore/dovuto READ-ONLY. NO "Cadenza pagamenti" (D13 — the
 * prototype's Mensile/Settimanale/Per volo selector has no domain
 * counterpart, not ported).
 *
 * Story 13.1 (R-13.1-b): the free-text "abilitazioni" section (PUT
 * profiles/instructor) is REMOVED along with `InstructorProfile.ratings` —
 * abilitazioni now live as `Expiry` rows. Story 13.2 (AC 5, gap N6 from
 * 13.1) restores their display/editing here as a catalogue-driven chip
 * picker (`LiveExpiryEditor`, `kind="RATING"`, scope INSTRUCTORS — the same
 * component the pilot editor's own Ratings section uses, AC 2) — never free
 * text.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input, InputGroup } from '@/components/ui/field';
import { SlideOver } from '@/components/ui/slide-over';
import { LiveExpiryEditor, type LiveExpiryEditorLabels } from '@/components/dashboard/expiry-editor';
import { parseApiError } from '@/lib/api-field-errors';
import { focusFirstInvalid } from '@/lib/dom-focus';
import type { ProfileFlags } from '@/lib/expiry-scope';
import { formatCents, parseCents } from '@/lib/money';
import { updatePersonSchema, type UpdatePersonInput } from '@/lib/schemas/people';
import { formatMinutes } from '@/lib/time';
import { InstructorRatesPanel, type InstructorRatesPanelLabels } from './instructor-rates-panel';
import type { InstructorRow } from './instructors-console';

/** Instructor editor viewers are, by construction, an active INSTRUCTORS profile (this console only lists those) — no OTHER profile flag is known here, so the ratings picker only ever offers `INSTRUCTORS`/`ALL`-scoped catalogue types (AC 5's literal scope). */
const INSTRUCTOR_PROFILE_FLAGS: ProfileFlags = { pilot: false, student: false, instructor: true };

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
    /** Story 14.2, AC 1/4: this section had NO required-field feedback at all (not even `aria-invalid`) — its own `updatePersonSchema` RHF errors were silently dropped. */
    requiredField: string;
  };
  payoutRate: { sectionTitle: string; label: string; noValue: string; save: string };
  ratings: { sectionTitle: string } & LiveExpiryEditorLabels;
  readOnly: { sectionTitle: string; hoursTotal: string; owedTotal: string };
  studentRate: InstructorRatesPanelLabels & { heading: string };
  errors: { generic: string; invalidRate: string };
};

type ToastLabels = { genericError: string; rateSet: string; identitySaved: string };
type ToastHandle = { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };

type InstructorEditorProps = {
  instructor: InstructorRow | null;
  onClose: () => void;
  onMutated: () => void;
  canManagePeople: boolean;
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
  // without a local merge, the payout-rate field (and this header) would
  // keep showing the PRE-save value until the slide-over is closed and
  // reopened. `initialRateCents` reacts to `current` (not the original prop)
  // so the sub-form re-syncs immediately after its own save. The
  // `Ore totali`/`Dovuto` readonly fields are the one exception —
  // they are server-COMPUTED from flight/payout data no sub-form response
  // carries, so they only refresh once the editor is reopened
  // (`onMutated`'s `router.refresh()` already keeps the TABLE row itself
  // correct in the meantime).
  const [current, setCurrent] = useState<InstructorRow | null>(instructor);
  /** Mirrors `IdentitySection`: `ready` = the editable form is mounted (not the load-error, loading or read-only branch), `busy` = a save is in flight. */
  const [identityForm, setIdentityForm] = useState<{ ready: boolean; busy: boolean }>({ ready: false, busy: false });

  function applyPatch(patch: Partial<InstructorRow>): void {
    setCurrent((existing) => (existing ? { ...existing, ...patch } : existing));
    onMutated();
  }

  const open = current !== null;
  const title = current ? `${current.lastName} ${current.firstName}` : '';

  /* Story 15.10 (R-15.10-f): the anagrafica's save moves from the in-body
     `.so-actions` bar to `SlideOver`'s `footer` (`.so-foot`, OUTSIDE the
     scrolling `.so-body`), wired to its form with `form="instructor-identity-form"`.
     Measured at 375px before the move: `.so-body` scrolls 2642px inside 716px
     and the sticky bar ended at `top -1383.53`, with `elementFromPoint` on the
     submit returning FALSE. It renders only when the identity form itself does
     — the section has a load-error, a loading and a READ-ONLY branch (no
     `canManagePeople`), and a footer submit pointing at a form that is not in
     the DOM would be a dead control. The rate/tariffa submits below stay in
     their own sections, as ratified. */
  const identityFooter = identityForm.ready ? (
    <>
      <div style={{ flex: 1 }} />
      <button type="submit" form="instructor-identity-form" disabled={identityForm.busy} className="btn primary" data-testid="instructor-identity-submit">
        {labels.identity.save}
      </button>
    </>
  ) : undefined;

  return (
    <SlideOver open={open} onClose={onClose} title={title} closeLabel={labels.closeLabel} footer={identityFooter}>
      {current ? (
        <>
          <IdentitySection
            personId={current.personId}
            canManagePeople={canManagePeople}
            locale={locale}
            labels={labels.identity}
            toast={toast}
            toastLabels={toastLabels}
            onFormStateChange={setIdentityForm}
            onSaved={(patch) => applyPatch(patch)}
          />

          <Section title={labels.ratings.sectionTitle}>
            <LiveExpiryEditor personId={current.personId} kind="RATING" profiles={INSTRUCTOR_PROFILE_FLAGS} locale={locale} labels={labels.ratings} />
          </Section>

          <Section title={labels.payoutRate.sectionTitle}>
            <PayoutRateForm
              personId={current.personId}
              initialRateCents={current.payoutRateCents}
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
  onFormStateChange,
  onSaved,
}: {
  personId: string;
  canManagePeople: boolean;
  locale: 'it' | 'en';
  labels: InstructorEditorLabels['identity'];
  toast: ToastHandle;
  toastLabels: ToastLabels;
  /** `useState`'s setter — stable by contract, so the effect below cannot loop. */
  onFormStateChange: (state: { ready: boolean; busy: boolean }) => void;
  onSaved: (patch: Partial<InstructorRow>) => void;
}) {
  const [identity, setIdentity] = useState<PersonIdentity | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

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
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePersonInput>({
    resolver: zodResolver(updatePersonSchema),
    values: identity ?? undefined,
  });

  // The submit that runs this form lives in the panel's `.so-foot` (story
  // 15.10), outside this component: it needs to know whether the form exists
  // at all and whether a request is in flight.
  const formMounted = !loadError && identity !== null && canManagePeople;
  useEffect(() => {
    onFormStateChange({ ready: formMounted, busy: isSubmitting });
  }, [formMounted, isSubmitting, onFormStateChange]);

  async function onSubmit(values: UpdatePersonInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${personId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      if (response.status === 422) {
        // Review F1: this section had no 422-mapping at all (twin gap to
        // `pilots/pilot-editor.tsx#IdentitySection`'s own `updatePersonSchema`
        // form) — same field-shaped 422 handling, reusing `labels.requiredField`.
        const { fieldErrors } = await parseApiError(response);
        const known: Array<keyof UpdatePersonInput> = ['firstName', 'lastName', 'email', 'phone', 'address', 'fiscalCode'];
        let mapped = false;
        for (const field of known) {
          if (fieldErrors.has(field)) {
            setError(field, { type: 'server', message: labels.requiredField });
            mapped = true;
          }
        }
        if (mapped) {
          setTimeout(() => focusFirstInvalid(formRef.current), 0);
          return;
        }
      }
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
    <form id="instructor-identity-form" ref={formRef} onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="instructor-identity-form">
      <div className="form-grid">
        <Field label={labels.firstName} error={errors.firstName ? labels.requiredField : undefined}>
          <Input aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
        </Field>
        <Field label={labels.lastName} error={errors.lastName ? labels.requiredField : undefined}>
          <Input aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
        </Field>
        <Field label={labels.email} wide error={errors.email ? labels.requiredField : undefined}>
          <Input type="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
        </Field>
        <Field label={labels.phone} error={errors.phone ? labels.requiredField : undefined}>
          <Input type="tel" aria-invalid={Boolean(errors.phone)} {...register('phone')} />
        </Field>
        <Field label={labels.address} wide error={errors.address ? labels.requiredField : undefined}>
          <Input aria-invalid={Boolean(errors.address)} {...register('address')} />
        </Field>
        <Field label={labels.fiscalCode} error={errors.fiscalCode ? labels.requiredField : undefined}>
          <Input aria-invalid={Boolean(errors.fiscalCode)} {...register('fiscalCode')} />
        </Field>
      </div>
      {formError ? (
        <p role="alert" data-testid="instructor-identity-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 10 }}>
          {formError}
        </p>
      ) : null}
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
  labels,
  errorLabels,
  toast,
  toastLabels,
  onSaved,
}: {
  personId: string;
  initialRateCents: number | null;
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

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="instructor-payout-rate-form">
      <div className="form-grid">
        <Field label={labels.label} error={errors.rate ? errorLabels.invalidRate : undefined}>
          <InputGroup prefix="€" suffix="/h">
            <Input inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(errors.rate)} {...register('rate')} />
          </InputGroup>
        </Field>
      </div>
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
