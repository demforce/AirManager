import { expect, test, type Page } from '@playwright/test';
import { addDaysIso, registerFlightOn, todayRome } from './helpers';
import { seedAircraftRate } from './db-fixtures';

const PASSWORD = process.env['SEED_ADMIN_PASSWORD'];
if (!PASSWORD) throw new Error('history-layers.spec.ts requires SEED_ADMIN_PASSWORD');

async function login(page: Page): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill('admin@airmanager.local');
  await page.getByLabel('Password').fill(PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** The seeded DB has zero flights, so filter tests create their own row. */
async function seedLogbookRow(page: Page): Promise<void> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName: 'History', lastName: `Filter-${suffix}` } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `HIST-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration: `I-H${suffix.toUpperCase()}`.slice(0, 20), type: 'Ultraleggero 3 assi', model: 'History test' },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };
  const yesterday = addDaysIso(todayRome(), -1);
  await seedAircraftRate(aircraft.id, { studentPriceCents: 0, pilotPriceCents: 0, validFrom: yesterday });
  await registerFlightOn(page, { aircraftId: aircraft.id, personId: person.id, flightType: 'TOURISM', date: yesterday, noCharge: true });
}

async function openLogbookFromOverview(page: Page): Promise<string> {
  const previous = page.url();
  await seedLogbookRow(page);
  await page.getByTestId('mobile-tab-more').click();
  await page.getByTestId('mobile-more-logbook').click();
  await expect(page).toHaveURL(/\/it\/dashboard\/logbook$/);
  await expect(page.getByTestId('mobile-flight-filters-button')).toBeVisible();
  return previous;
}

test('18.3a AC1/2/7: Back closes an edited panel at the same URL; dismissal leaves one Back and focus returns', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  const previous = await openLogbookFromOverview(page);
  const url = page.url();
  const trigger = page.getByTestId('logbook-new-button');
  await trigger.click();
  const form = page.getByTestId('flight-form');
  await expect(form).toBeVisible();
  await form.getByLabel('Ora decollo').fill('10:00');
  expect(page.url()).toBe(url);
  await page.goBack();
  await expect(page.locator('.slideover.open')).toHaveCount(0);
  expect(page.url()).toBe(url);
  await expect(trigger).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(previous);

  await openLogbookFromOverview(page);
  await trigger.click();
  await page.locator('.slideover.open .so-head .iconbtn').click();
  await expect(page.locator('.slideover.open')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(previous);
});

test('18.3a AC2/7: Escape and scrim close an Export menu at desktop without a ghost Back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  const previous = page.url();
  await page.getByRole('navigation', { name: 'Aree operative' }).getByRole('link', { name: 'Registro voli', exact: true }).click();
  await expect(page).toHaveURL(/\/it\/dashboard\/logbook$/);
  const trigger = page.getByTestId('export-menu-trigger');
  await trigger.click();
  await expect(page.getByTestId('export-menu-sheet').getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-menu-sheet')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByTestId('export-menu-sheet-scrim').click({ position: { x: 1, y: 1 } });
  await expect(page.getByTestId('export-menu-sheet')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(previous);
});

test('18.3a AC2: Annulla in booking and instructor editors leaves no ghost Back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  const previous = page.url();

  await page.goto('/it/dashboard/bookings');
  await page.getByTestId('new-booking-button').click();
  await expect(page.getByTestId('new-booking-form')).toBeVisible();
  await page.getByTestId('new-booking-form').getByRole('button', { name: 'Annulla' }).click();
  await expect(page.locator('.slideover.open')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(previous);

  const marker = `HistoryInstructor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created = await page.request.post('/api/v1/people', { data: { firstName: 'History', lastName: marker } });
  expect(created.status()).toBe(201);
  const person = (await created.json()) as { id: string };
  await page.goto('/it/dashboard/instructors');
  await page.getByTestId('instructors-new-button').click();
  await page.getByTestId('add-instructor-search').fill(marker);
  await page.getByTestId(`add-instructor-result-${person.id}`).click();
  await page.getByTestId('add-instructor-form').getByRole('button', { name: 'Annulla' }).click();
  await expect(page.locator('.slideover.open')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(previous);
});

