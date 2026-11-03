import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedAircraftRate } from './db-fixtures';

/**
 * Impostazioni on a phone (story 15.8b, R-15.8b-d).
 *
 * **Why this lives in its own SERIALIZED project** (`playwright.config.ts`,
 * last in the chain, after `mobile-membership-fee`): proving that every write
 * of this page still works from a phone means WRITING global `AppSetting` rows
 * — `sched.*` and `smtp.*` at least — and those are exactly the keys the chain
 * exists to keep away from `fullyParallel` writers (`settings.spec.ts`,
 * `booking-window.spec.ts` and now `reports.spec.ts` all touch `sched.*`).
 * Last in the chain, and it RESTORES what it writes in `afterAll`, verified by
 * reading the settings back — nothing downstream inherits anything.
 *
 * Story 19.8: the page has ONE "Salva" (`settings-save`, in the sticky
 * `settings-save-bar`, above the tab bar on a phone) and ONE request,
 * `PATCH /api/v1/settings`; the catalogues are drafts written by it. Two
 * deliberate restraints on what this file writes:
 *  - the only scalar block it SAVES is `scheduling` (restored in `afterAll`);
 *    the Club email, the SMTP host and the Tesoreria are exercised through
 *    their refusals (client check or server 422), which save nothing —
 *    `treasury.*` feeds `getBillingSummary` for every `/dashboard/billing`
 *    spec, and there is no GET route to restore it from (D5);
 *  - every catalogue row it creates is run-unique and deleted again.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const STUDENT_EMAIL = 'student@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-settings.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 };
const NARROW = { width: 320, height: 568 };
const WIDE_PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 720 };

/** The floor is the REQUIREMENT (44px) minus half a pixel of rounding — never the value obtained (lesson 15.7 MINOR-1). */
const TARGET_FLOOR = 43.5;

/** Same permissive baseline `settings.spec.ts` restores: a PUT has no unset, so the only way to neutralise a leftover window is to write a maximally permissive one. */
const PERMISSIVE_SCHEDULING = { openTime: '00:00', closeTime: '23:59', minSlotMinutes: 30, turnaroundMinutes: 0, maxAdvanceDays: 3650 };

/**
 * The FOUR head declarations this story adds inside the phone query, undone.
 * Injecting them back reproduces the PRE-FIX head at 375px — the base
 * `.card-head` (`airops.css:460`, `padding: 14px 18px`, `gap: 10px`,
 * `row-gap: 8px`), a visible `.spacer` and an auto-width, 34.84px action.
 *
 * Why the comparison is made this way instead of against the numbers in the
 * record (89.17 / 89.17 / 132.02 / 73.23 / 116.08 / 116.08 / 147.95 at
 * 375/IT): a head height is a WRAP, and a wrap moves with font metrics. The
 * same page measured 113.23px for the "Visite mediche" head under a
 * throwaway `playwright-core` context and 129.17px under the suite's own
 * `devices['Desktop Chrome']` context — one extra line on a `.card-sub` whose
 * text advance differed by ~1% (title 92px vs 93px). Comparing PRE and POST
 * inside the SAME page removes that variable entirely, and turns the
 * assertion into a discriminating one at the same time.
 */
const PRE_FIX_HEAD_CSS = `
  .settings-card > .card-head{ padding: 14px 18px !important; column-gap: 10px !important; row-gap: 8px !important; }
  .settings-card > .card-head > .spacer{ display: block !important; flex: 1 !important; }
  .settings-card > .card-head > .btn{ flex: 0 0 auto !important; min-height: 0 !important; padding: 7px 12px !important; }
  .settings-card > .card-head > .card-sub{ flex: 0 1 auto !important; }
`;

async function headHeights(page: Page): Promise<{ testid: string; head: number; parts: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.page .card')].map((card) => {
      const head = card.querySelector('.card-head')!;
      return {
        testid: card.getAttribute('data-testid')!,
        head: Math.round(head.getBoundingClientRect().height * 100) / 100,
        parts: [...head.children].map((child) => `${child.className}:${Math.round(child.getBoundingClientRect().width)}x${Math.round(child.getBoundingClientRect().height)}`).join(' '),
      };
    }),
  );
}

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

/**
 * Same hydration hardening as `settings.spec.ts`: this page mounts seven
 * client cards with controlled inputs, and a `.fill()` that lands before React
 * attaches its listeners updates the DOM without ever reaching the state.
 */
async function gotoSettings(page: Page): Promise<void> {
  await page.goto('/it/dashboard/settings');
  await expect(page.getByTestId('club-settings-card')).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Every height on this page is a WRAP, and a wrap is decided by font
  // metrics: measured before `@fontsource`'s Inter Tight is applied, the
  // fallback face makes a card head 129.17px instead of 113.23px (one extra
  // line on the head action). `networkidle` does not imply fonts APPLIED.
  await page.evaluate(() => document.fonts.ready);
}

// --- in-page probes (same shapes as `mobile-billing.spec.ts`) --------------

const DISPLAY_PROBE = (selector: string): string => {
  const el = document.querySelector(selector);
  return el ? getComputedStyle(el).display : 'absent';
};

/**
 * Visible controls under the floor, on the page AND inside an open sheet.
 * ZERO exclusions since story 15.10: the one this probe used to carry (the
 * calendar trigger nested inside the Tesoreria date field, 36x36 by the 15.7
 * line) is gone because the trigger itself is gone from under the floor —
 * ratifica R-15.10-d gave `.date-input-btn` one 44px floor at <=640px, so the
 * sweep now covers it like everything else. Removing an exclusion WITH the
 * test still green is the strongest form of this guard (the 15.9 pattern).
 * Nothing else is excluded: the desktop table is `display: none` here and its
 * rows have no client rect, so the sweep skips them by geometry, not by an
 * exclusion that could hide a real defect (lesson 15.8a MINOR-1).
 *
 * A CHECKBOX is measured on the `<label>` that wraps it, because that is the
 * box a finger actually hits (the label carries the 44px floor; the box itself
 * is 24px — review MINOR-2, PO decision). It is a substitution, not a second
 * exclusion: an unwrapped checkbox, or a label that lost its floor, is still
 * reported.
 */
