// This spec writes GLOBAL AppSetting rows (club/scheduling/smtp — including
// `sched.*`) and runs in the `settings` Playwright project, serialized AFTER
// the main `chromium` project (playwright.config.ts) so its writes never race
// a concurrent booking create elsewhere. Running this file alone locally:
// `npx playwright test settings.spec.ts --no-deps` (otherwise Playwright
// first runs the `chromium` dependency project).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const STAFF_EMAIL = 'staff@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/settings.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const MAILPIT_API = 'http://localhost:8025/api/v1';

/** Same login helper as the other e2e specs. */
async function loginExpectingDashboard(page: Page, email: string, password: string = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

/**
 * Same hydration-race hardening as `bookings.spec.ts`'s
 * `gotoBookingsAndWaitForHydration`: the Impostazioni page mounts several
 * client-component cards (Club/Pianificazione/SMTP/Ratings), each with
 * its own controlled inputs. A `.fill()` that lands BEFORE React attaches
 * its event listeners updates the DOM value but never reaches the
 * component's state (React never re-renders that field since its own state
 * prop never changed, so the stale DOM value silently persists) — verified
 * during dev verification: the Scheduling card's `openTime` field
 * intermittently PUT its previous value instead of the freshly filled one.
 * A human never notices — hydration completes in well under a second — but
 * Playwright's automated interaction can outrun it. Test-only hardening;
 * no application code is touched.
 */
async function gotoSettingsAndWaitForHydration(page: Page): Promise<void> {
  await page.goto('/it/dashboard/settings');
  await page.waitForLoadState('networkidle');
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitSearchResult = { messages: MailpitMessageSummary[] };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as the other e2e specs. */
async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<MailpitFullMessage> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const searchResponse = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
    const searchBody = (await searchResponse.json()) as MailpitSearchResult;
    const found = searchBody.messages.find((message) => message.Subject.includes(subjectIncludes));

    if (found) {
      const messageResponse = await fetch(`${MAILPIT_API}/message/${found.ID}`);
      return (await messageResponse.json()) as MailpitFullMessage;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

// `mode: 'serial'` (Dev Agent Record): every test in this file writes GLOBAL
// `AppSetting` keys (club/scheduling/smtp) — serialized to avoid a
// `fullyParallel` race between tests in THIS file. A cross-FILE race with
// `booking-window.spec.ts` (which also writes `sched.*`) is separately
// closed by asserting on the PUT response itself (same request, no window)
// rather than a follow-up GET.
test.describe.configure({ mode: 'serial' });

/** Same permissive baseline as `booking-window.spec.ts`'s `PERMISSIVE_SCHEDULING` (Review F1: a real `sched.*` setting, once written, persists for the rest of the local e2e run — this file's own "Scheduling card" test writes a restrictive 08:00-20:00 window that must not leak into any other spec's or re-run's booking creates). PUT has no unset, so restoring to a maximally permissive window is the only way to neutralize leftover state. */
const PERMISSIVE_SCHEDULING = { openTime: '00:00', closeTime: '23:59', minSlotMinutes: 30, turnaroundMinutes: 0, maxAdvanceDays: 3650 };

test.describe('Impostazioni — Club/Pianificazione/SMTP cards (Story 12.11, AC 1/2)', () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await page.request.put('/api/v1/settings/scheduling', { data: PERMISSIVE_SCHEDULING });
    await page.close();
  });

  test('redirects a non-ADMIN (staff) actor away from /dashboard/settings', async ({ page }) => {
    await loginExpectingDashboard(page, STAFF_EMAIL);
    await gotoSettingsAndWaitForHydration(page);
    await expect(page).toHaveURL(/\/it\/dashboard$/);
  });

  test('Club card: ICAO/contact email/landing fee/instructions/membership fee round-trip through the save action\'s own responses', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);

    const icao = `LI${uniqueSuffix().slice(-2).toUpperCase()}`;
    const contactEmail = `ops-${uniqueSuffix()}@example.com`;

    await page.getByTestId('club-icao-input').fill(icao);
    await page.getByTestId('club-contact-email-input').fill(contactEmail);
    await page.getByTestId('club-landing-fee-input').fill('12.50');
    await page.getByTestId('club-membership-fee-input').fill('60.00');
    await page.getByTestId('club-instructions-it-input').fill('Presentarsi in torre.');

    // Assert on the save action's OWN 4 PUT responses (same request, no
    // window for another spec's concurrent write on the SAME global keys —
    // `membership.annualFeeCents` in particular is also written by
    // `membership-fee.spec.ts`; a follow-up GET here would reopen that race).
    const [clubResponse, feeResponse, instructionsResponse, membershipResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/club') && r.request().method() === 'PUT'),
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/ppr-landing-fee') && r.request().method() === 'PUT'),
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/ppr-operating-instructions') && r.request().method() === 'PUT'),
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/membership-fee') && r.request().method() === 'PUT'),
      page.getByTestId('club-settings-save').click(),
    ]);
    await expect(page.getByTestId('club-settings-feedback')).toBeVisible();

    expect(await clubResponse.json()).toEqual({ icao, contactEmail });
    expect((await feeResponse.json()).landingFeeCents).toBe(1250);
    expect((await instructionsResponse.json()).it).toBe('Presentarsi in torre.');
    expect((await membershipResponse.json()).annualFeeCents).toBe(6000);
  });

  test('Club card: a malformed contact email 422s and marks THAT field inline, not just the card-wide banner (story 14.2, AC 1/3)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);

    const emailInput = page.getByTestId('club-contact-email-input');
    await emailInput.fill('not-an-email');

    const [clubResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/settings/club') && r.request().method() === 'PUT'),
      page.getByTestId('club-settings-save').click(),
    ]);
    expect(clubResponse.status()).toBe(422);

    await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Inserisci un indirizzo email valido.')).toBeVisible();
  });

  test('Scheduling card: openTime/closeTime/minSlotMinutes/turnaroundMinutes/maxAdvanceDays round-trip', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);

    await page.getByTestId('scheduling-open-time-input').fill('08:00');
    await page.getByTestId('scheduling-close-time-input').fill('20:00');
    await page.getByTestId('scheduling-min-slot-input').fill('30');
    await page.getByTestId('scheduling-turnaround-input').fill('10');
    await page.getByTestId('scheduling-max-advance-input').fill('45');

    // Assert on the PUT's own response (same request, no window for a
    // concurrent writer elsewhere to land in between — `sched.*` is a
    // GLOBAL setting other specs, e.g. `booking-window.spec.ts`, also write;
    // a follow-up GET here would reopen exactly that race).
    const [putResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/v1/settings/scheduling') && response.request().method() === 'PUT'),
      page.getByTestId('scheduling-settings-save').click(),
    ]);
    expect(putResponse.status()).toBe(200);
    expect(await putResponse.json()).toEqual({ openTime: '08:00', closeTime: '20:00', minSlotMinutes: 30, turnaroundMinutes: 10, maxAdvanceDays: 45 });
    await expect(page.getByTestId('scheduling-settings-feedback')).toBeVisible();
  });

  test('SMTP card: saves host/port/security/from/user; GET never returns the password, only hasPassword; "Invia email di prova" sends a REAL email via Mailpit', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);

    // The contact email is needed for the test-send target — reuse the Club card's own save.
    const contactEmail = `smtp-test-${uniqueSuffix()}@example.com`;
    await page.getByTestId('club-contact-email-input').fill(contactEmail);
    await page.getByTestId('club-settings-save').click();
    await expect(page.getByTestId('club-settings-feedback')).toBeVisible();

    await page.getByTestId('smtp-host-input').fill('localhost');
    await page.getByTestId('smtp-port-input').fill('1025');
    await page.getByTestId('smtp-security-select').selectOption('NONE');
    await page.getByTestId('smtp-from-input').fill('AirManager Test <ops@example.com>');
    await page.getByTestId('smtp-user-input').fill('');
    await page.getByTestId('smtp-pass-input').fill('a-secret-password');
    await page.getByTestId('smtp-settings-save').click();
    await expect(page.getByTestId('smtp-settings-feedback')).toBeVisible();

    // AC 1: GET never carries the password back.
    const getResponse = await page.request.get('/api/v1/settings/smtp');
    const body = (await getResponse.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('pass');
    expect(body['hasPassword']).toBe(true);

    // AC 2: the test-send button hits the mailer for real — verify via Mailpit.
    await page.getByTestId('smtp-test-email-button').click();
    await expect(page.getByTestId('smtp-test-email-feedback')).toBeVisible();
    const testEmail = await waitForMailpitMessage(contactEmail, 'prova');
    expect(testEmail.Text.toLowerCase()).toContain('prova');
  });
});

