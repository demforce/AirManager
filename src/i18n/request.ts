import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { APP_TIMEZONE } from '@/lib/time';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    timeZone: APP_TIMEZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
