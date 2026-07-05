import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['it', 'en'],
  defaultLocale: 'it',
  // "/" always redirects to the default locale (per story AC), rather than
  // negotiating from the browser's Accept-Language header.
  localeDetection: false,
});

export type AppLocale = (typeof routing.locales)[number];
