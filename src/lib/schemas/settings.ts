import { CURRENCY_LIMITS } from '@/lib/currency';
import { env } from '@/lib/env';
import { cashCategoryItemSchema, createCashCategorySchema } from './cash';
import { createExpiryTypeSchema, expiryTypeItemSchema, expiryTypeKindInputSchema, updateExpiryTypeSchema } from './expiry-types';
import { z } from './zod-with-openapi';

// --- Airfield branding (story 10.2, AC 1) -----------------------------------
// The PDF report header's identity: an admin-configured name + optional
// logo, persisted on the existing `AppSetting` K/V table (no migration —
// see `app-settings.service.ts#getAirfieldBranding`/`setAirfieldBranding`).

/**
 * `GET/PUT /api/v1/settings/airfield` body/response (story 10.2, AC 1).
 * Name-only since story 13.8 (AC 4): the logo field (`logoDataUrl`, a
 * client-uploaded base64 data URL) was never exercised by any admin —
 * removed from the wire contract, the settings UI, and every branding
 * consumer, a ratified punch-list wire change. The
 * `airfield.logo` `AppSetting` key some installs may still carry stays an
 * orphan row (no destructive migration).
 */
export const airfieldBrandingSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

export type AirfieldBrandingDto = z.infer<typeof airfieldBrandingSchema>;

// --- Club identity: ICAO + contact email (story 12.11, AC 1/2) -------------
// `airfield.name` stays on the schema/route above (untouched,
// "PUT settings/airfield resta") — ICAO gets its first WRITE path here (the
// key itself already existed read-only, story 12.1) and contact email is a
// brand-new key. Both live on the same Impostazioni "Club" card.

export const clubIdentitySchema = z.object({
  icao: z.string().trim().toUpperCase().max(10),
  /** `''` = not configured — the factory default `getAirfieldContactEmail` returns; rejecting it made the club card unsavable on a fresh install (the card always sends every field). */
  contactEmail: z.string().trim().toLowerCase().pipe(z.union([z.literal(''), z.email()])),
});

export type ClubIdentityDto = z.infer<typeof clubIdentitySchema>;

// --- Scheduling window (story 12.11, AC 1/4) --------------------------------
// `sched.*` — booking-window settings. Backward-safe by construction: every
// field reads as `null` until an admin saves the whole card once (ratifica
// 3: "chiavi assenti -> nessun vincolo nuovo").

const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const schedulingSettingsSchema = z
  .object({
    openTime: z.string().regex(HH_MM_PATTERN, 'openTime must be HH:MM'),
    closeTime: z.string().regex(HH_MM_PATTERN, 'closeTime must be HH:MM'),
    minSlotMinutes: z.number().int().positive().max(1440),
    turnaroundMinutes: z.number().int().nonnegative().max(1440),
    maxAdvanceDays: z.number().int().positive().max(3650),
  })
  .refine((value) => value.closeTime > value.openTime, { message: 'closeTime must be after openTime', path: ['closeTime'] });

export type SchedulingSettingsInput = z.infer<typeof schedulingSettingsSchema>;

export const schedulingSettingsDtoSchema = z.object({
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
  minSlotMinutes: z.number().int().nullable(),
  turnaroundMinutes: z.number().int().nullable(),
  maxAdvanceDays: z.number().int().nullable(),
});

export type SchedulingSettingsDto = z.infer<typeof schedulingSettingsDtoSchema>;

// --- Currency (story 19.7a, R-19-i, D-10) ----------------------------------
// `currency.*` — X flights in the last Y days. The bounds (and the defaults the
// getter falls back to) live in the PURE `@/lib/currency`, so the Impostazioni
// mirror of story 19.8 reads the same numbers on the client. No route here:
// story 19.8 adds `GET/PUT /api/v1/settings/currency` and its composite block.

export const currencySettingsSchema = z.object({
  minFlights: z.number().int().min(CURRENCY_LIMITS.minFlights.min).max(CURRENCY_LIMITS.minFlights.max),
  windowDays: z.number().int().min(CURRENCY_LIMITS.windowDays.min).max(CURRENCY_LIMITS.windowDays.max),
});

export type CurrencySettingsInput = z.infer<typeof currencySettingsSchema>;

