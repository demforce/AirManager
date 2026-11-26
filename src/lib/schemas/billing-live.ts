import { z } from './zod-with-openapi';
import { negativeBalanceItemSchema } from './accounts';
import { cashReportResponseSchema } from './cash';
import { instructorCompensationSummaryItemSchema } from './instructor-compensation';
import { listTransactionsQuerySchema, transactionListResponseSchema } from './transactions';

/** The Billing page uses this subset of the ledger query and always returns JSON. */
const ledgerQuery = listTransactionsQuerySchema.shape;
export const billingLiveQuerySchema = z.object({
  page: ledgerQuery.page,
  pageSize: ledgerQuery.pageSize,
  from: ledgerQuery.from,
  to: ledgerQuery.to,
  bookType: ledgerQuery.bookType,
  categoryId: ledgerQuery.categoryId,
  personQuery: ledgerQuery.personQuery,
  unattributed: ledgerQuery.unattributed,
}).strict();

/** GET /api/v1/billing-view: the same authorized readers as the Billing page, projected to its visible fields. */
export const billingLiveSnapshotSchema = z.object({
  asOf: z.iso.datetime(),
  transactions: transactionListResponseSchema,
  summary: z.object({
    result: z.object({ revenueCents: z.number().int(), costCents: z.number().int(), netCents: z.number().int() }),
    treasury: z.object({
      cashCents: z.number().int(),
      bankCents: z.number().int(),
      unattributedCents: z.number().int(),
      unattributedCount: z.number().int().min(0),
      availableCents: z.number().int(),
    }),
    deposits: z.object({ totalCents: z.number().int(), exposureCents: z.number().int(), inRedCount: z.number().int().min(0) }),
    byCategory: cashReportResponseSchema,
  }),
  compensation: z.array(instructorCompensationSummaryItemSchema.pick({
    personId: true, firstName: true, lastName: true, mtdMinutes: true, payoutRateCents: true, owedMtdCents: true,
  })),
  negativeBalances: z.object({
    count: z.number().int().min(0),
    top: z.array(negativeBalanceItemSchema.pick({ personId: true, firstName: true, lastName: true, balanceCents: true })).max(20),
  }),
});

export type BillingLiveResponseDto = z.infer<typeof billingLiveSnapshotSchema>;
