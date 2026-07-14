'use client';

/**
 * Theme toggle (story 12.1, AC 2) — cookie-persisted `data-theme` switch,
 * behavior-ported from `docs/design-reference/airops/src/TopBar.jsx`'s
 * inline toggle button into its own component (file map). `initialTheme`
 * comes from the server (the same cookie read that stamps `<html
 * data-theme>` in the root layout, re-read in `dashboard/layout.tsx`) so
 * the very first client render matches the SSR output exactly — no
 * hydration mismatch from reading `document` during the initial render.
 * No localStorage (SSR-inconsistent, per the story's binding decision).
 */
import { useState } from 'react';
import { Icon } from '@/components/ui/icons';

export type Theme = 'light' | 'dark';

const THEME_COOKIE = 'am-theme';
const THEME_COOKIE_MAX_AGE_SECONDS = 31536000; // 1 year

export type ThemeToggleProps = {
  initialTheme: Theme;
  label: string;
};

export function ThemeToggle({ initialTheme, label }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    setTheme(next);
  }

  return (
    <button type="button" className="iconbtn" title={label} aria-label={label} onClick={toggle}>
      {theme === 'light' ? <Icon.moon /> : <Icon.sun />}
    </button>
  );
}
