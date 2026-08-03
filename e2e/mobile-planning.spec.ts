import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Story 15.4 — the phone faces of `/dashboard/bookings`: the agenda of "Voli
 * di oggi" with the ORA marker, the tail chips, the week as a list of seven
 * days, the bookings as cards with a decision sheet, the status filter, and
 * the two booking panels at full screen.
 *
 * Each test is the guard of ONE rule introduced for a MEASURED defect (AC 11)
 * and is written on the side the rule LIBERATES, never on "the new thing
 * exists" (lesson 15.2's blind guard, 15.3 F8's prefix assertion): the week
 * test asserts all seven days reachable WITHOUT scrolling, the panel test
 * asserts the submit hit-testable with the body at the top, the swap tests
 * assert BOTH sides (desktop `none` + mobile visible here, the inverse at
 * 1280px).
 *
 * Isolation (non-negotiable, lesson 12.11 F1 / review Billing-2 F4): every
 * test builds its OWN aircraft/person/bookings and asserts only on those,
 * filtered by a run-unique registration or surname. No global count is ever
 * asserted with an equality. Nothing here writes AppSettings, so the file
 * stays in the `fullyParallel` project — the ONE assertion that needs a narrow
 * booking window (the `BOOKING_OUTSIDE_WINDOW` message of R-15.4-g) lives in
 * `booking-window.spec.ts`, inside the serialized chain.
 *
 * Viewports are set with `setViewportSize` inside the test (pattern 13.10, epic
 * decision: no duplicated Playwright project).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const INSTRUCTOR_EMAIL = 'instructor@airmanager.local';
const STUDENT_EMAIL = 'student@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-planning.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 } as const;
const PHONE_WIDE = { width: 390, height: 844 } as const;
const PHONE_SHORT = { width: 375, height: 560 } as const;
const DESKTOP = { width: 1280, height: 900 } as const;

/** Every desktop testid of this page that the epic's convention pins to exactly ONE node (AC 9). */
const DESKTOP_TESTIDS = [
  'schedule-section',
  'calendar-heading',
  'calendar-prev',
  'calendar-next',
  'schedule-date-pick',
  'schedule-filter-toggle',
  'calendar-view-day',
  'calendar-view-week',
  'bookings-list-section',
  'bookings-pending-summary',
  'new-booking-button',
];

async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

async function createAircraft(page: Page, tag: string): Promise<{ id: string; registration: string }> {
  const registration = `I-P${tag}${uniqueSuffix()}`.slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Mobile 15.4', hourMeterMinutes: 60 },
  });
  expect(response.status(), await response.text()).toBe(201);
  return { id: ((await response.json()) as { id: string }).id, registration };
}

