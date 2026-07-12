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
 *
 * `variant` (story 12.4, AC 6): `'button'` (default, unchanged) is the
 * standalone pill used everywhere today; `'menuItem'` is a plain full-width
 * row for a caller that collects several `ExportButton`s inside a `Menu`
 * (only the flights registry does so as of this story — every other call
 * site keeps the default and is byte-identical).
 */
export type ExportButtonVariant = 'button' | 'menuItem';

export type ExportButtonProps = {
  href: string;
  label: string;
  testId?: string;
  variant?: ExportButtonVariant;
};

const VARIANT_CLASSES: Record<ExportButtonVariant, string> = {
  button: 'inline-flex min-h-[40px] items-center rounded-buttons border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas',
  menuItem: 'block px-3 py-2 text-sm text-ink transition-colors hover:bg-canvas',
};

export function ExportButton({ href, label, testId, variant = 'button' }: ExportButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      className={VARIANT_CLASSES[variant]}
    >
      {label}
    </a>
  );
}
