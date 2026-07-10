/**
 * "Esporta Excel" action (story 10.1, AC 5) — a plain `<a href>` to the
 * SAME list endpoint the view already reads, with `format=xlsx` plus the
 * view's CURRENT locale and filters appended (every call site builds
 * `href` from its own live filter state, never a stale snapshot — see each
 * caller). No client-side fetch/blob handling: the server sets
 * `Content-Disposition: attachment` (`xlsxResponse`), so the browser
 * downloads it on its own. `target="_blank"` keeps a rare error response
 * (e.g. 422 `EXPORT_TOO_LARGE`, which has no attachment header and would
 * otherwise render as raw JSON) from navigating the dashboard tab away.
 *
 * No `'use client'` needed — a plain anchor has no interactivity of its
 * own, so this renders equally from a server or a client component
 * (matching `minimalist-ui`'s secondary-button style used across every
 * other dashboard action of this weight).
 */
export type ExportButtonProps = {
  href: string;
  label: string;
  testId?: string;
};

export function ExportButton({ href, label, testId }: ExportButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      className="inline-flex min-h-[40px] items-center rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
    >
      {label}
    </a>
  );
}
