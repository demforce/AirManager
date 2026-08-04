import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Story 15.6 — the phone face of the flight registry: the widest table of the
 * app (measured 317/1344 at 375px, 1027px of it off screen) becomes one card
 * per flight, its detail and its two decisions live in a bottom sheet, the
 * seven header controls become a chip strip + a search + a "Filtri" panel, and
 * the registra/correggi/storna behaviours stay IDENTICAL to the desktop.
 *
 * Each test guards ONE rule introduced for a MEASURED defect (AC 10), written
 * on the side the rule LIBERATES — never on "the new thing exists":
 * - the swap tests assert BOTH sides (table `none` + list visible at 375px, the
 *   inverse at 1280px): one side alone lets "I hid everything" pass;
 * - the head test asserts its measured HEIGHT against the pre-fix 266px and the
 *   reachability of every filter, not that a button exists;
 * - the panel test counts NAVIGATIONS (AD-4): the console is remounted by
 *   `page.tsx`'s own `key` at every one of them, so a panel that navigated per
 *   change would close itself under the reader's thumb;
 * - the sheet's accessible name is asserted as a PROPERTY (no adjacent
 *   separators, no empty segment, no placeholder segment) — never with
 *   `split(' — ').length`, which review 15.5 F1 measured GREEN on the very case
 *   it was meant to forbid;
 * - the containment guard works on RECTS, because the overflow sweep is blind
 *   to anything ellipsised (15.5 §12).
 *
 * Isolation (non-negotiable, lesson 12.11 F1 / 15.4's second red): every test
 * builds its OWN aircraft, people and flights and reaches them through
 * `?aircraftId=` — never `selectOption` on the velivolo filter, whose 100-option
 * ceiling is a TD this story SUBSCRIBES to (ratifica R-15.6-g), and never "my
 * fixture is on page 1" of a 20-row list. Nothing here writes AppSettings, so
 * the file stays in the `fullyParallel` project.
 *
 * Flight fixtures are created with the admin override `force`/`forceReason`
 * (14.4 AC 2): `POST /api/v1/flights` is coupled to the GLOBAL `ExpiryType`
 * catalogue, which other specs dirty, and the override is deterministic
 * whatever the catalogue holds — the medicine 15.5 already used. The guard-rail
 * itself keeps being tested where it lives (`flights.spec.ts`) plus, at 375px,
 * by the two tests below that deliberately do NOT pass the override.
 *
 * Fixture budget per full run: 6 aircraft, 8 people, 1 invited user, 14 flights.
 *
 * Viewports are set with `setViewportSize` inside the test (pattern 13.10, epic
 * decision: no duplicated Playwright project).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-logbook.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';

const PHONE = { width: 375, height: 812 } as const;
const PHONE_NARROW = { width: 320, height: 568 } as const;
const PHONE_WIDE = { width: 390, height: 844 } as const;
const PHONE_SHORT = { width: 375, height: 560 } as const;
const DESKTOP = { width: 1280, height: 900 } as const;

/** Measured on the pre-fix build (`.card-head` at 375px, admin, Italian and English alike). */
const HEAD_PRE_FIX_PX = 266;

/** Every desktop testid of this page that the convention pins to exactly ONE node (AC 8). */
const DESKTOP_SINGLETONS = [
  'flight-filter-date-from',
  'flight-filter-date-to',
  'flight-filter-aircraft',
  'flight-filter-person',
  'flight-filter-type',
  'flight-filter-status',
  'logbook-new-button',
  'flight-form',
  'flight-type-select',
  'logbook-totals-row',
] as const;

const PAST_DATE = '2020-01-01';

async function login(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

type Aircraft = { id: string; registration: string };

async function createAircraftWithRate(page: Page, tag: string): Promise<Aircraft> {
  const registration = `I-L6${tag}`.slice(0, 20);
  const created = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Logbook 15.6', hourMeterMinutes: 60, seats: 2 },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  const rate = await page.request.post(`/api/v1/aircraft/${id}/rates`, { data: { priceCentsPerHour: 15000, validFrom: PAST_DATE } });
  expect(rate.status(), await rate.text()).toBe(201);
  return { id, registration };
}

type Person = { id: string; firstName: string; lastName: string; label: string };

function personOf(id: string, firstName: string, lastName: string): Person {
  return { id, firstName, lastName, label: `${lastName} ${firstName}` };
}

async function createPerson(page: Page, firstName: string, lastName: string, email?: string): Promise<{ id: string }> {
  const response = await page.request.post('/api/v1/people', { data: { firstName, lastName, ...(email ? { email } : {}) } });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as { id: string };
}

async function createPilot(page: Page, tag: string): Promise<Person> {
  const lastName = `Volo${tag}`;
  const { id } = await createPerson(page, 'Mobile', lastName);
  const profile = await page.request.put(`/api/v1/people/${id}/profiles/pilot`, { data: { licenseNumber: `IT-PPL-${tag}`, licenseType: 'PPL(A)' } });
  expect(profile.status(), await profile.text()).toBe(200);
  return personOf(id, 'Mobile', lastName);
}

async function createStudent(page: Page, tag: string): Promise<Person> {
  const lastName = `Allievo${tag}`;
  const { id } = await createPerson(page, 'Mobile', lastName);
  const profile = await page.request.put(`/api/v1/people/${id}/profiles/student`, { data: { courseStartDate: PAST_DATE } });
  expect(profile.status(), await profile.text()).toBe(200);
  return personOf(id, 'Mobile', lastName);
}

async function createInstructor(page: Page, tag: string): Promise<Person> {
  const lastName = `Istrut${tag}`;
  const { id } = await createPerson(page, 'Mobile', lastName);
  const profile = await page.request.put(`/api/v1/people/${id}/profiles/instructor`, { data: { ratings: 'FI(A)' } });
  expect(profile.status(), await profile.text()).toBe(200);
  const rate = await page.request.post(`/api/v1/people/${id}/instructor-rates`, { data: { priceCentsPerHour: 5000, validFrom: PAST_DATE } });
  expect(rate.status(), await rate.text()).toBe(201);
  return personOf(id, 'Mobile', lastName);
}

type FlightOverrides = {
  personId?: string;
  instructorPersonId?: string;
  flightType?: 'TOURISM' | 'SCHOOL' | 'AERIAL_WORK';
  departureAirfield?: string;
  arrivalAirfield?: string;
  takeoffs?: number;
  landings?: number;
  hourMeterStart?: number;
  hourMeterEnd?: number;
  notes?: string;
  minutes?: number;
};

/** `force`/`forceReason` on every fixture: the guard-rail's own catalogue is global and dirty (see the file header). */
async function registerFlight(page: Page, aircraftId: string, personId: string, flightDate: string, overrides: FlightOverrides = {}): Promise<{ id: string }> {
  const takeoffAt = `${flightDate}T10:00:00.000Z`;
  const landingAt = new Date(new Date(takeoffAt).getTime() + (overrides.minutes ?? 95) * 60_000).toISOString();
  const { minutes: _minutes, ...rest } = overrides;
  const response = await page.request.post('/api/v1/flights', {
    data: {
      aircraftId,
      personId,
      departureAirfield: 'Aviosuperficie Rovere',
      arrivalAirfield: 'Campo Ulivi',
      takeoffAt,
      landingAt,
      flightType: 'TOURISM',
      force: true,
      forceReason: 'Fixture e2e 15.6',
      ...rest,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as { flight: { id: string } };
  return body.flight;
}

async function cancelFlight(page: Page, id: string, reason: string): Promise<void> {
  const response = await page.request.post(`/api/v1/flights/${id}/cancel`, { data: { reason } });
  expect(response.status(), await response.text()).toBe(200);
}

/** Reads a flight back through the FILTERED API, never through "the list has N rows" (trappola 12.11 F1 / Billing-2 F4). */
async function readFlight(page: Page, aircraftId: string, id: string): Promise<{ status: string; cancelReason: string | null }> {
  const response = await page.request.get(`/api/v1/flights?aircraftId=${aircraftId}&pageSize=100`);
  expect(response.ok(), await response.text()).toBe(true);
  const body = (await response.json()) as { items: Array<{ id: string; status: string; cancelReason: string | null }> };
  const flight = body.items.find((item) => item.id === id);
  expect(flight, `flight ${id} in the filtered list`).toBeTruthy();
  return flight!;
}

/**
 * AC 9's four facts, measured after a REAL scroll to the end of the page (never
 * `scrollIntoViewIfNeeded`, which would hide exactly the defect: lesson 15.1
 * AC 6). Shared so the non-admin face is measured with the very same ruler as
 * the admin one (review LOW-2), never with a second, laxer copy.
 */
async function pageGeometry(page: Page): Promise<{ pageOverflow: number; atContentEnd: string | null; covered: string[]; scrollers: string[] }> {
  return page.evaluate(async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const content = document.querySelector('.page')!;
    const contentRect = content.getBoundingClientRect();
    const covered = [...document.querySelectorAll<HTMLElement>('.page a, .page button, .page input, .page select')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
      })
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const at = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return !!at?.closest('.mobile-tabbar');
      })
      .map((element) => element.getAttribute('data-testid') ?? element.className);
    // Declared exceptions: the KPI strip (15.2) and the chip strip (15.4)
    // scroll BY DESIGN; an ellipsised text node is not a hidden scroller
    // (lesson 15.5 §5-iv), it is the affordance itself.
    const scrollers = [...document.querySelectorAll<HTMLElement>('.page *')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .filter((element) => getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0)
      .filter((element) => !element.closest('.kpi-row') && !element.closest('.mobile-chip-strip'))
      .filter((element) => getComputedStyle(element).textOverflow !== 'ellipsis')
      .map((element) => `${element.className}: ${element.clientWidth}/${element.scrollWidth}`);
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      atContentEnd: document.elementFromPoint(contentRect.left + contentRect.width / 2, contentRect.bottom - 4)?.className ?? null,
      covered,
      scrollers,
    };
  });
}

/** The page scoped to ONE run-unique aircraft: the list then holds exactly this test's own flights. */
async function gotoLogbook(page: Page, aircraftId: string, extra = ''): Promise<void> {
  await page.goto(`/it/dashboard/logbook?aircraftId=${aircraftId}${extra}`);
  await expect(page.getByTestId('mobile-flights-list')).toBeAttached();
}

type MailpitSummary = { ID: string; Subject: string };

async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<{ Text: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
    const body = (await search.json()) as { messages: MailpitSummary[] };
    const found = body.messages.find((message) => message.Subject.includes(subjectIncludes));
    if (found) {
      const message = await fetch(`${MAILPIT_API}/message/${found.ID}`);
      return (await message.json()) as { Text: string };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}"`);
}

/** Gives an existing person a login of the given role, through the real invite flow. */
async function inviteUser(page: Page, personId: string, role: 'PILOT' | 'INSTRUCTOR' | 'STUDENT', password: string): Promise<string> {
  const email = `mob156-${role.toLowerCase()}-${uniqueSuffix().toLowerCase()}@airmanager.local`;
  const created = await page.request.post('/api/v1/users', { data: { email, roles: [role], personId } });
  expect(created.status(), await created.text()).toBe(201);
  const invite = await waitForMailpitMessage(email, 'invitato');
  const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(invite.Text);
  expect(match, 'set-password link in the invite email').toBeTruthy();
  const url = new URL(match![1]);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();
  return email;
}

test.describe('Registro voli mobile — lista a card (story 15.6, AC 1)', () => {
  test('at 375px the 1344px table is gone and the cards are there; at 1280px it is exactly the other way round', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-02');
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-03');

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);

    // BOTH sides, always: the table hidden AND the list visible.
    await expect(page.locator('.logbook')).toHaveCSS('display', 'none');
    await expect(page.getByTestId('mobile-flights-list')).toBeVisible();
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(2);
    // The desktop rows stay in the DOM (CSS-only switch) and stay as many as
    // the cards — no tree lost a row, none duplicated one.
    await expect(page.getByTestId('flight-row')).toHaveCount(2);

    // The card is ONE button with no interactive descendant (R3: the decision
    // lives in the sheet, so there is nothing to guard with stopPropagation).
    const card = page.getByTestId('flight-row-mobile').first();
    await expect(card).toHaveJSProperty('tagName', 'BUTTON');
    expect(await card.evaluate((element) => element.querySelectorAll('button, a, input, select, textarea, [tabindex]').length)).toBe(0);
    expect(await card.evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);

    // A speaking accessible name: marks AND date, never a bare "Apri".
    const name = await card.getAttribute('aria-label');
    expect(name).toContain(aircraft.registration);
    expect(name).toContain('03/03/2020');
    expect(name).toContain(pilot.label);

    // The template's own right column, on the card itself.
    await expect(card).toContainText('1:35');
    await expect(card).toContainText('237,50');
    // ...and the sub-line: data · DEP→ARR · tipo.
    await expect(card).toContainText('03/03/2020 · Aviosuperficie Rovere→Campo Ulivi · Turismo');

    await page.setViewportSize(DESKTOP);
    await expect(page.locator('.logbook-mobile')).toHaveCSS('display', 'none');
    await expect(page.locator('.logbook')).not.toHaveCSS('display', 'none');
    await expect(page.getByTestId('flight-row')).toHaveCount(2);
  });

  test('the empty state is ONE node per tree, and only the phone one is visible at 375px', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);
    await expect(page.getByTestId('mobile-flights-empty')).toHaveCount(1);
    await expect(page.getByTestId('mobile-flights-empty')).toBeVisible();
    await expect(page.getByTestId('flight-empty')).toHaveCount(1);
    await expect(page.getByTestId('flight-empty')).toBeHidden();
  });

  test('at 320px no text of a card is clipped WITHOUT an ellipsis, and nothing that can grow escapes the card', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    // Deliberately long: a real registration plus a long name plus a cancelled
    // badge is the widest a row can get.
    const student = await createStudent(page, tag);
    const instructor = await createInstructor(page, tag);
    const school = await registerFlight(page, aircraft.id, student.id, '2020-03-04', {
      flightType: 'SCHOOL',
      instructorPersonId: instructor.id,
      departureAirfield: 'Aviosuperficie di Collina Lunga',
      arrivalAirfield: 'Campo Volo Molto Lungo',
    });
    await cancelFlight(page, school.id, `Errore di trascrizione ${tag}`);

    await page.setViewportSize(PHONE_NARROW);
    await gotoLogbook(page, aircraft.id);
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(1);

    const clipped = await page.getByTestId('flight-row-mobile').evaluateAll((rows) =>
      rows.flatMap((row) =>
        [...row.querySelectorAll('span')]
          .filter((span) => span.scrollWidth > span.clientWidth + 1 && getComputedStyle(span).textOverflow !== 'ellipsis')
          .map((span) => `${span.className}: ${span.clientWidth}/${span.scrollWidth}`),
      ),
    );
    expect(clipped, 'text clipped with no ellipsis to say so').toEqual([]);

    // RECT containment, on top of the sweep: `text-overflow: ellipsis` hides an
    // overflow from `scrollWidth`, so a badge or a chip that ran past the card's
    // right edge would go unseen (lesson 15.5 F1/§12).
    const escaping = await page.getByTestId('flight-row-mobile').evaluateAll((rows) =>
      rows.flatMap((row) => {
        const rowRect = row.getBoundingClientRect();
        return [...row.querySelectorAll('span')]
          .filter((span) => span.getBoundingClientRect().width > 0)
          .filter((span) => span.getBoundingClientRect().right > rowRect.right + 0.5 || span.getBoundingClientRect().left < rowRect.left - 0.5)
          .map((span) => `${span.className}: ${Math.round(span.getBoundingClientRect().right - rowRect.right)}px past the card`);
      }),
    );
    expect(escaping, 'a child growing past its own card').toEqual([]);
  });

  test('the badge appears only on a row that is NOT ordinary, with cancellation winning over an override', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    const ordinary = await registerFlight(page, aircraft.id, pilot.id, '2020-03-05');
    const cancelled = await registerFlight(page, aircraft.id, pilot.id, '2020-03-06');
    await cancelFlight(page, cancelled.id, `Doppia registrazione ${tag}`);

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);

    // Every fixture flight is forced (see the header), so an ordinary row here
    // carries the "Deroga" chip and the cancelled one carries "Annullato" —
    // cancellation wins, exactly as the pure derivation says.
    const ordinaryRow = page.getByTestId('flight-row-mobile').filter({ hasText: '05/03/2020' });
    const cancelledRow = page.getByTestId('flight-row-mobile').filter({ hasText: '06/03/2020' });
    await expect(ordinaryRow).toContainText('Deroga');
    await expect(cancelledRow).toContainText('Annullato');
    await expect(cancelledRow).not.toContainText('Deroga');
    expect(ordinary.id).not.toBe(cancelled.id);
  });

  test('the anomaly chip PAINTS its dot on the card too, readable in both themes (review 15.6 MINOR-2)', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-07');
    const cancelled = await registerFlight(page, aircraft.id, pilot.id, '2020-03-08');
    await cancelFlight(page, cancelled.id, `Riga doppia ${tag}`);

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(2);

    // `Badge` is asked for `dot` on BOTH anomalies (warn "Deroga", bad
    // "Annullato"), and 15.5's `.mobile-row-flag .badge{ display: block }` used
    // to make that dot an INLINE box, where width/height simply do not apply:
    // measured 0x13 on the card while the SAME badge painted a 6x6 dot in the
    // sheet and on the desktop row. The guard measures the painted object, and
    // its contrast against its own pill (dot ink at `opacity: .7` composited
    // over the pill's background) — the review's own lesson: never report a
    // contrast for something that is not painted.
    for (const theme of ['light', 'dark'] as const) {
      const dots = await page.evaluate((wanted) => {
        document.documentElement.dataset['theme'] = wanted;
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        // Chromium reports `oklch(...)` verbatim: rasterising through a 1x1
        // canvas is the only honest way back to 0-255 sRGB (idiom of
        // `login.spec.ts`, and of the review's own probes).
        const toRgb = (color: string): number[] => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const luminance = (rgb: number[]): number => {
          const channel = (value: number): number => {
            const c = value / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * channel(rgb[0]!) + 0.7152 * channel(rgb[1]!) + 0.0722 * channel(rgb[2]!);
        };
        const ratio = (a: number[], b: number[]): number => {
          const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
          return (high + 0.05) / (low + 0.05);
        };
        return [...document.querySelectorAll<HTMLElement>('[data-testid="flight-row-mobile"] .mobile-row-flag .badge .b-dot')].map((dot) => {
          const badge = dot.parentElement!;
          const rect = dot.getBoundingClientRect();
          const pill = toRgb(getComputedStyle(badge).backgroundColor);
          const ink = toRgb(getComputedStyle(dot).backgroundColor);
          const alpha = Number(getComputedStyle(dot).opacity);
          const painted = ink.map((channel, index) => channel * alpha + pill[index]! * (1 - alpha));
          return {
            label: (badge.textContent ?? '').trim(),
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
            contrast: Math.round(ratio(painted, pill) * 100) / 100,
          };
        });
      }, theme);

      expect(dots.map((dot) => dot.label).sort(), `the two anomaly chips in ${theme}`).toEqual(['Annullato', 'Deroga']);
      for (const dot of dots) {
        expect(dot.width, `${dot.label} dot width in ${theme} (${JSON.stringify(dot)})`).toBeGreaterThanOrEqual(5);
        expect(dot.height, `${dot.label} dot height in ${theme} (${JSON.stringify(dot)})`).toBeGreaterThanOrEqual(5);
        expect(dot.contrast, `${dot.label} dot contrast in ${theme} (${JSON.stringify(dot)})`).toBeGreaterThanOrEqual(3);
      }
    }

    // Parity with the surface the same badge already painted it on: the sheet.
    await page.getByTestId('flight-row-mobile').filter({ hasText: '08/03/2020' }).click();
    const sheetDot = await page
      .locator('[data-testid="mobile-flight-sheet"] .badge .b-dot')
      .first()
      .evaluate((dot) => {
        const rect = dot.getBoundingClientRect();
        return { width: Math.round(rect.width * 100) / 100, height: Math.round(rect.height * 100) / 100 };
      });
    expect(sheetDot.width, 'the sheet dot the card must now match').toBeGreaterThanOrEqual(5);
    expect(sheetDot.height, 'the sheet dot the card must now match').toBeGreaterThanOrEqual(5);
  });
});

