import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayDateOnlyUtc } from '@/lib/date-only';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    expiry: {
      findMany: vi.fn(),
    },
    sentAlert: {
      createMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const sendMock = vi.fn();
vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: sendMock })),
}));

vi.mock('@/server/adapters/mail/templates', () => ({
  buildExpiryAlertEmail: vi.fn(async () => ({ subject: 'Alert subject', text: 'Alert text' })),
  buildExpiryDigestEmail: vi.fn(async () => ({ subject: 'Digest subject', text: 'Digest text' })),
}));

const { prisma } = await import('@/server/db/prisma');
const { buildExpiryAlertEmail, buildExpiryDigestEmail } = await import('@/server/adapters/mail/templates');
const { runExpiryAlertsJob } = await import('./expiry-alerts.service');

const expiryFindManyMock = vi.mocked(prisma.expiry.findMany);
const sentAlertCreateManyMock = vi.mocked(prisma.sentAlert.createMany);
const userFindUniqueMock = vi.mocked(prisma.user.findUnique);
const userFindManyMock = vi.mocked(prisma.user.findMany);

type Fixture = Record<string, unknown>;
const expiryFindMany = expiryFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const sentAlertCreateMany = sentAlertCreateManyMock as unknown as {
  mockResolvedValue: (v: { count: number }) => void;
  mockRejectedValueOnce: (v: unknown) => void;
};
const userFindUnique = userFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture | null) => void };
const userFindMany = userFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function prismaError(code: string): unknown {
  return { code };
}

function candidateFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'exp_1',
    expiresAt: addDaysUtc(todayDateOnlyUtc(), 60),
    person: { id: 'person_1', firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com' },
    expiryType: { name: 'Visita medica classe 2' },
    sentAlerts: [],
    ...overrides,
  };
}

function staffUserFixture(overrides: Partial<Fixture> = {}): Fixture {
  return { email: 'staff@airmanager.local', locale: 'it', ...overrides };
}

