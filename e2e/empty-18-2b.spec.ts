import { expect, test } from '@playwright/test';
import { login, privateActor, PRIVATE_PASSWORD } from './booking-actors';

test('18.2b: filtered admin registries explain no results and clear the filters, desktop remains fixed', async ({ page }) => {
  await login(page, 'admin@airmanager.local');
  const marker = `NoMatch182b${Date.now()}`;
  for (const locale of ['it', 'en']) {
    for (const route of ['fleet', 'pilots', 'logbook', 'billing', 'expiries']) {
      const query = route === 'expiries' ? `personQuery=${marker}` : route === 'logbook' || route === 'billing' ? `personQuery=${marker}` : `q=${marker}`;
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/${locale}/dashboard/${route}?${query}`);
      const id = ({ fleet: 'fleet', pilots: 'pilots', logbook: 'flights', billing: 'billing', expiries: 'scadenze' } as const)[route as 'fleet' | 'pilots' | 'logbook' | 'billing' | 'expiries'];
      await expect(page.getByTestId(`mobile-${id}-empty`)).toContainText(locale === 'it' ? 'Nessun risultato con questi filtri' : 'No results with these filters');
      await page.getByTestId(`mobile-${id}-clear-filters`).click();
      await expect(page).not.toHaveURL(new RegExp(marker));
      await expect(page.locator('.page-head')).toBeVisible();
      await page.setViewportSize({ width: 320, height: 568 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${locale}/${route} @320`).toBeLessThanOrEqual(0);
      await page.setViewportSize({ width: 1280, height: 812 });
      const box = await page.locator('.page-head').evaluate((node) => {
        // After resizing the filtered mobile page, Chromium can retain 6px of document scroll.
        window.scrollTo(0, 0);
        const rect = node.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100);
      });
      expect(box, `${locale}/${route} desktop`).toEqual([260, 85.84, 992, 51.44]);
    }
  }
  const registration = `I-E${Date.now().toString(36).toUpperCase()}`;
  const aircraft = await page.request.post('/api/v1/aircraft', { data: { registration, type: 'Ultraleggero 3 assi', model: 'Empty state' } });
  expect(aircraft.status()).toBe(201);
  const aircraftId = ((await aircraft.json()) as { id: string }).id;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/it/dashboard/bookings?date=2031-03-11&aircraft=${aircraftId}`);
  await expect(page.getByTestId('mobile-agenda-empty')).toContainText('Nessun risultato con questi filtri');
  await expect(page.getByTestId('mobile-bookings-empty')).toContainText('Nessun risultato con questi filtri');
  await page.getByTestId('mobile-agenda-clear-filters').click();
  await expect(page).not.toHaveURL(/aircraft=/);
});

test('18.2b review: an empty unfiltered ledger keeps its create action on mobile and desktop', async ({ page }) => {
  await login(page, 'admin@airmanager.local');
  const name = `EmptyLedger182b${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const category = await page.request.post('/api/v1/cash-categories', { data: { name } });
  expect(category.status()).toBe(201);
  const categoryId = ((await category.json()) as { id: string }).id;

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/it/dashboard/billing?categoryId=${categoryId}`);
  await expect(page.getByTestId('mobile-billing-empty')).toBeVisible();
  // The shared seed contains ledger rows. Give the real empty card its unfiltered
  // presentation class in the browser, without altering the shared database or ACL.
  // This is the exact selector that hid the existing primary button in review.
  await page.locator('.card:has([data-testid="mobile-billing-empty"])').evaluate((card) => card.classList.add('mobile-empty-unfiltered'));
  await expect(page.getByTestId('billing-new-transaction-button')).toBeVisible();
  await expect(page.getByTestId('mobile-billing-filters-button')).toBeHidden();
  await page.getByTestId('billing-new-transaction-button').click();
  await expect(page.getByTestId('transaction-form')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 1280, height: 812 });
  await expect(page.getByTestId('billing-new-transaction-button')).toBeVisible();
  const box = await page.locator('.page-head').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100);
  });
  expect(box).toEqual([260, 85.84, 992, 51.44]);
});

test('18.2b: own empty Logbook action follows active profile, and student navigation names who books', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, 'admin@airmanager.local');
  const pilot = await privateActor(page, 'PILOT');
  const student = await privateActor(page, 'STUDENT');
  await page.setViewportSize({ width: 375, height: 812 });

  await page.context().clearCookies();
  await login(page, pilot.email, PRIVATE_PASSWORD);
  for (const locale of ['it', 'en']) {
    await page.goto(`/${locale}/dashboard/logbook`);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      const top = await page.getByTestId('mobile-flights-empty').evaluate((node) => node.getBoundingClientRect().top + scrollY);
      expect(top, `${locale}/${theme} empty Logbook message top`).toBeLessThanOrEqual(220);
      console.log(`18.2b empty Logbook ${locale}/${theme}: message top ${top.toFixed(2)}px`);
      await page.setViewportSize({ width: 320, height: 568 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await page.setViewportSize({ width: 375, height: 812 });
    }
  }
  await page.goto('/it/dashboard/logbook');
  await expect(page.getByTestId('mobile-flights-book-flight')).toHaveText('Prenota un volo');
  await page.getByTestId('mobile-flights-book-flight').click();
  await expect(page).toHaveURL(/\/it\/dashboard\/bookings$/);

  await page.context().clearCookies();
  await login(page, 'admin@airmanager.local');
  const deactivate = await page.request.post(`/api/v1/people/${pilot.personId}/profiles/pilot/deactivate`);
  expect(deactivate.status()).toBe(200);
  await page.context().clearCookies();
  await login(page, pilot.email, PRIVATE_PASSWORD);
  await page.goto('/it/dashboard/logbook');
  await expect(page.getByTestId('mobile-flights-book-flight')).toHaveCount(0);

  await page.context().clearCookies();
  await login(page, student.email, PRIVATE_PASSWORD);
  await page.goto('/it/dashboard/logbook');
  await expect(page.getByTestId('mobile-flights-empty')).toBeVisible();
  await expect(page.getByText('Un istruttore o un amministratore può prenotare il volo per te.')).toBeVisible();
  await expect(page.getByTestId('mobile-flights-view-schedule')).toHaveText('Vai alla Pianificazione');
  await page.getByTestId('mobile-flights-view-schedule').click();
  await expect(page).toHaveURL(/\/it\/dashboard\/bookings$/);
  await expect(page.getByTestId('new-booking-button')).toHaveCount(0);
  await expect(page.getByTestId('mobile-agenda-book-flight')).toHaveCount(0);
  await expect(page.getByTestId('schedule-section').getByRole('link', { name: 'Vai alla Pianificazione' })).toHaveCount(0);
});
