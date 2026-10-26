import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Story 15.10 — the a11y half of the final sweep (AC 1, 2, 3 and 2f).
 *
 * Every test here guards ONE rule introduced for a defect measured on the
 * repo as it stood at 19f0174, and the comment above it carries the pre-fix
 * number so a future edit that drops the rule turns this file red instead of
 * silently regressing the two chassis of the epic.
 *
 * It writes NO global state (no AppSetting, no decision, no booking): it opens
 * panels, presses Tab and measures. That is why it stays in the default
 * `fullyParallel` `chromium` project instead of the serialized chain.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-a11y-sweep.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
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

/** Where the focus is, and whether it is inside the given container. */
async function focusReport(page: Page, containerSelector: string): Promise<{ name: string; inside: boolean }> {
  return page.evaluate((selector) => {
    const active = document.activeElement as HTMLElement | null;
    const container = document.querySelector(selector);
    return {
      name: active
        ? active.getAttribute('data-testid') ?? active.getAttribute('aria-label') ?? ((active.textContent ?? '').trim().slice(0, 24) || active.tagName)
        : 'BODY',
      inside: !!(container && active && container.contains(active)),
    };
  }, containerSelector);
}

/** Presses Tab `times` and returns one descriptor per stop. */
async function tabStops(page: Page, containerSelector: string, times: number): Promise<Array<{ name: string; inside: boolean }>> {
  const stops: Array<{ name: string; inside: boolean }> = [];
  for (let index = 0; index < times; index += 1) {
    await page.keyboard.press('Tab');
    stops.push(await focusReport(page, containerSelector));
  }
  return stops;
}

/**
 * Where the focus is, relative to the MODAL CONTEXT: the open panel plus any
 * portal it has open (`.cal-popover`, `.combo-listbox` — portaled to
 * `document.body`, so `panel.contains()` alone calls them "outside").
 */
async function modalFocusReport(page: Page): Promise<{ name: string; where: string }> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const panel = document.querySelector('.slideover.open .slideover-panel') ?? document.querySelector('.mobile-sheet-panel');
    const portals = [...document.querySelectorAll('.cal-popover, .combo-listbox')];
    const where = !active || active === document.body
      ? 'BODY'
      : panel && panel.contains(active)
        ? 'panel'
        : portals.some((portal) => portal.contains(active))
          ? 'portal'
          : 'OUT';
    return {
      name: active
        ? active.getAttribute('data-testid') ?? active.getAttribute('aria-label') ?? ((active.textContent ?? '').trim().slice(0, 20) || active.tagName)
        : 'BODY',
      where,
    };
  });
}

async function modalTabStops(page: Page, times: number, shift = false): Promise<Array<{ name: string; where: string }>> {
  const stops: Array<{ name: string; where: string }> = [];
  for (let index = 0; index < times; index += 1) {
    await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
    stops.push(await modalFocusReport(page));
  }
  return stops;
}

