import type { AccountMovementType, PaymentMethod } from '@/generated/prisma/client';
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

  const account = await prisma.account.findUnique({
    where: { personId },
    select: { id: true, createdAt: true },
  });
  if (!account) {
    return { account: null, balanceCents: 0, recentMovements: [] };
  }

  const [aggregate, recent] = await prisma.$transaction([
    prisma.accountMovement.aggregate({
      where: { accountId: account.id },
      _sum: { amountCents: true },
    }),
    prisma.accountMovement.findMany({
      where: { accountId: account.id },
      select: RECENT_MOVEMENT_SELECT,
      orderBy: [{ createdAt: 'desc' }],
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

  await prisma.$transaction(async (tx) => {
    const account = await tx.account.upsert({
      where: { personId },
      create: { personId },
      update: {},
      select: { id: true },
    });

    const accountMovement = await tx.accountMovement.create({
      data: {
        accountId: account.id,
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
  });

  return getAccountOverview(actor, personId);
}
