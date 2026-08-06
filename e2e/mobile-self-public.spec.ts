import { expect, test } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';
import { ensureValidSeedExpiries } from './helpers';

/**
 * Story 15.9 — the two self-service surfaces (the shared estratto conto of
 * "Le mie transazioni" + the scheda persona, and "I miei compensi") and the
 * public `/ppr` showcase, on a phone.
 *
 * Project `chromium`, `fullyParallel`: this story writes NO `AppSettings`, so
 * it stays out of the serialized chain (`playwright.config.ts`). Two
 * consequences it respects literally: every fixture is run-unique and every
 * assertion is made on THAT fixture (never on a global aggregate), and no test
 * asserts the airfield name/ICAO by value — two chained projects rewrite them.
 *
 * Viewport is set INSIDE each test (pattern 13.10): the suite's own default is
 * 1280x720, and several tests here assert BOTH sides of the switch.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const STUDENT_EMAIL = 'student@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-self-public.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 720 };
/** The floor is 44 and the sweep threshold 43.5 — always written on the REQUIREMENT, never on the value obtained (lesson 15.7 MINOR-1). */
const TARGET_FLOOR = 43.5;

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<MailpitFullMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const searchResponse = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const searchBody = (await searchResponse.json()) as { messages: MailpitMessageSummary[] };
    const found = searchBody.messages.find((message) => message.Subject.includes(subjectIncludes));
    if (found) {
      const messageResponse = await fetch(`http://localhost:8025/api/v1/message/${found.ID}`);
      return (await messageResponse.json()) as MailpitFullMessage;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

async function setPasswordFromInvite(page: Page, email: string, password: string): Promise<void> {
  const inviteEmail = await waitForMailpitMessage(email, 'invitato');
  const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(inviteEmail.Text);
  if (!match) throw new Error(`Email body did not contain a /set-password link:\n${inviteEmail.Text}`);
  const url = new URL(match[1]);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();
}

/** A fresh pilot person + a real login (invite flow via Mailpit) — same helper as `my-account.spec.ts#createPersonWithLogin`, so every balance assertion below is about a fixture nothing else touches. */
async function createPilotWithLogin(page: Page, password: string, tag: string): Promise<{ personId: string; email: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const lastName = `${tag}-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName: 'Pilota', lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  await ensureValidSeedExpiries(page, person.id, 'PILOTS');

  const email = uniqueEmail('pilot-selfmobile');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId: person.id } });
  expect(userResponse.status()).toBe(201);
  await setPasswordFromInvite(page, email, password);
  return { personId: person.id, email, lastName };
}

async function recordTopUp(page: Page, personId: string, amountCents: number, description: string | null, effectiveDate = '2026-01-15'): Promise<string> {
  const response = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
    headers: { 'Idempotency-Key': `e2e-selfmobile-${uniqueSuffix()}` },
    data: { amountCents, paymentMethod: 'CASH', effectiveDate, description },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { recentMovements: { id: string }[] };
  return body.recentMovements[0]!.id;
}

/** A pilot person WITHOUT a login: the two linked badges live on the shared component's ADMIN face, so the invite round-trip would be dead weight. */
async function createPilotPerson(page: Page, tag: string): Promise<string> {
  const suffix = uniqueSuffix();
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName: 'Pilota', lastName: `${tag}-${suffix}` } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  await ensureValidSeedExpiries(page, person.id, 'PILOTS');
  return person.id;
}

/** The date of the storno fixture's flight: safely in the past, so its `FLIGHT_CHARGE` never lands in the current month any global aggregate is summing. */
const FLIGHT_DATE = '2020-01-01';

/**
 * The ONLY shape that produces a `FLIGHT_CHARGE_REVERSAL` (the storno badge):
 * a flight charge and its cancellation. The aircraft rate is 1 cent per HOUR
 * and the flight lasts 5 minutes, so `Math.round(1 * 5 / 60)` charges ZERO
 * cents — the fixture moves no euro at all, neither on the account balance nor
 * on the global aggregates `billing.spec.ts:296` watches (TD (h)); it adds
 * exactly the two rows this test is about.
 */
async function createReversedFlightCharge(page: Page, personId: string): Promise<void> {
  const suffix = uniqueSuffix();
  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    data: { registration: `I-BG${suffix}`.toUpperCase().slice(0, 20), type: 'Ultraleggero 3 assi', model: 'Badge Test', hourMeterMinutes: 500 },
  });
  expect(aircraftResponse.status()).toBe(201);
  const aircraft = (await aircraftResponse.json()) as { id: string };
  const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, { data: { priceCentsPerHour: 1, validFrom: FLIGHT_DATE } });
  expect(rateResponse.status()).toBe(201);

  const flightResponse = await page.request.post('/api/v1/flights', {
    data: {
      aircraftId: aircraft.id,
      personId,
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      flightType: 'TOURISM',
      takeoffAt: `${FLIGHT_DATE}T10:00:00.000Z`,
      landingAt: `${FLIGHT_DATE}T10:05:00.000Z`,
    },
  });
  expect(flightResponse.status()).toBe(201);
  const flight = (await flightResponse.json()) as { flight: { id: string } };
  const cancelResponse = await page.request.post(`/api/v1/flights/${flight.flight.id}/cancel`, { data: { reason: `Storno di prova ${suffix}` } });
  expect(cancelResponse.status()).toBe(200);
}

/** A linked rettifica on `originalMovementId` — the ADJUSTMENT badge's own fixture. */
async function recordLinkedAdjustment(page: Page, personId: string, originalMovementId: string, amountCents: number): Promise<void> {
  const response = await page.request.post(`/api/v1/people/${personId}/account/adjustments`, {
    headers: { 'Idempotency-Key': `e2e-selfmobile-${uniqueSuffix()}` },
    data: { amountCents, reason: `Rettifica collegata ${uniqueSuffix()}`, originalMovementId },
  });
  expect(response.status()).toBe(200);
}

/** The movements of the person's own account, read from the API — the ONLY honest way to check an accounting effect (never a count of rows in a paginated page). */
async function accountMovements(page: Page, personId: string): Promise<{ id: string; type: string; amountCents: number; description: string | null }[]> {
  const response = await page.request.get(`/api/v1/people/${personId}/account/movements?page=1&pageSize=100`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { items: { id: string; type: string; amountCents: number; description: string | null }[] }).items;
}

async function createInstructorWithLogin(page: Page, password: string, tag: string): Promise<{ personId: string; email: string }> {
  const suffix = uniqueSuffix();
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName: 'Istruttore', lastName: `${tag}-${suffix}` } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  expect((await page.request.put(`/api/v1/people/${person.id}/profiles/instructor`, { data: {} })).status()).toBe(200);
  await ensureValidSeedExpiries(page, person.id, 'INSTRUCTORS');

  const email = uniqueEmail('instructor-selfmobile');
  expect((await page.request.post('/api/v1/users', { data: { email, roles: ['INSTRUCTOR'], personId: person.id } })).status()).toBe(201);
  await setPasswordFromInvite(page, email, password);
  return { personId: person.id, email };
}

/** A manual, immediately-approved PPR — the only shape that OWNS a `pprNumber` (null while PENDING, null forever on REJECTED). One row per call; this spec creates 2 per run. */
async function createApprovedPpr(page: Page, tag: string): Promise<{ pprNumber: string; lastName: string; registration: string }> {
  const suffix = uniqueSuffix();
  const lastName = `${tag}-${suffix}`;
  const registration = `I-Z${suffix}`.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
  const eta = new Date(Date.now() + 40 * 86_400_000);
  eta.setUTCHours(9, 0, 0, 0);
  const response = await page.request.post('/api/v1/ppr-requests/manual', {
    data: {
      firstName: 'Transito',
      lastName,
      email: `transito-${suffix}@e2e.airmanager.local`,
      phone: '+39 333 0000000',
      aircraftRegistration: registration,
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
  const created = (await response.json()) as { pprNumber: string | null };
  expect(created.pprNumber).not.toBeNull();
  return { pprNumber: created.pprNumber!, lastName, registration };
}

/** `display` of BOTH trees — a guard that reads one side only lets "I hid everything" through. */
async function treeDisplays(page: Page, desktopSelector: string, mobileSelector: string): Promise<{ desktop: string; mobile: string }> {
  return page.evaluate(
    ([desktop, mobile]) => ({
      desktop: getComputedStyle(document.querySelector(desktop!)!).display,
      mobile: getComputedStyle(document.querySelector(mobile!)!).display,
    }),
    [desktopSelector, mobileSelector],
  );
}

/** Every visible control under 43.5px, by testid/class — the sweep is written on the REQUIREMENT. */
async function targetsUnderFloor(page: Page, root: string): Promise<string[]> {
  return page.evaluate(
    ([rootSelector, floor]) =>
      [...document.querySelectorAll(`${rootSelector} a, ${rootSelector} button, ${rootSelector} input, ${rootSelector} select, ${rootSelector} textarea`)]
        .filter((el) => el.getClientRects().length > 0)
        .filter((el) => el.getBoundingClientRect().height < (floor as number))
        .map((el) => `${el.getAttribute('data-testid') ?? String((el as HTMLElement).className)}:${el.getBoundingClientRect().height.toFixed(2)}`),
    [root, TARGET_FLOOR] as [string, number],
  );
}

/** The CANONICAL hidden-scroller sweep (the one `mobile-registries.spec.ts` runs on the scheda persona), with the exclusions this story declares. */
async function hiddenScrollers(page: Page, root: string): Promise<string[]> {
  return page.evaluate(
    (rootSelector) =>
      [...document.querySelectorAll(`${rootSelector} *`)]
        .filter(
          (el) =>
            el.scrollWidth > el.clientWidth + 1 &&
            !el.closest('.slideover') &&
            // Declared exclusion, and ONLY that one: the `/ppr` honeypot lives
            // in an off-screen 1px wrapper (`position:absolute; left:-9999px`)
            // — not a clipped control, anti-abuse machinery (AC 6 c). The
            // wrapper is matched with `:scope >`, never with a plain
            // `querySelector`: that one is true for EVERY ancestor, so it also
            // dropped `<form>`, `#formCard` and `.ppr-grid` from the sweep —
            // the containers that can actually blow out (review 15.9 MINOR-2:
            // a 2000px child injected in `#formCard` was invisible to it).
            !el.closest('[data-testid="ppr-honeypot"]') &&
            el.querySelector(':scope > [data-testid="ppr-honeypot"]') === null &&
            getComputedStyle(el).textOverflow !== 'ellipsis',
        )
        .map((el) => `${el.getAttribute('data-testid') ?? ''}|${String(el.className)}|${el.clientWidth}/${el.scrollWidth}`),
    root,
  );
}

