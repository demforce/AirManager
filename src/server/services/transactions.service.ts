import type { AccountMovementType } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import { currentMonthRange, previousMonthRange } from '@/lib/period-presets';
import type { BillingKpisDto, ListTransactionsQuery, RecordTransactionInput, TransactionRowDto } from '@/lib/schemas/transactions';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { recordAdjustment, recordTopUp, type AccountOverview } from './accounts.service';
import { recordCashMovement, type CashMovementListItem } from './cash.service';

/**
 * Unified billing ledger — `AccountMovement` ∪ `CashMovement` reader (epic
 * 12, story 12.9, AC 1). Two public entry points, `listTransactions` and
 * `getBillingKpis`, share the SAME where-builders (`buildAccountWhere`/
 * `buildCashWhere`) and the SAME row-normalization (`toAccountRow`/
 * `toCashRow`) — the lesson from 12.8's `getFlightTotals`: a list and its
 * aggregate reader must never be able to drift on scope/normalization.
 * `recordTransaction` is a pure dispatcher onto the three PRE-EXISTING
 * writers (`recordTopUp`/`recordAdjustment`/`recordCashMovement`), which
 * keep authorizing themselves (`finance.manage`) — nothing here re-checks it.
 */

/** Internal row shape carrying the `createdAt` sort tie-break — stripped before the DTO leaves this module. */
type InternalRow = TransactionRowDto & { createdAt: Date };

type LedgerFilters = {
  from?: string;
  to?: string;
  personId?: string;
  movementType?: AccountMovementType;
  categoryId?: string;
  direction?: 'charge' | 'payment';
};

const ACCOUNT_ROW_SELECT = {
  id: true,
  type: true,
  amountCents: true,
  paymentMethod: true,
  description: true,
  effectiveDate: true,
  createdAt: true,
  flightId: true,
  reversalOfId: true,
  reversal: { select: { id: true } },
  cashMovement: { select: { id: true } },
  account: { select: { personId: true, person: { select: { firstName: true, lastName: true } } } },
} as const;

type SelectedAccountRow = Prisma.AccountMovementGetPayload<{ select: typeof ACCOUNT_ROW_SELECT }>;

const CASH_ROW_SELECT = {
  id: true,
  amountCents: true,
  description: true,
  effectiveDate: true,
  createdAt: true,
  reversalOfId: true,
  reversal: { select: { id: true } },
  accountMovementId: true,
  category: { select: { name: true } },
  accountMovement: { select: { amountCents: true, account: { select: { personId: true, person: { select: { firstName: true, lastName: true } } } } } },
  pprRequest: { select: { pprNumber: true } },
} as const;

type SelectedCashRow = Prisma.CashMovementGetPayload<{ select: typeof CASH_ROW_SELECT }>;

/**
 * Twin-dedup rule (AC 1, "un evento economico = UNA riga"): an `AccountMovement`
 * with amount 0 (today only `PACKAGE_PURCHASE`) carries no value — it is
 * hidden here so its `CashMovement` twin (the real value) is the sole
 * surviving row. A twin whose `AccountMovement` amount IS non-zero (today
 * only `TOP_UP`) stays the visible side; its twin is hidden in
 * `buildCashWhere` below.
 */
function buildAccountWhere(filters: LedgerFilters): Prisma.AccountMovementWhereInput {
  const and: Prisma.AccountMovementWhereInput[] = [{ NOT: { AND: [{ amountCents: 0 }, { cashMovement: { isNot: null } }] } }];
  if (filters.from) and.push({ effectiveDate: { gte: parseDateOnlyUtc(filters.from) } });
  if (filters.to) and.push({ effectiveDate: { lte: parseDateOnlyUtc(filters.to) } });
  if (filters.personId) and.push({ account: { personId: filters.personId } });
  if (filters.movementType) and.push({ type: filters.movementType });
  if (filters.direction === 'charge') and.push({ amountCents: { lt: 0 } });
  if (filters.direction === 'payment') and.push({ amountCents: { gt: 0 } });
  return { AND: and };
}

