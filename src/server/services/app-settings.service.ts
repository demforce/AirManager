import type { PprOperatingInstructionsDto } from '@/lib/schemas/ppr';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';

/**
 * The FIRST real plumbing around the `AppSetting` K/V table (existing since
 * story 1.1, never given a dedicated service until now — see the model's
 * doc-comment in `schema.prisma`). Deliberately minimal and PPR-specific
 * today (epic 8, story 8.2, AC 1) rather than a generic settings CRUD: the
 * story's SCOPE CONTROLLATO explicitly defers a general `/settings` page —
 * this module only knows about the two `ppr.operatingInstructions.*` keys.
 * A future story that needs another setting adds its own narrow
 * get/set pair here rather than widening these two into something generic.
 */

const PPR_OPERATING_INSTRUCTIONS_IT_KEY = 'ppr.operatingInstructions.it';
const PPR_OPERATING_INSTRUCTIONS_EN_KEY = 'ppr.operatingInstructions.en';

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