/** AC 11's containment guard: `text-overflow: ellipsis` hides an overflow from the sweep, so every child of a card is checked against the card's own box. */
async function cardOverflows(page: Page, cardSelector: string): Promise<string[]> {
  return page.evaluate(
    (selector) =>
      [...document.querySelectorAll(selector)].flatMap((card) => {
        const cardRect = card.getBoundingClientRect();
        return [...card.querySelectorAll('*')]
          .filter((child) => child.getClientRects().length > 0)
          .filter((child) => {
            const rect = child.getBoundingClientRect();
            return rect.right > cardRect.right + 0.5 || rect.left < cardRect.left - 0.5;
          })
          .map((child) => `${String(child.className)}@${child.getBoundingClientRect().right.toFixed(2)}>${cardRect.right.toFixed(2)}`);
      }),
    cardSelector,
  );
}

/** Controls covered by something else after a real scroll to the bottom (the tab bar is the usual culprit). `aria-disabled` links are excluded WITH the reason: the app gives them `pointer-events:none`, so `elementFromPoint` returns their parent by design. */
async function coveredControlsAtBottom(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return [...document.querySelectorAll('a, button, input, select, textarea')]
      .filter((el) => el.getClientRects().length > 0 && el.getAttribute('aria-disabled') !== 'true')
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) return false;
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return !(hit === el || el.contains(hit) || (hit !== null && hit.contains(el)));
      })
      .map((el) => el.getAttribute('data-testid') ?? String(el.className));
  });
}

function movementCards(page: Page): Locator {
  return page.getByTestId('account-movement-row-mobile');
}

