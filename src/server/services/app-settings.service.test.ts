import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { decryptSecret, encryptSecret } from '@/server/crypto/secret-box';
import { ForbiddenError } from './errors';

// `secret-box.ts` (imported by `app-settings.service.ts` for the SMTP
// password encryption, CWE-312 fix) reads `AUTH_SECRET` from `@/lib/env` at
// call time — same "mock env, don't load the real schema" convention as
// `auth-tokens.service.test.ts`.
vi.mock('@/lib/env', () => ({ env: { AUTH_SECRET: 'test-auth-secret-not-real-0123456789' } }));

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    appSetting: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import('@/server/db/prisma');
const {
  getPprOperatingInstructions,
  setPprOperatingInstructions,
  getPprLandingFeeDefaultCents,
  setPprLandingFeeDefaultCents,
  getAirfieldBranding,
  setAirfieldBranding,
  getAirfieldIcao,
  setAirfieldIcao,
  getAirfieldContactEmail,
  setAirfieldContactEmail,
  getSchedulingSettings,
  setSchedulingSettings,
  getSmtpSettings,
  setSmtpSettings,
  getSmtpSettingsForMailer,
  getMetarStation,
  setMetarStation,
  getMembershipFeeCents,
  setMembershipFeeCents,
} = await import('./app-settings.service');

const findManyMock = vi.mocked(prisma.appSetting.findMany);
const findUniqueMock = vi.mocked(prisma.appSetting.findUnique);
const upsertMock = vi.mocked(prisma.appSetting.upsert);
const transactionMock = vi.mocked(prisma.$transaction);

type Fixture = Record<string, unknown>;
const findMany = findManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const findUnique = findUniqueMock as unknown as { mockResolvedValue: (v: Fixture | null) => void };
const upsert = upsertMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const transaction = transactionMock as unknown as { mockResolvedValue: (v: unknown) => void };

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_1', roles: ['PILOT'] };
}

/**
 * First real plumbing around `AppSetting` (story 8.2, AC 1) — minimal
 * targeted coverage: get/set gating asymmetry, the `''` default (never
 * `null`), and that both locales are always written together.
 */
