// Browser cost harness: DOM nodes, HTML size, load timings, long tasks and
// scroll fps for the heavy dashboard pages. See scripts/perf/README.md for
// full usage. Story 17.1 promotes this from a session scratchpad
// (perf-load-report.md §5) so every epic 17 story measures prima/dopo with
// the same tool.
//
// Usage:
//   BASE=http://localhost:3001 PASSWORD=... node scripts/perf/render.mjs [width...]
//   e.g. node scripts/perf/render.mjs 1280 375
//
// One login for the whole run: @playwright/test ships a Node ESM export
// (`exports['.'].import`), so it imports as a bare specifier here — no
// createRequire, no absolute path (AC 4). PAGES is overridable via env
// (comma-separated paths) for a story that wants to measure a page this
// list does not cover.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const EMAIL = process.env.EMAIL ?? 'admin@airmanager.local';
const PASSWORD = process.env.PASSWORD;
const WIDTHS = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
if (WIDTHS.length === 0) WIDTHS.push(1280);
const PAGES = process.env.PAGES
  ? process.env.PAGES.split(',')
  : ['/it/dashboard', '/it/dashboard/bookings', '/it/dashboard/billing', '/it/dashboard/reports', '/it/dashboard/fleet', '/it/dashboard/pilots', '/it/dashboard/logbook'];
if (!PASSWORD) {
  console.error('need PASSWORD env');
  process.exit(2);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: WIDTHS[0], height: WIDTHS[0] < 500 ? 812 : 900 } });
const page = await ctx.newPage();
await page.goto(BASE + '/it/login');
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByLabel(/password/i).fill(PASSWORD);
await page.getByRole('button', { name: /accedi|login|entra/i }).click();
await page.waitForURL(/dashboard/);

console.log('| page | width | nodes | html KB | domInteractive ms | load ms | longTasks | longTaskTotal ms | scroll fps sample |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: w < 500 ? 812 : 900 });
  for (const p of PAGES) {
    await page.addInitScript(() => {
      window.__lt = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: true });
    });
    await page.goto(BASE + p, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(async () => {
      const nav = performance.getEntriesByType('navigation')[0];
      // scroll fps sample: 600ms of rAF while scrolling the main scroller
      const scroller = document.scrollingElement;
      let frames = 0;
      const t0 = performance.now();
      await new Promise((res) => {
        function step() {
          frames++;
          scroller.scrollTop += 120;
          if (performance.now() - t0 < 600) requestAnimationFrame(step);
          else res();
        }
        requestAnimationFrame(step);
      });
      const fps = Math.round((frames / (performance.now() - t0)) * 1000);
      return {
        nodes: document.getElementsByTagName('*').length,
        html: Math.round(document.documentElement.outerHTML.length / 1024),
        domInteractive: Math.round(nav.domInteractive),
        load: Math.round(nav.loadEventEnd),
        lt: window.__lt.length,
        ltTotal: Math.round(window.__lt.reduce((a, b) => a + b, 0)),
        fps,
      };
    });
    console.log(`| ${p} | ${w} | ${m.nodes} | ${m.html} | ${m.domInteractive} | ${m.load} | ${m.lt} | ${m.ltTotal} | ${m.fps} |`);
  }
}
await browser.close();
