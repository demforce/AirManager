import type { PprOperatingInstructionsDto } from '@/lib/schemas/ppr';
import type {
  AirfieldBrandingDto,
  SchedulingSettingsDto,
  SchedulingSettingsInput,
  SmtpSecurityDto,
  SmtpSettingsDto,
  SmtpSettingsInput,
  TreasurySettingsDto,
  TreasurySettingsInput,
} from '@/lib/schemas/settings';
import { authorize, type Actor } from '@/server/auth/rbac';
import { decryptSecret, encryptSecret } from '@/server/crypto/secret-box';
import { prisma } from '@/server/db/prisma';

/**
 * The FIRST real plumbing around the `AppSetting` K/V table (existing since
 * story 1.1, never given a dedicated service until now — see the model's
 * doc-comment in `schema.prisma`). Deliberately minimal rather than a
 * generic settings CRUD: each caller gets its own narrow get/set pair —
 * PPR's `ppr.operatingInstructions.*`/`ppr.landingFeeCents` (epic 8,
 * stories 8.2/8.3) and (story 10.2, AC 1) the airfield PDF branding's
 * `airfield.name` (name-only since story 13.8, AC 4 — the `airfield.logo`
 * key some installs may still carry from before that story is never read or
 * written here anymore). A future story that needs another setting adds its
 * own pair here rather than widening these into something generic.
 */

const PPR_OPERATING_INSTRUCTIONS_IT_KEY = 'ppr.operatingInstructions.it';
const PPR_OPERATING_INSTRUCTIONS_EN_KEY = 'ppr.operatingInstructions.en';
const PPR_LANDING_FEE_CENTS_KEY = 'ppr.landingFeeCents';
const AIRFIELD_NAME_KEY = 'airfield.name';
const AIRFIELD_ICAO_KEY = 'airfield.icao';
const AIRFIELD_CONTACT_EMAIL_KEY = 'airfield.contactEmail';

/** Fresh-install default (story 10.2, AC 1) — no admin has configured branding yet. */
const DEFAULT_AIRFIELD_NAME = 'AirManager';

/** `PprRequest.landingFeeCents`/`recordCashMovement`'s own `amountCents` bound (AD-2, `.max(2_147_483_647)` at the Zod boundary) — kept as a local const rather than importing across the schema layer for one integer. */
const MAX_LANDING_FEE_CENTS = 2_147_483_647;

/**
 * Reads the admin-configured PPR approval-email operating instructions
 * (AC 1). Gated `ppr.manage` (AD-5) — not `settings.manage`: staff sees
 * these in the queue (read-only) even though only an admin can edit them
 * (`setPprOperatingInstructions` below). Absent key(s) read as `''`, never
 * `null` (Contesto) — a fresh install has no instructions configured yet,
 * and `''` is exactly the "omit this section" signal
 * `templates.ts#buildPprApprovalEmail` checks for.
 */
export async function getPprOperatingInstructions(actor: Actor): Promise<PprOperatingInstructionsDto> {
  authorize(actor, 'ppr.manage');

  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [PPR_OPERATING_INSTRUCTIONS_IT_KEY, PPR_OPERATING_INSTRUCTIONS_EN_KEY] } },
    select: { key: true, value: true },
  });

  const it = rows.find((row) => row.key === PPR_OPERATING_INSTRUCTIONS_IT_KEY)?.value ?? '';
  const en = rows.find((row) => row.key === PPR_OPERATING_INSTRUCTIONS_EN_KEY)?.value ?? '';

  return { it, en };
}

/**
 * Sets the PPR approval-email operating instructions (AC 1). Gated
 * `settings.manage` — admin-only, same write-vs-read asymmetry as
 * `expiry-types.service.ts`'s catalogue. Both locales are always written
 * together (the caller's form always submits both fields, Zod-bound at
 * `pprOperatingInstructionsSchema`) — `upsert` per key since a fresh
 * install has neither `AppSetting` row yet.
 */
