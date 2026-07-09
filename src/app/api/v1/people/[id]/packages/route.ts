import { apiRoute } from '@/lib/api/handler';
import { sellPackageSchema, type SellPackageInput } from '@/lib/schemas/packages';
import { listPersonPackages, sellPackage } from '@/server/services/packages.service';

type RouteParams = { id: string };

/**
 * Thin routes (AD-1) — real authorization (`finance.manage` for POST,
 * `people.read`/own-access for GET) stays in `packages.service.ts` (AD-5).
 * Person-scoped (`{id}` is the `Person.id`), same shape as
 * `.../account/...`/`.../instructor-rates`.
 */
export const GET = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => listPersonPackages(actor, params.id),
});

// Story TD-2 (AC 5): opt-in `Idempotency-Key` header — see account/top-ups/route.ts.
export const POST = apiRoute<undefined, SellPackageInput, RouteParams>({
  bodySchema: sellPackageSchema,
  successStatus: 201,
  idempotency: { endpoint: 'package-sale' },
  handle: async ({ actor, params, body }) => sellPackage(actor, params.id, body),
});
