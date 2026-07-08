import { apiRoute } from '@/lib/api/handler';
import { calendarBookingsQuerySchema } from '@/lib/schemas/bookings';
import { listCalendarBookings } from '@/server/services/bookings.service';

/**
 * Thin route (AD-1, parity with a future Flutter client) — real validation
 * (range order/width) and authorization stay in
 * `bookings.service.ts#listCalendarBookings` (AD-5). `self.read` (every
 * authenticated role, FR-19).
 */
export const GET = apiRoute({
  querySchema: calendarBookingsQuerySchema,
  handle: async ({ actor, query }) => listCalendarBookings(actor, query),
});
