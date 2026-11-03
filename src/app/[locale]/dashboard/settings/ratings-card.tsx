'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { Field, Input, InputGroup, Select } from '@/components/ui/field';
import { Icon } from '@/components/ui/icons';
import { expiryTypeSheetSub, expiryTypeSubLine } from '@/lib/mobile-settings';
import { expiryTypeRowState, type ExpiryScope, type ExpiryTypeDraftItem, type RowState } from '@/lib/settings-draft';

/**
 * Test-id namespace for one instance of this card (story 13.1, AC 3) —
 * defaults below are the "Ratings" ids; the "Visite mediche" card passes its
 * own set from `settings/page.tsx`.
 */
export type ExpiryTypeCardTestIds = {
  card: string;
  addButton: string;
  row: string;
  editButton: string;
  toggleButton: string;
  deleteButton: string;
  rowError: string;
  form: string;
  formClose: string;
  nameInput: string;
  /** Ratings only — a medical visit has no scope select (R-19-j). */
  scopeSelect?: string;
  validityInput: string;
  /** Phone face (story 15.8b). Convention of the epic (15.1): a surface that DUPLICATES a desktop one takes the desktop name plus `-mobile`; one that exists only on a phone takes a new name prefixed `mobile-`. */
  mobileList: string;
  mobileEmpty: string;
  mobileRow: string;
  mobileRowError: string;
  mobileSheet: string;
  mobileEditButton: string;
  mobileToggleButton: string;
  mobileDeleteButton: string;
};

const DEFAULT_TEST_IDS: ExpiryTypeCardTestIds = {
  card: 'ratings-settings-card',
  addButton: 'ratings-add-button',
  row: 'rating-row',
  editButton: 'rating-edit-button',
  toggleButton: 'rating-toggle-button',
  deleteButton: 'rating-delete-button',
  rowError: 'rating-row-error',
  form: 'rating-form',
  formClose: 'rating-form-close',
  nameInput: 'rating-name-input',
  scopeSelect: 'rating-scope-select',
  validityInput: 'rating-validity-input',
  mobileList: 'mobile-rating-list',
  mobileEmpty: 'mobile-rating-empty',
  mobileRow: 'rating-row-mobile',
  mobileRowError: 'rating-row-error-mobile',
  mobileSheet: 'mobile-rating-sheet',
  mobileEditButton: 'rating-edit-button-mobile',
  mobileToggleButton: 'rating-toggle-button-mobile',
  mobileDeleteButton: 'rating-delete-button-mobile',
};

export type RatingsCardLabels = {
  title: string;
  sub: string;
  addAction: string;
  table: { name: string; validity: string; status: string; actions: string; empty: string; monthsSuffix: string; noExpiry: string };
  status: { active: string; inactive: string };
  actions: { edit: string; deactivate: string; reactivate: string; delete: string; restore: string };
  rowState: Record<Exclude<RowState, 'saved'>, string>;
  form: { createTitle: string; editTitle: string; name: string; validity: string; validityHint: string; close: string };
  hint: string;
  /** Phone face (story 15.8b, R-15.8b-d) — the wording the card list and its sheet need on top of the desktop's own. */
  mobile: { openDetail: string; empty: string };
  /**
   * Ratings ONLY: the scope and the "Blocca prenotazioni e voli" flag. A
   * medical visit has neither (story 19.7a D-3, R-19-j: always `ALL`, always
   * counted) — the "Visite mediche" card simply gets no such labels.
   */
  rating?: {
    scopeColumn: string;
    scopeField: string;
    scope: Record<ExpiryScope, string>;
    blocksBadge: string;
    blocksField: string;
    blocksHint: string;
    yes: string;
    no: string;
  };
};