// --- SMTP (story 12.11, AC 1/2) --------------------------------------------
// `smtp.*` — the mailer's own configuration (`smtp-mail-sender.ts` reads it
// with a FALLBACK to the existing `SMTP_HOST`/`SMTP_PORT`/`MAIL_FROM` env
// vars when absent). `pass` is WRITE-ONLY (AC 1): the GET response never
// carries it back, only a `hasPassword` flag the UI uses to render a
// "configured" placeholder instead of a real value.

export const smtpSecuritySchema = z.enum(['NONE', 'STARTTLS', 'SSL_TLS']);

export type SmtpSecurityDto = z.infer<typeof smtpSecuritySchema>;

/**
 * CWE-918 (SSRF) fix — `host` is an outbound connection target an admin can
 * freely type, so literal private/loopback/link-local/metadata addresses are
 * rejected. Only LITERAL IPs and the `localhost` alias are checked (no DNS
 * resolution here — Zod validation must stay synchronous); a hostname that
 * *resolves* to an internal address at connect time is a separate, unhandled
 * class of SSRF this fix does not claim to close.
 *
 * `localhost` is exempted when it matches `env.SMTP_HOST` (the mailer's own
 * existing, deploy-operator-controlled fallback target — Mailpit in dev/test,
 * see `smtp-mail-sender.ts`): the settings e2e suite configures `smtp.host`
 * to `'localhost'` through this exact schema to verify a real send via
 * Mailpit (`e2e/settings.spec.ts`), and `next start`'s production mode in CI
 * makes a `NODE_ENV`-based dev/test carve-out unreliable. Allowing the
 * settings value to match the already-trusted env fallback adds no new SSRF
 * surface — the mailer would reach that exact host via the env fallback
 * regardless of this field.
 */
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateIpv4(host: string): boolean {
  const match = IPV4_PATTERN.exec(host);
  if (!match) return false;
  const octets = match.slice(1, 5).map(Number);
  if (octets.some((octet) => octet > 255)) return false; // not a valid IPv4 literal — not this check's concern
  const [a, b] = octets;
  return (
    a === 0 || // 0.0.0.0/8 "this host" (0.0.0.0 routes to loopback on connect)
    a === 127 || // 127.0.0.0/8 loopback
    a === 10 || // 10.0.0.0/8 private
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
    (a === 192 && b === 168) || // 192.168.0.0/16 private
    (a === 169 && b === 254) // 169.254.0.0/16 link-local, incl. the 169.254.169.254 cloud metadata address
  );
}

function isPrivateIpv6(host: string): boolean {
  const h = host.split('%')[0] ?? host; // drop any zone id
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) — defer to the IPv4 check (review F4).
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  const groups = h.split(':');
  // Fully-expanded loopback / unspecified (0:0:0:0:0:0:0:0|1).
  if (groups.length === 8 && groups.slice(0, 7).every((g) => /^0+$/.test(g)) && /^0*1?$/.test(groups[7] ?? '')) {
    return true;
  }
  const firstGroup = groups[0] ?? '';
  return (
    /^f[cd][0-9a-f]{0,2}$/.test(firstGroup) || // fc00::/7 unique-local
    /^fe[89ab][0-9a-f]?$/.test(firstGroup) // fe80::/10 link-local
  );
}

function isDisallowedSmtpHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (normalized === env.SMTP_HOST.trim().toLowerCase()) {
    return false;
  }
  if (normalized === 'localhost') return true;
  // Non-dotted numeric literals that a socket still resolves to an address
  // (decimal 2130706433 = 127.0.0.1, or any 0x… hex form) are never a
  // legitimate SMTP hostname — reject outright (review F4).
  if (/^\d+$/.test(normalized) || /^0x/.test(normalized)) return true;
  return normalized.includes(':') ? isPrivateIpv6(normalized) : isPrivateIpv4(normalized);
}

export const smtpSettingsInputSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((host) => !isDisallowedSmtpHost(host), {
      message: 'host must not be a private, loopback, link-local, or metadata address.',
    }),
  port: z.number().int().min(1).max(65535),
  security: smtpSecuritySchema,
  user: z.string().trim().max(255),
  /** Omitted or empty: the stored password (if any) is left UNCHANGED — the client's "leave blank to keep" convention. */
  pass: z.string().max(255).optional(),
  from: z.string().trim().min(1).max(255),
});

