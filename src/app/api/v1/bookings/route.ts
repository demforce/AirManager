import { apiRoute } from '@/lib/api/handler';
import { createBookingSchema, listBookingsQuerySchema, type CreateBookingInput } from '@/lib/schemas/bookings';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { createBooking, listBookings } from '@/server/services/bookings.service';
import { exportBookingsXlsx } from '@/server/services/exports.service';

/**
 * Thin routes (AD-1): real authorization/business rules stay in
 * `bookings.service.ts` (AD-5). GET is `self.read` (every authenticated
 * role, story 7.1's FR-19 minimum); POST enforces the own/any creation
 * matrix.
 */
export const GET = apiRoute({
  querySchema: listBookingsQuerySchema,
  // Story 10.1 (AC 1/3): `?format=xlsx` is the SAME endpoint — the list is
  // deliberately shared (calendario comune, `self.read`), so the export
  // applies NO restriction beyond what `listBookings` already enforces.
  handle: async ({ actor, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportBookingsXlsx(actor, query);
      return xlsxResponse(buffer, filename);
    }
    return listBookings(actor, query);
  },
});

export const POST = apiRoute<undefined, CreateBookingInput>({
  bodySchema: createBookingSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createBooking(actor, body),
});
