import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Story 15.2 — geometry guards for the three mobile primitives (epic 15, R3).
 *
 * Everything here is PURELY GEOMETRIC: it opens panels and measures boxes,
 * and it never approves, rejects or saves anything. That is why it can live
 * outside `ppr-queue.spec.ts`'s serial describe and stay in the default
 * `fullyParallel` project — it writes no global state at all (no AppSettings,
 * no PPR decision, no booking), so it cannot move another spec's page
 * boundaries under its feet (lesson 12.11 F1).
 *
 * Each test is the guard of one rule introduced for a MEASURED defect (AC 10);
 * the comment above each one names the rule and what the pre-fix state looked
 * like, so a future edit that drops the rule turns this file red instead of
 * silently regressing the phone layout (lesson 15.1 F2).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-primitives.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 } as const;
const DESKTOP = { width: 1280, height: 900 } as const;

async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** `elementFromPoint` on the element's own centre — the only honest proof that a box is not covered. */
function reachable(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return rect.left >= 0 && rect.right <= window.innerWidth && (atPoint === el || el.contains(atPoint));
}

test.describe('story 15.2 — mobile primitives (geometry only, no state written)', () => {
  /**
   * Rules (i)/(ii) — `.ppr-queue-desktop`/`.ppr-queue-mobile` `display: none`
   * on the inactive side — are guarded in `ppr-queue.spec.ts` instead: both
   * trees only exist when the queue has at least one row, and creating that
   * row means touching the PENDING queue's shared page boundaries, which is
   * precisely what that file's serial describe exists for. What IS asserted
   * here is the half that needs NO row: the empty state stays ONE node
   * (AC 3), not one per tree.
   */
  test('the two trees stay in 1:1 correspondence and the empty state is exactly one node when (and only when) the queue is empty', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);

    // Deliberately NOT "navigate to a status that should be empty": no PPR
    // status is empty by construction on a shared DB (`movements.spec.ts`
    // completes and cancels requests, this file's siblings approve and
    // reject them), and a first attempt at that flaked on the full suite.
    // The invariant is asserted against whatever the queue actually holds,
    // which makes it deterministic AND stronger: it also catches a card list
    // that drifts out of step with the table.
    for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'] as const) {
      await page.goto(`/it/dashboard/ppr?status=${status}`);
      await expect(page.getByTestId('ppr-queue')).toBeVisible();
      const rows = await page.getByTestId('ppr-row').count();
      expect(await page.getByTestId('ppr-row-mobile').count()).toBe(rows);
      expect(await page.getByTestId('ppr-queue-empty').count()).toBe(rows === 0 ? 1 : 0);
    }
  });

  /**
   * Rule (iii): `.slideover-panel{ left:0; width:100% }` at <=640px. Pre-fix
   * the panel was `min(520px, 92vw)` = 345px of 375, i.e. 30px of scrim strip
   * and 30px of lost form width on every phone.
   * Rule (iv): `.so-actions{ position:sticky; bottom:0 }` — pre-fix the submit
   * button of a 12-field form sat below the fold and was NOT hit-testable
   * until the body was scrolled.
   */
  test('at 375px a SlideOver form is full-screen with a fixed header and a sticky action row; at 1280px the desktop geometry is untouched', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/ppr');

    await page.getByTestId('ppr-manual-button').click();
    await expect(page.getByTestId('manual-ppr-form')).toBeVisible();

    // The panel now rises from the bottom (`translateY`), so the measurement
    // has to outlast the 260ms transition — poll instead of racing it.
    await expect(async () => {
      const panelGeometry = await page.locator('.slideover-panel').evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderLeft: getComputedStyle(el).borderLeftWidth };
      });
      expect(Math.abs(panelGeometry.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(panelGeometry.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(panelGeometry.width - PHONE.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(panelGeometry.height - PHONE.height)).toBeLessThanOrEqual(1);
      expect(panelGeometry.borderLeft).toBe('0px');
    }).toPass({ timeout: 3000 });

    // The header never scrolls (only `.so-body` does) and the body starts at
    // the top: both are preconditions of the sticky-row measurement below.
    expect(await page.locator('.so-body').evaluate((el) => el.scrollTop)).toBe(0);
    expect(await page.locator('.so-head .so-title').evaluate(reachable)).toBe(true);
    expect(await page.locator('.so-head .iconbtn').evaluate(reachable)).toBe(true);

    // AC 5: the primary action is hit-testable with the body still at the top
    // and all 12 fields loaded, and it is >=44px tall.
    const submit = page.getByTestId('manual-ppr-submit');
    expect(await submit.evaluate(reachable)).toBe(true);
    expect(await submit.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await page.locator('.so-actions').evaluate((el) => getComputedStyle(el).position)).toBe('sticky');

    // AC 8: the full-screen panel (z 50) covers the 15.1 tab bar (z 5) — no
    // second navigation visible under the form.
    const barCovered = await page.evaluate(() => {
      const bar = document.querySelector('.mobile-tabbar');
      if (!bar) return null;
      const rect = bar.getBoundingClientRect();
      const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return atPoint ? atPoint.closest('.mobile-tabbar') === null && atPoint.closest('.slideover') !== null : null;
    });
    expect(barCovered).toBe(true);

    // AC 8: a portalled picker popover (z 65/66) stays ABOVE the panel and
    // inside the viewport (TD-7's own invariant, re-measured full-screen).
    //
    // `scrollIntoViewIfNeeded` (story 15.10): with the body at `scrollTop: 0`
    // the ETA row sits under the panel's own STICKY action bar — measured
    // before 15.10 too (the 24x24 trigger at `top 781`, the bar at 743-812,
    // `elementFromPoint` returning the primary button), and 15.10's 44px floor
    // only moved it from 781 to 757 and added the input itself to what the bar
    // covers. Clicking an occluded control makes Playwright scroll the body
    // (measured: `scrollTop` 0 -> 314), and `useFixedPopover` closes the
    // popover on ANY scroll outside it (`fixed-popover.ts:198`, capture phase,
    // by design) — the scroll EVENT lands a frame after the click, so the
    // popover opened and vanished 4ms later. Scrolling first removes the race
    // without weakening anything this test asserts; what the test is about
    // (z-order and viewport containment of a portaled popover) is measured
    // unchanged below, and the hit-test after a REAL scroll — the epic's own
    // AC-11 formulation — is now asserted explicitly instead of being assumed.
    const dateTrigger = page.locator('.date-input-btn').first();
    // A REAL scroll of the panel body until the trigger clears the sticky bar,
    // then the hit-test — the epic's AC-11 formulation, and the only honest one
    // for a `position: sticky` bottom bar, which by construction overlays
    // whatever content is at the bottom edge at every scroll position but the
    // end. `scrollIntoViewIfNeeded` cannot help here: the trigger IS in view,
    // it is merely covered.
    await page.evaluate(() => {
      const body = document.querySelector('.so-body');
      const trigger = document.querySelector('.date-input-btn');
      const bar = document.querySelector('.so-actions');
      if (!body || !trigger || !bar) return;
      const overlap = trigger.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
      if (overlap > 0) body.scrollTop += overlap + 12;
    });
    // Let the scroll event land BEFORE the popover exists: `useFixedPopover`
    // closes on any scroll outside it (`fixed-popover.ts:198`, capture phase,
    // by design), and a scroll dispatched a frame after the click would close
    // the popover the click had just opened.
    await expect(async () => {
      expect(await dateTrigger.evaluate(reachable)).toBe(true);
    }).toPass({ timeout: 3000 });
    await dateTrigger.click();
    const popover = page.locator('.cal-popover');
    await expect(popover).toBeVisible();
    const popoverGeometry = await popover.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    expect(popoverGeometry.left).toBeGreaterThanOrEqual(0);
    expect(popoverGeometry.right).toBeLessThanOrEqual(PHONE.width);
    expect(popoverGeometry.top).toBeGreaterThanOrEqual(0);
    expect(popoverGeometry.bottom).toBeLessThanOrEqual(PHONE.height);
    expect(await popover.evaluate(reachable)).toBe(true);
    // NEVER Escape to close a popup inside a SlideOver (review 14.3 F1/F2):
    // it closes the whole panel and the next assertions read ghost nodes.
    // Reopening the same trigger toggles it shut.
    await dateTrigger.click();

    // AC 11 — desktop invariant: 520px panel, no full-screen, no sticky row.
    await page.setViewportSize(DESKTOP);
    await expect(async () => {
      const desktopPanel = await page.locator('.slideover-panel').evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, right: rect.right };
      });
      expect(desktopPanel.width).toBe(520);
      expect(Math.abs(desktopPanel.right - DESKTOP.width)).toBeLessThanOrEqual(1);
    }).toPass({ timeout: 3000 });
    expect(await page.locator('.so-actions').evaluate((el) => getComputedStyle(el).position)).toBe('static');
  });

  /**
   * Rule (v): `.kpi-row` becomes a scroll-snap strip at <=640px (it was a
   * 2-column grid, so the 5th KPI of the admin overview needed a full page
   * scroll to reach and the row ate ~3 card-heights of vertical budget).
   * Rule (vi): `.kpi-row > *{ flex: 1 0 auto; min-width: 146px }` — the
   * template's fixed `flex: 0 0 146px` basis would CLIP a realistic long
   * value inside `.kpi`'s own `overflow: hidden` (the class of defect
   * 13.10 F1, invisible on a fresh-seed DB — hence the injected value below).
   */
  test('at 375px the KPI row is a scroll-snap strip: first card fully visible, last one only after a real scroll, no page overflow, and a long value is not clipped', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');

    const strip = page.locator('.kpi-row').first();
    await expect(strip).toBeVisible();
    expect(await strip.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x');
    // D4 (review: "legittima ma senza rete") — the strip is full-bleed with
    // `margin-inline: -28px`, which is EXACTLY `.page`'s own padding: the
    // arithmetic only holds while every `.kpi-row` is a DIRECT child of
    // `.page`. Nested one level deeper (typically inside a `.card`, whose
    // `overflow: hidden` clips) the negative margins would slide under the
    // border. True 9/9 by inspection today; held by an assertion from now on.
    expect(await strip.evaluate((el) => el.parentElement?.classList.contains('page'))).toBe(true);
    const cardCount = await strip.evaluate((el) => el.children.length);
    expect(cardCount).toBeGreaterThanOrEqual(5);

    const first = strip.locator(':scope > *').first();
    const last = strip.locator(':scope > *').last();
    expect(await first.evaluate(reachable)).toBe(true);
    expect(await last.evaluate(reachable)).toBe(false);
    expect(await strip.evaluate((el) => el.scrollLeft)).toBe(0);

    // A REAL wheel scroll, not `scrollIntoViewIfNeeded` — the latter would
    // pass even on a container that cannot scroll (pattern of `.week-grid`,
    // bookings.spec.ts).
    const box = await strip.boundingBox();
    if (!box) throw new Error('`.kpi-row` not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(1200, 0);
    await expect(async () => {
      expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    }).toPass({ timeout: 2000 });
    expect(await last.evaluate(reachable)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    // Long-value probe (text-node substitution, lesson 13.10): a fresh DB
    // never produces "12.480,50 €", so inject it and re-measure. Measured
    // with the template's own fixed `flex: 0 0 146px` basis instead of the
    // `min-width` this story ships: card clientWidth stays 144 and the value
    // box clips by 1px (113 vs 112) — hence BOTH the "did the card grow"
    // assertion and the "is the value box clipped" one, so the guard does
    // not hang on a single pixel of font metrics.
    const clipping = await page.evaluate(() => {
      const value = document.querySelector('.kpi-row .kpi .kpi-value');
      const card = value?.closest('.kpi');
      if (!value || !(card instanceof HTMLElement)) return null;
      const textNode = [...value.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = '12.480,50 €';
      else value.textContent = '12.480,50 €';
      return {
        valueOverflow: value.scrollWidth - value.clientWidth,
        cardOverflow: card.scrollWidth - card.clientWidth,
        cardWidth: card.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(clipping?.valueOverflow).toBeLessThanOrEqual(0);
    expect(clipping?.cardOverflow).toBeLessThanOrEqual(0);
    expect(clipping?.cardWidth).toBeGreaterThanOrEqual(146);
    expect(clipping?.pageOverflow).toBeLessThanOrEqual(0);

    // Review 15.2 F2 — the CEILING, probed with the value that actually
    // produced the defect: a KPI whose value is a joined list (the pilot
    // landing's "Abilitazioni"). The three assertions above only ever check
    // that a card is BIG ENOUGH, so they stayed green while one card measured
    // 2276px on a 375px screen. No card may be wider than the screen it snaps
    // into, and the long value must be WRAPPED, not pushed out sideways.
    const ceiling = await page.evaluate(() => {
      const value = document.querySelector('.kpi-row .kpi .kpi-value');
      const strip = value?.closest('.kpi-row');
      if (!value || !strip) return null;
      const textNode = [...value.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      const long = 'SEP(land) · IR(A) · Night · TMG · Acrobatico · Rimorchio alianti';
      if (textNode) textNode.textContent = long;
      else value.textContent = long;
      return {
        maxCardWidth: Math.max(...[...strip.children].map((child) => child.getBoundingClientRect().width)),
        valueOverflow: value.scrollWidth - value.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        viewport: window.innerWidth,
      };
    });
    expect(ceiling?.maxCardWidth).toBeLessThanOrEqual(ceiling?.viewport ?? 0);
    expect(ceiling?.valueOverflow).toBeLessThanOrEqual(0);
    expect(ceiling?.pageOverflow).toBeLessThanOrEqual(0);

    // AC 11 — above the breakpoint the strip is the grid it always was.
    await page.setViewportSize(DESKTOP);
    expect(await strip.evaluate((el) => getComputedStyle(el).display)).toBe('grid');
  });
});