test.describe('Registro voli mobile — sheet di dettaglio (story 15.6, AC 2/3)', () => {
  test('a card opened FROM THE KEYBOARD shows the whole desktop row plus what the table has no room for, in ONE sheet', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const student = await createStudent(page, tag);
    const instructor = await createInstructor(page, tag);
    await registerFlight(page, aircraft.id, student.id, '2020-03-07', {
      flightType: 'SCHOOL',
      instructorPersonId: instructor.id,
      takeoffs: 4,
      landings: 4,
      hourMeterStart: 1200,
      hourMeterEnd: 1295,
      notes: 'Circuiti e riattaccate',
    });

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);

    // Real keyboard, never `focus()`: the card must BE in the tab order.
    const card = page.getByTestId('flight-row-mobile').first();
    await card.focus();
    await expect(card).toBeFocused();
    await page.keyboard.press('Enter');

    const sheet = page.getByTestId('mobile-flight-sheet');
    await expect(sheet).toHaveCount(1);
    await expect(sheet).toBeVisible();

    // Parity, enumerated against the eleven desktop columns...
    const rows = Object.fromEntries(
      await sheet.locator('.bottom-sheet-kv').evaluateAll((items) =>
        items.map((item) => [item.querySelector('.bottom-sheet-k')!.textContent!, item.querySelector('.bottom-sheet-v')!.textContent!]),
      ),
    );
    expect(rows['Data']).toBe('07/03/2020');
    expect(rows['Tratta']).toBe('Aviosuperficie Rovere→Campo Ulivi');
    expect(rows['Pilota']).toBe(student.label);
    expect(rows['Istruttore']).toBe(instructor.label);
    // PIC of a SCHOOL dual flight is the instructor (story 11.2 / 12.8 AC 2).
    expect(rows['PIC']).toBe(instructor.label);
    expect(rows['Aereo']).toBe(aircraft.registration);
    expect(rows['Tipo']).toBe('Scuola');
    expect(rows['Ore']).toBe('1:35');
    expect(rows['Decolli']).toBe('4');
    expect(rows['Atterraggi']).toBe('4');
    expect(rows['Costo']).toBeTruthy();
    // ...and the three the desktop table has no room for (ratifica R-15.6-b).
    expect(rows['Orari']).toMatch(/^\d{2}:\d{2} – \d{2}:\d{2}$/);
    expect(rows['Contaore']).toBe('1200 – 1295');
    expect(rows['Note']).toBe('Circuiti e riattaccate');
    // The admin sees the motivo of the override; the row is forced by fixture.
    expect(rows['Deroga']).toBe('Fixture e2e 15.6');

    // The accessible name is asserted as a PROPERTY. `split(' — ').length` was
    // GREEN on the very case it was meant to forbid (review 15.5 F1).
    const name = (await sheet.locator('[role="dialog"]').getAttribute('aria-label')) ?? '';
    expect(name).toContain(aircraft.registration);
    expect(name).not.toMatch(/—\s*—/);
    expect(name).not.toMatch(/·\s*·/);
    expect(name.trim()).not.toMatch(/(^|[·—]\s*)—(\s*[·—]|$)/);
    for (const segment of name.split(/\s+[·—]\s+/)) {
      expect(segment.trim(), `empty or placeholder segment in "${name}"`).not.toBe('');
      expect(segment.trim()).not.toBe('—');
    }

    // Escape closes it and hands focus back to the card that opened it.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-flight-sheet')).toHaveCount(0);
    await expect(card).toBeFocused();
  });

  test('a flight with NO instructor still produces a well-formed name and an honest "—" in the row', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-08');

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);
    await page.getByTestId('flight-row-mobile').first().click();

    const sheet = page.getByTestId('mobile-flight-sheet');
    const name = (await sheet.locator('[role="dialog"]').getAttribute('aria-label')) ?? '';
    expect(name).not.toMatch(/—\s*—/);
    expect(name).not.toMatch(/·\s*·/);
    for (const segment of name.split(/\s+[·—]\s+/)) {
      expect(segment.trim()).not.toBe('');
      expect(segment.trim()).not.toBe('—');
    }
    // The placeholder belongs to what is DISPLAYED, never to the composed name.
    const instructorRow = sheet.locator('.bottom-sheet-kv').filter({ hasText: 'Istruttore' });
    await expect(instructorRow).toContainText('—');
    // The card's sub-line simply drops the CFI segment instead of padding it.
    await expect(page.getByTestId('flight-row-mobile').first()).not.toContainText('CFI');
  });

  test('the admin gets both decisions, a cancelled row gets none but keeps its motivo, and "Modifica" closes the sheet before opening the panel', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-09');
    const cancelled = await registerFlight(page, aircraft.id, pilot.id, '2020-03-10');
    await cancelFlight(page, cancelled.id, `Motivo leggibile ${tag}`);

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);

    await page.getByTestId('flight-row-mobile').filter({ hasText: '10/03/2020' }).click();
    await expect(page.getByTestId('mobile-flight-sheet')).toBeVisible();
    await expect(page.getByTestId('flight-correct-action-mobile')).toHaveCount(0);
    await expect(page.getByTestId('flight-cancel-action-mobile')).toHaveCount(0);
    await expect(page.getByTestId('mobile-flight-sheet')).toContainText(`Motivo leggibile ${tag}`);
    await page.keyboard.press('Escape');

    await page.getByTestId('flight-row-mobile').filter({ hasText: '09/03/2020' }).click();
    await expect(page.getByTestId('flight-correct-action-mobile')).toBeVisible();
    await expect(page.getByTestId('flight-cancel-action-mobile')).toBeVisible();
    for (const testId of ['flight-correct-action-mobile', 'flight-cancel-action-mobile']) {
      const height = await page.getByTestId(testId).evaluate((element) => Math.round(element.getBoundingClientRect().height));
      expect(height, testId).toBeGreaterThanOrEqual(44);
    }

    // AD-9: no z-50 panel stacked on a z-40 sheet.
    await page.getByTestId('flight-correct-action-mobile').click();
    await expect(page.getByTestId('mobile-flight-sheet')).toHaveCount(0);
    await expect(page.getByTestId('flight-form')).toBeVisible();
  });
});