test.describe('Le mie transazioni — the shared estratto conto on a phone (AC 1/2/10/11)', () => {
  test('the desktop grid is display:none and a card list takes its place — and the opposite at 1280px', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'SelfMobilePilot123!';
    const pilot = await createPilotWithLogin(page, password, 'Estratto');
    await recordTopUp(page, pilot.personId, 12345, 'Ricarica con una descrizione lunga che la tabella desktop tronca');
    await recordTopUp(page, pilot.personId, 6789, null);

    await loginExpectingDashboard(page, pilot.email, password);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/my-account');
    await expect(page.getByTestId('mobile-account-list')).toBeVisible();

    // Both sides of the switch, never one (a one-sided guard passes on "I hid everything").
    expect(await treeDisplays(page, '.account-desktop-body', '.account-mobile')).toEqual({ desktop: 'none', mobile: 'block' });
    await expect(movementCards(page)).toHaveCount(2);

    // The card is ONE element: no nested interactive node to trap a reader.
    const nested = await movementCards(page)
      .first()
      .evaluate((el) => el.querySelectorAll('button,a,input,select,textarea,[tabindex]').length);
    expect(nested).toBe(0);
    const cardBox = await movementCards(page).first().boundingBox();
    expect(cardBox!.height).toBeGreaterThanOrEqual(TARGET_FLOOR);

    // Pre-fix: `.students` 281/434 with a `104px 150px 0px 120px` template —
    // the Descrizione track was literally ZERO and the amount ended at x=481
    // inside a 281px body. Nothing may be clipped now.
    expect(await hiddenScrollers(page, '.page')).toEqual([]);
    expect(await cardOverflows(page, '[data-testid="account-movement-row-mobile"]')).toEqual([]);
    expect(await coveredControlsAtBottom(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    // 320px: the narrowest phone. Nothing is cut WITHOUT an ellipsis to say so.
    await page.setViewportSize({ width: 320, height: 568 });
    const clippedWithoutEllipsis = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="account-movement-row-mobile"] *')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis')
        .map((el) => String(el.className)),
    );
    expect(clippedWithoutEllipsis).toEqual([]);

    // The desktop keeps its table, and the phone tree is gone.
    await page.setViewportSize(DESKTOP);
    expect(await treeDisplays(page, '.account-desktop-body', '.account-mobile')).toEqual({ desktop: 'flex', mobile: 'none' });
    await expect(page.getByTestId('account-movement-row')).toHaveCount(2);
    await expect(movementCards(page)).toHaveCount(2);
  });

  test('the sheet carries the full description (the 0px-wide cell) and a well-formed accessible name on a row WITHOUT description', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'SelfMobileSheet123!';
    const pilot = await createPilotWithLogin(page, password, 'Sheet');
    const longDescription = `Descrizione integrale ${uniqueSuffix()} che il desktop ellissa`;
    await recordTopUp(page, pilot.personId, 4242, longDescription);
    await recordTopUp(page, pilot.personId, 1111, null);

    await loginExpectingDashboard(page, pilot.email, password);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/my-account');

    const withDescription = movementCards(page).filter({ hasText: 'Descrizione integrale' });
    await withDescription.click();
    const sheet = page.getByTestId('mobile-account-sheet');
    await expect(sheet).toHaveCount(1);
    await expect(sheet).toContainText(longDescription);
    // Parity with the four columns of the self face: date, type (title),
    // description, amount. The self face shows NO "Registrato da".
    await expect(sheet).toContainText('Ricarica');
    await expect(sheet).toContainText('+42,42 €');
    await expect(sheet.getByText('Registrato da')).toHaveCount(0);
    // AD-8: no second overlay stacked on the sheet.
    expect(await page.evaluate(() => document.querySelectorAll('.slideover.open, .mini-modal').length)).toBe(0);
    await page.getByTestId('mobile-account-sheet-scrim').click();
    await expect(page.getByTestId('mobile-account-sheet')).toHaveCount(0);

    // The row with NO description: the accessible name must not carry an empty
    // segment (guard on a PROPERTY, never on a `split` count — lesson 15.5 F1).
    const withoutDescription = movementCards(page).filter({ hasText: '+11,11' });
    await withoutDescription.click();
    const dialogName = await page.locator('[role="dialog"]').getAttribute('aria-label');
    expect(dialogName).not.toMatch(/·\s*·/);
    expect(dialogName).not.toMatch(/·\s*—/);
    expect(dialogName).not.toMatch(/—\s*—/);
    expect(dialogName).toContain('Ricarica');
    // The desktop placeholder still exists where the desktop puts it.
    await expect(page.getByTestId('mobile-account-sheet')).toContainText('—');
  });

  test('empty states: one node per tree, DISTINCT strings, and the desktop paragraph keeps its own testid', async ({ page }) => {
    // The admin has no account of their own — the degraded face, at both widths.
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/my-account');

    await expect(page.getByTestId('account-balance')).toHaveText('Nessun conto attivo');
    await expect(page.getByTestId('account-statement-empty')).toHaveCount(1);
    await expect(page.getByTestId('mobile-account-empty')).toHaveCount(1);
    await expect(page.getByTestId('mobile-account-empty')).toBeVisible();
    await expect(page.getByTestId('account-statement-empty')).toBeHidden();
    // The phone string must NOT repeat either page-level-read string.
    await expect(page.getByTestId('mobile-account-empty')).toHaveText('Nessun movimento in questo conto.');
    await expect(page.getByText('Nessun conto attivo')).toHaveCount(1);
    await expect(page.getByText('Nessun movimento registrato.', { exact: true })).toHaveCount(1);

    // The pre-fix, simulated on the intact repo (idiom review 15.6 LOW-3,
    // four precedents in this epic): a second node WOULD be seen, so the two
    // `toHaveCount(1)` above discriminate instead of being decoration.
    await page.getByTestId('mobile-account-empty').evaluate((node) => node.parentElement?.appendChild(node.cloneNode(true)));
    await expect(page.getByTestId('mobile-account-empty')).toHaveCount(2);
    await page.getByTestId('account-statement-empty').evaluate((node) => node.parentElement?.appendChild(node.cloneNode(true)));
    await expect(page.getByTestId('account-statement-empty')).toHaveCount(2);
    await page.reload();
    await expect(page.getByTestId('mobile-account-empty')).toHaveCount(1);
    await expect(page.getByTestId('account-statement-empty')).toHaveCount(1);

    await page.setViewportSize(DESKTOP);
    await expect(page.getByTestId('account-statement-empty')).toBeVisible();
    await expect(page.getByTestId('mobile-account-empty')).toBeHidden();
    await expect(page.getByText('Nessun conto attivo')).toHaveCount(1);
    await expect(page.getByText('Nessun movimento in questo conto.', { exact: true })).toHaveCount(1);
  });

  test('pagination stays the same two links on BOTH faces, at 44px, above the tab bar (AC 7)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'SelfMobilePage123!';
    const pilot = await createPilotWithLogin(page, password, 'Pagina');
    // 21 movements = 2 pages (`ACCOUNT_PAGE_SIZE` 20) — the fixture that makes
    // "the row is on page 1" an untenable assumption.
    for (let index = 0; index < 21; index += 1) {
      await recordTopUp(page, pilot.personId, 100 + index, index === 20 ? `Ultimo movimento ${uniqueSuffix()}` : null);
    }

    // Admin face first: same component, different `statementBasePath`.
    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    await expect(page.getByTestId('account-statement-pagination-status')).toHaveText('1 / 2');
    await expect(page.getByTestId('account-statement-page-next')).toHaveAttribute('href', new RegExp(`/it/dashboard/people/${pilot.personId}\\?page=2`));
    for (const testId of ['account-statement-page-prev', 'account-statement-page-next']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box!.height, testId).toBeGreaterThanOrEqual(TARGET_FLOOR);
    }
    await page.getByTestId('account-statement-page-next').click();
    await expect(page.getByTestId('account-statement-pagination-status')).toHaveText('2 / 2');
    await expect(movementCards(page)).toHaveCount(1);
    expect(await coveredControlsAtBottom(page)).toEqual([]);

    // Self face: the pagination points at its OWN route.
    await loginExpectingDashboard(page, pilot.email, password);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/my-account');
    await expect(page.getByTestId('account-statement-page-next')).toHaveAttribute('href', /\/it\/dashboard\/my-account\?page=2/);
    await page.getByTestId('account-statement-page-next').click();
    await expect(page.getByTestId('account-statement-pagination-status')).toHaveText('2 / 2');
    await expect(movementCards(page)).toHaveCount(1);
  });

  test('ExportMenu on this surface: one node per voice, a 44px trigger, the same hrefs and a real download from inside the sheet (AC 8)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'SelfMobileExport123!';
    const pilot = await createPilotWithLogin(page, password, 'Export');
    await recordTopUp(page, pilot.personId, 999, 'Movimento da esportare');

    await loginExpectingDashboard(page, pilot.email, password);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/my-account');

    await expect(page.getByTestId('export-menu-trigger')).toHaveCount(1);
    const triggerBox = await page.getByTestId('export-menu-trigger').boundingBox();
    expect(triggerBox!.height).toBeGreaterThanOrEqual(TARGET_FLOOR);

    await page.getByTestId('export-menu-trigger').click();
    await expect(page.getByTestId('export-menu-sheet')).toHaveCount(1);
    await expect(page.getByTestId('export-menu-xls')).toHaveCount(1);
    await expect(page.getByTestId('export-menu-pdf')).toHaveCount(1);
    await expect(page.getByTestId('export-menu-xls')).toHaveAttribute(
      'href',
      new RegExp(`/api/v1/people/${pilot.personId}/account/movements\\?format=xlsx&locale=it`),
    );
    await expect(page.getByTestId('export-menu-pdf')).toHaveAttribute('href', new RegExp(`/api/v1/people/${pilot.personId}/account/pdf\\?locale=it`));
    for (const testId of ['export-menu-xls', 'export-menu-pdf']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box!.height, testId).toBeGreaterThanOrEqual(TARGET_FLOOR);
    }
    const download = page.waitForEvent('download');
    await page.getByTestId('export-menu-xls').click();
    expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  });
});

