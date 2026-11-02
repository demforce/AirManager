import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateSettingsInput } from '@/lib/schemas/settings';
import type { Actor } from '@/server/auth/rbac';
import { decryptSecret } from '@/server/crypto/secret-box';
import { ConflictError, ForbiddenError, ValidationError } from './errors';

// `app-settings.service.ts` -> `secret-box.ts` -> `@/lib/env` (eager): same
// mock as `app-settings.service.test.ts` (CLAUDE.md, env eager rule).
vi.mock('@/lib/env', () => ({ env: { AUTH_SECRET: 'test-auth-secret-not-real-0123456789', SMTP_HOST: 'localhost' } }));

/**
 * Two DISTINCT clients: `prisma` (what the snapshot getters read through) and
 * the `tx` the `$transaction` callback receives. Every write of the save must
 * land on `tx` (AC 4) — a write on `prisma` would escape the rollback.
 */
function delegates() {
  return {
    appSetting: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    expiryType: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    cashCategory: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    $queryRaw: vi.fn(),
  };
}

const tx = delegates();

vi.mock('@/server/db/prisma', () => ({
  prisma: { ...delegates(), $transaction: vi.fn() },
}));

const { prisma } = await import('@/server/db/prisma');
const { getSettingsSnapshot, saveSettings } = await import('./settings.service');

type Mocked = ReturnType<typeof delegates> & { $transaction: ReturnType<typeof vi.fn> };
const db = prisma as unknown as Mocked;

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_1', roles: ['PILOT'] };
}

function instructorActor(): Actor {
  return { userId: 'instructor_1', personId: 'person_2', roles: ['INSTRUCTOR'] };
}

function resetDelegates(client: ReturnType<typeof delegates>): void {
  for (const model of [client.appSetting, client.expiryType, client.cashCategory]) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  client.$queryRaw.mockReset();
}

/** Every write method of a client, flattened — the AC 4 guard reads these on `prisma`. */
function writeMocks(client: ReturnType<typeof delegates>) {
  return [
    client.appSetting.upsert,
    client.expiryType.create,
    client.expiryType.update,
    client.expiryType.delete,
    client.cashCategory.create,
    client.cashCategory.update,
    client.cashCategory.delete,
  ];
}

/** The snapshot read after a commit: an empty store, the defaults. */
function stubSnapshotReads(): void {
  db.appSetting.findMany.mockResolvedValue([]);
  db.appSetting.findUnique.mockResolvedValue(null);
  db.expiryType.findMany.mockResolvedValue([]);
  db.cashCategory.findMany.mockResolvedValue([]);
}

function upsertedKeys(): string[] {
  return tx.appSetting.upsert.mock.calls.map((call) => (call[0] as { where: { key: string } }).where.key);
}

beforeEach(() => {
  resetDelegates(tx);
  resetDelegates(db);
  db.$transaction.mockReset();
  db.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) => callback(tx));
  tx.appSetting.upsert.mockResolvedValue({});
  stubSnapshotReads();
});

const SMTP = { host: 'smtp.example.com', port: 587, security: 'STARTTLS' as const, user: '', from: 'Club <ops@example.com>' };
const SCHEDULING = { openTime: '07:00', closeTime: '21:00', minSlotMinutes: 60, turnaroundMinutes: 15, maxAdvanceDays: 30 };
const TREASURY = { openingCashCents: 100, openingBankCents: -50, openingDate: '2026-01-01' };