const SMALL_TARGETS = (): { testid: string | null; cls: string; h: number }[] => {
  const out: { testid: string | null; cls: string; h: number }[] = [];
  const nodes = document.querySelectorAll('.page a, .page button, .page input, .page select, .page textarea, .mobile-sheet button, .mobile-sheet a, .mobile-sheet input');
  for (const el of Array.from(nodes)) {
    const target = el instanceof HTMLInputElement && el.type === 'checkbox' ? (el.closest('label') ?? el) : el;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.height < 43.5) out.push({ testid: el.getAttribute('data-testid'), cls: typeof el.className === 'string' ? el.className : '', h: Math.round(rect.height * 100) / 100 });
  }
  return out;
};

/**
 * Horizontally scrollable boxes that are NOT scrollable by design. The desktop
 * tables — the defect this story removes — are `display: none` here, so they
 * are not an exception: they simply have no box.
 *
 * The TAG is returned because of the one exclusion the call sites make, and it
 * is declared rather than silent (lesson 15.8a MINOR-1): a text `<input>`
 * whose VALUE is longer than its box scrolls that value natively, which is not
 * a layout defect and not this story's doing. Measured on the DB the full
 * suite leaves behind: `airfield-name-input` (259 in 220), the 42-character
 * `club-contact-email-input` (299 in 220) and `smtp-from-input` (236 in 220)
 * do it at 320/375/390 — AND at 641px, where no rule of this story applies.
 * It is the story's own TD (e), out of mandate. Everything that is NOT a text
 * field is still swept.
 */
const HIDDEN_SCROLLERS = (): { tag: string; testid: string | null; cls: string; cw: number; sw: number }[] => {
  const out: { tag: string; testid: string | null; cls: string; cw: number; sw: number }[] = [];
  const page = document.querySelector('.page');
  if (!page) return out;
  for (const el of Array.from(page.querySelectorAll('*'))) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    if (getComputedStyle(el).overflowX === 'hidden') continue;
    out.push({ tag: el.tagName, testid: el.getAttribute('data-testid'), cls: typeof el.className === 'string' ? el.className : '', cw: el.clientWidth, sw: el.scrollWidth });
  }
  return out;
};

/** The sweep above minus its one declared exclusion — the value of a text field. */
function layoutScrollers(rows: { tag: string }[]): { tag: string }[] {
  return rows.filter((row) => row.tag !== 'INPUT' && row.tag !== 'TEXTAREA');
}

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
 * A child of a catalogue card whose rect leaves the card. The scroller sweep
 * is BLIND to this: an ellipsised child never makes its parent report
 * `scrollWidth > clientWidth` (lesson 15.5 F1/§12). Here the growable children
 * are the type/category name, the sub-line and the status badge.
 */
const CHILDREN_OUT_OF_CARD = (): { cls: string; right: number; cardRight: number }[] => {
  const out: { cls: string; right: number; cardRight: number }[] = [];
  for (const card of Array.from(document.querySelectorAll('.mobile-row-catalog'))) {
    if (card.getClientRects().length === 0) continue;
    const cardRect = card.getBoundingClientRect();
    for (const child of Array.from(card.querySelectorAll('*'))) {
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > cardRect.right + 0.5 || rect.left < cardRect.left - 0.5) {
        out.push({ cls: typeof child.className === 'string' ? child.className : '', right: Math.round(rect.right), cardRight: Math.round(cardRect.right) });
      }
    }
  }
  return out;
};

/**
 * Controls covered at hit-test, split by WHAT covers them (tab bar = defect,
 * sticky top bar = the declared 15.1 exception, the sticky save bar of story
 * 19.8 = the same kind of declared exception while the page scrolls under it).
 */
const COVERED = (): { testid: string | null; cls: string; by: 'tabbar' | 'topbar' | 'savebar' | 'other' }[] => {
  const out: { testid: string | null; cls: string; by: 'tabbar' | 'topbar' | 'savebar' | 'other' }[] = [];
  for (const el of Array.from(document.querySelectorAll('.page a, .page button, .page input, .page select, .page textarea'))) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const cx = Math.min(Math.max(rect.x + rect.width / 2, 1), window.innerWidth - 1);
    const cy = Math.min(Math.max(rect.y + rect.height / 2, 1), window.innerHeight - 1);
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
    const by = hit.closest('.mobile-tabbar') ? 'tabbar' : hit.closest('.mobile-topbar') ? 'topbar' : hit.closest('.settings-save-bar') ? 'savebar' : 'other';
    out.push({ testid: el.getAttribute('data-testid'), cls: typeof el.className === 'string' ? el.className : '', by });
  }
  return out;
};

async function createExpiryType(page: Page, data: Record<string, unknown>): Promise<{ id: string; name: string }> {
  const response = await page.request.post('/api/v1/expiry-types', { data });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string; name: string };
  return created;
}

/** Clicks the ONE Salva and returns the `PATCH /api/v1/settings` it sent, with its answer. */
async function saveAndWait(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/v1/settings') && r.request().method() === 'PATCH'),
    page.getByTestId('settings-save').click(),
  ]);
  return { response, body: response.request().postDataJSON() as Record<string, unknown> };
}

/** Counts the `PATCH /api/v1/settings` requests the page sends from now on. */
function countPatches(page: Page): { readonly count: number } {
  const counter = { count: 0 };
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith('/api/v1/settings')) counter.count += 1;
  });
  return counter;
}

test.describe.configure({ mode: 'serial' });

