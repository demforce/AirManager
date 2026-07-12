'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CommandPalette, type CommandPaletteNavItem } from './command-palette';

export type SearchTriggerProps = {
  navItems: CommandPaletteNavItem[];
  canRegisterFlight: boolean;
  canCreatePerson: boolean;
  canSearch: boolean;
};

/** Minimal Feather-style magnifier (same inline-SVG convention as `ui/date-picker.tsx`'s calendar icon) — decorative only, `aria-hidden`. */
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

/**
 * Topbar Search Trigger (story 12.6, AC 1 — DESIGN.md "Search Trigger":
 * `bg-canvas`/`text-mid-gray`, 18px radius, `⌘K` hint right-aligned).
 * Rendered inside `Topbar` the same way `LocaleSwitcher`/`LogoutButton` are
 * (topbar.tsx stays presentational, receiving only primitives) — but unlike
 * those two, this component ALSO owns the palette's `open` state and the
 * global ⌘K/Ctrl+K listener, since both the visible button and the shortcut
 * must open the SAME palette instance. Living inside `Topbar`, which itself
 * is part of the persistent `dashboard/layout.tsx` shell, means neither the
 * listener nor the palette are ever torn down between in-shell navigations
 * (AC 1's "mai ri-montati").
 */
export function SearchTrigger({ navItems, canRegisterFlight, canCreatePerson, canSearch }: SearchTriggerProps) {
  const t = useTranslations('DashboardShell.searchTrigger');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut) return;
      // Always block the browser's own binding (Firefox's quick-find uses
      // Ctrl+K too — story's AC 1), even when the guard below ends up not
      // opening the palette.
      event.preventDefault();
      // Decision (story Contesto): open regardless of where focus currently
      // is, EXCEPT while another native `<dialog>` is already open (e.g. the
      // flight registration form) — a single DOM check covers every such
      // dialog without this component tracking their state itself.
      if (document.querySelector('dialog[open]')) return;
      setOpen(true);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('label')}
        data-testid="command-palette-trigger"
        className="hidden items-center gap-2 rounded-inputs bg-canvas px-2.5 py-2 text-sm text-mid-gray transition-colors hover:bg-hairline/60 sm:flex sm:w-48"
      >
        <SearchIcon />
        <span className="truncate">{t('label')}</span>
        <kbd className="ml-auto shrink-0 rounded-nested border border-hairline bg-paper px-1.5 py-0.5 text-xs text-mid-gray">⌘K</kbd>
      </button>
      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        navItems={navItems}
        canRegisterFlight={canRegisterFlight}
        canCreatePerson={canCreatePerson}
        canSearch={canSearch}
      />
    </>
  );
}
