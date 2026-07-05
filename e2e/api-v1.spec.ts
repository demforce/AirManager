import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/api-v1.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example) — migrate + seed the DB first.');
}

async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

test.describe('Shared API infrastructure (Story 1.5)', () => {
  test('GET /api/v1/openapi.json is public and returns a valid OpenAPI 3.x document (AC 1)', async ({ request }) => {
    // No login: the spec exposes only contracts, never data (Dev Notes).
    const response = await request.get('/api/v1/openapi.json');
    expect(response.status()).toBe(200);

    const spec = await response.json();
    expect(typeof spec.openapi).toBe('string');
    expect(spec.openapi.startsWith('3.')).toBe(true);

    const paths = Object.keys(spec.paths ?? {});
    for (const expectedPath of [
      '/api/v1/health',
      '/api/v1/me',
      '/api/v1/users',
      '/api/v1/users/{id}',
      '/api/v1/users/{id}/resend-invite',
      '/api/v1/auth/set-password',
      '/api/v1/auth/forgot-password',
    ]) {
      expect(paths).toContain(expectedPath);
    }

    // Security scheme for the session cookie is documented (Task 2).
    expect(spec.components?.securitySchemes?.cookieAuth).toBeDefined();
  });

  test('POST /api/v1/users with an invalid body answers the AD-8 422 envelope (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const response = await page.request.post('/api/v1/users', {
      data: { email: 'not-an-email', roles: [] },
    });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeDefined();
  });

  test('an unauthenticated /api/v1/* request still gets the AD-8 401 envelope through the shared wrapper', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/users');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  test('GET /api/v1/users returns dates as ISO 8601 UTC (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const response = await page.request.get('/api/v1/users');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body).toMatchObject({ page: 1, pageSize: 20 });
    expect(typeof body.total).toBe('number');
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      // ISO 8601 UTC, e.g. 2026-07-04T18:12:00.000Z
      expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });
});
