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

  /** Ratifica R-15.3-f: on all THREE faces, not just the admin one (lesson 15.1 F1: a multi-actor rule verified on one actor is not verified). */
  test('the card is rendered on the pilota, allievo and istruttore faces too', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const put = await page.request.put('/api/v1/settings/metar-station', { data: { station: STATION } });
    expect(put.status()).toBe(200);
    const probe = await page.request.get('/api/v1/metar');
    const metar = (await probe.json()) as { raw?: string } | null;
    test.skip(!metar?.raw, 'upstream aviationweather.gov unreachable from this host');

    for (const email of ['pilot@airmanager.local', 'student@airmanager.local', 'instructor@airmanager.local']) {
      await page.context().clearCookies();
      await loginExpectingDashboard(page, email);
      await page.setViewportSize(PHONE);
      await page.goto('/it/dashboard');
      await expect(page.getByTestId('mobile-metar-card'), email).toBeVisible();
      await expect(page.getByTestId('mobile-metar-card'), email).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), email).toBe(true);
    }
  });
});