test.describe('The scheda persona face — six columns, two writes, no stacked overlay (AC 2/3)', () => {
  test('the whole statement is reachable and the row rettifica lives INSIDE the sheet, with the accounting effect read from the API', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'SelfMobileAdmin123!';
    const pilot = await createPilotWithLogin(page, password, 'Admin');
    const movementId = await recordTopUp(page, pilot.personId, 20000, `Movimento da rettificare ${uniqueSuffix()}`);
    // A movement that already HAS a linked adjustment: its row action must
    // disappear on both faces (comportamento 4).
    const alreadyCorrected = await recordTopUp(page, pilot.personId, 30000, `Movimento gia rettificato ${uniqueSuffix()}`);
    expect(
      (
        await page.request.post(`/api/v1/people/${pilot.personId}/account/adjustments`, {
          headers: { 'Idempotency-Key': `e2e-selfmobile-${uniqueSuffix()}` },
          data: { amountCents: -500, reason: `Rettifica preesistente ${uniqueSuffix()}`, originalMovementId: alreadyCorrected },
        })
      ).status(),
    ).toBe(200);

    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    expect(await treeDisplays(page, '.account-desktop-body', '.account-mobile')).toEqual({ desktop: 'none', mobile: 'block' });
    // Pre-fix: `.students` 281/802 — 521px of the row hidden, the last cell at x=849.
    expect(await hiddenScrollers(page, '.page')).toEqual([]);
    expect(await cardOverflows(page, '[data-testid="account-movement-row-mobile"]')).toEqual([]);

    // Sixth column ("Registrato da") — the parity the card cannot carry.
    const target = movementCards(page).filter({ hasText: 'Movimento da rettificare' });
    await target.click();
    const sheet = page.getByTestId('mobile-account-sheet');
    await expect(sheet).toContainText('Registrato da');
    await expect(sheet).toContainText(ADMIN_EMAIL);

    const action = page.getByTestId('mobile-account-adjust-action');
    await expect(action).toHaveCount(1);
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(TARGET_FLOOR);
    await action.click();

    // The write happens INSIDE the sheet: one form node in the page, no
    // z-50 panel stacked over the z-40 sheet (AD-8).
    await expect(page.getByTestId('account-adjustment-form')).toHaveCount(1);
    expect(await page.evaluate(() => document.querySelectorAll('.slideover.open, .mini-modal').length)).toBe(0);
    expect(await page.evaluate(() => document.querySelectorAll('.mobile-sheet').length)).toBe(1);
    for (const control of await page.locator('[data-testid="mobile-account-sheet"] .input, [data-testid="mobile-account-sheet"] .btn').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(TARGET_FLOOR);
    }

    // A non-parsable amount: an inline error and ZERO network calls (counted, never deduced).
    let adjustmentCalls = 0;
    await page.route(`**/api/v1/people/${pilot.personId}/account/adjustments`, (route) => {
      adjustmentCalls += 1;
      return route.continue();
    });
    await page.locator('[data-testid="mobile-account-sheet"] .input').first().fill('non-un-numero');
    await page.locator('[data-testid="mobile-account-sheet"] .input').nth(1).fill('Motivo');
    await page.getByTestId('account-adjustment-submit').click();
    await expect(page.getByTestId('account-adjustment-form')).toBeVisible();
    expect(adjustmentCalls).toBe(0);

    // A negative amount, with a run-unique reason: the effect is read from the
    // API, never from a count of rows in a page.
    const reason = `Rettifica dal telefono ${uniqueSuffix()}`;
    await page.locator('[data-testid="mobile-account-sheet"] .input').first().fill('-25,00');
    await page.locator('[data-testid="mobile-account-sheet"] .input').nth(1).fill(reason);
    const requestPromise = page.waitForRequest((request) => request.url().includes('/account/adjustments') && request.method() === 'POST');
    await page.getByTestId('account-adjustment-submit').click();
    const request = await requestPromise;
    expect(request.headers()['idempotency-key']).toBeTruthy();
    expect(JSON.parse(request.postData() ?? '{}')).toMatchObject({ amountCents: -2500, reason, originalMovementId: movementId });
    expect(adjustmentCalls).toBe(1);

    // The sheet closes itself and the outcome is announced in a toast (R-15.9-j).
    await expect(page.getByTestId('mobile-account-sheet')).toHaveCount(0);
    await expect(page.getByTestId('toast')).toHaveText('Rettifica registrata.');

    const movements = await accountMovements(page, pilot.personId);
    expect(movements.filter((movement) => movement.type === 'ADJUSTMENT' && movement.amountCents === -2500)).toHaveLength(1);

    // The already-corrected movement offers NO action, on the phone as on the desktop.
    await movementCards(page).filter({ hasText: 'Movimento gia rettificato' }).click();
    await expect(page.getByTestId('mobile-account-sheet')).toBeVisible();
    await expect(page.getByTestId('mobile-account-adjust-action')).toHaveCount(0);
  });

  test('both linked badges are RENDERED on the phone card — the storno included — with the desktop text and with the `linked` fallback (AC 1/3 c)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const personId = await createPilotPerson(page, 'Badge');

    // 21 movements ON PURPOSE: the statement pages at 20 and the badge text
    // DEPENDS on whether the original is on the rendered page (comportamento
    // 3, `rowById`). The oldest top-up is the only one that falls off page 1,
    // so its rettifica shows the `linked` fallback while the other one shows
    // the original's date. Every top-up is 1 cent and the flight charge is
    // ZERO, so this fixture ends at -3 cents: a NEGATIVE balance, which is
    // worth nothing to `deposits.totalCents` (TD (h)).
    const offPage = await recordTopUp(page, personId, 1, `Originale fuori pagina ${uniqueSuffix()}`);
    for (let index = 0; index < 15; index += 1) {
      await recordTopUp(page, personId, 1, null);
    }
    const onPage = await recordTopUp(page, personId, 1, `Originale in pagina ${uniqueSuffix()}`);
    await createReversedFlightCharge(page, personId);
    await recordLinkedAdjustment(page, personId, offPage, -10);
    await recordLinkedAdjustment(page, personId, onPage, -10);

    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/people/${personId}`);
    await expect(page.getByTestId('account-statement-pagination-status')).toHaveText('1 / 2');
    expect(await treeDisplays(page, '.account-desktop-body', '.account-mobile')).toEqual({ desktop: 'none', mobile: 'block' });

    // The gap this closes: `reversal-badge-mobile` was rendered by NO test at
    // any width. Both badges must sit INSIDE a card, with the desktop text.
    const reversalBadge = page.locator('[data-testid="account-movement-row-mobile"] [data-testid="reversal-badge-mobile"]');
    await expect(reversalBadge).toHaveCount(1);
    await expect(reversalBadge).toHaveText('Storno del movimento del 01/01/2020');
    await expect(page.getByTestId('reversal-badge')).toHaveText('Storno del movimento del 01/01/2020');

    const adjustmentBadges = page.locator('[data-testid="account-movement-row-mobile"] [data-testid="adjustment-badge-mobile"]');
    await expect(adjustmentBadges).toHaveCount(2);
    // One of the two originals is on page 1 and one is not: the date branch
    // AND the `linked` fallback, rendered, in the same list.
    // `allTextContents`, not `allInnerTexts`: the desktop twins below are
    // `display:none` at this width and `innerText` is rendering-dependent.
    expect((await adjustmentBadges.allTextContents()).sort()).toEqual(['Rettifica del movimento del 15/01/2026', 'Rettifica di un movimento precedente']);
    expect((await page.getByTestId('adjustment-badge').allTextContents()).sort()).toEqual([
      'Rettifica del movimento del 15/01/2026',
      'Rettifica di un movimento precedente',
    ]);

    // The badge is the longest string a 281px card carries: it must not push
    // anything out of the card, and nothing may be clipped without an ellipsis.
    expect(await cardOverflows(page, '[data-testid="account-movement-row-mobile"]')).toEqual([]);
    expect(await hiddenScrollers(page, '.page')).toEqual([]);

    // The 320px phone, where the fallback string is at its most cramped.
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(reversalBadge).toBeVisible();
    expect(await cardOverflows(page, '[data-testid="account-movement-row-mobile"]')).toEqual([]);
  });

  test('the sheet does not survive a page change (AD-3), and the rettifica form remounts when the target row changes', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'SelfMobileRemount123!';
    const pilot = await createPilotWithLogin(page, password, 'Remount');
    for (let index = 0; index < 21; index += 1) {
      await recordTopUp(page, pilot.personId, 500 + index, `Movimento ${index} ${uniqueSuffix()}`);
    }

    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    await movementCards(page).first().click();
    await expect(page.getByTestId('mobile-account-sheet')).toBeVisible();
    // `AccountSection` never remounts (neither consumer passes a `key`) — the
    // sheet has to go anyway, or it would describe a row that left the page.
    await page.goto(`/it/dashboard/people/${pilot.personId}?page=2`);
    await expect(page.getByTestId('account-statement-pagination-status')).toHaveText('2 / 2');
    await expect(page.getByTestId('mobile-account-sheet')).toHaveCount(0);

    // Remount contract of the form: react-hook-form reads defaultValues only
    // at mount, so a second target must arrive empty.
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    await movementCards(page).nth(0).click();
    await page.getByTestId('mobile-account-adjust-action').click();
    await page.locator('[data-testid="mobile-account-sheet"] .input').first().fill('42');
    await page.getByTestId('mobile-account-sheet-scrim').click();
    await expect(page.getByTestId('mobile-account-sheet')).toHaveCount(0);
    await movementCards(page).nth(1).click();
    // Opening another row must not reopen the abandoned second step.
    await expect(page.getByTestId('account-adjustment-form')).toHaveCount(0);
    await page.getByTestId('mobile-account-adjust-action').click();
    await expect(page.locator('[data-testid="mobile-account-sheet"] .input').first()).toHaveValue('');
  });

  test('a 409 from inside the sheet keeps its own distinct message, and the sheet stays open', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotWithLogin(page, 'SelfMobile409Test123!', 'Conflitto');
    const movementId = await recordTopUp(page, pilot.personId, 15000, `Movimento conteso ${uniqueSuffix()}`);

    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    const target = movementCards(page).filter({ hasText: 'Movimento conteso' });
    await expect(target).toHaveCount(1);
    await target.click();
    await page.getByTestId('mobile-account-adjust-action').click();

    // The race the 409 exists for: the linked rettifica is created by someone
    // else WHILE this sheet is open, so the submit below hits `ADJUSTMENT_
    // ALREADY_LINKED` and must show the DEDICATED message, not the generic one.
    expect(
      (
        await page.request.post(`/api/v1/people/${pilot.personId}/account/adjustments`, {
          headers: { 'Idempotency-Key': `e2e-selfmobile-${uniqueSuffix()}` },
          data: { amountCents: -100, reason: `Prima rettifica ${uniqueSuffix()}`, originalMovementId: movementId },
        })
      ).status(),
    ).toBe(200);

    await page.locator('[data-testid="mobile-account-sheet"] .input').first().fill('-5,00');
    await page.locator('[data-testid="mobile-account-sheet"] .input').nth(1).fill(`Seconda rettifica ${uniqueSuffix()}`);
    await page.getByTestId('account-adjustment-submit').click();

    const alert = page.locator('[data-testid="mobile-account-sheet"] [role="alert"]');
    await expect(alert).toHaveText('Questo movimento ha già una rettifica collegata.');
    // Review MINOR-1: this message was `fld-label` + inline `var(--bad)`, 3.96:1
    // in the light theme, ON THE PHONE. The red now comes from `.fld-error` and
    // the inline colour is GONE (`fld-label stat-tone-bad` would NOT have done
    // it: `.fld-label` is declared after `.stat-tone-bad` and wins, measured).
    await expect(alert).toHaveClass(/fld-error/);
    await expect(alert).not.toHaveAttribute('style', /color/);
    await expect(page.getByTestId('mobile-account-sheet')).toBeVisible();
    await expect(page.getByTestId('toast')).toHaveCount(0);
    // Only the ONE adjustment the API created exists — the refused submit wrote nothing.
    expect((await accountMovements(page, pilot.personId)).filter((movement) => movement.type === 'ADJUSTMENT')).toHaveLength(1);
  });

  test('the two head actions are inline riquadri with 44px controls, and a top-up from the phone posts an Idempotency-Key', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const pilot = await createPilotWithLogin(page, 'SelfMobileTopUp123!', 'Ricarica');

    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/people/${pilot.personId}`);
    for (const testId of ['account-topup-toggle', 'account-adjustment-toggle', 'export-menu-trigger']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box!.height, testId).toBeGreaterThanOrEqual(TARGET_FLOOR);
    }

    await page.getByTestId('account-topup-toggle').click();
    await expect(page.getByTestId('account-topup-form')).toHaveCount(1);
    expect(await targetsUnderFloor(page, '[data-testid="account-topup-form"]')).toEqual([]);
    // A riquadro, not an overlay: no sheet, no slideover (R-15.9-c).
    expect(await page.evaluate(() => document.querySelectorAll('.mobile-sheet, .slideover.open').length)).toBe(0);

    const description = `Ricarica dal telefono ${uniqueSuffix()}`;
    await page.locator('[data-testid="account-topup-form"] input').first().fill('30,00');
    // A PAST effective date on purpose: `billing.spec.ts:296` asserts GLOBAL
    // month deltas (TD (h)), so no fixture of this spec dates money today when
    // it can help it — the balance assertion below is unaffected.
    await page.locator('[data-testid="account-topup-form"] input').nth(1).fill('2026-01-15');
    await page.locator('[data-testid="account-topup-form"] input').last().fill(description);
    const requestPromise = page.waitForRequest((request) => request.url().includes('/account/top-ups') && request.method() === 'POST');
    await page.getByTestId('account-topup-submit').click();
    const request = await requestPromise;
    expect(request.headers()['idempotency-key']).toBeTruthy();
    await expect(page.getByTestId('account-topup-form')).toHaveCount(0);

    const movements = await accountMovements(page, pilot.personId);
    expect(movements.filter((movement) => movement.description === description)).toHaveLength(1);
    await expect(page.getByTestId('account-balance')).toHaveText('30,00 €');
  });

  test('a NEGATIVE balance keeps its red and its own rule on both faces (AC 9)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'SelfMobileNegative123!';
    const pilot = await createPilotWithLogin(page, password, 'Rosso');
    expect(
      (
        await page.request.post(`/api/v1/people/${pilot.personId}/account/adjustments`, {
          headers: { 'Idempotency-Key': `e2e-selfmobile-${uniqueSuffix()}` },
          data: { amountCents: -7500, reason: `Saldo in rosso ${uniqueSuffix()}`, originalMovementId: null },
        })
      ).status(),
    ).toBe(200);

    await loginExpectingDashboard(page, pilot.email, password);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/my-account');
    await expect(page.getByTestId('account-balance')).toHaveText('-75,00 €');
    // The red arrives from the class, not from an inline style an audit cannot see.
    await expect(page.getByTestId('account-balance')).toHaveClass(/stat-tone-bad/);
    // The inline colour is GONE, not merely overridden: an inline style beats
    // any class rule, so leaving it would have made the fix invisible.
    await expect(page.getByTestId('account-balance')).not.toHaveAttribute('style');
  });
});

test.describe('I miei compensi on a phone (AC 4/5)', () => {
  test('the payout table becomes a card list carrying all four columns, and the five KPIs are 2x2 + 1', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'SelfMobileComp123!';
    const instructor = await createInstructorWithLogin(page, password, 'Compensi');
    expect((await page.request.put(`/api/v1/instructor-compensation/${instructor.personId}/rate`, { data: { payoutRateCents: 4500 } })).status()).toBe(200);
    expect(
      (
        await page.request.post('/api/v1/instructor-payouts', {
          headers: { 'Idempotency-Key': `e2e-selfmobile-${uniqueSuffix()}` },
          data: { instructorPersonId: instructor.personId, amountCents: 123450, periodStart: '2020-01-15', periodEnd: '2020-01-31', method: 'BANK_TRANSFER', notes: null },
        })
      ).status(),
    ).toBe(201);

    await loginExpectingDashboard(page, instructor.email, password);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/my-compensation');

    expect(await treeDisplays(page, '.compensation-desktop-body', '.compensation-mobile')).toEqual({ desktop: 'none', mobile: 'block' });
    const card = page.getByTestId('my-compensation-payout-row-mobile');
    await expect(card).toHaveCount(1);
    // All four desktop columns: registration date+time, period, method, amount.
    await expect(card).toContainText('15/01/2020');
    await expect(card).toContainText('31/01/2020');
    await expect(card).toContainText('Bonifico');
    await expect(card).toContainText('1.234,50 €');
    expect(await hiddenScrollers(page, '.page')).toEqual([]);
    expect(await cardOverflows(page, '[data-testid="my-compensation-payout-row-mobile"]')).toEqual([]);
    expect(await coveredControlsAtBottom(page)).toEqual([]);

    // The KPI strip becomes a 2-column grid with the fifth card spanning, so
    // Maturato and Dovuto (ratifica 14.7 F4) sit on the SAME row.
    const kpiGeometry = await page.evaluate(() => {
      const row = document.querySelector('[data-testid="my-compensation-kpis"]')!;
      const rect = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      return {
        display: getComputedStyle(row).display,
        tracks: getComputedStyle(row).gridTemplateColumns.split(' ').length,
        scrolls: row.scrollWidth > row.clientWidth + 1,
        grossTop: Math.round(rect('kpi-gross-mtd').top),
        owedTop: Math.round(rect('kpi-owed-mtd').top),
        totalWidth: Math.round(rect('kpi-owed-total').width),
        rowWidth: Math.round(row.getBoundingClientRect().width),
      };
    });
    expect(kpiGeometry.display).toBe('grid');
    expect(kpiGeometry.tracks).toBe(2);
    expect(kpiGeometry.scrolls).toBe(false);
    expect(kpiGeometry.grossTop).toBe(kpiGeometry.owedTop);
    expect(kpiGeometry.totalWidth).toBe(kpiGeometry.rowWidth);
    for (const id of ['kpi-rate', 'kpi-hours-mtd', 'kpi-gross-mtd', 'kpi-owed-mtd', 'kpi-owed-total']) {
      await expect(page.getByTestId(id)).toHaveCount(1);
    }

    // The desktop keeps its five-column grid and its table.
    await page.setViewportSize(DESKTOP);
    expect(await treeDisplays(page, '.compensation-desktop-body', '.compensation-mobile')).toEqual({ desktop: 'flex', mobile: 'none' });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="my-compensation-kpis"]')!).gridTemplateColumns.split(' ').length)).toBe(5);
    await expect(page.getByTestId('my-compensation-payout-row')).toHaveCount(1);
    await expect(card).toHaveCount(1);
  });

  test('the two empty faces stay one node each, at both widths', async ({ page }) => {
    // A pilot has no instructor profile at all — the "nessun profilo" face.
    await loginExpectingDashboard(page, PILOT_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/my-compensation');
    await expect(page.getByTestId('my-compensation-empty')).toHaveCount(1);
    await expect(page.getByTestId('my-compensation-kpis')).toHaveCount(0);
    await expect(page.getByTestId('my-compensation-payout-row-mobile')).toHaveCount(0);
    await expect(page.getByText('Nessun profilo istruttore attivo.')).toHaveCount(1);
    // Same pre-fix simulation as the estratto conto's empties above.
    await page.getByTestId('my-compensation-empty').evaluate((node) => node.parentElement?.appendChild(node.cloneNode(true)));
    await expect(page.getByTestId('my-compensation-empty')).toHaveCount(2);

    // A FRESH instructor with a profile and no payout at all — never the
    // seeded one, whose history other specs write to (fullyParallel).
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'SelfMobileNoPayout123!';
    const instructor = await createInstructorWithLogin(page, password, 'SenzaPagamenti');
    await loginExpectingDashboard(page, instructor.email, password);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/my-compensation');
    await expect(page.getByTestId('my-compensation-kpis')).toHaveCount(1);
    // The empty is ONE paragraph shared by both trees: the phone tree exists
    // only when there is something to list.
    await expect(page.getByTestId('my-compensation-payouts-empty')).toHaveCount(1);
    await expect(page.getByTestId('my-compensation-payouts-empty')).toBeVisible();
    await expect(page.getByTestId('mobile-compensation-list')).toHaveCount(0);
    await expect(page.getByText('Nessun pagamento registrato.')).toHaveCount(1);
    await page.getByTestId('my-compensation-payouts-empty').evaluate((node) => node.parentElement?.appendChild(node.cloneNode(true)));
    await expect(page.getByTestId('my-compensation-payouts-empty')).toHaveCount(2);
    await page.reload();
    await expect(page.getByTestId('my-compensation-payouts-empty')).toHaveCount(1);

    await page.setViewportSize(DESKTOP);
    await expect(page.getByTestId('my-compensation-payouts-empty')).toHaveCount(1);
    await expect(page.getByText('Nessun pagamento registrato.')).toHaveCount(1);
  });
});

test.describe('Multi-actor (AC 14)', () => {
  test('admin, pilot, student and instructor each see their own face of the two self pages, at 375 and 1280', async ({ page }) => {
    for (const email of [ADMIN_EMAIL, PILOT_EMAIL, STUDENT_EMAIL, INSTRUCTOR_EMAIL]) {
      await loginExpectingDashboard(page, email);
      for (const viewport of [PHONE, DESKTOP]) {
        await page.setViewportSize(viewport);

        // Both pages are universally reachable (`self.read`): no redirect, ever.
        await page.goto('/it/dashboard/my-account');
        await expect(page.getByTestId('account-section'), email).toHaveCount(1);
        await expect(page.getByTestId('account-balance'), email).toHaveCount(1);
        await expect(page.getByTestId('mobile-account-list'), email).toHaveCount(1);
        // The self face never offers a write, whoever is looking at it.
        await expect(page.getByTestId('account-topup-toggle'), email).toHaveCount(0);
        await expect(page.getByTestId('account-adjustment-toggle'), email).toHaveCount(0);
        await expect(page.getByTestId('mobile-account-adjust-action'), email).toHaveCount(0);

        await page.goto('/it/dashboard/my-compensation');
        const hasProfile = (await page.getByTestId('my-compensation-kpis').count()) > 0;
        expect(hasProfile, `${email} instructor profile`).toBe(email === INSTRUCTOR_EMAIL);
        await expect(page.getByTestId('my-compensation-empty'), email).toHaveCount(hasProfile ? 0 : 1);
      }
    }
  });
});

test.describe('The public /ppr showcase on a phone (AC 6)', () => {
  /** A fresh context with a run-unique fake `x-forwarded-for`: the rate limit is DB-backed and the DB is not reset between runs. */
  async function newPublicContext(browser: Browser, viewport = PHONE): Promise<{ page: Page; close: () => Promise<void> }> {
    const context = await browser.newContext({
      viewport,
      extraHTTPHeaders: { 'x-forwarded-for': `e2e-selfmobile-${uniqueSuffix()}` },
      timezoneId: 'UTC',
    });
    return { page: await context.newPage(), close: () => context.close() };
  }

  test('every field and the submit are real targets, the page never scrolls sideways, and the only clipped node is the declared honeypot', async ({ browser }) => {
    const { page, close } = await newPublicContext(browser);
    try {
      for (const width of [320, 375, 390]) {
        await page.setViewportSize({ width, height: 812 });
        await page.goto('/it/ppr');
        await expect(page.getByTestId('ppr-form')).toBeVisible();

        // Pre-fix at 375: 9 `input.input` at 36.84, 2 datetime-local at 38.84,
        // 2 calendar triggers at 24x24 — 12 fields out of 12 under the floor.
        // The honeypot (18x198, off-screen by design) is the ONE declared
        // exclusion, named here rather than filtered silently.
        const underFloor = (await targetsUnderFloor(page, '.ppr-page')).filter((entry) => !entry.startsWith('ppr-honeypot:'));
        expect(underFloor, `width ${width}`).toEqual([]);

        // The submit measures 64.59px at 375 only because its Italian label
        // wraps; the guard is on the requirement, and on it being full width.
        const submitBox = await page.getByTestId('ppr-submit').boundingBox();
        expect(submitBox!.height).toBeGreaterThanOrEqual(TARGET_FLOOR);
        const actionsBox = await page.locator('.ppr-actions').boundingBox();
        expect(Math.round(submitBox!.width)).toBe(Math.round(actionsBox!.width));

        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `width ${width}`).toBe(0);
        expect(await hiddenScrollers(page, '.ppr-page'), `width ${width}`).toEqual([]);
        expect(await coveredControlsAtBottom(page), `width ${width}`).toEqual([]);
      }
    } finally {
      await close();
    }
  });

  test('the IT/EN switch is visible and tappable at EVERY width, and it really switches the page', async ({ browser }) => {
    const { page, close } = await newPublicContext(browser);
    try {
      // Pre-fix: `.ppr-top-right{display:none}` under 820px gave the link a
      // 0x0 rect at 320/375/390/641/800 — "the link exists in the DOM" would
      // have passed on the defect, so the guard is on the RECT.
      for (const width of [320, 375, 390, 641, 800, 1280]) {
        await page.setViewportSize({ width, height: 812 });
        await page.goto('/it/ppr');
        const link = page.getByTestId('ppr-locale-switch');
        await expect(link, `width ${width}`).toBeVisible();
        const box = await link.boundingBox();
        expect(box!.width, `width ${width}`).toBeGreaterThan(0);
        expect(box!.height, `width ${width}`).toBeGreaterThanOrEqual(TARGET_FLOOR);
      }

      await page.setViewportSize(PHONE);
      await page.goto('/it/ppr');
      await page.getByTestId('ppr-locale-switch').click();
      await expect(page).toHaveURL(/\/en\/ppr$/);
      await expect(page.getByTestId('ppr-locale-switch')).toHaveText('Italiano');
      await expect(page.getByLabel('Registration', { exact: true })).toBeVisible();
    } finally {
      await close();
    }
  });

  test('the flow is unchanged on a phone: an empty submit marks every field without a single request, and a real submit reaches the success view', async ({ browser }) => {
    const { page, close } = await newPublicContext(browser);
    try {
      await page.goto('/it/ppr');
      let calls = 0;
      await page.route('**/api/v1/ppr-requests', (route) => {
        calls += 1;
        return route.continue();
      });

      await page.getByTestId('ppr-submit').click();
      await expect(page.locator('.fld-error').first()).toBeVisible();
      expect(await page.locator('.fld-error').count()).toBe(10);
      expect(calls).toBe(0);
      await expect(page.getByTestId('ppr-form-error')).toHaveCount(0);

      const suffix = uniqueSuffix();
      const eta = new Date(Date.now() + 26 * 3_600_000);
      const etaLocal = `${eta.toISOString().slice(0, 10)}T09:00`;
      await page.getByLabel('Nome', { exact: true }).fill('Mobile');
      await page.getByLabel('Cognome', { exact: true }).fill(`Telefono-${suffix}`);
      await page.getByLabel('Email', { exact: true }).fill(`mobile-${suffix}@e2e.airmanager.local`);
      await page.getByLabel('Telefono', { exact: true }).fill('+39 333 1112223');
      await page.getByLabel('Marche', { exact: true }).fill('I-MOBI');
      await page.getByLabel('Tipo aeromobile', { exact: true }).fill('Tecnam P92');
      await page.getByLabel('Provenienza', { exact: true }).fill('LIRU Urbe');
      await page.getByLabel('Destinazione', { exact: true }).fill('LIMB Bresso');
      await page.getByLabel('ETA (arrivo previsto)', { exact: true }).fill(etaLocal);
      await page.getByLabel('Persone a bordo', { exact: true }).fill('2');
      await page.getByTestId('ppr-submit').click();

      await expect(page.getByTestId('ppr-success')).toBeVisible();
      expect(calls).toBe(1);
      // D13: the success view never carries a PPR number.
      await expect(page.getByTestId('ppr-success')).not.toContainText('PPR-');
      const successBox = await page.getByTestId('ppr-success-again').boundingBox();
      expect(successBox!.height).toBeGreaterThanOrEqual(TARGET_FLOOR);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await page.getByTestId('ppr-success-again').click();
      await expect(page.getByTestId('ppr-form')).toBeVisible();
      await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('');
    } finally {
      await close();
    }
  });

  test('the calendar trigger is a real target and its popover stays inside the viewport', async ({ browser }) => {
    const { page, close } = await newPublicContext(browser);
    try {
      await page.goto('/it/ppr');
      const trigger = page.locator('.ppr-form-grid .date-input-btn').first();
      const box = await trigger.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(TARGET_FLOOR);
      expect(box!.width).toBeGreaterThanOrEqual(TARGET_FLOOR);
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await expect(page.locator('.cal-popover')).toBeVisible();
      const popover = await page.evaluate(() => {
        const rect = document.querySelector('.cal-popover')!.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
      expect(popover.left).toBeGreaterThanOrEqual(0);
      expect(popover.right).toBeLessThanOrEqual(375);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    } finally {
      await close();
    }
  });

  test('a session does not change the public page (it is outside the shell: no tab bar, no top bar)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE);
    await page.goto('/it/ppr');
    await expect(page.getByTestId('ppr-form')).toBeVisible();
    await expect(page.getByTestId('mobile-tab-bar')).toHaveCount(0);
    await expect(page.locator('.mobile-topbar')).toHaveCount(0);
    await expect(page.getByTestId('ppr-locale-switch')).toBeVisible();
    expect((await page.getByTestId('ppr-locale-switch').boundingBox())!.height).toBeGreaterThanOrEqual(TARGET_FLOOR);
  });
});

test.describe('PPR queue <-> Transiti deep link (AC 15, R-15.9-h)', () => {
  test('the sheet of a numbered request links to the register filtered on THAT number, and an unknown number lands on the empty state', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const mine = await createApprovedPpr(page, 'Deeplink');
    const other = await createApprovedPpr(page, 'Altro');

    // The queue is FIFO (`createdAt asc`) and pages at 20: a row created NOW
    // is on the LAST page, never on page 1 (lesson 15.7 — no test of this
    // suite may assume "my row is on page 1"). The page number comes from the
    // API's own total, not from a guess.
    const approved = await page.request.get('/api/v1/ppr-requests?status=APPROVED&page=1&pageSize=1');
    expect(approved.status()).toBe(200);
    const lastQueuePage = Math.max(1, Math.ceil(((await approved.json()) as { total: number }).total / 20));

    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/ppr?status=APPROVED&page=${lastQueuePage}`);
    const card = page.getByTestId('ppr-row-mobile').filter({ hasText: mine.lastName });
    await expect(card).toHaveCount(1);
    await card.click();

    const link = page.getByTestId('ppr-view-in-movements-mobile');
    await expect(link).toHaveCount(1);
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(TARGET_FLOOR);
    await expect(link).toHaveAttribute('href', new RegExp(`pprNumber=${mine.pprNumber}`));
    await link.click();

    await expect(page).toHaveURL(new RegExp(`pprNumber=${mine.pprNumber}`));
    const rows = page.getByTestId('ppr-register-row-mobile');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(mine.registration);
    await expect(page.locator('body')).not.toContainText(other.lastName);

    // A well-formed but unknown number: an empty register, never an error.
    await page.goto('/it/dashboard/movements?status=ALL&pprNumber=PPR-1999-9999');
    await expect(page.getByTestId('ppr-register-row-mobile')).toHaveCount(0);
    await expect(page.getByTestId('mobile-movements-empty')).toBeVisible();
  });

  test('a PENDING request offers no link (it owns no number), and a malformed number is a 422 on the API', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const suffix = uniqueSuffix();
    const eta = new Date(Date.now() + 30 * 86_400_000);
    eta.setUTCHours(10, 0, 0, 0);
    const pending = await page.request.post('/api/v1/ppr-requests/manual', {
      data: {
        firstName: 'Attesa',
        lastName: `Pending-${suffix}`,
        email: `pending-${suffix}@e2e.airmanager.local`,
        phone: '+39 333 0000000',
        aircraftRegistration: `I-P${suffix}`.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20),
        aircraftType: 'Tecnam P92',
        origin: 'LIRU Urbe',
        destination: 'LIMB Bresso',
        eta: eta.toISOString(),
        personsOnBoard: 1,
        locale: 'it',
      },
    });
    expect(pending.status()).toBe(201);
    expect(((await pending.json()) as { pprNumber: string | null }).pprNumber).toBeNull();

    // Same FIFO pagination as above: the row just created is on the LAST page.
    const pendingList = await page.request.get('/api/v1/ppr-requests?status=PENDING&page=1&pageSize=1');
    const lastQueuePage = Math.max(1, Math.ceil(((await pendingList.json()) as { total: number }).total / 20));

    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/ppr?page=${lastQueuePage}`);
    const card = page.getByTestId('ppr-row-mobile').filter({ hasText: `Pending-${suffix}` });
    await expect(card).toHaveCount(1);
    await card.click();
    await expect(page.getByTestId('mobile-ppr-sheet')).toBeVisible();
    await expect(page.getByTestId('ppr-view-in-movements-mobile')).toHaveCount(0);
    await expect(page.getByTestId('ppr-approve-button-mobile')).toHaveCount(1);

    // The filter is validated, not swallowed: a malformed value is a 422.
    const malformed = await page.request.get('/api/v1/ppr-requests?status=ALL&pprNumber=NOT-A-NUMBER');
    expect(malformed.status()).toBe(422);
    const wellFormed = await page.request.get('/api/v1/ppr-requests?status=ALL&pprNumber=PPR-1999-9999');
    expect(wellFormed.status()).toBe(200);
    expect(((await wellFormed.json()) as { total: number }).total).toBe(0);
  });
});
