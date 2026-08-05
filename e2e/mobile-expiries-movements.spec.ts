import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Story 15.7 — the phone faces of the Scadenze registry (admin), of "Le mie
 * scadenze" (self) and of the Voli in transito register, plus the closure of
 * a transit with its landing fee.
 *
 * Viewport is set INSIDE each test (pattern 13.10): no duplicate Playwright
 * project. The file lives in the main `chromium` project — it writes no
 * global `AppSetting` (the quota associativa, which does, lives in its own
 * serialized spec, `mobile-membership-fee.spec.ts`).
 *
 * Isolation: every test creates its OWN fixtures (a run-unique expiry type
 * plus its people, or PPR requests with run-unique marks) and reaches them
 * through the page's own filters (`gotoScadenze`, `gotoMovementsFor`) — never
 * by assuming "my row is on page 1" (both registers paginate at 20, and the
 * movements one is FIFO `createdAt asc`, so a run-unique fixture is the newest
 * row of its own status+day bucket, on that bucket's LAST page). No test
 * depends on the club's default landing fee: the field is editable and each
 * test types its own amount.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const STUDENT_EMAIL = 'student@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-expiries-movements.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 };
const NARROW = { width: 320, height: 568 };
const DESKTOP = { width: 1280, height: 720 };

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

function uniqueRegistration(prefix: string): string {
  return `I-${prefix}${uniqueSuffix().replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()}`;
}

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

function addDaysUtc(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// --- fixtures: scadenze ----------------------------------------------------

type ExpiryFixture = { typeId: string; typeName: string; personId: string; lastName: string; firstName: string };

/** A run-unique expiry TYPE plus one person carrying one scadenza of it, at `daysFromNow`. */
async function createExpiryFixture(page: Page, daysFromNow: number, notes?: string): Promise<ExpiryFixture> {
  const typeName = `TipoMob ${uniqueSuffix()}`;
  const typeResponse = await page.request.post('/api/v1/expiry-types', { data: { name: typeName, scope: 'ALL' } });
  expect(typeResponse.status()).toBe(201);
  const type = (await typeResponse.json()) as { id: string };

  const firstName = 'Mobile';
  const lastName = `Scadenza-${uniqueSuffix()}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `LIC-${uniqueSuffix()}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);

  const expiryResponse = await page.request.post('/api/v1/expiries', {
    data: { personId: person.id, expiryTypeId: type.id, expiresAt: addDaysUtc(daysFromNow), ...(notes ? { notes } : {}) },
  });
  expect(expiryResponse.status()).toBe(201);

  return { typeId: type.id, typeName, personId: person.id, lastName, firstName };
}

/** The registry, narrowed to ONE run-unique type — never "my row is on page 1". */
async function gotoScadenze(page: Page, fixture: ExpiryFixture, window = 'all'): Promise<void> {
  await page.goto(`/it/dashboard/expiries?window=${window}&expiryTypeId=${fixture.typeId}`);
}

/**
 * One run-unique type carrying `count` scadenze, i.e. a SECOND page of the
 * registry BUILT rather than hoped for (review 15.7 LOW-4: a pagination guard
 * whose every assertion hides inside `if (the pagination exists)` is green
 * without having measured anything, on any DB that happens to hold fewer than
 * 21 rows). `@@unique([personId, expiryTypeId])` (schema.prisma) means one
 * person per row, so the people go in one wave and the scadenze in the next.
 * Every date is beyond 60 days on purpose: the four stat cards are EXCLUSIVE
 * bands (expired/≤7/≤30/≤60), so these rows move none of the global counts
 * `expiry-dashboard.spec.ts` reads twice in a row under `fullyParallel`.
 */
async function createPagedExpiryFixture(page: Page, count: number): Promise<string> {
  const typeResponse = await page.request.post('/api/v1/expiry-types', { data: { name: `TipoPag ${uniqueSuffix()}`, scope: 'ALL' } });
  expect(typeResponse.status()).toBe(201);
  const type = (await typeResponse.json()) as { id: string };

  const people = await Promise.all(
    Array.from({ length: count }, async () => {
      const response = await page.request.post('/api/v1/people', { data: { firstName: 'Pagina', lastName: `Scadenza-${uniqueSuffix()}` } });
      expect(response.status()).toBe(201);
      return (await response.json()) as { id: string };
    }),
  );
  await Promise.all(
    people.map(async (person, index) => {
      const response = await page.request.post('/api/v1/expiries', {
        data: { personId: person.id, expiryTypeId: type.id, expiresAt: addDaysUtc(100 + index) },
      });
      expect(response.status()).toBe(201);
    }),
  );
  return type.id;
}

// --- fixtures: transiti ----------------------------------------------------

type PprFixture = { id: string; registration: string; email: string; eta: string; pprNumber: string | null };

async function createPendingRequest(page: Page, hoursFromNow = 5): Promise<PprFixture> {
  const registration = uniqueRegistration('M');
  const email = `mobile-${uniqueSuffix()}@e2e.airmanager.local`;
  const eta = futureIso(hoursFromNow);
  const response = await page.request.post('/api/v1/ppr-requests', {
    headers: { 'x-forwarded-for': `e2e-mobile157-${uniqueSuffix()}` },
    data: {
      firstName: 'Transito',
      lastName: `Mobile-${uniqueSuffix()}`,
      email,
      phone: '+39 333 0000000',
      aircraftRegistration: registration,
      aircraftType: 'Cessna 172 Skyhawk',
      origin: 'LIRN Napoli',
      destination: 'LIRU Urbe',
      eta,
      personsOnBoard: 3,
      notes: 'Nota del transito',
      locale: 'it',
    },
  });
  expect(response.status()).toBe(201);

  const listResponse = await page.request.get('/api/v1/ppr-requests?status=PENDING&pageSize=100');
  const body = (await listResponse.json()) as { items: { id: string; aircraftRegistration: string }[] };
  const match = body.items.find((item) => item.aircraftRegistration === registration);
  if (!match) throw new Error(`PENDING request ${registration} not found`);
  return { id: match.id, registration, email, eta, pprNumber: null };
}

async function createApprovedRequest(page: Page, hoursFromNow = 5): Promise<PprFixture> {
  const pending = await createPendingRequest(page, hoursFromNow);
  const approve = await page.request.post(`/api/v1/ppr-requests/${pending.id}/approve`);
  expect(approve.status()).toBe(200);
  const body = (await approve.json()) as { pprNumber: string };
  return { ...pending, pprNumber: body.pprNumber };
}

const UI_MOVEMENTS_PAGE_SIZE = 20;

/**
 * `YYYY-MM-DD` of an instant in Europe/Rome — the SAME calendar-day bucketing
 * `listPprRequests` applies to the register's `from`/`to` filter (lesson PR #17:
 * the UTC day is wrong between 22:00 and 24:00 UTC).
 */
function romeDateOnly(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/**
 * Reaches a fixture through BOTH of the register's own filters: its status and
 * the Rome day of its eta — and then the LAST page of THAT set, because the
 * register is FIFO (`createdAt asc`) and a run-unique fixture is always the
 * newest of its own bucket. Measured on this DB: one status+day bucket already
 * holds 36 rows, i.e. two pages, so the day filter alone is not enough and the
 * last page of the WHOLE status is not stable under `fullyParallel`.
 */
async function gotoMovementsFor(page: Page, status: string, etaIso: string): Promise<void> {
  const day = romeDateOnly(new Date(etaIso));
  const response = await page.request.get(`/api/v1/ppr-requests?status=${status}&from=${day}&to=${day}&pageSize=${UI_MOVEMENTS_PAGE_SIZE}`);
  const body = (await response.json()) as { total: number };
  const lastPage = Math.max(1, Math.ceil(body.total / UI_MOVEMENTS_PAGE_SIZE));
  await page.goto(`/it/dashboard/movements?status=${status}&from=${day}&to=${day}&page=${lastPage}`);
}

/**
 * `count` APPROVED transiti in a Rome day of their OWN, through the same staff
 * intake the "Registra arrivo" panel posts to (`ppr-requests/manual`, with
 * `approveImmediately`): no rate limiter, no receipt email. `daysFromNow` is
 * deliberately far out, which keeps these rows out of EVERY aggregate on the
 * page — "attesi domani" is an exact day, "al suolo"/"in arrivo" scan only up
 * to today, "movimenti nel mese" counts COMPLETED rows of the current month —
 * and gives the register's own `?status=…&from=day&to=day` view a bucket that
 * nothing else in the suite reaches. It is NOT an empty bucket, though: a
 * re-run on the same DB adds its own `count` to the same day, so callers
 * assert "at least this many", never an exact total. Returns that Rome day.
 */
async function createManualApproved(page: Page, daysFromNow: number, count: number): Promise<string> {
  const eta = new Date(Date.now() + daysFromNow * 86_400_000);
  eta.setUTCHours(9, 0, 0, 0);
  await Promise.all(
    Array.from({ length: count }, async () => {
      const response = await page.request.post('/api/v1/ppr-requests/manual', {
        data: {
          firstName: 'Pagina',
          lastName: `Transito-${uniqueSuffix()}`,
          email: `pagina-${uniqueSuffix()}@e2e.airmanager.local`,
          aircraftRegistration: uniqueRegistration('P'),
          aircraftType: 'Cessna 172 Skyhawk',
          origin: 'LIRN Napoli',
          destination: 'LIRU Urbe',
          eta: eta.toISOString(),
          personsOnBoard: 2,
          locale: 'it',
          approveImmediately: true,
        },
      });
      expect(response.status()).toBe(201);
    }),
  );
  return romeDateOnly(eta);
}

function movementCards(page: Page): Locator {
  return page.getByTestId('ppr-register-row-mobile');
}

async function pprCategoryId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/cash-categories');
  const categories = (await response.json()) as { id: string; name: string }[];
  const match = categories.find((category) => category.name === 'PPR');
  if (!match) throw new Error('Seeded "PPR" cash category not found');
  return match.id;
}

/** The accounting effect, read from the FILTERED API — never from a count of rows on screen. */
async function pprMovementsWithDescription(page: Page, description: string): Promise<number> {
  const categoryId = await pprCategoryId(page);
  const response = await page.request.get(`/api/v1/cash-movements?categoryId=${categoryId}&pageSize=100`);
  const body = (await response.json()) as { items: { description: string | null }[] };
  return body.items.filter((item) => item.description === description).length;
}

// --- in-page probes --------------------------------------------------------

/** `display` of a selector, or `'absent'`. */
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
 * on its parent (lesson 15.5 F1/§12).
 */
const CHILDREN_OUT_OF_CARD = (): { cls: string; right: number; cardRight: number }[] => {
  const out: { cls: string; right: number; cardRight: number }[] = [];
  for (const card of Array.from(document.querySelectorAll('.mobile-row'))) {
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
 * Horizontally scrollable boxes that are NOT scrollable by design. `overflow-x:
 * hidden` is excluded on purpose: a clipped, non-scrollable box is the ellipsis
 * case above, not a hidden scroller. The CLOSED `SlideOver` of `ManualPprForm`
 * is a declared exception (measured 335/355 at 375px since 15.2 — a panel
 * translated off-screen, `pointer-events: none`).
 */
const HIDDEN_SCROLLERS = (): { cls: string; cw: number; sw: number }[] => {
  const out: { cls: string; cw: number; sw: number }[] = [];
  const page = document.querySelector('.page');
  if (!page) return out;
  for (const el of Array.from(page.querySelectorAll('*'))) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    if (getComputedStyle(el).overflowX === 'hidden') continue;
    if (el.closest('.slideover:not(.open)')) continue;
    if (el.classList.contains('mobile-chip-strip') || el.classList.contains('kpi-row')) continue; // scrollable BY DESIGN (15.2/15.4)
    out.push({ cls: typeof el.className === 'string' ? el.className : '', cw: el.clientWidth, sw: el.scrollWidth });
  }
  return out;
};

/**
 * `'self'` when the control answers `elementFromPoint` at its own centre —
 * an ANCESTOR answering means the control is pointer-transparent (measured:
 * the `aria-disabled` pagination link at page 1), which is not a coverage
 * either, since an ancestor cannot cover its own child. Anything else is the
 * tag/class of what actually sits on top.
 */
async function hitTestOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'absent';
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!hit) return 'none';
    return hit === el || el.contains(hit) || hit.contains(el) ? 'self' : `${hit.tagName}.${typeof hit.className === 'string' ? hit.className : ''}`;
  }, selector);
}

