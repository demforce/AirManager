import type { PaymentMethod } from '@/generated/prisma/client';
import { addMonthsClampUtc, parseDateOnlyUtc, toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import type { SellPackageInput } from '@/lib/schemas/packages';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { type AccountOverview, getAccountOverview } from './accounts.service';
import { ConflictError, ForbiddenError, NotFoundError } from './errors';

/**
 * Package sale and residuals (epic 4, story 4.4; FR-13) — the twin of
 * `package-types.service.ts`'s mutable listino, but ledger-shaped
 * (`HourPackage`, append-only in spirit, AD-3): a wrong sale is out of scope
 * here (no update/delete API; a coordinated storno would be an epic 5+
 * concern if ever needed).
 *
 * **The payment is EXTERNAL to the prepaid account** (contanti/bonifico/POS,
 * exactly like a top-up, `accounts.service.ts#recordTopUp`): the cash
 * register receives the price (a `CashMovement` under the seeded
 * "Pacchetti" category), but the account BALANCE never changes. The linked
 * `AccountMovement` (`PACKAGE_PURCHASE`) exists purely so the titolare sees
 * the purchase in their estratto conto (AC 2) — it always carries
 * `amountCents: 0` (a closed transaction: payment received and package
 * delivered cancel out). Buying a package paid in full must NEVER push the
 * account into the red.
 *
 * **Consumption (epic 5, story 5.2)**: `computeRemainingMinutes` is the ONE
 * place that turns `includedMinutes - consumedMinutes` into the residuo
 * every reader (this module's own `sellPackage`/`listPersonPackages`, and
 * `flights.service.ts#registerFlight`'s FIFO allocation) agrees on;
 * `consumedMinutes` itself is always a fresh `SUM(PackageConsumption.minutes)`
 * aggregate, never a persisted counter (AD-3). This module never writes a
 * `PackageConsumption` row itself — only `registerFlight` does, inside its
 * own transaction (the consumption side of AD-6 lives there, not here).
 */

/** The cash category package sales land in (AC 1) — seeded, never created on the fly (same pattern as `recordTopUp`'s "Ricariche"). */
const PACKAGE_CASH_CATEGORY_NAME = 'Pacchetti';

export type HourPackageListItem = {
  id: string;
  typeName: string;
  includedMinutes: number;
  remainingMinutes: number;
  /** Total minutes consumed so far (epic 5, story 5.2) — `SUM(PackageConsumption.minutes)`, 0 for a freshly sold package. */
  consumedMinutes: number;
  pricePaidCents: number;
  paymentMethod: PaymentMethod;
  /** Calendar-only date (`YYYY-MM-DD`) — see `toDateOnlyString`. */
  effectiveDate: string;
  /** Calendar-only date (`YYYY-MM-DD`), `null` = no expiry. */
  expiresAt: string | null;
  /** `true` only when `expiresAt` is STRICTLY before today (the expiry day itself is still valid, Dev Notes boundary). */
  isExpired: boolean;
  createdAt: Date;
  /** Present ONLY when the caller has `people.read` (same conditional pattern as `AccountStatementItem.actorEmail`). */
  actorEmail?: string;
};

export type SellPackageResult = {
  package: HourPackageListItem;
  account: AccountOverview;
};

const HOUR_PACKAGE_SELECT = {
  id: true,
  includedMinutes: true,
  pricePaidCents: true,
  paymentMethod: true,
  effectiveDate: true,
  expiresAt: true,
  createdAt: true,
  packageType: { select: { name: true } },
  actorUser: { select: { email: true } },
} as const;

type SelectedHourPackage = {
  id: string;
  includedMinutes: number;
  pricePaidCents: number;
  paymentMethod: PaymentMethod;
  effectiveDate: Date;
  expiresAt: Date | null;
  createdAt: Date;
  packageType: { name: string };
  actorUser: { email: string };
};

/**
 * Single computation point for a sold package's residuo (AD-3, "totali
 * sempre SUM" — never a persisted counter). Extended by epic 5, story 5.2
 * (FR-13 consumo): `consumedMinutes` is the caller-supplied
 * `SUM(PackageConsumption.minutes)` for this package (0 for a freshly sold
 * one, or one nobody has flown against yet) — this function stays the ONE
 * place that turns "included minus consumed" into the residuo everyone else
 * reads (`sellPackage`, `listPersonPackages`, and
 * `flights.service.ts#registerFlight`'s own FIFO allocation all agree with
 * this formula).
 */
export function computeRemainingMinutes(pkg: { includedMinutes: number; consumedMinutes: number }): number {
  return pkg.includedMinutes - pkg.consumedMinutes;
}

function toListItem(pkg: SelectedHourPackage, includeActor: boolean, consumedMinutes: number): HourPackageListItem {
  const today = todayDateOnlyUtc();
  return {
    id: pkg.id,
    typeName: pkg.packageType.name,
    includedMinutes: pkg.includedMinutes,
    remainingMinutes: computeRemainingMinutes({ includedMinutes: pkg.includedMinutes, consumedMinutes }),
    consumedMinutes,
    pricePaidCents: pkg.pricePaidCents,
    paymentMethod: pkg.paymentMethod,
    effectiveDate: toDateOnlyString(pkg.effectiveDate),
    expiresAt: pkg.expiresAt ? toDateOnlyString(pkg.expiresAt) : null,
    isExpired: pkg.expiresAt !== null && pkg.expiresAt.getTime() < today.getTime(),
    createdAt: pkg.createdAt,
    ...(includeActor ? { actorEmail: pkg.actorUser.email } : {}),
  };
}

/**
 * Ownership pre-check shared with `listPersonPackages` — `people.read` (any
 * person) OR "own" access: `self.read` plus a matching `actor.personId`
 * (same own-access rule as `accounts.service.ts#assertReadAccess`, story
 * 3.2). Ownership is always resolved BEFORE any query touches the DB.
 */
function assertReadAccess(actor: Actor, personId: string): void {
  if (hasPermission(actor, 'people.read')) return;
  authorize(actor, 'self.read');
  if (actor.personId !== personId) {
    throw new ForbiddenError('Actor may only read their own packages.');
  }
}

/**
 * Sells a package to a person (AC 1). Write access: `finance.manage` — an
 * operazione di sportello, same as `recordTopUp`, NEVER `settings.manage`
 * (that guards the listino's own configuration, story 4.3).
 *
 * Guard order (Dev Notes): person exists -> 404; person archived -> 409;
 * `PackageType` exists -> 404; type `isActive: false` -> 409; the
 * "Pacchetti" cash category (active) is resolved BEFORE opening the
 * transaction — a missing/deactivated seed fails fast with an operational
 * `Error` (never silently created on the fly, same pattern as
 * `recordTopUp`'s "Ricariche" guard).
 *
 * ONE `prisma.$transaction`: upsert the `Account` (get-or-create, same
 * idempotent upsert as `recordTopUp`) -> `AccountMovement`
 * (`PACKAGE_PURCHASE`, `amountCents: 0`, see module doc) -> `HourPackage`
 * (snapshot `includedMinutes`/`pricePaidCents` from the type, `expiresAt`
 * materialized via `addMonthsClampUtc` when the type has a
 * `validityMonths`, linked to the movement via `accountMovementId`) ->
 * `CashMovement` (`amountCents: +pricePaidCents`, "Pacchetti" category, an
 * auto-generated description identifying the package/person — always
 * present regardless of the caller's optional `description`, unlike
 * `recordTopUp`'s cash twin which reuses the caller's text verbatim, linked
 * to the SAME `AccountMovement` for traceability, same twin pattern as the
 * top-up).
 *
 * Returns the created package plus the refreshed account overview (Dev
 * Notes: "restituisce il pacchetto creato + overview conto") — read through
 * `getAccountOverview` rather than a guard-free re-read: every actor with
 * `finance.manage` today (STAFF/ADMIN) also holds `people.read`, so this
 * never 403s in practice; if that decouples in the future this call needs
 * revisiting (same caveat `accounts.service.ts#buildOverview`'s doc-comment
 * flags for its own guard-free shortcut).
 */
export async function sellPackage(actor: Actor, personId: string, input: SellPackageInput): Promise<SellPackageResult> {
  authorize(actor, 'finance.manage');

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, firstName: true, lastName: true, archivedAt: true },
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }
  if (person.archivedAt !== null) {
    throw new ConflictError('Cannot sell a package to an archived person.');
  }

  const packageType = await prisma.packageType.findUnique({
    where: { id: input.packageTypeId },
    select: { id: true, name: true, includedMinutes: true, priceCents: true, validityMonths: true, isActive: true },
  });
  if (!packageType) {
    throw new NotFoundError('Package type not found.');
  }
  if (!packageType.isActive) {
    throw new ConflictError('This package type is inactive.');
  }

  // `isActive: true` in the WHERE (same rationale as `recordTopUp`): a
  // deactivated "Pacchetti" category must fail loudly here, not silently
  // record a cash movement under a category an admin just turned off.
  const category = await prisma.cashCategory.findUnique({
    where: { name: PACKAGE_CASH_CATEGORY_NAME, isActive: true },
    select: { id: true },
  });
  if (!category) {
    // Not a DomainError: a missing-or-deactivated seed category is an
    // operational misconfiguration, not something the caller can fix by
    // retrying with different input — surfaces as AD-8's generic 500.
    throw new Error(
      `Cash category "${PACKAGE_CASH_CATEGORY_NAME}" is missing or inactive — seed/reactivate it before selling packages.`,
    );
  }

  const effectiveDate = parseDateOnlyUtc(input.effectiveDate);
  const description = input.description ?? null;
  const expiresAt = packageType.validityMonths ? addMonthsClampUtc(effectiveDate, packageType.validityMonths) : null;
  const cashDescription = `Pacchetto ${packageType.name} — ${person.lastName} ${person.firstName}`;

  const created = await prisma.$transaction(async (tx) => {
    const account = await tx.account.upsert({
      where: { personId },
      create: { personId },
      update: {},
      select: { id: true },
    });

    const accountMovement = await tx.accountMovement.create({
      data: {
        accountId: account.id,
        type: 'PACKAGE_PURCHASE',
        // Closed transaction (module doc): the price/method live on the
        // HourPackage/CashMovement, never on the account balance.
        amountCents: 0,
        paymentMethod: input.paymentMethod,
        description,
        effectiveDate,
        actorUserId: actor.userId,
      },
      select: { id: true },
    });

    const hourPackage = await tx.hourPackage.create({
      data: {
        personId,
        packageTypeId: packageType.id,
        includedMinutes: packageType.includedMinutes,
        pricePaidCents: packageType.priceCents,
        paymentMethod: input.paymentMethod,
        effectiveDate,
        expiresAt,
        accountMovementId: accountMovement.id,
        actorUserId: actor.userId,
      },
      select: HOUR_PACKAGE_SELECT,
    });

    await tx.cashMovement.create({
      data: {
        categoryId: category.id,
        amountCents: packageType.priceCents,
        description: cashDescription,
        effectiveDate,
        actorUserId: actor.userId,
        accountMovementId: accountMovement.id,
      },
    });

    return hourPackage;
  });

  const includeActor = hasPermission(actor, 'people.read');
  const account = await getAccountOverview(actor, personId);

  // A package just sold this instant has no `PackageConsumption` rows yet —
  // 0 consumed, no query needed (unlike `listPersonPackages`, which must
  // aggregate across possibly-already-consumed packages).
  return { package: toListItem(created, includeActor, 0), account };
}