describe('saveSettings — permission (story 19.8, AC 1)', () => {
  it.each([
    ['a pilot', pilotActor()],
    ['an instructor', instructorActor()],
  ])('%s is FORBIDDEN before any query of any kind', async (_label, actor) => {
    await expect(saveSettings(actor, { metarStation: { station: 'LIRB' } })).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.$transaction).not.toHaveBeenCalled();
    for (const fn of [...writeMocks(db), ...writeMocks(tx), db.appSetting.findMany, db.appSetting.findUnique, db.expiryType.findMany, db.cashCategory.findMany]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('getSettingsSnapshot is gated the same way, before any read', async () => {
    await expect(getSettingsSnapshot(pilotActor())).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.appSetting.findMany).not.toHaveBeenCalled();
    expect(db.appSetting.findUnique).not.toHaveBeenCalled();
  });
});

describe('saveSettings — each scalar block writes its own keys and nothing else (AC 2)', () => {
  it.each<[string, UpdateSettingsInput, string[]]>([
    ['airfield', { airfield: { name: 'Campo Volo' } }, ['airfield.name']],
    ['club', { club: { icao: 'LIRB', contactEmail: 'ops@example.com' } }, ['airfield.icao', 'airfield.contactEmail']],
    ['metarStation', { metarStation: { station: 'LIRQ' } }, ['metar.station']],
    ['membershipFee', { membershipFee: { annualFeeCents: 6000 } }, ['membership.annualFeeCents']],
    ['currency', { currency: { minFlights: 3, windowDays: 60 } }, ['currency.minFlights', 'currency.windowDays']],
    ['scheduling', { scheduling: SCHEDULING }, ['sched.openTime', 'sched.closeTime', 'sched.minSlotMinutes', 'sched.turnaroundMinutes', 'sched.maxAdvanceDays']],
    ['smtp without pass', { smtp: SMTP }, ['smtp.host', 'smtp.port', 'smtp.security', 'smtp.user', 'smtp.from']],
    ['smtp with an empty pass', { smtp: { ...SMTP, pass: '' } }, ['smtp.host', 'smtp.port', 'smtp.security', 'smtp.user', 'smtp.from']],
    ['treasury', { treasury: TREASURY }, ['treasury.openingCashCents', 'treasury.openingBankCents', 'treasury.openingDate']],
  ])('%s', async (_label, patch, keys) => {
    await saveSettings(adminActor(), patch);

    expect(upsertedKeys()).toEqual(keys);
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });

  it('smtp with a typed password also writes smtp.pass, ENCRYPTED', async () => {
    await saveSettings(adminActor(), { smtp: { ...SMTP, pass: 'a-real-password' } });

    expect(upsertedKeys()).toContain('smtp.pass');
    const passCall = tx.appSetting.upsert.mock.calls.find((call) => (call[0] as { where: { key: string } }).where.key === 'smtp.pass');
    const stored = (passCall?.[0] as { update: { value: string } }).update.value;
    expect(stored).not.toBe('a-real-password');
    expect(decryptSecret(stored)).toBe('a-real-password');
  });

  it('the values written are the ones of the block (string form of the AppSetting)', async () => {
    await saveSettings(adminActor(), { membershipFee: { annualFeeCents: 6000 }, metarStation: { station: '' } });

    expect(tx.appSetting.upsert).toHaveBeenCalledWith({ where: { key: 'membership.annualFeeCents' }, update: { value: '6000' }, create: { key: 'membership.annualFeeCents', value: '6000' } });
    expect(tx.appSetting.upsert).toHaveBeenCalledWith({ where: { key: 'metar.station' }, update: { value: '' }, create: { key: 'metar.station', value: '' } });
  });
});

/** A call log shared by the tx delegates, so the ORDER of the list operations can be read back. */
function logCalls(): string[] {
  const log: string[] = [];
  tx.appSetting.upsert.mockImplementation(async (args: { where: { key: string } }) => {
    log.push(`upsert ${args.where.key}`);
    return {};
  });
  tx.expiryType.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    if (args.where.id === 'et_gone') return null;
    return { id: args.where.id, kind: 'RATING', scope: 'ALL', blocksBooking: false, _count: { expiries: 0 } };
  });
  tx.expiryType.findFirst.mockResolvedValue(null);
  tx.expiryType.delete.mockImplementation(async (args: { where: { id: string } }) => {
    log.push(`expiryType.delete ${args.where.id}`);
    return {};
  });
  tx.expiryType.update.mockImplementation(async (args: { where: { id: string } }) => {
    log.push(`expiryType.update ${args.where.id}`);
    return {};
  });
  tx.expiryType.create.mockImplementation(async (args: { data: { name: string } }) => {
    log.push(`expiryType.create ${args.data.name}`);
    return {};
  });
  tx.cashCategory.findUnique.mockImplementation(async (args: { where: { id: string } }) => ({ id: args.where.id, name: `Cat ${args.where.id}`, _count: { movements: 0 } }));
  tx.cashCategory.delete.mockImplementation(async (args: { where: { id: string } }) => {
    log.push(`cashCategory.delete ${args.where.id}`);
    return {};
  });
  tx.cashCategory.update.mockImplementation(async (args: { where: { id: string } }) => {
    log.push(`cashCategory.update ${args.where.id}`);
    return { id: args.where.id, name: 'x', isActive: true, _count: { movements: 0 } };
  });
  tx.cashCategory.create.mockImplementation(async (args: { data: { name: string } }) => {
    log.push(`cashCategory.create ${args.data.name}`);
    return { id: 'new', name: args.data.name, isActive: true };
  });
  return log;
}

