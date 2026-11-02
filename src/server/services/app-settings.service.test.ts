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
  getTreasuryOpeningInternal,
  getTreasurySettings,
  setTreasurySettings,
  getCurrencySettings,
  setCurrencySettings,
  writeCurrencySettingsCore,
} = await import('./app-settings.service');
const { currencySettingsSchema } = await import('@/lib/schemas/settings');

const findManyMock = vi.mocked(prisma.appSetting.findMany);
const findUniqueMock = vi.mocked(prisma.appSetting.findUnique);
const upsertMock = vi.mocked(prisma.appSetting.upsert);
const transactionMock = vi.mocked(prisma.$transaction);

type Fixture = Record<string, unknown>;
const findMany = findManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const findUnique = findUniqueMock as unknown as { mockResolvedValue: (v: Fixture | null) => void };
const upsert = upsertMock as unknown as { mockResolvedValue: (v: Fixture) => void };

/**
 * Story 19.8 (AD-3): the multi-key setters moved from the batch
 * `$transaction([...])` to `$transaction((tx) => write*Core(tx, …))` — the
 * callback runs on `prisma` itself here, so its upserts land on `upsertMock`.
 */
function runTransactionsOnPrisma(): void {
  (transactionMock as unknown as { mockImplementation: (fn: (callback: (client: unknown) => unknown) => unknown) => void }).mockImplementation((callback) => callback(prisma));
}

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_1', roles: ['PILOT'] };
}

