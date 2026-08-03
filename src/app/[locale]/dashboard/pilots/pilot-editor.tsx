'use client';

/**
 * Pilot slide-over editor (story 12.6, AC 3/4; rebuilt story 13.2) — port of
 * `docs/design-reference/airops/src/People.jsx#PilotEditor` extended to
 * sections carrying the REAL domain concepts the prototype's flat
 * name/license/medical form has no counterpart for (same rationale as
 * `fleet/aircraft-editor.tsx`'s own extension over its own prototype):
 * anagrafica, profili (pilota/allievo/istruttore), ratings + visita medica
 * (EDITABLE inline, story 13.2 AC 2 — was READ-ONLY through story 12.6),
 * accesso (ADMIN-only), archivio.
 *
 * Story 13.2 (AC 1, "form unico"): the CREATE flow (`NewPersonForm` below)
 * is ONE form bundling anagrafica + profile activation + ratings/medical
 * chips + accesso into a SINGLE `POST /api/v1/people` composite call (the
 * one-step API story 13.1 already built) — no more two-step
 * create-then-edit. The EDIT flow keeps the existing per-section
 * activate/save/deactivate forms (`ProfilesSection` etc., unchanged).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Role } from '@/generated/prisma/client';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { fetchExpiryTypes, LiveExpiryEditor, type ExpiryCatalogEntry, type LiveExpiryEditorLabels } from '@/components/dashboard/expiry-editor';
import { isExpiryScopeCompatible, type ProfileFlags } from '@/lib/expiry-scope';
import { formatDateOnly } from '@/lib/time';
import { parseApiError } from '@/lib/api-field-errors';
import { focusFirstInvalid } from '@/lib/dom-focus';
import {
  createPersonBaseSchema,
  instructorProfileRequestSchema,
  pilotProfileRequestSchema,
  studentProfileRequestSchema,
  updatePersonSchema,
  type CreatePersonInput,
  type InstructorProfileRequestInput,
  type PilotProfileRequestInput,
  type StudentProfileRequestInput,
  type UpdatePersonInput,
} from '@/lib/schemas/people';
import type { PilotRow, PilotUser } from './pilots-console';

export type PilotEditorLabels = {
  newTitle: string;
  newSubtitle: string;
  closeLabel: string;
  cancel: string;
  submitCreate: string;
  submitEdit: string;
  identity: { sectionTitle: string; firstName: string; lastName: string; email: string; phone: string; address: string; fiscalCode: string };
  profiles: {
    sectionTitle: string;
    status: { active: string; inactive: string; notActivated: string };
    actions: {
      activate: string;
      edit: string;
      reactivate: string;
      deactivate: string;
      confirmDeactivate: string;
      confirmYes: string;
      confirmCancel: string;
      cancel: string;
      save: string;
    };
    errors: { requiredField: string; generic: string };
    pilot: { title: string; licenseNumber: string; licenseType: string };
    student: { title: string; courseStartDate: string };
    instructor: { title: string };
  };
  /** `sectionTitle` wraps BOTH the Ratings and the Visita medica editors (AC 2: "stessa sezione") — the rest mirrors `LiveExpiryEditorLabels`. */
  ratings: { sectionTitle: string } & LiveExpiryEditorLabels;
  /** `subHeading` is the in-section label above the medical picker (AC 2/1) — the rest mirrors `LiveExpiryEditorLabels`. */
  medical: { subHeading: string } & LiveExpiryEditorLabels;
  access: {
    sectionTitle: string;
    noUser: string;
    email: string;
    roles: string;
    roleOptions: Record<Role, string>;
    rolesRequired: string;
    createSubmit: string;
    userSummary: string;
    statusActive: string;
    statusPending: string;
    resendInvite: string;
    emailConflict: string;
    genericError: string;
    /** New person form only (story 13.2, AC 1): the "grant access" checkbox that folds the `access` block into the composite create. */
    grantLabel: string;
    invalidEmail: string;
  };
  archive: { sectionTitle: string; archive: string; unarchive: string; confirmArchive: string; confirmUnarchive: string; confirmYes: string; confirmCancel: string };
  errors: { required: string; generic: string; conflictEmail: string };
};

export type ToastLabels = {
  created: string;
  updated: string;
  archived: string;
  unarchived: string;
  userCreated: string;
  inviteResent: string;
  genericError: string;
};

type ToastHandle = { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };

type EditorTarget = { mode: 'new' } | { mode: 'edit'; pilot: PilotRow };

type PilotEditorProps = {
  target: EditorTarget | null;
  onClose: () => void;
  /** Refreshes the server-rendered list (AD-1) — called after every successful mutation. */
  onMutated: () => void;
  canManageUsers: boolean;
  locale: 'it' | 'en';
  labels: PilotEditorLabels;
  toastLabels: ToastLabels;
};

type ApiErrorBody = { error?: { code?: string } };

async function errorCodeOf(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return (body as ApiErrorBody | null)?.error?.code ?? null;
}