export async function setPprOperatingInstructions(
  actor: Actor,
  input: PprOperatingInstructionsDto,
): Promise<PprOperatingInstructionsDto> {
  authorize(actor, 'settings.manage');

  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: PPR_OPERATING_INSTRUCTIONS_IT_KEY },
      update: { value: input.it },
      create: { key: PPR_OPERATING_INSTRUCTIONS_IT_KEY, value: input.it },
    }),
    prisma.appSetting.upsert({
      where: { key: PPR_OPERATING_INSTRUCTIONS_EN_KEY },
      update: { value: input.en },
      create: { key: PPR_OPERATING_INSTRUCTIONS_EN_KEY, value: input.en },
    }),
  ]);

  return input;
}

/**
 * Parses `AppSetting.value` for `ppr.landingFeeCents` — a bare non-negative
 * integer string (`String(cents)`, the exact shape `setPprLandingFeeDefaultCents`
 * writes below). `null` for anything else: absent digits, a leading `-`/
 * decimal point, leading/trailing whitespace, or a value beyond the `Int`
 * ceiling (AD-2) — an operational corruption (e.g. a hand-edited row) this
 * function itself never produces, so `getPprLandingFeeDefaultCents` treats
 * it as "no default configured" rather than throwing.
 */
function parseStoredLandingFeeCents(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_LANDING_FEE_CENTS ? parsed : null;
}

/**
 * Reads the admin-configured default PPR landing fee, in integer euro cents
 * (AD-2) — story 8.3, AC 1. Gated `ppr.manage`, not `settings.manage`: the
 * completion panel prefills its fee input with this default for every actor
 * who can complete a PPR (staff), even though only an admin can change the
 * default itself (`setPprLandingFeeDefaultCents` below) — same read/write
 * asymmetry as `getPprOperatingInstructions`. Absent key -> `0` (Contesto:
 * a fresh install charges nothing until an admin configures a fee). A
 * stored value that fails {@link parseStoredLandingFeeCents} also reads as
 * `0`, logged via `console.warn` rather than thrown — the completion flow
 * must never be blocked by a broken setting, only silently fall back to "no
 * default fee".
 */
export async function getPprLandingFeeDefaultCents(actor: Actor): Promise<number> {
  authorize(actor, 'ppr.manage');

  const row = await prisma.appSetting.findUnique({ where: { key: PPR_LANDING_FEE_CENTS_KEY }, select: { value: true } });
  if (!row) {
    return 0;
  }

  const parsed = parseStoredLandingFeeCents(row.value);
  if (parsed === null) {
    console.warn(`getPprLandingFeeDefaultCents: stored value "${row.value}" is not a valid non-negative integer — defaulting to 0.`);
    return 0;
  }

  return parsed;
}

/**
 * Sets the admin-configured default PPR landing fee (AC 1). Gated
 * `settings.manage` — admin-only, same write-vs-read asymmetry as
 * `setPprOperatingInstructions`. `cents` is trusted as an already-bounded
 * (`0..2_147_483_647`, AD-2's `Int` ceiling) integer — enforced at the Zod
 * boundary (`pprLandingFeeDefaultSchema`) before this function ever runs,
 * same "service trusts its Zod-typed input" contract as
 * `setPprOperatingInstructions` above. Stored as a plain decimal string
 * (`AppSetting.value`'s column shape) that {@link parseStoredLandingFeeCents}
 * reads back unchanged.
 */
export async function setPprLandingFeeDefaultCents(actor: Actor, cents: number): Promise<number> {
  authorize(actor, 'settings.manage');

  await prisma.appSetting.upsert({
    where: { key: PPR_LANDING_FEE_CENTS_KEY },
    update: { value: String(cents) },
    create: { key: PPR_LANDING_FEE_CENTS_KEY, value: String(cents) },
  });

  return cents;
}

/**
 * Reads the admin-configured airfield branding (story 10.2, AC 1) — the
 * name shown in every exported PDF's header (name-only since story 13.8,
 * AC 4). Deliberately NO permission gate (unlike every other getter in this
 * module): the header must render for whichever role is exporting a report
 * (pilot, instructor, staff, admin alike), and the branding itself is not
 * sensitive data. The route's own `apiRoute` (`auth: 'required'` default)
 * is the only guard — an authenticated session, nothing more. An absent
 * `AppSetting` row reads as the fresh-install default: name `'AirManager'`.
 */
