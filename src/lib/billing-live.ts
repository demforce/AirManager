import type { BillingLiveResponseDto } from '@/lib/schemas/billing-live';
import type { InstructorCompensationSummaryItem } from '@/server/services/instructor-compensation.service';
import type { NegativeBalanceItem } from '@/server/services/accounts.service';

/** The wire contract and client snapshot share one schema. */
export type BillingLiveSnapshot = BillingLiveResponseDto;

export type BillingCompensationRow = Pick<InstructorCompensationSummaryItem, 'personId' | 'firstName' | 'lastName' | 'mtdMinutes' | 'payoutRateCents' | 'owedMtdCents'>;
export type BillingNegativeBalanceRow = Pick<NegativeBalanceItem, 'personId' | 'firstName' | 'lastName' | 'balanceCents'>;

/** Only active instructors belong in the Billing preview; inactive debt stays on the compensation page. */
export function projectBillingCompensation(rows: InstructorCompensationSummaryItem[]): BillingCompensationRow[] {
  return rows.filter((row) => row.isActive).map((row) => ({
    personId: row.personId,
    firstName: row.firstName,
    lastName: row.lastName,
    mtdMinutes: row.mtdMinutes,
    payoutRateCents: row.payoutRateCents,
    owedMtdCents: row.owedMtdCents,
  }));
}

export function projectBillingNegativeBalances(rows: NegativeBalanceItem[]): BillingNegativeBalanceRow[] {
  return rows.map((row) => ({
    personId: row.personId,
    firstName: row.firstName,
    lastName: row.lastName,
    balanceCents: row.balanceCents,
  }));
}
