import { accountOverviewSchema, paymentMethodSchema } from './accounts';
import { z } from './zod-with-openapi';

// --- Package sale and residuals (story 4.4, Task 4, AC 1/2) ----------------
// `HourPackage` is the sold, ledger-shaped twin of the `PackageType` listino
// (story 4.3): the sale schemas live here, distinct from `package-types.ts`
// (the mutable catalogue configuration).

/**
 * `POST /api/v1/people/{id}/packages` body (AC 1). `packageTypeId` must
 * reference an ACTIVE `PackageType` (409 otherwise, checked server-side in
 * `packages.service.ts#sellPackage`) — the sale form only offers active
 * types, but the API re-validates regardless. `paymentMethod` reuses the
 * same enum/shape as a top-up (`recordTopUpSchema.paymentMethod`, story
 * 3.1): the payment is EXTERNAL to the prepaid account (Dev Notes) — there
 * is deliberately no `amountCents` field here, the price is the type's
 * SNAPSHOT (`priceCents`), resolved server-side, never sent by the client.
 * `effectiveDate` is a calendar date only (`YYYY-MM-DD`), same convention as
 * `recordTopUpSchema.effectiveDate`. `description` is an optional free-text
 * note (same shape as `recordTopUpSchema.description`).
 */
export const sellPackageSchema = z.object({
  packageTypeId: z.string().min(1),
  paymentMethod: paymentMethodSchema,
  effectiveDate: z.iso.date(),
  description: z.string().trim().min(1).max(500).nullish(),
});

export type SellPackageInput = z.infer<typeof sellPackageSchema>;

/**
 * One entry of `GET /api/v1/people/{id}/packages` (AC 2). Documentation
 * only, mirroring `packages.service.ts`'s `HourPackageListItem`.
 * `remainingMinutes` is ALWAYS computed (AD-3, never a persisted counter) —
 * today (story 4.4, before epic 5's consumption model) it always equals
 * `includedMinutes`. `expiresAt: null` means no expiry (the type had no
 * `validityMonths` at sale time). `isExpired` is `true` only when
 * `expiresAt` is STRICTLY before today (the expiry day itself is still
 * valid — Dev Notes boundary decision). `actorEmail` is present ONLY when
 * the caller has `people.read` (same conditional-field pattern as
 * `accountStatementItemSchema`).
 */
export const hourPackageItemSchema = z.object({
  id: z.string(),
  typeName: z.string(),
  includedMinutes: z.number().int().nonnegative(),
  remainingMinutes: z.number().int().nonnegative(),
  pricePaidCents: z.number().int().nonnegative(),
  paymentMethod: paymentMethodSchema,
  effectiveDate: z.iso.date(),
  expiresAt: z.iso.date().nullable(),
  isExpired: z.boolean(),
  createdAt: z.iso.datetime(),
  actorEmail: z.string().optional(),
});

export type HourPackageItemDto = z.infer<typeof hourPackageItemSchema>;

/**
 * `GET /api/v1/people/{id}/packages` response — a plain array, not the AD-8
 * paginated envelope (same choice as `instructorRateListResponseSchema`: a
 * small, per-person list, defensively capped at `take: 500` in the service).
 */
export const hourPackageListResponseSchema = z.array(hourPackageItemSchema);

export type HourPackageListResponseDto = z.infer<typeof hourPackageListResponseSchema>;

/**
 * `POST /api/v1/people/{id}/packages` response (AC 1) — the created package
 * plus the refreshed account overview. The balance itself never moves (Dev
 * Notes: the payment is external), but the new zero-amount
 * `PACKAGE_PURCHASE` movement changes the "recent movements" preview the UI
 * must reflect immediately — same rationale as `recordTopUp`'s return shape.
 */
export const sellPackageResponseSchema = z.object({
  package: hourPackageItemSchema,
  account: accountOverviewSchema,
});

export type SellPackageResponseDto = z.infer<typeof sellPackageResponseSchema>;