export async function getAirfieldBranding(): Promise<AirfieldBrandingDto> {
  const row = await prisma.appSetting.findUnique({ where: { key: AIRFIELD_NAME_KEY }, select: { value: true } });
  return { name: row?.value || DEFAULT_AIRFIELD_NAME };
}

/**
 * Reads the airfield ICAO code shown next to the brand in the AirOps shell
 * (story 12.1, AC 4 — spec D3: "club name/ICAO accanto al brand vengono da
 * Settings"). No admin UI writes this key yet — the Impostazioni Club card
 * that does arrives in a later story — so a fresh install always reads
 * `''` and the shell simply omits the ICAO segment. No permission gate,
 * same reasoning as {@link getAirfieldBranding}: every authenticated role
 * sees the shell chrome.
 */
export async function getAirfieldIcao(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: AIRFIELD_ICAO_KEY }, select: { value: true } });
  return row?.value ?? '';
}

/**
 * Sets the airfield ICAO (story 12.11, AC 1/2 — the Impostazioni Club card
 * `getAirfieldIcao`'s doc-comment anticipated). Gated `settings.manage`, same
 * write-vs-read asymmetry as every other setter here.
 */
export async function setAirfieldIcao(actor: Actor, icao: string): Promise<string> {
  authorize(actor, 'settings.manage');

  await prisma.appSetting.upsert({
    where: { key: AIRFIELD_ICAO_KEY },
    update: { value: icao },
    create: { key: AIRFIELD_ICAO_KEY, value: icao },
  });

  return icao;
}

/**
 * Reads the airfield contact email (story 12.11, AC 1/2) — the address the
 * SMTP "Invia email di prova" control (AC 2) sends its test message to. No
 * permission gate, same reasoning as {@link getAirfieldIcao}. Absent key ->
 * `''` (fresh install: no contact email configured yet).
 */
export async function getAirfieldContactEmail(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: AIRFIELD_CONTACT_EMAIL_KEY }, select: { value: true } });
  return row?.value ?? '';
}

/** Sets the airfield contact email (AC 1/2). Gated `settings.manage`. */
export async function setAirfieldContactEmail(actor: Actor, email: string): Promise<string> {
  authorize(actor, 'settings.manage');

  await prisma.appSetting.upsert({
    where: { key: AIRFIELD_CONTACT_EMAIL_KEY },
    update: { value: email },
    create: { key: AIRFIELD_CONTACT_EMAIL_KEY, value: email },
  });

  return email;
}

// --- Scheduling window (story 12.11, AC 1/4; ratifica utente 3) ------------
// `sched.*` — the booking-window settings `bookings.service.ts`'s
// `BOOKING_OUTSIDE_WINDOW` check and the Pianificazione timeline axis read.
// Every field is `null` until an admin saves the Impostazioni "Pianificazione"
// card ONCE (all 5 together, same single-card-save shape as the write
// schema) — absent keys mean "no constraint" (backward-safe), never `0`.

const SCHED_OPEN_TIME_KEY = 'sched.openTime';
const SCHED_CLOSE_TIME_KEY = 'sched.closeTime';
const SCHED_MIN_SLOT_MINUTES_KEY = 'sched.minSlotMinutes';
const SCHED_TURNAROUND_MINUTES_KEY = 'sched.turnaroundMinutes';
const SCHED_MAX_ADVANCE_DAYS_KEY = 'sched.maxAdvanceDays';
const SCHED_KEYS = [
  SCHED_OPEN_TIME_KEY,
  SCHED_CLOSE_TIME_KEY,
  SCHED_MIN_SLOT_MINUTES_KEY,
  SCHED_TURNAROUND_MINUTES_KEY,
  SCHED_MAX_ADVANCE_DAYS_KEY,
] as const;

function parseStoredInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Reads the scheduling-window settings (AC 1/4). No permission gate: needed
 * by ANY actor creating a booking (including a plain pilot self-booking),
 * not just staff — same reasoning as {@link getAirfieldIcao}. Read through
 * the top-level `prisma` client even when called from INSIDE
 * `bookings.service.ts#transitionBooking`'s own `$transaction` — the exact
 * same "sibling read via plain `prisma`, not `tx`" precedent that function's
 * own `findBlockingExpiredDocuments` call already establishes.
 */
export async function getSchedulingSettings(): Promise<SchedulingSettingsDto> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [...SCHED_KEYS] } }, select: { key: true, value: true } });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    openTime: byKey.get(SCHED_OPEN_TIME_KEY) ?? null,
    closeTime: byKey.get(SCHED_CLOSE_TIME_KEY) ?? null,
    minSlotMinutes: parseStoredInt(byKey.get(SCHED_MIN_SLOT_MINUTES_KEY)),
    turnaroundMinutes: parseStoredInt(byKey.get(SCHED_TURNAROUND_MINUTES_KEY)),
    maxAdvanceDays: parseStoredInt(byKey.get(SCHED_MAX_ADVANCE_DAYS_KEY)),
  };
}

/** Sets the scheduling-window settings (AC 1/4) — all 5 fields together (the card's own form always submits the whole set). Gated `settings.manage`. */
export async function setSchedulingSettings(actor: Actor, input: SchedulingSettingsInput): Promise<SchedulingSettingsDto> {
  authorize(actor, 'settings.manage');

  const entries: Array<[string, string]> = [
    [SCHED_OPEN_TIME_KEY, input.openTime],
    [SCHED_CLOSE_TIME_KEY, input.closeTime],
    [SCHED_MIN_SLOT_MINUTES_KEY, String(input.minSlotMinutes)],
    [SCHED_TURNAROUND_MINUTES_KEY, String(input.turnaroundMinutes)],
    [SCHED_MAX_ADVANCE_DAYS_KEY, String(input.maxAdvanceDays)],
  ];

  await prisma.$transaction(entries.map(([key, value]) => prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })));

  return { openTime: input.openTime, closeTime: input.closeTime, minSlotMinutes: input.minSlotMinutes, turnaroundMinutes: input.turnaroundMinutes, maxAdvanceDays: input.maxAdvanceDays };
}

// --- SMTP (story 12.11, AC 1/2) --------------------------------------------
// `smtp.*` — `smtp-mail-sender.ts` reads these settings-first with a
// FALLBACK to the existing `SMTP_HOST`/`SMTP_PORT`/`MAIL_FROM` env vars
// (Contesto: "NIENTE nuove env var"). `pass` is WRITE-ONLY (AC 1): stored
// like every other key, but NEVER read back through the actor-facing getter
// below — only {@link getSmtpSettingsForMailer} (internal, no `Actor`) sees it.
// CWE-312 fix: `pass` is encrypted at rest (`encryptSecret`, AES-256-GCM —
// see `secret-box.ts`) and decrypted ONLY inside `getSmtpSettingsForMailer`
// (`decryptSecret`, which passes a legacy cleartext row through unchanged).

const SMTP_HOST_KEY = 'smtp.host';
const SMTP_PORT_KEY = 'smtp.port';
const SMTP_SECURITY_KEY = 'smtp.security';
const SMTP_USER_KEY = 'smtp.user';
const SMTP_PASS_KEY = 'smtp.pass';
const SMTP_FROM_KEY = 'smtp.from';
const SMTP_KEYS = [SMTP_HOST_KEY, SMTP_PORT_KEY, SMTP_SECURITY_KEY, SMTP_USER_KEY, SMTP_PASS_KEY, SMTP_FROM_KEY] as const;

function isSmtpSecurity(value: string | undefined): value is SmtpSecurityDto {
  return value === 'NONE' || value === 'STARTTLS' || value === 'SSL_TLS';
}

