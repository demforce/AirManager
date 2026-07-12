'use client';

import { Link, usePathname } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';

type LocaleSwitcherProps = {
  currentLocale: AppLocale;
  label: string;
};

/**
 * Dashboard language switcher (story 12.2, AC 5). Didn't exist outside the
 * public landing page before this story (`[locale]/page.tsx`'s `switchTo`
 * link, which always targets `/`). Here the target route varies by sub-page,
 * so this needs the client-side `usePathname()` (from `@/i18n/navigation` —
 * already locale-stripped) to preserve the current path across the switch;
 * a server component has no equivalent hook.
 */
export function LocaleSwitcher({ currentLocale, label }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const otherLocale: AppLocale = currentLocale === 'it' ? 'en' : 'it';

  return (
    <Link
      href={pathname}
      locale={otherLocale}
      className="text-sm font-medium text-ink underline decoration-hairline underline-offset-4 transition-colors hover:decoration-ink"
    >
      {label}
    </Link>
  );
}
