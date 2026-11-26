import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

type Theme = 'light' | 'dark';
const screens = {
  login: '/it/login',
  dashboard: '/it/dashboard',
  logbook: '/it/dashboard/logbook',
  settings: '/it/dashboard/settings',
} as const;
const backgrounds = { dark: '11,16,21,255', light: '249,250,252,255' };

async function login(page: Page) {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill('admin@airmanager.local');
  await page.getByLabel('Password').fill(process.env.SEED_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

// Production CSS can serialize colors in Lab rather than Oklch. Rasterize in
// Chromium's sRGB canvas so the comparison measures the resulting colors.
async function colors(page: Page, values: string[]) {
  return page.evaluate((cssColors) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    return cssColors.map((value) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].join(',');
    });
  }, values);
}

async function installedTheme(page: Page, expected: Theme) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
  await expect(page.locator('html')).toHaveCSS('color-scheme', expected);
  const palette = await page.evaluate(() => ({
    token: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    background: getComputedStyle(document.body).backgroundColor,
  }));
  expect(await colors(page, [palette.token, palette.background])).toEqual([backgrounds[expected], backgrounds[expected]]);
  return palette;
}

type Sample = { at: number; theme?: string; scheme: string; background: string };
declare global {
  interface Window { firstStyledBody?: Sample; systemChangeSeen?: Promise<void> }
}

test('system theme is applied before first paint with application chunks blocked', async ({ page, baseURL }, info) => {
  test.setTimeout(120_000);
  await login(page);
  const authCookies = await page.context().cookies();
  let blocked = 0;
  await page.route('**/_next/static/**', async (route) => {
    if (route.request().resourceType() === 'script') {
      blocked++;
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.addInitScript(() => {
    // Sample as the HTML is parsed, before paint. A late DOM inspection alone
    // cannot distinguish a correct first paint from a correction on the next frame.
    const sample = () => {
      if (!document.body || window.firstStyledBody) return;
      const root = getComputedStyle(document.documentElement);
      if (!root.getPropertyValue('--bg').trim()) return;
      window.firstStyledBody = { at: performance.now(), theme: document.documentElement.dataset.theme,
        scheme: root.colorScheme, background: getComputedStyle(document.body).backgroundColor };
      observer.disconnect();
    };
    const observer = new MutationObserver(sample);
    observer.observe(document, { subtree: true, childList: true, attributes: true });
    document.addEventListener('readystatechange', sample);
  });
  const measurements = [];
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    for (const system of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: system });
      for (const manual of [undefined, 'light', 'dark'] as const) {
        const expected = manual ?? system;
        await page.context().clearCookies();
        if (manual) await page.context().addCookies([{ name: 'am-theme', value: manual, url: baseURL! }]);
        for (const [screen, path] of Object.entries(screens)) {
          if (screen === 'dashboard') await page.context().addCookies(authCookies);
          const before = blocked;
          const response = await page.goto(path);
          await expect(page).toHaveURL(new RegExp(path + '$'));
          const serverHtml = (await response!.text()).match(/<html\b[^>]*>/)?.[0];
          expect(serverHtml).toBeDefined();
          if (manual) expect(serverHtml).toContain(`data-theme="${manual}"`);
          else expect(serverHtml).not.toContain('data-theme=');
          expect(blocked).toBeGreaterThan(before);
          await page.waitForFunction(() => performance.getEntriesByName('first-paint').length > 0);
          const evidence = await page.evaluate(() => ({
            sample: window.firstStyledBody, paint: performance.getEntriesByName('first-paint')[0]!.startTime,
          }));
          expect(evidence.sample).toMatchObject({ theme: expected, scheme: expected });
          expect(await colors(page, [evidence.sample!.background])).toEqual([backgrounds[expected]]);
          expect(evidence.sample!.at).toBeLessThanOrEqual(evidence.paint);
          await installedTheme(page, expected);
          const id = `${width}-${system}-${manual ?? 'system'}-${screen}`;
          measurements.push({ id, ...evidence, blockedChunks: blocked - before });
          if (!manual && system === 'dark' && (screen === 'login' || screen === 'dashboard')) {
            await page.screenshot({ path: info.outputPath('blocked-' + id + '.png') });
          }
        }
      }
    }
  }
  await writeFile(info.outputPath('first-paints.json'), JSON.stringify(measurements, null, 2));

});