test('18.3a AC3: Apply performs one navigation, then Back returns the unfiltered URL', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await openLogbookFromOverview(page);
  const base = page.url();
  await page.getByTestId('mobile-flight-filters-button').click();
  await page.getByTestId('flight-filter-type-mobile').selectOption('TOURISM');
  let navigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });
  await page.getByTestId('mobile-flight-filters-apply').click();
  await expect(page).toHaveURL(/flightType=TOURISM/);
  await expect(page.getByTestId('mobile-flight-filters-button')).toBeVisible();
  expect(navigations).toBeLessThanOrEqual(1);
  await page.goBack();
  await expect(page).toHaveURL(base);
});

test('18.3a review: unchanged Apply and active Altro link close without a ghost Back', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  const source = await openLogbookFromOverview(page);
  await page.getByTestId('mobile-flight-filters-button').click();
  await page.getByTestId('mobile-flight-filters-apply').click();
  await expect(page.locator('.slideover.open')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(source);

  await openLogbookFromOverview(page);
  const logbook = page.url();
  await page.getByTestId('mobile-tab-more').click();
  await page.getByTestId('mobile-more-logbook').click();
  await expect(page.getByTestId('mobile-more-sheet')).toHaveCount(0);
  await expect(page).toHaveURL(logbook);
  await page.goBack();
  await expect(page).toHaveURL(source);
});

for (const filter of [
  { path: 'logbook', input: 'flight-filter-person', open: 'mobile-flight-filters-button', reset: 'flight-filter-reset-mobile' },
  { path: 'billing', input: 'billing-filter-person', open: 'mobile-billing-filters-button', reset: 'billing-filter-reset-mobile' },
  { path: 'expiries', input: 'scadenze-filter-pilot', open: 'mobile-scadenze-filters-button', reset: 'mobile-scadenze-filter-reset' },
]) {
  test(`18.3a review: Reset clears an unfinished search in ${filter.path} without rearming it`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    const source = page.url();
    if (filter.path === 'logbook') await seedLogbookRow(page);
    await page.goto(`/it/dashboard/${filter.path}`);
    const base = page.url();
    await page.getByTestId(filter.input).fill('PendingReviewSearch');
    await page.getByTestId(filter.open).click();
    expect(page.url()).toBe(base);
    await page.getByTestId(filter.reset).click();
    await expect(page.locator('.slideover.open')).toHaveCount(0);
    await expect(page.getByTestId(filter.input)).toHaveValue('');
    await page.waitForTimeout(500); // longer than the 400 ms search debounce
    expect(page.url()).toBe(base);
    await page.goBack();
    await expect(page).toHaveURL(source);
  });
}

test('18.3a review: active Altro link clears a filtered URL and Back restores the filter', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await openLogbookFromOverview(page);
  await page.getByTestId('mobile-flight-filters-button').click();
  await page.getByTestId('flight-filter-type-mobile').selectOption('TOURISM');
  await page.getByTestId('mobile-flight-filters-apply').click();
  await expect(page).toHaveURL(/flightType=TOURISM/);
  const filtered = page.url();
  await page.getByTestId('mobile-tab-more').click();
  await page.getByTestId('mobile-more-logbook').click();
  await expect(page).toHaveURL(/\/it\/dashboard\/logbook$/);
  await expect(page.getByTestId('mobile-more-sheet')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(filtered);
});

test('18.3a AC4: a link in Altro reaches Settings and one Back returns to the source', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  const source = page.url();
  await page.getByTestId('mobile-tab-more').click();
  await page.getByTestId('mobile-more-settings').click();
  await expect(page).toHaveURL(/\/it\/dashboard\/settings$/);
  await expect(page.getByTestId('mobile-more-sheet')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(source);
});

