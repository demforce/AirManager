import { z } from './zod-with-openapi';

export const inventoryReasons = [
  'accountOnly', 'personOnly', 'inactiveAccount', 'archivedPerson', 'inactiveProfiles',
  'missingContact', 'invalidContact', 'invalidAccount', 'notEnrolled', 'pendingVerification',
  'staleVerification', 'differentAddresses', 'duplicate',
] as const;
const reasonSchema = z.enum(inventoryReasons);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative();
const rowSchema = z.object({
  personId: z.string().nullable(), userId: z.string().nullable(), reasons: z.array(reasonSchema),
  mixedProfiles: z.boolean(), queued: count, inFlight: count, uncertain: count,
});
export const legacyMailPageSchema = z.object({ page: z.coerce.number().int().min(1).max(1_000_000).default(1) });
export const legacyMailPolicySchema = z.strictObject({ enabled: z.boolean() });
export const legacyMailChangeSchema = legacyMailPolicySchema.extend({ revision });
export const legacyMailPreviewSchema = z.object({
  enabled: z.boolean(), revision, total: count, eligible: count, page: z.number().int().positive(),
  pages: z.number().int().positive(), rows: z.array(rowSchema).max(30),
});
export type InventoryReason = z.infer<typeof reasonSchema>;
export type LegacyMailRow = z.infer<typeof rowSchema>;
export type LegacyMailPreview = z.infer<typeof legacyMailPreviewSchema>;
