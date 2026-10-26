import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Story 15.10 — the ink and the touch targets of the final sweep
 * (AC 4, 5, 6, 7, plus the two minors R-15.10-h and R-15.10-l).
 *
 * Contrast is measured IN PAGE with a canvas round-trip (the app's colours are
 * `oklch`, which cannot be parsed by hand), with the effective background
 * resolved by walking ancestors from the element itself and the alpha read
 * BEFORE compositing, and with `getClientRects()` filtering out anything under
 * a `display: none` branch — which would otherwise report the colours of a
 * tree nobody sees (the method the whole epic has used since 15.3).
 *
 * Writes no global state: it reads pages and measures. Default project.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-ink-targets.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 } as const;
const DESKTOP = { width: 1280, height: 900 } as const;
/** The floor of the epic: the requirement is 44, the sweep tolerance 43.5. */
const TARGET_FLOOR = 43.5;

async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.context().addCookies([{ name: 'am-theme', value: theme, url: 'http://localhost:3000' }]);
}

/** Installs `window.__contrast(el)` — canvas round-trip + WCAG, ancestors resolved. */
const INSTALL_CONTRAST = `() => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const parse = (value) => {
    g.clearRect(0,0,1,1); g.fillStyle = '#000'; g.fillStyle = value;
    const resolved = g.fillStyle;
    g.clearRect(0,0,1,1); g.fillStyle = resolved; g.fillRect(0,0,1,1);
    const d = g.getImageData(0,0,1,1).data;
    return [d[0], d[1], d[2], d[3]/255];
  };
  const lum = (rgb) => {
    const c = rgb.map((v) => { const s = v/255; return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4); });
    return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
  };
  const bgOf = (node) => {
    let cur = node;
    while (cur) {
      const bg = parse(getComputedStyle(cur).backgroundColor);
      if (bg[3] > 0.99) return bg.slice(0,3);
      cur = cur.parentElement;
    }
    return [255,255,255];
  };
  window.__contrast = (el) => {
    const fgRaw = parse(getComputedStyle(el).color);
    const bg = bgOf(el);
    const fg = fgRaw[3] < 1 ? [0,1,2].map((i) => fgRaw[i]*fgRaw[3] + bg[i]*(1-fgRaw[3])) : fgRaw.slice(0,3);
    const l1 = lum(fg), l2 = lum(bg);
    return Number(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2));
  };
  return true;
}`;

async function installContrast(page: Page): Promise<void> {
  await page.evaluate(new Function(`return (${INSTALL_CONTRAST})()`) as () => boolean);
}

/** Every RENDERED interactive target under `root` whose smaller side is below the floor. */
const SMALL_TARGETS = `(arg) => {
  const scope = document.querySelector(arg.root);
  if (!scope) return null;
  const selector = 'a[href], button, input:not([type=hidden]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
  const out = [];
  for (const el of scope.querySelectorAll(selector)) {
    if (!el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height >= arg.floor) continue;
    out.push({
      tid: el.getAttribute('data-testid'),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 40),
      name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
      w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100,
    });
  }
  return out;
}`;

/**
 * The panel slides in over 260ms (`transform`), so anything measured right
 * after the click reads a rect the box will not be at (measured: a foot
 * bottom of 1436 in an 812px viewport). Waiting for the transform to settle
 * is the only honest gate.
 */