test.describe('Registro voli mobile — storno nello sheet (story 15.6, AC 4)', () => {
  test('an empty motivo makes ZERO requests, a real one cancels the flight and the row says so', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    const flight = await registerFlight(page, aircraft.id, pilot.id, '2020-03-11');

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);

    // Counted on the wire, not inferred from the absence of a toast.
    let cancelRequests = 0;
    await page.route('**/api/v1/flights/*/cancel', async (route) => {
      cancelRequests += 1;
      await route.continue();
    });

    await page.getByTestId('flight-row-mobile').first().click();
    await page.getByTestId('flight-cancel-action-mobile').click();

    // The second step lives in the SAME dialog, and the focus follows it there.
    await expect(page.getByTestId('mobile-flight-sheet')).toHaveCount(1);
    await expect(page.getByTestId('flight-cancel-reason-mobile')).toBeFocused();
    await expect(page.getByTestId('mobile-flight-sheet').locator('.bottom-sheet-kv')).toHaveCount(0);

    await page.getByTestId('flight-cancel-confirm-mobile').click();
    await expect(page.getByTestId('flight-cancel-required-mobile')).toBeVisible();
    expect(cancelRequests, 'an empty motivo must never reach the network').toBe(0);
    expect((await readFlight(page, aircraft.id, flight.id)).status).toBe('REGISTERED');

    // Going back returns the focus to the button that opened the step.
    await page.getByTestId('flight-cancel-dismiss-mobile').click();
    await expect(page.getByTestId('flight-correct-action-mobile')).toBeFocused();

    await page.getByTestId('flight-cancel-action-mobile').click();
    await page.getByTestId('flight-cancel-reason-mobile').fill(`Storno dal telefono ${tag}`);
    await page.getByTestId('flight-cancel-confirm-mobile').click();

    await expect(page.getByTestId('mobile-flight-sheet')).toHaveCount(0);
    await expect(page.getByTestId('toast')).toContainText('Volo annullato');
    expect(cancelRequests).toBe(1);

    // The truth is read from the API on the run-unique flight, never from "the
    // list has N rows" (trappola 12.11 F1 / Billing-2 F4).
    const after = await readFlight(page, aircraft.id, flight.id);
    expect(after.status).toBe('CANCELLED');
    expect(after.cancelReason).toBe(`Storno dal telefono ${tag}`);

    // ...and both trees show it.
    await expect(page.getByTestId('flight-row-mobile').first()).toContainText('Annullato');
    await page.setViewportSize(DESKTOP);
    await expect(page.getByTestId('flight-status-badge')).toHaveCount(1);
  });
});

