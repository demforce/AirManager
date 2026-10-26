import { describe, expect, it } from 'vitest';
import { parseApiError } from './api-field-errors';

/** Minimal `Response`-shaped stub — only `.json()` is ever called by `parseApiError`. */
function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response;
}

describe('parseApiError', () => {
  it('reads code + field names out of a VALIDATION_ERROR envelope (AD-8, Zod flattenError shape)', async () => {
    const response = jsonResponse({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input.',
        details: { formErrors: [], fieldErrors: { contactEmail: ['Invalid email'], icao: ['Too long'] } },
      },
    });

    const result = await parseApiError(response);

    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.fieldErrors).toEqual(new Set(['contactEmail', 'icao']));
  });

  it('returns an empty field set for a domain error with no field-shaped details (e.g. CONFLICT)', async () => {
    const response = jsonResponse({ error: { code: 'CONFLICT', message: 'Already exists.' } });

    const result = await parseApiError(response);

    expect(result.code).toBe('CONFLICT');
    expect(result.fieldErrors.size).toBe(0);
  });

  it('degrades to code null / empty fields on a non-JSON body', async () => {
    const response = { json: () => Promise.reject(new Error('not JSON')) } as unknown as Response;

    const result = await parseApiError(response);

    expect(result.code).toBeNull();
    expect(result.fieldErrors.size).toBe(0);
  });
});