test.describe('story 15.10 — the sheet chassis traps the focus and claims modality (AC 1)', () => {
  /**
   * Rule: `MobileSheet` adds `aria-modal="true"` AND a focus trap, never one
   * without the other (`ui/focus-trap.ts`, `ui/mobile-sheet.tsx`).
   *
   * Pre-fix, measured at 375px on each of the three chassis consumers:
   * - flight `BottomSheet`: `flight-correct-action-mobile → flight-cancel-
   *   action-mobile → Chiudi → mobile-tab-overview` — the FOURTH Tab landed on
   *   the tab bar behind the scrim, and `Shift+Tab` walked out backwards;
   * - "Altro" nav sheet: 8 voices, then the brand link outside it;
   * - `ExportMenu` sheet: 2 voices, then `logbook-new-button`.
   * `aria-modal` was null on all three.
   *
   * Discriminance (proved by removing `useFocusTrap` from `mobile-sheet.tsx`
   * and rebuilding): the "never leaves" assertion below reports the tab bar
   * and fails on all three consumers.
   */
  test('BottomSheet, "Altro" and ExportMenu: aria-modal is set, Tab cycles inside, Shift+Tab wraps backwards', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);

    // --- consumer 1: the row-detail BottomSheet of R3 (a flight) ---
    await page.goto('/it/dashboard/logbook');
    await page.waitForSelector('.page');
    const flightRow = page.locator('[data-testid^="flight-row-mobile"]').first();
    await expect(flightRow).toBeVisible();
    await flightRow.click();

    const sheetPanel = page.locator('.mobile-sheet-panel');
    await expect(sheetPanel).toHaveAttribute('aria-modal', 'true');
    await expect(sheetPanel).toHaveAttribute('role', 'dialog');
    // A named dialog: the epic's sheets have carried this since 15.2 — asserted
    // here so the trap work cannot regress it.
    expect(await sheetPanel.getAttribute('aria-label')).toBeTruthy();
    expect((await focusReport(page, '.mobile-sheet-panel')).inside).toBe(true);

    // Twelve stops is more than any sheet has controls: with the trap the
    // focus cycles, without it the fourth press is already outside.
    const forward = await tabStops(page, '.mobile-sheet-panel', 12);
    expect(forward.filter((stop) => !stop.inside), JSON.stringify(forward)).toEqual([]);
    const backward = await tabStops(page, '.mobile-sheet-panel', 6);
    expect(backward.filter((stop) => !stop.inside), JSON.stringify(backward)).toEqual([]);
    // The cycle is a cycle, not a dead end: more presses than controls still
    // land on a real control, never on the panel container alone.
    expect(new Set(forward.map((stop) => stop.name)).size).toBeGreaterThan(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('.mobile-sheet-panel')).toHaveCount(0);

    // --- consumer 2: the "Altro" nav sheet ---
    await page.getByTestId('mobile-tab-more').click();
    await expect(page.getByTestId('mobile-more-sheet')).toHaveCount(1);
    await expect(page.locator('.mobile-sheet-panel')).toHaveAttribute('aria-modal', 'true');
    const moreStops = await tabStops(page, '.mobile-sheet-panel', 12);
    expect(moreStops.filter((stop) => !stop.inside), JSON.stringify(moreStops)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-more-sheet')).toHaveCount(0);

    // --- consumer 3: the ExportMenu sheet (a bottom sheet at <=640 since 15.8a) ---
    await page.getByTestId('export-menu-trigger').click();
    await expect(page.getByTestId('export-menu-sheet')).toHaveCount(1);
    await expect(page.locator('.mobile-sheet-panel')).toHaveAttribute('aria-modal', 'true');
    const exportStops = await tabStops(page, '.mobile-sheet-panel', 8);
    expect(exportStops.filter((stop) => !stop.inside), JSON.stringify(exportStops)).toEqual([]);
  });

  /**
   * The focus RETURN existed before this story (15.2/15.3) and the trap must
   * not regress it — on Escape and on the sheet's own "Chiudi" alike.
   */
  test('the focus still goes back to the trigger, on Escape and on "Chiudi"', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/logbook');
    await page.waitForSelector('.page');

    const flightRow = page.locator('[data-testid^="flight-row-mobile"]').first();
    const rowTestId = await flightRow.getAttribute('data-testid');
    await flightRow.click();
    await expect(page.locator('.mobile-sheet-panel')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mobile-sheet-panel')).toHaveCount(0);
    expect((await focusReport(page, 'body')).name).toBe(rowTestId);

    await flightRow.click();
    await expect(page.locator('.mobile-sheet-panel')).toHaveCount(1);
    await page.locator('.mobile-sheet-panel').getByRole('button', { name: 'Chiudi' }).click();
    await expect(page.locator('.mobile-sheet-panel')).toHaveCount(0);
    expect((await focusReport(page, 'body')).name).toBe(rowTestId);
  });
});