test.describe('Impostazioni mobile (story 15.8b)', () => {
  test.afterAll(async ({ browser }) => {
    // Restore every global key this file writes, so the project is a no-op for
    // anything that might ever follow it in the chain. Read back, not assumed.
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, ADMIN_EMAIL);
    const put = await page.request.put('/api/v1/settings/scheduling', { data: PERMISSIVE_SCHEDULING });
    expect(put.status()).toBe(200);
    const readBack = await page.request.get('/api/v1/settings/scheduling');
    expect(await readBack.json()).toMatchObject(PERMISSIVE_SCHEDULING);
    await context.close();
  });

  test('AC 4 / 19.8 AC 18: ogni controllo e il Salva unico sono >= 44px a 320/375/390, il Salva prende tutta la barra, e le nove testate non superano il pre-fix', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    await page.setViewportSize(DESKTOP);
    await gotoSettings(page);
    // The desktop is the "before": it still has its 24.67px `.btn.mini`s at
    // 1280 — the desktop is out of mandate. The number is NOT asserted (it
    // scales with the catalogue rows, the "baseline sensitive to the DATA"
    // trap, 15.8a correction 2); the PROPERTY is: the phone has none.
    const desktopSmall = await page.evaluate(SMALL_TARGETS);
    expect(desktopSmall.length).toBeGreaterThan(25);

    for (const viewport of [NARROW, PHONE, WIDE_PHONE]) {
      await page.setViewportSize(viewport);
      await gotoSettings(page);
      expect(await page.evaluate(SMALL_TARGETS)).toEqual([]);

      // ...and with the three catalogue PANELS OPEN (review MINOR-2 of 15.8b:
      // the `blocksBooking` checkbox lives there). Since 19.8 "Aggiungi" opens
      // the panel on a NEW draft row — nothing is written, the reload below
      // discards it (no unsaved-changes guard, D-6).
      for (const addButton of ['ratings-add-button', 'medical-add-button', 'cash-category-add-button']) await page.getByTestId(addButton).click();
      await expect(page.getByTestId('rating-form')).toBeVisible();
      await expect(page.getByTestId('medical-form')).toBeVisible();
      await expect(page.getByTestId('cash-category-form')).toBeVisible();
      expect(await page.evaluate(SMALL_TARGETS), `panels open @${viewport.width}`).toEqual([]);

      // The checkbox is not its own target — the 44px label around it is — but
      // it is still the thing a finger aims at: >= 24px (PO decision), inside a
      // label that carries the floor.
      const checkbox = await page
        .getByTestId('rating-form')
        .getByLabel('Blocca prenotazioni')
        .evaluate((el) => {
          const box = el.getBoundingClientRect();
          const label = el.closest('label');
          return { w: box.width, h: box.height, labelH: label ? label.getBoundingClientRect().height : 0 };
        });
      expect(checkbox.w, `checkbox width @${viewport.width}`).toBeGreaterThanOrEqual(24);
      expect(checkbox.h, `checkbox height @${viewport.width}`).toBeGreaterThanOrEqual(24);
      expect(checkbox.labelH, `checkbox label height @${viewport.width}`).toBeGreaterThanOrEqual(TARGET_FLOOR);

      // The ONE Salva: >= 44px and the bar's whole content width, not a chip.
      const save = await page.getByTestId('settings-save').evaluate((el) => {
        const bar = el.parentElement!;
        const style = getComputedStyle(bar);
        return { h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width, content: bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
      });
      expect(save.h, `settings-save height @${viewport.width}`).toBeGreaterThanOrEqual(TARGET_FLOOR);
      expect(save.w, `settings-save width @${viewport.width}`).toBeGreaterThan(save.content - 1);
    }

    await page.setViewportSize(PHONE);
    await gotoSettings(page);
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(375);
    const post = await headHeights(page);
    expect(post).toHaveLength(9);
    // The heads carry a 44px action and are STILL not taller than they were
    // before story 15.8b — the arithmetic, measured, not promised (lesson
    // 15.6 R-15.6-e / 15.5 F3). PRE is rendered in this same page, so fonts,
    // width and data are identical on both sides of the comparison.
    await page.addStyleTag({ content: PRE_FIX_HEAD_CSS });
    const pre = await headHeights(page);
    for (const [index, card] of post.entries()) {
      expect(card.head, `${card.testid} post[${card.parts}] vs pre[${pre[index]!.parts}]`).toBeLessThanOrEqual(pre[index]!.head);
    }
  });

  test('19.8 AC 18: dal telefono un PATCH per caso — email e orari fermati dal client, host rifiutato dal server sul campo, una finestra valida salvata da sola, la tesoreria fermata senza richieste', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await gotoSettings(page);
    const patches = countPatches(page);

    // --- Club: a malformed email never leaves the phone, and its message is
    // ONE node (`settings.spec.ts` reads it page-level).
    await page.getByTestId('club-contact-email-input').fill('not-an-email');
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('club-contact-email-input')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Inserisci un indirizzo email valido.')).toHaveCount(1);
    await expect(page.getByTestId('club-contact-email-input')).toBeFocused();

    // --- Pianificazione: `closeTime <= openTime` is the client mirror's (AD-9).
    await gotoSettings(page);
    await page.getByTestId('scheduling-open-time-input').fill('20:00');
    await page.getByTestId('scheduling-close-time-input').fill('08:00');
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('scheduling-close-time-input')).toHaveAttribute('aria-invalid', 'true');
    await page.waitForTimeout(300);
    expect(patches.count).toBe(0);

    // ...and a valid window round-trips ALONE (restored in `afterAll`).
    await page.getByTestId('scheduling-open-time-input').fill('06:30');
    await page.getByTestId('scheduling-close-time-input').fill('22:30');
    const schedOk = await saveAndWait(page);
    expect(schedOk.response.status()).toBe(200);
    expect(Object.keys(schedOk.body)).toEqual(['scheduling']);
    expect(((await schedOk.response.json()) as { scheduling: unknown }).scheduling).toMatchObject({ openTime: '06:30', closeTime: '22:30' });

    // --- SMTP: the SSRF refusal is the server's — a 422 at `smtp.host`, on the field.
    await gotoSettings(page);
    await page.getByTestId('smtp-host-input').fill('127.0.0.1');
    await page.getByTestId('smtp-from-input').fill('Mobile <ops@example.com>');
    const smtpInvalid = await saveAndWait(page);
    expect(smtpInvalid.response.status()).toBe(422);
    expect(Object.keys(((await smtpInvalid.response.json()) as { error: { details: { fieldErrors: object } } }).error.details.fieldErrors)).toEqual(['smtp.host']);
    await expect(page.getByTestId('smtp-host-input')).toHaveAttribute('aria-invalid', 'true');

    // --- Tesoreria: both per-field messages, and ZERO requests.
    await gotoSettings(page);
    const before = patches.count;
    await page.getByTestId('treasury-opening-cash-input').fill('non-un-numero');
    await page.getByTestId('treasury-opening-date-input').fill('');
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('treasury-opening-cash-input')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('treasury-opening-date-input')).toHaveAttribute('aria-invalid', 'true');
    await page.waitForTimeout(300);
    expect(patches.count).toBe(before);
  });

  test('AC 5: le tre tabelle diventano liste di card, e le azioni vivono SOLO nello sheet', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    await page.setViewportSize(DESKTOP);
    await gotoSettings(page);
    expect(await page.evaluate(DISPLAY_PROBE, '.expiry-types-desktop-body')).toBe('flex');
    expect(await page.evaluate(DISPLAY_PROBE, '.expiry-types-mobile')).toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.cash-categories-desktop-body')).toBe('flex');
    expect(await page.evaluate(DISPLAY_PROBE, '.cash-categories-mobile')).toBe('none');
    await expect(page.getByTestId('rating-row-mobile').first()).toBeHidden();

    await page.setViewportSize(PHONE);
    await gotoSettings(page);
    expect(await page.evaluate(DISPLAY_PROBE, '.expiry-types-desktop-body')).toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.expiry-types-mobile')).toBe('block');
    expect(await page.evaluate(DISPLAY_PROBE, '.cash-categories-desktop-body')).toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.cash-categories-mobile')).toBe('block');

    // Each card is ONE interactive element: a tap can only mean "open detail".
    const nested = await page.locator('.mobile-row-catalog').evaluateAll((cards) => cards.map((card) => card.querySelectorAll('button,a,input,select,textarea,[tabindex]').length));
    expect(nested.length).toBeGreaterThan(0);
    expect(new Set(nested)).toEqual(new Set([0]));
    const heights = await page.locator('.mobile-row-catalog').evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(TARGET_FLOOR);

    // Nothing grows out of its own card (the guard is on the RECT, the
    // scroller sweep is blind to an ellipsised child).
    expect(await page.evaluate(CHILDREN_OUT_OF_CARD)).toEqual([]);

    // The sheet: full parity with the desktop columns, one node, 44px actions.
    await page.getByTestId('rating-row-mobile').first().click();
    const sheet = page.getByTestId('mobile-rating-sheet');
    await expect(sheet).toHaveCount(1);
    const rowKeys = await sheet.locator('.bottom-sheet-k').evaluateAll((els) => els.map((el) => el.textContent));
    expect(rowKeys).toEqual(['Ambito', 'Validità', 'Stato', 'Blocca prenotazioni e voli']);
    for (const testId of ['rating-edit-button-mobile', 'rating-toggle-button-mobile', 'rating-delete-button-mobile']) {
      expect(await page.getByTestId(testId).evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(TARGET_FLOOR);
    }

    // Story 19.8 (D-7): "Elimina" is a switch of the draft, reversible until
    // the Salva — no `secondStep` any more: the sheet keeps its rows, the
    // button turns into "Ripristina" in place, and nothing is written.
    const patches = countPatches(page);
    await page.getByTestId('rating-delete-button-mobile').click();
    await expect(page.locator('.mobile-sheet')).toHaveCount(1);
    await expect(sheet.locator('.bottom-sheet-kv')).toHaveCount(4);
    await expect(page.getByTestId('rating-delete-button-mobile')).toHaveText('Ripristina');
    await expect(page.getByTestId('rating-edit-button-mobile')).toHaveCount(0);
    expect(await page.getByTestId('rating-delete-button-mobile').evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(TARGET_FLOOR);
    await page.getByTestId('rating-delete-button-mobile').click();
    await expect(page.getByTestId('rating-delete-button-mobile')).toHaveText('Elimina');
    expect(patches.count).toBe(0);
    await sheet.getByRole('button', { name: 'Chiudi' }).click();

    // A medical visit has no scope and no blocking flag in its sheet (R-19-j).
    await page.getByTestId('medical-row-mobile').first().click();
    const medicalSheet = page.getByTestId('mobile-medical-sheet');
    expect(await medicalSheet.locator('.bottom-sheet-k').evaluateAll((els) => els.map((el) => el.textContent))).toEqual(['Validità', 'Stato']);
    await medicalSheet.getByRole('button', { name: 'Chiudi' }).click();
    await expect(page.getByTestId('medical-row-mobile').first()).not.toContainText('Tutti');

    await page.getByTestId('rating-row-mobile').first().click();

    // "Modifica" closes the sheet and brings the (shared, in-page) form into
    // view instead of stacking a panel on the sheet.
    await page.getByTestId('rating-edit-button-mobile').click();
    await expect(page.locator('.mobile-sheet')).toHaveCount(0);
    await expect(page.getByTestId('rating-form')).toBeVisible();
    const inView = await page.getByTestId('rating-form').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top > -10 && rect.top < window.innerHeight;
    });
    expect(inView).toBe(true);
  });

  test('AC 5/AC 11 vii: gli empty state mobile sono UN solo nodo con una stringa distinta (guardia provata discriminante)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await gotoSettings(page);

    for (const [listId, emptyId] of [
      ['mobile-rating-list', 'mobile-rating-empty'],
      ['mobile-medical-list', 'mobile-medical-empty'],
      ['mobile-cash-category-list', 'mobile-cash-category-empty'],
    ] as const) {
      await expect(page.getByTestId(listId)).toHaveCount(1);
      // The catalogues are seeded, so the empty node is not reachable by flow:
      // it is INJECTED, the same technique review 15.6 LOW-3 established (and
      // 15.8a's vii-bis reused), which is exactly what injection is for.
      const count = await page.evaluate(
        ([list, empty]) => {
          const node = document.createElement('p');
          node.className = 'mobile-card-empty';
          node.setAttribute('data-testid', empty!);
          document.querySelector(`[data-testid="${list}"]`)!.appendChild(node);
          const found = document.querySelectorAll(`[data-testid="${empty}"]`).length;
          node.parentElement!.appendChild(node.cloneNode(true));
          return { found, doubled: document.querySelectorAll(`[data-testid="${empty}"]`).length };
        },
        [listId, emptyId],
      );
      expect(count.found).toBe(1);
      expect(count.doubled).toBe(2); // the guard WOULD see a second node
      await page.reload();
      await expect(page.getByTestId('club-settings-card')).toBeVisible();
      await expect(page.getByTestId(emptyId)).toHaveCount(0);
    }
  });

  test('19.8 AC 14: il CRUD di un tipo di scadenza dal telefono, in bozza fino al Salva, col 409 "in uso" sulla card', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);

    const name = `Tipo mobile ${uniqueSuffix()}`;
    await gotoSettings(page);
    const patches = countPatches(page);

    // --- create, from the phone panel (same in-page panel as the desktop).
    await page.getByTestId('ratings-add-button').click();
    await page.getByTestId('rating-name-input').fill(name);
    await page.getByTestId('rating-scope-select').selectOption('ALL');
    await page.getByTestId('rating-validity-input').fill('18');
    await page.getByTestId('rating-form-close').click();

    const card = page.getByTestId('rating-row-mobile').filter({ hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute('data-state', 'new');
    await expect(card).toContainText('Nuova');
    expect(patches.count).toBe(0);
    const created = await saveAndWait(page);
    expect(created.body).toEqual({ expiryTypes: { create: [{ name, kind: 'RATING', scope: 'ALL', blocksBooking: false, validityMonths: 18 }] } });
    await expect(page.getByTestId('toast').filter({ hasText: 'Impostazioni salvate.' })).toBeVisible();
    await expect(card).toHaveAttribute('data-state', 'saved');
    await expect(card).toContainText('Tutti');
    await expect(card).toContainText('18 mesi');
    await expect(card).toContainText('Attivo');

    // --- edit from the sheet: `kind` is never re-sent, validity 0 becomes null
    // ("senza scadenza"), and the update carries that one field.
    await card.click();
    await page.getByTestId('rating-edit-button-mobile').click();
    await expect(page.getByTestId('mobile-rating-sheet')).toHaveCount(0);
    await page.getByTestId('rating-validity-input').fill('0');
    await page.getByTestId('rating-form-close').click();
    const edited = await saveAndWait(page);
    expect(edited.response.status()).toBe(200);
    expect(edited.body).toEqual({ expiryTypes: { update: [{ id: expect.any(String), validityMonths: null }] } });
    await expect(card).toContainText('senza scadenza');

    // --- deactivate from the sheet: the state is readable on the card at once, written by the Salva.
    await card.click();
    await page.getByTestId('rating-toggle-button-mobile').click();
    await page.getByTestId('mobile-rating-sheet').getByRole('button', { name: 'Chiudi' }).click();
    await expect(card).toContainText('Disattivato');
    await expect(card).toHaveAttribute('data-state', 'changed');
    await saveAndWait(page);

    // --- a 409 "in use" from the Salva lands on THAT card (fulfilled, so no
    // fixture has to be made unusable) — distinct from the generic failure.
    await card.click();
    await page.getByTestId('rating-delete-button-mobile').click();
    await page.getByTestId('mobile-rating-sheet').getByRole('button', { name: 'Chiudi' }).click();
    await expect(card).toHaveAttribute('data-state', 'removed');
    await page.route('**/api/v1/settings', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const id = (route.request().postDataJSON() as { expiryTypes: { delete: string[] } }).expiryTypes.delete[0];
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'CONFLICT', message: 'in use', details: { reason: 'IN_USE', item: { list: 'expiryTypes', op: 'delete', index: 0, id } } } }),
      });
    });
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('rating-row-error-mobile')).toHaveText('Questo tipo è in uso: disattivalo invece di eliminarlo.');
    await expect(page.getByTestId('rating-row-error-mobile')).toBeFocused();
    await page.unroute('**/api/v1/settings');

    // --- delete for real: the same draft, saved again.
    const deleted = await saveAndWait(page);
    expect(deleted.response.status()).toBe(200);
    expect((deleted.body['expiryTypes'] as { delete: string[] }).delete).toHaveLength(1);
    await expect(page.getByTestId('rating-row-mobile').filter({ hasText: name })).toHaveCount(0);
    await expect(page.getByTestId('rating-row-error-mobile')).toHaveCount(0);
  });

  test('AC 6: un tipo BLOCCANTE creato dal telefono (e salvato dal Salva unico) entra nei requisiti del volo: 422 REQUIREMENTS_NOT_MET con quel documento', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await gotoSettings(page);

    const name = `Blocco mobile ${uniqueSuffix()}`;
    let blockingTypeId: string | null = null;
    let aircraftId: string | null = null;

    try {
      // Created THROUGH THE PHONE UI — the checkbox is the manoeuvre, the 422
      // is the requirement (piano di test: never assert "the box is ticked").
      await page.getByTestId('ratings-add-button').click();
      await page.getByTestId('rating-name-input').fill(name);
      await page.getByTestId('rating-scope-select').selectOption('PILOTS');
      await page.getByTestId('rating-form').getByLabel('Blocca prenotazioni').check();
      const created = await saveAndWait(page);
      expect(created.response.status()).toBe(200);
      blockingTypeId = ((await created.response.json()) as { expiryTypes: { id: string; name: string }[] }).expiryTypes.find((type) => type.name === name)?.id ?? null;
      expect(blockingTypeId).not.toBeNull();
      await expect(page.getByTestId('rating-row-mobile').filter({ hasText: name })).toContainText('Blocca prenotazioni');

      // A pilot without that document, and a flight whose requirements must name it (story 19.9).
      const person = await page.request.post('/api/v1/people', { data: { firstName: 'Bloccato', lastName: `Mobile-${uniqueSuffix()}` } });
      expect(person.status()).toBe(201);
      const personId = ((await person.json()) as { id: string }).id;
      expect((await page.request.put(`/api/v1/people/${personId}/profiles/pilot`, { data: { licenseNumber: `LIC-${uniqueSuffix()}`, licenseType: 'PPL(A)' } })).status()).toBe(200);

      const aircraft = await page.request.post('/api/v1/aircraft', { data: { registration: `I-BK${uniqueSuffix().replace(/[^A-Za-z0-9]/g, '').slice(-5).toUpperCase()}`, type: 'Ultraleggero 3 assi', model: 'Blocked' } });
      expect(aircraft.status()).toBe(201);
      aircraftId = ((await aircraft.json()) as { id: string }).id;
      await seedAircraftRate(aircraftId, { studentPriceCents: 12000, pilotPriceCents: 12000, validFrom: '2020-01-01' });

      const takeoffAt = `${new Date().toISOString().slice(0, 10)}T09:00:00.000Z`;
      const flight = await page.request.post('/api/v1/flights', {
        data: {
          aircraftId,
          personId,
          departureAirfield: 'Base Airfield',
          arrivalAirfield: 'Base Airfield',
          takeoffAt,
          landingAt: new Date(new Date(takeoffAt).getTime() + 30 * 60_000).toISOString(),
          flightType: 'TOURISM',
        },
      });
      expect(flight.status()).toBe(422);
      const body = (await flight.json()) as { error: { code: string; details?: { failures?: { type: string; typeName?: string; expiresAt?: string | null }[] } } };
      expect(body.error.code).toBe('REQUIREMENTS_NOT_MET');
      expect(body.error.details?.failures ?? []).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'EXPIRY', typeName: name, expiresAt: null })]));
    } finally {
      // A blocking type left behind fails every other spec's `POST /flights`
      // (TD already registered): this one is deleted, always.
      if (blockingTypeId) expect((await page.request.delete(`/api/v1/expiry-types/${blockingTypeId}`)).ok()).toBe(true);
      if (aircraftId) await page.request.post(`/api/v1/aircraft/${aircraftId}/archive`);
    }
  });

  test('19.8 AC 14: le categorie di cassa dal telefono, in bozza fino al Salva — e su quelle di SISTEMA "Elimina" resta ASSENTE, non disabilitata', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await gotoSettings(page);

    const name = `Cat mobile ${uniqueSuffix()}`;
    await page.getByTestId('cash-category-add-button').click();
    await page.getByTestId('cash-category-name-input').fill(name);
    await page.getByTestId('cash-category-form-close').click();
    expect((await saveAndWait(page)).body).toEqual({ cashCategories: { create: [{ name }] } });

    const card = page.getByTestId('cash-category-row-mobile').filter({ hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('0 movimenti');

    // rename from the sheet
    await card.click();
    await page.getByTestId('cash-category-rename-button-mobile').click();
    const renamed = `${name}-rinominata`;
    await page.getByTestId('cash-category-name-input').fill(renamed);
    await page.getByTestId('cash-category-form-close').click();
    await saveAndWait(page);
    await expect(page.getByTestId('cash-category-row-mobile').filter({ hasText: renamed })).toHaveCount(1);

    // deactivate from the sheet — on the card at once, written by the Salva
    await page.getByTestId('cash-category-row-mobile').filter({ hasText: renamed }).click();
    await page.getByTestId('cash-category-toggle-button-mobile').click();
    await page.getByTestId('mobile-cash-category-sheet').getByRole('button', { name: 'Chiudi' }).click();
    await expect(page.getByTestId('cash-category-row-mobile').filter({ hasText: renamed })).toContainText('Disattivata');
    expect((await saveAndWait(page)).body).toEqual({ cashCategories: { update: [{ id: expect.any(String), isActive: false }] } });

    // delete: one tap marks it, the Salva removes it
    await page.getByTestId('cash-category-row-mobile').filter({ hasText: renamed }).click();
    await page.getByTestId('cash-category-delete-button-mobile').click();
    await page.getByTestId('mobile-cash-category-sheet').getByRole('button', { name: 'Chiudi' }).click();
    await expect(page.getByTestId('cash-category-row-mobile').filter({ hasText: renamed })).toHaveAttribute('data-state', 'removed');
    await saveAndWait(page);
    await expect(page.getByTestId('cash-category-row-mobile').filter({ hasText: renamed })).toHaveCount(0);

    // A SYSTEM category has no delete action at all — absent, never disabled.
    const systemCard = page.getByTestId('cash-category-row-mobile').filter({ hasText: 'Ricariche' });
    await expect(systemCard).toHaveCount(1);
    await expect(systemCard).toContainText('Sistema');
    await systemCard.click();
    await expect(page.getByTestId('mobile-cash-category-sheet')).toHaveCount(1);
    await expect(page.getByTestId('cash-category-rename-button-mobile')).toHaveCount(1);
    await expect(page.getByTestId('cash-category-delete-button-mobile')).toHaveCount(0);
    // ...and its name is read-only in the panel.
    await page.getByTestId('cash-category-rename-button-mobile').click();
    await expect(page.getByTestId('cash-category-name-input')).toHaveAttribute('readonly', '');
  });

  test('AC 9: la matrice dei testid e i due nomi letti PAGE-LEVEL dagli spec restano un solo nodo a 375 e a 1280', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    // Story 19.8 (AD-8): the single Salva and its bar, the two new sections;
    // the five per-card saves, their feedbacks, the quota input of the Club
    // card and the two-step delete of the sheets are gone.
    const singletons = [
      'settings-form', 'settings-save-bar', 'settings-save', 'settings-dirty-summary',
      'club-settings-card', 'club-icao-input', 'club-contact-email-input', 'club-metar-station-input',
      'airfield-settings-form', 'airfield-name-input',
      'membership-settings-card', 'membership-settings-fee-input',
      'currency-settings-card', 'currency-min-flights-input', 'currency-window-days-input',
      'scheduling-settings-card', 'scheduling-open-time-input', 'scheduling-close-time-input', 'scheduling-min-slot-input', 'scheduling-turnaround-input', 'scheduling-max-advance-input',
      'smtp-settings-card', 'smtp-host-input', 'smtp-port-input', 'smtp-security-select', 'smtp-from-input', 'smtp-user-input', 'smtp-pass-input', 'smtp-test-email-button',
      'treasury-settings-card', 'treasury-opening-cash-input', 'treasury-opening-bank-input', 'treasury-opening-date-input',
      'ratings-settings-card', 'ratings-add-button', 'medical-settings-card', 'medical-add-button',
      'cash-categories-settings-card', 'cash-category-add-button',
      'mobile-rating-list', 'mobile-medical-list', 'mobile-cash-category-list',
    ];
    const absentAtRest = [
      'mobile-rating-sheet', 'mobile-medical-sheet', 'mobile-cash-category-sheet', 'rating-edit-button-mobile', 'cash-category-delete-button-mobile', 'mobile-rating-empty',
      'rating-form', 'medical-form', 'cash-category-form', 'settings-save-error', 'smtp-test-email-hint', 'rating-row-error', 'rating-row-error-mobile',
      'club-settings-save', 'club-membership-fee-input', 'airfield-settings-save', 'scheduling-settings-save', 'smtp-settings-save', 'treasury-settings-save',
      'rating-form-submit', 'medical-form-submit', 'cash-category-form-submit', 'ratings-feedback', 'medical-feedback', 'cash-categories-feedback',
      'rating-delete-confirm-mobile', 'rating-delete-cancel-mobile', 'medical-delete-confirm-mobile', 'medical-delete-cancel-mobile',
      'cash-category-delete-confirm-mobile', 'cash-category-delete-cancel-mobile', 'medical-scope-select',
    ];

    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await gotoSettings(page);
      for (const testId of singletons) await expect(page.getByTestId(testId), `${testId} @${viewport.width}`).toHaveCount(1);
      for (const testId of absentAtRest) await expect(page.getByTestId(testId), `${testId} @${viewport.width}`).toHaveCount(0);

      // The per-row families: desktop rows and mobile cards coexist in the DOM,
      // so their names must be different — and each must be N, never 2N.
      const desktopRatings = await page.getByTestId('rating-row').count();
      const mobileRatings = await page.getByTestId('rating-row-mobile').count();
      expect(mobileRatings).toBe(desktopRatings);
      expect(await page.getByTestId('cash-category-row-mobile').count()).toBe(await page.getByTestId('cash-category-row').count());

      // The two names the existing specs read PAGE-LEVEL — and a visit's panel has no checkbox.
      await page.getByTestId('ratings-add-button').click();
      await page.getByTestId('medical-add-button').click();
      await expect(page.getByLabel('Blocca prenotazioni')).toHaveCount(1);
      await expect(page.getByTestId('medical-form').getByRole('checkbox')).toHaveCount(0);
      await page.getByTestId('rating-form-close').click();
      await expect(page.getByTestId('rating-form')).toHaveCount(0);
    }
  });

  test('AC 10: geometria — nessun overflow, nessuno scroller nascosto, nessun testo tagliato, nessun controllo sotto la tab bar', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    for (const viewport of [NARROW, PHONE, WIDE_PHONE]) {
      await page.setViewportSize(viewport);
      await gotoSettings(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      expect(layoutScrollers(await page.evaluate(HIDDEN_SCROLLERS))).toEqual([]);
      expect(await page.evaluate(CLIPPED_WITHOUT_ELLIPSIS)).toEqual([]);

      // Story 19.8 (AC 18): the save bar rides ABOVE the tab bar — its whole
      // box, and the hit-test on the Salva lands on the Salva — at the top...
      const barOverTabbar = async () =>
        page.evaluate(() => {
          const bar = document.querySelector('.settings-save-bar')!.getBoundingClientRect();
          const tabbar = document.querySelector('.mobile-tabbar')!.getBoundingClientRect();
          const save = document.querySelector('[data-testid="settings-save"]')!.getBoundingClientRect();
          const hit = document.elementFromPoint(save.x + save.width / 2, save.y + save.height / 2);
          return { gap: Math.round((tabbar.top - bar.bottom) * 100) / 100, hitsSave: hit?.closest('[data-testid="settings-save"]') !== null };
        });
      const atTop = await barOverTabbar();
      expect(atTop.gap, `bar vs tab bar @${viewport.width}`).toBeGreaterThanOrEqual(0);
      expect(atTop.hitsSave).toBe(true);

      // ...and at the bottom, where nothing is left under the bar or the tab bar.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(250);
      const covered = await page.evaluate(COVERED);
      expect(covered.filter((c) => c.by === 'tabbar')).toEqual([]);
      expect(covered.filter((c) => c.by === 'savebar')).toEqual([]);
      expect(covered.filter((c) => c.by === 'other')).toEqual([]);
      const atBottom = await barOverTabbar();
      expect(atBottom.gap).toBeGreaterThanOrEqual(0);
      expect(atBottom.hitsSave).toBe(true);
    }

    // The sheet (z 40) covers the tab bar with its scrim; the toasts (z 200)
    // stay above everything.
    await page.setViewportSize(PHONE);
    await gotoSettings(page);
    await page.getByTestId('cash-category-row-mobile').first().click();
    const layering = await page.evaluate(() => {
      const bar = document.querySelector('.mobile-tabbar')!.getBoundingClientRect();
      const hit = document.elementFromPoint(bar.x + bar.width / 2, bar.y + bar.height / 2);
      return { onSheet: !!hit?.closest('.mobile-sheet'), sheetZ: getComputedStyle(document.querySelector('.mobile-sheet')!).zIndex };
    });
    expect(layering.onSheet).toBe(true);
    expect(layering.sheetZ).toBe('40');
  });

  test('AC 11: le guardie di questa pagina sono DISCRIMINANTI (pre-fix simulato sul repo intatto)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await gotoSettings(page);

    // (i) the desktop body is hidden at <=640: put it back and BOTH defects
    // this AC closes come back — the tables scroll sideways again, and their
    // row actions sit past the right edge of a 375px viewport, which is what
    // made them unreachable (measured pre-fix: `.btn.mini` at x 503-637).
    // The COUNT of small targets is deliberately not the assertion here: the
    // 44px floor is hung on `.settings-card .btn`, which also reaches the
    // (hidden) table's own mini buttons, so re-showing the table alone does
    // not restore their 24.67px height — and a count would be calibrated on
    // the number of catalogue rows anyway.
    await page.addStyleTag({ content: '.expiry-types-desktop-body, .cash-categories-desktop-body{ display: flex !important; }' });
    expect(layoutScrollers(await page.evaluate(HIDDEN_SCROLLERS)).length).toBeGreaterThan(0);
    const offscreenActions = await page.evaluate(
      () => [...document.querySelectorAll('.students .btn.mini')].filter((btn) => btn.getBoundingClientRect().right > window.innerWidth + 0.5).length,
    );
    expect(offscreenActions).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByTestId('club-settings-card')).toBeVisible();

    // (iii) the 44px floor on the form controls and on the one Salva: take it
    // away and the sweep finds the inputs, the head actions and the Salva again.
    await page.addStyleTag({ content: '.settings-card .input{ min-height: 0 !important; } .settings-card .btn{ min-height: 0 !important; } .settings-save-bar > .btn{ min-height: 0 !important; }' });
    const shrunk = await page.evaluate(SMALL_TARGETS);
    expect(shrunk.length).toBeGreaterThan(20);
    expect(shrunk.map((target) => target.testid)).toContain('settings-save');

    await page.reload();
    await expect(page.getByTestId('club-settings-card')).toBeVisible();

    // (iv) story 19.8: the bar's phone `bottom` is what keeps the Salva above
    // the tab bar — put it back on the edge and the tab bar covers it.
    await page.addStyleTag({ content: '.settings-save-bar{ bottom: 0 !important; }' });
    const hitWithoutOffset = await page.evaluate(() => {
      const save = document.querySelector('[data-testid="settings-save"]')!.getBoundingClientRect();
      return document.elementFromPoint(save.x + save.width / 2, save.y + save.height / 2)?.closest('.mobile-tabbar') !== null;
    });
    expect(hitWithoutOffset).toBe(true);

    await page.reload();
    await expect(page.getByTestId('club-settings-card')).toBeVisible();

    // (v) containment: move a card child out and the rect guard reports it,
    // where the scroller sweep would not.
    await page.addStyleTag({ content: '.mobile-row-catalog > .mobile-row-side{ position: relative; left: 120px; }' });
    expect((await page.evaluate(CHILDREN_OUT_OF_CARD)).length).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByTestId('club-settings-card')).toBeVisible();

    // (ii) the mobile tree is hidden above 640: force it visible at 1280 and
    // the testid matrix of AC 9 would see two nodes per row.
    await page.setViewportSize(DESKTOP);
    await gotoSettings(page);
    const beforeInjection = await page.getByTestId('rating-row-mobile').first().isVisible();
    expect(beforeInjection).toBe(false);
    await page.addStyleTag({ content: '.expiry-types-mobile{ display: block !important; }' });
    expect(await page.getByTestId('rating-row-mobile').first().isVisible()).toBe(true);
  });

  test('AC 11 ix: nessuna regola di questa pagina esce da qui — `.date-input`, `.students` e l\'ExportMenu delle altre superfici sono intatti', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);

    // `.date-input` is shared by five pages, and this assertion used to read
    // "<= 36": the Tesoreria rule was ANCHORED to `.settings-card`, so the
    // trigger stayed 36x36 here and 24x24 on the pages nobody had raised.
    // Story 15.10 (ratifica R-15.10-d) replaced those six anchored exceptions
    // with ONE floor at <=640px, so the requirement this line guards is the
    // opposite one: the floor reaches these three pages too. Three URLs
    // (`/dashboard/bookings` since story 19.1), same probe, the coverage is
    // not reduced — only the number it protects changed, by a PO decision.
    for (const url of ['/it/dashboard/logbook', '/it/dashboard/bookings', '/it/dashboard/billing']) {
      await page.goto(url);
      await page.waitForSelector('.page');
      // RENDERED triggers only (`getClientRects()`): these pages also carry a
      // closed panel and a hidden desktop tree, whose nodes measure 0 and would
      // report as "under the floor" without being on screen at all — the same
      // filter every sweep of this epic uses.
      const triggers = await page
        .locator('.date-input-btn')
        .evaluateAll((els) => els.filter((el) => el.getClientRects().length > 0).map((el) => Math.round(el.getBoundingClientRect().height)));
      expect(triggers.length, url).toBeGreaterThan(0);
      for (const height of triggers) expect(height, url).toBeGreaterThanOrEqual(44);
    }

    // `.students` on a console this story does not own keeps its own mobile
    // treatment (the 13 consoles are why the switch is never written on it).
    await page.goto('/it/dashboard/expiries');
    await page.waitForSelector('.page');
    expect(await page.evaluate(DISPLAY_PROBE, '.scadenze-desktop-body')).toBe('none');

    // The `ExportMenu` of 15.8a, on a consumer this story never touches.
    await page.goto('/it/dashboard/fleet');
    await page.getByTestId('export-menu-trigger').click();
    const menu = await page.evaluate(() => {
      const panel = document.querySelector('.export-menu-panel')!.getBoundingClientRect();
      return { x: Math.round(panel.x), inside: panel.left >= -0.5 && panel.right <= window.innerWidth + 0.5 };
    });
    expect(menu.x).toBe(0);
    expect(menu.inside).toBe(true);
  });

  test('AC 13: /dashboard/settings resta ADMIN-only anche a 375, e la voce non compare per gli altri tre attori', async ({ page }) => {
    for (const email of [PILOT_EMAIL, STUDENT_EMAIL, INSTRUCTOR_EMAIL]) {
      for (const viewport of [PHONE, DESKTOP]) {
        await page.context().clearCookies();
        await page.setViewportSize(viewport);
        await login(page, email);
        await page.goto('/it/dashboard/settings');
        await expect(page).toHaveURL(/\/it\/dashboard$/);
      }
      // The "Altro" tab only exists for a role that sees more than five areas
      // (`mobile-nav.tsx`): its sheet is checked when there is one.
      await page.setViewportSize(PHONE);
      await page.goto('/it/dashboard');
      await expect(page.getByTestId('mobile-tab-bar')).toBeVisible();
      await expect(page.getByTestId('mobile-tab-bar').getByText('Impostazioni', { exact: true })).toHaveCount(0);
      if ((await page.getByTestId('mobile-tab-more').count()) > 0) {
        await page.getByTestId('mobile-tab-more').click();
        await expect(page.getByTestId('mobile-more-sheet')).toBeVisible();
        await expect(page.getByTestId('mobile-more-sheet').getByText('Impostazioni', { exact: true })).toHaveCount(0);
      }
    }

    await page.context().clearCookies();
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    await gotoSettings(page);
    await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible();
  });
});
