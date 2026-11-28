import { boundedOptions, PICKER_LIMIT } from '@/lib/picker';
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
    if (query.picker) {
      const result = await listPeople(actor, { ...query, page: 1, pageSize: PICKER_LIMIT + 1 });
      return boundedOptions(result.items.map(({ id, firstName, lastName, profiles }) => ({ id, firstName, lastName, profiles })));
    }
    return listPeople(actor, query);
  },
});

export const POST = apiRoute({ sanitizeUnexpected: true,
  bodySchema: createPersonSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createPerson(actor, body),
});
