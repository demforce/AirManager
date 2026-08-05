import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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
 * Two deliberate restraints on what it writes:
 *  - the Club card is exercised as a NO-OP round trip (the five PUTs are fired
 *    with the values already on screen), so the five-endpoint contract is
 *    proven without moving a single stored value;
 *  - the Tesoreria card is exercised only through its per-field validation,
 *    which returns BEFORE any request — `treasury.*` feeds `getBillingSummary`
 *    for every `/dashboard/billing` spec, and there is no GET route to restore
 *    it from (D5).
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
 * ONE declared exclusion, and it is a PO decision, not an oversight: the
 * calendar trigger nested inside the Tesoreria date field stays 36x36 (the
 * 15.7 line — a nested trigger lives INSIDE a 44px box; 15.8a LOW-4 confirmed
 * it). Nothing else is excluded: the desktop table is `display: none` here and
 * its rows have no client rect, so the sweep skips them by geometry, not by an
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
    if (el.classList.contains('date-input-btn')) continue;
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

/** Controls covered at hit-test, split by WHAT covers them (tab bar = defect, sticky top bar = the declared 15.1 exception). */
const COVERED = (): { testid: string | null; cls: string; by: 'tabbar' | 'topbar' | 'other' }[] => {
  const out: { testid: string | null; cls: string; by: 'tabbar' | 'topbar' | 'other' }[] = [];
  for (const el of Array.from(document.querySelectorAll('.page a, .page button, .page input, .page select, .page textarea'))) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const cx = Math.min(Math.max(rect.x + rect.width / 2, 1), window.innerWidth - 1);
    const cy = Math.min(Math.max(rect.y + rect.height / 2, 1), window.innerHeight - 1);
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
    const by = hit.closest('.mobile-tabbar') ? 'tabbar' : hit.closest('.mobile-topbar') ? 'topbar' : 'other';
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

  test('AC 4: ogni controllo di form e ogni "Salva" e >= 44px a 320/375/390, e le sette testate non superano il pre-fix', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    await page.setViewportSize(DESKTOP);
    await gotoSettings(page);
    // The desktop is the "before": on the DB this story was measured on it had
    // 231 controls under the floor (201 of them 24.67px `.btn.mini`s), and it
    // still has them at 1280 — the desktop is out of mandate. The number is
    // NOT asserted: three of its four terms scale with the number of catalogue
    // rows, and a count calibrated on one DB is the "baseline sensitive to the
    // DATA" trap (15.8a correction 2). What is asserted is the PROPERTY: the
    // desktop is full of them, the phone has none.
    const desktopSmall = await page.evaluate(SMALL_TARGETS);
    expect(desktopSmall.length).toBeGreaterThan(25);

    for (const viewport of [NARROW, PHONE, WIDE_PHONE]) {
      await page.setViewportSize(viewport);
      await gotoSettings(page);
      expect(await page.evaluate(SMALL_TARGETS)).toEqual([]);

      // ...and with the catalogue FORMS OPEN, a state this sweep never visited
      // before (review MINOR-2): the `blocksBooking` checkbox lived there at
      // 20x20, i.e. a second target under the floor that the AC declared as
      // one. Every control of the three forms is swept here, not just that one.
      for (const addButton of ['ratings-add-button', 'medical-add-button', 'cash-category-add-button']) await page.getByTestId(addButton).click();
      await expect(page.getByTestId('rating-form')).toBeVisible();
      await expect(page.getByTestId('medical-form')).toBeVisible();
      await expect(page.getByTestId('cash-category-form')).toBeVisible();
      expect(await page.evaluate(SMALL_TARGETS), `forms open @${viewport.width}`).toEqual([]);

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
    }

    await page.setViewportSize(PHONE);
    await gotoSettings(page);
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(375);
    const post = await headHeights(page);
    expect(post).toHaveLength(7);
    // The seven heads carry a 44px action and are STILL not taller than they
    // were before this story — the arithmetic, measured, not promised (lesson
    // 15.6 R-15.6-e / 15.5 F3). PRE is rendered in this same page, so fonts,
    // width and data are identical on both sides of the comparison.
    await page.addStyleTag({ content: PRE_FIX_HEAD_CSS });
    const pre = await headHeights(page);
    for (const [index, card] of post.entries()) {
      expect(card.head, `${card.testid} post[${card.parts}] vs pre[${pre[index]!.parts}]`).toBeLessThanOrEqual(pre[index]!.head);
    }
    await page.reload();
    await expect(page.getByTestId('club-settings-card')).toBeVisible();

    // The saves are full-width, not a 56px chip against the left margin.
    for (const testId of ['club-settings-save', 'scheduling-settings-save', 'smtp-settings-save', 'treasury-settings-save', 'airfield-settings-save']) {
      const box = await page.getByTestId(testId).evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const parent = el.parentElement!.getBoundingClientRect();
        return { h: rect.height, w: rect.width, parentW: parent.width };
      });
      expect(box.h).toBeGreaterThanOrEqual(TARGET_FLOOR);
      expect(box.w).toBeGreaterThan(box.parentW - 1);
    }
  });

  test('AC 4: le quattro card di form scrivono dal telefono con gli stessi endpoint e le stesse validazioni per-campo', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await gotoSettings(page);

    // --- Club: FIVE PUTs on one "Salva", fired with the values already on
    // screen (a no-op round trip: the contract is proven, no stored value
    // moves).
    const [club, metar, fee, instructions, membership] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/club') && r.request().method() === 'PUT'),
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/metar-station') && r.request().method() === 'PUT'),
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/ppr-landing-fee') && r.request().method() === 'PUT'),
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/ppr-operating-instructions') && r.request().method() === 'PUT'),
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/membership-fee') && r.request().method() === 'PUT'),
      page.getByTestId('club-settings-save').click(),
    ]);
    for (const response of [club, metar, fee, instructions, membership]) expect(response.status()).toBe(200);
    await expect(page.getByTestId('club-settings-feedback')).toBeVisible();

    // --- Club: the 422 marks THAT field, inline, from the phone too.
    await page.getByTestId('club-contact-email-input').fill('not-an-email');
    const [clubInvalid] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/club') && r.request().method() === 'PUT'),
      page.getByTestId('club-settings-save').click(),
    ]);
    expect(clubInvalid.status()).toBe(422);
    await expect(page.getByTestId('club-contact-email-input')).toHaveAttribute('aria-invalid', 'true');
    // ...and the message is ONE node, which is what `settings.spec.ts:147`
    // reads page-level.
    await expect(page.getByText('Inserisci un indirizzo email valido.')).toHaveCount(1);

    // --- Pianificazione: `closeTime <= openTime` 422s with `fieldErrors.closeTime`.
    await gotoSettings(page);
    await page.getByTestId('scheduling-open-time-input').fill('20:00');
    await page.getByTestId('scheduling-close-time-input').fill('08:00');
    const [schedInvalid] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/scheduling') && r.request().method() === 'PUT'),
      page.getByTestId('scheduling-settings-save').click(),
    ]);
    expect(schedInvalid.status()).toBe(422);
    await expect(page.getByTestId('scheduling-close-time-input')).toHaveAttribute('aria-invalid', 'true');

    // ...and a valid window round-trips (restored in `afterAll`).
    await page.getByTestId('scheduling-open-time-input').fill('06:30');
    await page.getByTestId('scheduling-close-time-input').fill('22:30');
    const [schedOk] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/scheduling') && r.request().method() === 'PUT'),
      page.getByTestId('scheduling-settings-save').click(),
    ]);
    expect(schedOk.status()).toBe(200);
    expect(await schedOk.json()).toMatchObject({ openTime: '06:30', closeTime: '22:30' });

    // --- SMTP: the SSRF refusal marks the host field, from the phone.
    await gotoSettings(page);
    await page.getByTestId('smtp-host-input').fill('127.0.0.1');
    const [smtpInvalid] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/smtp') && r.request().method() === 'PUT'),
      page.getByTestId('smtp-settings-save').click(),
    ]);
    expect(smtpInvalid.status()).toBe(422);
    await expect(page.getByTestId('smtp-host-input')).toHaveAttribute('aria-invalid', 'true');

    // --- Tesoreria: both per-field messages, and ZERO requests — the card
    // returns before the PUT, so `treasury.*` is never touched by this spec.
    await gotoSettings(page);
    let treasuryRequests = 0;
    await page.route('**/api/v1/settings/treasury', (route) => {
      treasuryRequests += 1;
      return route.abort();
    });
    await page.getByTestId('treasury-opening-cash-input').fill('non-un-numero');
    await page.getByTestId('treasury-opening-date-input').fill('');
    await page.getByTestId('treasury-settings-save').click();
    await expect(page.getByTestId('treasury-opening-cash-input')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('treasury-opening-date-input')).toHaveAttribute('aria-invalid', 'true');
    await page.waitForTimeout(300);
    expect(treasuryRequests).toBe(0);
    await page.unroute('**/api/v1/settings/treasury');
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

    // "Elimina" is a `secondStep` INSIDE the sheet: no second overlay ever
    // stacks on it (AD-8), and the focus follows the step in both directions.
    await page.getByTestId('rating-delete-button-mobile').click();
    await expect(page.locator('.mobile-sheet')).toHaveCount(1);
    await expect(sheet.locator('.bottom-sheet-kv')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('rating-delete-confirm-mobile');
    await page.getByTestId('rating-delete-cancel-mobile').click();
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('rating-delete-button-mobile');

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

  test('AC 6: il CRUD di un tipo di scadenza dal telefono, col 409 "in uso" a toast e la conferma a due passi', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);

    const name = `Tipo mobile ${uniqueSuffix()}`;
    await gotoSettings(page);

    // --- create, from the phone form (same inline form as the desktop).
    await page.getByTestId('ratings-add-button').click();
    await page.getByTestId('rating-name-input').fill(name);
    await page.getByTestId('rating-scope-select').selectOption('ALL');
    await page.getByTestId('rating-validity-input').fill('18');
    await page.getByTestId('rating-form-submit').click();
    await expect(page.getByTestId('ratings-feedback')).toBeVisible();

    const card = page.getByTestId('rating-row-mobile').filter({ hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Tutti');
    await expect(card).toContainText('18 mesi');
    await expect(card).toContainText('Attivo');

    // --- edit from the sheet: `kind` is never re-sent, `validityMonths` <= 0
    // becomes null ("senza scadenza").
    await card.click();
    await page.getByTestId('rating-edit-button-mobile').click();
    await page.getByTestId('rating-validity-input').fill('0');
    const [patch] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/expiry-types/') && r.request().method() === 'PATCH'),
      page.getByTestId('rating-form-submit').click(),
    ]);
    expect(patch.status()).toBe(200);
    expect(JSON.parse(patch.request().postData()!)).toEqual({ name, scope: 'ALL', blocksBooking: false, validityMonths: null });
    await expect(page.getByTestId('rating-row-mobile').filter({ hasText: name })).toContainText('senza scadenza');

    // --- deactivate from the sheet: the outcome is a TOAST on the phone, and
    // the state is readable on the card.
    await page.getByTestId('rating-row-mobile').filter({ hasText: name }).click();
    await page.getByTestId('rating-toggle-button-mobile').click();
    // Toasts live 2.6s and stack, so every assertion below picks its OWN by
    // text — `getByTestId('toast')` alone is a strict-mode violation as soon as
    // two actions follow each other quickly.
    await expect(page.getByTestId('toast').filter({ hasText: 'Ratings disattivata.' })).toBeVisible();
    // Closed with its own "Chiudi", not the scrim: the scrim spans the whole
    // viewport, so a click on its CENTRE lands on the panel that covers it.
    await page.getByTestId('mobile-rating-sheet').getByRole('button', { name: 'Chiudi' }).click();
    await expect(page.getByTestId('rating-row-mobile').filter({ hasText: name })).toContainText('Disattivato');

    // --- the 409 "in use" stays DISTINCT from the generic failure, and it is
    // a toast on the phone (fulfilled, so no fixture has to be made unusable).
    await page.getByTestId('rating-row-mobile').filter({ hasText: name }).click();
    await page.route('**/api/v1/expiry-types/*', (route) => (route.request().method() === 'DELETE' ? route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":{"code":"CONFLICT"}}' }) : route.continue()));
    await page.getByTestId('rating-delete-button-mobile').click();
    await page.getByTestId('rating-delete-confirm-mobile').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Questo tipo è in uso: disattivalo invece di eliminarlo.' })).toBeVisible();
    await page.unroute('**/api/v1/expiry-types/*');

    // --- delete for real, through the two-step confirmation.
    await gotoSettings(page);
    await page.getByTestId('rating-row-mobile').filter({ hasText: name }).click();
    await page.getByTestId('rating-delete-button-mobile').click();
    const [del] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/expiry-types/') && r.request().method() === 'DELETE'),
      page.getByTestId('rating-delete-confirm-mobile').click(),
    ]);
    expect(del.status()).toBe(204); // `DELETE /expiry-types/{id}` answers 204 No Content
    await expect(page.getByTestId('toast').filter({ hasText: 'Ratings eliminata.' })).toBeVisible();
    await expect(page.getByTestId('mobile-rating-sheet')).toHaveCount(0);
    await expect(page.getByTestId('rating-row-mobile').filter({ hasText: name })).toHaveCount(0);
  });

  test('AC 6: un tipo BLOCCANTE creato dal telefono produce il 422 FLIGHT_BLOCKED_BY_EXPIRY sulla registrazione di un volo', async ({ page }) => {
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
      await page.getByLabel('Blocca prenotazioni').check();
      const [created] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith('/api/v1/expiry-types') && r.request().method() === 'POST'),
        page.getByTestId('rating-form-submit').click(),
      ]);
      expect(created.status()).toBe(201);
      blockingTypeId = ((await created.json()) as { id: string }).id;
      await expect(page.getByTestId('rating-row-mobile').filter({ hasText: name })).toContainText('Blocca prenotazioni');

      // A pilot without that document, and a flight that the 14.4 guard must refuse.
      const person = await page.request.post('/api/v1/people', { data: { firstName: 'Bloccato', lastName: `Mobile-${uniqueSuffix()}` } });
      expect(person.status()).toBe(201);
      const personId = ((await person.json()) as { id: string }).id;
      expect((await page.request.put(`/api/v1/people/${personId}/profiles/pilot`, { data: { licenseNumber: `LIC-${uniqueSuffix()}`, licenseType: 'PPL(A)' } })).status()).toBe(200);

      const aircraft = await page.request.post('/api/v1/aircraft', { data: { registration: `I-BK${uniqueSuffix().replace(/[^A-Za-z0-9]/g, '').slice(-5).toUpperCase()}`, type: 'Ultraleggero 3 assi', model: 'Blocked', hourMeterMinutes: 10 } });
      expect(aircraft.status()).toBe(201);
      aircraftId = ((await aircraft.json()) as { id: string }).id;
      expect((await page.request.post(`/api/v1/aircraft/${aircraftId}/rates`, { data: { priceCentsPerHour: 12000, validFrom: '2020-01-01' } })).status()).toBe(201);

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
      const body = (await flight.json()) as { error: { code: string; details?: { documents?: { typeName: string }[] } } };
      expect(body.error.code).toBe('FLIGHT_BLOCKED_BY_EXPIRY');
      expect((body.error.details?.documents ?? []).map((d) => d.typeName)).toContain(name);
    } finally {
      // A blocking type left behind fails every other spec's `POST /flights`
      // (TD already registered): this one is deleted, always.
      if (blockingTypeId) expect((await page.request.delete(`/api/v1/expiry-types/${blockingTypeId}`)).ok()).toBe(true);
      if (aircraftId) await page.request.post(`/api/v1/aircraft/${aircraftId}/archive`);
    }
  });

  test('AC 6: le categorie di cassa dal telefono — e su quelle di SISTEMA "Elimina" resta ASSENTE, non disabilitata', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await gotoSettings(page);

    const name = `Cat mobile ${uniqueSuffix()}`;
    await page.getByTestId('cash-category-add-button').click();
    await page.getByTestId('cash-category-name-input').fill(name);
    await page.getByTestId('cash-category-form-submit').click();
    await expect(page.getByTestId('cash-categories-feedback')).toBeVisible();

    const card = page.getByTestId('cash-category-row-mobile').filter({ hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('0 movimenti');

    // rename from the sheet
    await card.click();
    await page.getByTestId('cash-category-rename-button-mobile').click();
    const renamed = `${name}-rinominata`;
    await page.getByTestId('cash-category-name-input').fill(renamed);
    await page.getByTestId('cash-category-form-submit').click();
    await expect(page.getByTestId('cash-category-row-mobile').filter({ hasText: renamed })).toHaveCount(1);

    // deactivate + reactivate from the sheet, announced by a toast
    await page.getByTestId('cash-category-row-mobile').filter({ hasText: renamed }).click();
    await page.getByTestId('cash-category-toggle-button-mobile').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Categoria disattivata.' })).toBeVisible();
    await page.getByTestId('mobile-cash-category-sheet').getByRole('button', { name: 'Chiudi' }).click();
    await expect(page.getByTestId('cash-category-row-mobile').filter({ hasText: renamed })).toContainText('Disattivata');

    // delete through the two-step confirmation
    await page.getByTestId('cash-category-row-mobile').filter({ hasText: renamed }).click();
    await page.getByTestId('cash-category-delete-button-mobile').click();
    await page.getByTestId('cash-category-delete-confirm-mobile').click();
    await expect(page.getByTestId('cash-category-row-mobile').filter({ hasText: renamed })).toHaveCount(0);

    // A SYSTEM category has no delete action at all — absent, never disabled.
    const systemCard = page.getByTestId('cash-category-row-mobile').filter({ hasText: 'Ricariche' });
    await expect(systemCard).toHaveCount(1);
    await expect(systemCard).toContainText('Sistema');
    await systemCard.click();
    await expect(page.getByTestId('mobile-cash-category-sheet')).toHaveCount(1);
    await expect(page.getByTestId('cash-category-rename-button-mobile')).toHaveCount(1);
    await expect(page.getByTestId('cash-category-delete-button-mobile')).toHaveCount(0);
  });

  test('AC 9: la matrice dei testid e i due nomi letti PAGE-LEVEL dagli spec restano un solo nodo a 375 e a 1280', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    const singletons = [
      'club-settings-card', 'club-settings-save', 'club-icao-input', 'club-contact-email-input', 'club-metar-station-input', 'club-landing-fee-input', 'club-membership-fee-input',
      'club-instructions-it-input', 'club-instructions-en-input', 'airfield-settings-form', 'airfield-name-input', 'airfield-settings-save',
      'scheduling-settings-card', 'scheduling-settings-save', 'scheduling-open-time-input', 'scheduling-close-time-input', 'scheduling-min-slot-input', 'scheduling-turnaround-input', 'scheduling-max-advance-input',
      'smtp-settings-card', 'smtp-settings-save', 'smtp-host-input', 'smtp-port-input', 'smtp-security-select', 'smtp-from-input', 'smtp-user-input', 'smtp-pass-input', 'smtp-test-email-button',
      'treasury-settings-card', 'treasury-settings-save', 'treasury-opening-cash-input', 'treasury-opening-bank-input', 'treasury-opening-date-input',
      'ratings-settings-card', 'ratings-add-button', 'medical-settings-card', 'medical-add-button',
      'cash-categories-settings-card', 'cash-category-add-button',
      'mobile-rating-list', 'mobile-medical-list', 'mobile-cash-category-list',
    ];
    const absentAtRest = ['mobile-rating-sheet', 'mobile-medical-sheet', 'mobile-cash-category-sheet', 'rating-edit-button-mobile', 'cash-category-delete-button-mobile', 'mobile-rating-empty'];

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

      // The two names the existing specs read PAGE-LEVEL.
      await page.getByTestId('ratings-add-button').click();
      await expect(page.getByLabel('Blocca prenotazioni')).toHaveCount(1);
      await page.getByTestId('rating-form').getByRole('button', { name: 'Annulla' }).click();
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

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(250);
      const covered = await page.evaluate(COVERED);
      expect(covered.filter((c) => c.by === 'tabbar')).toEqual([]);
      expect(covered.filter((c) => c.by === 'other')).toEqual([]);
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

    // (iii) the 44px floor on the form controls: take it away and the sweep
    // finds the 13 inputs and the saves again.
    await page.addStyleTag({ content: '.settings-card .input{ min-height: 0 !important; } .settings-card .btn{ min-height: 0 !important; }' });
    expect((await page.evaluate(SMALL_TARGETS)).length).toBeGreaterThan(20);

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

    // `.date-input` is shared by five pages: the Tesoreria rule is anchored to
    // `.settings-card`, so the calendar trigger stays 36x36 everywhere and the
    // fields keep the heights 15.7/15.8a measured for them.
    for (const url of ['/it/dashboard/logbook', '/it/dashboard/movements', '/it/dashboard/billing']) {
      await page.goto(url);
      await page.waitForSelector('.page');
      const triggers = await page.locator('.date-input-btn').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      for (const height of triggers) expect(height).toBeLessThanOrEqual(36);
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
