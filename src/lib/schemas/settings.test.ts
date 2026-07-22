import { describe, expect, it, vi } from 'vitest';

const mockEnv = { SMTP_HOST: 'localhost' };
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const { smtpSettingsInputSchema } = await import('./settings');

/** Fixed valid siblings — every case below varies only `host`. */
const BASE_INPUT = { port: 587, security: 'STARTTLS' as const, user: '', from: 'Club Ops <ops@example.com>' };

function parseHost(host: string) {
  return smtpSettingsInputSchema.safeParse({ ...BASE_INPUT, host });
}

/**
 * CWE-918 (SSRF) fix — `smtpSettingsInputSchema.host` rejects literal
 * private/loopback/link-local/metadata addresses, while still accepting
 * ordinary public hosts. `localhost` is exempted ONLY when it matches
 * `env.SMTP_HOST` (Mailpit dev/test — see the schema's own doc-comment for
 * why `NODE_ENV` can't be the discriminator: `next start` runs the e2e
 * settings suite in production mode).
 */
describe('smtpSettingsInputSchema — SSRF host validation', () => {
  it('accepts an ordinary public hostname', () => {
    expect(parseHost('smtp.example.com').success).toBe(true);
  });

  it('accepts an ordinary public IPv4 address', () => {
    expect(parseHost('8.8.8.8').success).toBe(true);
  });

  it.each(['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.1.1', '169.254.169.254'])(
    'rejects the private/loopback/link-local/metadata IPv4 literal %s',
    (host) => {
      expect(parseHost(host).success).toBe(false);
    },
  );

  it.each(['172.15.255.255', '172.32.0.1'])('accepts the IPv4 address %s just outside the 172.16.0.0/12 private range', (host) => {
    expect(parseHost(host).success).toBe(true);
  });

  it.each(['::1', 'fc00::1', 'fd12:3456::1'])('rejects the IPv6 loopback/unique-local literal %s', (host) => {
    expect(parseHost(host).success).toBe(false);
  });

  it('accepts an ordinary public IPv6 address', () => {
    expect(parseHost('2001:4860:4860::8888').success).toBe(true);
  });

  it('rejects the "localhost" hostname when it does NOT match env.SMTP_HOST', () => {
    mockEnv.SMTP_HOST = 'smtp.internal.example.com';

    expect(parseHost('localhost').success).toBe(false);

    mockEnv.SMTP_HOST = 'localhost';
  });

  it('accepts "localhost" when it matches env.SMTP_HOST (Mailpit dev/test, e2e/settings.spec.ts)', () => {
    mockEnv.SMTP_HOST = 'localhost';

    expect(parseHost('localhost').success).toBe(true);
  });

  it('accepts a private IPv4 that matches env.SMTP_HOST (an already-trusted self-hosted relay)', () => {
    mockEnv.SMTP_HOST = '10.0.0.5';

    expect(parseHost('10.0.0.5').success).toBe(true);
    expect(parseHost('10.0.0.6').success).toBe(false);

    mockEnv.SMTP_HOST = 'localhost';
  });
});