export type SmtpSettingsInput = z.infer<typeof smtpSettingsInputSchema>;

export const smtpSettingsDtoSchema = z.object({
  host: z.string().nullable(),
  port: z.number().int().nullable(),
  security: smtpSecuritySchema.nullable(),
  user: z.string().nullable(),
  from: z.string().nullable(),
  hasPassword: z.boolean(),
});

export type SmtpSettingsDto = z.infer<typeof smtpSettingsDtoSchema>;

export const testEmailResultSchema = z.object({ sent: z.boolean() });

export type TestEmailResultDto = z.infer<typeof testEmailResultSchema>;

// --- METAR station (story 12.11, AC 1/5) ------------------------------------

export const metarStationInputSchema = z.object({
  /** Empty string clears the override — `getMetarStation` then falls back to `airfield.icao`. */
  station: z.string().trim().toUpperCase().max(10),
});

export type MetarStationInput = z.infer<typeof metarStationInputSchema>;

export const metarStationDtoSchema = z.object({ station: z.string() });

export type MetarStationDto = z.infer<typeof metarStationDtoSchema>;

// --- Membership fee (story 12.11, AC 1, ratifica utente 1) ------------------

/** The `Int` ceiling (AD-2), same as every stored cents amount. */
const MAX_MEMBERSHIP_FEE_CENTS = 2_147_483_647;

export const membershipFeeSettingSchema = z.object({
  annualFeeCents: z.number().int().nonnegative().max(MAX_MEMBERSHIP_FEE_CENTS),
});

export type MembershipFeeSettingDto = z.infer<typeof membershipFeeSettingSchema>;

// --- Treasury opening balances (story Billing-1, AC 3) ----------------------
// `treasury.*` — the baseline `getBillingSummary`'s cash/bank running
// balances add up from (two values + one date, ratifica utente 2026-07-26).

/** Same `Int` ceiling as `membershipFeeSettingSchema` (AD-2). Cents can be negative here (an opening balance is a real bank/cash figure, not a charge). */
const MAX_TREASURY_OPENING_CENTS = 2_147_483_647;

export const treasurySettingsSchema = z.object({
  openingCashCents: z.number().int().min(-MAX_TREASURY_OPENING_CENTS).max(MAX_TREASURY_OPENING_CENTS),
  openingBankCents: z.number().int().min(-MAX_TREASURY_OPENING_CENTS).max(MAX_TREASURY_OPENING_CENTS),
  openingDate: z.iso.date(),
});

export type TreasurySettingsInput = z.infer<typeof treasurySettingsSchema>;

/** `GET`-shape read by `getTreasuryOpeningInternal`/`getTreasurySettings` — `openingDate` is `null` (and both cents default to `0`) until an admin saves the Billing-2 card once, same backward-safe "absent -> no constraint yet" convention as `schedulingSettingsDtoSchema`. Not itself registered in OpenAPI this story (no GET route yet — Billing-1, AC 3 only registers the PUT). */
export const treasurySettingsDtoSchema = z.object({
  openingCashCents: z.number().int(),
  openingBankCents: z.number().int(),
  openingDate: z.iso.date().nullable(),
});

export type TreasurySettingsDto = z.infer<typeof treasurySettingsDtoSchema>;

// --- The Impostazioni page in one request (story 19.8, AD-1, A17) -----------
// `PATCH /api/v1/settings`: every block is OPTIONAL and is exactly the body of
// the single-setting PUT it mirrors; the two catalogue lists carry their
// create/update/delete operations. Validated by the route BEFORE anything is
// read, saved by `settings.service.ts#saveSettings` in ONE transaction.

const listItemIdSchema = z.string().trim().min(1);

/** `kind` is not editable from here: the list a type sits in IS its kind. */
const expiryTypeUpdateItemSchema = z
  .object({
    id: listItemIdSchema,
    name: updateExpiryTypeSchema.shape.name,
    scope: updateExpiryTypeSchema.shape.scope,
    isActive: updateExpiryTypeSchema.shape.isActive,
    blocksBooking: updateExpiryTypeSchema.shape.blocksBooking,
    validityMonths: updateExpiryTypeSchema.shape.validityMonths,
  })
  .refine((value) => Object.keys(value).length > 1, { message: 'At least one field besides id must be provided.' });

