import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const ADMIN_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!ADMIN_PASSWORD) {
  throw new Error('e2e/login.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example) — migrate + seed the DB first.');
}

test.describe('login (AC 1, 2, 3)', () => {
  test('logs in with correct credentials and reaches the dashboard', async ({ page }) => {
    await page.goto('/it/login');

    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Accedi' }).click();

    await expect(page).toHaveURL(/\/it\/dashboard$/);
    // Story 12.12: the admin/staff face is now the AirOps AdminOverview console.
    await expect(page.getByRole('heading', { name: 'Panoramica operativa' })).toBeVisible();
  });

  test('shows a generic error for wrong credentials, without revealing which field was wrong', async ({
    page,
  }) => {
    await page.goto('/it/login');

    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: 'Accedi' }).click();

    await expect(page.getByTestId('login-error')).toHaveText('Email o password non corretti.');
    await expect(page).toHaveURL(/\/it\/login$/);
  });

  test('shows the same generic error for a non-existent user', async ({ page }) => {
    await page.goto('/it/login');

    await page.getByLabel('Email').fill('nobody@airmanager.local');
    await page.getByLabel('Password').fill('whatever-password');
    await page.getByRole('button', { name: 'Accedi' }).click();

    await expect(page.getByTestId('login-error')).toHaveText('Email o password non corretti.');
  });

  test('redirects an unauthenticated request for a protected web route to the localized login page', async ({
    page,
  }) => {
    await page.goto('/it/dashboard');

    await expect(page).toHaveURL(/\/it\/login\?callbackUrl=/);
  });

  test('returns the AD-8 401 envelope for an unauthenticated protected /api/v1/* request', async ({ request }) => {
    const response = await request.get('/api/v1/flights');

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });

  test('lets an unauthenticated request through to the public /api/v1/health endpoint', async ({ request }) => {
    const response = await request.get('/api/v1/health');

    expect(response.status()).toBe(200);
  });

  test('logs out and returns to the login page, invalidating the session', async ({ page }) => {
    await page.goto('/it/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard$/);

    await page.getByRole('button', { name: 'Esci' }).click();

    await expect(page).toHaveURL(/\/it\/login$/);

    // The session cookie must actually be gone, not just a client-side redirect.
    await page.goto('/it/dashboard');
    await expect(page).toHaveURL(/\/it\/login\?callbackUrl=/);

    // TD-4 regression guard: a second full login/logout cycle in the same
    // test. The original bug (middleware re-issuing the session cookie on
    // every navigation) could win the race against a single signOut but
    // still lose it — or vice versa — across repeated cycles; the HANDOFF
    // repro needed up to 4 "Esci" clicks on a hydrated page to surface.
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard$/);

    await page.getByRole('button', { name: 'Esci' }).click();

    await expect(page).toHaveURL(/\/it\/login$/);

    await page.goto('/it/dashboard');
    await expect(page).toHaveURL(/\/it\/login\?callbackUrl=/);
  });
});

test.describe('AirOps theme toggle (story 12.1, AC 2, 6)', () => {
  test('toggles html[data-theme] instantly and persists the choice across a reload', async ({ page }) => {
    await page.goto('/it/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard$/);

    const html = page.locator('html');
    // Fresh session, no am-theme cookie yet — default is light (AC 2).
    await expect(html).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'Cambia tema' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    // Cookie-persisted (not localStorage) — the reload's SSR HTML already
    // carries data-theme="dark", no flash.
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('dark theme: <body> inherits the theme-aware --ink color, not a hardcoded light-mode literal (story 13.9 regression guard)', async ({
    page,
  }) => {
    // Story 13.9 (mechanism corrected in review F3): globals.css used to ship
    // its own unlayered `body{ color }` rule, later in the cascade than
    // airops.css's @import, beating the theme-aware `body{ color: var(--ink) }`
    // rule — every element inheriting its color from <body> (headings, card
    // titles, nav labels, ...) stayed pinned to the light-mode literal
    // #2F3437 regardless of theme, ~1.5:1 against the dark panel. (The
    // Tailwind color classes also removed from <body> were inert: Tailwind v4
    // utilities live in `@layer utilities`, which loses to unlayered CSS.)
    // Direct computed-style pin against that pre-fix literal, plus a
    // luminance floor for "clearly light".
    await page.goto('/it/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard$/);

    await page.getByRole('button', { name: 'Cambia tema' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Chromium's computed `color` can come back as `lab(...)`/`oklch(...)`
    // rather than `rgb(...)` for wide-gamut CSS colors (this app's tokens are
    // all `oklch()`) — rasterizing through a 1x1 canvas is the robust way to
    // read back plain 0-255 RGB regardless of the reported notation.
    const [r, g, b] = await page.evaluate(() => {
      const color = getComputedStyle(document.body).color;
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    });
    expect(`rgb(${r}, ${g}, ${b})`).not.toBe('rgb(47, 52, 55)');
    expect(Math.min(r, g, b)).toBeGreaterThan(200);
  });
});
