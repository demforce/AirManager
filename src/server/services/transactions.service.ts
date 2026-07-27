import type { AccountMovementType } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import type { BookTypeDto, ListTransactionsQuery, RecordTransactionInput, TransactionRowDto } from '@/lib/schemas/transactions';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { recordAdjustment, recordTopUp, type AccountOverview } from './accounts.service';
import { recordCashMovement, type CashMovementListItem } from './cash.service';

/**
 * Unified billing ledger — `AccountMovement` ∪ `CashMovement` reader (epic
 * 12, story 12.9, AC 1). `listTransactions` and `getLedgerRevenueCents`
 * share the SAME where-builders (`buildAccountWhere`/`buildCashWhere`) and
 * row-normalization (`toAccountRow`/`toCashRow`) — the lesson from 12.8's
 * `getFlightTotals`: a list and its aggregate reader must never be able to
 * drift on scope/normalization. `recordTransaction` is a pure dispatcher
 * onto the three PRE-EXISTING writers (`recordTopUp`/`recordAdjustment`/
 * `recordCashMovement`), which keep authorizing themselves
 * (`finance.manage`) — nothing here re-checks it.
 *
 * `getBillingKpis` (the old 5-tile KPI-row reader) is RETIRED by story
 * Billing-2 (ratifica D1) — the page it fed is gone, replaced by the three
 * riquadri on `billing-summary.service.ts#getBillingSummary`. Its own
 * Σ-positivi helpers (`fetchAllLedgerRows`/`sumNegativeAbs`/`countPositive`/
 * `countNegative`/`revenueByKindOf`) went with it — dead weight once nothing
 * called them.
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
  /** The coarse ricavo/costo/acconto/giroconto classification (story Billing-2, AC 2) — independent of `movementType`/`categoryId`, may combine with either. */
  bookType?: BookTypeDto;
  /** The "secchiello" (story Billing-2, AC 3): `CASH` rows with no `paymentMethod` at all — `ACCOUNT` rows are always skipped when this is set. */
  unattributed?: boolean;
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
  // Review F3: two levels deep — `reversalOf.type` catches a DIRECT rettifica
  // of a TOP_UP, `reversalOf.reversalOf.type` catches the SYMMETRIC case (a
  // storno of THAT rettifica, verified reachable via the per-row "Rettifica"
  // action, which never restricts its target to TOP_UP/FLIGHT_CHARGE rows —
  // see `accountBookType`'s own doc-comment).
  reversalOf: { select: { type: true, reversalOf: { select: { type: true } } } },
  reversal: { select: { id: true } },
  cashMovement: { select: { id: true } },
  account: { select: { personId: true, person: { select: { firstName: true, lastName: true } } } },
} as const;

type SelectedAccountRow = Prisma.AccountMovementGetPayload<{ select: typeof ACCOUNT_ROW_SELECT }>;