test.describe('story 15.10 — the full-screen panel is a dialog with a name and keeps the focus (AC 2)', () => {
  /**
   * Rule: `SlideOver` is `role="dialog"` + `aria-modal` + a name built from
   * `subtitle`/`title`, takes the focus on open, traps it, gives it back on
   * close (`ui/slide-over.tsx`).
   *
   * Pre-fix, measured at 375px on `/dashboard/bookings`: no `role`, no
   * `aria-modal`, no accessible name at all; after opening the panel
   * `document.activeElement` was still `new-booking-button`, and the first
   * control INSIDE the panel was the 204th of 221 in DOM order — 14 Tab
   * presses from the open panel landed on the status chips and the booking
   * rows of the page BEHIND the scrim, never in the panel.
   *
   * Three consumers of three different grammars, as AC 2 requires.
   */
  const CONSUMERS: Array<{ url: string; grammar: string; open: (page: Page) => Promise<string> }> = [
    {
      grammar: 'simple form panel',
      url: '/it/dashboard/bookings',
      open: async (page) => {
        await page.getByTestId('new-booking-button').click();
        return 'new-booking-button';
      },
    },
    {
      grammar: 'shared form panel (also mounted by /dashboard/movements)',
      url: '/it/dashboard/ppr',
      open: async (page) => {
        await page.getByTestId('ppr-manual-button').click();
        return 'ppr-manual-button';
      },
    },
    {
      grammar: 'multi-form editor reached through a bottom sheet',
      url: '/it/dashboard/fleet',
      open: async (page) => {
        const card = page.locator('[data-testid^="mobile-fleet-card-"]').first();
        // The sheet hands the focus back to the CARD when it closes to make
        // room for the panel, so the card — not the sheet's own action — is
        // what the panel must restore.
        const cardTestId = (await card.getAttribute('data-testid')) ?? '';
        await card.click();
        await page.getByTestId('aircraft-edit-mobile').click();
        return cardTestId;
      },
    },
  ];

  for (const consumer of CONSUMERS) {
    test(`${consumer.grammar}: dialog role, accessible name, focus in and back out`, async ({ page }) => {
      await loginExpectingDashboard(page, ADMIN_EMAIL);
      await page.setViewportSize(PHONE);
      await page.goto(consumer.url);
      await page.waitForSelector('.page');

      const expectedReturn = await consumer.open(page);
      const panel = page.locator('.slideover.open .slideover-panel');
      await expect(panel).toHaveAttribute('role', 'dialog');
      await expect(panel).toHaveAttribute('aria-modal', 'true');

      // The name is real, and it is the browser's OWN computation (not a
      // re-read of the nodes we wired): it must contain the panel's title.
      const title = (await panel.locator('.so-title').innerText()).trim();
      expect(title.length, 'the panel renders a title').toBeGreaterThan(0);
      await expect(panel).toHaveAccessibleName(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

      // Focus moved INTO the panel (pre-fix: it stayed on the trigger).
      expect((await focusReport(page, '.slideover.open .slideover-panel')).inside).toBe(true);

      // ... and stays there. 16 presses is more than the head + the first
      // fields; pre-fix the very first one was already outside.
      const stops = await tabStops(page, '.slideover.open .slideover-panel', 16);
      expect(stops.filter((stop) => !stop.inside), JSON.stringify(stops)).toEqual([]);

      // The GLOBAL Escape still closes the whole panel (12.3 behaviour, which
      // CLAUDE.md and several specs depend on) and the focus goes back.
      await page.keyboard.press('Escape');
      await expect(page.locator('.slideover.open')).toHaveCount(0);
      expect((await focusReport(page, 'body')).name).toBe(expectedReturn);
    });
  }

  /**
   * AC 2f / ratifica R-15.10-f — the primary action of the three multi-form
   * editors now lives in `.so-foot`, OUTSIDE the scrolling body, wired to its
   * form with `form="<id>"`.
   *
   * Pre-fix at 375px, after scrolling `.so-body` to the bottom (measured):
   * - aircraft: body 1781px in 728px, submit at `top -396.41`, hit-test FALSE;
   * - pilot:    body 2693px in 716px, submit at `top -1413.53`, hit-test FALSE;
   * - instructor: body 2642px in 716px, submit at `top -1370.53`, hit-test FALSE.
   * The bar was `position: sticky` INSIDE `.so-body`, and a sticky box cannot
   * leave its containing block.
   */
  const EDITORS: Array<{ url: string; card: string; action: string; submit: string }> = [
    { url: '/it/dashboard/fleet', card: '[data-testid^="mobile-fleet-card-"]', action: 'aircraft-edit-mobile', submit: 'identity-submit' },
    { url: '/it/dashboard/pilots', card: '[data-testid^="mobile-pilot-row-"]', action: 'pilot-edit-mobile', submit: 'pilot-identity-submit' },
    { url: '/it/dashboard/instructors', card: '[data-testid^="mobile-instructor-row-"]', action: 'instructor-edit-mobile', submit: 'instructor-identity-submit' },
  ];

  for (const editor of EDITORS) {
    test(`${editor.submit} stays hit-testable after scrolling the panel body to the very bottom`, async ({ page }) => {
      await loginExpectingDashboard(page, ADMIN_EMAIL);
      await page.setViewportSize(PHONE);
      await page.goto(editor.url);
      await page.waitForSelector('.page');
      await page.locator(editor.card).first().click();
      await page.getByTestId(editor.action).click();
      await expect(page.getByTestId(editor.submit)).toBeVisible();

      const measured = await page.evaluate((submitId) => {
        const body = document.querySelector('.so-body');
        const foot = document.querySelector('.so-foot');
        const button = document.querySelector(`[data-testid="${submitId}"]`);
        if (!body || !button) return null;
        body.scrollTop = body.scrollHeight;
        const rect = button.getBoundingClientRect();
        const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          scrolled: body.scrollTop > 0,
          scrollable: body.scrollHeight > body.clientHeight,
          insideFoot: !!(foot && foot.contains(button)),
          insideBody: body.contains(button),
          top: rect.top,
          bottom: rect.bottom,
          hit: atPoint === button || button.contains(atPoint),
          viewportHeight: window.innerHeight,
        };
      }, editor.submit);

      expect(measured, 'panel body and submit must both exist').not.toBeNull();
      expect(measured!.scrollable, 'this editor is only interesting because its body scrolls').toBe(true);
      // The requirement, not the obtained value: the submit is out of the
      // scroller and reachable with the body scrolled to its end.
      expect(measured!.insideFoot).toBe(true);
      expect(measured!.insideBody).toBe(false);
      expect(measured!.top).toBeGreaterThanOrEqual(0);
      expect(measured!.bottom).toBeLessThanOrEqual(measured!.viewportHeight);
      expect(measured!.hit).toBe(true);
    });
  }
});

