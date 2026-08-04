'use client';

/**
 * Scadenze registry (story 12.11, AC 3) — port of
 * `docs/design-reference/airops/src/ScadenzeView.jsx` onto real data.
 * Stat cards are GLOBAL counts (server-derived, `getExpiryTierCounts`),
 * independent of the table's own finestra/tipo/pilota filters (mirrors the
 * prototype's `rows` vs `shown` split). Filters are URL-driven
 * (`router.push`, same convention as `billing-console.tsx`) — server-side
 * pagination, unlike the prototype's unpaginated client table (D13: domain
 * wins, a real club's history can exceed one page).
 *
 * Story 15.7 added the phone face (ratifiche R-15.7-b/e/g/h): the six-column
 * table becomes one card per scadenza plus a detail sheet, the finestra
 * becomes a chip strip, the tipo moves into a "Filtri" panel that applies in
 * ONE navigation, and the quota modal becomes a full-screen panel. Every
 * control keeps its desktop testid and its desktop behaviour; only the
 * PLACEMENT changes, in CSS.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { ExportMenu } from '@/components/ui/export-menu';
import { Icon } from '@/components/ui/icons';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { categoryOf, tierOf } from '@/lib/expiry-status';
import { expiryCardSubLine, expiryDaysLabel, expirySheetSub } from '@/lib/mobile-expiries';
import { formatCents, parseCents } from '@/lib/money';
import { randomIdempotencyKey } from '@/lib/use-idempotency-key';
import type { ExpiryDashboardItemDto, ExpiryWindowDto } from '@/lib/schemas/expiries';
import { SearchCombobox, type SearchComboboxOption } from '@/components/search-combobox';
import { formatDateOnly } from '@/lib/time';

type PersonOption = { id: string; firstName: string; lastName: string };
type TypeOption = { id: string; name: string };
type Category = 'Medico' | 'Licenza' | 'Abilitazione';

/** Free-text pilot filter (story 13.5, AC 9) — `personQuery` replaces the old `SearchCombobox`-driven `personId`, same idiom as `pilots-console.tsx`'s own name filter. */
export type ScadenzeFilters = { window: ExpiryWindowDto | 'all'; expiryTypeId: string; personQuery: string };

/**
 * Same debounce-before-navigating idiom as `pilots-console.tsx`/`fleet-console.tsx`,
 * plus the `cancel` this page needs (story 15.7, AD-4). The failure it prevents
 * here is NOT the one story 15.6 fixed: `expiries/page.tsx` mounts this console
 * WITHOUT a `key`, so a navigation does not remount it and the "Filtri" panel
 * would stay open — what a timer still pending at open time does instead is
 * write `filters` UNDER the panel, leaving the draft it was seeded with stale,
 * so "Applica" would send the search BACK to what it was before the typing.
 */