function hydrationErrors(page: Page) {
  const errors: string[] = [];
  // Production React uses numeric error codes. Treat any page exception or
  // console error on a fully interactive page as a failure, including those.
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || /hydration|did not match/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

for (const width of [375, 1280]) {
  test(`theme and native controls on the four real screens at ${width}px`, async ({ page, baseURL }, info) => {
    test.setTimeout(120_000);
    const errors = hydrationErrors(page);
    await login(page);
    const authCookies = await page.context().cookies();
    await page.setViewportSize({ width, height: 812 });
    const measurements = [];
    for (const system of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: system });
      for (const manual of [undefined, 'light', 'dark'] as const) {
        await page.context().clearCookies();
        if (manual) await page.context().addCookies([{ name: 'am-theme', value: manual, url: baseURL! }]);
        const expected = manual ?? system;
        for (const [screen, path] of Object.entries(screens)) {
          if (screen === 'dashboard') await page.context().addCookies(authCookies);
          await page.goto(path);
          await expect(page).toHaveURL(new RegExp(path + '$'));
          if (screen === 'logbook') await page.getByRole('button', { name: 'Registra volo', exact: true }).first().click();
          const control = screen === 'logbook' ? page.getByTestId('flight-form').locator('input[type=time]').first()
            : screen === 'settings' ? page.getByTestId('smtp-security-select')
            : screen === 'login' ? page.getByLabel('Email') : undefined;
          if (control) {
            await expect(control).toBeVisible();
            await control.scrollIntoViewIfNeeded();
            await expect(control).toHaveCSS('color-scheme', expected);
          } else {
            await expect(page.getByRole('heading', { name: 'Panoramica operativa' })).toBeVisible();
          }
          const palette = await installedTheme(page, expected);
          const id = `${width}-${system}-${manual ?? 'system'}-${screen}`;
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: info.outputPath(id + '.png'), animations: 'disabled' });
          measurements.push({ id, expected, ...palette, native: control ? await control.evaluate((el) => ({
            tag: el.tagName, type: el.getAttribute('type'), scheme: getComputedStyle(el).colorScheme,
          })) : null });
        }
      }
    }
    await writeFile(info.outputPath('matrix.json'), JSON.stringify(measurements, null, 2));
    expect(errors).toEqual([]);
  });
}

