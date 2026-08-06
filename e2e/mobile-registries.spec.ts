import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Story 15.5 — the phone faces of the four registry surfaces: the fleet as a
 * two-column card grid with an hours bar, the pilots and the instructors as
 * person rows with a detail sheet, the scheda persona in one column, and the
 * primary save of the two multi-form editors pinned to the bottom of the
 * full-screen panel (ratifica R-15.5-f, closing the R-15.2-g debt).
 *
 * Each test is the guard of ONE rule introduced for a MEASURED defect (AC 9),
 * written on the side the rule LIBERATES — never on "the new thing exists":
 * - the grid test asserts the two TRACKS are equal and fit the container, not
 *   that the page has no horizontal overflow: measured, the page has none even
 *   with the defect, because `.card{overflow:hidden}` hides it (§a.1);
 * - the swap tests assert BOTH sides (desktop `none` + mobile visible at 375px,
 *   the inverse at 1280px) — one side alone lets "I hid everything" pass;
 * - the panel test asserts the submit is HIT-TESTABLE with the body at the top
 *   on a viewport where the body really scrolls (lesson 15.4 iv).
 *
 * Isolation (non-negotiable, lesson 12.11 F1 / 15.4's second red): every test
 * builds its OWN aircraft/people and reaches them THROUGH THE PAGE'S SEARCH,
 * never assuming "my fixture is on page 1" of a 20-row list on a DB with 100+
 * aircraft and ~300 people. Nothing here writes AppSettings, so the file stays
 * in the `fullyParallel` project.
 *
 * Fixture budget per full run (the two open ceilings — picker `OPTIONS_PAGE_SIZE
 * = 100`, 20-row pages): 8 aircraft + 21 more that are ARCHIVED again in the
 * same test (the pagination guard needs two pages of a filtered list, and an
 * archived aircraft leaves the pickers), 9 people, 1 user, 2 flights. The two
 * fixtures the review's fix cycle added are one aircraft WITHOUT a fuel type
 * plus a person without email or profiles (F1), and a SCHOOL flight that gives
 * the instructor sheet something real to show (F2).
 *
 * Viewports are set with `setViewportSize` inside the test (pattern 13.10, epic
 * decision: no duplicated Playwright project).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-registries.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 } as const;
const PHONE_NARROW = { width: 320, height: 568 } as const;
const PHONE_WIDE = { width: 390, height: 844 } as const;
const PHONE_SHORT = { width: 375, height: 560 } as const;
const DESKTOP = { width: 1280, height: 900 } as const;

/** Every desktop testid this story's convention pins to exactly ONE node (AC 6). */
const FLEET_TESTIDS = ['fleet-search', 'fleet-toggle-archived', 'fleet-new-button'];
const PILOTS_TESTIDS = ['pilots-search', 'pilots-toggle-archived', 'pilots-new-button'];

async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

function addDaysUtc(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type Aircraft = { id: string; registration: string; model: string };

async function createAircraft(page: Page, tag: string, model = 'Cessna 172 Skyhawk Reims Rocket', fuelType: string | null = 'AVGAS 100LL'): Promise<Aircraft> {
  const registration = `I-${tag}`.slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model, hourMeterMinutes: 60, seats: 2, fuelType, based: true, notes: 'Nota 15.5' },
  });
  expect(response.status(), await response.text()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  return { id, registration, model };
}

/** A rate is a precondition of `POST /api/v1/flights` (no rate in force -> 422). */
async function addRate(page: Page, aircraftId: string, priceCentsPerHour = 18000): Promise<void> {
  const response = await page.request.post(`/api/v1/aircraft/${aircraftId}/rates`, { data: { priceCentsPerHour, validFrom: '2020-01-01' } });
  expect(response.status(), await response.text()).toBe(201);
}

type Person = { id: string; firstName: string; lastName: string };

