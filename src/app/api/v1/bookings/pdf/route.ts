import { apiRoute } from '@/lib/api/handler';
import { listBookingsQuerySchema } from '@/lib/schemas/bookings';
import { pdfResponse } from '@/server/adapters/pdf/response';
import { exportBookingsPdf } from '@/server/services/exports.service';

/**
 * Dedicated PDF route (story 13.7, AC 2 — spine :105, same pattern as
 * `ppr-requests/pdf/route.ts`, story 13.6). Reuses the SAME query schema as
 * `GET /api/v1/bookings` (period/aircraft/person/status filters + `locale`)
 * — `page`/`pageSize`/`format`, also present on that schema, are simply
 * ignored here (`exportBookingsPdf` always re-pages internally, same as the
 * xlsx export). Real authorization stays in `bookings.service.ts#listBookings`
 * (AD-5, `self.read` — every authenticated role).
 */
export const GET = apiRoute({
  querySchema: listBookingsQuerySchema,
  handle: async ({ actor, query }) => {
    const { buffer, filename } = await exportBookingsPdf(actor, query);
    return pdfResponse(buffer, filename);
  },
});
