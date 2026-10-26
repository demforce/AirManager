'use client';

/**
 * Live (API-backed) expiries editor — story 13.2, AC 2/5. Shared by
 * `pilots/pilot-editor.tsx` (Ratings, `kind="RATING"`, and Visita medica,
 * `kind="MEDICAL"`, AC 2) and `instructors/instructor-editor.tsx` (Ratings
 * scoped to instructors, AC 5, gap N6 from 13.1). Selection is ALWAYS from
 * the catalogue (chips) — never free text (D13, R-13.1-b) — and every
 * addition requires an `expiresAt` (R-13.1-c). Uses the SAME expiries API
 * the standalone Scadenze page already uses
 * (`POST/PATCH/DELETE /api/v1/expiries`, `expiries.manage`) — no new route.
 *
 * Two fetches classify a person's CURRENT expiries into this `kind`: the
 * catalogue (`GET /api/v1/expiry-types?kind=…&includeInactive=true` — needs
 * inactive types too, so a pre-existing row against a since-deactivated type
 * still renders) and the person's full expiries list
 * (`GET /api/v1/people/{id}/expiries`, which carries no `kind` of its own).
 * Intersecting the two client-side avoids any backend schema change (story
 * rule: UI+e2e only).
 */
import { useEffect, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { DateInput } from '@/components/ui/date-input';
import { addMonthsClampUtc, toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import { formatDateOnly } from '@/lib/time';
import { isExpiryScopeCompatible, MEMBERSHIP_FEE_TYPE_NAME, type ProfileFlags } from '@/lib/expiry-scope';
import type { ExpiryScopeDto } from '@/lib/schemas/expiry-types';

export type ExpiryCatalogEntry = { id: string; name: string; scope: ExpiryScopeDto; isActive: boolean; validityMonths: number | null };

/** `today + validityMonths`, clamped to the target month's real last day (story 13.8, AC 5 — F2, review 13.3: the pre-13.3 page-level form precompiled this; `LiveExpiryEditor` never did). `null`/`0` both mean "no expiry" (same convention as `expiryTypeValidityMonthsSchema`) — no precompile for either. */
function precompileExpiresAt(validityMonths: number | null): string {
  if (!validityMonths) return '';
  return toDateOnlyString(addMonthsClampUtc(todayDateOnlyUtc(), validityMonths));
}

type PersonExpiryItem = { id: string; expiryTypeId: string; typeName: string; expiresAt: string; status: 'ok' | 'expiring' | 'expired' };

/** Excludes "Quota associativa" (story 13.2 review F3): a financial obligation, never a selectable chip in this editor — it stays managed by the Impostazioni quota card + addebito flow. Filtering here (the single catalogue fetch this component uses) also drops any already-registered quota `Expiry` from the "current" list below, since it's derived from `catalogIds`. */
export async function fetchExpiryTypes(kind: 'RATING' | 'MEDICAL', includeInactive = false): Promise<ExpiryCatalogEntry[]> {
  const response = await fetch(`/api/v1/expiry-types?kind=${kind}&includeInactive=${includeInactive}`);
  if (!response.ok) return [];
  const types = (await response.json()) as ExpiryCatalogEntry[];
  return types.filter((type) => type.name !== MEMBERSHIP_FEE_TYPE_NAME);
}

async function fetchPersonExpiries(personId: string): Promise<PersonExpiryItem[]> {
  const response = await fetch(`/api/v1/people/${personId}/expiries`);
  if (!response.ok) return [];
  return (await response.json()) as PersonExpiryItem[];
}

function statusTone(status: 'ok' | 'expiring' | 'expired'): BadgeTone {
  if (status === 'expired') return 'bad';
  if (status === 'expiring') return 'warn';
  return 'ok';
}

export type LiveExpiryEditorLabels = {
  empty: string;
  status: { ok: string; expiring: string; expired: string };
  dateLabel: string;
  addAction: string;
  cancel: string;
  save: string;
  edit: string;
  remove: string;
  confirmRemove: string;
  confirmYes: string;
  confirmCancel: string;
  requiredDate: string;
  genericError: string;
};

export type LiveExpiryEditorProps = {
  personId: string;
  kind: 'RATING' | 'MEDICAL';
  profiles: ProfileFlags;
  locale: 'it' | 'en';
  labels: LiveExpiryEditorLabels;
};

export function LiveExpiryEditor({ personId, kind, profiles, locale, labels }: LiveExpiryEditorProps) {
  const [catalog, setCatalog] = useState<ExpiryCatalogEntry[] | null>(null);
  const [items, setItems] = useState<PersonExpiryItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [addingTypeId, setAddingTypeId] = useState<string | null>(null);
  const [addDate, setAddDate] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh(): Promise<void> {
    const [nextCatalog, nextItems] = await Promise.all([fetchExpiryTypes(kind, true), fetchPersonExpiries(personId)]);
    setCatalog(nextCatalog);
    setItems(nextItems);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchExpiryTypes(kind, true), fetchPersonExpiries(personId)])
      .then(([nextCatalog, nextItems]) => {
        if (cancelled) return;
        setCatalog(nextCatalog);
        setItems(nextItems);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, kind]);

  if (loadError) {
    return (
      <p className="fld-label" style={{ color: 'var(--bad)' }}>
        {labels.genericError}
      </p>
    );
  }
  if (catalog === null || items === null) {
    return <p className="fld-label">…</p>;
  }

  const catalogIds = new Set(catalog.map((type) => type.id));
  const currentForKind = items.filter((item) => catalogIds.has(item.expiryTypeId));
  const registeredIds = new Set(currentForKind.map((item) => item.expiryTypeId));
  const availableChips = catalog.filter((type) => type.isActive && !registeredIds.has(type.id) && isExpiryScopeCompatible(type.scope, profiles));

  const statusLabelOf = (status: 'ok' | 'expiring' | 'expired'): string =>
    status === 'expired' ? labels.status.expired : status === 'expiring' ? labels.status.expiring : labels.status.ok;

  async function handleConfirmAdd(): Promise<void> {
    if (!addingTypeId) return;
    if (!addDate) {
      setAddError(labels.requiredDate);
      return;
    }
    setPending(true);
    const response = await fetch('/api/v1/expiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, expiryTypeId: addingTypeId, expiresAt: addDate }),
    });
    setPending(false);
    if (!response.ok) {
      setAddError(labels.genericError);
      return;
    }
    setAddingTypeId(null);
    setAddDate('');
    setAddError(null);
    await refresh();
  }

  async function handleSaveEdit(expiryId: string): Promise<void> {
    if (!editDate) {
      setEditError(labels.requiredDate);
      return;
    }
    setPending(true);
    const response = await fetch(`/api/v1/expiries/${expiryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresAt: editDate }),
    });
    setPending(false);
    if (!response.ok) {
      setEditError(labels.genericError);
      return;
    }
    setEditingId(null);
    setEditError(null);
    await refresh();
  }

  async function handleRemove(expiryId: string): Promise<void> {
    setPending(true);
    const response = await fetch(`/api/v1/expiries/${expiryId}`, { method: 'DELETE' });
    setPending(false);
    setConfirmingRemoveId(null);
    if (!response.ok) return;
    await refresh();
  }

  return (
    <div>
      {currentForKind.length === 0 ? (
        <p className="fld-label" style={{ textTransform: 'none' }}>
          {labels.empty}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {currentForKind.map((item) => (
            <div key={item.id} className="meter-row" data-testid={`expiry-row-${item.expiryTypeId}`} style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span>{item.typeName}</span>
              {editingId === item.id ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DateInput
                    inline
                    aria-label={labels.dateLabel}
                    aria-invalid={Boolean(editError)}
                    value={editDate}
                    onChange={(event) => setEditDate(event.target.value)}
                    data-testid={`expiry-edit-date-${item.expiryTypeId}`}
                  />
                  <button type="button" className="btn mini primary" disabled={pending} onClick={() => void handleSaveEdit(item.id)} data-testid={`expiry-edit-save-${item.expiryTypeId}`}>
                    {labels.save}
                  </button>
                  <button
                    type="button"
                    className="btn mini"
                    onClick={() => {
                      setEditingId(null);
                      setEditError(null);
                    }}
                  >
                    {labels.cancel}
                  </button>
                  {editError ? (
                    <p role="alert" className="fld-error">
                      {editError}
                    </p>
                  ) : null}
                </span>
              ) : confirmingRemoveId === item.id ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="fld-label">{labels.confirmRemove}</span>
                  <button
                    type="button"
                    className="btn mini bad"
                    disabled={pending}
                    onClick={() => void handleRemove(item.id)}
                    data-testid={`expiry-remove-confirm-${item.expiryTypeId}`}
                  >
                    {labels.confirmYes}
                  </button>
                  <button type="button" className="btn mini" onClick={() => setConfirmingRemoveId(null)}>
                    {labels.confirmCancel}
                  </button>
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono">{formatDateOnly(item.expiresAt, locale)}</span>
                  <Badge tone={statusTone(item.status)}>{statusLabelOf(item.status)}</Badge>
                  <button
                    type="button"
                    className="btn mini"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditDate(item.expiresAt);
                      setEditError(null);
                    }}
                    data-testid={`expiry-edit-${item.expiryTypeId}`}
                  >
                    {labels.edit}
                  </button>
                  <button type="button" className="btn mini bad" onClick={() => setConfirmingRemoveId(item.id)} data-testid={`expiry-remove-${item.expiryTypeId}`}>
                    {labels.remove}
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {availableChips.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {availableChips.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`expiry-chip${addingTypeId === type.id ? ' selected' : ''}`}
              onClick={() => {
                const selecting = addingTypeId !== type.id;
                setAddingTypeId(selecting ? type.id : null);
                setAddDate(selecting ? precompileExpiresAt(type.validityMonths) : '');
                setAddError(null);
              }}
              data-testid={`expiry-chip-${type.id}`}
            >
              {type.name}
            </button>
          ))}
        </div>
      ) : null}

      {addingTypeId ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }} data-testid="expiry-add-form">
          <DateInput
            inline
            aria-label={labels.dateLabel}
            aria-invalid={Boolean(addError)}
            value={addDate}
            onChange={(event) => setAddDate(event.target.value)}
            data-testid="expiry-add-date"
          />
          <button type="button" className="btn mini primary" disabled={pending} onClick={() => void handleConfirmAdd()} data-testid="expiry-add-confirm">
            {labels.addAction}
          </button>
          <button
            type="button"
            className="btn mini"
            onClick={() => {
              setAddingTypeId(null);
              setAddDate('');
              setAddError(null);
            }}
          >
            {labels.cancel}
          </button>
        </div>
      ) : null}
      {addError ? (
        <p role="alert" className="fld-error" style={{ marginTop: 6 }}>
          {addError}
        </p>
      ) : null}
    </div>
  );
}