async function settledPanel(page: Page): Promise<void> {
  await expect(page.locator('.slideover.open .so-foot')).toBeVisible();
  await expect(page.locator('.slideover.open .slideover-panel')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
}

async function smallTargets(page: Page, root: string, floor = TARGET_FLOOR): Promise<Array<Record<string, unknown>>> {
  const result = (await page.evaluate(new Function('arg', `return (${SMALL_TARGETS})(arg)`) as (arg: unknown) => unknown, {
    root,
    floor,
  })) as Array<Record<string, unknown>> | null;
  expect(result, `root not found: ${root}`).not.toBeNull();
  return result!;
}

test.describe('story 15.10 — `--ink-4` stops being used as TEXT (AC 4)', () => {
  /**
   * Rule: `.mobile-tab` and `.so-sub` render in `--ink-3`, not `--ink-4`
   * (`airops.css`). The TOKEN is unchanged: 13.9 F6 calibrated `--ink-4` to a
   * >=3:1 floor for table headers and nav group labels, and that is still what
   * it is for.
   *
   * Pre-fix (measured on 13 dashboard pages, 4 labels each): the INACTIVE tab
   * labels were 3.50:1 light and 4.47:1 dark; `.so-sub` was 3.66 / 4.14 on
   * every panel that carries a subtitle, at 375px AND at 1280px.
   * Post-fix, measured on the real cascade (the tab bar's background is
   * translucent + blurred, so the pair is NOT the nominal 4.85/5.72 of
   * `--ink-3` on `--panel`): 4.64 light / 6.18 dark for the tab labels,
   * 4.85 / 5.72 for `.so-sub`.
   *
   * The assertion is the REQUIREMENT (>= 4.5), never the obtained value.
   */
  for (const theme of ['light', 'dark'] as const) {
    test(`tab bar: inactive labels clear 4.5:1 in the ${theme} theme, the active one is untouched, the bar does not move`, async ({ page }) => {
      await setTheme(page, theme);
      await loginExpectingDashboard(page, ADMIN_EMAIL);
      await page.setViewportSize(PHONE);

      for (const url of ['/it/dashboard', '/it/dashboard/bookings', '/it/dashboard/logbook']) {
        await page.goto(url);
        await page.waitForSelector('.mobile-tabbar');
        await installContrast(page);
        const bar = await page.evaluate(() => {
          const tabs = [...document.querySelectorAll('.mobile-tab')];
          return {
            count: tabs.length,
            items: tabs.map((tab) => {
              const label = tab.querySelector('.mobile-tab-label');
              const rect = tab.getBoundingClientRect();
              return {
                active: tab.classList.contains('active'),
                ratio: label ? (window as unknown as { __contrast: (el: Element) => number }).__contrast(label) : null,
                height: Math.round(rect.height * 100) / 100,
              };
            }),
          };
        });

        expect(bar.count, `${url}: the tab bar still has its five columns`).toBe(5);
        for (const item of bar.items) {
          expect(item.ratio, `${url}: every label, active or not, must clear the body-text floor`).toBeGreaterThanOrEqual(4.5);
          // Geometry unchanged: the fix is a colour, and only a colour.
          expect(item.height).toBeGreaterThanOrEqual(44);
        }
        // The ACTIVE label keeps its own much stronger ink (17.99 / 17.00).
        const active = bar.items.find((item) => item.active);
        expect(active?.ratio ?? 0).toBeGreaterThan(10);
      }
    });

    test(`.so-sub clears 4.5:1 in the ${theme} theme, on the phone AND on the desktop`, async ({ page }) => {
      await setTheme(page, theme);
      await loginExpectingDashboard(page, ADMIN_EMAIL);

      for (const viewport of [PHONE, DESKTOP]) {
        await page.setViewportSize(viewport);
        await page.goto('/it/dashboard/bookings');
        await page.waitForSelector('.page');
        await page.getByTestId('new-booking-button').click();
        await expect(page.locator('.slideover.open')).toHaveCount(1);
        await installContrast(page);

        const subs = await page.evaluate(() => {
          const out: Array<{ text: string; ratio: number }> = [];
          for (const el of document.querySelectorAll('.slideover.open .so-sub')) {
            const text = (el.textContent ?? '').trim();
            if (!text || !el.getClientRects().length) continue;
            out.push({ text, ratio: (window as unknown as { __contrast: (node: Element) => number }).__contrast(el) });
          }
          return out;
        });

        expect(subs.length, `${viewport.width}px: this panel renders a non-empty subtitle`).toBeGreaterThan(0);
        for (const sub of subs) expect(sub.ratio, `${viewport.width}px: ${sub.text}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  /**
   * Review 15.10 LOW-3, AC 4c. The `--ink-4` census classified `.crumbs .sep`
   * (3.66 / 4.14) as DECORATION — which is what lets it stay under the 3:1
   * floor instead of joining the declared text debt — but the node was plain
   * exposed text: `<span class="sep">/</span>`, read out between two crumbs.
   * The classification is now TRUE, and this is what keeps it true.
   */
  test('the breadcrumb separator is a decoration for real: hidden from the accessibility tree', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard/logbook');
    await page.waitForSelector('.topbar');

    const separators = page.locator('.crumbs .sep');
    const count = await separators.count();
    expect(count, 'the desktop breadcrumb renders its separators').toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      await expect(separators.nth(index)).toHaveAttribute('aria-hidden', 'true');
    }
    // ...and the crumb text itself is untouched: the name of the bar still
    // carries the brand and the page, only without the "/" glyphs.
    await expect(page.locator('.crumbs .cur')).toBeVisible();
  });
});

test.describe('story 15.10 — the touch targets of the shared primitives (AC 5)', () => {
  /**
   * Rule (R-15.10-d): at <=640px the SlideOver ✕ is 44x44, the typeahead
   * options are >=44 tall and every `.date-input-btn` is 44x44 with 48px of
   * clearance in its field. Above 640px NOTHING changes: 32x32, 35.56 and
   * 24x24 are the desktop values and they stay.
   */
  test('SlideOver ✕: 44x44 on the phone, still 32x32 at 1280', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await page.goto('/it/dashboard/bookings');
      await page.waitForSelector('.page');
      await page.getByTestId('new-booking-button').click();
      await expect(page.locator('.slideover.open')).toHaveCount(1);
      const box = await page.locator('.slideover.open .so-head .iconbtn').boundingBox();
      expect(box).not.toBeNull();
      if (viewport.width <= 640) {
        expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(TARGET_FLOOR);
      } else {
        // The desktop is DECLARED invariant by nine stories: 32x32, exactly.
        expect(Math.round(box!.width)).toBe(32);
        expect(Math.round(box!.height)).toBe(32);
      }
    }
  });

  test('typeahead options: >=44 tall on the phone, unchanged at 1280, and the listbox stays inside the viewport', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await page.goto('/it/dashboard/logbook');
      await page.getByTestId('logbook-new-button').click();
      await expect(page.getByTestId('flight-form')).toBeVisible();
      await page.getByTestId('flight-aircraft').click();
      await expect(page.locator('.combo-listbox [role="option"]').first()).toBeVisible();

      const measured = await page.evaluate(() => {
        const list = document.querySelector('.combo-listbox');
        if (!list) return null;
        const options = [...list.querySelectorAll('[role="option"]')];
        const listRect = list.getBoundingClientRect();
        return {
          minOptionHeight: Math.min(...options.map((option) => option.getBoundingClientRect().height)),
          options: options.length,
          left: listRect.left,
          right: listRect.right,
          innerWidth: window.innerWidth,
        };
      });
      expect(measured).not.toBeNull();
      expect(measured!.options).toBeGreaterThan(0);
      expect(measured!.left).toBeGreaterThanOrEqual(0);
      expect(measured!.right).toBeLessThanOrEqual(measured!.innerWidth + 0.5);
      if (viewport.width <= 640) {
        expect(measured!.minOptionHeight).toBeGreaterThanOrEqual(TARGET_FLOOR);
      } else {
        // Pre-fix value, kept: the desktop density is not this story's business.
        expect(measured!.minOptionHeight).toBeLessThan(TARGET_FLOOR);
      }
    }
  });

  /**
   * `.date-input-btn` had SIX anchored exceptions and five faces left at 24x24
   * (logbook 1, movements 2, bookings 2, /dashboard/ppr 2). One rule now
   * covers them all — including the public `/ppr`, whose 44x44 must NOT move
   * (control measure: 15.9 set it, this rule lands on the same value).
   */
  test('every calendar trigger is 44x44 at <=640 — the five bare faces, the ones already raised, and the public /ppr', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);

    const readTriggers = async () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.date-input-btn')]
          .filter((el) => el.getClientRects().length)
          .map((el) => {
            const rect = el.getBoundingClientRect();
            const input = el.closest('.date-input')?.querySelector('input');
            return {
              w: Math.round(rect.width * 100) / 100,
              h: Math.round(rect.height * 100) / 100,
              inputH: input ? Math.round(input.getBoundingClientRect().height * 100) / 100 : null,
              paddingRight: input ? getComputedStyle(input).paddingRight : null,
            };
          }),
      );

    for (const url of ['/it/dashboard/logbook', '/it/dashboard/movements', '/it/dashboard/bookings', '/it/dashboard/ppr', '/it/dashboard/billing', '/it/dashboard/settings']) {
      await page.goto(url);
      await page.waitForSelector('.page');
      const triggers = await readTriggers();
      expect(triggers.length, `${url}: this page renders at least one calendar trigger`).toBeGreaterThan(0);
      for (const trigger of triggers) {
        expect(Math.min(trigger.w, trigger.h), `${url}: ${JSON.stringify(trigger)}`).toBeGreaterThanOrEqual(TARGET_FLOOR);
        // The field grew with it: a 44px button inside a 38.84px input would
        // stick out, and the value needs clearance from a bigger icon.
        expect(trigger.inputH, `${url}: the field itself`).toBeGreaterThanOrEqual(TARGET_FLOOR);
        expect(trigger.paddingRight).toBe('48px');
      }
    }

    // Control measure — the public module, outside the shell, must be EXACTLY
    // where 15.9 left it.
    await page.goto('/it/ppr');
    await page.waitForSelector('.ppr-page');
    const publicTriggers = await readTriggers();
    expect(publicTriggers.length).toBeGreaterThan(0);
    for (const trigger of publicTriggers) {
      expect(trigger.w).toBe(44);
      expect(trigger.h).toBe(44);
      expect(trigger.paddingRight).toBe('48px');
    }
  });

  test('at 1280 the calendar trigger keeps its 24x24 desktop geometry', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard/logbook');
    await page.waitForSelector('.page');
    const box = await page.locator('.date-input-btn').first().boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(24);
    expect(Math.round(box!.height)).toBe(24);
  });

  /**
   * `.cal-popover` (R-15.10-e, PO option B): the FOUR non-cell targets go to
   * 44, the 42 day cells stay 34.58 and are DECLARED — 7 columns x 44 = 308 >
   * the popover's 280px, the one place in the epic where the floor fights the
   * function. The width must NOT change and the popover must stay inside the
   * viewport at 320, 375 and 390.
   */
  for (const width of [320, 375, 390]) {
    test(`.cal-popover at ${width}px: 4 non-cell targets at 44, 42 cells declared at 34.58, width still 280 and inside the viewport`, async ({ page }) => {
      await loginExpectingDashboard(page, ADMIN_EMAIL);
      await page.setViewportSize({ width, height: 812 });
      await page.goto('/it/dashboard/bookings');
      await page.waitForSelector('.page');
      await page.getByTestId('new-booking-button').click();
      await expect(page.locator('.slideover.open')).toHaveCount(1);
      await page.locator('.slideover.open .date-input-btn').first().click();
      await expect(page.locator('.cal-popover')).toBeVisible();

      const measured = await page.evaluate(() => {
        const popover = document.querySelector('.cal-popover');
        if (!popover) return null;
        const rect = popover.getBoundingClientRect();
        const size = (el: Element) => {
          const r = el.getBoundingClientRect();
          return Math.min(r.width, r.height);
        };
        return {
          width: Math.round(rect.width * 100) / 100,
          left: rect.left,
          right: rect.right,
          innerWidth: window.innerWidth,
          arrows: [...popover.querySelectorAll('.cal-head .iconbtn')].map(size),
          footButtons: [...popover.querySelectorAll('.cal-foot .btn')].map(size),
          cells: [...popover.querySelectorAll('.cal-cell')].map(size),
        };
      });

      expect(measured).not.toBeNull();
      // The four the ratifica names.
      expect(measured!.arrows).toHaveLength(2);
      expect(measured!.footButtons).toHaveLength(2);
      for (const target of [...measured!.arrows, ...measured!.footButtons]) expect(target).toBeGreaterThanOrEqual(TARGET_FLOOR);
      // The 42 DECLARED ones: still the dense grid, on purpose.
      expect(measured!.cells).toHaveLength(42);
      for (const cell of measured!.cells) expect(cell).toBeLessThan(TARGET_FLOOR);
      // Geometry: same 280px box, still on screen.
      expect(measured!.width).toBe(280);
      expect(measured!.left).toBeGreaterThanOrEqual(0);
      expect(measured!.right).toBeLessThanOrEqual(measured!.innerWidth);
    });
  }
});

test.describe('story 15.10 — the three page-level contrasts (AC 6)', () => {
  /**
   * Pre-fix, light theme: the two `--bad` KPI values of `/dashboard/expiries`
   * measured 3.96:1 and the `--info` one 3.61:1 (at 19px on the phone, where
   * the floor is 4.5 — at 1280 the same value is 26px, i.e. large text with a
   * floor of 3, which is why this defect is a PHONE defect with a desktop
   * ratio); the "Giorni rimasti" column measured 3.38:1 on its own
   * `--bad-soft` row tint (16 rows); the 64 "Saldi negativi" links measured
   * 3.61:1 at both widths.
   *
   * The inline colour is SUBSTITUTED by the class, never flanked — an inline
   * style beats any class (lesson 15.9 MINOR-1) — so both halves are asserted:
   * the class is there AND no inline `color` came back.
   */
  for (const theme of ['light', 'dark'] as const) {
    test(`expiries KPI + "Giorni rimasti" clear the floor in the ${theme} theme, with the inline colour gone`, async ({ page }) => {
      await setTheme(page, theme);
      await loginExpectingDashboard(page, ADMIN_EMAIL);

      for (const viewport of [PHONE, DESKTOP]) {
        await page.setViewportSize(viewport);
        await page.goto('/it/dashboard/expiries');
        await page.waitForSelector('.page');
        await installContrast(page);

        const measured = await page.evaluate(() => {
          const contrast = (window as unknown as { __contrast: (el: Element) => number }).__contrast;
          const kpis = [...document.querySelectorAll('.kpi')]
            .filter((kpi) => kpi.getClientRects().length)
            .map((kpi) => {
              const value = kpi.querySelector('.kpi-value');
              return {
                tid: kpi.getAttribute('data-testid'),
                ratio: value ? contrast(value) : null,
                inlineColor: value ? (value.getAttribute('style') ?? '').includes('color') : false,
                cls: value?.className ?? '',
              };
            });
          const days = [...document.querySelectorAll('[data-testid="scadenze-row"]')]
            .filter((row) => row.getClientRects().length)
            .map((row) => {
              const cell = row.querySelector('.mono.num');
              return cell ? { ratio: contrast(cell), cls: cell.className, inlineColor: (cell.getAttribute('style') ?? '').includes('color') } : null;
            })
            .filter((entry): entry is { ratio: number; cls: string; inlineColor: boolean } => entry !== null);
          return { kpis, days };
        });

        expect(measured.kpis.length, 'the four tier KPIs are on screen at both widths').toBe(4);
        for (const kpi of measured.kpis) {
          expect(kpi.ratio, `${viewport.width}px ${kpi.tid}`).toBeGreaterThanOrEqual(4.5);
        }
        // The two that were fixed carry the class and no inline colour left.
        const fixed = measured.kpis.filter((kpi) => ['scadenze-stat-expired', 'scadenze-stat-within7', 'scadenze-stat-within60'].includes(kpi.tid ?? ''));
        expect(fixed).toHaveLength(3);
        for (const kpi of fixed) {
          expect(kpi.cls, `${kpi.tid} must carry a stat tone class`).toMatch(/stat-tone-(bad|info)/);
          expect(kpi.inlineColor, `${kpi.tid} must not carry an inline colour any more`).toBe(false);
        }

        if (viewport.width > 640) {
          expect(measured.days.length, 'the desktop table renders the "Giorni rimasti" column').toBeGreaterThan(0);
          for (const day of measured.days) expect(day.ratio, JSON.stringify(day)).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    test(`the "Saldi negativi" links clear the floor in the ${theme} theme and keep a non-colour affordance`, async ({ page }) => {
      await setTheme(page, theme);
      await loginExpectingDashboard(page, ADMIN_EMAIL);

      for (const viewport of [PHONE, DESKTOP]) {
        await page.setViewportSize(viewport);
        await page.goto('/it/dashboard/billing');
        await page.waitForSelector('.page');
        const rows = page.locator('[data-testid="negative-balance-row"]');
        if ((await rows.count()) === 0) test.skip(true, 'no negative balance on this DB');
        await installContrast(page);

        const measured = await page.evaluate(() => {
          const contrast = (window as unknown as { __contrast: (el: Element) => number }).__contrast;
          const links = [...document.querySelectorAll('[data-testid="negative-balance-row"] a')].filter((a) => a.getClientRects().length);
          return {
            count: links.length,
            ratios: [...new Set(links.map((a) => contrast(a)))],
            decorations: [...new Set(links.map((a) => getComputedStyle(a).textDecorationLine))],
          };
        });

        expect(measured.count).toBeGreaterThan(0);
        for (const ratio of measured.ratios) expect(ratio, `${viewport.width}px`).toBeGreaterThanOrEqual(4.5);
        // The colour used to be the ONLY thing marking these as links.
        expect(measured.decorations).toEqual(['underline']);
      }
    });
  }
});

test.describe('story 15.10 — /dashboard/ppr, the surface built before the primitives (AC 7)', () => {
  /**
   * Pre-fix, measured at 320, 375 and 390: NINETEEN targets under 43.5 —
   * `ppr-public-form-link` and `ppr-manual-button` at 34.84, the panel ✕ at
   * 32, twelve `ManualPprForm` fields at 36.84/38.84, two calendar triggers at
   * 24x24, `ppr-queue-filter-status` at 36 and `export-menu-trigger` at 34.84.
   * Everything else was already right and must stay identical: `pageOverflow`
   * 0, the card a `<button>` with zero interactive children.
   *
   * Review 15.10 MAJOR-1 — how "the card is untouched" is asserted, and why
   * NOT with its height. `expect(cardHeight).toBe(82.83)` was a photograph of
   * the FIRST row of a queue other specs write under `fullyParallel`: a
   * 30-character fixture name ("Nega Test-1786045551936-hvgdm8") wraps at
   * 320px and the same card measures 101.67, which turned the arbiter red 3
   * times out of 3 and, with the `chromium` project red, kept the 39 tests of
   * the serialized chain from running at all. What follows asserts the
   * REQUIREMENT instead, and every value in it is content-INDEPENDENT: the box
   * 15.2 gave the card (padding, border, floor, `display`), the typography of
   * its two lines, and — the part that actually catches a 44px rule of this
   * story reaching the card — that the card's height is nothing but its own
   * box plus its content. A `min-height`, an extra padding or an inflated
   * child would break that equation at ANY row content.
   */
  for (const width of [320, 375, 390]) {
    test(`no target under the floor at ${width}px, and the card is untouched`, async ({ page }) => {
      await loginExpectingDashboard(page, ADMIN_EMAIL);
      await page.setViewportSize({ width, height: 812 });
      await page.goto('/it/dashboard/ppr');
      await page.waitForSelector('.page');

      const small = await smallTargets(page, '.page');
      expect(small, JSON.stringify(small)).toEqual([]);

      const geometry = await page.evaluate(() => {
        const round = (value: number) => Math.round(value * 100) / 100;
        const px = (value: string) => round(Number.parseFloat(value));
        const card = document.querySelector('[data-testid="ppr-row-mobile"]');
        const pageOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        if (!card) return { pageOverflow, card: null, emptyStates: document.querySelectorAll('[data-testid="ppr-queue-empty"]').length };
        const style = getComputedStyle(card);
        const head = card.querySelector('.ppr-card-head');
        const name = card.querySelector('.ppr-card-name');
        const sub = card.querySelector('.ppr-card-sub');
        return {
          pageOverflow,
          emptyStates: document.querySelectorAll('[data-testid="ppr-queue-empty"]').length,
          card: {
            tag: card.tagName.toLowerCase(),
            interactiveChildren: card.querySelectorAll('a,button,input,select,textarea').length,
            height: round(card.getBoundingClientRect().height),
            headHeight: head ? round(head.getBoundingClientRect().height) : null,
            box: {
              paddingTop: px(style.paddingTop),
              paddingBottom: px(style.paddingBottom),
              borderTop: px(style.borderTopWidth),
              borderBottom: px(style.borderBottomWidth),
              minHeight: px(style.minHeight),
              display: style.display,
            },
            nameFontSize: name ? getComputedStyle(name).fontSize : null,
            // Every `min-height` INSIDE the card: the touch-floor rules of
            // this story must not reach a single node of it.
            floorsInside: [...card.querySelectorAll('*')]
              .map((node) => getComputedStyle(node).minHeight)
              .filter((value) => value !== '0px' && value !== 'auto'),
            subClipping: sub ? [getComputedStyle(sub).whiteSpace, getComputedStyle(sub).overflow, getComputedStyle(sub).textOverflow].join(' ') : null,
          },
        };
      });
      expect(geometry.pageOverflow).toBeLessThanOrEqual(0);

      if (geometry.card === null) {
        // No row on this DB — then the queue must be showing its empty state,
        // so the branch is visible instead of silently skipped.
        expect(geometry.emptyStates, 'an empty queue renders exactly one empty state').toBe(1);
        return;
      }
      const card = geometry.card;
      expect(card.tag).toBe('button');
      expect(card.interactiveChildren).toBe(0);
      // The box 15.2 gave it, untouched by the target floor of this story.
      expect(card.box).toEqual({ paddingTop: 11, paddingBottom: 11, borderTop: 1, borderBottom: 0, minHeight: 44, display: 'block' });
      expect(card.nameFontSize).toBe('13px');
      expect(card.floorsInside, 'no 44px floor rule of this story reaches inside the card').toEqual([]);
      // The sub still contains its own overflow (lesson 15.5 F1 in reverse).
      expect(card.subClipping).toBe('nowrap hidden ellipsis');
      // Height = its own box + its content, never a floor of its own: with a
      // 44px rule reaching the card this equation is what breaks, whatever the
      // row happens to contain.
      const explained = Math.max(44, card.headHeight! + card.box.paddingTop + card.box.paddingBottom + card.box.borderTop);
      expect(card.height, `head ${card.headHeight} + box ${JSON.stringify(card.box)}`).toBeCloseTo(explained, 1);
      expect(card.height).toBeGreaterThanOrEqual(44);
    });
  }

  /**
   * The same form is mounted by `/dashboard/movements` ("Registra arrivo"):
   * the rule reaches both. The root is the whole open panel, not just the
   * `<form>`: since review 15.10 LOW-4 the primary action lives in `.so-foot`,
   * OUTSIDE the form, and a sweep rooted on the form would stop covering it.
   */
  test('the shared ManualPprForm has no small target on /dashboard/movements either', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/movements');
    await page.waitForSelector('.page');
    await page.getByTestId('log-arrival-button').click();
    await expect(page.getByTestId('manual-ppr-form')).toBeVisible();
    const small = await smallTargets(page, '.slideover.open .slideover-panel');
    expect(small, JSON.stringify(small)).toEqual([]);
  });
});

test.describe('story 15.10 — the two minors (R-15.10-h, R-15.10-l)', () => {
  /**
   * R-15.10-h: on `/dashboard/my-account` the page head already says "Le mie
   * transazioni" and the card title said "Estratto conto" 20.3px lower — the
   * head measured 101.3px above the first movement at 375 AND at 320. The
   * title is hidden at <=640 on THAT face only: on the scheda persona it is
   * the section's only name and stays, at every width and for every actor.
   */
  test('the self statement drops its redundant card title at <=640, and the scheda persona keeps it', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto('/it/dashboard/my-account');
      await page.waitForSelector('.page');
      await expect(page.locator('.account-head-self')).toHaveCount(1);
      await expect(page.locator('.account-head-self .card-title')).toBeHidden();
    }

    // Desktop: the title is back, both faces.
    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard/my-account');
    await page.waitForSelector('.page');
    await expect(page.locator('.account-head-self .card-title')).toBeVisible();

    // Scheda persona, at the width where the rule fires: intact. The person is
    // resolved through the API (the pilots page is a card list at 375px, where
    // the profile is reached through a sheet — irrelevant to what is asserted
    // here, and a longer path to break).
    await page.setViewportSize(PHONE);
    const people = (await (await page.request.get('/api/v1/people?page=1&pageSize=1')).json()) as { items: Array<{ id: string }> };
    const personId = people.items[0]?.id;
    expect(personId, 'the seeded DB has at least one person').toBeTruthy();
    await page.goto(`/it/dashboard/people/${personId}`);
    await page.waitForSelector('[data-testid="account-section"]');
    await expect(page.locator('.account-head-self')).toHaveCount(0);
    await expect(page.locator('.account-head .card-title')).toBeVisible();
  });

  /**
   * R-15.10-l: `viewport-fit=cover` makes the six `env(safe-area-inset-*)` of
   * `airops.css` real on a notched phone. LIMITATION, stated here because it
   * cannot be closed on this machine: Chromium reports every inset as 0, so
   * what is verifiable is the declaration plus NON-REGRESSION — at inset 0
   * every measurement stays exactly what it was.
   */
  test('the viewport meta declares viewport-fit=cover, and at inset 0 the tab bar geometry is unchanged', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');
    await page.waitForSelector('.mobile-tabbar');

    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).toContain('viewport-fit=cover');

    const measured = await page.evaluate(() => {
      const bar = document.querySelector('.mobile-tabbar');
      const main = document.querySelector('.main');
      const rect = bar?.getBoundingClientRect();
      return {
        barHeight: rect ? Math.round(rect.height * 100) / 100 : null,
        barBottom: rect ? Math.round(rect.bottom * 100) / 100 : null,
        innerHeight: window.innerHeight,
        barPaddingBottom: bar ? getComputedStyle(bar).paddingBottom : null,
        mainPaddingBottom: main ? getComputedStyle(main).paddingBottom : null,
      };
    });
    // The values `calc(12px + env(...))` and `calc(100px + env(...))` resolve
    // to on a browser with no notch — i.e. exactly the pre-fix numbers.
    expect(measured.barPaddingBottom).toBe('12px');
    expect(measured.mainPaddingBottom).toBe('100px');
    expect(measured.barBottom).toBe(measured.innerHeight);
  });

  /**
   * Review 15.10 MAJOR-3 (PO decision 2026-08-06). `viewport-fit=cover` makes
   * the insets real, and the story lit it while `.so-foot` — the foot R-15.10-f
   * had just promoted to PRIMARY action of the full-screen panel — had none,
   * where the `.so-actions` bar it replaced carried `calc(12px + env(...))`.
   * On a phone with a 34px home indicator that submit would have sat ~22px
   * inside the system strip.
   *
   * Insets are 0 on this Chromium, so the computed padding cannot show the
   * term: the DECLARATION is read from the CSSOM (where `env()` survives
   * serialization) and the numbers are the non-regression half — every value
   * identical to what it was without the term.
   */
  test('the bars that touch a screen edge declare their safe-area inset, and at inset 0 nothing moves', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    // The flight editor, not the PPR panel: this panel has carried a `.so-foot`
    // since 12.x, so the guard measures the CSS and only the CSS.
    await page.goto('/it/dashboard/logbook');
    await page.waitForSelector('.page');
    await page.getByTestId('logbook-new-button').click();
    await settledPanel(page);

    const declarations = await page.evaluate(() => {
      const texts: string[] = [];
      const walk = (rules: CSSRuleList) => {
        for (const rule of rules) {
          // A CSSStyleRule owns a (usually empty) `cssRules` too since CSS
          // nesting, so the style rule has to be recorded FIRST and the
          // recursion only used for what it actually contains.
          if (rule instanceof CSSStyleRule) texts.push(rule.cssText);
          const nested = (rule as CSSGroupingRule).cssRules;
          if (nested && nested.length > 0) walk(nested);
        }
      };
      for (const sheet of document.styleSheets) {
        try {
          walk(sheet.cssRules);
        } catch {
          // A cross-origin sheet cannot be read; the app has none.
        }
      }
      const find = (selector: string) => texts.filter((text) => text.startsWith(`${selector} {`) || text.startsWith(`${selector}{`));
      return {
        soFoot: find('.so-foot'),
        mobileTopbar: find('.mobile-topbar'),
        topbar: find('.topbar'),
      };
    });
    expect(declarations.soFoot.join(' '), '.so-foot pads for the home indicator').toContain('env(safe-area-inset-bottom)');
    expect(declarations.mobileTopbar.join(' '), 'the sticky phone top bar pads for the notch').toContain('env(safe-area-inset-top)');
    expect(declarations.topbar.join(' '), 'the sticky shell top bar of the 641-900 band pads for the notch').toContain('env(safe-area-inset-top)');

    // Non-regression at inset 0: the same numbers as before the term.
    const phone = await page.evaluate(() => {
      const foot = document.querySelector('.slideover.open .so-foot')!;
      const bar = document.querySelector('.mobile-topbar')!;
      const round = (value: number) => Math.round(value * 100) / 100;
      const tallestChild = (element: Element) => Math.max(...[...element.children].map((child) => child.getBoundingClientRect().height));
      return {
        footPaddingBottom: getComputedStyle(foot).paddingBottom,
        footHeight: round(foot.getBoundingClientRect().height),
        footContent: round(tallestChild(foot)),
        footBottom: round(foot.getBoundingClientRect().bottom),
        barPaddingTop: getComputedStyle(bar).paddingTop,
        barHeight: round(bar.getBoundingClientRect().height),
        barContent: round(tallestChild(bar)),
        innerHeight: window.innerHeight,
      };
    });
    expect(phone.footPaddingBottom).toBe('12px');
    // 12 + 12 of padding, 1 of border-top, and the tallest control: the foot
    // is its own box plus its content, with no inset added at inset 0.
    expect(phone.footHeight).toBeCloseTo(phone.footContent + 25, 1);
    expect(phone.footBottom).toBe(phone.innerHeight);
    expect(phone.barPaddingTop).toBe('10px');
    // 10 + 10 of padding, 1 of border-bottom.
    expect(phone.barHeight).toBeCloseTo(phone.barContent + 21, 1);

    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard/logbook');
    await page.waitForSelector('.page');
    await page.getByTestId('logbook-new-button').click();
    await settledPanel(page);
    const desktop = await page.evaluate(() => {
      const foot = document.querySelector('.slideover.open .so-foot')!;
      const bar = document.querySelector('.topbar')!;
      const round = (value: number) => Math.round(value * 100) / 100;
      const tallestChild = (element: Element) => Math.max(...[...element.children].map((child) => child.getBoundingClientRect().height));
      return {
        footPaddingBottom: getComputedStyle(foot).paddingBottom,
        footHeight: round(foot.getBoundingClientRect().height),
        footContent: round(tallestChild(foot)),
        barPaddingTop: getComputedStyle(bar).paddingTop,
        barHeight: round(bar.getBoundingClientRect().height),
        barContent: round(tallestChild(bar)),
      };
    });
    expect(desktop.footPaddingBottom).toBe('12px');
    expect(desktop.footHeight).toBeCloseTo(desktop.footContent + 25, 1);
    expect(desktop.barPaddingTop).toBe('14px');
    // 14 + 14 of padding, 1 of border-bottom.
    expect(desktop.barHeight).toBeCloseTo(desktop.barContent + 29, 1);
  });
});
