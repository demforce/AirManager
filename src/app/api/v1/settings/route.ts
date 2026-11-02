import { z } from 'zod';
import { apiRoute } from '@/lib/api/handler';
import { flattenIssuesByPath } from '@/lib/api/issues-by-path';
import { updateSettingsSchema } from '@/lib/schemas/settings';
import { ValidationError } from '@/server/services/errors';
import { saveSettings } from '@/server/services/settings.service';

/**
 * The Impostazioni "Salva" (story 19.8, AD-1): ONE atomic request for the
 * whole page. `bodySchema: z.unknown()` keeps `apiRoute`'s 64 KB cap and JSON
 * parse; the real shape is validated here so a 422 can name the FULL path of
 * each refused field (`smtp.host`, `expiryTypes.create.0.name`) instead of
 * `z.flattenError`'s first key. Real gate in the service (`settings.manage`).
 */
export const PATCH = apiRoute<undefined, unknown>({
  bodySchema: z.unknown(),
  handle: async ({ actor, body }) => {
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input.', { fieldErrors: flattenIssuesByPath(parsed.error.issues) });
    }
    return saveSettings(actor, parsed.data);
  },
});