/** The other half of the twin-dedup rule above — hides a twin whose linked `AccountMovement` carries the real (non-zero) value. */
function buildCashWhere(filters: LedgerFilters): Prisma.CashMovementWhereInput {
  const and: Prisma.CashMovementWhereInput[] = [{ NOT: { AND: [{ accountMovementId: { not: null } }, { accountMovement: { amountCents: { not: 0 } } }] } }];
  if (filters.from) and.push({ effectiveDate: { gte: parseDateOnlyUtc(filters.from) } });
  if (filters.to) and.push({ effectiveDate: { lte: parseDateOnlyUtc(filters.to) } });
  if (filters.personId) and.push({ accountMovement: { account: { personId: filters.personId } } });
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.direction === 'charge') and.push({ amountCents: { gt: 0 } });
  if (filters.direction === 'payment') and.push({ amountCents: { lt: 0 } });
  return { AND: and };
}

/**
 * Normalizes an `AccountMovement` to the club-centric ledger row (ratifica
 * utente 1): the raw `amountCents` is FLIPPED (TOP_UP > 0 in the DB becomes
 * a negative "payment received" row; FLIGHT_CHARGE < 0 becomes a positive
 * "addebito" row). Actionable (AC 3) only for a manual `TOP_UP`/`ADJUSTMENT`
 * not already reversed — every derived type (`PACKAGE_PURCHASE`,
 * `FLIGHT_CHARGE`, `FLIGHT_CHARGE_REVERSAL`) never is.
 */
function toAccountRow(row: SelectedAccountRow): InternalRow {
  return {
    id: row.id,
    source: 'ACCOUNT',
    date: toDateOnlyString(row.effectiveDate),
    createdAt: row.createdAt,
    personId: row.account.personId,
    personName: `${row.account.person.lastName} ${row.account.person.firstName}`,
    kind: row.type,
    description: row.description,
    amountCents: -row.amountCents,
    method: row.paymentMethod,
    reference: row.flightId,
    reversal: row.reversalOfId !== null,
    reversed: row.reversal !== null,
    actionable: (row.type === 'TOP_UP' || row.type === 'ADJUSTMENT') && row.reversal === null,
  };
}

/**
 * Normalizes a `CashMovement` — already club-centric as-is (entrata > 0, no
 * flip). `personId`/`personName` are derived through the linked
 * `accountMovement.account.person` ONLY when this row is a VISIBLE twin
 * (`PACKAGE_PURCHASE`) — a manual/PPR entry has no person. Actionable (AC 3,
 * parity with the legacy cash register's own rule): manual (no twin), not
 * itself a storno, not already reversed — `pprRequestId` is irrelevant
 * (`reverseCashMovement` never checks it).
 */
function toCashRow(row: SelectedCashRow): InternalRow {
  return {
    id: row.id,
    source: 'CASH',
    date: toDateOnlyString(row.effectiveDate),
    createdAt: row.createdAt,
    personId: row.accountMovement?.account.personId ?? null,
    personName: row.accountMovement ? `${row.accountMovement.account.person.lastName} ${row.accountMovement.account.person.firstName}` : null,
    kind: row.category.name,
    description: row.description,
    amountCents: row.amountCents,
    method: null,
    reference: row.pprRequest?.pprNumber ?? null,
    reversal: row.reversalOfId !== null,
    reversed: row.reversal !== null,
    actionable: row.accountMovementId === null && row.reversalOfId === null && row.reversal === null,
  };
}

/** `categoryId` narrows to CASH only (AC 1's XOR) — the account side has no category, so it is skipped entirely rather than querying for zero rows. */
async function fetchAccountRows(filters: LedgerFilters, take?: number): Promise<InternalRow[]> {
  if (filters.categoryId) return [];
  const rows = await prisma.accountMovement.findMany({
    where: buildAccountWhere(filters),
    select: ACCOUNT_ROW_SELECT,
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    ...(take !== undefined ? { take } : {}),
  });
  return rows.map(toAccountRow);
}