/** The password this file gives the login users it creates (the seed actors keep `SEED_ADMIN_PASSWORD`). */
const OWN_PILOT_PASSWORD = 'Aviosuperficie15.4!';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix().toLowerCase()}@airmanager.local`;
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string };

/** Same Mailpit-polling helper as the other e2e specs (file-local by convention here). */
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

function extractSetPasswordUrl(emailText: string): URL {
  const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(emailText);
  if (!match) throw new Error(`Email body did not contain a /set-password link:\n${emailText}`);
  return new URL(match[1]!);
}

async function createPilot(page: Page, tag: string): Promise<{ id: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const lastName = `Plan${tag}${suffix}`;
  const response = await page.request.post('/api/v1/people', { data: { firstName: 'Pilota', lastName } });
  expect(response.status()).toBe(201);
  const person = (await response.json()) as { id: string };
  const profile = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profile.status()).toBe(200);
  return { id: person.id, lastName };
}

/**
 * A pilot of this test's OWN, with a login (invite flow through Mailpit, the
 * same one every other spec uses).
 *
 * Review 15.4 F4: the CTA case used to DEACTIVATE the seed pilot's profile from
 * this `fullyParallel` project, while `bookings.spec.ts` clicks
 * `new-booking-button` as that very pilot in four places — and story 15.4 made
 * that button VANISH while the profile is inactive (it used to stay and answer
 * 403 on submit). Any worker entering that window got a click timeout on a spec
 * this story does not touch. A private actor removes the shared state entirely.
 */
async function createPilotWithLogin(page: Page, tag: string): Promise<{ personId: string; email: string; lastName: string }> {
  const pilot = await createPilot(page, tag);
  const email = uniqueEmail('plan-pilot');
  const userResponse = await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId: pilot.id } });
  expect(userResponse.status(), await userResponse.text()).toBe(201);

  const invite = await waitForMailpitMessage(email, 'invitato');
  const url = extractSetPasswordUrl(invite.Text);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(OWN_PILOT_PASSWORD);
  await page.getByLabel('Conferma password').fill(OWN_PILOT_PASSWORD);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();

  return { personId: pilot.id, email, lastName: pilot.lastName };
}

/**
 * An interval expressed as MINUTES from now — the only anchor a fixture that
 * has to be "today" may use.
 *
 * Review 15.4 F1: the first version of this file created its today-fixtures at
 * a FIXED UTC hour of the current day (`todaySlotUtc(10)`), which is in the
 * PAST for every run started after that hour — `createBooking` answers 422
 * `BOOKING_IN_PAST` for everybody, staff included, and two tests were red from
 * 12:00 Rome onwards (four across the day).
 *
 * Offsets stay inside ±20 minutes, which is what makes the fixtures hour-proof:
 * a movement that must be "today" cannot be more than a day-boundary away from
 * now, so the only unusable band left is 23:40-00:20 Rome (a "completed today"
 * movement does not exist at 00:05, whatever the fixture does), and the whole
 * set still fits inside a 07:00-21:00 opening window if another spec left one
 * configured. The margins are minutes, not seconds: the in-progress fixture
 * straddles now by ±8 minutes, so a slow page load can never turn it into a
 * completed one.
 */
function slotAroundNow(startOffsetMinutes: number, endOffsetMinutes: number): { startsAt: string; endsAt: string } {
  const now = Date.now();
  return {
    startsAt: new Date(now + startOffsetMinutes * 60_000).toISOString(),
    endsAt: new Date(now + endOffsetMinutes * 60_000).toISOString(),
  };
}

async function createBooking(page: Page, aircraftId: string, personId: string, slot: { startsAt: string; endsAt: string }): Promise<string> {
  const response = await page.request.post('/api/v1/bookings', { data: { aircraftId, personId, ...slot } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { booking: { id: string } }).booking.id;
}

/**
 * A booking straddling NOW cannot be CREATED (`createBooking` rejects
 * `startsAt <= now` for everybody). Staff IS exempt on UPDATE (`updateBooking`'s
 * documented asymmetry), so the fixture is created in the future and moved onto
 * the wanted instants — no sleep, nothing hanging off the wall clock.
 */
async function moveBooking(page: Page, id: string, startsAtMs: number, endsAtMs: number): Promise<void> {
  const response = await page.request.patch(`/api/v1/bookings/${id}`, {
    data: { startsAt: new Date(startsAtMs).toISOString(), endsAt: new Date(endsAtMs).toISOString() },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/**
 * A fixture that must sit in the PAST (or straddle now): created on a FUTURE,
 * in-window slot and then moved onto the wanted instants with the staff-only
 * PATCH exemption above.
 *
 * The staging slot is tomorrow at `stagingHourUtc` — 08:00-10:00Z is
 * 09:00-12:00 Rome in either DST regime, i.e. inside the 07:00-21:00 window
 * another spec may have left globally configured (`reports.spec.ts`'s
 * un-restored PUT, TD in sprint-status) — and one whole hour per fixture keeps
 * the bookings of the SAME aircraft from overlapping each other while they wait
 * there. `stagingHourUtc` is a parking spot, nothing in any assertion depends
 * on it.
 */
async function createStagedBooking(
  page: Page,
  aircraftId: string,
  personId: string,
  stagingHourUtc: number,
  startsAtMs: number,
  endsAtMs: number,
): Promise<string> {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const hour = String(stagingHourUtc).padStart(2, '0');
  const id = await createBooking(page, aircraftId, personId, {
    startsAt: `${tomorrow}T${hour}:00:00.000Z`,
    endsAt: `${tomorrow}T${hour}:45:00.000Z`,
  });
  await moveBooking(page, id, startsAtMs, endsAtMs);
  return id;
}

/**
 * Walks the phone list forward from page 1 until the card matching `text`
 * appears — the mobile twin of `bookings.spec.ts#findBookingRow`, and for the
 * same measured reason: the list is `startsAt asc` from now-48h, 20 per page,
 * and on this never-reset dev DB a fixture's page number depends on how many
 * OTHER bookings outrank it. Assuming page 1 fails deterministically (it did,
 * on the first run of this file).
 */
async function findMobileCard(page: Page, text: string, query = ''): Promise<ReturnType<Page['getByTestId']>> {
  const MAX_PAGES = 50;
  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const suffix = `${query ? `${query}&` : ''}page=${pageNumber}`;
    await page.goto(`/it/dashboard/bookings?${suffix}`);
    const card = page.getByTestId('booking-row-mobile').filter({ hasText: text });
    if ((await card.count()) > 0) return card;
    const status = await page.getByTestId('booking-pagination-status').count();
    if (status === 0) break;
    const [current, total] = (await page.getByTestId('booking-pagination-status').innerText()).split('/').map((part) => Number(part.trim()));
    if (!Number.isFinite(total) || current >= total) break;
  }
  throw new Error(`No mobile booking card matching "${text}" in the first ${MAX_PAGES} pages`);
}

