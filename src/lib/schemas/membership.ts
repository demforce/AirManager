import { z } from './zod-with-openapi';

/**
 * `POST /api/v1/people/{id}/membership-fee` body (story 12.11, AC 7;
 * ratifiche utente 1/1a/1b) — "Quota associativa": addebito + rinnovo
 * scadenza in un solo gesto. `amountCents` is precompiled client-side from
 * `membership.annualFeeCents` but always sent explicit (admin-editable).
 *
 * `force` (review F3, PO decision 2026-07-17; the one deroga pattern since
 * story 19.10, CR §4.6): when the balance does not cover the addebito the
 * request is refused with 422 `REQUIREMENTS_NOT_MET` (one `BALANCE` failure)
 * UNLESS `force` is `true` — which requires `requirements.force`
 * (ADMIN-only, checked in `membership.service.ts`), no motivo. A body still
 * carrying the field it replaced is accepted and that field ignored.
 */
export const chargeMembershipFeeSchema = z.object({
  amountCents: z.number().int().positive().max(2_147_483_647),
  force: z.boolean().optional().default(false),
});

export type ChargeMembershipFeeInput = z.infer<typeof chargeMembershipFeeSchema>;

export const chargeMembershipFeeResponseSchema = z.object({
  balanceCents: z.number().int(),
  expiryId: z.string(),
  expiresAt: z.iso.date(),
  /** Story 14.4 review F7 (ratifica R-14.4-d) — same in-app "saldo in rosso" signal as `accountOverviewWithAlertSchema`; see `ChargeMembershipFeeResult`'s own doc-comment. */
  balanceAlert: z.boolean(),
});

export type ChargeMembershipFeeResponseDto = z.infer<typeof chargeMembershipFeeResponseSchema>;
