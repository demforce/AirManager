import { apiRoute } from '@/lib/api/handler';
import { createPersonSchema, listPeopleQuerySchema } from '@/lib/schemas/people';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { exportPeopleXlsx } from '@/server/services/exports.service';
import { createPerson, listPeople } from '@/server/services/people.service';

/**
 * Thin routes (AD-1): the shared wrapper (story 1.5) validates, calls the
 * service, and maps the result/error to the AD-8 envelope. All
 * authorization still lives in `people.service.ts` (AD-5).
 */
export const GET = apiRoute({
  querySchema: listPeopleQuerySchema,
  // Story 10.1 (AC 1): `?format=xlsx` is the SAME endpoint, not a dedicated
  // route — `exportPeopleXlsx` reuses `listPeople` internally (AC 3's
  // permission parity). The JSON branch below is UNCHANGED.
  handle: async ({ actor, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportPeopleXlsx(actor, query);
      return xlsxResponse(buffer, filename);
    }
    return listPeople(actor, query);
  },
});

export const POST = apiRoute({
  bodySchema: createPersonSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createPerson(actor, body),
});
