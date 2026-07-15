'use client';

import { useState } from 'react';

/**
 * The header name the 5 forms send and `src/lib/api/handler.ts`'s
 * `idempotency` option reads (`IDEMPOTENCY_KEY_HEADER` there) — duplicated
 * as a literal rather than imported: `handler.ts` is a server module (it
 * statically imports `next/server`/`@/server/db/prisma`) and must never be
 * pulled into a client bundle. Keep the two literals in sync if this ever
 * changes.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * Client-side lifecycle for the `Idempotency-Key` header (story TD-2, AC 6),
 * shared by the 5 money-mutating forms (top-up, rettifica, vendita
 * pacchetto, registrazione volo, movimento cassa) plus (epic 12, story 12.4)
 * the manual PPR intake slide-over (`manual-ppr-form.tsx`) — data-creating,
 * not money-mutating, but the same "a network retry must replay, not
 * duplicate" contract applies. The key survives a
 * NETWORK failure (the `fetch` call itself throws — offline, DNS, a dropped
 * connection mid-request — exactly the retry this protects: the caller must
 * reuse the SAME key so the server-side wrapper (`src/lib/api/handler.ts`)
 * can replay instead of re-executing) but is regenerated after ANY HTTP
 * response arrives, success OR an application-level error (422/409/...): a
 * fresh submission attempt, after the user corrected the input, must not
 * collide with a completed or still-PENDING record under the OLD key.
 *
 * Usage (identical shape in all 5 forms):
 * ```ts
 * const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();
 * // ...
 * let response: Response;
 * try {
 *   response = await fetch(url, { headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey, ... }, ... });
 * } catch {
 *   // Network failure: key intentionally NOT regenerated (AC 6).
 *   setFormError(labels.genericError);
 *   return;
 * }
 * regenerateIdempotencyKey();
 * // ... handle `response` as before ...
 * ```
 */
export function useIdempotencyKey() {
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  function regenerateIdempotencyKey(): void {
    setIdempotencyKey(crypto.randomUUID());
  }

  return { idempotencyKey, regenerateIdempotencyKey };
}
