import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPIRY_ALERT_THRESHOLDS } from '@/lib/expiry-status';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    expiry: { findMany: vi.fn(), count: vi.fn() },
    sentAlert: { createMany: vi.fn(), deleteMany: vi.fn() },
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

function candidate(id: string, days = 60) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return {
    id,
    expiresAt: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
    person: { id: `person_${id}`, firstName: 'Test', lastName: id, email: `${id}@example.test` },
    expiryType: { name: 'Test type' },
    sentAlerts: [],
  };
}

describe('story 17.8 alert batches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    find.mockResolvedValue([] as never);
    count.mockResolvedValue(0);
    claim.mockResolvedValue({ count: 1 });
    release.mockResolvedValue({ count: 1 });
    users.mockResolvedValue([] as never);
    send.mockResolvedValue(undefined);
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
