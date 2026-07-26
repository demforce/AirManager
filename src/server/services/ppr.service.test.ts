import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateManualPprRequestInput, CreatePprRequestInput } from '@/lib/schemas/ppr';

// `app-settings.service.ts` (imported below, real — only its Prisma calls
// are mocked) now imports `secret-box.ts` for the SMTP password encryption
// (CWE-312 fix), which reads `AUTH_SECRET` from `@/lib/env` — same "mock
// env, don't load the real schema" convention as `auth-tokens.service.test.ts`.
vi.mock('@/lib/env', () => ({ env: { AUTH_SECRET: 'test-auth-secret-not-real-0123456789' } }));

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
    cashCategory: {
      findUnique: vi.fn(),
    },
    cashMovement: {
      create: vi.fn(),
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
const {
  createPprRequest,
  createManualPprRequest,
  extractSubmitterIp,
  listPprRequests,
  approvePprRequest,
  rejectPprRequest,
  completePprRequest,
  cancelPprRequest,
  toPprRequestDto,
  PPR_RATE_LIMIT_MAX,
  PPR_NO_IP_RATE_LIMIT_MAX,
  PPR_PER_EMAIL_RATE_LIMIT_MAX,
} = await import('./ppr.service');
const { ConflictError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } = await import('./errors');

const countMock = vi.mocked(prisma.pprRequest.count);
const createMock = vi.mocked(prisma.pprRequest.create);
const findManyMock = vi.mocked(prisma.pprRequest.findMany);
const updateMock = vi.mocked(prisma.pprRequest.update);
const appSettingFindManyMock = vi.mocked(prisma.appSetting.findMany);
const cashCategoryFindUniqueMock = vi.mocked(prisma.cashCategory.findUnique);
const cashMovementCreateMock = vi.mocked(prisma.cashMovement.create);
const transactionMock = vi.mocked(prisma.$transaction);
const queryRawMock = vi.mocked(prisma.$queryRaw);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as `cash.service.test.ts`).
type Fixture = Record<string, unknown>;
const pprCount = countMock as unknown as { mockResolvedValue: (v: number) => void };
// Queue a single count() result (for tests that need the per-IP/null-IP and
// per-email count calls to return different values in sequence).
const countOnce = (v: number): void => {
  (countMock as unknown as { mockResolvedValueOnce: (n: number) => void }).mockResolvedValueOnce(v);
};
const pprCreate = createMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const pprFindMany = findManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const pprUpdate = updateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const appSettingFindMany = appSettingFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const cashCategoryFindUnique = cashCategoryFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture | null) => void };
const cashMovementCreate = cashMovementCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };

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

    it('a null IP (no x-forwarded-for) is checked against the shared global fallback bucket (H5 fix) and still creates the row under the cap', async () => {
      const input = baseInput();
      pprCreate.mockResolvedValue(createdRow(input));

      const result = await createPprRequest(input, { ip: null });

      expect(result).toEqual({ status: 'PENDING' });
      expect(countMock).toHaveBeenCalledWith({
        where: { submitterIp: null, createdByUserId: null, createdAt: { gt: expect.any(Date) } },
      });
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

    it('runs BEFORE the global no-IP fallback too: a honeypot hit with no IP short-circuits even at that limit', async () => {
      pprCount.mockResolvedValue(PPR_NO_IP_RATE_LIMIT_MAX);
      const input = baseInput({ website: 'https://spam.example' });

      const result = await createPprRequest(input, { ip: null });

      expect(result).toEqual({ status: 'PENDING' });
      expect(countMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
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

    it('global no-IP fallback (H5 fix): a request under PPR_NO_IP_RATE_LIMIT_MAX is allowed', async () => {
      // 1st count = null-IP bucket (just under cap); 2nd = per-email cap
      // (review F3), left at the beforeEach default (0, under its limit).
      countOnce(PPR_NO_IP_RATE_LIMIT_MAX - 1);
      const input = baseInput();
      pprCreate.mockResolvedValue(createdRow(input));

      await expect(createPprRequest(input, { ip: null })).resolves.toEqual({ status: 'PENDING' });
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('per-recipient cap (review F3): the 6th request for the same email is rejected even from a fresh IP — closes the x-forwarded-for-rotation email relay', async () => {
      // 1st count = per-IP bucket (under cap, simulating a rotated fresh IP);
      // 2nd count = per-email bucket at its limit → 429, no row created.
      countOnce(0);
      countOnce(PPR_PER_EMAIL_RATE_LIMIT_MAX);
      const input = baseInput();

      await expect(createPprRequest(input, { ip: '198.51.100.9' })).rejects.toBeInstanceOf(RateLimitError);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('per-recipient cap queries public rows for the same email, case-insensitive, in the window', async () => {
      const input = baseInput();
      pprCreate.mockResolvedValue(createdRow(input));

      await createPprRequest(input, { ip: '198.51.100.9' });

      expect(countMock).toHaveBeenCalledWith({
        where: {
          email: { equals: input.email, mode: 'insensitive' },
          createdByUserId: null,
          createdAt: { gt: expect.any(Date) },
        },
      });
    });

    it('global no-IP fallback (H5 fix): a null-IP flood at PPR_NO_IP_RATE_LIMIT_MAX is rejected with a 429, no row created — closes the "omit the header" bypass', async () => {
      pprCount.mockResolvedValue(PPR_NO_IP_RATE_LIMIT_MAX);
      const input = baseInput();

      await expect(createPprRequest(input, { ip: null })).rejects.toBeInstanceOf(RateLimitError);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('global no-IP fallback queries rows with submitterIp: null AND createdByUserId: null — a staff-entered manual PPR row must not eat into the public bucket', async () => {
      const input = baseInput();
      pprCreate.mockResolvedValue(createdRow(input));

      await createPprRequest(input, { ip: null });

      expect(countMock).toHaveBeenCalledWith({
        where: { submitterIp: null, createdByUserId: null, createdAt: { gt: expect.any(Date) } },
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

    it('completePprRequest throws ForbiddenError before any query for an actor lacking ppr.manage', async () => {
      await expect(completePprRequest(pilotActor(), 'ppr_1', { landingFeeCents: 1000 })).rejects.toBeInstanceOf(ForbiddenError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('cancelPprRequest throws ForbiddenError before any query for an actor lacking ppr.manage', async () => {
      await expect(cancelPprRequest(pilotActor(), 'ppr_1')).rejects.toBeInstanceOf(ForbiddenError);
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

    it('status=ALL (the register, story 8.3 AC 2) applies no status filter at all', async () => {
      pprFindMany.mockResolvedValue([]);
      const pprCountFn = countMock as unknown as { mockResolvedValue: (v: number) => void };
      pprCountFn.mockResolvedValue(0);

      await listPprRequests(staffActor(), { status: 'ALL', page: 1, pageSize: 20 });

      const whereArg = findManyMock.mock.calls[0]?.[0]?.where as Record<string, unknown> | undefined;
      expect(whereArg).not.toHaveProperty('status');
    });

    it('from/to bound eta to a semi-open Europe/Rome day range (story 8.3 AC 2)', async () => {
      pprFindMany.mockResolvedValue([]);
      const pprCountFn = countMock as unknown as { mockResolvedValue: (v: number) => void };
      pprCountFn.mockResolvedValue(0);

      await listPprRequests(staffActor(), { status: 'ALL', page: 1, pageSize: 20, from: '2026-03-01', to: '2026-03-02' });

      const whereArg = findManyMock.mock.calls[0]?.[0]?.where as { eta?: { gte?: Date; lt?: Date } } | undefined;
      // 2026-03-01/02 are outside any DST transition — plain CET (UTC+1).
      expect(whereArg?.eta?.gte?.toISOString()).toBe('2026-02-28T23:00:00.000Z');
      // `to` is INCLUSIVE of the whole day, so the upper bound is midnight of to+1 (semi-open).
      expect(whereArg?.eta?.lt?.toISOString()).toBe('2026-03-02T23:00:00.000Z');
    });

    it('only from (no to) applies just a lower bound on eta', async () => {
      pprFindMany.mockResolvedValue([]);
      const pprCountFn = countMock as unknown as { mockResolvedValue: (v: number) => void };
      pprCountFn.mockResolvedValue(0);

      await listPprRequests(staffActor(), { status: 'ALL', page: 1, pageSize: 20, from: '2026-03-01' });

      const whereArg = findManyMock.mock.calls[0]?.[0]?.where as { eta?: { gte?: Date; lt?: Date } } | undefined;
      expect(whereArg?.eta?.gte).toBeInstanceOf(Date);
      expect(whereArg?.eta?.lt).toBeUndefined();
    });

    it('no from/to omits the eta filter entirely', async () => {
      pprFindMany.mockResolvedValue([]);
      const pprCountFn = countMock as unknown as { mockResolvedValue: (v: number) => void };
      pprCountFn.mockResolvedValue(0);

      await listPprRequests(staffActor(), { status: 'PENDING', page: 1, pageSize: 20 });

      const whereArg = findManyMock.mock.calls[0]?.[0]?.where as Record<string, unknown> | undefined;
      expect(whereArg).not.toHaveProperty('eta');
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

/**
 * PPR closure — complete/cancel (epic 8, story 8.3, AC 1/2; FR-24). Focus:
 * the lock-guard matrix (404/409 `PPR_NOT_APPROVED`, distinct from 8.2's
 * `PPR_ALREADY_DECIDED`), the fee>0-creates-exactly-one-movement /
 * fee===0-creates-none branch, and the category-by-name loud failure that
 * must never leave a `COMPLETED` request with an unrecorded fee. Real
 * cross-request transactional atomicity (two concurrent completes on the
 * SAME id; an `Idempotency-Key` replay) is beyond what a mocked
 * `prisma.$transaction` can prove — that is `e2e/ppr-register.spec.ts`'s
 * job, against a real Postgres transaction.
 */
function closedRow(overrides: Fixture = {}): Fixture {
  return {
    id: 'ppr_1',
    status: 'COMPLETED',
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
    closedAt: new Date(),
    closedByUserId: 'staff_1',
    landingFeeCents: 1000,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ppr.service — closure (story 8.3, AC 1/2; FR-24)', () => {
  beforeEach(() => {
    updateMock.mockReset();
    queryRawMock.mockReset();
    transactionMock.mockReset();
    cashCategoryFindUniqueMock.mockReset();
    cashMovementCreateMock.mockReset();
    mockTransaction();
  });

  describe('completePprRequest — lock guard (409 PPR_NOT_APPROVED, distinct from 8.2 PPR_ALREADY_DECIDED)', () => {
    it('404 NotFoundError when the id does not exist (lock finds no row)', async () => {
      mockLockedRow(undefined);

      await expect(completePprRequest(staffActor(), 'missing', { landingFeeCents: 1000 })).rejects.toBeInstanceOf(NotFoundError);
      expect(cashMovementCreateMock).not.toHaveBeenCalled();
    });

    it.each(['PENDING', 'REJECTED', 'COMPLETED', 'CANCELLED'])(
      '409 ConflictError code PPR_NOT_APPROVED when status is %s (anything but APPROVED)',
      async (status) => {
        mockLockedRow(status);

        const result = completePprRequest(staffActor(), 'ppr_1', { landingFeeCents: 1000 });
        await expect(result).rejects.toBeInstanceOf(ConflictError);
        await expect(result).rejects.toMatchObject({ code: 'PPR_NOT_APPROVED' });
        expect(updateMock).not.toHaveBeenCalled();
        expect(cashMovementCreateMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('completePprRequest — landing fee movement (AC 1)', () => {
    it('fee > 0: COMPLETED with the fee stamped, and exactly ONE cash movement with the exact expected fields', async () => {
      mockLockedRow('APPROVED');
      pprUpdate.mockResolvedValue(closedRow({ pprNumber: 'PPR-2026-0007', landingFeeCents: 2500 }));
      cashCategoryFindUnique.mockResolvedValue({ id: 'category_ppr', isActive: true });
      cashMovementCreate.mockResolvedValue({});

      const result = await completePprRequest(staffActor(), 'ppr_1', { landingFeeCents: 2500 });

      expect(result.status).toBe('COMPLETED');
      const updateArg = updateMock.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
      expect(updateArg?.data).toMatchObject({ status: 'COMPLETED', landingFeeCents: 2500, closedByUserId: 'staff_1' });
      expect(updateArg?.data?.closedAt).toBeInstanceOf(Date);

      expect(cashCategoryFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { name: 'PPR' } }));
      expect(cashMovementCreateMock).toHaveBeenCalledTimes(1);
      const movementArg = cashMovementCreateMock.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
      expect(movementArg?.data).toMatchObject({
        categoryId: 'category_ppr',
        amountCents: 2500,
        description: 'PPR PPR-2026-0007 landing fee',
        actorUserId: 'staff_1',
        pprRequestId: 'ppr_1',
      });
      expect(movementArg?.data?.effectiveDate).toBeInstanceOf(Date);
    });

    it('paymentMethod (story Billing-1, AC 2, OPTIONAL here) is set on the movement when given, null when omitted', async () => {
      mockLockedRow('APPROVED');
      pprUpdate.mockResolvedValue(closedRow({ pprNumber: 'PPR-2026-0008', landingFeeCents: 1500 }));
      cashCategoryFindUnique.mockResolvedValue({ id: 'category_ppr', isActive: true });
      cashMovementCreate.mockResolvedValue({});

      await completePprRequest(staffActor(), 'ppr_1', { landingFeeCents: 1500, paymentMethod: 'CASH' });
      const withMethodArg = cashMovementCreateMock.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
      expect(withMethodArg?.data?.['paymentMethod']).toBe('CASH');

      cashMovementCreateMock.mockClear();
      mockLockedRow('APPROVED');
      await completePprRequest(staffActor(), 'ppr_1', { landingFeeCents: 1500 });
      const withoutMethodArg = cashMovementCreateMock.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
      expect(withoutMethodArg?.data?.['paymentMethod']).toBeNull();
    });

    it('fee === 0: COMPLETED with landingFeeCents:0 stamped, but NO cash movement created (branch checked BEFORE the category lookup)', async () => {
      mockLockedRow('APPROVED');
      pprUpdate.mockResolvedValue(closedRow({ landingFeeCents: 0 }));

      const result = await completePprRequest(staffActor(), 'ppr_1', { landingFeeCents: 0 });

      expect(result.landingFeeCents).toBe(0);
      const updateArg = updateMock.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
      expect(updateArg?.data).toMatchObject({ landingFeeCents: 0 });
      expect(cashCategoryFindUniqueMock).not.toHaveBeenCalled();
      expect(cashMovementCreateMock).not.toHaveBeenCalled();
    });

    it('missing "PPR" cash category (fee > 0) fails LOUD with NotFoundError — no movement created', async () => {
      mockLockedRow('APPROVED');
      pprUpdate.mockResolvedValue(closedRow());
      cashCategoryFindUnique.mockResolvedValue(null);

      await expect(completePprRequest(staffActor(), 'ppr_1', { landingFeeCents: 1000 })).rejects.toBeInstanceOf(NotFoundError);
      expect(cashMovementCreateMock).not.toHaveBeenCalled();
    });

    it('inactive "PPR" cash category (fee > 0) fails LOUD with ConflictError — no movement created', async () => {
      mockLockedRow('APPROVED');
      pprUpdate.mockResolvedValue(closedRow());
      cashCategoryFindUnique.mockResolvedValue({ id: 'category_ppr', isActive: false });

      await expect(completePprRequest(staffActor(), 'ppr_1', { landingFeeCents: 1000 })).rejects.toBeInstanceOf(ConflictError);
      expect(cashMovementCreateMock).not.toHaveBeenCalled();
    });
  });

  describe('cancelPprRequest (AC 2)', () => {
    it('404 NotFoundError when the id does not exist', async () => {
      mockLockedRow(undefined);

      await expect(cancelPprRequest(staffActor(), 'missing')).rejects.toBeInstanceOf(NotFoundError);
    });

    it.each(['PENDING', 'REJECTED', 'COMPLETED', 'CANCELLED'])(
      '409 ConflictError code PPR_NOT_APPROVED when status is %s',
      async (status) => {
        mockLockedRow(status);

        const result = cancelPprRequest(staffActor(), 'ppr_1');
        await expect(result).rejects.toBeInstanceOf(ConflictError);
        await expect(result).rejects.toMatchObject({ code: 'PPR_NOT_APPROVED' });
      },
    );

    it('APPROVED -> CANCELLED: no fee, no reason, no cash movement (AC 2 asks for nothing more)', async () => {
      mockLockedRow('APPROVED');
      pprUpdate.mockResolvedValue(closedRow({ status: 'CANCELLED', landingFeeCents: null }));

      const result = await cancelPprRequest(staffActor(), 'ppr_1');

      expect(result.status).toBe('CANCELLED');
      const updateArg = updateMock.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
      expect(updateArg?.data).toMatchObject({ status: 'CANCELLED', closedByUserId: 'staff_1' });
      expect(updateArg?.data).not.toHaveProperty('landingFeeCents');
      expect(cashCategoryFindUniqueMock).not.toHaveBeenCalled();
      expect(cashMovementCreateMock).not.toHaveBeenCalled();
    });
  });
});

/**
 * Staff manual PPR intake (epic 12, story 12.4, AC 1) — written BEFORE
 * `createManualPprRequest` existed (TDD). Focus: no honeypot/rate-limit at
 * all (never calls `prisma.pprRequest.count`), the SAME eta/etd domain
 * validation as the public path, `email`/`phone` defaulting
 * (`?? null`/`?? ''`), and `approveImmediately` issuing a PPR number in the
 * SAME transaction WITHOUT sending any email (neither the public path's
 * receipt NOR `approvePprRequest`'s own outcome email).
 */
function manualInput(overrides: Partial<CreateManualPprRequestInput> = {}): CreateManualPprRequestInput {
  return {
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
    phone: undefined,
    aircraftRegistration: 'I-ABCD',
    aircraftType: 'Cessna 172',
    origin: 'LIRN',
    destination: 'LIRU',
    eta: new Date(Date.now() + 3_600_000).toISOString(),
    personsOnBoard: 2,
    locale: 'it',
    approveImmediately: false,
    ...overrides,
  };
}

describe('ppr.service — createManualPprRequest (epic 12, story 12.4, AC 1)', () => {
  beforeEach(() => {
    createMock.mockReset();
    updateMock.mockReset();
    countMock.mockReset();
    queryRawMock.mockReset();
    transactionMock.mockReset();
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    mockTransaction();
  });

  it('throws ForbiddenError before any query for an actor lacking ppr.manage', async () => {
    await expect(createManualPprRequest(pilotActor(), manualInput())).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('eta in the past is ACCEPTED — the staff path logs an arrival that already happened (ratified 12.4 review; the public createPprRequest still rejects it)', async () => {
    pprCreate.mockResolvedValue(createdRow(baseInput()));
    const input = manualInput({ eta: new Date(Date.now() - 60_000).toISOString() });

    await createManualPprRequest(staffActor(), input);

    expect(createMock).toHaveBeenCalled();
  });

  it('etd not after eta -> 422 ETD_NOT_AFTER_ETA, no row created', async () => {
    const eta = new Date(Date.now() + 3_600_000).toISOString();
    const input = manualInput({ eta, etd: eta });

    await expect(createManualPprRequest(staffActor(), input)).rejects.toMatchObject({ code: 'ETD_NOT_AFTER_ETA' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('never queries the rate-limit count or checks a honeypot — staff, not public (AC 1)', async () => {
    pprCreate.mockResolvedValue(createdRow(baseInput()));

    await createManualPprRequest(staffActor(), manualInput());

    expect(countMock).not.toHaveBeenCalled();
  });

  it('phone-only (email absent): stored as email=null, createdByUserId=actor, submitterIp=null, stays PENDING', async () => {
    pprCreate.mockResolvedValue(createdRow(baseInput()));

    await createManualPprRequest(staffActor(), manualInput({ email: undefined, phone: '+39 333 0000000' }));

    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: null, phone: '+39 333 0000000', createdByUserId: 'staff_1', submitterIp: null }),
      select: expect.anything(),
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('email-only (phone absent): stored as phone=""', async () => {
    pprCreate.mockResolvedValue(createdRow(baseInput()));

    await createManualPprRequest(staffActor(), manualInput({ email: 'mario@example.com', phone: undefined }));

    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'mario@example.com', phone: '' }),
      select: expect.anything(),
    });
  });

  it('never sends a receipt email, even when email is present (Dev Notes: "niente email di ricevuta")', async () => {
    pprCreate.mockResolvedValue(createdRow(baseInput()));

    await createManualPprRequest(staffActor(), manualInput({ email: 'mario@example.com' }));

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('approveImmediately (options param, not input.approveImmediately): issues a PPR number in the SAME transaction and never sends an approval email', async () => {
    pprCreate.mockResolvedValue(createdRow(baseInput()));
    mockCounterSeq(1);
    pprUpdate.mockResolvedValue(decidedRow({ pprNumber: 'PPR-2026-0001', status: 'APPROVED' }));

    const result = await createManualPprRequest(staffActor(), manualInput({ approveImmediately: false }), { approveImmediately: true });

    expect(result.status).toBe('APPROVED');
    expect(result.pprNumber).toBe('PPR-2026-0001');
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'ppr_1' },
      data: expect.objectContaining({ status: 'APPROVED', pprNumber: 'PPR-2026-0001', decidedByUserId: 'staff_1' }),
      select: expect.anything(),
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('approveImmediately omitted (default false): stays PENDING, never touches the PprCounter', async () => {
    pprCreate.mockResolvedValue(createdRow(baseInput()));

    const result = await createManualPprRequest(staffActor(), manualInput());

    expect(result.status).toBe('PENDING');
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('ppr.service — toPprRequestDto (review 12.4, F1)', () => {
  const listItem = {
    id: 'ppr_1',
    status: 'APPROVED' as const,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: null,
    phone: '+39 333 0000000',
    aircraftRegistration: 'I-ABCD',
    aircraftType: 'P2008',
    origin: 'LIML',
    destination: 'LIMB',
    eta: new Date('2026-07-20T10:00:00.000Z'),
    etd: new Date('2026-07-20T15:00:00.000Z'),
    personsOnBoard: 2,
    notes: null,
    locale: 'it',
    pprNumber: 'PPR-2026-0001',
    rejectionReason: null,
    decidedAt: new Date('2026-07-19T09:00:00.000Z'),
    decidedByUserId: 'staff_1',
    closedAt: null,
    closedByUserId: null,
    landingFeeCents: null,
    createdAt: new Date('2026-07-19T08:00:00.000Z'),
    createdByUserId: 'staff_1',
  };

  it('derives fromPublicForm and NEVER exposes createdByUserId/closedByUserId (the wire is pprRequestItemSchema, not the service item)', () => {
    const dto = toPprRequestDto(listItem);

    expect(dto.fromPublicForm).toBe(false);
    expect(dto).not.toHaveProperty('createdByUserId');
    expect(dto).not.toHaveProperty('closedByUserId');
    expect(dto.eta).toBe('2026-07-20T10:00:00.000Z');
    expect(dto.decidedByUserId).toBe('staff_1');
  });

  it('public-form row (createdByUserId null) -> fromPublicForm true', () => {
    expect(toPprRequestDto({ ...listItem, createdByUserId: null }).fromPublicForm).toBe(true);
  });
});
