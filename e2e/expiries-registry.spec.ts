import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedAircraftRate, seedInstructorRate } from './db-fixtures';
import { addDaysIso, ensureValidSeedExpiries, registerExpiry, registerFlightOn, todayRome } from './helpers';

/**
 * Story 19.7b — the UNIFIED Scadenze registry (Q-19.7-a): the registered
 * documents plus the currency rows DERIVED at read time — one per pilot or
 * student who flew enough to have a date — in every view, with the Categoria
 * filter, the exports and the API. No «Mancante» row of any kind: a currency
 * never acquired, a fee never paid, a visit never registered show NOTHING
 * (PO 2026-11-02, Q-19.7-b/c overturned).
 *
 * Every fixture is run-unique (people sharing one suffix, aircraft, rates);
 * nothing writes an AppSetting and nothing compares a GLOBAL aggregate (the
 * derived rows move the stat cards every time any spec creates a person —
 * CLAUDE.md, lesson Billing-2 F4): rows are reached by searching the run's
 * suffix and read cell by cell, exactly, so the spec lives in the parallel
 * `chromium` project. The currency is X=1, Y=90 (the defaults: no spec writes
 * them).
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/expiries-registry.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 900 };
const TODAY = todayRome();
const DASH = '—';

async function login(page: Page): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The SAME rendering `src/lib/time.ts#formatDateOnly` produces — an assertion never hard-codes a format. */
function formatDateOnly(dateOnly: string, locale: 'it' | 'en' = 'it'): string {
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-IE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

type Profile = 'pilot' | 'student' | 'instructor';
type Person = { id: string; firstName: string; lastName: string; name: string };

/** A person with the given profiles and NOTHING else — no expiry, no `ensureValidSeedExpiries` (each test decides). */
async function createPerson(page: Page, lastName: string, profiles: Profile[]): Promise<Person> {
  const firstName = 'Registro';
  const response = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(response.status(), await response.text()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  for (const profile of profiles) {
    const data =
      profile === 'pilot' ? { licenseNumber: `IT-${uniqueSuffix()}`, licenseType: 'PPL(A)' } : profile === 'student' ? { courseStartDate: '2020-01-01' } : { ratings: 'FI(A)' };
    const profileResponse = await page.request.put(`/api/v1/people/${id}/profiles/${profile}`, { data });
    expect(profileResponse.status(), await profileResponse.text()).toBe(200);
  }
  return { id, firstName, lastName, name: `${lastName} ${firstName}` };
}

async function createAircraft(page: Page, rateSince: string): Promise<string> {
  const registration = `I-RG${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase().slice(0, 20);
  const response = await page.request.post('/api/v1/aircraft', { data: { registration, type: 'Ultraleggero 3 assi', model: 'Registro 19.7b' } });
  expect(response.status(), await response.text()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  await seedAircraftRate(id, { studentPriceCents: 11000, pilotPriceCents: 12000, validFrom: rateSince });
  return id;
}

/**
 * The currency fixture of story 19.7a AC 15, reproduced (never shared at
 * runtime): with X=1, Y=90 and Rome's today,
 * A pilot, one flight at today−90            -> ends TODAY, «≤ 7 gg», «0 gg»;
 * B student, one DUAL flight at today−91     -> ended YESTERDAY, «Scaduta», «1 gg fa»;
 * C pilot, no flight                         -> NO currency row (fewer than X flights ever);
 * D pilot+instructor, one flight INSTRUCTED at today−10 -> ends today+80, «Valida»;
 * E instructor only (B's instructor)         -> no currency row at all;
 * F student flown by D at today−10           -> ends today+80;
 * G pilot+instructor whose only flight is H's SUPERVISED SOLO at today−20 -> NO currency row
 *   (review 19.7a F2: the instructor of a solo is not on board);
 * H student, that solo                       -> ends today+70.
 */
async function buildCurrencyFixture(page: Page) {
  const tag = `Reg-${uniqueSuffix()}`;
  const aircraftId = await createAircraft(page, addDaysIso(TODAY, -100));
  const a = await createPerson(page, `${tag}-A`, ['pilot']);
  const b = await createPerson(page, `${tag}-B`, ['student']);
  const c = await createPerson(page, `${tag}-C`, ['pilot']);
  const d = await createPerson(page, `${tag}-D`, ['pilot', 'instructor']);
  const e = await createPerson(page, `${tag}-E`, ['instructor']);
  const f = await createPerson(page, `${tag}-F`, ['student']);
  const g = await createPerson(page, `${tag}-G`, ['pilot', 'instructor']);
  const h = await createPerson(page, `${tag}-H`, ['student']);
  for (const [person, scope] of [
    [a, 'PILOTS'],
    [b, 'STUDENTS'],
    [d, 'PILOTS'],
    [d, 'INSTRUCTORS'],
    [e, 'INSTRUCTORS'],
    [f, 'STUDENTS'],
    [g, 'PILOTS'],
    [g, 'INSTRUCTORS'],
    [h, 'STUDENTS'],
  ] as const) {
    await ensureValidSeedExpiries(page, person.id, scope);
  }
  for (const instructor of [d, e, g]) {
    await seedInstructorRate(instructor.id, { priceCentsPerHour: 4000, validFrom: addDaysIso(TODAY, -100) });
  }
  await registerFlightOn(page, { aircraftId, personId: a.id, flightType: 'TOURISM', date: addDaysIso(TODAY, -90) });
  await registerFlightOn(page, { aircraftId, personId: b.id, instructorPersonId: e.id, flightType: 'SCHOOL', date: addDaysIso(TODAY, -91) });
  await registerFlightOn(page, { aircraftId, personId: f.id, instructorPersonId: d.id, flightType: 'SCHOOL', date: addDaysIso(TODAY, -10) });
  await registerFlightOn(page, { aircraftId, personId: h.id, instructorPersonId: g.id, flightType: 'SCHOOL', isSolo: true, date: addDaysIso(TODAY, -20) });
  return { tag, a, b, c, d, e, f, g, h };
}

/** Every desktop registry row as its six cells' text: persona, categoria, certificato, scadenza, giorni, stato. */
async function readRows(page: Page): Promise<string[][]> {
  await expect(page.locator('.scadenze-desktop-body')).toBeVisible();
  return page
    .getByTestId('scadenze-row')
    .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll(':scope > div')].map((cell) => (cell as HTMLElement).innerText.trim())));
}

/** The rows of one person in one category — exact cell equality, never `hasText` (lesson 11.2). */
function rowsOf(rows: string[][], person: Person, category: string): string[][] {
  return rows.filter((row) => row[0] === person.name && row[1] === category);
}

test.describe('Story 19.7b — currency rows in every view of the registry (AC 3)', () => {
  test('mixed with the documents, never a row without a date, narrowed by Categoria and finestra; same people on the Pilots page', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page);
    const { tag, a, b, c, d, e, f, g, h } = await buildCurrencyFixture(page);
    const search = encodeURIComponent(tag);
    await page.setViewportSize(DESKTOP);

    // --- the default view of every category, all dates: documents and currency rows together.
    await page.goto(`/it/dashboard/expiries?window=all&personQuery=${search}`);
    const all = await readRows(page);
    // The dated currency rows come first (none later than today+80), then the documents `ensureValidSeedExpiries`
    // registered at 2099-12-31.
    expect(all.some((row) => (row[1] === 'Visita medica' || row[1] === 'Rating') && row[3] !== DASH)).toBe(true);
    // PO 2026-11-02: nothing without a date — no fee never paid (nobody here paid one), no visit never registered (C).
    expect(all.filter((row) => row[3] === DASH || row[4] === DASH || row[5] === 'Mancante')).toEqual([]);
    expect(all.filter((row) => row[1] === 'Quota associativa')).toEqual([]);
    expect(all.filter((row) => row[0] === c.name)).toEqual([]);
    // Ordered by date: B (expired yesterday) before A (ends today).
    const indexOf = (person: Person) => all.findIndex((row) => row[0] === person.name && row[1] === 'Currency');
    expect(indexOf(b)).toBeGreaterThanOrEqual(0);
    expect(indexOf(b)).toBeLessThan(indexOf(a));

    // --- Categoria = Currency: one row per pilot/student who flew at least X times; none for C and G (never flew
    // enough — G's only flight is a supervised solo, review 19.7a F2) nor for E (instructor only).
    await page.goto(`/it/dashboard/expiries?window=all&category=CURRENCY&personQuery=${search}`);
    const currency = await readRows(page);
    expect(currency.map((row) => row[1])).toEqual(currency.map(() => 'Currency'));
    expect(currency.map((row) => row[0]).sort()).toEqual([a, b, d, f, h].map((person) => person.name).sort());
    expect(rowsOf(currency, a, 'Currency')).toEqual([[a.name, 'Currency', '1 volo negli ultimi 90 giorni', formatDateOnly(TODAY), '0 gg', '≤ 7 gg']]);
    expect(rowsOf(currency, b, 'Currency')).toEqual([[b.name, 'Currency', '0 voli negli ultimi 90 giorni', formatDateOnly(addDaysIso(TODAY, -1)), '1 gg fa', 'Scaduta']]);
    expect(rowsOf(currency, d, 'Currency')).toEqual([[d.name, 'Currency', '1 volo negli ultimi 90 giorni', formatDateOnly(addDaysIso(TODAY, 80)), '80 gg', 'Valida']]);
    expect(rowsOf(currency, h, 'Currency')).toEqual([[h.name, 'Currency', '1 volo negli ultimi 90 giorni', formatDateOnly(addDaysIso(TODAY, 70)), '70 gg', 'Valida']]);
    expect(currency.some((row) => row[0] === c.name || row[0] === e.name || row[0] === g.name)).toBe(false);

    // --- «Scaduti»: B and nothing else of these people — never A nor D, and no row without a date.
    await page.goto(`/it/dashboard/expiries?window=expired&personQuery=${search}`);
    const expired = await readRows(page);
    expect(expired).toEqual(rowsOf(expired, b, 'Currency'));
    expect(expired).toHaveLength(1);

    // --- the default finestra (≤ 60 days): A (today) yes, D (+80) no.
    await page.goto(`/it/dashboard/expiries?personQuery=${search}`);
    const within60 = await readRows(page);
    expect(rowsOf(within60, a, 'Currency')).toHaveLength(1);
    expect(rowsOf(within60, d, 'Currency')).toHaveLength(0);

    // --- 375 px: A's card and its sheet, «Ambito» and «Note» with no value.
    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/expiries?window=all&category=CURRENCY&personQuery=${search}`);
    const cardOfA = page.getByTestId('scadenze-row-mobile').filter({ has: page.locator('.mobile-row-name', { hasText: new RegExp(`^${a.name}$`) }) });
    await expect(cardOfA).toHaveCount(1);
    // The card names the row by its category (the detail would push the date out of a 375px line), the sheet by its detail.
    await expect(cardOfA.locator('.mobile-row-sub')).toHaveText(`0 gg · Currency · ${formatDateOnly(TODAY)}`);
    // A, B, D, F, H — no card for C or G.
    await expect(page.getByTestId('scadenze-row-mobile')).toHaveCount(5);
    await cardOfA.click();
    const sheet = page.getByTestId('mobile-scadenze-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.bottom-sheet-sub')).toHaveText('Currency · 1 volo negli ultimi 90 giorni');
    const sheetRows = await sheet.locator('.bottom-sheet-kv').evaluateAll((rows) =>
      rows.map((row) => [row.querySelector('.bottom-sheet-k')!.textContent!.trim(), row.querySelector('.bottom-sheet-v')!.textContent!.trim()]),
    );
    expect(sheetRows).toEqual([
      ['Scadenza', formatDateOnly(TODAY)],
      ['Giorni rimasti', '0 gg'],
      ['Stato', '≤ 7 gg'],
      ['Ambito', DASH],
      ['Note', DASH],
    ]);

    // --- the Pilots page reads the SAME people through the TS twin (D-15): story 19.7a AC 15's badges.
    await page.setViewportSize(DESKTOP);
    await page.goto(`/it/dashboard/pilots?q=${search}`);
    await expect(page.getByTestId(`pilot-row-${a.id}`)).toBeVisible();
    await expect(page.getByTestId(`pilot-currency-${a.id}`)).toHaveText('Currency · 0 gg');
    await expect(page.getByTestId(`pilot-currency-${b.id}`)).toHaveText('Currency scaduta');
    await expect(page.getByTestId(`pilot-currency-${c.id}`)).toHaveText('Currency scaduta');
    await expect(page.getByTestId(`pilot-currency-${d.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`pilot-currency-${g.id}`)).toHaveText('Currency scaduta');
    await expect(page.getByTestId(`pilot-currency-${h.id}`)).toHaveCount(0);
  });
});

test.describe('Story 19.7b — the derived rows in the API, the export and in English (AC 7, AC 8, AC 10)', () => {
  test('GET /api/v1/expiries carries the derived rows, the xlsx of «Currency» has no document, the badge speaks English', async ({ page }) => {
    test.setTimeout(90_000);
    await login(page);
    const { tag, a, b, c, d, f, h } = await buildCurrencyFixture(page);
    const search = encodeURIComponent(tag);

    // --- API (AD-2).
    const currencyResponse = await page.request.get(`/api/v1/expiries?personQuery=${search}&category=CURRENCY&pageSize=100`);
    expect(currencyResponse.status()).toBe(200);
    const currencyBody = (await currencyResponse.json()) as {
      total: number;
      items: Array<{ id: string; source: string; category: string; personId: string; expiryTypeId: string | null; typeName: string | null; expiresAt: string | null; status: string; daysUntil: number | null; currency: unknown }>;
    };
    expect(currencyBody.total).toBe(5);
    expect(currencyBody.items.find((item) => item.personId === a.id)).toEqual(
      expect.objectContaining({
        id: `currency:${a.id}`,
        source: 'DERIVED',
        category: 'CURRENCY',
        expiryTypeId: null,
        typeName: null,
        expiresAt: TODAY,
        status: 'expiring',
        daysUntil: 0,
        currency: { lastFlightDate: addDaysIso(TODAY, -90), flightsInWindow: 1, minFlights: 1, windowDays: 90 },
      }),
    );
    // PO 2026-11-02: every row of these people has a date, whatever the category; `missing` is no status at all.
    const everyResponse = await page.request.get(`/api/v1/expiries?personQuery=${search}&pageSize=100`);
    const everyBody = (await everyResponse.json()) as { items: Array<{ personId: string; expiresAt: string | null; daysUntil: number | null }> };
    expect(everyBody.items.length).toBeGreaterThan(0);
    expect(everyBody.items.filter((item) => item.expiresAt === null || item.daysUntil === null)).toEqual([]);
    expect(everyBody.items.some((item) => item.personId === c.id)).toBe(false);
    expect((await page.request.get(`/api/v1/expiries?personQuery=${search}&status=missing`)).status()).toBe(422);
    // A derived row is not a scadenza: no endpoint accepts its id.
    const patch = await page.request.patch(`/api/v1/expiries/currency:${a.id}`, { data: { notes: 'no' } });
    expect(patch.status()).toBe(404);

    // --- the export of the «Currency» view (no `window`: «Tutte» is the ABSENCE of the filter): the same rows, no document (AC 7).
    const xlsx = await page.request.get(`/api/v1/expiries?format=xlsx&locale=it&category=CURRENCY&personQuery=${search}`);
    expect(xlsx.status()).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await xlsx.body()) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0]!;
    const exported: string[][] = [];
    sheet.eachRow((row, index) => {
      if (index > 1) exported.push([1, 2, 3, 4, 5].map((cell) => String(row.getCell(cell).value)));
    });
    expect(exported.map((row) => row[0]).sort()).toEqual([a, b, d, f, h].map((person) => person.name).sort());
    // The currency has no type scope («—»); every row has a date.
    expect(exported.every((row) => row[1] === 'Currency' && row[2] === DASH && row[3] !== DASH)).toBe(true);
    expect(exported.find((row) => row[0] === a.name)).toEqual([a.name, 'Currency', DASH, formatDateOnly(TODAY), 'In scadenza']);

    // --- the page's own export link carries the Categoria (D-11).
    await page.setViewportSize(DESKTOP);
    await page.goto(`/it/dashboard/expiries?window=all&category=CURRENCY&personQuery=${search}`);
    await page.getByTestId('export-menu-trigger').click();
    await expect(page.getByTestId('export-menu-xls')).toHaveAttribute('href', /[?&]category=CURRENCY(&|$)/);
    await expect(page.getByTestId('export-menu-pdf')).toHaveAttribute('href', /[?&]category=CURRENCY(&|$)/);

    // --- English (AC 10): the badge, the ICU plural of the detail, the status.
    await page.goto(`/en/dashboard/expiries?window=all&category=CURRENCY&personQuery=${search}`);
    const english = await readRows(page);
    expect(rowsOf(english, a, 'Currency')).toEqual([[a.name, 'Currency', '1 flight in the last 90 days', formatDateOnly(TODAY, 'en'), '0 d', '≤ 7 days']]);
    expect(rowsOf(english, b, 'Currency')).toEqual([[b.name, 'Currency', '0 flights in the last 90 days', formatDateOnly(addDaysIso(TODAY, -1), 'en'), '1d ago', 'Expired']]);
  });
});

test.describe('Story 19.7b — the membership fee in the registry (AC 4)', () => {
  test('a paid fee is a document, a never-paid one no row at all; an archived person\'s documents are out (review F1)', async ({ page }) => {
    await login(page);
    const tag = `RegQ-${uniqueSuffix()}`;
    const paid = await createPerson(page, `${tag}-F`, ['pilot']);
    await createPerson(page, `${tag}-G`, ['instructor']);
    const archived = await createPerson(page, `${tag}-H`, ['pilot']);
    await createPerson(page, `${tag}-I`, []);
    // H has a registered (expired) visit before being archived: an archived person leaves the registry whole.
    const visitTypes = (await (await page.request.get('/api/v1/expiry-types?kind=MEDICAL')).json()) as Array<{ id: string; name: string }>;
    const class2 = visitTypes.find((type) => type.name === 'Visita medica classe 2');
    expect(class2, 'seeded visit «Visita medica classe 2»').toBeTruthy();
    await registerExpiry(page, archived.id, class2!.id, addDaysIso(TODAY, -30));
    const charge = await page.request.post(`/api/v1/people/${paid.id}/membership-fee`, {
      // Story 19.10 (AD-10): the deroga of an uncovered fee is `force`.
      data: { amountCents: 1000, force: true },
      headers: { 'Idempotency-Key': `e2e-197b-${uniqueSuffix()}` },
    });
    expect(charge.status(), await charge.text()).toBe(200);
    const { expiresAt } = (await charge.json()) as { expiresAt: string };
    expect((await page.request.post(`/api/v1/people/${archived.id}/archive`)).status()).toBe(200);
    const feeTypes = (await (await page.request.get('/api/v1/expiry-types?kind=MEMBERSHIP')).json()) as Array<{ id: string }>;
    expect(feeTypes).toHaveLength(1);

    await page.setViewportSize(DESKTOP);
    const search = encodeURIComponent(tag);
    for (const filter of ['', '&category=MEMBERSHIP', `&expiryTypeId=${feeTypes[0]!.id}`]) {
      await page.goto(`/it/dashboard/expiries?window=all&personQuery=${search}${filter}`);
      // The paid fee and nothing else, in every view: no row for G's fee never paid (PO 2026-11-02), none for
      // F's currency never acquired or visit never registered, none for H (archived, review F1) nor I.
      expect(await readRows(page)).toEqual([[paid.name, 'Quota associativa', 'Quota associativa', formatDateOnly(expiresAt), expect.any(String), 'Valida']]);
    }
  });
});

test.describe('Story 19.7b — medical visits in the registry (AC 5)', () => {
  test('no visit at all -> no row; an expired one -> its red document; a valid one -> its document', async ({ page }) => {
    await login(page);
    const tag = `RegV-${uniqueSuffix()}`;
    const types = (await (await page.request.get('/api/v1/expiry-types?kind=MEDICAL')).json()) as Array<{ id: string; name: string }>;
    const class2 = types.find((type) => type.name === 'Visita medica classe 2');
    expect(class2, 'seeded visit «Visita medica classe 2»').toBeTruthy();
    await createPerson(page, `${tag}-J`, ['pilot']);
    const k = await createPerson(page, `${tag}-K`, ['pilot']);
    const l = await createPerson(page, `${tag}-L`, ['pilot']);
    await registerExpiry(page, k.id, class2!.id, addDaysIso(TODAY, -30));
    await registerExpiry(page, l.id, class2!.id, addDaysIso(TODAY, 200));

    await page.setViewportSize(DESKTOP);
    const search = encodeURIComponent(tag);
    await page.goto(`/it/dashboard/expiries?window=all&category=MEDICAL&personQuery=${search}`);
    // J has no visit: no row at all (PO 2026-11-02) — only K's and L's documents, by date.
    expect(await readRows(page)).toEqual([
      [k.name, 'Visita medica', 'Visita medica classe 2', formatDateOnly(addDaysIso(TODAY, -30)), '30 gg fa', 'Scaduta'],
      [l.name, 'Visita medica', 'Visita medica classe 2', formatDateOnly(addDaysIso(TODAY, 200)), '200 gg', 'Valida'],
    ]);

    await page.goto(`/it/dashboard/expiries?window=all&expiryTypeId=${class2!.id}&personQuery=${search}`);
    const byType = await readRows(page);
    expect(byType.map((row) => row[0]).sort()).toEqual([k.name, l.name].sort());
  });
});

test.describe('Story 19.7b — the Categoria filter (AC 9)', () => {
  test('desktop: the select navigates, narrows the tipo select, hides it for the currency; the export is there in every view', async ({ page }) => {
    await login(page);
    await page.setViewportSize(DESKTOP);
    await page.goto('/it/dashboard/expiries');
    await page.getByTestId('scadenze-filter-category').selectOption('MEDICAL');
    await expect(page).toHaveURL(/[?&]category=MEDICAL(&|$)/);
    await expect(page.getByTestId('scadenze-filter-type').locator('option', { hasText: /^Visita medica classe 1$/ })).toHaveCount(1);
    const offered = await page.getByTestId('scadenze-filter-type').locator('option').evaluateAll((options) => options.map((option) => option.textContent!.trim()));
    // Read AFTER the page, inactive included: a concurrent spec may create or deactivate a visit type meanwhile.
    const types = (await (await page.request.get('/api/v1/expiry-types?includeInactive=true')).json()) as Array<{ name: string; kind: string }>;
    const visitNames = new Set(types.filter((type) => type.kind === 'MEDICAL').map((type) => type.name));
    expect(offered[0]).toBe('Tutti i tipi');
    expect(offered.slice(1).filter((name) => !visitNames.has(name))).toEqual([]);
    expect(offered).not.toContain('Rating SEP');
    expect(offered).not.toContain('Quota associativa');
    await expect(page.getByTestId('export-menu-trigger')).toBeVisible();

    // A tipo chosen under one category is dropped by the next category change.
    await page.getByTestId('scadenze-filter-type').selectOption({ label: 'Visita medica classe 1' });
    await expect(page).toHaveURL(/expiryTypeId=/);
    await page.getByTestId('scadenze-filter-category').selectOption('CURRENCY');
    await expect(page).toHaveURL(/[?&]category=CURRENCY(&|$)/);
    expect(page.url()).not.toContain('expiryTypeId=');
    await expect(page.getByTestId('scadenze-filter-type')).toHaveCount(0);
    await expect(page.getByTestId('export-menu-trigger')).toBeVisible();

    await page.getByTestId('scadenze-filter-category').selectOption('');
    await expect(page).not.toHaveURL(/category=/);
    await expect(page.getByTestId('scadenze-filter-type')).toBeVisible();
  });

  test('375 px: the panel applies Categoria and the typed search in ONE navigation; «Filtri (1)», «Filtri (2)», «Azzera filtri»', async ({ page }) => {
    await login(page);
    await page.setViewportSize(PHONE);
    const tag = `RegF-${uniqueSuffix()}`;
    const person = await createPerson(page, `${tag}-M`, ['pilot']);
    // One flight at today−10, so M HAS a currency row (no flight would mean no row at all, PO 2026-11-02).
    const aircraftId = await createAircraft(page, addDaysIso(TODAY, -100));
    await ensureValidSeedExpiries(page, person.id, 'PILOTS');
    await registerFlightOn(page, { aircraftId, personId: person.id, flightType: 'TOURISM', date: addDaysIso(TODAY, -10) });
    const types = (await (await page.request.get('/api/v1/expiry-types?kind=MEDICAL')).json()) as Array<{ id: string; name: string }>;
    const class1 = types.find((type) => type.name === 'Visita medica classe 1');
    expect(class1, 'seeded visit «Visita medica classe 1»').toBeTruthy();

    await page.goto('/it/dashboard/expiries?window=all');
    const startUrl = page.url();
    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && frame.url() !== startUrl) navigations.push(frame.url());
    });
    // Type (arming the debounce), open the panel at once, choose the category, apply: ONE navigation with both.
    await page.getByTestId('scadenze-filter-pilot').fill(person.lastName);
    await page.getByTestId('mobile-scadenze-filters-button').click();
    await expect(page.getByTestId('mobile-scadenze-filter-panel')).toBeVisible();
    await page.getByTestId('scadenze-filter-category-mobile').selectOption('CURRENCY');
    await expect(page.getByTestId('scadenze-filter-type-mobile')).toHaveCount(0);
    await page.getByTestId('mobile-scadenze-filters-apply').click();
    await expect(page).toHaveURL(/[?&]category=CURRENCY(&|$)/, { timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`personQuery=${encodeURIComponent(person.lastName)}`));
    expect(navigations).toHaveLength(1);
    await expect(page.getByTestId('mobile-scadenze-filters-button')).toHaveText('Filtri (1)');
    const card = page.getByTestId('scadenze-row-mobile');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.mobile-row-sub')).toHaveText(`80 gg · Currency · ${formatDateOnly(addDaysIso(TODAY, 80))}`);

    // Category + tipo = two hidden filters.
    await page.getByTestId('mobile-scadenze-filters-button').click();
    await page.getByTestId('scadenze-filter-category-mobile').selectOption('MEDICAL');
    await page.getByTestId('scadenze-filter-type-mobile').selectOption(class1!.id);
    await page.getByTestId('mobile-scadenze-filters-apply').click();
    await expect(page).toHaveURL(new RegExp(`expiryTypeId=${class1!.id}`), { timeout: 15_000 });
    await expect(page.getByTestId('mobile-scadenze-filters-button')).toHaveText('Filtri (2)');

    // «Azzera filtri» drops the category too.
    await page.getByTestId('mobile-scadenze-filters-button').click();
    await page.getByTestId('mobile-scadenze-filter-reset').click();
    await expect(page).not.toHaveURL(/category=/, { timeout: 15_000 });
    await expect(page.getByTestId('mobile-scadenze-filters-button')).toHaveText('Filtri');
  });
});
