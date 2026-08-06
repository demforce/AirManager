import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Story 15.3 — the phone Panoramica and the two personal landings.
 *
 * Each test is the guard of one rule introduced for a MEASURED defect (AC 11);
 * the comment above it names the rule and what the pre-fix state looked like,
 * so an edit that drops the rule turns this file red instead of silently
 * regressing the phone layout (lesson 15.1 F2).
 *
 * Isolation (non-negotiable, lesson 12.11 F1 / review Billing-2 F4): every test
 * builds its OWN aircraft/person/booking and asserts only on those, filtered by
 * a run-unique registration or surname. No global count is ever asserted with
 * an equality — the shared DB has concurrent writers. Nothing here writes
 * AppSettings, so the file stays in the `fullyParallel` project; the ONE part of
 * this story that does (the METAR station) lives in `mobile-metar.spec.ts`,
 * inside `playwright.config.ts`'s serialized chain.
 *
 * Viewports are set with `setViewportSize` inside the test (pattern 13.10, epic
 * decision: no duplicated Playwright project).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const STUDENT_EMAIL = 'student@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-overview.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 } as const;
const PHONE_WIDE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1280, height: 900 } as const;

/** Every desktop testid of the home that the epic's convention pins to exactly one node (AC 9). */
const DESKTOP_TESTIDS = [
  'dispatch-flight-button',
  'schedule-section',
  'bookings-list-section',
  'scadenze-widget',
  'fleet-card-widget',
  'kpi-flights-today',
  'kpi-fleet-available',
  'kpi-ppr-pending',
  'kpi-bookings-pending',
  'kpi-revenue',
];

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

async function createAircraft(page: Page, tag: string): Promise<{ id: string; registration: string }> {
  const registration = `I-M${tag}${uniqueSuffix()}`.slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Mobile 15.3', hourMeterMinutes: 60 },
  });
  expect(response.status()).toBe(201);
  return { id: ((await response.json()) as { id: string }).id, registration };
}

/** A fresh pilot PERSON (no login user: every booking below is created by the admin). */
async function createPilot(page: Page, tag: string): Promise<{ id: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const lastName = `Mob${tag}${suffix}`;
  const response = await page.request.post('/api/v1/people', { data: { firstName: 'Pilota', lastName } });
  expect(response.status()).toBe(201);
  const person = (await response.json()) as { id: string };
  const profile = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profile.status()).toBe(200);
  return { id: person.id, lastName };
}

type BookingSeed = { aircraftId: string; personId: string; startsAtMs: number; endsAtMs: number };

/**
 * A slot TOMORROW at `07:30Z + offsetMinutes`, i.e. 08:30/09:30 Europe/Rome
 * depending on DST.
 *
 * Not `Date.now() + minutes`: `createBooking` (and `transition` to APPROVED)
 * enforce the airfield's `sched.openTime`-`sched.closeTime` window when it is
 * configured, so a fixture anchored to the wall clock fails outright when the
 * suite happens to run at night — measured on this very spec, 422
 * `BOOKING_OUTSIDE_WINDOW` against the 07:00-21:00 window that
 * `booking-window.spec.ts` leaves behind. 07:30Z is inside every window the
 * suite ever sets, in both DST offsets, AND earlier than the `09:00Z` slot the
 * other specs use — which keeps this fixture near the top of the
 * `startsAt`-ascending PENDING window the mobile card shows.
 */
function safeSlotTomorrow(offsetMinutes: number, durationMinutes: number): { startsAtMs: number; endsAtMs: number } {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const start = new Date(`${tomorrow}T07:30:00.000Z`).getTime() + offsetMinutes * 60_000;
  return { startsAtMs: start, endsAtMs: start + durationMinutes * 60_000 };
}