function useDebouncedCallback(callback: (value: string) => void, delayMs: number): { run: (value: string) => void; cancel: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function cancel(): void {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  return {
    run: (value: string) => {
      cancel();
      timerRef.current = setTimeout(() => callback(value), delayMs);
    },
    cancel,
  };
}

export type ScadenzeConsoleLabels = {
  cardTitle: string;
  shown: string;
  segmented: { win60: string; win30: string; win7: string; expired: string; all: string };
  filters: { allTypes: string; allPilots: string; pilot: string; personSearchPlaceholder: string; reset: string };
  table: { pilot: string; type: string; certificate: string; expiresAt: string; daysLeft: string; status: string; empty: string };
  statCards: { expired: string; expiredNote: string; within7: string; within7Note: string; within30: string; within30Note: string; within60: string; within60Note: string };
  status: { expired: string; within7: string; within30: string; within60: string; ok: string };
  daysAgoSuffix: string;
  daysSuffix: string;
  exportMenu: { label: string; xlsLabel: string; pdfLabel: string };
  reminders: { button: string; sent: string; error: string };
  membershipFee: {
    button: string;
    disabledHint: string;
    modalTitle: string;
    pilot: string;
    amount: string;
    amountHint: string;
    submit: string;
    cancel: string;
    /** Review 14.2 F3.4 — the pilot combobox's own marker (was one string shared with the amount). */
    requiredPilot: string;
    invalidAmount: string;
    success: string;
    genericError: string;
    insufficientBalance: string;
    overrideCheckbox: string;
  };
  pagination: { prev: string; next: string };
  /**
   * Story 15.7 — only the words the phone face has no desktop equivalent for:
   * the card/sheet borrow `table.*`, `status.*` and `filters.*` wherever the
   * desktop already spells the word out.
   */
  mobile: {
    openDetail: string;
    close: string;
    notes: string;
    scopeLabel: string;
    scope: Record<'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' | 'ALL', string>;
    openPerson: string;
    filters: string;
    /** `{count}` filled client-side (`t.raw`) — how many PANEL filters are active. */
    filtersCount: string;
    filtersTitle: string;
    apply: string;
    empty: string;
    noValue: string;
  };
};

export type ScadenzeConsoleProps = {
  items: ExpiryDashboardItemDto[];
  page: number;
  totalPages: number;
  totalShown: number;
  tierCounts: { expired: number; within7: number; within30: number; within60: number };
  filters: ScadenzeFilters;
  typeOptions: TypeOption[];
  personOptions: PersonOption[];
  canTriggerReminders: boolean;
  canChargeMembershipFee: boolean;
  membershipFeeCents: number;
  exportHref: string;
  exportPdfHref: string;
  locale: 'it' | 'en';
  labels: ScadenzeConsoleLabels;
};

const COLS = 'minmax(140px,1.4fr) 110px minmax(150px,1.5fr) 130px 120px 130px';

const WINDOW_VALUES = ['60', '30', '7', 'expired', 'all'] as const;

/** Category badge tone (Contesto: Medico=info, Licenza="", Abilitazione=warn — `ScadenzeView.jsx`'s `catTone`). `categoryOf` itself is shared, `@/lib/expiry-status` (story 12.12: reused by `ScadenzeWidget`, no second implementation). */
const CATEGORY_TONE: Record<Category, BadgeTone> = { Medico: 'info', Licenza: '', Abilitazione: 'warn' };

/** Tier tone (Contesto: `ScadenzeView.jsx:12-20`) — `tierOf` itself is shared, `@/lib/expiry-status` (story 12.12). */
const TIER_TONE: Record<0 | 1 | 2 | 3 | 4, BadgeTone> = { 0: 'bad', 1: 'bad', 2: 'warn', 3: 'info', 4: '' };
const TIER_ROW_TINT: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'var(--bad-soft)',
  1: 'var(--bad-soft)',
  2: 'var(--warn-soft)',
  3: 'var(--info-soft)',
  4: 'transparent',
};

function personLabel(person: PersonOption): string {
  return `${person.lastName} ${person.firstName}`;
}

