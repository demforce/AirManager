import { apiRoute } from '@/lib/api/handler';
import { clubIdentitySchema, type ClubIdentityDto } from '@/lib/schemas/settings';
import {
  getAirfieldContactEmail,
  getAirfieldIcao,
  setAirfieldContactEmail,
  setAirfieldIcao,
} from '@/server/services/app-settings.service';

/**
 * Thin routes (AD-1) — story 12.11, AC 1/2. GET has no permission check
 * beyond the default authenticated session (same asymmetry as
 * `settings/airfield`); PUT is `settings.manage` (real gate in the service,
 * AD-5). Two separate `AppSetting` keys read/written together as one DTO —
 * `airfield.name`/`airfield.logo` stay on `settings/airfield`, untouched.
 */
export const GET = apiRoute({
  handle: async () => {
    const [icao, contactEmail] = await Promise.all([getAirfieldIcao(), getAirfieldContactEmail()]);
    return { icao, contactEmail };
  },
});

export const PUT = apiRoute<undefined, ClubIdentityDto>({
  bodySchema: clubIdentitySchema,
  handle: async ({ actor, body }) => {
    const [icao, contactEmail] = await Promise.all([
      setAirfieldIcao(actor, body.icao),
      setAirfieldContactEmail(actor, body.contactEmail),
    ]);
    return { icao, contactEmail };
  },
});
