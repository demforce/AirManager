import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Story 15.3, AC 5 — the "Meteo campo" card of the mobile home.
 *
 * Why its own file, and why inside `playwright.config.ts`'s SERIALIZED chain:
 * the card only renders when a METAR station is configured, and on a fresh seed
 * none is (`getMetarStation()` falls back to `getAirfieldIcao()`, itself `''`).
 * Configuring one is a write to a GLOBAL `AppSetting` row, which is exactly the
 * requirement CLAUDE.md pins to the serialized chain — under `fullyParallel` it
 * would make the sidebar weather card appear, and one upstream METAR fetch fire,
 * under every other spec's feet. Last in the chain: nothing downstream reads it.
 *
 * The card is also the ONE assertion in this story that depends on a THIRD-PARTY
 * service (aviationweather.gov). `getMetar` degrades every failure to `null` by
 * contract, so on a host without egress the card legitimately does not exist:
 * the test then skips with a message instead of failing, and says so.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-metar.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 } as const;
const DESKTOP = { width: 1280, height: 900 } as const;
/** Milan Linate: a busy international field, so its METAR is always published. */
const STATION = 'LIML';

async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

test.describe.configure({ mode: 'serial' });

test.describe('story 15.3 — card METAR (ratifica R-15.3-f)', () => {
  test.afterAll(async ({ browser }) => {
    // Back to "no station configured", the state every other spec expects.
    const page = await browser.newPage();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.request.put('/api/v1/settings/metar-station', { data: { station: '' } });
    await page.close();
  });

  /**
   * Rules (iv)/(v): the card exists ONLY at <=640px, and a real (long, unbroken)
   * METAR line must not push the page wider than the screen.
   *
   * Measured pre-fix state, and the reason the card exists at all: `.sidebar` is
   * `display: none` at <=640px and `.weather-card` is hidden from 900px down
   * (rail of 13.10), while `mobile-top-bar.tsx` never mentions the METAR — so on
   * a phone the airfield weather was not reachable anywhere in the app.
   */
  test('at 375px the card is the only place the METAR exists; at 1280px it is gone and the sidebar card is back', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const put = await page.request.put('/api/v1/settings/metar-station', { data: { station: STATION } });
    expect(put.status(), await put.text()).toBe(200);

    const probe = await page.request.get('/api/v1/metar');
    expect(probe.status()).toBe(200);
    const metar = (await probe.json()) as { raw?: string } | null;
    test.skip(!metar?.raw, 'upstream aviationweather.gov unreachable from this host: getMetar degraded to null by contract');

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');

    const card = page.getByTestId('mobile-metar-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(STATION);
    await expect(page.getByTestId('mobile-metar-raw')).toContainText(STATION);
    // No client-side fetch: the card is server-rendered from the page's own read.
    await expect(page.locator('.weather-card')).toBeHidden();
    // Exactly one node — the card is rendered by the page, once per face.
    await expect(card).toHaveCount(1);

    // AC 1's ORDER rule, guarded where the card actually exists (review F8).
    // `mobile-overview.spec.ts` cannot do this: it runs in the `chromium`
    // project, where no METAR station is configured, so at that moment the card
    // is not in the tree at all and its `order.slice(0, 3)` stays green for a
    // card that slid to the bottom of the page. Measured: moving `{metarCard}`
    // below `.mobile-shortcuts` leaves that assertion green, and this one red.
    // Whole list, not a prefix — a prefix is blind to exactly the tail moves.
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('.overview-mobile > *')].map(
          (n) => n.getAttribute('data-testid') ?? n.className,
        ),
      ),
    ).toEqual([
      'mobile-overview-inprogress',
      'mobile-overview-pending-bookings',
      'mobile-overview-alerts',
      'mobile-metar-card',
      'mobile-shortcuts',
    ]);

    // A bad-weather METAR is a long line, and it must wrap instead of being
    // clipped by `.card{overflow:hidden}`. Injected by text-node substitution
    // (lesson 13.10): a fresh DB never produces the worst case on demand.
    //
    // Two probes, because they do NOT prove the same thing (measured):
    // - the realistic long line has SPACES, so normal word wrapping already
    //   handles it: with the rule removed, box overflow stays 0. That probe
    //   guards the AC-10 page invariant, not the wrap rule;
    // - a single UNBROKEN token is what `overflow-wrap: anywhere` is actually
    //   for. Measured with the rule removed: box overflow 143px and the card
    //   clips 126px of the METAR (page overflow still 0 — `.card` hides it,
    //   which is exactly why the page-level check cannot see this defect).
    const overflow = await page.evaluate(() => {
      const raw = document.querySelector('[data-testid="mobile-metar-raw"]');
      if (!raw) return null;
      const read = () => ({
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        boxOverflow: raw.scrollWidth - raw.clientWidth,
      });
      const asRendered = read();
      raw.textContent =
        'LIML 301650Z AUTO 29008G22KT 250V330 1200SW R35L/0600V1200U R35R/0550N -SNRA FZFG VV002 BKN004 OVC010CB M03/M04 Q1017 REDRW35L WS ALL RWY TEMPO 0800 SN BKN002 RMK MON LIB VIS MIN 1200 VIA LIML/MIL';
      const longLine = read();
      raw.textContent = 'LIML301650ZAUTO29008G22KT250V3301200SWR35L/0600V1200UR35R/0550N-SNRAFZFGVV002BKN004OVC010CBM03/M04Q1017REDRW35LWSALLRWY';
      return { asRendered, longLine, unbrokenToken: read() };
    });
    expect(overflow?.asRendered.pageOverflow).toBeLessThanOrEqual(0);
    expect(overflow?.longLine.pageOverflow, 'a long raw METAR must wrap, never widen the page').toBeLessThanOrEqual(0);
    expect(overflow?.longLine.boxOverflow).toBeLessThanOrEqual(0);
    expect(overflow?.unbrokenToken.boxOverflow, 'an unbroken token must wrap inside the box, not be clipped by the card').toBeLessThanOrEqual(0);
    expect(overflow?.unbrokenToken.pageOverflow).toBeLessThanOrEqual(0);

    // Above the breakpoint: the page card is gone and the sidebar's is back.
    // NOTE (documented deviation from AC 5's wording): with the epic's CSS-only
    // switch the node is always in the DOM, so `toHaveCount(0)` is unreachable
    // by construction — `toBeHidden()` plus a zero-width box is the strongest
    // available assertion, and it is what AC 1 asks for everywhere else.
    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard');
    await expect(card).toBeHidden();
    expect(await card.evaluate((el) => el.getBoundingClientRect().width)).toBe(0);
    await expect(page.locator('.weather-card')).toBeVisible();
  });

  /**
   * Story 15.10, ratifica R-15.10-k — the 641-900px band.
   *
   * `.weather-card` is hidden from 900px down (the 64px rail, 13.10) and this
   * card only existed at <=640, so on a tablet in portrait (768px) the airfield
   * weather existed NOWHERE. Measured pre-fix at 641, 800 and 900: neither node
   * on screen, `.overview-mobile` `display: none`.
   *
   * It lives HERE, and not in the new 15.10 files, for the reason this whole
   * file exists: seeing the card at all means the station is configured, and
   * that is a global `AppSetting` write — the requirement CLAUDE.md pins to the
   * serialized chain. Declared before it was written (Dev Agent Record).
   *
   * The recon read the gap off the two `display` rules; the REAL gate is the
   * CONTAINER (`.overview-mobile`/`.landing-mobile` are `display: none` outside
   * the phone query), so the rule opens the container in the band and hides
   * every OTHER child — two trees on screen at once is what the epic forbids.
   * That is what the second half of this test measures.
   */
  test('story 15.10: in the 641-900px band the card is the ONLY visible child of the mobile tree, and above 900 nothing changes', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const put = await page.request.put('/api/v1/settings/metar-station', { data: { station: STATION } });
    expect(put.status(), await put.text()).toBe(200);
    const probe = await page.request.get('/api/v1/metar');
    const metar = (await probe.json()) as { raw?: string } | null;
    test.skip(!metar?.raw, 'upstream aviationweather.gov unreachable from this host: getMetar degraded to null by contract');

    for (const width of [641, 768, 900]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/it/dashboard');
      await page.waitForSelector('.page');
      const card = page.getByTestId('mobile-metar-card');
      await expect(card, `${width}px`).toBeVisible();
      await expect(card, `${width}px`).toHaveCount(1);
      await expect(page.locator('.weather-card'), `${width}px: the sidebar card is still hidden by the rail rule`).toBeHidden();

      // The card is the ONLY child of the mobile tree that shows here: the
      // desktop surfaces are the ones on screen, and a second visible tree
      // would double every testid the desktop guards read.
      const visibleChildren = await page.evaluate(() =>
        [...document.querySelectorAll('.overview-mobile > *')]
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => node.getAttribute('data-testid') ?? node.className),
      );
      expect(visibleChildren, `${width}px`).toEqual(['mobile-metar-card']);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px`).toBe(true);
    }

    // One pixel above the band: exactly the pre-15.10 behaviour — the mobile
    // card is gone and the SIDEBAR card is back (the 13.10 rail rule that hides
    // `.weather-card` is itself a `max-width: 900px` rule, so 901 is where the
    // two swap; that swap is what makes the band a gap in the first place).
    await page.setViewportSize({ width: 901, height: 900 });
    await page.goto('/it/dashboard');
    await page.waitForSelector('.page');
    await expect(page.getByTestId('mobile-metar-card')).toBeHidden();
    await expect(page.locator('.weather-card')).toBeVisible();
  });

  /** Ratifica R-15.3-f: on all THREE faces, not just the admin one (lesson 15.1 F1: a multi-actor rule verified on one actor is not verified). */
  test('the card is rendered on the pilota, allievo and istruttore faces too', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const put = await page.request.put('/api/v1/settings/metar-station', { data: { station: STATION } });
    expect(put.status()).toBe(200);
    const probe = await page.request.get('/api/v1/metar');
    const metar = (await probe.json()) as { raw?: string } | null;
    test.skip(!metar?.raw, 'upstream aviationweather.gov unreachable from this host');

    // The list each face puts ABOVE the METAR card: the pilota and the allievo
    // share the pilot landing, the istruttore has their own (page.tsx).
    const faces = [
      { email: 'pilot@airmanager.local', list: 'pilot-landing-upcoming-mobile' },
      { email: 'student@airmanager.local', list: 'pilot-landing-upcoming-mobile' },
      { email: 'instructor@airmanager.local', list: 'instructor-landing-myday-mobile' },
    ];

    for (const { email, list } of faces) {
      await page.context().clearCookies();
      await loginExpectingDashboard(page, email);
      await page.setViewportSize(PHONE);
      await page.goto('/it/dashboard');
      await expect(page.getByTestId('mobile-metar-card'), email).toBeVisible();
      await expect(page.getByTestId('mobile-metar-card'), email).toHaveCount(1);
      // Same order rule as the admin face (review F8): on these two landings
      // `.landing-mobile` is exactly [list, METAR], and nothing else asserts it.
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll('.landing-mobile > *')].map(
            (n) => n.getAttribute('data-testid') ?? n.className,
          ),
        ),
        email,
      ).toEqual([list, 'mobile-metar-card']);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), email).toBe(true);
    }
  });
});
