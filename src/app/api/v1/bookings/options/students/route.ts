import { apiRoute } from '@/lib/api/handler';
import { bookingOptionQuerySchema } from '@/lib/schemas/bookings';
import { searchBookingPeople } from '@/server/services/bookings.service';

export const GET = apiRoute({
  querySchema: bookingOptionQuerySchema,
  handle: async ({ actor, query }) => searchBookingPeople(actor, 'students', query.q),
});
