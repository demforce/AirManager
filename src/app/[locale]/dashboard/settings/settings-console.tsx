'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import {
  buildSettingsPatch,
  dirtySections,
  FIELD_PATHS,
  hasSettingsErrors,
  mapSaveError,
  NO_SETTINGS_ERRORS,
  testEmailBlocked,
  toDraft,
  validateDraft,
  type CashCategoryDraftItem,
  type ExpiryTypeDraftItem,
  type SettingsDraft,
  type SettingsErrorMessage,
  type SettingsErrors,
  type SettingsSection,
  type SettingsSnapshotData,
} from '@/lib/settings-draft';
import { CashCategoriesCard, type CashCategoriesCardLabels } from './cash-categories-card';
import { ClubCard, type ClubCardLabels } from './club-card';
import { CurrencyCard, type CurrencyCardLabels } from './currency-card';
import { MembershipCard, type MembershipCardLabels } from './membership-card';
import { RatingsCard, type RatingsCardLabels } from './ratings-card';
import { SchedulingCard, type SchedulingCardLabels } from './scheduling-card';
import { SmtpCard, type SmtpCardLabels } from './smtp-card';
import { TreasuryCard, type TreasuryCardLabels } from './treasury-card';

/** The two messages that depend on WHICH list refused the row («Esiste già un tipo…» / «…una categoria…»). */
type ListErrorLabels = { nameTaken: string; inUse: string };

export type SettingsConsoleLabels = {
  save: string;
  saved: string;
  saveBar: { clean: string; dirty: string; saving: string };
  /** Short names of the nine sections, for the save bar's "Modifiche non salvate: …". */
  sections: Record<SettingsSection, string>;
  /** `integerRange` carries `{min}`/`{max}`, interpolated here (pass it with `t.raw`). */
  errors: Record<Exclude<SettingsErrorMessage['key'], 'nameTaken' | 'inUse'>, string> & Record<NonNullable<SettingsErrors['bar']>, string>;
  club: ClubCardLabels;
  membership: MembershipCardLabels;
  currency: CurrencyCardLabels;
  scheduling: SchedulingCardLabels;
  smtp: SmtpCardLabels;
  treasury: TreasuryCardLabels;
  ratings: RatingsCardLabels & { errors: ListErrorLabels };
  medical: RatingsCardLabels & { errors: ListErrorLabels };
  cashCategories: CashCategoriesCardLabels & { errors: ListErrorLabels };
};

type ScalarSection = keyof typeof FIELD_PATHS;
type ListSection = 'ratings' | 'medical' | 'cashCategories';

const MEDICAL_TEST_IDS = {
  card: 'medical-settings-card',
  addButton: 'medical-add-button',
  row: 'medical-row',
  editButton: 'medical-edit-button',
  toggleButton: 'medical-toggle-button',
  deleteButton: 'medical-delete-button',
  rowError: 'medical-row-error',
  form: 'medical-form',
  formClose: 'medical-form-close',
  nameInput: 'medical-name-input',
  validityInput: 'medical-validity-input',
  mobileList: 'mobile-medical-list',
  mobileEmpty: 'mobile-medical-empty',
  mobileRow: 'medical-row-mobile',
  mobileRowError: 'medical-row-error-mobile',
  mobileSheet: 'mobile-medical-sheet',
  mobileEditButton: 'medical-edit-button-mobile',
  mobileToggleButton: 'medical-toggle-button-mobile',
  mobileDeleteButton: 'medical-delete-button-mobile',
};

/**
 * Focuses the first refused control that is actually ON SCREEN: an invalid
 * input, or a row's message (`data-focus-error`) — the desktop rows and the
 * phone cards both carry one, only the visible face has a box. Called from an
 * effect, i.e. after the render that marked them has committed.
 */
function focusFirstError(root: HTMLElement | null): void {
  const candidates = root?.querySelectorAll<HTMLElement>('[aria-invalid="true"], [data-focus-error]') ?? [];
  for (const candidate of Array.from(candidates)) {
    if (candidate.getClientRects().length > 0) {
      // Centred, not the browser's minimal scroll: the page has a sticky bar
      // at BOTH edges (the shell's top bar and the save bar), and the minimal
      // scroll parks the field right under one of them.
      candidate.focus({ preventScroll: true });
      candidate.scrollIntoView({ block: 'center' });
      return;
    }
  }
}

function omit<T>(record: Record<string, T>, keys: string[]): Record<string, T> {
  const out = { ...record };
  for (const key of keys) delete out[key];
  return out;
}

