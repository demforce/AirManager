import { APP_TIMEZONE } from '@/lib/time';
import { todayDateOnlyUtcInZone } from '@/lib/zoned-time';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    expiry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    appSetting: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    sentAlert: { findMany: vi.fn(),
      findFirst: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

const sendMock = vi.fn();
vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: sendMock })),
}));

vi.mock('@/server/adapters/mail/templates', () => ({
  buildExpiryAlertEmail: vi.fn(async () => ({ subject: 'Alert subject', text: 'Alert text', html: '<p>Alert text</p>' })),
  buildExpiryDigestEmail: vi.fn(async () => ({ subject: 'Digest subject', text: 'Digest text', html: '<p>Digest text</p>' })),
}));

const { prisma } = await import('@/server/db/prisma');
const { buildExpiryAlertEmail, buildExpiryDigestEmail } = await import('@/server/adapters/mail/templates');
const { runExpiryAlertsJob } = await import('./expiry-alerts.service');

const expiryFindManyMock = vi.mocked(prisma.expiry.findMany);
const expiryCountMock = vi.mocked(prisma.expiry.count);
const sentAlertCreateManyMock = vi.mocked(prisma.sentAlert.createMany);
const sentAlertDeleteManyMock = vi.mocked(prisma.sentAlert.deleteMany);
const userFindManyMock = vi.mocked(prisma.user.findMany);

type Fixture = Record<string, unknown>;
const expiryFindMany = expiryFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const sentAlertCreateMany = sentAlertCreateManyMock as unknown as {
  mockResolvedValue: (v: { count: number }) => void;
  mockRejectedValueOnce: (v: unknown) => void;
};
const userFindMany = userFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function prismaError(code: string): unknown {
  return { code };
}

const rowsById = new Map<string, { expiresAt: Date }>();

function candidateFixture(overrides: Partial<Fixture> = {}): Fixture {
  const row = {
    id: 'exp_1',
    personId: 'person_1',
    expiresAt: addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), 60),
    person: { id: 'person_1', firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com' },
    expiryType: { name: 'Visita medica classe 2' },
    sentAlerts: [],
    ...overrides,
  };
  rowsById.set(row.id, row);
  return row;
}

function adminUserFixture(overrides: Partial<Fixture> = {}): Fixture {
  return { email: 'admin@airmanager.local', locale: 'it', ...overrides };
}

