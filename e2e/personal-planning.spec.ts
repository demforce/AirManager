import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { login, privateActor, PRIVATE_PASSWORD } from './booking-actors';
import { addDaysIso, todayRome, waitForDashboardContent } from './helpers';

async function aircraft(page: Page) {
  const registration = 'I-' + randomUUID().slice(0, 8).toUpperCase();
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Personal planning' },
  });
  expect(response.status()).toBe(201);
  return { registration, id: (await response.json() as { id: string }).id };
}

async function aboveTabBar(page: Page, item: Locator) {
  const rect = await item.boundingBox();
  const bar = await page.getByTestId('mobile-tab-bar').boundingBox();
  expect(rect).not.toBeNull();
  expect(bar).not.toBeNull();
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(bar!.y);
}

test('18.5b — personal departures precede the masked calendar and ignore staff filters', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, 'admin@airmanager.local');
  const pilot = await privateActor(page, 'PILOT');
  const student = await privateActor(page, 'STUDENT');
  const mine = await aircraft(page);
  const lesson = await aircraft(page);
  const day = addDaysIso(todayRome(), 2);
  async function book(personId: string, aircraftId: string, hour: number) {
    const startsAt = day + 'T' + String(hour).padStart(2, '0') + ':00:00.000Z';
    const endsAt = day + 'T' + String(hour).padStart(2, '0') + ':40:00.000Z';
    const result = await page.request.post('/api/v1/bookings', { data: { personId, aircraftId, startsAt, endsAt, force: true } });
    expect(result.status(), await result.text()).toBe(201);
    return (await result.json() as { booking: { id: string } }).booking.id;
  }
  // Insert in reverse order. The fourth upcoming departure is outside the preview.
  for (const hour of [18, 16, 12]) await book(pilot.personId, mine.id, hour);
  const pending = await book(pilot.personId, mine.id, 14);
  // Reopen a completed fixture using the normal staff workflow, then move the
  // pending request back into the future. Pending requests belong in the preview.
  async function move(id: string, startsAt: string, endsAt: string) {
    const response = await page.request.patch('/api/v1/bookings/' + id, { data: { startsAt, endsAt, force: true } });
    expect(response.status(), await response.text()).toBe(200);
  }
  const yesterday = addDaysIso(todayRome(), -1);
  await move(pending, yesterday + 'T14:00:00Z', yesterday + 'T14:40:00Z');
  for (const to of ['FLOWN', 'PENDING']) {
    const response = await page.request.post('/api/v1/bookings/' + pending + '/transition', { data: { to } });
    expect(response.status(), await response.text()).toBe(200);
  }
  await move(pending, day + 'T14:00:00Z', day + 'T14:40:00Z');
  const ongoing = await book(pilot.personId, mine.id, 6);
  await move(ongoing, new Date(Date.now() - 600_000).toISOString(), new Date(Date.now() + 600_000).toISOString());
  await book(student.personId, lesson.id, 10);
  const cancelled = await book(pilot.personId, mine.id, 8);
  expect((await page.request.post('/api/v1/bookings/' + cancelled + '/cancel')).status()).toBe(200);
  const personal = page.getByTestId('mobile-personal-bookings');
  const bookButton = page.getByTestId('mobile-personal-book');
  for (const [role, actor, own, other, hours] of [
    ['pilot', pilot, mine, lesson, [12, 14, 16]],
    ['student', student, lesson, mine, [10]],
  ] as const) {
    await page.context().clearCookies();
    await login(page, actor.email, PRIVATE_PASSWORD);
    // Enter through the same second tab as the user. Filter and pagination changes
    // below must never substitute the requested aircraft for their own bookings.
    await page.getByTestId('mobile-tab-schedule').click();
    await waitForDashboardContent(page, personal);
    for (const locale of ['it', 'en']) {
      await page.goto('/' + locale + '/dashboard/bookings?date=' + day + '&aircraft=' + other.id + '&status=DENIED&page=9');
      await waitForDashboardContent(page, personal);
      await expect(personal.getByRole('heading')).toHaveText(locale === 'it' ? 'Le mie prossime prenotazioni' : 'My upcoming bookings');
      const times = personal.locator('li time');
      expect(await times.evaluateAll(nodes => nodes.map(el => el.getAttribute('datetime'))))
        .toEqual(hours.map(hour => day + 'T' + hour + ':00:00.000Z'));
      await expect(personal).toContainText(own.registration);
      await expect(personal).not.toContainText(other.registration);
      const subtitle = page.locator('.page-title-block .sub:visible');
      if (role === 'pilot') {
        await expect(subtitle).toContainText(locale === 'it' ? 'le tue prenotazioni' : 'your bookings');
        await expect(personal).toContainText(locale === 'it' ? 'prime tre' : 'first three');
        await expect(personal.getByRole('listitem').nth(1)).toContainText(locale === 'it' ? 'In attesa' : 'Pending');
        await expect(bookButton).toHaveText(locale === 'it' ? 'Prenota' : 'Book');
        await aboveTabBar(page, bookButton);
        await bookButton.click();
        await expect(page.getByRole('dialog').getByTestId('new-booking-form')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(bookButton).toBeFocused();
      } else {
        await expect(subtitle).toContainText(locale === 'it' ? 'istruttore o a un amministratore' : 'instructor or administrator');
        await expect(bookButton).toHaveCount(0);
      }
      await aboveTabBar(page, personal.getByRole('listitem').last());
      const agenda = page.getByTestId('mobile-agenda-row').filter({ hasText: other.registration }).first();
      await expect(agenda).toContainText(locale === 'it' ? 'Occupato' : 'Booked');
      const calendar = await page.getByTestId('schedule-section').boundingBox();
      const card = await personal.boundingBox();
      expect(card!.y + card!.height).toBeLessThanOrEqual(calendar!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      if (locale === 'it') await page.screenshot({ path: info.outputPath(role + '-personal-planning.png') });
      await page.setViewportSize({ width: 1280, height: 812 });
      await expect(personal).toBeHidden();
      await expect(page.locator('.page-title-block .sub:visible')).toHaveText(locale === 'it'
        ? 'Calendario dei velivoli e prenotazioni da approvare.' : 'Aircraft timeline and bookings awaiting approval.');
      await page.setViewportSize({ width: 375, height: 812 });
    }
  }

  await page.context().clearCookies();
  await login(page, 'admin@airmanager.local');
  expect((await page.request.post('/api/v1/people/' + pilot.personId + '/profiles/pilot/deactivate')).status()).toBe(200);
  await page.context().clearCookies();
  await login(page, pilot.email, PRIVATE_PASSWORD);
  await page.goto('/it/dashboard/bookings');
  await expect(personal.getByRole('listitem')).toHaveCount(3);
  await expect(bookButton).toHaveCount(0);
});

test('18.5b — empty personal preview keeps the mobile subtitle and staff retains its own calendar header', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, 'admin@airmanager.local');
  const empty = await privateActor(page, 'PILOT');
  await page.goto('/it/dashboard/bookings');
  const personal = page.getByTestId('mobile-personal-bookings');
  for (const role of ['admin', 'instructor']) {
    if (role === 'instructor') {
      await page.context().clearCookies();
      await login(page, 'instructor@airmanager.local');
      await page.goto('/it/dashboard/bookings');
    }
    await waitForDashboardContent(page, page.getByTestId('schedule-section'));
    await expect(personal).toHaveCount(0);
    await expect(page.locator('.page-head')).toContainText('Calendario dei velivoli e prenotazioni da approvare.');
  }
  await page.context().clearCookies();
  await login(page, empty.email, PRIVATE_PASSWORD);
  await page.goto('/it/dashboard/bookings?date=2031-03-11');
  await waitForDashboardContent(page, personal);
  await expect(personal).toContainText('Non hai prenotazioni in programma.');
  await aboveTabBar(page, personal);
  await expect(page.locator('.page-title-block .sub:visible')).toContainText('le tue prenotazioni');
  await aboveTabBar(page, page.getByTestId('mobile-personal-book'));
});
