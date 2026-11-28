import { apiRoute } from '@/lib/api/handler';
import { billingLiveQuerySchema, type BillingLiveResponseDto } from '@/lib/schemas/billing-live';
import { getBillingSummary } from '@/server/services/billing-summary.service';
import { getCompensationSummary } from '@/server/services/instructor-compensation.service';
import { getNegativeBalanceSummary } from '@/server/services/accounts.service';
import { listTransactions } from '@/server/services/transactions.service';
import { projectBillingCompensation, projectBillingNegativeBalances } from '@/lib/billing-live';

/** Reuse the page's authorized readers to reconcile all ledger surfaces after a write. */
export const GET = apiRoute({
  querySchema: billingLiveQuerySchema,
  handle: async ({ actor, query }): Promise<BillingLiveResponseDto> => {
    const asOf = new Date();
    const [firstPage, summary, compensation, negativeBalances] = await Promise.all([
      listTransactions(actor, query),
      getBillingSummary(actor, asOf),
      getCompensationSummary(actor),
      getNegativeBalanceSummary(actor),
    ]);
    const lastPage = Math.max(1, Math.ceil(firstPage.total / firstPage.pageSize));
    const transactions = query.page > lastPage
      ? await listTransactions(actor, { ...query, page: lastPage })
      : firstPage;

    return {
      asOf: asOf.toISOString(),
      transactions,
      summary,
      compensation: projectBillingCompensation(compensation),
      negativeBalances: { count: negativeBalances.count, top: projectBillingNegativeBalances(negativeBalances.top) },
    };
  },
});