const EVERYTHING: UpdateSettingsInput = {
  airfield: { name: 'Campo Volo' },
  club: { icao: 'LIRB', contactEmail: '' },
  metarStation: { station: '' },
  membershipFee: { annualFeeCents: 0 },
  currency: { minFlights: 1, windowDays: 90 },
  scheduling: SCHEDULING,
  smtp: { ...SMTP, pass: 'secret' },
  treasury: TREASURY,
  expiryTypes: {
    create: [{ name: 'Nuovo', kind: 'RATING', validityMonths: null }],
    update: [{ id: 'et_2', name: 'Rinominato' }],
    delete: ['et_1'],
  },
  cashCategories: {
    create: [{ name: 'Nuova cat' }],
    update: [{ id: 'cc_2', isActive: false }],
    delete: ['cc_1'],
  },
};

describe('saveSettings — one transaction, every write on tx (AC 4, AD-2)', () => {
  it('a save touching every block and every list writes NOTHING outside the transaction client', async () => {
    logCalls();
    await saveSettings(adminActor(), EVERYTHING);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    for (const fn of writeMocks(db)) expect(fn).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
    // ...and the row lock of the expiry-type update was taken on tx too.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('order: scalar blocks, then per list delete → update → create, expiry types before cash categories', async () => {
    const log = logCalls();
    await saveSettings(adminActor(), EVERYTHING);

    const listOps = log.filter((entry) => !entry.startsWith('upsert'));
    expect(listOps).toEqual([
      'expiryType.delete et_1',
      'expiryType.update et_2',
      'expiryType.create Nuovo',
      'cashCategory.delete cc_1',
      'cashCategory.update cc_2',
      'cashCategory.create Nuova cat',
    ]);
    expect(log.findIndex((entry) => !entry.startsWith('upsert'))).toBe(log.filter((entry) => entry.startsWith('upsert')).length);
  });

  it('an error from the LAST core propagates out of the transaction with details.item — nothing swallows it, no snapshot is read', async () => {
    logCalls();
    tx.cashCategory.create.mockRejectedValue({ code: 'P2002' });

    const error = await saveSettings(adminActor(), EVERYTHING).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('CONFLICT');
    expect((error as ConflictError).details).toEqual({ reason: 'NAME_TAKEN', item: { list: 'cashCategories', op: 'create', index: 0 } });
    // The snapshot is read only after a commit.
    expect(db.appSetting.findMany).not.toHaveBeenCalled();
  });

  it('a category with movements refused at delete → 409 IN_USE naming the row, before any later operation runs', async () => {
    const log = logCalls();
    tx.cashCategory.findUnique.mockResolvedValue({ id: 'cc_1', name: 'Carburante', _count: { movements: 3 } });

    const error = await saveSettings(adminActor(), EVERYTHING).catch((caught: unknown) => caught);

    expect((error as ConflictError).details).toEqual({ reason: 'IN_USE', item: { list: 'cashCategories', op: 'delete', index: 0, id: 'cc_1' } });
    expect(log).not.toContain('cashCategory.update cc_2');
    expect(log).not.toContain('cashCategory.create Nuova cat');
  });
});

