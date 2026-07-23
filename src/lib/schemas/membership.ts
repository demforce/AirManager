import { z } from './zod-with-openapi';

/**
 * `POST /api/v1/people/{id}/membership-fee` body (story 12.11, AC 7;
 * ratifiche utente 1/1a/1b) — "Quota associativa": addebito + rinnovo
 * scadenza in un solo gesto. `amountCents` is precompiled client-side from
 * `membership.annualFeeCents` but always sent explicit (admin-editable).
 *
 * `override` (review F3, PO decision 2026-07-17): when the addebito would
 * take the balance below zero, the request is refused UNLESS `override` is
 * `true` — which itself requires `settings.manage` (ADMIN-only, checked in
 * `membership.service.ts`).
 */
export const chargeMembershipFeeSchema = z.object({
  amountCents: z.number().int().positive().max(2_147_483_647),
  override: z.boolean().optional().default(false),
});

export type ChargeMembershipFeeInput = z.infer<typeof chargeMembershipFeeSchema>;

export const chargeMembershipFeeResponseSchema = z.object({
  balanceCents: z.number().int(),
  expiryId: z.string(),
  expiresAt: z.iso.date(),
});

export type ChargeMembershipFeeResponseDto = z.infer<typeof chargeMembershipFeeResponseSchema>;