async function createBooking(page: Page, seed: BookingSeed): Promise<string> {
  const response = await page.request.post('/api/v1/bookings', {
    data: {
      aircraftId: seed.aircraftId,
      personId: seed.personId,
      startsAt: new Date(seed.startsAtMs).toISOString(),
      endsAt: new Date(seed.endsAtMs).toISOString(),
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { booking: { id: string } }).booking.id;
}

/**
 * A booking straddling NOW cannot be CREATED (`createBooking` rejects
 * `startsAt <= now` with `BOOKING_IN_PAST`, for every actor). Staff, however, is
 * exempt from that check on UPDATE (`updateBooking`'s documented asymmetry:
 * "staff can correct an in-progress booking"), so the fixture is created in the
 * future and then moved onto NOW. Admin-created bookings are APPROVED, which is
 * what the card needs: `listCalendarBookings` is APPROVED-only.
 */
async function moveBooking(page: Page, id: string, startsAtMs: number, endsAtMs: number): Promise<void> {
  const response = await page.request.patch(`/api/v1/bookings/${id}`, {
    data: { startsAt: new Date(startsAtMs).toISOString(), endsAt: new Date(endsAtMs).toISOString() },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/** `elementFromPoint` on the element's own centre — the only honest proof that a box is reachable without scrolling. */
function reachable(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return (
    rect.left >= 0 &&
    rect.right <= window.innerWidth &&
    rect.top >= 0 &&
    rect.bottom <= window.innerHeight &&
    (atPoint === el || el.contains(atPoint))
  );
}

/**
 * A genuinely PENDING booking, created by the admin.
 *
 * A staff-created booking is born APPROVED, and `APPROVED -> PENDING` is not a
 * legal transition (`isLegalBookingTransition`: "riapri" only comes from
 * DENIED/FLOWN/NO_SHOW). The two legal hops below reach PENDING with public API
 * calls only, and avoid making every test in this file run the Mailpit invite
 * flow just to obtain a pilot login.
 */
async function createPendingBooking(page: Page, seed: BookingSeed): Promise<string> {
  const id = await createBooking(page, seed);
  for (const to of ['NO_SHOW', 'PENDING'] as const) {
    const response = await page.request.post(`/api/v1/bookings/${id}/transition`, { data: { to } });
    expect(response.status(), `${to}: ${await response.text()}`).toBe(200);
  }
  return id;
}

test.describe('story 15.3 — the CSS switch, measured on BOTH sides', () => {
  /**
   * Rules (i)/(ii): `.overview-mobile` is `display: none` OUTSIDE the media
   * query and every `.home-desktop-surface` is `display: none` INSIDE it. Before
   * the story the phone rendered the desktop console verbatim: a day calendar
   * only usable by horizontal scroll, an 8-column bookings table and a 2fr/1fr
   * split, all squeezed into 375px.
   *
   * Asserted on BOTH sides on purpose: a one-sided assertion ("the mobile cards
   * are visible") also passes on a page that simply hid everything.
   */
  test('admin: at 375px the mobile Panoramica IS the page and every desktop surface it replaces is display:none — at 1280px exactly the inverse', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    for (const viewport of [PHONE, PHONE_WIDE]) {
      await page.setViewportSize(viewport);
      await page.goto('/it/dashboard');

      // The five surfaces of the template, in the template's order.
      await expect(page.getByTestId('mobile-overview-inprogress')).toBeVisible();
      await expect(page.getByTestId('mobile-overview-pending-bookings')).toBeVisible();
      await expect(page.getByTestId('mobile-overview-alerts')).toBeVisible();
      await expect(page.getByTestId('mobile-overview-schedule-shortcut')).toBeVisible();
      await expect(page.getByTestId('mobile-overview-fleet-shortcut')).toBeVisible();

      const order = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.overview-mobile > *')].map((node) => node.getAttribute('data-testid') ?? node.className),
      );
      expect(order.slice(0, 3)).toEqual(['mobile-overview-inprogress', 'mobile-overview-pending-bookings', 'mobile-overview-alerts']);

      // The desktop surfaces are GONE, measured — not judged by eye.
      const desktopDisplays = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.home-desktop-surface')].map((node) => getComputedStyle(node).display),
      );
      expect(desktopDisplays.length).toBeGreaterThanOrEqual(3);
      expect(desktopDisplays.every((display) => display === 'none')).toBe(true);
      await expect(page.getByTestId('schedule-section')).toBeHidden();
      await expect(page.getByTestId('bookings-list-section')).toBeHidden();
      await expect(page.getByTestId('scadenze-widget')).toBeHidden();
      await expect(page.getByTestId('fleet-card-widget')).toBeHidden();

      // AC 10: no page-level horizontal overflow at either phone width.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }

    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard');
    expect(await page.locator('.overview-mobile').evaluate((el) => getComputedStyle(el).display)).toBe('none');
    await expect(page.getByTestId('mobile-overview-inprogress')).toBeHidden();
    await expect(page.getByTestId('mobile-overview-alerts')).toBeHidden();
    // ...and the four surfaces `home-dashboard.spec.ts` guards are untouched.
    await expect(page.getByTestId('schedule-section')).toBeVisible();
    await expect(page.getByTestId('bookings-list-section')).toBeVisible();
    await expect(page.getByTestId('scadenze-widget')).toBeVisible();
    await expect(page.getByTestId('fleet-card-widget')).toBeVisible();
  });

  /**
   * The whole point of the epic's testid convention (15.1): the mobile tree must
   * never claim a desktop name. One duplicate breaks Playwright strict mode for
   * the entire suite at ANY viewport, which is how the convention pays for
   * itself. Counted at both widths because both trees are always in the DOM.
   */
  test('every desktop testid of the home stays exactly ONE node, at 375px and at 1280px', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await page.goto('/it/dashboard');
      for (const testId of DESKTOP_TESTIDS) {
        await expect(page.getByTestId(testId), `${testId} at ${viewport.width}px`).toHaveCount(1);
      }
      // One heading, one KPI row, one `.kpi-value` per KPI (AD-3: the head and
      // the KPI strip are adapted in CSS, never duplicated).
      await expect(page.getByRole('heading', { name: 'Panoramica operativa' })).toHaveCount(1);
      expect(await page.locator('.kpi-row').count()).toBe(1);
      expect(await page.locator('.kpi-value').count()).toBe(5);
    }
  });
});

test.describe('story 15.3 — deciding a booking from the phone', () => {
  /**
   * Ratifica R-15.3-b: Approva/Nega live ONLY in the bottom sheet, so the card
   * is one button with no nested control. The rule under test is the whole
   * decision path on the phone — before this story the only way to approve was
   * the desktop table's action column, ~700px wide inside a 375px screen.
   */
  test('approve from the sheet: the row leaves the card and the desktop reads "Approvato"', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'AP');
    const pilot = await createPilot(page, 'Ap');
    const bookingId = await createPendingBooking(page, { aircraftId: aircraft.id, personId: pilot.id, ...safeSlotTomorrow(0, 30) });

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');
    const row = page.getByTestId('mobile-overview-pending-row').filter({ hasText: aircraft.registration });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(pilot.lastName);

    await row.click();
    const sheet = page.getByTestId('mobile-booking-sheet');
    await expect(sheet).toBeVisible();
    // Parity (AC 8): the sheet says at least what the card said, plus what the
    // card had no room for.
    await expect(sheet).toContainText(aircraft.registration);
    await expect(sheet).toContainText(pilot.lastName);
    // `Durata` is the SOURCE text; `.bottom-sheet-k`'s uppercase is CSS only.
    await expect(sheet).toContainText('Durata');

    await page.getByTestId('mobile-overview-approve').click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId('mobile-overview-pending-row').filter({ hasText: aircraft.registration })).toHaveCount(0);

    // Read the decision back from the API, filtered on the run-unique aircraft.
    //
    // NOT from the home's desktop card: that card is a WINDOW of 8 rows ordered
    // by `startsAt` over the last 48h, so on a shared DB with a hundred
    // bookings a given fixture simply is not in it — measured, this assertion
    // failed exactly that way on a populated DB. Asserting a fixture inside a
    // capped window is the "fotografia + uguaglianza" trap of review
    // Billing-2 F4. How the desktop RENDERS an APPROVED row is already guarded
    // by `bookings.spec.ts`; what this test owns is that a decision taken on
    // the phone is real.
    const decided = await page.request.get(`/api/v1/bookings?aircraftId=${aircraft.id}&status=APPROVED&pageSize=50`);
    expect(decided.status()).toBe(200);
    const approved = (await decided.json()) as { items: Array<{ id: string; status: string }> };
    expect(approved.items.map((item) => item.id)).toContain(bookingId);
  });

  /**
   * The rejection reason is a DOMAIN rule, not a UI choice
   * (`lib/schemas/bookings.ts`: mandatory for `to: 'DENIED'`), so the sheet's
   * second step (R-15.2-a) must validate client-side exactly like the desktop
   * modal: an empty reason produces an inline error and NO request at all. The
   * absence of a toast would not prove that, hence the counted route.
   */
  test('deny: an empty reason gives an inline error and ZERO network calls; with a reason the row leaves and the desktop shows the denyReason', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'DN');
    const pilot = await createPilot(page, 'Dn');
    const bookingId = await createPendingBooking(page, { aircraftId: aircraft.id, personId: pilot.id, ...safeSlotTomorrow(0, 30) });

    let transitionCalls = 0;
    await page.route(/\/api\/v1\/bookings\/[^/]+\/transition$/, async (route) => {
      transitionCalls += 1;
      await route.continue();
    });

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');
    await page.getByTestId('mobile-overview-pending-row').filter({ hasText: aircraft.registration }).click();
    await expect(page.getByTestId('mobile-booking-sheet')).toBeVisible();

    await page.getByTestId('mobile-overview-deny').click();
    // Review 15.2 F1's fix, applied here too: entering the step moves the focus
    // to what the step is about instead of dropping it on <body>.
    await expect(page.getByTestId('mobile-overview-deny-reason')).toBeFocused();
    await page.getByTestId('mobile-overview-deny-submit').click();
    await expect(page.getByTestId('mobile-overview-deny-error')).toBeVisible();
    expect(transitionCalls, 'an empty reason must never reach the network').toBe(0);
    // Same dialog node, not an overlay on an overlay (R-15.2-a).
    await expect(page.getByTestId('mobile-booking-sheet')).toHaveCount(1);

    const reason = `Rifiuto 15.3 ${aircraft.registration}`;
    await page.getByTestId('mobile-overview-deny-reason').fill(reason);
    await page.getByTestId('mobile-overview-deny-submit').click();
    await expect(page.getByTestId('mobile-booking-sheet')).toHaveCount(0);
    await expect(page.getByTestId('mobile-overview-pending-row').filter({ hasText: aircraft.registration })).toHaveCount(0);
    expect(transitionCalls).toBe(1);

    // Same reasoning as the approve test: read it back from the API on the
    // run-unique aircraft instead of hunting for the row inside the home card's
    // 8-row window. The `denyReason` the phone collected must be the one the
    // domain stored — that is the part this test owns.
    const decided = await page.request.get(`/api/v1/bookings?aircraftId=${aircraft.id}&status=DENIED&pageSize=50`);
    expect(decided.status()).toBe(200);
    const denied = (await decided.json()) as { items: Array<{ id: string; status: string; denyReason: string | null }> };
    const ours = denied.items.find((item) => item.id === bookingId);
    expect(ours?.status).toBe('DENIED');
    expect(ours?.denyReason).toBe(reason);
  });
});