describe('expiry-alerts.service (story 6.3 — automatic expiry alert emails, idempotent job, FR-37, AD-9)', () => {
  beforeEach(() => {
    expiryFindManyMock.mockReset();
    sentAlertCreateManyMock.mockReset();
    userFindUniqueMock.mockReset();
    userFindManyMock.mockReset();
    sendMock.mockReset();
    vi.mocked(buildExpiryAlertEmail).mockClear();
    vi.mocked(buildExpiryDigestEmail).mockClear();

    sentAlertCreateMany.mockResolvedValue({ count: 1 });
    userFindUnique.mockResolvedValue(null);
    userFindMany.mockResolvedValue([staffUserFixture()]);
  });

  // --- Candidate query horizon --------------------------------------------

  it('queries with a horizon of today + max(EXPIRY_ALERT_THRESHOLDS) = 60 days, never a second hardcoded 60', async () => {
    expiryFindMany.mockResolvedValue([]);

    await runExpiryAlertsJob();

    const call = expiryFindManyMock.mock.calls[0]?.[0] as { where: { expiresAt: { lte: Date } } };
    expect(call.where.expiresAt.lte.getTime()).toBe(addDaysUtc(todayDateOnlyUtc(), 60).getTime());
  });

  // --- Normal cadence: one threshold due at a time ------------------------

  describe('normal cadence (one threshold newly due per run)', () => {
    it('daysLeft 60, nothing consumed yet -> ONE holder email, threshold 60 consumed', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtc(), 60), sentAlerts: [] })]);

      const result = await runExpiryAlertsJob();

      expect(sentAlertCreateManyMock).toHaveBeenCalledWith({ data: [{ expiryId: 'exp_1', threshold: 60 }] });
      expect(sendMock).toHaveBeenCalledTimes(2); // holder + digest (staff)
      expect(result).toMatchObject({ candidates: 1, alertsCreated: 1, holderEmailsSent: 1, holdersWithoutEmail: 0, digestEmailsSent: 1 });
    });

    it('daysLeft 30, threshold 60 already consumed -> a SECOND holder email, only threshold 30 consumed this time', async () => {
      expiryFindMany.mockResolvedValue([
        candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtc(), 30), sentAlerts: [{ threshold: 60 }] }),
      ]);

      const result = await runExpiryAlertsJob();

      expect(sentAlertCreateManyMock).toHaveBeenCalledWith({ data: [{ expiryId: 'exp_1', threshold: 30 }] });
      expect(result.alertsCreated).toBe(1);
      expect(result.holderEmailsSent).toBe(1);
    });
  });

  // --- Catch-up: several due-but-unconsumed thresholds at once -----------

  describe('catch-up (several thresholds newly due at once -> ONE email, all consumed together)', () => {
    it('daysLeft 5, nothing consumed -> ONE holder email, thresholds 60/30/7 all consumed (not 0 — 5 <= 0 is false)', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtc(), 5), sentAlerts: [] })]);

      const result = await runExpiryAlertsJob();

      expect(sentAlertCreateManyMock).toHaveBeenCalledWith({
        data: [
          { expiryId: 'exp_1', threshold: 60 },
          { expiryId: 'exp_1', threshold: 30 },
          { expiryId: 'exp_1', threshold: 7 },
        ],
      });
      expect(result.alertsCreated).toBe(3);
      expect(result.holderEmailsSent).toBe(1); // ONE email, not three
    });

    it('daysLeft -3 (already expired, e.g. registered late) -> ONE holder email, ALL FOUR thresholds consumed', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtc(), -3), sentAlerts: [] })]);

      const result = await runExpiryAlertsJob();

      expect(sentAlertCreateManyMock).toHaveBeenCalledWith({
        data: [
          { expiryId: 'exp_1', threshold: 60 },
          { expiryId: 'exp_1', threshold: 30 },
          { expiryId: 'exp_1', threshold: 7 },
          { expiryId: 'exp_1', threshold: 0 },
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
        candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtc(), 5), sentAlerts: [{ threshold: 60 }, { threshold: 30 }, { threshold: 7 }] }),
      ]);

      const result = await runExpiryAlertsJob();

      expect(sentAlertCreateManyMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ candidates: 1, alertsCreated: 0, holderEmailsSent: 0, digestEmailsSent: 0 });
    });

    it('a second identical run (all thresholds already consumed from the first) -> zero new alerts, zero new emails', async () => {
      const consumed = candidateFixture({
        expiresAt: addDaysUtc(todayDateOnlyUtc(), 0),
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
      expiryFindMany.mockResolvedValue([candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtc(), 60), sentAlerts: [] })]);
      sentAlertCreateMany.mockRejectedValueOnce(prismaError('P2002'));

      await expect(runExpiryAlertsJob()).resolves.toMatchObject({ alertsCreated: 0, holderEmailsSent: 0 });
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('a non-P2002 error from createMany propagates (not swallowed)', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtc(), 60), sentAlerts: [] })]);
      sentAlertCreateMany.mockRejectedValueOnce(new Error('connection lost'));

      await expect(runExpiryAlertsJob()).rejects.toThrow('connection lost');
    });
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
      expect.objectContaining({ items: [expect.objectContaining({ personName: 'Anna Verdi', holderEmailed: false })] }),
    );
  });

  // --- Recipient locale ------------------------------------------------

  describe('recipient locale (AD-7 — the RECIPIENT locale, not the actor)', () => {
    it('holder with a linked User whose locale is "en" -> the alert is built in English', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ sentAlerts: [] })]);
      userFindUnique.mockResolvedValue({ locale: 'en' });

      await runExpiryAlertsJob();

      expect(buildExpiryAlertEmail).toHaveBeenCalledWith('en', expect.anything());
    });

    it('holder with no linked User -> falls back to Italian (same rule as sendNegativeBalanceAlert, 3.3)', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ sentAlerts: [] })]);
      userFindUnique.mockResolvedValue(null);

      await runExpiryAlertsJob();

      expect(buildExpiryAlertEmail).toHaveBeenCalledWith('it', expect.anything());
    });
  });

  // --- Staff digest ---------------------------------------------------

  describe('staff digest', () => {
    it('one digest email per active admin/staff user, each in their OWN locale', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ sentAlerts: [] })]);
      userFindMany.mockResolvedValue([staffUserFixture({ email: 'admin-it@airmanager.local', locale: 'it' }), staffUserFixture({ email: 'staff-en@airmanager.local', locale: 'en' })]);

      const result = await runExpiryAlertsJob();

      expect(result.digestEmailsSent).toBe(2);
      expect(buildExpiryDigestEmail).toHaveBeenCalledWith('it', expect.anything());
      expect(buildExpiryDigestEmail).toHaveBeenCalledWith('en', expect.anything());
    });

    it('queries only ACTIVE admin/staff users (inactive excluded at the query)', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ sentAlerts: [] })]);

      await runExpiryAlertsJob();

      expect(userFindManyMock).toHaveBeenCalledWith({
        where: { isActive: true, roles: { hasSome: ['ADMIN', 'STAFF'] } },
        select: { email: true, locale: true },
      });
    });

    it('run consumes ZERO alerts -> NO digest to anyone (this is what makes AC 2 true end-to-end)', async () => {
      expiryFindMany.mockResolvedValue([
        candidateFixture({ expiresAt: addDaysUtc(todayDateOnlyUtc(), 5), sentAlerts: [{ threshold: 60 }, { threshold: 30 }, { threshold: 7 }] }),
      ]);

      const result = await runExpiryAlertsJob();

      expect(result.digestEmailsSent).toBe(0);
      expect(userFindManyMock).not.toHaveBeenCalled();
      expect(buildExpiryDigestEmail).not.toHaveBeenCalled();
    });

    it('a send failure for ONE staff recipient does not block the others, and is counted correctly', async () => {
      expiryFindMany.mockResolvedValue([candidateFixture({ sentAlerts: [] })]);
      userFindMany.mockResolvedValue([staffUserFixture({ email: 'fails@airmanager.local' }), staffUserFixture({ email: 'ok@airmanager.local' })]);
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

      expect(result.alertsCreated).toBe(1);
      expect(result.holderEmailsSent).toBe(0);
      consoleErrorSpy.mockRestore();
    });
  });
});
