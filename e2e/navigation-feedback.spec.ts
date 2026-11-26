import { expect, test } from '@playwright/test';

const password = process.env['SEED_ADMIN_PASSWORD'];
if (!password) throw new Error('SEED_ADMIN_PASSWORD is required');

test('18.3b: a tab shows pending before destination content', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 200_000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/it/login');
  await page.getByLabel('Email').fill('admin@airmanager.local');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/, { timeout: 20_000 });
  await expect(page.locator('.page-head h1')).toHaveText('Panoramica operativa', { timeout: 20_000 });
  await expect(page.getByTestId('dashboard-loading')).toHaveCount(0);

  await page.evaluate(() => {
    type Kind = 'marker' | 'loading' | 'content';
    type Probe = {
      down?: number; marker?: number; loading?: number; content?: number;
      before?: number[]; during?: number[]; atContent?: number[];
      events: Array<{ kind: Kind; batch: number }>;
      ambiguous: boolean;
      gap: boolean;
      gapDetails?: unknown;
      loadingAtStart: boolean;
      samples: Array<{ afterMarker: number; marker: boolean; loading: boolean; home: boolean; destination: boolean }>;
    };
    const state = window as Window & { __navProbe?: Probe };
    const visible = (element: Element | null) => Boolean(element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
    state.__navProbe = { events: [], ambiguous: false, gap: false, loadingAtStart: [...document.querySelectorAll('[data-testid="dashboard-loading"]')].some(visible), samples: [] };
    const chromePositions = () => ['mobile-topbar', 'mobile-tab-bar'].map((id) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().y);
    document.addEventListener('pointerdown', (event) => {
      if ((event.target as Element).closest('[data-testid="mobile-tab-schedule"]')) {
        state.__navProbe!.down = performance.now();
        state.__navProbe!.before = chromePositions();
      }
    }, { once: true, capture: true });
    let batchIndex = 0;
    const seen = { marker: false, loading: false, content: false };
    const observer = new MutationObserver(() => {
      const probe = state.__navProbe!;
      if (probe.down === undefined) return;
      batchIndex += 1;
      const marker = document.querySelector('[data-testid="mobile-tab-schedule"] .mobile-tab-dot[data-pending="true"]');
      const pages = [...document.querySelectorAll('main.page')].map((main) => ({
        heading: main.querySelector('.page-head h1')?.textContent?.trim(),
        visible: visible(main) && visible(main.querySelector('.page-head')),
      }));
      const nowVisible = {
        marker: visible(marker),
        loading: [...document.querySelectorAll('[data-testid="dashboard-loading"][aria-busy="true"]')].some(visible),
        home: pages.some((page) => page.heading === 'Panoramica operativa' && page.visible),
        content: pages.some((page) => page.heading === 'Pianificazione' && page.visible),
      };
      // Until the destination is visible, either the old page and marker or
      // the loading boundary must remain visible; a direct swap is valid.
      if (seen.marker && !seen.content && !nowVisible.loading && !nowVisible.content && (!nowVisible.marker || !nowVisible.home)) {
        probe.gap = true;
        probe.gapDetails ??= {
          pathname: location.pathname,
          mains: [...document.querySelectorAll('main')].map((main) => ({
            className: main.className,
            testId: main.dataset.testid,
            busy: main.getAttribute('aria-busy'),
            rects: main.getClientRects().length,
            heading: main.querySelector('h1')?.textContent?.slice(0, 80),
            visibleTextLength: (main as HTMLElement).innerText.length,
            heads: [...main.querySelectorAll('.page-head')].map((head) => ({
              rects: head.getClientRects().length,
              display: getComputedStyle(head).display,
              visibility: getComputedStyle(head).visibility,
              opacity: getComputedStyle(head).opacity,
              headingRects: head.querySelector('h1')?.getClientRects().length,
            })),
            ancestors: [main.parentElement, main.parentElement?.parentElement].map((element) => ({
              tag: element?.tagName, className: element?.className, hidden: element?.hidden,
              style: element?.getAttribute('style'), rects: element?.getClientRects().length,
            })),
          })),
          viewportHit: (() => { const element = document.elementFromPoint(180, 300); return { tag: element?.tagName, className: element?.className }; })(),
        };
      }
      const transitions = (['marker', 'loading', 'content'] as const).filter((kind) => !seen[kind] && nowVisible[kind]);
      // The DOM is at the end state of this callback's mutation batch. If two
      // signals first appear together, their relative order is unknowable.
      if (transitions.length > 1) probe.ambiguous = true;
      for (const kind of transitions) {
        seen[kind] = true;
        probe[kind] = performance.now();
        probe.events.push({ kind, batch: batchIndex });
        if (kind === 'marker') {
          for (const delay of [150, 300, 500]) setTimeout(() => {
            const pages = [...document.querySelectorAll('main.page')].filter(visible);
            const home = pages.some((main) => main.querySelector('.page-head h1')?.textContent?.trim() === 'Panoramica operativa');
            const destination = pages.some((main) => main.querySelector('.page-head h1')?.textContent?.trim() === 'Pianificazione');
            probe.samples.push({
              afterMarker: performance.now() - probe.marker!,
              marker: visible(document.querySelector('[data-testid="mobile-tab-schedule"] .mobile-tab-dot[data-pending="true"]')),
              loading: [...document.querySelectorAll('[data-testid="dashboard-loading"]')].some(visible),
              home,
              destination,
            });
          }, delay);
        }
        if (kind === 'loading') probe.during = chromePositions();
        if (kind === 'content') probe.atContent = chromePositions();
      }
    });
    observer.observe(document.body, { subtree: true, attributes: true, childList: true });
  });
  const tab = page.getByTestId('mobile-tab-schedule');
  await tab.click();
  await expect(page).toHaveURL(/\/it\/dashboard\/bookings$/, { timeout: 15_000 });
  await expect(page.locator('.page-head h1')).toHaveText('Pianificazione', { timeout: 15_000 });
  const probe = await page.evaluate(() => (window as Window & {
    __navProbe?: {
      down?: number; marker?: number; loading?: number; content?: number;
      before?: number[]; during?: number[]; atContent?: number[];
      events: Array<{ kind: string; batch: number }>;
      ambiguous: boolean;
      gap: boolean;
      gapDetails?: unknown;
      loadingAtStart: boolean;
      samples: Array<{ afterMarker: number; marker: boolean; loading: boolean; home: boolean; destination: boolean }>;
    }
  }).__navProbe);
  console.log(`18.3b CDP navigation probe: ${JSON.stringify(probe)}`);
  expect(probe?.down).toBeDefined();
  expect(probe?.loadingAtStart).toBe(false);
  expect(probe?.marker).toBeDefined();
  expect(probe!.marker! - probe!.down!).toBeLessThanOrEqual(100);
  expect(probe?.content).toBeDefined();
  expect(probe?.ambiguous).toBe(false);
  expect(probe?.gap).toBe(false);
  expect(probe?.samples.filter((sample) => sample.home && !sample.loading).every((sample) => sample.marker)).toBe(true);
  expect(probe?.atContent).toEqual(probe?.before);
  if (probe?.loading === undefined) {
    // A prefetched destination may replace the old page directly. The
    // separate gap check ensures the area never becomes empty in this path.
    expect(probe?.events.map((event) => event.kind)).toEqual(['marker', 'content']);
    expect(probe!.events[0]!.batch).toBeLessThan(probe!.events[1]!.batch);
  } else {
    expect(probe?.events.map((event) => event.kind)).toEqual(['marker', 'loading', 'content']);
    expect(probe!.events[0]!.batch).toBeLessThan(probe!.events[1]!.batch);
    expect(probe!.events[1]!.batch).toBeLessThan(probe!.events[2]!.batch);
    expect(probe?.during).toEqual(probe?.before);
  }
  await expect(page.getByTestId('dashboard-loading')).toHaveCount(0);
  await cdp.detach();
});

