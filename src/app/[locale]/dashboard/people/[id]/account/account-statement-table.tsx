'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { formatSignedCents } from '@/lib/money';
import type { AccountMovementTypeDto } from '@/lib/schemas/accounts';

export type AccountStatementRow = {
  id: string;
  type: AccountMovementTypeDto;
  amountCents: number;
  effectiveDate: string;
  description: string | null;
  actorEmail?: string;
};

export type AccountStatementTableLabels = {
  date: string;
  type: string;
  description: string;
  amount: string;
  recordedBy: string;
  noValue: string;
  empty: string;
  movementType: { topUp: string };
};

type AccountStatementTableProps = {
  rows: AccountStatementRow[];
  /** Whether to render the "registrato da" column (AC 2, `people.read` only) — the service already omits `actorEmail` for anyone without it (AD-5). */
  showActor: boolean;
  moneyLocale: 'it' | 'en';
  labels: AccountStatementTableLabels;
};

function movementTypeLabel(type: AccountMovementTypeDto, labels: AccountStatementTableLabels['movementType']): string {
  switch (type) {
    case 'TOP_UP':
      return labels.topUp;
    default:
      return type;
  }
}

/**
 * The account statement table (story 3.2, Task 2): a client component so
 * `ColumnDef`'s function-valued `cell`/`header` fields never cross the
 * server/client boundary as props (Next.js RSC forbids serializing
 * functions into a Client Component) — same reason `PeopleManager` builds
 * its own `columns` locally instead of receiving them from the server page.
 */
export function AccountStatementTable({ rows, showActor, moneyLocale, labels }: AccountStatementTableProps) {
  const columns: ColumnDef<AccountStatementRow, unknown>[] = [
    {
      id: 'date',
      header: labels.date,
      cell: ({ row }) => row.original.effectiveDate,
    },
    {
      id: 'type',
      header: labels.type,
      cell: ({ row }) => movementTypeLabel(row.original.type, labels.movementType),
    },
    {
      id: 'description',
      header: labels.description,
      cell: ({ row }) => row.original.description ?? labels.noValue,
    },
    {
      id: 'amount',
      header: labels.amount,
      cell: ({ row }) => (
        <span className={row.original.amountCents >= 0 ? 'text-[#346538]' : 'text-[#9F2F2D]'}>
          {formatSignedCents(row.original.amountCents, moneyLocale)}
        </span>
      ),
    },
    ...(showActor
      ? ([
          {
            id: 'actor',
            header: labels.recordedBy,
            cell: ({ row }) => row.original.actorEmail ?? labels.noValue,
          },
        ] as ColumnDef<AccountStatementRow, unknown>[])
      : []),
  ];

  return <DataTable columns={columns} data={rows} emptyMessage={labels.empty} />;
}
