import type { AppLocale } from '@/i18n/routing';
import { LocaleSwitcher } from './locale-switcher';
import { LogoutButton } from './logout-button';

type TopbarProps = {
  locale: AppLocale;
  displayName: string;
  logoutLabel: string;
  switchLocaleLabel: string;
};

/**
 * Persistent topbar (story 12.2, AC 5): app identity on the left (textual
 * wordmark, DESIGN.md style — no logo mark exists yet), and on the right the
 * current user's name (`getMe`), the language switcher and logout — all
 * fetched/composed ONCE in `dashboard/layout.tsx` and rendered here on every
 * dashboard page, not just the home.
 *
 * T6 visual fix (AC 8, ~390px): the display name is hidden below `sm:` — at
 * narrow widths there isn't room for wordmark + name + switcher + logout on
 * one line, so the name (decorative identity, not an action) wrapped to two
 * lines and crowded the wordmark next to it. The switcher and logout button,
 * which ARE actions, stay visible at every width.
 */
export function Topbar({ locale, displayName, logoutLabel, switchLocaleLabel }: TopbarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-hairline bg-paper px-6">
      <span className="text-base font-semibold tracking-[-0.01em] text-ink">AirManager</span>
      <div className="flex items-center gap-4">
        <span className="hidden text-sm text-mid-gray sm:inline">{displayName}</span>
        <LocaleSwitcher currentLocale={locale} label={switchLocaleLabel} />
        <LogoutButton locale={locale} label={logoutLabel} />
      </div>
    </header>
  );
}