test('18.3a AC5: aircraft detail transfers its entry to the editor; Back closes the editor', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  const source = page.url();
  await page.getByTestId('mobile-tab-fleet').click();
  await expect(page).toHaveURL(/\/it\/dashboard\/fleet$/);
  await expect(page.locator('[data-testid^="mobile-fleet-card-"]').first()).toBeVisible();
  await page.locator('[data-testid^="mobile-fleet-card-"]').first().click();
  await expect(page.getByTestId('mobile-fleet-sheet')).toBeVisible();
  await page.getByTestId('aircraft-edit-mobile').click();
  await expect(page.getByTestId('mobile-fleet-sheet')).toHaveCount(0);
  await expect(page.getByTestId('identity-form')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.slideover.open')).toHaveCount(0);
  await expect(page).toHaveURL(/\/it\/dashboard\/fleet$/);
  await page.goBack();
  await expect(page).toHaveURL(source);
});

test('18.3a AC6: save refreshes the register and the next Back leaves the page once', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  const source = page.url();
  const marker = `History-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created = await page.request.post('/api/v1/cash-categories', { data: { name: marker } });
  expect(created.status()).toBe(201);
  const category = (await created.json()) as { id: string };
  await page.goto(`/it/dashboard/billing?categoryId=${category.id}`);
  await expect(page.getByTestId('billing-new-transaction-button')).toBeVisible();
  await page.getByTestId('billing-new-transaction-button').click();
  await page.getByTestId('transaction-kind').selectOption('cash');
  await page.getByTestId('transaction-category').selectOption({ label: marker });
  await page.getByTestId('transaction-direction').selectOption('in');
  await page.getByTestId('transaction-amount').fill('50');
  await page.getByTestId('transaction-date').fill(todayRome());
  await page.getByTestId('transaction-description').fill(marker);
  await page.getByTestId('transaction-submit').click();
  await expect(page.getByTestId('transaction-result-panel')).toBeVisible();
  await page.getByTestId('transaction-result-close').click();
  await expect(page.locator('.slideover.open')).toHaveCount(0);
  await expect(page.getByTestId('transaction-row-mobile').filter({ hasText: marker })).toBeVisible();
  const billing = page.url();
  await page.getByTestId('mobile-tab-fleet').click();
  await expect(page).toHaveURL(/\/it\/dashboard\/fleet$/);
  const fleet = page.url();
  await page.locator('[data-testid^="mobile-fleet-card-"]').first().click();
  await expect(page.getByTestId('mobile-fleet-sheet')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('mobile-fleet-sheet')).toHaveCount(0);
  await expect(page).toHaveURL(fleet);
  await page.goBack();
  await expect(page).toHaveURL(billing);
  await page.goForward();
  await expect(page).toHaveURL(fleet);
  await page.goBack();
  await expect(page).toHaveURL(billing);
  await page.goBack();
  await expect(page).toHaveURL(source);
});

test('18.3a AC1/4/5: desktop editor, pilot handoff and profile link each keep one Back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  const source = page.url();
  await page.getByRole('navigation', { name: 'Aree operative' }).getByRole('link', { name: 'Contabilità', exact: true }).click();
  await expect(page).toHaveURL(/\/it\/dashboard\/billing$/);
  await page.getByTestId('billing-new-transaction-button').click();
  await expect(page.locator('.slideover.open')).toHaveCount(1);
  await page.goBack();
  await expect(page.locator('.slideover.open')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(source);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByTestId('mobile-tab-pilots').click();
  await expect(page).toHaveURL(/\/it\/dashboard\/pilots$/);
  const pilot = page.locator('[data-testid^="mobile-pilot-row-"]').first();
  await expect(pilot).toBeVisible();
  await pilot.click();
  await page.getByTestId('pilot-edit-mobile').click();
  await expect(page.locator('.slideover.open')).toHaveCount(1);
  await page.goBack();
  await expect(page.locator('.slideover.open')).toHaveCount(0);
  await pilot.click();
  await page.getByTestId('pilot-open-profile-mobile').click();
  await expect(page).toHaveURL(/\/it\/dashboard\/people\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/it\/dashboard\/pilots$/);
});

test('18.3a AC4: locale link in the profile sheet returns to the original locale in one Back', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  const source = page.url();
  await page.getByTestId('mobile-profile-button').click();
  await page.getByTestId('locale-switch-mobile').click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await page.goBack();
  await expect(page).toHaveURL(source);
});