describe('expiry-alerts.service (story 6.3 — automatic expiry alert emails, idempotent job, FR-37, AD-9)', () => {
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

    vi.mocked(prisma.appSetting.findUnique).mockReset();
    vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.appSetting.create).mockReset();
    vi.mocked(prisma.appSetting.updateMany).mockReset();
    expiryFindManyMock.mockReset();
    expiryCountMock.mockReset();
    sentAlertCreateManyMock.mockReset();
    sentAlertDeleteManyMock.mockReset().mockResolvedValue({ count: 0 });
    userFindManyMock.mockReset();
    sendMock.mockReset();
    vi.mocked(buildExpiryAlertEmail).mockClear();
    vi.mocked(buildExpiryDigestEmail).mockClear();

    sentAlertCreateMany.mockResolvedValue({ count: 1 });
    expiryCountMock.mockResolvedValue(0);
    sentAlertDeleteManyMock.mockResolvedValue({ count: 1 });
    userFindMany.mockResolvedValue([adminUserFixture()]);
  });

  function setMailPolicy(expiryHolder: boolean, expiryDigest: boolean) {
    const value = JSON.stringify({ switches: { expiryHolder, expiryDigest }, holderSince: null, digestSince: null });
    vi.mocked(prisma.appSetting.findUnique).mockImplementation((async ({ where }: { where: { key: string } }) =>
      where.key === 'mail.operational' ? { value } : null) as never);
  }

  it.each([true, false])('a holder switch turned off during rendering stops its send and retains claims only for an active digest (%s)', async (digest) => {
    const target = candidateFixture();
    expiryFindMany.mockResolvedValue([target]);
    vi.mocked(buildExpiryAlertEmail).mockImplementationOnce(async () => {
      setMailPolicy(false, digest);
      return { subject: 'alert', text: 'alert', html: '<p>alert</p>' };
    });
    const result = await runExpiryAlertsJob();
    expect(result.status).toBe('settings_changed');
    expect(result.holderEmailsSent).toBe(0);
    expect(result.digestEmailsSent).toBe(Number(digest));
    expect(result.alertsCreated).toBe(Number(digest));
    expect(sendMock).not.toHaveBeenCalledWith(expect.objectContaining({ to: 'mario@example.com' }));
    if (digest) {
      expect(buildExpiryDigestEmail).toHaveBeenCalledWith('it', { items: [expect.objectContaining({ holderStatus: 'REMINDERS_DISABLED' })] });
      expect(sentAlertDeleteManyMock).not.toHaveBeenCalled();
    } else {
      expect(sentAlertDeleteManyMock).toHaveBeenCalledWith({ where: { id: { in: [expect.any(String)] } } });
    }
  });

  it('turning off the digest during holder rendering leaves the eligible holder handoff intact', async () => {
    expiryFindMany.mockResolvedValue([candidateFixture()]);
    vi.mocked(buildExpiryAlertEmail).mockImplementationOnce(async () => {
      setMailPolicy(true, false);
      return { subject: 'alert', text: 'alert', html: '<p>alert</p>' };
    });
    expect(await runExpiryAlertsJob()).toMatchObject({ status: 'settings_changed', holderEmailsSent: 1, digestEmailsSent: 0, alertsCreated: 1 });
  });

  it('turning off the digest during the first admin delivery stops the second handoff without releasing the consumed item', async () => {
    setMailPolicy(false, true);
    expiryFindMany.mockResolvedValue([candidateFixture()]);
    userFindMany.mockResolvedValue([adminUserFixture(), adminUserFixture({ email: 'other@example.test' })]);
    sendMock.mockImplementationOnce(async () => { setMailPolicy(false, false); });
    const result = await runExpiryAlertsJob();
    expect(result).toMatchObject({ status: 'settings_changed', holderEmailsSent: 0, digestEmailsSent: 1, alertsCreated: 1 });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentAlertDeleteManyMock).not.toHaveBeenCalled();
  });

  it('turning off the digest during its first render releases digest-only claims if no delivery started', async () => {
    setMailPolicy(false, true);
    expiryFindMany.mockResolvedValue([candidateFixture()]);
    vi.mocked(buildExpiryDigestEmail).mockImplementationOnce(async () => {
      setMailPolicy(false, false);
      return { subject: 'digest', text: 'digest', html: '<p>digest</p>' };
    });
    sentAlertDeleteManyMock.mockResolvedValue({ count: 1 });
    expect(await runExpiryAlertsJob()).toMatchObject({ status: 'settings_changed', alertsCreated: 0, digestEmailsSent: 0 });
    expect(sendMock).not.toHaveBeenCalled();
    expect(sentAlertDeleteManyMock).toHaveBeenCalledWith({ where: { id: { in: [expect.any(String)] } } });
  });

  it('removes a renewed item before the first digest handoff and never sends an empty digest', async () => {
    setMailPolicy(false, true);
    expiryFindMany.mockResolvedValue([candidateFixture()]);
    vi.mocked(buildExpiryDigestEmail).mockImplementationOnce(async () => {
      vi.mocked(prisma.sentAlert.findMany).mockResolvedValue([]);
      return { subject: 'digest', text: 'old date', html: '<p>old date</p>' };
    });
    expect(await runExpiryAlertsJob()).toMatchObject({ holderEmailsSent: 0, digestEmailsSent: 0 });
    expect(sendMock).not.toHaveBeenCalled();
    expect(prisma.sentAlert.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [expect.any(String)] } }) }));
  });

  // --- Candidate query horizon --------------------------------------------

  it('queries with a horizon of today + max(EXPIRY_ALERT_THRESHOLDS) = 60 days, never a second hardcoded 60', async () => {
    expiryFindMany.mockResolvedValue([]);

    await runExpiryAlertsJob();

    const call = expiryFindManyMock.mock.calls[0]?.[0] as { where: { OR: { expiresAt: { lte: Date } }[] } };
    expect(call.where.OR[0]?.expiresAt.lte.getTime()).toBe(addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), 60).getTime());
  });

  it('reaches the next expiry threshold just after Rome midnight while UTC is still yesterday', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-31T22:30:00.000Z'));
      expiryFindMany.mockResolvedValue([]);
      await runExpiryAlertsJob();
      const call = expiryFindManyMock.mock.calls[0]?.[0] as { where: { OR: { expiresAt: { lte: Date } }[] } };
      expect(call.where.OR[0]?.expiresAt.lte.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  // --- Normal cadence: one threshold due at a time ------------------------

  describe('normal cadence (one threshold newly due per run)', () => {
    it('daysLeft 60, nothing consumed yet -> ONE holder email, threshold 60 consumed', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), 60), sentAlerts: [] })]);

      const result = await runExpiryAlertsJob();

      expect(sentAlertCreateManyMock).toHaveBeenCalledWith({ data: [{ id: expect.any(String), expiryId: 'exp_1', threshold: 60 }] });
      expect(sendMock).toHaveBeenCalledTimes(2); // holder + digest (admin)
      expect(sendMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ html: '<p>Alert text</p>' }));
      expect(sendMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ html: '<p>Digest text</p>' }));
      expect(result).toMatchObject({ candidates: 1, alertsCreated: 1, holderEmailsSent: 1, holdersWithoutEmail: 0, digestEmailsSent: 1 });
    });

    it('daysLeft 30, threshold 60 already consumed -> a SECOND holder email, only threshold 30 consumed this time', async () => {
      expiryFindMany.mockResolvedValue([
        candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), 30), sentAlerts: [{ threshold: 60 }] }),
      ]);

      const result = await runExpiryAlertsJob();

      expect(sentAlertCreateManyMock).toHaveBeenCalledWith({ data: [{ id: expect.any(String), expiryId: 'exp_1', threshold: 30 }] });
      expect(result.alertsCreated).toBe(1);
      expect(result.holderEmailsSent).toBe(1);
    });
  });

  // --- Catch-up: several due-but-unconsumed thresholds at once -----------

  describe('catch-up (several thresholds newly due at once -> ONE email, all consumed together)', () => {
    it('daysLeft 5, nothing consumed -> ONE holder email, thresholds 60/30/7 all consumed (not 0 — 5 <= 0 is false)', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), 5), sentAlerts: [] })]);

      const result = await runExpiryAlertsJob();

      expect(sentAlertCreateManyMock).toHaveBeenCalledWith({
        data: [
          { id: expect.any(String), expiryId: 'exp_1', threshold: 60 },
          { id: expect.any(String), expiryId: 'exp_1', threshold: 30 },
          { id: expect.any(String), expiryId: 'exp_1', threshold: 7 },
        ],
      });
      expect(result.alertsCreated).toBe(3);
      expect(result.holderEmailsSent).toBe(1); // ONE email, not three
    });

    it('daysLeft -3 (already expired, e.g. registered late) -> ONE holder email, ALL FOUR thresholds consumed', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), -3), sentAlerts: [] })]);

      const result = await runExpiryAlertsJob();

      expect(sentAlertCreateManyMock).toHaveBeenCalledWith({
        data: [
          { id: expect.any(String), expiryId: 'exp_1', threshold: 60 },
          { id: expect.any(String), expiryId: 'exp_1', threshold: 30 },
          { id: expect.any(String), expiryId: 'exp_1', threshold: 7 },
          { id: expect.any(String), expiryId: 'exp_1', threshold: 0 },
        ],
      });
      expect(result.alertsCreated).toBe(4);
      expect(result.holderEmailsSent).toBe(1);
      expect(buildExpiryAlertEmail).toHaveBeenCalledWith('it', expect.objectContaining({ daysLeft: -3 }));
    });
  });

  // --- Idempotence (AC 2) --------------------------------------------------

  describe('idempotence (AC 2)', () => {
    it('every due threshold already consumed -> zero emails, zero SentAlert writes', async () => {
      expiryFindMany.mockResolvedValue([
        candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), 5), sentAlerts: [{ threshold: 60 }, { threshold: 30 }, { threshold: 7 }] }),
      ]);

      const result = await runExpiryAlertsJob();

      expect(sentAlertCreateManyMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ candidates: 1, alertsCreated: 0, holderEmailsSent: 0, digestEmailsSent: 0 });
    });

    it('a second identical run (all thresholds already consumed from the first) -> zero new alerts, zero new emails', async () => {
      const consumed = candidateFixture({
        expiresAt: addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), 0),
        sentAlerts: [{ threshold: 60 }, { threshold: 30 }, { threshold: 7 }, { threshold: 0 }],
      });
      expiryFindMany.mockResolvedValue([consumed]);

      const first = await runExpiryAlertsJob();
      const second = await runExpiryAlertsJob();

      expect(first.alertsCreated).toBe(0);
      expect(second.alertsCreated).toBe(0);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('P2002 on createMany (a concurrent run already claimed it) -> skip silently, no email, no throw', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), 60), sentAlerts: [] })]);
      sentAlertCreateMany.mockRejectedValueOnce(prismaError('P2002'));

      await expect(runExpiryAlertsJob()).resolves.toMatchObject({ alertsCreated: 0, holderEmailsSent: 0 });
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('a non-P2002 error from createMany propagates (not swallowed)', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), 60), sentAlerts: [] })]);
      sentAlertCreateMany.mockRejectedValueOnce(new Error('connection lost'));

      await expect(runExpiryAlertsJob()).rejects.toThrow('connection lost');
    });
  });

  it('skips a selected cycle when the locked expiry date has changed before claim', async () => {
    expiryFindMany.mockResolvedValue([candidateFixture()]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ expiresAt: addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), 50) }]);
    const result = await runExpiryAlertsJob();
    expect(result).toMatchObject({ candidates: 1, alertsCreated: 0, holderEmailsSent: 0, digestEmailsSent: 0 });
    expect(sentAlertCreateManyMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('skips the holder and digest if renewal invalidates a claim during rendering', async () => {
    expiryFindMany.mockResolvedValue([candidateFixture()]);
    vi.mocked(prisma.sentAlert.findFirst).mockResolvedValueOnce(null);
    const result = await runExpiryAlertsJob();
    expect(buildExpiryAlertEmail).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ alertsCreated: 0, holderEmailsSent: 0, digestEmailsSent: 0 });
    expect(sendMock).not.toHaveBeenCalled();
    const claims = sentAlertCreateManyMock.mock.calls[0]?.[0]?.data as { id: string }[];
    expect(sentAlertDeleteManyMock).toHaveBeenCalledWith({ where: { id: { in: claims.map((row) => row.id) } } });
  });

  // --- Titolare without an email ------------------------------------------

  it('titolare has no Person.email -> thresholds still consumed, zero holder emails, flagged in the digest', async () => {
    expiryFindMany.mockResolvedValue([
      candidateFixture({ person: { id: 'person_2', firstName: 'Anna', lastName: 'Verdi', email: null }, sentAlerts: [] }),
    ]);

    const result = await runExpiryAlertsJob();

    expect(result.alertsCreated).toBe(1);
    expect(result.holderEmailsSent).toBe(0);
    expect(result.holdersWithoutEmail).toBe(1);
    expect(buildExpiryAlertEmail).not.toHaveBeenCalled();
    expect(buildExpiryDigestEmail).toHaveBeenCalledWith(
      'it',
      expect.objectContaining({ items: [expect.objectContaining({ personName: 'Anna Verdi', holderStatus: 'NO_EMAIL' })] }),
    );
  });

  it('SMTP failure releases thresholds, is NOT counted in holdersWithoutEmail, and flags SEND_FAILED in digest', async () => {
    expiryFindMany.mockResolvedValue([
      candidateFixture({ person: { id: 'person_3', firstName: 'Luca', lastName: 'Neri', email: 'luca@example.com' }, sentAlerts: [] }),
    ]);
    sendMock.mockRejectedValueOnce(new Error('smtp down'));

    const result = await runExpiryAlertsJob();

    expect(result.alertsCreated).toBe(0);
    const claims = sentAlertCreateManyMock.mock.calls[0]?.[0]?.data as { id: string }[];
    expect(sentAlertDeleteManyMock).toHaveBeenCalledWith({ where: { id: { in: claims.map((claim) => claim.id) } } });
    expect(result.holderEmailsSent).toBe(0);
    // NOT the no-email counter — the semantics stay reserved for a truly
    // missing `Person.email` (TD-1, AC 2: the story's binding decision).
    expect(result.holdersWithoutEmail).toBe(0);
    expect(buildExpiryDigestEmail).toHaveBeenCalledWith(
      'it',
      expect.objectContaining({ items: [expect.objectContaining({ personName: 'Luca Neri', holderStatus: 'SEND_FAILED' })] }),
    );
  });

  // --- Recipient locale ------------------------------------------------

  describe('recipient locale (AD-7 — the RECIPIENT locale, not the actor)', () => {
    it('holder with a linked User whose locale is "en" -> the alert is built in English', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ sentAlerts: [] })]);
      userFindMany.mockResolvedValue([{ personId: 'person_1', locale: 'en' }]);

      await runExpiryAlertsJob();

      expect(buildExpiryAlertEmail).toHaveBeenCalledWith('en', expect.anything());
    });

    it('holder with no linked User -> falls back to Italian (same rule as sendNegativeBalanceAlert, 3.3)', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ sentAlerts: [] })]);
      userFindMany.mockResolvedValue([]);

      await runExpiryAlertsJob();

      expect(buildExpiryAlertEmail).toHaveBeenCalledWith('it', expect.anything());
    });
  });

  // --- Admin digest ---------------------------------------------------

  describe('admin digest', () => {
    it('one digest email per active admin user, each in their OWN locale', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ sentAlerts: [] })]);
      userFindMany.mockResolvedValue([adminUserFixture({ email: 'admin-it@airmanager.local', locale: 'it' }), adminUserFixture({ email: 'admin-en@airmanager.local', locale: 'en' })]);

      const result = await runExpiryAlertsJob();

      expect(result.digestEmailsSent).toBe(2);
      expect(buildExpiryDigestEmail).toHaveBeenCalledWith('it', expect.anything());
      expect(buildExpiryDigestEmail).toHaveBeenCalledWith('en', expect.anything());
    });

    it('queries only ACTIVE admin users (inactive excluded at the query)', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ sentAlerts: [] })]);

      await runExpiryAlertsJob();

      expect(userFindManyMock).toHaveBeenCalledWith({
        where: { isActive: true, roles: { has: 'ADMIN' } },
        select: { email: true, locale: true },
      });
    });

    it('run consumes ZERO alerts -> NO digest to anyone (this is what makes AC 2 true end-to-end)', async () => {
      expiryFindMany.mockResolvedValue([
        candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtcInZone(APP_TIMEZONE), 5), sentAlerts: [{ threshold: 60 }, { threshold: 30 }, { threshold: 7 }] }),
      ]);

      const result = await runExpiryAlertsJob();

      expect(result.digestEmailsSent).toBe(0);
      expect(userFindManyMock).not.toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, roles: { has: 'ADMIN' } } }));
      expect(buildExpiryDigestEmail).not.toHaveBeenCalled();
    });

    it('a send failure for ONE admin recipient does not block the others, and is counted correctly', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ sentAlerts: [] })]);
      userFindMany.mockResolvedValue([adminUserFixture({ email: 'fails@airmanager.local' }), adminUserFixture({ email: 'ok@airmanager.local' })]);
      sendMock.mockImplementation((message: { to: string }) => {
        if (message.to === 'fails@airmanager.local') {
          return Promise.reject(new Error('SMTP down'));
        }
        return Promise.resolve();
      });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await runExpiryAlertsJob();

      expect(result.digestEmailsSent).toBe(1);
      consoleErrorSpy.mockRestore();
    });

    it('a holder-email send failure does not throw and is not counted, but the job still succeeds', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ sentAlerts: [] })]);
      sendMock.mockImplementation((message: { to: string }) => {
        if (message.to === 'mario@example.com') {
          return Promise.reject(new Error('SMTP down'));
        }
        return Promise.resolve();
      });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await runExpiryAlertsJob();

      expect(result.alertsCreated).toBe(0);
      expect(result.holderEmailsSent).toBe(0);
      consoleErrorSpy.mockRestore();
    });
  });
});
