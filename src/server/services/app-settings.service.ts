import type { PprOperatingInstructionsDto } from '@/lib/schemas/ppr';
import type { AirfieldBrandingDto } from '@/lib/schemas/settings';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';

/**
 * The FIRST real plumbing around the `AppSetting` K/V table (existing since
 * story 1.1, never given a dedicated service until now — see the model's
 * doc-comment in `schema.prisma`). Deliberately minimal rather than a
 * generic settings CRUD: each caller gets its own narrow get/set pair —
 * PPR's `ppr.operatingInstructions.*`/`ppr.landingFeeCents` (epic 8,
 * stories 8.2/8.3) and (story 10.2, AC 1) the airfield PDF branding's
 * `airfield.name`/`airfield.logo`. A future story that needs another
 * setting adds its own pair here rather than widening these into something
 * generic.
 */

const PPR_OPERATING_INSTRUCTIONS_IT_KEY = 'ppr.operatingInstructions.it';
const PPR_OPERATING_INSTRUCTIONS_EN_KEY = 'ppr.operatingInstructions.en';
const PPR_LANDING_FEE_CENTS_KEY = 'ppr.landingFeeCents';
const AIRFIELD_NAME_KEY = 'airfield.name';
const AIRFIELD_LOGO_KEY = 'airfield.logo';
const AIRFIELD_ICAO_KEY = 'airfield.icao';

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
 * name + optional logo shown in every exported PDF's header. Deliberately
 * NO permission gate (unlike every other getter in this module): the
 * header must render for whichever role is exporting a report (pilot,
 * instructor, staff, admin alike), and the branding itself is not
 * sensitive data. The route's own `apiRoute` (`auth: 'required'` default)
 * is the only guard — an authenticated session, nothing more. Absent
 * `AppSetting` rows read as the fresh-install default: name
 * `'AirManager'`, no logo — never a missing field.
 */
export async function getAirfieldBranding(): Promise<AirfieldBrandingDto> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [AIRFIELD_NAME_KEY, AIRFIELD_LOGO_KEY] } },
    select: { key: true, value: true },
  });

  const name = rows.find((row) => row.key === AIRFIELD_NAME_KEY)?.value || DEFAULT_AIRFIELD_NAME;
  const logoDataUrl = rows.find((row) => row.key === AIRFIELD_LOGO_KEY)?.value || null;

  return { name, logoDataUrl };
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
 * Sets the airfield branding (AC 1). Gated `settings.manage` — admin-only,
 * same write-vs-read asymmetry as every other setter in this module.
 * `logoDataUrl: null` (AC 1: "rimozione logo") stores an empty string —
 * {@link getAirfieldBranding} reads an empty value back as `null`, the same
 * "empty string in storage, `null`/default at the read boundary" shape as
 * `getPprOperatingInstructions`'s `''`.
 */
export async function setAirfieldBranding(actor: Actor, input: AirfieldBrandingDto): Promise<AirfieldBrandingDto> {
  authorize(actor, 'settings.manage');

  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: AIRFIELD_NAME_KEY },
      update: { value: input.name },
      create: { key: AIRFIELD_NAME_KEY, value: input.name },
    }),
    prisma.appSetting.upsert({
      where: { key: AIRFIELD_LOGO_KEY },
      update: { value: input.logoDataUrl ?? '' },
      create: { key: AIRFIELD_LOGO_KEY, value: input.logoDataUrl ?? '' },
    }),
  ]);

  return input;
}
