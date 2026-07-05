import { apiRoute } from '@/lib/api/handler';
import { getMe } from '@/server/services/me.service';

/**
 * Thin route (AD-1): the shared wrapper (story 1.5) authenticates, calls the
 * service, and maps the result/error to the AD-8 envelope — no local
 * `DomainError` → HTTP mapping here anymore (that was story 1.3's
 * placeholder, closed by this story's F2).
 */
export const GET = apiRoute({
  handle: async ({ actor }) => getMe(actor),
});