describe('app-settings.service (story 8.2, AC 1)', () => {
  describe('getPprOperatingInstructions', () => {
    it('is gated ppr.manage — a pilot is forbidden, no query runs', async () => {
      await expect(getPprOperatingInstructions(pilotActor())).rejects.toBeInstanceOf(ForbiddenError);
      expect(findManyMock).not.toHaveBeenCalled();
    });

    it('staff (ppr.manage, not settings.manage) CAN read', async () => {
      findMany.mockResolvedValue([]);
      await expect(getPprOperatingInstructions(staffActor())).resolves.toEqual({ it: '', en: '' });
    });

    it('defaults BOTH locales to the empty string when no AppSetting rows exist yet (never null)', async () => {
      findMany.mockResolvedValue([]);

      const result = await getPprOperatingInstructions(adminActor());

      expect(result).toEqual({ it: '', en: '' });
    });

    it('reads each locale from its own AppSetting key', async () => {
      findMany.mockResolvedValue([
        { key: 'ppr.operatingInstructions.it', value: 'Presentarsi in torre.' },
        { key: 'ppr.operatingInstructions.en', value: 'Report to the tower.' },
      ]);

      const result = await getPprOperatingInstructions(adminActor());

      expect(result).toEqual({ it: 'Presentarsi in torre.', en: 'Report to the tower.' });
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: { in: ['ppr.operatingInstructions.it', 'ppr.operatingInstructions.en'] } } }),
      );
    });

    it('a value present only for one locale leaves the other at the empty-string default', async () => {
      findMany.mockResolvedValue([{ key: 'ppr.operatingInstructions.it', value: 'Solo italiano.' }]);

      const result = await getPprOperatingInstructions(adminActor());

      expect(result).toEqual({ it: 'Solo italiano.', en: '' });
    });
  });

  describe('setPprOperatingInstructions', () => {
    it('is gated settings.manage — staff (ppr.manage only) is forbidden, no write runs', async () => {
      await expect(setPprOperatingInstructions(staffActor(), { it: 'x', en: 'y' })).rejects.toBeInstanceOf(ForbiddenError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('admin (settings.manage) can write both locales together in one transaction', async () => {
      upsert.mockResolvedValue({});
      transaction.mockResolvedValue([{}, {}]);

      const result = await setPprOperatingInstructions(adminActor(), { it: 'Italiano nuovo.', en: 'New English.' });

      expect(result).toEqual({ it: 'Italiano nuovo.', en: 'New English.' });
      expect(transactionMock).toHaveBeenCalledTimes(1);
      // Both upserts submitted together (AC 1: "entrambi i campi ... insieme").
      const batch = transactionMock.mock.calls[0]?.[0] as unknown as unknown[];
      expect(batch).toHaveLength(2);
    });
  });
});

/**
 * Default PPR landing fee (story 8.3, AC 1) — minimal targeted coverage:
 * get/set gating asymmetry (same shape as the operating-instructions pair
 * above), the `0` default (absent key), and the corrupted-value ->
 * `0` + `console.warn` fallback (Contesto: "valore memorizzato non
 * parsabile -> 0 + warn").
 */
describe('app-settings.service — default PPR landing fee (story 8.3, AC 1)', () => {
  // No global `clearMocks`/`restoreMocks` configured for this project (vitest.config.ts)
  // and the describe block above this one leaves `upsertMock` with recorded
  // calls — reset the mocks THIS block depends on before each test so
  // `not.toHaveBeenCalled()` assertions are accurate.
  beforeEach(() => {
    findUniqueMock.mockReset();
    upsertMock.mockReset();
  });

  describe('getPprLandingFeeDefaultCents', () => {
    it('is gated ppr.manage — a pilot is forbidden, no query runs', async () => {
      await expect(getPprLandingFeeDefaultCents(pilotActor())).rejects.toBeInstanceOf(ForbiddenError);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('staff (ppr.manage, not settings.manage) CAN read', async () => {
      findUnique.mockResolvedValue(null);
      await expect(getPprLandingFeeDefaultCents(staffActor())).resolves.toBe(0);
    });

    it('defaults to 0 when no AppSetting row exists yet', async () => {
      findUnique.mockResolvedValue(null);

      await expect(getPprLandingFeeDefaultCents(adminActor())).resolves.toBe(0);
      expect(findUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'ppr.landingFeeCents' } }));
    });

    it('reads back a stored non-negative integer string', async () => {
      findUnique.mockResolvedValue({ value: '1500' });

      await expect(getPprLandingFeeDefaultCents(adminActor())).resolves.toBe(1500);
    });

    it('a stored value of "0" reads back as 0 (not confused with absent)', async () => {
      findUnique.mockResolvedValue({ value: '0' });

      await expect(getPprLandingFeeDefaultCents(adminActor())).resolves.toBe(0);
    });

    it.each(['abc', '-100', '12.5', ' 100', '100 ', '99999999999'])(
      'a corrupted stored value %j falls back to 0 and logs a warning (never thrown)',
      async (corrupted) => {
        findUnique.mockResolvedValue({ value: corrupted });
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await expect(getPprLandingFeeDefaultCents(adminActor())).resolves.toBe(0);
        expect(consoleWarnSpy).toHaveBeenCalled();
        consoleWarnSpy.mockRestore();
      },
    );
  });

  describe('setPprLandingFeeDefaultCents', () => {
    it('is gated settings.manage — staff (ppr.manage only) is forbidden, no write runs', async () => {
      await expect(setPprLandingFeeDefaultCents(staffActor(), 1000)).rejects.toBeInstanceOf(ForbiddenError);
      expect(upsertMock).not.toHaveBeenCalled();
    });

    it('admin (settings.manage) writes the value as a plain decimal string and returns it', async () => {
      upsert.mockResolvedValue({});

      const result = await setPprLandingFeeDefaultCents(adminActor(), 2500);

      expect(result).toBe(2500);
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'ppr.landingFeeCents' },
          update: { value: '2500' },
          create: { key: 'ppr.landingFeeCents', value: '2500' },
        }),
      );
    });

    it('0 is a valid, distinct value — written and read back exactly', async () => {
      upsert.mockResolvedValue({});

      await expect(setPprLandingFeeDefaultCents(adminActor(), 0)).resolves.toBe(0);
      expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ update: { value: '0' } }));
    });
  });
});

/**
 * Airfield PDF branding (story 10.2, AC 1; name-only since story 13.8,
 * AC 4) — minimal targeted coverage: NO read gate (unlike every other
 * getter above), the fresh-install default, and write gating.
 */