test('18.3b: an unknown person still answers direct HTTP 404', async ({ page }) => {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill('admin@airmanager.local');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
  const response = await page.goto('/it/dashboard/people/no-such-person-18-3b');
  expect(response?.status()).toBe(404);
});

test('18.3b: canceled and modified pointer presses do not leave a pending tab', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/it/login');
  await page.getByLabel('Email').fill('admin@airmanager.local');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page.locator('.page-head h1')).toHaveText('Panoramica operativa');
  const tab = page.getByTestId('mobile-tab-schedule');
  const marker = tab.locator('.mobile-tab-dot');
  await tab.evaluate((element) => element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true })));
  await expect(marker).toHaveAttribute('data-pending', 'true');
  await tab.evaluate((element) => element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
  await expect(marker).not.toHaveAttribute('data-pending', 'true');
  await tab.evaluate((element) => element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true, pointerId: 7 })));
  await expect(marker).toHaveAttribute('data-pending', 'true');
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 })));
  await expect(marker).not.toHaveAttribute('data-pending', 'true');
  await tab.evaluate((element) => element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true, ctrlKey: true })));
  await expect(marker).not.toHaveAttribute('data-pending', 'true');
  await tab.evaluate((element) => element.dispatchEvent(new DragEvent('dragstart', { bubbles: true })));
  await expect(marker).not.toHaveAttribute('data-pending', 'true');

  // The tab is active for a filtered URL, but its Link still clears the query.
  await page.goto('/it/dashboard/bookings?probe=1');
  await expect(page.locator('.page-head h1')).toHaveText('Pianificazione');
  const activeTab = page.getByTestId('mobile-tab-schedule');
  const activeMarker = activeTab.locator('.mobile-tab-dot');
  await activeTab.evaluate((element) => element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true })));
  await expect(activeMarker).toHaveAttribute('data-pending', 'true');
  await activeTab.evaluate((element) => element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
  await activeTab.focus();
  await activeTab.press('Enter');
  await expect(page).toHaveURL(/\/it\/dashboard\/bookings$/);
  await expect(activeMarker).not.toHaveAttribute('data-pending', 'true');
  await page.getByTestId('mobile-tab-overview').click();
  await expect(page.locator('.page-head h1')).toHaveText('Panoramica operativa');
  await expect(marker).not.toHaveAttribute('data-pending', 'true');
  await tab.click();
  await expect(page.locator('.page-head h1')).toHaveText('Pianificazione');
  await page.getByTestId('mobile-tab-overview').click();
  await expect(page.locator('.page-head h1')).toHaveText('Panoramica operativa');
  await expect(marker).not.toHaveAttribute('data-pending', 'true');
});

