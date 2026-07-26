import { apiRoute } from '@/lib/api/handler';
import { treasurySettingsSchema, type TreasurySettingsInput } from '@/lib/schemas/settings';
import { setTreasurySettings } from '@/server/services/app-settings.service';

/**
 * Thin route (AD-1) — story Billing-1, AC 3. Admin-only (`settings.manage`):
 * the opening balances are pure admin configuration, the Billing-2 card's
 * own future save action. No GET here yet — `getBillingSummary`
 * (`billing-summary.service.ts`) reads the values directly via
 * `getTreasuryOpeningInternal`, no HTTP round-trip needed until Billing-2's
 * card needs to prefill itself.
 */
export const PUT = apiRoute<undefined, TreasurySettingsInput>({
  bodySchema: treasurySettingsSchema,
  handle: async ({ actor, body }) => setTreasurySettings(actor, body),
});
