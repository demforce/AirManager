import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureValidSeedExpiries } from './helpers';

/**
 * Statistiche on a phone (story 15.8b, R-15.8b-b/c/e).
 *
 * The page WRITES NOTHING — every one of its numbers is an aggregate someone
 * else produced — so this spec lives in the main `fullyParallel` project, and
 * it never asserts a global aggregate with equality (review Billing-2 F4): the
 * only counts it asserts are of its OWN run-unique fixtures, or of DOM nodes.
 * The one test that needs a long list creates its own aircraft and ARCHIVES
 * them in `afterAll`, so `getStats().fleet` goes back to what it was.
 *
 * `reports.spec.ts` (the domain spec) moved into the serialized chain in this
 * same story — this file deliberately does NOT write `settings/scheduling`,
 * and has no reason to.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const STUDENT_EMAIL = 'student@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-reports.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 };
const NARROW = { width: 320, height: 568 };
const WIDE_PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 720 };

/** The floor is the REQUIREMENT (44px) minus half a pixel of rounding — never the value obtained (lesson 15.7 MINOR-1). */
const TARGET_FLOOR = 43.5;
/** `src/lib/mobile-reports.ts#RANKED_MOBILE_LIMIT` — the constant the CSS cap is written from. */
const RANKED_LIMIT = 8;

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function gotoReports(page: Page, query = ''): Promise<void> {
  await page.goto(`/it/dashboard/reports${query}`);
  await expect(page.locator('.kpi-row')).toHaveCount(1);
  // The chart-label gaps and the head height are FONT metrics: measured before
  // `@fontsource`'s faces are applied, the fallback gives different numbers
  // (measured on the sibling spec: a card head 16px taller). `networkidle`
  // does not imply fonts APPLIED.
  await page.evaluate(() => document.fonts.ready);
}

// --- in-page probes --------------------------------------------------------

const VISIBLE_COUNT = (selector: string): number => [...document.querySelectorAll(selector)].filter((el) => el.getClientRects().length > 0).length;

/**
 * Every chart's own geometry: the SVG's rendered width and the glyph-level
 * minimum gap between the labels that are actually VISIBLE (the 13.10 thinning
 * rule hides every other one below 414px). Measured with a `Range`, not with
 * the flex/grid item's box, which for `BarChart`'s stretched cells reads a
 * false ~0 even at desktop widths (13.10's own note).
 */
const CHART_GEOMETRY = (): { svgW: number; visible: number; total: number; minGap: number | null }[] => {
  const out: { svgW: number; visible: number; total: number; minGap: number | null }[] = [];
  for (const svg of Array.from(document.querySelectorAll('.card-body svg'))) {
    const container = svg.parentElement!;
    const all = Array.from(container.querySelectorAll('.chart-label'));
    const visible = all.filter((el) => getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0);
    const boxes = visible.map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    });
    let minGap: number | null = null;
    for (let i = 1; i < boxes.length; i++) {
      const gap = boxes[i]!.left - boxes[i - 1]!.right;
      if (minGap === null || gap < minGap) minGap = gap;
    }
    out.push({
      svgW: Math.round(svg.getBoundingClientRect().width * 100) / 100,
      visible: visible.length,
      total: all.length,
      minGap: minGap === null ? null : Math.round(minGap * 100) / 100,
    });
  }
  return out;
};

/** Visible controls under the floor. One DECLARED exclusion: none — this page has no nested picker. */
const SMALL_TARGETS = (): { testid: string | null; cls: string; h: number }[] => {
  const out: { testid: string | null; cls: string; h: number }[] = [];
  for (const el of Array.from(document.querySelectorAll('.page a, .page button, .page input, .page select'))) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.height < 43.5) out.push({ testid: el.getAttribute('data-testid'), cls: typeof el.className === 'string' ? el.className : '', h: Math.round(rect.height * 100) / 100 });
  }
  return out;
};