describe('app-settings.service — airfield branding (story 10.2, AC 1; story 13.8, AC 4)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    upsertMock.mockReset();
  });

  describe('getAirfieldBranding', () => {
    it('has NO permission gate — a pilot (no settings.manage, no ppr.manage) reads it', async () => {
      findUnique.mockResolvedValue(null);
      await expect(getAirfieldBranding()).resolves.toEqual({ name: 'AirManager' });
    });

    it('defaults to name "AirManager" when no AppSetting row exists yet', async () => {
      findUnique.mockResolvedValue(null);

      const result = await getAirfieldBranding();

      expect(result).toEqual({ name: 'AirManager' });
      expect(findUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'airfield.name' } }));
    });

    it('reads back a configured name', async () => {
      findUnique.mockResolvedValue({ value: 'Aviosuperficie di Test' });

      await expect(getAirfieldBranding()).resolves.toEqual({ name: 'Aviosuperficie di Test' });
    });
  });

  describe('setAirfieldBranding', () => {
    it('is gated settings.manage — staff is forbidden, no write runs', async () => {
      await expect(setAirfieldBranding(staffActor(), { name: 'X' })).rejects.toBeInstanceOf(ForbiddenError);
      expect(upsertMock).not.toHaveBeenCalled();
    });

    it('admin (settings.manage) writes the name', async () => {
      upsert.mockResolvedValue({});

      const result = await setAirfieldBranding(adminActor(), { name: 'Aviosuperficie' });

      expect(result).toEqual({ name: 'Aviosuperficie' });
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: 'airfield.name' }, update: { value: 'Aviosuperficie' }, create: { key: 'airfield.name', value: 'Aviosuperficie' } }),
      );
    });
  });
});

/**
 * Airfield ICAO (story 12.1, AC 4) — read-only until a later story adds the
 * write path (Impostazioni Club card): no permission gate, `''` default.
 */
describe('app-settings.service — airfield ICAO (story 12.1, AC 4)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it('has NO permission gate — a pilot reads it', async () => {
    findUnique.mockResolvedValue(null);
    await expect(getAirfieldIcao()).resolves.toBe('');
  });

  it('defaults to "" when no AppSetting row exists yet', async () => {
    findUnique.mockResolvedValue(null);

    await expect(getAirfieldIcao()).resolves.toBe('');
    expect(findUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'airfield.icao' } }));
  });

  it('reads back a configured ICAO', async () => {
    findUnique.mockResolvedValue({ value: 'LIML' });

    await expect(getAirfieldIcao()).resolves.toBe('LIML');
  });
});

/** Story 12.11, AC 1/2: the write path `getAirfieldIcao`'s doc-comment anticipated, plus the brand-new contact email key. */
describe('app-settings.service — setAirfieldIcao / airfield contact email (story 12.11, AC 1/2)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    upsertMock.mockReset();
  });

  it('setAirfieldIcao is gated settings.manage — staff is forbidden, no write runs', async () => {
    await expect(setAirfieldIcao(staffActor(), 'LIML')).rejects.toBeInstanceOf(ForbiddenError);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('setAirfieldIcao (admin) upserts the existing airfield.icao key', async () => {
    upsert.mockResolvedValue({});

    await expect(setAirfieldIcao(adminActor(), 'LIML')).resolves.toBe('LIML');
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'airfield.icao' }, update: { value: 'LIML' } }));
  });

  it('getAirfieldContactEmail has NO permission gate and defaults to "" when absent', async () => {
    findUnique.mockResolvedValue(null);
    await expect(getAirfieldContactEmail()).resolves.toBe('');
    expect(findUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'airfield.contactEmail' } }));
  });

  it('setAirfieldContactEmail is gated settings.manage', async () => {
    await expect(setAirfieldContactEmail(staffActor(), 'ops@example.com')).rejects.toBeInstanceOf(ForbiddenError);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('setAirfieldContactEmail (admin) upserts the key and returns it', async () => {
    upsert.mockResolvedValue({});
    await expect(setAirfieldContactEmail(adminActor(), 'ops@example.com')).resolves.toBe('ops@example.com');
  });
});

/**
 * Scheduling window (story 12.11, AC 1/4) — `sched.*`. No permission gate on
 * read (needed by any actor creating a booking); write gated `settings.manage`.
 */