export function PilotEditor({ target, onClose, onMutated, canManageUsers, locale, labels, toastLabels }: PilotEditorProps) {
  const toast = useToast();
  const isNew = target?.mode === 'new';
  const [current, setCurrent] = useState<PilotRow | null>(target?.mode === 'edit' ? target.pilot : null);

  const open = target !== null;
  const title = isNew ? labels.newTitle : current ? `${current.lastName} ${current.firstName}` : '';
  const subtitle = isNew ? labels.newSubtitle : (current?.email ?? '');

  /** Merges a partial API response into the editor's own working copy (same rationale as `AircraftEditor`'s `handleMutated`) and tells the parent list to refresh. */
  function applyPatch(patch: Partial<PilotRow>): void {
    setCurrent((existing) => (existing ? { ...existing, ...patch } : existing));
    onMutated();
  }

  return (
    <SlideOver open={open} onClose={onClose} title={title} subtitle={subtitle} closeLabel={labels.closeLabel}>
      {isNew ? (
        <NewPersonForm labels={labels} toast={toast} toastLabels={toastLabels} canManageUsers={canManageUsers} onClose={onClose} onCreated={onMutated} />
      ) : current ? (
        <>
          <IdentitySection pilot={current} labels={labels} toast={toast} toastLabels={toastLabels} onClose={onClose} onSaved={applyPatch} />

          <Section title={labels.profiles.sectionTitle}>
            <ProfilesSection personId={current.id} locale={locale} labels={labels.profiles} onChanged={(profiles) => applyPatch({ profiles })} />
          </Section>

          <Section title={labels.ratings.sectionTitle}>
            <RatingsSection personId={current.id} profiles={current.profiles} ratingsLabels={labels.ratings} medicalLabels={labels.medical} locale={locale} />
          </Section>

          {canManageUsers ? (
            <Section title={labels.access.sectionTitle}>
              <AccessSection
                personId={current.id}
                email={current.email}
                user={current.user}
                labels={labels.access}
                toast={toast}
                toastLabels={toastLabels}
                onMutated={(user) => applyPatch({ user })}
              />
            </Section>
          ) : null}

          <Section title={labels.archive.sectionTitle}>
            <ArchiveSection pilot={current} labels={labels.archive} toast={toast} toastLabels={toastLabels} onMutated={applyPatch} />
          </Section>
        </>
      ) : null}
    </SlideOver>
  );
}

/** Shared section wrapper — same convention as `aircraft-editor.tsx#Section`. */
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

// --- Identity (anagrafica, EDIT mode) ---------------------------------------

