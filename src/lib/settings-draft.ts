import { z } from 'zod';
import { CURRENCY_LIMITS } from '@/lib/currency';
import { parseCents } from '@/lib/money';
import type { UpdateSettingsBody } from '@/lib/schemas/settings';

/**
 * Client side of the Impostazioni single "Salva" (story 19.8, AD-9): the
 * page holds a BASELINE (what is saved) and a DRAFT (what is on screen), both
 * built by {@link toDraft}; the Salva sends only what differs (D-3) as ONE
 * `PATCH /api/v1/settings`, and routes its error back to the field or the row
 * that caused it (AD-5).
 *
 * Pure and client-safe: `@/lib/schemas/settings` is imported for its TYPES
 * only (it drags `@/lib/env` in at runtime) — the rules a client can mirror
 * are re-stated here, the one it cannot (the SMTP host SSRF check, which
 * depends on `env.SMTP_HOST`) stays the server's, as a 422 on `smtp.host`.
 */

export type ExpiryScope = 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' | 'ALL';
export type SmtpSecurity = 'NONE' | 'STARTTLS' | 'SSL_TLS';

/** The snapshot as the page receives it (`settings.service.ts#getSettingsSnapshot`, or the PATCH's JSON answer) — only the fields this module reads. */
export type SettingsSnapshotData = {
  airfield: { name: string };
  club: { icao: string; contactEmail: string };
  metarStation: { station: string };
  membershipFee: { annualFeeCents: number };
  currency: { minFlights: number; windowDays: number };
  scheduling: { openTime: string | null; closeTime: string | null; minSlotMinutes: number | null; turnaroundMinutes: number | null; maxAdvanceDays: number | null };
  smtp: { host: string | null; port: number | null; security: SmtpSecurity | null; user: string | null; from: string | null; hasPassword: boolean };
  treasury: { openingCashCents: number; openingBankCents: number; openingDate: string | null };
  expiryTypes: { id: string; name: string; scope: ExpiryScope; kind: 'RATING' | 'MEDICAL' | 'MEMBERSHIP'; isActive: boolean; blocksBooking: boolean; validityMonths: number | null }[];
  cashCategories: { id: string; name: string; isActive: boolean; movementCount: number; isSystem: boolean }[];
};

/** One catalogue entry on screen. No `id` = created in this draft; `rowKey` is stable either way (the id of a saved row). */
export type ExpiryTypeDraftItem = {
  rowKey: string;
  id?: string;
  kind: 'RATING' | 'MEDICAL';
  name: string;
  scope: ExpiryScope;
  validityMonths: string;
  blocksBooking: boolean;
  isActive: boolean;
  removed: boolean;
};

export type CashCategoryDraftItem = {
  rowKey: string;
  id?: string;
  name: string;
  isActive: boolean;
  removed: boolean;
  movementCount: number;
  isSystem: boolean;
};

/** The page's values as the inputs hold them (strings), one key per section in page order (D-10). */
export type SettingsDraft = {
  club: { name: string; icao: string; contactEmail: string; metarStation: string };
  membership: { fee: string };
  currency: { minFlights: string; windowDays: string };
  scheduling: { openTime: string; closeTime: string; minSlotMinutes: string; turnaroundMinutes: string; maxAdvanceDays: string };
  smtp: { host: string; port: string; security: SmtpSecurity; from: string; user: string; pass: string; hasPassword: boolean };
  treasury: { cash: string; bank: string; date: string };
  ratings: ExpiryTypeDraftItem[];
  medical: ExpiryTypeDraftItem[];
  cashCategories: CashCategoryDraftItem[];
};

export type SettingsSection = keyof SettingsDraft;

export const SETTINGS_SECTIONS: readonly SettingsSection[] = ['club', 'membership', 'currency', 'scheduling', 'smtp', 'treasury', 'ratings', 'medical', 'cashCategories'];

type ScalarSection = Exclude<SettingsSection, 'ratings' | 'medical' | 'cashCategories'>;

/**
 * The wire path (`PATCH` body / 422 `fieldErrors` key) of every scalar
 * input — ONE vocabulary for the client checks and the server's answer.
 */
