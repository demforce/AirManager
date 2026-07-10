import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

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
 * Airfield PDF branding (story 10.2, AC 1) — minimal targeted coverage:
 * NO read gate (unlike every other getter above), the fresh-install
 * default, the empty-string-in-storage/`null`-at-read-boundary shape for a
 * removed logo, write gating, and both keys upserted together.
 */
describe('app-settings.service — airfield branding (story 10.2, AC 1)', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    upsertMock.mockReset();
    transactionMock.mockReset();
  });

  describe('getAirfieldBranding', () => {
    it('has NO permission gate — a pilot (no settings.manage, no ppr.manage) reads it', async () => {
      findMany.mockResolvedValue([]);
      await expect(getAirfieldBranding()).resolves.toEqual({ name: 'AirManager', logoDataUrl: null });
    });

    it('defaults to name "AirManager" and no logo when no AppSetting rows exist yet', async () => {
      findMany.mockResolvedValue([]);

      const result = await getAirfieldBranding();

      expect(result).toEqual({ name: 'AirManager', logoDataUrl: null });
      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { key: { in: ['airfield.name', 'airfield.logo'] } } }));
    });

    it('reads back a configured name and logo', async () => {
      findMany.mockResolvedValue([
        { key: 'airfield.name', value: 'Aviosuperficie di Test' },
        { key: 'airfield.logo', value: 'data:image/png;base64,AAA=' },
      ]);

      await expect(getAirfieldBranding()).resolves.toEqual({ name: 'Aviosuperficie di Test', logoDataUrl: 'data:image/png;base64,AAA=' });
    });

    it('an empty stored logo value (removed logo) reads back as null, never an empty string', async () => {
      findMany.mockResolvedValue([{ key: 'airfield.name', value: 'X' }, { key: 'airfield.logo', value: '' }]);

      await expect(getAirfieldBranding()).resolves.toEqual({ name: 'X', logoDataUrl: null });
    });
  });

  describe('setAirfieldBranding', () => {
    it('is gated settings.manage — staff is forbidden, no write runs', async () => {
      await expect(setAirfieldBranding(staffActor(), { name: 'X', logoDataUrl: null })).rejects.toBeInstanceOf(ForbiddenError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('admin (settings.manage) writes name + logo together in one transaction', async () => {
      upsert.mockResolvedValue({});
      transaction.mockResolvedValue([{}, {}]);

      const result = await setAirfieldBranding(adminActor(), { name: 'Aviosuperficie', logoDataUrl: 'data:image/png;base64,AAA=' });

      expect(result).toEqual({ name: 'Aviosuperficie', logoDataUrl: 'data:image/png;base64,AAA=' });
      expect(transactionMock).toHaveBeenCalledTimes(1);
      const batch = transactionMock.mock.calls[0]?.[0] as unknown as unknown[];
      expect(batch).toHaveLength(2);
    });

    it('logoDataUrl: null (removal) stores an empty string, not literal null', async () => {
      upsert.mockResolvedValue({});
      transaction.mockResolvedValue([{}, {}]);

      await setAirfieldBranding(adminActor(), { name: 'X', logoDataUrl: null });

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: 'airfield.logo' }, update: { value: '' }, create: { key: 'airfield.logo', value: '' } }),
      );
    });
  });
});