test('automatic changes and both visible toggle faces survive navigation, refresh and reload', async ({ page }) => {
  const errors = hydrationErrors(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await login(page);
  const html = page.locator('html');
  const cookie = async () => (await page.context().cookies()).find((item) => item.name === 'am-theme');
  const toggle = page.getByRole('button', { name: 'Cambia tema', exact: true });
  async function icons(theme: Theme) {
    const buttons = page.locator('button[aria-label="Cambia tema"]');
    await expect(buttons).toHaveCount(2);
    for (const button of await buttons.all()) {
      // The parent bar can be hidden by the breakpoint. Check both SVGs' own
      // computed display so a stale icon in the other bar cannot pass.
      await expect(button.locator('.theme-sun')).toHaveCSS('display', theme === 'dark' ? 'block' : 'none');
      await expect(button.locator('.theme-moon')).toHaveCSS('display', theme === 'light' ? 'block' : 'none');
    }
  }
  await installedTheme(page, 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await installedTheme(page, 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await installedTheme(page, 'dark');
  await icons('dark');
  expect(await cookie()).toBeUndefined();

  // Navigate using the shell, then trigger a real router.refresh() with a
  // successful write on a run-unique synthetic aircraft (never settings).
  await page.getByRole('navigation', { name: 'Aree operative' }).getByRole('link', { name: 'Velivoli', exact: true }).click();
  const registration = 'I-T' + randomUUID().slice(0, 8).toUpperCase();
  await page.getByTestId('fleet-search').fill(registration);
  await expect(page).toHaveURL(new RegExp('q=' + registration + '$'));
  await expect(page.getByTestId('fleet-empty')).toBeVisible();
  await page.getByTestId('fleet-new-button').click();
  const form = page.getByTestId('identity-form');
  await form.getByLabel('Marche').fill(registration);
  await form.getByLabel('Tipo').fill('Sintetico');
  await form.getByLabel('Modello').fill('18.6');
  await page.getByTestId('identity-submit').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Velivolo creato' })).toBeVisible();
  // The filtered grid takes its items exclusively from the server response:
  // a toast or an in-flight RSC request alone does not prove a committed refresh.
  await expect(page.locator('[data-testid^="ac-card-"]').filter({ hasText: registration })).toBeVisible();
  await installedTheme(page, 'dark');
  expect(await cookie()).toBeUndefined();
  await page.getByRole('navigation', { name: 'Aree operative' }).getByRole('link', { name: 'Panoramica', exact: true }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
  await toggle.click();
  await installedTheme(page, 'light');
  await icons('light');
  expect(await cookie()).toMatchObject({ value: 'light', path: '/', sameSite: 'Lax' });
  await page.setViewportSize({ width: 375, height: 812 });
  await toggle.click();
  await icons('dark');
  await page.evaluate(() => {
    window.systemChangeSeen = new Promise((resolve) => {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => resolve(), { once: true });
    });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => window.systemChangeSeen);
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await cookie()).toMatchObject({ value: 'dark', path: '/' });
  await page.reload();
  await installedTheme(page, 'dark');
  await icons('dark');
  expect(errors).toEqual([]);
});

test('invalid preferences follow the system and disabled scripting has a light CSS fallback', async ({ page, browser, baseURL }) => {
  await page.context().addCookies([{ name: 'am-theme', value: 'unknown', url: baseURL! }]);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/it/login');
  await installedTheme(page, 'dark');
  const noJs = await browser.newContext({ baseURL, javaScriptEnabled: false, colorScheme: 'dark' });
  try {
    const fallback = await noJs.newPage();
    await fallback.goto('/it/login');
    await expect(fallback.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    await expect(fallback.locator('html')).toHaveCSS('color-scheme', 'light');
    expect(await colors(fallback, [await fallback.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)])).toEqual([backgrounds.light]);
  } finally {
    await noJs.close();
  }
});

test('four dark component overrides match their intended paint in automatic and explicit dark mode', async ({ page, baseURL }) => {
  for (const manual of [false, true]) {
    await page.emulateMedia({ colorScheme: manual ? 'light' : 'dark' });
    if (manual) await page.context().addCookies([{ name: 'am-theme', value: 'dark', url: baseURL! }]);
    await page.goto('/it/login');
    // Attach a real node for each selector to the loaded AirOps stylesheet.
    // btn.accent has no live consumer; using a fixture exercises its cascade too.
    const styles = await page.evaluate(() => {
      const fixture = document.createElement('div');
      fixture.innerHTML = '<div class="toast"><span class="toast-dot"></span></div><span class="badge ok">OK</span>' +
        '<p class="fld-error">Errore</p><button class="btn accent">Azione</button>';
      document.body.append(fixture);
      const values = ['.toast-dot', '.badge.ok', '.fld-error', '.btn.accent'].map((selector) => {
        const style = getComputedStyle(fixture.querySelector(selector)!);
        return selector === '.toast-dot' ? style.backgroundColor : style.color;
      });
      fixture.remove();
      return values;
    });
    expect(await colors(page, styles)).toEqual(['37,134,81,255', '161,236,187,255', '253,115,109,255', '71,26,0,255']);
  }
});