export const FIELD_PATHS = {
  club: { name: 'airfield.name', icao: 'club.icao', contactEmail: 'club.contactEmail', metarStation: 'metarStation.station' },
  membership: { fee: 'membershipFee.annualFeeCents' },
  currency: { minFlights: 'currency.minFlights', windowDays: 'currency.windowDays' },
  scheduling: {
    openTime: 'scheduling.openTime',
    closeTime: 'scheduling.closeTime',
    minSlotMinutes: 'scheduling.minSlotMinutes',
    turnaroundMinutes: 'scheduling.turnaroundMinutes',
    maxAdvanceDays: 'scheduling.maxAdvanceDays',
  },
  smtp: { host: 'smtp.host', port: 'smtp.port', security: 'smtp.security', from: 'smtp.from', user: 'smtp.user', pass: 'smtp.pass' },
  treasury: { cash: 'treasury.openingCashCents', bank: 'treasury.openingBankCents', date: 'treasury.openingDate' },
} as const satisfies { [S in ScalarSection]: Partial<Record<keyof SettingsDraft[S], string>> };

/** 1:1 default of the prototype's own `defaults.sched` (`SettingsView.jsx:10`) — shown when nothing is configured yet, never written implicitly (a draft equal to it is clean). */
export const SCHEDULING_DEFAULTS = { openTime: '07:00', closeTime: '21:00', minSlotMinutes: '60', turnaroundMinutes: '15', maxAdvanceDays: '30' };

/** What the SMTP section shows before anything is configured — same "shown, never written" rule. */
export const SMTP_DEFAULTS = { port: '587', security: 'STARTTLS' as SmtpSecurity };

/** Bounds of `schedulingSettingsSchema` / `expiryTypeValidityMonthsSchema` / `smtpSettingsInputSchema.port`, mirrored (the server keeps the last word). */
const LIMITS = {
  minSlotMinutes: { min: 1, max: 1440 },
  turnaroundMinutes: { min: 0, max: 1440 },
  maxAdvanceDays: { min: 1, max: 3650 },
  port: { min: 1, max: 65535 },
  validityMonths: { min: 0, max: 600 },
  minFlights: CURRENCY_LIMITS.minFlights,
  windowDays: CURRENCY_LIMITS.windowDays,
} as const;

/** The `Int` ceiling every stored cents amount is capped at (AD-2). */
const MAX_CENTS = 2_147_483_647;

/** Both faces of the page give two decimals to an amount: `60` and `60.00` are the SAME value (trap 4), compared in cents below. */
function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function toDraft(snapshot: SettingsSnapshotData): SettingsDraft {
  const expiryItem = (expiryType: SettingsSnapshotData['expiryTypes'][number], kind: 'RATING' | 'MEDICAL'): ExpiryTypeDraftItem => ({
    rowKey: expiryType.id,
    id: expiryType.id,
    kind,
    name: expiryType.name,
    scope: expiryType.scope,
    validityMonths: String(expiryType.validityMonths ?? 0),
    blocksBooking: expiryType.blocksBooking,
    isActive: expiryType.isActive,
    removed: false,
  });
  const { scheduling, smtp, treasury } = snapshot;

  return {
    club: { name: snapshot.airfield.name, icao: snapshot.club.icao, contactEmail: snapshot.club.contactEmail, metarStation: snapshot.metarStation.station },
    membership: { fee: centsToInput(snapshot.membershipFee.annualFeeCents) },
    currency: { minFlights: String(snapshot.currency.minFlights), windowDays: String(snapshot.currency.windowDays) },
    scheduling: {
      openTime: scheduling.openTime ?? SCHEDULING_DEFAULTS.openTime,
      closeTime: scheduling.closeTime ?? SCHEDULING_DEFAULTS.closeTime,
      minSlotMinutes: String(scheduling.minSlotMinutes ?? SCHEDULING_DEFAULTS.minSlotMinutes),
      turnaroundMinutes: String(scheduling.turnaroundMinutes ?? SCHEDULING_DEFAULTS.turnaroundMinutes),
      maxAdvanceDays: String(scheduling.maxAdvanceDays ?? SCHEDULING_DEFAULTS.maxAdvanceDays),
    },
    smtp: {
      host: smtp.host ?? '',
      port: String(smtp.port ?? SMTP_DEFAULTS.port),
      security: smtp.security ?? SMTP_DEFAULTS.security,
      from: smtp.from ?? '',
      user: smtp.user ?? '',
      pass: '',
      hasPassword: smtp.hasPassword,
    },
    treasury: { cash: centsToInput(treasury.openingCashCents), bank: centsToInput(treasury.openingBankCents), date: treasury.openingDate ?? '' },
    ratings: snapshot.expiryTypes.filter((expiryType) => expiryType.kind === 'RATING').map((expiryType) => expiryItem(expiryType, 'RATING')),
    medical: snapshot.expiryTypes.filter((expiryType) => expiryType.kind === 'MEDICAL').map((expiryType) => expiryItem(expiryType, 'MEDICAL')),
    cashCategories: snapshot.cashCategories.map((category) => ({
      rowKey: category.id,
      id: category.id,
      name: category.name,
      isActive: category.isActive,
      removed: false,
      movementCount: category.movementCount,
      isSystem: category.isSystem,
    })),
  };
}