/** Reads the SMTP settings for the Impostazioni form (AC 1/2). Gated `settings.manage` — admin-only, mirroring the write side (unlike the read-broader asymmetry of the PPR getters: nobody but the admin editing this card needs to see it). `pass` is NEVER included — only whether one is configured. */
export async function getSmtpSettings(actor: Actor): Promise<SmtpSettingsDto> {
  authorize(actor, 'settings.manage');

  const rows = await prisma.appSetting.findMany({ where: { key: { in: [...SMTP_KEYS] } }, select: { key: true, value: true } });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const security = byKey.get(SMTP_SECURITY_KEY);

  return {
    host: byKey.get(SMTP_HOST_KEY) ?? null,
    port: parseStoredInt(byKey.get(SMTP_PORT_KEY)),
    security: isSmtpSecurity(security) ? security : null,
    user: byKey.get(SMTP_USER_KEY) ?? null,
    from: byKey.get(SMTP_FROM_KEY) ?? null,
    hasPassword: Boolean(byKey.get(SMTP_PASS_KEY)),
  };
}

/**
 * Sets the SMTP settings (AC 1/2). Gated `settings.manage`. `pass` is
 * OPTIONAL (AC 1: "mai restituita da GET — placeholder in UI") — omitted or
 * empty leaves the STORED password untouched (the form never round-trips a
 * real value to compare against), any non-empty string overwrites it.
 */
export async function setSmtpSettings(actor: Actor, input: SmtpSettingsInput): Promise<SmtpSettingsDto> {
  authorize(actor, 'settings.manage');

  const writes = [
    prisma.appSetting.upsert({ where: { key: SMTP_HOST_KEY }, update: { value: input.host }, create: { key: SMTP_HOST_KEY, value: input.host } }),
    prisma.appSetting.upsert({
      where: { key: SMTP_PORT_KEY },
      update: { value: String(input.port) },
      create: { key: SMTP_PORT_KEY, value: String(input.port) },
    }),
    prisma.appSetting.upsert({
      where: { key: SMTP_SECURITY_KEY },
      update: { value: input.security },
      create: { key: SMTP_SECURITY_KEY, value: input.security },
    }),
    prisma.appSetting.upsert({ where: { key: SMTP_USER_KEY }, update: { value: input.user }, create: { key: SMTP_USER_KEY, value: input.user } }),
    prisma.appSetting.upsert({ where: { key: SMTP_FROM_KEY }, update: { value: input.from }, create: { key: SMTP_FROM_KEY, value: input.from } }),
  ];
  if (input.pass) {
    const encryptedPass = encryptSecret(input.pass);
    writes.push(
      prisma.appSetting.upsert({
        where: { key: SMTP_PASS_KEY },
        update: { value: encryptedPass },
        create: { key: SMTP_PASS_KEY, value: encryptedPass },
      }),
    );
  }

  await prisma.$transaction(writes);

  return getSmtpSettings(actor);
}

/**
 * Internal SMTP read for the mailer ONLY (`smtp-mail-sender.ts`) — the one
 * place `pass` is ever read back. Deliberately no `Actor` parameter (same
 * "not every read needs a session" shape as a job service) and NEVER
 * exposed over HTTP — do not add a route that calls this.
 */
export async function getSmtpSettingsForMailer(): Promise<{
  host: string | null;
  port: number | null;
  security: SmtpSecurityDto | null;
  user: string | null;
  pass: string | null;
  from: string | null;
}> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [...SMTP_KEYS] } }, select: { key: true, value: true } });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const security = byKey.get(SMTP_SECURITY_KEY);
  const storedPass = byKey.get(SMTP_PASS_KEY);

  return {
    host: byKey.get(SMTP_HOST_KEY) ?? null,
    port: parseStoredInt(byKey.get(SMTP_PORT_KEY)),
    security: isSmtpSecurity(security) ? security : null,
    user: byKey.get(SMTP_USER_KEY) ?? null,
    pass: storedPass !== undefined ? decryptSecret(storedPass) : null,
    from: byKey.get(SMTP_FROM_KEY) ?? null,
  };
}

// --- METAR station (story 12.11, AC 1/5) ------------------------------------

const METAR_STATION_KEY = 'metar.station';

