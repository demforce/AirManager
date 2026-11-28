import { apiRoute } from '@/lib/api/handler';
import { membershipFeeSettingSchema, type MembershipFeeSettingDto } from '@/lib/schemas/settings';
import { getMembershipFeeCents, setMembershipFeeCents } from '@/server/services/app-settings.service';

/**
 * Thin routes (AD-1) — story 12.11, AC 1 (ratifica utente 1). GET is
 * `finance.manage` (ADMIN-only — the Scadenze "Quota associativa" action
 * needs the default too); PUT is `settings.manage` (ADMIN-only).
 */
export const GET = apiRoute({
  handle: async ({ actor }) => ({ annualFeeCents: await getMembershipFeeCents(actor) }),
});

export const PUT = apiRoute<undefined, MembershipFeeSettingDto>({
  bodySchema: membershipFeeSettingSchema,
  handle: async ({ actor, body }) => ({ annualFeeCents: await setMembershipFeeCents(actor, body.annualFeeCents) }),
});