// --- values as they SAVE ------------------------------------------------------
// An input that does not parse keeps its raw string: it then differs from any
// saved value (the block reads as changed, so the Salva enables and the check
// below names the field) and never passes for a valid number.

function centsOrRaw(value: string): number | string {
  try {
    return parseCents(value);
  } catch {
    return value;
  }
}

function integerOrRaw(value: string): number | string {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
}

/** `validityMonths` as `createExpiryType` stores it: `0` and empty both mean "no expiry" (`null`). */
function validityOrRaw(value: string): number | null | string {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return value;
  const months = Number(trimmed);
  return months > 0 ? months : null;
}

const scalarPayloads = {
  airfield: (draft: SettingsDraft) => ({ name: draft.club.name.trim() }),
  club: (draft: SettingsDraft) => ({ icao: draft.club.icao.trim().toUpperCase(), contactEmail: draft.club.contactEmail.trim().toLowerCase() }),
  metarStation: (draft: SettingsDraft) => ({ station: draft.club.metarStation.trim().toUpperCase() }),
  membershipFee: (draft: SettingsDraft) => ({ annualFeeCents: centsOrRaw(draft.membership.fee) }),
  currency: (draft: SettingsDraft) => ({ minFlights: integerOrRaw(draft.currency.minFlights), windowDays: integerOrRaw(draft.currency.windowDays) }),
  scheduling: (draft: SettingsDraft) => ({
    openTime: draft.scheduling.openTime,
    closeTime: draft.scheduling.closeTime,
    minSlotMinutes: integerOrRaw(draft.scheduling.minSlotMinutes),
    turnaroundMinutes: integerOrRaw(draft.scheduling.turnaroundMinutes),
    maxAdvanceDays: integerOrRaw(draft.scheduling.maxAdvanceDays),
  }),
  smtp: (draft: SettingsDraft) => ({
    host: draft.smtp.host.trim(),
    port: integerOrRaw(draft.smtp.port),
    security: draft.smtp.security,
    user: draft.smtp.user.trim(),
    from: draft.smtp.from.trim(),
  }),
  treasury: (draft: SettingsDraft) => ({
    openingCashCents: centsOrRaw(draft.treasury.cash),
    openingBankCents: centsOrRaw(draft.treasury.bank),
    openingDate: draft.treasury.date,
  }),
};

type ScalarBlock = keyof typeof scalarPayloads;

const SECTION_OF_BLOCK: Record<ScalarBlock, ScalarSection> = {
  airfield: 'club',
  club: 'club',
  metarStation: 'club',
  membershipFee: 'membership',
  currency: 'currency',
  scheduling: 'scheduling',
  smtp: 'smtp',
  treasury: 'treasury',
};

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** The block's own rule on top of its values: a typed SMTP password is a change (the saved one is never on screen to compare against). */
function scalarBlockChanged(block: ScalarBlock, baseline: SettingsDraft, draft: SettingsDraft): boolean {
  if (block === 'smtp' && draft.smtp.pass !== '') return true;
  return !sameValue(scalarPayloads[block](draft), scalarPayloads[block](baseline));
}

