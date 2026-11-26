'use client';

import { Icon } from '@/components/ui/icons';
import { THEME_CHOSEN_EVENT, THEME_COOKIE } from '@/lib/theme';

export function ThemeToggle({ label }: { label: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    root.dataset.theme = next;
    document.dispatchEvent(new Event(THEME_CHOSEN_EVENT));
  }

  return (
    <button type="button" className="iconbtn" title={label} aria-label={label} onClick={toggle}>
      <Icon.moon className="theme-moon" aria-hidden="true" />
      <Icon.sun className="theme-sun" aria-hidden="true" />
    </button>
  );
}