/** `movementType` narrows to ACCOUNT only (AC 1's XOR) — same skip rationale as `fetchAccountRows`. */
async function fetchCashRows(filters: LedgerFilters, take?: number): Promise<InternalRow[]> {
  if (filters.movementType) return [];
  const rows = await prisma.cashMovement.findMany({
    where: buildCashWhere(filters),
    select: CASH_ROW_SELECT,
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    ...(take !== undefined ? { take } : {}),
  });
  return rows.map(toCashRow);
}

/** `effectiveDate desc, createdAt desc, id desc` (AC 1) over the MERGED union — `date` is `YYYY-MM-DD`, lexicographic order matches calendar order. */
function compareRowsDesc(a: InternalRow, b: InternalRow): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const createdDiff = b.createdAt.getTime() - a.createdAt.getTime();
  if (createdDiff !== 0) return createdDiff;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function stripInternal(row: InternalRow): TransactionRowDto {
  return {
    id: row.id,
    source: row.source,
    date: row.date,
    personId: row.personId,
    personName: row.personName,
    kind: row.kind,
    description: row.description,
    amountCents: row.amountCents,
    method: row.method,
    reference: row.reference,
    reversal: row.reversal,
    reversed: row.reversed,
    actionable: row.actionable,
  };
}

/** Every VISIBLE, normalized row across BOTH sources for `filters`, unbounded and unpaginated — used by `getBillingKpis` (a month is always a small volume for an airfield). */
async function fetchAllLedgerRows(filters: LedgerFilters): Promise<InternalRow[]> {
  const [accountRows, cashRows] = await Promise.all([fetchAccountRows(filters), fetchCashRows(filters)]);
  return [...accountRows, ...cashRows];
}

/**
 * `GET /api/v1/transactions` (AC 1) — paginates the union of BOTH sources
 * CORRECTLY across the whole set (never per-source): each source is fetched
 * bounded to `skip + take` (ordered), merged, re-sorted, then sliced to the
 * requested page — the two-per-source-query approach the story explicitly
 * sanctions when there is no cross-source cursor infra. `total` is the TRUE
 * count of the union (two `count()` calls, summed), never `items.length`.
 */
export async function listTransactions(actor: Actor, query: ListTransactionsQuery): Promise<PaginatedResult<TransactionRowDto>> {
  authorize(actor, 'finance.manage');

  const filters: LedgerFilters = {
    from: query.from,
    to: query.to,
    personId: query.personId,
    movementType: query.movementType,
    categoryId: query.categoryId,
    direction: query.direction,
  };

  const { skip, take } = paginationOffset(query);
  const boundedTake = skip + take;

  const [accountRows, cashRows, accountTotal, cashTotal] = await Promise.all([
    fetchAccountRows(filters, boundedTake),
    fetchCashRows(filters, boundedTake),
    filters.categoryId ? Promise.resolve(0) : prisma.accountMovement.count({ where: buildAccountWhere(filters) }),
    filters.movementType ? Promise.resolve(0) : prisma.cashMovement.count({ where: buildCashWhere(filters) }),
  ]);

  const merged = [...accountRows, ...cashRows].sort(compareRowsDesc);
  const page = merged.slice(skip, skip + take).map(stripInternal);

  return paginate(page, accountTotal + cashTotal, query);
}

function sumPositive(rows: InternalRow[]): number {
  return rows.reduce((sum, row) => sum + (row.amountCents > 0 ? row.amountCents : 0), 0);
}

function sumNegativeAbs(rows: InternalRow[]): number {
  return rows.reduce((sum, row) => sum + (row.amountCents < 0 ? -row.amountCents : 0), 0);
}

function countPositive(rows: InternalRow[]): number {
  return rows.filter((row) => row.amountCents > 0).length;
}

