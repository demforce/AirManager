import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';

export type PagerProps = {
  page: number;
  totalPages: number;
  /** Builds each page's `href` — every call site keeps its OWN `?page=` semantics/other-filter preservation (Dev Notes: "nessun cambio di semantica URL"). */
  hrefBuilder: (targetPage: number) => ComponentProps<typeof Link>['href'];
  locale: AppLocale;
  /** `data-testid`s — all optional, all INVARIANT from before this story (AC 4): only pass the ones a given page already had. */
  navTestId?: string;
  statusTestId?: string;
  prevTestId?: string;
  nextTestId?: string;
};

/**
 * Shared server-rendered pager (story 12.5, AC 4) — absorbs the `<nav>`
 * markup duplicated across 9+ list pages, restyled on the token system
 * (bigger touch targets, `text-ink` status instead of the previous
 * `text-mid-gray text-sm` "1 / 3 microscopico"). Same `?page=` server-side
 * semantics and the SAME `data-testid`s each call site had — this component
 * only absorbs markup, it never changes behavior (Dev Notes).
 *
 * No `'use client'`: `Link` (next-intl's typed navigation) needs no client
 * JS of its own, so this renders equally from the server list pages that
 * are its only callers (same reasoning as `ExportButton`'s plain anchor).
 */
export function Pager({ page, totalPages, hrefBuilder, locale, navTestId, statusTestId, prevTestId, nextTestId }: PagerProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-6 flex items-center justify-center gap-4" data-testid={navTestId}>
      <Link
        href={hrefBuilder(page - 1)}
        locale={locale}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
        data-testid={prevTestId}
        className={`flex min-h-[40px] min-w-[40px] items-center justify-center rounded-buttons border border-hairline bg-paper text-base text-ink transition-colors ${
          page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-canvas'
        }`}
      >
        ←
      </Link>
      <span data-testid={statusTestId} className="text-sm font-medium text-ink">
        {page} / {totalPages}
      </span>
      <Link
        href={hrefBuilder(page + 1)}
        locale={locale}
        aria-disabled={page >= totalPages}
        tabIndex={page >= totalPages ? -1 : undefined}
        data-testid={nextTestId}
        className={`flex min-h-[40px] min-w-[40px] items-center justify-center rounded-buttons border border-hairline bg-paper text-base text-ink transition-colors ${
          page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-canvas'
        }`}
      >
        →
      </Link>
    </nav>
  );
}
