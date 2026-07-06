import { apiRoute } from '@/lib/api/handler';
import {
  createHourMeterAdjustmentSchema,
  listHourMeterAdjustmentsQuerySchema,
  type CreateHourMeterAdjustmentInput,
  type ListHourMeterAdjustmentsQuery,
} from '@/lib/schemas/aircraft';
import { adjustHourMeter, listHourMeterAdjustments } from '@/server/services/aircraft.service';

type RouteParams = { id: string };

export const GET = apiRoute<ListHourMeterAdjustmentsQuery, undefined, RouteParams>({
  querySchema: listHourMeterAdjustmentsQuerySchema,
  handle: async ({ actor, params, query }) => listHourMeterAdjustments(actor, params.id, query),
});

export const POST = apiRoute<undefined, CreateHourMeterAdjustmentInput, RouteParams>({
  bodySchema: createHourMeterAdjustmentSchema,
  handle: async ({ actor, params, body }) => adjustHourMeter(actor, params.id, body),
});
