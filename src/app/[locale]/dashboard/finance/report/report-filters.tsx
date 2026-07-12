'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { currentMonthRange, currentQuarterRange, currentYearRange, type DateRange } from '@/lib/period-presets';
import { DatePicker, type DatePickerLabels } from '@/components/ui/date-picker';

export type ReportFiltersLabels = {
  month: string;
  quarter: string;
  year: string;
  custom: string;
  from: string;
  to: string;
  /** Story 12.5 (AC 1) — shared `DatePicker` a11y/error strings. */
  datePicker: DatePickerLabels;
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
    'rounded-buttons border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas';

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
        <legend className="mb-2 w-full text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">{labels.custom}</legend>
        {/* `<label htmlFor>` as a SIBLING of its control, never wrapping it
            (TD-1, AC 5 label-wrapper sweep — same footgun as `CashRegister`'s
            filter bar, story 5.4's `FilterBar`). */}
        <DatePicker
          id="cash-report-filter-from"
          label={labels.from}
          value={range.from}
          onChange={(next) => navigate({ ...range, from: next })}
          labels={labels.datePicker}
          testId="cash-report-filter-from"
          className="min-w-[160px]"
        />
        <DatePicker
          id="cash-report-filter-to"
          label={labels.to}
          value={range.to}
          onChange={(next) => navigate({ ...range, to: next })}
          labels={labels.datePicker}
          testId="cash-report-filter-to"
          className="min-w-[160px]"
        />
      </fieldset>
    </div>
  );
}
