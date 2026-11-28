import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPIRY_ALERT_THRESHOLDS } from '@/lib/expiry-status';

// These fixtures exercise the default legacy configuration. The opt-in path uses
// PostgreSQL and local SMTP in scripts/test-single-account-address.ts.
beforeAll(() => vi.stubEnv('AIRMANAGER_EMAIL_TRIAL', '0'));
afterAll(() => vi.unstubAllEnvs());

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    expiry: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    appSetting: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    sentAlert: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));
const send = vi.fn();
vi.mock('@/server/adapters/mail', () => ({ getMailSender: () => ({ send }) }));
vi.mock('@/server/adapters/mail/templates', () => ({
  buildExpiryAlertEmail: vi.fn(async () => ({ subject: 'alert', text: 'alert' })),
  buildExpiryDigestEmail: vi.fn(async () => ({ subject: 'digest', text: 'digest' })),
}));

const { prisma } = await import('@/server/db/prisma');
const { buildExpiryDigestEmail } = await import('@/server/adapters/mail/templates');
const { runExpiryAlertsJob } = await import('./expiry-alerts.service');
const find = vi.mocked(prisma.expiry.findMany);
const count = vi.mocked(prisma.expiry.count);
const claim = vi.mocked(prisma.sentAlert.createMany);
const release = vi.mocked(prisma.sentAlert.deleteMany);
const users = vi.mocked(prisma.user.findMany);
const unique = vi.mocked(prisma.user.findUnique);
const settingFind = vi.mocked(prisma.appSetting.findUnique);
const settingCreate = vi.mocked(prisma.appSetting.create);
const settingUpdate = vi.mocked(prisma.appSetting.updateMany);

const rowsById = new Map<string, { expiresAt: Date }>();

function candidate(id: string, days = 60) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  const row = {
    id,
    personId: `person_${id}`,
    expiresAt: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
    person: { id: `person_${id}`, firstName: 'Test', lastName: id, email: `${id}@example.test` },
    expiryType: { name: 'Test type' },
    sentAlerts: [],
  };
  rowsById.set(id, row);
  return row;
}

