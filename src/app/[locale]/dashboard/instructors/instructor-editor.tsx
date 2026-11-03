'use client';

/**
 * Instructor slide-over editor (story 12.7, AC 6) — port of
 * `docs/design-reference/airops/src/People.jsx#InstructorEditor` onto the
 * REAL domain: anagrafica, ratings, the compensation PAID to the instructor
 * (`InstructorProfile.payoutRateCents`, `payouts.manage`), the rate CHARGED
 * to the student (`InstructorRate`, `settings.manage`, D8 — clearly labeled
 * distinct from the compensation), and ore/dovuto READ-ONLY. NO "Cadenza
 * pagamenti" (D13 — the prototype's Mensile/Settimanale/Per volo selector has
 * no domain counterpart, not ported).
 *
 * Story 13.1 (R-13.1-b): abilitazioni live as `Expiry` rows on
 * `INSTRUCTORS`-scoped types, picked from the catalogue — never free text.
 *
 * Story 19.4 (R-19-m, A17): ONE form — anagrafica, ratings (draft), the
 * compensation and the student rate — and ONE "Salva" in the panel footer,
 * which sends ONE `PATCH /api/v1/people/{id}` with only what changed (D-3);
 * the server saves it all or nothing. The student rate follows R-19-f, like
 * the aircraft's (story 19.3): the rate in effect today is the price field's
 * placeholder and hint, an empty field changes nothing, "In vigore da" is
 * today (Europe/Rome) at the earliest, no history — only the next scheduled
 * change, on one line (Q-19.4-b). The compensation has no decorrenza: its
 * field holds the current value, and emptying it means no compensation
 * (Q-19.4-a).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Field, Input, InputGroup } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { SlideOver } from '@/components/ui/slide-over';
import { ExpiryDraftEditor, usePersonExpiryDraft, type ExpiryDraftEditorLabels, type ExpiryKind } from '@/components/dashboard/expiry-editor';
import { parseApiError } from '@/lib/api-field-errors';
import { focusFirstInvalid } from '@/lib/dom-focus';
import type { ProfileFlags } from '@/lib/expiry-scope';
import { formatCents, parseCents } from '@/lib/money';
import { blankToNull, changedIdentityFields, IDENTITY_FIELDS, personSaveError, type PersonSaveErrorLabels, type PersonSaveSection } from '@/lib/person-save';
import { updatePersonSchema, type InstructorRateItemDto, type PersonDetailDto, type UpdatePersonCompositeInput, type UpdatePersonInput } from '@/lib/schemas/people';
import { APP_TIMEZONE, formatDateOnly, formatMinutes } from '@/lib/time';
import { todayDateOnlyInZone } from '@/lib/zoned-time';
import type { InstructorRow } from './instructors-console';

/** Instructor editor viewers are, by construction, an active INSTRUCTORS profile (this console only lists those) — no OTHER profile flag is known here, so the ratings picker only ever offers `INSTRUCTORS`/`ALL`-scoped catalogue types (AC 5's literal scope). */
const INSTRUCTOR_PROFILE_FLAGS: ProfileFlags = { pilot: false, student: false, instructor: true };

const INSTRUCTOR_EXPIRY_KINDS: readonly ExpiryKind[] = ['RATING'];

/** The server's cap on both money columns (`setInstructorPayoutRateSchema`, `createInstructorRateSchema`). */
const MAX_CENTS = 2_147_483_647;