type RatingsCardProps = {
  /** The rows ON SCREEN (the page's draft), newest-added first. */
  items: ExpiryTypeDraftItem[];
  /** The rows as SAVED — the reference each row's state (`new`/`changed`/`removed`) is read against. */
  savedItems: ExpiryTypeDraftItem[];
  /** `ExpiryType.kind` this instance manages (story 13.1, AC 3) — set on every row it adds. */
  kind: 'RATING' | 'MEDICAL';
  /** `touchedRowKey`: the row the change is about, so the page can drop that row's error. */
  onChange: (items: ExpiryTypeDraftItem[], touchedRowKey: string) => void;
  newRowKey: () => string;
  /** The refused rows of the last Salva (or of its client check), by `rowKey`, already translated. */
  itemErrors: Record<string, { field: 'name' | 'validity' | null; message: string }>;
  labels: RatingsCardLabels;
  testIds?: ExpiryTypeCardTestIds;
};

const SCOPE_VALUES: ExpiryScope[] = ['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL'];
const RATING_COLS = '1fr 130px 150px 120px 220px';
const MEDICAL_COLS = '1fr 150px 120px 220px';

const STATE_TONE: Record<Exclude<RowState, 'saved'>, BadgeTone> = { new: 'info', changed: 'warn', removed: 'bad' };

/**
 * Expiry-type catalogue card (story 12.11, AC 2; story 13.1, AC 3 — ONE
 * component for the "Ratings" and "Visite mediche" cards, R-13.1-a).
 *
 * Story 19.8 (R-19-m, D-7): a list IN DRAFT. Nothing here writes — the
 * page's single "Salva" does. "Aggiungi" puts a new row on top and opens the
 * inline panel on it; the panel's fields write into the row as you type and
 * its only button is "Chiudi"; "Disattiva/Riattiva" and "Elimina/Ripristina"
 * are switches of the draft, reversible until the Salva, so neither face
 * asks for confirmation any more (the two-step delete of 15.8b is gone).
 * Every row shows its state ("Nuova", "Modificata", "Da eliminare").
 */
