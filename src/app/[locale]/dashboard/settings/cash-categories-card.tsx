'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icons';
import { cashCategorySheetSub, cashCategorySubLine } from '@/lib/mobile-settings';
import { cashCategoryRowState, type CashCategoryDraftItem, type RowState } from '@/lib/settings-draft';

export type CashCategoriesCardLabels = {
  title: string;
  sub: string;
  addAction: string;
  table: { name: string; movements: string; status: string; actions: string; empty: string };
  status: { active: string; inactive: string };
  systemBadge: string;
  actions: { rename: string; deactivate: string; reactivate: string; delete: string; restore: string };
  rowState: Record<Exclude<RowState, 'saved'>, string>;
  form: { createTitle: string; renameTitle: string; name: string; close: string };
  /** Phone face (story 15.8b, R-15.8b-d). */
  mobile: { openDetail: string; empty: string };
};

type CashCategoriesCardProps = {
  items: CashCategoryDraftItem[];
  savedItems: CashCategoryDraftItem[];
  onChange: (items: CashCategoryDraftItem[], touchedRowKey: string) => void;
  newRowKey: () => string;
  itemErrors: Record<string, { field: 'name' | 'validity' | null; message: string }>;
  labels: CashCategoriesCardLabels;
};

const COLS = '1fr 110px 130px 220px';

const STATE_TONE: Record<Exclude<RowState, 'saved'>, BadgeTone> = { new: 'info', changed: 'warn', removed: 'bad' };

/**
 * "Categorie di cassa" card (story 12.13 review, F2) — same structure as
 * `RatingsCard`, and since story 19.8 the same draft model (R-19-m, D-7):
 * adding, renaming, (de)activating and deleting write nothing until the
 * page's single "Salva". A SYSTEM category ("Ricariche", "Compensi
 * istruttori") keeps its name read-only in the panel and has no "Elimina"
 * (absent, not disabled) — the server refuses both anyway (409
 * `SYSTEM_CATEGORY`); deactivating it stays allowed, as before.
 */
