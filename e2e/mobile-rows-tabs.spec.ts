import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { addDaysIso, ensureValidSeedExpiries, registerFlightOn, todayRome, waitForDashboardContent } from './helpers';
import { seedAircraftRate } from './db-fixtures';

async function login(page: Page, role = 'admin') {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(`${role}@airmanager.local`);
  await page.getByLabel('Password').fill(process.env.SEED_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

async function setTheme(page: Page, theme: string) {
  await page.context().addCookies([{ name: 'am-theme', value: theme, url: 'http://localhost:3000' }]);
}

// Exactly 20 characters in both fields, including the space in the displayed name.
async function createFixture(page: Page) {
  const unique = randomUUID().replaceAll('-', '').toUpperCase();
  const registration = `I-${unique.slice(0, 18)}`;
  const aircraft = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Synthetic 18.5a' },
  });
  expect(aircraft.status(), await aircraft.text()).toBe(201);
  const { id: aircraftId } = await aircraft.json() as { id: string };
  const firstName = 'Miriam';
  const lastName = `Monti${unique.slice(0, 8)}`;
  const person = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(person.status(), await person.text()).toBe(201);
  const { id: personId } = await person.json() as { id: string };
  const profile = await page.request.put(`/api/v1/people/${personId}/profiles/pilot`, {
    data: { licenseNumber: `IT-${unique}`, licenseType: 'PPL(A)' },
  });
  expect(profile.status(), await profile.text()).toBe(200);
  return { personId, aircraftId, registration, firstName, lastName };
}

async function measureRow(row: Locator, fixture: Awaited<ReturnType<typeof createFixture>>) {
  await expect(row).toBeVisible();
  const title = row.locator('.mobile-row-name');
  await expect(title).toContainText(fixture.lastName);
  await expect(title).toContainText(fixture.firstName);
  expect((await title.innerText()).length).toBe(20);
  expect.soft(await row.locator('.mobile-row-title').innerText()).not.toContain(fixture.registration);
  expect.soft(await row.locator('.mobile-row-sub').innerText()).toContain(fixture.registration);
  const metadata = row.locator('.mobile-row-sub');
  expect.soft(await metadata.innerText()).toMatch(/ · .+ · \d{1,2}:\d{2}/);
  expect.soft(await metadata.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const { scroll, client } = await title.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect.soft(scroll).toBeLessThanOrEqual(client);
  return [scroll, client];
}

test('18.5a — same-height single-line tab bar across roles, locales and themes', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const heights = new Map<number, number>();
  const narrow: string[] = [];
  for (const role of ['admin', 'instructor', 'pilot', 'student']) {
    const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 812 } });
    try {
      const page = await context.newPage();
      await login(page, role);
      for (const locale of ['it', 'en']) {
        const account = locale === 'it' ? ['Conto', 'Estratto conto'] : ['Statement', 'Account statement'];
        const compensation = locale === 'it' ? ['Compensi', 'I miei compensi'] : ['Payouts', 'My payouts'];
        for (const theme of ['light', 'dark']) {
          await setTheme(page, theme);
          await page.goto(`/${locale}/dashboard`);
          const bar = page.getByTestId('mobile-tab-bar');
          await expect(bar).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await page.evaluate(() => document.fonts.ready);
          for (const [id, labels] of [['myAccount', account], ['myCompensation', compensation]] as const) {
            const tab = page.getByTestId(`mobile-tab-${id}`);
            const visible = id === 'myAccount' ? role === 'pilot' || role === 'student' : role === 'instructor';
            if (!visible) {
              await expect(tab).toHaveCount(0);
            } else {
              expect.soft(await tab.locator('.mobile-tab-label').innerText()).toBe(labels[0]);
              await expect(tab).toHaveAccessibleName(labels[1]!);
            }
          }
          for (const width of [320, 360, 375, 390, 414]) {
            await page.setViewportSize({ width, height: 812 });
            const geometry = await bar.evaluate((el) => ({
              height: el.getBoundingClientRect().height,
              labels: Array.from(el.querySelectorAll<HTMLElement>('.mobile-tab-label'), (label) => {
                const range = document.createRange();
                range.selectNodeContents(label);
                const tab = label.parentElement!.getBoundingClientRect();
                const text = range.getBoundingClientRect();
                return {
                  text: label.innerText, lines: range.getClientRects().length,
                  fits: text.left >= tab.left && text.right <= tab.right,
                  font: parseFloat(getComputedStyle(label).fontSize),
                };
              }),
            }));
            expect.soft(geometry.labels).toHaveLength(5);
            if (width === 320) {
              narrow.push(`${role}/${locale}/${theme} ${geometry.height}: ${geometry.labels.filter((label) => label.lines > 1).map((label) => label.text).join(',')}`);
            } else {
              if (!heights.has(width)) heights.set(width, geometry.height);
              expect.soft(geometry.height).toBe(heights.get(width));
              expect.soft(geometry.labels.filter((label) => label.lines !== 1)).toEqual([]);
            }
            expect.soft(geometry.labels.filter((label) => label.font < 10.5 || !label.fits)).toEqual([]);
          }
        }
        if (role !== 'admin') {
          const link = role === 'instructor' ? 'myCompensation' : 'myAccount';
          const [, fullLabel] = role === 'instructor' ? compensation : account;
          await page.getByTestId(`mobile-tab-${link}`).click();
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(fullLabel!);
          await page.setViewportSize({ width: 1280, height: 900 });
          await expect(page.locator('.sidebar').getByRole('link', { name: fullLabel!, exact: true })).toBeVisible();
          await page.setViewportSize({ width: 375, height: 812 });
        }
      }
    } finally {
      await context.close();
    }
  }
  console.log('Tab heights (360–414)', Object.fromEntries(heights), '320', narrow);
});