test.describe('Registro voli mobile — filtri in linguaggio mobile (story 15.6, AC 5/7)', () => {
  test('the head shrinks under its pre-fix height while every control grows to 44px, in both locales', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-12');

    await page.setViewportSize(PHONE);
    for (const path of [`/it/dashboard/logbook?aircraftId=${aircraft.id}`, `/en/dashboard/logbook?aircraftId=${aircraft.id}`]) {
      await page.goto(path);
      await expect(page.getByTestId('mobile-flights-list')).toBeVisible();
      const head = await page.locator('.logbook-head').evaluate((element) => Math.round(element.getBoundingClientRect().height));
      const chips = await page.getByTestId('mobile-flight-status-chips').evaluate((element) => Math.round(element.getBoundingClientRect().height));
      expect(head + chips, `head + chips at ${path}`).toBeLessThanOrEqual(HEAD_PRE_FIX_PX);

      const targets = await page.evaluate(() => {
        const heights: Record<string, number> = {};
        for (const testId of ['flight-filter-person', 'mobile-flight-filters-button', 'logbook-new-button']) {
          const element = document.querySelector(`[data-testid="${testId}"]`);
          if (element) heights[testId] = Math.round(element.getBoundingClientRect().height);
        }
        const exportTrigger = document.querySelector('.logbook-head > div > .btn');
        if (exportTrigger) heights['export'] = Math.round(exportTrigger.getBoundingClientRect().height);
        for (const chip of document.querySelectorAll('.mobile-chip-strip > .btn')) {
          heights[chip.getAttribute('data-testid') ?? 'chip'] = Math.round(chip.getBoundingClientRect().height);
        }
        return heights;
      });
      expect(Object.keys(targets).length).toBeGreaterThanOrEqual(6);
      for (const [name, height] of Object.entries(targets)) {
        expect(height, `${name} at ${path}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('the "Filtri" panel applies in ONE navigation, counts what it hides, and azzera clears everything', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const student = await createStudent(page, tag);
    const instructor = await createInstructor(page, tag);
    await registerFlight(page, aircraft.id, student.id, '2020-03-13', { flightType: 'SCHOOL', instructorPersonId: instructor.id });
    await registerFlight(page, aircraft.id, student.id, '2020-03-14', { flightType: 'SCHOOL', instructorPersonId: instructor.id });

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);

    // Every navigation of this page remounts the console (`page.tsx`'s `key`),
    // so a panel that navigated per change would close itself: counting the
    // navigations is what proves AD-4, not "the panel is still open".
    const urlBeforePanel = page.url();
    const navigatedTo: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && frame.url() !== urlBeforePanel) navigatedTo.push(frame.url());
    });

    await page.getByTestId('mobile-flight-filters-button').click();
    await expect(page.getByTestId('flight-filter-type-mobile')).toBeVisible();
    await page.getByTestId('flight-filter-date-from-mobile').fill('2020-03-14');
    await page.getByTestId('flight-filter-type-mobile').selectOption('SCHOOL');
    // Still open, still nowhere: not one navigation yet.
    await expect(page.getByTestId('flight-filter-type-mobile')).toBeVisible();
    expect(page.url(), 'the panel must not navigate while it collects').toBe(urlBeforePanel);
    expect(navigatedTo, 'the panel must not navigate while it collects').toEqual([]);

    await page.getByTestId('mobile-flight-filters-apply').click();
    await expect(page).toHaveURL(/dateFrom=2020-03-14/);
    await expect(page).toHaveURL(/flightType=SCHOOL/);
    await expect(page).toHaveURL(new RegExp(`aircraftId=${aircraft.id}`));
    // ONE navigation, and it already carries BOTH filters: navigating per
    // change would have produced an intermediate URL with only the first one —
    // and would have remounted the console, closing the panel mid-edit (AD-4).
    expect(navigatedTo.length, `apply must be ONE navigation, got ${navigatedTo.join(' | ')}`).toBe(1);
    expect(navigatedTo[0]).toContain('flightType=SCHOOL');
    expect(navigatedTo[0]).toContain('dateFrom=2020-03-14');
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(1);

    // The trigger declares how many hidden filters are on (periodo + tipo).
    await expect(page.getByTestId('mobile-flight-filters-button')).toHaveText('Filtri (3)');

    await page.getByTestId('mobile-flight-filters-button').click();
    await page.getByTestId('flight-filter-reset-mobile').click();
    await expect(page).toHaveURL(/\/dashboard\/logbook$/);
    await expect(page.getByTestId('mobile-flight-filters-button')).toHaveText('Filtri');
  });

  test('a search still in its debounce cannot pull the panel shut under the thumb, and its text is not lost (review 15.6 MINOR-1)', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    const other = await createPilot(page, `W${tag}`);
    // Both TOURISM: what narrows the list here is the SEARCH, so the panel's
    // own filter can be applied without changing which rows can match.
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-26');
    await registerFlight(page, aircraft.id, other.id, '2020-03-27');

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(2);
    const urlBeforePanel = page.url();

    // The exact sequence that used to lose the tap: type a name, open "Filtri"
    // straight away. The 400ms debounce of the search was still pending, and
    // ITS navigation remounted the console (`page.tsx`'s `key`) — the panel
    // opened and vanished ~400ms later, the very failure AD-4 calls
    // unacceptable, coming through the one door AD-4 did not close.
    await page.getByTestId('flight-filter-person').fill(pilot.lastName);
    await page.getByTestId('mobile-flight-filters-button').click();
    await expect(page.getByTestId('flight-filter-type-mobile')).toBeVisible();
    await page.waitForTimeout(1_200); // well past the 400ms debounce
    await expect(page.getByTestId('flight-filter-type-mobile'), 'the panel must survive a pending debounce').toBeVisible();
    expect(page.url(), 'no navigation may happen while the panel is open').toBe(urlBeforePanel);

    // The typed name is not lost: the panel took the pending search over, and
    // "Applica" carries it in the SAME single navigation as its own filters.
    await page.getByTestId('flight-filter-type-mobile').selectOption('TOURISM');
    await page.getByTestId('mobile-flight-filters-apply').click();
    await expect(page).toHaveURL(new RegExp(`personQuery=${pilot.lastName}`));
    await expect(page).toHaveURL(/flightType=TOURISM/);
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(1);
    await expect(page.getByTestId('flight-filter-person')).toHaveValue(pilot.lastName);

    // Dismissing the panel instead of applying it discards the panel's own
    // edits, never the typing that preceded it: the search re-arms and lands.
    await page.getByTestId('flight-filter-person').fill(other.lastName);
    await page.getByTestId('mobile-flight-filters-button').click();
    await expect(page.getByTestId('flight-filter-type-mobile')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`personQuery=${other.lastName}`));
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(1);
    await expect(page.getByTestId('flight-row-mobile')).toContainText(other.label);
  });

  test('the status chips are the one filter left in plain sight, and they round-trip through the URL', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-15');
    const cancelled = await registerFlight(page, aircraft.id, pilot.id, '2020-03-16');
    await cancelFlight(page, cancelled.id, `Storno per chip ${tag}`);

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(2);
    await expect(page.getByTestId('mobile-flight-status-chip-all')).toHaveAttribute('aria-current', 'true');

    await page.getByTestId('mobile-flight-status-chip-CANCELLED').click();
    await expect(page).toHaveURL(/status=CANCELLED/);
    await expect(page).toHaveURL(new RegExp(`aircraftId=${aircraft.id}`));
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(1);
    await expect(page.getByTestId('mobile-flight-status-chip-CANCELLED')).toHaveAttribute('aria-current', 'true');
    // The desktop `<select>` reads the same state — one source of truth.
    await expect(page.getByTestId('flight-filter-status')).toHaveValue('CANCELLED');

    await page.getByTestId('mobile-flight-status-chip-REGISTERED').click();
    await expect(page).toHaveURL(/status=REGISTERED/);
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(1);
    await expect(page.getByTestId('flight-row-mobile')).toContainText('15/03/2020');
  });

  test('the person search stays on the head and the export href keeps carrying the list filters', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    const other = await createPilot(page, `X${tag}`);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-17');
    await registerFlight(page, aircraft.id, other.id, '2020-03-18');

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(2);

    await page.getByTestId('flight-filter-person').fill(pilot.lastName);
    await expect(page).toHaveURL(new RegExp(`personQuery=${pilot.lastName}`));
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(1);

    // The menu's entries only exist while it is open (`ExportMenu`).
    await page.locator('.logbook-head > div > .btn').click();
    const exportHref = await page.locator('.logbook-head a[href*="/api/v1/flights"]').first().getAttribute('href');
    expect(exportHref).toContain(`aircraftId=${aircraft.id}`);
    expect(exportHref).toContain(`personQuery=${pilot.lastName}`);
  });

  test('the ?personId= deep link of the scheda persona still round-trips on a phone', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    const other = await createPilot(page, `Y${tag}`);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-19');
    await registerFlight(page, aircraft.id, other.id, '2020-03-20');

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id, `&personId=${pilot.id}`);
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(1);
    await expect(page.getByTestId('flight-row-mobile')).toContainText(pilot.label);

    // A chip tap keeps the deep-link scope (the desktop `<select>` does the same).
    await page.getByTestId('mobile-flight-status-chip-REGISTERED').click();
    await expect(page).toHaveURL(new RegExp(`personId=${pilot.id}`));
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(1);
  });
});

test.describe('Registro voli mobile — form a tutto schermo (story 15.6, AC 6)', () => {
  test('the panel is the viewport, its action is anchored at 44px and hit-testable even where the body really scrolls', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.setViewportSize(PHONE_SHORT);
    await page.goto('/it/dashboard/logbook');
    await page.getByTestId('logbook-new-button').click();
    await expect(page.getByTestId('flight-form')).toBeVisible();

    const geometry = await page.evaluate(() => {
      const panel = document.querySelector('.slideover.open .slideover-panel')!;
      const body = document.querySelector<HTMLElement>('.slideover.open .so-body')!;
      const foot = document.querySelector('.slideover.open .so-foot')!;
      const submit = document.querySelector<HTMLElement>('.slideover.open .so-foot .btn.primary')!;
      body.scrollTop = 0;
      const rect = submit.getBoundingClientRect();
      const at = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        panel: panel.getBoundingClientRect().toJSON(),
        borderLeft: getComputedStyle(panel).borderLeftWidth,
        bodyScrolls: body.scrollHeight > body.clientHeight,
        footBottom: Math.round(foot.getBoundingClientRect().bottom),
        submitHeight: Math.round(rect.height),
        hit: at === submit || submit.contains(at) ? 'self' : (at as HTMLElement)?.className,
        soActions: document.querySelectorAll('.slideover.open .so-actions').length,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    });
    expect(Math.round(geometry.panel.width)).toBe(geometry.viewport.width);
    expect(Math.round(geometry.panel.height)).toBe(geometry.viewport.height);
    expect(geometry.borderLeft).toBe('0px');
    expect(geometry.bodyScrolls, 'this viewport is the one where the body really scrolls').toBe(true);
    expect(geometry.footBottom).toBe(geometry.viewport.height);
    expect(geometry.submitHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.hit).toBe('self');
    // AD-6: the action already lives in `.so-foot`; a second anchored bar would
    // be two of them in one panel.
    expect(geometry.soActions).toBe(0);
  });

  test('the expiry guard names document, state and owner at 375px, and the deroga needs a real motivo before any request', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    // NO `ensureValidSeedExpiries`: a brand-new person has none of the blocking
    // documents, so the guard-rail of 14.4 must refuse the registration.
    const pilot = await createPilot(page, tag);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/logbook');
    await page.getByTestId('logbook-new-button').click();
    await expect(page.getByTestId('flight-form')).toBeVisible();

    await page.getByTestId('flight-aircraft').click();
    await page.getByTestId('flight-aircraft').fill(aircraft.registration);
    await page.getByRole('listbox').getByRole('option', { name: aircraft.registration, exact: true }).click();
    await page.getByTestId('flight-person').click();
    await page.getByTestId('flight-person').fill(pilot.lastName);
    await page.getByRole('listbox').getByRole('option', { name: pilot.label, exact: true }).click();
    // Data, tratta e movimenti arrivano gia' compilati dai default del form.
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:00');
    await page.getByRole('button', { name: 'Registra volo' }).click();

    const error = page.getByTestId('flight-form-error');
    await expect(error).toBeVisible();
    // The banner must name the document, its state and WHOSE it is (review 14.4 F5/F6).
    await expect(error).toContainText('pilota');
    expect((await error.textContent()) ?? '').toMatch(/assente|scadut/i);
    // The server composes the owner as "firstName lastName" while the registry
    // labels a person "lastName firstName" — the assertion is on the two parts,
    // not on one arbitrary order.
    expect((await error.textContent()) ?? '').toContain(pilot.lastName);
    expect((await error.textContent()) ?? '').toContain(pilot.firstName);

    // The deroga only exists for `flights.forceExpiry`, and only after a 422.
    const force = page.getByTestId('force-flight-section');
    await expect(force).toBeVisible();

    let flightRequests = 0;
    await page.route('**/api/v1/flights', async (route) => {
      if (route.request().method() === 'POST') flightRequests += 1;
      await route.continue();
    });
    await page.getByTestId('force-flight-submit').click();
    await expect(page.getByTestId('force-flight-error')).toBeVisible();
    expect(flightRequests, 'an empty forceReason must never reach the network').toBe(0);

    await page.getByTestId('force-flight-reason').fill(`Deroga dal telefono ${tag}`);
    await page.getByTestId('force-flight-submit').click();
    await expect(page.getByTestId('flight-result-panel')).toBeVisible();
    await expect(page.getByTestId('flight-forced-result')).toBeVisible();
    expect(flightRequests).toBe(1);
  });

  test('closing and reopening the panel wipes the pending force payload (review 14.4 F1)', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const blocked = await createPilot(page, tag);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/logbook');
    await page.getByTestId('logbook-new-button').click();
    await page.getByTestId('flight-aircraft').click();
    await page.getByTestId('flight-aircraft').fill(aircraft.registration);
    await page.getByRole('listbox').getByRole('option', { name: aircraft.registration, exact: true }).click();
    await page.getByTestId('flight-person').click();
    await page.getByTestId('flight-person').fill(blocked.lastName);
    await page.getByRole('listbox').getByRole('option', { name: blocked.label, exact: true }).click();
    // Data, tratta e movimenti arrivano gia' compilati dai default del form.
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:00');
    await page.getByRole('button', { name: 'Registra volo' }).click();
    await expect(page.getByTestId('force-flight-section')).toBeVisible();

    // Close and reopen: the panel is rebuilt (`key`), so nothing of the refused
    // payload survives — the defect F1 shipped was a flight registered for the
    // WRONG pilot after exactly this sequence.
    await page.getByRole('button', { name: 'Chiudi' }).click();
    // A closed `SlideOver` keeps its subtree mounted (which is what makes
    // `flight-form` ONE node at every width): "closed" is the panel losing its
    // `open` class, not the form leaving the DOM.
    await expect(page.locator('.slideover.open')).toHaveCount(0);
    await page.getByTestId('logbook-new-button').click();
    await expect(page.locator('.slideover.open')).toHaveCount(1);
    await expect(page.getByTestId('force-flight-section')).toHaveCount(0);
    await expect(page.getByTestId('flight-form-error')).toHaveCount(0);
    await expect(page.getByTestId('flight-person')).toHaveValue('');
  });

  test('in correzione the flight type is never disabled, and in a new registration disabled implies SCHOOL (invariante 14.3)', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-21');
    // The person becomes student-only AFTER the flight: on the desktop this is
    // the case that used to rewrite the type to SCHOOL and corrupt the record.
    const deactivate = await page.request.post(`/api/v1/people/${pilot.id}/profiles/pilot/deactivate`);
    expect(deactivate.status(), await deactivate.text()).toBe(200);
    const student = await page.request.put(`/api/v1/people/${pilot.id}/profiles/student`, { data: { courseStartDate: PAST_DATE } });
    expect(student.status(), await student.text()).toBe(200);

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);
    await page.getByTestId('flight-row-mobile').first().click();
    await page.getByTestId('flight-correct-action-mobile').click();
    await expect(page.getByTestId('flight-form')).toBeVisible();

    const typeSelect = page.getByTestId('flight-type-select');
    await expect(typeSelect).toBeEnabled();
    await expect(typeSelect).toHaveValue('TOURISM');
    // The `studentOnlyCorrectionHint` that accompanies this case is NOT asserted
    // here: in correzione the profile of the flight's person is known only if
    // that person is inside the server-rendered `personOptions` page, capped at
    // `OPTIONS_PAGE_SIZE = 100` (the picker TD this story subscribes to). On a
    // full-suite DB with hundreds of people the fixture falls outside it and the
    // hint legitimately does not render — asserting it would be assuming "my
    // fixture is on page 1", the isolation rule this file is built on. The
    // INVARIANT (never disabled, value at file) holds either way, which is the
    // one that used to corrupt records.

    // The same derivation, on the other branch: a NEW registration for the same
    // person locks the type, and locked can only ever mean SCHOOL.
    await page.getByRole('button', { name: 'Chiudi' }).click();
    await page.getByTestId('logbook-new-button').click();
    await page.getByTestId('flight-person').click();
    await page.getByTestId('flight-person').fill(pilot.lastName);
    await page.getByRole('listbox').getByRole('option', { name: pilot.label, exact: true }).click();
    await expect(typeSelect).toBeDisabled();
    await expect(typeSelect).toHaveValue('SCHOOL');
  });

  test('the Idempotency-Key travels on the registration only, never on a correction, and is regenerated after every response', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const blocked = await createPilot(page, tag);

    const keys: Array<string | undefined> = [];
    const correctKeys: Array<string | undefined> = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST') return;
      const url = new URL(request.url());
      if (url.pathname === '/api/v1/flights') keys.push(request.headers()['idempotency-key']);
      if (url.pathname.endsWith('/correct')) correctKeys.push(request.headers()['idempotency-key']);
    });

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/logbook');
    await page.getByTestId('logbook-new-button').click();
    await page.getByTestId('flight-aircraft').click();
    await page.getByTestId('flight-aircraft').fill(aircraft.registration);
    await page.getByRole('listbox').getByRole('option', { name: aircraft.registration, exact: true }).click();
    await page.getByTestId('flight-person').click();
    await page.getByTestId('flight-person').fill(blocked.lastName);
    await page.getByRole('listbox').getByRole('option', { name: blocked.label, exact: true }).click();
    // Data, tratta e movimenti arrivano gia' compilati dai default del form.
    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('11:00');
    await page.getByRole('button', { name: 'Registra volo' }).click();
    await expect(page.getByTestId('force-flight-section')).toBeVisible();
    await page.getByTestId('force-flight-reason').fill(`Deroga idempotente ${tag}`);
    await page.getByTestId('force-flight-submit').click();
    await expect(page.getByTestId('flight-result-panel')).toBeVisible();

    expect(keys.length, 'first submit + force re-send').toBe(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    // CORRECTION to the story's own §a.5 n.6: the key is regenerated after ANY
    // http response, the 422 included — `use-idempotency-key.ts`'s doc-comment
    // (TD-2 AC 6) states it, `flight-editor.tsx` calls `regenerateIdempotency
    // Key()` right after the fetch resolves, and it is the SAFE behaviour: the
    // rejected attempt already owns the old key server-side, so reusing it
    // could replay the rejection instead of registering the flight. Only a
    // NETWORK failure (no response at all) keeps the key.
    expect(keys[1]).not.toBe(keys[0]);

    // A correction is not an idempotent creation and must NOT carry one.
    await page.getByTestId('flight-result-close').click();
    await gotoLogbook(page, aircraft.id);
    await page.getByTestId('flight-row-mobile').first().click();
    await page.getByTestId('flight-correct-action-mobile').click();
    await page.getByLabel('Motivo della correzione').fill(`Correzione ${tag}`);
    await page.getByRole('button', { name: 'Conferma correzione' }).click();
    await expect(page.getByTestId('flight-result-panel')).toBeVisible();
    expect(correctKeys.length).toBe(1);
    expect(correctKeys[0]).toBeUndefined();
  });
});

test.describe('Registro voli mobile — geometria, testid e totali (story 15.6, AC 7/8/9)', () => {
  test('nothing overflows, nothing hides a scroller, nothing ends under the tab bar', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-22');

    for (const viewport of [PHONE_NARROW, PHONE, PHONE_WIDE]) {
      await page.setViewportSize(viewport);
      await gotoLogbook(page, aircraft.id);
      const geometry = await pageGeometry(page);
      expect(geometry.pageOverflow, `page overflow at ${viewport.width}px`).toBe(0);
      expect(geometry.covered, `controls under the tab bar at ${viewport.width}px`).toEqual([]);
      expect(geometry.scrollers, `hidden inner scrollers at ${viewport.width}px`).toEqual([]);
      expect(geometry.atContentEnd, `what is painted at the end of the page at ${viewport.width}px`).not.toContain('mobile-tabbar');
    }
  });

  test('every desktop testid of this page is still exactly one node, at 375px and at 1280px, here and on the Panoramica', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-23');

    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await gotoLogbook(page, aircraft.id);
      for (const testId of DESKTOP_SINGLETONS) {
        await expect(page.getByTestId(testId), `${testId} at ${viewport.width}px`).toHaveCount(1);
      }
      // The row-level ones are as many as the rows, and the two trees agree.
      const desktopRows = await page.getByTestId('flight-row').count();
      expect(await page.getByTestId('flight-row-mobile').count()).toBe(desktopRows);

      // `FlightEditor` is mounted on the Panoramica too (§a.7): a testid added
      // inside it would multiply there.
      await page.goto('/it/dashboard');
      await expect(page.getByTestId('dispatch-flight-button')).toHaveCount(1);
      await expect(page.getByTestId('flight-form')).toHaveCount(1);
      await expect(page.getByTestId('mobile-flight-sheet')).toHaveCount(0);
      await expect(page.getByTestId('flight-row-mobile')).toHaveCount(0);
    }
  });

  test('the KPI strip really carries the four numbers the Totali row shows (ratifica R-15.6-i)', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-24', { takeoffs: 3, landings: 3 });
    await registerFlight(page, aircraft.id, pilot.id, '2020-03-25', { takeoffs: 2, landings: 2 });

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id);

    // MEASURED, never deduced: if the two sources ever diverged this would say so.
    const kpi = await page.locator('.kpi-row .kpi-value').allTextContents();
    const totals = await page.locator('[data-testid="logbook-totals-row"] .mono.num').allTextContents();
    expect(totals.length).toBe(4);
    expect(kpi[1]!.trim()).toBe(totals[0]!.trim());
    expect(kpi[2]!.trim()).toBe(`${totals[1]!.trim()} / ${totals[2]!.trim()}`);
    expect(kpi[3]!.trim()).toBe(totals[3]!.trim());
    // The Totali row itself stays a desktop-only node, and one node only.
    await expect(page.getByTestId('logbook-totals-row')).toHaveCount(1);
    await expect(page.getByTestId('logbook-totals-row')).toBeHidden();
  });

  test('the pagination keeps its contract, grows to 44px and stays above the tab bar', async ({ page }) => {
    const tag = uniqueSuffix();
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    // 21 flights on ONE run-unique aircraft: two pages of a filtered list.
    for (let index = 0; index < 21; index += 1) {
      const day = String((index % 28) + 1).padStart(2, '0');
      await registerFlight(page, aircraft.id, pilot.id, `2020-04-${day}`, { minutes: 30 + index });
    }

    await page.setViewportSize(PHONE);
    await gotoLogbook(page, aircraft.id, '&flightType=TOURISM');
    await expect(page.getByTestId('flight-pagination-status')).toHaveText('1 / 2');
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(20);

    for (const testId of ['flight-page-prev', 'flight-page-next']) {
      const height = await page.getByTestId(testId).evaluate((element) => Math.round(element.getBoundingClientRect().height));
      expect(height, testId).toBeGreaterThanOrEqual(44);
    }
    const hit = await page.getByTestId('flight-page-next').evaluate(async (element) => {
      // Scrolled to the very end of the page, never `scrollIntoViewIfNeeded`:
      // that would hide exactly the defect this asserts (lesson 15.1 AC 6).
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const rect = element.getBoundingClientRect();
      const at = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return at === element || element.contains(at) ? 'self' : (at as HTMLElement)?.className;
    });
    expect(hit).toBe('self');

    await page.getByTestId('flight-page-next').click();
    await expect(page.getByTestId('flight-pagination-status')).toHaveText('2 / 2');
    await expect(page).toHaveURL(new RegExp(`aircraftId=${aircraft.id}`));
    await expect(page).toHaveURL(/flightType=TOURISM/);
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(1);
  });
});

