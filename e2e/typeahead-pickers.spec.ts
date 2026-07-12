import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/typeahead-pickers.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/** Run-unique names (same pattern as the other specs, for the dirty/parallel DB). */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A safely-in-the-past date, before any run-unique aircraft/rate created below. */
const PAST_DATE = '2020-01-01';

/** Splits an array into fixed-size chunks — used to bound API concurrency below. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

test.describe('Typeahead pickers find entries past the 100-option page cap (story TD-3, AC 1/5 — finding 5.4 D1, the real regression test)', () => {
  test('a pilot ranked past the 100th alphabetically is selectable via server-side typeahead in the flight form, and the flight registers', async ({
    page,
  }) => {
    // 105 buffer people via API (plus the target, plus an aircraft/rate) is
    // slower than Playwright's default 30s.
    test.setTimeout(180_000);

    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const suffix = uniqueSuffix();
    const BUFFER_COUNT = 105;

    /**
     * Creates ONE active-pilot person via API (no UI, no login) whose
     * lastName sorts strictly BEFORE the target's `Zz...` prefix — the
     * buffer that pushes the target past `listPeople`'s
     * `orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]` 100-row page
     * (`OPTIONS_PAGE_SIZE`, `flights/page.tsx`), REGARDLESS of however much
     * ambient data other parallel specs have already created (run-unique,
     * lezione 6.3 F1: nothing here depends on a fresh/small DB).
     */
    async function createBufferPilot(index: number): Promise<void> {
      const lastName = `AAAtypeahead-${suffix}-${String(index).padStart(3, '0')}`;
      const personResponse = await page.request.post('/api/v1/people', { data: { firstName: 'Buffer', lastName } });
      if (personResponse.status() !== 201) {
        throw new Error(`Buffer person ${index} failed: ${personResponse.status()} ${await personResponse.text()}`);
      }
      const person = (await personResponse.json()) as { id: string };
      const profileResponse = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
        data: { licenseNumber: `IT-PPL-${suffix}-${index}`, licenseType: 'PPL(A)' },
      });
      if (profileResponse.status() !== 200) {
        throw new Error(`Buffer profile ${index} failed: ${profileResponse.status()} ${await profileResponse.text()}`);
      }
    }

    // Bounded concurrency (batches of 10) — fast without hammering the dev
    // server's connection pool.
    const bufferIndices = Array.from({ length: BUFFER_COUNT }, (_, i) => i + 1);
    for (const batch of chunk(bufferIndices, 10)) {
      await Promise.all(batch.map((index) => createBufferPilot(index)));
    }

    // The target: an active pilot whose lastName ("Zztypeahead-...") sorts
    // AFTER all 105 buffer entries above.
    const targetLastName = `Zztypeahead-${suffix}`;
    const targetFirstName = 'Oltre100';
    const targetPersonResponse = await page.request.post('/api/v1/people', {
      data: { firstName: targetFirstName, lastName: targetLastName },
    });
    expect(targetPersonResponse.status()).toBe(201);
    const targetPerson = (await targetPersonResponse.json()) as { id: string };
    const targetProfileResponse = await page.request.put(`/api/v1/people/${targetPerson.id}/profiles/pilot`, {
      data: { licenseNumber: `IT-PPL-${suffix}-target`, licenseType: 'PPL(A)' },
    });
    expect(targetProfileResponse.status()).toBe(200);

    // The regression's real proof, BEFORE ever touching the UI: the
    // form-picker's own domain query (`profile=pilot-or-student`, active
    // only) already returns more than 100 matches — the old single-page
    // `listPeople` call this story replaces would have silently dropped the
    // target.
    const countResponse = await page.request.get('/api/v1/people?pageSize=1&profile=pilot-or-student');
    expect(countResponse.status()).toBe(200);
    const countBody = (await countResponse.json()) as { total: number };
    expect(countBody.total).toBeGreaterThan(100);

    // A real aircraft with a rate in effect, so the flight actually
    // registers with a computed charge (same pattern as `flights.spec.ts`'s
    // `createAircraftWithRate`).
    const aircraftRegistration = `I-TA${suffix}`.toUpperCase().slice(0, 20);
    const aircraftResponse = await page.request.post('/api/v1/aircraft', {
      data: { registration: aircraftRegistration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 100 },
    });
    expect(aircraftResponse.status()).toBe(201);
    const aircraft = (await aircraftResponse.json()) as { id: string; registration: string };
    const rateResponse = await page.request.post(`/api/v1/aircraft/${aircraft.id}/rates`, {
      data: { priceCentsPerHour: 9000, validFrom: PAST_DATE },
    });
    expect(rateResponse.status()).toBe(201);

    await page.goto('/it/dashboard/flights');
    // Story 12.3 (AC 2): the registration form now lives in a Dialog.
    await page.getByTestId('flight-open-register').click();
    await expect(page.getByTestId('flight-form')).toBeVisible();

    // Velivolo: a fresh aircraft, not part of the >100 story but exercised
    // via the SAME typeahead pattern for a realistic full submit.
    const aircraftCombobox = page.getByTestId('flight-form').getByLabel('Velivolo');
    await aircraftCombobox.click();
    await aircraftCombobox.fill(aircraft.registration);
    await page.getByRole('option', { name: aircraft.registration, exact: true }).click();

    // Pilota o allievo: the target, ranked past the 100-row cap — typed
    // (server-side `q`, AC 1) and selected. This is the finding 5.4 D1
    // regression: before this story, this entry was simply never in the
    // picker's options at all.
    const personCombobox = page.getByTestId('flight-form').getByLabel('Pilota o allievo');
    await personCombobox.click();
    await personCombobox.fill(targetLastName);
    const targetOptionLabel = `${targetLastName} ${targetFirstName}`;
    const targetOption = page.getByRole('option', { name: targetOptionLabel, exact: true });
    await expect(targetOption).toBeVisible();
    await targetOption.click();
    await expect(personCombobox).toHaveValue(targetOptionLabel);

    await page.getByLabel('Ora decollo').fill('10:00');
    await page.getByLabel('Ora atterraggio').fill('10:45');
    await page.getByTestId('flight-form').getByRole('button', { name: 'Registra volo' }).click();

    // 45' @ 90,00 €/h -> 67,50 €.
    const resultPanel = page.getByTestId('flight-result-panel');
    await expect(resultPanel.getByTestId('flight-result-total')).toContainText(/67,50\s€/);

    // The registry row confirms the flight was recorded against the RIGHT
    // person (run-unique, so this can only be this test's own flight).
    const row = page.getByTestId('flight-row').filter({ hasText: aircraft.registration });
    await expect(row).toContainText(targetLastName);
    await expect(row).toContainText(/67,50\s€/);
  });
});
