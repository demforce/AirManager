import { Prisma } from '@/generated/prisma/client';
import type { CurrencySettings } from '@/lib/currency';
import type {
  AirfieldBrandingDto,
  ClubIdentityDto,
  MembershipFeeSettingDto,
  MetarStationDto,
  SchedulingSettingsDto,
  SmtpSettingsDto,
  TreasurySettingsDto,
  UpdateSettingsInput,
} from '@/lib/schemas/settings';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import {
  getAirfieldBranding,
  getAirfieldContactEmail,
  getAirfieldIcao,
  getCurrencySettings,
  getMembershipFeeCents,
  getMetarStation,
  getSchedulingSettings,
  getSmtpSettings,
  getTreasurySettings,
  writeAirfieldBrandingCore,
  writeAirfieldContactEmailCore,
  writeAirfieldIcaoCore,
  writeCurrencySettingsCore,
  writeMembershipFeeCore,
  writeMetarStationCore,
  writeSchedulingSettingsCore,
  writeSmtpSettingsCore,
  writeTreasurySettingsCore,
} from './app-settings.service';
import { createCashCategoryCore, deleteCashCategoryCore, listCashCategories, updateCashCategoryCore, type CashCategoryListItem } from './cash.service';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { createExpiryTypeCore, deleteExpiryTypeCore, listExpiryTypes, updateExpiryTypeCore, type ExpiryTypeListItem } from './expiry-types.service';

/**
 * The Impostazioni page as ONE resource (story 19.8): one read for the page
 * and for the answer of its save, one atomic write for its single "Salva"
 * (A17, R-19-m). The rules themselves stay in the three services that own
 * them — this module only composes their `*Core(tx, …)` functions.
 */

export type SettingsSnapshot = {
  airfield: AirfieldBrandingDto;
  club: ClubIdentityDto;
  /** The station the admin TYPED: `''` = use the ICAO (the getter's own fallback, never shown as a value). */
  metarStation: MetarStationDto;
  membershipFee: MembershipFeeSettingDto;
  currency: CurrencySettings;
  scheduling: SchedulingSettingsDto;
  smtp: SmtpSettingsDto;
  treasury: TreasurySettingsDto;
  /** RATING and MEDICAL only — the membership-fee type is a system type (story 19.7a) and is never listed here. */
  expiryTypes: ExpiryTypeListItem[];
  cashCategories: CashCategoryListItem[];
};

/** `settings.manage`; every getter keeps its own gate (ADMIN holds them all). */
export async function getSettingsSnapshot(actor: Actor): Promise<SettingsSnapshot> {
  authorize(actor, 'settings.manage');

  const [airfield, icao, contactEmail, metarStation, annualFeeCents, currency, scheduling, smtp, treasury, expiryTypes, cashCategories] = await Promise.all([
    getAirfieldBranding(),
    getAirfieldIcao(),
    getAirfieldContactEmail(),
    getMetarStation(),
    getMembershipFeeCents(actor),
    getCurrencySettings(),
    getSchedulingSettings(),
    getSmtpSettings(actor),
    getTreasurySettings(actor),
    listExpiryTypes(actor, { includeInactive: true }),
    listCashCategories(actor, { includeInactive: true }),
  ]);

  return {
    airfield,
    club: { icao, contactEmail },
    // `getMetarStation` resolves the ICAO fallback: equal to the ICAO means
    // "no override", so the field starts EMPTY (story 12.11's own rule).
    metarStation: { station: metarStation === icao ? '' : metarStation },
    membershipFee: { annualFeeCents },
    currency,
    scheduling,
    smtp,
    treasury,
    expiryTypes: expiryTypes.filter((expiryType) => expiryType.kind !== 'MEMBERSHIP'),
    cashCategories,
  };
}

type ListName = 'expiryTypes' | 'cashCategories';
type ListOp = 'create' | 'update' | 'delete';

