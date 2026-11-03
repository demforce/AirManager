import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedAccountAdjustments, seedAircraftRate } from './db-fixtures';
import { FAR_FUTURE_DATE, addDaysIso, ensureValidSeedExpiries, todayRome } from './helpers';

/**
 * Story 19.11 — the estratto conto by period with a running balance: the API
 * contract (period, order, balances, one statement), the period form and its
 * summary, the "Saldo" column and the "Saldo iniziale" line on both faces and
 * both pages, the exports on the period and the readable cap.
 *
 * Project `chromium`, `fullyParallel`: no AppSettings written, no global
 * aggregate asserted — every assertion is on a run-unique person. The
 * movements are written with dates in 2010-2012 (never the current month:
 * lesson Billing-2 F4) through `seedAccountAdjustments` (`ADJUSTMENT` rows on
 * any date, no cash twin), except the default-period test, which needs dates
 * relative to Rome's today, ±1 year and never in the current month.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/account-statement-period.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 };
/** The floor is 44 and the sweep threshold 43.5 — written on the REQUIREMENT, never on the value obtained (lesson 15.7 MINOR-1). */
const TARGET_FLOOR = 43.5;

/** The explicit period most tests read: March 2012. */
const FROM = '2012-03-01';
const TO = '2012-03-31';

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** A run-unique pilot person (the pilot profile creates the account). */
async function createPilotPerson(page: Page, tag: string): Promise<{ personId: string; lastName: string }> {
  const suffix = uniqueSuffix();
  const lastName = `${tag}-${suffix}`;
  const personResponse = await page.request.post('/api/v1/people', { data: { firstName: 'Estratto', lastName } });
  expect(personResponse.status()).toBe(201);
  const person = (await personResponse.json()) as { id: string };
  const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' },
  });
  expect(profileResponse.status()).toBe(200);
  await ensureValidSeedExpiries(page, person.id, 'PILOTS');
  return { personId: person.id, lastName };
}

