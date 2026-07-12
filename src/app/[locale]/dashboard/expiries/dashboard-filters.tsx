'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { ExpiryScopeDto } from '@/lib/schemas/expiry-types';
import type { ExpiryStatusDto } from '@/lib/schemas/expiries';
import { inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';

export type ExpiryDashboardFiltersValue = {
  expiryTypeId: string;
  scope: '' | ExpiryScopeDto;
  status: '' | ExpiryStatusDto;
};

export type ExpiryTypeFilterOption = { id: string; name: string; isActive: boolean };

const SCOPE_VALUES: ExpiryScopeDto[] = ['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL'];
const STATUS_VALUES: ExpiryStatusDto[] = ['expired', 'expiring', 'ok'];

export type ExpiryDashboardFiltersLabels = {
  type: string;
  allTypes: string;
  inactiveSuffix: string;
  scope: string;
  allScopes: string;
  scopeOptions: Record<ExpiryScopeDto, string>;
  status: string;
  allStatuses: string;
  statusOptions: Record<ExpiryStatusDto, string>;
  reset: string;
};

type ExpiryDashboardFiltersProps = {
  types: ExpiryTypeFilterOption[];
  initialFilters: ExpiryDashboardFiltersValue;
  labels: ExpiryDashboardFiltersLabels;
};

/**
 * Filter bar for the staff "Tutte le scadenze" table (story 6.4, AC 1) —
 * same immediate-navigate pattern as `CashRegister`/`FlightsManager`'s own
 * filter bars: every change pushes a fresh URL (dropping `dashboardPage`,
 * story 6.4 Contesto — any filter change resets that section's own
 * pagination to page 1) and the parent server page re-queries
 * `listAllExpiries` from the new `searchParams`. `types` includes inactive
 * ones (Contesto: "tutti i tipi includeInactive per lo storico" — a
 * scadenza registered against a since-deactivated type must stay
 * filterable).
 */
export function ExpiryDashboardFilters({ types, initialFilters, labels }: ExpiryDashboardFiltersProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<ExpiryDashboardFiltersValue>(initialFilters);

  function navigate(next: ExpiryDashboardFiltersValue): void {
    const params = new URLSearchParams();
    if (next.expiryTypeId) params.set('expiryTypeId', next.expiryTypeId);
    if (next.scope) params.set('scope', next.scope);
    if (next.status) params.set('status', next.status);
    const search = params.toString();
    router.push(`/dashboard/expiries${search ? `?${search}` : ''}`);
  }

  function handleChange(patch: Partial<ExpiryDashboardFiltersValue>): void {
    const next = { ...filters, ...patch };
    setFilters(next);
    navigate(next);
  }

  function handleReset(): void {
    const cleared: ExpiryDashboardFiltersValue = { expiryTypeId: '', scope: '', status: '' };
    setFilters(cleared);
    navigate(cleared);
  }

  const hasActiveFilter = filters.expiryTypeId !== '' || filters.scope !== '' || filters.status !== '';
  const inputClasses = cn(inputBaseClasses, 'mt-2 min-h-[40px]');

  return (
    <div className="flex flex-wrap items-end gap-4" data-testid="expiry-dashboard-filters">
      {/* `<label htmlFor>` as a sibling of its control, never wrapping it — same footgun fix as `flights-manager.tsx`'s `FilterBar` (a wrapping label folds every dynamic option's text into its accessible name). */}
      <div className="flex flex-col text-sm text-ink">
        <label htmlFor="expiry-dashboard-filter-type">{labels.type}</label>
        <select
          id="expiry-dashboard-filter-type"
          value={filters.expiryTypeId}
          onChange={(event) => handleChange({ expiryTypeId: event.target.value })}
          className={inputClasses}
          data-testid="expiry-dashboard-filter-type"
        >
          <option value="">{labels.allTypes}</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
              {type.isActive ? '' : labels.inactiveSuffix}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col text-sm text-ink">
        <label htmlFor="expiry-dashboard-filter-scope">{labels.scope}</label>
        <select
          id="expiry-dashboard-filter-scope"
          value={filters.scope}
          onChange={(event) => handleChange({ scope: event.target.value as ExpiryDashboardFiltersValue['scope'] })}
          className={inputClasses}
          data-testid="expiry-dashboard-filter-scope"
        >
          <option value="">{labels.allScopes}</option>
          {SCOPE_VALUES.map((scope) => (
            <option key={scope} value={scope}>
              {labels.scopeOptions[scope]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col text-sm text-ink">
        <label htmlFor="expiry-dashboard-filter-status">{labels.status}</label>
        <select
          id="expiry-dashboard-filter-status"
          value={filters.status}
          onChange={(event) => handleChange({ status: event.target.value as ExpiryDashboardFiltersValue['status'] })}
          className={inputClasses}
          data-testid="expiry-dashboard-filter-status"
        >
          <option value="">{labels.allStatuses}</option>
          {STATUS_VALUES.map((status) => (
            <option key={status} value={status}>
              {labels.statusOptions[status]}
            </option>
          ))}
        </select>
      </div>
      {hasActiveFilter ? (
        <button
          type="button"
          onClick={handleReset}
          data-testid="expiry-dashboard-filter-reset"
          className="min-h-[40px] rounded-buttons border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
        >
          {labels.reset}
        </button>
      ) : null}
    </div>
  );
}