/** Which entry of the request a domain error belongs to — `index` is its position in the array SENT. */
export type SettingsListItemRef = { list: ListName; op: ListOp; index: number; id?: string };

/**
 * Re-throws a core's domain error with `details.item` added, same class and
 * code. A `NotFoundError` from an update becomes a 409 `NOT_FOUND`: the
 * `/settings` resource always exists, the ROW the request names does not.
 * Anything else passes through untouched.
 */
function withItem(error: unknown, item: SettingsListItemRef): unknown {
  if (error instanceof NotFoundError) {
    return new ConflictError(error.message, { reason: 'NOT_FOUND', item });
  }
  if (error instanceof ConflictError) {
    return new ConflictError(error.message, { ...error.details, item }, error.code);
  }
  if (error instanceof ValidationError) {
    return new ValidationError(error.message, { ...error.details, item }, error.code);
  }
  return error;
}

async function eachItem<T>(list: ListName, op: ListOp, entries: Iterable<[number, T]>, idOf: (item: T) => string | undefined, write: (item: T) => Promise<unknown>): Promise<void> {
  for (const [index, item] of entries) {
    try {
      await write(item);
    } catch (error) {
      const id = idOf(item);
      throw withItem(error, { list, op, index, ...(id !== undefined ? { id } : {}) });
    }
  }
}

/**
 * Locks EVERY existing row a list's `delete` and `update` name, in ONE query
 * ordered by id — the repo's multi-lock pattern (`bookings.service.ts#updateBooking`)
 * — before the first write of that list, and answers their current names.
 * Review 19.8 F2: the rows used to be locked one by one in the order of the
 * request's arrays, so two saves naming the same rows in opposite orders
 * deadlocked (40P01, a 500). A gone id is simply not locked: its `delete` is
 * a no-op and its `update` the 409 `NOT_FOUND`, as before.
 */
