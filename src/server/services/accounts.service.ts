import type { AccountMovementType, PaymentMethod } from '@/generated/prisma/client';
import { paginate, paginationOffset, type PaginatedResult, type PaginationQuery } from '@/lib/api/pagination';
import type { AppLocale } from '@/i18n/routing';
import type { RecordAdjustmentInput, RecordTopUpInput } from '@/lib/schemas/accounts';
import { getMailSender } from '@/server/adapters/mail';
import { buildNegativeBalanceAlertEmail } from '@/server/adapters/mail/templates';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from './errors';

/** The cash category top-ups land in (story 3.1, AC 2) — seeded, never created on the fly (Dev Notes). */
const TOP_UP_CASH_CATEGORY_NAME = 'Ricariche';

/** How many recent movements the overview preview carries (Dev Notes, Task 3) — the full statement is story 3.2. */
const RECENT_MOVEMENTS_LIMIT = 5;

/** `AppSetting.key` for the configurable negative-balance alert threshold (story 3.3, Task 1). */
const NEGATIVE_BALANCE_THRESHOLD_SETTING_KEY = 'negativeBalanceAlertThresholdCents';

/**
 * Default alert threshold (−200,00 €) used when the `AppSetting` row is
 * absent — an admin UI to change it is out of scope here (epic 10). Always
 * <= 0 by convention: the "belowThreshold" band is strictly more negative
 * than plain "negative" (0 > balance >= threshold).
 */
const DEFAULT_NEGATIVE_BALANCE_THRESHOLD_CENTS = -20_000;

/** Prisma unique-constraint violation (same pattern as `aircraft.service.ts`/`people.service.ts`). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

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

  // No balance-band alert wiring here (story 3.3, Dev Notes): `recordTopUpSchema`
  // rejects zero/negative amounts, so a top-up only ever moves the balance
  // up — the band (`balanceBand`, see `recordAdjustment`) can improve or stay
  // the same, never worsen. Adding the same lock-read-compare-send dance as
  // `recordAdjustment` here would be dead code that can never fire an email.
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
  /** Story 3.3, AC 1: set on an `ADJUSTMENT` row linked to the original movement it corrects — drives the "rettifica di ..." badge. */
  reversalOfId: string | null;
  /** Story 3.3: true when this movement already has a linked adjustment — hides the row's "Rettifica questo movimento" action. */
  hasReversal: boolean;
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
  reversalOfId: true,
  reversal: { select: { id: true } },
} as const;

type SelectedStatementMovement = {
  id: string;
  type: AccountMovementType;
  amountCents: number;
  description: string | null;
  effectiveDate: Date;
  createdAt: Date;
  actorUser: { email: string };
  reversalOfId: string | null;
  reversal: { id: string } | null;
};

function toStatementItem(movement: SelectedStatementMovement, includeActor: boolean): AccountStatementItem {
  return {
    id: movement.id,
    type: movement.type,
    amountCents: movement.amountCents,
    effectiveDate: toDateOnlyString(movement.effectiveDate),
    description: movement.description,
    createdAt: movement.createdAt,
    reversalOfId: movement.reversalOfId,
    hasReversal: movement.reversal !== null,
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

// --- Story 3.3: motivated adjustments and negative-balance band alerts ----

/**
 * A balance's position relative to zero and the configurable alert
 * threshold (Dev Notes/AC 2): `'ok'` (>= 0), `'negative'` (< 0 but >=
 * threshold) or `'belowThreshold'` (< threshold). Ordered worst-to-best as
 * `BAND_ORDER` below so "did the band worsen?" is a single numeric
 * comparison, never a hand-rolled state machine.
 */
export type BalanceBand = 'ok' | 'negative' | 'belowThreshold';

const BAND_ORDER: Record<BalanceBand, number> = { ok: 0, negative: 1, belowThreshold: 2 };

/**
 * Classifies a balance into its band (AC 2/3, Dev Notes boundaries: `>= 0`;
 * `< 0 && >= thresholdCents`; `< thresholdCents`). Pure and stateless — the
 * "don't resend on every subsequent movement" rule (AC 3) falls out of
 * comparing this band before/after a movement, with nothing persisted.
 */
export function balanceBand(balanceCents: number, thresholdCents: number): BalanceBand {
  if (balanceCents >= 0) return 'ok';
  if (balanceCents >= thresholdCents) return 'negative';
  return 'belowThreshold';
}

/** True when `after` is strictly worse than `before` (AC 2: only a worsening transition alerts). */
function bandWorsened(before: BalanceBand, after: BalanceBand): boolean {
  return BAND_ORDER[after] > BAND_ORDER[before];
}

/**
 * Reads the configurable alert threshold from `AppSetting` (Task 1), falling
 * back to `DEFAULT_NEGATIVE_BALANCE_THRESHOLD_CENTS` when the row is absent
 * — an admin settings UI to manage it is out of scope here (epic 10). A
 * non-numeric stored value also falls back to the default rather than
 * crashing the movement that triggered the read.
 */
async function getNegativeBalanceThresholdCents(): Promise<number> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: NEGATIVE_BALANCE_THRESHOLD_SETTING_KEY },
    select: { value: true },
  });
  if (!setting) return DEFAULT_NEGATIVE_BALANCE_THRESHOLD_CENTS;

  const parsed = Number.parseInt(setting.value, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_NEGATIVE_BALANCE_THRESHOLD_CENTS;
}

