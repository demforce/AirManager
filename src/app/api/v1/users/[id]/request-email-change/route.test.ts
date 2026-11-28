import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({ env: { APP_URL: 'http://localhost:3000' } }));
vi.mock('@/server/db/prisma', () => ({ prisma: {} }));
vi.mock('@/server/auth/session', () => ({ getSessionActor: vi.fn() }));
vi.mock('@/server/services/account-email-change', () => ({ requestAddressChange: vi.fn() }));

const { getSessionActor } = await import('@/server/auth/session');
const { requestAddressChange } = await import('@/server/services/account-email-change');
const { POST } = await import('./route');

const actor = { userId: 'fixture', roles: ['ADMIN'] as ['ADMIN'], email: null, personId: null };
const origin = 'http://localhost:3000';
function submit(body: string, site = origin) {
  const request = new NextRequest(origin + '/api/v1/users/fixture/request-email-change', {
    method: 'POST', headers: { origin: site }, body,
  });
  return POST(request, { params: Promise.resolve({ id: actor.userId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionActor).mockResolvedValue(actor);
  vi.mocked(requestAddressChange).mockResolvedValue({ ok: true });
});

it('accepts an empty body stream from the configured origin', async () => {
  expect((await submit('')).status).toBe(200);
  expect(requestAddressChange).toHaveBeenCalledWith(actor, actor.userId, undefined);
});

it('rejects premature input and a different origin before issuing anything', async () => {
  expect((await submit('{"email":"candidate@example.invalid"}')).status).toBe(422);
  expect((await submit('', 'http://127.0.0.1:3000')).status).toBe(403);
  expect(requestAddressChange).not.toHaveBeenCalled();
});
