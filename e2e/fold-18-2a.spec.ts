import { expect, test, type Page } from '@playwright/test';
import { addDaysIso, todayRome } from './helpers';

const PASSWORD = process.env['SEED_ADMIN_PASSWORD'];
if (!PASSWORD) throw new Error('fold-18-2a.spec.ts requires the local synthetic seed password');

async function login(page: Page, email = 'admin@airmanager.local'): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

test('18.2a: filtered chips count the cumulative rows a unique person will see', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const marker = `Fold182a${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName: 'Fold', lastName: marker } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: marker, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  // Reuse the seeded catalogue. Creating five global types here made the
  // later picker-cap project exceed its 50-option native-select budget.
  const catalogueResponse = await page.request.get('/api/v1/expiry-types');
  expect(catalogueResponse.status()).toBe(200);
  const catalogue = (await catalogueResponse.json()) as Array<{ id: string; kind: string; scope: string }>;
  const types = catalogue.filter((type) => type.kind !== 'MEMBERSHIP' && (type.scope === 'ALL' || type.scope === 'PILOTS')).slice(0, 5);
  expect(types).toHaveLength(5);
  for (const [index, days] of [-3, 3, 15, 45, 90].entries()) {
    const expiryResponse = await page.request.post('/api/v1/expiries', {
      data: { personId: person.id, expiryTypeId: types[index]!.id, expiresAt: addDaysIso(todayRome(), days) },
    });
    expect(expiryResponse.status()).toBe(201);
  }

  await page.goto(`/it/dashboard/expiries?window=all&personQuery=${encodeURIComponent(marker)}`);
  for (const [window, count] of [['expired', 1], ['7', 2], ['30', 3], ['60', 4], ['all', 5]] as const) {
    const chip = page.getByTestId(`mobile-scadenze-window-chip-${window}`);
    await expect(chip.locator('.mobile-window-count')).toHaveText(String(count));
    await chip.click();
    if (window === '60') await expect(page).not.toHaveURL(/window=/);
    else await expect(page).toHaveURL(new RegExp(`window=${window}`));
    await expect(page.locator('[data-testid="mobile-scadenze-list"] > .mobile-row')).toHaveCount(count);
  }
  await expect(page.getByTestId('scadenze-stat-expired')).toBeHidden();
  await expect(page.getByTestId('export-menu-trigger')).toContainText('Altre azioni');
  await page.getByTestId('export-menu-trigger').click();
  await expect(page.getByRole('dialog', { name: 'Altre azioni' })).toBeVisible();
  await expect(page.getByTestId('scadenze-membership-fee-button-mobile')).toBeVisible();
});

test('18.2a: mobile fold and desktop page-head geometry in both locales and themes', async ({ page }) => {
  await login(page);
  const routes = [
    ['expiries', '[data-testid="mobile-scadenze-list"]', 320],
    ['billing', '[data-testid="mobile-billing-list"]', 350],
    ['logbook', '[data-testid="mobile-flights-list"]', 350],
    ['fleet', '[data-testid="mobile-fleet-grid"]', 324.44],
    ['pilots', '[data-testid="mobile-pilots-list"]', 324.44],
    ['instructors', '[data-testid="mobile-instructors-list"]', 388.25],
  ] as const;
  for (const locale of ['it', 'en']) {
    for (const [route, selector, limit] of routes) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/${locale}/dashboard/${route}`);
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
        const top = await page.locator(selector).evaluate((node) => node.getBoundingClientRect().top + scrollY);
        expect(top, `${locale}/${theme}/${route}`).toBeLessThanOrEqual(limit);
        const title = page.locator('main.page h1.fold-duplicate-title');
        await expect(title).toHaveCount(1);
        expect(await title.evaluate((node) => node.getBoundingClientRect().width)).toBe(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      }
      await page.setViewportSize({ width: 320, height: 568 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${locale}/${route} @320`).toBeLessThanOrEqual(0);
      await page.setViewportSize({ width: 1280, height: 812 });
      const rect = await page.locator('.page-head').evaluate((node) => {
        const box = node.getBoundingClientRect();
        return [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 100) / 100);
      });
      expect(rect, `${locale}/${route} desktop box`).toEqual([260, 85.84, 992, 51.44]);
    }
    for (const route of ['', 'bookings']) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/${locale}/dashboard${route ? `/${route}` : ''}`);
      const after = await page.locator('.page-head + *').evaluate((node) => node.getBoundingClientRect().top + scrollY);
      const before = await page.evaluate(() => {
        const title = document.querySelector('main.page h1.fold-duplicate-title');
        title?.classList.remove('fold-duplicate-title');
        const node = document.querySelector('.page-head + *');
        const top = node ? node.getBoundingClientRect().top + scrollY : null;
        title?.classList.add('fold-duplicate-title');
        return top;
      });
      expect(before, `${locale}/${route || 'overview'} baseline`).not.toBeNull();
      expect(after, `${locale}/${route || 'overview'} no regression`).toBeLessThanOrEqual(before!);
      await page.setViewportSize({ width: 320, height: 568 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await page.setViewportSize({ width: 1280, height: 812 });
      const box = await page.locator('.page-head').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height].map((n) => Math.round(n * 100) / 100);
      });
      expect(box, `${locale}/${route || 'overview'} desktop box`).toEqual([260, 85.84, 992, 51.44]);
    }
  }
});

test('18.2a: pilot and student keep their distinct mobile headings and read-only logbook', async ({ page }) => {
  for (const email of ['pilot@airmanager.local', 'student@airmanager.local']) {
    await page.context().clearCookies();
    await login(page, email);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/it/dashboard');
    expect(await page.locator('main.page h1').evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(1);
    await page.goto('/it/dashboard/expiries');
    expect(await page.locator('main.page h1').evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(1);
    await page.goto('/it/dashboard/logbook');
    await expect(page.locator('main.page h1.fold-duplicate-title')).toHaveCount(1);
    expect(await page.locator('main.page h1').evaluate((node) => node.getBoundingClientRect().width)).toBe(1);
    await expect(page.getByTestId('logbook-new-button')).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 568 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  }
});
