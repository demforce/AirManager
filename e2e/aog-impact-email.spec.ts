import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureValidSeedExpiries } from './helpers';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];
const OWN_PILOT_PASSWORD = 'AogPilot123!';

if (!SEED_PASSWORD) {
  throw new Error('e2e/aog-impact-email.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Story AOG-1b — "Stai per impattare N prenotazioni": the preview before the
 * act, the two-step submit, the authoritative count in the response and its
 * persistent banner, the line that comes back at every reopening, and the
 * best-effort email to the holders of the impacted APPROVED bookings.
 *
 * **Isolation (AC 17), and why this file needs NO serialized project.**
 * Grounding an aircraft is global state, and so is the Mailpit mailbox — so
 * every test here owns everything it asserts on:
 * - its own run-unique AIRCRAFT, grounded by itself (the same discipline
 *   `bookings.spec.ts` / `mobile-planning.spec.ts` / `mobile-registries.spec.ts`
 *   and story AOG-1a's own spec already follow in this `fullyParallel` project);
 * - its own run-unique PEOPLE and BOOKINGS, so every number asserted is one
 *   this test created — never a photograph of somebody else's fixtures
 *   (lezione 15.10);
 * - Mailpit read ONLY through `to:<run-unique address>` + a subject that names
 *   THIS test's registration. Never a mailbox total, never "the last message".
 * Nothing here reads a GLOBAL aggregate (the Panoramica's AOG count, the
 * Flotta's "N AOG"), which is the one thing that would force the serialized
 * chain (review Billing-2 F4).
 *
 * **Dates (AC 17)**: every fixture instant is computed RELATIVE to the
 * grounding date of the fixture itself (`dateOnlyFromToday`), never a literal
 * that could lapse mid-run (lezione 15.4 F1). Times sit at 08:00-09:00Z, inside
 * every scheduling window the serialized `booking-window`/`settings` projects
 * leave behind. No `hasText` ever carries a date or an `H:MM` (lezione 11.2).
 */

async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A `YYYY-MM-DD` calendar day `offsetDays` from today, UTC — relative and computed, never a literal (lezione 15.4 F1). */
function dateOnlyFromToday(offsetDays: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays)).toISOString().slice(0, 10);
}

/** The same rendering `formatDateOnly` produces — so no assertion hard-codes a format. */
function formatDateOnly(dateOnly: string, locale: 'it' | 'en'): string {
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-IE', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

type MailpitSummary = { ID: string; Subject: string };
type MailpitMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as the other specs (file-local by convention here). */
async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 20_000): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await findMailpitMessage(to, subjectIncludes);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

/** One shot, no waiting — used both by the poller above and by the "and NOTHING arrived" assertion. */
async function findMailpitMessage(to: string, subjectIncludes: string): Promise<MailpitMessage | null> {
  const searchResponse = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  const searchBody = (await searchResponse.json()) as { messages: MailpitSummary[] };
  const found = searchBody.messages.filter((message) => message.Subject.includes(subjectIncludes));
  if (found.length === 0) return null;
  expect(found, `exactly ONE "${subjectIncludes}" message for ${to}`).toHaveLength(1);
  const messageResponse = await fetch(`http://localhost:8025/api/v1/message/${found[0]!.ID}`);
  return (await messageResponse.json()) as MailpitMessage;
}

/**
 * The two subjects a grounding of THIS aircraft can produce, one per locale.
 * The "nothing was sent" assertion has to name them BOTH and it has to name
 * them EXACTLY: the DENIED fixture below produces "Prenotazione rifiutata:
 * <registration>" for the very same recipient, so filtering on the
 * registration alone would find that one and call it a grounding email.
 */
function groundingSubjects(registration: string): string[] {
  return [`Velivolo fuori servizio: ${registration}`, `Aircraft out of service: ${registration}`];
}

async function createAircraft(page: Page): Promise<{ id: string; registration: string }> {
  const registration = `I-AOGB${uniqueSuffix()}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'AOG impact', hourMeterMinutes: 100 },
  });
  expect(response.status(), await response.text()).toBe(201);
  return { id: ((await response.json()) as { id: string }).id, registration };
}

/**
 * A run-unique pilot WITH an email on file — the email matters twice: it is
 * what makes them a legitimate recipient (a person without one is a silent
 * skip), and it is the run-unique key the Mailpit assertions filter on.
 */
async function createPilotPerson(page: Page, tag: string): Promise<{ personId: string; email: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const lastName = `Aog${tag}-${suffix}`;
  const email = `aog-${tag}-${suffix}@airmanager.local`.toLowerCase();
  const response = await page.request.post('/api/v1/people', {
    data: {
      firstName: 'Impatto',
      lastName,
      email,
      profiles: { pilot: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' } },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const personId = ((await response.json()) as { id: string }).id;
  // TD 15.5: without valid blocking expiries `createBooking` answers 422
  // FLIGHT_BLOCKED_BY_EXPIRY-style long before this story's own logic runs.
  await ensureValidSeedExpiries(page, personId, 'PILOTS');
  return { personId, email, lastName };
}

/** Books `day` 08:00-09:00Z. As ADMIN the booking is created APPROVED, as a pilot PENDING (`bookings.service.ts`). */
async function book(page: Page, aircraftId: string, personId: string, day: string): Promise<string> {
  const response = await page.request.post('/api/v1/bookings', {
    data: { aircraftId, personId, startsAt: `${day}T08:00:00.000Z`, endsAt: `${day}T09:00:00.000Z` },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { booking: { id: string } }).booking.id;
}

async function openFleetEditor(page: Page, registration: string, locale: 'it' | 'en' = 'it'): Promise<void> {
  await page.goto(`/${locale}/dashboard/fleet?q=${encodeURIComponent(registration)}`);
  await page.locator('[data-testid^="ac-card-"]').filter({ hasText: registration }).click();
  await expect(page.getByTestId('availability-current')).toBeVisible();
}

test.describe('Impacted-booking count and grounding email (story AOG-1b)', () => {
  test('the preview, the cancellable two-step submit, the persistent banner with the REAL number, the line at reopen, and the email to the APPROVED holders only', async ({
    page,
    browser,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    // --- the fixture, every state, all of it this test's own ---------------
    // `until` = +10 days. INSIDE it: 3 APPROVED (+2, +4 and +10 — the last one
    // ON the boundary day, which is what makes R-AOG-a's INCLUSIVE semantics
    // discriminant here) and 1 PENDING (+6). OUTSIDE or closed: 1 APPROVED at
    // +40 (beyond `until`), 1 CANCELLED, 1 DENIED. Expected: 1 pending, 3
    // approved, 4 in total.
    const until = dateOnlyFromToday(10);
    const approvedHolder = await createPilotPerson(page, 'appr');
    const secondHolder = await createPilotPerson(page, 'sec');
    const pendingHolder = await createPilotPerson(page, 'pend');

    // The APPROVED holder gets a login user with an EXPLICIT locale, so the
    // email's language is asserted on a real choice and not on the `it`
    // fallback (AC 12).
    const userResponse = await page.request.post('/api/v1/users', {
      data: { email: approvedHolder.email, roles: ['PILOT'], personId: approvedHolder.personId, locale: 'en' },
    });
    expect(userResponse.status(), await userResponse.text()).toBe(201);

    await book(page, aircraft.id, approvedHolder.personId, dateOnlyFromToday(2));
    await book(page, aircraft.id, secondHolder.personId, dateOnlyFromToday(4));
    await book(page, aircraft.id, approvedHolder.personId, until);
    await book(page, aircraft.id, secondHolder.personId, dateOnlyFromToday(40));

    const cancelledId = await book(page, aircraft.id, secondHolder.personId, dateOnlyFromToday(8));
    const cancelResponse = await page.request.post(`/api/v1/bookings/${cancelledId}/cancel`);
    expect(cancelResponse.status(), await cancelResponse.text()).toBe(200);

    // PENDING needs a NON-admin author (an admin's booking is born APPROVED),
    // hence this test's own pilot login. The second one it creates is denied,
    // giving the DENIED state its fixture too.
    const pendingContext = await browser.newContext();
    const pendingPage = await pendingContext.newPage();
    await setPassword(pendingPage, page, pendingHolder.email, pendingHolder.personId);
    await loginExpectingDashboard(pendingPage, pendingHolder.email, OWN_PILOT_PASSWORD);
    await book(pendingPage, aircraft.id, pendingHolder.personId, dateOnlyFromToday(6));
    const toDenyId = await book(pendingPage, aircraft.id, pendingHolder.personId, dateOnlyFromToday(7));
    const denyResponse = await page.request.post(`/api/v1/bookings/${toDenyId}/transition`, { data: { to: 'DENIED', reason: 'Fixture chiusa' } });
    expect(denyResponse.status(), await denyResponse.text()).toBe(200);
    await pendingContext.close();

    // --- AC 2: the warning arrives BEFORE the act --------------------------
    await openFleetEditor(page, aircraft.registration);
    const preview = page.getByTestId('aog-impact-preview');
    await expect(preview).toBeVisible();
    // No candidate date yet: the window is NOT delimited, and it says so.
    await expect(preview).toContainText('rientro da definire: conteggio non delimitato');
    await expect(preview).toContainText('stima');

    await page.getByTestId('out-of-service-until').fill(until);
    // With the window closed at +10, the +40 booking drops out: 3 approved.
    await expect(preview).toContainText('Stai per impattare 4 prenotazioni.');
    await expect(preview).toContainText('In attesa (congelate): 1 · Approvate (da gestire): 3');
    await expect(preview).toContainText(`conteggio fino al ${formatDateOnly(until, 'it')} compreso`);

    // --- AC 3: the first press writes NOTHING ------------------------------
    await page.getByTestId('out-of-service-reason').fill('Revisione 100h impatto');
    await page.getByTestId('out-of-service-submit').click();
    await expect(page.getByTestId('out-of-service-confirm')).toBeVisible();
    await expect(page.getByTestId('out-of-service-submit')).toHaveCount(0);
    await page.getByTestId('out-of-service-cancel').click();
    await expect(page.getByTestId('out-of-service-submit')).toBeVisible();
    // Verified on the DB, not on the screen.
    const afterCancel = await page.request.get(`/api/v1/aircraft/${aircraft.id}`);
    expect(((await afterCancel.json()) as { status: string }).status).toBe('OPERATIONAL');

    // --- AC 4/AC 5: the second press writes, and the banner REPORTS --------
    await page.getByTestId('out-of-service-submit').click();
    await page.getByTestId('out-of-service-confirm').click();
    const banner = page.getByTestId('aog-impact-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Fermo registrato: 4 prenotazioni impattate.');
    await expect(banner).toContainText('In attesa (congelate): 1 · Approvate (da gestire): 3');
    await expect(banner).toContainText(`conteggio fino al ${formatDateOnly(until, 'it')} compreso`);
    await expect(page.getByTestId('aog-impact-bookings-link')).toHaveAttribute('href', '/it/dashboard/bookings?status=PENDING,APPROVED');

    // The REQUIREMENT is "still there long after the toast is gone". The toast
    // lives 2600 ms (`toast.tsx`), so anything measured under that proves
    // nothing at all — 6 s is the requirement, not the observed value.
    await page.waitForTimeout(6_000);
    await expect(page.getByTestId('toast')).toHaveCount(0);
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Fermo registrato: 4 prenotazioni impattate.');

    // --- AC 6: the line comes back at every reopening ----------------------
    await page.locator('[role="dialog"] .so-head .iconbtn').click();
    await openFleetEditor(page, aircraft.registration);
    const row = page.getByTestId('aog-impact-row');
    await expect(row).toBeVisible();
    await expect(row).toContainText('4 prenotazioni nel fermo');
    await expect(row).toContainText(`conteggio fino al ${formatDateOnly(until, 'it')} compreso`);
    // The banner belonged to the act; the armed state of the two-step must not
    // have survived the remount either (the class of BLOCKER 14.4 F1).
    await expect(page.getByTestId('aog-impact-banner')).toHaveCount(0);
    await expect(page.getByTestId('out-of-service-confirm')).toHaveCount(0);

    // --- AC 10/AC 12: the email, to the APPROVED holders and to NOBODY else -
    const [italianSubject, englishSubject] = groundingSubjects(aircraft.registration) as [string, string];
    const mail = await waitForMailpitMessage(approvedHolder.email, englishSubject);
    // The recipient chose `en`: the email is in THEIR language, not the
    // grounding admin's.
    expect(mail.Subject).toBe(englishSubject);
    expect(mail.Text).toContain('Impatto');
    expect(mail.Text).toContain('Revisione 100h impatto');
    expect(mail.Text).toContain(`until ${formatDateOnly(until, 'en')} inclusive`);
    expect(mail.Text).toContain('has NOT been cancelled');

    // The second APPROVED holder has no `User` at all -> `it` fallback.
    const secondMail = await waitForMailpitMessage(secondHolder.email, italianSubject);
    expect(secondMail.Subject).toBe(italianSubject);
    expect(secondMail.Text).toContain(`fino al ${formatDateOnly(until, 'it')} compreso`);

    // ...and the PENDING holder — who HAS an email on file, so this is a real
    // "nothing was sent" and not a silent skip — gets nothing about this
    // aircraft (R-AOG-i).
    for (const subject of groundingSubjects(aircraft.registration)) {
      expect(await findMailpitMessage(pendingHolder.email, subject), `no grounding email for the PENDING holder (${subject})`).toBeNull();
    }
  });

  test('with NO expected-return date the count is declared NOT delimited, everywhere, and it includes what a dated window would have excluded (AC 8)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const holder = await createPilotPerson(page, 'undel');

    // Two APPROVED bookings, deliberately far apart: +3 and +40 days. The
    // dated window this test then tries (+10) drops the second one; an
    // undelimited one keeps both. +40 stays inside the most restrictive
    // `maxAdvanceDays` any serialized project transiently writes (45).
    await book(page, aircraft.id, holder.personId, dateOnlyFromToday(3));
    await book(page, aircraft.id, holder.personId, dateOnlyFromToday(40));

    await openFleetEditor(page, aircraft.registration);
    const preview = page.getByTestId('aog-impact-preview');
    await expect(preview).toContainText('Stai per impattare 2 prenotazioni.');
    await expect(preview).toContainText('rientro da definire: conteggio non delimitato');

    // The discriminance of the window itself: with a date at +10 the far
    // booking is out, and the number MOVES.
    await page.getByTestId('out-of-service-until').fill(dateOnlyFromToday(10));
    await expect(preview).toContainText('Stai per impattare 1 prenotazione.');
    // ...and clearing it puts the count back where it was.
    await page.getByTestId('out-of-service-until').fill('');
    await expect(preview).toContainText('Stai per impattare 2 prenotazioni.');

    await page.getByTestId('out-of-service-reason').fill('Attesa pezzo');
    await page.getByTestId('out-of-service-submit').click();
    await page.getByTestId('out-of-service-confirm').click();

    const banner = page.getByTestId('aog-impact-banner');
    await expect(banner).toContainText('Fermo registrato: 2 prenotazioni impattate.');
    await expect(banner).toContainText('rientro da definire: conteggio non delimitato');

    await page.locator('[role="dialog"] .so-head .iconbtn').click();
    await openFleetEditor(page, aircraft.registration);
    await expect(page.getByTestId('aog-impact-row')).toContainText('2 prenotazioni nel fermo');
    await expect(page.getByTestId('aog-impact-row')).toContainText('rientro da definire: conteggio non delimitato');

    // The email says the same thing, in the same words.
    const mail = await waitForMailpitMessage(holder.email, `Velivolo fuori servizio: ${aircraft.registration}`);
    expect(mail.Text).toContain('rientro da definire');
    expect(mail.Text).not.toContain('fino al');

    // EN parity of the two strings this AC is about.
    await openFleetEditor(page, aircraft.registration, 'en');
    await expect(page.getByTestId('aog-impact-row')).toContainText('2 bookings inside the grounding');
    await expect(page.getByTestId('aog-impact-row')).toContainText('return date not yet known: count not delimited');
  });

  /**
   * Review MINOR-1. The full preview box spent 78.13 px (+14 px of grid gap) to
   * say "0 prenotazioni" and pushed the primary submit under the bottom edge of
   * the scrollable body at 1280x900, where before story AOG-1b it was visible
   * on opening. Zero now takes a one-line `.fld-hint` in the grid cell the date
   * field leaves empty, so the fold is the pre-story one again. The fold is
   * asserted FIRST, before any wording: it is what this guard exists for.
   */
  test('with zero impacted bookings the preview is one compact line and the submit is above the fold at 1280x900 (review MINOR-1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await openFleetEditor(page, aircraft.registration);
    const preview = page.getByTestId('aog-impact-preview');
    await expect(preview).toBeVisible();

    const fold = await page.evaluate(() => {
      const body = document.querySelector('.so-body')!;
      const submit = document.querySelector('[data-testid="out-of-service-submit"]')!;
      return { scrollTop: body.scrollTop, bodyBottom: body.getBoundingClientRect().bottom, submitBottom: submit.getBoundingClientRect().bottom };
    });
    expect(fold.scrollTop, 'the panel is at rest, nothing has scrolled it').toBe(0);
    expect(fold.submitBottom, `submit bottom ${fold.submitBottom} must sit above the body edge ${fold.bodyBottom}`).toBeLessThanOrEqual(fold.bodyBottom);

    // Zero is still a result, and still says which window it was counted over
    // (AC 8) — just without the box.
    await expect(preview).toHaveText('Nessuna prenotazione impattata · rientro da definire: conteggio non delimitato');
  });

  /**
   * Review MAJOR-2 + decisione PO 6. The armed state used to put
   * `out-of-service-confirm` at the trigger's own origin, so a plain double
   * click armed AND confirmed: the aircraft was grounded and the emails fanned
   * out with nobody reading a confirmation. Two things now stop it, and this
   * test exercises both on the review's own gesture (a native double click):
   * - the question in front of the pair moves the Conferma off the trigger's
   *   LEFT EDGE (the review's reproduction point);
   * - the trigger is full-width, so the Conferma still lies INSIDE its box,
   *   right of the centred label. A double click THERE lands its second half on
   *   the freshly rendered Conferma, and only the `event.detail > 1` check
   *   stops it.
   * What this proves and what it does not: Playwright's `dblclick` sets the
   * click count itself (CDP `clickCount` 1 then 2; under CDP Chromium does not
   * count mouse clicks on its own). The test therefore proves that the count
   * survives the swap of element under the pointer and that the app ignores it
   * — the counting a real user's browser does is covered by the TOUCH test
   * below, where Chromium computes the tap count itself.
   * The submit is scrolled into view first, as the review did, so this guard
   * does not depend on the fold (MINOR-1 has its own).
   */
  test('a double click on the Fuori servizio trigger arms the second step and never confirms it, anywhere on the trigger (review MAJOR-2, decisione PO 6)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await openFleetEditor(page, aircraft.registration);
    await expect(page.getByTestId('aog-impact-preview')).toBeVisible();
    await page.getByTestId('out-of-service-reason').fill('Doppio click');
    await page.getByTestId('out-of-service-submit').scrollIntoViewIfNeeded();
    const trigger = (await page.getByTestId('out-of-service-submit').boundingBox())!;

    // Where the Conferma is born: arm once, read its box, disarm. The overlap
    // with the trigger is asserted, not assumed — it is what makes the second
    // gesture below discriminant for the `detail` check.
    await page.getByTestId('out-of-service-submit').click();
    const confirm = (await page.getByTestId('out-of-service-confirm').boundingBox())!;
    await page.getByTestId('out-of-service-cancel').click();
    const inside = (point: { x: number; y: number }, box: { x: number; y: number; width: number; height: number }) =>
      point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
    const leftEdge = { x: trigger.x + 4, y: trigger.y + trigger.height / 2 };
    const overlap = { x: confirm.x + confirm.width / 2, y: confirm.y + confirm.height / 2 };
    expect(inside(leftEdge, confirm), 'the Conferma is not under the trigger left edge').toBe(false);
    expect(inside(overlap, trigger), 'the Conferma point right of the label is ALSO a trigger point').toBe(true);

    // The grounding POST is fired synchronously by the click that confirms, so
    // counting requests is the deterministic witness (the DB read could race a
    // POST still in flight).
    const groundingPosts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(`/api/v1/aircraft/${aircraft.id}/out-of-service`)) groundingPosts.push(request.url());
    });

    for (const point of [leftEdge, overlap]) {
      await page.mouse.dblclick(point.x, point.y);
      // Settled either way: armed (the fix) or already reporting (the defect).
      await expect(page.getByTestId('out-of-service-confirm').or(page.getByTestId('aog-impact-banner'))).toBeVisible();
      expect(groundingPosts, `a double click at ${point.x},${point.y} must not reach the grounding endpoint`).toEqual([]);
      await expect(page.getByText('Confermi il fermo? 0 prenotazioni impattate', { exact: true })).toBeVisible();
      await page.getByTestId('out-of-service-cancel').click();
    }
    const afterDoubleClicks = await page.request.get(`/api/v1/aircraft/${aircraft.id}`);
    expect(((await afterDoubleClicks.json()) as { status: string }).status).toBe('OPERATIONAL');

    // Negative control: the check must not eat a legitimate confirmation.
    // Keyboard activation carries `detail === 0` (a plain click, `1`, is what
    // every other test in this file confirms with).
    await page.getByTestId('out-of-service-submit').click();
    await page.getByTestId('out-of-service-confirm').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('aog-impact-banner')).toBeVisible();
    expect(groundingPosts).toHaveLength(1);
  });

  /**
   * Decisione PO 6, on a phone. Here nothing sets the count for the browser:
   * Playwright sends raw touch events and Chromium's own gesture detector
   * decides that two taps in quick succession at one point are a double tap,
   * delivering the second synthesized click to the freshly rendered Conferma
   * with `detail === 2` — which is what a real user's double tap produces. At
   * 375 the pair wraps to a second row whose Conferma covers the lower-left of
   * the trigger, so a double tap there is the one the `detail` check closes. A
   * single tap after a pause (`detail === 1`) still confirms.
   */
  test('a double TAP on the trigger at 375 never confirms, a single tap on Conferma does (decisione PO 6)', async ({ page, browser }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, storageState: await page.context().storageState() });
    const tapPage = await phone.newPage();
    await tapPage.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
    await tapPage.locator('[data-testid^="mobile-fleet-card-"]').first().tap();
    await tapPage.getByTestId('aircraft-edit-mobile').tap();
    await expect(tapPage.getByTestId('aog-impact-preview')).toBeVisible();
    await tapPage.getByTestId('out-of-service-reason').fill('Doppio tap');
    await tapPage.getByTestId('out-of-service-submit').scrollIntoViewIfNeeded();
    const trigger = (await tapPage.getByTestId('out-of-service-submit').boundingBox())!;

    await tapPage.getByTestId('out-of-service-submit').tap();
    const confirm = (await tapPage.getByTestId('out-of-service-confirm').boundingBox())!;
    await tapPage.getByTestId('out-of-service-cancel').tap();
    // The point where the Conferma's box and the trigger's box overlap.
    const top = Math.max(trigger.y, confirm.y);
    const bottom = Math.min(trigger.y + trigger.height, confirm.y + confirm.height);
    expect(bottom - top, 'at 375 the Conferma overlaps the trigger').toBeGreaterThan(0);
    const overlap = { x: confirm.x + confirm.width / 2, y: (top + bottom) / 2 };

    const groundingPosts: string[] = [];
    tapPage.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(`/api/v1/aircraft/${aircraft.id}/out-of-service`)) groundingPosts.push(request.url());
    });
    await tapPage.touchscreen.tap(overlap.x, overlap.y);
    await tapPage.touchscreen.tap(overlap.x, overlap.y);
    await expect(tapPage.getByTestId('out-of-service-confirm').or(tapPage.getByTestId('aog-impact-banner'))).toBeVisible();
    expect(groundingPosts, 'a double tap must not reach the grounding endpoint').toEqual([]);
    const afterDoubleTap = await tapPage.request.get(`/api/v1/aircraft/${aircraft.id}`);
    expect(((await afterDoubleTap.json()) as { status: string }).status).toBe('OPERATIONAL');

    // Negative control: a deliberate single tap, well past the double-tap
    // interval, confirms.
    await tapPage.waitForTimeout(800);
    await tapPage.getByTestId('out-of-service-confirm').tap();
    await expect(tapPage.getByTestId('aog-impact-banner')).toBeVisible();
    expect(groundingPosts).toHaveLength(1);
    await phone.close();
  });

  /**
   * Review MAJOR-1: a fermo whose expected return day has already passed is
   * still a fermo (invariant [a]), so the count runs UNDELIMITED — and the
   * sentence beside it used to be rebuilt from the raw date and read "conteggio
   * fino al {ieri} compreso" over a number that had counted a booking weeks
   * later. The window now comes out of the domain function
   * (`impactedBookings.effectiveUntil`), so the three cases have three
   * sentences. Grounded through the API on purpose: what is under test is the
   * WORDING of an already-overrun fermo, which no UI path can produce in one
   * session.
   */
  test('a fermo past its expected day says so, over a count that is NOT delimited (review MAJOR-1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);
    const holder = await createPilotPerson(page, 'past');
    // Far beyond any date this test writes: it is INSIDE an undelimited window
    // and OUTSIDE the expired one, which is what makes the number discriminant.
    await book(page, aircraft.id, holder.personId, dateOnlyFromToday(40));

    const yesterday = dateOnlyFromToday(-1);
    const grounded = await page.request.post(`/api/v1/aircraft/${aircraft.id}/out-of-service`, {
      data: { reason: 'Fermo scaduto', outOfServiceUntil: yesterday },
    });
    expect(grounded.status(), await grounded.text()).toBe(200);
    // The DTO itself: counted, and counted with NO bound.
    expect((await grounded.json()) as unknown).toMatchObject({ impactedBookings: { pending: 0, approved: 1, effectiveUntil: null } });

    await openFleetEditor(page, aircraft.registration);
    const row = page.getByTestId('aog-impact-row');
    await expect(row).toContainText('1 prenotazione nel fermo');
    await expect(row).toContainText(`fermo oltre il ${formatDateOnly(yesterday, 'it')} previsto: conteggio non delimitato`);
    // The sentence the pre-fix UI printed here, over the very same number.
    await expect(row).not.toContainText('compreso');

    await openFleetEditor(page, aircraft.registration, 'en');
    await expect(page.getByTestId('aog-impact-row')).toContainText(
      `grounding past the expected ${formatDateOnly(yesterday, 'en')}: count not delimited`,
    );

    // The email the holder received says the same thing: the date is the
    // EXPECTED one, not the end of the window it was warned about.
    const mail = await waitForMailpitMessage(holder.email, `Velivolo fuori servizio: ${aircraft.registration}`);
    expect(mail.Text).toContain(`oltre il ${formatDateOnly(yesterday, 'it')} previsto, rientro da definire`);
    expect(mail.Text).not.toContain(`fino al ${formatDateOnly(yesterday, 'it')} compreso`);
  });

  test('the two controls of the double step reach the 44px floor on the phone, keep their desktop box, and the banner link carries the box ink plus its underline (AC 3/AC 14)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    // `setViewportSize` INSIDE the test (pattern 13.10) — the project's own
    // viewport stays the desktop one.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/it/dashboard/fleet?q=${encodeURIComponent(aircraft.registration)}`);
    await page.locator('[data-testid^="mobile-fleet-card-"]').first().click();
    await page.getByTestId('aircraft-edit-mobile').click();
    await page.getByTestId('out-of-service-reason').fill('Revisione bersagli');
    await page.getByTestId('out-of-service-submit').click();

    for (const testId of ['out-of-service-confirm', 'out-of-service-cancel']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box, testId).not.toBeNull();
      expect(box!.height, `${testId} touch floor at 375`).toBeGreaterThanOrEqual(44);
    }

    // Above the 640px query the same two controls keep the app's ordinary
    // secondary-action box — the rule is anchored to their own testids and
    // lives inside `@media (max-width: 640px)`, so nothing moves on the desktop.
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFleetEditor(page, aircraft.registration);
    await page.getByTestId('out-of-service-reason').fill('Revisione bersagli');
    await page.getByTestId('out-of-service-submit').click();
    const desktopConfirm = await page.getByTestId('out-of-service-confirm').boundingBox();
    expect(Number(desktopConfirm!.height.toFixed(2))).toBe(34.84);

    // ...and the grounding banner's link. Left to the global `a { color:
    // var(--info) }` it would sit at 3.61:1 on the box's tint (the defect
    // R-15.10-i measured on 64 rows); the rule gives it the box's OWN ink back
    // and, with it, the underline the colour used to carry.
    await page.getByTestId('out-of-service-confirm').click();
    await expect(page.getByTestId('aog-impact-banner')).toBeVisible();
    const link = await page.evaluate(() => {
      const anchor = document.querySelector('[data-testid="aog-impact-bookings-link"]')!;
      const box = document.querySelector('[data-testid="aog-impact-banner"]')!;
      return {
        color: getComputedStyle(anchor).color,
        boxColor: getComputedStyle(box).color,
        decoration: getComputedStyle(anchor).textDecorationLine,
      };
    });
    expect(link.color).toBe(link.boxColor);
    expect(link.decoration).toBe('underline');
  });
});

/** Walks the invite email to set a password for a freshly created user — the same flow every other spec with its own login uses. */
async function setPassword(pilotPage: Page, adminPage: Page, email: string, personId: string): Promise<void> {
  const userResponse = await adminPage.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId } });
  expect(userResponse.status(), await userResponse.text()).toBe(201);
  const invite = await waitForMailpitMessage(email, 'invitato');
  const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(invite.Text);
  if (!match) throw new Error(`Invite email had no /set-password link:\n${invite.Text}`);
  const url = new URL(match[1]!);
  await pilotPage.goto(url.pathname + url.search);
  await pilotPage.getByLabel('Nuova password').fill(OWN_PILOT_PASSWORD);
  await pilotPage.getByLabel('Conferma password').fill(OWN_PILOT_PASSWORD);
  await pilotPage.getByRole('button', { name: 'Imposta password' }).click();
  await expect(pilotPage.getByTestId('set-password-success')).toBeVisible();
}
