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

async function eachItem<T>(list: ListName, op: ListOp, items: T[] | undefined, idOf: (item: T) => string | undefined, write: (item: T) => Promise<unknown>): Promise<void> {
  for (const [index, item] of (items ?? []).entries()) {
    try {
      await write(item);
    } catch (error) {
      const id = idOf(item);
      throw withItem(error, { list, op, index, ...(id !== undefined ? { id } : {}) });
    }
  }
}

/**
 * Saves the page (story 19.8, AD-2): `settings.manage` once, before any
 * query; then every block PRESENT in `patch` (absent = untouched) in ONE
 * transaction — the scalar blocks, then each list as `delete → update →
 * create`, so "delete X, create a new X" and "rename A to B, create A" are
 * legal in one save. The first refused row rolls EVERYTHING back, scalar
 * blocks included: nothing is ever saved by half. Answers the snapshot read
 * after the commit.
 */
export async function saveSettings(actor: Actor, patch: UpdateSettingsInput): Promise<SettingsSnapshot> {
  authorize(actor, 'settings.manage');

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
    await eachItem('expiryTypes', 'delete', expiryTypes?.delete, (id) => id, (id) => deleteExpiryTypeCore(tx, id, { missingOk: true }));
    await eachItem('expiryTypes', 'update', expiryTypes?.update, (item) => item.id, ({ id, ...input }) => updateExpiryTypeCore(tx, id, input));
    await eachItem('expiryTypes', 'create', expiryTypes?.create, () => undefined, (input) => createExpiryTypeCore(tx, input));

    const cashCategories = patch.cashCategories;
    await eachItem('cashCategories', 'delete', cashCategories?.delete, (id) => id, (id) => deleteCashCategoryCore(tx, id, { missingOk: true }));
    await eachItem('cashCategories', 'update', cashCategories?.update, (item) => item.id, ({ id, ...input }) => updateCashCategoryCore(tx, id, input));
    await eachItem('cashCategories', 'create', cashCategories?.create, () => undefined, (input) => createCashCategoryCore(tx, input));
  });

  return getSettingsSnapshot(actor);
}
