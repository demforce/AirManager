import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { removeDesktopRegistries, seedDesktopRegistries } from './db-fixtures';

async function login(page: Page, role = 'admin') {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(`${role}@airmanager.local`);
  await page.getByLabel('Password').fill(process.env['SEED_ADMIN_PASSWORD']!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Coordinates measured in place: locator.click() alone would scroll a hidden control into view. */
async function bothActionsReceivePointer(row: Locator) {
  await expect.poll(() => row.locator(':scope > :last-child button').evaluateAll((buttons) =>
    buttons.slice(0, 2).map(button => {
      const box = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }),
  )).toEqual([true, true]);
}

for (const registry of ['logbook', 'pilots'] as const) {
  test(`${registry}: actions, sticky header, keyboard scroll and overlays`, async ({ page }) => {
    test.setTimeout(90000);
    const stamp = 'D187' + randomUUID().slice(0, 8);
    await seedDesktopRegistries(stamp);
    try {
      await login(page);
      const filter = registry === 'logbook' ? 'personQuery' : 'q';
      await page.goto(`/it/dashboard/${registry}?${filter}=${stamp}`);
      const table = page.locator(`div.${registry}-desktop-body`);
      const rows = table.locator(registry === 'pilots' ? '[data-testid^=pilot-row-]' : '[data-testid=flight-row]');
      await expect(rows).toHaveCount(20);
      await page.evaluate(() => document.fonts.ready);

      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
        for (const width of [641, 768, 1000, 1100, 1200, 1201, 1280, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(() => window.scrollTo(0, 0));
          await table.evaluate(el => el.scrollTo(0, 0));
          await bothActionsReceivePointer(rows.first());
          expect(await table.evaluate(el => el.scrollLeft)).toBe(0);

          // Compact desktop window + 20 multi-line records gives both registries 800 real pixels.
          await page.setViewportSize({ width, height: 400 });
          await table.evaluate(el => {
            const bar = document.querySelector('.topbar')!.getBoundingClientRect();
            window.scrollBy(0, el.getBoundingClientRect().top - bar.bottom - 2);
            el.scrollTo(el.scrollWidth, 800);
          });
          expect(await table.evaluate(el => el.scrollTop)).toBe(800);
          const visibleIndex = await table.evaluate(el => {
            const header = el.querySelector('.header')!.getBoundingClientRect();
            const bounds = el.getBoundingClientRect();
            const topbar = document.querySelector('.topbar')!.getBoundingClientRect();
            if (header.top < topbar.bottom || header.bottom > innerHeight) return -1;
            const corner = el.querySelector('.header > :last-child')!;
            const rect = corner.getBoundingClientRect();
            if (!corner.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))) return -1;
            return [...el.querySelectorAll('[data-testid="flight-row"], [data-testid^="pilot-row-"]')].findIndex(row => {
              const box = row.getBoundingClientRect();
              return box.top >= header.bottom && box.bottom < Math.min(bounds.bottom, innerHeight);
            });
          });
          expect(visibleIndex).toBeGreaterThan(0);
          await bothActionsReceivePointer(rows.nth(visibleIndex));
          const cell = rows.nth(visibleIndex).locator(':scope > :last-child');
          for (const sticky of [cell, table.locator('.header'), table.locator('.header > :last-child')]) {
            expect(await sticky.evaluate(el => {
              const ctx = document.createElement('canvas').getContext('2d')!;
              ctx.fillStyle = getComputedStyle(el).backgroundColor;
              ctx.fillRect(0, 0, 1, 1);
              return ctx.getImageData(0, 0, 1, 1).data[3];
            })).toBe(255);
          }
        }

        await page.setViewportSize({ width: 1280, height: 900 });
        await table.evaluate(el => el.scrollTo(0, 0));
        const region = page.getByRole('region', { name: registry === 'pilots' ? 'Anagrafica' : 'Elenco voli', exact: true });
        const previous = page.getByTestId(registry === 'pilots' ? 'pilots-new-button' : 'logbook-new-button');
        await previous.focus();
        await page.keyboard.press('Tab');
        await expect(region).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(previous).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(region).toBeFocused();
        expect(await table.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
        await page.keyboard.press('ArrowDown');
        await expect.poll(() => table.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
        await table.evaluate(el => el.scrollTo(0, 0));
        // Tab from the named region into the row's actual controls.
        await page.keyboard.press('Tab');
        if (registry === 'pilots') {
          await expect(rows.first().getByRole('link')).toBeFocused();
          await page.keyboard.press('Tab');
        }
        const firstAction = rows.first().getByRole('button').first();
        await expect(firstAction).toBeFocused();
        if (registry === 'logbook') await page.keyboard.press('Tab');
        await expect(rows.first().getByRole('button', { name: 'Modifica', exact: true })).toBeFocused();
        await page.keyboard.press('Enter');
        const panel = page.locator('.slideover.open .slideover-panel');
        await expect(panel).toBeVisible();
        await expect(panel.getByRole('button').first()).toBeInViewport();
        await assertOverlayAbove(panel, table);
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();

        const otherAction = rows.nth(1).getByRole('button').nth(registry === 'logbook' ? 0 : 1);
        await otherAction.click();
        if (registry === 'logbook') {
          const confirmation = page.getByTestId('flight-cancel-panel');
          await expect(confirmation).toBeVisible();
          await confirmation.getByRole('button').first().click();
          await expect(confirmation).toBeHidden();
        } else {
          await expect(page.getByTestId('topup-form')).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(panel).toBeHidden();
        }

        await page.getByTestId('export-menu-trigger').click();
        const popover = page.locator('.export-menu-panel');
        await expect(popover).toBeVisible();
        await assertOverlayAbove(popover, table);
        await page.keyboard.press('Escape');
        await expect(popover).toBeHidden();
        const lastAction = rows.last().getByRole('button').last();
        await lastAction.focus();
        await expect(lastAction).toBeFocused();
        await page.keyboard.press('Tab');
        expect(await table.evaluate(el => el.contains(document.activeElement))).toBe(false);
      }
      await page.setViewportSize({ width: 375, height: 812 });
      await expect(table).toBeHidden();
      const mobile = page.locator(registry === 'pilots' ? '[data-testid^="mobile-pilot-row-"]' : '[data-testid="flight-row-mobile"]');
      await expect(mobile.first()).toBeVisible();
      await mobile.first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
    } finally {
      await removeDesktopRegistries(stamp);
    }
  });
}

/** Sample an actual overlap, including any header or action cell behind that point. */
async function assertOverlayAbove(overlay: Locator, table: Locator) {
  const stickyRects = await table.locator('.header, :scope > :not(.header) > :last-child').evaluateAll(cells =>
    cells.map(cell => cell.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number }),
  );
  await expect.poll(() => overlay.evaluate((el, cells) => {
    const box = el.getBoundingClientRect();
    const hits = cells.flatMap(cell => {
      const left = Math.max(cell.left, box.left, 0), right = Math.min(cell.right, box.right, innerWidth);
      const top = Math.max(cell.top, box.top, 0), bottom = Math.min(cell.bottom, box.bottom, innerHeight);
      if (right - left < 2 || bottom - top < 2) return [];
      return [el.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2))];
    });
    return hits.length > 0 && hits.every(Boolean);
  }, stickyRects)).toBe(true);
}