function countNegative(rows: InternalRow[]): number {
  return rows.filter((row) => row.amountCents < 0).length;
}

/** "Ricavi per categoria" (AC 2) — Σ positive amounts per `kind`, largest first, over the (already month-scoped) rows given. */
function revenueByKindOf(rows: InternalRow[]): { kind: string; amountCents: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.amountCents <= 0) continue;
    totals.set(row.kind, (totals.get(row.kind) ?? 0) + row.amountCents);
  }
  return Array.from(totals.entries())
    .map(([kind, amountCents]) => ({ kind, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

/**
 * `getBillingKpis` (AC 1/2, ratifica utente 2) — TRUE server-side aggregates
 * over the WHOLE ledger for the CURRENT Europe/Rome calendar month,
 * INDEPENDENT of any table filter (the page never passes the table's
 * filters here). `ref` overrides "now" for tests (same pattern as
 * `period-presets.ts` callers). `revenueCents`/`chargesCents` are, by the
 * ratified definition, the SAME figure (Σ positives of the month) — two KPI
 * tiles surfacing one number with different sub-labels, not a bug.
 */
export async function getBillingKpis(actor: Actor, ref: Date = new Date()): Promise<BillingKpisDto> {
  authorize(actor, 'finance.manage');

  const current = currentMonthRange(ref);
  const previous = previousMonthRange(ref);

  const [rows, prevRows] = await Promise.all([
    fetchAllLedgerRows({ from: current.from, to: current.to }),
    fetchAllLedgerRows({ from: previous.from, to: previous.to }),
  ]);

  const chargesCents = sumPositive(rows);
  const paymentsCents = sumNegativeAbs(rows);

  return {
    revenueCents: chargesCents,
    prevMonthRevenueCents: sumPositive(prevRows),
    chargesCents,
    chargesCount: countPositive(rows),
    paymentsCents,
    paymentsCount: countNegative(rows),
    netCents: chargesCents - paymentsCents,
    revenueByKind: revenueByKindOf(rows),
  };
}

export type RecordTransactionResult =
  | { kind: 'TOP_UP'; account: AccountOverview }
  | { kind: 'ADJUSTMENT'; account: AccountOverview }
  | { kind: 'CASH'; cashMovement: CashMovementListItem };

/**
 * `POST /api/v1/transactions` (AC 4) — pure dispatcher onto the THREE
 * pre-existing writers, unchanged (Dev Notes: they keep their own routes and
 * consumers too). `finance.manage` is enforced by each delegate, not
 * repeated here. `ADJUSTMENT`'s wire `amountCents` is the form's positive
 * "importo addebito" — negated here into `recordAdjustment`'s DB sign
 * convention for a charge (same convention `FLIGHT_CHARGE` already uses:
 * negative = a debit against the pilot's balance), standalone (no
 * `originalMovementId` — that linked variant is the per-row "Rettifica"
 * action, AC 3, which calls the existing adjustments endpoint directly).
 */
export async function recordTransaction(actor: Actor, input: RecordTransactionInput): Promise<RecordTransactionResult> {
  if (input.kind === 'TOP_UP') {
    const account = await recordTopUp(actor, input.personId, {
      amountCents: input.amountCents,
      paymentMethod: input.paymentMethod,
      effectiveDate: input.effectiveDate,
      description: input.description,
    });
    return { kind: 'TOP_UP', account };
  }

  if (input.kind === 'ADJUSTMENT') {
    const account = await recordAdjustment(actor, input.personId, {
      amountCents: -input.amountCents,
      reason: input.reason,
    });
    return { kind: 'ADJUSTMENT', account };
  }

  const cashMovement = await recordCashMovement(actor, {
    categoryId: input.categoryId,
    amountCents: input.direction === 'in' ? input.amountCents : -input.amountCents,
    effectiveDate: input.effectiveDate,
    description: input.description,
  });
  return { kind: 'CASH', cashMovement };
}
