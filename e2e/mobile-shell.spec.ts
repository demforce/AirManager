import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Mobile shell (story 15.1): bottom tab bar, "Altro" sheet, compact top bar
 * with the profile menu. Pure shell chrome — every test only READS (no
 * fixtures, no global `AppSettings` write), so this file stays in the
 * `fullyParallel` project, outside `playwright.config.ts`'s serialized chain.
 *
 * Pattern 13.10: the mobile viewport is set with `setViewportSize` inside the
 * test (no dedicated Playwright project for now — epic 15 revisits that at
 * the end). Selectors use the mobile testid convention fixed by this story
 * (`mobile-nav.tsx`'s doc comment): `-mobile` suffix where a desktop surface
 * is duplicated, plain `mobile-*` names for mobile-only surfaces.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-shell.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example) — migrate + seed the DB first.');
}

const PHONE = { width: 375, height: 812 };

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

test.describe('Mobile shell — tab bar and "Altro" sheet (story 15.1, AC 1/2/3)', () => {
  test('admin: 4 priority tabs + "Altro", navigation from both, and exactly one nav landmark per breakpoint', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');

    // AC 1: below 640px the sidebar is gone from the accessibility tree and
    // the tab bar IS the "Aree operative" landmark (lesson 103-F1: exactly
    // one, or every landmark-scoped selector in the suite becomes ambiguous).
    await expect(page.getByRole('navigation', { name: 'Aree operative' })).toHaveCount(1);
    await expect(page.getByTestId('mobile-tab-bar')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.topbar')).toBeHidden();

    // AC 2: the template's own admin bar — 4 slots + "Altro".
    await expect(page.getByTestId('mobile-tab-overview')).toHaveAttribute('aria-current', 'page');
    for (const id of ['overview', 'schedule', 'ppr', 'fleet']) {
      await expect(page.getByTestId(`mobile-tab-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('mobile-tab-more')).toBeVisible();
    // Nothing else made it into the bar (the other 8 items live in the sheet).
    await expect(page.getByTestId('mobile-tab-bar').getByRole('link')).toHaveCount(4);

    // Navigation from the bar.
    await page.getByTestId('mobile-tab-schedule').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/bookings$/);
    await expect(page.getByTestId('mobile-tab-schedule')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('mobile-tab-overview')).not.toHaveAttribute('aria-current', 'page');

    // AC 3: the sheet — opens, navigates, and closes on navigation.
    const moreTab = page.getByTestId('mobile-tab-more');
    await expect(moreTab).toHaveAttribute('aria-expanded', 'false');
    await moreTab.click();
    await expect(page.getByTestId('mobile-more-sheet')).toBeVisible();
    await expect(moreTab).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('mobile-more-sheet').getByRole('link')).toHaveCount(8);

    await page.getByTestId('mobile-more-pilots').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/pilots$/);
    await expect(page.getByTestId('mobile-more-sheet')).toHaveCount(0);
    // A route hidden behind "Altro" lights up the "Altro" tab itself.
    await expect(moreTab).toHaveClass(/active/);

    // Scrim click closes.
    await moreTab.click();
    await expect(page.getByTestId('mobile-more-sheet')).toBeVisible();
    await page.getByTestId('mobile-more-sheet-scrim').click();
    await expect(page.getByTestId('mobile-more-sheet')).toHaveCount(0);

    // Escape closes. (Allowed here: this sheet is NOT inside a `SlideOver` —
    // the CLAUDE.md ban is about Escape closing a whole SlideOver panel while
    // the assertions that follow race its closing animation.)
    await moreTab.click();
    await expect(page.getByTestId('mobile-more-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-more-sheet')).toHaveCount(0);
    await expect(moreTab).toHaveAttribute('aria-expanded', 'false');

    // AC 1, other side of the switch: above 640px the mobile tree disappears
    // and the sidebar is the landmark again — still exactly one.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('navigation', { name: 'Aree operative' })).toHaveCount(1);
    await expect(page.getByTestId('mobile-tab-bar')).toBeHidden();
    await expect(page.getByTestId('mobile-topbar')).toBeHidden();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.topbar')).toBeVisible();
  });

  /**
   * Epic 15 R1 is a PO ratification with an exact number in it — tablets
   * (641-900px) KEEP the 64px rail of story 13.10, only phones switch. The
   * two tests above sit at 375 and 1280, so nothing would notice a breakpoint
   * edited to, say, 768px; this pins both sides of the 640/641 edge.
   */
  test('R1 boundary: 641px still gets the tablet rail, 640px is already the phone shell', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.setViewportSize({ width: 641, height: 900 });
    await page.goto('/it/dashboard');
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.getByTestId('mobile-tab-bar')).toBeHidden();
    // The 13.10 rail, not the full sidebar: labels collapse, the icons stay.
    expect(await page.locator('.app').evaluate((el) => getComputedStyle(el).gridTemplateColumns)).toMatch(/^64px /);

    await page.setViewportSize({ width: 640, height: 900 });
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.getByTestId('mobile-tab-bar')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Aree operative' })).toHaveCount(1);
  });

  test('pilot: its own 5 tabs, no "Altro", no admin-only route (AC 2, R2)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');

    const bar = page.getByTestId('mobile-tab-bar');
    await expect(bar.getByRole('link')).toHaveCount(5);
    for (const id of ['overview', 'schedule', 'scadenze', 'logbook', 'myAccount']) {
      await expect(page.getByTestId(`mobile-tab-${id}`)).toBeVisible();
    }
    // <= 5 items means no overflow sheet at all, and no admin route leaks in.
    await expect(page.getByTestId('mobile-tab-more')).toHaveCount(0);
    await expect(page.getByTestId('mobile-tab-ppr')).toHaveCount(0);

    await page.getByTestId('mobile-tab-myAccount').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/my-account$/);
  });
});

test.describe('Mobile shell — top bar and profile menu (story 15.1, AC 4/5)', () => {
  test('the avatar opens the profile menu: language switch keeps pathname AND query, logout works', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/it/dashboard/bookings?view=week&date=2026-08-05');

    // AC 4: the compact bar shows the page title from the same registry
    // lookup the desktop breadcrumb uses.
    await expect(page.getByTestId('mobile-topbar')).toContainText('Pianificazione');

    const trigger = page.getByTestId('mobile-profile-button');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    const menu = page.getByTestId('mobile-profile-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Admin AirManager');

    // AC 5: the IT/EN switch preserves pathname AND query string (13.8 F1).
    await page.getByTestId('locale-switch-mobile').click();
    await expect(page).toHaveURL(/\/en\/dashboard\/bookings\?view=week&date=2026-08-05$/);

    // Reopen in the new locale and log out (the ONLY logout control on mobile).
    await page.getByTestId('mobile-profile-button').click();
    await expect(page.getByTestId('mobile-profile-menu')).toBeVisible();
    await page.getByTestId('logout-button-mobile').click();
    await expect(page).toHaveURL(/\/en\/login$/);
  });
});

test.describe('Mobile shell — bottom geometry (story 15.1, AC 6)', () => {
  test('with the tab bar present nothing at the end of the page is covered, and the last control stays hit-testable', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');

    const geometry = await page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const content = document.querySelector('.page')!;
      const bar = document.querySelector('.mobile-tabbar')!.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();

      // Hit test at the very end of the page content (4px above its bottom
      // edge): whatever is painted there must be the content itself, never
      // the fixed bar.
      const atContentEnd = document.elementFromPoint(contentRect.left + contentRect.width / 2, contentRect.bottom - 4);

      // ...and no interactive control currently in the viewport has its own
      // centre swallowed by the bar (`elementFromPoint`, not a Playwright
      // click: `scrollIntoViewIfNeeded` would hide exactly this defect).
      const covered = [...document.querySelectorAll<HTMLElement>('.page a, .page button')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
        })
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return !!atPoint?.closest('.mobile-tabbar');
        })
        .map((element) => element.textContent?.trim().slice(0, 40) ?? '');

      return {
        scrolledToEnd: window.scrollY + window.innerHeight >= document.body.scrollHeight - 2,
        scrollable: document.body.scrollHeight > window.innerHeight,
        barTop: bar.top,
        contentBottom: contentRect.bottom,
        contentEndReachesContent: atContentEnd === content || content.contains(atContentEnd),
        contentEndHitsBar: !!atContentEnd?.closest('.mobile-tabbar'),
        covered,
      };
    });

    // The page really is scrolled to its end — otherwise the assertions below
    // would pass for the trivial reason that there is nothing down there.
    expect(geometry.scrollable).toBe(true);
    expect(geometry.scrolledToEnd).toBe(true);
    // Discriminance, measured against a pre-fix simulation (`.main`'s mobile
    // `padding-bottom` neutralised on the same page): content bottom 812 vs
    // 712 with the fix, i.e. 67px INSIDE the fixed bar, and the hit test at
    // the content's end landing on `.mobile-tabbar` instead of the page.
    // (`covered` below is the wider safety net — on a seeded DB no control
    // happens to sit that low, so it is not what makes this test bite.)
    expect(geometry.contentBottom).toBeLessThanOrEqual(geometry.barTop);
    expect(geometry.contentEndHitsBar).toBe(false);
    expect(geometry.contentEndReachesContent).toBe(true);
    expect(geometry.covered).toEqual([]);

    // The third half of AC 6 — the toast host is lifted clear of the bar.
    // Without this the fix is invisible to the suite (review 15.1 F2: with
    // `.toast-host`'s mobile `bottom` removed, every test still passed while
    // toasts came out sitting on top of the tab bar). Asserted against the
    // measured bar, not the literal 92px, so a taller bar keeps it honest.
    const toast = await page.evaluate(() => {
      const host = document.querySelector('.toast-host')!;
      const bar = document.querySelector('.mobile-tabbar')!.getBoundingClientRect();
      return { hostBottom: Number.parseFloat(getComputedStyle(host).bottom), barHeight: bar.height };
    });
    expect(toast.hostBottom).toBeGreaterThanOrEqual(toast.barHeight);
  });
});