describe('story 17.8 alert batches', () => {
  beforeEach(() => {
    vi.mocked(prisma.sentAlert.findMany).mockImplementation((async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({ id }))) as never);
    rowsById.clear();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(prisma));
    vi.mocked(prisma.$queryRaw).mockImplementation((async (_sql: unknown, id: string) => {
      const row = rowsById.get(String(id));
      return row ? [{ expiresAt: row.expiresAt }] : [];
    }) as never);
    vi.mocked(prisma.expiry.findUnique).mockImplementation((async ({ where }: { where: { id: string } }) => rowsById.get(where.id) ?? null) as never);
    vi.mocked(prisma.sentAlert.findFirst).mockResolvedValue({ id: 'owned' } as never);

    vi.clearAllMocks();
    find.mockResolvedValue([] as never);
    count.mockResolvedValue(0);
    claim.mockResolvedValue({ count: 1 });
    release.mockResolvedValue({ count: 1 });
    users.mockResolvedValue([] as never);
    send.mockResolvedValue(undefined);
    settingFind.mockResolvedValue(null);
    settingCreate.mockResolvedValue({ key: 'expiry-alerts.retry-cursor', value: '' } as never);
    settingUpdate.mockResolvedValue({ count: 1 });
  });

  it('D1 caps a run at two urgent candidates and reports the pending remainder', async () => {
    const rows = [candidate('a', -1), candidate('b', 10), candidate('c', 40)];
    find.mockImplementation(((args: { take?: number }) => Promise.resolve(rows.slice(0, args?.take ?? rows.length))) as never);
    count.mockResolvedValue(1);
    const result = await runExpiryAlertsJob(2);
    expect(result).toMatchObject({ candidates: 2, holderEmailsSent: 2, remaining: 1 });
    expect(find.mock.calls[0]?.[0]).toMatchObject({ take: 2, orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }] });
  });

  it('D3 filters due, unsent thresholds, archived people and inactive types in the database', async () => {
    await runExpiryAlertsJob();
    const where = find.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ person: { archivedAt: null }, expiryType: { isActive: true } });
    expect(where?.OR).toHaveLength(4);
    expect(where?.OR?.map((branch) => branch.sentAlerts?.none?.threshold)).toEqual(EXPIRY_ALERT_THRESHOLDS);
    for (const branch of where!.OR!) {
      expect(branch).toMatchObject({ expiresAt: { lte: expect.any(Date) }, sentAlerts: { none: { threshold: expect.any(Number) } } });
    }
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('D2 releases only this attempt claims on failed SMTP and reports it in the digest', async () => {
    find.mockResolvedValueOnce([candidate('a', 5)] as never).mockResolvedValue([] as never);
    send.mockRejectedValueOnce(new Error('synthetic SMTP failure'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await runExpiryAlertsJob();
      expect(result).toMatchObject({ candidates: 1, alertsCreated: 0, holderEmailsSent: 0 });
      const claimed = claim.mock.calls[0]?.[0]?.data;
      expect(claimed).toEqual([
        { id: expect.any(String), expiryId: 'a', threshold: 60 },
        { id: expect.any(String), expiryId: 'a', threshold: 30 },
        { id: expect.any(String), expiryId: 'a', threshold: 7 },
      ]);
      expect(release).toHaveBeenCalledWith({ where: { id: { in: (claimed as { id: string }[]).map((row) => row.id) } } });
    } finally { error.mockRestore(); }
  });

  it('D5 loads recipient locales once per page and never calls findUnique', async () => {
    find.mockResolvedValueOnce([candidate('a'), candidate('b')] as never).mockResolvedValue([] as never);
    await runExpiryAlertsJob(2);
    expect(unique).not.toHaveBeenCalled();
    expect(users).toHaveBeenCalledWith({ where: { personId: { in: ['person_a', 'person_b'] } }, select: { personId: true, locale: true } });
  });

  it('D4 follows the last (expiresAt, id) key without offset after a full page', async () => {
    const first = Array.from({ length: 50 }, (_, index) => candidate(`a${String(index).padStart(2, '0')}`));
    const last = candidate('b');
    find.mockResolvedValueOnce(first as never).mockResolvedValueOnce([last] as never);
    const result = await runExpiryAlertsJob(51);
    expect(result).toMatchObject({ candidates: 51, holderEmailsSent: 51 });
    expect(find).toHaveBeenCalledTimes(2);
    expect(find.mock.calls[1]?.[0]).toMatchObject({
      take: 1,
      where: { AND: [expect.anything(), { OR: [
        { expiresAt: { gt: first[49]!.expiresAt } },
        { expiresAt: first[49]!.expiresAt, id: { gt: 'a49' } },
      ] }] },
    });
    expect(find.mock.calls[1]?.[0]).not.toHaveProperty('skip');
  });

  it('builds one admin digest covering both pages of this run only', async () => {
    const first = Array.from({ length: 50 }, (_, index) => candidate(`a${index}`));
    find.mockResolvedValueOnce(first as never).mockResolvedValueOnce([candidate('b')] as never);
    users.mockImplementation(((args: { where?: { isActive?: boolean } }) =>
      Promise.resolve(args.where?.isActive ? [{ email: 'admin@example.test', locale: 'it' }] : [])) as never);
    const result = await runExpiryAlertsJob(51);
    expect(result).toMatchObject({ candidates: 51, digestEmailsSent: 1 });
    expect(buildExpiryDigestEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(buildExpiryDigestEmail).mock.calls[0]?.[1]?.items).toHaveLength(51);
  });

  it('stops after three consecutive transport failures, leaving later candidates pending', async () => {
    find.mockResolvedValueOnce(['a', 'b', 'c', 'd'].map((id) => candidate(id)) as never);
    count.mockResolvedValue(4);
    send.mockRejectedValue(new Error('synthetic SMTP outage'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await runExpiryAlertsJob(4);
      expect(result).toMatchObject({ candidates: 3, alertsCreated: 0, remaining: 4, digestEmailsSent: 0 });
      expect(claim).toHaveBeenCalledTimes(3);
      expect(release).toHaveBeenCalledTimes(3);
    } finally { error.mockRestore(); }
  });

  it('continues past three rejected recipients and sends to the next valid address', async () => {
    find.mockResolvedValueOnce(['a', 'b', 'c', 'd'].map((id) => candidate(id)) as never);
    count.mockResolvedValue(3);
    send.mockImplementation(async ({ to }: { to: string }) => {
      if (to !== 'd@example.test') {
        throw Object.assign(new Error('synthetic recipient rejection'), { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 });
      }
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await runExpiryAlertsJob(4);
      expect(result).toMatchObject({ candidates: 4, alertsCreated: 1, holderEmailsSent: 1, remaining: 3 });
      expect(send.mock.calls.map(([message]) => message.to)).toEqual(['a', 'b', 'c', 'd'].map((id) => `${id}@example.test`));
      expect(release).toHaveBeenCalledTimes(3);
    } finally { error.mockRestore(); }
  });

  it('treats SMTP 421 during RCPT TO as a transport failure and stops after three', async () => {
    find.mockResolvedValueOnce(['a', 'b', 'c', 'd'].map((id) => candidate(id)) as never);
    count.mockResolvedValue(4);
    send.mockRejectedValue(Object.assign(new Error('synthetic channel closing'), { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 421 }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await runExpiryAlertsJob(4);
      expect(result).toMatchObject({ candidates: 3, holderEmailsSent: 0, remaining: 4 });
    } finally { error.mockRestore(); }
  });

  it('a recipient rejection interrupts a sequence of transport failures', async () => {
    find.mockResolvedValueOnce(['a', 'b', 'c', 'd', 'e'].map((id) => candidate(id)) as never);
    count.mockResolvedValue(4);
    send.mockImplementation(async ({ to }: { to: string }) => {
      if (to === 'c@example.test') {
        throw Object.assign(new Error('synthetic recipient rejection'), { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 });
      }
      if (to !== 'e@example.test') throw new Error('synthetic transport outage');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await runExpiryAlertsJob(5);
      expect(result).toMatchObject({ candidates: 5, holderEmailsSent: 1, remaining: 4 });
    } finally { error.mockRestore(); }
  });

  it('rotates after 200 rejected recipients so a later valid candidate is reached on the next run', async () => {
    const rows = Array.from({ length: 201 }, (_, i) => candidate(`a${String(i).padStart(3, '0')}`));
    let storedCursor: string | null = null;
    let storedUpdatedAt = new Date('2026-01-01T00:00:00.000Z');
    settingFind.mockImplementation((async ({ where }: { where: { key: string } }) => where.key !== 'expiry-alerts.retry-cursor' || storedCursor === null ? null : { value: storedCursor, updatedAt: storedUpdatedAt }) as never);
    settingCreate.mockImplementation((async ({ data }: { data: { value: string } }) => {
      storedCursor = data.value;
      return data;
    }) as never);
    settingUpdate.mockImplementation((async ({ where, data }: { where: { value: string; updatedAt: Date }; data: { value: string } }) => {
      if (storedCursor !== where.value || storedUpdatedAt.getTime() !== where.updatedAt?.getTime()) return { count: 0 };
      storedCursor = data.value;
      storedUpdatedAt = new Date(storedUpdatedAt.getTime() + 1000);
      return { count: 1 };
    }) as never);
    find.mockImplementation((async ({ where, take }: { where: { AND?: [unknown, { OR: [unknown, { expiresAt: Date; id: { gt: string } }] }] }; take: number }) => {
      const after = where.AND?.[1]?.OR?.[1]?.id.gt;
      const remaining = after ? rows.filter((row) => row.id > after) : rows;
      return remaining.slice(0, take);
    }) as never);
    count.mockResolvedValue(201);
    send.mockImplementation(async ({ to }: { to: string }) => {
      if (to !== 'a200@example.test') throw Object.assign(new Error('synthetic recipient rejection'), { command: 'RCPT TO', responseCode: 550 });
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const first = await runExpiryAlertsJob();
      expect(release).toHaveBeenCalledTimes(200);
      const second = await runExpiryAlertsJob();
      expect(first.candidates).toBe(200);
      expect(second.holderEmailsSent).toBe(1);
      expect(storedCursor).toBe('');
      expect(send.mock.calls.some(([message]) => message.to === 'a200@example.test')).toBe(true);
      send.mockImplementation(async ({ to }: { to: string }) => {
        if (to !== 'a000@example.test') throw Object.assign(new Error('synthetic recipient rejection'), { command: 'RCPT TO', responseCode: 550 });
      });
      const third = await runExpiryAlertsJob();
      expect(third.holderEmailsSent).toBe(1);
      expect(send.mock.calls.filter(([message]) => message.to === 'a000@example.test')).toHaveLength(2);
    } finally { error.mockRestore(); }
  });

  it('keeps immediate next-run retry when 200 rejected recipients exhaust the whole queue', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => candidate(`a${String(i).padStart(3, '0')}`));
    find.mockImplementation((async ({ where, take }: { where: { AND?: [unknown, { OR: [unknown, { id: { gt: string } }] }] }; take: number }) => {
      const after = where.AND?.[1]?.OR?.[1]?.id.gt;
      return (after ? rows.filter((row) => row.id > after) : rows).slice(0, take);
    }) as never);
    count.mockResolvedValue(200);
    send.mockRejectedValue(Object.assign(new Error('synthetic recipient rejection'), { command: 'RCPT TO', responseCode: 550 }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await runExpiryAlertsJob();
      await runExpiryAlertsJob();
      expect(settingCreate).not.toHaveBeenCalled();
      expect(send.mock.calls.filter(([message]) => message.to === 'a000@example.test')).toHaveLength(2);
    } finally { error.mockRestore(); }
  });

  it('D6 treats a concurrently deleted expiry P2003 as skipped', async () => {
    find.mockResolvedValueOnce([candidate('a')] as never).mockResolvedValue([] as never);
    claim.mockRejectedValueOnce({ code: 'P2003' });
    await expect(runExpiryAlertsJob()).resolves.toMatchObject({ alertsCreated: 0, holderEmailsSent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('P2002 concurrent loser sends no duplicate mail', async () => {
    find.mockResolvedValueOnce([candidate('a')] as never).mockResolvedValue([] as never);
    claim.mockRejectedValueOnce({ code: 'P2002' });
    await expect(runExpiryAlertsJob()).resolves.toMatchObject({ alertsCreated: 0, holderEmailsSent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('two overlapping runs claim one candidate only once', async () => {
    const row = candidate('shared');
    find.mockResolvedValue([row] as never);
    let claimed = false;
    claim.mockImplementation((() => {
      if (claimed) return Promise.reject({ code: 'P2002' });
      claimed = true;
      return Promise.resolve({ count: 1 });
    }) as never);
    const results = await Promise.all([runExpiryAlertsJob(), runExpiryAlertsJob()]);
    expect(results.map((result) => result.holderEmailsSent).sort()).toEqual([0, 1]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
  });
});
