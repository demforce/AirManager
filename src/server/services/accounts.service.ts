import type { AccountMovementType, PaymentMethod } from '@/generated/prisma/client';
import { paginate, paginationOffset, type PaginatedResult, type PaginationQuery } from '@/lib/api/pagination';
import type { RecordTopUpInput } from '@/lib/schemas/accounts';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ForbiddenError, NotFoundError } from './errors';

/** The cash category top-ups land in (story 3.1, AC 2) — seeded, never created on the fly (Dev Notes). */
const TOP_UP_CASH_CATEGORY_NAME = 'Ricariche';

/** How many recent movements the overview preview carries (Dev Notes, Task 3) — the full statement is story 3.2. */
const RECENT_MOVEMENTS_LIMIT = 5;

export type AccountMovementListItem = {
  id: string;
  type: AccountMovementType;
  amountCents: number;
  paymentMethod: PaymentMethod | null;
  description: string | null;
  /** `YYYY-MM-DD` — same date-only wire convention as `PersonDetail.studentProfile.courseStartDate`. */
  effectiveDate: string;
  actorUserId: string;
  createdAt: Date;
};

export type AccountOverview = {
  account: { id: string; createdAt: Date } | null;
  balanceCents: number;
  recentMovements: AccountMovementListItem[];
};

const RECENT_MOVEMENT_SELECT = {
  id: true,
  type: true,
  amountCents: true,
  paymentMethod: true,
  description: true,
  effectiveDate: true,
  actorUserId: true,
  createdAt: true,
} as const;

type SelectedMovement = {
  id: string;
  type: AccountMovementType;
  amountCents: number;
  paymentMethod: PaymentMethod | null;
  description: string | null;
  effectiveDate: Date;
  actorUserId: string;
  createdAt: Date;
};

/** `@db.Date` round-trips as a UTC-midnight `Date` — format with UTC parts so no server timezone can shift the calendar day (same helper as `people.service.ts`). */
function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toMovementListItem(movement: SelectedMovement): AccountMovementListItem {
  return {
    id: movement.id,
    type: movement.type,
    amountCents: movement.amountCents,
    paymentMethod: movement.paymentMethod,
    description: movement.description,
    effectiveDate: toDateOnlyString(movement.effectiveDate),
    actorUserId: movement.actorUserId,
    createdAt: movement.createdAt,
  };
}

/**
 * Ownership pre-check shared by `getAccountOverview` and `recordTopUp`'s read
 * path: `people.read` (any person) OR "own" access — `self.read` plus a
 * matching `actor.personId` (same own-access rule as `getPerson`, story 2.3,
 * AC 2). Ownership is always resolved BEFORE any query touches the DB.
 */
function assertReadAccess(actor: Actor, personId: string): void {
  if (hasPermission(actor, 'people.read')) return;
  authorize(actor, 'self.read');
  if (actor.personId !== personId) {
    throw new ForbiddenError('Actor may only read their own account.');
  }
}

/**
 * Returns the account overview for a person (story 3.1, AC 1): whether an
 * `Account` exists, its computed balance, and a light preview of the most
 * recent movements. `account: null` means the person never activated a
 * pilot/student profile (AC 1) — instructor-only people never get one
 * (`people.service.ts#upsertProfile`). The balance is ALWAYS
 * `SUM(amountCents)` via `prisma.accountMovement.aggregate` (AD-3) — there is
 * no balance column anywhere to read instead. Read access: the same
 * own-access rule as `getPerson` (story 2.3, AC 2).
 */
export async function getAccountOverview(actor: Actor, personId: string): Promise<AccountOverview> {
  assertReadAccess(actor, personId);

  // Same contract as `recordTopUp` (review 3.1 F4): an unknown person is a
  // 404, not a 200 with an empty overview — only "person exists but never got
  // an account" reads as `account: null`.
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }

  const account = await prisma.account.findUnique({
    where: { personId },
    select: { id: true, createdAt: true },
  });
  if (!account) {
    return { account: null, balanceCents: 0, recentMovements: [] };
  }

  return buildOverview(account);
}

/**
 * Assembles the overview for an account the caller is already authorized to
 * see. Kept guard-free on purpose (review 3.1 F1): `recordTopUp` returns the
 * fresh overview through here after its committed write, and routing that
 * read back through `assertReadAccess` would couple `finance.manage` to also
 * holding a read permission — a future write-only role would get its top-up
 * committed and then a 403 on the response.
 */
async function buildOverview(account: { id: string; createdAt: Date }): Promise<AccountOverview> {
  const [aggregate, recent] = await prisma.$transaction([
    prisma.accountMovement.aggregate({
      where: { accountId: account.id },
      _sum: { amountCents: true },
    }),
    prisma.accountMovement.findMany({
      where: { accountId: account.id },
      select: RECENT_MOVEMENT_SELECT,
      // `id` as tie-break: same-millisecond `createdAt` (batch imports/seeds)
      // must not make the preview order non-deterministic (review 3.1 F3).
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: RECENT_MOVEMENTS_LIMIT,
    }),
  ]);

  return {
    account,
    // Zero movements aggregates to `null` in Prisma, never `0` — normalize it
    // here so the balance is always a plain integer (AD-2), matching a
    // never-topped-up account's "0,00 €" display.
    balanceCents: aggregate._sum.amountCents ?? 0,
    recentMovements: recent.map(toMovementListItem),
  };
}