/**
 * Reads the METAR station code (AC 1/5) — falls back to the airfield's own
 * ICAO (`getAirfieldIcao`) when no override is configured (AC 1: "default =
 * airfield.icao"). No permission gate: the sidebar weather card is rendered
 * for every authenticated role.
 */
export async function getMetarStation(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: METAR_STATION_KEY }, select: { value: true } });
  if (row?.value) {
    return row.value;
  }
  return getAirfieldIcao();
}

/** Sets the METAR station override (AC 1/5). Gated `settings.manage`. An empty string clears the override (back to the ICAO fallback). */
export async function setMetarStation(actor: Actor, station: string): Promise<string> {
  authorize(actor, 'settings.manage');

  await prisma.appSetting.upsert({
    where: { key: METAR_STATION_KEY },
    update: { value: station },
    create: { key: METAR_STATION_KEY, value: station },
  });

  return getMetarStation();
}

// --- Membership fee (story 12.11, AC 1, ratifica utente 1) -----------------

const MEMBERSHIP_ANNUAL_FEE_CENTS_KEY = 'membership.annualFeeCents';

/**
 * Reads the default annual membership-fee amount, in integer euro cents
 * (ratifica utente 1) — precompiles the "Quota associativa" action's amount
 * field (`chargeMembershipFee`'s caller). Gated `finance.manage` (STAFF+
 * ADMIN): the SAME actors who can trigger the charge itself need to see the
 * default; `settings.manage` (ADMIN-only) is reserved for CHANGING it
 * (`setMembershipFeeCents` below), same read/write asymmetry as
 * `getPprLandingFeeDefaultCents`. Absent key -> `0` (Contesto: a fresh
 * install charges nothing until an admin configures a fee) — a corrupted
 * stored value also falls back to `0`, logged, never thrown (same rule as
 * `getPprLandingFeeDefaultCents`).
 */
export async function getMembershipFeeCents(actor: Actor): Promise<number> {
  authorize(actor, 'finance.manage');

  const row = await prisma.appSetting.findUnique({ where: { key: MEMBERSHIP_ANNUAL_FEE_CENTS_KEY }, select: { value: true } });
  if (!row) {
    return 0;
  }

  const parsed = parseStoredLandingFeeCents(row.value);
  if (parsed === null) {
    console.warn(`getMembershipFeeCents: stored value "${row.value}" is not a valid non-negative integer — defaulting to 0.`);
    return 0;
  }

  return parsed;
}

/** Sets the default annual membership-fee amount (AC 1). Gated `settings.manage`. */
export async function setMembershipFeeCents(actor: Actor, cents: number): Promise<number> {
  authorize(actor, 'settings.manage');

  await prisma.appSetting.upsert({
    where: { key: MEMBERSHIP_ANNUAL_FEE_CENTS_KEY },
    update: { value: String(cents) },
    create: { key: MEMBERSHIP_ANNUAL_FEE_CENTS_KEY, value: String(cents) },
  });

  return cents;
}

/**
 * Sets the airfield branding (AC 1; name-only since story 13.8, AC 4).
 * Gated `settings.manage` — admin-only, same write-vs-read asymmetry as
 * every other setter in this module.
 */
export async function setAirfieldBranding(actor: Actor, input: AirfieldBrandingDto): Promise<AirfieldBrandingDto> {
  authorize(actor, 'settings.manage');

  await prisma.appSetting.upsert({
    where: { key: AIRFIELD_NAME_KEY },
    update: { value: input.name },
    create: { key: AIRFIELD_NAME_KEY, value: input.name },
  });

  return input;
}

// --- Treasury opening balances (story Billing-1, AC 3) ----------------------
// `treasury.*` — the baseline `getBillingSummary` (`billing-summary.service.ts`)
// adds every `CASH`/`BANK_TRANSFER`+`POS` `CashMovement` from `openingDate`
// onward to, turning a mere sum-of-registered-movements into a real,
// bank-statement-comparable balance. No Impostazioni card in this story
// (Billing-2's job) — only the getter/setter pair and the PUT route.