const CASH_ROW_SELECT = {
  id: true,
  amountCents: true,
  // Story Billing-2, AC 3: previously omitted (the console never surfaced a
  // CASH row's own attribution) — `null` here IS the secchiello.
  paymentMethod: true,
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
 * The four book-type predicates (story Billing-2, AC 2) — the ONE
 * definition every caller shares (row classification below, the `bookType`
 * filter, AND `billing-summary.service.ts`'s own `result`/`deposits`
 * aggregates), so the per-row badge, the filter, and the riquadri totals
 * can never drift (review Billing-1 F6's lesson, closed at the root: F5's
 * "never a second copy" discipline extended from the twin-dedup predicate to
 * this one too).
 *
 * - `ACCOUNT_REVENUE_OR`: `FLIGHT_CHARGE`/`FLIGHT_CHARGE_REVERSAL`
 *   unconditionally (a charge is always DB-negative, its reversal always
 *   DB-positive — summing both nets correctly with no sign check), a debit
 *   `ADJUSTMENT` (an addebito, e.g. quota associativa), or a storno OF one
 *   (`reversalOfId` set, any sign — nets that debit's revenue in the
 *   storno's OWN month, review Billing-1 F3). `PACKAGE_PURCHASE` never
 *   reaches this predicate (its `AccountMovement` amount is always 0 — the
 *   twin-dedup above hides it; the value lives on its `CASH` twin instead).
 *   **Review Billing-2 F3**: an `ADJUSTMENT` whose original (or, one level
 *   further, whose original's own original) is a `TOP_UP` belongs to the
 *   ACCONTI book, never revenue — "lo storno appartiene al libro del suo
 *   originale" (Billing-1's own ratifica), generalized here to a ricarica: a
 *   rettifica-di-ricarica is excluded from the negative-`ADJUSTMENT` clause
 *   (any storno of a `TOP_UP` is negative, reducing the deposit), and the
 *   SYMMETRIC positive case — a storno OF that rettifica — is excluded from
 *   the positive-reversal clause, checking one level deeper
 *   (`reversalOf.reversalOf`) since that positive row's own `reversalOf` is
 *   the ADJUSTMENT, not the TOP_UP itself. Without this, correcting a wrong
 *   ricarica showed up as ghost ricavo (the reviewer's own measured case:
 *   +50,00 €).
 * - `CASH_REVENUE_OR` / `CASH_COST_OR`: a normal entrata/uscita
 *   (`reversalOfId` null) keeps its own sign; a storno of one
 *   (`reversalOfId` set) is DB-opposite-signed by construction
 *   (`reverseCashMovement`) and nets in the ORIGINAL's book, not its own —
 *   `CASH_COST_OR` is the exact mirror of `CASH_REVENUE_OR`.
 */
export const ACCOUNT_REVENUE_OR: Prisma.AccountMovementWhereInput[] = [
  { type: 'FLIGHT_CHARGE' },
  { type: 'FLIGHT_CHARGE_REVERSAL' },
  { type: 'ADJUSTMENT', amountCents: { lt: 0 }, NOT: { reversalOf: { type: 'TOP_UP' } } },
  {
    type: 'ADJUSTMENT',
    amountCents: { gt: 0 },
    reversalOfId: { not: null },
    NOT: { OR: [{ reversalOf: { type: 'TOP_UP' } }, { reversalOf: { reversalOf: { type: 'TOP_UP' } } }] },
  },
];

/** A standalone credit `ADJUSTMENT` (no `reversalOfId`) — the "giroconto" bucket, no P&L role either way (story Billing-2, AC 2). */
const ACCOUNT_TRANSFER_WHERE: Prisma.AccountMovementWhereInput = { type: 'ADJUSTMENT', amountCents: { gte: 0 }, reversalOfId: null };

export const CASH_REVENUE_OR: Prisma.CashMovementWhereInput[] = [
  { reversalOfId: null, amountCents: { gt: 0 } },
  { reversalOfId: { not: null }, amountCents: { lt: 0 } },
];

export const CASH_COST_OR: Prisma.CashMovementWhereInput[] = [
  { reversalOfId: null, amountCents: { lt: 0 } },
  { reversalOfId: { not: null }, amountCents: { gt: 0 } },
];

/**
 * Row-level mirror of `ACCOUNT_REVENUE_OR`/`ACCOUNT_TRANSFER_WHERE` (see
 * their own doc-comment — same predicate, expressed in JS instead of a
 * Prisma `where`, for the per-row `bookType` the console displays/filters
 * by) — kept branch-for-branch aligned with `ACCOUNT_REVENUE_OR`'s two
 * `ADJUSTMENT` clauses so the row badge and the aggregate can never drift
 * (review Billing-1 F6's lesson).
 *
 * Review Billing-2 F9(1): `PACKAGE_PURCHASE` is a zero-amount marker (the
 * real value lives on its `CASH` twin, feature retired in 12.13) — TRANSFER,
 * never REVENUE (unreachable today, the twin-dedup already hides it, but the
 * classifier must not claim otherwise).
 * F9(2): an `ADJUSTMENT` with `amountCents === 0` AND `reversalOfId` set is a
 * zero-effect storno — no book role either way (also unreachable today, same
 * defensive reasoning).
 * F3(3): a rettifica whose DIRECT original is a `TOP_UP` is DEPOSIT
 * (mirrors `ACCOUNT_REVENUE_OR`'s negative-clause exclusion); its SYMMETRIC
 * case — a positive storno of THAT rettifica — is also DEPOSIT, checked one
 * level deeper (mirrors the positive-clause exclusion). Sign-gated on
 * purpose, not a blanket "any TOP_UP ancestor" check: it must match
 * `ACCOUNT_REVENUE_OR`'s own two clauses exactly, or the badge and the
 * aggregate would drift on a case neither clause actually excludes (a
 * negative storno of a rettifica-of-TOP_UP, out of scope — see the
 * predicate's own doc-comment).
 */
function accountBookType(row: Pick<SelectedAccountRow, 'type' | 'amountCents' | 'reversalOfId' | 'reversalOf'>): BookTypeDto {
  if (row.type === 'TOP_UP') return 'DEPOSIT';
  if (row.type === 'FLIGHT_CHARGE' || row.type === 'FLIGHT_CHARGE_REVERSAL') return 'REVENUE';
  if (row.type === 'PACKAGE_PURCHASE') return 'TRANSFER';
  // ADJUSTMENT only from here — matches ACCOUNT_REVENUE_OR's last two clauses exactly.
  if (row.amountCents === 0 && row.reversalOfId !== null) return 'TRANSFER';
  if (row.amountCents < 0) return row.reversalOf?.type === 'TOP_UP' ? 'DEPOSIT' : 'REVENUE';
  if (row.reversalOfId !== null) {
    return row.reversalOf?.type === 'TOP_UP' || row.reversalOf?.reversalOf?.type === 'TOP_UP' ? 'DEPOSIT' : 'REVENUE';
  }
  return 'TRANSFER';
}

/**
 * Row-level mirror of `CASH_REVENUE_OR`/`CASH_COST_OR` — a normal
 * entrata/uscita keeps its own sign, a storno flips to the ORIGINAL's book.
 * Review Billing-2 F9(3): a zero-amount movement is a marker, not a cost
 * (`effective > 0 ? REVENUE : COST` would otherwise badge it COST) —
 * unreachable today (no writer records a zero-amount `CashMovement`), same
 * defensive reasoning as `accountBookType`'s own F9(1)/(2) edges.
 */
function cashBookType(row: Pick<SelectedCashRow, 'amountCents' | 'reversalOfId'>): BookTypeDto {
  if (row.amountCents === 0) return 'TRANSFER';
  const effective = row.reversalOfId === null ? row.amountCents : -row.amountCents;
  return effective > 0 ? 'REVENUE' : 'COST';
}

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
  if (filters.bookType === 'REVENUE') and.push({ OR: ACCOUNT_REVENUE_OR });
  if (filters.bookType === 'DEPOSIT') and.push({ type: 'TOP_UP' });
  if (filters.bookType === 'TRANSFER') and.push(ACCOUNT_TRANSFER_WHERE);
  if (filters.direction === 'charge') and.push({ amountCents: { lt: 0 } });
  if (filters.direction === 'payment') and.push({ amountCents: { gt: 0 } });
  return { AND: and };
}

/**
 * The "already counted by a non-zero account movement" exclusion (AC 1's
 * twin-dedup, the other half of `buildAccountWhere`'s own doc-comment) — a
 * `CashMovement` whose `accountMovementId` points at a NON-ZERO
 * `AccountMovement` (today, only a `TOP_UP`'s twin) is already valued on the
 * account side, so it must never ALSO be counted here. Exported (review
 * Billing-1 F5, dedup): the SAME fragment used to exist as three textual
 * copies (this one inline in `buildCashWhere` below, a second `const` further
 * down this file, and a third, identical, in
 * `billing-summary.service.ts#computeCostCents`) — now the ONE definition
 * every aggregate-shaped caller (which cannot reuse `buildCashWhere` itself,
 * a `findMany`-shaped where) imports.
 */
export const CASH_NOT_ALREADY_ON_ACCOUNT: Prisma.CashMovementWhereInput = {
  NOT: { AND: [{ accountMovementId: { not: null } }, { accountMovement: { amountCents: { not: 0 } } }] },
};

/** The other half of the twin-dedup rule above — hides a twin whose linked `AccountMovement` carries the real (non-zero) value. */
function buildCashWhere(filters: LedgerFilters): Prisma.CashMovementWhereInput {
  const and: Prisma.CashMovementWhereInput[] = [CASH_NOT_ALREADY_ON_ACCOUNT];
  if (filters.from) and.push({ effectiveDate: { gte: parseDateOnlyUtc(filters.from) } });
  if (filters.to) and.push({ effectiveDate: { lte: parseDateOnlyUtc(filters.to) } });
  if (filters.personId) and.push({ accountMovement: { account: { personId: filters.personId } } });
  if (filters.personQuery) and.push({ accountMovement: { account: { person: personNameMatch(filters.personQuery) } } });
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.bookType === 'REVENUE') and.push({ OR: CASH_REVENUE_OR });
  if (filters.bookType === 'COST') and.push({ OR: CASH_COST_OR });
  if (filters.unattributed) and.push({ paymentMethod: null });
  if (filters.direction === 'charge') and.push({ amountCents: { gt: 0 } });
  if (filters.direction === 'payment') and.push({ amountCents: { lt: 0 } });
  return { AND: and };
}

/**
 * Normalizes an `AccountMovement` to a ledger row. Story Billing-2, AC 2:
 * the OLD club-centric flip (`-row.amountCents`) is GONE — `amountCents` is
 * now the RAW db direction (a `TOP_UP` credit stays positive, a
 * `FLIGHT_CHARGE`/debit `ADJUSTMENT` stays negative), matching `CASH` rows'
 * own always-natural convention; the console splits it into Entrate/Uscite
 * columns instead of one signed one. Actionable (AC 3) only for a manual
 * `TOP_UP`/`ADJUSTMENT` not already reversed — every derived type
 * (`PACKAGE_PURCHASE`, `FLIGHT_CHARGE`, `FLIGHT_CHARGE_REVERSAL`) never is.
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
    bookType: accountBookType(row),
    description: row.description,
    amountCents: row.amountCents,
    method: row.paymentMethod,
    reference: row.flightId,
    reversal: row.reversalOfId !== null,
    reversed: row.reversal !== null,
    actionable: (row.type === 'TOP_UP' || row.type === 'ADJUSTMENT') && row.reversal === null,
  };
}

/**
 * Normalizes a `CashMovement` — always its own natural direction (entrata >
 * 0, uscita < 0), never flipped. `personId`/`personName` are derived through
 * the linked `accountMovement.account.person` ONLY when this row is a
 * VISIBLE twin (`PACKAGE_PURCHASE`) — a manual/PPR entry has no person.
 * `method` (story Billing-2, AC 3) is now the REAL `paymentMethod` — `null`
 * means unattributed (the secchiello). Actionable (AC 3, parity with the
 * legacy cash register's own rule): manual (no twin), not itself a storno,
 * not already reversed — `pprRequestId` is irrelevant (`reverseCashMovement`
 * never checks it).
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
    bookType: cashBookType(row),
    description: row.description,
    amountCents: row.amountCents,
    method: row.paymentMethod,
    reference: row.pprRequest?.pprNumber ?? null,
    reversal: row.reversalOfId !== null,
    reversed: row.reversal !== null,
    actionable: row.accountMovementId === null && row.reversalOfId === null && row.reversal === null,
  };
}

/**
 * `categoryId` narrows to CASH only (AC 1's XOR) — the account side has no
 * category, so it is skipped entirely rather than querying for zero rows.
 * `bookType: 'COST'` and `unattributed` (story Billing-2) are the same kind
 * of skip: no `ACCOUNT` row is EVER a cost or lacks a `paymentMethod`
 * concern, so both narrow to `CASH` only too.
 */
async function fetchAccountRows(filters: LedgerFilters, take?: number): Promise<InternalRow[]> {
  if (filters.categoryId || filters.bookType === 'COST' || filters.unattributed) return [];
  const rows = await prisma.accountMovement.findMany({
    where: buildAccountWhere(filters),
    select: ACCOUNT_ROW_SELECT,
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    ...(take !== undefined ? { take } : {}),
  });
  return rows.map(toAccountRow);
}

/**
 * `movementType` narrows to ACCOUNT only (AC 1's XOR) — same skip rationale
 * as `fetchAccountRows`. `bookType: 'DEPOSIT'`/`'TRANSFER'` (story Billing-2)
 * never occur on the `CASH` side either (a `TOP_UP`'s cash twin is always
 * hidden by the twin-dedup; a giroconto is an `ACCOUNT`-only concept) — same
 * skip.
 */
async function fetchCashRows(filters: LedgerFilters, take?: number): Promise<InternalRow[]> {
  if (filters.movementType || filters.bookType === 'DEPOSIT' || filters.bookType === 'TRANSFER') return [];
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
    bookType: row.bookType,
    description: row.description,
    amountCents: row.amountCents,
    method: row.method,
    reference: row.reference,
    reversal: row.reversal,
    reversed: row.reversed,
    actionable: row.actionable,
  };
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
    bookType: query.bookType,
    unattributed: query.unattributed,
    direction: query.direction,
  };

  const skipAccountSide = Boolean(filters.categoryId) || filters.bookType === 'COST' || Boolean(filters.unattributed);
  const skipCashSide = Boolean(filters.movementType) || filters.bookType === 'DEPOSIT' || filters.bookType === 'TRANSFER';

  const { skip, take } = paginationOffset(query);
  const boundedTake = skip + take;

  const [accountRows, cashRows, accountTotal, cashTotal] = await Promise.all([
    fetchAccountRows(filters, boundedTake),
    fetchCashRows(filters, boundedTake),
    skipAccountSide ? Promise.resolve(0) : prisma.accountMovement.count({ where: buildAccountWhere(filters) }),
    skipCashSide ? Promise.resolve(0) : prisma.cashMovement.count({ where: buildCashWhere(filters) }),
  ]);

  const merged = [...accountRows, ...cashRows].sort(compareRowsDesc);
  const page = merged.slice(skip, skip + take).map(stripInternal);

  return paginate(page, accountTotal + cashTotal, query);
}

