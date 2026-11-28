import { apiRoute } from '@/lib/api/handler';
import { bookingOptionQuerySchema } from '@/lib/schemas/bookings';
import { searchBookingInstructors } from '@/server/services/bookings.service';

export const GET = apiRoute({
  querySchema: bookingOptionQuerySchema,
  handle: async ({ actor, query }) => searchBookingInstructors(actor, query.q),
});
