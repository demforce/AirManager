/**
 * Builds an `?format=xlsx` export URL for one of the 10 covered list
 * endpoints (story 10.1, AC 1/5) — same endpoint the view already reads,
 * `format`/`locale` always appended, every other filter included only when
 * it has a real value (an absent/empty filter is simply omitted, matching
 * how each view already builds its OWN fetch/navigation query string).
 * Used both server-side (a page passing current `searchParams` straight
 * through) and client-side (a manager's live filter state, e.g.
 * `flights-manager.tsx`) — plain string building, no React involved.
 */
export function buildExportHref(endpoint: string, filters: Record<string, string | undefined>, locale: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, value);
  }
  params.set('format', 'xlsx');
  params.set('locale', locale);
  return `${endpoint}?${params.toString()}`;
}

/**
 * Builds a PDF export URL (story 10.2, AC 2/5) for one of the 4 covered
 * report endpoints — SAME filter/locale-appending logic as
 * {@link buildExportHref}, but no `format` param: a PDF export lives on its
 * OWN dedicated route (`endpoint` is already e.g. `/api/v1/flights/pdf`,
 * spine :105), never `?format=pdf` on the list endpoint (that convention is
 * xlsx-only, story 10.1).
 */
export function buildPdfExportHref(endpoint: string, filters: Record<string, string | undefined>, locale: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, value);
  }
  params.set('locale', locale);
  return `${endpoint}?${params.toString()}`;
}