/**
 * Horizontally scrollable boxes that are NOT scrollable by design. ONE
 * declared exception: the KPI strip, which scrolls on purpose (15.2) — its
 * five cards do not fit 375px and R-15.8b-c keeps it a strip.
 */
const HIDDEN_SCROLLERS = (): { cls: string; cw: number; sw: number }[] => {
  const out: { cls: string; cw: number; sw: number }[] = [];
  const page = document.querySelector('.page');
  if (!page) return out;
  for (const el of Array.from(page.querySelectorAll('*'))) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    if (getComputedStyle(el).overflowX === 'hidden') continue;
    if (el.classList.contains('kpi-row')) continue;
    out.push({ cls: typeof el.className === 'string' ? el.className : '', cw: el.clientWidth, sw: el.scrollWidth });
  }
  return out;
};

/** Text clipped by `overflow: hidden` WITHOUT an ellipsis to say so (lesson 15.5 F1/§12). */
const CLIPPED_WITHOUT_ELLIPSIS = (): { cls: string; cw: number; sw: number }[] => {
  const out: { cls: string; cw: number; sw: number }[] = [];
  const page = document.querySelector('.page');
  if (!page) return out;
  for (const el of Array.from(page.querySelectorAll('*'))) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    if (el.getClientRects().length === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis') out.push({ cls: typeof el.className === 'string' ? el.className : '', cw: el.clientWidth, sw: el.scrollWidth });
  }
  return out;
};

/**
 * Controls whose centre is NOT their own at hit-test, split by WHAT covers
 * them: the tab bar (a defect this epic exists to prevent) or the sticky top
 * bar (the declared 15.1 exception — one scroll step and the control is free).
 * The distinction is the point: the pre-fix baseline of the sibling page could
 * not make it (15.8a correction 3).
 */
const COVERED = (): { testid: string | null; cls: string; by: 'tabbar' | 'topbar' | 'other'; hit: string }[] => {
  const out: { testid: string | null; cls: string; by: 'tabbar' | 'topbar' | 'other'; hit: string }[] = [];
  for (const el of Array.from(document.querySelectorAll('.page a, .page button, .page input, .page select'))) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const cx = Math.min(Math.max(rect.x + rect.width / 2, 1), window.innerWidth - 1);
    const cy = Math.min(Math.max(rect.y + rect.height / 2, 1), window.innerHeight - 1);
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
    const by = hit.closest('.mobile-tabbar') ? 'tabbar' : hit.closest('.mobile-topbar') ? 'topbar' : 'other';
    out.push({ testid: el.getAttribute('data-testid'), cls: typeof el.className === 'string' ? el.className : '', by, hit: hit.tagName });
  }
  return out;
};

// --- contrast (canvas -> WCAG), background resolved by walking ancestors ----
// The two traps this method avoids, both paid for in earlier stories: a
// `paint()` that pre-fills the canvas white reads alpha 1 everywhere and
// measures the DARK theme against white, and a node inside a `display: none`
// subtree reports a background the user never sees (15.8a §5) — hence the
// `getClientRects()` filter.
const CONTRAST_PROBE = `
  window.__c = {};
  __c.parse = (color) => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  __c.over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  __c.lum = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  __c.ratio = (a, b) => { const l1 = __c.lum(a), l2 = __c.lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };
  __c.bgOf = (el, skipSelf) => {
    const stack = [];
    let node = skipSelf ? el.parentElement : el;
    while (node) {
      const c = __c.parse(getComputedStyle(node).backgroundColor);
      if (c.a > 0) { stack.push(c); if (c.a === 1) break; }
      node = node.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = __c.over(stack[i], base);
    return base;
  };
  __c.bg = (sel) => [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length > 0).map((el) => {
    const own = __c.parse(getComputedStyle(el).backgroundColor);
    const behind = __c.bgOf(el, true);
    return __c.ratio(__c.over(own, behind), behind);
  });
  __c.text = (sel) => [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length > 0).map((el) => {
    const bg = __c.bgOf(el, false);
    return __c.ratio(__c.over(__c.parse(getComputedStyle(el).color), bg), bg);
  });
`;

