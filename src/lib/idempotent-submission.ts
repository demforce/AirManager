import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * The header name the 7 forms send and `src/lib/api/handler.ts`'s
 * `idempotency` option reads (`IDEMPOTENCY_KEY_HEADER` there) — duplicated
 * as a literal rather than imported: `handler.ts` is a server module (it
 * statically imports `next/server`/`@/server/db/prisma`) and must never be
 * pulled into a client bundle. Keep the two literals in sync if this ever
 * changes.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * UUIDv4 that also works in NON-secure contexts: `crypto.randomUUID` is
 * gated to https/localhost, so browsing the app over plain http on a LAN IP
 * (demo/remote setups) would crash any component rendering this hook.
 * `crypto.getRandomValues` has no such gate and is universally available.
 */
function randomIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class IdempotentSubmissionError extends Error {
  constructor(readonly reason: 'inProgress' | 'uncertain' | 'verifyFirst') {
    super(reason);
  }
}

type Attempt = { key: string; force: boolean };
type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Payload = Readonly<Record<string, unknown>>;
type IdempotentSubmit = (path: string, body: Payload) => Promise<Response>;

const definitiveRefusals = new Set([400, 403, 404, 409, 422]);

/**
 * Retain a key until a conclusive response for this form operation arrives.
 * Use an actor-scoped digest, never form data, in tab storage. The fallback
 * protects retries within the current page even when storage is unavailable.
 */
export function createIdempotentSubmitter(
  actorId: string,
  storage: AttemptStorage,
  fetcher: typeof fetch,
  fallback = new Map<string, Attempt>(),
): IdempotentSubmit {
  return async (path, body) => {
    const { force, ...fields } = body;
    const identity = 'airmanager:pending:v1:' + bytesToHex(sha256(JSON.stringify([actorId, path, fields])));
    let stored: Attempt | undefined;
    try {
      const raw = storage.getItem(identity);
      if (raw) {
        const value: Partial<Attempt> | null = JSON.parse(raw);
        if (typeof value?.key === 'string' && typeof value.force === 'boolean') stored = { key: value.key, force: value.force };
      }
    } catch { /* Storage can be denied by the browser. */ }
    const previous = stored ?? fallback.get(identity);
    if (force === true && previous && !previous.force) throw new IdempotentSubmissionError('inProgress');

    // If a previously authorized override did not conclude, a retry of the
    // same form (even after reopening it) must keep that exact request.
    const attempt = previous ?? { key: randomIdempotencyKey(), force: force === true };
    fallback.set(identity, attempt);
    try { storage.setItem(identity, JSON.stringify(attempt)); } catch { /* Retain in memory. */ }

    let response: Response;
    let code: string | undefined;
    try {
      response = await fetcher(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: attempt.key },
        body: JSON.stringify(attempt.force ? { ...fields, force: true } : fields),
      });
      // Fetch can succeed at the headers and fail mid-body. Confirm complete
      // JSON before retiring the key; leave the original body for the form.
      const result = await response.clone().json() as { error?: { code?: string } } | null;
      code = result?.error?.code;
    } catch {
      throw new IdempotentSubmissionError('uncertain');
    }
    if (response.status === 409 && code === 'IDEMPOTENCY_IN_PROGRESS') {
      throw new IdempotentSubmissionError('inProgress');
    }
    if (response.status === 422 && code === 'IDEMPOTENCY_KEY_MISMATCH') {
      throw new IdempotentSubmissionError('verifyFirst');
    }
    if (response.ok || (code && definitiveRefusals.has(response.status))) {
      // A late response to an older request must not delete a newer attempt.
      if (fallback.get(identity)?.key === attempt.key) {
        fallback.delete(identity);
        try { storage.removeItem(identity); } catch { /* No writable storage. */ }
      }
      return response;
    }
    if (response.status === 401 && code) return response; // Can retry once logged in again.
    throw new IdempotentSubmissionError('uncertain');
  };
}