describe('app-settings.service — scheduling window (story 12.11, AC 1/4)', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    upsertMock.mockReset();
    transactionMock.mockReset();
  });

  it('getSchedulingSettings has NO permission gate and defaults every field to null when absent', async () => {
    findMany.mockResolvedValue([]);

    await expect(getSchedulingSettings()).resolves.toEqual({
      openTime: null,
      closeTime: null,
      minSlotMinutes: null,
      turnaroundMinutes: null,
      maxAdvanceDays: null,
    });
  });

  it('getSchedulingSettings reads back configured values, parsing the integer fields', async () => {
    findMany.mockResolvedValue([
      { key: 'sched.openTime', value: '07:00' },
      { key: 'sched.closeTime', value: '21:00' },
      { key: 'sched.minSlotMinutes', value: '60' },
      { key: 'sched.turnaroundMinutes', value: '15' },
      { key: 'sched.maxAdvanceDays', value: '30' },
    ]);

    await expect(getSchedulingSettings()).resolves.toEqual({
      openTime: '07:00',
      closeTime: '21:00',
      minSlotMinutes: 60,
      turnaroundMinutes: 15,
      maxAdvanceDays: 30,
    });
  });

  it('setSchedulingSettings is gated settings.manage — staff is forbidden, no write runs', async () => {
    await expect(
      setSchedulingSettings(staffActor(), { openTime: '07:00', closeTime: '21:00', minSlotMinutes: 60, turnaroundMinutes: 15, maxAdvanceDays: 30 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('setSchedulingSettings (admin) writes all 5 keys together in one transaction', async () => {
    upsert.mockResolvedValue({});
    transaction.mockResolvedValue([{}, {}, {}, {}, {}]);

    const result = await setSchedulingSettings(adminActor(), {
      openTime: '07:00',
      closeTime: '21:00',
      minSlotMinutes: 60,
      turnaroundMinutes: 15,
      maxAdvanceDays: 30,
    });

    expect(result).toEqual({ openTime: '07:00', closeTime: '21:00', minSlotMinutes: 60, turnaroundMinutes: 15, maxAdvanceDays: 30 });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    const batch = transactionMock.mock.calls[0]?.[0] as unknown as unknown[];
    expect(batch).toHaveLength(5);
  });
});

/**
 * SMTP settings (story 12.11, AC 1/2) — write-only password: the GET never
 * carries it back, only `hasPassword`; an empty/omitted `pass` on write
 * leaves the stored password untouched.
 */
describe('app-settings.service — SMTP settings (story 12.11, AC 1/2)', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    upsertMock.mockReset();
    transactionMock.mockReset();
  });

  const SMTP_INPUT = { host: 'smtp.example.com', port: 587, security: 'STARTTLS' as const, user: 'ops@example.com', from: 'Club Ops <ops@example.com>' };

  it('getSmtpSettings is gated settings.manage', async () => {
    await expect(getSmtpSettings(staffActor())).rejects.toBeInstanceOf(ForbiddenError);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('getSmtpSettings never returns the password, only hasPassword', async () => {
    findMany.mockResolvedValue([
      { key: 'smtp.host', value: 'smtp.example.com' },
      { key: 'smtp.pass', value: 'secret' },
    ]);

    const result = await getSmtpSettings(adminActor());

    expect(result.hasPassword).toBe(true);
    expect(result).not.toHaveProperty('pass');
  });

  it('getSmtpSettings.hasPassword is false when no password is stored', async () => {
    findMany.mockResolvedValue([]);
    await expect(getSmtpSettings(adminActor())).resolves.toMatchObject({ hasPassword: false });
  });

  it('setSmtpSettings is gated settings.manage', async () => {
    await expect(setSmtpSettings(staffActor(), SMTP_INPUT)).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('setSmtpSettings WITHOUT pass writes only the 5 non-password keys (leaves the stored password untouched)', async () => {
    upsert.mockResolvedValue({});
    transaction.mockResolvedValue([{}, {}, {}, {}, {}]);
    findMany.mockResolvedValue([]);

    await setSmtpSettings(adminActor(), SMTP_INPUT);

    const batch = transactionMock.mock.calls[0]?.[0] as unknown as unknown[];
    expect(batch).toHaveLength(5);
  });

  it('setSmtpSettings WITH a non-empty pass also writes the password key (6 writes)', async () => {
    upsert.mockResolvedValue({});
    transaction.mockResolvedValue([{}, {}, {}, {}, {}, {}]);
    findMany.mockResolvedValue([]);

    await setSmtpSettings(adminActor(), { ...SMTP_INPUT, pass: 'new-secret' });

    const batch = transactionMock.mock.calls[0]?.[0] as unknown as unknown[];
    expect(batch).toHaveLength(6);
  });

  it('getSmtpSettingsForMailer (internal, no Actor) DOES return the raw password', async () => {
    findMany.mockResolvedValue([
      { key: 'smtp.host', value: 'smtp.example.com' },
      { key: 'smtp.pass', value: 'secret' },
    ]);

    await expect(getSmtpSettingsForMailer()).resolves.toMatchObject({ host: 'smtp.example.com', pass: 'secret' });
  });

  it('setSmtpSettings ENCRYPTS the password before writing (CWE-312 fix) — the stored value is not the plaintext, and decrypts back to it', async () => {
    upsert.mockResolvedValue({});
    transaction.mockResolvedValue([{}, {}, {}, {}, {}, {}]);
    findMany.mockResolvedValue([]);

    await setSmtpSettings(adminActor(), { ...SMTP_INPUT, pass: 'a-real-password' });

    const passUpsertCall = upsertMock.mock.calls.find((call) => (call[0] as { where: { key: string } }).where.key === 'smtp.pass');
    const storedValue = (passUpsertCall?.[0] as { update: { value: string } }).update.value;

    expect(storedValue).not.toBe('a-real-password');
    expect(decryptSecret(storedValue)).toBe('a-real-password');
  });

  it('getSmtpSettingsForMailer decrypts an encrypted stored password back to the original plaintext', async () => {
    findMany.mockResolvedValue([{ key: 'smtp.pass', value: encryptSecret('a-real-password') }]);

    await expect(getSmtpSettingsForMailer()).resolves.toMatchObject({ pass: 'a-real-password' });
  });

  it('getSmtpSettingsForMailer passes a LEGACY cleartext stored password through unchanged (rows written before the CWE-312 fix)', async () => {
    findMany.mockResolvedValue([{ key: 'smtp.pass', value: 'legacy-cleartext-password' }]);

    await expect(getSmtpSettingsForMailer()).resolves.toMatchObject({ pass: 'legacy-cleartext-password' });
  });
});

/** Typed shim for a `findUnique` mock that branches on the queried key (`mockResolvedValue` alone can't — `getMetarStation` reads TWO different keys in the fallback path). */
const findUniqueByKey = findUniqueMock as unknown as {
  mockImplementation: (fn: (args: { where: { key: string } }) => Promise<Fixture | null>) => void;
};

/** METAR station (story 12.11, AC 1/5) — falls back to the airfield ICAO when unconfigured. */
describe('app-settings.service — METAR station (story 12.11, AC 1/5)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    upsertMock.mockReset();
  });

  it('getMetarStation has NO permission gate and falls back to the airfield ICAO when no override is stored', async () => {
    findUniqueByKey.mockImplementation(async (args) => {
      if (args.where.key === 'metar.station') return null;
      if (args.where.key === 'airfield.icao') return { value: 'LIML' };
      return null;
    });

    await expect(getMetarStation()).resolves.toBe('LIML');
  });

  it('a configured override wins over the ICAO fallback', async () => {
    findUniqueByKey.mockImplementation(async (args) => (args.where.key === 'metar.station' ? { value: 'LIRF' } : null));

    await expect(getMetarStation()).resolves.toBe('LIRF');
  });

  it('setMetarStation is gated settings.manage', async () => {
    await expect(setMetarStation(staffActor(), 'LIRF')).rejects.toBeInstanceOf(ForbiddenError);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('setMetarStation (admin) writes the override and reads it back', async () => {
    upsert.mockResolvedValue({});
    findUniqueByKey.mockImplementation(async () => ({ value: 'LIRF' }));

    await expect(setMetarStation(adminActor(), 'LIRF')).resolves.toBe('LIRF');
  });
});

/** Membership fee default (story 12.11, AC 1, ratifica utente 1) — same read/write asymmetry as the PPR landing fee (`finance.manage` reads, `settings.manage` writes). */
describe('app-settings.service — membership fee default (story 12.11, AC 1)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    upsertMock.mockReset();
  });

  it('getMembershipFeeCents is gated finance.manage — a pilot (no finance.manage) is forbidden', async () => {
    await expect(getMembershipFeeCents(pilotActor())).rejects.toBeInstanceOf(ForbiddenError);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('staff (finance.manage, not settings.manage) CAN read', async () => {
    findUnique.mockResolvedValue(null);
    await expect(getMembershipFeeCents(staffActor())).resolves.toBe(0);
  });

  it('defaults to 0 when no AppSetting row exists yet', async () => {
    findUnique.mockResolvedValue(null);
    await expect(getMembershipFeeCents(adminActor())).resolves.toBe(0);
    expect(findUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'membership.annualFeeCents' } }));
  });

  it('reads back a stored value', async () => {
    findUnique.mockResolvedValue({ value: '5000' });
    await expect(getMembershipFeeCents(adminActor())).resolves.toBe(5000);
  });

  it('setMembershipFeeCents is gated settings.manage — staff (finance.manage only) is forbidden', async () => {
    await expect(setMembershipFeeCents(staffActor(), 5000)).rejects.toBeInstanceOf(ForbiddenError);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('setMembershipFeeCents (admin) writes the value as a decimal string', async () => {
    upsert.mockResolvedValue({});
    await expect(setMembershipFeeCents(adminActor(), 5000)).resolves.toBe(5000);
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ update: { value: '5000' } }));
  });
});