/**
 * The Impostazioni page as ONE form with ONE "Salva" (story 19.8, R-19-m,
 * A17). It holds the saved values (`baseline`) and the values on screen
 * (`draft`), both from {@link toDraft}; the nine sections are controlled and
 * save nothing themselves. The Salva — at the end of the form, in a bar that
 * stays on the bottom edge (D-4) — checks what the client can check, then
 * sends ONE `PATCH /api/v1/settings` with only what changed (D-3); the answer
 * is the saved page, which becomes the new baseline and draft. A refusal
 * marks the field or the row it names and keeps the draft as it is.
 *
 * No "unsaved changes" guard on leaving and no "discard" button (D-6): the
 * bar always says what is unsaved, and a reload discards.
 */
export function SettingsConsole({ snapshot, labels }: { snapshot: SettingsSnapshotData; labels: SettingsConsoleLabels }) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const rowCounter = useRef(0);
  // Initialised ONCE: `router.refresh()` re-renders the server page with a
  // fresh snapshot, but the draft is already realigned from the PATCH
  // answer (trap 11) — never re-seeded from the props.
  const [baseline, setBaseline] = useState(() => toDraft(snapshot));
  const [draft, setDraft] = useState(baseline);
  const [errors, setErrors] = useState<SettingsErrors>(NO_SETTINGS_ERRORS);
  const [saving, setSaving] = useState(false);
  /** Bumped by every successful Salva: the list cards remount, closing their panels and sheets. */
  const [saveCount, setSaveCount] = useState(0);
  /** Bumped by every refused Salva: the focus goes to the first error once it is on screen. */
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    if (focusRequest > 0) focusFirstError(formRef.current);
  }, [focusRequest]);

  const patch = useMemo(() => buildSettingsPatch(baseline, draft), [baseline, draft]);
  const dirty = useMemo(() => dirtySections(baseline, draft), [baseline, draft]);

  const newRowKey = (): string => `new:${(rowCounter.current += 1)}`;

  function messageText(message: SettingsErrorMessage, list?: ListErrorLabels): string {
    if (message.key === 'integerRange') return labels.errors.integerRange.replace('{min}', String(message.min)).replace('{max}', String(message.max));
    if (message.key === 'nameTaken' || message.key === 'inUse') return list ? list[message.key] : labels.errors.invalidItem;
    return labels.errors[message.key];
  }

  function fieldErrors<S extends ScalarSection>(section: S): Partial<Record<keyof SettingsDraft[S], string>> {
    const out: Partial<Record<string, string>> = {};
    for (const [field, path] of Object.entries(FIELD_PATHS[section])) {
      const message = errors.fields[path];
      if (message) out[field] = messageText(message);
    }
    return out as Partial<Record<keyof SettingsDraft[S], string>>;
  }

  function itemErrors(list: ListErrorLabels): Record<string, { field: 'name' | 'validity' | null; message: string }> {
    const out: Record<string, { field: 'name' | 'validity' | null; message: string }> = {};
    for (const [rowKey, error] of Object.entries(errors.items)) out[rowKey] = { field: error.field, message: messageText(error.message, list) };
    return out;
  }

  function changeSection<S extends ScalarSection>(section: S, change: Partial<SettingsDraft[S]>): void {
    setDraft((current) => ({ ...current, [section]: { ...current[section], ...change } }));
    const paths = Object.keys(change).flatMap((field) => {
      const path = (FIELD_PATHS[section] as Record<string, string>)[field];
      return path ? [path] : [];
    });
    if (paths.some((path) => path in errors.fields)) setErrors((current) => ({ ...current, fields: omit(current.fields, paths) }));
  }

  function changeList<L extends ListSection>(section: L, items: SettingsDraft[L], touchedRowKey: string): void {
    setDraft((current) => ({ ...current, [section]: items }));
    if (touchedRowKey in errors.items) setErrors((current) => ({ ...current, items: omit(current.items, [touchedRowKey]) }));
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!patch || saving) return;

    const clientErrors = validateDraft(baseline, draft, patch);
    if (hasSettingsErrors(clientErrors)) {
      setErrors(clientErrors);
      setFocusRequest((count) => count + 1);
      return;
    }

    // The request's OWN index maps the answer back to the rows (trap 8),
    // whatever the draft looks like by the time it arrives.
    const request = patch;
    setSaving(true);
    setErrors(NO_SETTINGS_ERRORS);
    const response = await fetch('/api/v1/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.body),
    }).catch(() => null);
    const body: unknown = response ? await response.json().catch(() => null) : null;
    setSaving(false);

    if (response?.ok) {
      const next = toDraft(body as SettingsSnapshotData);
      setBaseline(next);
      setDraft(next);
      setSaveCount((count) => count + 1);
      toast.show(labels.saved, 'ok');
      // The shell reads the club name/ICAO server-side.
      router.refresh();
      return;
    }

    setErrors(mapSaveError(response?.status ?? 0, body, request.index));
    setFocusRequest((count) => count + 1);
  }

  const placedErrors = Object.keys(errors.fields).length > 0 || Object.keys(errors.items).length > 0;
  // "Controlla i campi evidenziati" only while something IS highlighted.
  const barError = errors.bar === 'checkFields' && !placedErrors ? null : errors.bar;
  const summary = saving
    ? labels.saveBar.saving
    : dirty.length === 0
      ? labels.saveBar.clean
      : labels.saveBar.dirty.replace('{sections}', dirty.map((section) => labels.sections[section]).join(', '));

  return (
    <form ref={formRef} id="settings-form" className="settings-form" data-testid="settings-form" noValidate aria-busy={saving} onSubmit={(event) => void save(event)}>
      {/* Read-only while the Salva is in flight (trap 8, review 19.8 F1): the
          answer becomes the new draft, so an edit made meanwhile would vanish
          with the bar back on "Nessuna modifica". The bar stays outside. */}
      <fieldset className="settings-sections" disabled={saving}>
        <ClubCard value={draft.club} onChange={(change) => changeSection('club', change)} errors={fieldErrors('club')} labels={labels.club} />
        <MembershipCard value={draft.membership} onChange={(change) => changeSection('membership', change)} errors={fieldErrors('membership')} labels={labels.membership} />
        <CurrencyCard value={draft.currency} onChange={(change) => changeSection('currency', change)} errors={fieldErrors('currency')} labels={labels.currency} />
        <SchedulingCard value={draft.scheduling} onChange={(change) => changeSection('scheduling', change)} errors={fieldErrors('scheduling')} labels={labels.scheduling} />
        <SmtpCard
          value={draft.smtp}
          onChange={(change) => changeSection('smtp', change)}
          errors={fieldErrors('smtp')}
          testEmailBlocked={testEmailBlocked(baseline, draft)}
          labels={labels.smtp}
        />
        <TreasuryCard value={draft.treasury} onChange={(change) => changeSection('treasury', change)} errors={fieldErrors('treasury')} labels={labels.treasury} />
        <RatingsCard
          key={`ratings-${saveCount}`}
          kind="RATING"
          items={draft.ratings}
          savedItems={baseline.ratings}
          onChange={(items: ExpiryTypeDraftItem[], rowKey) => changeList('ratings', items, rowKey)}
          newRowKey={newRowKey}
          itemErrors={itemErrors(labels.ratings.errors)}
          labels={labels.ratings}
        />
        <RatingsCard
          key={`medical-${saveCount}`}
          kind="MEDICAL"
          items={draft.medical}
          savedItems={baseline.medical}
          onChange={(items: ExpiryTypeDraftItem[], rowKey) => changeList('medical', items, rowKey)}
          newRowKey={newRowKey}
          itemErrors={itemErrors(labels.medical.errors)}
          labels={labels.medical}
          testIds={MEDICAL_TEST_IDS}
        />
        <CashCategoriesCard
          key={`cash-${saveCount}`}
          items={draft.cashCategories}
          savedItems={baseline.cashCategories}
          onChange={(items: CashCategoryDraftItem[], rowKey) => changeList('cashCategories', items, rowKey)}
          newRowKey={newRowKey}
          itemErrors={itemErrors(labels.cashCategories.errors)}
          labels={labels.cashCategories}
        />
      </fieldset>

      <div className="settings-save-bar" data-testid="settings-save-bar">
        <div className="settings-save-status">
          <span className="settings-save-summary" data-testid="settings-dirty-summary" aria-live="polite">
            {summary}
          </span>
          {barError ? (
            <span role="alert" className="fld-error" data-testid="settings-save-error">
              {labels.errors[barError]}
            </span>
          ) : null}
        </div>
        <button type="submit" className="btn primary" disabled={!patch || saving} data-testid="settings-save">
          {labels.save}
        </button>
      </div>
    </form>
  );
}