export type InstructorEditorLabels = {
  closeLabel: string;
  cancel: string;
  /** The footer's single "Salva" — the same words as the pilot editor's. */
  save: string;
  identity: {
    sectionTitle: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    loadError: string;
    /** Story 14.2, AC 1/4: this section had NO required-field feedback at all (not even `aria-invalid`) — its own `updatePersonSchema` RHF errors were silently dropped. */
    requiredField: string;
  };
  payoutRate: { sectionTitle: string; label: string; noValue: string };
  ratings: { sectionTitle: string } & ExpiryDraftEditorLabels;
  readOnly: { sectionTitle: string; hoursTotal: string; owedTotal: string };
  studentRate: {
    heading: string;
    price: string;
    validFrom: string;
    /** `t.raw` template with a `{price}` placeholder — the price field's hint when a rate is in effect today (the placeholder alone is not accessible). */
    currentHint: string;
    noCurrentRate: string;
    /** `t.raw` template with `{date}`/`{price}` — the one line of the next scheduled rate (Q-19.4-b). */
    next: string;
    /** The rates could not be read (review 19.4 F3): shown INSTEAD of the current rate's hint — never "no rate in effect". */
    loadError: string;
    requiredField: string;
    invalidPrice: string;
    invalidDate: string;
    validFromPast: string;
  };
  errors: { invalidRate: string };
  /** A failed Salva, one message per reason (review 19.4 F2) — the pilot editor's own (`pilot-editor-labels.ts#buildPersonSaveErrorLabels`). */
  saveErrors: PersonSaveErrorLabels;
};

