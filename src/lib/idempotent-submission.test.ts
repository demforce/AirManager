import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdempotentSubmitter } from './idempotent-submission';

const path = '/api/v1/people/42/membership-fee';
const body = { amountCents: 3500 };
const json = (status: number, code?: string) => Response.json(code ? { error: { code } } : { balanceCents: 5000 }, { status });

describe('idempotent submissions', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  const fetcher = vi.fn<typeof fetch>();
  const headers = () => fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'));
  const start = (actor = 'admin-a') => createIdempotentSubmitter(actor, storage, fetcher);

  beforeEach(() => {
    store.clear();
    fetcher.mockReset();
  });

  it('reuses the exact attempt across network failure, mount and pending, then retires it on success', async () => {
    fetcher.mockRejectedValueOnce(new TypeError('dropped'))
      .mockResolvedValueOnce(json(409, 'IDEMPOTENCY_IN_PROGRESS'))
      .mockResolvedValueOnce(json(200))
      .mockResolvedValueOnce(json(200));
    await expect(start()(path, body)).rejects.toMatchObject({ reason: 'uncertain' });
    await expect(start()(path, body)).rejects.toMatchObject({ reason: 'inProgress' });
    await expect(start()(path, body)).resolves.toMatchObject({ status: 200 });
    await start()(path, body);
    const [first, second, third, fourth] = headers();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect([second, third]).toEqual([first, first]);
    expect(fourth).not.toBe(first);
    expect(store.size).toBe(0);
  });

  it('keeps ordinary 409/422 errors available to the original UI and retires their keys', async () => {
    fetcher.mockResolvedValueOnce(json(409, 'CONFLICT'))
      .mockResolvedValueOnce(json(422, 'REQUIREMENTS_NOT_MET'))
      .mockResolvedValueOnce(json(200));
    const submit = start();
    await expect(submit(path, body).then((r) => r.json())).resolves.toEqual({ error: { code: 'CONFLICT' } });
    await expect(submit(path, body)).resolves.toMatchObject({ status: 422 });
    await expect(submit(path, { ...body, force: true })).resolves.toMatchObject({ status: 200 });
    expect(new Set(headers()).size).toBe(3);
  });

  it('does not forget a potentially committed write on 5xx, a lost response body or lack of auth', async () => {
    fetcher.mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockResolvedValueOnce(json(401, 'UNAUTHORIZED'))
      .mockResolvedValueOnce(json(200));
    await expect(start()(path, body)).rejects.toMatchObject({ reason: 'uncertain' });
    await expect(start()(path, body)).rejects.toMatchObject({ reason: 'uncertain' });
    await expect(start()(path, body)).resolves.toMatchObject({ status: 401 });
    await expect(start()(path, body)).resolves.toMatchObject({ status: 200 });
    expect(new Set(headers()).size).toBe(1);
  });

  it('remembers an explicitly granted force across reload without storing form data', async () => {
    fetcher.mockRejectedValueOnce(new TypeError('dropped'))
      .mockResolvedValueOnce(json(200));
    await expect(start()(path, { ...body, force: true })).rejects.toMatchObject({ reason: 'uncertain' });
    const saved = JSON.stringify([...store]);
    expect(saved).not.toContain(path);
    expect(saved).not.toContain('amountCents');
    expect(saved).not.toContain('3500');
    await expect(start()(path, body)).resolves.toMatchObject({ status: 200 });
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ ...body, force: true }));
    expect(new Set(headers()).size).toBe(1);
  });

  it('does not allow a force to replace an uncertain ordinary attempt', async () => {
    fetcher.mockRejectedValueOnce(new TypeError('dropped'));
    await expect(start()(path, body)).rejects.toMatchObject({ reason: 'uncertain' });
    await expect(start()(path, { ...body, force: true })).rejects.toMatchObject({ reason: 'inProgress' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('separates changes in payload, endpoint and actor without forgetting the original attempt', async () => {
    fetcher.mockRejectedValueOnce(new TypeError('dropped'))
      .mockImplementation(async () => json(200));
    await expect(start()(path, body)).rejects.toMatchObject({ reason: 'uncertain' });
    await start()(path, { amountCents: 4500 });
    await start()('/api/v1/people/43/membership-fee', body);
    await start('admin-b')(path, body);
    await start()(path, body);
    expect(new Set(headers().slice(0, 4)).size).toBe(4);
    expect(headers()[4]).toBe(headers()[0]);
  });

  it('still protects same-document retries if tab storage throws', async () => {
    const denied = () => { throw new Error('storage disabled'); };
    fetcher.mockRejectedValueOnce(new TypeError('dropped')).mockResolvedValueOnce(json(200));
    const submit = createIdempotentSubmitter('denied', { getItem: denied, setItem: denied, removeItem: denied }, fetcher);
    await expect(submit(path, body)).rejects.toMatchObject({ reason: 'uncertain' });
    await submit(path, body);
    expect(new Set(headers()).size).toBe(1);
  });
});
