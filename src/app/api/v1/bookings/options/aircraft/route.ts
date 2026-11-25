import { apiRoute } from '@/lib/api/handler';
import { bookingOptionQuerySchema } from '@/lib/schemas/bookings';
import { searchBookingAircraft } from '@/server/services/bookings.service';

export const GET = apiRoute({
  querySchema: bookingOptionQuerySchema,
  handle: async ({ actor, query }) => searchBookingAircraft(actor, query.q),
});