type ToastLabels = { saved: string };
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
  // without a local merge, this header and the compensation the next Salva
  // compares against would stay on the PRE-save values until the slide-over
  // is reopened. The `Ore totali`/`Dovuto` readonly fields are the one
  // exception — they are server-COMPUTED from flight/payout data the Salva's
  // response does not carry, so they only refresh once the editor is reopened
  // (`onMutated`'s `router.refresh()` already keeps the TABLE row itself
  // correct in the meantime).
  const [current, setCurrent] = useState<InstructorRow | null>(instructor);
  /** Mirrors `EditInstructorForm`: `ready` = the editable form is mounted (not the load-error, loading or read-only branch), `dirty` = something to save (D-5), `busy` = a save is in flight. */
  const [formState, setFormState] = useState<{ ready: boolean; dirty: boolean; busy: boolean }>({ ready: false, dirty: false, busy: false });

  function applyPatch(patch: Partial<InstructorRow>): void {
    setCurrent((existing) => (existing ? { ...existing, ...patch } : existing));
    onMutated();
  }

  const open = current !== null;
  const title = current ? `${current.lastName} ${current.firstName}` : '';

  /* The panel's ONE "Salva" (story 19.4) lives in `SlideOver`'s `footer`
     (`.so-foot`, OUTSIDE the scrolling `.so-body` — story 15.10 measured a
     submit inside the body leaving the viewport at 375px), wired to its form
     with `form="instructor-identity-form"`. It renders only when that form
     itself does — the editor has a load-error, a loading and a READ-ONLY
     branch (no `canManagePeople`), and a footer submit pointing at a form that
     is not in the DOM would be a dead control. */
  const footer = formState.ready ? (
    <>
      <div style={{ flex: 1 }} />
      <button type="button" className="btn" onClick={onClose}>
        {labels.cancel}
      </button>
      <button
        type="submit"
        form="instructor-identity-form"
        disabled={!formState.dirty || formState.busy}
        className="btn primary"
        data-testid="instructor-identity-submit"
      >
        {labels.save}
      </button>
    </>
  ) : undefined;

  return (
    <SlideOver open={open} onClose={onClose} title={title} closeLabel={labels.closeLabel} footer={footer}>
      {current ? (
        <>
          <EditInstructorForm
            instructor={current}
            canManagePeople={canManagePeople}
            locale={locale}
            labels={labels}
            toast={toast}
            toastLabels={toastLabels}
            onStateChange={setFormState}
            onSaved={applyPatch}
          />

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

// --- The form ------------------------------------------------------------------

type PersonIdentity = Pick<PersonDetailDto, 'firstName' | 'lastName' | 'email' | 'phone' | 'address'>;

function identityOf(person: PersonIdentity): PersonIdentity {
  return { firstName: person.firstName, lastName: person.lastName, email: person.email, phone: person.phone, address: person.address };
}

async function fetchPersonIdentity(personId: string): Promise<PersonIdentity | null> {
  const response = await fetch(`/api/v1/people/${personId}`);
  if (!response.ok) return null;
  return identityOf((await response.json()) as PersonIdentity);
}

/** `null` = the read failed (review 19.4 F3): an empty list would read as "no rate in effect" and invite a rate "from today" over the real one. */
async function fetchInstructorRates(personId: string): Promise<InstructorRateItemDto[] | null> {
  const response = await fetch(`/api/v1/people/${personId}/instructor-rates`);
  if (!response.ok) return null;
  return (await response.json()) as InstructorRateItemDto[];
}

/** A price the way it is typed (`45,00` — no symbol, no grouping): the placeholder of the rate field and the value of the compensation field — the twin of `fleet/aircraft-editor.tsx#typableCents`. */
function typableCents(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** `null` = no compensation (empty field); `undefined` = not a valid amount. */
function payoutCentsOf(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    const cents = parseCents(trimmed);
    return cents >= 0 && cents <= MAX_CENTS ? cents : undefined;
  } catch {
    return undefined;
  }
}

function isValidRatePrice(value: string): boolean {
  try {
    const cents = parseCents(value.trim());
    return cents > 0 && cents <= MAX_CENTS;
  } catch {
    return false;
  }
}

/** Focuses where a failed Salva points: the first invalid control of that section, else its error message (story 19.4, AD-5). */
function focusSection(section: HTMLElement | null): void {
  if (!section) return;
  (section.querySelector<HTMLElement>('[aria-invalid="true"]') ?? section.querySelector<HTMLElement>('[role="alert"]'))?.focus();
}

/** A section's error after a failed Salva — `role="alert"` (announced) and focusable, so the focus can land on it when no field is to blame. */
function SectionError({ message, testId }: { message: string; testId: string }) {
  return (
    <p role="alert" tabIndex={-1} data-testid={testId} className="fld-label" style={{ color: 'var(--bad)', marginTop: 10, textTransform: 'none' }}>
      {message}
    </p>
  );
}

/**
 * Story 19.4 (AD-10): every editable part of the instructor in ONE form.
 * Same contract as `pilots/pilot-editor.tsx#EditPersonForm`: the Salva sends
 * only what differs from what was loaded, validated here first; a failure
 * keeps the whole draft and shows the error in its section; a success
 * realigns every part on the saved state.
 */
function EditInstructorForm({
  instructor,
  canManagePeople,
  locale,
  labels,
  toast,
  toastLabels,
  onStateChange,
  onSaved,
}: {
  instructor: InstructorRow;
  canManagePeople: boolean;
  locale: 'it' | 'en';
  labels: InstructorEditorLabels;
  toast: ToastHandle;
  toastLabels: ToastLabels;
  /** `useState`'s setter — stable by contract, so the effect below cannot loop. */
  onStateChange: (state: { ready: boolean; dirty: boolean; busy: boolean }) => void;
  onSaved: (patch: Partial<InstructorRow>) => void;
}) {
  const personId = instructor.personId;
  const formRef = useRef<HTMLFormElement | null>(null);
  const identityRef = useRef<HTMLDivElement | null>(null);
  const ratingsRef = useRef<HTMLDivElement | null>(null);
  const payoutRef = useRef<HTMLDivElement | null>(null);
  const rateRef = useRef<HTMLDivElement | null>(null);
  const formErrorRef = useRef<HTMLDivElement | null>(null);

  const [identity, setIdentity] = useState<PersonIdentity | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [rates, setRates] = useState<InstructorRateItemDto[] | null>(null);
  const [ratesLoadError, setRatesLoadError] = useState(false);

  // Fetch-on-mount: the promise callbacks set state, never the effect body
  // itself (the React Compiler's `react-hooks/set-state-in-effect` rule).
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
    void fetchInstructorRates(personId).then((result) => {
      if (cancelled) return;
      setRates(result);
      setRatesLoadError(result === null);
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePersonInput>({
    resolver: zodResolver(updatePersonSchema),
    values: identity ?? undefined,
  });
  const identityValues = useWatch({ control });

  const expiries = usePersonExpiryDraft(personId, INSTRUCTOR_EXPIRY_KINDS);

  const [payout, setPayout] = useState(instructor.payoutRateCents === null ? '' : typableCents(instructor.payoutRateCents));
  // A16 (story 16.9 AD-1 idiom, same as the aircraft editor): "today" is the
  // Europe/Rome calendar day the server's `RATE_VALID_FROM_IN_PAST` checks
  // against. Computed once per mount: the panel only renders client-side.
  const [today] = useState(() => todayDateOnlyInZone(APP_TIMEZONE));
  const [ratePrice, setRatePrice] = useState('');
  const [rateValidFrom, setRateValidFrom] = useState(today);
  /** The server's 422 `RATE_VALID_FROM_IN_PAST` (midnight between render and Salva) — cleared as soon as the date changes. */
  const [validFromServerPast, setValidFromServerPast] = useState(false);

  const [submitAttempted, setSubmitAttempted] = useState(false);
  /** `expiryTypeId` — the rating row the error is shown on instead of the section (review 19.4 F2). */
  const [saveError, setSaveError] = useState<{ section: PersonSaveSection; message: string; expiryTypeId: string | null } | null>(null);

  // D-10: the rate in effect today and the next scheduled one, from the list
  // (`validFrom` desc) — max `validFrom <= today`, min `validFrom > today`.
  const currentRate = rates?.find((rate) => rate.validFrom <= today) ?? null;
  const nextRate = rates?.filter((rate) => rate.validFrom > today).at(-1) ?? null;

  const changedIdentity = identity ? changedIdentityFields(identityValues, identity) : [];
  const payoutCents = payoutCentsOf(payout);
  const payoutChanged = payoutCents !== instructor.payoutRateCents;
  // Touched = a price typed; the date alone writes nothing (R-19-f: empty = unchanged).
  const rateTouched = ratePrice.trim().length > 0;
  const hasExpiryChanges = expiries.changes.set.length > 0 || expiries.changes.remove.length > 0;
  const dirty = changedIdentity.length > 0 || payoutChanged || rateTouched || hasExpiryChanges;

  const payoutError = payoutCents === undefined ? labels.errors.invalidRate : null;
  const trimmedValidFrom = rateValidFrom.trim();
  const ratePriceError = rateTouched && !isValidRatePrice(ratePrice) ? labels.studentRate.invalidPrice : null;
  // The native `min` does not stop a TYPED earlier date (the form is
  // `noValidate`), so "before today" is checked here — ISO strings compare as dates.
  const rateValidFromError = !rateTouched
    ? null
    : trimmedValidFrom.length === 0
      ? labels.studentRate.requiredField
      : !/^\d{4}-\d{2}-\d{2}$/.test(trimmedValidFrom)
        ? labels.studentRate.invalidDate
        : trimmedValidFrom < today || validFromServerPast
          ? labels.studentRate.validFromPast
          : null;

  const ready = !loadError && identity !== null && canManagePeople;
  // The submit that runs this form lives in the panel's `.so-foot`, outside
  // this component: it needs to know whether the form exists at all, whether
  // there is anything to save and whether a request is in flight.
  useEffect(() => {
    onStateChange({ ready, dirty, busy: isSubmitting });
  }, [ready, dirty, isSubmitting, onStateChange]);

  // A failed Salva moves the focus into the section it names — once the error
  // is committed (same reason as `pilots/pilot-editor.tsx#EditPersonForm`).
  useEffect(() => {
    if (!saveError) return;
    const section = saveError.section;
    focusSection(
      (section === 'identity' ? identityRef : section === 'expiries' ? ratingsRef : section === 'payoutRate' ? payoutRef : section === 'instructorRate' ? rateRef : formErrorRef)
        .current,
    );
  }, [saveError]);

  function onInvalid(): void {
    setSubmitAttempted(true);
    setSaveError(null);
  }

  async function onSubmit(values: UpdatePersonInput): Promise<void> {
    setSubmitAttempted(true);
    setSaveError(null);
    if (payoutError || ratePriceError || rateValidFromError || expiries.missingDateIds.size > 0) {
      setTimeout(() => focusFirstInvalid(formRef.current), 0);
      return;
    }

    const body: UpdatePersonCompositeInput = {};
    for (const field of changedIdentity) {
      (body as Record<string, unknown>)[field] = values[field] ?? null;
    }
    if (hasExpiryChanges) {
      const { set, remove } = expiries.changes;
      body.expiries = { ...(set.length > 0 && { set }), ...(remove.length > 0 && { remove }) };
    }
    if (payoutChanged) body.payoutRateCents = payoutCents ?? null;
    if (rateTouched) body.instructorRate = { priceCentsPerHour: parseCents(ratePrice.trim()), validFrom: trimmedValidFrom };

    const response = await fetch(`/api/v1/people/${personId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const parsed = await parseApiError(response);
      const error = personSaveError(parsed, body.payoutRateCents !== undefined);
      if (error.reason === 'invalidField') {
        // Review F1 of story 14.2: the field-shaped 422 marks THAT field.
        for (const field of IDENTITY_FIELDS) {
          if (parsed.fieldErrors.has(field)) setError(field, { type: 'server', message: labels.identity.requiredField });
        }
        setTimeout(() => focusFirstInvalid(identityRef.current), 0);
        return;
      }
      if (error.reason === 'rateValidFromPast') {
        setValidFromServerPast(true);
        setTimeout(() => focusFirstInvalid(rateRef.current), 0);
        return;
      }
      setSaveError({
        // No profiles section here: the form-wide banner.
        section: error.section === 'profiles' ? 'form' : error.section,
        message: labels.saveErrors[error.reason],
        expiryTypeId: error.expiryTypeId !== null && error.expiryTypeId in expiries.rows ? error.expiryTypeId : null,
      });
      return;
    }

    const updated = (await response.json()) as PersonDetailDto;
    toast.show(toastLabels.saved, 'ok');
    // Realign every part on what the server saved (D-4): nothing left to save.
    // The compensation is not in the response: it is the value just sent.
    const savedPayout = payoutChanged ? (payoutCents ?? null) : instructor.payoutRateCents;
    setIdentity(identityOf(updated));
    setPayout(savedPayout === null ? '' : typableCents(savedPayout));
    setRatePrice('');
    setRateValidFrom(today);
    setValidFromServerPast(false);
    setSubmitAttempted(false);
    onSaved({ firstName: updated.firstName, lastName: updated.lastName, payoutRateCents: savedPayout });
    const [nextRates] = await Promise.all([fetchInstructorRates(personId), expiries.reload()]);
    setRates(nextRates);
    setRatesLoadError(nextRates === null);
  }

  if (loadError) {
    return (
      <p className="fld-label" style={{ color: 'var(--bad)' }}>
        {labels.identity.loadError}
      </p>
    );
  }
  if (!identity) {
    return <p className="fld-label">…</p>;
  }
  if (!canManagePeople) {
    return (
      <div className="form-grid">
        <Field label={labels.identity.firstName}>
          <Input value={identity.firstName} disabled />
        </Field>
        <Field label={labels.identity.lastName}>
          <Input value={identity.lastName} disabled />
        </Field>
      </div>
    );
  }

  const studentRate = labels.studentRate;
  const showRateErrors = submitAttempted || validFromServerPast;
  const rowError = saveError?.expiryTypeId ? { typeId: saveError.expiryTypeId, message: saveError.message } : null;

  return (
    <form id="instructor-identity-form" ref={formRef} onSubmit={(event) => void handleSubmit(onSubmit, onInvalid)(event)} noValidate data-testid="instructor-identity-form">
      <div ref={identityRef}>
        <div className="form-grid">
          <Field label={labels.identity.firstName} error={errors.firstName ? labels.identity.requiredField : undefined}>
            <Input aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
          </Field>
          <Field label={labels.identity.lastName} error={errors.lastName ? labels.identity.requiredField : undefined}>
            <Input aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
          </Field>
          <Field label={labels.identity.email} error={errors.email ? labels.identity.requiredField : undefined}>
            <Input type="email" aria-invalid={Boolean(errors.email)} {...register('email', { setValueAs: blankToNull })} />
          </Field>
          <Field label={labels.identity.phone} error={errors.phone ? labels.identity.requiredField : undefined}>
            <Input type="tel" aria-invalid={Boolean(errors.phone)} {...register('phone', { setValueAs: blankToNull })} />
          </Field>
          <Field label={labels.identity.address} wide error={errors.address ? labels.identity.requiredField : undefined}>
            <Input aria-invalid={Boolean(errors.address)} {...register('address', { setValueAs: blankToNull })} />
          </Field>
        </div>
        {saveError?.section === 'identity' ? <SectionError message={saveError.message} testId="instructor-identity-error" /> : null}
      </div>

      <Section title={labels.ratings.sectionTitle}>
        <div ref={ratingsRef} data-testid="instructor-ratings-editor">
          <ExpiryDraftEditor
            draft={expiries}
            kind="RATING"
            profiles={INSTRUCTOR_PROFILE_FLAGS}
            labels={labels.ratings}
            showMissingDates={submitAttempted}
            rowError={rowError}
          />
          {saveError?.section === 'expiries' && !rowError ? <SectionError message={saveError.message} testId="instructor-ratings-error" /> : null}
        </div>
      </Section>

      <Section title={labels.payoutRate.sectionTitle}>
        <div ref={payoutRef} data-testid="instructor-payout-rate-form">
          <div className="form-grid">
            <Field label={labels.payoutRate.label} error={submitAttempted ? (payoutError ?? undefined) : undefined}>
              <InputGroup prefix="€" suffix="/h">
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-invalid={submitAttempted && payoutError !== null}
                  value={payout}
                  onChange={(event) => setPayout(event.target.value)}
                  data-testid="instructor-payout-rate"
                />
              </InputGroup>
            </Field>
          </div>
          {saveError?.section === 'payoutRate' ? <SectionError message={saveError.message} testId="instructor-payout-rate-error" /> : null}
        </div>
      </Section>

      <Section title={studentRate.heading}>
        <div ref={rateRef} data-testid="instructor-rates-panel">
          <div className="form-grid">
            <Field
              label={studentRate.price}
              // A failed read takes the hint's place (review 19.4 F3) — announced, but the field itself is not invalid.
              error={showRateErrors && ratePriceError !== null ? ratePriceError : ratesLoadError ? studentRate.loadError : undefined}
              hint={
                rates === null
                  ? undefined
                  : currentRate
                    ? studentRate.currentHint.replace('{price}', formatCents(currentRate.priceCentsPerHour, locale))
                    : studentRate.noCurrentRate
              }
            >
              <Input
                inputMode="decimal"
                placeholder={currentRate ? typableCents(currentRate.priceCentsPerHour) : undefined}
                aria-invalid={showRateErrors && ratePriceError !== null}
                value={ratePrice}
                onChange={(event) => setRatePrice(event.target.value)}
                data-testid="instructor-rate-price"
              />
            </Field>
            <Field label={studentRate.validFrom} error={showRateErrors ? (rateValidFromError ?? undefined) : undefined}>
              <DateInput
                aria-invalid={showRateErrors && rateValidFromError !== null}
                value={rateValidFrom}
                min={today}
                onChange={(event) => {
                  setRateValidFrom(event.target.value);
                  setValidFromServerPast(false);
                }}
                data-testid="instructor-rate-valid-from"
              />
            </Field>
          </div>
          {nextRate ? (
            <p className="fld-hint" data-testid="instructor-rates-next" style={{ marginTop: 12 }}>
              {studentRate.next.replace('{date}', formatDateOnly(nextRate.validFrom, locale)).replace('{price}', formatCents(nextRate.priceCentsPerHour, locale))}
            </p>
          ) : null}
          {saveError?.section === 'instructorRate' ? <SectionError message={saveError.message} testId="instructor-rates-error" /> : null}
        </div>
      </Section>

      <div ref={formErrorRef}>{saveError?.section === 'form' ? <SectionError message={saveError.message} testId="instructor-save-error" /> : null}</div>
    </form>
  );
}
