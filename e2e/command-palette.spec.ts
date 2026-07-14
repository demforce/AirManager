import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Command palette ⌘K (story 12.6, AC 6) — the four scenarios from the
 * story's closed list. Selectors are scoped to the palette dialog (never
 * page-level `getByRole('link'/'option', ...)`, project convention, lesson
 * 103-F1/11.2) and use `exact: true` where a label could otherwise
 * substring-match a sibling row.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const STAFF_EMAIL = 'staff@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/command-palette.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
  // The "Accedi" click leaves the real cursor resting wherever that button
  // was on the login page — on the dashboard that position can land inside
  // the (much later opened) palette's option list and hover-activate a row
  // the moment it renders there, independently of the component's own
  // active-row state. Parking the cursor away from any content keeps every
  // assertion below about "the active/first row" deterministic.
  await page.mouse.move(0, 0);
}

test.describe('Command palette (story 12.6)', () => {
  test('Ctrl+K opens the palette; nav items are gated like the sidebar; Enter navigates and closes', async ({ page }) => {
    await loginExpectingDashboard(page, PILOT_EMAIL);

    await page.keyboard.press('Control+k');
    const dialog = page.getByTestId('command-palette-dialog');
    await expect(dialog).toBeVisible();

    // A pilot holds only `self.read` (+ `bookings.manage.own`,
    // `expiries.propose.own`) — same 3-item nav as the sidebar (rbac.spec.ts),
    // and neither "Crea" (no `flights.manage`/no create button) nor
    // "Risultati" (search is staff-only) ever appears.
    await expect(dialog.getByRole('option')).toHaveCount(3);
    await expect(dialog.getByText('Crea', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Risultati', { exact: true })).toHaveCount(0);

    const input = page.getByTestId('command-palette-input');
    await input.fill('Prenotazioni');
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await input.press('Enter');

    await expect(page).toHaveURL(/\/it\/dashboard\/bookings$/);
    await expect(dialog).toBeHidden();
  });

  test('"Registra volo" from the palette on another page lands on flights with the create dialog open', async ({ page }) => {
    await loginExpectingDashboard(page, STAFF_EMAIL);
    await page.goto('/it/dashboard/people');

    await page.getByTestId('command-palette-trigger').click();
    const dialog = page.getByTestId('command-palette-dialog');
    const input = page.getByTestId('command-palette-input');
    await input.fill('Registra volo');
    await expect(dialog.getByRole('option', { name: 'Registra volo', exact: true })).toBeVisible();
    await input.press('Enter');

    await expect(page).toHaveURL(/\/it\/dashboard\/flights\?new=1$/);
    await expect(page.getByTestId('flight-form')).toBeVisible();
  });

  test('staff searching a person can open their scheda from the palette', async ({ page }) => {
    await loginExpectingDashboard(page, STAFF_EMAIL);

    await page.keyboard.press('Control+k');
    const dialog = page.getByTestId('command-palette-dialog');
    const input = page.getByTestId('command-palette-input');
    await input.fill('Volante');

    // Seed fixture "Piero Volante" (prisma/seed.ts) — `personLabel`
    // convention is "Cognome Nome".
    const personOption = dialog.getByRole('option', { name: 'Volante Piero', exact: true });
    await expect(personOption).toBeVisible();
    await input.press('Enter');

    await expect(page).toHaveURL(/\/it\/dashboard\/people\/[^/?]+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Volante Piero' })).toBeVisible();
  });

  test('"Registra volo" from the palette while ALREADY on the flights page opens the dialog and cleans ?new=1 (review 12.6, 126-F1)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.goto('/it/dashboard/flights');
    await page.getByTestId('flight-open-register').waitFor();
    // TD-9: `flight-open-register` being in the DOM only proves SSR painted
    // it — NOT that client hydration (and therefore `SearchTrigger`'s ⌘K
    // listener) has run yet. Waiting for the product's own readiness signal
    // (`data-shortcut-ready`, set the instant the listener attaches) closes
    // that lost-keypress race deterministically, with no timing guess.
    await expect(page.getByTestId('command-palette-trigger')).toHaveAttribute('data-shortcut-ready', 'true');

    const palette = page.getByTestId('command-palette-dialog');
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();

    // TD-9 root cause of this test's long "known deferred" red: the palette
    // input is `role="combobox"` (command-palette.tsx:265, explicit ARIA
    // combobox pattern), so this test's old `getByRole('textbox')` could
    // NEVER match it — every failing run's snapshot showed the dialog open
    // and the combobox focused; the error was misread as "dialog not
    // opening". Every OTHER test in this file already used the testid.
    await page.getByTestId('command-palette-input').fill('Registra');
    await page.keyboard.press('Enter');

    // Same route, no remount: the dialog must open anyway...
    await expect(page.getByTestId('flight-form')).toBeVisible();
    // ...and the deep-link param must not linger in the URL.
    await expect(page).not.toHaveURL(/new=1/);
  });

  test('clicking the Search Trigger opens the palette', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    await page.getByTestId('command-palette-trigger').click();
    await expect(page.getByTestId('command-palette-dialog')).toBeVisible();
  });
});