test.describe('Registro voli mobile — le due facce (story 15.6, AC 12)', () => {
  test('a pilot gets the same card without any action, and no mobile twin of the admin-only controls', async ({ page }) => {
    const tag = uniqueSuffix();
    const password = `Mobile156-${tag}!`;
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const pilot = await createPilot(page, tag);
    const flight = await registerFlight(page, aircraft.id, pilot.id, '2020-05-02');
    const email = await inviteUser(page, pilot.id, 'PILOT', password);

    await page.context().clearCookies();
    await page.goto('/it/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard$/);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/logbook');
    await expect(page.getByTestId('mobile-flights-list')).toBeVisible();
    await expect(page.getByTestId('flight-row-mobile')).toHaveCount(1);
    await expect(page.getByTestId('flight-row-mobile')).toContainText(aircraft.registration);

    // The desktop assertions of `flight-log.spec.ts` on the self-service face.
    for (const testId of ['flight-form', 'flight-cancel-action', 'flight-correct-action', 'flight-filter-aircraft', 'flight-filter-person', 'logbook-new-button']) {
      await expect(page.getByTestId(testId), testId).toHaveCount(0);
    }

    // The sheet is there for everybody (ratifica R-15.6-c) — with no action, and
    // with no motivo of an override it is not allowed to see. The phone twins
    // are asserted HERE, with the sheet OPEN: closed, those nodes do not exist
    // for anybody (an admin included, measured), so counting them on a closed
    // page proves nothing (review LOW-1).
    await page.getByTestId('flight-row-mobile').click();
    await expect(page.getByTestId('mobile-flight-sheet')).toHaveCount(1);
    await expect(page.getByTestId('mobile-flight-sheet').locator('.bottom-sheet-actions')).toHaveCount(0);
    await expect(page.getByTestId('flight-cancel-action-mobile'), 'the admin gets this one inside the very same sheet').toHaveCount(0);
    await expect(page.getByTestId('flight-correct-action-mobile'), 'the admin gets this one inside the very same sheet').toHaveCount(0);
    await expect(page.getByTestId('mobile-flight-sheet')).not.toContainText('Fixture e2e 15.6');
    // ...but the panel of the filters it DOES have is still reachable, and it
    // is there — panel OPEN — that the velivolo filter is proven absent.
    await page.keyboard.press('Escape');
    await page.getByTestId('mobile-flight-filters-button').click();
    await expect(page.getByTestId('flight-filter-type-mobile')).toBeVisible();
    await expect(page.getByTestId('flight-filter-aircraft-mobile')).toHaveCount(0);

    // AC 12 asks for 375 AND 1280 (review LOW-2): the masking is the server's,
    // so it must hold identically on the tree the desktop shows.
    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard/logbook');
    await expect(page.getByTestId('flight-row')).toHaveCount(1);
    await expect(page.getByTestId('mobile-flights-list')).toBeHidden();
    for (const testId of ['flight-cancel-action', 'flight-correct-action', 'logbook-new-button', 'flight-filter-aircraft', 'flight-filter-person']) {
      await expect(page.getByTestId(testId), `${testId} at 1280px`).toHaveCount(0);
    }
    expect(flight.id).toBeTruthy();
  });

  test('an instructor sees the flights where they were CFI, with the ALLIEVO on the card and themselves in the sub-line', async ({ page }) => {
    const tag = uniqueSuffix();
    const password = `Mobile156i-${tag}!`;
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const student = await createStudent(page, tag);
    const instructor = await createInstructor(page, tag);
    await registerFlight(page, aircraft.id, student.id, '2020-05-03', { flightType: 'SCHOOL', instructorPersonId: instructor.id });
    const email = await inviteUser(page, instructor.id, 'INSTRUCTOR', password);

    await page.context().clearCookies();
    await page.goto('/it/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard$/);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/logbook');
    const card = page.getByTestId('flight-row-mobile').filter({ hasText: aircraft.registration });
    await expect(card).toHaveCount(1);
    // The name on the card is the flight's PILOT — the student — and the
    // sub-line is what tells the instructor why the row is theirs.
    await expect(card).toContainText(student.label);
    await expect(card).toContainText(`CFI ${instructor.label}`);

    await card.click();
    await expect(page.getByTestId('mobile-flight-sheet')).toHaveCount(1);
    await expect(page.getByTestId('mobile-flight-sheet').locator('.bottom-sheet-actions')).toHaveCount(0);

    // 1280px too (AC 12, review LOW-2): the CFI scope and the missing actions
    // are the server's, and the desktop row says exactly the same thing.
    await page.keyboard.press('Escape');
    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard/logbook');
    const row = page.getByTestId('flight-row').filter({ hasText: aircraft.registration });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(student.label);
    await expect(row).toContainText(instructor.label);
    await expect(page.getByTestId('flight-cancel-action')).toHaveCount(0);
    await expect(page.getByTestId('flight-correct-action')).toHaveCount(0);
  });

  test('an allievo gets their own SCHOOL flight, the CFI in the sub-line, no action, no motivo of the deroga — at 375 and at 1280 (review LOW-2)', async ({ page }) => {
    const tag = uniqueSuffix();
    const password = `Mobile156s-${tag}!`;
    await login(page, ADMIN_EMAIL);
    const aircraft = await createAircraftWithRate(page, tag);
    const student = await createStudent(page, tag);
    const instructor = await createInstructor(page, tag);
    await registerFlight(page, aircraft.id, student.id, '2020-05-04', { flightType: 'SCHOOL', instructorPersonId: instructor.id });
    const email = await inviteUser(page, student.id, 'STUDENT', password);

    await page.context().clearCookies();
    await page.goto('/it/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page).toHaveURL(/\/it\/dashboard$/);

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard/logbook');
    const card = page.getByTestId('flight-row-mobile').filter({ hasText: aircraft.registration });
    await expect(card).toHaveCount(1);
    // The allievo is the flight's own person: they are the NAME on the card,
    // and the sub-line carries the instructor who signed the lesson.
    await expect(card).toContainText(student.label);
    await expect(card).toContainText(`CFI ${instructor.label}`);
    // The badge of the deroga stays (the server masks the MOTIVO, not the fact
    // — parity with the desktop), the motivo never appears.
    await expect(card).toContainText('Deroga');
    await expect(card).not.toContainText('Fixture e2e 15.6');
    for (const testId of ['flight-form', 'flight-cancel-action', 'flight-correct-action', 'flight-filter-aircraft', 'flight-filter-person', 'logbook-new-button']) {
      await expect(page.getByTestId(testId), testId).toHaveCount(0);
    }

    await card.click();
    await expect(page.getByTestId('mobile-flight-sheet')).toHaveCount(1);
    await expect(page.getByTestId('mobile-flight-sheet').locator('.bottom-sheet-actions')).toHaveCount(0);
    await expect(page.getByTestId('flight-cancel-action-mobile')).toHaveCount(0);
    await expect(page.getByTestId('flight-correct-action-mobile')).toHaveCount(0);
    await expect(page.getByTestId('mobile-flight-sheet')).not.toContainText('Fixture e2e 15.6');
    await page.keyboard.press('Escape');

    // AC 9 measured on a NON-admin face too (review LOW-2): fewer controls in
    // the head, the same floor and the same tab bar underneath.
    const geometry = await pageGeometry(page);
    expect(geometry.pageOverflow, 'page overflow for the allievo at 375px').toBe(0);
    expect(geometry.covered, 'controls under the tab bar for the allievo').toEqual([]);
    expect(geometry.scrollers, 'hidden inner scrollers for the allievo').toEqual([]);
    expect(geometry.atContentEnd, 'what is painted at the end of the page').not.toContain('mobile-tabbar');

    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard/logbook');
    const row = page.getByTestId('flight-row').filter({ hasText: aircraft.registration });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(student.label);
    await expect(row).not.toContainText('Fixture e2e 15.6');
    await expect(page.getByTestId('mobile-flights-list')).toBeHidden();
    await expect(page.getByTestId('flight-cancel-action')).toHaveCount(0);
    await expect(page.getByTestId('flight-correct-action')).toHaveCount(0);
  });
});