async function createPilot(page: Page, tag: string): Promise<Person> {
  const lastName = `Reg${tag}`;
  const response = await page.request.post('/api/v1/people', {
    data: { firstName: 'Mobile', lastName, email: `${lastName.toLowerCase()}@airmanager.local`, phone: '3331234567' },
  });
  expect(response.status(), await response.text()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  const profile = await page.request.put(`/api/v1/people/${id}/profiles/pilot`, { data: { licenseNumber: `IT-${tag}`, licenseType: 'PPL(A)' } });
  expect(profile.status(), await profile.text()).toBe(200);
  return { id, firstName: 'Mobile', lastName };
}

/** Registers a BLOCKING document (`ExpiryType.blocksBooking`) — the data behind the row flag (R-15.5-c). */
async function registerBlockingExpiry(page: Page, personId: string, typeName: string, daysUntil: number): Promise<string> {
  const typesResponse = await page.request.get('/api/v1/expiry-types');
  expect(typesResponse.ok(), await typesResponse.text()).toBe(true);
  const body = (await typesResponse.json()) as { items?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>;
  const types = Array.isArray(body) ? body : (body.items ?? []);
  const type = types.find((candidate) => candidate.name === typeName);
  expect(type, `seeded expiry type "${typeName}"`).toBeTruthy();
  const response = await page.request.post('/api/v1/expiries', { data: { personId, expiryTypeId: type!.id, expiresAt: addDaysUtc(daysUntil) } });
  expect(response.status(), await response.text()).toBe(201);
  return type!.name;
}

/** Reaches a fixture THROUGH the page's own search — never "it is on page 1". */
async function searchFleet(page: Page, query: string): Promise<void> {
  await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(query)}`);
  await expect(page.getByTestId('fleet-search')).toHaveValue(query);
}

async function searchPilots(page: Page, query: string): Promise<void> {
  await page.goto(`/it/dashboard/pilots?q=${encodeURIComponent(query)}`);
  await expect(page.getByTestId('pilots-search')).toHaveValue(query);
}

/** Box height of a locator, rounded — the 44px touch-target check. */
async function heightOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return Math.round(box!.height);
}

/** Height of the registry head and whether its chip and its export trigger share a row (review F3). */
async function measureHead(page: Page): Promise<{ height: number; sameRow: boolean }> {
  return page.locator('.registry-head').evaluate((node) => {
    const toggle = node.querySelector<HTMLElement>('[data-testid$="-toggle-archived"], [data-testid="instructors-payment-cycle-button"]')!;
    const menu = node.querySelector<HTMLElement>(':scope > div > .btn')!;
    return {
      height: Math.round(node.getBoundingClientRect().height),
      sameRow: Math.abs(toggle.getBoundingClientRect().top - menu.getBoundingClientRect().top) <= 1,
    };
  });
}

/**
 * The accessible name of a sheet is `${sub} — ${title}` (`bottom-sheet.tsx`),
 * so it is well-formed only when BOTH halves carry real text.
 *
 * `expect(name.split(' — ')).toHaveLength(2)` — the assertion this file used to
 * make — is BLIND to the very defect it was written for (review 15.5 F1): with
 * a "—" placeholder inside the sub the name reads "Basato · — — I-ABCD · …",
 * whose two ADJACENT separators consume one another under `String.split`,
 * giving exactly 2 parts. Measured on the seeded DB: 115 of the 121 active
 * aircraft have no `fuelType` and every one of their sheets was named that way.
 *
 * What is asserted here instead is the property itself: no run of two dashes,
 * and no segment that is empty or is the placeholder alone.
 */
function expectWellFormedSheetName(name: string | null): void {
  expect(name, 'the dialog must carry an aria-label').not.toBeNull();
  expect(name!, 'no two adjacent separators').not.toMatch(/—\s*—/);
  const segments = name!.split(' — ');
  expect(segments, 'exactly one separator').toHaveLength(2);
  for (const segment of segments) {
    expect(segment.trim(), `segment of "${name}"`).not.toBe('');
    expect(segment.trim(), `segment of "${name}"`).not.toBe('—');
    expect(segment.trim().startsWith('—'), `segment of "${name}" starts with a placeholder`).toBe(false);
    expect(segment.trim().endsWith('—'), `segment of "${name}" ends with a placeholder`).toBe(false);
  }
}

test.describe('Story 15.5 — anagrafiche in the mobile language', () => {
  test('Flotta at <=640px: the desktop grid is hidden and the phone grid has TWO EQUAL tracks that fit their container (AC 1, AC 9-iii)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `G${uniqueSuffix()}`;
    const first = await createAircraft(page, tag + 'A');
    const second = await createAircraft(page, tag + 'B', 'P92');

    await page.setViewportSize(PHONE);
    await searchFleet(page, `I-${tag}`);

    // BOTH sides of the swap, at this width.
    await expect(page.locator('.fleet-desktop-body')).toBeHidden();
    await expect(page.getByTestId('mobile-fleet-grid')).toBeVisible();
    await expect(page.getByTestId(`mobile-fleet-card-${first.id}`)).toBeVisible();

    // The guard the story asks for: the TRACKS, not the page overflow (which is
    // 0 even with `1fr 1fr`, because `.card` clips the second column).
    const geometry = await page.getByTestId('mobile-fleet-grid').evaluate((grid) => {
      const style = getComputedStyle(grid);
      const tracks = style.gridTemplateColumns.split(' ').map(Number.parseFloat);
      const gap = Number.parseFloat(style.columnGap);
      return { tracks, gap, clientWidth: grid.clientWidth, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(geometry.tracks).toHaveLength(2);
    expect(Math.abs(geometry.tracks[0]! - geometry.tracks[1]!)).toBeLessThanOrEqual(0.5);
    expect(geometry.tracks[0]! + geometry.tracks[1]! + geometry.gap).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.pageOverflow).toBe(0);

    // The card is ONE button, 44px+, with a speaking name and nothing
    // interactive inside it (R-15.5-i).
    const card = page.getByTestId(`mobile-fleet-card-${second.id}`);
    expect(await card.evaluate((node) => node.tagName)).toBe('BUTTON');
    expect(await card.evaluate((node) => node.querySelectorAll('button,a,input,select,textarea').length)).toBe(0);
    expect(await heightOf(card)).toBeGreaterThanOrEqual(44);
    await expect(card).toHaveAttribute('aria-label', new RegExp(second.registration));

    // At 320px the card must not push its own track, and every text it carries
    // either fits or truncates WITH an ellipsis affordance (the template's own
    // three declarations on the model line).
    await page.setViewportSize(PHONE_NARROW);
    const narrow = await page.getByTestId('mobile-fleet-grid').evaluate((grid) => {
      const cards = [...grid.querySelectorAll('[data-testid^="mobile-fleet-card-"]')];
      return {
        overflowing: cards.filter((card) => card.scrollWidth > card.clientWidth + 1).length,
        clippedWithoutEllipsis: cards.flatMap((card) =>
          [...card.querySelectorAll('.mobile-ac-tail,.mobile-ac-model,.mobile-ac-meter > span')]
            .filter((part) => part.scrollWidth > part.clientWidth + 1 && getComputedStyle(part).textOverflow !== 'ellipsis')
            .map((part) => part.className),
        ),
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(narrow.overflowing).toBe(0);
    expect(narrow.clippedWithoutEllipsis).toEqual([]);
    expect(narrow.pageOverflow).toBe(0);

    // The inverse side of the swap.
    await page.setViewportSize(DESKTOP);
    await searchFleet(page, `I-${tag}`);
    await expect(page.getByTestId('mobile-fleet-grid')).toBeHidden();
    await expect(page.locator('.fleet-desktop-body')).toBeVisible();
    await expect(page.getByTestId(`ac-card-${first.id}`)).toBeVisible();
  });

  test('Flotta: the hours bar is proportional to the busiest aircraft of the page, and empty for one that did not fly (AC 1, AC 9-v)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `H${uniqueSuffix()}`;
    const flown = await createAircraft(page, tag + 'A');
    const idle = await createAircraft(page, tag + 'B', 'P92');
    await addRate(page, flown.id);
    const pilot = await createPilot(page, tag);

    // A flight of TODAY (inside the bar's window: the current calendar month),
    // registered with the ADMIN override of story 14.4.
    //
    // `force` is not a shortcut here, it is the only DETERMINISTIC way: a flight
    // requires EVERY blocking `ExpiryType` of the person's active profiles to be
    // registered and valid (`findMissingBlockingDocuments`), and the catalogue is
    // GLOBAL — `bookings.spec.ts`/`flights.spec.ts` create their own blocking
    // types ("Tipo prenotazioni …", "Tipo voli …") and never remove them, so a
    // fresh person is blocked by however many of them happen to exist when this
    // test runs. Measured on a post-suite DB: 11 blocking types, 7 of them left
    // by other specs. This test is about the hours BAR, not about the guardrail
    // (which `flights.spec.ts` owns).
    const today = addDaysUtc(0);
    const flight = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: flown.id,
        personId: pilot.id,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'TOURISM',
        takeoffAt: `${today}T10:00:00.000Z`,
        landingAt: `${today}T11:00:00.000Z`,
        force: true,
        forceReason: 'Fixture 15.5 — barra ore',
      },
    });
    expect(flight.status(), await flight.text()).toBe(201);

    await page.setViewportSize(PHONE);
    await searchFleet(page, `I-${tag}`);

    const widths = await page.getByTestId('mobile-fleet-grid').evaluate((grid) =>
      Object.fromEntries(
        [...grid.querySelectorAll('[data-testid^="mobile-fleet-card-"]')].map((card) => [
          card.getAttribute('data-testid'),
          (card.querySelector('.meter-bar .fill') as HTMLElement | null)?.style.width ?? null,
        ]),
      ),
    );
    expect(widths[`mobile-fleet-card-${flown.id}`]).toBe('100%');
    expect(widths[`mobile-fleet-card-${idle.id}`]).toBe('0%');

    // The caption declares the window, so the number is never ambiguous.
    await expect(page.getByTestId(`mobile-fleet-card-${flown.id}`)).toContainText('Ore mese');
    await expect(page.getByTestId(`mobile-fleet-card-${flown.id}`)).toContainText('1:00');
  });

  test('Flotta: the card opens the detail sheet, and "Modifica" closes it before the full-screen panel (AC 4, AD-7)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `S${uniqueSuffix()}`;
    const aircraft = await createAircraft(page, tag);
    const aog = await page.request.post(`/api/v1/aircraft/${aircraft.id}/out-of-service`, { data: { reason: 'Revisione 15.5' } });
    expect(aog.status(), await aog.text()).toBe(200);

    await page.setViewportSize(PHONE);
    await searchFleet(page, `I-${tag}`);
    await page.getByTestId(`mobile-fleet-card-${aircraft.id}`).click();

    const sheet = page.getByTestId('mobile-fleet-sheet');
    await expect(sheet).toHaveCount(1);
    const dialog = sheet.getByRole('dialog');
    // Well-formed accessible name (lesson 15.2 F6: never a double em dash).
    const name = await dialog.getAttribute('aria-label');
    expect(name).toContain(aircraft.registration);
    expectWellFormedSheetName(name);

    // Parity with the desktop card + the AOG reason the card itself truncates.
    for (const text of ['Stato', 'Motivo AOG', 'Revisione 15.5', 'Tariffa', 'Posti', 'Carburante', 'Contaore', 'Ore mese', 'Note']) {
      await expect(sheet).toContainText(text);
    }

    await sheet.getByTestId('aircraft-edit-mobile').click();
    // R-15.4-d: no z-50 panel stacked on a z-40 sheet.
    await expect(page.getByTestId('mobile-fleet-sheet')).toHaveCount(0);
    await expect(page.getByTestId('identity-form')).toBeVisible();
    await expect(page.getByTestId('identity-form').getByLabel('Marche')).toHaveValue(aircraft.registration);
  });

  test('the sheet name stays well-formed on an aircraft WITHOUT fuel type and a person WITHOUT email or profiles (AC 4, review F1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `A${uniqueSuffix()}`;
    // The two entities the placeholder used to break: the sub of the fleet
    // sheet is "based · fuel", the sub of the pilot sheet is "profiles · email",
    // and 115 of the 121 seeded aircraft have no fuel type at all.
    const aircraft = await createAircraft(page, tag, 'P92', null);
    const bare = await page.request.post('/api/v1/people', { data: { firstName: 'Mobile', lastName: `Reg${tag}` } });
    expect(bare.status(), await bare.text()).toBe(201);
    const bareId = ((await bare.json()) as { id: string }).id;

    await page.setViewportSize(PHONE);
    await searchFleet(page, `I-${tag}`);
    await page.getByTestId(`mobile-fleet-card-${aircraft.id}`).click();
    const fleetName = await page.getByTestId('mobile-fleet-sheet').getByRole('dialog').getAttribute('aria-label');
    expect(fleetName).toContain(aircraft.registration);
    expectWellFormedSheetName(fleetName);

    await searchPilots(page, `Reg${tag}`);
    // No profile and no email: the row shows the "—" placeholder (that is what a
    // placeholder is FOR), the dialog name never does.
    await expect(page.getByTestId(`mobile-pilot-row-${bareId}`).locator('.mobile-row-sub')).toHaveText('—');
    await page.getByTestId(`mobile-pilot-row-${bareId}`).click();
    const pilotName = await page.getByTestId('mobile-pilot-sheet').getByRole('dialog').getAttribute('aria-label');
    expect(pilotName).toContain(`Reg${tag}`);
    expectWellFormedSheetName(pilotName);
  });

  test('Piloti at <=640px: the 1102px table is hidden and each pilot is ONE row with balance and the blocking-document flag (AC 2, AC 9-i/ii/vi)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `P${uniqueSuffix()}`;
    const flagged = await createPilot(page, tag + 'X');
    const clean = await createPilot(page, tag + 'Y');
    const typeName = await registerBlockingExpiry(page, flagged.id, 'Visita medica classe 2', -12);

    await page.setViewportSize(PHONE);
    await searchPilots(page, `Reg${tag}`);

    await expect(page.locator('.pilots-desktop-body')).toBeHidden();
    await expect(page.getByTestId('mobile-pilots-list')).toBeVisible();

    const row = page.getByTestId(`mobile-pilot-row-${flagged.id}`);
    expect(await row.evaluate((node) => node.tagName)).toBe('BUTTON');
    expect(await row.evaluate((node) => node.querySelectorAll('button,a,input,select,textarea').length)).toBe(0);
    expect(await heightOf(row)).toBeGreaterThanOrEqual(44);
    await expect(row).toHaveAttribute('aria-label', new RegExp(`${flagged.lastName} ${flagged.firstName}`));
    // The flag names the document and says it is expired.
    await expect(row).toContainText(`${typeName} scaduto`);
    // ...and it stays INSIDE the row, however long the type name is. An
    // `overflow: hidden` + ellipsis element is excluded from the hidden-scroller
    // sweep below by construction, so its containment needs its own assertion:
    // measured on a 38-character type name, a chip spanning two grid tracks ran
    // past the card's right edge while every other check stayed green.
    const chipFits = await row.evaluate((node) => {
      const chip = node.querySelector('.mobile-row-flag .badge')!.getBoundingClientRect();
      const box = node.getBoundingClientRect();
      return chip.right <= box.right + 1 && chip.left >= box.left - 1;
    });
    expect(chipFits).toBe(true);
    // The clean fixture carries NO chip: a row that always has one has no signal.
    await expect(page.getByTestId(`mobile-pilot-row-${clean.id}`).locator('.badge')).toHaveCount(0);

    // Nothing on the page scrolls sideways behind the user's back.
    const geometry = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hidden: [...document.querySelectorAll('.page *')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1 && !el.closest('.slideover') && getComputedStyle(el).textOverflow !== 'ellipsis')
        .map((el) => String(el.className)),
    }));
    expect(geometry.pageOverflow).toBe(0);
    expect(geometry.hidden).toEqual([]);

    await page.setViewportSize(DESKTOP);
    await searchPilots(page, `Reg${tag}`);
    await expect(page.getByTestId('mobile-pilots-list')).toBeHidden();
    await expect(page.locator('.pilots-desktop-body')).toBeVisible();
  });

  test('Piloti: the row opens its sheet FROM THE KEYBOARD, with full parity and the gated actions (AC 4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `K${uniqueSuffix()}`;
    const pilot = await createPilot(page, tag);

    await page.setViewportSize(PHONE);
    await searchPilots(page, `Reg${tag}`);

    // Real Tab presses, never `focus()` — the row must be genuinely reachable.
    const row = page.getByTestId(`mobile-pilot-row-${pilot.id}`);
    await page.keyboard.press('Tab');
    for (let index = 0; index < 25; index += 1) {
      if (await row.evaluate((node) => node === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(row).toBeFocused();
    await page.keyboard.press('Enter');

    const sheet = page.getByTestId('mobile-pilot-sheet');
    await expect(sheet).toHaveCount(1);
    for (const text of ['Email', 'Telefono', 'Saldo', 'Ultimo volo', 'Ruolo', 'Stato']) {
      await expect(sheet).toContainText(text);
    }
    await expect(sheet.getByTestId('pilot-edit-mobile')).toBeVisible();
    await expect(sheet.getByTestId('pilot-topup-mobile')).toBeVisible();
    // No account yet -> no suspend action at all (same gate as the desktop row).
    await expect(sheet.getByTestId('pilot-suspend-toggle-mobile')).toHaveCount(0);
    await expect(sheet.getByTestId('pilot-open-profile-mobile')).toBeVisible();
    for (const testId of ['pilot-edit-mobile', 'pilot-topup-mobile']) {
      expect(await heightOf(sheet.getByTestId(testId))).toBeGreaterThanOrEqual(44);
    }

    // "Registra acconto" closes the sheet before opening its own panel.
    await sheet.getByTestId('pilot-topup-mobile').click();
    await expect(page.getByTestId('mobile-pilot-sheet')).toHaveCount(0);
    await expect(page.getByTestId('topup-form')).toBeVisible();
  });

  test('Piloti: suspending from the sheet takes TWO steps and the outcome is re-read from the API (AC 4)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `U${uniqueSuffix()}`;
    const pilot = await createPilot(page, tag);
    const email = `reg${tag.toLowerCase()}@airmanager.local`;
    const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId: pilot.id } });
    expect(userResponse.status(), await userResponse.text()).toBe(201);
    const user = (await userResponse.json()) as { id: string };

    await page.setViewportSize(PHONE);
    await searchPilots(page, `Reg${tag}`);
    await page.getByTestId(`mobile-pilot-row-${pilot.id}`).click();

    const sheet = page.getByTestId('mobile-pilot-sheet');
    await sheet.getByTestId('pilot-suspend-toggle-mobile').click();
    // Step 2 replaces the body: the confirmation cannot be reached by accident.
    await expect(sheet.getByTestId('pilot-suspend-confirm-mobile')).toBeVisible();
    await expect(sheet.getByTestId('pilot-edit-mobile')).toHaveCount(0);

    // Dismissing leaves the account untouched — re-read from the SERVER, not
    // from the sheet's own state (`/api/v1/users/{id}` has no GET since 12.13,
    // so the read goes through the page, which re-renders from
    // `listPilotsPageData`; it is the record's STATE, never a list count).
    await sheet.getByTestId('pilot-suspend-dismiss-mobile').click();
    await expect(sheet.getByTestId('pilot-edit-mobile')).toBeVisible();
    await page.keyboard.press('Escape');
    await searchPilots(page, `Reg${tag}`);
    await expect(page.getByTestId(`mobile-pilot-row-${pilot.id}`).locator('.badge')).toHaveCount(0);

    await page.getByTestId(`mobile-pilot-row-${pilot.id}`).click();
    await sheet.getByTestId('pilot-suspend-toggle-mobile').click();
    await sheet.getByTestId('pilot-suspend-confirm-mobile').click();
    await expect(page.getByTestId('mobile-pilot-sheet')).toHaveCount(0);
    await expect(page.getByTestId('toast')).toContainText('sospeso');

    // The outcome, re-read from the server: the row now carries the "Sospeso"
    // chip, which wins over any document, and the desktop table says the same.
    await searchPilots(page, `Reg${tag}`);
    await expect(page.getByTestId(`mobile-pilot-row-${pilot.id}`)).toContainText('Sospeso');
    await page.setViewportSize(DESKTOP);
    await searchPilots(page, `Reg${tag}`);
    await expect(page.getByTestId(`pilot-row-${pilot.id}`)).toContainText('Sospeso');
    expect(user.id).toBeTruthy();
  });

  test('Istruttori at <=640px: the 754px table is hidden and each instructor is ONE row with hours and owed (AC 11)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `I${uniqueSuffix()}`;
    const person = await createPilot(page, tag);
    const activate = await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, { data: {} });
    expect(activate.status(), await activate.text()).toBe(200);
    // Without a payout rate `owedTotalCents` is null and the row says "—":
    // the "dovuto" half of AC 11 only exists once a rate is on file.
    const rate = await page.request.put(`/api/v1/instructor-compensation/${person.id}/rate`, { data: { payoutRateCents: 6000 } });
    expect(rate.status(), await rate.text()).toBe(200);

    // A SCHOOL flight of TODAY flown by this instructor: it is what makes the
    // three facts the desktop panel shows non-empty (review F2). `force` for the
    // same reason as the hours-bar test — the blocking `ExpiryType` catalogue is
    // global and this test is not about that guardrail.
    const aircraft = await createAircraft(page, tag);
    await addRate(page, aircraft.id);
    // A SCHOOL flight also needs the instructor's CHARGE rate in force (the
    // `payoutRateCents` above is what the club owes HIM) — without it
    // `POST /flights` answers 422 `NO_INSTRUCTOR_RATE`.
    const chargeRate = await page.request.post(`/api/v1/people/${person.id}/instructor-rates`, { data: { priceCentsPerHour: 4000, validFrom: '2020-01-01' } });
    expect(chargeRate.status(), await chargeRate.text()).toBe(201);
    const student = await createPilot(page, `${tag}S`);
    const today = addDaysUtc(0);
    const flight = await page.request.post('/api/v1/flights', {
      data: {
        aircraftId: aircraft.id,
        personId: student.id,
        instructorPersonId: person.id,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        flightType: 'SCHOOL',
        takeoffAt: `${today}T10:00:00.000Z`,
        landingAt: `${today}T11:00:00.000Z`,
        force: true,
        forceReason: 'Fixture 15.5 — dettaglio istruttore',
      },
    });
    expect(flight.status(), await flight.text()).toBe(201);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/instructors');

    await expect(page.locator('.instructors-desktop-body')).toBeHidden();
    await expect(page.getByTestId('mobile-instructors-list')).toBeVisible();

    const row = page.getByTestId(`mobile-instructor-row-${person.id}`);
    expect(await row.evaluate((node) => node.tagName)).toBe('BUTTON');
    expect(await row.evaluate((node) => node.querySelectorAll('button,a,input,select,textarea').length)).toBe(0);
    expect(await heightOf(row)).toBeGreaterThanOrEqual(44);
    await expect(row).toContainText('dovuti');

    await row.click();
    const sheet = page.getByTestId('mobile-instructor-sheet');
    await expect(sheet).toHaveCount(1);
    // Parity with the desktop `InstructorProfile` panel, which at <=640px is
    // unreachable (`instructor-name-{id}` lives in a `display: none` tree):
    // the three facts it owns are HERE, with their real values, not their
    // loading placeholder (review F2).
    for (const text of ['Tariffa payout', 'Ore totali', 'Ore nel mese', 'Totale dovuto', 'Allievi recenti', 'Voli recenti come CFI']) {
      await expect(sheet).toContainText(text);
    }
    await expect(sheet.getByTestId('instructor-profile-student-chip-mobile')).toHaveText(`${student.lastName} ${student.firstName}`);
    await expect(sheet.getByTestId('instructor-profile-flight-row-mobile')).toHaveCount(1);
    await expect(sheet.getByTestId('instructor-profile-flight-row-mobile')).toContainText('1:00');
    await expect(sheet.locator('.bottom-sheet-kv').filter({ hasText: 'Ore nel mese' })).toContainText('1:00');
    // ...and the sheet keeps the entry to the person's record the pilots sheet
    // already had.
    await expect(sheet.getByTestId('instructor-open-profile-mobile')).toBeVisible();
    expect(await heightOf(sheet.getByTestId('instructor-open-profile-mobile'))).toBeGreaterThanOrEqual(44);

    await sheet.getByTestId('instructor-edit-mobile').click();
    await expect(page.getByTestId('mobile-instructor-sheet')).toHaveCount(0);
    await expect(page.getByTestId('instructor-identity-form')).toBeVisible();

    // The record entry really goes to the record.
    await page.goto('/it/dashboard/instructors');
    await row.click();
    await sheet.getByTestId('instructor-open-profile-mobile').click();
    await expect(page).toHaveURL(new RegExp(`/it/dashboard/people/${person.id}$`));

    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard/instructors');
    await expect(page.getByTestId('mobile-instructors-list')).toBeHidden();
    await expect(page.locator('.instructors-desktop-body')).toBeVisible();
  });

  test('the registry head keeps ONE node per control, all >=44px and above the tab bar, and the search still filters (AC 3, AC 8)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `T${uniqueSuffix()}`;
    const mine = await createAircraft(page, tag);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/fleet');

    for (const testId of FLEET_TESTIDS) {
      await expect(page.getByTestId(testId)).toHaveCount(1);
      expect(await heightOf(page.getByTestId(testId)), testId).toBeGreaterThanOrEqual(44);
    }

    // The search is the SAME input the desktop uses and still drives `?q=`.
    await page.getByTestId('fleet-search').fill(`I-${tag}`);
    await expect(page).toHaveURL(new RegExp(`q=I-${tag}`));
    await expect(page.getByTestId(`mobile-fleet-card-${mine.id}`)).toBeVisible();

    // The archived chip is the SAME toggle, one state, and it still navigates.
    await page.getByTestId('fleet-toggle-archived').click();
    await expect(page).toHaveURL(/includeArchived=true/);
    await expect(page.getByTestId('fleet-toggle-archived')).toHaveAttribute('aria-pressed', 'true');
    // ...and switching it ON must not reflow the head onto one more row under
    // the reader's thumb: measured in Italian, the pressed chip's check glyph
    // alone (20px with its gap) took the head from 175px to 227px.
    const pressed = await measureHead(page);
    expect(pressed.sameRow, 'chip pressed: still one row with the export menu').toBe(true);
    expect(pressed.height, 'chip pressed: head height').toBeLessThanOrEqual(192);

    // The export menu is the FOURTH control of the head and AC 3 covers it too
    // (review F4): its trigger lives inside `ExportMenu`'s own relative wrapper,
    // so the head's direct-child 44px rule never reached it and it stayed a 35px
    // target. It has no testid of its own — the structural locator is the head's
    // only `div > .btn` (the title carries no button, the search box an input).
    // Only the TARGET is in scope here: the menu itself is story 15.8.
    //
    // Same loop measures the head's own height and the row the chip and the
    // export trigger share: that is what keeps the head within its budget at
    // 375px (review F3, criterion "head <= its pre-fix height at 375px with
    // every target >=44px"). Measured pre-fix / after this pass:
    // Flotta 192 -> 175, Istruttori 150 -> 121, Piloti 149 -> 175 — the Piloti
    // head cannot meet it (28px of head padding + 3 rows of 44/46/44 + 2 gaps
    // = 175 against a pre-fix of exactly three 35px rows), and its budget below
    // is its post-15.5 value, not its pre-fix one.
    const headBudget: Record<string, number> = { fleet: 192, pilots: 179, instructors: 150 };
    for (const surface of ['fleet', 'pilots', 'instructors']) {
      await page.setViewportSize(PHONE);
      await page.goto(`/it/dashboard/${surface}`);
      const exportTrigger = page.locator('.registry-head > div > .btn');
      await expect(exportTrigger, surface).toHaveCount(1);
      expect(await heightOf(exportTrigger), `export trigger @${surface}`).toBeGreaterThanOrEqual(44);

      const head = await measureHead(page);
      expect(head.sameRow, `chip and export share a row @${surface}`).toBe(true);
      expect(head.height, `head height @${surface}`).toBeLessThanOrEqual(headBudget[surface]!);
    }

    // Nothing visible at the bottom of any of the three consoles sits under the
    // tab bar (z 5) or scrolls sideways behind the user's back — at the three
    // widths AC 8 names. `mobile-shell.spec.ts` only ever lands on the home.
    for (const viewport of [PHONE_NARROW, PHONE, PHONE_WIDE]) {
      await page.setViewportSize(viewport);
      for (const surface of ['fleet', 'pilots', 'instructors']) {
        await page.goto(`/it/dashboard/${surface}`);
        const geometry = await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          const bar = document.querySelector('.mobile-tabbar');
          const barTop = bar ? bar.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
          // The compact top bar is `position: sticky` (15.1): on a long list the
          // rows in the middle DO pass under it, by design. Only what sits below
          // it is in scope — the risk this check exists for is the FIXED tab bar
          // at the bottom (`mobile-shell.spec.ts`'s own method, which never
          // lands on these pages).
          const topBar = document.querySelector('.mobile-topbar');
          const topBarBottom = topBar ? topBar.getBoundingClientRect().bottom : 0;
          const bad: string[] = [];
          let checked = 0;
          for (const el of document.querySelectorAll('.page a, .page button')) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.top < topBarBottom || rect.top > window.innerHeight) continue;
            checked += 1;
            if (rect.bottom > barTop && rect.top < barTop) bad.push(`tabbar:${el.getAttribute('data-testid') ?? el.textContent!.slice(0, 20)}`);
            // A control the page has DISABLED (`.btn[aria-disabled="true"]` carries
            // `pointer-events: none` since 13.x — the pagination arrow at a
            // boundary) is not supposed to be hit-testable: `elementFromPoint`
            // returns its parent there, which is correct behaviour, not a
            // covered control. It still must not hide under the tab bar, so the
            // check above keeps it.
            if (el.getAttribute('aria-disabled') === 'true') continue;
            const hit = document.elementFromPoint(Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2));
            if (hit && hit !== el && !el.contains(hit)) bad.push(`covered:${el.getAttribute('data-testid') ?? el.textContent!.slice(0, 20)}`);
          }
          return {
            checked,
            bad,
            pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            // Declared exception: `.kpi-row` is a scroll strip BY DESIGN (R-15.2-f).
            hidden: [...document.querySelectorAll('.page *')]
              .filter(
                (el) =>
                  el.scrollWidth > el.clientWidth + 1 &&
                  !el.closest('.slideover') &&
                  !el.classList.contains('kpi-row') &&
                  getComputedStyle(el).textOverflow !== 'ellipsis',
              )
              .map((el) => String(el.className)),
          };
        });
        expect(geometry.checked, `${surface}@${viewport.width}`).toBeGreaterThan(0);
        expect(geometry.bad, `${surface}@${viewport.width}`).toEqual([]);
        expect(geometry.pageOverflow, `${surface}@${viewport.width}`).toBe(0);
        expect(geometry.hidden, `${surface}@${viewport.width}`).toEqual([]);
      }
    }
  });

  test('the paginated list keeps its ?page= contract with 44px targets at <=640px (ratifica R-15.5-j)', async ({ page }) => {
    test.slow();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `N${uniqueSuffix()}`;
    // 21 aircraft = two pages of the FILTERED list, deterministically, on any DB.
    const created: string[] = [];
    try {
      for (let index = 0; index < 21; index += 1) {
        const aircraft = await createAircraft(page, `${tag}${String(index).padStart(2, '0')}`, 'P92');
        created.push(aircraft.id);
      }

      await page.setViewportSize(PHONE);
      await searchFleet(page, `I-${tag}`);

      await expect(page.getByTestId('fleet-pagination-status')).toHaveText('1 / 2');
      for (const testId of ['fleet-page-prev', 'fleet-page-next']) {
        expect(await heightOf(page.getByTestId(testId)), testId).toBeGreaterThanOrEqual(44);
      }
      await page.getByTestId('fleet-page-next').click();
      await expect(page.getByTestId('fleet-pagination-status')).toHaveText('2 / 2');
      await expect(page).toHaveURL(/page=2/);
      await expect(page.getByTestId('mobile-fleet-grid').locator('[data-testid^="mobile-fleet-card-"]')).toHaveCount(1);
    } finally {
      // Archived again: 21 extra rows in every aircraft picker would feed the
      // open `OPTIONS_PAGE_SIZE = 100` ceiling on every run of this suite.
      for (const id of created) await page.request.post(`/api/v1/aircraft/${id}/archive`);
    }
  });

  test('the empty state of each phone list is exactly ONE node (AC 9-viii)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const missing = `ZZ${uniqueSuffix()}`;

    await page.setViewportSize(PHONE);
    await searchFleet(page, missing);
    await expect(page.getByTestId('mobile-fleet-empty')).toHaveCount(1);
    await expect(page.getByTestId('fleet-empty')).toHaveCount(1);
    await expect(page.getByTestId('fleet-empty')).toBeHidden();

    await searchPilots(page, missing);
    await expect(page.getByTestId('mobile-pilots-empty')).toHaveCount(1);
    await expect(page.getByTestId('pilots-empty')).toHaveCount(1);
    await expect(page.getByTestId('pilots-empty')).toBeHidden();
  });

  test('R-15.5-f: the primary save of pilot-editor NUOVO is hit-testable with the body at the top, on a viewport where the body scrolls (AC 5, AC 9-vii)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.setViewportSize(PHONE_SHORT);
    await page.goto('/it/dashboard/pilots');
    await page.getByTestId('pilots-new-button').click();
    await expect(page.getByTestId('pilot-identity-form')).toBeVisible();

    const probe = await page.evaluate(() => {
      const body = document.querySelector('.so-body') as HTMLElement;
      body.scrollTop = 0;
      const submit = document.querySelector('[data-testid="pilot-identity-submit"]') as HTMLElement;
      const rect = submit.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2));
      const panel = document.querySelector('.slideover-panel')!.getBoundingClientRect();
      return {
        bodyScrolls: body.scrollHeight > body.clientHeight,
        scrollTop: body.scrollTop,
        reachable: hit === submit || (hit !== null && submit.contains(hit)),
        actionsPosition: getComputedStyle(submit.closest('.so-actions')!).position,
        submitHeight: Math.round(rect.height),
        panelIsViewport: Math.abs(panel.width - window.innerWidth) <= 1 && Math.abs(panel.height - window.innerHeight) <= 1,
        anchoredRows: document.querySelectorAll('.so-actions').length,
      };
    });
    // The body really scrolls here — the assertion would be vacuous otherwise.
    expect(probe.bodyScrolls).toBe(true);
    expect(probe.scrollTop).toBe(0);
    expect(probe.reachable).toBe(true);
    expect(probe.actionsPosition).toBe('sticky');
    expect(probe.submitHeight).toBeGreaterThanOrEqual(44);
    expect(probe.panelIsViewport).toBe(true);
    // ONE anchored row per panel, never two stacked (AC 5-b).
    expect(probe.anchoredRows).toBe(1);
  });

  test('R-15.5-f: instructor-editor keeps ONE anchored primary row and its section submits where they were (AC 5-b/c)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `E${uniqueSuffix()}`;
    const person = await createPilot(page, tag);
    const activate = await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, { data: {} });
    expect(activate.status(), await activate.text()).toBe(200);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/instructors');
    // The desktop row is `display: none` here — the panel is reached the way a
    // phone user reaches it, through the sheet (R-15.5-i).
    await page.getByTestId(`mobile-instructor-row-${person.id}`).click();
    await page.getByTestId('mobile-instructor-sheet').getByTestId('instructor-edit-mobile').click();
    await expect(page.getByTestId('instructor-identity-form')).toBeVisible();

    // Story 15.10 (ratifica R-15.10-f) moved this panel's PRIMARY action out of
    // the scrolling body and into `SlideOver`'s `footer` (`.so-foot`), wired to
    // its form with `form="instructor-identity-form"`. What 15.5 could only
    // anchor with `position: sticky` — a sticky box cannot leave its containing
    // block, and this body scrolls 2642px inside 716px, so the bar ended at
    // `top -1383.53` with the submit not hit-testable — is now fixed for real.
    // The requirement this test guards is unchanged in substance (ONE primary
    // action for the panel, section submits left where they are); what changed
    // is WHERE the primary one lives, by a PO decision.
    const probe = await page.evaluate(() => {
      const body = document.querySelector('.so-body') as HTMLElement;
      const foot = document.querySelector('.so-foot');
      const submit = document.querySelector('[data-testid="instructor-identity-submit"]') as HTMLElement;
      const readHit = () => {
        const rect = submit.getBoundingClientRect();
        const hit = document.elementFromPoint(Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2));
        return { reachable: hit === submit || (hit !== null && submit.contains(hit)), height: Math.round(rect.height) };
      };
      body.scrollTop = 0;
      const atTop = readHit();
      body.scrollTop = body.scrollHeight;
      const atBottom = readHit();
      return {
        anchoredRows: document.querySelectorAll('.so-actions').length,
        primaryInFoot: !!(foot && foot.contains(submit)),
        primaryInBody: body.contains(submit),
        bodyScrolls: body.scrollHeight > body.clientHeight,
        atTop,
        atBottom,
        // The section submits stay ordinary in-body buttons (AC 5-c) — neither
        // anchored in a sticky row nor promoted into the panel's footer.
        sectionSubmitsAnchored: ['instructor-payout-rate-submit', 'instructor-rates-submit']
          .map((testId) => document.querySelector(`[data-testid="${testId}"]`))
          .filter((node) => node !== null && (node.closest('.so-actions') !== null || node.closest('.so-foot') !== null)).length,
      };
    });
    expect(probe.anchoredRows).toBe(0);
    expect(probe.primaryInFoot).toBe(true);
    expect(probe.primaryInBody).toBe(false);
    expect(probe.bodyScrolls).toBe(true);
    expect(probe.atTop.reachable).toBe(true);
    // The half 15.5 could not deliver: still reachable with the body scrolled
    // all the way down.
    expect(probe.atBottom.reachable).toBe(true);
    expect(probe.atTop.height).toBeGreaterThanOrEqual(44);
    expect(probe.sectionSubmitsAnchored).toBe(0);

    // Review F6: the body's bottom padding is zeroed only where the action row
    // is the LAST thing in it — there the padding would push the sticky bar up
    // (story 15.2's own measurement). Here the bar sits mid-panel, after the
    // identity form, so the panel keeps the 18px of breathing room under its
    // last control instead of leaving it flush against the bottom edge.
    const bottom = await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>('.so-body')!;
      body.scrollTop = body.scrollHeight;
      const last = body.children[body.children.length - 1]!;
      return {
        paddingBottom: getComputedStyle(body).paddingBottom,
        lastChildHoldsTheActions: last.querySelector('.so-actions') !== null,
        gap: Math.round(body.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom),
      };
    });
    expect(bottom.lastChildHoldsTheActions).toBe(false);
    expect(bottom.paddingBottom).toBe('18px');
    expect(bottom.gap).toBeGreaterThanOrEqual(16);
  });

  test('every desktop testid stays exactly ONE node at 375px AND at 1280px, on the three consoles and on the home (AC 6)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);

      await page.goto('/it/dashboard/fleet');
      for (const testId of [...FLEET_TESTIDS, 'fleet-card-widget']) {
        const expected = testId === 'fleet-card-widget' ? 0 : 1;
        await expect(page.getByTestId(testId), `${testId} @${viewport.width}`).toHaveCount(expected);
      }
      await expect(page.getByTestId('mobile-fleet-grid')).toHaveCount(1);

      await page.goto('/it/dashboard/pilots');
      for (const testId of PILOTS_TESTIDS) {
        await expect(page.getByTestId(testId), `${testId} @${viewport.width}`).toHaveCount(1);
      }
      await expect(page.getByTestId('mobile-pilots-list')).toHaveCount(1);

      await page.goto('/it/dashboard/instructors');
      await expect(page.getByTestId('instructors-new-button')).toHaveCount(1);
      await expect(page.getByTestId('mobile-instructors-list')).toHaveCount(1);

      // AD-2: `FleetCardGrid` is embedded on the home — no phone testid of this
      // story may exist there, at any width.
      await page.goto('/it/dashboard');
      await expect(page.getByTestId('fleet-card-widget')).toHaveCount(1);
      await expect(page.locator('[data-testid^="mobile-fleet-"]')).toHaveCount(0);
    }
  });

  test('scheda persona at <=640px: one column, no hidden side-scroll ANYWHERE — the estratto conto included since story 15.9 (AC 12)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const tag = `D${uniqueSuffix()}`;
    const person = await createPilot(page, tag);
    await registerBlockingExpiry(page, person.id, 'Licenza', 12);

    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/people/${person.id}`);
    await expect(page.getByRole('heading', { name: `${person.lastName} ${person.firstName}` })).toBeVisible();

    const geometry = await page.evaluate(() => {
      const grid = document.querySelector('.person-bottom-grid')!;
      const expiryRow = document.querySelector('[data-testid="person-expiry-row"]')!;
      return {
        bottomTracks: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        expiryTracks: getComputedStyle(expiryRow).gridTemplateColumns.split(' ').length,
        headerDisplay: getComputedStyle(document.querySelector('.person-expiries .student-row.header')!).display,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // TD 14.6 F4 (`account-section.tsx`, not responsive under ~700px) was
        // the ONLY declared exception of this sweep. Story 15.9 closed it —
        // the estratto conto is a card list on a phone — so the exclusion is
        // GONE: this sweep now covers the whole page, `account-section`
        // included, which is the binary proof that the debt is paid.
        hiddenOutsideAccount: [...document.querySelectorAll('.page *')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1 && !el.closest('.slideover') && getComputedStyle(el).textOverflow !== 'ellipsis')
          .map((el) => String(el.className)),
      };
    });
    expect(geometry.bottomTracks).toBe(1);
    expect(geometry.expiryTracks).toBe(2);
    expect(geometry.headerDisplay).toBe('none');
    expect(geometry.pageOverflow).toBe(0);
    expect(geometry.hiddenOutsideAccount).toEqual([]);

    // No duplicated text: the scadenze table is RE-PLACED, never mirrored.
    await expect(page.getByTestId('person-expiry-row')).toHaveCount(1);
    await expect(page.getByText('Licenza', { exact: true })).toHaveCount(1);

    // The header actions become full-width rows (R-15.3-d language).
    for (const button of await page.locator('.home-head-actions > .btn').all()) {
      expect(await heightOf(button)).toBeGreaterThanOrEqual(44);
    }

    await page.setViewportSize(PHONE_WIDE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.setViewportSize(PHONE_NARROW);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    // Review F5: `.info-row` is shared with the PUBLIC `/ppr` module, which is
    // story 15.9's surface. The dossier's wrap rule is anchored to this page's
    // own card, so the public module must read exactly as it does on a desktop
    // — the guard is on the surface the rule must NOT reach (lesson 15.3 F1).
    await page.setViewportSize(PHONE);
    await page.goto('/it/ppr');
    await expect(page.locator('.info-row .v').first()).toBeVisible();
    const publicWrap = await page.evaluate(() =>
      [...document.querySelectorAll('.info-row .v')].map((v) => `${getComputedStyle(v).overflowWrap}/${getComputedStyle(v).minWidth}`),
    );
    expect(new Set(publicWrap)).toEqual(new Set(['normal/auto']));
  });

  test('scheda persona: a pilot reaches their OWN record at 375px with the masking intact (AC 12, multi-actor)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const me = await page.request.get('/api/v1/me');
    expect(me.ok(), await me.text()).toBe(true);
    const personId = ((await me.json()) as { person: { id: string } | null }).person?.id;
    expect(personId).toBeTruthy();

    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/people/${personId}`);
    await expect(page.getByRole('heading', { name: 'Dati anagrafici' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    // The registries themselves stay ADMIN-only, at every width (asserted, not assumed).
    await page.goto('/it/dashboard/pilots');
    await expect(page).toHaveURL(/\/it\/dashboard$/);
    await page.goto('/it/dashboard/fleet');
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });
});
