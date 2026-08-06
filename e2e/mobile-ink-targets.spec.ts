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
   * 0, the card a `<button>` 317x82.83 with zero interactive children.
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
        const card = document.querySelector('[data-testid^="ppr-row-mobile"]');
        const rect = card?.getBoundingClientRect();
        return {
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          cardIsButton: card ? card.tagName.toLowerCase() === 'button' : null,
          cardInteractiveChildren: card ? card.querySelectorAll('a,button,input,select,textarea').length : null,
          cardHeight: rect ? Math.round(rect.height * 100) / 100 : null,
        };
      });
      expect(geometry.pageOverflow).toBeLessThanOrEqual(0);
      if (geometry.cardIsButton !== null) {
        expect(geometry.cardIsButton).toBe(true);
        expect(geometry.cardInteractiveChildren).toBe(0);
        expect(geometry.cardHeight).toBe(82.83);
      }
    });
  }

  /** The same form is mounted by `/dashboard/movements` ("Registra arrivo"): the rule reaches both. */
  test('the shared ManualPprForm has no small target on /dashboard/movements either', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/movements');
    await page.waitForSelector('.page');
    const small = await smallTargets(page, '.manual-ppr-form');
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
});