/**
 * Lists a person's sold packages, most recent sale first (AC 2). Access:
 * `people.read` (any person) OR own-access (`self.read` +
 * `actor.personId === personId`, checked BEFORE any query — same pattern as
 * `listAccountMovements`, story 3.2). An unknown person is a 404 (same
 * "never reveal via an implicit empty list" contract as
 * `listAccountMovements`); a person with no packages yet gets an empty
 * array. `actorEmail` is conditional on `people.read` (AC 2's operational
 * detail for staff).
 */
export async function listPersonPackages(actor: Actor, personId: string): Promise<HourPackageListItem[]> {
  assertReadAccess(actor, personId);

  const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }

  const includeActor = hasPermission(actor, 'people.read');

  const packages = await prisma.hourPackage.findMany({
    where: { personId },
    select: HOUR_PACKAGE_SELECT,
    // `id` tie-break: same-millisecond rows (batch imports/seeds) must not
    // make the order non-deterministic (same pattern as `buildOverview`).
    orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
    take: 500,
  });

  // ONE aggregated query for every listed package's consumed-so-far SUM
  // (epic 5, story 5.2) — never one query per package (Dev Notes: no N+1).
  const consumedRows =
    packages.length > 0
      ? await prisma.packageConsumption.groupBy({
          by: ['hourPackageId'],
          where: { hourPackageId: { in: packages.map((pkg) => pkg.id) } },
          _sum: { minutes: true },
        })
      : [];
  const consumedByPackageId = new Map(consumedRows.map((row) => [row.hourPackageId, row._sum.minutes ?? 0]));

  return packages.map((pkg) => toListItem(pkg, includeActor, consumedByPackageId.get(pkg.id) ?? 0));
}