async function searchPersonFilter(query: string): Promise<SearchComboboxOption[]> {
  const params = new URLSearchParams({ q: query, pageSize: '50' });
  const response = await fetch(`/api/v1/people?${params.toString()}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items: { id: string; firstName: string; lastName: string }[] };
  return body.items.map((person) => ({ id: person.id, label: personLabel(person) }));
}

export function ScadenzeConsole({
  items,
  page,
  totalPages,
  totalShown,
  tierCounts,
  filters: initialFilters,
  typeOptions,
  personOptions,
  canTriggerReminders,
  canChargeMembershipFee,
  membershipFeeCents,
  exportHref,
  exportPdfHref,
  locale,
  labels,
}: ScadenzeConsoleProps) {
  const router = useRouter();
  const toast = useToast();
  const [filters, setFilters] = useState(initialFilters);
  const [personQueryInput, setPersonQueryInput] = useState(initialFilters.personQuery);
  const [remindersSending, setRemindersSending] = useState(false);
  const [remindersFeedback, setRemindersFeedback] = useState<string | null>(null);
  const [feeModalOpen, setFeeModalOpen] = useState(false);

  // --- phone-only state (story 15.7) ---------------------------------------
  // The row-detail sheet and the draft of the "Filtri" panel. Unlike the
  // logbook's (15.6), NEITHER dies on navigation: this console has no remount
  // `key` (`expiries/page.tsx:118`), which is exactly why `applyFilterDraft`
  // below has to write `filters`/`personQueryInput` itself.
  const [sheetId, setSheetId] = useState<string | null>(null);
  /** `null` while the panel is closed; the filter values being edited while it is open. */
  const [filterDraft, setFilterDraft] = useState<ScadenzeFilters | null>(null);

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => setSheetId(null), []);

  function buildQuery(next: ScadenzeFilters): Record<string, string> {
    const query: Record<string, string> = {};
    if (next.window !== '60') query['window'] = next.window;
    if (next.expiryTypeId) query['expiryTypeId'] = next.expiryTypeId;
    if (next.personQuery) query['personQuery'] = next.personQuery;
    return query;
  }

  function navigate(next: ScadenzeFilters): void {
    const params = new URLSearchParams(buildQuery(next));
    const search = params.toString();
    router.push(`/dashboard/expiries${search ? `?${search}` : ''}`);
  }

  function handleFilterChange(patch: Partial<ScadenzeFilters>): void {
    const next = { ...filters, ...patch };
    setFilters(next);
    navigate(next);
  }

  const personQueryDebounce = useDebouncedCallback((value: string) => {
    handleFilterChange({ personQuery: value });
  }, 400);

  function handlePersonQueryChange(value: string): void {
    setPersonQueryInput(value);
    personQueryDebounce.run(value);
  }

  /**
   * "Azzera filtri" — the label has existed, orphaned, in BOTH locales since
   * story 13.5 (§a.5 asimmetria 1); ratifica R-15.7-k(2) gives it the phone
   * panel as its home and leaves the desktop head without it, as today.
   */
  function handleReset(): void {
    const cleared: ScadenzeFilters = { window: '60', expiryTypeId: '', personQuery: '' };
    setFilters(cleared);
    setPersonQueryInput('');
    navigate(cleared);
  }

  function pageHref(targetPage: number) {
    return { pathname: '/dashboard/expiries' as const, query: { page: targetPage, ...buildQuery(filters) } };
  }

  /**
   * Opening the panel takes the pending search OVER (AD-4). Cancelling that
   * timer is what keeps the seeded draft FRESH (its navigation would rewrite
   * `filters` under the open panel, and "Applica" would then send the search
   * back to its pre-typing value); carrying `personQueryInput` — the text as
   * TYPED — into the draft is what keeps the typing. Flushing instead of
   * cancelling would be self-defeating: the flush IS that navigation.
   */
  function openFilterPanel(): void {
    personQueryDebounce.cancel();
    setFilterDraft({ ...filters, personQuery: personQueryInput });
  }

  /** Dismissing (✕, scrim, Escape) drops the panel's own edits — never the typing that preceded it: the search re-arms and lands on its own, as it would have without the panel. */
  function dismissFilterPanel(): void {
    setFilterDraft(null);
    if (personQueryInput !== filters.personQuery) personQueryDebounce.run(personQueryInput);
  }

  /** ONE navigation on "Applica" (AD-4), carrying the panel filter AND the typed search together. */
  function applyFilterDraft(): void {
    if (filterDraft === null) return;
    const next = filterDraft;
    setFilterDraft(null);
    setFilters(next);
    setPersonQueryInput(next.personQuery);
    navigate(next);
  }

  /** How many of the filters the phone HIDES inside the panel are active — the count on its trigger. A filter one cannot see is a filter one forgets; finestra and pilota are not counted because they are in plain sight (chips and search box). */
  const panelActiveCount = filters.expiryTypeId !== '' ? 1 : 0;

  /**
   * The outcome of the reminders job. On the phone the `role="status"`
   * paragraph is hidden (ratifica R-15.7-g) because a confirm-then-nothing is
   * how an operator ends up firing an idempotent job twice; the toast host is
   * already lifted above the tab bar (15.1). The trigger stays ONE node at
   * every width (`expiry-alerts.spec.ts:254` counts it), and the architecture
   * forbids reading the viewport in JS — so the outcome is announced in both
   * places and CSS decides which one is on screen.
   */
  async function sendReminders(): Promise<void> {
    setRemindersSending(true);
    setRemindersFeedback(null);
    const response = await fetch('/api/v1/expiry-alerts/trigger', { method: 'POST' });
    setRemindersSending(false);
    if (!response.ok) {
      setRemindersFeedback(labels.reminders.error);
      toast.show(labels.reminders.error, 'bad');
      return;
    }
    const body = (await response.json()) as { holderEmailsSent: number; digestEmailsSent: number };
    const message = labels.reminders.sent.replace('{holders}', String(body.holderEmailsSent)).replace('{digests}', String(body.digestEmailsSent));
    setRemindersFeedback(message);
    toast.show(message, 'ok');
    router.refresh();
  }

  const personComboOptions: SearchComboboxOption[] = [
    { id: '', label: labels.filters.allPilots },
    ...personOptions.map((person) => ({ id: person.id, label: personLabel(person) })),
  ];

  function statusLabelOf(tier: 0 | 1 | 2 | 3 | 4): string {
    return tier === 0 ? labels.status.expired : tier === 1 ? labels.status.within7 : tier === 2 ? labels.status.within30 : tier === 3 ? labels.status.within60 : labels.status.ok;
  }

  function daysLabelOf(daysUntil: number): string {
    return expiryDaysLabel(daysUntil, { ago: labels.daysAgoSuffix, left: labels.daysSuffix });
  }

  /** Re-read from `items` on every render, so a refresh never leaves the sheet showing the copy it was opened with. */
  const sheetItem = items.find((item) => item.id === sheetId) ?? null;

  /**
   * Parity of the sheet with the desktop row (AC 3, lesson 15.5 F2): the six
   * columns — persona (the title), categoria and certificato (the over-line),
   * scadenza, giorni, stato — plus the two fields the DTO carries and the
   * table has no room for (`notes`, `typeScope`), plus the one thing the row
   * OPENS: the scheda persona (`scadenze-console.tsx:303`), which is the
   * sheet's own action.
   */
  function sheetRows(item: ExpiryDashboardItemDto): BottomSheetRow[] {
    return [
      { k: labels.table.expiresAt, v: formatDateOnly(item.expiresAt, locale) },
      { k: labels.table.daysLeft, v: daysLabelOf(item.daysUntil) },
      { k: labels.table.status, v: statusLabelOf(tierOf(item.daysUntil)) },
      { k: labels.mobile.scopeLabel, v: labels.mobile.scope[item.typeScope] },
      { k: labels.mobile.notes, v: item.notes ?? labels.mobile.noValue },
    ];
  }

  return (
    <>
      {/* `kpi-row-grid` (15.3): 2x2 on the phone, because these four numbers
          are ONE scale of urgency and the strip hides the 3rd and the 4th
          behind a swipe (ratifica R-15.7-h). The four desktop tracks moved
          from an inline style into `.scadenze-kpi-row` — an inline
          `grid-template-columns` cannot be overridden by a media query.
          Identical computed style above 640px, measured. */}
      <div className="kpi-row kpi-row-grid scadenze-kpi-row">
        <StatCard label={labels.statCards.expired} value={tierCounts.expired} ink="var(--bad)" note={labels.statCards.expiredNote} testId="scadenze-stat-expired" />
        <StatCard label={labels.statCards.within7} value={tierCounts.within7} ink="var(--bad)" note={labels.statCards.within7Note} testId="scadenze-stat-within7" />
        <StatCard label={labels.statCards.within30} value={tierCounts.within30} ink="var(--accent-ink)" note={labels.statCards.within30Note} testId="scadenze-stat-within30" />
        <StatCard label={labels.statCards.within60} value={tierCounts.within60} ink="var(--info)" note={labels.statCards.within60Note} testId="scadenze-stat-within60" />
      </div>

      <div className="card">
        {/* ONE head at every width (AD-2/AD-5): every control keeps its testid
            and its state, only the placement changes in CSS. The single
            exception is the tipo filter, which the phone re-renders inside the
            "Filtri" panel over a DRAFT — the head navigates on every change,
            the panel navigates once, and one element cannot do both (15.6 C5). */}
        <div className="card-head scadenze-head">
          <div className="card-title">{labels.cardTitle}</div>
          <span className="card-sub">{labels.shown.replace('{count}', String(totalShown))}</span>
          <div className="spacer" />
          {/* `scadenze-window-desktop` is a class of THIS page, never a rule on
              `.segmented` (6 consumers: pianificazione, panoramica, statistiche…). */}
          <div className="segmented scadenze-window-desktop">
            {WINDOW_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                className={filters.window === value ? 'on' : ''}
                onClick={() => handleFilterChange({ window: value })}
                data-testid={`scadenze-window-${value}`}
              >
                {labels.segmented[value === '60' ? 'win60' : value === '30' ? 'win30' : value === '7' ? 'win7' : value === 'expired' ? 'expired' : 'all']}
              </button>
            ))}
          </div>
          <select
            className="input scadenze-filter-inpanel"
            style={{ width: 'auto', minWidth: 140, fontSize: 12 }}
            value={filters.expiryTypeId}
            onChange={(event) => handleFilterChange({ expiryTypeId: event.target.value })}
            data-testid="scadenze-filter-type"
          >
            <option value="">{labels.filters.allTypes}</option>
            {typeOptions.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          {/* Width moved out of the inline style into `.scadenze-search`: an
              inline `width` cannot be overridden by a media query, and the
              phone head gives this box its own full-width row (15.5/15.6). */}
          <div className="search scadenze-search">
            <Icon.search />
            <input
              className="bare-input"
              placeholder={labels.filters.personSearchPlaceholder}
              aria-label={labels.filters.pilot}
              value={personQueryInput}
              onChange={(event) => handlePersonQueryChange(event.target.value)}
              data-testid="scadenze-filter-pilot"
            />
          </div>
          {/* Phone only (`display: none` above 640px): the door to the panel
              that holds the tipo filter, with the number of them currently
              active — a filter one cannot see is a filter one forgets. */}
          <button type="button" className="btn scadenze-filters-trigger" onClick={openFilterPanel} data-testid="mobile-scadenze-filters-button">
            {panelActiveCount === 0 ? labels.mobile.filters : labels.mobile.filtersCount.replace('{count}', String(panelActiveCount))}
          </button>
          <ExportMenu label={labels.exportMenu.label} pdfLabel={labels.exportMenu.pdfLabel} pdfHref={exportPdfHref} xlsLabel={labels.exportMenu.xlsLabel} xlsHref={exportHref} />
          {canChargeMembershipFee ? (
            <button
              type="button"
              className="btn"
              disabled={membershipFeeCents <= 0}
              title={membershipFeeCents <= 0 ? labels.membershipFee.disabledHint : undefined}
              onClick={() => setFeeModalOpen(true)}
              data-testid="scadenze-membership-fee-button"
            >
              <Icon.cash /> {labels.membershipFee.button}
            </button>
          ) : null}
          {canTriggerReminders ? (
            <button type="button" className="btn primary" disabled={remindersSending} onClick={() => void sendReminders()} data-testid="scadenze-send-reminders-button">
              <Icon.bell /> {labels.reminders.button}
            </button>
          ) : null}
        </div>

        {remindersFeedback ? (
          <p role="status" className="scadenze-reminders-feedback" data-testid="scadenze-reminders-feedback" style={{ padding: '0 20px 12px', fontSize: 12.5, color: 'var(--ok)' }}>
            {remindersFeedback}
          </p>
        ) : null}

        <div className="students scadenze-desktop-body">
          <div className="student-row header" style={{ gridTemplateColumns: COLS }}>
            <div>{labels.table.pilot}</div>
            <div>{labels.table.type}</div>
            <div>{labels.table.certificate}</div>
            <div>{labels.table.expiresAt}</div>
            <div>{labels.table.daysLeft}</div>
            <div>{labels.table.status}</div>
          </div>
          {items.length === 0 ? (
            <div className="student-row" style={{ gridTemplateColumns: '1fr' }}>
              <div style={{ color: 'var(--ink-3)', padding: '8px 0' }}>{labels.table.empty}</div>
            </div>
          ) : (
            items.map((item) => {
              const tier = tierOf(item.daysUntil);
              const category = categoryOf(item.typeName);
              return (
                <div key={item.id} className="student-row" data-testid="scadenze-row" style={{ gridTemplateColumns: COLS, background: TIER_ROW_TINT[tier] }}>
                  <div>
                    <Link href={`/dashboard/people/${item.personId}`} locale={locale as AppLocale} className="student-name" style={{ textDecoration: 'none', color: 'inherit' }}>
                      {item.personLastName} {item.personFirstName}
                    </Link>
                  </div>
                  <div>
                    <Badge tone={CATEGORY_TONE[category]}>{category}</Badge>
                  </div>
                  <div style={{ fontSize: 12.5 }}>{item.typeName}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                    {formatDateOnly(item.expiresAt, locale)}
                  </div>
                  <div className="mono num" style={{ fontWeight: 600, color: `var(--${tier === 0 || tier === 1 ? 'bad' : tier === 2 ? 'accent-ink' : tier === 3 ? 'info' : 'ink-2'})` }}>
                    {daysLabelOf(item.daysUntil)}
                  </div>
                  <div data-testid="scadenze-status-badge">
                    <Badge tone={TIER_TONE[tier]} dot>
                      {statusLabelOf(tier)}
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* --- the phone face of this card (story 15.7, R3/R4) ---------------
            Same card, same head, same pagination: only the six-column table is
            swapped for one card per scadenza (template 266-286), whose one
            entry point — the scheda persona — lives in the sheet (R-15.7-b).
            The finestra is the one filter that stays in plain sight: a registry
            that silently shows only the next 60 days is a registry read wrong. */}
        <div className="scadenze-mobile">
          <div className="mobile-chip-strip" data-testid="mobile-scadenze-window-chips">
            {WINDOW_VALUES.map((value) => (
              // A `<button>`, not a `Link` as on the logbook (15.6): this
              // console is mounted WITHOUT a remount `key`, so a navigation
              // that did not also `setFilters` would leave the local filter
              // state stale and the NEXT filter change would silently undo
              // this one (AD-4's asymmetry, measured).
              <button
                key={value}
                type="button"
                className={`btn ${filters.window === value ? 'primary' : ''}`}
                aria-pressed={filters.window === value}
                onClick={() => handleFilterChange({ window: value })}
                data-testid={`mobile-scadenze-window-chip-${value}`}
              >
                {labels.segmented[value === '60' ? 'win60' : value === '30' ? 'win30' : value === '7' ? 'win7' : value === 'expired' ? 'expired' : 'all']}
              </button>
            ))}
          </div>

          <div data-testid="mobile-scadenze-list">
            {items.length === 0 ? (
              // Deliberately NOT the desktop's own "Nulla in questa finestra.":
              // `expiry-dashboard.spec.ts:135` reads that string PAGE-LEVEL, and
              // a second node carrying it would break strict mode at 1280px.
              <p className="mobile-card-empty" data-testid="mobile-scadenze-empty">
                {labels.mobile.empty}
              </p>
            ) : (
              items.map((item) => {
                const tier = tierOf(item.daysUntil);
                const personName = `${item.personLastName} ${item.personFirstName}`;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="mobile-row mobile-row-expiry"
                    aria-label={`${labels.mobile.openDetail}: ${personName} · ${item.typeName}`}
                    onClick={() => setSheetId(item.id)}
                    data-testid="scadenze-row-mobile"
                  >
                    <span className="mobile-row-main">
                      <span className="mobile-row-title">
                        <span className="mobile-row-name">{personName}</span>
                      </span>
                      <span className="mobile-row-sub">
                        {expiryCardSubLine({ typeName: item.typeName, dateLabel: formatDateOnly(item.expiresAt, locale), daysLabel: daysLabelOf(item.daysUntil) })}
                      </span>
                    </span>
                    <span className="mobile-row-side">
                      <Badge tone={TIER_TONE[tier]} dot>
                        {statusLabelOf(tier)}
                      </Badge>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {totalPages > 1 ? (
          <div className="card-body registry-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              className="btn"
              data-testid="scadenze-page-prev"
            >
              {labels.pagination.prev}
            </Link>
            <span className="mono" data-testid="scadenze-pagination-status">
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(page + 1)}
              locale={locale as AppLocale}
              aria-disabled={page >= totalPages}
              className="btn"
              data-testid="scadenze-page-next"
            >
              {labels.pagination.next}
            </Link>
          </div>
        ) : null}
      </div>

      {feeModalOpen ? (
        <MembershipFeeModal
          personOptions={personComboOptions}
          defaultAmountCents={membershipFeeCents}
          moneyLocale={locale}
          labels={labels.membershipFee}
          canOverride={canTriggerReminders}
          onClose={() => setFeeModalOpen(false)}
          onCharged={() => router.refresh()}
        />
      ) : null}

      {/* The "Filtri" panel (ratifica R-15.7-e, AD-4). Rendered only while open,
          and reachable only from a trigger that is `display: none` above 640px,
          so nothing of it exists in the desktop DOM. It reuses `SlideOver`'s
          full-screen mobile mode (15.2). */}
      {filterDraft !== null ? (
        <SlideOver
          open
          title={labels.mobile.filtersTitle}
          onClose={dismissFilterPanel}
          closeLabel={labels.mobile.close}
          footer={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFilterDraft(null);
                  handleReset();
                }}
                data-testid="mobile-scadenze-filter-reset"
              >
                {labels.filters.reset}
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn primary" onClick={applyFilterDraft} data-testid="mobile-scadenze-filters-apply">
                {labels.mobile.apply}
              </button>
            </>
          }
        >
          <div className="scadenze-filter-panel" data-testid="mobile-scadenze-filter-panel">
            <div className="fld">
              <label className="fld-label" htmlFor="scadenze-filter-type-mobile">
                {labels.table.type}
              </label>
              <select
                id="scadenze-filter-type-mobile"
                className="input"
                value={filterDraft.expiryTypeId}
                onChange={(event) => setFilterDraft({ ...filterDraft, expiryTypeId: event.target.value })}
                data-testid="scadenze-filter-type-mobile"
              >
                <option value="">{labels.filters.allTypes}</option>
                {typeOptions.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SlideOver>
      ) : null}

      {/* The row-detail sheet (AD-7: rendered conditionally, so
          `mobile-scadenze-sheet` is ONE node). Its single action is the one
          thing the desktop row OPENS — the scheda persona. */}
      {sheetItem ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-scadenze-sheet"
          sub={expirySheetSub({ category: categoryOf(sheetItem.typeName), typeName: sheetItem.typeName })}
          title={`${sheetItem.personLastName} ${sheetItem.personFirstName}`}
          badge={
            <Badge tone={TIER_TONE[tierOf(sheetItem.daysUntil)]} dot>
              {statusLabelOf(tierOf(sheetItem.daysUntil))}
            </Badge>
          }
          rows={sheetRows(sheetItem)}
          closeLabel={labels.mobile.close}
          actions={
            <Link
              href={`/dashboard/people/${sheetItem.personId}`}
              locale={locale as AppLocale}
              className="btn primary"
              onClick={closeSheet}
              data-testid="mobile-scadenze-person-link"
            >
              {labels.mobile.openPerson}
            </Link>
          }
        />
      ) : null}
    </>
  );
}

type StatCardProps = { label: string; value: number; ink: string; note: string; testId: string };

function StatCard({ label, value, ink, note, testId }: StatCardProps) {
  return (
    <div className="kpi" style={{ borderLeft: `3px solid ${ink}` }} data-testid={testId}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num" style={{ color: ink }}>
        {value}
      </div>
      <div className="kpi-delta">
        <span>{note}</span>
      </div>
    </div>
  );
}

type MembershipFeeModalProps = {
  personOptions: SearchComboboxOption[];
  defaultAmountCents: number;
  moneyLocale: 'it' | 'en';
  labels: ScadenzeConsoleLabels['membershipFee'];
  /** ADMIN-only (review F3): same `settings.manage` gate as `canTriggerReminders` — shows the "Forza addebito" override checkbox. */
  canOverride: boolean;
  onClose: () => void;
  onCharged: () => void;
};

/**
 * "Quota associativa" action (story 12.11, AC 7; ratifiche utente 1/1a/1b)
 * — a person picker + amount (precompiled from `membership.annualFeeCents`,
 * editable) firing `POST /api/v1/people/{id}/membership-fee`
 * (`Idempotency-Key` mandatory). Feedback shows the new balance and expiry.
 *
 * PO decision (2026-07-17, review F3): an addebito that would take the
 * balance below zero is refused (422 `MEMBERSHIP_FEE_INSUFFICIENT_BALANCE`)
 * unless an ADMIN checks "Forza addebito" (`canOverride`, unchecked by
 * default — a deliberate action, never the default path).
 *
 * Story 15.7 (ratifica R-15.7-g): on a phone the SAME node becomes a
 * full-screen panel (title on top, action row pinned to the bottom), because
 * at 375px this modal measured 335x385 with a 35px submit and a 13x13
 * checkbox. It is a CSS mode of the one node, not a second tree: a second
 * tree would duplicate `membership-fee-panel`, `membership-fee-submit`, the
 * combobox's DOM `id` and its network path — all four read PAGE-LEVEL by
 * `membership-fee.spec.ts`. Same reasoning `SlideOver`'s own full-screen mode
 * records (15.2): one CSS mode of one component.
 */
/** `null` = not a positive money amount (review 14.2 F3.4 — drives the amount field's own marker, same parse the submit uses). */
function parseAmountCents(value: string): number | null {
  try {
    const cents = parseCents(value);
    return cents > 0 ? cents : null;
  } catch {
    return null;
  }
}

function MembershipFeeModal({ personOptions, defaultAmountCents, moneyLocale, labels, canOverride, onClose, onCharged }: MembershipFeeModalProps) {
  const [personId, setPersonId] = useState('');
  const [amount, setAmount] = useState(() => (defaultAmountCents / 100).toFixed(2));
  const [override, setOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ balanceCents: number; expiresAt: string } | null>(null);
  // Review 14.2 F3.4 — per-field markers instead of one shared bottom string:
  // both errors are DERIVED from submitAttempted + current value (clear on
  // correction is automatic), the `error` banner stays for SERVER failures only.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const pilotMissing = submitAttempted && !personId;
  const amountInvalid = submitAttempted && parseAmountCents(amount) === null;

  async function submit(): Promise<void> {
    setError(null);
    setSubmitAttempted(true);
    const parsedAmount = parseAmountCents(amount);
    if (!personId || parsedAmount === null) return;

    setSubmitting(true);
    const response = await fetch(`/api/v1/people/${personId}/membership-fee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomIdempotencyKey() },
      body: JSON.stringify({ amountCents: parsedAmount, override }),
    });
    setSubmitting(false);

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { error?: { code?: string; details?: { balanceCents?: number; amountCents?: number } } } | null;
      if (errorBody?.error?.code === 'MEMBERSHIP_FEE_INSUFFICIENT_BALANCE') {
        const details = errorBody.error.details;
        setError(
          labels.insufficientBalance
            .replace('{balance}', formatCents(details?.balanceCents ?? 0, moneyLocale))
            .replace('{amount}', formatCents(details?.amountCents ?? 0, moneyLocale)),
        );
      } else {
        setError(labels.genericError);
      }
      return;
    }
    const body = (await response.json()) as { balanceCents: number; expiresAt: string };
    setResult(body);
    onCharged();
  }

  return (
    <div className="mini-modal membership-fee-modal">
      <div className="mini-modal-card" data-testid="membership-fee-panel">
        <div className="so-title" style={{ fontSize: 16 }}>
          {labels.modalTitle}
        </div>

        {result ? (
          <p role="status" data-testid="membership-fee-success" style={{ marginTop: 10, fontSize: 13, color: 'var(--ok)' }}>
            {labels.success.replace('{balance}', formatCents(result.balanceCents, moneyLocale)).replace('{expires}', formatDateOnly(result.expiresAt, moneyLocale))}
          </p>
        ) : (
          <>
            <label className="fld-label" style={{ display: 'block', marginTop: 10 }}>
              {labels.pilot}
            </label>
            <SearchCombobox
              id="membership-fee-person"
              label={labels.pilot}
              value={personId}
              onChange={setPersonId}
              fetchOptions={searchPersonFilter}
              initialOptions={personOptions.filter((option) => option.id !== '')}
              placeholder=""
              emptyText=""
              error={pilotMissing ? labels.requiredPilot : undefined}
            />
            <label htmlFor="membership-fee-amount" className="fld-label" style={{ display: 'block', marginTop: 10 }}>
              {labels.amount}
            </label>
            <input
              id="membership-fee-amount"
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={amountInvalid || undefined}
              aria-describedby={amountInvalid ? 'membership-fee-amount-error' : undefined}
              data-testid="membership-fee-amount"
            />
            {amountInvalid ? (
              <p id="membership-fee-amount-error" role="alert" className="fld-error">
                {labels.invalidAmount}
              </p>
            ) : null}
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>{labels.amountHint}</p>
            {canOverride ? (
              <label className="fld-label membership-fee-override-label">
                <input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} data-testid="membership-fee-override-checkbox" />
                {labels.overrideCheckbox}
              </label>
            ) : null}
          </>
        )}

        {error ? (
          <p role="alert" data-testid="membership-fee-error" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--bad)' }}>
            {error}
          </p>
        ) : null}

        {/* The inline `display:flex` this row used to carry moved into
            `.membership-fee-actions` (identical computed style above 640px,
            measured): an inline `display` cannot be overridden by a media
            query, and the phone panel pins this row to the bottom. */}
        <div className="membership-fee-actions">
          <button type="button" className="btn" onClick={onClose}>
            {labels.cancel}
          </button>
          {!result ? (
            <button type="button" className="btn primary" disabled={submitting} onClick={() => void submit()} data-testid="membership-fee-submit">
              {labels.submit}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