/**
 * The corrected "Ricavi" definition (story Billing-1, AC 5/6 — replaces the
 * old `sumPositive(fetchAllLedgerRows(...))`, which silently counted a
 * charge reversed in the SAME period as full revenue, since it only ever
 * summed the POSITIVE side and never subtracted a same-period storno):
 * addebiti conto (`FLIGHT_CHARGE`, `ADJUSTMENT` a debito) netti dei
 * `FLIGHT_CHARGE_REVERSAL`, PLUS cash entrate not already counted on the
 * account side (PPR contante, rivendite, ...; see
 * `CASH_NOT_ALREADY_ON_ACCOUNT`'s doc-comment for the twin-dedup rule). Both
 * `OR` clauses are the SAME `ACCOUNT_REVENUE_OR`/`CASH_REVENUE_OR` consts the
 * `bookType` filter and row classification use above (story Billing-2) — one
 * definition, never a second copy to drift (review Billing-1 F5's lesson).
 *
 * **Review Billing-1 F3** — "uno storno appartiene al libro del suo
 * originale, con segno opposto, nel mese in cui avviene" (same rule
 * `FLIGHT_CHARGE_REVERSAL` already modeled, generalized to cash and to the
 * `ADJUSTMENT` rettifica):
 *  - account side: the debit aggregate ALSO sums a POSITIVE `ADJUSTMENT`
 *    that is a storno (`reversalOfId != null`) — e.g. reversing a "Quota
 *    associativa" debit — so it nets that reversal's OWN month's revenue,
 *    never the month the original debit was recorded in.
 *  - cash side: a normal entrata (`reversalOfId == null`, positive) still
 *    adds to revenue; a storno OF an entrata (`reversalOfId != null`,
 *    negative — `reverseCashMovement` always negates the original) is
 *    SUMMED alongside it (not routed to costs) — same month => nets to
 *    zero, later month => shows as negative revenue there. A storno of an
 *    USCITA (`reversalOfId != null`, positive) is deliberately EXCLUDED
 *    here — it reduces `computeCostCents` instead
 *    (`billing-summary.service.ts`), never revenue.
 */
