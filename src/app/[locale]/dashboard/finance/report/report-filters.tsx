'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { currentMonthRange, currentQuarterRange, currentYearRange, type DateRange } from '@/lib/period-presets';

export type ReportFiltersLabels = {
  month: string;
  quarter: string;
  year: string;
  custom: string;
  from: string;
  to: string;
};

type ReportFiltersProps = {
  initialFilters: DateRange;
  labels: ReportFiltersLabels;
};

/**
 * Period selector for the financial report (story 3.5, Task 2, AC 1) —
 * three preset buttons (mese/trimestre/anno correnti, computed client-side
 * in Europe/Rome via `period-presets.ts`) plus two always-editable date
 * inputs for a free interval. Any change pushes `from`/`to` into the URL
 * (pattern of `CashRegister`'s filters, story 3.4) — the server component
 * re-fetches the report for the new period. The service NEVER sees calendar
 * logic (Dev Notes): only the resulting explicit `from`/`to` strings.
 */
export function ReportFilters({ initialFilters, labels }: ReportFiltersProps) {
  const router = useRouter();
  const [range, setRange] = useState<DateRange>(initialFilters);

  function navigate(next: DateRange): void {
    setRange(next);
    const params = new URLSearchParams({ from: next.from, to: next.to });
    router.push(`/dashboard/finance/report?${params.toString()}`);
  }

  const presetButtonClasses =
    'rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]';
  const inputClasses =
    'rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] outline-none transition-colors focus:border-[#2F3437]';

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-wrap gap-3">
        <button type="button" className={presetButtonClasses} data-testid="cash-report-preset-month" onClick={() => navigate(currentMonthRange())}>
          {labels.month}
        </button>
        <button
          type="button"
          className={presetButtonClasses}
          data-testid="cash-report-preset-quarter"
          onClick={() => navigate(currentQuarterRange())}
        >
          {labels.quarter}
        </button>
        <button type="button" className={presetButtonClasses} data-testid="cash-report-preset-year" onClick={() => navigate(currentYearRange())}>
          {labels.year}
        </button>
      </div>
      <fieldset className="flex flex-wrap items-end gap-4 border-0 p-0">
        <legend className="mb-2 w-full text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.custom}</legend>
        <label className="flex flex-col gap-2 text-sm text-[#2F3437]">
          {labels.from}
          <input
            type="date"
            value={range.from}
            onChange={(event) => navigate({ ...range, from: event.target.value })}
            className={inputClasses}
            data-testid="cash-report-filter-from"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-[#2F3437]">
          {labels.to}
          <input
            type="date"
            value={range.to}
            onChange={(event) => navigate({ ...range, to: event.target.value })}
            className={inputClasses}
            data-testid="cash-report-filter-to"
          />
        </label>
      </fieldset>
    </div>
  );
}