async function waitForInviteLink(email: string): Promise<URL> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const search = (await (await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as {
      messages: Array<{ ID: string; Subject: string }>;
    };
    const found = search.messages.find((message) => message.Subject.includes('invito'));
    if (found) {
      const message = (await (await fetch(`http://localhost:8025/api/v1/message/${found.ID}`)).json()) as { Text: string };
      const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(message.Text);
      if (!match) throw new Error(`Invite to ${email} carries no /set-password link.`);
      return new URL(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No invite email to ${email} within 15s.`);
}

/** The person of {@link createPilotPerson} plus a real login (invite flow via Mailpit). */
async function createPilotWithLogin(page: Page, password: string, tag: string): Promise<{ personId: string; email: string }> {
  const { personId } = await createPilotPerson(page, tag);
  const email = `pilot-period-${uniqueSuffix()}@airmanager.local`;
  expect((await page.request.post('/api/v1/users', { data: { email, roles: ['PILOT'], personId } })).status()).toBe(201);
  const link = await waitForInviteLink(email);
  await page.goto(link.pathname + link.search);
  await page.getByLabel('Nuova password').fill(password);
  await page.getByLabel('Conferma password').fill(password);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();
  return { personId, email };
}

type StatementItem = { id: string; type: string; amountCents: number; effectiveDate: string; balanceAfterCents: number; reversalOfId: string | null; reversalOfEffectiveDate: string | null };
type Statement = { items: StatementItem[]; total: number; page: number; pageSize: number; from: string | null; to: string | null; openingBalanceCents: number; closingBalanceCents: number };

async function readStatement(page: Page, personId: string, query: Record<string, string | number>): Promise<Statement> {
  const search = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));
  const response = await page.request.get(`/api/v1/people/${personId}/account/movements?${search.toString()}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Statement;
}

/** Every page of the period, `pageSize` at a time — the summary of the first page plus the items of all of them, in the API's order. */
async function walkStatement(page: Page, personId: string, period: { from?: string; to?: string }, pageSize: number): Promise<Statement> {
  const first = await readStatement(page, personId, { ...period, page: 1, pageSize });
  const items = [...first.items];
  const pages = Math.ceil(first.total / pageSize);
  for (let index = 2; index <= pages; index += 1) {
    items.push(...(await readStatement(page, personId, { ...period, page: index, pageSize })).items);
  }
  return { ...first, items };
}

/**
 * The statement the TEST computes on its own: `movements` in insertion order,
 * sorted by value date then insertion (the key), summed from `opening`, and
 * returned most recent first with each balance — what the API must say.
 */
function expectedStatement(movements: Array<{ id: string; amountCents: number; effectiveDate: string }>, opening: number): Array<{ id: string; balanceAfterCents: number }> {
  const ascending = movements.map((movement, index) => ({ ...movement, index })).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.index - b.index);
  let balance = opening;
  return ascending.map((movement) => ({ id: movement.id, balanceAfterCents: (balance += movement.amountCents) })).reverse();
}

/** `YYYY-MM-DD` of `date` minus 12 months, the end of month clamped (29/02 → 28/02) — the page's own default, recomputed. */
function twelveMonthsBefore(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` → the `DD/MM/YYYY` the Italian UI prints. */
function itDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

/** Cents → the Italian `formatCents` text (grouping always, a no-break space before €). */
function itMoneyText(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const [units, decimals] = (Math.abs(cents) / 100).toFixed(2).split('.') as [string, string];
  return `${sign}${units.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimals}\u00a0€`;
}

/** {@link itMoneyText} as a whole-string regex. */
function itMoney(cents: number): RegExp {
  return new RegExp(`^${itMoneyText(cents).replace(/\./g, '\\.')}$`);
}

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook.worksheets[0]!;
}

/** Every visible control under the floor inside `root`. */
async function targetsUnderFloor(page: Page, root: string): Promise<string[]> {
  return page.evaluate(
    ([rootSelector, floor]) =>
      [...document.querySelectorAll(`${rootSelector} a, ${rootSelector} button, ${rootSelector} input`)]
        .filter((el) => el.getClientRects().length > 0)
        .filter((el) => el.getBoundingClientRect().height < (floor as number))
        .map((el) => `${el.getAttribute('data-testid') ?? String((el as HTMLElement).className)}:${el.getBoundingClientRect().height.toFixed(2)}`),
    [root, TARGET_FLOOR] as [string, number],
  );
}

/** Children of each matching card that stick out of the card's own box. */
async function cardOverflows(page: Page, cardSelector: string): Promise<string[]> {
  return page.evaluate(
    (selector) =>
      [...document.querySelectorAll(selector)].flatMap((card) => {
        const cardRect = card.getBoundingClientRect();
        return [...card.querySelectorAll('*')]
          .filter((child) => child.getClientRects().length > 0)
          .filter((child) => child.getBoundingClientRect().right > cardRect.right + 0.5 || child.getBoundingClientRect().left < cardRect.left - 0.5)
          .map((child) => `${String(child.className)}@${child.getBoundingClientRect().right.toFixed(2)}>${cardRect.right.toFixed(2)}`);
      }),
    cardSelector,
  );
}

function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('Estratto conto by period — the API contract (story 19.11, AC 1-6, 8)', () => {
  test('bounds are inclusive, the order is value date then insertion, every row carries the balance after it, and a flight edited in place moves with them', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const { personId } = await createPilotPerson(page, 'Contratto');
    // Insertion order = the array's. Two movements share 15/03 (AC 3); one
    // sits on each side of the period (AC 5).
    const fixture = [
      { amountCents: 1000, effectiveDate: '2012-02-29', description: 'Prima del periodo' },
      { amountCents: 2000, effectiveDate: FROM, description: 'Primo giorno' },
      { amountCents: 3000, effectiveDate: '2012-03-15', description: 'Stesso giorno, inserito prima' },
      { amountCents: -700, effectiveDate: '2012-03-15', description: 'Stesso giorno, inserito dopo' },
      { amountCents: 500, effectiveDate: TO, description: 'Ultimo giorno' },
      { amountCents: 9000, effectiveDate: '2012-04-01', description: 'Dopo il periodo' },
    ];
    const ids = await seedAccountAdjustments(personId, fixture);
    const movements = fixture.map((movement, index) => ({ ...movement, id: ids[index]! }));

    // A flight on 20/03, 60' at 120 €/h: its charge is the sixth movement in the period.
    const aircraftResponse = await page.request.post('/api/v1/aircraft', {
      data: { registration: `I-SP${uniqueSuffix()}`.toUpperCase().slice(0, 20), type: 'Ultraleggero 3 assi', model: 'Estratto' },
    });
    expect(aircraftResponse.status()).toBe(201);
    const aircraftId = ((await aircraftResponse.json()) as { id: string }).id;
    await seedAircraftRate(aircraftId, { studentPriceCents: 12000, pilotPriceCents: 12000, validFrom: '2012-01-01' });
    const flightBody = (date: string, minutes: number) => ({
      aircraftId,
      personId,
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      flightType: 'TOURISM',
      takeoffAt: `${date}T10:00:00.000Z`,
      landingAt: new Date(new Date(`${date}T10:00:00.000Z`).getTime() + minutes * 60_000).toISOString(),
      force: true,
    });
    const registered = await page.request.post('/api/v1/flights', { data: flightBody('2012-03-20', 60) });
    expect(registered.status(), await registered.text()).toBe(201);
    const flightId = ((await registered.json()) as { flight: { id: string } }).flight.id;

    // AC 1: an inverted pair or a non-date is a 422 — on the list AND on the PDF.
    for (const url of [
      `/api/v1/people/${personId}/account/movements?from=2026-02-01&to=2026-01-01`,
      `/api/v1/people/${personId}/account/pdf?from=2026-02-01&to=2026-01-01`,
      `/api/v1/people/${personId}/account/movements?from=2026-02-30`,
    ]) {
      const refused = await page.request.get(url);
      expect(refused.status(), url).toBe(422);
      expect(((await refused.json()) as { error: { code: string } }).error.code, url).toBe('VALIDATION_ERROR');
    }

    // AC 2: no period = the whole history — opening 0, closing = the account's balance.
    const overview = (await (await page.request.get(`/api/v1/people/${personId}/account`)).json()) as { balanceCents: number };
    const whole = await readStatement(page, personId, { page: 1, pageSize: 20 });
    expect(whole).toMatchObject({ from: null, to: null, openingBalanceCents: 0, closingBalanceCents: overview.balanceCents, total: 7 });

    async function assertPeriod(flightCharge: { id: string; amountCents: number; effectiveDate: string }): Promise<void> {
      const walked = await walkStatement(page, personId, { from: FROM, to: TO }, 2);
      // AC 5: the day before `from` is the opening balance; the day after `to` is nowhere.
      expect(walked.openingBalanceCents).toBe(1000);
      const inPeriod = [...movements.slice(1, 5), flightCharge];
      const expected = expectedStatement(inPeriod, 1000);
      // AC 3: walking every page of 2 gives exactly the period, once each, in the key's order —
      // the two movements of 15/03 most recently inserted first.
      expect(walked.items.map((item) => item.id)).toEqual(expected.map((item) => item.id));
      expect(walked.total).toBe(5);
      // AC 4: each balance = opening + the period's movements up to it, in the key's order.
      expect(walked.items.map((item) => [item.id, item.balanceAfterCents])).toEqual(expected.map((item) => [item.id, item.balanceAfterCents]));
      expect(walked.items[0]!.balanceAfterCents).toBe(walked.closingBalanceCents);
      const oldest = walked.items.at(-1)!;
      expect(oldest.balanceAfterCents).toBe(walked.openingBalanceCents + oldest.amountCents);
      expect(walked.closingBalanceCents).toBe(1000 + inPeriod.reduce((sum, movement) => sum + movement.amountCents, 0));
      // AC 6: a page past the end is a 200 with no item and the SAME summary.
      const pastTheEnd = await readStatement(page, personId, { from: FROM, to: TO, page: 999, pageSize: 2 });
      expect(pastTheEnd).toMatchObject({ items: [], total: 5, openingBalanceCents: 1000, closingBalanceCents: walked.closingBalanceCents });
    }

    const chargeBefore = whole.items.find((item) => item.type === 'FLIGHT_CHARGE')!;
    expect(chargeBefore).toMatchObject({ amountCents: -12000, effectiveDate: '2012-03-20' });
    await assertPeriod(chargeBefore);

    // AC 4 (19.6): the flight moves to 05/03 and halves — the SAME charge moves with it, every balance follows.
    const edited = await page.request.put(`/api/v1/flights/${flightId}`, { data: flightBody('2012-03-05', 30) });
    expect(edited.status(), await edited.text()).toBe(200);
    const chargeAfter = (await readStatement(page, personId, { page: 1, pageSize: 20 })).items.find((item) => item.type === 'FLIGHT_CHARGE')!;
    expect(chargeAfter).toMatchObject({ id: chargeBefore.id, amountCents: -6000, effectiveDate: '2012-03-05' });
    await assertPeriod(chargeAfter);

    // AC 8: a rettifica (dated today) linked to a movement BEFORE the period,
    // and one linked to a movement on another page: both carry the original's value date.
    for (const original of [movements[0]!, movements[1]!]) {
      const adjustment = await page.request.post(`/api/v1/people/${personId}/account/adjustments`, {
        data: { amountCents: -100, reason: `Rettifica ${uniqueSuffix()}`, originalMovementId: original.id },
      });
      expect(adjustment.status(), await adjustment.text()).toBe(200);
    }
    const firstPage = await readStatement(page, personId, { from: FROM, to: FAR_FUTURE_DATE, page: 1, pageSize: 2 });
    const linked = firstPage.items.filter((item) => item.reversalOfId !== null);
    expect(linked.map((item) => [item.reversalOfId, item.reversalOfEffectiveDate]).sort()).toEqual(
      [
        [movements[0]!.id, '2012-02-29'],
        [movements[1]!.id, FROM],
      ].sort(),
    );
    // …the original of the second sits on ANOTHER page, the first outside the period altogether.
    expect(firstPage.items.map((item) => item.id)).not.toContain(movements[1]!.id);
    const everything = await walkStatement(page, personId, { from: FROM, to: FAR_FUTURE_DATE }, 2);
    expect(everything.items.map((item) => item.id)).not.toContain(movements[0]!.id);
  });
});

test.describe('Estratto conto by period — the scheda persona (story 19.11, AC 13-19, 22-24, 27)', () => {
  test('desktop: the default period, an invalid one refused in place, a valid one applied with its summary, balances, the opening line on the last page, the exports, and back to 12 months', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const { personId } = await createPilotPerson(page, 'Scheda');
    // One movement before March (the opening balance) and 22 in March: two pages of 20.
    const march = Array.from({ length: 22 }, (_, index) => ({
      amountCents: index % 3 === 0 ? -1500 : 2500 + index,
      effectiveDate: `2012-03-${String(1 + Math.floor(index * 1.4)).padStart(2, '0')}`,
      description: `Marzo ${index}`,
    }));
    const ids = await seedAccountAdjustments(personId, [{ amountCents: 5000, effectiveDate: '2012-02-10', description: 'Febbraio' }, ...march]);
    const expected = expectedStatement(
      march.map((movement, index) => ({ ...movement, id: ids[index + 1]! })),
      5000,
    );
    const closing = expected[0]!.balanceAfterCents;

    // The default period (AC 12/19): today's 12 months — nothing of 2012 in it, so the
    // PERIOD empty text, and both balances equal to the whole history.
    await page.goto(`/it/dashboard/people/${personId}`);
    const today = todayRome();
    await expect(page.getByTestId('account-period-from')).toHaveValue(twelveMonthsBefore(today));
    await expect(page.getByTestId('account-period-to')).toHaveValue(today);
    await expect(page.getByTestId('account-period-reset')).toHaveCount(0);
    await expect(page.getByTestId('account-statement-empty')).toHaveText('Nessun movimento nel periodo selezionato.');
    await expect(page.getByTestId('mobile-account-empty')).toHaveText('Nessun movimento in questo periodo.');
    await expect(page.getByTestId('account-period-opening')).toHaveText(itMoney(closing));
    await expect(page.getByTestId('account-period-closing')).toHaveText(itMoney(closing));
    await expect(page.getByTestId('account-period-summary')).toContainText(`Saldo all'inizio del ${itDate(twelveMonthsBefore(today))}`);
    await expect(page.getByTestId('account-opening-row')).toHaveCount(0);
    const defaultUrl = page.url();

    // AC 14/28: an inverted period, then a missing date — an announced error, no navigation.
    const form = page.getByRole('form', { name: 'Periodo', exact: true });
    await expect(form).toHaveCount(1);
    await page.getByTestId('account-period-from').fill(TO);
    await page.getByTestId('account-period-to').fill(FROM);
    await page.getByTestId('account-period-apply').click();
    await expect(page.getByTestId('account-period-error')).toHaveText('La data iniziale non può essere successiva a quella finale.');
    await expect(page.getByTestId('account-period-error')).toHaveAttribute('role', 'alert');
    await expect(page.getByTestId('account-period-to')).toHaveAttribute('aria-invalid', 'true');
    expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="account-period-form"]') !== null)).toBe(true);
    await page.getByTestId('account-period-to').fill('');
    await page.getByTestId('account-period-apply').click();
    await expect(page.getByTestId('account-period-error')).toHaveText('Inserisci entrambe le date.');
    expect(page.url()).toBe(defaultUrl);

    // AC 14/16/17: a valid period — the URL carries it (no page), page 1 of the period.
    await page.getByTestId('account-period-from').fill(FROM);
    await page.getByTestId('account-period-to').fill(TO);
    await page.getByTestId('account-period-apply').click();
    await expect(page).toHaveURL(new RegExp(`/it/dashboard/people/${personId}\\?from=${FROM}&to=${TO}$`));
    await expect(page.getByTestId('account-period-error')).toHaveCount(0);
    await expect(page.getByTestId('account-period-reset')).toBeVisible();
    const rows = page.getByTestId('account-movement-row');
    await expect(rows).toHaveCount(20);
    await expect(page.getByTestId('account-period-opening')).toHaveText(itMoney(5000));
    await expect(page.getByTestId('account-period-closing')).toHaveText(itMoney(closing));
    await expect(page.getByTestId('account-period-summary')).toContainText(`Saldo all'inizio del ${itDate(FROM)}`);
    await expect(page.getByTestId('account-period-summary')).toContainText(`Saldo alla fine del ${itDate(TO)}`);
    await expect(page.getByTestId('account-statement-header-row')).toContainText('Saldo');
    const balances = page.getByTestId('account-movement-balance');
    for (let index = 0; index < 20; index += 1) {
      await expect(balances.nth(index), `page 1 row ${index}`).toHaveText(itMoney(expected[index]!.balanceAfterCents));
    }
    await expect(page.getByTestId('account-opening-row')).toHaveCount(0);

    // AC 15: the pagination carries the period, `page` first.
    await expect(page.getByTestId('account-statement-pagination-status')).toHaveText('1 / 2');
    await expect(page.getByTestId('account-statement-page-next')).toHaveAttribute('href', new RegExp(`/it/dashboard/people/${personId}\\?page=2&from=${FROM}&to=${TO}$`));
    await page.getByTestId('account-statement-page-next').click();
    await expect(page.getByTestId('account-statement-pagination-status')).toHaveText('2 / 2');
    await expect(rows).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      await expect(balances.nth(index), `page 2 row ${index}`).toHaveText(itMoney(expected[20 + index]!.balanceAfterCents));
    }
    // AC 18: the opening line closes the LAST page — the last row of the table, not a movement.
    const openingRow = page.getByTestId('account-opening-row');
    await expect(openingRow).toHaveCount(1);
    await expect(openingRow).toContainText(itDate(FROM));
    await expect(openingRow).toContainText('Saldo iniziale');
    await expect(openingRow.getByTestId('account-opening-balance')).toHaveText(itMoney(5000));
    expect(await openingRow.evaluate((row) => row.nextElementSibling === null && row.parentElement?.lastElementChild === row)).toBe(true);
    await expect(page.getByTestId('account-period-summary')).toBeVisible();

    // AC 15: a page out of range comes back to the last page OF THE PERIOD.
    await page.goto(`/it/dashboard/people/${personId}?page=999&from=${FROM}&to=${TO}`);
    await expect(page.getByTestId('account-statement-pagination-status')).toHaveText('2 / 2');

    // AC 22-24: both exports carry the period; the xlsx is the screen plus the opening line, the PDF a 200.
    await page.getByTestId('export-menu-trigger').click();
    const xlsHref = await page.getByTestId('export-menu-xls').getAttribute('href');
    const pdfHref = await page.getByTestId('export-menu-pdf').getAttribute('href');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('export-menu-sheet')).toHaveCount(0);
    expect(xlsHref).toBe(`/api/v1/people/${personId}/account/movements?from=${FROM}&to=${TO}&format=xlsx&locale=it`);
    expect(pdfHref).toBe(`/api/v1/people/${personId}/account/pdf?from=${FROM}&to=${TO}&locale=it`);
    const xlsx = await page.request.get(xlsHref!);
    expect(xlsx.status()).toBe(200);
    const sheet = await loadWorkbook(await xlsx.body());
    expect(sheet.getRow(1).values).toEqual([undefined, 'Data', 'Tipo', 'Descrizione', 'Importo', 'Saldo', 'Registrato da']);
    expect(sheet.rowCount).toBe(1 + 22 + 1);
    expect(sheet.getRow(2).getCell(5).value).toBe(closing / 100);
    expect(sheet.getRow(23).getCell(5).value).toBe(expected[21]!.balanceAfterCents / 100);
    const openingLine = sheet.getRow(24);
    expect(openingLine.getCell(1).value).toBe(itDate(FROM));
    expect(openingLine.getCell(2).value).toBe('Saldo iniziale');
    expect(openingLine.getCell(4).value).toBeNull();
    expect(openingLine.getCell(5).value).toBe(50);
    expect(openingLine.getCell(5).numFmt).toBe('#,##0.00 "€"');
    const pdf = await page.request.get(pdfHref!);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // AC 27: at 800px (the 641-900 band) the admin grid fits — no column pushed out of view.
    await page.setViewportSize({ width: 800, height: 720 });
    expect(await page.locator('.account-desktop-body').evaluate((grid) => grid.scrollWidth - grid.clientWidth)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1280, height: 720 });

    // AC 14: back to the last 12 months — no parameter, and the fields show the default again.
    await page.getByTestId('account-period-reset').click();
    await expect(page).toHaveURL(new RegExp(`/it/dashboard/people/${personId}$`));
    await expect(page.getByTestId('account-period-from')).toHaveValue(twelveMonthsBefore(today));
    await expect(page.getByTestId('account-period-to')).toHaveValue(today);
    await expect(page.getByTestId('account-period-reset')).toHaveCount(0);

    // AC 13: the legacy `/account` URL lands on the same period.
    await page.goto(`/it/dashboard/people/${personId}/account?from=${FROM}&to=${TO}`);
    await expect(page).toHaveURL(new RegExp(`/it/dashboard/people/${personId}\\?from=${FROM}&to=${TO}$`));
    await expect(page.getByTestId('account-period-from')).toHaveValue(FROM);
    await expect(page.getByTestId('account-period-to')).toHaveValue(TO);
  });

  test('the default period is the last 12 months of Rome: a movement of 13 months ago is the opening balance, one of 11 months ago is in the list, and the exports carry those bounds (AC 12, 16, 22)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const { personId } = await createPilotPerson(page, 'Predefinito');
    const today = todayRome();
    const defaultFrom = twelveMonthsBefore(today);
    // About 13 months ago (30 days before the default `from`) and about 11
    // months ago (30 days after it): on either side of the bound, and never
    // in the current month.
    await seedAccountAdjustments(personId, [
      { amountCents: 4200, effectiveDate: addDaysIso(defaultFrom, -30), description: 'Tredici mesi fa' },
      { amountCents: 1300, effectiveDate: addDaysIso(defaultFrom, 30), description: 'Undici mesi fa' },
    ]);

    await page.goto(`/it/dashboard/people/${personId}`);
    await expect(page.getByTestId('account-movement-row')).toHaveCount(1);
    await expect(page.getByTestId('account-movement-row')).toContainText('Undici mesi fa');
    await expect(page.getByTestId('account-period-opening')).toHaveText(itMoney(4200));
    await expect(page.getByTestId('account-period-closing')).toHaveText(itMoney(5500));
    await expect(page.getByTestId('account-movement-balance')).toHaveText(itMoney(5500));
    await expect(page.getByTestId('account-opening-row').getByTestId('account-opening-balance')).toHaveText(itMoney(4200));
    await page.getByTestId('export-menu-trigger').click();
    await expect(page.getByTestId('export-menu-xls')).toHaveAttribute('href', `/api/v1/people/${personId}/account/movements?from=${defaultFrom}&to=${today}&format=xlsx&locale=it`);
    await expect(page.getByTestId('export-menu-pdf')).toHaveAttribute('href', `/api/v1/people/${personId}/account/pdf?from=${defaultFrom}&to=${today}&locale=it`);
    // The pagination keeps today's `?page=N` exactly in the default period (no movement for a second page here: the link is absent).
    await expect(page.getByTestId('account-statement-page-next')).toHaveCount(0);
  });

  test('phone (375 and 320): one column of 44px controls, the balance on every card and in the sheet, the opening card out of the tab order, nothing overflowing (AC 17, 18, 27, 28)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const { personId } = await createPilotPerson(page, 'Telefono');
    const fixture = [
      { amountCents: 10000, effectiveDate: '2012-02-01', description: 'Apertura' },
      { amountCents: -2550, effectiveDate: '2012-03-05', description: 'Primo di marzo' },
      { amountCents: 123456, effectiveDate: '2012-03-20', description: 'Ricarica importante con una descrizione lunga' },
      { amountCents: -99, effectiveDate: '2012-03-20' },
    ];
    const ids = await seedAccountAdjustments(personId, fixture);
    const expected = expectedStatement(
      fixture.slice(1).map((movement, index) => ({ ...movement, id: ids[index + 1]! })),
      10000,
    );

    await page.setViewportSize(PHONE);
    await page.goto(`/it/dashboard/people/${personId}?from=${FROM}&to=${TO}`);
    const cards = page.getByTestId('account-movement-row-mobile');
    await expect(cards).toHaveCount(3);
    const notes = page.getByTestId('account-movement-balance-mobile');
    for (let index = 0; index < 3; index += 1) {
      const balanceText = itMoneyText(expected[index]!.balanceAfterCents);
      await expect(notes.nth(index)).toHaveText(`Saldo ${balanceText}`);
      // AC 28: the card's accessible name says the balance too.
      await expect(cards.nth(index)).toHaveAttribute('aria-label', new RegExp(`Saldo ${balanceText.replace(/\./g, '\\.')}$`));
    }

    // AC 18: the opening card — last in the list, a plain block, never reached by Tab.
    const openingCard = page.getByTestId('account-opening-row-mobile');
    await expect(openingCard).toBeVisible();
    await expect(openingCard).toContainText('Saldo iniziale');
    await expect(openingCard).toContainText(itDate(FROM));
    expect(await openingCard.evaluate((card) => card.tagName === 'DIV' && card.parentElement?.lastElementChild === card && card.querySelector('a,button,input,[tabindex]') === null)).toBe(true);
    await page.locator('body').focus();
    for (let index = 0; index < 40; index += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="account-opening-row-mobile"]') ?? null)).toBeNull();
    }

    // AC 17: the sheet has the "Saldo" line after "Importo".
    await cards.nth(0).click();
    const sheet = page.getByTestId('mobile-account-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Saldo');
    // At the TOP of the scrim: the admin sheet (actor, balance, the rettifica action) reaches past the middle of the screen.
    await page.getByTestId('mobile-account-sheet-scrim').click({ position: { x: 20, y: 20 } });
    await expect(sheet).toHaveCount(0);

    // AC 27: one column, every control of the form at 44px (the reset is shown: the period is explicit).
    await expect(page.getByTestId('account-period-reset')).toBeVisible();
    expect(await targetsUnderFloor(page, '[data-testid="account-period-form"]')).toEqual([]);
    const fromBox = (await page.getByTestId('account-period-from').boundingBox())!;
    const toBox = (await page.getByTestId('account-period-to').boundingBox())!;
    expect(toBox.y).toBeGreaterThan(fromBox.y + fromBox.height - 1);
    expect(await pageOverflow(page)).toBe(0);
    expect(await cardOverflows(page, '[data-testid="account-movement-row-mobile"], [data-testid="account-opening-row-mobile"], [data-testid="account-period-summary"]')).toEqual([]);

    // AC 28: an invalid period at this width — announced, the focus stays in the form.
    await page.getByTestId('account-period-to').fill('2012-01-01');
    await page.getByTestId('account-period-apply').click();
    await expect(page.getByTestId('account-period-error')).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="account-period-form"]') !== null)).toBe(true);
    expect(await pageOverflow(page)).toBe(0);

    await page.setViewportSize({ width: 320, height: 568 });
    expect(await pageOverflow(page)).toBe(0);
    expect(await targetsUnderFloor(page, '[data-testid="account-period-form"]')).toEqual([]);
    expect(await cardOverflows(page, '[data-testid="account-movement-row-mobile"], [data-testid="account-opening-row-mobile"], [data-testid="account-period-summary"]')).toEqual([]);
  });
});

