import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatePprRequestInput } from '@/lib/schemas/ppr';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    pprRequest: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const sendMock = vi.fn();
vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: sendMock })),
}));

vi.mock('@/server/adapters/mail/templates', () => ({
  buildPprReceiptEmail: vi.fn(async (locale: string) => ({ subject: `Receipt subject (${locale})`, text: 'Receipt body' })),
}));

const { prisma } = await import('@/server/db/prisma');
const { buildPprReceiptEmail } = await import('@/server/adapters/mail/templates');
const { createPprRequest, extractSubmitterIp, PPR_RATE_LIMIT_MAX } = await import('./ppr.service');
const { RateLimitError, ValidationError } = await import('./errors');

const countMock = vi.mocked(prisma.pprRequest.count);
const createMock = vi.mocked(prisma.pprRequest.create);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as `cash.service.test.ts`).
type Fixture = Record<string, unknown>;
const pprCount = countMock as unknown as { mockResolvedValue: (v: number) => void };
const pprCreate = createMock as unknown as { mockResolvedValue: (v: Fixture) => void };

function baseInput(overrides: Partial<CreatePprRequestInput> = {}): CreatePprRequestInput {
  return {
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
    phone: '+39 333 1234567',
    aircraftRegistration: 'I-ABCD',
    aircraftType: 'Cessna 172',
    origin: 'LIRN',
    destination: 'LIRU',
    eta: new Date(Date.now() + 3_600_000).toISOString(),
    personsOnBoard: 2,
    locale: 'it',
    ...overrides,
  };
}

function createdRow(input: CreatePprRequestInput) {
  return {
    id: 'ppr_1',
    status: 'PENDING',
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    aircraftRegistration: input.aircraftRegistration,
    aircraftType: input.aircraftType,
    origin: input.origin,
    destination: input.destination,
    eta: new Date(input.eta),
    etd: input.etd ? new Date(input.etd) : null,
    personsOnBoard: input.personsOnBoard,
    notes: input.notes ?? null,
    locale: input.locale,
    submitterIp: null,
  };
}

