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
 */
import { useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ExportMenu } from '@/components/ui/export-menu';
import { Icon } from '@/components/ui/icons';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { categoryOf, tierOf } from '@/lib/expiry-status';
import { formatCents, parseCents } from '@/lib/money';
import { randomIdempotencyKey } from '@/lib/use-idempotency-key';
import type { ExpiryDashboardItemDto, ExpiryWindowDto } from '@/lib/schemas/expiries';
import { SearchCombobox, type SearchComboboxOption } from '@/components/search-combobox';
import { formatDateOnly } from '@/lib/time';

type PersonOption = { id: string; firstName: string; lastName: string };
type TypeOption = { id: string; name: string };
type Category = 'Medico' | 'Licenza' | 'Abilitazione';

export type ScadenzeFilters = { window: ExpiryWindowDto | 'all'; expiryTypeId: string; personId: string };

export type ScadenzeConsoleLabels = {
  cardTitle: string;
  shown: string;
  segmented: { win60: string; win30: string; win7: string; expired: string; all: string };
  filters: { allTypes: string; allPilots: string; reset: string; picker: { placeholder: string; noResults: string } };
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
    invalidAmount: string;
    success: string;
    genericError: string;
    insufficientBalance: string;
    overrideCheckbox: string;
  };
  pagination: { prev: string; next: string };
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
  const [filters, setFilters] = useState(initialFilters);
  const [remindersSending, setRemindersSending] = useState(false);
  const [remindersFeedback, setRemindersFeedback] = useState<string | null>(null);
  const [feeModalOpen, setFeeModalOpen] = useState(false);

  function buildQuery(next: ScadenzeFilters): Record<string, string> {
    const query: Record<string, string> = {};
    if (next.window !== '60') query['window'] = next.window;
    if (next.expiryTypeId) query['expiryTypeId'] = next.expiryTypeId;
    if (next.personId) query['personId'] = next.personId;
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

  function pageHref(targetPage: number) {
    return { pathname: '/dashboard/expiries' as const, query: { page: targetPage, ...buildQuery(filters) } };
  }

  async function sendReminders(): Promise<void> {
    setRemindersSending(true);
    setRemindersFeedback(null);
    const response = await fetch('/api/v1/expiry-alerts/trigger', { method: 'POST' });
    setRemindersSending(false);
    if (!response.ok) {
      setRemindersFeedback(labels.reminders.error);
      return;
    }
    const body = (await response.json()) as { holderEmailsSent: number; digestEmailsSent: number };
    setRemindersFeedback(labels.reminders.sent.replace('{holders}', String(body.holderEmailsSent)).replace('{digests}', String(body.digestEmailsSent)));
    router.refresh();
  }

  const personComboOptions: SearchComboboxOption[] = [
    { id: '', label: labels.filters.allPilots },
    ...personOptions.map((person) => ({ id: person.id, label: personLabel(person) })),
  ];

  return (
    <>
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <StatCard label={labels.statCards.expired} value={tierCounts.expired} ink="var(--bad)" note={labels.statCards.expiredNote} testId="scadenze-stat-expired" />
        <StatCard label={labels.statCards.within7} value={tierCounts.within7} ink="var(--bad)" note={labels.statCards.within7Note} testId="scadenze-stat-within7" />
        <StatCard label={labels.statCards.within30} value={tierCounts.within30} ink="var(--accent-ink)" note={labels.statCards.within30Note} testId="scadenze-stat-within30" />
        <StatCard label={labels.statCards.within60} value={tierCounts.within60} ink="var(--info)" note={labels.statCards.within60Note} testId="scadenze-stat-within60" />
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">{labels.cardTitle}</div>
          <span className="card-sub">{labels.shown.replace('{count}', String(totalShown))}</span>
          <div className="spacer" />
          <div className="segmented">
            {(['60', '30', '7', 'expired', 'all'] as const).map((value) => (
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
            className="input"
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
          <div style={{ width: 190 }}>
            <SearchCombobox
              id="scadenze-filter-pilot"
              label={labels.filters.allPilots}
              value={filters.personId}
              onChange={(id) => handleFilterChange({ personId: id })}
              fetchOptions={searchPersonFilter}
              initialOptions={personComboOptions}
              placeholder={labels.filters.picker.placeholder}
              emptyText={labels.filters.picker.noResults}
            />
          </div>
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
          <p role="status" data-testid="scadenze-reminders-feedback" style={{ padding: '0 20px 12px', fontSize: 12.5, color: 'var(--ok)' }}>
            {remindersFeedback}
          </p>
        ) : null}

        <div className="students">
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
              const statusLabel =
                tier === 0 ? labels.status.expired : tier === 1 ? labels.status.within7 : tier === 2 ? labels.status.within30 : tier === 3 ? labels.status.within60 : labels.status.ok;
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
                    {item.daysUntil < 0 ? `${Math.abs(item.daysUntil)}${labels.daysAgoSuffix}` : `${item.daysUntil}${labels.daysSuffix}`}
                  </div>
                  <div data-testid="scadenze-status-badge">
                    <Badge tone={TIER_TONE[tier]} dot>
                      {statusLabel}
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {totalPages > 1 ? (
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              className={`btn ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
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
              className={`btn ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
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
 */
function MembershipFeeModal({ personOptions, defaultAmountCents, moneyLocale, labels, canOverride, onClose, onCharged }: MembershipFeeModalProps) {
  const [personId, setPersonId] = useState('');
  const [amount, setAmount] = useState(() => (defaultAmountCents / 100).toFixed(2));
  const [override, setOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ balanceCents: number; expiresAt: string } | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    if (!personId) {
      setError(labels.invalidAmount);
      return;
    }
    let parsedAmount: number | null;
    try {
      parsedAmount = parseCents(amount);
    } catch {
      parsedAmount = null;
    }
    if (parsedAmount === null || parsedAmount <= 0) {
      setError(labels.invalidAmount);
      return;
    }

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
    <div className="mini-modal">
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
            />
            <label htmlFor="membership-fee-amount" className="fld-label" style={{ display: 'block', marginTop: 10 }}>
              {labels.amount}
            </label>
            <input id="membership-fee-amount" className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} data-testid="membership-fee-amount" />
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>{labels.amountHint}</p>
            {canOverride ? (
              <label className="fld-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontWeight: 400 }}>
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

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
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