test.describe('Estratto conto by period — the export cap and the self face (story 19.11, AC 21, 25)', () => {
  test('over 2 000 movements in the period the PDF entry is a readable message, not a link — the Excel stays; under it both are links (AC 25)', async ({ page }) => {
    test.slow();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const heavy = await createPilotPerson(page, 'Tetto');
    // 2 001 rettifiche of ±1 cent across 2010, net +1 cent (no negative balance for any list to pick up).
    await seedAccountAdjustments(
      heavy.personId,
      Array.from({ length: 2001 }, (_, index) => ({
        amountCents: index % 2 === 0 ? 1 : -1,
        effectiveDate: new Date(Date.UTC(2010, 0, 1 + Math.floor(index / 6))).toISOString().slice(0, 10),
      })),
    );
    const light = await createPilotPerson(page, 'SottoTetto');
    await seedAccountAdjustments(
      light.personId,
      Array.from({ length: 20 }, (_, index) => ({ amountCents: 100 + index, effectiveDate: `2010-02-${String(1 + index).padStart(2, '0')}` })),
    );

    await page.goto(`/it/dashboard/people/${heavy.personId}?from=2010-01-01&to=2010-12-31`);
    await expect(page.getByTestId('account-statement-pagination-status')).toHaveText('1 / 101');
    await page.getByTestId('export-menu-trigger').click();
    const unavailable = page.getByTestId('export-menu-pdf-unavailable');
    await expect(unavailable).toBeVisible();
    // `{max, number}`: Italian CLDR groups from five digits, so the cap reads "2000" (the 10 000 of the Excel cap reads "10.000").
    await expect(unavailable).toContainText("PDF non disponibile: il periodo ha più di 2000 movimenti. Restringi il periodo o scarica l'Excel.");
    await expect(page.getByTestId('export-menu-pdf')).toHaveCount(0);
    await expect(page.getByTestId('export-menu-xls')).toHaveAttribute('href', `/api/v1/people/${heavy.personId}/account/movements?from=2010-01-01&to=2010-12-31&format=xlsx&locale=it`);
    // The server's own 422 stays the last line, unchanged.
    const refused = await page.request.get(`/api/v1/people/${heavy.personId}/account/pdf?from=2010-01-01&to=2010-12-31`);
    expect(refused.status()).toBe(422);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('EXPORT_TOO_LARGE');

    // In the phone sheet the message is readable: inside the viewport, nothing sticking out.
    await page.keyboard.press('Escape');
    await page.setViewportSize(PHONE);
    await page.getByTestId('export-menu-trigger').click();
    await expect(unavailable).toBeVisible();
    const box = (await unavailable.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    expect(await cardOverflows(page, '[data-testid="export-menu-pdf-unavailable"]')).toEqual([]);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto(`/it/dashboard/people/${light.personId}?from=2010-01-01&to=2010-12-31`);
    await page.getByTestId('export-menu-trigger').click();
    await expect(page.getByTestId('export-menu-pdf')).toHaveCount(1);
    await expect(page.getByTestId('export-menu-xls')).toHaveCount(1);
    await expect(page.getByTestId('export-menu-pdf-unavailable')).toHaveCount(0);
  });

  test('"Il mio conto" has the same period form, summary, column, opening line and exports — on its own URL (AC 21)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const password = 'PeriodSelfFace123!';
    const pilot = await createPilotWithLogin(page, password, 'MioConto');
    const fixture = [
      { amountCents: 7000, effectiveDate: '2011-12-31', description: 'Fine 2011' },
      ...Array.from({ length: 21 }, (_, index) => ({ amountCents: 1000 + index, effectiveDate: `2012-03-${String(1 + index).padStart(2, '0')}`, description: `Marzo ${index}` })),
    ];
    const ids = await seedAccountAdjustments(pilot.personId, fixture);
    const expected = expectedStatement(
      fixture.slice(1).map((movement, index) => ({ ...movement, id: ids[index + 1]! })),
      7000,
    );

    await loginExpectingDashboard(page, pilot.email, password);
    await page.goto('/it/dashboard/my-account');
    await expect(page.getByTestId('account-statement-empty')).toHaveText('Nessun movimento nel periodo selezionato.');
    await page.getByTestId('account-period-from').fill(FROM);
    await page.getByTestId('account-period-to').fill(TO);
    await page.getByTestId('account-period-apply').click();
    await expect(page).toHaveURL(new RegExp(`/it/dashboard/my-account\\?from=${FROM}&to=${TO}$`));
    await expect(page.getByTestId('account-movement-row')).toHaveCount(20);
    await expect(page.getByTestId('account-period-opening')).toHaveText(itMoney(7000));
    await expect(page.getByTestId('account-period-closing')).toHaveText(itMoney(expected[0]!.balanceAfterCents));
    await expect(page.getByTestId('account-movement-balance').first()).toHaveText(itMoney(expected[0]!.balanceAfterCents));
    await expect(page.getByTestId('account-statement-header-row')).not.toContainText('Registrato da');
    await page.getByTestId('export-menu-trigger').click();
    await expect(page.getByTestId('export-menu-xls')).toHaveAttribute('href', `/api/v1/people/${pilot.personId}/account/movements?from=${FROM}&to=${TO}&format=xlsx&locale=it`);
    await expect(page.getByTestId('export-menu-pdf')).toHaveAttribute('href', `/api/v1/people/${pilot.personId}/account/pdf?from=${FROM}&to=${TO}&locale=it`);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('export-menu-sheet')).toHaveCount(0);

    const next = page.getByTestId('account-statement-page-next');
    await expect(next).toHaveAttribute('href', new RegExp(`/it/dashboard/my-account\\?page=2&from=${FROM}&to=${TO}$`));
    await next.click();
    await expect(page.getByTestId('account-movement-row')).toHaveCount(1);
    await expect(page.getByTestId('account-movement-balance')).toHaveText(itMoney(expected[20]!.balanceAfterCents));
    await expect(page.getByTestId('account-opening-row')).toContainText('Saldo iniziale');
    await expect(page.getByTestId('account-opening-row').getByTestId('account-opening-balance')).toHaveText(itMoney(7000));

    await page.getByTestId('account-period-reset').click();
    await expect(page).toHaveURL(/\/it\/dashboard\/my-account$/);
  });
});