async function lockRows(tx: Prisma.TransactionClient, list: ListName, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows =
    list === 'expiryTypes'
      ? await tx.$queryRaw<{ id: string; name: string }[]>`SELECT "id", "name" FROM "ExpiryType" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`
      : await tx.$queryRaw<{ id: string; name: string }[]>`SELECT "id", "name" FROM "CashCategory" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  return new Map(rows.map((row) => [row.id, row.name]));
}

/**
 * The order a list's `update` entries are applied in (review 19.8 F4), each
 * with its index in the array SENT. A rename onto the name another row of
 * the same save gives up ("A takes B's name, B is renamed to C") runs after
 * that row's own rename, so the outcome no longer depends on which of the
 * two comes first in the array. A cycle — two rows swapping their names —
 * has no such order: it stays the documented 409 `NAME_TAKEN`.
 */
function updateOrder<T extends { id: string; name?: string }>(items: T[], currentNames: Map<string, string>): [number, T][] {
  const entries = items.map((item, index): [number, T] => [index, item]);
  // Who holds, today, each name a rename gives up: one row at most (the name is unique).
  const holderOf = new Map<string, [number, T]>();
  for (const entry of entries) {
    const current = currentNames.get(entry[1].id);
    if (entry[1].name !== undefined && current !== undefined) holderOf.set(current, entry);
  }

  const ordered: [number, T][] = [];
  const seen = new Set<[number, T]>();
  const visit = (entry: [number, T]): void => {
    if (seen.has(entry)) return;
    seen.add(entry);
    const holder = entry[1].name !== undefined ? holderOf.get(entry[1].name) : undefined;
    if (holder) visit(holder);
    ordered.push(entry);
  };
  entries.forEach(visit);
  return ordered;
}

/**
 * Postgres aborted the transaction to break a lock cycle (40P01, `deadlock
 * detected`) or a write conflict (Prisma's P2034). The lock order of
 * {@link lockRows} rules it out for the rows a save names; what is left
 * (two saves CREATING the same names in opposite orders, which wait on each
 * other's uncommitted unique-index entries) is a 409 the client can retry,
 * never a 500 (review 19.8 F2). Prisma surfaces the code as the driver
 * adapter's `originalCode`: on the error's `cause` for a model query, under
 * `meta.driverAdapterError` for a raw one (P2010).
 */
function isTransactionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, cause, meta } = error as { code?: unknown; cause?: { originalCode?: unknown }; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } };
  return code === 'P2034' || cause?.originalCode === '40P01' || meta?.driverAdapterError?.cause?.originalCode === '40P01';
}

/**
 * Saves the page (story 19.8, AD-2): `settings.manage` once, before any
 * query; then every block PRESENT in `patch` (absent = untouched) in ONE
 * transaction — the scalar blocks, then each list as `delete → update →
 * create`, so "delete X, create a new X" and "rename A to B, create A" are
 * legal in one save — and so is a chain of renames, whatever its order in the
 * array ({@link updateOrder}). The first refused row rolls EVERYTHING back, scalar
 * blocks included: nothing is ever saved by half. Answers the snapshot read
 * after the commit.
 */
export async function saveSettings(actor: Actor, patch: UpdateSettingsInput): Promise<SettingsSnapshot> {
  authorize(actor, 'settings.manage');

  try {
    await prisma.$transaction(async (tx) => {
      if (patch.airfield) await writeAirfieldBrandingCore(tx, patch.airfield);
      if (patch.club) {
        await writeAirfieldIcaoCore(tx, patch.club.icao);
        await writeAirfieldContactEmailCore(tx, patch.club.contactEmail);
      }
      if (patch.metarStation) await writeMetarStationCore(tx, patch.metarStation.station);
      if (patch.membershipFee) await writeMembershipFeeCore(tx, patch.membershipFee.annualFeeCents);
      if (patch.currency) await writeCurrencySettingsCore(tx, patch.currency);
      if (patch.scheduling) await writeSchedulingSettingsCore(tx, patch.scheduling);
      if (patch.smtp) await writeSmtpSettingsCore(tx, patch.smtp);
      if (patch.treasury) await writeTreasurySettingsCore(tx, patch.treasury);

      const expiryTypes = patch.expiryTypes;
      if (expiryTypes) {
        const typeNames = await lockRows(tx, 'expiryTypes', [...(expiryTypes.delete ?? []), ...(expiryTypes.update ?? []).map((item) => item.id)]);
        await eachItem('expiryTypes', 'delete', (expiryTypes.delete ?? []).entries(), (id) => id, (id) => deleteExpiryTypeCore(tx, id, { missingOk: true }));
        await eachItem('expiryTypes', 'update', updateOrder(expiryTypes.update ?? [], typeNames), (item) => item.id, ({ id, ...input }) => updateExpiryTypeCore(tx, id, input));
        await eachItem('expiryTypes', 'create', (expiryTypes.create ?? []).entries(), () => undefined, (input) => createExpiryTypeCore(tx, input));
      }

      const cashCategories = patch.cashCategories;
      if (cashCategories) {
        const categoryNames = await lockRows(tx, 'cashCategories', [...(cashCategories.delete ?? []), ...(cashCategories.update ?? []).map((item) => item.id)]);
        await eachItem('cashCategories', 'delete', (cashCategories.delete ?? []).entries(), (id) => id, (id) => deleteCashCategoryCore(tx, id, { missingOk: true }));
        await eachItem('cashCategories', 'update', updateOrder(cashCategories.update ?? [], categoryNames), (item) => item.id, ({ id, ...input }) => updateCashCategoryCore(tx, id, input));
        await eachItem('cashCategories', 'create', (cashCategories.create ?? []).entries(), () => undefined, (input) => createCashCategoryCore(tx, input));
      }
    });
  } catch (error) {
    if (isTransactionConflict(error)) {
      throw new ConflictError('Another save changed the same entries at the same moment: nothing was saved, try again.', { reason: 'CONCURRENT_SAVE' });
    }
    throw error;
  }

  return getSettingsSnapshot(actor);
}
