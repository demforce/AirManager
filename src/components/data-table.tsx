'use client';

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';

/**
 * Reusable table shell (story 2.1's first adoption of `@tanstack/react-table`
 * — the story's Dev Notes ask for a component the *next* stories reuse,
 * rather than a one-off table hand-rolled inside `people-manager.tsx`).
 *
 * Deliberately thin: only `getCoreRowModel` (rendering) is wired up here.
 * Sorting/filtering/server pagination stay in each page's own server-side
 * query (search/page are URL-driven, per the story) — a future story can
 * extend this component with `getSortedRowModel`/`getFilteredRowModel`
 * without touching call sites, since only `columns`/`data` are required.
 *
 * `TData extends { id: string }` lets every domain list (people today,
 * aircraft/bookings/etc. later) reuse this without re-deriving a row key —
 * TanStack Table's default index-based row id would otherwise churn on
 * every server-side search/page change.
 */
export type DataTableProps<TData extends { id: string }> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Rendered as a single spanning row when `data` is empty. */
  emptyMessage: string;
};

/**
 * Free-text cell helper (story 12.5, AC 3 — censimento §6: nomi, email,
 * descrizioni, note) — `max-w-*` + `truncate` + a native `title` tooltip,
 * the SAME pattern the flight registry established (`flights-manager.tsx`'s
 * `FlightRow`) for hand-rolled tables, offered here as a one-liner for
 * `DataTable` column `cell` renderers so every free-text column truncates
 * consistently instead of ballooning the fixed row height below.
 */
export function TruncatedCell({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('block truncate', className ?? 'max-w-[240px]')} title={value}>
      {value}
    </span>
  );
}

export function DataTable<TData extends { id: string }>({ columns, data, emptyMessage }: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              className="border-b border-hairline text-xs font-medium uppercase tracking-[0.05em] text-mid-gray"
            >
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="px-5 py-3">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-8 text-center text-mid-gray">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="h-11 border-b border-hairline last:border-b-0">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-5 py-2 align-middle text-ink">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}
