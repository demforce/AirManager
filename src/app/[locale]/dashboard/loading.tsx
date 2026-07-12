import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Segment loading UI (story 12.2, AC 3). Next.js wraps `{children}` in
 * `dashboard/layout.tsx` in a Suspense boundary automatically whenever this
 * file exists next to it — no manual wiring needed — and swaps this in for
 * any dashboard sub-page navigation that suspends on the server (AD-1: pages
 * stay fetch-blocking server components). The shell (sidebar/topbar) is
 * OUTSIDE this boundary, so it stays visible and interactive while this
 * shows in the content panel. Generic (no per-page knowledge): a kicker/
 * title/description skeleton + one card skeleton, matching the shape every
 * dashboard page shares.
 */
export default function DashboardLoading() {
  return (
    <main className="flex-1 px-6 py-16 sm:px-16" aria-hidden="true">
      <div className="mx-auto max-w-5xl">
        {/* On the bare canvas the default bg-canvas fill is invisible — use hairline here (review 12.2, 122-F1) */}
        <Skeleton className="h-5 w-32 bg-hairline" />
        <Skeleton className="mt-4 h-9 w-72 bg-hairline" />
        <Skeleton className="mt-3 h-4 w-96 bg-hairline" />

        <Card className="mt-10 p-6">
          <Skeleton className="h-5 w-40" />
          <div className="mt-4 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </Card>
      </div>
    </main>
  );
}
