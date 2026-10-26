import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/aog-overview-count.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/**
 * Story AOG-1a, AC 13 (ratifica R-AOG-f) — the Panoramica's fleet-wide "N AOG"
 * counter used to be derived from `listAircraft(page 1, pageSize:
 * OPTIONS_PAGE_SIZE = 100)`, i.e. the grounded aircraft among the first HUNDRED
 * by registration, while `/dashboard/fleet` used the unpaginated
 * `listOutOfServiceAircraft`. Measured on this machine BEFORE the fix, 101
 * active aircraft, same instant, same DB: Panoramica "0 AOG", Flotta "1 AOG".
 *
 * **Why this spec lives in its OWN serialized project, LAST in the chain**
 * (two independent reasons, both fatal under `fullyParallel`):
 *  1. it asserts an EQUALITY between two GLOBAL aggregates read from two page
 *     loads — a concurrent writer grounding or creating an aircraft between the
 *     two reads flips it (review Billing-2 F4: that class flaked 2 runs out of
 *     2);
 *  2. to DISCRIMINATE at all it has to push the active fleet past
 *     `OPTIONS_PAGE_SIZE`, and a 100+ aircraft fleet degrades every `<select>`
 *     picker in the suite (the open `OPTIONS_PAGE_SIZE` TD) — so it must run
 *     when nothing else is left to run. Nothing depends on this project.
 *
 * The guard VERIFIES ITS OWN PRECONDITION before asserting: with fewer active
 * aircraft than `OPTIONS_PAGE_SIZE` sorting BEFORE the grounded one, pre-fix
 * and post-fix agree and the assertion would prove nothing. It therefore
 * creates exactly the shortfall it needs (registrations prefixed so they sort
 * first) and reports how many it created.
 */

/** Mirrors `dashboard/page.tsx`'s own `OPTIONS_PAGE_SIZE` — the page size that used to cap the count. */
const OPTIONS_PAGE_SIZE = 100;

async function loginExpectingDashboard(page: Page): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** The trailing "N AOG" of a `.page-head .sub` summary, as a number. */
function aogCountIn(sub: string): number {
  const match = /(\d+)\s+AOG/.exec(sub);
  if (!match) throw new Error(`No "N AOG" segment in page-head sub: ${JSON.stringify(sub)}`);
  return Number(match[1]);
}

/** The "N disponibili" of a `N totali · N disponibili · N AOG` summary (the Flotta page head AND the Panoramica's Flotta widget share the template). */
function availableCountIn(summary: string): number {
  const match = /(\d+)\s+disponibili/.exec(summary);
  if (!match) throw new Error(`No "N disponibili" segment in summary: ${JSON.stringify(summary)}`);
  return Number(match[1]);
}

/** The denominator of the "Flotta disponibile N / M" KPI — M is the OPERATIONAL fleet the KPI measures against. */
function kpiDenominator(kpi: string): number {
  const match = /\/\s*(\d+)/.exec(kpi);
  if (!match) throw new Error(`No "/ M" unit in the KPI: ${JSON.stringify(kpi)}`);
  return Number(match[1]);
}

test.describe('Panoramica fleet-wide AOG count (story AOG-1a, AC 13)', () => {
  test('the Panoramica and the Flotta announce the SAME number of grounded aircraft, past the first OPTIONS_PAGE_SIZE by registration', async ({
    page,
  }) => {
    test.slow();
    await loginExpectingDashboard(page);

    const stamp = Date.now().toString(36).toUpperCase();

    // The aircraft this test grounds sorts LAST by registration ("Z…"), so it
    // can only be counted by a reader that looks past the first page.
    const groundedRegistration = `I-ZAOG${stamp}`.toUpperCase().slice(0, 20);
    const created = await page.request.post('/api/v1/aircraft', {
      data: { registration: groundedRegistration, type: 'Ultraleggero 3 assi', model: 'AOG count', hourMeterMinutes: 1 },
    });
    expect(created.status()).toBe(201);
    const grounded = (await created.json()) as { id: string };
    const groundResponse = await page.request.post(`/api/v1/aircraft/${grounded.id}/out-of-service`, {
      data: { reason: `Conteggio Panoramica ${stamp}`, outOfServiceUntil: '2099-12-31' },
    });
    expect(groundResponse.status()).toBe(200);

    // --- precondition: at least OPTIONS_PAGE_SIZE aircraft sorting BEFORE it ---
    const countActive = async (): Promise<number> => {
      const response = await page.request.get('/api/v1/aircraft?pageSize=1');
      expect(response.status()).toBe(200);
      return ((await response.json()) as { total: number }).total;
    };
    let active = await countActive();
    const activeBefore = active;
    let filler = 0;
    while (active <= OPTIONS_PAGE_SIZE) {
      const response = await page.request.post('/api/v1/aircraft', {
        data: {
          // "A…" so every filler sorts ahead of the grounded "Z…" one.
          registration: `I-AFIL${stamp}${String(filler).padStart(3, '0')}`.toUpperCase().slice(0, 20),
          type: 'Ultraleggero 3 assi',
          model: 'AOG count filler',
          hourMeterMinutes: 1,
        },
      });
      expect(response.status()).toBe(201);
      filler += 1;
      active += 1;
    }
    // Reported so a future reader knows what this guard costs and why.
    console.log(`[AC 13] active aircraft before: ${activeBefore}, filler created: ${filler}, active now: ${active}`);
    expect(active).toBeGreaterThan(OPTIONS_PAGE_SIZE);

    // --- the guard: two pages, one number ---------------------------------
    await page.goto('/it/dashboard');
    const overviewSub = (await page.locator('.page-head .sub').first().textContent())?.trim() ?? '';
    // Review MINOR-1: the OTHER two fleet statements on the SAME screen. Before
    // that fix the AOG counter was fleet-wide while these two stayed capped at
    // the first OPTIONS_PAGE_SIZE, so the Panoramica announced two incompatible
    // fleets at once (measured: "24 AOG" beside "87 / 88", 88 + 24 = 112,
    // neither 100 nor the 175 aircraft actually active).
    const overviewKpi = (await page.getByTestId('kpi-fleet-available').textContent())?.trim() ?? '';
    const overviewFleetWidget = (await page.getByTestId('fleet-card-widget').locator('.card-sub').first().textContent())?.trim() ?? '';
    await page.goto('/it/dashboard/fleet');
    const fleetSub = (await page.locator('.page-head .sub').first().textContent())?.trim() ?? '';

    // Pre-fix this failed by construction: the Panoramica could not see a
    // grounded aircraft sorted past position 100.
    expect(aogCountIn(overviewSub)).toBe(aogCountIn(fleetSub));
    // ...and the number is a real one, not two zeros agreeing by accident.
    expect(aogCountIn(fleetSub)).toBeGreaterThanOrEqual(1);
    // Review MINOR-1 — the whole screen tells ONE story: the Flotta widget
    // repeats the Flotta page's own three buckets, and the KPI measures against
    // the same operational fleet. Values are compared BETWEEN surfaces, never
    // against a hard-coded number (the fleet is other specs' fixture too).
    expect(aogCountIn(overviewFleetWidget)).toBe(aogCountIn(fleetSub));
    expect(availableCountIn(overviewFleetWidget)).toBe(availableCountIn(fleetSub));
    expect(kpiDenominator(overviewKpi)).toBe(availableCountIn(fleetSub));
  });
});
