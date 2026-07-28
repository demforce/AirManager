/**
 * Story 14.2, AC 3: reads the AD-8 422 envelope's `error.details.fieldErrors`
 * (Zod `flattenError`, `src/lib/api/handler.ts#validationErrorResponse`/
 * `domainErrorResponse`) out of a failed `fetch` `Response` — the ONE place
 * that knows the wire shape, so every form calls this instead of re-parsing
 * `response.json()` ad hoc. The raw per-field zod messages are never shown
 * verbatim (AD-8's own contract: messages are for logs, codes+details drive
 * the UI) — callers map each field NAME present here onto their OWN existing
 * translated label (the same generic "Campo obbligatorio."-style string
 * already used for client-side required checks, reused per field per AC 4).
 */

export type ParsedApiError = {
  /** `error.code`, or `null` for a non-JSON body or a response with no envelope. */
  code: string | null;
  /** Field names present in `error.details.fieldErrors` — empty when the response carries none (a non-422 error, or a service-level `ValidationError` without field-shaped `details`). */
  fieldErrors: Set<string>;
};

type ErrorEnvelopeBody = {
  error?: {
    code?: string;
    details?: {
      fieldErrors?: Record<string, string[]>;
    };
  };
};

export async function parseApiError(response: Response): Promise<ParsedApiError> {
  const body: unknown = await response.json().catch(() => null);
  const error = (body as ErrorEnvelopeBody | null)?.error;
  const fieldErrors = error?.details?.fieldErrors;
  return {
    code: error?.code ?? null,
    fieldErrors: new Set(fieldErrors ? Object.keys(fieldErrors) : []),
  };
}
