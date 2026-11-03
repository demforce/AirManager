import { describe, expect, it, vi } from 'vitest';

const mockEnv = { SMTP_HOST: 'localhost' };
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const { smtpSettingsInputSchema, clubIdentitySchema, updateSettingsSchema } = await import('./settings');

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

  // Review F4: bypass forms the first guard let through.
  it.each([
    '::ffff:127.0.0.1', // IPv4-mapped IPv6 loopback
    '::ffff:169.254.169.254', // IPv4-mapped metadata address
    '0:0:0:0:0:0:0:1', // fully-expanded loopback
    '::', // IPv6 unspecified
    'fe80::1', // link-local
    '0.0.0.0', // IPv4 unspecified (routes to loopback)
    '2130706433', // decimal 127.0.0.1
    '0x7f000001', // hex 127.0.0.1
  ])('rejects the loopback/internal bypass form %s (review F4)', (host) => {
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

/**
 * `contactEmail: ''` is the factory default (`getAirfieldContactEmail`
 * returns `''` when the key is absent) and the club card always sends every
 * field — rejecting the empty string made the card unsavable on a fresh
 * install (changing ONLY the ICAO fields answered 422 on the untouched
 * email, surfaced as the generic "Non è stato possibile salvare").
 */
describe('clubIdentitySchema — contactEmail empty-means-unset', () => {
  it('accepts an empty contactEmail (fresh-install default, clears the setting)', () => {
    const parsed = clubIdentitySchema.safeParse({ icao: 'LIRB', contactEmail: '' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.contactEmail).toBe('');
  });

  it('trims whitespace-only contactEmail down to the empty string and accepts it', () => {
    const parsed = clubIdentitySchema.safeParse({ icao: 'LIRB', contactEmail: '   ' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.contactEmail).toBe('');
  });

  it('still accepts and lowercases a real email', () => {
    const parsed = clubIdentitySchema.safeParse({ icao: 'LIRB', contactEmail: 'Ops@Example.COM' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.contactEmail).toBe('ops@example.com');
  });

  it('still rejects a non-empty, non-email value', () => {
    expect(clubIdentitySchema.safeParse({ icao: 'LIRB', contactEmail: 'not-an-email' }).success).toBe(false);
  });
});

/** The paths of a failed `updateSettingsSchema` parse, dotted (what `flattenIssuesByPath` keys the 422 by). */
function failedPaths(body: unknown): string[] {
  const parsed = updateSettingsSchema.safeParse(body);
  expect(parsed.success).toBe(false);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.map(String).join('.'));
}

const SCHEDULING = { openTime: '07:00', closeTime: '21:00', minSlotMinutes: 60, turnaroundMinutes: 15, maxAdvanceDays: 30 };

describe('updateSettingsSchema — the Impostazioni composite save (story 19.8, AD-1)', () => {
  it('an empty body is a root issue — at least one block', () => {
    expect(failedPaths({})).toEqual(['']);
  });

  it('unknown keys are stripped, so a body of only unknown keys is still empty', () => {
    expect(failedPaths({ tax: { cents: 1 } })).toEqual(['']);
  });

  it('accepts one block alone and leaves every other block undefined', () => {
    const parsed = updateSettingsSchema.parse({ metarStation: { station: 'lirb' } });
    expect(parsed).toEqual({ metarStation: { station: 'LIRB' } });
  });

  it('a refused field is reported at its FULL path inside its block', () => {
    expect(failedPaths({ smtp: { ...BASE_INPUT, host: '127.0.0.1' } })).toEqual(['smtp.host']);
    expect(failedPaths({ scheduling: { ...SCHEDULING, closeTime: '07:00' } })).toEqual(['scheduling.closeTime']);
    expect(failedPaths({ club: { icao: 'LIRB', contactEmail: 'not-an-email' } })).toEqual(['club.contactEmail']);
    expect(failedPaths({ airfield: { name: '  ' } })).toEqual(['airfield.name']);
  });

  it('an expiry-type create needs an explicit kind, RATING or MEDICAL — never the single route\'s RATING default, never MEMBERSHIP', () => {
    expect(failedPaths({ expiryTypes: { create: [{ name: 'Night' }] } })).toEqual(['expiryTypes.create.0.kind']);
    expect(failedPaths({ expiryTypes: { create: [{ name: 'Quota', kind: 'MEMBERSHIP' }] } })).toEqual(['expiryTypes.create.0.kind']);
    expect(updateSettingsSchema.parse({ expiryTypes: { create: [{ name: 'Visita', kind: 'MEDICAL' }] } }).expiryTypes?.create?.[0]).toEqual({
      name: 'Visita',
      kind: 'MEDICAL',
      validityMonths: null,
    });
  });

  it('an update item carries at least one field besides its id, and never kind', () => {
    expect(failedPaths({ expiryTypes: { update: [{ id: 'et_1' }] } })).toEqual(['expiryTypes.update.0']);
    expect(failedPaths({ cashCategories: { update: [{ id: 'cc_1' }] } })).toEqual(['cashCategories.update.0']);
    // `kind` is not a field of the update item: stripped, so `{ id, kind }` is an id alone.
    expect(failedPaths({ expiryTypes: { update: [{ id: 'et_1', kind: 'MEDICAL' }] } })).toEqual(['expiryTypes.update.0']);
  });

  it('two creates with the same (trimmed) name in one list are refused at the second one', () => {
    expect(failedPaths({ cashCategories: { create: [{ name: 'Hangar' }, { name: ' Hangar ' }] } })).toEqual(['cashCategories.create.1.name']);
  });

  it('a create may not take the name an update in the same list moves to', () => {
    expect(failedPaths({ expiryTypes: { update: [{ id: 'et_1', name: 'Night' }], create: [{ name: 'Night', kind: 'RATING' }] } })).toEqual(['expiryTypes.update.0.name']);
  });

  it('an id appears at most once in update, once in delete, never in both', () => {
    expect(failedPaths({ cashCategories: { update: [{ id: 'cc_1', isActive: false }, { id: 'cc_1', name: 'X' }] } })).toEqual(['cashCategories.update.1.id']);
    expect(failedPaths({ cashCategories: { delete: ['cc_1', 'cc_1'] } })).toEqual(['cashCategories.delete.1']);
    expect(failedPaths({ cashCategories: { update: [{ id: 'cc_1', isActive: false }], delete: ['cc_1'] } })).toEqual(['cashCategories.delete.0']);
  });

  it('the names of two lists are independent of each other (a category and a type may share a name)', () => {
    expect(updateSettingsSchema.safeParse({ expiryTypes: { create: [{ name: 'Altro', kind: 'RATING' }] }, cashCategories: { create: [{ name: 'Altro' }] } }).success).toBe(true);
  });

  it('caps each array (the 64 KB body limit is a backstop, not the only bound)', () => {
    const tooMany = Array.from({ length: 51 }, (_, index) => ({ name: `C${index}` }));
    expect(failedPaths({ cashCategories: { create: tooMany } })).toEqual(['cashCategories.create']);
  });
});