// --- rows ---------------------------------------------------------------------

export type RowState = 'saved' | 'new' | 'changed' | 'removed';

type ExpiryTypeUpdate = { name?: string; scope?: ExpiryScope; blocksBooking?: boolean; validityMonths?: number | null; isActive?: boolean };

/** Only the fields that differ from the saved row — and never `scope`/`blocksBooking` for a visit (story 19.7a: a MEDICAL type has neither). */
function expiryTypeChanges(item: ExpiryTypeDraftItem, saved: ExpiryTypeDraftItem): ExpiryTypeUpdate {
  const changes: Record<string, unknown> = {};
  if (item.name.trim() !== saved.name.trim()) changes['name'] = item.name.trim();
  if (item.kind === 'RATING' && item.scope !== saved.scope) changes['scope'] = item.scope;
  if (item.kind === 'RATING' && item.blocksBooking !== saved.blocksBooking) changes['blocksBooking'] = item.blocksBooking;
  if (!sameValue(validityOrRaw(item.validityMonths), validityOrRaw(saved.validityMonths))) changes['validityMonths'] = validityOrRaw(item.validityMonths);
  if (item.isActive !== saved.isActive) changes['isActive'] = item.isActive;
  return changes as ExpiryTypeUpdate;
}

function cashCategoryChanges(item: CashCategoryDraftItem, saved: CashCategoryDraftItem): { name?: string; isActive?: boolean } {
  const changes: { name?: string; isActive?: boolean } = {};
  if (item.name.trim() !== saved.name.trim()) changes.name = item.name.trim();
  if (item.isActive !== saved.isActive) changes.isActive = item.isActive;
  return changes;
}

function stateOf<T extends { id?: string; removed: boolean }>(item: T, saved: T | undefined, changes: (item: T, saved: T) => object): RowState {
  if (item.id === undefined || saved === undefined) return 'new';
  if (item.removed) return 'removed';
  return Object.keys(changes(item, saved)).length > 0 ? 'changed' : 'saved';
}

export function expiryTypeRowState(item: ExpiryTypeDraftItem, saved: ExpiryTypeDraftItem | undefined): RowState {
  return stateOf(item, saved, expiryTypeChanges);
}

export function cashCategoryRowState(item: CashCategoryDraftItem, saved: CashCategoryDraftItem | undefined): RowState {
  return stateOf(item, saved, cashCategoryChanges);
}

function byId<T extends { id?: string }>(items: T[]): Map<string, T> {
  return new Map(items.flatMap((item) => (item.id !== undefined ? [[item.id, item] as const] : [])));
}

// --- the patch ----------------------------------------------------------------

type ListIndex = { create: string[]; update: string[]; delete: string[] };

/** Which row each array entry of the request came from (trap 8: an error's `index` refers to the array SENT, not to the draft as it is now). */
export type SettingsPatchIndex = { expiryTypes: ListIndex; cashCategories: ListIndex };

export type SettingsPatch = { body: UpdateSettingsBody; index: SettingsPatchIndex };

type ExpiryTypesBlock = NonNullable<UpdateSettingsBody['expiryTypes']>;
type CashCategoriesBlock = NonNullable<UpdateSettingsBody['cashCategories']>;

function expiryTypesBlock(baseline: SettingsDraft, draft: SettingsDraft): { block: ExpiryTypesBlock; index: ListIndex } {
  const saved = byId([...baseline.ratings, ...baseline.medical]);
  const block: Required<ExpiryTypesBlock> = { create: [], update: [], delete: [] };
  const index: ListIndex = { create: [], update: [], delete: [] };
  for (const item of [...draft.ratings, ...draft.medical]) {
    const savedItem = item.id !== undefined ? saved.get(item.id) : undefined;
    if (item.id === undefined || savedItem === undefined) {
      // A visit sends neither scope nor blocksBooking: the server fixes both (19.7a, R-19-j).
      block.create.push(
        item.kind === 'MEDICAL'
          ? { name: item.name.trim(), kind: 'MEDICAL', validityMonths: validityOrRaw(item.validityMonths) as number | null }
          : { name: item.name.trim(), kind: 'RATING', scope: item.scope, blocksBooking: item.blocksBooking, validityMonths: validityOrRaw(item.validityMonths) as number | null },
      );
      index.create.push(item.rowKey);
    } else if (item.removed) {
      block.delete.push(item.id);
      index.delete.push(item.rowKey);
    } else {
      const changes = expiryTypeChanges(item, savedItem);
      if (Object.keys(changes).length > 0) {
        block.update.push({ id: item.id, ...changes });
        index.update.push(item.rowKey);
      }
    }
  }
  return { block, index };
}

