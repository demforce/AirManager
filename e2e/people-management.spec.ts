import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/people-management.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Login that must succeed: waits for the dashboard redirect so the session
 * cookie is in place before the test navigates elsewhere. `admin` also holds
 * `people.manage`/`people.read` (ADMIN gets every permission, story 1.3), so
 * it exercises the same staff-only perimeter the story's AC 1/2 describe. */
async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniquePerson(prefix: string): { firstName: string; lastName: string; email: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    firstName: prefix,
    lastName: `Test-${suffix}`,
    email: `${prefix.toLowerCase()}-${suffix}@airmanager.local`,
  };
}

async function createPerson(page: Page, person: { firstName: string; lastName: string; email: string }): Promise<void> {
  await page.goto('/it/dashboard/people');
  await page.getByRole('button', { name: 'Nuova persona' }).click();
  await page.getByLabel('Nome', { exact: true }).fill(person.firstName);
  await page.getByLabel('Cognome', { exact: true }).fill(person.lastName);
  await page.getByLabel('Email', { exact: true }).fill(person.email);
  await page.getByRole('button', { name: 'Crea persona' }).click();
  await expect(page.getByTestId('people-feedback')).toBeVisible();
  // T0 hardening: filter by this test's own run-unique lastName instead of
  // assuming the row lands on the default page 1 — root-caused empirically
  // (same class as `flights.spec.ts`'s aircraft-list fix): `/dashboard/people`
  // is paginated 20/page ordered by `lastName asc`, and every test person's
  // lastName embeds an ever-increasing timestamp (`Test-<Date.now()>-...`),
  // so a freshly created person always sorts toward the END of that order
  // and is reliably ABSENT from page 1 once enough accumulated test data
  // exists — no amount of waiting fixes that, the row genuinely isn't on
  // that page. Searching (`?q=`, `people.service.ts`'s server-side filter)
  // guarantees it's the only row on the result page regardless of volume.
  await page.goto(`/it/dashboard/people?q=${encodeURIComponent(person.lastName)}`);
  await expect(page.getByRole('row', { name: new RegExp(person.lastName) })).toBeVisible();
}

test.describe('People CRUD with archiving (Story 2.1)', () => {
  test('staff/admin creates a person, who appears in the paginated searchable list (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Giulia');

    await createPerson(page, person);

    const row = page.getByRole('row', { name: new RegExp(person.lastName) });
    await expect(row).toBeVisible();
    await expect(row.getByText('Attiva')).toBeVisible();
  });

  test('search filters the list by first name, last name or email (AC 1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Marco');
    await createPerson(page, person);

    await page.goto('/it/dashboard/people');
    await page.getByPlaceholder('Cerca per nome, cognome o email…').fill(person.lastName);

    await expect(page.getByRole('row', { name: new RegExp(person.lastName) })).toBeVisible();
    // Debounced search: give the client time to push the new URL/refetch.
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(person.lastName)}`));
  });

  test('archiving a person removes them from the default list and shows them with the archived filter (AC 2)', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Sara');
    await createPerson(page, person);

    // `createPerson` already left the page on `?q=<lastName>` (T0 hardening,
    // see its own comment) — every navigation below preserves that filter
    // (client state seeded from `initialQuery`, `people-manager.tsx`), so
    // every row lookup that follows stays volume-independent: the search
    // narrows the result to this test's own person regardless of how many
    // OTHER people exist in the (unresettable, ever-growing) e2e database.
    const row = page.getByRole('row', { name: new RegExp(person.lastName) });
    await row.getByRole('button', { name: 'Archivia' }).click();
    await row.getByRole('button', { name: 'Conferma' }).click();
    // The default (includeArchived=false) list drops the row as soon as the
    // archive call resolves and `router.refresh()` re-fetches — waiting for
    // that here (rather than immediately `goto`-ing away) avoids racing the
    // in-flight `fetch()`, which a same-tab navigation would otherwise abort
    // before the request reaches the server.
    await expect(row).toHaveCount(0);

    // Fresh navigation, same `?q=` filter: still gone from the default list.
    await page.goto(`/it/dashboard/people?q=${encodeURIComponent(person.lastName)}`);
    await expect(page.getByRole('row', { name: new RegExp(person.lastName) })).toHaveCount(0);

    // With the archived filter: still there, and shown as archived.
    await page.getByLabel('Includi archiviate').check();
    const archivedRow = page.getByRole('row', { name: new RegExp(person.lastName) });
    await expect(archivedRow).toBeVisible();
    await expect(archivedRow.getByText('Archiviata')).toBeVisible();

    // Restoring: the row stays visible under "include archived" (unarchived
    // persons are always included, the filter only adds archived ones), just
    // with the status flipped back to active.
    await archivedRow.getByRole('button', { name: 'Ripristina' }).click();
    await archivedRow.getByRole('button', { name: 'Conferma' }).click();
    await expect(archivedRow.getByText('Attiva', { exact: true })).toBeVisible();

    await page.getByLabel('Includi archiviate').uncheck();
    await expect(page.getByRole('row', { name: new RegExp(person.lastName) })).toBeVisible();
  });

  test('a pilot (without people.read) is redirected away from /dashboard/people (AD-5, AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.goto('/it/dashboard/people');
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });

  test('a pilot gets a 403 AD-8 envelope from GET /api/v1/people directly (AC 3)', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    const response = await page.request.get('/api/v1/people');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('GET /api/v1/people returns the AD-8 401 envelope without a session', async ({ request }) => {
    const response = await request.get('/api/v1/people');
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });
});

test.describe('Person create dialog with optional role (Story 12.3, AC 4)', () => {
  test('selecting a role reveals its required fields (blocked client-side until filled); submit is a two-call flow (POST person, then PUT profile) and the activated profile shows on the scheda', async ({
    page,
  }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const person = uniquePerson('Ruolo');

    await page.goto('/it/dashboard/people');
    await page.getByRole('button', { name: 'Nuova persona' }).click();
    await page.getByLabel('Nome', { exact: true }).fill(person.firstName);
    await page.getByLabel('Cognome', { exact: true }).fill(person.lastName);
    await page.getByLabel('Ruolo').selectOption({ label: 'Pilota' });
    await expect(page.getByLabel('Numero licenza')).toBeVisible();

    // Submitting without the pilot profile's required fields is blocked
    // client-side (per-field error) — no POST /people at all yet.
    await page.getByRole('button', { name: 'Crea persona' }).click();
    await expect(page.getByLabel('Numero licenza')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('row', { name: new RegExp(person.lastName) })).toHaveCount(0);

    await page.getByLabel('Numero licenza').fill(`IT-PPL-${person.lastName}`);
    await page.getByLabel('Tipo licenza').fill('PPL(A)');
    await page.getByRole('button', { name: 'Crea persona' }).click();

    // Success: feedback + "Completa la scheda" link to the new person (AC 4).
    const feedback = page.getByTestId('people-feedback');
    await expect(feedback).toContainText('Persona creata.');
    const link = feedback.getByRole('link', { name: 'Completa la scheda' });
    await expect(link).toBeVisible();

    // The pilot profile was genuinely activated by the SECOND call (PUT .../profiles/pilot).
    await link.click();
    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/]+$/);
    const pilotSection = page.getByTestId('profile-section-pilot');
    await expect(pilotSection.getByText(`IT-PPL-${person.lastName}`, { exact: false })).toBeVisible();
  });
});