for (const [role, paths] of [
  ['admin', ['', '/logbook', '/reports', '/instructors']],
  ['pilot', ['']],
  ['instructor', ['', '/my-compensation']],
] as const) {
  test(`KPI desktop layout and full values for ${role}`, async ({ page }) => {
    await login(page, role);
    for (const path of paths) {
      await page.goto('/it/dashboard' + path);
      const row = page.locator('.kpi-row');
      await expect(row).toBeVisible();
      for (const width of [1000, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => document.fonts.ready);
        const cards = await row.locator('.kpi').evaluateAll(kpis => kpis.map(kpi => {
          const box = kpi.getBoundingClientRect();
          const value = kpi.querySelector('.kpi-value')!;
          const text = new Range();
          text.selectNodeContents(value);
          return { top: box.top, right: box.right, textFits: [...text.getClientRects()].every(r => r.right <= box.right && r.left >= box.left && r.top >= box.top && r.bottom <= box.bottom) };
        }));
        const counts = Object.values(cards.reduce<Record<number, number>>((rows, { top }) => {
          rows[top] = (rows[top] ?? 0) + 1;
          return rows;
        }, {}));
        if (path === '/my-compensation') {
          expect(counts).toEqual(width === 1280 ? [5] : [3, 2]);
        } else {
          if (path === '/reports') expect([3, 4]).toContain(cards.length);
          else expect(cards).toHaveLength(4);
          expect(counts).toEqual(cards.length === 3 ? [3] : width === 1280 ? [4] : [2, 2]);
          expect(cards.every(card => card.textFits)).toBe(true);
          const right = await row.evaluate(el => el.getBoundingClientRect().right);
          expect(Math.abs(right - cards.at(-1)!.right)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
}