describe('app-settings.service — airfield branding (story 10.2, AC 1; story 13.8, AC 4)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    upsertMock.mockReset();
  });

  describe('getAirfieldBranding', () => {
    it('has NO permission gate — a pilot (no settings.manage) reads it', async () => {
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
    it('is gated settings.manage — a non-admin actor is forbidden, no write runs', async () => {
      await expect(setAirfieldBranding(pilotActor(), { name: 'X' })).rejects.toBeInstanceOf(ForbiddenError);
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

  it('setAirfieldIcao is gated settings.manage — a non-admin actor is forbidden, no write runs', async () => {
    await expect(setAirfieldIcao(pilotActor(), 'LIML')).rejects.toBeInstanceOf(ForbiddenError);
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
    await expect(setAirfieldContactEmail(pilotActor(), 'ops@example.com')).rejects.toBeInstanceOf(ForbiddenError);
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

  it('setSchedulingSettings is gated settings.manage — a non-admin actor is forbidden, no write runs', async () => {
    await expect(
      setSchedulingSettings(pilotActor(), { openTime: '07:00', closeTime: '21:00', minSlotMinutes: 60, turnaroundMinutes: 15, maxAdvanceDays: 30 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('setSchedulingSettings (admin) writes all 5 keys together in one transaction', async () => {
    upsert.mockResolvedValue({});
    runTransactionsOnPrisma();

    const result = await setSchedulingSettings(adminActor(), {
      openTime: '07:00',
      closeTime: '21:00',
      minSlotMinutes: 60,
      turnaroundMinutes: 15,
      maxAdvanceDays: 30,
    });

    expect(result).toEqual({ openTime: '07:00', closeTime: '21:00', minSlotMinutes: 60, turnaroundMinutes: 15, maxAdvanceDays: 30 });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls.map((call) => (call[0] as { where: { key: string } }).where.key)).toEqual([
      'sched.openTime',
      'sched.closeTime',
      'sched.minSlotMinutes',
      'sched.turnaroundMinutes',
      'sched.maxAdvanceDays',
    ]);
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
    await expect(getSmtpSettings(pilotActor())).rejects.toBeInstanceOf(ForbiddenError);
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
    await expect(setSmtpSettings(pilotActor(), SMTP_INPUT)).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('setSmtpSettings WITHOUT pass writes only the 5 non-password keys (leaves the stored password untouched)', async () => {
    upsert.mockResolvedValue({});
    runTransactionsOnPrisma();
    findMany.mockResolvedValue([]);

    await setSmtpSettings(adminActor(), SMTP_INPUT);

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledTimes(5);
    expect(upsertMock.mock.calls.map((call) => (call[0] as { where: { key: string } }).where.key)).not.toContain('smtp.pass');
  });

  it('setSmtpSettings WITH a non-empty pass also writes the password key (6 writes)', async () => {
    upsert.mockResolvedValue({});
    runTransactionsOnPrisma();
    findMany.mockResolvedValue([]);

    await setSmtpSettings(adminActor(), { ...SMTP_INPUT, pass: 'new-secret' });

    expect(upsertMock).toHaveBeenCalledTimes(6);
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
    runTransactionsOnPrisma();
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
    await expect(setMetarStation(pilotActor(), 'LIRF')).rejects.toBeInstanceOf(ForbiddenError);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('setMetarStation (admin) writes the override and reads it back', async () => {
    upsert.mockResolvedValue({});
    findUniqueByKey.mockImplementation(async () => ({ value: 'LIRF' }));

    await expect(setMetarStation(adminActor(), 'LIRF')).resolves.toBe('LIRF');
  });
});

/** Membership fee default (story 12.11, AC 1, ratifica utente 1) — read/write asymmetry: `finance.manage` reads, `settings.manage` writes. */
describe('app-settings.service — membership fee default (story 12.11, AC 1)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    upsertMock.mockReset();
  });

  it('getMembershipFeeCents is gated finance.manage — a pilot (no finance.manage) is forbidden', async () => {
    await expect(getMembershipFeeCents(pilotActor())).rejects.toBeInstanceOf(ForbiddenError);
    expect(findUniqueMock).not.toHaveBeenCalled();
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

  it.each(['abc', '-100', '12.5', ' 100', '100 ', '99999999999'])(
    'a corrupted stored value %j falls back to 0 and logs a warning (never thrown)',
    async (corrupted) => {
      findUnique.mockResolvedValue({ value: corrupted });
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await expect(getMembershipFeeCents(adminActor())).resolves.toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    },
  );

  it('setMembershipFeeCents is gated settings.manage — a non-admin actor is forbidden', async () => {
    await expect(setMembershipFeeCents(pilotActor(), 5000)).rejects.toBeInstanceOf(ForbiddenError);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('setMembershipFeeCents (admin) writes the value as a decimal string', async () => {
    upsert.mockResolvedValue({});
    await expect(setMembershipFeeCents(adminActor(), 5000)).resolves.toBe(5000);
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ update: { value: '5000' } }));
  });
});

// Story 19.7a (AC 12, R-19-i, D-10) — the contract story 19.8 consumes.
describe('app-settings.service — currency settings (story 19.7a)', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    upsertMock.mockReset();
    transactionMock.mockReset();
  });

  it('absent keys -> the defaults { minFlights: 1, windowDays: 90 }, with no gate (any caller)', async () => {
    findMany.mockResolvedValue([]);

    await expect(getCurrencySettings()).resolves.toEqual({ minFlights: 1, windowDays: 90 });
    expect(findManyMock).toHaveBeenCalledWith({ where: { key: { in: ['currency.minFlights', 'currency.windowDays'] } }, select: { key: true, value: true } });
  });

  it('reads back stored values', async () => {
    findMany.mockResolvedValue([
      { key: 'currency.minFlights', value: '3' },
      { key: 'currency.windowDays', value: '60' },
    ]);

    await expect(getCurrencySettings()).resolves.toEqual({ minFlights: 3, windowDays: 60 });
  });

  it.each([
    ['currency.minFlights', '0', { minFlights: 1, windowDays: 45 }],
    ['currency.minFlights', '100', { minFlights: 1, windowDays: 45 }],
    ['currency.minFlights', '2.5', { minFlights: 1, windowDays: 45 }],
    ['currency.minFlights', 'abc', { minFlights: 1, windowDays: 45 }],
    ['currency.minFlights', '-3', { minFlights: 1, windowDays: 45 }],
  ])('a stored %s of %j falls back to THAT field\'s default only, with a console.warn', async (key, value, expected) => {
    findMany.mockResolvedValue([
      { key, value },
      { key: 'currency.windowDays', value: '45' },
    ]);
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(getCurrencySettings()).resolves.toEqual(expected);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    consoleWarnSpy.mockRestore();
  });

  it.each(['0', '3651', '30.0', ' 30'])('a stored windowDays of %j falls back to 90, minFlights kept', async (value) => {
    findMany.mockResolvedValue([
      { key: 'currency.minFlights', value: '2' },
      { key: 'currency.windowDays', value },
    ]);
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(getCurrencySettings()).resolves.toEqual({ minFlights: 2, windowDays: 90 });
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    consoleWarnSpy.mockRestore();
  });

  it('setCurrencySettings without settings.manage -> ForbiddenError before any query', async () => {
    await expect(setCurrencySettings(pilotActor(), { minFlights: 2, windowDays: 60 })).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('setCurrencySettings (admin) runs the core inside its own transaction and returns the values', async () => {
    const tx = { appSetting: { upsert: vi.fn(async () => ({})) } };
    (transactionMock as unknown as { mockImplementation: (fn: (callback: (client: unknown) => unknown) => unknown) => void }).mockImplementation((callback) => callback(tx));

    await expect(setCurrencySettings(adminActor(), { minFlights: 2, windowDays: 60 })).resolves.toEqual({ minFlights: 2, windowDays: 60 });
    expect(tx.appSetting.upsert).toHaveBeenCalledTimes(2);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('writeCurrencySettingsCore writes ONLY on the tx it receives, and never authorizes', async () => {
    const tx = { appSetting: { upsert: vi.fn(async () => ({})) } };

    await writeCurrencySettingsCore(tx as never, { minFlights: 4, windowDays: 120 });

    expect(tx.appSetting.upsert).toHaveBeenCalledWith({ where: { key: 'currency.minFlights' }, update: { value: '4' }, create: { key: 'currency.minFlights', value: '4' } });
    expect(tx.appSetting.upsert).toHaveBeenCalledWith({ where: { key: 'currency.windowDays' }, update: { value: '120' }, create: { key: 'currency.windowDays', value: '120' } });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('currencySettingsSchema rejects 0, negatives, decimals, X > 99, Y > 3650 — and accepts the bounds', () => {
    for (const body of [
      { minFlights: 0, windowDays: 90 },
      { minFlights: -1, windowDays: 90 },
      { minFlights: 1.5, windowDays: 90 },
      { minFlights: 100, windowDays: 90 },
      { minFlights: 1, windowDays: 0 },
      { minFlights: 1, windowDays: -30 },
      { minFlights: 1, windowDays: 90.5 },
      { minFlights: 1, windowDays: 3651 },
      { minFlights: 1 },
    ]) {
      expect(currencySettingsSchema.safeParse(body).success).toBe(false);
    }
    expect(currencySettingsSchema.safeParse({ minFlights: 1, windowDays: 1 }).success).toBe(true);
    expect(currencySettingsSchema.safeParse({ minFlights: 99, windowDays: 3650 }).success).toBe(true);
  });
});

describe('treasury opening balances (story Billing-1, AC 3)', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    upsertMock.mockReset();
    transactionMock.mockReset();
  });

  describe('getTreasuryOpeningInternal (NO Actor — internal reader for getBillingSummary)', () => {
    it('defaults to 0/0/null when no AppSetting rows exist yet, never throws', async () => {
      findMany.mockResolvedValue([]);
      await expect(getTreasuryOpeningInternal()).resolves.toEqual({ openingCashCents: 0, openingBankCents: 0, openingDate: null });
    });

    it('reads back stored values', async () => {
      findMany.mockResolvedValue([
        { key: 'treasury.openingCashCents', value: '150000' },
        { key: 'treasury.openingBankCents', value: '-2500' },
        { key: 'treasury.openingDate', value: '2026-01-01' },
      ]);
      await expect(getTreasuryOpeningInternal()).resolves.toEqual({ openingCashCents: 150000, openingBankCents: -2500, openingDate: '2026-01-01' });
    });

    it('falls back to 0/null (logged, never thrown) on a corrupted stored value', async () => {
      findMany.mockResolvedValue([
        { key: 'treasury.openingCashCents', value: 'not-a-number' },
        { key: 'treasury.openingDate', value: '01-01-2026' },
      ]);
      await expect(getTreasuryOpeningInternal()).resolves.toEqual({ openingCashCents: 0, openingBankCents: 0, openingDate: null });
    });

    it.each(['12.5', '-3.2', 'abc', '99999999999999'])(
      'review Billing-1 F8: a fractional/malformed openingCashCents %j is REJECTED (Number.parseInt used to truncate "12.5" to 12 silently) — falls back to 0, logged, never thrown',
      async (corrupted) => {
        findMany.mockResolvedValue([{ key: 'treasury.openingCashCents', value: corrupted }]);
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await expect(getTreasuryOpeningInternal()).resolves.toMatchObject({ openingCashCents: 0 });
        expect(consoleWarnSpy).toHaveBeenCalled();
        consoleWarnSpy.mockRestore();
      },
    );

    it('review Billing-1 F8: an impossible calendar date ("2026-13-45", right shape but rolls over via Date.UTC) fails the round-trip check — falls back to null, logged, never thrown', async () => {
      findMany.mockResolvedValue([{ key: 'treasury.openingDate', value: '2026-13-45' }]);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await expect(getTreasuryOpeningInternal()).resolves.toMatchObject({ openingDate: null });
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getTreasurySettings / setTreasurySettings (actor-facing pair, both settings.manage)', () => {
    it('getTreasurySettings is gated settings.manage — a non-admin actor is forbidden', async () => {
      await expect(getTreasurySettings(pilotActor())).rejects.toBeInstanceOf(ForbiddenError);
      expect(findManyMock).not.toHaveBeenCalled();
    });

    it('getTreasurySettings (admin) delegates to the same internal reader', async () => {
      findMany.mockResolvedValue([{ key: 'treasury.openingCashCents', value: '1000' }]);
      await expect(getTreasurySettings(adminActor())).resolves.toEqual({ openingCashCents: 1000, openingBankCents: 0, openingDate: null });
    });

    it('setTreasurySettings is gated settings.manage — a non-admin actor is forbidden, no write runs', async () => {
      await expect(
        setTreasurySettings(pilotActor(), { openingCashCents: 1000, openingBankCents: 2000, openingDate: '2026-01-01' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('setTreasurySettings (admin) writes all 3 keys together in one transaction and echoes them back', async () => {
      runTransactionsOnPrisma();
      const result = await setTreasurySettings(adminActor(), { openingCashCents: 150000, openingBankCents: -2500, openingDate: '2026-01-01' });

      expect(result).toEqual({ openingCashCents: 150000, openingBankCents: -2500, openingDate: '2026-01-01' });
      expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'treasury.openingCashCents' }, update: { value: '150000' } }));
      expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'treasury.openingBankCents' }, update: { value: '-2500' } }));
      expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'treasury.openingDate' }, update: { value: '2026-01-01' } }));
    });
  });
});