export function RatingsCard({ items, savedItems, kind, onChange, newRowKey, itemErrors, labels, testIds = DEFAULT_TEST_IDS }: RatingsCardProps) {
  const [panelKey, setPanelKey] = useState<string | null>(null);
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  /** Set only by the sheet's "Modifica": the panel lives ABOVE the list, off-screen on a phone. The desktop never sets it, so its scroll position is untouched by construction (the 15.8a `preventScroll` lesson). */
  const revealPanelRef = useRef(false);
  /** Set only by "Aggiungi": a new row is typed into right away. */
  const focusNameRef = useRef(false);

  const rating = kind === 'RATING' ? labels.rating : undefined;
  const savedById = new Map(savedItems.map((item) => [item.rowKey, item]));
  const stateOf = (item: ExpiryTypeDraftItem): RowState => expiryTypeRowState(item, item.id !== undefined ? savedById.get(item.id) : undefined);

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => setSheetKey(null), []);

  const panelItem = items.find((item) => item.rowKey === panelKey && !item.removed) ?? null;
  const sheetItem = items.find((item) => item.rowKey === sheetKey) ?? null;

  useEffect(() => {
    if (panelItem === null) return;
    if (revealPanelRef.current) {
      revealPanelRef.current = false;
      panelRef.current?.scrollIntoView({ block: 'center' });
    }
    if (focusNameRef.current) {
      focusNameRef.current = false;
      nameInputRef.current?.focus();
    }
  }, [panelItem]);

  function update(rowKey: string, patch: Partial<ExpiryTypeDraftItem>): void {
    onChange(
      items.map((item) => (item.rowKey === rowKey ? { ...item, ...patch } : item)),
      rowKey,
    );
  }

  function add(): void {
    const rowKey = newRowKey();
    // The defaults of the form this panel replaced; a visit's scope/flag are
    // never sent (the server fixes them), kept at their invariant values.
    const item: ExpiryTypeDraftItem = { rowKey, kind, name: '', scope: 'ALL', validityMonths: '0', blocksBooking: kind === 'MEDICAL', isActive: true, removed: false };
    onChange([item, ...items], rowKey);
    focusNameRef.current = true;
    setPanelKey(rowKey);
  }

  /** A new row simply goes away; a saved one is marked for deletion (and restored by the same switch). */
  function toggleRemove(item: ExpiryTypeDraftItem): void {
    if (stateOf(item) === 'new') {
      if (sheetKey === item.rowKey) closeSheet();
      onChange(
        items.filter((other) => other.rowKey !== item.rowKey),
        item.rowKey,
      );
      return;
    }
    update(item.rowKey, { removed: !item.removed });
  }

  function validityLabel(item: ExpiryTypeDraftItem): string {
    const months = Number(item.validityMonths);
    return Number.isInteger(months) && months > 0 ? `${months} ${labels.table.monthsSuffix}` : labels.table.noExpiry;
  }

  const statusLabel = (item: ExpiryTypeDraftItem): string => (item.isActive ? labels.status.active : labels.status.inactive);
  const displayName = (item: ExpiryTypeDraftItem): string => item.name.trim() || '—';

  function stateBadge(state: RowState) {
    return state === 'saved' ? null : <Badge tone={STATE_TONE[state]}>{labels.rowState[state]}</Badge>;
  }

  function sheetRows(item: ExpiryTypeDraftItem): BottomSheetRow[] {
    return [
      ...(rating ? [{ k: rating.scopeColumn, v: rating.scope[item.scope] }] : []),
      { k: labels.table.validity, v: validityLabel(item) },
      { k: labels.table.status, v: statusLabel(item) },
      ...(rating ? [{ k: rating.blocksField, v: item.blocksBooking ? rating.yes : rating.no }] : []),
    ];
  }

  const cols = rating ? RATING_COLS : MEDICAL_COLS;

  return (
    <div className="card settings-card" data-testid={testIds.card}>
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
        <div className="spacer" />
        <button type="button" className="btn primary" onClick={add} data-testid={testIds.addButton}>
          <Icon.plus /> {labels.addAction}
        </button>
      </div>

      {panelItem ? (
        // A group, not a `<form>`: it sits inside the page's one form (nested
        // forms are invalid HTML), and nothing in it submits.
        <div
          ref={panelRef}
          role="group"
          aria-label={stateOf(panelItem) === 'new' ? labels.form.createTitle : labels.form.editTitle}
          className="catalog-panel"
          data-testid={testIds.form}
        >
          <div className="fld-label" style={{ marginBottom: 10 }}>
            {stateOf(panelItem) === 'new' ? labels.form.createTitle : labels.form.editTitle}
          </div>
          <div className="form-grid">
            <Field label={labels.form.name} wide error={itemErrors[panelItem.rowKey]?.field === 'name' ? itemErrors[panelItem.rowKey]!.message : undefined}>
              <input
                ref={nameInputRef}
                className="input"
                maxLength={100}
                value={panelItem.name}
                onChange={(event) => update(panelItem.rowKey, { name: event.target.value })}
                aria-invalid={itemErrors[panelItem.rowKey]?.field === 'name'}
                data-testid={testIds.nameInput}
              />
            </Field>
            {rating ? (
              <Field label={rating.scopeField}>
                <Select value={panelItem.scope} onChange={(event) => update(panelItem.rowKey, { scope: event.target.value as ExpiryScope })} data-testid={testIds.scopeSelect}>
                  {SCOPE_VALUES.map((scope) => (
                    <option key={scope} value={scope}>
                      {rating.scope[scope]}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label={labels.form.validity} error={itemErrors[panelItem.rowKey]?.field === 'validity' ? itemErrors[panelItem.rowKey]!.message : undefined}>
              <InputGroup suffix={labels.table.monthsSuffix}>
                <Input
                  type="number"
                  min={0}
                  value={panelItem.validityMonths}
                  onChange={(event) => update(panelItem.rowKey, { validityMonths: event.target.value })}
                  aria-invalid={itemErrors[panelItem.rowKey]?.field === 'validity'}
                  data-testid={testIds.validityInput}
                />
              </InputGroup>
            </Field>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            {labels.form.validityHint}
          </p>

          {rating ? (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
              <input type="checkbox" style={{ marginTop: 3 }} checked={panelItem.blocksBooking} onChange={(event) => update(panelItem.rowKey, { blocksBooking: event.target.checked })} />
              <span style={{ fontSize: 12.5 }}>
                <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>{rating.blocksField}</span>
                <span style={{ display: 'block', color: 'var(--ink-3)' }}>{rating.blocksHint}</span>
              </span>
            </label>
          ) : null}

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn" onClick={() => setPanelKey(null)} data-testid={testIds.formClose}>
              {labels.form.close}
            </button>
          </div>
        </div>
      ) : null}

      <div className="students expiry-types-desktop-body">
        <div className="student-row header" style={{ gridTemplateColumns: cols }}>
          <div>{labels.table.name}</div>
          {rating ? <div>{rating.scopeColumn}</div> : null}
          <div>{labels.table.validity}</div>
          <div>{labels.table.status}</div>
          <div>{labels.table.actions}</div>
        </div>
        {items.length === 0 ? (
          <div className="student-row" style={{ gridTemplateColumns: '1fr' }}>
            <div style={{ color: 'var(--ink-3)', padding: '8px 0' }}>{labels.table.empty}</div>
          </div>
        ) : (
          items.map((item) => {
            const state = stateOf(item);
            const error = itemErrors[item.rowKey];
            return (
              <div
                key={item.rowKey}
                className="student-row catalog-row"
                data-testid={testIds.row}
                data-state={state}
                data-invalid={error ? 'true' : undefined}
                style={{ gridTemplateColumns: cols, alignItems: 'center' }}
              >
                <div>
                  <div className="student-name">{displayName(item)}</div>
                  {state !== 'saved' || (rating && item.blocksBooking) ? (
                    <div style={{ marginTop: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {stateBadge(state)}
                      {rating && item.blocksBooking ? <Badge tone="warn">{rating.blocksBadge}</Badge> : null}
                    </div>
                  ) : null}
                </div>
                {rating ? (
                  <div>
                    <Badge>{rating.scope[item.scope]}</Badge>
                  </div>
                ) : null}
                <div className="mono" style={{ fontSize: 12.5 }}>
                  {validityLabel(item) !== labels.table.noExpiry ? (
                    validityLabel(item)
                  ) : (
                    <span className="badge" style={{ fontSize: 9.5 }} title={labels.table.noExpiry}>
                      {labels.table.noExpiry}
                    </span>
                  )}
                </div>
                <div>
                  <Badge tone={item.isActive ? 'ok' : ''} dot>
                    {statusLabel(item)}
                  </Badge>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.removed ? null : (
                    <button type="button" className="btn mini" onClick={() => setPanelKey(item.rowKey)} data-testid={testIds.editButton}>
                      {labels.actions.edit}
                    </button>
                  )}
                  {item.removed || state === 'new' ? null : (
                    <button type="button" className="btn mini" onClick={() => update(item.rowKey, { isActive: !item.isActive })} data-testid={testIds.toggleButton}>
                      {item.isActive ? labels.actions.deactivate : labels.actions.reactivate}
                    </button>
                  )}
                  <button type="button" className={item.removed ? 'btn mini' : 'btn mini bad'} onClick={() => toggleRemove(item)} data-testid={testIds.deleteButton}>
                    {item.removed ? labels.actions.restore : labels.actions.delete}
                  </button>
                </div>
                {error ? (
                  <p role="alert" tabIndex={-1} className="fld-error catalog-row-error" data-focus-error data-testid={testIds.rowError}>
                    {error.message}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {/* --- the phone face of this catalogue (story 15.8b, R-15.8b-d) -------
          The table becomes one card per type; the actions move INTO the sheet,
          the only place a thumb can reach them. The card is ONE `<button>`
          with `<span>` children: zero nested interactives, so a tap can only
          mean "open the detail". A refused row's message sits right under its
          card, outside the button. */}
      <div className="expiry-types-mobile" data-testid={testIds.mobileList}>
        {items.length === 0 ? (
          // Deliberately NOT the desktop's own `table.empty` string: a second
          // node carrying it would break any page-level `getByText` at 1280px
          // (the class of defect `expiry-dashboard.spec.ts:135` already has).
          <p className="mobile-card-empty" data-testid={testIds.mobileEmpty}>
            {labels.mobile.empty}
          </p>
        ) : (
          items.map((item) => {
            const state = stateOf(item);
            const error = itemErrors[item.rowKey];
            return (
              <div key={item.rowKey}>
                <button
                  type="button"
                  className="mobile-row mobile-row-catalog"
                  aria-label={`${labels.mobile.openDetail}: ${displayName(item)}`}
                  onClick={() => setSheetKey(item.rowKey)}
                  data-state={state}
                  data-invalid={error ? 'true' : undefined}
                  data-testid={testIds.mobileRow}
                >
                  <span className="mobile-row-main">
                    <span className="mobile-row-title">
                      <span className="mobile-row-name">{displayName(item)}</span>
                    </span>
                    <span className="mobile-row-sub">
                      {expiryTypeSubLine({
                        scopeLabel: rating ? rating.scope[item.scope] : null,
                        validityLabel: validityLabel(item),
                        blocksLabel: rating && item.blocksBooking ? rating.blocksBadge : null,
                      })}
                    </span>
                  </span>
                  <span className="mobile-row-side">
                    <Badge tone={item.isActive ? 'ok' : ''} dot>
                      {statusLabel(item)}
                    </Badge>
                    {stateBadge(state)}
                  </span>
                </button>
                {error ? (
                  <p role="alert" tabIndex={-1} className="fld-error catalog-row-error" data-focus-error data-testid={testIds.mobileRowError}>
                    {error.message}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--ink-3)' }}>{labels.hint}</div>

      {/* Rendered conditionally, so the sheet's testid is always exactly ONE
          node (AD-6); the "one sheet at a time" invariant itself belongs to
          the chassis (fix 15.3 F4) — the page mounts THREE catalogue cards
          that do not know each other. */}
      {sheetItem ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId={testIds.mobileSheet}
          sub={expiryTypeSheetSub({
            catalogLabel: labels.title,
            scopeLabel: rating ? rating.scope[sheetItem.scope] : null,
            blocksLabel: rating && sheetItem.blocksBooking ? rating.blocksBadge : null,
          })}
          title={displayName(sheetItem)}
          badge={
            <Badge tone={sheetItem.isActive ? 'ok' : ''} dot>
              {statusLabel(sheetItem)}
            </Badge>
          }
          rows={sheetRows(sheetItem)}
          closeLabel={labels.form.close}
          actions={
            <>
              {sheetItem.removed ? null : (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    revealPanelRef.current = true;
                    setPanelKey(sheetItem.rowKey);
                    closeSheet();
                  }}
                  data-testid={testIds.mobileEditButton}
                >
                  {labels.actions.edit}
                </button>
              )}
              {sheetItem.removed || stateOf(sheetItem) === 'new' ? null : (
                <button type="button" className="btn" onClick={() => update(sheetItem.rowKey, { isActive: !sheetItem.isActive })} data-testid={testIds.mobileToggleButton}>
                  {sheetItem.isActive ? labels.actions.deactivate : labels.actions.reactivate}
                </button>
              )}
              {/* Destructive and last; reversible until the Salva ("Ripristina"). */}
              <button type="button" className={sheetItem.removed ? 'btn' : 'btn mini bad'} onClick={() => toggleRemove(sheetItem)} data-testid={testIds.mobileDeleteButton}>
                {sheetItem.removed ? labels.actions.restore : labels.actions.delete}
              </button>
            </>
          }
        />
      ) : null}
    </div>
  );
}