async function computeRevenueCents(from: string, to: string): Promise<number> {
  const fromDate = parseDateOnlyUtc(from);
  const toDate = parseDateOnlyUtc(to);

  const debitAggregate = await prisma.accountMovement.aggregate({
    where: {
      effectiveDate: { gte: fromDate, lte: toDate },
      OR: ACCOUNT_REVENUE_OR,
    },
    _sum: { amountCents: true },
  });
  // These are all raw NEGATIVE-for-a-debit amounts (a `FLIGHT_CHARGE_REVERSAL`,
  // or a positive reversal `ADJUSTMENT`, in the same period cancels its
  // original charge back to 0) — negate the sum to get a positive "ricavi"
  // figure.
  const accountRevenueCents = -(debitAggregate._sum.amountCents ?? 0);

  const cashAggregate = await prisma.cashMovement.aggregate({
    where: {
      effectiveDate: { gte: fromDate, lte: toDate },
      OR: CASH_REVENUE_OR,
      ...CASH_NOT_ALREADY_ON_ACCOUNT,
    },
    _sum: { amountCents: true },
  });
  const cashRevenueCents = cashAggregate._sum.amountCents ?? 0;

  return accountRevenueCents + cashRevenueCents;
}

/**
 * Total CORRECTED ledger revenue over an ARBITRARY `[from, to]` period
 * (story Billing-1, AC 5/6) — addebiti conto netti degli storni PLUS cash
 * entrate non già contate lato conto (see `computeRevenueCents`'s own
 * doc-comment for the exact rule and the same-period-storno bug it fixes
 * over the old Σ-positivi definition). Story 12.10's stats API reuses this
 * so its "Ricavi" KPI/series can NEVER drift from
 * `billing-summary.service.ts#getBillingSummary`'s own definition (ratifica
 * utente 4: "MAI reimplementarle") — both readers share this ONE
 * implementation. Self-authorizes (`finance.manage`) — the
 * "coarser-permission" cross-service call convention
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