describe('ppr.service (story 8.1)', () => {
  beforeEach(() => {
    countMock.mockReset();
    createMock.mockReset();
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    vi.mocked(buildPprReceiptEmail).mockClear();
    pprCount.mockResolvedValue(0);
  });

  describe('extractSubmitterIp', () => {
    it('returns the first value of x-forwarded-for, trimmed', () => {
      expect(extractSubmitterIp('203.0.113.5, 10.0.0.1')).toBe('203.0.113.5');
      expect(extractSubmitterIp('  203.0.113.9  ')).toBe('203.0.113.9');
    });

    it('returns null when the header is absent', () => {
      expect(extractSubmitterIp(null)).toBeNull();
    });

    it('returns null when the header is present but empty', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(extractSubmitterIp('   ')).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('happy path (AC 1)', () => {
    it('creates the row with locale/IP and sends the receipt email in the form locale', async () => {
      const input = baseInput({ locale: 'en' });
      pprCreate.mockResolvedValue(createdRow(input));

      const result = await createPprRequest(input, { ip: '203.0.113.5' });

      expect(result).toEqual({ status: 'PENDING' });
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(createMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'Mario',
          lastName: 'Rossi',
          email: 'mario@example.com',
          locale: 'en',
          submitterIp: '203.0.113.5',
          eta: expect.any(Date),
          etd: null,
        }),
      });
      expect(buildPprReceiptEmail).toHaveBeenCalledWith('en', expect.objectContaining({ aircraftRegistration: 'I-ABCD' }));
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'mario@example.com', subject: 'Receipt subject (en)' }));
    });

    it('a null IP (no x-forwarded-for) skips the rate-limit query entirely and still creates the row', async () => {
      const input = baseInput();
      pprCreate.mockResolvedValue(createdRow(input));

      const result = await createPprRequest(input, { ip: null });

      expect(result).toEqual({ status: 'PENDING' });
      expect(countMock).not.toHaveBeenCalled();
      expect(createMock).toHaveBeenCalledWith({ data: expect.objectContaining({ submitterIp: null }) });
    });

    it('a failing SMTP send never fails the request (email is best-effort, row already created)', async () => {
      const input = baseInput();
      pprCreate.mockResolvedValue(createdRow(input));
      sendMock.mockRejectedValue(new Error('SMTP down'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await createPprRequest(input, { ip: '203.0.113.5' });

      expect(result).toEqual({ status: 'PENDING' });
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('honeypot (AC 2)', () => {
    it('a filled website field returns the SAME success body without creating a row, sending an email, or counting toward the rate limit', async () => {
      const input = baseInput({ website: 'https://spam.example' });

      const result = await createPprRequest(input, { ip: '203.0.113.5' });

      expect(result).toEqual({ status: 'PENDING' });
      expect(countMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('a whitespace-only website field is NOT treated as filled (proceeds normally)', async () => {
      const input = baseInput({ website: '   ' });
      pprCreate.mockResolvedValue(createdRow(input));

      await createPprRequest(input, { ip: '203.0.113.5' });

      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('runs BEFORE the rate limit: a honeypot hit short-circuits even when the caller is already at the limit', async () => {
      pprCount.mockResolvedValue(PPR_RATE_LIMIT_MAX);
      const input = baseInput({ website: 'https://spam.example' });

      const result = await createPprRequest(input, { ip: '203.0.113.5' });

      expect(result).toEqual({ status: 'PENDING' });
      expect(countMock).not.toHaveBeenCalled();
    });
  });

  describe('rate limit (AC 2)', () => {
    it('the 5th request (4 prior in the window) is allowed', async () => {
      pprCount.mockResolvedValue(PPR_RATE_LIMIT_MAX - 1);
      const input = baseInput();
      pprCreate.mockResolvedValue(createdRow(input));

      await expect(createPprRequest(input, { ip: '203.0.113.5' })).resolves.toEqual({ status: 'PENDING' });
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('the 6th request (5 prior in the window) is rejected with a 429 RateLimitError, no row created', async () => {
      pprCount.mockResolvedValue(PPR_RATE_LIMIT_MAX);
      const input = baseInput();

      await expect(createPprRequest(input, { ip: '203.0.113.5' })).rejects.toBeInstanceOf(RateLimitError);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('queries only rows from the same IP within the rolling 1-hour window', async () => {
      const input = baseInput();
      pprCreate.mockResolvedValue(createdRow(input));

      await createPprRequest(input, { ip: '203.0.113.5' });

      expect(countMock).toHaveBeenCalledWith({
        where: { submitterIp: '203.0.113.5', createdAt: { gt: expect.any(Date) } },
      });
    });
  });

  describe('domain validation (AD-8 stable codes)', () => {
    it('eta in the past -> 422 ETA_IN_PAST, no row created', async () => {
      const input = baseInput({ eta: new Date(Date.now() - 60_000).toISOString() });

      await expect(createPprRequest(input, { ip: '203.0.113.5' })).rejects.toMatchObject({
        code: 'ETA_IN_PAST',
      });
      expect(createMock).not.toHaveBeenCalled();
    });

    it('etd present and equal to eta (boundary) -> 422 ETD_NOT_AFTER_ETA', async () => {
      const eta = new Date(Date.now() + 3_600_000).toISOString();
      const input = baseInput({ eta, etd: eta });

      await expect(createPprRequest(input, { ip: '203.0.113.5' })).rejects.toMatchObject({
        code: 'ETD_NOT_AFTER_ETA',
      });
      expect(createMock).not.toHaveBeenCalled();
    });

    it('etd before eta -> 422 ETD_NOT_AFTER_ETA', async () => {
      const eta = new Date(Date.now() + 3_600_000).toISOString();
      const etd = new Date(Date.now() + 1_800_000).toISOString();
      const input = baseInput({ eta, etd });

      await expect(createPprRequest(input, { ip: '203.0.113.5' })).rejects.toBeInstanceOf(ValidationError);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('etd strictly after eta is accepted', async () => {
      const eta = new Date(Date.now() + 3_600_000).toISOString();
      const etd = new Date(Date.now() + 7_200_000).toISOString();
      const input = baseInput({ eta, etd });
      pprCreate.mockResolvedValue(createdRow(input));

      await expect(createPprRequest(input, { ip: '203.0.113.5' })).resolves.toEqual({ status: 'PENDING' });
    });
  });
});