/**
 * Records a prepaid-account top-up (story 3.1, AC 2/3). Write access:
 * `finance.manage` (staff/admin) — never "own" (a pilot cannot top up their
 * own account). In ONE transaction: get-or-create the `Account` (idempotent
 * upsert on `personId` — same 1-to-0/1 guarantee `upsertProfile` relies on,
 * AD-11), create the immutable `AccountMovement` (TOP_UP, signed positive
 * amount), and its automatic `CashMovement` twin under the seeded
 * "Ricariche" category, linked via `accountMovementId` for traceability
 * (AD-3: nothing here is ever updated/deleted after the fact). The category
 * is resolved BEFORE opening the transaction so a missing seed fails fast
 * with an explicit error rather than silently creating the category
 * on the fly (Dev Notes).
 */
export async function recordTopUp(actor: Actor, personId: string, input: RecordTopUpInput): Promise<AccountOverview> {
  authorize(actor, 'finance.manage');

  const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }

  const category = await prisma.cashCategory.findUnique({
    where: { name: TOP_UP_CASH_CATEGORY_NAME },
    select: { id: true },
  });
  if (!category) {
    // Not a DomainError: a missing seed category is an operational
    // misconfiguration, not something the caller can fix by retrying with
    // different input — it surfaces as AD-8's generic 500 envelope.
    throw new Error(`Cash category "${TOP_UP_CASH_CATEGORY_NAME}" is missing — seed the database before recording top-ups.`);
  }

  const effectiveDate = new Date(input.effectiveDate);
  const description = input.description ?? null;

  const account = await prisma.$transaction(async (tx) => {
    const upserted = await tx.account.upsert({
      where: { personId },
      create: { personId },
      update: {},
      select: { id: true, createdAt: true },
    });

    const accountMovement = await tx.accountMovement.create({
      data: {
        accountId: upserted.id,
        type: 'TOP_UP',
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        description,
        effectiveDate,
        actorUserId: actor.userId,
      },
      select: { id: true },
    });

    await tx.cashMovement.create({
      data: {
        categoryId: category.id,
        amountCents: input.amountCents,
        description,
        effectiveDate,
        actorUserId: actor.userId,
        accountMovementId: accountMovement.id,
      },
    });

    return upserted;
  });

  // Guard-free on purpose: the write was authorized by `finance.manage`, and
  // the fresh overview must not require a separate read permission (review
  // 3.1 F1 — see `buildOverview`).
  return buildOverview(account);
}

/**
 * One entry of the full, paginated account statement (story 3.2, AC 1/2).
 * `actorEmail` is a display-only join over `actorUserId` (same enrichment
 * pattern as `listHourMeterAdjustments`, story 2.5) but, unlike that list,
 * it is conditional: only present when the caller has `people.read` (AC
 * 2's "dettaglio operativo" for staff) — a titolare reading their own
 * statement never sees who registered a movement (Dev Notes, AD-5: the
 * service is the guardian of the data, not just the UI).
 */
export type AccountStatementItem = {
  id: string;
  type: AccountMovementType;
  amountCents: number;
  effectiveDate: string;
  description: string | null;
  createdAt: Date;
  actorEmail?: string;
};

export type AccountStatementResult = PaginatedResult<AccountStatementItem>;

const ACCOUNT_STATEMENT_SELECT = {
  id: true,
  type: true,
  amountCents: true,
  description: true,
  effectiveDate: true,
  createdAt: true,
  actorUser: { select: { email: true } },
} as const;

type SelectedStatementMovement = {
  id: string;
  type: AccountMovementType;
  amountCents: number;
  description: string | null;
  effectiveDate: Date;
  createdAt: Date;
  actorUser: { email: string };
};

function toStatementItem(movement: SelectedStatementMovement, includeActor: boolean): AccountStatementItem {
  return {
    id: movement.id,
    type: movement.type,
    amountCents: movement.amountCents,
    effectiveDate: toDateOnlyString(movement.effectiveDate),
    description: movement.description,
    createdAt: movement.createdAt,
    ...(includeActor ? { actorEmail: movement.actorUser.email } : {}),
  };
}

/**
 * Lists a person's full account statement, paginated and most-recent-first
 * (story 3.2, AC 1/2). Read access: the same own-access rule as
 * `getAccountOverview` (`assertReadAccess`) — checked BEFORE any query. A
 * person that exists but never activated an account gets an empty page
 * (`total: 0`), NOT a 404 — only an unknown person is (same 404-vs-null
 * split as `getAccountOverview`, review 3.1 F4).
 */
export async function listAccountMovements(
  actor: Actor,
  personId: string,
  query: PaginationQuery,
): Promise<AccountStatementResult> {
  assertReadAccess(actor, personId);

  const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }

  const account = await prisma.account.findUnique({ where: { personId }, select: { id: true } });
  if (!account) {
    return paginate([], 0, query);
  }

  const includeActor = hasPermission(actor, 'people.read');
  const where = { accountId: account.id };
  const [items, total] = await prisma.$transaction([
    prisma.accountMovement.findMany({
      select: ACCOUNT_STATEMENT_SELECT,
      where,
      // `id` tie-break: same-millisecond rows (batch imports/seeds) must not
      // make the page order non-deterministic (same pattern as `buildOverview`, review 3.1 F3).
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationOffset(query),
    }),
    prisma.accountMovement.count({ where }),
  ]);

  return paginate(
    items.map((item) => toStatementItem(item, includeActor)),
    total,
    query,
  );
}
