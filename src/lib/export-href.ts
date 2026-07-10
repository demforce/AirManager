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