/** `isActive` is DECLARATIVE here (`false` on an inactive category is a no-op), unlike the deactivate/reactivate routes. */
const cashCategoryUpdateItemSchema = z
  .object({
    id: listItemIdSchema,
    name: createCashCategorySchema.shape.name.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 1, { message: 'At least one field besides id must be provided.' });

type ListOps = { create?: { name: string }[]; update?: { id: string; name?: string }[]; delete?: string[] };

/**
 * The checks a list can fail before any query: an id at most once in
 * `update` and in `delete` and never in both, a target name (already
 * trimmed by the item schemas) at most once across `create` and `update`.
 */
function checkListOps(value: ListOps, ctx: z.RefinementCtx): void {
  const updateIds = new Set<string>();
  for (const [index, item] of (value.update ?? []).entries()) {
    if (updateIds.has(item.id)) ctx.addIssue({ code: 'custom', path: ['update', index, 'id'], message: 'Duplicate id.' });
    updateIds.add(item.id);
  }
  const deleteIds = new Set<string>();
  for (const [index, id] of (value.delete ?? []).entries()) {
    if (deleteIds.has(id) || updateIds.has(id)) ctx.addIssue({ code: 'custom', path: ['delete', index], message: 'Duplicate id.' });
    deleteIds.add(id);
  }
  const names = new Set<string>();
  const named: Array<[op: 'create' | 'update', index: number, name: string | undefined]> = [
    ...(value.create ?? []).map((item, index): ['create', number, string] => ['create', index, item.name]),
    ...(value.update ?? []).map((item, index): ['update', number, string | undefined] => ['update', index, item.name]),
  ];
  for (const [op, index, name] of named) {
    if (name === undefined) continue;
    if (names.has(name)) ctx.addIssue({ code: 'custom', path: [op, index, 'name'], message: 'Duplicate name.' });
    names.add(name);
  }
}

export const updateSettingsSchema = z
  .object({
    airfield: airfieldBrandingSchema.optional(),
    club: clubIdentitySchema.optional(),
    metarStation: metarStationInputSchema.optional(),
    membershipFee: membershipFeeSettingSchema.optional(),
    currency: currencySettingsSchema.optional(),
    scheduling: schedulingSettingsSchema.optional(),
    smtp: smtpSettingsInputSchema.optional(),
    treasury: treasurySettingsSchema.optional(),
    expiryTypes: z
      .object({
        // `kind` REQUIRED here (the single route defaults it to RATING): a
        // visit created from the "Visite mediche" list never becomes a rating
        // through a forgotten field, and MEMBERSHIP is never accepted.
        create: z.array(createExpiryTypeSchema.extend({ kind: expiryTypeKindInputSchema })).max(50).optional(),
        update: z.array(expiryTypeUpdateItemSchema).max(200).optional(),
        delete: z.array(listItemIdSchema).max(200).optional(),
      })
      .superRefine(checkListOps)
      .optional(),
    cashCategories: z
      .object({
        create: z.array(createCashCategorySchema).max(50).optional(),
        update: z.array(cashCategoryUpdateItemSchema).max(200).optional(),
        delete: z.array(listItemIdSchema).max(200).optional(),
      })
      .superRefine(checkListOps)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one block must be provided.' });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** What a client SENDS (defaults not yet applied) — the type the Impostazioni page builds its PATCH with. */
export type UpdateSettingsBody = z.input<typeof updateSettingsSchema>;

/**
 * The whole page in one read (story 19.8, AD-4): what `/dashboard/settings`
 * renders and what the PATCH answers with. `metarStation.station` is the
 * station the admin TYPED (`''` = use the ICAO); `smtp` never carries the
 * password; `expiryTypes` holds only RATING and MEDICAL (the membership-fee
 * type is a system type, story 19.7a).
 */
export const settingsSnapshotSchema = z.object({
  airfield: airfieldBrandingSchema,
  club: clubIdentitySchema,
  metarStation: metarStationDtoSchema,
  membershipFee: membershipFeeSettingSchema,
  currency: currencySettingsSchema,
  scheduling: schedulingSettingsDtoSchema,
  smtp: smtpSettingsDtoSchema,
  treasury: treasurySettingsDtoSchema,
  expiryTypes: z.array(expiryTypeItemSchema),
  cashCategories: z.array(cashCategoryItemSchema),
});