test('18.5a — distinguishable names on both booking lists and a single primary sheet action', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  const fixture = await createFixture(page);
  const tomorrow = addDaysIso(todayRome(), 1);
  const created = await page.request.post('/api/v1/bookings', {
    data: { aircraftId: fixture.aircraftId, personId: fixture.personId, startsAt: `${tomorrow}T10:00:00Z`, endsAt: `${tomorrow}T11:00:00Z`, force: true },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { booking } = await created.json() as { booking: { id: string } };
  const path = `/it/dashboard/bookings?aircraft=${fixture.aircraftId}`;
  const planningRow = page.getByTestId('booking-row-mobile').filter({ hasText: fixture.registration });
  const sheet = page.getByTestId('mobile-booking-sheet');
  async function checkActions(state: string, primary: string | null, secondStep?: 'cancel' | 'deny') {
    await page.goto(path);
    await waitForDashboardContent(page, planningRow);
    await planningRow.click();
    const action = sheet.locator('.btn.primary');
    if (primary) {
      await expect(page.getByTestId(`booking-${primary}-action-mobile`)).toBeVisible();
      expect.soft(await action.count(), state).toBe(1);
      expect.soft(await action.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-testid'))), state).toEqual([`booking-${primary}-action-mobile`]);
    } else {
      await expect(action).toHaveCount(0);
      await expect(sheet.locator('.bottom-sheet-actions')).toHaveCount(0);
    }
    await sheet.screenshot({ path: info.outputPath(`sheet-${state}.png`), animations: 'disabled' });
    if (secondStep) {
      await page.getByTestId(secondStep === 'deny' ? 'booking-reject-action-mobile' : 'booking-cancel-action-mobile').click();
      await page.getByTestId(secondStep === 'deny' ? 'booking-deny-cancel-mobile' : 'booking-cancel-dismiss-mobile').click();
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      expect.soft(focused, state).toBe(`booking-${primary}-action-mobile`);
    }
  }
  async function transition(to: string) {
    const response = to === 'CANCELLED'
      ? await page.request.post(`/api/v1/bookings/${booking.id}/cancel`)
      : await page.request.post(`/api/v1/bookings/${booking.id}/transition`, {
        data: { to, ...(to === 'APPROVED' ? { force: true } : {}), ...(to === 'DENIED' ? { reason: 'Synthetic 18.5a' } : {}) },
      });
    expect(response.status(), await response.text()).toBe(200);
  }
  await checkActions('approved-future', 'move', 'cancel');
  // Holding the sheet across the start changes its primary action in place.
  const startsAt = Date.parse(`${tomorrow}T10:00:00Z`);
  await page.clock.install({ time: startsAt - 30_000 });
  await page.goto(path);
  await planningRow.click();
  await expect(sheet.locator('.btn.primary')).toHaveAttribute('data-testid', 'booking-move-action-mobile');
  await page.clock.fastForward(31_000);
  await expect(sheet.locator('.btn.primary')).toHaveAttribute('data-testid', 'booking-flown-action-mobile');
  await page.clock.setSystemTime(new Date());
  const now = Date.now();
  const moved = await page.request.patch(`/api/v1/bookings/${booking.id}`, {
    data: { startsAt: new Date(now - 10 * 60_000).toISOString(), endsAt: new Date(now + 45 * 60_000).toISOString(), force: true },
  });
  expect(moved.status(), await moved.text()).toBe(200);
  const measurements: Record<string, number[]> = {};
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const [surface, url, row] of [
      ['planning', path, planningRow],
      ['overview', '/it/dashboard', page.getByTestId('mobile-overview-inprogress-row').filter({ hasText: fixture.registration })],
    ] as const) {
      await page.goto(url);
      await waitForDashboardContent(page, row);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.evaluate(() => document.fonts.ready);
      for (const width of [375, 390]) {
        await page.setViewportSize({ width, height: 812 });
        measurements[`${theme}/${surface}/${width}`] = await measureRow(row, fixture);
      }
    }
  }
  console.log('Name scroll/client widths', measurements);
  await checkActions('approved-started', 'flown', 'cancel');
  await transition('FLOWN');
  await checkActions('flown', 'reopen');
  await transition('PENDING');
  await checkActions('pending', 'approve', 'deny');
  await transition('DENIED');
  await checkActions('denied', 'reopen');
  await transition('PENDING');
  await transition('APPROVED');
  await transition('NO_SHOW');
  await checkActions('no-show', 'reopen');
  await transition('PENDING');
  await transition('CANCELLED');
  await checkActions('cancelled', null);
});