describe('saveSettings — list semantics (AC 5)', () => {
  it('delete of an id that no longer exists is a no-op (missingOk), the save goes on', async () => {
    const log = logCalls();
    await saveSettings(adminActor(), { expiryTypes: { delete: ['et_gone'] }, cashCategories: { create: [{ name: 'Dopo' }] } });

    expect(tx.expiryType.delete).not.toHaveBeenCalled();
    expect(log).toContain('cashCategory.create Dopo');
  });

  it('update of an id that no longer exists is a 409 NOT_FOUND (never a 404: /settings always exists)', async () => {
    logCalls();
    const error = await saveSettings(adminActor(), { expiryTypes: { update: [{ id: 'et_gone', isActive: false }] } }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details).toEqual({ reason: 'NOT_FOUND', item: { list: 'expiryTypes', op: 'update', index: 0, id: 'et_gone' } });
  });

  it('a category isActive: false on an already inactive category is a plain update (declarative), not the 409 of the single route', async () => {
    logCalls();
    tx.cashCategory.update.mockResolvedValue({ id: 'cc_1', name: 'Altro', isActive: false, _count: { movements: 0 } });

    await saveSettings(adminActor(), { cashCategories: { update: [{ id: 'cc_1', isActive: false }] } });

    expect(tx.cashCategory.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cc_1' }, data: { isActive: false } }));
  });

  it('renaming a system category → 409 SYSTEM_CATEGORY, deactivating it stays allowed', async () => {
    logCalls();
    tx.cashCategory.findUnique.mockResolvedValue({ id: 'cc_sys', name: 'Ricariche' });

    const rename = await saveSettings(adminActor(), { cashCategories: { update: [{ id: 'cc_sys', name: 'Top-up' }] } }).catch((caught: unknown) => caught);
    expect((rename as ConflictError).details).toEqual({ reason: 'SYSTEM_CATEGORY', item: { list: 'cashCategories', op: 'update', index: 0, id: 'cc_sys' } });

    await expect(saveSettings(adminActor(), { cashCategories: { update: [{ id: 'cc_sys', isActive: false }] } })).resolves.toBeDefined();
  });

  it('an expiry type in use → 409 IN_USE', async () => {
    logCalls();
    tx.expiryType.findUnique.mockResolvedValue({ id: 'et_1', kind: 'RATING', _count: { expiries: 2 } });

    const error = await saveSettings(adminActor(), { expiryTypes: { delete: ['et_1'] } }).catch((caught: unknown) => caught);
    expect((error as ConflictError).details).toEqual({ reason: 'IN_USE', item: { list: 'expiryTypes', op: 'delete', index: 0, id: 'et_1' } });
  });

  it('a create with a name already taken → 409 NAME_TAKEN at its index in the array sent', async () => {
    logCalls();
    tx.expiryType.findFirst.mockImplementation(async (args: { where: { name: string } }) => (args.where.name === 'Esistente' ? { id: 'et_9' } : null));

    const error = await saveSettings(adminActor(), {
      expiryTypes: { create: [{ name: 'Libero', kind: 'RATING', validityMonths: null }, { name: 'Esistente', kind: 'MEDICAL', validityMonths: 12 }] },
    }).catch((caught: unknown) => caught);
    expect((error as ConflictError).details).toEqual({ reason: 'NAME_TAKEN', item: { list: 'expiryTypes', op: 'create', index: 1 } });
  });

  it('the codes of story 19.7a pass through unchanged, with details.item added', async () => {
    logCalls();
    const medical = await saveSettings(adminActor(), {
      expiryTypes: { create: [{ name: 'Visita', kind: 'MEDICAL', scope: 'PILOTS', validityMonths: null }] },
    }).catch((caught: unknown) => caught);
    expect(medical).toBeInstanceOf(ValidationError);
    expect((medical as ValidationError).code).toBe('MEDICAL_TYPE_FIELDS');
    expect((medical as ValidationError).details).toEqual({ item: { list: 'expiryTypes', op: 'create', index: 0 } });

    tx.expiryType.findUnique.mockResolvedValue({ id: 'et_fee', kind: 'MEMBERSHIP', scope: 'ALL', blocksBooking: false, _count: { expiries: 0 } });
    const locked = await saveSettings(adminActor(), { expiryTypes: { update: [{ id: 'et_fee', isActive: false }] } }).catch((caught: unknown) => caught);
    expect((locked as ConflictError).code).toBe('MEMBERSHIP_TYPE_LOCKED');
    expect((locked as ConflictError).details).toEqual({ item: { list: 'expiryTypes', op: 'update', index: 0, id: 'et_fee' } });
  });

  it('"delete X and create a new X" in one save: the delete runs first, so the create finds the name free', async () => {
    const log = logCalls();
    await saveSettings(adminActor(), { cashCategories: { delete: ['cc_x'], create: [{ name: 'Cat cc_x' }] } });

    expect(log).toEqual(['cashCategory.delete cc_x', 'cashCategory.create Cat cc_x']);
  });
});

describe('getSettingsSnapshot — the page and the save answer from one read (AC 6, AD-4)', () => {
  it('composes the getters: membership type left out, METAR equal to the ICAO read as "no override", no password', async () => {
    db.appSetting.findUnique.mockImplementation(async (args: { where: { key: string } }) => {
      const values: Record<string, string> = { 'airfield.icao': 'LIRB', 'metar.station': 'LIRB', 'membership.annualFeeCents': '6000' };
      return values[args.where.key] !== undefined ? { value: values[args.where.key] } : null;
    });
    db.appSetting.findMany.mockResolvedValue([{ key: 'smtp.pass', value: 'stored' }]);
    db.expiryType.findMany.mockResolvedValue([
      { id: 'et_r', name: 'Notturna', kind: 'RATING' },
      { id: 'et_m', name: 'Visita classe 2', kind: 'MEDICAL' },
      { id: 'et_fee', name: 'Quota associativa', kind: 'MEMBERSHIP' },
    ]);

    const snapshot = await getSettingsSnapshot(adminActor());

    expect(Object.keys(snapshot).sort()).toEqual(['airfield', 'cashCategories', 'club', 'currency', 'expiryTypes', 'membershipFee', 'metarStation', 'scheduling', 'smtp', 'treasury']);
    expect(snapshot.club.icao).toBe('LIRB');
    expect(snapshot.metarStation).toEqual({ station: '' });
    expect(snapshot.membershipFee).toEqual({ annualFeeCents: 6000 });
    expect(snapshot.currency).toEqual({ minFlights: 1, windowDays: 90 });
    expect(snapshot.smtp).not.toHaveProperty('pass');
    expect(snapshot.smtp.hasPassword).toBe(true);
    expect(snapshot.expiryTypes.map((expiryType) => expiryType.id)).toEqual(['et_r', 'et_m']);
  });

  it('a METAR override different from the ICAO is returned as typed', async () => {
    db.appSetting.findUnique.mockImplementation(async (args: { where: { key: string } }) => {
      const values: Record<string, string> = { 'airfield.icao': 'LIRB', 'metar.station': 'LIRQ' };
      return values[args.where.key] !== undefined ? { value: values[args.where.key] } : null;
    });

    await expect(getSettingsSnapshot(adminActor())).resolves.toMatchObject({ metarStation: { station: 'LIRQ' } });
  });

  it('saveSettings answers with the snapshot read AFTER the commit', async () => {
    db.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) => {
      expect(db.appSetting.findMany).not.toHaveBeenCalled();
      return callback(tx);
    });

    const snapshot = await saveSettings(adminActor(), { metarStation: { station: 'LIRQ' } });

    expect(snapshot).toHaveProperty('smtp');
    expect(db.appSetting.findMany).toHaveBeenCalled();
  });
});