test.describe('story 15.3 — "In corso ora" and the "Avvisi" feed', () => {
  /**
   * Ratifica R-15.3-a: the card shows the bookings covering THIS instant, and
   * says so ("In corso ora", not the template's "In volo ora" — the app has no
   * airborne state at all). The pure boundary is unit-tested on all four
   * confini in `src/lib/booking-day-phase.test.ts`; this proves the wiring, on
   * both sides of it.
   */
  test('a booking straddling now enters the card; a fully future one does not', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'IP');
    const pilot = await createPilot(page, 'Ip');
    const now = Date.now();

    // Both created inside the operating window, then ONE of them is moved onto
    // NOW — `updateBooking` is the only path with no window check, which is
    // what makes an "in corso ora" fixture possible at any hour of the day.
    const future = await createBooking(page, { aircraftId: aircraft.id, personId: pilot.id, ...safeSlotTomorrow(120, 60) });
    const straddling = await createBooking(page, { aircraftId: aircraft.id, personId: pilot.id, ...safeSlotTomorrow(0, 60) });
    await moveBooking(page, straddling, now - 10 * 60_000, now + 40 * 60_000);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');
    const rows = page.getByTestId('mobile-overview-inprogress-row').filter({ hasText: aircraft.registration });
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(pilot.lastName);
    // The head states the count and the badge the state, in the app's own lexicon.
    await expect(page.getByTestId('mobile-overview-inprogress')).toContainText('in corso');
    // The fully future booking is on the same aircraft: if it had leaked in,
    // the filtered count above would be 2.
    expect(future).toBeTruthy();
  });

  /**
   * Ratifica R-15.3-e: the feed merges scadenze, saldi negativi and PPR in
   * attesa. Order and cap are proven in unit (`src/lib/overview-alerts.test.ts`
   * — no e2e can fabricate 40 debtors without poisoning the suite); this proves
   * a REAL scadenza reaches the card. The fixture is overdue by a decade so it
   * sorts first inside rank 0 and the cap can never hide it, whatever the
   * concurrent specs did.
   */
  test('an expired scadenza of a fixture person shows up in the Avvisi feed', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilot(page, 'Al');

    const typesResponse = await page.request.get('/api/v1/expiry-types');
    expect(typesResponse.status()).toBe(200);
    const typesBody = (await typesResponse.json()) as { items?: Array<{ id: string; name: string; scope: string }> } | Array<{ id: string; name: string; scope: string }>;
    const types = Array.isArray(typesBody) ? typesBody : (typesBody.items ?? []);
    // `ALL`-scoped first: `registerExpiry` rejects a type whose scope does not
    // match one of the person's active profiles (`SCOPE_MISMATCH`).
    const candidates = [...types].sort((a, b) => Number(b.scope === 'ALL') - Number(a.scope === 'ALL'));
    const expiresAt = new Date(Date.now() - 3650 * 86_400_000).toISOString().slice(0, 10);
    let registered = false;
    for (const type of candidates) {
      const response = await page.request.post('/api/v1/expiries', { data: { personId: pilot.id, expiryTypeId: type.id, expiresAt } });
      if (response.status() === 201) {
        registered = true;
        break;
      }
    }
    expect(registered, 'no expiry type matched the fixture pilot profile').toBe(true);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');
    const feed = page.getByTestId('mobile-overview-alerts');
    await expect(feed).toBeVisible();
    await expect(feed.getByTestId('mobile-overview-alert-row').filter({ hasText: pilot.lastName })).toHaveCount(1);
    // Every voice leads somewhere it can be acted on (AC 4).
    await expect(feed.getByTestId('mobile-overview-alert-row').first()).toHaveAttribute('href', /\/dashboard\//);
  });
});

