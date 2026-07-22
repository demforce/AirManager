import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const isProd = process.env.NODE_ENV === 'production';

// Baseline CSP: allows next/font (self-hosted) and inline styles (Next's
// injected <style> tags, component `style={{...}}` usage). Dev needs
// 'unsafe-eval' in script-src for Turbopack HMR; production stays without it.
const contentSecurityPolicy = [
  "default-src 'self'",
  'img-src \'self\' data:',
  'style-src \'self\' \'unsafe-inline\'',
  'font-src \'self\' data:',
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  // Dev-only: Next 16 blocks /_next/* dev resources from non-localhost
  // origins, which silently prevents hydration when browsing the dev
  // server via LAN IP (VirtualBox host-only adapter).
  allowedDevOrigins: ['192.168.56.115'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          // No Strict-Transport-Security here: the app intentionally supports
          // plain-HTTP LAN browsing (e.g. the allowedDevOrigins IP above).
          // HSTS belongs at the TLS-terminating reverse proxy, not here.
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