/**
 * The booking's CURRENT status straight from the API, looked up inside the
 * run-unique aircraft's own rows — never "the card now has N rows" (lesson
 * 12.11 F1: a shared DB with concurrent writers makes any global count flaky).
 * There is no `GET /api/v1/bookings/{id}`; the list filtered by `aircraftId`
 * is the narrowest read available.
 */
async function statusOf(page: Page, aircraftId: string, bookingId: string): Promise<{ status: string; denyReason: string | null }> {
  // EVERY status, explicitly: `listBookings` defaults to APPROVED-only when
  // `?status` is absent (`bookings.service.ts`), which would hide exactly the
  // DENIED/CANCELLED outcomes these assertions are about.
  const allStatuses = 'PENDING,APPROVED,DENIED,FLOWN,NO_SHOW,CANCELLED';
  const response = await page.request.get(`/api/v1/bookings?aircraftId=${aircraftId}&status=${allStatuses}&pageSize=100`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: Array<{ id: string; status: string; denyReason: string | null }> };
  const found = body.items.find((item) => item.id === bookingId);
  if (!found) throw new Error(`booking ${bookingId} not found among the ${body.items.length} rows of aircraft ${aircraftId}`);
  return { status: found.status, denyReason: found.denyReason };
}

test.describe('story 15.4 — pianificazione mobile', () => {
  test('day view at 375px: the desktop timeline is GONE and the agenda carries the three phases in time order, AOG first', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'AG');
    const grounded = await createAircraft(page, 'AO');
    const pilot = await createPilot(page, 'AG');

    // Three movements on the SAME day: one already over, one straddling now,
    // one still ahead — the three phases `dayPhaseOf` distinguishes. All three
    // within ±45 minutes of now (review 15.4 F1: the fixture must be TODAY at
    // whatever hour the suite happens to start), staged on distinct hours of
    // tomorrow so they never overlap each other on the way in.
    const now = Date.now();
    await createStagedBooking(page, aircraft.id, pilot.id, 8, now - 20 * 60_000, now - 12 * 60_000);
    await createStagedBooking(page, aircraft.id, pilot.id, 9, now - 8 * 60_000, now + 8 * 60_000);
    await createStagedBooking(page, aircraft.id, pilot.id, 10, now + 12 * 60_000, now + 20 * 60_000);

    const aog = await page.request.post(`/api/v1/aircraft/${grounded.id}/out-of-service`, { data: { reason: `Revisione ${uniqueSuffix()}` } });
    expect(aog.status()).toBe(200);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/bookings');

    // BOTH sides of the swap (a one-sided assert would pass on "I hid it all").
    await expect(page.locator('.schedule')).toBeHidden();
    await expect(page.getByTestId('mobile-agenda')).toBeVisible();

    // Only this run's rows are inspected: the shared DB has concurrent writers.
    const ownRows = page.getByTestId('mobile-agenda-row').filter({ hasText: pilot.lastName });
    await expect(ownRows).toHaveCount(3);
    const phases = await ownRows.evaluateAll((nodes) => nodes.map((node) => node.querySelector('.badge')?.textContent?.trim() ?? ''));
    // WHOLE order, not a prefix (lesson 15.3 F8).
    expect(phases).toEqual(['completato', 'in corso', 'in programma']);

    // The AOG row is in the HEAD of the agenda (ratifica R-15.4-h): its index
    // among ALL rows is smaller than any movement's.
    const positions = await page.getByTestId('mobile-agenda-row').evaluateAll(
      (nodes, [reg, surname]) => ({
        aog: nodes.findIndex((node) => node.textContent?.includes(reg)),
        firstMovement: nodes.findIndex((node) => node.textContent?.includes(surname)),
      }),
      [grounded.registration, pilot.lastName],
    );
    expect(positions.aog).toBeGreaterThanOrEqual(0);
    expect(positions.aog).toBeLessThan(positions.firstMovement);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('the ORA marker exists once, sits before the first future movement, and disappears on a day that is not today', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'NW');
    const pilot = await createPilot(page, 'NW');

    // One movement behind now, one ahead: the marker belongs between them.
    // Only the past one needs staging — a future slot is creatable directly.
    const now = Date.now();
    await createStagedBooking(page, aircraft.id, pilot.id, 8, now - 20 * 60_000, now - 12 * 60_000);
    await createBooking(page, aircraft.id, pilot.id, slotAroundNow(12, 20));

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/bookings');
    // Filtered to this run's aircraft, so the marker's neighbours are ours.
    await page.getByTestId(`mobile-tail-chip-${aircraft.id}`).click();

    const marker = page.getByTestId('mobile-agenda-now');
    await expect(marker).toHaveCount(1);
    // `\b`-anchored, never a `hasText` with an H:MM value (lesson 11.2).
    await expect(marker).toHaveText(/\bORA · \d{2}:\d{2}\b/);

    // It sits BETWEEN the past movement and the future one.
    const order = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[data-testid="mobile-agenda-row"], [data-testid="mobile-agenda-now"]')];
      return nodes.map((node) => node.getAttribute('data-testid'));
    });
    expect(order).toEqual(['mobile-agenda-row', 'mobile-agenda-now', 'mobile-agenda-row']);

    // Not today -> no marker at all (the template's `nowIdx === -1` case).
    // The `?date=` param is a EUROPE/ROME calendar day, so "tomorrow" has to be
    // computed there too. `toISOString().slice(0, 10)` (UTC) made this line lie
    // between 00:00 and 02:00 Rome — measured 2026-08-04 at 00:23 CEST, i.e.
    // 22:23 UTC of the 3rd: `+24h` in UTC still lands on the 4th, which IS
    // today in Rome, so the marker legitimately existed and the assertion went
    // red. Same class as review 15.4 F1 ("fixtures independent of the hour"),
    // one boundary further out. Found by story 15.5's final full-suite run.
    const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    await page.goto(`/it/dashboard/bookings?date=${tomorrow}`);
    await expect(page.getByTestId('mobile-agenda')).toBeVisible();
    await expect(page.getByTestId('mobile-agenda-now')).toHaveCount(0);
  });

  test('tail chips drive the SAME filter as the popover, are 44px, and the last one is reachable after a real horizontal scroll', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'CH');
    const other = await createAircraft(page, 'CO');
    const pilot = await createPilot(page, 'CH');
    // Today and still ahead: creatable as-is, no staging needed.
    await createBooking(page, aircraft.id, pilot.id, slotAroundNow(12, 20));

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/bookings');

    const strip = page.getByTestId('mobile-tail-chips');
    await expect(strip).toBeVisible();
    // "Tutti" plus one chip per bookable aircraft — asserted as a RELATION to
    // the popover's own list, never as an absolute count (shared DB).
    const chipCount = await page.locator('[data-testid^="mobile-tail-chip-"]').count();
    await page.getByTestId('schedule-filter-toggle').click();
    const popoverCount = await page.locator('[data-testid^="schedule-filter-aircraft-"]').count();
    await page.getByTestId('schedule-filter-done').click();
    expect(chipCount).toBe(popoverCount + 1);

    expect(await page.getByTestId(`mobile-tail-chip-${aircraft.id}`).evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBeGreaterThanOrEqual(
      44,
    );

    // One tap filters the agenda AND selects the same aircraft in the popover:
    // one source of truth (ratifica R-15.4-c).
    await page.getByTestId(`mobile-tail-chip-${aircraft.id}`).click();
    await expect(page.getByTestId('mobile-agenda-row').filter({ hasText: pilot.lastName })).toHaveCount(1);
    await expect(page.getByTestId('mobile-agenda-row').filter({ hasText: other.registration })).toHaveCount(0);
    await page.getByTestId('schedule-filter-toggle').click();
    await expect(page.getByTestId(`schedule-filter-aircraft-${aircraft.id}`)).toHaveClass(/on/);
    // NEVER Escape here: it would close the whole panel/popover chain (review
    // 14.3 F1) — the popover has its own "Fatto".
    await page.getByTestId('schedule-filter-done').click();

    // With a long fleet the strip scrolls INSIDE itself: the page never does.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const box = await strip.boundingBox();
    if (!box) throw new Error('chip strip not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(3000, 0);
    await expect(async () => {
      expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    }).toPass({ timeout: 2000 });
    // The dev fleet is long: keep wheeling (a REAL wheel, never
    // `scrollIntoViewIfNeeded`, which would mask a non-scrollable container)
    // until the strip is at its end.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const atEnd = await strip.evaluate((el) => el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
      if (atEnd) break;
      await page.mouse.wheel(3000, 0);
      await page.waitForTimeout(100);
    }
    const lastChipReachable = await page.locator('[data-testid^="mobile-tail-chip-"]').last().evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return rect.left >= 0 && rect.right <= window.innerWidth && (atPoint === el || el.contains(atPoint));
    });
    expect(lastChipReachable).toBe(true);
  });

  test('the bookings list is cards + a decision sheet: approve, reject with a reason, and cancel all work from the phone', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'SH');
    const pilot = await createPilot(page, 'SH');
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const approved = await createBooking(page, aircraft.id, pilot.id, {
      startsAt: `${tomorrow}T08:00:00.000Z`,
      endsAt: `${tomorrow}T09:00:00.000Z`,
    });
    // Staff-created bookings are APPROVED; reopen one to PENDING to get the
    // approve/reject pair in the sheet.
    const reopen = await page.request.post(`/api/v1/bookings/${approved}/transition`, { data: { to: 'FLOWN' } });
    expect(reopen.status()).toBe(200);
    const backToPending = await page.request.post(`/api/v1/bookings/${approved}/transition`, { data: { to: 'PENDING' } });
    expect(backToPending.status()).toBe(200);

    await page.setViewportSize(PHONE);
    const card = await findMobileCard(page, pilot.lastName);

    await expect(page.locator('.students')).toBeHidden();
    await expect(card).toHaveCount(1);
    // One button per card, nothing interactive inside it (R-15.2-b).
    expect(await card.evaluate((el) => el.querySelectorAll('button, a, input, select').length)).toBe(0);
    expect(await card.evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);

    // Opened FROM THE KEYBOARD (AC 5): focus the card and press Enter.
    await card.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByTestId('mobile-booking-sheet');
    await expect(sheet).toHaveCount(1);
    await expect(sheet).toContainText(aircraft.registration);

    // Review 15.4 F5 — the guard the `.bottom-sheet-actions` rule never had.
    // A PENDING row seen by an admin offers FOUR decisions (approve, reject,
    // Modifica, Annulla) and `flex: 1` alone squeezed all four onto one 195px
    // row at 79px each, which does not hold "Modifica"/"Annulla". The
    // assertion is on the geometry the rule LIBERATES — two per row, each wide
    // enough for its label — not on "the rule exists".
    const actionGeometry = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="mobile-booking-sheet"] .bottom-sheet-actions .btn')].map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: Math.round(rect.width), top: Math.round(rect.top) };
      }),
    );
    expect(actionGeometry).toHaveLength(4);
    expect(Math.min(...actionGeometry.map((button) => button.width))).toBeGreaterThanOrEqual(140);
    expect(new Set(actionGeometry.map((button) => button.top)).size).toBe(2);

    // An empty reason never reaches the network (same guard as the desktop).
    await page.getByTestId('booking-reject-action-mobile').click();
    let requests = 0;
    const countTransitions = (request: { url: () => string }) => {
      if (request.url().includes('/transition')) requests += 1;
    };
    page.on('request', countTransitions);
    await page.getByTestId('booking-deny-submit-mobile').click();
    await expect(page.getByTestId('booking-deny-error-mobile')).toBeVisible();
    expect(requests).toBe(0);
    page.off('request', countTransitions);

    const reason = `Meteo ${uniqueSuffix()}`;
    await page.getByTestId('booking-deny-reason-mobile').fill(reason);
    await page.getByTestId('booking-deny-submit-mobile').click();
    await expect(sheet).toHaveCount(0);
    // The state is read back from the API, never from "the card says so".
    await expect(async () => {
      expect(await statusOf(page, aircraft.id, approved)).toEqual({ status: 'DENIED', denyReason: reason });
    }).toPass({ timeout: 5000 });

    // The reason is readable in the sheet of the now-DENIED row.
    await (await findMobileCard(page, pilot.lastName)).click();
    await expect(page.getByTestId('mobile-booking-sheet')).toContainText(reason);
    await page.getByTestId('booking-reopen-action-mobile').click();
    await expect(async () => {
      expect((await statusOf(page, aircraft.id, approved)).status).toBe('PENDING');
    }).toPass({ timeout: 5000 });

    // Approve, from the sheet.
    await (await findMobileCard(page, pilot.lastName)).click();
    await page.getByTestId('booking-approve-action-mobile').click();
    await expect(async () => {
      expect((await statusOf(page, aircraft.id, approved)).status).toBe('APPROVED');
    }).toPass({ timeout: 5000 });

    // Cancel keeps its two-step confirmation, inside the same sheet.
    await (await findMobileCard(page, pilot.lastName)).click();
    await page.getByTestId('booking-cancel-action-mobile').click();
    await page.getByTestId('booking-cancel-confirm-mobile').click();
    await expect(async () => {
      expect((await statusOf(page, aircraft.id, approved)).status).toBe('CANCELLED');
    }).toPass({ timeout: 5000 });
  });

  test('"Modifica" closes the sheet before opening the full-screen panel (ratifica R-15.4-d): never a panel stacked on a sheet', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'MV');
    const pilot = await createPilot(page, 'MV');
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await createBooking(page, aircraft.id, pilot.id, { startsAt: `${tomorrow}T10:00:00.000Z`, endsAt: `${tomorrow}T11:00:00.000Z` });

    await page.setViewportSize(PHONE);
    await (await findMobileCard(page, pilot.lastName)).click();
    await page.getByTestId('booking-move-action-mobile').click();

    await expect(page.getByTestId('mobile-booking-sheet')).toHaveCount(0);
    const panel = page.getByTestId('move-booking-form');
    await expect(panel).toBeVisible();
    // The panel rises with a transform transition: poll until it has settled,
    // or the rect below is measured mid-animation.
    // `.slideover-panel` matches TWO nodes on this card (create + move, both
    // mounted): always scoped through the form's own testid.
    await expect(async () => {
      const y = await page.evaluate(() =>
        Math.round(document.querySelector('[data-testid="move-booking-form"]')!.closest('.slideover-panel')!.getBoundingClientRect().y),
      );
      expect(y).toBe(0);
    }).toPass({ timeout: 3000 });
    // Full screen (15.2) and the primary action pinned at the bottom (AD-6).
    const geometry = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="move-booking-form"]')!.closest('.slideover-panel')!;
      const rect = el.getBoundingClientRect();
      const actions = document.querySelector('[data-testid="move-booking-form"] .so-actions')!;
      return {
        panel: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        actionsPosition: getComputedStyle(actions).position,
      };
    });
    expect(geometry.panel).toEqual({ x: 0, y: 0, w: geometry.viewport.w, h: geometry.viewport.h });
    expect(geometry.actionsPosition).toBe('sticky');
  });

  test('the create panel at a SHORT phone: the body scrolls and the submit is still hit-testable without scrolling (the side `.so-actions` liberates)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE_SHORT);
    await page.goto('/it/dashboard/bookings');
    await page.getByTestId('new-booking-button').click();
    await expect(page.getByTestId('new-booking-form')).toBeVisible();

    // The panel rises with a transform transition: measuring mid-animation
    // hit-tests a moving box. Poll until the geometry has settled.
    await expect(async () => {
      const panel = await page.evaluate(() => {
        const rect = document.querySelector('[data-testid="new-booking-form"]')!.closest('.slideover-panel')!.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
      });
      expect(panel).toEqual({ x: 0, y: 0, w: PHONE_SHORT.width, h: PHONE_SHORT.height });
    }).toPass({ timeout: 3000 });

    const measured = await page.evaluate(() => {
      const body = document.querySelector('.so-body')!;
      const submit = [...document.querySelectorAll('[data-testid="new-booking-form"] button')].find(
        (button) => (button as HTMLButtonElement).type === 'submit',
      )!;
      const rect = submit.getBoundingClientRect();
      const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        // The discriminator: with the body TALLER than its scrollport and
        // `scrollTop === 0`, a non-sticky action row would be below the fold.
        bodyScrolls: body.scrollHeight > body.clientHeight,
        scrollTop: body.scrollTop,
        submitHit: atPoint === submit || submit.contains(atPoint),
        submitHeight: Math.round(rect.height),
      };
    });
    expect(measured.bodyScrolls).toBe(true);
    expect(measured.scrollTop).toBe(0);
    expect(measured.submitHit).toBe(true);
    expect(measured.submitHeight).toBeGreaterThanOrEqual(44);

    // The date picker's portalled popover (z 65/66) stays above the sticky bar
    // and inside the viewport. NEVER closed with Escape (review 14.3 F1: that
    // closes the whole panel and the next assertions race the animation).
    await page.locator('[data-testid="new-booking-form"] .date-input-btn').first().click();
    const picker = await page.evaluate(() => {
      const popover = document.querySelector('.cal-popover');
      if (!popover) return null;
      const rect = popover.getBoundingClientRect();
      // Same discriminator as `bookings.spec.ts#hitTestsOwnControl` (review
      // 13.7 F2): scroll ONLY the popover's own scrollbox — a `position:fixed`
      // popover capped by `maxHeight` puts its foot inside that box, a clipped
      // one has no box to scroll and stays unreachable.
      popover.scrollTop = popover.scrollHeight;
      const confirm = popover.querySelector('.cal-foot .btn')!;
      const confirmRect = confirm.getBoundingClientRect();
      const atPoint = document.elementFromPoint(confirmRect.left + confirmRect.width / 2, confirmRect.top + confirmRect.height / 2);
      return {
        inside: rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight,
        confirmHit: atPoint === confirm || confirm.contains(atPoint),
      };
    });
    expect(picker).not.toBeNull();
    expect(picker).toEqual({ inside: true, confirmHit: true });
  });

  test('status chips filter the list through the URL, and the filter survives pagination and the export hrefs', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'ST');
    const pilot = await createPilot(page, 'ST');
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const booking = await createBooking(page, aircraft.id, pilot.id, { startsAt: `${tomorrow}T12:00:00.000Z`, endsAt: `${tomorrow}T13:00:00.000Z` });

    await page.setViewportSize(PHONE);
    // The APPROVED fixture is in the unfiltered list...
    await findMobileCard(page, pilot.lastName);

    // ...and every row of the PENDING list is a pending one, this fixture
    // therefore not among them. Asserted on the ROWS, not on the URL alone
    // (the URL assertion was blind: the page did not read `?status` at all).
    await page.goto('/it/dashboard/bookings');
    await page.getByTestId('mobile-status-chip-PENDING').click();
    await page.waitForURL(/status=PENDING/);
    const badges = await page
      .getByTestId('booking-row-mobile')
      .evaluateAll((nodes) => nodes.map((node) => node.querySelector('.badge')?.textContent?.trim() ?? ''));
    expect(badges.length).toBeGreaterThan(0);
    expect([...new Set(badges)]).toEqual(['In attesa']);

    // The export mirrors the SAME filter as the list (`page.tsx`'s own rule).
    // `ExportMenu` renders its links only once opened.
    await page.getByRole('button', { name: 'Esporta' }).click();
    await expect(page.getByRole('link', { name: 'Esporta XLS' })).toHaveAttribute('href', /status=PENDING/);

    // A hand-edited value never errors: it falls back to "every status".
    await page.goto('/it/dashboard/bookings?status=NOPE');
    await expect(page.getByTestId('bookings-list-section')).toBeVisible();
    await expect(page.getByTestId('mobile-status-chip-all')).toHaveClass(/primary/);
    // The unknown value fell back to "every status", so the fixture is still
    // findable (on whatever page it sits).
    await findMobileCard(page, pilot.lastName, 'status=NOPE');

    // And the timeline's own navigation carries the filter along (crosstalk, 6.4 M1).
    await page.goto('/it/dashboard/bookings?status=APPROVED');
    await expect(page.getByTestId('calendar-next')).toHaveAttribute('href', /status=APPROVED/);
    await findMobileCard(page, pilot.lastName, 'status=APPROVED');
    expect((await statusOf(page, aircraft.id, booking)).status).toBe('APPROVED');
  });

  test('geometry and layering at 375 and 390: no page overflow in either view, nothing under the tab bar, one node per desktop testid', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    for (const viewport of [PHONE, PHONE_WIDE]) {
      await page.setViewportSize(viewport);
      for (const url of ['/it/dashboard/bookings', '/it/dashboard/bookings?view=week']) {
        await page.goto(url);
        await expect(page.getByTestId('schedule-section')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${url} @ ${viewport.width}`).toBe(
          true,
        );

        // No control of the page ends under the tab bar (z-index 5): the check
        // is an INTERSECTION with the bar's own rect, so a control merely
        // scrolled out of a horizontal strip is not mistaken for a covered one.
        const covered = await page.evaluate(() => {
          const bar = document.querySelector('[data-testid="mobile-tab-bar"]')!.getBoundingClientRect();
          const hits: string[] = [];
          for (const element of document.querySelectorAll('.page a, .page button')) {
            // PAGE-level vertical scroll only: `scrollIntoView` would also
            // scroll the nearest horizontal container (the chip strips), which
            // is a side effect this check must not have.
            const absoluteTop = element.getBoundingClientRect().top + window.scrollY;
            window.scrollTo(0, Math.max(0, absoluteTop - window.innerHeight / 2));
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.bottom > bar.top && rect.top < bar.bottom && rect.right > bar.left && rect.left < bar.right) {
              hits.push((element as HTMLElement).dataset['testid'] ?? element.className);
            }
          }
          return hits;
        });
        expect(covered, `${url} @ ${viewport.width}`).toEqual([]);
      }
    }

    // AC 9: the desktop testids stay ONE node at every width and on BOTH pages
    // that render these two components.
    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await page.goto('/it/dashboard/bookings');
      await expect(page.getByTestId('schedule-section')).toBeVisible();
      for (const testId of DESKTOP_TESTIDS) {
        await expect(page.getByTestId(testId), `${testId} @ ${viewport.width}`).toHaveCount(1);
      }
      await page.goto('/it/dashboard');
      await expect(page.getByTestId('bookings-list-section')).toHaveCount(1);
      // AD-1's accepted consequence, asserted rather than hoped for: the phone
      // tree of `bookings-table.tsx` IS in the home's DOM (the switch is CSS
      // only) and is NEVER visible there, because `.home-desktop-surface` is
      // `display:none` at this width and the tree itself is at 1280px.
      await expect(page.getByTestId('mobile-bookings-list')).toBeHidden();
    }

    // The inverse side of the swap: at 1280px the mobile trees are gone.
    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard/bookings');
    await expect(page.locator('.schedule')).toBeVisible();
    await expect(page.getByTestId('mobile-agenda')).toBeHidden();
    await expect(page.getByTestId('mobile-bookings-list')).toBeHidden();
    await expect(page.getByTestId('mobile-tail-chips')).toBeHidden();
    await expect(page.getByTestId('mobile-status-chips')).toBeHidden();
  });

  test('every empty state is exactly ONE node, on a day with no movements at all', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'EM');
    await page.setViewportSize(PHONE);
    // A far-future day, filtered to an aircraft created seconds ago: nothing
    // can be booked on it, and the AOG rows the shared DB carries belong to
    // OTHER aircraft (they are date-independent by design, R-15.4-h).
    await page.goto('/it/dashboard/bookings?date=2031-03-11');
    await page.getByTestId(`mobile-tail-chip-${aircraft.id}`).click();
    await expect(page.getByTestId('mobile-agenda-row')).toHaveCount(0);
    await expect(page.getByTestId('mobile-agenda-empty')).toHaveCount(1);
    await expect(page.getByTestId('mobile-agenda-now')).toHaveCount(0);
  });

  test('multi-actor: the agenda and the list serve every role, and the CTA follows the PROFILE, not just the permission (TD 14.6 F2)', async ({
    page,
  }) => {
    // Admin: sets up a movement today, plus a pilot of this test's own whose
    // profile is deactivated further down — the exact case the TD describes.
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page, 'RB');
    const pilot = await createPilot(page, 'RB');
    await createBooking(page, aircraft.id, pilot.id, slotAroundNow(12, 20));

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/bookings');
    await expect(page.getByTestId('new-booking-button')).toBeVisible();
    await expect(page.getByTestId('mobile-agenda-row').filter({ hasText: pilot.lastName })).toHaveCount(1);

    for (const email of [PILOT_EMAIL, INSTRUCTOR_EMAIL, STUDENT_EMAIL]) {
      await page.context().clearCookies();
      await loginExpectingDashboard(page, email);
      await page.setViewportSize(PHONE);
      await page.goto('/it/dashboard/bookings');
      // The page is open to everybody: both phone surfaces render.
      await expect(page.getByTestId('mobile-agenda'), email).toBeVisible();
      await expect(page.getByTestId('mobile-bookings-list'), email).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), email).toBe(true);
    }

    // --- CTA vs PROFILE, on a pilot of this test's OWN (review 15.4 F4) ---
    // The seed pilot is shared with `bookings.spec.ts`, which clicks
    // `new-booking-button` as that actor in four places while this project runs
    // `fullyParallel`: deactivating it here made that button disappear under a
    // concurrent worker. This actor belongs to this test alone, so nothing is
    // shared and nothing has to be restored.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const ownPilot = await createPilotWithLogin(page, 'CT');

    // An ACTIVE pilot profile -> the CTA is there.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, ownPilot.email, OWN_PILOT_PASSWORD);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/bookings');
    await expect(page.getByTestId('new-booking-button')).toBeVisible();

    // Deactivate that profile as admin, then look again: the CTA must be GONE,
    // not disabled and not a 403 waiting to happen.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const deactivate = await page.request.post(`/api/v1/people/${ownPilot.personId}/profiles/pilot/deactivate`);
    expect(deactivate.status(), await deactivate.text()).toBe(200);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, ownPilot.email, OWN_PILOT_PASSWORD);
    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/bookings');
    await expect(page.getByTestId('mobile-bookings-list')).toBeVisible();
    await expect(page.getByTestId('new-booking-button')).toHaveCount(0);

    // ...and the hidden button matches the server EXACTLY: the same actor's
    // own create answers 403 (the whole point of closing TD 14.6 F2 — the CTA
    // is hidden where, and only where, `createBooking` refuses).
    const refused = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: ownPilot.personId, ...slotAroundNow(12, 20) },
    });
    expect(refused.status(), await refused.text()).toBe(403);
  });
});