function IdentitySection({
  pilot,
  labels,
  toast,
  toastLabels,
  onClose,
  onSaved,
}: {
  pilot: PilotRow;
  labels: PilotEditorLabels;
  toast: ToastHandle;
  toastLabels: ToastLabels;
  onClose: () => void;
  onSaved: (patch: Partial<PilotRow>) => void;
}): React.JSX.Element {
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePersonInput>({
    resolver: zodResolver(updatePersonSchema),
    defaultValues: {
      firstName: pilot.firstName,
      lastName: pilot.lastName,
      email: pilot.email,
      phone: pilot.phone,
      address: pilot.address,
      fiscalCode: pilot.fiscalCode,
    },
  });

  async function onSubmit(values: UpdatePersonInput): Promise<void> {
    setFormError(null);

    const response = await fetch(`/api/v1/people/${pilot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      if (response.status === 422) {
        // Story 14.2, AC 3: a field-shaped 422 (e.g. a malformed email) marks
        // THAT field instead of only the bottom banner — `labels.errors.required`
        // is reused per field (same generic string, now targeted).
        const { fieldErrors } = await parseApiError(response);
        const known: Array<keyof UpdatePersonInput> = ['firstName', 'lastName', 'email', 'phone', 'address', 'fiscalCode'];
        let mapped = false;
        for (const field of known) {
          if (fieldErrors.has(field)) {
            setError(field, { type: 'server', message: labels.errors.required });
            mapped = true;
          }
        }
        if (mapped) {
          setTimeout(() => focusFirstInvalid(formRef.current), 0);
          return;
        }
      }
      const code = await errorCodeOf(response);
      setFormError(code === 'CONFLICT' ? labels.errors.conflictEmail : labels.errors.generic);
      return;
    }

    const updated = (await response.json()) as {
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      address: string | null;
      fiscalCode: string | null;
      archivedAt: string | null;
      profiles: { pilot: boolean; student: boolean; instructor: boolean };
    };

    toast.show(toastLabels.updated, 'ok');
    onSaved({
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      address: updated.address,
      fiscalCode: updated.fiscalCode,
      archivedAt: updated.archivedAt,
      profiles: updated.profiles,
    });
  }

  return (
    <form ref={formRef} onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="pilot-identity-form">
      <div className="form-grid">
        <Field label={labels.identity.firstName} error={errors.firstName ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
        </Field>
        <Field label={labels.identity.lastName} error={errors.lastName ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
        </Field>
        <Field label={labels.identity.email} wide error={errors.email ? labels.errors.required : undefined}>
          <Input type="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
        </Field>
        <Field label={labels.identity.phone} error={errors.phone ? labels.errors.required : undefined}>
          <Input type="tel" aria-invalid={Boolean(errors.phone)} {...register('phone')} />
        </Field>
        <Field label={labels.identity.address} wide error={errors.address ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.address)} {...register('address')} />
        </Field>
        <Field label={labels.identity.fiscalCode} error={errors.fiscalCode ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.fiscalCode)} {...register('fiscalCode')} />
        </Field>
      </div>

      {formError ? (
        <p role="alert" data-testid="pilot-identity-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
          {formError}
        </p>
      ) : null}

      {/* Story 15.5 (ratifica R-15.5-f, closing the R-15.2-g debt): `so-actions`
          pins this row to the bottom of the scrolling body at <=640px, exactly
          as `aircraft-editor.tsx` already does — the three editors stay
          uniform. The row is the ANAGRAFICA's save, the panel's primary action;
          the section-level submits below it ("Crea e invia invito", "Aggiungi
          tariffa") stay where they are and are reached by scrolling to their own
          section, on the phone as on the desktop. Honest reservation, accepted
          by the PO: `position: sticky` cannot leave its containing block, so in
          EDIT mode this bar detaches once the reader scrolls past the identity
          form (measured pre-fix: this submit was already above the fold there —
          the real defect was the NEW mode below). Inert above 640px: the rule
          lives inside the phone media query. */}
      <div className="so-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn" onClick={onClose}>
          {labels.cancel}
        </button>
        <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="pilot-identity-submit">
          {labels.submitEdit}
        </button>
      </div>
    </form>
  );
}

// --- New person — form unico (story 13.2, AC 1) ------------------------------

const ALL_ROLES: readonly Role[] = ['ADMIN', 'INSTRUCTOR', 'PILOT', 'STUDENT'];

type NewPersonFormProps = {
  labels: PilotEditorLabels;
  toast: ToastHandle;
  toastLabels: ToastLabels;
  canManageUsers: boolean;
  onClose: () => void;
  onCreated: () => void;
};

/**
 * Chip strip + inline date fields for the CREATE form (story 13.2, AC 1) — no
 * API call per selection (unlike `LiveExpiryEditor`): the whole batch
 * travels in the ONE composite `POST /api/v1/people` at submit. Story 14.2
 * (AC 2): `missingDateIds` marks each row that is STILL missing its date
 * individually — a form with 2+ selected chips only red-borders the ones
 * actually empty, not every chip just because one of them is.
 */
function NewExpiryChipGroup({
  types,
  selections,
  onToggle,
  onDateChange,
  dateLabel,
  requiredDateLabel,
  missingDateIds,
  testPrefix,
}: {
  types: ExpiryCatalogEntry[];
  selections: Record<string, string>;
  onToggle: (typeId: string) => void;
  onDateChange: (typeId: string, date: string) => void;
  dateLabel: string;
  requiredDateLabel: string;
  missingDateIds: Set<string>;
  testPrefix: string;
}) {
  if (types.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {types.map((type) => (
          <button
            key={type.id}
            type="button"
            className={`expiry-chip${type.id in selections ? ' selected' : ''}`}
            onClick={() => onToggle(type.id)}
            data-testid={`${testPrefix}-chip-${type.id}`}
          >
            {type.name}
          </button>
        ))}
      </div>
      {types
        .filter((type) => type.id in selections)
        .map((type) => (
          <Field key={type.id} label={`${type.name} — ${dateLabel}`} error={missingDateIds.has(type.id) ? requiredDateLabel : undefined}>
            <DateInput
              inline
              value={selections[type.id]}
              onChange={(event) => onDateChange(type.id, event.target.value)}
              aria-invalid={missingDateIds.has(type.id)}
              data-testid={`${testPrefix}-date-${type.id}`}
            />
          </Field>
        ))}
    </div>
  );
}

/**
 * ONE form, ONE submit (AC 1): anagrafica + profile activation (with the
 * SAME per-type fields the edit-mode `ProfileSubShell` forms use) + Ratings/
 * Visita medica chips + accesso, all bundled into the SAME
 * `POST /api/v1/people` composite payload the 13.1 API already accepts.
 * Only the base identity fields go through `react-hook-form`+zod (matches
 * the edit form's own validation); the conditional composite blocks are
 * plain controlled state, validated imperatively at submit (client mirror of
 * the server's 422 rules — R-13.1-c's "expiresAt required per selection",
 * `pilotProfileRequestSchema`'s required license fields) — simpler than
 * fighting react-hook-form over deeply-nested, conditionally-rendered
 * optional objects for a one-shot form.
 */
function NewPersonForm({ labels, toast, toastLabels, canManageUsers, onClose, onCreated }: NewPersonFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createPersonBaseSchema>, unknown, z.infer<typeof createPersonBaseSchema>>({
    resolver: zodResolver(createPersonBaseSchema),
    defaultValues: { firstName: '', lastName: '', email: null, phone: null, address: null, fiscalCode: null },
  });

  // Story 14.2 (AC 2): a single "did the user try to submit" flag instead of
  // one imperative boolean per non-RHF field — every `*FieldError` below is
  // DERIVED from it plus the field's own current value, so a correction
  // clears its error the instant it becomes valid (no separate onChange
  // wiring needed to "un-set" anything), and `handleSubmit`'s own resolver
  // path (the RHF-tracked base fields) is untouched.
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [activatePilot, setActivatePilot] = useState(false);
  const [pilotLicenseNumber, setPilotLicenseNumber] = useState('');
  const [pilotLicenseType, setPilotLicenseType] = useState('');
  const pilotFieldError = submitAttempted && activatePilot && (!pilotLicenseNumber.trim() || !pilotLicenseType.trim());

  const [activateStudent, setActivateStudent] = useState(false);
  const [studentCourseStartDate, setStudentCourseStartDate] = useState('');
  const studentFieldError = submitAttempted && activateStudent && !studentCourseStartDate;

  const [activateInstructor, setActivateInstructor] = useState(false);

  const [ratingCatalog, setRatingCatalog] = useState<ExpiryCatalogEntry[] | null>(null);
  const [medicalCatalog, setMedicalCatalog] = useState<ExpiryCatalogEntry[] | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void fetchExpiryTypes('RATING').then((types) => {
      if (!cancelled) setRatingCatalog(types);
    });
    void fetchExpiryTypes('MEDICAL').then((types) => {
      if (!cancelled) setMedicalCatalog(types);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const profileFlags: ProfileFlags = { pilot: activatePilot, student: activateStudent, instructor: activateInstructor };

  /**
   * Review F1 (story 13.2): deselecting a profile can make a previously
   * selected chip scope-incompatible (`isExpiryScopeCompatible`) — it
   * disappears from view, but its entry lingered in `selections` and the
   * submit handler sent it anyway, so the server rejected the whole
   * composite with a 422 `SCOPE_MISMATCH` the user had no visible chip left
   * to fix. Called from the three profile checkboxes' `onChange` (the ONLY
   * places `profileFlags` changes) with the flags AS THEY WILL BE after this
   * toggle, so a selection is pruned the instant its chip would leave view.
   */
  function pruneSelectionsForFlags(nextFlags: ProfileFlags): void {
    const visibleIds = new Set(
      [...(ratingCatalog ?? []), ...(medicalCatalog ?? [])]
        .filter((type) => type.isActive && isExpiryScopeCompatible(type.scope, nextFlags))
        .map((type) => type.id),
    );
    setSelections((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([typeId]) => visibleIds.has(typeId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }

  function toggleSelection(typeId: string): void {
    setSelections((current) => {
      if (typeId in current) {
        const next = { ...current };
        delete next[typeId];
        return next;
      }
      return { ...current, [typeId]: '' };
    });
  }

  function setSelectionDate(typeId: string, date: string): void {
    setSelections((current) => ({ ...current, [typeId]: date }));
  }

  const [grantAccess, setGrantAccess] = useState(false);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessRoles, setAccessRoles] = useState<Role[]>([]);

  function isValidAccessEmail(value: string): boolean {
    return z.string().trim().toLowerCase().pipe(z.email()).safeParse(value).success;
  }

  const accessEmailError = submitAttempted && grantAccess && !isValidAccessEmail(accessEmail);
  const accessRolesError = submitAttempted && grantAccess && accessRoles.length === 0;
  const missingDateIds = submitAttempted
    ? new Set(Object.entries(selections).filter(([, expiresAt]) => !expiresAt).map(([typeId]) => typeId))
    : new Set<string>();

  function toggleAccessRole(role: Role, checked: boolean): void {
    setAccessRoles((current) => (checked ? [...current, role] : current.filter((r) => r !== role)));
  }

  /**
   * Review F2: `onSubmit` below is RHF's VALID callback — unreachable while
   * `firstName`/`lastName`/`email` fail their own zodResolver check, so a
   * submit with BOTH an empty base field AND an empty plain-state field
   * (e.g. pilot license) never got past `handleSubmit`'s RHF-error branch,
   * leaving `submitAttempted` `false` and every plain-state field mute.
   * `handleSubmit(onSubmit, onInvalid)` below runs this in that branch too —
   * flipping the SAME flag every `*FieldError` derives from is enough (no
   * separate per-field marking needed here, unlike `flight-editor.tsx`'s
   * imperative booleans). RHF's own `shouldFocusError` already focuses its
   * first invalid base field in this branch, so no explicit
   * `focusFirstInvalid` call is needed here.
   */
  function onInvalid(): void {
    setSubmitAttempted(true);
  }

  async function onSubmit(base: z.infer<typeof createPersonBaseSchema>): Promise<void> {
    setFormError(null);
    setSubmitAttempted(true);

    const nextPilotFieldError = activatePilot && (!pilotLicenseNumber.trim() || !pilotLicenseType.trim());
    const nextStudentFieldError = activateStudent && !studentCourseStartDate;
    const expiries = Object.entries(selections).map(([expiryTypeId, expiresAt]) => ({ expiryTypeId, expiresAt }));
    const missingDate = expiries.some((entry) => !entry.expiresAt);
    const emailValid = !grantAccess || isValidAccessEmail(accessEmail);
    const rolesValid = !grantAccess || accessRoles.length > 0;

    if (nextPilotFieldError || nextStudentFieldError || missingDate || !emailValid || !rolesValid) {
      setTimeout(() => focusFirstInvalid(formRef.current), 0);
      return;
    }

    const payload: CreatePersonInput = {
      firstName: base.firstName,
      lastName: base.lastName,
      email: base.email ?? null,
      phone: base.phone ?? null,
      address: base.address ?? null,
      fiscalCode: base.fiscalCode ?? null,
      ...(activatePilot || activateStudent || activateInstructor
        ? {
            profiles: {
              ...(activatePilot ? { pilot: { licenseNumber: pilotLicenseNumber.trim(), licenseType: pilotLicenseType.trim() } } : {}),
              ...(activateStudent ? { student: { courseStartDate: studentCourseStartDate } } : {}),
              ...(activateInstructor ? { instructor: {} } : {}),
            },
          }
        : {}),
      ...(expiries.length > 0 ? { expiries } : {}),
      ...(grantAccess ? { access: { email: accessEmail.trim().toLowerCase(), roles: accessRoles } } : {}),
    };

    const response = await fetch('/api/v1/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 422) {
        // Story 14.2, AC 3: same field-shaped-422 mapping as the edit form's
        // `IdentitySection` above, reusing `labels.errors.required` per field.
        const { fieldErrors } = await parseApiError(response);
        const known: Array<'firstName' | 'lastName' | 'email'> = ['firstName', 'lastName', 'email'];
        let mapped = false;
        for (const field of known) {
          if (fieldErrors.has(field)) {
            setError(field, { type: 'server', message: labels.errors.required });
            mapped = true;
          }
        }
        if (mapped) {
          setTimeout(() => focusFirstInvalid(formRef.current), 0);
          return;
        }
      }
      const code = await errorCodeOf(response);
      setFormError(code === 'CONFLICT' ? labels.errors.conflictEmail : labels.errors.generic);
      return;
    }

    toast.show(toastLabels.created, 'ok');
    onClose();
    onCreated();
  }

  const ratingChips = (ratingCatalog ?? []).filter((type) => type.isActive && isExpiryScopeCompatible(type.scope, profileFlags));
  const medicalChips = (medicalCatalog ?? []).filter((type) => type.isActive && isExpiryScopeCompatible(type.scope, profileFlags));

  return (
    <form ref={formRef} onSubmit={(event) => void handleSubmit(onSubmit, onInvalid)(event)} noValidate data-testid="pilot-identity-form">
      <div className="form-grid">
        <Field label={labels.identity.firstName} error={errors.firstName ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
        </Field>
        <Field label={labels.identity.lastName} error={errors.lastName ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
        </Field>
        <Field label={labels.identity.email} wide error={errors.email ? labels.errors.required : undefined}>
          <Input type="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
        </Field>
        <Field label={labels.identity.phone} error={errors.phone ? labels.errors.required : undefined}>
          <Input type="tel" aria-invalid={Boolean(errors.phone)} {...register('phone')} />
        </Field>
        <Field label={labels.identity.address} wide error={errors.address ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.address)} {...register('address')} />
        </Field>
        <Field label={labels.identity.fiscalCode} error={errors.fiscalCode ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.fiscalCode)} {...register('fiscalCode')} />
        </Field>
      </div>

      <Section title={labels.profiles.sectionTitle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={activatePilot}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setActivatePilot(checked);
                  pruneSelectionsForFlags({ ...profileFlags, pilot: checked });
                }}
                data-testid="new-person-activate-pilot"
              />
              {labels.profiles.pilot.title}
            </label>
            {activatePilot ? (
              <div className="form-grid" style={{ marginTop: 8 }}>
                <Field label={labels.profiles.pilot.licenseNumber} error={pilotFieldError ? labels.profiles.errors.requiredField : undefined}>
                  <Input
                    value={pilotLicenseNumber}
                    onChange={(event) => setPilotLicenseNumber(event.target.value)}
                    aria-invalid={pilotFieldError}
                    data-testid="new-person-pilot-license-number"
                  />
                </Field>
                <Field label={labels.profiles.pilot.licenseType} error={pilotFieldError ? labels.profiles.errors.requiredField : undefined}>
                  <Input
                    value={pilotLicenseType}
                    onChange={(event) => setPilotLicenseType(event.target.value)}
                    aria-invalid={pilotFieldError}
                    data-testid="new-person-pilot-license-type"
                  />
                </Field>
              </div>
            ) : null}
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={activateStudent}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setActivateStudent(checked);
                  pruneSelectionsForFlags({ ...profileFlags, student: checked });
                }}
                data-testid="new-person-activate-student"
              />
              {labels.profiles.student.title}
            </label>
            {activateStudent ? (
              <div className="form-grid" style={{ marginTop: 8 }}>
                <Field label={labels.profiles.student.courseStartDate} error={studentFieldError ? labels.profiles.errors.requiredField : undefined}>
                  <DateInput
                    value={studentCourseStartDate}
                    onChange={(event) => setStudentCourseStartDate(event.target.value)}
                    aria-invalid={studentFieldError}
                    data-testid="new-person-student-course-start"
                  />
                </Field>
              </div>
            ) : null}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={activateInstructor}
              onChange={(event) => {
                const checked = event.target.checked;
                setActivateInstructor(checked);
                pruneSelectionsForFlags({ ...profileFlags, instructor: checked });
              }}
              data-testid="new-person-activate-instructor"
            />
            {labels.profiles.instructor.title}
          </label>
        </div>
      </Section>

      <Section title={labels.ratings.sectionTitle}>
        <NewExpiryChipGroup
          types={ratingChips}
          selections={selections}
          onToggle={toggleSelection}
          onDateChange={setSelectionDate}
          dateLabel={labels.ratings.dateLabel}
          requiredDateLabel={labels.ratings.requiredDate}
          missingDateIds={missingDateIds}
          testPrefix="rating"
        />
        <div className="fld-label" style={{ fontWeight: 600, fontSize: 13, marginTop: 16, marginBottom: 8 }}>
          {labels.medical.subHeading}
        </div>
        <NewExpiryChipGroup
          types={medicalChips}
          selections={selections}
          onToggle={toggleSelection}
          onDateChange={setSelectionDate}
          dateLabel={labels.medical.dateLabel}
          requiredDateLabel={labels.medical.requiredDate}
          missingDateIds={missingDateIds}
          testPrefix="medical"
        />
      </Section>

      {canManageUsers ? (
        <Section title={labels.access.sectionTitle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13.5 }}>
            <input type="checkbox" checked={grantAccess} onChange={(event) => setGrantAccess(event.target.checked)} data-testid="new-person-grant-access" />
            {labels.access.grantLabel}
          </label>
          {grantAccess ? (
            <div style={{ marginTop: 10 }}>
              <div className="form-grid">
                <Field label={labels.access.email} wide error={accessEmailError ? labels.access.invalidEmail : undefined}>
                  <Input type="email" value={accessEmail} onChange={(event) => setAccessEmail(event.target.value)} aria-invalid={accessEmailError} data-testid="new-person-access-email" />
                </Field>
              </div>
              <div className="fld-label" style={{ marginTop: 10, marginBottom: 6 }}>
                {labels.access.roles}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {ALL_ROLES.map((role) => (
                  <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}>
                    <input
                      type="checkbox"
                      checked={accessRoles.includes(role)}
                      onChange={(event) => toggleAccessRole(role, event.target.checked)}
                      data-testid={`new-person-access-role-${role}`}
                    />
                    {labels.access.roleOptions[role]}
                  </label>
                ))}
              </div>
              {accessRolesError ? (
                <p role="alert" className="fld-error" style={{ marginTop: 8 }}>
                  {labels.access.rolesRequired}
                </p>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {formError ? (
        <p role="alert" data-testid="pilot-identity-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
          {formError}
        </p>
      ) : null}

      {/* The defect R-15.2-g was really about (story 15.5, §a.4): the CREATE
          flow is ONE form with ONE submit, and at 375x812 it measured `bottom
          926` in an 812px viewport — 114px under the fold and `elementFromPoint`
          returning null, i.e. not hit-testable without scrolling. `so-actions`
          pins it; above 640px the rule does not exist. */}
      <div className="so-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn" onClick={onClose}>
          {labels.cancel}
        </button>
        <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="pilot-identity-submit">
          {labels.submitCreate}
        </button>
      </div>
    </form>
  );
}

// --- Profili (pilota/allievo/istruttore) ------------------------------------

type PersonProfilesDetail = {
  pilotProfile: { licenseNumber: string; licenseType: string; deactivatedAt: string | null } | null;
  studentProfile: { courseStartDate: string; deactivatedAt: string | null } | null;
  instructorProfile: { deactivatedAt: string | null } | null;
};

async function fetchProfilesDetail(personId: string): Promise<PersonProfilesDetail | null> {
  const response = await fetch(`/api/v1/people/${personId}`);
  if (!response.ok) return null;
  return (await response.json()) as PersonProfilesDetail;
}

function profileStatusLabel(profile: { deactivatedAt: string | null } | null, labels: PilotEditorLabels['profiles']): string {
  if (!profile) return labels.status.notActivated;
  return profile.deactivatedAt ? labels.status.inactive : labels.status.active;
}

function profileStatusTone(profile: { deactivatedAt: string | null } | null): BadgeTone {
  if (!profile) return '';
  return profile.deactivatedAt ? 'warn' : 'ok';
}

function ProfilesSection({
  personId,
  locale,
  labels,
  onChanged,
}: {
  personId: string;
  locale: 'it' | 'en';
  labels: PilotEditorLabels['profiles'];
  /** Called after a successful activate/update/deactivate (never on the initial load) — derives the same three boolean flags `PilotRow['profiles']` carries, so the row/badges behind this slide-over stay in sync (AD-1: no separate re-fetch of the list needed). */
  onChanged: (profiles: { pilot: boolean; student: boolean; instructor: boolean }) => void;
}) {
  const [detail, setDetail] = useState<PersonProfilesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchProfilesDetail(personId).then((result) => {
      if (cancelled) return;
      if (!result) {
        setError(true);
        setLoading(false);
        return;
      }
      setError(false);
      setDetail(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  async function refresh(): Promise<void> {
    const result = await fetchProfilesDetail(personId);
    if (!result) return;
    setDetail(result);
    onChanged({
      pilot: result.pilotProfile !== null && result.pilotProfile.deactivatedAt === null,
      student: result.studentProfile !== null && result.studentProfile.deactivatedAt === null,
      instructor: result.instructorProfile !== null && result.instructorProfile.deactivatedAt === null,
    });
  }

  if (loading) return <p className="fld-label">…</p>;
  if (error || !detail) {
    return (
      <p className="fld-label" style={{ color: 'var(--bad)' }}>
        {labels.errors.generic}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PilotProfileForm personId={personId} profile={detail.pilotProfile} labels={labels} onSaved={refresh} />
      <StudentProfileForm personId={personId} locale={locale} profile={detail.studentProfile} labels={labels} onSaved={refresh} />
      <InstructorProfileForm personId={personId} profile={detail.instructorProfile} labels={labels} onSaved={refresh} />
    </div>
  );
}

/** Shared chrome (title/status badge/activate·edit·deactivate) for one profile sub-form — same behavior as the legacy `profiles-panel.tsx`'s `SectionShell`+per-type sections, restyled to the AirOps `Field`/`Badge` primitives. */
function ProfileSubShell({
  title,
  profile,
  labels,
  testId,
  children,
}: {
  title: string;
  profile: { deactivatedAt: string | null } | null;
  labels: PilotEditorLabels['profiles'];
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }} data-testid={testId}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</span>
        <Badge tone={profileStatusTone(profile)} dot>
          {profileStatusLabel(profile, labels)}
        </Badge>
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function PilotProfileForm({
  personId,
  profile,
  labels,
  onSaved,
}: {
  personId: string;
  profile: { licenseNumber: string; licenseType: string; deactivatedAt: string | null } | null;
  labels: PilotEditorLabels['profiles'];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PilotProfileRequestInput>({
    resolver: zodResolver(pilotProfileRequestSchema),
    values: { licenseNumber: profile?.licenseNumber ?? '', licenseType: profile?.licenseType ?? '' },
  });

  async function onSubmit(values: PilotProfileRequestInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${personId}/profiles/pilot`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setFormError(labels.errors.generic);
      await onSaved();
      return;
    }
    setEditing(false);
    await onSaved();
  }

  async function handleDeactivate(): Promise<void> {
    setPending(true);
    const response = await fetch(`/api/v1/people/${personId}/profiles/pilot/deactivate`, { method: 'POST' });
    setPending(false);
    setConfirmingDeactivate(false);
    if (!response.ok) {
      setFormError(labels.errors.generic);
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <ProfileSubShell title={labels.pilot.title} profile={profile} labels={labels} testId="pilot-editor-profile-pilot">
      {editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
          <div className="form-grid">
            <Field label={labels.pilot.licenseNumber} error={errors.licenseNumber ? labels.errors.requiredField : undefined}>
              <Input aria-invalid={Boolean(errors.licenseNumber)} {...register('licenseNumber')} />
            </Field>
            <Field label={labels.pilot.licenseType} error={errors.licenseType ? labels.errors.requiredField : undefined}>
              <Input aria-invalid={Boolean(errors.licenseType)} {...register('licenseType')} />
            </Field>
          </div>
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
              {formError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="submit" disabled={isSubmitting} className="btn primary">
              {labels.actions.save}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              {labels.actions.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className="fld-label" style={{ textTransform: 'none' }}>
            {profile ? `${labels.pilot.licenseNumber}: ${profile.licenseNumber} · ${labels.pilot.licenseType}: ${profile.licenseType}` : ''}
          </span>
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)' }}>
              {formError}
            </p>
          ) : null}
          {confirmingDeactivate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="fld-label">{labels.actions.confirmDeactivate}</span>
              <button type="button" disabled={pending} className="btn mini bad" onClick={() => void handleDeactivate()}>
                {labels.actions.confirmYes}
              </button>
              <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(false)}>
                {labels.actions.confirmCancel}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn mini" onClick={() => setEditing(true)}>
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </button>
              {isActive ? (
                <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(true)}>
                  {labels.actions.deactivate}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </ProfileSubShell>
  );
}

function StudentProfileForm({
  personId,
  locale,
  profile,
  labels,
  onSaved,
}: {
  personId: string;
  locale: 'it' | 'en';
  profile: { courseStartDate: string; deactivatedAt: string | null } | null;
  labels: PilotEditorLabels['profiles'];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentProfileRequestInput>({
    resolver: zodResolver(studentProfileRequestSchema),
    values: { courseStartDate: profile?.courseStartDate ?? '' },
  });

  async function onSubmit(values: StudentProfileRequestInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${personId}/profiles/student`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setFormError(labels.errors.generic);
      await onSaved();
      return;
    }
    setEditing(false);
    await onSaved();
  }

  async function handleDeactivate(): Promise<void> {
    setPending(true);
    const response = await fetch(`/api/v1/people/${personId}/profiles/student/deactivate`, { method: 'POST' });
    setPending(false);
    setConfirmingDeactivate(false);
    if (!response.ok) {
      setFormError(labels.errors.generic);
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <ProfileSubShell title={labels.student.title} profile={profile} labels={labels} testId="pilot-editor-profile-student">
      {editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
          <div className="form-grid">
            <Field label={labels.student.courseStartDate} error={errors.courseStartDate ? labels.errors.requiredField : undefined}>
              <DateInput aria-invalid={Boolean(errors.courseStartDate)} {...register('courseStartDate')} />
            </Field>
          </div>
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
              {formError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="submit" disabled={isSubmitting} className="btn primary">
              {labels.actions.save}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              {labels.actions.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className="fld-label" style={{ textTransform: 'none' }}>
            {profile ? `${labels.student.courseStartDate}: ${formatDateOnly(profile.courseStartDate, locale)}` : ''}
          </span>
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)' }}>
              {formError}
            </p>
          ) : null}
          {confirmingDeactivate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="fld-label">{labels.actions.confirmDeactivate}</span>
              <button type="button" disabled={pending} className="btn mini bad" onClick={() => void handleDeactivate()}>
                {labels.actions.confirmYes}
              </button>
              <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(false)}>
                {labels.actions.confirmCancel}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn mini" onClick={() => setEditing(true)}>
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </button>
              {isActive ? (
                <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(true)}>
                  {labels.actions.deactivate}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </ProfileSubShell>
  );
}

function InstructorProfileForm({
  personId,
  profile,
  labels,
  onSaved,
}: {
  personId: string;
  profile: { deactivatedAt: string | null } | null;
  labels: PilotEditorLabels['profiles'];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<InstructorProfileRequestInput>({
    resolver: zodResolver(instructorProfileRequestSchema),
    values: {},
  });

  async function onSubmit(values: InstructorProfileRequestInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${personId}/profiles/instructor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setFormError(labels.errors.generic);
      await onSaved();
      return;
    }
    setEditing(false);
    await onSaved();
  }

  async function handleDeactivate(): Promise<void> {
    setPending(true);
    const response = await fetch(`/api/v1/people/${personId}/profiles/instructor/deactivate`, { method: 'POST' });
    setPending(false);
    setConfirmingDeactivate(false);
    if (!response.ok) {
      setFormError(labels.errors.generic);
    }
    await onSaved();
  }

  const isActive = profile !== null && profile.deactivatedAt === null;

  return (
    <ProfileSubShell title={labels.instructor.title} profile={profile} labels={labels} testId="pilot-editor-profile-instructor">
      {editing ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
              {formError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="submit" disabled={isSubmitting} className="btn primary">
              {labels.actions.save}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              {labels.actions.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className="fld-label" style={{ textTransform: 'none' }} />
          {formError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)' }}>
              {formError}
            </p>
          ) : null}
          {confirmingDeactivate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="fld-label">{labels.actions.confirmDeactivate}</span>
              <button type="button" disabled={pending} className="btn mini bad" onClick={() => void handleDeactivate()}>
                {labels.actions.confirmYes}
              </button>
              <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(false)}>
                {labels.actions.confirmCancel}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn mini" onClick={() => setEditing(true)}>
                {!profile ? labels.actions.activate : profile.deactivatedAt ? labels.actions.reactivate : labels.actions.edit}
              </button>
              {isActive ? (
                <button type="button" className="btn mini" onClick={() => setConfirmingDeactivate(true)}>
                  {labels.actions.deactivate}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </ProfileSubShell>
  );
}

// --- Ratings + Visita medica (EDITABLE inline, story 13.2 AC 2) -------------

/** `manageLink`/link-to-Scadenze is GONE (AC 2): both editors below write directly via `LiveExpiryEditor`. */
function RatingsSection({
  personId,
  profiles,
  ratingsLabels,
  medicalLabels,
  locale,
}: {
  personId: string;
  profiles: ProfileFlags;
  ratingsLabels: PilotEditorLabels['ratings'];
  medicalLabels: PilotEditorLabels['medical'];
  locale: 'it' | 'en';
}) {
  return (
    <div>
      <div data-testid="pilot-ratings-editor">
        <LiveExpiryEditor personId={personId} kind="RATING" profiles={profiles} locale={locale} labels={ratingsLabels} />
      </div>
      <div className="fld-label" style={{ fontWeight: 600, fontSize: 13, marginTop: 20, marginBottom: 10 }}>
        {medicalLabels.subHeading}
      </div>
      <div data-testid="pilot-medical-editor">
        <LiveExpiryEditor personId={personId} kind="MEDICAL" profiles={profiles} locale={locale} labels={medicalLabels} />
      </div>
    </div>
  );
}

// --- Accesso (ADMIN-only) ----------------------------------------------------

const createAccessUserSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  roles: z.array(z.enum(['ADMIN', 'INSTRUCTOR', 'PILOT', 'STUDENT'])).min(1),
});

type CreateAccessUserValues = z.infer<typeof createAccessUserSchema>;

function AccessSection({
  personId,
  email,
  user,
  labels,
  toast,
  toastLabels,
  onMutated,
}: {
  personId: string;
  email: string | null;
  user: PilotUser;
  labels: PilotEditorLabels['access'];
  toast: ToastHandle;
  toastLabels: ToastLabels;
  onMutated: (user: PilotUser) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createAccessUserSchema>, unknown, CreateAccessUserValues>({
    resolver: zodResolver(createAccessUserSchema),
    defaultValues: { email: email ?? '', roles: [] },
  });

  function toggleRole(role: Role, checked: boolean): void {
    const next = checked ? [...roles, role] : roles.filter((r) => r !== role);
    setRoles(next);
    setValue('roles', next, { shouldValidate: true });
  }

  async function onCreateUser(values: CreateAccessUserValues): Promise<void> {
    setFormError(null);
    const response = await fetch('/api/v1/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: values.email, roles: values.roles, locale: 'it', personId }),
    });

    if (!response.ok) {
      const code = await errorCodeOf(response);
      setFormError(code === 'CONFLICT' ? labels.emailConflict : labels.genericError);
      return;
    }

    const created = (await response.json()) as { id: string; email: string; roles: Role[]; isActive: boolean; passwordSet: boolean };
    toast.show(toastLabels.userCreated, 'ok');
    onMutated({ id: created.id, email: created.email, roles: created.roles, isActive: created.isActive, passwordSet: created.passwordSet });
  }

  async function handleResendInvite(): Promise<void> {
    if (!user) return;
    setPending(true);
    const response = await fetch(`/api/v1/users/${user.id}/resend-invite`, { method: 'POST' });
    setPending(false);
    if (!response.ok) {
      toast.show(toastLabels.genericError, 'bad');
      return;
    }
    toast.show(toastLabels.inviteResent, 'ok');
  }

  if (user) {
    return (
      <div data-testid="pilot-access-existing">
        <p className="fld-label" style={{ textTransform: 'none' }}>
          {labels.userSummary
            .replace('{email}', user.email)
            .replace('{roles}', user.roles.map((role) => labels.roleOptions[role]).join(', '))}
        </p>
        <div style={{ marginTop: 6 }}>
          <Badge tone={user.passwordSet ? 'ok' : 'warn'} dot>
            {user.passwordSet ? labels.statusActive : labels.statusPending}
          </Badge>
        </div>
        {!user.passwordSet ? (
          <button type="button" className="btn mini" disabled={pending} onClick={() => void handleResendInvite()} style={{ marginTop: 10 }}>
            {labels.resendInvite}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="pilot-access-none">
      <p className="fld-label" style={{ textTransform: 'none', marginBottom: 10 }}>
        {labels.noUser}
      </p>
      <form onSubmit={(event) => void handleSubmit(onCreateUser)(event)} noValidate>
        <div className="form-grid">
          <Field label={labels.email} wide error={errors.email ? labels.invalidEmail : undefined}>
            <Input type="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
          </Field>
        </div>
        <div className="fld-label" style={{ marginTop: 10, marginBottom: 6 }}>
          {labels.roles}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {ALL_ROLES.map((role) => (
            <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}>
              <input type="checkbox" checked={roles.includes(role)} onChange={(event) => toggleRole(role, event.target.checked)} />
              {labels.roleOptions[role]}
            </label>
          ))}
        </div>
        {errors.roles ? (
          <p role="alert" className="fld-error" style={{ marginTop: 8 }}>
            {labels.rolesRequired}
          </p>
        ) : null}
        {formError ? (
          <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
            {formError}
          </p>
        ) : null}
        <div style={{ marginTop: 10 }}>
          <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="pilot-access-create">
            {labels.createSubmit}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Archivio -----------------------------------------------------------------

function ArchiveSection({
  pilot,
  labels,
  toast,
  toastLabels,
  onMutated,
}: {
  pilot: PilotRow;
  labels: PilotEditorLabels['archive'];
  toast: ToastHandle;
  toastLabels: ToastLabels;
  onMutated: (patch: Partial<PilotRow>) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const archived = pilot.archivedAt !== null;

  async function submit(): Promise<void> {
    setBusy(true);
    const response = await fetch(`/api/v1/people/${pilot.id}/${archived ? 'unarchive' : 'archive'}`, { method: 'POST' });
    setBusy(false);
    setConfirming(false);

    if (!response.ok) {
      toast.show(toastLabels.genericError, 'bad');
      return;
    }

    const updated = (await response.json()) as { archivedAt: string | null };
    toast.show(archived ? toastLabels.unarchived : toastLabels.archived, 'ok');
    onMutated({ archivedAt: updated.archivedAt });
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="fld-label">{archived ? labels.confirmUnarchive : labels.confirmArchive}</span>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void submit()} data-testid="pilot-archive-confirm">
          {labels.confirmYes}
        </button>
        <button type="button" className="btn" onClick={() => setConfirming(false)}>
          {labels.confirmCancel}
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="btn" onClick={() => setConfirming(true)} data-testid="pilot-archive-toggle">
      {archived ? labels.unarchive : labels.archive}
    </button>
  );
}
