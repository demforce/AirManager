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
  /** Free-text narrowing filter (story 13.5, AC 1) — case-insensitive substring match on the linked person's name, AND-combined with `personId`. */
  personQuery?: string;
  movementType?: AccountMovementType;
  categoryId?: string;
  direction?: 'charge' | 'payment';
};

/** Shared `person.firstName`/`lastName` substring OR-clause for `personQuery` (story 13.5, AC 1) — same shape for both the account and cash sides, just nested under a different relation path. */
function personNameMatch(query: string): Prisma.PersonWhereInput {
  return { OR: [{ firstName: { contains: query, mode: 'insensitive' } }, { lastName: { contains: query, mode: 'insensitive' } }] };
}

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
  if (filters.personQuery) and.push({ account: { person: personNameMatch(filters.personQuery) } });
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
  if (filters.personQuery) and.push({ accountMovement: { account: { person: personNameMatch(filters.personQuery) } } });
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
    personQuery: query.personQuery,
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
 * The SAME "already counted by a non-zero account movement" exclusion
 * `buildCashWhere` above uses for the unified ledger's twin-dedup, as a
 * plain Prisma `NOT` fragment for `aggregate` callers (`buildCashWhere`
 * itself returns a `findMany`-shaped where, not reusable as-is here).
 */
const CASH_NOT_ALREADY_ON_ACCOUNT: Prisma.CashMovementWhereInput = {
  NOT: { AND: [{ accountMovementId: { not: null } }, { accountMovement: { amountCents: { not: 0 } } }] },
};

/**
 * The corrected "Ricavi" definition (story Billing-1, AC 5/6 — replaces the
 * old `sumPositive(fetchAllLedgerRows(...))`, which silently counted a
 * charge reversed in the SAME period as full revenue, since it only ever
 * summed the POSITIVE side and never subtracted a same-period storno):
 * addebiti conto (`FLIGHT_CHARGE`, `ADJUSTMENT` a debito) netti dei
 * `FLIGHT_CHARGE_REVERSAL`, PLUS cash entrate not already counted on the
 * account side (PPR contante, rivendite, ...; see
 * `CASH_NOT_ALREADY_ON_ACCOUNT`'s doc-comment for the twin-dedup rule).
 */
async function computeRevenueCents(from: string, to: string): Promise<number> {
  const fromDate = parseDateOnlyUtc(from);
  const toDate = parseDateOnlyUtc(to);

  const debitAggregate = await prisma.accountMovement.aggregate({
    where: {
      effectiveDate: { gte: fromDate, lte: toDate },
      OR: [{ type: 'FLIGHT_CHARGE' }, { type: 'FLIGHT_CHARGE_REVERSAL' }, { type: 'ADJUSTMENT', amountCents: { lt: 0 } }],
    },
    _sum: { amountCents: true },
  });
  // These are all raw NEGATIVE-for-a-debit amounts (a `FLIGHT_CHARGE_REVERSAL`
  // in the same period cancels its original charge back to 0) — negate the
  // sum to get a positive "ricavi" figure.
  const accountRevenueCents = -(debitAggregate._sum.amountCents ?? 0);

  const cashAggregate = await prisma.cashMovement.aggregate({
    where: {
      effectiveDate: { gte: fromDate, lte: toDate },
      amountCents: { gt: 0 },
      ...CASH_NOT_ALREADY_ON_ACCOUNT,
    },
    _sum: { amountCents: true },
  });
  const cashRevenueCents = cashAggregate._sum.amountCents ?? 0;

  return accountRevenueCents + cashRevenueCents;
}

/**
 * `getBillingKpis` (AC 1/2, ratifica utente 2) — TRUE server-side aggregates
 * over the WHOLE ledger for the CURRENT Europe/Rome calendar month,
 * INDEPENDENT of any table filter (the page never passes the table's
 * filters here). `ref` overrides "now" for tests (same pattern as
 * `period-presets.ts` callers). `revenueCents`/`chargesCents` are, by the
 * ratified definition, the SAME figure — two KPI tiles surfacing one number
 * with different sub-labels, not a bug — now sourced from
 * `getLedgerRevenueCents` (story Billing-1, AC 6: the old
 * `sumPositive(fetchAllLedgerRows(...))` definition is RETIRED, not
 * affiancata — see that function's own doc-comment for the bug it fixed).
 * `paymentsCents`/`chargesCount`/`paymentsCount`/`revenueByKind` are
 * UNCHANGED, still derived from the raw ledger rows — this story's AC 6 only
 * targets the Ricavi/Costi figure, not those.
 */
export async function getBillingKpis(actor: Actor, ref: Date = new Date()): Promise<BillingKpisDto> {
  authorize(actor, 'finance.manage');

  const current = currentMonthRange(ref);
  const previous = previousMonthRange(ref);

  const [rows, revenueCents, prevMonthRevenueCents] = await Promise.all([
    fetchAllLedgerRows({ from: current.from, to: current.to }),
    getLedgerRevenueCents(actor, current.from, current.to),
    getLedgerRevenueCents(actor, previous.from, previous.to),
  ]);

  const paymentsCents = sumNegativeAbs(rows);

  return {
    revenueCents,
    prevMonthRevenueCents,
    chargesCents: revenueCents,
    chargesCount: countPositive(rows),
    paymentsCents,
    paymentsCount: countNegative(rows),
    netCents: revenueCents - paymentsCents,
    revenueByKind: revenueByKindOf(rows),
  };
}

/**
 * Total CORRECTED ledger revenue over an ARBITRARY `[from, to]` period
 * (story Billing-1, AC 5/6) — addebiti conto netti degli storni PLUS cash
 * entrate non già contate lato conto (see `computeRevenueCents`'s own
 * doc-comment for the exact rule and the same-period-storno bug it fixes
 * over the old Σ-positivi definition). Story 12.10's stats API reuses this
 * so its "Ricavi" KPI/series can NEVER drift from `getBillingKpis`'s/
 * `billing-summary.service.ts#getBillingSummary`'s own definition (ratifica
 * utente 4: "MAI reimplementarle") — ALL THREE readers now share this ONE
 * implementation. Self-authorizes (same permission `getBillingKpis`
 * requires) — the "coarser-permission" cross-service call convention
 * `flights.service.ts#registerFlight`'s own doc-comment documents.
 */
export async function getLedgerRevenueCents(actor: Actor, from: string, to: string): Promise<number> {
  authorize(actor, 'finance.manage');
  return computeRevenueCents(from, to);
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
    paymentMethod: input.paymentMethod,
    effectiveDate: input.effectiveDate,
    description: input.description,
  });
  return { kind: 'CASH', cashMovement };
}