/**
 * Sends the negative-balance alert email (AC 2), fire-and-forget. MUST be
 * called AFTER the movement's transaction has committed (Dev Notes): a
 * slow/broken SMTP server must never hold the `Account` row lock or fail an
 * otherwise-valid movement. Silent no-op (with a log) when the person has no
 * email — a titolare without one just never gets alerted, but the movement
 * and the "saldi negativi" list are unaffected (Task 2).
 */
async function sendNegativeBalanceAlert(
  personId: string,
  person: { firstName: string; lastName: string; email: string | null },
  balanceCents: number,
): Promise<void> {
  if (!person.email) {
    console.warn('sendNegativeBalanceAlert: person has no email, skipping alert.');
    return;
  }

  try {
    // `User.locale` (AD-7) — the recipient's own language, not the staff
    // actor's. No linked `User` (a titolare who never got app access) falls
    // back to Italian, same default as `User.locale`'s own schema default.
    const user = await prisma.user.findUnique({ where: { personId }, select: { locale: true } });
    const locale: AppLocale = user?.locale === 'en' ? 'en' : 'it';
    const { subject, text } = await buildNegativeBalanceAlertEmail(locale, {
      personName: `${person.firstName} ${person.lastName}`,
      balanceCents,
    });
    await getMailSender().send({ to: person.email, subject, text });
  } catch (error) {
    // Never let a mail failure surface to the caller — the movement is
    // already committed and must stay valid (Dev Notes).
    console.error('sendNegativeBalanceAlert: failed to send alert email', error);
  }
}

/**
 * Records a motivated adjustment (rettifica, story 3.3, AC 1) — a NEW,
 * independent `AccountMovement` (type `ADJUSTMENT`); the original movement
 * it may correct is NEVER touched (AD-3's cardinal rule). Write access:
 * `finance.manage` only, never "own". The account must already exist
 * (Dev Notes: a rettifica on a person with no account makes no sense — this
 * is a 404, not an implicit `Account` creation like `recordTopUp`'s upsert).
 *
 * `originalMovementId`, when given, must belong to the SAME account (a 404,
 * never a 403/differently-worded error — Dev Notes: never reveal that a
 * movement id belongs to someone else's account) and must not already have
 * a linked adjustment (`reversalOfId` is `@unique`) — a second one is a
 * `ConflictError` (409). To correct a wrong adjustment, Dev Notes says to
 * record another one, either standalone or linked to the adjustment itself
 * (an `ADJUSTMENT` row can itself be `originalMovementId` for a later one).
 *
 * No `effectiveDate` in the input (Task 2's signature is deliberately just
 * `amountCents`/`reason`/`originalMovementId`) — a rettifica always values
 * as of today, the server clock's UTC calendar date (no time-of-day, same
 * `@db.Date` convention as every other ledger date).
 *
 * No automatic `CashMovement` (Dev Notes: cash-side stornos are story 3.4).
 *
 * Alert (AC 2/3): the pre-movement balance is read with a `SELECT ... FOR
 * UPDATE` lock on the `Account` row (review 2.5 F1 pattern) so two
 * concurrent adjustments never compute the same "before" balance — without
 * it, both could read the same pre-worsening band and either double-send or
 * silently drop the alert. The email itself is sent AFTER the transaction
 * commits (Dev Notes: SMTP failures must never hold the lock nor invalidate
 * the movement).
 */
