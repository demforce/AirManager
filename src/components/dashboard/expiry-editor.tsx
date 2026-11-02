'use client';

/**
 * Draft expiries editor — story 19.4 (AD-8, R-19-m), the successor of story
 * 13.2's live editor, which wrote every add/edit/remove the moment it was
 * clicked. Shared by `pilots/pilot-editor.tsx` (Ratings, `kind="RATING"`,
 * and Visita medica, `kind="MEDICAL"`) and `instructors/instructor-editor.tsx`
 * (Ratings scoped to instructors). It calls NO write API: the person editor's
 * single "Salva" sends what this draft holds as the `expiries` block of the
 * person composite (`PATCH /api/v1/people/{id}`, by type — `set`/`remove`).
 * Selection is ALWAYS from the catalogue (chips) — never free text (D13,
 * R-13.1-b) — and every row requires an `expiresAt` (R-13.1-c).
 *
 * Two fetches classify a person's CURRENT expiries into a `kind`: the
 * catalogue (`GET /api/v1/expiry-types?kind=…&includeInactive=true` — needs
 * inactive types too, so a pre-existing row against a since-deactivated type
 * still renders) and the person's full expiries list
 * (`GET /api/v1/people/{id}/expiries`, which carries no `kind` of its own).
 *
 * The draft lives in `usePersonExpiryDraft` (one per editor, every kind of
 * that editor in ONE draft, so the two sections of the pilot editor merge
 * into one `expiries` block); `ExpiryDraftEditor` only renders one kind of it.
 */
