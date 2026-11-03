'use client';

// design-sync glue, NOT app code: the bundle-side equivalent of what
// src/app/[locale]/layout.tsx does for every page of the app.
//  - airops.css defines every color/shadow token ONLY under
//    html[data-theme="light"|"dark"]; without the attribute the whole UI
//    renders with undefined colors. The layout stamps it server-side; here it
//    is stamped on the document root in a layout effect (before first paint).
//  - DateInput/DateTimeInput read `ui.datePicker` via useTranslations and
//    CalendarPopover reads the locale via useLocale: both throw outside a
//    NextIntlClientProvider. Only the `ui` namespace is bundled (named JSON
//    import -> esbuild drops the rest of the catalog).
import { NextIntlClientProvider } from 'next-intl';
import { useLayoutEffect, type ReactNode } from 'react';
import { ui as itUi } from '../messages/it.json';
import { ui as enUi } from '../messages/en.json';

export type AirOpsRootProps = {
  /** AirOps color scheme, stamped as `<html data-theme>`. Default `light`. */
  theme?: 'light' | 'dark';
  /** UI language of the primitives' built-in labels (date picker). Default `it`. */
  locale?: 'it' | 'en';
  children: ReactNode;
};

export function AirOpsRoot({ theme = 'light', locale = 'it', children }: AirOpsRootProps) {
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <NextIntlClientProvider locale={locale} timeZone="Europe/Rome" messages={{ ui: locale === 'en' ? enUi : itUi }}>
      {children}
    </NextIntlClientProvider>
  );
}
