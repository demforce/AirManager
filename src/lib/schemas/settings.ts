import { z } from './zod-with-openapi';

// --- Airfield branding (story 10.2, AC 1) -----------------------------------
// The PDF report header's identity: an admin-configured name + optional
// logo, persisted on the existing `AppSetting` K/V table (no migration —
// see `app-settings.service.ts#getAirfieldBranding`/`setAirfieldBranding`).

/**
 * `GET/PUT /api/v1/settings/airfield` body/response (story 10.2, AC 1).
 * `logoDataUrl` is the ENTIRE image as a base64 data URL (client-side
 * upload, no storage infrastructure) — capped at ~200KB (`280_000` base64
 * chars, `AppSetting.value` is a plain Postgres `text` column, no separate
 * size limit of its own) and restricted to PNG/JPEG (the two formats
 * `<Image>` in the PDF adapter, `@react-pdf/renderer`, decodes without a
 * custom loader). `null` clears the logo (AC 1: "rimozione logo") — never
 * an empty string, which would fail the regex.
 */
export const airfieldBrandingSchema = z.object({
  name: z.string().trim().min(1).max(200),
  logoDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg);base64,/, 'logoDataUrl must be a PNG or JPEG data URL.')
    .max(280_000)
    .nullable(),
});

export type AirfieldBrandingDto = z.infer<typeof airfieldBrandingSchema>;

// --- Club identity: ICAO + contact email (story 12.11, AC 1/2) -------------
// `airfield.name`/`airfield.logo` stay on the schema/route above (untouched,
// "PUT settings/airfield resta") — ICAO gets its first WRITE path here (the
// key itself already existed read-only, story 12.1) and contact email is a
// brand-new key. Both live on the same Impostazioni "Club" card.

export const clubIdentitySchema = z.object({
  icao: z.string().trim().toUpperCase().max(10),
  contactEmail: z.string().trim().toLowerCase().pipe(z.email()),
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

// --- SMTP (story 12.11, AC 1/2) --------------------------------------------
// `smtp.*` — the mailer's own configuration (`smtp-mail-sender.ts` reads it
// with a FALLBACK to the existing `SMTP_HOST`/`SMTP_PORT`/`MAIL_FROM` env
// vars when absent). `pass` is WRITE-ONLY (AC 1): the GET response never
// carries it back, only a `hasPassword` flag the UI uses to render a
// "configured" placeholder instead of a real value.

export const smtpSecuritySchema = z.enum(['NONE', 'STARTTLS', 'SSL_TLS']);

export type SmtpSecurityDto = z.infer<typeof smtpSecuritySchema>;

export const smtpSettingsInputSchema = z.object({
  host: z.string().trim().min(1).max(255),
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

/** Same `Int` ceiling as `pprLandingFeeDefaultSchema` (AD-2). */
const MAX_MEMBERSHIP_FEE_CENTS = 2_147_483_647;

export const membershipFeeSettingSchema = z.object({
  annualFeeCents: z.number().int().nonnegative().max(MAX_MEMBERSHIP_FEE_CENTS),
});

export type MembershipFeeSettingDto = z.infer<typeof membershipFeeSettingSchema>;
