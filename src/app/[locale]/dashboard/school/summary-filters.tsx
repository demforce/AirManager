'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { currentMonthRange, currentQuarterRange, currentYearRange, type DateRange } from '@/lib/period-presets';
import { DatePicker, type DatePickerLabels } from '@/components/ui/date-picker';

export type SummaryFiltersLabels = {
  month: string;
  quarter: string;
  year: string;
  custom: string;
  from: string;
  to: string;
  /** Story 12.5 (AC 1) — shared `DatePicker` a11y/error strings. */
  datePicker: DatePickerLabels;
};

type SummaryFiltersProps = {
  initialFilters: DateRange;
  labels: SummaryFiltersLabels;
};

/**
 * Period selector for the school hour summaries (story 9.3, AC 1/2/3) — the
 * EXACT pattern of `finance/report/report-filters.tsx#ReportFilters` (Dev
 * Notes: "riuso ESATTO del pattern"), retargeted at `/dashboard/school`.
 * Drives BOTH the gestore's Riepiloghi tables and the instructor's "Le mie
 * ore scuola" card — a single shared period for the whole page.
 */
export function SummaryFilters({ initialFilters, labels }: SummaryFiltersProps) {
  const router = useRouter();
  const [range, setRange] = useState<DateRange>(initialFilters);

  function navigate(next: DateRange): void {
    setRange(next);
    const params = new URLSearchParams({ from: next.from, to: next.to });
    router.push(`/dashboard/school?${params.toString()}`);
  }

  const presetButtonClasses =
    'rounded-buttons border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas';

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={presetButtonClasses}
          data-testid="school-summary-preset-month"
          onClick={() => navigate(currentMonthRange())}
        >
          {labels.month}
        </button>
        <button
          type="button"
          className={presetButtonClasses}
          data-testid="school-summary-preset-quarter"
          onClick={() => navigate(currentQuarterRange())}
        >
          {labels.quarter}
        </button>
        <button
          type="button"
          className={presetButtonClasses}
          data-testid="school-summary-preset-year"
          onClick={() => navigate(currentYearRange())}
        >
          {labels.year}
        </button>
      </div>
      <fieldset className="flex flex-wrap items-end gap-4 border-0 p-0">
        {/* `<label htmlFor>` as a SIBLING of its control, never wrapping it (TD-1, AC 5). */}
        <legend className="mb-2 w-full text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">{labels.custom}</legend>
        <DatePicker
          id="school-summary-filter-from"
          label={labels.from}
          value={range.from}
          onChange={(next) => navigate({ ...range, from: next })}
          labels={labels.datePicker}
          testId="school-summary-filter-from"
          className="min-w-[160px]"
        />
        <DatePicker
          id="school-summary-filter-to"
          label={labels.to}
          value={range.to}
          onChange={(next) => navigate({ ...range, to: next })}
          labels={labels.datePicker}
          testId="school-summary-filter-to"
          className="min-w-[160px]"
        />
      </fieldset>
    </div>
  );
}