export function CashCategoriesCard({ items, savedItems, onChange, newRowKey, itemErrors, labels }: CashCategoriesCardProps) {
  // Story 19.12a: the phone row's movement count inflects (ICU plural).
  const t = useTranslations('SettingsPage.cashCategories.mobile');
  const [panelKey, setPanelKey] = useState<string | null>(null);
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  /** Set only by the sheet's "Rinomina" — the desktop never scrolls (the 15.8a `preventScroll` lesson). */
  const revealPanelRef = useRef(false);
  const focusNameRef = useRef(false);

  const savedById = new Map(savedItems.map((item) => [item.rowKey, item]));
  const stateOf = (item: CashCategoryDraftItem): RowState => cashCategoryRowState(item, item.id !== undefined ? savedById.get(item.id) : undefined);

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

  function update(rowKey: string, patch: Partial<CashCategoryDraftItem>): void {
    onChange(
      items.map((item) => (item.rowKey === rowKey ? { ...item, ...patch } : item)),
      rowKey,
    );
  }

  function add(): void {
    const rowKey = newRowKey();
    onChange([{ rowKey, name: '', isActive: true, removed: false, movementCount: 0, isSystem: false }, ...items], rowKey);
    focusNameRef.current = true;
    setPanelKey(rowKey);
  }

  function toggleRemove(item: CashCategoryDraftItem): void {
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

  const statusLabel = (item: CashCategoryDraftItem): string => (item.isActive ? labels.status.active : labels.status.inactive);
  const displayName = (item: CashCategoryDraftItem): string => item.name.trim() || '—';
  const movementsLabel = (item: CashCategoryDraftItem): string => t('movementsCount', { count: item.movementCount });

  function stateBadge(state: RowState) {
    return state === 'saved' ? null : <Badge tone={STATE_TONE[state]}>{labels.rowState[state]}</Badge>;
  }

  function sheetRows(item: CashCategoryDraftItem): BottomSheetRow[] {
    return [
      { k: labels.table.movements, v: String(item.movementCount) },
      { k: labels.table.status, v: statusLabel(item) },
    ];
  }

  const nameError = (item: CashCategoryDraftItem): string | undefined => (itemErrors[item.rowKey]?.field === 'name' ? itemErrors[item.rowKey]!.message : undefined);

  return (
    <div className="card settings-card" data-testid="cash-categories-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
        <div className="spacer" />
        <button type="button" className="btn primary" onClick={add} data-testid="cash-category-add-button">
          <Icon.plus /> {labels.addAction}
        </button>
      </div>

      {panelItem ? (
        <div
          ref={panelRef}
          role="group"
          aria-label={stateOf(panelItem) === 'new' ? labels.form.createTitle : labels.form.renameTitle}
          className="catalog-panel"
          data-testid="cash-category-form"
        >
          <div className="fld-label" style={{ marginBottom: 10 }}>
            {stateOf(panelItem) === 'new' ? labels.form.createTitle : labels.form.renameTitle}
          </div>
          <div className="form-grid">
            <Field label={labels.form.name} wide error={nameError(panelItem)}>
              <input
                ref={nameInputRef}
                className="input"
                maxLength={100}
                value={panelItem.name}
                readOnly={panelItem.isSystem}
                onChange={(event) => update(panelItem.rowKey, { name: event.target.value })}
                aria-invalid={nameError(panelItem) !== undefined}
                data-testid="cash-category-name-input"
              />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn" onClick={() => setPanelKey(null)} data-testid="cash-category-form-close">
              {labels.form.close}
            </button>
          </div>
        </div>
      ) : null}

      <div className="students cash-categories-desktop-body">
        <div className="student-row header" style={{ gridTemplateColumns: COLS }}>
          <div>{labels.table.name}</div>
          <div>{labels.table.movements}</div>
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
                data-testid="cash-category-row"
                data-state={state}
                data-invalid={error ? 'true' : undefined}
                style={{ gridTemplateColumns: COLS, alignItems: 'center' }}
              >
                <div>
                  <div className="student-name">{displayName(item)}</div>
                  {state !== 'saved' || item.isSystem ? (
                    <div style={{ marginTop: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {stateBadge(state)}
                      {item.isSystem ? <Badge tone="info">{labels.systemBadge}</Badge> : null}
                    </div>
                  ) : null}
                </div>
                <div className="mono" style={{ fontSize: 12.5 }}>
                  {item.movementCount}
                </div>
                <div>
                  <Badge tone={item.isActive ? 'ok' : ''} dot>
                    {statusLabel(item)}
                  </Badge>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.removed ? null : (
                    <button type="button" className="btn mini" onClick={() => setPanelKey(item.rowKey)} data-testid="cash-category-rename-button">
                      {labels.actions.rename}
                    </button>
                  )}
                  {item.removed || state === 'new' ? null : (
                    <button type="button" className="btn mini" onClick={() => update(item.rowKey, { isActive: !item.isActive })} data-testid="cash-category-toggle-button">
                      {item.isActive ? labels.actions.deactivate : labels.actions.reactivate}
                    </button>
                  )}
                  {item.isSystem ? null : (
                    <button type="button" className={item.removed ? 'btn mini' : 'btn mini bad'} onClick={() => toggleRemove(item)} data-testid="cash-category-delete-button">
                      {item.removed ? labels.actions.restore : labels.actions.delete}
                    </button>
                  )}
                </div>
                {error ? (
                  <p role="alert" tabIndex={-1} className="fld-error catalog-row-error" data-focus-error data-testid="cash-category-row-error">
                    {error.message}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* --- the phone face of this catalogue (story 15.8b, R-15.8b-d) ------
          Same shape as the two expiry-type catalogues. On a SYSTEM category
          the "Elimina" action stays ABSENT — not disabled — exactly as on the
          desktop row. */}
      <div className="cash-categories-mobile" data-testid="mobile-cash-category-list">
        {items.length === 0 ? (
          <p className="mobile-card-empty" data-testid="mobile-cash-category-empty">
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
                  data-testid="cash-category-row-mobile"
                >
                  <span className="mobile-row-main">
                    <span className="mobile-row-title">
                      <span className="mobile-row-name">{displayName(item)}</span>
                    </span>
                    <span className="mobile-row-sub">
                      {cashCategorySubLine({ movementsLabel: movementsLabel(item), systemLabel: item.isSystem ? labels.systemBadge : null })}
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
                  <p role="alert" tabIndex={-1} className="fld-error catalog-row-error" data-focus-error data-testid="cash-category-row-error-mobile">
                    {error.message}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {sheetItem ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-cash-category-sheet"
          sub={cashCategorySheetSub({ catalogLabel: labels.title, systemLabel: sheetItem.isSystem ? labels.systemBadge : null })}
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
                  data-testid="cash-category-rename-button-mobile"
                >
                  {labels.actions.rename}
                </button>
              )}
              {sheetItem.removed || stateOf(sheetItem) === 'new' ? null : (
                <button type="button" className="btn" onClick={() => update(sheetItem.rowKey, { isActive: !sheetItem.isActive })} data-testid="cash-category-toggle-button-mobile">
                  {sheetItem.isActive ? labels.actions.deactivate : labels.actions.reactivate}
                </button>
              )}
              {sheetItem.isSystem ? null : (
                <button type="button" className={sheetItem.removed ? 'btn' : 'btn mini bad'} onClick={() => toggleRemove(sheetItem)} data-testid="cash-category-delete-button-mobile">
                  {sheetItem.removed ? labels.actions.restore : labels.actions.delete}
                </button>
              )}
            </>
          }
        />
      ) : null}
    </div>
  );
}