const TREASURY_OPENING_CASH_CENTS_KEY = 'treasury.openingCashCents';
const TREASURY_OPENING_BANK_CENTS_KEY = 'treasury.openingBankCents';
const TREASURY_OPENING_DATE_KEY = 'treasury.openingDate';

/** `Int` ceiling (AD-2) — an opening balance is bounded like any other stored cents value. */
const MAX_TREASURY_OPENING_CENTS = 2_147_483_647;

function parseStoredOpeningCents(value: string | undefined, label: string): number {
  if (value === undefined) return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || Math.abs(parsed) > MAX_TREASURY_OPENING_CENTS) {
    console.warn(`getTreasurySettings: stored ${label} "${value}" is not a valid integer — defaulting to 0.`);
    return 0;
  }
  return parsed;
}

function parseStoredOpeningDate(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    console.warn(`getTreasurySettings: stored openingDate "${value}" is not YYYY-MM-DD — defaulting to null.`);
    return null;
  }
  return value;
}

/**
 * Reads the treasury opening balances with NO `Actor` at all (Billing-1, AC
 * 3) — internal use only, for `billing-summary.service.ts#getBillingSummary`
 * (itself gated `finance.manage`, STAFF+ADMIN) to read without ALSO needing
 * `settings.manage`. Same "unguarded internal reader alongside a
 * permission-gated actor-facing pair" precedent as
 * `getSmtpSettingsForMailer` vs `getSmtpSettings` above. Parsing is robust
 * (missing/invalid -> default 0 / `null`, logged, never thrown) — same
 * pattern as every other financial getter in this module.
 */
export async function getTreasuryOpeningInternal(): Promise<TreasurySettingsDto> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [TREASURY_OPENING_CASH_CENTS_KEY, TREASURY_OPENING_BANK_CENTS_KEY, TREASURY_OPENING_DATE_KEY] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    openingCashCents: parseStoredOpeningCents(byKey.get(TREASURY_OPENING_CASH_CENTS_KEY), 'openingCashCents'),
    openingBankCents: parseStoredOpeningCents(byKey.get(TREASURY_OPENING_BANK_CENTS_KEY), 'openingBankCents'),
    openingDate: parseStoredOpeningDate(byKey.get(TREASURY_OPENING_DATE_KEY)),
  };
}

/** Actor-facing getter (AC 3). Gated `settings.manage` — admin-only end to end (unlike `getMembershipFeeCents`'s broader `finance.manage` read: the treasury opening balances are pure admin configuration, never read by a day-to-day `finance.manage` flow directly — `getBillingSummary` uses {@link getTreasuryOpeningInternal} instead). */
export async function getTreasurySettings(actor: Actor): Promise<TreasurySettingsDto> {
  authorize(actor, 'settings.manage');
  return getTreasuryOpeningInternal();
}

/** Sets the treasury opening balances (AC 3) — all 3 fields together (Billing-2's future card always submits the whole set, same single-card-save shape as `setSchedulingSettings`). Gated `settings.manage`. */
export async function setTreasurySettings(actor: Actor, input: TreasurySettingsInput): Promise<TreasurySettingsDto> {
  authorize(actor, 'settings.manage');

  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: TREASURY_OPENING_CASH_CENTS_KEY },
      update: { value: String(input.openingCashCents) },
      create: { key: TREASURY_OPENING_CASH_CENTS_KEY, value: String(input.openingCashCents) },
    }),
    prisma.appSetting.upsert({
      where: { key: TREASURY_OPENING_BANK_CENTS_KEY },
      update: { value: String(input.openingBankCents) },
      create: { key: TREASURY_OPENING_BANK_CENTS_KEY, value: String(input.openingBankCents) },
    }),
    prisma.appSetting.upsert({
      where: { key: TREASURY_OPENING_DATE_KEY },
      update: { value: input.openingDate },
      create: { key: TREASURY_OPENING_DATE_KEY, value: input.openingDate },
    }),
  ]);

  return { openingCashCents: input.openingCashCents, openingBankCents: input.openingBankCents, openingDate: input.openingDate };
}