test.describe('story 15.3 — the two personal landings on the phone', () => {
  /**
   * Ratifica R-15.3-c, and the guard written on the side the rule LIBERATED
   * (lesson 15.2 on the blind guard): the assertion is NOT "the row exists" nor
   * "the first KPI is visible" — the 15.2 strip already held both. It is that
   * all FOUR KPIs are reachable with `scrollLeft === 0`, which in the strip they
   * were not (`mobile-primitives.spec.ts:195` asserts the last one is
   * `reachable() === false` there). The discriminance is proven in the same
   * test: dropping the modifier class puts the page back on the strip and the
   * fourth KPI becomes unreachable again.
   */
  test('pilota and allievo: the same mobile face, all 4 KPIs reachable without scrolling, the CTA only for the pilot', async ({ page }) => {
    for (const email of [PILOT_EMAIL, STUDENT_EMAIL]) {
      await page.context().clearCookies();
      await loginExpectingDashboard(page, email);
      await page.setViewportSize(PHONE);
      await page.goto('/it/dashboard');

      await expect(page.getByRole('heading', { name: /^Ciao, /u })).toHaveCount(1);
      await expect(page.getByTestId('pilot-landing-upcoming-mobile')).toBeVisible();
      // The desktop card it replaces is measured gone, not assumed.
      expect(await page.locator('.home-desktop-surface').first().evaluate((el) => getComputedStyle(el).display)).toBe('none');

      const strip = page.locator('.kpi-row');
      await expect(strip).toHaveCount(1);
      const grid = await strip.evaluate((row) => ({
        display: getComputedStyle(row).display,
        scrollLeft: row.scrollLeft,
        rowOverflow: row.scrollWidth - row.clientWidth,
        children: row.children.length,
      }));
      expect(grid.display).toBe('grid');
      expect(grid.children).toBe(4);
      expect(grid.scrollLeft).toBe(0);
      expect(grid.rowOverflow).toBeLessThanOrEqual(0);
      const reachableFlags = await strip.locator(':scope > *').evaluateAll((nodes, fn) => {
        const test = new Function(`return (${fn})`)() as (el: HTMLElement) => boolean;
        return (nodes as HTMLElement[]).map((node) => test(node));
      }, reachable.toString());
      expect(reachableFlags, 'all four KPIs must be readable without a swipe').toEqual([true, true, true, true]);

      // Discriminance: without the modifier the row is the 15.2 strip again and
      // the last KPI is no longer reachable — the assertion above would fail.
      const asStrip = await strip.evaluate((row, fn) => {
        const test = new Function(`return (${fn})`)() as (el: HTMLElement) => boolean;
        row.classList.remove('kpi-row-grid');
        const flags = [...row.children].map((child) => test(child as HTMLElement));
        row.classList.add('kpi-row-grid');
        return flags;
      }, reachable.toString());
      expect(asStrip.at(-1), 'pre-fix simulation must NOT be reachable, or this guard is blind').toBe(false);

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      // Review 14.6 F2's gate, unchanged: permission AND an active pilot profile.
      const bookCtas = await page.getByTestId('pilot-landing-book-cta').count();
      expect(bookCtas, email).toBe(email === PILOT_EMAIL ? 1 : 0);
    }
  });

  /**
   * AC 7: "La mia giornata" on the phone, with the template's LEFT time column,
   * and no creation CTA at all (ratifica 12.12 n.3). The empty state must stay
   * ONE node — a duplicate is exactly the defect the testid convention exists to
   * prevent (precedent: `mobile-primitives.spec.ts:71`).
   */
  test('istruttore: the mobile day list carries the time column, and neither empty state is duplicated', async ({ page }) => {
    await loginExpectingDashboard(page, INSTRUCTOR_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');

    await expect(page.getByRole('heading', { name: /^Buongiorno, /u })).toHaveCount(1);
    await expect(page.getByTestId('instructor-landing-myday-mobile')).toBeVisible();
    await expect(page.getByTestId('instructor-landing-myday-empty')).toHaveCount(1);
    await expect(page.getByTestId('instructor-landing-myday-empty-mobile')).toHaveCount(1);
    await expect(page.getByTestId('dispatch-flight-button')).toHaveCount(0);
    await expect(page.getByTestId('pilot-landing-book-cta')).toHaveCount(0);
    await expect(page.getByTestId('instructor-landing-logbook-cta')).toHaveCount(1);

    // The time column only exists on this variant.
    expect(await page.locator('.landing-mobile .mobile-row-timed').count()).toBe(await page.getByTestId('instructor-landing-myday-row-mobile').count());
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

test.describe('story 15.3 — keyboard and nesting', () => {
  /**
   * AC 8: the card is ONE `<button>` with a speaking accessible name and no
   * nested interactive element, and the sheet keeps the 15.1 keyboard baseline
   * (focus into the panel, Escape closes, focus returns to the trigger).
   */
  test('the card opens from the keyboard, the focus enters the sheet and returns to the trigger, and no control is nested inside another', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'KB');
    const pilot = await createPilot(page, 'Kb');
    const now = Date.now();
    const booking = await createBooking(page, { aircraftId: aircraft.id, personId: pilot.id, ...safeSlotTomorrow(0, 60) });
    await moveBooking(page, booking, now - 5 * 60_000, now + 45 * 60_000);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');

    const nesting = await page.evaluate(() => ({
      buttonInButton: document.querySelectorAll('.overview-mobile button button, .landing-mobile button button').length,
      anchorInButton: document.querySelectorAll('.overview-mobile button a, .landing-mobile button a').length,
    }));
    expect(nesting).toEqual({ buttonInButton: 0, anchorInButton: 0 });

    const trigger = page.getByTestId('mobile-overview-inprogress-row').filter({ hasText: aircraft.registration });
    // A speaking name, not a bare "Apri" (AC 8).
    await expect(trigger).toHaveAttribute('aria-label', new RegExp(`${pilot.lastName}`));
    await trigger.focus();
    await page.keyboard.press('Enter');

    const sheet = page.getByTestId('mobile-booking-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('dialog')).toHaveAttribute('aria-label', /Prenotazione/);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="mobile-booking-sheet"]'))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('mobile-overview-inprogress-row');
  });
});

test.describe('story 15.3 — review fixes', () => {
  /**
   * Review 15.3 F2. The card's "the row on screen is dead, close and refresh"
   * mitigation was keyed on the 409, but the scenario it exists for — somebody
   * else decided this booking first — answers **422**
   * (`BOOKING_TRANSITION_INVALID`; `ConflictError -> 409` is slot overlap).
   * The sheet therefore stayed open over a row that no longer existed in that
   * state, and every further tap produced the same error.
   *
   * The guard is discriminant by construction: it asserts the sheet CLOSES and
   * the row LEAVES after an out-of-band decision. Against the pre-fix code
   * (`if (outcome.conflict)`) both assertions fail, because 422 leaves
   * `conflict` false.
   */
  test('a booking decided by somebody else while the sheet is open: the sheet closes and the dead row leaves', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'ST');
    const pilot = await createPilot(page, 'St');
    await createPendingBooking(page, { aircraftId: aircraft.id, personId: pilot.id, ...safeSlotTomorrow(0, 30) });

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');
    const row = page.getByTestId('mobile-overview-pending-row').filter({ hasText: aircraft.registration });
    await expect(row).toHaveCount(1);
    await row.click();
    const sheet = page.getByTestId('mobile-booking-sheet');
    await expect(sheet).toBeVisible();

    // Somebody else decides it — out of band, exactly as a second operator would.
    const decided = await page.request.get(`/api/v1/bookings?aircraftId=${aircraft.id}&status=PENDING&pageSize=5`);
    const pending = (await decided.json()) as { items: Array<{ id: string }> };
    const outOfBand = await page.request.post(`/api/v1/bookings/${pending.items[0]!.id}/transition`, { data: { to: 'APPROVED' } });
    expect(outOfBand.status()).toBe(200);

    await page.getByTestId('mobile-overview-approve').click();
    // The response is a 422, NOT a 409 — this is the whole point of the fix.
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId('mobile-overview-pending-row').filter({ hasText: aircraft.registration })).toHaveCount(0);
  });

  /**
   * Review 15.3 F4. The admin face mounts TWO sheet owners ("In corso ora" and
   * "Prenotazioni in attesa"). Focus can leave an open sheet — the trap is
   * story 15.10's — and reaching a row behind it used to open a SECOND sheet
   * without closing the first: two `role="dialog"`, two scrims, and one testid
   * matching twice, which AC 9 forbids.
   *
   * `focus()` is the honest reproduction of the escape (a click would be eaten
   * by the scrim, which is precisely why the defect is invisible to a click
   * test). Against the pre-fix chassis this asserts 2 dialogs and fails.
   */
  test('opening a second sheet closes the first: never two dialogs, never a duplicated testid', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'TW');
    const pilot = await createPilot(page, 'Tw');
    const now = Date.now();
    const inProgress = await createBooking(page, { aircraftId: aircraft.id, personId: pilot.id, ...safeSlotTomorrow(0, 60) });
    await moveBooking(page, inProgress, now - 5 * 60_000, now + 45 * 60_000);
    await createPendingBooking(page, { aircraftId: aircraft.id, personId: pilot.id, ...safeSlotTomorrow(180, 30) });

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');

    await page.getByTestId('mobile-overview-inprogress-row').filter({ hasText: aircraft.registration }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('mobile-booking-sheet')).toBeVisible();

    // Escape the open sheet the way the keyboard does, and open the other one.
    await page.getByTestId('mobile-overview-pending-row').filter({ hasText: aircraft.registration }).focus();
    await page.keyboard.press('Enter');

    // `getByRole`, not `[role="dialog"]` (story 15.10): `SlideOver` is a real
    // dialog now, and this page mounts several of them CLOSED — the attribute
    // selector counts 4. The accessibility tree counts what this test is about:
    // a closed panel is `aria-hidden` + `inert`, so it is not a dialog for
    // anyone, and the assertion reads "exactly one dialog is EXPOSED".
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByTestId('mobile-booking-sheet')).toHaveCount(1);
  });

  /**
   * Review 15.3 F5. AC 4 / R-15.3-e put the Avvisi feed on the admin face ONLY,
   * and it carries other people's financial data (`listNegativeBalances` is
   * `finance.manage`-gated). The rule held when the reviewer attacked it, but
   * nothing asserted it: moving `MobileAlertsCard` into shared markup would
   * have turned nothing red. AC 11's own rule — a rule without a guard is a
   * rule that can disappear.
   */
  for (const actor of [
    { label: 'pilota', email: PILOT_EMAIL },
    { label: 'allievo', email: STUDENT_EMAIL },
    { label: 'istruttore', email: INSTRUCTOR_EMAIL },
  ]) {
    test(`the Avvisi feed does not exist on the ${actor.label} face`, async ({ page }) => {
      await loginExpectingDashboard(page, actor.email);
      await page.setViewportSize(PHONE);
      await page.goto('/it/dashboard');
      await expect(page.getByTestId('mobile-overview-alerts')).toHaveCount(0);
      await expect(page.getByTestId('mobile-overview-alert-row')).toHaveCount(0);
    });
  }
});