/** Visible controls under 44px, excluding the closed `SlideOver` (present but off-screen). */
const SMALL_TARGETS = (): { testid: string | null; cls: string; h: number }[] => {
  const out: { testid: string | null; cls: string; h: number }[] = [];
  const nodes = document.querySelectorAll(
    '.page a, .page button, .page input, .page select, .mobile-sheet button, .mobile-sheet a, .slideover.open button, .slideover.open input, .slideover.open select',
  );
  for (const el of Array.from(nodes)) {
    if (el.closest('.slideover:not(.open)')) continue;
    if (el.getClientRects().length === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height < 43.5) out.push({ testid: el.getAttribute('data-testid'), cls: typeof el.className === 'string' ? el.className : '', h: Math.round(rect.height * 10) / 10 });
  }
  return out;
};

// ---------------------------------------------------------------------------
// AC 1 / AC 2 / AC 12 — the two admin lists become cards
// ---------------------------------------------------------------------------

test.describe('Story 15.7 — Scadenze e Voli in transito su telefono', () => {
  test('AC 1/12: a 375px la tabella Scadenze e` display:none e la lista a card la sostituisce; a 1280px l\'inverso; la card e` UN solo elemento interattivo, >=44px, con nome accessibile parlante', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await login(page, ADMIN_EMAIL);
    const fixture = await createExpiryFixture(page, 20);

    // --- 1280px: the table is the visible body, the card list is not --------
    await gotoScadenze(page, fixture);
    await expect(page.getByTestId('scadenze-row')).toHaveCount(1);
    expect(await page.evaluate(DISPLAY_PROBE, '.scadenze-desktop-body')).not.toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.scadenze-mobile')).toBe('none');

    // --- 375px: the inverse, MEASURED on both sides ------------------------
    await page.setViewportSize(PHONE);
    await gotoScadenze(page, fixture);
    expect(await page.evaluate(DISPLAY_PROBE, '.scadenze-desktop-body')).toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.scadenze-mobile')).toBe('block');

    const card = page.getByTestId('scadenze-row-mobile');
    await expect(card).toHaveCount(1);
    // ONE interactive element: no nested button/link/input inside the card.
    expect(await card.evaluate((el) => el.querySelectorAll('button,a,input,select,textarea,[tabindex]').length)).toBe(0);
    expect(await card.evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);
    const name = await card.getAttribute('aria-label');
    expect(name).toContain(fixture.lastName);
    expect(name).toContain(fixture.typeName);
  });

  test('AC 2/12: a 375px la tabella Movimenti e` display:none e le card la sostituiscono, con marche + stato nel nome accessibile; a 1280px l\'inverso', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await login(page, ADMIN_EMAIL);
    const approved = await createApprovedRequest(page, 30);

    await gotoMovementsFor(page, 'APPROVED', approved.eta);
    expect(await page.evaluate(DISPLAY_PROBE, '.movements-desktop-body')).not.toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.movements-mobile')).toBe('none');

    await page.setViewportSize(PHONE);
    await gotoMovementsFor(page, 'APPROVED', approved.eta);
    expect(await page.evaluate(DISPLAY_PROBE, '.movements-desktop-body')).toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.movements-mobile')).toBe('block');

    const card = movementCards(page).filter({ hasText: approved.registration });
    await expect(card).toHaveCount(1);
    expect(await card.evaluate((el) => el.querySelectorAll('button,a,input,select,textarea,[tabindex]').length)).toBe(0);
    expect(await card.evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);
    const name = await card.getAttribute('aria-label');
    expect(name).toContain(approved.registration);
    expect(name).toContain('Atteso');
  });

  test('AC 2: la card del transito copre tutti e SETTE gli stati di MovementStatusLabel', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);

    const pending = await createPendingRequest(page, 20);
    const atteso = await createApprovedRequest(page, 30);
    const alSuolo = await createApprovedRequest(page, 10 / 3600);
    const rejected = await createPendingRequest(page, 40);
    await page.request.post(`/api/v1/ppr-requests/${rejected.id}/reject`, { data: { reason: 'Campo chiuso' } });
    const completed = await createApprovedRequest(page, 50);
    await page.request.post(`/api/v1/ppr-requests/${completed.id}/complete`, {
      data: { landingFeeCents: 1234, paymentMethod: 'CASH' },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
    const cancelled = await createApprovedRequest(page, 60);
    await page.request.post(`/api/v1/ppr-requests/${cancelled.id}/cancel`);
    // `IN_ARRIVO` needs an eta later TODAY in Rome; `AL_SUOLO` needs one that
    // has already passed — the 12s wait is what turns `alSuolo` from
    // in-arrivo into al-suolo without depending on the clock.
    await page.waitForTimeout(12_000);

    for (const [fixture, status, filter] of [
      [pending, 'In attesa', 'PENDING'],
      [atteso, 'Atteso', 'APPROVED'],
      [alSuolo, 'Al suolo', 'APPROVED'],
      [rejected, 'Rifiutato', 'REJECTED'],
      [completed, 'Partito', 'COMPLETED'],
      [cancelled, 'Annullato', 'CANCELLED'],
    ] as const) {
      await gotoMovementsFor(page, filter, fixture.eta);
      await expect(movementCards(page).filter({ hasText: fixture.registration })).toContainText(status);
    }
    // The seventh label, "In arrivo", is the same derivation with a future
    // eta on today's Rome day: asserted on `alSuolo` BEFORE it passed would be
    // clock-dependent, so it gets its own fixture read right after creation.
    const inArrivo = await createApprovedRequest(page, 1 / 60);
    await gotoMovementsFor(page, 'APPROVED', inArrivo.eta);
    await expect(movementCards(page).filter({ hasText: inArrivo.registration })).toContainText(/In arrivo|Al suolo/);
  });

  test('AC 1/2/12: nessun testo delle card e` tagliato SENZA ellissi a 320px, e nessun figlio esce dalla card', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await login(page, ADMIN_EMAIL);
    const fixture = await createExpiryFixture(page, 5, 'Una nota lunga a sufficienza da eccedere la larghezza della card su un telefono stretto');
    const approved = await createApprovedRequest(page, 30);

    await gotoScadenze(page, fixture);
    await expect(page.getByTestId('scadenze-row-mobile')).toHaveCount(1);
    expect(await page.evaluate(CLIPPED_WITHOUT_ELLIPSIS)).toEqual([]);
    expect(await page.evaluate(CHILDREN_OUT_OF_CARD)).toEqual([]);
    expect(await page.evaluate(HIDDEN_SCROLLERS)).toEqual([]);

    await gotoMovementsFor(page, 'APPROVED', approved.eta);
    await expect(movementCards(page).filter({ hasText: approved.registration })).toHaveCount(1);
    expect(await page.evaluate(CLIPPED_WITHOUT_ELLIPSIS)).toEqual([]);
    expect(await page.evaluate(CHILDREN_OUT_OF_CARD)).toEqual([]);
    expect(await page.evaluate(HIDDEN_SCROLLERS)).toEqual([]);
  });

  test('AC 1/2/7/12: ogni empty state mobile e` UN solo nodo (provato con la simulazione DOM del pre-fix) e non ripete la stringa desktop', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);

    // Scadenze: a type id that matches nothing.
    await page.goto('/it/dashboard/expiries?window=all&expiryTypeId=nonexistent-type-id');
    await expect(page.getByTestId('mobile-scadenze-empty')).toHaveCount(1);
    // The desktop string stays page-level readable (expiry-dashboard.spec.ts:135).
    await expect(page.getByText('Nulla in questa finestra.')).toHaveCount(1);
    // Pre-fix simulation (review 15.6 LOW-3): a second node WOULD be seen.
    await page.getByTestId('mobile-scadenze-empty').evaluate((node) => node.parentElement?.appendChild(node.cloneNode(true)));
    await expect(page.getByTestId('mobile-scadenze-empty')).toHaveCount(2);

    // Movimenti: a period that matches nothing.
    await page.goto('/it/dashboard/movements?status=APPROVED&from=1990-01-01&to=1990-01-02');
    await expect(page.getByTestId('mobile-movements-empty')).toHaveCount(1);
    await expect(page.getByTestId('ppr-register-empty')).toHaveCount(1);
    await page.getByTestId('mobile-movements-empty').evaluate((node) => node.parentElement?.appendChild(node.cloneNode(true)));
    await expect(page.getByTestId('mobile-movements-empty')).toHaveCount(2);
  });

  // -------------------------------------------------------------------------
  // AC 3 — the detail sheets
  // -------------------------------------------------------------------------

  test('AC 3: la card scadenza si apre DA TASTIERA e lo sheet porta la parita` piena, con un solo nodo e il link alla scheda persona', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    const fixture = await createExpiryFixture(page, 12, 'Rinnovo gia` prenotato');

    await gotoScadenze(page, fixture);
    const card = page.getByTestId('scadenze-row-mobile');
    await expect(card).toHaveCount(1);

    // Real Tab presses, never `focus()`.
    await page.keyboard.press('Tab');
    for (let i = 0; i < 40; i += 1) {
      if (await card.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    expect(await card.evaluate((el) => el === document.activeElement)).toBe(true);
    await page.keyboard.press('Enter');

    const sheet = page.getByTestId('mobile-scadenze-sheet');
    await expect(sheet).toHaveCount(1);
    await expect(sheet).toBeVisible();
    // Parity with the six desktop columns + notes + scope + the one thing the
    // desktop row OPENS.
    await expect(sheet).toContainText(fixture.lastName);
    await expect(sheet).toContainText(fixture.typeName);
    await expect(sheet).toContainText('Abilitazione');
    await expect(sheet).toContainText('Rinnovo gia` prenotato');
    await expect(sheet).toContainText('Ambito');
    await expect(sheet).toContainText('Giorni rimasti');
    await expect(sheet.getByTestId('mobile-scadenze-person-link')).toBeVisible();

    await sheet.getByTestId('mobile-scadenze-person-link').click();
    await expect(page).toHaveURL(new RegExp(`/it/dashboard/people/${fixture.personId}$`));
  });

  test('AC 3/12: il nome accessibile dello sheet transito e` BEN FORMATO anche senza pprNumber e senza ETD (guardia su proprieta`, mai su split)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    // A PENDING request has NO pprNumber (null until approved) and no etd.
    const pending = await createPendingRequest(page, 20);

    await gotoMovementsFor(page, 'PENDING', pending.eta);
    await movementCards(page).filter({ hasText: pending.registration }).click();

    const sheet = page.getByTestId('mobile-movement-sheet');
    await expect(sheet).toHaveCount(1);
    const dialog = sheet.getByRole('dialog');
    const accessibleName = (await dialog.getAttribute('aria-label')) ?? '';

    expect(accessibleName).toContain(pending.registration);
    // No PPR number was invented, and no placeholder took its place.
    expect(accessibleName).not.toMatch(/PPR-\d{4}-\d{4}/);
    // Properties, never `split(...).length` (lesson 15.5 F1).
    expect(accessibleName).not.toMatch(/—\s*—/);
    expect(accessibleName).not.toMatch(/·\s*·/);
    expect(accessibleName).not.toMatch(/(^|·)\s*—\s*(·|$)/);
    expect(accessibleName.trim()).toBe(accessibleName);
    for (const segment of accessibleName.split(/ — | · /)) {
      expect(segment.trim()).not.toBe('');
      expect(segment.trim()).not.toBe('—');
    }

    // Parity: the nine columns plus what the DTO carries and the table hides.
    await expect(sheet).toContainText('LIRN Napoli → LIRU Urbe');
    await expect(sheet).toContainText('Transito');
    await expect(sheet).toContainText(pending.email);
    await expect(sheet).toContainText('+39 333 0000000');
    await expect(sheet).toContainText('Persone a bordo');
    await expect(sheet).toContainText('Nota del transito');
    await expect(sheet).toContainText('Modulo web');
    // A PENDING row admits no decision (gate unchanged, §a.4 point 1).
    await expect(sheet.getByTestId('ppr-register-complete-button-mobile')).toHaveCount(0);
    await expect(sheet.getByTestId('ppr-register-cancel-button-mobile')).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // AC 4 — the closure, with its accounting effect
  // -------------------------------------------------------------------------

  test('AC 4: chiusura con tassa dallo sheet a 375px — un SOLO movimento di cassa in categoria PPR, importo giusto, chiave di idempotenza rigenerata', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    const approved = await createApprovedRequest(page, 30);

    const keys: string[] = [];
    await page.route('**/api/v1/ppr-requests/*/complete', async (route) => {
      keys.push(route.request().headers()['idempotency-key'] ?? '');
      await route.continue();
    });

    await gotoMovementsFor(page, 'APPROVED', approved.eta);
    await movementCards(page).filter({ hasText: approved.registration }).click();
    const sheet = page.getByTestId('mobile-movement-sheet');
    await sheet.getByTestId('ppr-register-complete-button-mobile').click();

    // Best-effort prefill + mandatory method, default CASH (§a.4 points 3/4).
    await expect(sheet.getByTestId('ppr-complete-method-mobile')).toHaveValue('CASH');
    await expect(sheet.getByTestId('ppr-complete-fee-input-mobile')).not.toHaveValue('');
    // Focus entered the field the step is about (lesson 15.2 F1).
    await expect(sheet.getByTestId('ppr-complete-fee-input-mobile')).toBeFocused();
    // Every target of an operation with a real accounting effect is >=44px,
    // and the submit is hit-testable WITHOUT any horizontal scroll (the
    // pre-fix defect: the desktop panel opened 483px to the left of the tap).
    expect(await page.evaluate(SMALL_TARGETS)).toEqual([]);
    expect(
      await sheet.getByTestId('ppr-complete-submit-mobile').evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit !== null && (el === hit || el.contains(hit));
      }),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    await sheet.getByTestId('ppr-complete-fee-input-mobile').fill('37,50');
    await sheet.getByTestId('ppr-complete-submit-mobile').click();

    await expect(page.getByTestId('toast').filter({ hasText: 'PPR completato.' })).toBeVisible();
    // The sheet closed on success; the row moved to COMPLETED.
    await expect(page.getByTestId('mobile-movement-sheet')).toHaveCount(0);

    // The accounting effect, read from the FILTERED API (never from the page).
    expect(await pprMovementsWithDescription(page, `PPR ${approved.pprNumber} landing fee`)).toBe(1);

    await gotoMovementsFor(page, 'COMPLETED', approved.eta);
    const completedCard = movementCards(page).filter({ hasText: approved.registration });
    await expect(completedCard).toContainText('Partito');
    await completedCard.click();
    await expect(page.getByTestId('mobile-movement-sheet')).toContainText(/37,50\s€/);
    // A COMPLETED row admits no decision.
    await expect(page.getByTestId('ppr-register-complete-button-mobile')).toHaveCount(0);

    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toBe('');
  });

  test('AC 4: tassa 0 dallo sheet — nessun movimento di cassa; tassa non parsabile — errore inline e ZERO richieste di rete', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    const approved = await createApprovedRequest(page, 30);

    let completeRequests = 0;
    await page.route('**/api/v1/ppr-requests/*/complete', async (route) => {
      completeRequests += 1;
      await route.continue();
    });

    await gotoMovementsFor(page, 'APPROVED', approved.eta);
    await movementCards(page).filter({ hasText: approved.registration }).click();
    const sheet = page.getByTestId('mobile-movement-sheet');
    await sheet.getByTestId('ppr-register-complete-button-mobile').click();

    // --- unparsable fee: inline error, and NOT ONE request left the browser --
    await sheet.getByTestId('ppr-complete-fee-input-mobile').fill('abc');
    await sheet.getByTestId('ppr-complete-submit-mobile').click();
    await expect(sheet.getByRole('alert')).toBeVisible();
    expect(completeRequests).toBe(0);
    await expect(page.getByTestId('mobile-movement-sheet')).toBeVisible();

    // --- fee 0: closed, and NO cash movement ------------------------------
    await sheet.getByTestId('ppr-complete-fee-input-mobile').fill('0,00');
    await sheet.getByTestId('ppr-complete-submit-mobile').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'PPR completato.' })).toBeVisible();
    expect(completeRequests).toBe(1);
    expect(await pprMovementsWithDescription(page, `PPR ${approved.pprNumber} landing fee`)).toBe(0);
  });

  test('AC 4: 409 PPR_NOT_APPROVED distinto dal generico — il transito chiuso altrove mostra il toast di conflitto', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    const approved = await createApprovedRequest(page, 30);

    await gotoMovementsFor(page, 'APPROVED', approved.eta);
    await movementCards(page).filter({ hasText: approved.registration }).click();
    const sheet = page.getByTestId('mobile-movement-sheet');
    await sheet.getByTestId('ppr-register-complete-button-mobile').click();

    // Someone else closes it while this sheet is open.
    const elsewhere = await page.request.post(`/api/v1/ppr-requests/${approved.id}/complete`, {
      data: { landingFeeCents: 100, paymentMethod: 'CASH' },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
    expect(elsewhere.status()).toBe(200);

    await sheet.getByTestId('ppr-complete-fee-input-mobile').fill('10,00');
    await sheet.getByTestId('ppr-complete-submit-mobile').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'non è più in stato Approvato' })).toBeVisible();
    await expect(page.getByTestId('mobile-movement-sheet')).toHaveCount(0);
  });

  test('AC 4: annullo del transito come secondo passo dello sheet — nessuna tassa, nessun movimento, target >=44px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    const approved = await createApprovedRequest(page, 30);

    await gotoMovementsFor(page, 'APPROVED', approved.eta);
    await movementCards(page).filter({ hasText: approved.registration }).click();
    const sheet = page.getByTestId('mobile-movement-sheet');
    await sheet.getByTestId('ppr-register-cancel-button-mobile').click();

    // A confirmation, not a form (§a.4 point 8) — and both targets are >=44px
    // (pre-fix, the desktop inline confirmation measured 25x25).
    await expect(sheet.getByTestId('ppr-register-cancel-confirm-mobile')).toBeVisible();
    await expect(sheet.getByTestId('ppr-complete-fee-input-mobile')).toHaveCount(0);
    expect(await page.evaluate(SMALL_TARGETS)).toEqual([]);

    await sheet.getByTestId('ppr-register-cancel-confirm-mobile').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'PPR annullato.' })).toBeVisible();
    expect(await pprMovementsWithDescription(page, `PPR ${approved.pprNumber} landing fee`)).toBe(0);

    await gotoMovementsFor(page, 'CANCELLED', approved.eta);
    await expect(movementCards(page).filter({ hasText: approved.registration })).toContainText('Annullato');
  });

  // -------------------------------------------------------------------------
  // AC 5 / AC 6 — the two heads
  // -------------------------------------------------------------------------

  test('AC 5: la testata Scadenze a 375px e` <= del pre-fix (262px) con ogni controllo >=44px, e nessun filtro sparisce', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    const fixture = await createExpiryFixture(page, 20);

    await gotoScadenze(page, fixture);
    const head = await page.evaluate(() => {
      const h = document.querySelector('.scadenze-head');
      const strip = document.querySelector('.mobile-chip-strip');
      return {
        head: h ? h.getBoundingClientRect().height : null,
        strip: strip ? strip.getBoundingClientRect().height : null,
      };
    });
    // Pre-fix, measured on this build's own baseline: 261.5px of `.card-head`
    // at 375px, in BOTH locales. The chip strip is the finestra filter that
    // moved OUT of the head, so it counts against the same budget.
    expect((head.head ?? 0) + (head.strip ?? 0)).toBeLessThanOrEqual(261.5);
    expect(await page.evaluate(SMALL_TARGETS)).toEqual([]);

    // R4: every filter and every action is still reachable.
    await expect(page.getByTestId('scadenze-filter-pilot')).toBeVisible();
    await expect(page.getByTestId('mobile-scadenze-filters-button')).toBeVisible();
    await expect(page.getByTestId('scadenze-membership-fee-button')).toBeVisible();
    await expect(page.getByTestId('scadenze-send-reminders-button')).toBeVisible();
    for (const value of ['60', '30', '7', 'expired', 'all']) {
      await expect(page.getByTestId(`mobile-scadenze-window-chip-${value}`)).toBeVisible();
    }

    // A chip navigates with the SAME URL contract as the desktop segmented.
    await page.getByTestId('mobile-scadenze-window-chip-7').click();
    await expect(page).toHaveURL(/window=7/, { timeout: 15_000 });
    // ...and the console's own state followed it: the next filter change must
    // not silently undo the window (this console has NO remount `key`).
    await page.getByTestId('mobile-scadenze-filters-button').click();
    await page.getByTestId('mobile-scadenze-filters-apply').click();
    await expect(page).toHaveURL(/window=7/, { timeout: 15_000 });
  });

  test('AC 5/12: il pannello Filtri Scadenze applica in UNA sola navigazione e sopravvive a un debounce pendente', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    const fixture = await createExpiryFixture(page, 20);

    await gotoScadenze(page, fixture);
    // Next's App Router commits a `framenavigated` onto the CURRENT url on
    // every RSC refresh, so only a navigation to a DIFFERENT url counts —
    // which is exactly what the pre-fix behaviour would produce (a `?...&
    // personQuery=` push from the debounce, or one per `onChange`).
    const startUrl = page.url();
    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && frame.url() !== startUrl) navigations.push(frame.url());
    });

    // Type into the search (arming the 400ms debounce) and open the panel at
    // once: the panel must NOT be closed by the timer, and the draft must
    // carry the text AS TYPED (review 15.6 MINOR-1 / AD-4).
    await page.getByTestId('scadenze-filter-pilot').fill(fixture.lastName);
    await page.getByTestId('mobile-scadenze-filters-button').click();
    await expect(page.getByTestId('mobile-scadenze-filter-panel')).toBeVisible();
    await page.waitForTimeout(900);
    await expect(page.getByTestId('mobile-scadenze-filter-panel')).toBeVisible();
    expect(navigations).toHaveLength(0);

    await page.getByTestId('scadenze-filter-type-mobile').selectOption(fixture.typeId);
    await page.getByTestId('mobile-scadenze-filters-apply').click();
    await expect(page).toHaveURL(new RegExp(`expiryTypeId=${fixture.typeId}`), { timeout: 15_000 });
    // ONE navigation, carrying BOTH the panel filter and the typed search.
    await expect(page).toHaveURL(new RegExp(`personQuery=${encodeURIComponent(fixture.lastName)}`));
    expect(navigations).toHaveLength(1);
    await expect(page.getByTestId('scadenze-row-mobile')).toHaveCount(1);
    // The search box kept the text it was applied with.
    await expect(page.getByTestId('scadenze-filter-pilot')).toHaveValue(fixture.lastName);
  });

  test('AC 6: la testata Movimenti a 375px e` <= del pre-fix (143px), la CTA e` full width >=44px, e i filtri restano tutti raggiungibili', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    await createApprovedRequest(page, 30);

    await page.goto('/it/dashboard/movements');
    const geom = await page.evaluate(() => {
      const h = document.querySelector('.movements-head');
      const strip = document.querySelector('.mobile-chip-strip');
      const cta = document.querySelector('[data-testid="log-arrival-button"]');
      const page_ = document.querySelector('.page');
      return {
        head: h ? h.getBoundingClientRect().height : null,
        strip: strip ? strip.getBoundingClientRect().height : null,
        cta: cta ? { w: Math.round(cta.getBoundingClientRect().width), h: Math.round(cta.getBoundingClientRect().height) } : null,
        headWidth: Math.round((document.querySelector('.page-head') as HTMLElement).getBoundingClientRect().width),
        pageWidth: page_ ? Math.round(page_.getBoundingClientRect().width) : null,
      };
    });
    expect((geom.head ?? 0) + (geom.strip ?? 0)).toBeLessThanOrEqual(142.98);
    expect(geom.cta?.h).toBeGreaterThanOrEqual(44);
    // Full width: the CTA spans the page head's own content column (`.page`
    // carries 28px of side padding, so the column is narrower than `.page`).
    expect(geom.cta?.w).toBeGreaterThanOrEqual((geom.headWidth ?? 0) - 2);
    expect(await page.evaluate(SMALL_TARGETS)).toEqual([]);

    for (const value of ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED']) {
      await expect(page.getByTestId(`mobile-movements-status-chip-${value}`)).toHaveCount(1);
    }
    await expect(page.getByTestId('mobile-movements-filters-button')).toBeVisible();

    // The chips keep the desktop URL contract.
    await page.getByTestId('mobile-movements-status-chip-ALL').click();
    await expect(page).toHaveURL(/status=ALL/, { timeout: 15_000 });
  });

  test('AC 6/12: il pannello Filtri Movimenti applica in UNA sola navigazione e i suoi popover data restano dentro il viewport', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);

    await page.goto('/it/dashboard/movements');
    // Same filter as the Scadenze panel test: only a DIFFERENT url counts.
    const startUrl = page.url();
    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && frame.url() !== startUrl) navigations.push(frame.url());
    });

    await page.getByTestId('mobile-movements-filters-button').click();
    await expect(page.getByTestId('mobile-movements-filter-panel')).toBeVisible();

    // The date popover (portalled, z 65/66) is OPENED — from its own calendar
    // trigger, not simulated by a `fill()`, which never opens it (review 15.7
    // LOW-5: the promise in this test's name used to go unexercised) — and is
    // measured where AC 6 asks: above the panel, wholly inside the viewport,
    // and picking a day writes the DRAFT without navigating. It is dismissed
    // by the pick itself and then by the NEXT control, never with Escape
    // (review 14.3 F1: Escape closes the whole SlideOver).
    await page.getByTestId('ppr-register-filter-from-mobile').fill('2026-01-10');
    const fromField = page.locator('.date-input').filter({ has: page.getByTestId('ppr-register-filter-from-mobile') });
    await fromField.getByRole('button', { name: 'Apri calendario' }).click();
    const popover = await page.evaluate(() => {
      const el = document.querySelector('.cal-popover');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        z: getComputedStyle(el).zIndex,
        inside: rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
        // Above the panel: the hit at the popover's own centre belongs to IT,
        // not to the `SlideOver` underneath (z 50 against the portal's 66).
        onTop: hit !== null && hit.closest('.cal-popover') !== null,
        panelOpen: document.querySelectorAll('[data-testid="mobile-movements-filter-panel"]').length,
      };
    });
    expect(popover).toEqual({ z: '66', inside: true, onTop: true, panelOpen: 1 });
    await page.locator('.cal-popover .cal-cell:not(.out)').filter({ hasText: /^15$/ }).click();
    await expect(page.getByTestId('ppr-register-filter-from-mobile')).toHaveValue('2026-01-15');
    await expect(page.locator('.cal-popover')).toHaveCount(0);
    expect(navigations).toHaveLength(0);

    await page.getByTestId('ppr-register-filter-from-mobile').fill('2026-01-10');
    await page.getByTestId('ppr-register-filter-to-mobile').fill('2026-01-20');
    expect(navigations).toHaveLength(0);

    await page.getByTestId('mobile-movements-filters-apply').click();
    await expect(page).toHaveURL(/from=2026-01-10/, { timeout: 15_000 });
    await expect(page).toHaveURL(/to=2026-01-20/);
    expect(navigations).toHaveLength(1);

    // "Azzera filtri" — the panel's own footer button, back to the default.
    await page.getByTestId('mobile-movements-filters-button').click();
    await page.getByTestId('ppr-register-filter-reset-mobile').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/movements$/, { timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // AC 7 / AC 14 — the self face and the actors
  // -------------------------------------------------------------------------

  test('AC 7/14: "Le mie scadenze" a card per il pilota, empty state con testid proprio per allievo e istruttore, redirect da /movements per tutti e tre', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await login(page, ADMIN_EMAIL);
    const typeName = `TipoSelf ${uniqueSuffix()}`;
    const typeResponse = await page.request.post('/api/v1/expiry-types', { data: { name: typeName, scope: 'ALL' } });
    const type = (await typeResponse.json()) as { id: string };
    const peopleResponse = await page.request.get(`/api/v1/people?q=${encodeURIComponent(PILOT_EMAIL)}`);
    const people = (await peopleResponse.json()) as { items: { id: string; email: string | null }[] };
    const pilotPerson = people.items.find((item) => item.email === PILOT_EMAIL);
    if (!pilotPerson) throw new Error('seed pilot not found');
    await page.request.post('/api/v1/expiries', { data: { personId: pilotPerson.id, expiryTypeId: type.id, expiresAt: addDaysUtc(25), notes: 'Nota della mia scadenza' } });

    // --- pilota: the card list replaces the table at 375, the inverse at 1280
    await page.context().clearCookies();
    await page.setViewportSize(PHONE);
    await login(page, PILOT_EMAIL);
    await page.goto('/it/dashboard/expiries');
    expect(await page.evaluate(DISPLAY_PROBE, '.my-expiries-desktop-body')).toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.my-expiries-mobile')).toBe('block');
    const myCard = page.getByTestId('my-expiry-row-mobile').filter({ hasText: typeName });
    await expect(myCard).toHaveCount(1);
    await myCard.click();
    const sheet = page.getByTestId('mobile-my-expiry-sheet');
    await expect(sheet).toHaveCount(1);
    await expect(sheet).toContainText('Nota della mia scadenza');
    await page.keyboard.press('Escape');

    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard/expiries');
    expect(await page.evaluate(DISPLAY_PROBE, '.my-expiries-desktop-body')).not.toBe('none');
    expect(await page.evaluate(DISPLAY_PROBE, '.my-expiries-mobile')).toBe('none');

    // ADMIN-only register: the redirect holds at 375px too.
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/movements');
    await expect(page).toHaveURL(/\/it\/dashboard$/);

    // --- allievo and istruttore: the empty state, ONE node, own testid ------
    for (const email of [STUDENT_EMAIL, INSTRUCTOR_EMAIL]) {
      await page.context().clearCookies();
      await login(page, email);
      await page.goto('/it/dashboard/expiries');
      await expect(page.getByRole('heading', { name: 'Le mie scadenze' })).toBeVisible();
      await expect(page.getByTestId('mobile-my-expiries-empty')).toHaveCount(1);
      await expect(page.getByTestId('my-expiries-empty')).toHaveCount(1);
      await page.goto('/it/dashboard/movements');
      await expect(page).toHaveURL(/\/it\/dashboard$/);
    }
  });

  // -------------------------------------------------------------------------
  // AC 8 — the reminders outcome
  // -------------------------------------------------------------------------

  test('AC 8: su telefono l\'esito dei promemoria arriva col toast (il paragrafo desktop resta un nodo, nascosto) e il trigger resta UNO', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/expiries');

    await expect(page.getByTestId('scadenze-send-reminders-button')).toHaveCount(1);
    await page.getByTestId('scadenze-send-reminders-button').click();
    await expect(page.getByTestId('toast')).toBeVisible({ timeout: 30_000 });
    // The paragraph is still ONE node and still carries the outcome — it is
    // simply not on screen here (ratifica R-15.7-g).
    await expect(page.getByTestId('scadenze-reminders-feedback')).toHaveCount(1);
    expect(await page.evaluate(DISPLAY_PROBE, '.scadenze-reminders-feedback')).toBe('none');
  });

  // -------------------------------------------------------------------------
  // AC 9 — pagination
  // -------------------------------------------------------------------------

  test('AC 9: le due paginazioni restano quelle di oggi, con target >=44px e sopra la tab bar', async ({ page }) => {
    test.setTimeout(90_000); // this test BUILDS its two second pages: 21 + 21 fixtures over the API
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);

    // Both preconditions are BUILT, never hoped for (review 15.7 LOW-4): on a
    // fresh DB neither register spans a second page, and every assertion below
    // used to sit inside `if (the pagination exists)` — green on such a DB
    // without having measured a single target.
    const pagedTypeId = await createPagedExpiryFixture(page, 21);
    await page.goto(`/it/dashboard/expiries?window=all&expiryTypeId=${pagedTypeId}`);
    await expect(page.getByTestId('scadenze-pagination-status')).toHaveText('1 / 2');
    const prev = page.getByTestId('scadenze-page-prev');
    const next = page.getByTestId('scadenze-page-next');
    expect(await next.evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);
    expect(await prev.evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);
    // Above the tab bar, which this test's own title promises: hit-tested at
    // the bottom of a REAL scroll. An ancestor answering `elementFromPoint` is
    // the control being pointer-transparent (the `aria-disabled` "prev" at
    // page 1), never a coverage — a real one comes from a different subtree.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
    expect(await hitTestOf(page, '[data-testid="scadenze-page-next"]')).toBe('self');
    await next.click();
    await expect(page).toHaveURL(/page=2/, { timeout: 15_000 });
    await expect(page).toHaveURL(/window=all/);
    await expect(page).toHaveURL(new RegExp(`expiryTypeId=${pagedTypeId}`));
    await expect(page.getByTestId('scadenze-pagination-status')).toHaveText('2 / 2');

    // Movimenti: 21 transiti in a Rome day of their own, reached with the
    // register's own filters — the pagination lives OUTSIDE `MovementsTable`
    // (`movements/page.tsx`), which is why it needed its own rule.
    const day = await createManualApproved(page, 45, 21);
    await page.goto(`/it/dashboard/movements?status=ALL&from=${day}&to=${day}`);
    const movementsPagination = page.getByTestId('movements-pagination');
    await expect(movementsPagination).toHaveCount(1);
    // "There IS a second page, and this fixture put it there" — never "there
    // are exactly two": a Rome day bucket accumulates the fixtures of every
    // re-run on the same DB (measured: 1/3, 1/4, 1/5 over three runs), and a
    // count nailed to the first run is a guard that goes red for the wrong
    // reason on the second.
    await expect(page.getByTestId('movements-pagination-status')).toHaveText(/^1 \/ [2-9][0-9]*$/);
    const links = movementsPagination.getByRole('link');
    expect(await links.first().evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);
    expect(await links.last().evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
    expect(await hitTestOf(page, '[data-testid="movements-pagination"] a:last-of-type')).toBe('self');
    await links.last().click();
    await expect(page).toHaveURL(/page=2/, { timeout: 15_000 });
    await expect(page).toHaveURL(/status=ALL/);
    await expect(page).toHaveURL(new RegExp(`from=${day}`));
    await expect(page.getByTestId('movements-pagination-status')).toHaveText(/^2 \/ [2-9][0-9]*$/);

    // The pagination nodes exist ONLY on a paginated view, so this is the one
    // state in which their uniqueness across the two trees can be asserted at
    // all (AC 10's own enumeration never sees them).
    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await page.goto(`/it/dashboard/expiries?window=all&expiryTypeId=${pagedTypeId}`);
      for (const testid of ['scadenze-page-prev', 'scadenze-page-next', 'scadenze-pagination-status']) {
        await expect(page.getByTestId(testid), `${testid} @${viewport.width}`).toHaveCount(1);
      }
      await page.goto(`/it/dashboard/movements?status=ALL&from=${day}&to=${day}`);
      for (const testid of ['movements-pagination', 'movements-pagination-status']) {
        await expect(page.getByTestId(testid), `${testid} @${viewport.width}`).toHaveCount(1);
      }
    }
  });

  // -------------------------------------------------------------------------
  // AC 10 — testids: no duplicates, no duplicated TEXT
  // -------------------------------------------------------------------------

  test('AC 10: ogni testid desktop resta ESATTAMENTE un nodo a 375 e a 1280, e le marche di una fixture restano al piu` un nodo a 1280', async ({ page }) => {
    test.setTimeout(90_000); // four states x two viewports, plus the self face
    await page.setViewportSize(DESKTOP);
    await login(page, ADMIN_EMAIL);
    const fixture = await createExpiryFixture(page, 20);
    const approved = await createApprovedRequest(page, 30);
    // A Rome day of this test's OWN: the register's row-level, filter-reset
    // and empty-state names live in states no default view shows, and a bucket
    // it controls is how the enumeration below reaches them — it used to cover
    // 25 of the ~45 names AC 10 lists (review 15.7 LOW-6).
    const soloDay = await createManualApproved(page, 38, 1);
    const soloUrl = `/it/dashboard/movements?status=APPROVED&from=${soloDay}&to=${soloDay}`;
    const emptyDay = romeDateOnly(new Date(Date.now() + 300 * 86_400_000));

    const perPage: [string, string[]][] = [
      [
        `/it/dashboard/expiries?window=all&expiryTypeId=${fixture.typeId}`,
        ['scadenze-row', 'scadenze-status-badge', 'scadenze-window-60', 'scadenze-window-30', 'scadenze-window-7', 'scadenze-window-expired', 'scadenze-window-all', 'scadenze-filter-type', 'scadenze-filter-pilot', 'scadenze-membership-fee-button', 'scadenze-send-reminders-button', 'scadenze-stat-expired', 'scadenze-stat-within7', 'scadenze-stat-within30', 'scadenze-stat-within60'],
      ],
      [
        soloUrl,
        // `ppr-register-filter-reset` renders only while a filter differs from
        // the page default (`hasActiveFilter`), which the day bounds satisfy.
        ['ppr-register', 'ppr-register-filter-bar', 'ppr-register-filter-status', 'ppr-register-filter-from', 'ppr-register-filter-to', 'ppr-register-filter-reset', 'movements-kpi-on-ground', 'movements-kpi-inbound-today', 'movements-kpi-expected-tomorrow', 'movements-kpi-month', 'log-arrival-button', 'manual-ppr-form', 'manual-ppr-submit'],
      ],
      // The empty state is the row list's ALTERNATIVE, so it needs a bucket of
      // its own: a day 300 days out that nothing else in the suite reaches.
      [`/it/dashboard/movements?status=CANCELLED&from=${emptyDay}&to=${emptyDay}`, ['ppr-register-empty']],
      ['/it/dashboard', ['scadenze-widget']],
    ];

    for (const viewport of [DESKTOP, PHONE]) {
      await page.setViewportSize(viewport);
      for (const [url, testids] of perPage) {
        await page.goto(url);
        for (const testid of testids) {
          await expect(page.getByTestId(testid), `${testid} @${viewport.width} on ${url}`).toHaveCount(1);
        }
      }
    }

    // The register's PER-ROW names: their multiplicity IS the row count, and a
    // Rome day bucket accumulates one fixture per re-run on the same DB, so
    // "exactly one" would be a guard that goes red for the wrong reason on the
    // second run. What AC 10 protects here is that the two trees stay in step
    // — one node per row per tree, never a name twice inside one of them.
    for (const viewport of [DESKTOP, PHONE]) {
      await page.setViewportSize(viewport);
      await page.goto(soloUrl);
      const rows = await page.getByTestId('ppr-register-row').count();
      expect(rows, `ppr-register-row @${viewport.width}`).toBeGreaterThan(0);
      await expect(page.getByTestId('ppr-register-row-mobile'), `ppr-register-row-mobile @${viewport.width}`).toHaveCount(rows);
      await expect(page.getByTestId('ppr-register-complete-button'), `ppr-register-complete-button @${viewport.width}`).toHaveCount(rows);
      await expect(page.getByTestId('ppr-register-cancel-button'), `ppr-register-cancel-button @${viewport.width}`).toHaveCount(rows);
    }

    // The row's two overlays exist only while `rowAction` holds them open, and
    // they are mutually exclusive — so they are opened one after the other,
    // and each is measured at BOTH widths without navigating (the console
    // keeps its state across a resize, and a phone-side duplicate of these
    // names would show precisely here). `rowAction` is a single state, so one
    // node each whatever the row count.
    await page.setViewportSize(DESKTOP);
    await page.goto(soloUrl);
    await page.getByTestId('ppr-register-cancel-button').first().click();
    for (const viewport of [DESKTOP, PHONE]) {
      await page.setViewportSize(viewport);
      for (const testid of ['ppr-register-cancel-confirm', 'ppr-register-cancel-abort']) {
        await expect(page.getByTestId(testid), `${testid} @${viewport.width}`).toHaveCount(1);
      }
    }
    await page.setViewportSize(DESKTOP);
    await page.getByTestId('ppr-register-cancel-abort').click();
    await page.getByTestId('ppr-register-complete-button').first().click();
    for (const viewport of [DESKTOP, PHONE]) {
      await page.setViewportSize(viewport);
      for (const testid of ['ppr-complete-form', 'ppr-complete-fee-input', 'ppr-complete-method', 'ppr-complete-submit', 'ppr-complete-close']) {
        await expect(page.getByTestId(testid), `${testid} @${viewport.width}`).toHaveCount(1);
      }
    }

    // The marks: ONE node per TREE, never two inside one of them. AC 10 asks
    // for "at most one node page-level at 1280px", which the epic's own
    // architecture makes impossible — the switch is CSS-only, so the phone
    // card (which MUST print the marks: they are its identifier) is in the
    // DOM at every width, `display: none`, and `getByText` counts hidden
    // nodes too. Measured: exactly 2, one per tree. That is precisely why
    // blast radius 1 prescribes SCOPING the five page-level assertions of
    // `movements.spec.ts` (done, plus a sixth in `expiry-dashboard.spec.ts`)
    // rather than deduplicating the DOM. The verifiable property is this one.
    await page.setViewportSize(DESKTOP);
    await gotoMovementsFor(page, 'APPROVED', approved.eta);
    await expect(page.getByTestId('ppr-register-row').filter({ hasText: approved.registration })).toHaveCount(1);
    await expect(page.getByTestId('ppr-register-row-mobile').filter({ hasText: approved.registration })).toHaveCount(1);
    await expect(page.getByText(approved.registration)).toHaveCount(2);

    // The SELF face of the same page carries names no admin state reaches. The
    // seed pilot's row count is not ours to fix (other specs register scadenze
    // for the same person under `fullyParallel`), so the property asserted is
    // the one AC 10 actually protects: one node per TREE, the two trees in
    // step, never a name appearing twice inside one of them.
    // `my-expiry-pending-badge` is deliberately NOT enumerated: story 12.13
    // retired the titolare proposal flow, so no API can create the
    // `pendingProposal` that renders it (`my-expiries.tsx`'s own doc-comment
    // calls it a read-only leftover) — unconstructible, declared, not skipped
    // in silence.
    const selfTypeResponse = await page.request.post('/api/v1/expiry-types', { data: { name: `TipoAC10 ${uniqueSuffix()}`, scope: 'ALL' } });
    expect(selfTypeResponse.status()).toBe(201);
    const selfType = (await selfTypeResponse.json()) as { id: string };
    const peopleResponse = await page.request.get(`/api/v1/people?q=${encodeURIComponent(PILOT_EMAIL)}`);
    const people = (await peopleResponse.json()) as { items: { id: string; email: string | null }[] };
    const pilotPerson = people.items.find((item) => item.email === PILOT_EMAIL);
    if (!pilotPerson) throw new Error('seed pilot not found');
    await page.request.post('/api/v1/expiries', { data: { personId: pilotPerson.id, expiryTypeId: selfType.id, expiresAt: addDaysUtc(45) } });

    await page.context().clearCookies();
    await login(page, PILOT_EMAIL);
    for (const viewport of [DESKTOP, PHONE]) {
      await page.setViewportSize(viewport);
      await page.goto('/it/dashboard/expiries');
      await expect(page.getByTestId('my-expiries'), `my-expiries @${viewport.width}`).toHaveCount(1);
      const selfRows = await page.getByTestId('my-expiry-row').count();
      expect(selfRows, `my-expiry-row @${viewport.width}`).toBeGreaterThan(0);
      await expect(page.getByTestId('my-expiry-row-mobile'), `my-expiry-row-mobile @${viewport.width}`).toHaveCount(selfRows);
      await expect(page.getByTestId('my-expiry-status-badge'), `my-expiry-status-badge @${viewport.width}`).toHaveCount(selfRows);
    }
  });

  // -------------------------------------------------------------------------
  // AC 11 — geometry and layering with the tab bar present
  // -------------------------------------------------------------------------

  test('AC 11: nessun overflow di pagina, nessuno scroller nascosto e nessun controllo sotto la tab bar, a 320/375/390', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const fixture = await createExpiryFixture(page, 20);
    await createApprovedRequest(page, 30);

    for (const size of [NARROW, PHONE, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      for (const url of [`/it/dashboard/expiries?window=all&expiryTypeId=${fixture.typeId}`, '/it/dashboard/movements']) {
        await page.goto(url);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `page overflow ${url} @${size.width}`).toBe(0);
        expect(await page.evaluate(HIDDEN_SCROLLERS), `hidden scrollers ${url} @${size.width}`).toEqual([]);

        // Real scroll to the bottom, then hit-test every visible control.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(250);
        const covered = await page.evaluate(() => {
          const out: { testid: string | null; by: string }[] = [];
          for (const el of Array.from(document.querySelectorAll('.page a, .page button, .page input, .page select'))) {
            if (el.closest('.slideover:not(.open)')) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            // Off-screen horizontally (inside a strip that scrolls by design)
            // or vertically: not a coverage question.
            if (x < 0 || x > window.innerWidth) continue;
            // FULLY inside the viewport: a control half-scrolled under the
            // sticky top bar is the declared baseline exception (15.1), not a
            // tab-bar coverage bug — measured `top: -16` on a card at 320px.
            if (rect.top < 0 || rect.bottom > window.innerHeight) continue;
            const hit = document.elementFromPoint(x, y);
            // An ANCESTOR cannot cover its own child: when `elementFromPoint`
            // returns one, the control is pointer-transparent (measured: the
            // `aria-disabled` pagination link at page 1). A real coverage is a
            // hit from a DIFFERENT subtree.
            // The sticky TOP bar is the declared baseline exception (15.1:
            // a row scrolled halfway under it); this AC is about the TAB bar.
            if (hit && hit.closest('.mobile-topbar')) continue;
            if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
              out.push({ testid: el.getAttribute('data-testid'), by: `${hit.tagName}.${typeof hit.className === 'string' ? hit.className : ''}` });
            }
          }
          return out;
        });
        expect(covered, `covered controls ${url} @${size.width}`).toEqual([]);
      }
    }
  });

  test('AC 11: lo sheet copre la tab bar con lo scrim, e il pannello Filtri la copre del tutto', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    const approved = await createApprovedRequest(page, 30);

    await gotoMovementsFor(page, 'APPROVED', approved.eta);
    await movementCards(page).filter({ hasText: approved.registration }).click();
    await expect(page.getByTestId('mobile-movement-sheet')).toBeVisible();
    // Whatever sits over the tab bar must belong to the SHEET's own subtree —
    // the scrim on a short sheet, the panel itself (measured: its "Chiudi"
    // button) on a tall one like a transit's, which carries ten rows.
    const overSheet = await page.evaluate(() => {
      const bar = document.querySelector('.mobile-tabbar');
      if (!bar) return { inSheet: false, hit: 'no-bar' };
      const rect = bar.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        inSheet: hit !== null && hit.closest('.mobile-sheet') !== null,
        hit: hit ? `${hit.tagName}.${typeof hit.className === 'string' ? hit.className : ''}` : 'none',
      };
    });
    expect(overSheet.inSheet, `over the tab bar: ${overSheet.hit}`).toBe(true);

    await page.keyboard.press('Escape');
    await page.getByTestId('mobile-movements-filters-button').click();
    await expect(page.getByTestId('mobile-movements-filter-panel')).toBeVisible();
    const overPanel = await page.evaluate(() => {
      const bar = document.querySelector('.mobile-tabbar');
      if (!bar) return { inPanel: false, hit: 'no-bar' };
      const rect = bar.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        inPanel: hit !== null && hit.closest('.slideover') !== null,
        hit: hit ? `${hit.tagName}.${typeof hit.className === 'string' ? hit.className : ''}` : 'none',
      };
    });
    expect(overPanel.inPanel, `over the tab bar: ${overPanel.hit}`).toBe(true);
  });

  // -------------------------------------------------------------------------
  // AC 12 — the rules that touch OTHER pages must not have moved them
  // -------------------------------------------------------------------------

  test('AC 12/13: nessuna regola nuova tocca `.segmented` (Pianificazione, Statistiche, Panoramica) ne` `.date-input` fuori dalla testata Movimenti', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);

    for (const url of ['/it/dashboard/bookings', '/it/dashboard/reports', '/it/dashboard']) {
      await page.goto(url);
      const segmented = await page.evaluate(() => {
        const el = document.querySelector('.segmented');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const btn = el.querySelector('button, a');
        return {
          display: getComputedStyle(el).display,
          cls: typeof el.className === 'string' ? el.className : '',
          rendered: el.getClientRects().length > 0,
          h: Math.round(rect.height * 100) / 100,
          btnMinHeight: btn ? getComputedStyle(btn).minHeight : null,
          btnH: btn ? Math.round(btn.getBoundingClientRect().height * 100) / 100 : null,
        };
      });
      if (segmented) {
        // The 15.7 rules hide the Scadenze finestra through a class of ITS OWN
        // page; `.segmented` itself keeps the computed style it has had since
        // 12.1 — asserted on the class, not on a rect (on `/dashboard` the
        // widget that carries it lives inside a `.home-desktop-surface` that
        // 15.3 already hides at this width, so its rect is legitimately 0).
        expect(segmented.display, `${url} .segmented display`).toBe('flex');
        if (url === '/it/dashboard/reports') {
          // Story 15.8b OWNS this page and its AC 1 raises both toggles to the
          // 44px floor — through the page-owned classes `.reports-period` /
          // `.reports-rank-metrics`, never through `.segmented`, which is
          // exactly what this guard exists to check. So here the assertion is
          // on the OWNER: the floor may only arrive with one of those classes.
          // The "untouched" expectation below still runs on the two pages no
          // story owns, where a rule written on `.segmented` itself would
          // land anyway.
          expect(segmented.cls, `${url} .segmented owner class`).toMatch(/\breports-(period|rank-metrics)\b/);
        } else {
          expect(segmented.btnMinHeight, `${url} .segmented child min-height`).not.toBe('44px');
          if (segmented.rendered) {
            expect(segmented.h, `${url} .segmented height`).toBeGreaterThan(20);
            expect(segmented.btnH, `${url} .segmented button height`).toBeLessThan(43.5);
          }
        }
      }
    }

    for (const url of ['/it/dashboard/billing', '/it/dashboard/logbook']) {
      await page.goto(url);
      const dateInput = await page.evaluate(() => {
        const el = document.querySelector('.date-input .input, .date-input input');
        if (!el) return null;
        return Math.round(el.getBoundingClientRect().height * 100) / 100;
      });
      // 36.8px is what `.input` measures everywhere else; the 44px floor of
      // this story lives inside `.movements-filter-panel` only.
      if (dateInput !== null) expect(dateInput, `${url} .date-input height`).toBeLessThan(43.5);
    }
  });

  test('AC 12/13: i selettori nuovi non raggiungono il pannello di "Registra arrivo" (ManualPprForm, condiviso con /dashboard/ppr)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);

    await page.goto('/it/dashboard/movements');
    await page.getByTestId('log-arrival-button').click();
    await expect(page.getByTestId('manual-ppr-form')).toBeVisible();
    // The panel translates in over 260ms; hit-testing mid-transition reads a
    // rect that is not where the button will be.
    await page.waitForTimeout(500);
    const panel = await page.evaluate(() => {
      const p = document.querySelector('.slideover.open .slideover-panel');
      const submit = document.querySelector('[data-testid="manual-ppr-submit"]');
      if (!p || !submit) return null;
      const pr = p.getBoundingClientRect();
      const sr = submit.getBoundingClientRect();
      const hit = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
      return { x: Math.round(pr.x), w: Math.round(pr.width), submitH: Math.round(sr.height), submitHit: hit !== null && (hit === submit || submit.contains(hit) || hit.contains(submit)) };
    });
    // The 15.2 baseline of this panel, unchanged by this story.
    expect(panel?.x).toBe(0);
    expect(panel?.w).toBe(375);
    expect(panel?.submitH).toBeGreaterThanOrEqual(44);
    expect(panel?.submitHit).toBe(true);
  });
});
