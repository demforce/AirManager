import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatePprRequestInput } from '@/lib/schemas/ppr';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    pprRequest: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    appSetting: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

const sendMock = vi.fn();
vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: sendMock })),
}));

vi.mock('@/server/adapters/mail/templates', () => ({
  buildPprReceiptEmail: vi.fn(async (locale: string) => ({ subject: `Receipt subject (${locale})`, text: 'Receipt body' })),
  buildPprApprovalEmail: vi.fn(async (locale: string) => ({ subject: `Approval subject (${locale})`, text: 'Approval body' })),
  buildPprRejectionEmail: vi.fn(async (locale: string) => ({ subject: `Rejection subject (${locale})`, text: 'Rejection body' })),
}));

const { prisma } = await import('@/server/db/prisma');
const { buildPprReceiptEmail, buildPprApprovalEmail, buildPprRejectionEmail } = await import('@/server/adapters/mail/templates');
const { createPprRequest, extractSubmitterIp, listPprRequests, approvePprRequest, rejectPprRequest, PPR_RATE_LIMIT_MAX } =
  await import('./ppr.service');
const { ConflictError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } = await import('./errors');

const countMock = vi.mocked(prisma.pprRequest.count);
const createMock = vi.mocked(prisma.pprRequest.create);
const findManyMock = vi.mocked(prisma.pprRequest.findMany);
const updateMock = vi.mocked(prisma.pprRequest.update);
const appSettingFindManyMock = vi.mocked(prisma.appSetting.findMany);
const transactionMock = vi.mocked(prisma.$transaction);
const queryRawMock = vi.mocked(prisma.$queryRaw);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as `cash.service.test.ts`).
type Fixture = Record<string, unknown>;
const pprCount = countMock as unknown as { mockResolvedValue: (v: number) => void };
const pprCreate = createMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const pprFindMany = findManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const pprUpdate = updateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const appSettingFindMany = appSettingFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };

/** Same batch/interactive `$transaction` stand-in as `bookings.service.test.ts`. */
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };
function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
}

/** Same `$queryRaw` typing workaround as `bookings.service.test.ts` (Prisma's `PrismaPromise<T>` return type is not a plain `Promise`). */
const queryRaw = queryRawMock as unknown as { mockResolvedValueOnce: (v: unknown[]) => void };

/** Queues the `SELECT ... FOR UPDATE` lock read's next result (`lockPendingPprRequest`'s first raw query). `undefined` status simulates "row not found". */
function mockLockedRow(status: string | undefined): void {
  queryRaw.mockResolvedValueOnce(status === undefined ? [] : [{ id: 'ppr_1', status }]);
}

/** Queues the `PprCounter` upsert's next result (`approvePprRequest`'s second raw query, never reached by reject). */
function mockCounterSeq(seq: number): void {
  queryRaw.mockResolvedValueOnce([{ lastSeq: seq }]);
}

function staffActor() {
  return { userId: 'staff_1', personId: null, roles: ['STAFF' as const] };
}

function pilotActor() {
  return { userId: 'pilot_1', personId: 'person_1', roles: ['PILOT' as const] };
}

function decidedRow(overrides: Fixture = {}): Fixture {
  return {
    id: 'ppr_1',
    status: 'APPROVED',
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
    phone: '+39 333 1234567',
    aircraftRegistration: 'I-ABCD',
    aircraftType: 'Cessna 172',
    origin: 'LIRN',
    destination: 'LIRU',
    eta: new Date(Date.now() + 3_600_000),
    etd: null,
    personsOnBoard: 2,
    notes: null,
    locale: 'it',
    pprNumber: 'PPR-2026-0001',
    rejectionReason: null,
    decidedAt: new Date(),
    decidedByUserId: 'staff_1',
    createdAt: new Date(),
    ...overrides,
  };
}

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