test('18.5a — populated logbook stays inside the document and directory has a neutral title', async ({ page }) => {
  await login(page);
  const { aircraftId, personId } = await createFixture(page);
  await ensureValidSeedExpiries(page, personId, 'PILOTS');
  await seedAircraftRate(aircraftId, { studentPriceCents: 10000, pilotPriceCents: 10000, validFrom: '2020-01-01' });
  await registerFlightOn(page, { aircraftId, personId, flightType: 'TOURISM', date: todayRome(), noCharge: true });
  await page.goto(`/it/dashboard/logbook?personId=${personId}`);
  const row = page.getByTestId('flight-row');
  await expect(row).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  const overflow: number[] = [];
  for (const width of [641, 768, 900, 1024, 1100, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(row).toBeVisible();
    const excess = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect.soft(excess, `viewport ${width}`).toBeLessThanOrEqual(0);
    overflow.push(excess);
  }
  console.log('Logbook document overflow', overflow);
  for (const [locale, title] of [['it', 'Anagrafica'], ['en', 'Directory']]) {
    await page.goto(`/${locale}/dashboard/pilots`);
    await waitForDashboardContent(page, page.locator('.registry-head'));
    expect.soft(await page.locator('.registry-head .card-title').innerText()).toBe(title);
  }
});
