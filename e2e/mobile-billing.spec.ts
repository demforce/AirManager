import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Story 15.8a — the phone face of the Contabilità (`/dashboard/billing`) and
 * the redesign of the shared `ExportMenu` (the epic's TD R-15.2-c).
 *
 * Viewport is set INSIDE each test (pattern 13.10): no duplicate Playwright
 * project. The file lives in the main `chromium` project — it writes no global
 * `AppSetting`, and it asserts no global aggregate with equality (review
 * Billing-2 F4: the three riquadri are read as a BEFORE/AFTER pair around a
 * client-side filter change only, never photographed and compared to a
 * constant).
 *
 * Isolation: every test creates its OWN fixtures (a run-unique cash category,
 * people with a run-unique surname) and reaches them through the page's own
 * filters — never by assuming "my row is on page 1" (the ledger paginates at
 * 20 and the real DB has many pages). The ONE exception is the secchiello,
 * which no HTTP writer can produce (every live path has required a
 * `paymentMethod` since Billing-1 AC 2): `prisma/seed.ts` therefore seeds TWO
 * unattributed rows, one per consumer, and this file guards on ITS OWN marker
 * exactly as `billing-global.spec.ts` guards on its own.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const STUDENT_EMAIL = 'student@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-billing.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 };
const NARROW = { width: 320, height: 568 };
const WIDE_PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 720 };

/** The floor is 44; the sweep asserts the REQUIREMENT, never the value obtained (lesson 15.7 MINOR-1). */
const TARGET_FLOOR = 43.5;

/** The seed's own phone-side unattributed fixture (`prisma/seed.ts`) — consumed by a real write, like its desktop twin. */
const MOBILE_UNATTRIBUTED_MARKER = 'Movimento storico pre-Billing-1 mobile (seed)';

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

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- fixtures --------------------------------------------------------------

type PersonFixture = { personId: string; firstName: string; lastName: string };