describe('ppr.service — staff approval queue (story 8.2, AC 1/2; FR-23)', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    countMock.mockReset();
    updateMock.mockReset();
    appSettingFindManyMock.mockReset();
    queryRawMock.mockReset();
    transactionMock.mockReset();
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    vi.mocked(buildPprApprovalEmail).mockClear();
    vi.mocked(buildPprRejectionEmail).mockClear();
    appSettingFindMany.mockResolvedValue([]);
    mockTransaction();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('authorize-first (AD-5)', () => {
    it('listPprRequests throws ForbiddenError before any query for an actor lacking ppr.manage', async () => {
      await expect(listPprRequests(pilotActor(), { status: 'PENDING', page: 1, pageSize: 20 })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(transactionMock).not.toHaveBeenCalled();
      expect(findManyMock).not.toHaveBeenCalled();
    });

    it('approvePprRequest throws ForbiddenError before any query for an actor lacking ppr.manage', async () => {
      await expect(approvePprRequest(pilotActor(), 'ppr_1')).rejects.toBeInstanceOf(ForbiddenError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('rejectPprRequest throws ForbiddenError before any query for an actor lacking ppr.manage', async () => {
      await expect(rejectPprRequest(pilotActor(), 'ppr_1', 'Some reason')).rejects.toBeInstanceOf(ForbiddenError);
      expect(transactionMock).not.toHaveBeenCalled();
    });
  });

  describe('listPprRequests', () => {
    it('defaults to status=PENDING, FIFO createdAt asc (tie-broken by id), and never selects submitterIp', async () => {
      pprFindMany.mockResolvedValue([]);
      const pprCountFn = countMock as unknown as { mockResolvedValue: (v: number) => void };
      pprCountFn.mockResolvedValue(0);

      await listPprRequests(staffActor(), { status: 'PENDING', page: 1, pageSize: 20 });

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      );
      const selectArg = findManyMock.mock.calls[0]?.[0]?.select as Record<string, unknown> | undefined;
      expect(selectArg).not.toHaveProperty('submitterIp');
      expect(selectArg).toMatchObject({ id: true, status: true, pprNumber: true, rejectionReason: true });
    });

    it('filters by an explicit status (e.g. APPROVED, reviewing past decisions)', async () => {
      pprFindMany.mockResolvedValue([]);
      const pprCountFn = countMock as unknown as { mockResolvedValue: (v: number) => void };
      pprCountFn.mockResolvedValue(0);

      await listPprRequests(staffActor(), { status: 'APPROVED', page: 1, pageSize: 20 });

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'APPROVED' } }));
    });
  });

  describe('approvePprRequest — 404/409 guard (Concorrenza, Dev Notes)', () => {
    it('404 NotFoundError when the id does not exist (lock finds no row)', async () => {
      mockLockedRow(undefined);

      await expect(approvePprRequest(staffActor(), 'missing')).rejects.toBeInstanceOf(NotFoundError);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('409 ConflictError with code PPR_ALREADY_DECIDED when already APPROVED, and the counter is never touched', async () => {
      mockLockedRow('APPROVED');

      const result = approvePprRequest(staffActor(), 'ppr_1');
      await expect(result).rejects.toBeInstanceOf(ConflictError);
      await expect(result).rejects.toMatchObject({ code: 'PPR_ALREADY_DECIDED' });
      // Only ONE raw query ran (the lock) — the counter upsert never fired.
      expect(queryRawMock).toHaveBeenCalledTimes(1);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('409 ConflictError with code PPR_ALREADY_DECIDED when already REJECTED', async () => {
      mockLockedRow('REJECTED');

      await expect(approvePprRequest(staffActor(), 'ppr_1')).rejects.toMatchObject({
        code: 'PPR_ALREADY_DECIDED',
      });
    });
  });

  describe('approvePprRequest — number assignment (AC 1)', () => {
    it('assigns PPR-<year>-0001 (padded to 4 digits) on the first approval of the year', async () => {
      mockLockedRow('PENDING');
      mockCounterSeq(1);
      pprUpdate.mockResolvedValue(decidedRow({ pprNumber: 'PPR-2026-0001' }));

      const result = await approvePprRequest(staffActor(), 'ppr_1');

      expect(result.pprNumber).toBe('PPR-2026-0001');
      const updateArg = updateMock.mock.calls[0]?.[0] as { data?: { pprNumber?: string; status?: string } } | undefined;
      expect(updateArg?.data?.pprNumber).toMatch(/^PPR-\d{4}-\d{4}$/);
      expect(updateArg?.data?.status).toBe('APPROVED');
    });

    it('pads a large sequence to at least 4 digits without truncating (seq=42 -> 0042)', async () => {
      mockLockedRow('PENDING');
      mockCounterSeq(42);
      pprUpdate.mockResolvedValue(decidedRow({ pprNumber: 'PPR-2026-0042' }));

      await approvePprRequest(staffActor(), 'ppr_1');

      const updateArg = updateMock.mock.calls[0]?.[0] as { data?: { pprNumber?: string } } | undefined;
      expect(updateArg?.data?.pprNumber).toBe('PPR-2026-0042');
    });

    it('uses the Europe/Rome calendar year, not UTC: 31/12 23:30Z is already 1 Jan in Rome (CET, UTC+1) -> the NEW year', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-31T23:30:00.000Z'));
      mockLockedRow('PENDING');
      mockCounterSeq(1);
      pprUpdate.mockResolvedValue(decidedRow({ pprNumber: 'PPR-2027-0001' }));

      await approvePprRequest(staffActor(), 'ppr_1');

      const updateArg = updateMock.mock.calls[0]?.[0] as { data?: { pprNumber?: string } } | undefined;
      // getUTCFullYear() at this instant would (wrongly) still say 2026.
      expect(updateArg?.data?.pprNumber).toBe('PPR-2027-0001');
    });
  });

  describe('approvePprRequest — outcome email (AC 1)', () => {
    it('sends the approval email in the requester locale, WITH the operating instructions for that locale when configured', async () => {
      mockLockedRow('PENDING');
      mockCounterSeq(1);
      pprUpdate.mockResolvedValue(decidedRow({ locale: 'it', email: 'mario@example.com', pprNumber: 'PPR-2026-0001' }));
      appSettingFindMany.mockResolvedValue([
        { key: 'ppr.operatingInstructions.it', value: 'Presentarsi in torre.' },
        { key: 'ppr.operatingInstructions.en', value: 'Report to the tower.' },
      ]);

      await approvePprRequest(staffActor(), 'ppr_1');

      expect(buildPprApprovalEmail).toHaveBeenCalledWith(
        'it',
        expect.objectContaining({ pprNumber: 'PPR-2026-0001', operatingInstructions: 'Presentarsi in torre.' }),
      );
      expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'mario@example.com' }));
    });

    it('omits the instructions section (empty string) when none are configured for that locale', async () => {
      mockLockedRow('PENDING');
      mockCounterSeq(1);
      pprUpdate.mockResolvedValue(decidedRow({ locale: 'it' }));
      appSettingFindMany.mockResolvedValue([]);

      await approvePprRequest(staffActor(), 'ppr_1');

      expect(buildPprApprovalEmail).toHaveBeenCalledWith('it', expect.objectContaining({ operatingInstructions: '' }));
    });

    it('a failed email send is logged and swallowed — the decision (already committed) still returns to the caller', async () => {
      mockLockedRow('PENDING');
      mockCounterSeq(1);
      pprUpdate.mockResolvedValue(decidedRow({ pprNumber: 'PPR-2026-0001' }));
      sendMock.mockRejectedValue(new Error('SMTP down'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await approvePprRequest(staffActor(), 'ppr_1');

      expect(result.pprNumber).toBe('PPR-2026-0001');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('rejectPprRequest (AC 2)', () => {
    it('404 NotFoundError when the id does not exist', async () => {
      mockLockedRow(undefined);

      await expect(rejectPprRequest(staffActor(), 'missing', 'Reason')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('409 ConflictError with code PPR_ALREADY_DECIDED when already decided', async () => {
      mockLockedRow('APPROVED');

      const result = rejectPprRequest(staffActor(), 'ppr_1', 'Reason');
      await expect(result).rejects.toBeInstanceOf(ConflictError);
      await expect(result).rejects.toMatchObject({ code: 'PPR_ALREADY_DECIDED' });
    });

    it('never touches the PprCounter — only ONE raw query (the lock) runs', async () => {
      mockLockedRow('PENDING');
      pprUpdate.mockResolvedValue(decidedRow({ status: 'REJECTED', pprNumber: null, rejectionReason: 'No slot available.' }));

      await rejectPprRequest(staffActor(), 'ppr_1', 'No slot available.');

      expect(queryRawMock).toHaveBeenCalledTimes(1);
      const updateArg = updateMock.mock.calls[0]?.[0] as { data?: { status?: string; pprNumber?: unknown } } | undefined;
      expect(updateArg?.data?.status).toBe('REJECTED');
      expect(updateArg?.data).not.toHaveProperty('pprNumber');
    });

    it('sends the rejection email with the reason, in the requester locale', async () => {
      mockLockedRow('PENDING');
      pprUpdate.mockResolvedValue(
        decidedRow({ status: 'REJECTED', pprNumber: null, rejectionReason: 'Missing insurance.', locale: 'en', email: 'anna@example.com' }),
      );

      await rejectPprRequest(staffActor(), 'ppr_1', 'Missing insurance.');

      expect(buildPprRejectionEmail).toHaveBeenCalledWith('en', expect.objectContaining({ reason: 'Missing insurance.' }));
      expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'anna@example.com' }));
    });

    it('a failed email send is logged and swallowed — the rejection (already committed) still returns to the caller', async () => {
      mockLockedRow('PENDING');
      pprUpdate.mockResolvedValue(decidedRow({ status: 'REJECTED', pprNumber: null, rejectionReason: 'Reason.' }));
      sendMock.mockRejectedValue(new Error('SMTP down'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await rejectPprRequest(staffActor(), 'ppr_1', 'Reason.');

      expect(result.status).toBe('REJECTED');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