function cashCategoriesBlock(baseline: SettingsDraft, draft: SettingsDraft): { block: CashCategoriesBlock; index: ListIndex } {
  const saved = byId(baseline.cashCategories);
  const block: Required<CashCategoriesBlock> = { create: [], update: [], delete: [] };
  const index: ListIndex = { create: [], update: [], delete: [] };
  for (const item of draft.cashCategories) {
    const savedItem = item.id !== undefined ? saved.get(item.id) : undefined;
    if (item.id === undefined || savedItem === undefined) {
      block.create.push({ name: item.name.trim() });
      index.create.push(item.rowKey);
    } else if (item.removed) {
      block.delete.push(item.id);
      index.delete.push(item.rowKey);
    } else {
      const changes = cashCategoryChanges(item, savedItem);
      if (Object.keys(changes).length > 0) {
        block.update.push({ id: item.id, ...changes });
        index.update.push(item.rowKey);
      }
    }
  }
  return { block, index };
}

/** Keeps only the non-empty operation arrays; `null` when the list has nothing to save. */
function compactList<T extends { create: unknown[]; update: unknown[]; delete: unknown[] }>(block: T): Partial<T> | null {
  const out: Partial<T> = {};
  for (const op of ['create', 'update', 'delete'] as const) {
    if (block[op].length > 0) out[op] = block[op];
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * D-3: only the blocks the user touched — a scalar block WHOLE as soon as one
 * of its fields would save differently, a list as its created / changed
 * (only the changed fields) / deleted rows. `null` = nothing to save.
 */
export function buildSettingsPatch(baseline: SettingsDraft, draft: SettingsDraft): SettingsPatch | null {
  const body: Record<string, unknown> = {};
  for (const block of Object.keys(scalarPayloads) as ScalarBlock[]) {
    if (!scalarBlockChanged(block, baseline, draft)) continue;
    body[block] = block === 'smtp' && draft.smtp.pass !== '' ? { ...scalarPayloads.smtp(draft), pass: draft.smtp.pass } : scalarPayloads[block](draft);
  }

  const expiryTypes = expiryTypesBlock(baseline, draft);
  const cashCategories = cashCategoriesBlock(baseline, draft);
  const expiryTypesBody = compactList(expiryTypes.block as Required<ExpiryTypesBlock>);
  const cashCategoriesBody = compactList(cashCategories.block as Required<CashCategoriesBlock>);
  if (expiryTypesBody) body['expiryTypes'] = expiryTypesBody;
  if (cashCategoriesBody) body['cashCategories'] = cashCategoriesBody;

  if (Object.keys(body).length === 0) return null;
  return { body: body as UpdateSettingsBody, index: { expiryTypes: expiryTypes.index, cashCategories: cashCategories.index } };
}

/** The sections with something to save, in page order — what the save bar lists. */
export function dirtySections(baseline: SettingsDraft, draft: SettingsDraft): SettingsSection[] {
  const dirty = new Set<SettingsSection>();
  for (const block of Object.keys(scalarPayloads) as ScalarBlock[]) {
    if (scalarBlockChanged(block, baseline, draft)) dirty.add(SECTION_OF_BLOCK[block]);
  }
  const savedTypes = byId([...baseline.ratings, ...baseline.medical]);
  for (const section of ['ratings', 'medical'] as const) {
    if (draft[section].some((item) => expiryTypeRowState(item, item.id ? savedTypes.get(item.id) : undefined) !== 'saved')) dirty.add(section);
  }
  const savedCategories = byId(baseline.cashCategories);
  if (draft.cashCategories.some((item) => cashCategoryRowState(item, item.id ? savedCategories.get(item.id) : undefined) !== 'saved')) dirty.add('cashCategories');
  return SETTINGS_SECTIONS.filter((section) => dirty.has(section));
}

/**
 * D-9: the test email goes through the SAVED mailer to the SAVED contact, so
 * it waits while either still has changes on screen.
 */
export function testEmailBlocked(baseline: SettingsDraft, draft: SettingsDraft): boolean {
  return scalarBlockChanged('smtp', baseline, draft) || scalarPayloads.club(draft).contactEmail !== scalarPayloads.club(baseline).contactEmail;
}

// --- errors -------------------------------------------------------------------

export type SettingsErrorMessage =
  | {
      key:
        | 'required'
        | 'invalidEmail'
        | 'invalidRange'
        | 'invalidHost'
        | 'invalidAmount'
        | 'requiredDate'
        | 'invalidValue'
        | 'duplicateName'
        | 'duplicateNameOtherList'
        | 'nameTaken'
        | 'nameReserved'
        | 'inUse'
        | 'systemCategory'
        | 'stale'
        | 'invalidItem';
    }
  | { key: 'integerRange'; min: number; max: number };

/** A refused row: the message, and which input of its panel it names (`null` = the row as a whole). */
export type SettingsItemError = { field: 'name' | 'validity' | null; message: SettingsErrorMessage };

export type SettingsErrors = {
  /** By wire path (`FIELD_PATHS`). */
  fields: Record<string, SettingsErrorMessage>;
  /** By `rowKey`. */
  items: Record<string, SettingsItemError>;
  /** The save bar's own message: nothing more precise to show, or the reason nothing was saved. */
  bar: 'checkFields' | 'forbidden' | 'generic' | null;
};

export const NO_SETTINGS_ERRORS: SettingsErrors = { fields: {}, items: {}, bar: null };

export function hasSettingsErrors(errors: SettingsErrors): boolean {
  return Object.keys(errors.fields).length > 0 || Object.keys(errors.items).length > 0 || errors.bar !== null;
}

function integerError(value: string, limits: { min: number; max: number }): SettingsErrorMessage | null {
  const parsed = integerOrRaw(value);
  return typeof parsed === 'number' && parsed >= limits.min && parsed <= limits.max ? null : { key: 'integerRange', min: limits.min, max: limits.max };
}

function amountError(value: string, allowNegative: boolean): SettingsErrorMessage | null {
  const cents = centsOrRaw(value);
  if (typeof cents !== 'number' || Math.abs(cents) > MAX_CENTS || (!allowNegative && cents < 0)) return { key: 'invalidAmount' };
  return null;
}

/**
 * `listOf` names the on-screen list of an entry when ONE name space spans two
 * lists (Ratings and Visite mediche): a name already used only in the OTHER
 * list says so (review 19.8 F6) instead of "in this list".
 */
function validateList<T extends { rowKey: string; id?: string; name: string; removed: boolean }>(
  items: T[],
  isDirty: (item: T) => boolean,
  validityOf: ((item: T) => string) | null,
  errors: Record<string, SettingsItemError>,
  listOf: (item: T) => string = () => '',
): void {
  const live = items.filter((item) => !item.removed);
  const counts = new Map<string, number>();
  for (const item of live) counts.set(item.name.trim(), (counts.get(item.name.trim()) ?? 0) + 1);
  for (const item of live) {
    if (!isDirty(item)) continue;
    const name = item.name.trim();
    if (name === '') errors[item.rowKey] = { field: 'name', message: { key: 'required' } };
    else if ((counts.get(name) ?? 0) > 1) {
      const sameList = live.some((other) => other !== item && other.name.trim() === name && listOf(other) === listOf(item));
      errors[item.rowKey] = { field: 'name', message: { key: sameList ? 'duplicateName' : 'duplicateNameOtherList' } };
    } else if (validityOf) {
      const validity = validityOrRaw(validityOf(item));
      if (typeof validity === 'string' || (validity !== null && validity > LIMITS.validityMonths.max)) {
        errors[item.rowKey] = { field: 'validity', message: { key: 'integerRange', ...LIMITS.validityMonths } };
      }
    }
  }
}

/**
 * The mirror of the rules a client can check (AD-9), applied to the blocks
 * the Salva is about to send only: a value saved long ago and untouched
 * since is not this save's business.
 */
export function validateDraft(baseline: SettingsDraft, draft: SettingsDraft, patch: SettingsPatch): SettingsErrors {
  const fields: Record<string, SettingsErrorMessage> = {};
  const set = (path: string, message: SettingsErrorMessage | null): void => {
    if (message) fields[path] = message;
  };
  const body = patch.body;

  if (body.airfield) set(FIELD_PATHS.club.name, draft.club.name.trim() === '' ? { key: 'required' } : null);
  if (body.club) {
    const email = draft.club.contactEmail.trim().toLowerCase();
    set(FIELD_PATHS.club.contactEmail, email !== '' && !z.email().safeParse(email).success ? { key: 'invalidEmail' } : null);
  }
  if (body.membershipFee) set(FIELD_PATHS.membership.fee, amountError(draft.membership.fee, false));
  if (body.currency) {
    set(FIELD_PATHS.currency.minFlights, integerError(draft.currency.minFlights, LIMITS.minFlights));
    set(FIELD_PATHS.currency.windowDays, integerError(draft.currency.windowDays, LIMITS.windowDays));
  }
  if (body.scheduling) {
    const { openTime, closeTime } = draft.scheduling;
    set(FIELD_PATHS.scheduling.openTime, openTime === '' ? { key: 'required' } : null);
    set(FIELD_PATHS.scheduling.closeTime, closeTime === '' ? { key: 'required' } : openTime !== '' && closeTime <= openTime ? { key: 'invalidRange' } : null);
    set(FIELD_PATHS.scheduling.minSlotMinutes, integerError(draft.scheduling.minSlotMinutes, LIMITS.minSlotMinutes));
    set(FIELD_PATHS.scheduling.turnaroundMinutes, integerError(draft.scheduling.turnaroundMinutes, LIMITS.turnaroundMinutes));
    set(FIELD_PATHS.scheduling.maxAdvanceDays, integerError(draft.scheduling.maxAdvanceDays, LIMITS.maxAdvanceDays));
  }
  if (body.smtp) {
    set(FIELD_PATHS.smtp.host, draft.smtp.host.trim() === '' ? { key: 'required' } : null);
    set(FIELD_PATHS.smtp.port, integerError(draft.smtp.port, LIMITS.port));
    set(FIELD_PATHS.smtp.from, draft.smtp.from.trim() === '' ? { key: 'required' } : null);
  }
  if (body.treasury) {
    set(FIELD_PATHS.treasury.cash, amountError(draft.treasury.cash, true));
    set(FIELD_PATHS.treasury.bank, amountError(draft.treasury.bank, true));
    set(FIELD_PATHS.treasury.date, draft.treasury.date.trim() === '' ? { key: 'requiredDate' } : null);
  }

  const items: Record<string, SettingsItemError> = {};
  const savedTypes = byId([...baseline.ratings, ...baseline.medical]);
  // ONE name space for both catalogues (the `ExpiryType.name` unique key spans every kind).
  validateList(
    [...draft.ratings, ...draft.medical],
    (item) => expiryTypeRowState(item, item.id ? savedTypes.get(item.id) : undefined) !== 'saved',
    (item) => item.validityMonths,
    items,
    (item) => item.kind,
  );
  const savedCategories = byId(baseline.cashCategories);
  validateList(draft.cashCategories, (item) => cashCategoryRowState(item, item.id ? savedCategories.get(item.id) : undefined) !== 'saved', null, items);

  const errors: SettingsErrors = { fields, items, bar: null };
  return hasSettingsErrors(errors) ? { ...errors, bar: 'checkFields' } : errors;
}

/** The message a refused scalar field shows — the server's key names WHICH field; the client knows the one reason each can be refused for. */
const SERVER_FIELD_MESSAGES: Record<string, SettingsErrorMessage> = {
  [FIELD_PATHS.club.name]: { key: 'required' },
  [FIELD_PATHS.club.contactEmail]: { key: 'invalidEmail' },
  [FIELD_PATHS.scheduling.closeTime]: { key: 'invalidRange' },
  [FIELD_PATHS.smtp.host]: { key: 'invalidHost' },
  [FIELD_PATHS.membership.fee]: { key: 'invalidAmount' },
  [FIELD_PATHS.treasury.cash]: { key: 'invalidAmount' },
  [FIELD_PATHS.treasury.bank]: { key: 'invalidAmount' },
  [FIELD_PATHS.treasury.date]: { key: 'requiredDate' },
};

const KNOWN_FIELD_PATHS = new Set<string>(Object.values(FIELD_PATHS).flatMap((section) => Object.values(section)));

const LIST_ITEM_PATH = /^(expiryTypes|cashCategories)\.(create|update|delete)\.(\d+)(?:\.(\w+))?/;

const ITEM_MESSAGE_BY_REASON: Record<string, SettingsItemError> = {
  NAME_TAKEN: { field: 'name', message: { key: 'nameTaken' } },
  // The membership-fee type holds it: a type listed nowhere on this page (review 19.8 F6).
  NAME_RESERVED: { field: 'name', message: { key: 'nameReserved' } },
  IN_USE: { field: null, message: { key: 'inUse' } },
  SYSTEM_CATEGORY: { field: null, message: { key: 'systemCategory' } },
  NOT_FOUND: { field: null, message: { key: 'stale' } },
};

type ErrorBody = { error?: { code?: string; details?: { fieldErrors?: Record<string, unknown>; reason?: string; item?: { list?: string; op?: string; index?: number } } } };

function rowKeyOf(index: SettingsPatchIndex, list: string | undefined, op: string | undefined, position: number | undefined): string | undefined {
  if ((list !== 'expiryTypes' && list !== 'cashCategories') || (op !== 'create' && op !== 'update' && op !== 'delete') || position === undefined) return undefined;
  return index[list][op][position];
}

/**
 * AD-5: a failed Salva back onto the page — a shape 422 onto the field (its
 * dotted key) or the row (`expiryTypes.create.0.name`), a refused row (409 or
 * a domain 422 with `details.item`) onto that row, everything else onto the
 * save bar. The draft is never touched: the user corrects and saves again.
 */
export function mapSaveError(status: number, body: unknown, index: SettingsPatchIndex): SettingsErrors {
  const error = (body as ErrorBody | null)?.error;
  if (status === 403) return { ...NO_SETTINGS_ERRORS, bar: 'forbidden' };

  const fields: Record<string, SettingsErrorMessage> = {};
  const items: Record<string, SettingsItemError> = {};
  let unplaced = false;

  const item = error?.details?.item;
  if (item) {
    const rowKey = rowKeyOf(index, item.list, item.op, item.index);
    if (rowKey === undefined) unplaced = true;
    else items[rowKey] = (error?.code === 'CONFLICT' && ITEM_MESSAGE_BY_REASON[error.details?.reason ?? '']) || { field: null, message: { key: 'invalidItem' } };
  } else if (status === 422 && error?.code === 'VALIDATION_ERROR' && error.details?.fieldErrors) {
    for (const path of Object.keys(error.details.fieldErrors)) {
      const listMatch = LIST_ITEM_PATH.exec(path);
      if (listMatch) {
        const rowKey = rowKeyOf(index, listMatch[1], listMatch[2], Number(listMatch[3]));
        const field = listMatch[4] === 'name' ? 'name' : listMatch[4] === 'validityMonths' ? 'validity' : null;
        if (rowKey === undefined) unplaced = true;
        else items[rowKey] = { field, message: { key: 'invalidItem' } };
      } else if (KNOWN_FIELD_PATHS.has(path)) {
        fields[path] = SERVER_FIELD_MESSAGES[path] ?? { key: 'invalidValue' };
      } else {
        unplaced = true;
      }
    }
  } else {
    unplaced = true;
  }

  const placed = Object.keys(fields).length > 0 || Object.keys(items).length > 0;
  return { fields, items, bar: unplaced ? 'generic' : placed ? 'checkFields' : 'generic' };
}