import { useEffect, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { DateInput } from '@/components/ui/date-input';
import { addMonthsClampUtc, toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import { isExpiryScopeCompatible, MEMBERSHIP_FEE_TYPE_NAME, type ProfileFlags } from '@/lib/expiry-scope';
import type { ExpiryScopeDto } from '@/lib/schemas/expiry-types';

export type ExpiryCatalogEntry = { id: string; name: string; scope: ExpiryScopeDto; isActive: boolean; validityMonths: number | null };

export type ExpiryKind = 'RATING' | 'MEDICAL';

/** `today + validityMonths`, clamped to the target month's real last day (story 13.8, AC 5 — F2, review 13.3: the pre-13.3 page-level form precompiled this). `null`/`0` both mean "no expiry" (same convention as `expiryTypeValidityMonthsSchema`) — no precompile for either. */
function precompileExpiresAt(validityMonths: number | null): string {
  if (!validityMonths) return '';
  return toDateOnlyString(addMonthsClampUtc(todayDateOnlyUtc(), validityMonths));
}

type PersonExpiryItem = { id: string; expiryTypeId: string; typeName: string; expiresAt: string; status: 'ok' | 'expiring' | 'expired' };

/** Excludes "Quota associativa" (story 13.2 review F3): a financial obligation, never a selectable chip in this editor — it stays managed by the Impostazioni quota card + addebito flow. Filtering here (the single catalogue fetch this component uses) also drops any already-registered quota `Expiry` from the draft below, since it's derived from the catalogues. */
export async function fetchExpiryTypes(kind: ExpiryKind, includeInactive = false): Promise<ExpiryCatalogEntry[]> {
  const response = await fetch(`/api/v1/expiry-types?kind=${kind}&includeInactive=${includeInactive}`);
  if (!response.ok) return [];
  const types = (await response.json()) as ExpiryCatalogEntry[];
  return types.filter((type) => type.name !== MEMBERSHIP_FEE_TYPE_NAME);
}

async function fetchPersonExpiries(personId: string): Promise<PersonExpiryItem[]> {
  const response = await fetch(`/api/v1/people/${personId}/expiries`);
  if (!response.ok) throw new Error(`GET /people/${personId}/expiries: ${response.status}`);
  return (await response.json()) as PersonExpiryItem[];
}

function statusTone(status: 'ok' | 'expiring' | 'expired'): BadgeTone {
  if (status === 'expired') return 'bad';
  if (status === 'expiring') return 'warn';
  return 'ok';
}

/** One row of the draft, keyed by expiry TYPE: its date, and whether the Salva removes it (only a saved row is ever "removed" — a new one is dropped instead). */
type DraftRow = { expiresAt: string; removed: boolean };

/** The `expiries` block of the person composite, by type (story 19.4, D-2). */
export type ExpiryChanges = { set: Array<{ expiryTypeId: string; expiresAt: string }>; remove: string[] };

type LoadedDraft = { catalogs: Partial<Record<ExpiryKind, ExpiryCatalogEntry[]>>; saved: PersonExpiryItem[]; rows: Record<string, DraftRow> };

/** Pure fetch, no setState: the catalogues of `kinds`, the person's rows of those kinds, and a draft equal to them. */
async function loadDraft(personId: string, kinds: readonly ExpiryKind[]): Promise<LoadedDraft> {
  const [catalogList, items] = await Promise.all([Promise.all(kinds.map((kind) => fetchExpiryTypes(kind, true))), fetchPersonExpiries(personId)]);
  const catalogs = Object.fromEntries(kinds.map((kind, index) => [kind, catalogList[index]!])) as LoadedDraft['catalogs'];
  const known = new Set(catalogList.flat().map((type) => type.id));
  const saved = items.filter((item) => known.has(item.expiryTypeId));
  return { catalogs, saved, rows: Object.fromEntries(saved.map((item) => [item.expiryTypeId, { expiresAt: item.expiresAt, removed: false }])) };
}

export type PersonExpiryDraft = {
  status: 'loading' | 'error' | 'ready';
  catalogs: LoadedDraft['catalogs'];
  saved: PersonExpiryItem[];
  rows: Record<string, DraftRow>;
  /** What the Salva would send — empty arrays when the draft equals the saved rows. */
  changes: ExpiryChanges;
  /** Types the Salva would `set` without a date: the Salva is blocked on them. */
  missingDateIds: Set<string>;
  toggleChip: (type: ExpiryCatalogEntry) => void;
  setDate: (typeId: string, expiresAt: string) => void;
  toggleRemove: (typeId: string) => void;
  /** Drops the NEW rows a profile change made scope-incompatible (review F1 of story 13.2): the Salva never sends a row the server would answer `SCOPE_MISMATCH` to while its chip is out of view. */
  pruneForProfiles: (profiles: ProfileFlags) => void;
  /** Re-reads the person's rows and resets the draft onto them (after a successful Salva). */
  reload: () => Promise<void>;
};

export function usePersonExpiryDraft(personId: string, kinds: readonly ExpiryKind[]): PersonExpiryDraft {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [loaded, setLoaded] = useState<LoadedDraft>({ catalogs: {}, saved: [], rows: {} });
  const kindsKey = kinds.join(',');

  useEffect(() => {
    let cancelled = false;
    loadDraft(personId, kindsKey.split(',') as ExpiryKind[])
      .then((next) => {
        if (cancelled) return;
        setLoaded(next);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [personId, kindsKey]);

  const savedById = new Map(loaded.saved.map((item) => [item.expiryTypeId, item]));
  const changes: ExpiryChanges = { set: [], remove: [] };
  for (const [typeId, row] of Object.entries(loaded.rows)) {
    const saved = savedById.get(typeId);
    if (row.removed) {
      if (saved) changes.remove.push(typeId);
    } else if (!saved || row.expiresAt !== saved.expiresAt) {
      changes.set.push({ expiryTypeId: typeId, expiresAt: row.expiresAt });
    }
  }

  function updateRows(update: (rows: Record<string, DraftRow>) => Record<string, DraftRow>): void {
    setLoaded((current) => ({ ...current, rows: update(current.rows) }));
  }

  return {
    status,
    catalogs: loaded.catalogs,
    saved: loaded.saved,
    rows: loaded.rows,
    changes,
    missingDateIds: new Set(changes.set.filter((entry) => !entry.expiresAt).map((entry) => entry.expiryTypeId)),
    toggleChip: (type) =>
      updateRows((rows) => {
        if (!(type.id in rows)) return { ...rows, [type.id]: { expiresAt: precompileExpiresAt(type.validityMonths), removed: false } };
        const next = { ...rows };
        delete next[type.id];
        return next;
      }),
    setDate: (typeId, expiresAt) => updateRows((rows) => ({ ...rows, [typeId]: { ...rows[typeId]!, expiresAt } })),
    toggleRemove: (typeId) =>
      updateRows((rows) => {
        if (savedById.has(typeId)) return { ...rows, [typeId]: { ...rows[typeId]!, removed: !rows[typeId]!.removed } };
        const next = { ...rows };
        delete next[typeId];
        return next;
      }),
    pruneForProfiles: (profiles) => {
      const offered = new Set(
        Object.values(loaded.catalogs)
          .flat()
          .filter((type) => type.isActive && isExpiryScopeCompatible(type.scope, profiles))
          .map((type) => type.id),
      );
      updateRows((rows) => {
        const next = Object.fromEntries(Object.entries(rows).filter(([typeId]) => savedById.has(typeId) || offered.has(typeId)));
        return Object.keys(next).length === Object.keys(rows).length ? rows : next;
      });
    },
    reload: async () => {
      try {
        setLoaded(await loadDraft(personId, kinds));
        setStatus('ready');
      } catch {
        setStatus('error');
      }
    },
  };
}

export type ExpiryDraftEditorLabels = {
  empty: string;
  status: { ok: string; expiring: string; expired: string };
  dateLabel: string;
  remove: string;
  /** Undoes a pending removal (the row stays until the Salva). */
  restore: string;
  requiredDate: string;
  genericError: string;
};

export type ExpiryDraftEditorProps = {
  draft: PersonExpiryDraft;
  kind: ExpiryKind;
  /** The profiles AS IN THE EDITOR'S DRAFT, not as saved — the chips offered follow what the Salva will leave active. */
  profiles: ProfileFlags;
  labels: ExpiryDraftEditorLabels;
  /** Marks the rows still missing their date — only once the user has tried to save. */
  showMissingDates: boolean;
};

/**
 * One kind of the draft. A saved row (`data-state` `saved`, `changed` once its
 * date moves, `removed` once "Rimuovi" is toggled) keeps the status badge of
 * its SAVED date until the Salva; a chip adds a `new` row with the date
 * precompiled from the type's validity, and a second click on the chip (or
 * "Rimuovi") drops it again. Nothing here asks for confirmation: everything
 * is reversible until the Salva.
 */
export function ExpiryDraftEditor({ draft, kind, profiles, labels, showMissingDates }: ExpiryDraftEditorProps) {
  if (draft.status === 'error') {
    return (
      <p className="fld-label" style={{ color: 'var(--bad)' }}>
        {labels.genericError}
      </p>
    );
  }
  if (draft.status === 'loading') {
    return <p className="fld-label">…</p>;
  }

  const catalog = draft.catalogs[kind] ?? [];
  const savedById = new Map(draft.saved.map((item) => [item.expiryTypeId, item]));
  const rows = [
    ...draft.saved.filter((item) => catalog.some((type) => type.id === item.expiryTypeId)).map((item) => ({ typeId: item.expiryTypeId, name: item.typeName })),
    ...catalog.filter((type) => type.id in draft.rows && !savedById.has(type.id)).map((type) => ({ typeId: type.id, name: type.name })),
  ];
  const chips = catalog.filter((type) => type.isActive && !savedById.has(type.id) && isExpiryScopeCompatible(type.scope, profiles));

  const statusLabelOf = (status: 'ok' | 'expiring' | 'expired'): string =>
    status === 'expired' ? labels.status.expired : status === 'expiring' ? labels.status.expiring : labels.status.ok;

  return (
    <div>
      {rows.length === 0 ? (
        <p className="fld-label" style={{ textTransform: 'none' }}>
          {labels.empty}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {rows.map(({ typeId, name }) => {
            const row = draft.rows[typeId]!;
            const saved = savedById.get(typeId);
            const state = !saved ? 'new' : row.removed ? 'removed' : row.expiresAt !== saved.expiresAt ? 'changed' : 'saved';
            const missing = showMissingDates && draft.missingDateIds.has(typeId);
            return (
              <div
                key={typeId}
                className="meter-row expiry-draft-row"
                data-testid={`expiry-row-${typeId}`}
                data-state={state}
                style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
              >
                <span>{name}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <DateInput
                    inline
                    aria-label={`${name}: ${labels.dateLabel}`}
                    aria-invalid={missing}
                    value={row.expiresAt}
                    disabled={row.removed}
                    onChange={(event) => draft.setDate(typeId, event.target.value)}
                    data-testid={`expiry-date-${typeId}`}
                  />
                  {saved ? <Badge tone={statusTone(saved.status)}>{statusLabelOf(saved.status)}</Badge> : null}
                  <button
                    type="button"
                    className={row.removed ? 'btn mini' : 'btn mini bad'}
                    onClick={() => draft.toggleRemove(typeId)}
                    data-testid={`expiry-remove-${typeId}`}
                  >
                    {row.removed ? labels.restore : labels.remove}
                  </button>
                </span>
                {missing ? (
                  <p role="alert" className="fld-error" style={{ flexBasis: '100%', fontFamily: 'var(--font-ui)' }}>
                    {labels.requiredDate}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {chips.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {chips.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`expiry-chip${type.id in draft.rows ? ' selected' : ''}`}
              aria-pressed={type.id in draft.rows}
              onClick={() => draft.toggleChip(type)}
              data-testid={`expiry-chip-${type.id}`}
            >
              {type.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
