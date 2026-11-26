import { expect, test, type Page } from '@playwright/test';
import { NAV_ITEMS } from '../src/components/shell/route-registry';
import { removeCalendarFixtures, seedBoundedCalendar, seedPickerAircraft, seedPickerStudents } from './db-fixtures';
import { todayRome } from './helpers';

async function login(page: Page, role = 'admin') {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(role + '@airmanager.local');
  await page.getByLabel('Password').fill(process.env['SEED_ADMIN_PASSWORD']!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

async function checkPicker(page: Page, id: string, domain: string, query: string) {
  const input = page.getByTestId(id);
  const path = '/api/v1/' + domain;
  const calls: string[] = [];
  const track = (request: { url(): string }) => {
    const url = new URL(request.url());
    if (url.pathname === path) calls.push(url.searchParams.get('q') ?? '');
  };
  page.on('request', track);
  try {
    await input.fill(query[0]!);
    await page.waitForTimeout(400);
    expect(calls, id).toEqual([]);
    const response = page.waitForResponse((res) => {
      const url = new URL(res.url());
      return url.pathname === path && url.searchParams.get('q') === query;
    });
    await input.fill(query);
    const matched = await response;
    expect(matched.status(), id).toBe(200);
    const body = await matched.json() as { items: unknown[]; truncated: boolean };
    expect(body.items.length, id).toBeLessThanOrEqual(20);
    const list = page.locator('#' + id + '-listbox');
    await expect(list.getByRole('option').filter({ hasNotText: /Nessun risultato/ })).toHaveCount(body.items.length);
    expect(calls, id).toEqual([query]);
    if (body.truncated) await expect(list.getByText('Altri risultati: continua a digitare')).toBeVisible();
    if (page.viewportSize()?.width === 375 && body.items.length) {
      expect((await list.getByRole('option').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await input.press('Tab');
  } finally {
    page.off('request', track);
  }
}

test('@picker-cap bounds native selects across admin navigation and bounds search results at both breakpoints', async ({ page }) => {
  test.setTimeout(240_000);
  const stamp = Date.now().toString(36);
  await seedPickerAircraft(stamp);
  await seedPickerStudents(stamp);
  await login(page);
  for (const path of ['aircraft', 'people']) {
    const count = await page.request.get('/api/v1/' + path + '?pageSize=1');
    expect(count.status()).toBe(200);
    expect((await count.json()).total).toBeGreaterThanOrEqual(51);
  }
  for (const path of ['bookings/options/aircraft', 'bookings/options/people', 'aircraft', 'people']) {
    const q = path.endsWith('aircraft') ? 'I-' : 'N1';
    const response = await page.request.get('/api/v1/' + path + '?' + new URLSearchParams({ q, pageSize: '100', picker: 'true' }));
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(20);
    expect(body.truncated).toBe(true);
  }
  const saved = await page.request.get('/api/v1/settings/membership-fee');
  expect(saved.status()).toBe(200);
  const { annualFeeCents } = await saved.json();
  const adminState = await page.context().storageState();
  try {
    expect((await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents: 5000 } })).status()).toBe(200);
    const registration = ('ZZ-' + stamp).toUpperCase();
    const plane = await page.request.post('/api/v1/aircraft', { data: { registration, type: 'Test', model: 'Archive' } });
    expect(plane.status()).toBe(201);
    const archived = await plane.json();
    expect((await page.request.post('/api/v1/aircraft/' + archived.id + '/archive')).status()).toBe(200);
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      for (const item of NAV_ITEMS.filter((item) => item.enabled && item.roles.includes('ADMIN'))) {
        const loaded = await page.goto('/it' + item.href);
        expect(loaded?.status(), item.href).toBe(200);
        const counts = await page.locator('select').evaluateAll((nodes) => nodes.map((node) => node.querySelectorAll('option').length));
        expect(Math.max(0, ...counts), item.href + ' @' + width).toBeLessThanOrEqual(50);
      }
      await page.goto('/it/dashboard/bookings');
      await page.getByTestId('new-booking-button').click();
      await checkPicker(page, 'booking-person', 'bookings/options/people', 'N1');
      await checkPicker(page, 'booking-aircraft', 'bookings/options/aircraft', 'I-');
      await checkPicker(page, 'booking-instructor', 'bookings/options/instructors', 'Ma');
      await page.goto('/it/dashboard/logbook');
      if (width === 375) await page.getByTestId('mobile-flight-filters-button').click();
      await checkPicker(page, width === 375 ? 'flight-filter-aircraft-mobile' : 'flight-filter-aircraft', 'aircraft', 'I-');
      const filter = page.getByTestId(width === 375 ? 'flight-filter-aircraft-mobile' : 'flight-filter-aircraft');
      await filter.fill(registration);
      const label = registration + ' (Archiviato)';
      await page.getByRole('listbox').getByRole('option', { name: label, exact: true }).click();
      if (width === 375) await page.getByTestId('mobile-flight-filters-apply').click();
      await expect(page).toHaveURL(new RegExp('aircraftId=' + archived.id));
      await page.reload();
      if (width === 375) await page.getByTestId('mobile-flight-filters-button').click();
      await expect(filter).toHaveValue(label);
      await page.goto('/it/dashboard/logbook');
      await page.getByTestId('logbook-new-button').click();
      await checkPicker(page, 'flight-aircraft', 'aircraft', 'I-');
      await checkPicker(page, 'flight-person', 'people', 'N1');
      await checkPicker(page, 'flight-instructor', 'people', 'Ma');
      await page.goto('/it/dashboard/billing');
      await page.getByTestId('billing-new-transaction-button').click();
      await checkPicker(page, 'transaction-person', 'people', 'N1');
      await page.goto('/it/dashboard/expiries');
      if (width === 375) {
        await page.getByTestId('export-menu-trigger').click();
        await page.getByTestId('scadenze-membership-fee-button-mobile').click();
      } else {
        await page.getByTestId('scadenze-membership-fee-button').click();
      }
      await checkPicker(page, 'membership-fee-person', 'people', 'N1');
    }
    await page.context().clearCookies();
    await login(page, 'instructor');
    await page.goto('/it/dashboard/bookings');
    await page.getByTestId('new-booking-button').click();
    await page.getByRole('button', { name: 'Per un allievo' }).click();
    await checkPicker(page, 'booking-student', 'bookings/options/students', 'N1');
  } finally {
    await page.context().clearCookies();
    await page.context().addCookies(adminState.cookies);
    expect((await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents } })).status()).toBe(200);
  }
});

test('@picker-cap returns 1000 approved bookings and declares truncation on desktop, mobile and overview', async ({ page }) => {
  test.setTimeout(120_000);
  const day = todayRome();
  await login(page);
  const ids = await seedBoundedCalendar(day);
  try {
    expect(ids.length).toBe(1001);
    const res = await page.request.get('/api/v1/bookings/calendar?' + new URLSearchParams({ from: day + 'T10:00:00Z', to: day + 'T11:00:00Z' }));
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.truncated).toBe(true);
    expect(data.items).toHaveLength(1000);
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['bookings', '']) {
        await page.goto('/it/dashboard' + (route ? '/' + route : ''));
        await expect(page.getByText('Mostrate le prime 1.000 prenotazioni.')).toBeVisible();
      }
    }
  } finally {
    await removeCalendarFixtures(ids);
  }
});