export async function recordAdjustment(actor: Actor, personId: string, input: RecordAdjustmentInput): Promise<AccountOverview> {
  authorize(actor, 'finance.manage');

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }

  const account = await prisma.account.findUnique({ where: { personId }, select: { id: true, createdAt: true } });
  if (!account) {
    throw new NotFoundError('This person has no account yet — a rettifica cannot be recorded on a non-existent account.');
  }

  const originalMovementId = input.originalMovementId ?? null;
  if (originalMovementId) {
    // Ownership pre-check BEFORE any write (same "never reveal someone
    // else's data" rationale as `assertReadAccess`): a movement id from a
    // different account is reported exactly like an unknown one.
    const original = await prisma.accountMovement.findUnique({
      where: { id: originalMovementId },
      select: { id: true, accountId: true, reversal: { select: { id: true } } },
    });
    if (!original || original.accountId !== account.id) {
      throw new NotFoundError('Movement not found.');
    }
    if (original.reversal) {
      throw new ConflictError('This movement already has a linked adjustment.');
    }
  }

  const thresholdCents = await getNegativeBalanceThresholdCents();
  const reason = input.reason;

  const { balanceBeforeCents, balanceAfterCents } = await prisma.$transaction(async (tx) => {
    // Row lock (FOR UPDATE): serializes concurrent adjustments/top-ups on
    // THIS account so their "balance before" reads never race (review 2.5
    // F1 pattern) — `Account` has no balance column, the lock is a pure
    // serialization mutex around the SUM read below.
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${account.id} FOR UPDATE`;

    const aggregate = await tx.accountMovement.aggregate({
      where: { accountId: account.id },
      _sum: { amountCents: true },
    });
    const beforeCents = aggregate._sum.amountCents ?? 0;

    try {
      await tx.accountMovement.create({
        data: {
          accountId: account.id,
          type: 'ADJUSTMENT',
          amountCents: input.amountCents,
          description: reason,
          effectiveDate: todayDateOnlyUtc(),
          actorUserId: actor.userId,
          reversalOfId: originalMovementId,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Concurrent-race backstop for the pre-check above (TOCTOU): two
        // requests linking to the same original at once.
        throw new ConflictError('This movement already has a linked adjustment.');
      }
      throw error;
    }

    return { balanceBeforeCents: beforeCents, balanceAfterCents: beforeCents + input.amountCents };
  });

  const bandBefore = balanceBand(balanceBeforeCents, thresholdCents);
  const bandAfter = balanceBand(balanceAfterCents, thresholdCents);
  if (bandWorsened(bandBefore, bandAfter)) {
    // Fire-and-forget, AFTER commit (Dev Notes) — never awaited into the
    // caller's critical path beyond this dangling promise's own try/catch.
    void sendNegativeBalanceAlert(personId, person, balanceAfterCents);
  }

  // Guard-free re-read, same rationale as `recordTopUp` (review 3.1 F1).
  return buildOverview(account);
}

/** `@db.Date` calendar-only "today" (server clock, UTC) — a rettifica always values as of today (Dev Notes: no `effectiveDate` input). */
function todayDateOnlyUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export type NegativeBalanceItem = {
  personId: string;
  firstName: string;
  lastName: string;
  balanceCents: number;
  lastMovementAt: Date | null;
};

/**
 * Lists every account with a negative balance, most-negative first (AC 2,
 * Task 2) — the staff-facing "saldi negativi" list on `/dashboard/finance`.
 * `finance.manage` only.
 *
 * Balance is ALWAYS the `SUM(AccountMovement.amountCents)` computation
 * (AD-3) — implemented here as a Prisma `groupBy` with a `having` filter on
 * the aggregate (pushes the "< 0" filter and the ordering into Postgres,
 * rather than fetching every account and filtering in JS) followed by one
 * `Account`+`Person` lookup to enrich the surviving groups with a display
 * name — `groupBy` cannot itself join across relations.
 */
export async function listNegativeBalances(actor: Actor): Promise<NegativeBalanceItem[]> {
  authorize(actor, 'finance.manage');

  const grouped = await prisma.accountMovement.groupBy({
    by: ['accountId'],
    _sum: { amountCents: true },
    _max: { createdAt: true },
    having: { amountCents: { _sum: { lt: 0 } } },
    orderBy: { _sum: { amountCents: 'asc' } },
  });

  if (grouped.length === 0) return [];

  const accounts = await prisma.account.findMany({
    where: { id: { in: grouped.map((group) => group.accountId) } },
    select: { id: true, person: { select: { id: true, firstName: true, lastName: true } } },
  });
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const items: NegativeBalanceItem[] = [];
  for (const group of grouped) {
    const account = accountById.get(group.accountId);
    // Cannot happen (every AccountMovement.accountId is FK-backed) — skip
    // defensively rather than throw on a display-only listing.
    if (!account) continue;
    items.push({
      personId: account.person.id,
      firstName: account.person.firstName,
      lastName: account.person.lastName,
      balanceCents: group._sum.amountCents ?? 0,
      lastMovementAt: group._max.createdAt,
    });
  }
  return items;
}