/** Run-unique cash-category name (same pattern as `uniqueCategoryName` in `cash-register.spec.ts`) — NEVER a seeded name (`Ricariche`/`PPR`/`Carburante`/`Assicurazione`/`Manutenzione`/`Utenze`/`Altro`, shared with `billing.spec.ts`/`cash-register.spec.ts`). */
function uniqueCategoryName(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}`;
}

/**
 * "Categorie di cassa" card (story 12.13 review, F2 — PO decision
 * 2026-07-20): a minimal admin UI for the `cash-categories` API, which lost
 * its dedicated page (`dashboard/finance/categories`) in the same story's
 * AC1 without a replacement. Not a global-settings write (unlike the cards
 * above) — added to this file only because it lives on the same page, NOT
 * because it needs the serialized `settings` project chain.
 */
test.describe('Impostazioni — Categorie di cassa card (story 12.13 review, F2)', () => {
  test('admin creates, renames, deactivates, reactivates and deletes a cash category from the Impostazioni card', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    await gotoSettingsAndWaitForHydration(page);

    const card = page.getByTestId('cash-categories-settings-card');
    await expect(card).toBeVisible();

    const name = uniqueCategoryName('CategoriaE2E');
    await page.getByTestId('cash-category-add-button').click();
    await page.getByTestId('cash-category-name-input').fill(name);
    await page.getByTestId('cash-category-form-submit').click();
    await expect(page.getByTestId('cash-categories-feedback')).toBeVisible();

    const row = page.getByTestId('cash-category-row').filter({ hasText: name });
    await expect(row).toContainText('Attiva');

    // A second category with the SAME name -> 409 shown in the form, not created twice.
    await page.getByTestId('cash-category-add-button').click();
    await page.getByTestId('cash-category-name-input').fill(name);
    await page.getByTestId('cash-category-form-submit').click();
    await expect(page.getByTestId('cash-category-form-error')).toContainText('Esiste già una categoria con questo nome.');
    await page.getByTestId('cash-category-form').getByRole('button', { name: 'Annulla' }).click();

    // Rename.
    const renamedName = `${name}-rinominata`;
    await row.getByTestId('cash-category-rename-button').click();
    await page.getByTestId('cash-category-name-input').fill(renamedName);
    await page.getByTestId('cash-category-form-submit').click();
    await expect(page.getByTestId('cash-categories-feedback')).toBeVisible();
    const rowAfterRename = page.getByTestId('cash-category-row').filter({ hasText: renamedName });
    await expect(rowAfterRename).toBeVisible();

    // Deactivate — the status badge flips to "Disattivata".
    await rowAfterRename.getByRole('button', { name: 'Disattiva' }).click();
    await expect(rowAfterRename).toContainText('Disattivata');

    // Reactivate — back to "Attiva".
    await rowAfterRename.getByRole('button', { name: 'Riattiva' }).click();
    await expect(rowAfterRename).toContainText('Attiva');

    // Delete (never used) — the row disappears.
    await rowAfterRename.getByRole('button', { name: 'Elimina' }).click();
    await rowAfterRename.getByRole('button', { name: 'Conferma' }).click();
    await expect(page.getByTestId('cash-categories-feedback')).toBeVisible();
    await expect(page.getByTestId('cash-category-row').filter({ hasText: renamedName })).toHaveCount(0);
  });

  test('deleting a category with recorded movements surfaces the API\'s conflict message instead of crashing; the row stays', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const name = uniqueCategoryName('CategoriaInUso');
    const createResponse = await page.request.post('/api/v1/cash-categories', { data: { name } });
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()) as { id: string };
    const movementResponse = await page.request.post('/api/v1/cash-movements', {
      data: { categoryId: created.id, amountCents: 1000, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
    });
    expect(movementResponse.status()).toBe(201);

    await gotoSettingsAndWaitForHydration(page);
    const row = page.getByTestId('cash-category-row').filter({ hasText: name });
    await row.getByRole('button', { name: 'Elimina' }).click();
    await row.getByRole('button', { name: 'Conferma' }).click();

    await expect(page.getByTestId('cash-categories-feedback')).toContainText('La categoria ha movimenti registrati e non può essere eliminata: disattivala invece.');
    await expect(row).toBeVisible();
  });
});