test.describe('review 15.10 MAJOR-2 — the modal context includes the portals the panel opens', () => {
  /**
   * Rule: `useFocusTrap` treats the ACTIVE portals (`.cal-popover`,
   * `.combo-listbox`) as part of the panel's modal context, and the panel
   * `aria-owns` them while they are open (`ui/focus-trap.ts`).
   *
   * Pre-fix, measured at 375px on `/dashboard/bookings` with the panel open
   * and the calendar popover open on top of it — the listener sat on the
   * panel, and a portaled popover is not a descendant of it, so its keydowns
   * never reached the trap:
   *   Oggi @popover · Conferma @popover · BODY · "Cambia tema" OUT ·
   *   mobile-profile-button OUT · calendar-prev OUT · schedule-date-pick OUT ·
   *   calendar-next OUT
   * i.e. SIX stops behind the scrim while the panel claimed `aria-modal`.
   */
  test('with the calendar popover open, Tab never leaves the panel+popover context, and the panel owns the portal', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/bookings');
    await page.waitForSelector('.page');

    await page.getByTestId('new-booking-button').click();
    const panel = page.locator('.slideover.open .slideover-panel');
    await expect(panel).toBeVisible();
    await panel.locator('.date-input-btn').first().click();
    const popover = page.locator('.cal-popover');
    await expect(popover).toBeVisible();
    // The popover really is portaled OUT of the panel — otherwise this test
    // would be guarding nothing (lesson 15.3 F8).
    expect(await panel.evaluate((el) => el.contains(document.querySelector('.cal-popover')))).toBe(false);

    // LOW-2: what the trap includes, `aria-modal` must not exclude.
    const owns = await panel.getAttribute('aria-owns');
    expect(owns, 'the panel owns the open portal').toBeTruthy();
    expect(await popover.getAttribute('id')).toBe(owns);

    const forward = await modalTabStops(page, 10);
    expect(forward.filter((stop) => stop.where !== 'panel' && stop.where !== 'portal'), JSON.stringify(forward)).toEqual([]);
    const backward = await modalTabStops(page, 6, true);
    expect(backward.filter((stop) => stop.where !== 'panel' && stop.where !== 'portal'), JSON.stringify(backward)).toEqual([]);

    // Coexistence with the GLOBAL Escape of `SlideOver` (CLAUDE.md): the
    // popover's own capture-phase handler stops that dispatch
    // (`fixed-popover.ts`), so the FIRST Escape closes only the popover — the
    // panel survives, the focus returns to the trigger — and a second one
    // closes the panel. Measured, both before and after this fix.
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    await expect(page.locator('.slideover.open')).toHaveCount(1);
    expect((await modalFocusReport(page)).where).toBe('panel');
    expect(await panel.getAttribute('aria-owns'), 'the ownership goes away with the portal').toBeNull();
    await page.keyboard.press('Escape');
    await expect(page.locator('.slideover.open')).toHaveCount(0);
  });

  /**
   * Review LOW-1: with the listener on the panel, a focus that fell to
   * `<body>` (its node destroyed) took the trap out of the picture entirely —
   * measured synthetically by emptying a sheet: `mobile-tab-overview`,
   * `mobile-tab-schedule`, `mobile-tab-ppr`, i.e. the tab bar behind the
   * scrim. From `document` the same press is caught and the focus goes back
   * into the modal.
   */
  test('when the focused control is destroyed, Tab puts the focus back inside the sheet', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');
    await page.waitForSelector('.page');

    await page.getByTestId('mobile-tab-more').click();
    await expect(page.getByTestId('mobile-more-sheet')).toHaveCount(1);
    await page.keyboard.press('Tab');
    expect((await modalFocusReport(page)).where).toBe('panel');

    // Destroy every focusable the sheet has, the focused one included.
    const removed = await page.evaluate(() => {
      const panel = document.querySelector('.mobile-sheet-panel');
      if (!panel) return 0;
      const controls = [...panel.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')];
      for (const control of controls) control.remove();
      return controls.length;
    });
    expect(removed).toBeGreaterThan(0);
    expect((await modalFocusReport(page)).where, 'the focus fell to the body, as it does when its node dies').toBe('BODY');

    await page.keyboard.press('Tab');
    const after = await modalFocusReport(page);
    expect(after.where, JSON.stringify(after)).toBe('panel');
  });
});