async function createPilot(page: Page, tag: string): Promise<PersonFixture> {
  const suffix = uniqueSuffix();
  const firstName = 'Mobile';
  const lastName = `${tag}-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-MB-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  return { personId: person.id, firstName, lastName };
}

/** A run-unique cash CATEGORY — the handle every CASH fixture of this file is reached by (`?categoryId=`). */
async function createCategory(page: Page, tag: string): Promise<{ id: string; name: string }> {
  const name = `Cat ${tag} ${uniqueSuffix()}`;
  const response = await page.request.post('/api/v1/cash-categories', { data: { name } });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { id: string };
  return { id: created.id, name };
}

/** An ACCOUNT row that is `actionable` (a TOP_UP) — the only kind "Rettifica" is offered on. */
async function recordTopUp(page: Page, personId: string, amountCents: number): Promise<void> {
  const response = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
    data: { amountCents, paymentMethod: 'BANK_TRANSFER', effectiveDate: todayDateOnly() },
  });
  expect(response.status()).toBe(200);
}

/** A standalone CASH row — `actionable`, i.e. the only kind "Storna" is offered on. */
async function recordCashMovement(page: Page, categoryId: string, amountCents: number, description: string): Promise<void> {
  const response = await page.request.post('/api/v1/cash-movements', {
    data: { categoryId, amountCents, paymentMethod: 'CASH', effectiveDate: todayDateOnly(), description },
  });
  expect(response.status()).toBe(201);
}

/** The ledger, narrowed to ONE run-unique handle. */
async function gotoBilling(page: Page, query: Record<string, string> = {}): Promise<void> {
  const params = new URLSearchParams(query);
  await page.goto(`/it/dashboard/billing${params.toString() ? `?${params.toString()}` : ''}`);
  await expect(page.locator('.billing-head')).toHaveCount(1);
}

// --- in-page probes --------------------------------------------------------

const DISPLAY_PROBE = (sel: string): string => {
  const el = document.querySelector(sel);
  return el ? getComputedStyle(el).display : 'absent';
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
    if (cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis') {
      out.push({ cls: typeof el.className === 'string' ? el.className : '', cw: el.clientWidth, sw: el.scrollWidth });
    }
  }
  return out;
};

/**
 * A child of a mobile card whose rect leaves the card. The scroller sweep is
 * BLIND to this: an ellipsised child never reports `scrollWidth > clientWidth`
 * on its parent (lesson 15.5 F1/§12). Here the growable children are the
 * amount (up to `-1.216,22 €`), the bookType chip and the status pill.
 */
const CHILDREN_OUT_OF_CARD = (): { cls: string; right: number; cardRight: number }[] => {
  const out: { cls: string; right: number; cardRight: number }[] = [];
  for (const card of Array.from(document.querySelectorAll('[data-testid="transaction-row-mobile"]'))) {
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
 * Horizontally scrollable boxes that are NOT scrollable by design.
 * `overflow-x: hidden` is excluded on purpose: a clipped, non-scrollable box is
 * the ellipsis case above, not a hidden scroller. Declared exceptions: the chip
 * strip and the KPI row (scrollable/laid out by design), the desktop table
 * (`display: none` here, and its own scroller is the defect this story
 * removes), and the CLOSED `SlideOver` of `TransactionEditor` — a panel
 * translated off-screen, present in the DOM at every width since 15.2.
 */
const HIDDEN_SCROLLERS = (): { cls: string; cw: number; sw: number }[] => {
  const out: { cls: string; cw: number; sw: number }[] = [];
  const page = document.querySelector('.page');
  if (!page) return out;
  for (const el of Array.from(page.querySelectorAll('*'))) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    if (getComputedStyle(el).overflowX === 'hidden') continue;
    if (el.closest('.slideover:not(.open)')) continue;
    if (el.closest('.billing-desktop-body')) continue;
    if (el.classList.contains('mobile-chip-strip') || el.classList.contains('kpi-row')) continue;
    out.push({ cls: typeof el.className === 'string' ? el.className : '', cw: el.clientWidth, sw: el.scrollWidth });
  }
  return out;
};

/**
 * Visible controls under the 44px floor. Two exclusions, both declared:
 * the CLOSED `SlideOver` (its fields are in the DOM but unreachable) and the
 * `display: none` desktop tree (measured at a width where it does not exist
 * for the user).
 *
 * A third exception exists and is NOT an exclusion in code: the two calendar
 * triggers of the "Filtri" panel and of the "Nuova transazione" form stay at
 * 36x36 by PO decision (the 15.7 line: a nested trigger lives INSIDE a 44px
 * box, `airops.css:2928` is the ratified precedent). They are out of this
 * sweep's reach because it runs with both panels closed — stated here so the
 * next reader knows it is a decision, not an oversight. The "Saldi negativi"
 * links used to be excluded here too; review 15.8a MINOR-1 closed that gap —
 * they are 44px now and the sweep covers them.
 */
const SMALL_TARGETS = (): { testid: string | null; cls: string; h: number }[] => {
  const out: { testid: string | null; cls: string; h: number }[] = [];
  const nodes = document.querySelectorAll(
    '.page a, .page button, .page input, .page select, .mobile-sheet button, .mobile-sheet a, .slideover.open button, .slideover.open input, .slideover.open select',
  );
  for (const el of Array.from(nodes)) {
    if (el.closest('.slideover:not(.open)')) continue;
    if (el.closest('.billing-desktop-body')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.height < 43.5) out.push({ testid: el.getAttribute('data-testid'), cls: typeof el.className === 'string' ? el.className : '', h: Math.round(rect.height * 100) / 100 });
  }
  return out;
};

async function headHeights(page: Page): Promise<{ head: number; strip: number; total: number }> {
  return page.evaluate(() => {
    const head = document.querySelector('.billing-head')!.getBoundingClientRect();
    const strip = document.querySelector('[data-testid="mobile-billing-booktype-chips"]')?.getBoundingClientRect();
    return {
      head: Math.round(head.height * 100) / 100,
      strip: strip ? Math.round(strip.height * 100) / 100 : 0,
      total: Math.round((head.height + (strip ? strip.height : 0)) * 100) / 100,
    };
  });
}

async function boxOf(page: Page, testId: string): Promise<{ w: number; h: number; x: number; y: number }> {
  return page.getByTestId(testId).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100, x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100 };
  });
}

test.describe('Contabilità mobile (story 15.8a)', () => {
  test('AC 1: a <=640px la tabella desktop e via e al suo posto ci sono card senza elementi interattivi annidati; a 1280 e l\'inverso', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const category = await createCategory(page, 'AC1');
    await recordCashMovement(page, category.id, 4200, `AC1 ${uniqueSuffix()} descrizione lunga per il troncamento della card`);

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { categoryId: category.id });

    // BOTH sides, never one only.
    expect(await page.evaluate(DISPLAY_PROBE, '.students')).toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.billing-mobile')).toBe('block');
    await expect(page.getByTestId('transaction-row-mobile')).toHaveCount(1);

    // ONE interactive element per card, zero nested.
    const nested = await page.getByTestId('transaction-row-mobile').first().evaluate((el) => ({
      tag: el.tagName,
      nested: el.querySelectorAll('button,a,input,select,textarea,[tabindex]').length,
      minH: getComputedStyle(el).minHeight,
    }));
    expect(nested.tag).toBe('BUTTON');
    expect(nested.nested).toBe(0);
    expect(Number.parseFloat(nested.minH)).toBeGreaterThanOrEqual(TARGET_FLOOR);

    // The accessible name carries at least description AND amount.
    const name = await page.getByTestId('transaction-row-mobile').first().getAttribute('aria-label');
    expect(name).toContain('AC1');
    expect(name).toMatch(/42,00\s€/);

    await page.setViewportSize(DESKTOP);
    await gotoBilling(page, { categoryId: category.id });
    expect(await page.evaluate(DISPLAY_PROBE, '.students')).toBe('flex');
    expect(await page.evaluate(DISPLAY_PROBE, '.billing-mobile')).toBe('none');
    await expect(page.getByTestId('transaction-row')).toHaveCount(1);
  });

  test('AC 1: l\'importo della card e la PROSPETTIVA CLUB, non il segno grezzo della riga', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const pilot = await createPilot(page, 'Club');
    // A TOP_UP is DB-positive on the pilot's account AND an entrata for the club (DEPOSIT, not negated).
    await recordTopUp(page, pilot.personId, 15000);

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { personQuery: pilot.lastName });
    const amount = page.getByTestId('transaction-row-mobile').first().locator('.mobile-row-amount');
    await expect(amount).toHaveText(/150,00\s€/);
    await expect(amount).toHaveClass(/stat-tone-ok/);

    // Cross-check against the ONE shared rule, read from the API the table reads.
    const api = await page.request.get(`/api/v1/transactions?personQuery=${encodeURIComponent(pilot.lastName)}&pageSize=20`);
    const body = (await api.json()) as { items: { source: string; bookType: string; amountCents: number }[] };
    const row = body.items[0]!;
    const club = row.source === 'CASH' ? row.amountCents : row.bookType === 'REVENUE' ? -row.amountCents : row.amountCents;
    expect(club).toBe(15000);
  });

  test('AC 1/AC 12 vii: l\'empty state mobile e UN solo nodo, con una stringa DISTINTA da quella desktop (guardia provata discriminante)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const category = await createCategory(page, 'Empty');

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { categoryId: category.id });
    await expect(page.getByTestId('mobile-billing-empty')).toHaveCount(1);
    await expect(page.getByTestId('billing-empty')).toHaveCount(1);
    const mobileText = await page.getByTestId('mobile-billing-empty').innerText();
    const desktopText = await page.getByTestId('billing-empty').innerText();
    expect(mobileText).not.toBe(desktopText);

    // The pre-fix simulated on the intact repo (method review 15.6 LOW-3): a
    // second node injected must make the count assertion fail.
    await page.evaluate(() => {
      const node = document.querySelector('[data-testid="mobile-billing-empty"]')!;
      node.parentElement!.appendChild(node.cloneNode(true));
    });
    await expect(page.getByTestId('mobile-billing-empty')).toHaveCount(2);
  });

  test('AC 2: il tocco apre lo sheet con la parita completa, DA TASTIERA, e il nome accessibile e ben formato su una riga senza pilota, senza metodo e senza descrizione', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const category = await createCategory(page, 'Sheet');
    // No description, no person, method CASH -> the sparsest ACCOUNT-less row.
    const response = await page.request.post('/api/v1/cash-movements', {
      data: { categoryId: category.id, amountCents: 3300, paymentMethod: 'CASH', effectiveDate: todayDateOnly() },
    });
    expect(response.status()).toBe(201);

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { categoryId: category.id });

    // Opened with REAL keys, never `focus()`.
    const card = page.getByTestId('transaction-row-mobile').first();
    await card.evaluate((el) => (el as HTMLElement).blur());
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
      if (focused === 'transaction-row-mobile') break;
    }
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')).toBe('transaction-row-mobile');
    await page.keyboard.press('Enter');

    const sheet = page.getByTestId('mobile-transaction-sheet');
    await expect(sheet).toHaveCount(1);
    const dialog = sheet.getByRole('dialog');
    const accessibleName = (await dialog.getAttribute('aria-label')) ?? '';
    // Guard on a PROPERTY, never on `split(' — ').length` (lesson 15.5 F1).
    expect(accessibleName).not.toMatch(/—\s*—/);
    expect(accessibleName).not.toMatch(/·\s*·/);
    expect(accessibleName).not.toMatch(/(^|·)\s*—\s*(·|$)/);
    expect(accessibleName.trim()).toBe(accessibleName);
    for (const segment of accessibleName.split(' — ')[0]!.split(' · ')) {
      expect(segment.trim()).not.toBe('');
      expect(segment.trim()).not.toBe('—');
    }

    // Parity, voice by voice, against the nine desktop columns plus the DTO extras.
    // `.bottom-sheet-k` is `text-transform: uppercase`, so the RENDERED text is
    // what `allInnerTexts` returns — the comparison is on the rendered form.
    const keys = await sheet.locator('.bottom-sheet-k').allInnerTexts();
    expect(keys).toEqual(['Data', 'Pilota', 'Tipo', 'Descrizione', 'Metodo', 'Entrate', 'Uscite', 'Stato', 'Origine', 'Riferimento', 'Identificativo'].map((k) => k.toUpperCase()));
    await expect(sheet.locator('.bottom-sheet-kv', { hasText: 'Origine' })).toContainText('Cassa');
  });

  test('AC 2: il nome accessibile resta ben formato anche sulla riga SENZA metodo (il secchiello)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const check = await page.request.get('/api/v1/transactions?unattributed=true&pageSize=100');
    const body = (await check.json()) as { items: { description: string | null }[] };
    if (!body.items.some((item) => item.description === MOBILE_UNATTRIBUTED_MARKER)) {
      test.skip(true, 'The phone-side seeded unattributed movement was already consumed by a previous run against the same DB.');
    }

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { unattributed: 'true' });
    const card = page.getByTestId('transaction-row-mobile').filter({ hasText: 'pre-Billing-1 mobile' });
    await expect(card).toHaveCount(1);
    await card.click();
    const dialog = page.getByTestId('mobile-transaction-sheet').getByRole('dialog');
    const name = (await dialog.getAttribute('aria-label')) ?? '';
    expect(name).not.toMatch(/·\s*·/);
    expect(name).not.toMatch(/—\s*—/);
    await expect(page.getByTestId('mobile-transaction-sheet').locator('.bottom-sheet-kv', { hasText: 'Metodo' })).toContainText('Non attribuito');
  });

  test('AC 3: "Rettifica" solo su ACCOUNT actionable, "Storna" solo su CASH actionable, zero azioni altrove; nessuna .mini-modal si apre a 375', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const pilot = await createPilot(page, 'Gate');
    await recordTopUp(page, pilot.personId, 9000);
    const category = await createCategory(page, 'Gate');
    await recordCashMovement(page, category.id, 5000, `Gate ${uniqueSuffix()}`);

    await page.setViewportSize(PHONE);

    // ACCOUNT row: Rettifica, no Storna.
    await gotoBilling(page, { personQuery: pilot.lastName });
    await page.getByTestId('transaction-row-mobile').first().click();
    await expect(page.getByTestId('transaction-adjust-action-mobile')).toHaveCount(1);
    await expect(page.getByTestId('transaction-reverse-action-mobile')).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelectorAll('.mini-modal').length)).toBe(0);
    await page.keyboard.press('Escape');

    // CASH row: Storna, no Rettifica.
    await gotoBilling(page, { categoryId: category.id });
    await page.getByTestId('transaction-row-mobile').first().click();
    await expect(page.getByTestId('transaction-reverse-action-mobile')).toHaveCount(1);
    await expect(page.getByTestId('transaction-adjust-action-mobile')).toHaveCount(0);

    // Every action target is above the floor.
    const reverse = await boxOf(page, 'transaction-reverse-action-mobile');
    expect(reverse.h).toBeGreaterThanOrEqual(TARGET_FLOOR);
    expect(await page.evaluate(() => document.querySelectorAll('.mini-modal').length)).toBe(0);
  });

  test('AC 3: importo non parsabile o zero ⇒ errore inline e ZERO richieste di rete; motivo obbligatorio; 409 distinto dal generico', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const pilot = await createPilot(page, 'Valid');
    await recordTopUp(page, pilot.personId, 12000);

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { personQuery: pilot.lastName });

    let adjustmentRequests = 0;
    await page.route('**/account/adjustments', async (route) => {
      adjustmentRequests += 1;
      await route.continue();
    });

    await page.getByTestId('transaction-row-mobile').first().click();
    await page.getByTestId('transaction-adjust-action-mobile').click();

    // Review 15.8a MINOR-2, ACCOUNT branch: entering the step focuses its first
    // field, leaving it returns the focus to the button that opened it. Asserted
    // HERE, on a fixture that already exists, rather than in a test of its own:
    // an ACCOUNT `actionable` row is a ricarica, and a new one would add money
    // to the `fullyParallel` project that TD (j) asks not to grow.
    await expect(page.getByTestId('transaction-adjust-amount-mobile')).toBeFocused();
    await page.getByTestId('transaction-adjust-dismiss-mobile').click();
    await expect(page.getByTestId('transaction-adjust-action-mobile')).toBeFocused();
    await page.getByTestId('transaction-adjust-action-mobile').click();

    // Unparsable.
    await page.getByTestId('transaction-adjust-amount-mobile').fill('non un numero');
    await page.getByTestId('transaction-adjust-reason-mobile').fill('motivo');
    await page.getByTestId('transaction-adjust-confirm-mobile').click();
    await expect(page.getByTestId('transaction-adjust-invalid-mobile')).toBeVisible();
    expect(adjustmentRequests).toBe(0);

    // Zero.
    await page.getByTestId('transaction-adjust-amount-mobile').fill('0');
    await page.getByTestId('transaction-adjust-confirm-mobile').click();
    await expect(page.getByTestId('transaction-adjust-invalid-mobile')).toBeVisible();
    expect(adjustmentRequests).toBe(0);

    // Missing reason.
    await page.getByTestId('transaction-adjust-amount-mobile').fill('-12,00');
    await page.getByTestId('transaction-adjust-reason-mobile').fill('   ');
    await page.getByTestId('transaction-adjust-confirm-mobile').click();
    await expect(page.getByTestId('transaction-adjust-required-mobile')).toBeVisible();
    expect(adjustmentRequests).toBe(0);

    // 409 is mapped to its OWN message, not the generic one.
    await page.unroute('**/account/adjustments');
    await page.route('**/account/adjustments', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: '{"code":"CONFLICT"}' }));
    await page.getByTestId('transaction-adjust-reason-mobile').fill('motivo valido');
    await page.getByTestId('transaction-adjust-confirm-mobile').click();
    const conflictText = await page.getByTestId('transaction-adjust-error-mobile').innerText();
    await page.unroute('**/account/adjustments');
    await page.route('**/account/adjustments', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.getByTestId('transaction-adjust-confirm-mobile').click();
    await expect(page.getByTestId('transaction-adjust-error-mobile')).not.toHaveText(conflictText);
  });

  test('AC 3: la rettifica dal telefono crea UN AccountMovement di tipo ADJUSTMENT collegato all\'originale (letto dall\'API filtrata, mai da un conteggio in pagina)', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const pilot = await createPilot(page, 'Adjust');
    await recordTopUp(page, pilot.personId, 20000);
    const reason = `Rettifica mobile ${uniqueSuffix()}`;

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { personQuery: pilot.lastName });
    await page.getByTestId('transaction-row-mobile').first().click();
    await page.getByTestId('transaction-adjust-action-mobile').click();
    await page.getByTestId('transaction-adjust-amount-mobile').fill('-25,00');
    await page.getByTestId('transaction-adjust-reason-mobile').fill(reason);
    await page.getByTestId('transaction-adjust-confirm-mobile').click();

    // The outcome is a TOAST on the phone (R-15.8a-j), and the sheet closes.
    await expect(page.getByTestId('toast')).toBeVisible();
    await expect(page.getByTestId('mobile-transaction-sheet')).toHaveCount(0);

    const api = await page.request.get(`/api/v1/transactions?personQuery=${encodeURIComponent(pilot.lastName)}&pageSize=20`);
    const body = (await api.json()) as { items: { kind: string; amountCents: number; description: string | null }[] };
    const adjustments = body.items.filter((item) => item.kind === 'ADJUSTMENT');
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]!.amountCents).toBe(-2500);
  });

  test('AC 3: lo storno dal telefono crea UN movimento di storno e marca l\'originale', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const category = await createCategory(page, 'Reverse');
    const marker = `Storno mobile ${uniqueSuffix()}`;
    await recordCashMovement(page, category.id, 7700, marker);

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { categoryId: category.id });
    await page.getByTestId('transaction-row-mobile').first().click();
    await page.getByTestId('transaction-reverse-action-mobile').click();

    // Review 15.8a MINOR-2, the branch the defect was measured on: leaving this
    // step used to leave `document.activeElement` on `<body>` (the ref lived on
    // the ACCOUNT button alone), so the dialog context was lost on two of the
    // three writes. Read literally, the way the review read it.
    await expect(page.getByTestId('transaction-reverse-reason-mobile')).toBeFocused();
    await page.getByTestId('transaction-reverse-dismiss-mobile').click();
    await expect(page.getByTestId('transaction-reverse-action-mobile')).toBeFocused();
    expect(
      await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}[${el.getAttribute('data-testid') ?? ''}]` : 'none';
      }),
    ).toBe('BUTTON[transaction-reverse-action-mobile]');
    // …and the focus never leaves the dialog, which is what the defect cost.
    expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
    await page.getByTestId('transaction-reverse-action-mobile').click();

    // The reason is mandatory here too.
    await page.getByTestId('transaction-reverse-confirm-mobile').click();
    await expect(page.getByTestId('transaction-reverse-required-mobile')).toBeVisible();
    await page.getByTestId('transaction-reverse-reason-mobile').fill(`motivo ${marker}`);
    await page.getByTestId('transaction-reverse-confirm-mobile').click();
    await expect(page.getByTestId('toast')).toBeVisible();

    const api = await page.request.get(`/api/v1/transactions?categoryId=${category.id}&pageSize=20`);
    const body = (await api.json()) as { items: { amountCents: number; reversal: boolean; reversed: boolean }[] };
    expect(body.items.filter((item) => item.reversal)).toHaveLength(1);
    expect(body.items.filter((item) => item.reversed)).toHaveLength(1);
  });

  test('AC 3: la riclassifica dal telefono e ESPLICITA (scegli, poi conferma) e fa UNA sola PATCH con lo stesso payload del desktop', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const check = await page.request.get('/api/v1/transactions?unattributed=true&pageSize=100');
    const body = (await check.json()) as { items: { description: string | null }[] };
    if (!body.items.some((item) => item.description === MOBILE_UNATTRIBUTED_MARKER)) {
      test.skip(true, 'The phone-side seeded unattributed movement was already consumed by a previous run against the same DB.');
    }

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { unattributed: 'true' });

    const patches: { url: string; body: string | null }[] = [];
    await page.route('**/api/v1/cash-movements/*', async (route) => {
      if (route.request().method() === 'PATCH') patches.push({ url: route.request().url(), body: route.request().postData() });
      await route.continue();
    });

    const card = page.getByTestId('transaction-row-mobile').filter({ hasText: 'pre-Billing-1 mobile' });
    await card.click();
    await page.getByTestId('transaction-reclassify-action-mobile').click();

    // Review 15.8a MINOR-2, third branch: entering the step focuses its first
    // control and leaving it returns the focus to the button that opened it —
    // this row is the only one that can offer "Assegna metodo", so the branch
    // is asserted here, where its fixture already lives.
    await expect(page.getByTestId('transaction-reclassify-method-mobile-CASH')).toBeFocused();
    await page.getByTestId('transaction-reclassify-dismiss-mobile').click();
    await expect(page.getByTestId('transaction-reclassify-action-mobile')).toBeFocused();
    await page.getByTestId('transaction-reclassify-action-mobile').click();

    // Choosing alone must NOT write: that is the whole point of R-15.8a-g.
    await page.getByTestId('transaction-reclassify-method-mobile-CASH').click();
    await page.waitForTimeout(400);
    expect(patches).toHaveLength(0);

    const methodTarget = await boxOf(page, 'transaction-reclassify-method-mobile-CASH');
    expect(methodTarget.h).toBeGreaterThanOrEqual(TARGET_FLOOR);

    await page.getByTestId('transaction-reclassify-confirm-mobile').click();
    await expect(page.getByTestId('toast')).toBeVisible();
    expect(patches).toHaveLength(1);
    expect(JSON.parse(patches[0]!.body ?? '{}')).toEqual({ paymentMethod: 'CASH' });

    const after = await page.request.get('/api/v1/transactions?unattributed=true&pageSize=100');
    const afterBody = (await after.json()) as { items: { description: string | null }[] };
    expect(afterBody.items.some((item) => item.description === MOBILE_UNATTRIBUTED_MARKER)).toBe(false);
  });

  test('AC 4: i tre riquadri diventano una KPI strip tappabile; il registro sale, e i numeri restano quelli di getBillingSummary', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    await page.setViewportSize(DESKTOP);
    await gotoBilling(page);
    // One node each at 1280 for the thirteen desktop values.
    for (const id of ['billing-panel-revenue', 'billing-panel-cost', 'billing-panel-net', 'billing-panel-cash', 'billing-panel-bank', 'billing-panel-deposits-note', 'billing-panel-available', 'billing-panel-deposits-total', 'billing-panel-deposits-exposure', 'billing-panel-deposits-inred']) {
      await expect(page.getByTestId(id)).toHaveCount(1);
    }
    expect(await page.evaluate(() => document.querySelectorAll('.kpi-row').length)).toBe(1);
    expect(await page.evaluate(DISPLAY_PROBE, '.billing-kpi-row')).toBe('none');

    await page.setViewportSize(PHONE);
    await gotoBilling(page);
    expect(await page.evaluate(DISPLAY_PROBE, '.billing-panels')).toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.billing-kpi-row')).toBe('grid');
    expect(await page.evaluate(() => document.querySelectorAll('.kpi-row').length)).toBe(1);

    // The same numbers, from the same object — read from the SAME render, never
    // from two loads: `getBillingSummary` is a GLOBAL aggregate and a
    // concurrent worker's write between two page loads moves it (review
    // Billing-2 F4; measured here: 8.215,17 -> 8.138,17 across two loads). The
    // desktop riquadri are `display: none` at 375, so their values are read
    // with `textContent`, which a hidden node still carries.
    const sameRender = await page.evaluate(() => {
      const text = (id: string) => (document.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').trim();
      const kpi = (id: string) => (document.querySelector(`[data-testid="${id}"] .kpi-value`)?.textContent ?? '').trim();
      return {
        net: [text('billing-panel-net'), kpi('mobile-billing-kpi-result')],
        available: [text('billing-panel-available'), kpi('mobile-billing-kpi-treasury')],
        deposits: [text('billing-panel-deposits-total'), kpi('mobile-billing-kpi-deposits')],
      };
    });
    expect(sameRender.net[0]).toBe(sameRender.net[1]);
    expect(sameRender.available[0]).toBe(sameRender.available[1]);
    expect(sameRender.deposits[0]).toBe(sameRender.deposits[1]);

    // The guard is the GAIN, not "the KPI opens": the strip must be far shorter
    // than the three cards it replaces (measured pre-fix 579.92 at 375px).
    const stripHeight = await page.evaluate(() => Math.round(document.querySelector('.billing-kpi-row')!.getBoundingClientRect().height * 100) / 100);
    expect(stripHeight).toBeLessThan(300);

    // Every KPI is a real target and opens its own sheet, one node at a time.
    for (const id of ['mobile-billing-kpi-result', 'mobile-billing-kpi-treasury', 'mobile-billing-kpi-deposits']) {
      const box = await boxOf(page, id);
      expect(box.h, `${id} target`).toBeGreaterThanOrEqual(TARGET_FLOOR);
      await page.getByTestId(id).click();
      await expect(page.getByTestId('mobile-billing-panel-sheet')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('mobile-billing-panel-sheet')).toHaveCount(0);
    }
  });

  test('AC 4: il link del secchiello resta gated sul CONTEGGIO e raggiungibile dallo sheet, con un target >= 44px', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const summary = await page.request.get('/api/v1/transactions?unattributed=true&pageSize=100');
    const items = ((await summary.json()) as { items: unknown[] }).items;

    await page.setViewportSize(PHONE);
    await gotoBilling(page);
    await page.getByTestId('mobile-billing-kpi-treasury').click();
    const link = page.getByTestId('billing-panel-unattributed-link-mobile');
    if (items.length === 0) {
      await expect(link).toHaveCount(0);
      return;
    }
    await expect(link).toHaveCount(1);
    const box = await boxOf(page, 'billing-panel-unattributed-link-mobile');
    expect(box.h).toBeGreaterThanOrEqual(TARGET_FLOOR);
    await link.click();
    await expect(page).toHaveURL(/unattributed=true/);
    await expect(page.getByTestId('mobile-billing-unattributed-chip')).toHaveCount(1);
  });

  test('AC 5: la testata mobile e piu bassa del pre-fix in ogni stato di filtro e in entrambi i locale, e ogni suo controllo e >= 44px', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    // Pre-fix baselines measured on this very page (story ricognizione, reproduced 2026-08-05).
    const preFix: Record<number, { plain: number; oneFilter: number }> = {
      320: { plain: 350.89, oneFilter: 350.89 },
      375: { plain: 265.66, oneFilter: 308.5 },
      390: { plain: 265.66, oneFilter: 308.5 },
    };

    for (const locale of ['it', 'en']) {
      for (const size of [NARROW, PHONE, WIDE_PHONE]) {
        await page.setViewportSize(size);
        await page.goto(`/${locale}/dashboard/billing`);
        await expect(page.locator('.billing-head')).toHaveCount(1);
        const plain = await headHeights(page);
        expect(plain.total, `head+strip ${locale}@${size.width}`).toBeLessThanOrEqual(preFix[size.width]!.plain);

        await page.goto(`/${locale}/dashboard/billing?bookType=REVENUE`);
        await expect(page.locator('.billing-head')).toHaveCount(1);
        const filtered = await headHeights(page);
        expect(filtered.total, `head+strip filtered ${locale}@${size.width}`).toBeLessThanOrEqual(preFix[size.width]!.oneFilter);
      }
    }

    await page.setViewportSize(PHONE);
    await gotoBilling(page);
    expect(await page.evaluate(SMALL_TARGETS)).toEqual([]);
  });

  test('AC 5: nessun filtro sparisce — le chip navigano da sole, il pannello applica in UNA navigazione e il contratto URL non cambia', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const category = await createCategory(page, 'Head');
    await recordCashMovement(page, category.id, 6100, `Head ${uniqueSuffix()}`);

    await page.setViewportSize(PHONE);
    await gotoBilling(page);

    // The desktop controls that moved are hidden, not deleted: one node each.
    expect(await page.evaluate(DISPLAY_PROBE, '[data-testid="billing-filter-booktype"]')).toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '[data-testid="billing-filter-category"]')).toBe('none');
    await expect(page.getByTestId('billing-filter-category')).toHaveCount(1);

    // A chip is a Link: one navigation, `aria-current` on the active one.
    await page.getByTestId('mobile-billing-booktype-chip-REVENUE').click();
    await expect(page).toHaveURL(/bookType=REVENUE/);
    await expect(page.getByTestId('mobile-billing-booktype-chip-REVENUE')).toHaveAttribute('aria-current', 'true');

    // The panel counts what it hides, and applies ONCE.
    await gotoBilling(page);
    await expect(page.getByTestId('mobile-billing-filters-button')).toHaveText('Filtri');
    await page.getByTestId('mobile-billing-filters-button').click();
    await page.getByTestId('billing-filter-category-mobile').selectOption(category.id);
    await page.getByTestId('billing-filter-date-from-mobile').fill('2020-01-01');

    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });
    await page.getByTestId('mobile-billing-filters-apply').click();
    await expect(page).toHaveURL(/categoryId=/);
    await expect(page).toHaveURL(/dateFrom=2020-01-01/);
    await page.waitForTimeout(600);
    expect(navigations, 'the panel applies in ONE navigation').toBeLessThanOrEqual(1);
    await expect(page.getByTestId('mobile-billing-filters-button')).toHaveText('Filtri (2)');

    // The URL contract is exactly the desktop's.
    const url = new URL(page.url());
    expect([...url.searchParams.keys()].sort()).toEqual(['categoryId', 'dateFrom']);
  });

  test('AC 5/AD-3: il pannello Filtri sopravvive a un debounce pendente della ricerca pilota', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await gotoBilling(page);

    // Type, then open the panel BEFORE the 400ms debounce fires: without the
    // `cancel()` the navigation would remount the console and close the panel.
    await page.getByTestId('billing-filter-person').fill('Zzz');
    await page.getByTestId('mobile-billing-filters-button').click();
    await expect(page.getByTestId('mobile-billing-filter-panel')).toBeVisible();
    await page.waitForTimeout(900);
    await expect(page.getByTestId('mobile-billing-filter-panel')).toBeVisible();

    // Dismissing re-arms it: the typing lands on its own, as it would have without the panel.
    await page.getByTestId('mobile-billing-filters-apply').click();
    await expect(page).toHaveURL(/personQuery=Zzz/);
  });

  test('AC 6: le due card secondarie si impilano a <=640px e nessuna ha uno scroller orizzontale; il desktop resta 1fr 1fr', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    await page.setViewportSize(DESKTOP);
    await gotoBilling(page);
    const desktopSplit = await page.evaluate(() => {
      const split = document.querySelector('.billing-split')!;
      return { cols: getComputedStyle(split).gridTemplateColumns, widths: [...split.children].map((c) => Math.round(c.getBoundingClientRect().width)) };
    });
    expect(desktopSplit.widths).toEqual([488, 488]);

    for (const size of [NARROW, PHONE]) {
      await page.setViewportSize(size);
      await gotoBilling(page);
      const mobileSplit = await page.evaluate(() => {
        const split = document.querySelector('.billing-split')!;
        return [...split.children].map((c) => ({ w: Math.round(c.getBoundingClientRect().width), cw: c.clientWidth, sw: c.scrollWidth }));
      });
      expect(mobileSplit).toHaveLength(2);
      expect(mobileSplit[0]!.w, `stacked @${size.width}`).toBe(mobileSplit[1]!.w);
      for (const card of mobileSplit) expect(card.sw, `no inner scroller @${size.width}`).toBeLessThanOrEqual(card.cw + 1);
    }
  });

  test('AC 7: la paginazione mobile naviga preservando i filtri e i suoi bottoni sono >= 44px', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const category = await createCategory(page, 'Pag');
    for (let i = 0; i < 21; i += 1) {
      await recordCashMovement(page, category.id, 100 + i, `Pag ${i} ${uniqueSuffix()}`);
    }

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { categoryId: category.id });
    await expect(page.getByTestId('billing-pagination-status')).toHaveText('1 / 2');
    const prev = await boxOf(page, 'billing-page-prev');
    const next = await boxOf(page, 'billing-page-next');
    expect(prev.h).toBeGreaterThanOrEqual(TARGET_FLOOR);
    expect(next.h).toBeGreaterThanOrEqual(TARGET_FLOOR);

    await page.getByTestId('billing-page-next').click();
    await expect(page.getByTestId('billing-pagination-status')).toHaveText('2 / 2');
    await expect(page).toHaveURL(new RegExp(`categoryId=${category.id}`));
    await expect(page.getByTestId('transaction-row-mobile')).toHaveCount(1);
  });

  test('AC 8: l\'ExportMenu e un bottom sheet a <=640px e il popover di sempre a 1280 — su Contabilita, Flotta (una sola voce) e Registro voli', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    for (const path of ['/it/dashboard/billing', '/it/dashboard/fleet', '/it/dashboard/logbook']) {
      await page.setViewportSize(PHONE);
      await page.goto(path);
      await expect(page.getByTestId('export-menu-trigger')).toHaveCount(1);
      await page.getByTestId('export-menu-trigger').click();
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector('.export-menu-panel')!.getBoundingClientRect();
        const links = [...document.querySelectorAll('.export-menu-panel a')].map((a) => {
          const r = a.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { h: Math.round(r.height * 100) / 100, own: !!hit && (hit === a || a.contains(hit)) };
        });
        return { x: Math.round(panel.x * 100) / 100, right: Math.round(panel.right * 100) / 100, inner: window.innerWidth, links };
      });
      // Containment: the pre-fix measured x = -29.09 on the Contabilità.
      expect(geometry.x, `${path} inside left`).toBeGreaterThanOrEqual(-0.5);
      expect(geometry.right, `${path} inside right`).toBeLessThanOrEqual(geometry.inner + 0.5);
      for (const link of geometry.links) {
        expect(link.h, `${path} entry height`).toBeGreaterThanOrEqual(TARGET_FLOOR);
        expect(link.own, `${path} entry hit-testable`).toBe(true);
      }
      // One node per voice, at 375 AND at 1280.
      await expect(page.getByTestId('export-menu-xls')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Esporta' })).toHaveCount(1);

      await page.setViewportSize(DESKTOP);
      await page.goto(path);
      await page.getByTestId('export-menu-trigger').click();
      const desktop = await page.evaluate(() => {
        const panel = document.querySelector('.export-menu-panel')!;
        const cs = getComputedStyle(panel);
        const r = panel.getBoundingClientRect();
        return { w: Math.round(r.width), position: cs.position, z: cs.zIndex, padding: cs.padding };
      });
      expect(desktop, `${path} desktop popover`).toEqual({ w: 180, position: 'absolute', z: '20', padding: '14px' });
      await expect(page.getByTestId('export-menu-xls')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Esporta' })).toHaveCount(1);
    }
  });

  test('AC 8: gli href non cambiano e il download parte davvero da dentro lo sheet con lo scrim', async ({ page, context }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await gotoBilling(page);
    await page.getByTestId('export-menu-trigger').click();
    await expect(page.getByTestId('export-menu-xls')).toHaveAttribute('href', /\/api\/v1\/transactions\?.*format=xlsx/);
    await expect(page.getByTestId('export-menu-pdf')).toHaveAttribute('href', /\/api\/v1\/cash-report\/pdf\?/);

    // A `target="_blank"` entry inside a scrimmed sheet: the click must really
    // reach it and the export request must really leave. The popup's own
    // `url()` is `about:blank` until it commits, so the assertion is on the
    // REQUEST the new tab issues.
    const requested: string[] = [];
    context.on('request', (request) => {
      if (request.url().includes('/api/v1/transactions')) requested.push(request.url());
    });
    const popupPromise = context.waitForEvent('page');
    await page.getByTestId('export-menu-xls').click();
    const popup = await popupPromise;
    await expect.poll(() => requested.some((url) => url.includes('format=xlsx')), { timeout: 15_000 }).toBe(true);
    await popup.close();
  });

  test('AC 8: il redesign vale anche per un attore NON admin, su una superficie non-admin', async ({ page }) => {
    await login(page, PILOT_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/logbook');
    await expect(page.getByTestId('export-menu-trigger')).toHaveCount(1);
    await page.getByTestId('export-menu-trigger').click();
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector('.export-menu-panel')!.getBoundingClientRect();
      const links = [...document.querySelectorAll('.export-menu-panel a')].map((a) => Math.round(a.getBoundingClientRect().height * 100) / 100);
      return { x: Math.round(panel.x * 100) / 100, right: Math.round(panel.right * 100) / 100, inner: window.innerWidth, links };
    });
    expect(geometry.x).toBeGreaterThanOrEqual(-0.5);
    expect(geometry.right).toBeLessThanOrEqual(geometry.inner + 0.5);
    for (const h of geometry.links) expect(h).toBeGreaterThanOrEqual(TARGET_FLOOR);
  });

  test('AC 10: la matrice dei testid — un nodo per singleton a 375 e a 1280, N per riga', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const category = await createCategory(page, 'Ids');
    await recordCashMovement(page, category.id, 8800, `Ids ${uniqueSuffix()}`);

    const singletons = [
      'billing-panel-result', 'billing-panel-treasury', 'billing-panel-deposits',
      'billing-panel-revenue', 'billing-panel-cost', 'billing-panel-net',
      'billing-panel-cash', 'billing-panel-bank', 'billing-panel-deposits-note', 'billing-panel-available',
      'billing-panel-deposits-total', 'billing-panel-deposits-exposure', 'billing-panel-deposits-inred',
      'billing-new-transaction-button', 'billing-filter-date-from', 'billing-filter-date-to',
      'billing-filter-booktype', 'billing-filter-category', 'billing-filter-person',
      'export-menu-trigger', 'mobile-billing-filters-button', 'mobile-billing-kpis',
      'mobile-billing-list', 'mobile-billing-booktype-chips',
      'mobile-billing-kpi-result', 'mobile-billing-kpi-treasury', 'mobile-billing-kpi-deposits',
      'mobile-billing-booktype-chip-all', 'mobile-billing-booktype-chip-REVENUE',
      'mobile-billing-booktype-chip-COST', 'mobile-billing-booktype-chip-DEPOSIT', 'mobile-billing-booktype-chip-TRANSFER',
    ];
    const absentWhenClosed = ['mobile-transaction-sheet', 'mobile-billing-panel-sheet', 'export-menu-sheet', 'mobile-billing-filter-panel', 'billing-filter-category-mobile', 'transaction-adjust-panel', 'transaction-reverse-panel'];

    for (const size of [PHONE, DESKTOP]) {
      await page.setViewportSize(size);
      await gotoBilling(page, { categoryId: category.id });
      for (const id of singletons) await expect(page.getByTestId(id), `${id} @${size.width}`).toHaveCount(1);
      for (const id of absentWhenClosed) await expect(page.getByTestId(id), `${id} @${size.width}`).toHaveCount(0);
      await expect(page.getByTestId('transaction-row'), `rows @${size.width}`).toHaveCount(1);
      await expect(page.getByTestId('transaction-row-mobile'), `mobile rows @${size.width}`).toHaveCount(1);
    }
  });

  test('AC 11: nessun overflow di pagina, nessuno scroller nascosto, nessun testo tagliato senza ellissi e nessun controllo coperto dalla tab bar', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const category = await createCategory(page, 'Geom');
    await recordCashMovement(page, category.id, 121622, `Geom ${uniqueSuffix()} descrizione molto lunga per far crescere la card oltre la sua colonna`);

    for (const size of [NARROW, PHONE, WIDE_PHONE]) {
      await page.setViewportSize(size);
      await gotoBilling(page, { categoryId: category.id });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `page overflow @${size.width}`).toBe(0);
      expect(await page.evaluate(HIDDEN_SCROLLERS), `hidden scrollers @${size.width}`).toEqual([]);
      expect(await page.evaluate(CLIPPED_WITHOUT_ELLIPSIS), `clipped without ellipsis @${size.width}`).toEqual([]);
      expect(await page.evaluate(CHILDREN_OUT_OF_CARD), `children out of card @${size.width}`).toEqual([]);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(250);
      const covered = await page.evaluate(() => {
        const out: { testid: string | null; by: string }[] = [];
        for (const el of Array.from(document.querySelectorAll('.page a, .page button, .page input, .page select'))) {
          if (el.closest('.slideover:not(.open)')) continue;
          if (el.closest('.billing-desktop-body')) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          if (x < 0 || x > window.innerWidth) continue;
          if (rect.top < 0 || rect.bottom > window.innerHeight) continue;
          // "Clipped inside its OWN scroller" is not "covered by the tab bar":
          // the "Saldi negativi" card keeps a `max-height` scroller by design,
          // and the ambiguous pre-fix measure had to be discriminated (AC 11).
          const scroller = el.closest('.billing-negative-list');
          if (scroller) {
            const sb = scroller.getBoundingClientRect();
            if (rect.bottom <= sb.top + 0.5 || rect.top >= sb.bottom - 0.5) continue;
          }
          const hit = document.elementFromPoint(x, y);
          if (hit && hit.closest('.mobile-topbar')) continue;
          if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
            out.push({ testid: el.getAttribute('data-testid'), by: `${hit.tagName}.${typeof hit.className === 'string' ? hit.className : ''}` });
          }
        }
        return out;
      });
      expect(covered, `covered controls @${size.width}`).toEqual([]);
    }
  });

  test('AC 11: lo sheet e il suo scrim coprono la tab bar; il pannello a tutto schermo la copre del tutto', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const category = await createCategory(page, 'Layer');
    await recordCashMovement(page, category.id, 4400, `Layer ${uniqueSuffix()}`);

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { categoryId: category.id });

    await page.getByTestId('transaction-row-mobile').first().click();
    const overBar = await page.evaluate(() => {
      const bar = document.querySelector('.mobile-tabbar')!.getBoundingClientRect();
      const hit = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2);
      // Anything INSIDE the sheet counts: at 375px the point falls on the
      // sheet's own action row, not on the scrim.
      return hit ? (hit.closest('.mobile-sheet') ? 'sheet' : `${hit.tagName}.${typeof hit.className === 'string' ? hit.className : ''}`) : 'none';
    });
    expect(overBar).toBe('sheet');
    await page.keyboard.press('Escape');

    await page.getByTestId('billing-new-transaction-button').click();
    await expect(page.getByTestId('transaction-form')).toBeVisible();
    const overBarPanel = await page.evaluate(() => {
      const bar = document.querySelector('.mobile-tabbar')!.getBoundingClientRect();
      const hit = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2);
      return hit ? `${hit.tagName}` : 'none';
    });
    expect(overBarPanel).not.toBe('none');
  });

  test('AC 12: le guardie sono DISCRIMINANTI — il pre-fix simulato sul repo intatto le fa fallire', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const category = await createCategory(page, 'Disc');
    await recordCashMovement(page, category.id, 5500, `Disc ${uniqueSuffix()}`);

    await page.setViewportSize(PHONE);
    await gotoBilling(page, { categoryId: category.id });

    // (i)/(ii) the two trees: undo the switch and BOTH sides break.
    expect(await page.evaluate(DISPLAY_PROBE, '.students')).toBe('none');
    await page.addStyleTag({ content: '.billing-desktop-body{ display: flex !important; } .billing-mobile{ display: none !important; }' });
    expect(await page.evaluate(DISPLAY_PROBE, '.students')).not.toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.billing-mobile')).toBe('none');
    await page.reload();

    // (iii) the head: undo the phone rules and the height goes back over the pre-fix budget.
    const after = await headHeights(page);
    expect(after.total).toBeLessThanOrEqual(265.66);
    await page.addStyleTag({
      content: `.billing-head{ padding: 14px 18px !important; column-gap: 10px !important; }
        .billing-head > .card-title, .billing-head > .card-sub, .billing-head > .spacer, .billing-head > .billing-filter-inpanel, .billing-head > .billing-filter-booktype-desktop{ display: revert !important; }
        .billing-head > .billing-search{ flex: none !important; width: 190px !important; }
        .billing-head > .billing-filters-trigger{ display: none !important; }`,
    });
    const preFixHead = await page.evaluate(() => Math.round(document.querySelector('.billing-head')!.getBoundingClientRect().height * 100) / 100);
    expect(preFixHead).toBeGreaterThan(after.total);
    await page.reload();

    // (iv) the containment guard: a child pushed out of the card must be caught.
    expect(await page.evaluate(CHILDREN_OUT_OF_CARD)).toEqual([]);
    await page.addStyleTag({ content: '.mobile-row-transaction > .mobile-row-side{ position: relative; left: 80px; }' });
    expect(await page.evaluate(CHILDREN_OUT_OF_CARD)).not.toEqual([]);
    await page.reload();

    // (v) the no-ellipsis guard: remove the ellipsis and the clipped text is caught.
    expect(await page.evaluate(CLIPPED_WITHOUT_ELLIPSIS)).toEqual([]);
    await page.addStyleTag({ content: '.mobile-row-name, .mobile-row-sub{ text-overflow: clip !important; }' });
    expect(await page.evaluate(CLIPPED_WITHOUT_ELLIPSIS)).not.toEqual([]);
    await page.reload();

    // (vi) the 44px sweep: shrink one target and the sweep sees it.
    expect(await page.evaluate(SMALL_TARGETS)).toEqual([]);
    await page.addStyleTag({ content: '.billing-head > .billing-filters-trigger{ min-height: 20px !important; height: 20px !important; }' });
    expect(await page.evaluate(SMALL_TARGETS)).not.toEqual([]);
    await page.reload();

    // (vi-bis) the 44px floor on the "Saldi negativi" LINKS (review 15.8a
    // MINOR-1: the row was 44 but the `<a>` a thumb hits was 18.13). The card
    // is gated on a GLOBAL condition (`negativeBalances.length > 0`) that no
    // test may create without writing money into the `fullyParallel` project
    // (TD (j)), so the rule is exercised on an INJECTED row — the same DOM
    // injection (vii) uses below. It proves three things at once: the rule
    // reaches the link, the link clears the floor, and the sweep no longer
    // excludes this list (with the old exclusion the shrunk link would stay
    // invisible to it and this block would pass on a broken page).
    await page.evaluate(() => {
      const card = document.createElement('div');
      card.className = 'card billing-negative-card';
      card.innerHTML =
        '<div class="card-body billing-negative-list">' +
        '<div class="billing-negative-row" style="display:flex;justify-content:space-between;font-size:12.5px" data-testid="injected-negative-row">' +
        '<a href="#">Cognome molto lungo che non entra nella riga Nome</a>' +
        '<span class="mono num stat-tone-bad">-1.216,22 €</span></div></div>';
      document.querySelector('.page')!.appendChild(card);
    });
    const injectedLinkHeight = await page.evaluate(
      () => Math.round(document.querySelector('[data-testid="injected-negative-row"] a')!.getBoundingClientRect().height * 100) / 100,
    );
    expect(injectedLinkHeight).toBeGreaterThanOrEqual(TARGET_FLOOR);
    expect(await page.evaluate(SMALL_TARGETS)).toEqual([]);
    await page.addStyleTag({ content: '.billing-negative-row > a{ min-height: 0 !important; line-height: normal !important; }' });
    expect(await page.evaluate(SMALL_TARGETS)).not.toEqual([]);
    await page.reload();

    // (vii-bis) `.billing-head > .billing-feedback{ display: none }` — the rule
    // is unreachable BY FLOW on a phone (record §3e: the three desktop
    // `<p role="status">` are only ever set by the desktop body and the inline
    // `<select>`, both `display: none` at 375). Unreachable by flow is not
    // unprovable (review 15.8a LOW-2): the paragraph is INJECTED into the head,
    // exactly as (vii) injects a second empty state. At 375 it must stay hidden
    // and leave the head's height untouched; at 1280 the very same node is
    // visible, which is what makes the phone rule discriminant.
    const feedbackProbe = async (): Promise<{ before: number; display: string; after: number }> =>
      page.evaluate(() => {
        const head = document.querySelector('.billing-head')!;
        const before = Math.round(head.getBoundingClientRect().height * 100) / 100;
        const p = document.createElement('p');
        p.className = 'billing-feedback';
        p.setAttribute('role', 'status');
        p.textContent = 'Rettifica registrata';
        head.appendChild(p);
        const display = getComputedStyle(p).display;
        const after = Math.round(head.getBoundingClientRect().height * 100) / 100;
        p.remove();
        return { before, display, after };
      });
    const phoneFeedback = await feedbackProbe();
    expect(phoneFeedback.display).toBe('none');
    expect(phoneFeedback.after).toBe(phoneFeedback.before);
    await page.setViewportSize(DESKTOP);
    const desktopFeedback = await feedbackProbe();
    expect(desktopFeedback.display).toBe('block');
  });

  test('AC 12 viii/ix: i selettori nuovi non raggiungono gli overlay di questa pagina ne il resto dell\'app', async ({ page }) => {
    await login(page, ADMIN_EMAIL);

    // The `.mini-modal`s and the `SlideOver` keep their desktop geometry.
    await page.setViewportSize(DESKTOP);
    await gotoBilling(page);
    await page.getByTestId('billing-new-transaction-button').click();
    await expect(page.getByTestId('transaction-form')).toBeVisible();
    // The phone rule that puts a 44px floor under this form's fields is bounded
    // by `@media (max-width: 640px)` AND by `.transaction-form`: at 1280 every
    // control keeps its pre-fix height, all of them under 44. Heights are what
    // the rule changes — widths depend on the label text and are not the guard.
    const editorHeights = await page.evaluate(() => {
      const out: Record<string, number> = {};
      for (const id of ['transaction-kind', 'transaction-person', 'transaction-amount', 'transaction-method', 'transaction-date', 'transaction-description', 'transaction-submit']) {
        out[id] = Math.round(document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().height * 100) / 100;
      }
      return out;
    });
    expect(editorHeights).toEqual({
      'transaction-kind': 36,
      'transaction-person': 36.84,
      'transaction-amount': 34.84,
      'transaction-method': 36,
      'transaction-date': 38.84,
      'transaction-description': 36.84,
      'transaction-submit': 34.84,
    });
    // Proof that this guard DISCRIMINATES: the descendant variant of the very
    // same rule (the shape lesson 15.3 F1 warns about) does reach them.
    await page.addStyleTag({ content: '.slideover .input{ min-height: 44px !important; }' });
    const leaked = await page.evaluate(() => Math.round(document.querySelector('[data-testid="transaction-kind"]')!.getBoundingClientRect().height * 100) / 100);
    expect(leaked).toBeGreaterThanOrEqual(44);

    // The neighbours: `.segmented`, `.util-*`, `.split` and `.date-input` outside this page.
    // Widths that depend on a LABEL are not invariants (a month name, a locale,
    // a data-driven option): `.segmented` is measured by its HEIGHT and its
    // count, which is exactly what a rule on that class would have moved (the
    // epic's own recipe puts a 44px floor under every phone control).
    const NEIGHBOUR_PROBE = () => ({
      splits: [...document.querySelectorAll('.split')].map((s) => Math.round(s.getBoundingClientRect().width)),
      segmentedHeights: [...document.querySelectorAll('.segmented')].map((s) => Math.round(s.getBoundingClientRect().height * 100) / 100),
      // The COUNT of the bars is data (one per aircraft / per instructor); the
      // invariant is their WIDTH — a rule reaching `.util-*` would move it.
      utilBarWidths: [...new Set([...document.querySelectorAll('.util-bar')].map((s) => Math.round(s.getBoundingClientRect().width)))],
      dateInputs: [...document.querySelectorAll('.date-input')].map((s) => Math.round(s.getBoundingClientRect().width)),
    });
    await page.setViewportSize(PHONE);
    // The story's own 2026-08-05 baseline, measured BEFORE the change on the
    // pages this story must not reach.
    const neighbours: Record<string, ReturnType<typeof NEIGHBOUR_PROBE>> = {
      // `/dashboard/reports` was frozen at this story's own pre-fix numbers
      // (`segmentedHeights: [33.39, 33.39, 33.39]`, `utilBarWidths: [281]`)
      // until story 15.8b, which OWNS that page: its AC 1 puts the two toggles
      // on the 44px floor (46 with the border) and its AC 3 hides the ranked
      // rows past the cap, whose bars then measure 0. The page stays in this
      // sweep — a rule leaking from THIS story would still move `.split`, the
      // bar width of the visible rows or the date inputs — with the numbers
      // updated to what 15.8b measures, never weakened away.
      '/it/dashboard/reports': { splits: [319, 319, 319, 319], segmentedHeights: [46, 46, 46], utilBarWidths: [281, 0], dateInputs: [] },
      '/it/dashboard/logbook': { splits: [], segmentedHeights: [], utilBarWidths: [], dateInputs: [0, 0, 335] },
      '/it/dashboard/movements': { splits: [], segmentedHeights: [], utilBarWidths: [], dateInputs: [335, 335, 0, 0] },
      '/it/dashboard/bookings': { splits: [], segmentedHeights: [33.39], utilBarWidths: [], dateInputs: [335, 335] },
    };
    for (const [path, expected] of Object.entries(neighbours)) {
      await page.goto(path);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `overflow ${path}`).toBe(0);
      expect(await page.evaluate(NEIGHBOUR_PROBE), `neighbour geometry ${path} @375`).toEqual(expected);
    }
  });

  test('AC 14: /dashboard/billing resta ADMIN-only anche a 375, e la voce non compare per gli altri tre attori', async ({ page }) => {
    for (const email of [PILOT_EMAIL, STUDENT_EMAIL, INSTRUCTOR_EMAIL]) {
      await page.context().clearCookies();
      await login(page, email);
      for (const size of [PHONE, DESKTOP]) {
        await page.setViewportSize(size);
        await page.goto('/it/dashboard/billing');
        await expect(page, `${email} @${size.width}`).toHaveURL(/\/it\/dashboard$/);
      }
      await page.setViewportSize(PHONE);
      await page.goto('/it/dashboard');
      await expect(page.getByTestId('mobile-tab-bar')).toBeVisible();
      await expect(page.getByTestId('mobile-tab-bar').getByText('Contabilità')).toHaveCount(0);
      // The "Altro" sheet only exists when the actor has more entries than the
      // bar holds — a pilota/allievo/istruttore may not have one at all.
      if ((await page.getByTestId('mobile-tab-more').count()) > 0) {
        await page.getByTestId('mobile-tab-more').click();
        await expect(page.getByTestId('mobile-more-sheet')).toBeVisible();
        await expect(page.getByTestId('mobile-more-sheet').getByText('Contabilità')).toHaveCount(0);
        await page.keyboard.press('Escape');
      }
    }

    await page.context().clearCookies();
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/billing');
    await expect(page).toHaveURL(/\/dashboard\/billing/);
  });
});