test('18.3b: AirOps loading tokens and reduced motion at phone and desktop widths', async ({ page }) => {
  await page.goto('/it/login');
  const colors = new Set<string>();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      const styles = await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        const fixture = document.createElement('main');
        fixture.className = 'dashboard-loading';
        fixture.innerHTML = '<div class="dashboard-loading-grid"><div class="dashboard-loading-panel"><div class="dashboard-loading-shape"></div></div><div class="dashboard-loading-panel"></div></div>';
        document.body.append(fixture);
        const shape = fixture.querySelector<HTMLElement>('.dashboard-loading-shape')!;
        const panel = fixture.querySelector<HTMLElement>('.dashboard-loading-panel')!;
        const grid = fixture.querySelector<HTMLElement>('.dashboard-loading-grid')!;
        const tokenProbe = document.createElement('div');
        tokenProbe.style.backgroundColor = 'var(--bg-sunken)';
        tokenProbe.style.color = 'var(--panel)';
        document.body.append(tokenProbe);
        const result = {
          shape: getComputedStyle(shape).backgroundColor,
          shapeToken: getComputedStyle(tokenProbe).backgroundColor,
          panel: getComputedStyle(panel).backgroundColor,
          panelToken: getComputedStyle(tokenProbe).color,
          columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          animation: getComputedStyle(shape).animationName,
        };
        fixture.remove();
        tokenProbe.remove();
        return result;
      }, theme);
      colors.add(styles.shape);
      expect(styles.shape).toBe(styles.shapeToken);
      expect(styles.panel).toBe(styles.panelToken);
      expect(styles.columns).toBe(width === 375 ? 1 : 2);
      expect(styles.animation).toContain('dashboard-loading-pulse');
    }
  }
  expect(colors.size).toBe(2);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const animations = await page.evaluate(() => {
    const shape = document.createElement('div');
    shape.className = 'dashboard-loading-shape';
    const pending = document.createElement('span');
    pending.className = 'mobile-tab-dot';
    pending.dataset.pending = 'true';
    document.body.append(shape, pending);
    const names = [shape, pending].map((node) => getComputedStyle(node).animationName);
    shape.remove();
    pending.remove();
    return names;
  });
  expect(animations).toEqual(['none', 'none']);
  const activePending = await page.evaluate(() => {
    const tab = document.createElement('div');
    tab.className = 'mobile-tab active';
    const dot = document.createElement('span');
    dot.className = 'mobile-tab-dot';
    tab.append(dot);
    document.body.append(tab);
    const idle = getComputedStyle(dot).boxShadow;
    dot.dataset.pending = 'true';
    const pending = getComputedStyle(dot).boxShadow;
    const animation = getComputedStyle(dot).animationName;
    tab.remove();
    return { idle, pending, animation };
  });
  expect(activePending.pending).not.toBe(activePending.idle);
  expect(activePending.animation).toBe('none');
});