test.describe('story 15.10 — a CLOSED panel is not tabbable (AC 3)', () => {
  /**
   * Rule: `SlideOver` renders `inert` while closed (`ui/slide-over.tsx`).
   *
   * Pre-fix, measured with NO panel open: `.slideover` carried
   * `aria-hidden="true"` and `pointer-events: none` — which does nothing for
   * the keyboard — while the panel kept ELEVEN focusable controls at 375px on
   * `/dashboard/bookings` (SEVENTEEN on `/dashboard/ppr`, whose panel is the
   * 12-field manual PPR form), all reachable by tabbing through the page.
   *
   * The assertion is the browser's own inert semantics, not a repetition of
   * the selector that finds the controls: each candidate is asked to take the
   * focus, and must fail to. Discriminance (proved by dropping `inert` and
   * rebuilding): every candidate takes the focus and the count is 11 / 17.
   */
  for (const viewport of [PHONE, DESKTOP]) {
    test(`no control inside a closed .slideover-panel can take the focus at ${viewport.width}px`, async ({ page }) => {
      await loginExpectingDashboard(page, ADMIN_EMAIL);
      await page.setViewportSize(viewport);

      for (const url of ['/it/dashboard/bookings', '/it/dashboard/pilots', '/it/dashboard/ppr']) {
        await page.goto(url);
        await page.waitForSelector('.page');
        await expect(page.locator('.slideover.open')).toHaveCount(0);

        const result = await page.evaluate(() => {
          const wrapper = document.querySelector('.slideover');
          const panel = document.querySelector('.slideover-panel');
          if (!wrapper || !panel) return null;
          const candidates = Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          );
          let tookFocus = 0;
          for (const candidate of candidates) {
            candidate.focus();
            if (document.activeElement === candidate) tookFocus += 1;
          }
          return { inert: wrapper.hasAttribute('inert'), ariaHidden: wrapper.getAttribute('aria-hidden'), candidates: candidates.length, tookFocus };
        });

        expect(result, `${url}: a closed panel must be in the DOM (the epic never unmounts it)`).not.toBeNull();
        expect(result!.inert, `${url}: the closed panel wrapper must be inert`).toBe(true);
        expect(result!.ariaHidden, `${url}: aria-hidden stays, as it was`).toBe('true');
        expect(result!.tookFocus, `${url}: ${result!.candidates} candidate controls, none may take the focus`).toBe(0);
      }
    });
  }

  /**
   * The same property seen from the keyboard's side, on the page where the
   * pre-fix walk was measured: tabbing the WHOLE page never stops inside the
   * closed panel. Pre-fix that walk stopped there 18 times, ending on the
   * "Prenota" submit.
   */
  test('a full tab walk of /dashboard/bookings at 375px never stops inside the closed panel', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/bookings');
    await page.waitForSelector('.page');

    let stopsInsidePanel = 0;
    let wrapped = 0;
    for (let index = 0; index < 260 && wrapped < 2; index += 1) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const active = document.activeElement;
        const panel = document.querySelector('.slideover-panel');
        return { body: !active || active === document.body, inside: !!(panel && active && panel.contains(active)) };
      });
      if (state.body) wrapped += 1;
      if (state.inside) stopsInsidePanel += 1;
    }
    expect(stopsInsidePanel).toBe(0);
  });
});
