import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Story TD-2: request idempotency on money-mutating POSTs, exercised on ONE
 * representative endpoint (top-up, per the story's Test section) — the
 * wrapper (`src/lib/api/handler.ts`) is shared by all 5 covered endpoints
 * and is unit-tested exhaustively in `handler.test.ts`; this file proves the
 * two ACs that unit tests cannot: a REAL sequential replay round-trip and a
 * REAL concurrency race (lezione 6.2 — races proven with actual parallel
 * requests, never reasoned about).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/idempotency.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as accounts-topups.spec.ts. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Run-unique person name (lezione 6.3 F1: e2e assertions must stay on run-unique observables, never shared/global counters). */
function uniquePerson(prefix: string): { firstName: string; lastName: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { firstName: prefix, lastName: `Idem-${suffix}` };
}

/** Creates a person via the API and activates the pilot profile (creates the Account). Returns the person id. */
async function createPilotPerson(page: Page, person: { firstName: string; lastName: string }): Promise<string> {
  const createResponse = await page.request.post('/api/v1/people', {
    data: { firstName: person.firstName, lastName: person.lastName },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as { id: string };

  const profileResponse = await page.request.put(`/api/v1/people/${created.id}/profiles/pilot`, {
    data: { licenseNumber: 'IT-PPL-E2E', licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  return created.id;
}

/** Total TOP_UP-eligible movement count for this person's account — a fresh test person starts at 0, so `total` after N top-ups IS the execution count. */
async function movementCount(page: Page, personId: string): Promise<number> {
  const response = await page.request.get(`/api/v1/people/${personId}/account/movements`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { total: number };
  return body.total;
}

function uniqueKey(): string {
  return crypto.randomUUID();
}

test.describe('Request idempotency on money-mutating POSTs (Story TD-2)', () => {
  test('same key, sequential retry: the second POST replays the FIRST response exactly, with Idempotency-Replayed: true (AC 1), and only ONE movement is recorded', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createPilotPerson(page, uniquePerson('Sequenziale'));
    const key = uniqueKey();
    const body = { amountCents: 12345, paymentMethod: 'CASH', effectiveDate: '2026-07-01' };

    const first = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
      data: body,
      headers: { 'Idempotency-Key': key },
    });
    expect(first.status()).toBe(200);
    expect(first.headers()['idempotency-replayed']).toBeUndefined();
    const firstBody = await first.json();

    const second = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
      data: body,
      headers: { 'Idempotency-Key': key },
    });
    expect(second.status()).toBe(200);
    expect(second.headers()['idempotency-replayed']).toBe('true');
    const secondBody = await second.json();
    expect(secondBody).toEqual(firstBody);

    expect(await movementCount(page, personId)).toBe(1);
  });

  test('same key, TWO PARALLEL POSTs: exactly one movement is recorded, and the loser gets 200 (replay) or 409 IDEMPOTENCY_IN_PROGRESS — never a second execution (AC 2, real concurrency)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createPilotPerson(page, uniquePerson('Concorrente'));
    const key = uniqueKey();
    const body = { amountCents: 5000, paymentMethod: 'BANK_TRANSFER', effectiveDate: '2026-07-01' };

    const [a, b] = await Promise.all([
      page.request.post(`/api/v1/people/${personId}/account/top-ups`, { data: body, headers: { 'Idempotency-Key': key } }),
      page.request.post(`/api/v1/people/${personId}/account/top-ups`, { data: body, headers: { 'Idempotency-Key': key } }),
    ]);

    const statuses = [a.status(), b.status()].sort();
    // Exactly one of the two either succeeded outright (200, first to win the
    // insert) or got a replay of that success (200 with the replay header);
    // the other may have hit the still-PENDING window and gotten 409. Every
    // outcome combination proves the SAME thing: never two executions.
    for (const status of statuses) {
      expect([200, 409]).toContain(status);
    }

    for (const response of [a, b]) {
      if (response.status() === 409) {
        const errorBody = await response.json();
        expect(errorBody.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
      }
    }

    // The real, DB-observable proof: whatever the two HTTP responses looked
    // like, the mutation itself executed exactly once (lezione 6.2).
    expect(await movementCount(page, personId)).toBe(1);
  });

  test('different keys: each POST executes independently — two movements (AC 1 contrast case)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createPilotPerson(page, uniquePerson('ChiaviDiverse'));

    const first = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
      data: { amountCents: 1000, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
      headers: { 'Idempotency-Key': uniqueKey() },
    });
    expect(first.status()).toBe(200);

    const second = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
      data: { amountCents: 2000, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
      headers: { 'Idempotency-Key': uniqueKey() },
    });
    expect(second.status()).toBe(200);
    expect(second.headers()['idempotency-replayed']).toBeUndefined();

    expect(await movementCount(page, personId)).toBe(2);
  });

  test('no header: behavior is unaffected (AC 3, opt-in) — two identical POSTs without a key both execute, two movements', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createPilotPerson(page, uniquePerson('SenzaHeader'));
    const body = { amountCents: 777, paymentMethod: 'CASH', effectiveDate: '2026-07-01' };

    const first = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, { data: body });
    expect(first.status()).toBe(200);
    expect(first.headers()['idempotency-replayed']).toBeUndefined();

    const second = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, { data: body });
    expect(second.status()).toBe(200);
    expect(second.headers()['idempotency-replayed']).toBeUndefined();

    expect(await movementCount(page, personId)).toBe(2);
  });

  test('a failed attempt frees the key immediately: a 404 on a bad personId does not block a retry with the SAME key against a real person (AC 4)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createPilotPerson(page, uniquePerson('LiberaChiave'));
    const key = uniqueKey();

    const failed = await page.request.post(`/api/v1/people/does-not-exist/account/top-ups`, {
      data: { amountCents: 500, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
      headers: { 'Idempotency-Key': key },
    });
    expect(failed.status()).toBe(404);

    // Same key, now against a real person: NOT blocked by a stale PENDING
    // record (AC 4) — the failed attempt's record was deleted.
    const retry = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
      data: { amountCents: 500, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
      headers: { 'Idempotency-Key': key },
    });
    expect(retry.status()).toBe(200);
    expect(retry.headers()['idempotency-replayed']).toBeUndefined();

    expect(await movementCount(page, personId)).toBe(1);
  });

  test('the OpenAPI header validation rejects an over-long key with a 422 envelope, never touching `handle`', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createPilotPerson(page, uniquePerson('ChiaveTroppoLunga'));

    const response = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
      data: { amountCents: 500, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
      headers: { 'Idempotency-Key': 'x'.repeat(201) },
    });
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');

    expect(await movementCount(page, personId)).toBe(0);
  });
});