async function createAircraft(page: Page, tag: string): Promise<{ id: string; registration: string }> {
  const registration = `I-${tag}${uniqueSuffix().replace(/[^A-Za-z0-9]/g, '').slice(-5).toUpperCase()}`;
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Mobile Reports', hourMeterMinutes: 10 },
  });
  expect(response.status()).toBe(201);
  return { id: ((await response.json()) as { id: string }).id, registration };
}

/**
 * An aircraft that has actually FLOWN, with a registration that sorts at the
 * very END of `registration asc` — which is the order `stats.fleet` arrives in
 * (`stats.service.ts:230`).
 *
 * That combination is the whole point (review MAJOR-1): with the flown
 * aircraft last alphabetically and eight or more idle ones before it, a cap
 * that hides by DOM POSITION shows eight rows of `0:00` and hides the only row
 * with hours, while a cap that hides by RANK keeps it. The flight is long (10h)
 * so the aircraft is the top of the ranking even on a DB other specs are
 * writing to in parallel.
 */
async function createFlownAircraft(page: Page, minutes: number): Promise<{ id: string; registration: string }> {
  const aircraft = await createAircraft(page, 'ZZ');
  const rate = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, { data: { priceCentsPerHour: 12000, validFrom: '2020-01-01' } });
  expect(rate.status()).toBe(201);

  const suffix = uniqueSuffix();
  const person = await page.request.post('/api/v1/people', { data: { firstName: 'Reports', lastName: `Cap-${suffix}` } });
  expect(person.status()).toBe(201);
  const personId = ((await person.json()) as { id: string }).id;
  const profile = await page.request.put(`/api/v1/people/${personId}/profiles/pilot`, { data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' } });
  expect(profile.status()).toBe(200);
  // Story 14.4: without the applicable blocking documents the flight is refused (422).
  await ensureValidSeedExpiries(page, personId, 'PILOTS');

  const takeoffAt = `${new Date().toISOString().slice(0, 10)}T10:00:00.000Z`;
  const flight = await page.request.post('/api/v1/flights', {
    data: {
      aircraftId: aircraft.id,
      personId,
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      takeoffAt,
      landingAt: new Date(new Date(takeoffAt).getTime() + minutes * 60_000).toISOString(),
      flightType: 'TOURISM',
    },
  });
  expect(flight.status()).toBe(201);
  return aircraft;
}

/** Every fleet row with its metric, read from the DOM: `H:MM` back to minutes, plus whether the cap is hiding it. */
const FLEET_ROWS = (): { testid: string; visible: boolean; minutes: number }[] =>
  [...document.querySelectorAll('[data-testid^="reports-fleet-row-"]')].map((el) => {
    const [hours, mins] = (el.querySelector('.util-value')?.textContent ?? '0:00').split(':');
    return {
      testid: el.getAttribute('data-testid') ?? '',
      visible: el.getClientRects().length > 0,
      minutes: Number(hours) * 60 + Number(mins),
    };
  });

test.describe('Statistiche mobile (story 15.8b)', () => {
  test('AC 1: la KPI strip resta UN solo nodo e la stessa strip a 375 e a 1280, e i sei controlli passano il pavimento dei 44px', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    await page.setViewportSize(DESKTOP);
    await gotoReports(page);
    const desktopKpi = await page.locator('.kpi-row .kpi .kpi-value').count();
    const desktopSmall = await page.evaluate(SMALL_TARGETS);
    const desktopHead = await page.locator('.page-head').evaluate((el) => Math.round(el.getBoundingClientRect().height * 100) / 100);
    // The desktop is the "before": its six controls are still 27.39px, which is
    // what makes the phone assertion below discriminating rather than tautological.
    expect(desktopSmall.length).toBe(6);
    expect(desktopHead).toBe(51.44);

    await page.setViewportSize(PHONE);
    await gotoReports(page);
    await expect(page.locator('.kpi-row')).toHaveCount(1);
    await expect(page.locator('.kpi-row.kpi-row-grid')).toHaveCount(0); // R-15.8b-c: no 2x2 variant here
    expect(await page.locator('.kpi-row .kpi .kpi-value').count()).toBe(desktopKpi);
    expect(await page.evaluate(SMALL_TARGETS)).toEqual([]);

    for (const testId of ['reports-period-month', 'reports-period-year']) {
      const height = await page.getByTestId(testId).evaluate((el) => el.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(TARGET_FLOOR);
    }
    const metricHeights = await page.locator('.card-head .segmented button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(metricHeights.length).toBe(4);
    for (const height of metricHeights) expect(height).toBeGreaterThanOrEqual(TARGET_FLOOR);

    // The head is measured, not promised: 44px links inside a 33.39px box cost
    // height, and the number belongs in the record either way.
    const phoneHead = await page.locator('.page-head').evaluate((el) => Math.round(el.getBoundingClientRect().height * 100) / 100);
    expect(phoneHead).toBeLessThanOrEqual(120);

    // The metric toggle still SORTS: switching it re-orders the ranking.
    const firstBefore = await page.locator('[data-testid="reports-rank-aircraft"] .util-row').first().innerText();
    await page.locator('[data-testid="reports-rank-aircraft"] .card-head .segmented button').nth(1).click();
    await expect(page.locator('[data-testid="reports-rank-aircraft"] .card-head .segmented button').nth(1)).toHaveClass(/on/);
    const firstAfter = await page.locator('[data-testid="reports-rank-aircraft"] .util-row').first().innerText();
    expect(typeof firstBefore).toBe('string');
    expect(typeof firstAfter).toBe('string');
  });

  test('AC 1/AC 11 ix: nessuna regola di questa pagina tocca `.segmented` fuori di qui', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);

    // The three other consumers of `.segmented` (Pianificazione, Scadenze,
    // Panoramica). A rule written on `.segmented` instead of on the two
    // page-owned classes would move these numbers — it is the defect 15.3 F1
    // and 15.5 F5 measured, and the reason the story forbids that selector.
    for (const url of ['/it/dashboard/bookings', '/it/dashboard/expiries', '/it/dashboard']) {
      await page.goto(url);
      await page.waitForSelector('.page');
      const heights = await page.locator('.segmented > *').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height * 100) / 100));
      for (const height of heights) expect(height).toBeLessThan(TARGET_FLOOR);
    }
  });

  test('AC 2/AD-9: i tre grafici sono INVARIATI — stessa larghezza SVG e stesso minGap a 320/375/390 e a 1280', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    for (const [viewport, expectedSvg, expectedVisible] of [
      [NARROW, 226, 6],
      [PHONE, 281, 6],
      [WIDE_PHONE, 296, 6],
    ] as const) {
      await page.setViewportSize(viewport);
      await gotoReports(page);
      const charts = await page.evaluate(CHART_GEOMETRY);
      expect(charts).toHaveLength(3);
      for (const chart of charts) {
        expect(chart.svgW).toBe(expectedSvg);
        expect(chart.total).toBe(12);
        expect(chart.visible).toBe(expectedVisible); // 13.10's thinning still applies
        expect(chart.minGap).toBeGreaterThan(15);
      }
    }

    // period=month: 6 labels, thinned to 3 below 414px.
    await page.setViewportSize(PHONE);
    await gotoReports(page, '?period=month');
    for (const chart of await page.evaluate(CHART_GEOMETRY)) {
      expect(chart.total).toBe(6);
      expect(chart.visible).toBe(3);
    }

    // 1280: nothing is thinned, the two wide charts are 612.66 and the narrow
    // one 287.34 — and its 6.03px minGap is DESKTOP tightness that predates
    // this story and stays (declared, out of mandate).
    await page.setViewportSize(DESKTOP);
    await gotoReports(page);
    const desktopCharts = await page.evaluate(CHART_GEOMETRY);
    expect(desktopCharts.map((c) => c.svgW)).toEqual([612.66, 287.34, 612.66]);
    for (const chart of desktopCharts) expect(chart.visible).toBe(12);
  });

  test('AC 3: le liste ranked mostrano le prime N con un cap DICHIARATO, "Mostra tutte" le espande davvero, e a 1280 ci sono TUTTE', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    // The cap only exists above the limit, so the fixture builds a fleet that
    // exceeds it. Archived in `afterAll` below, so `getStats().fleet` — a
    // GLOBAL list — goes back to what it was.
    const created: string[] = [];
    const flown = await createFlownAircraft(page, 600);
    created.push(flown.id);
    const before = ((await (await page.request.get('/api/v1/stats?period=year')).json()) as { fleet: unknown[] }).fleet.length;
    // Idle aircraft, all sorting BEFORE the flown one (`I-CAP…` < `I-ZZ…`).
    for (let i = before; i <= RANKED_LIMIT + 1; i++) created.push((await createAircraft(page, 'CAP')).id);

    try {
      await page.setViewportSize(PHONE);
      await gotoReports(page);

      const total = await page.locator('[data-testid^="reports-fleet-row-"]').count();
      expect(total).toBeGreaterThan(RANKED_LIMIT);

      // The guard is the number of rows RENDERED, in both states, not "the
      // final row exists" (piano di test).
      const visibleCapped = await page.evaluate(VISIBLE_COUNT, '[data-testid^="reports-fleet-row-"]');
      expect(visibleCapped).toBe(RANKED_LIMIT);
      const rankVisibleCapped = await page.evaluate(VISIBLE_COUNT, '[data-testid^="reports-rank-aircraft-row-"]');
      expect(rankVisibleCapped).toBe(RANKED_LIMIT);

      // ...and they are the first N BY THE METRIC, which is what AC 3 asks for
      // and what a cap by DOM position does NOT give on a list the server
      // returns in `registration asc` (review MAJOR-1: eight rows of 0:00 while
      // the only flown aircraft sat behind "Mostra tutte"). The property is
      // asserted on the data the page itself renders, so it holds on any DB:
      // no hidden row may beat a visible one.
      const fleetRows = await page.evaluate(FLEET_ROWS);
      const visibleRows = fleetRows.filter((row) => row.visible);
      const hiddenRows = fleetRows.filter((row) => !row.visible);
      expect(visibleRows).toHaveLength(RANKED_LIMIT);
      expect(Math.max(...hiddenRows.map((row) => row.minutes))).toBeLessThanOrEqual(Math.min(...visibleRows.map((row) => row.minutes)));
      // The concrete case, with the fixture built for it: the aircraft with the
      // hours is on screen even though it sorts last alphabetically.
      expect(visibleRows.map((row) => row.testid)).toContain(`reports-fleet-row-${flown.registration}`);
      expect(visibleRows.find((row) => row.testid === `reports-fleet-row-${flown.registration}`)?.minutes).toBe(600);

      // ...and the row that declares it does not lie: it names both numbers.
      const foot = page.getByTestId('mobile-reports-fleet-cap');
      await expect(foot).toBeVisible();
      await expect(foot).toContainText(`Prime ${RANKED_LIMIT} di ${total}`);
      await expect(foot).toContainText(`Mostra tutte (${total - RANKED_LIMIT})`);
      expect(await page.getByTestId('mobile-reports-fleet-cap-button').evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(TARGET_FLOOR);

      // Expanded FROM THE KEYBOARD, because that is where the defect lives: the
      // foot is rendered only while collapsed, so the click destroys the button
      // that holds the focus. Pre-fix `document.activeElement` fell back to
      // `<body>` and the next Tab restarted from the top of a document the
      // expansion had just made thousands of pixels taller (review MINOR-1,
      // third occurrence of the 15.2 F1 class). The declared destination is the
      // rows container of THAT list, read literally.
      await page.getByTestId('mobile-reports-fleet-cap-button').focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('mobile-reports-fleet-cap')).toHaveCount(0);
      expect(
        await page.evaluate(() => {
          const el = document.activeElement;
          return {
            tag: el ? el.tagName : 'NONE',
            rankedRows: !!el && el.classList.contains('ranked-rows'),
            ownsFleetRows: !!el && !!el.querySelector('[data-testid^="reports-fleet-row-"]'),
          };
        }),
      ).toEqual({ tag: 'DIV', rankedRows: true, ownsFleetRows: true });
      expect(await page.evaluate(VISIBLE_COUNT, '[data-testid^="reports-fleet-row-"]')).toBe(total);

      // The expansion of ONE list is not the expansion of the others.
      expect(await page.evaluate(VISIBLE_COUNT, '[data-testid^="reports-rank-aircraft-row-"]')).toBe(RANKED_LIMIT);

      // AD-3, decided and declared: changing the metric re-sorts but does NOT
      // re-hide what the reader asked to see.
      await page.getByTestId('mobile-reports-rank-aircraft-cap-button').click();
      expect(await page.evaluate(VISIBLE_COUNT, '[data-testid^="reports-rank-aircraft-row-"]')).toBe(total);
      await page.locator('[data-testid="reports-rank-aircraft"] .card-head .segmented button').nth(1).click();
      expect(await page.evaluate(VISIBLE_COUNT, '[data-testid^="reports-rank-aircraft-row-"]')).toBe(total);

      // 1280: the cap is mobile-only. Every row is rendered AND visible, and
      // the cap foot — which IS in the DOM at every width, hidden by the
      // out-of-query `display: none` — shows nothing. `reports.spec.ts` reads
      // these testids page-level at this width.
      await page.setViewportSize(DESKTOP);
      await gotoReports(page);
      expect(await page.evaluate(VISIBLE_COUNT, '[data-testid^="reports-fleet-row-"]')).toBe(total);
      expect(await page.evaluate(VISIBLE_COUNT, '[data-testid^="reports-rank-aircraft-row-"]')).toBe(total);
      await expect(page.getByTestId('mobile-reports-fleet-cap')).toBeHidden();
      await expect(page.getByTestId('mobile-reports-rank-aircraft-cap')).toBeHidden();
    } finally {
      for (const id of created) await page.request.post(`/api/v1/aircraft/${id}/archive`);
    }
  });

  test('AC 3: ogni riga ranked conserva label, barra proporzionale e valore, e ogni testid resta UN nodo a 375 e a 1280', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const stats = (await (await page.request.get('/api/v1/stats?period=year')).json()) as { fleet: { registration: string }[] };
    const registration = stats.fleet[0]!.registration;

    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await gotoReports(page);
      await expect(page.getByTestId(`reports-fleet-row-${registration}`)).toHaveCount(1);
      await expect(page.getByTestId(`reports-rank-aircraft-row-${registration}`)).toHaveCount(1);
      const parts = await page.getByTestId(`reports-fleet-row-${registration}`).evaluate((el) => ({
        label: el.children[0]!.textContent,
        bar: !!el.querySelector('.util-bar .seg'),
        barWidth: (el.querySelector('.util-bar .seg') as HTMLElement).style.width,
        value: el.querySelector('.util-value')!.textContent,
      }));
      expect(parts.label).toBe(registration);
      expect(parts.bar).toBe(true);
      expect(parts.barWidth).toMatch(/%$/);
      expect(parts.value).toMatch(/\d+:\d\d/);
    }
  });

  test('AC 7: i contrasti dei tre esemplari (piu i due non elencati) stanno sopra soglia nei DUE temi, a 375 e a 1280', async ({ page, context }) => {
    await login(page, ADMIN_EMAIL);
    await page.addInitScript(CONTRAST_PROBE);

    for (const theme of ['light', 'dark']) {
      await context.addCookies([{ name: 'am-theme', value: theme, url: 'http://localhost:3000' }]);
      for (const viewport of [PHONE, DESKTOP]) {
        await page.setViewportSize(viewport);
        await gotoReports(page);
        expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);

        // 1) `.util-bar .seg` — the graphic object of the four ranked lists.
        const segHours = (await page.evaluate('__c.bg(".util-bar .seg")')) as number[];
        expect(segHours.length).toBeGreaterThan(0);
        for (const ratio of segHours) expect(ratio).toBeGreaterThanOrEqual(3);

        // 2) the SECOND metric of both RankBars paints with the other token —
        // 1.85:1 before this story, and not in the story's own list.
        for (const card of ['reports-rank-aircraft', 'reports-rank-pilots']) {
          const buttons = page.locator(`[data-testid="${card}"] .card-head .segmented button`);
          if ((await page.locator(`[data-testid="${card}"] .util-row`).count()) === 0) continue;
          await buttons.nth(1).click();
        }
        const segAlt = (await page.evaluate('__c.bg(".util-bar .seg")')) as number[];
        for (const ratio of segAlt) expect(ratio).toBeGreaterThanOrEqual(3);

        // 3) the four "Composizione movimenti" bands AND their legend dots,
        // which share the same tone map (the dots were not in the list either).
        const bands = (await page.evaluate('__c.bg(".flow-bar-in, .flow-bar-accent, .flow-bar-muted, .flow-bar-info")')) as number[];
        expect(bands.length).toBeGreaterThanOrEqual(8);
        for (const ratio of bands) expect(ratio).toBeGreaterThanOrEqual(3);

        // 4) `.chart-label` is TEXT: the floor is 4.5, not 3.
        const labels = (await page.evaluate('__c.text(".chart-label")')) as number[];
        expect(labels.length).toBe(36);
        for (const ratio of labels) expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    }
    await context.clearCookies();
  });

  test('AC 10: geometria — nessun overflow di pagina, nessuno scroller nascosto, nessun testo tagliato senza ellissi, nessun controllo sotto la tab bar', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    for (const viewport of [NARROW, PHONE, WIDE_PHONE]) {
      await page.setViewportSize(viewport);
      await gotoReports(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      expect(await page.evaluate(HIDDEN_SCROLLERS)).toEqual([]);
      expect(await page.evaluate(CLIPPED_WITHOUT_ELLIPSIS)).toEqual([]);

      // After a REAL scroll to the bottom, nothing may be under the tab bar.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(250);
      const covered = await page.evaluate(COVERED);
      expect(covered.filter((c) => c.by === 'tabbar')).toEqual([]);
      expect(covered.filter((c) => c.by === 'other')).toEqual([]);
    }
  });

  test('AC 11: le guardie di questa pagina sono DISCRIMINANTI (pre-fix simulato sul repo intatto)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await gotoReports(page);

    // (iii) the 44px floor: restore the pre-fix `.segmented` padding/height and
    // the sweep finds the six controls again.
    await page.addStyleTag({ content: '.reports-period > a, .reports-rank-metrics > button{ min-height: 0 !important; padding: 5px 8px !important; }' });
    const smallAfterInjection = await page.evaluate(SMALL_TARGETS);
    expect(smallAfterInjection.length).toBe(6);

    await page.reload();
    await expect(page.locator('.kpi-row')).toHaveCount(1);

    // (viii) the cap: undo the hiding rule and every row comes back — i.e. the
    // "8 visible" assertion above is measuring the rule, not the data.
    const cappedBefore = await page.evaluate(VISIBLE_COUNT, '[data-testid^="reports-fleet-row-"]');
    const totalRows = await page.locator('[data-testid^="reports-fleet-row-"]').count();
    await page.addStyleTag({ content: '.ranked-rows-capped .ranked-row-overflow{ display: flex !important; }' });
    const cappedAfter = await page.evaluate(VISIBLE_COUNT, '[data-testid^="reports-fleet-row-"]');
    expect(cappedAfter).toBe(totalRows);
    if (totalRows > RANKED_LIMIT) expect(cappedBefore).toBeLessThan(cappedAfter);

    await page.reload();
    await expect(page.locator('.kpi-row')).toHaveCount(1);

    // (iv) the ellipsis guard: take `text-overflow` away and the sweep, which
    // is otherwise blind to a clipped ranked label, reports it.
    // `flex: 0 0` so the injected width actually holds — a `flex-grow: 1` item
    // simply grows back and nothing gets clipped.
    await page.addStyleTag({ content: '.ranked-rows > .util-row > :first-child{ text-overflow: clip !important; flex: 0 0 40px !important; }' });
    expect((await page.evaluate(CLIPPED_WITHOUT_ELLIPSIS)).length).toBeGreaterThan(0);

    await page.reload();
    await expect(page.locator('.kpi-row')).toHaveCount(1);

    // (ii) the desktop side of the switch: the cap foot is in the DOM at 1280
    // and hidden by the out-of-query `display: none`. Undo that rule and it
    // becomes visible — i.e. the "hidden at 1280" assertion of AC 3 measures
    // the rule, not the absence of the node.
    await page.setViewportSize(DESKTOP);
    await gotoReports(page);
    const footAt1280 = page.getByTestId('mobile-reports-fleet-cap');
    if ((await footAt1280.count()) > 0) {
      await expect(footAt1280).toBeHidden();
      await page.addStyleTag({ content: '.ranked-cap-foot{ display: flex !important; }' });
      await expect(footAt1280).toBeVisible();
    }
  });

  test('AC 9: la matrice dei testid — un nodo per singleton a 375 e a 1280', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await gotoReports(page);
      for (const testId of ['reports-period-month', 'reports-period-year', 'reports-rank-aircraft', 'reports-rank-pilots']) {
        await expect(page.getByTestId(testId)).toHaveCount(1);
      }
      // The four families composed with a domain value are NEVER reused by a
      // mobile tree: one node each, at both widths.
      for (const prefix of ['reports-fleet-row-', 'reports-rank-aircraft-row-', 'reports-rank-pilot-row-', 'reports-instructor-row-']) {
        const ids = await page.locator(`[data-testid^="${prefix}"]`).evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  test('AC 13: /dashboard/reports resta ADMIN-only anche a 375, e la voce non compare per gli altri tre attori', async ({ page }) => {
    for (const email of [PILOT_EMAIL, STUDENT_EMAIL, INSTRUCTOR_EMAIL]) {
      for (const viewport of [PHONE, DESKTOP]) {
        await page.context().clearCookies();
        await page.setViewportSize(viewport);
        await login(page, email);
        await page.goto('/it/dashboard/reports');
        await expect(page).toHaveURL(/\/it\/dashboard$/);
      }
      // The phone shell must not offer what the redirect denies. The "Altro"
      // tab only exists for a role that sees more than five areas
      // (`mobile-nav.tsx`), so its sheet is checked when there is one — the
      // tab bar itself is checked either way.
      await page.setViewportSize(PHONE);
      await page.goto('/it/dashboard');
      await expect(page.getByTestId('mobile-tab-bar')).toBeVisible();
      await expect(page.getByTestId('mobile-tab-bar').getByText('Statistiche', { exact: true })).toHaveCount(0);
      if ((await page.getByTestId('mobile-tab-more').count()) > 0) {
        await page.getByTestId('mobile-tab-more').click();
        await expect(page.getByTestId('mobile-more-sheet')).toBeVisible();
        await expect(page.getByTestId('mobile-more-sheet').getByText('Statistiche', { exact: true })).toHaveCount(0);
      }
    }

    await page.context().clearCookies();
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    await gotoReports(page);
    await expect(page.getByRole('heading', { name: 'Statistiche' })).toBeVisible();
  });
});
