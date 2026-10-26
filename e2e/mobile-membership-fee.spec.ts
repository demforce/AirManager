import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Story 15.7, ratifica R-15.7-g — "Quota associativa" as a full-screen panel
 * on a phone (AC 8): the SAME `MembershipFeeModal` node, in a CSS mode, with
 * the typeahead over 338 people finally given room, a 44px submit (35 before)
 * and a 44px override ROW (a 13x13 checkbox in a 15px row before).
 *
 * **Why this lives in its own SERIALIZED project** (`playwright.config.ts`,
 * after `mobile-overview-overflow`): the quota button is `disabled` while
 * `membership.annualFeeCents` is 0, so exercising the panel at all requires
 * WRITING that global `AppSetting` — and `membership-fee.spec.ts` (main
 * `chromium` project) writes the same key five times, ending on 0 for its own
 * "the button is disabled" assertion. Two parallel writers on one global key
 * is the exact class `playwright.config.ts` quarantines (lesson 12.11 F1).
 * The story's own §b assumed this story wrote no `AppSetting`; AC 8 requires
 * the quota path, so the spec joins the chain instead of racing.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/mobile-membership-fee.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example).');
}

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 720 };

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createPilotPerson(page: Page): Promise<{ personId: string; firstName: string; lastName: string }> {
  const firstName = 'Quota';
  const lastName = `Mobile-${uniqueSuffix()}`;
  const response = await page.request.post('/api/v1/people', { data: { firstName, lastName } });
  expect(response.status()).toBe(201);
  const person = (await response.json()) as { id: string };
  const profile = await page.request.put(`/api/v1/people/${person.id}/profiles/pilot`, {
    data: { licenseNumber: `LIC-${uniqueSuffix()}`, licenseType: 'PPL(A)' },
  });
  expect(profile.status()).toBe(200);
  return { personId: person.id, firstName, lastName };
}

/** Same endpoint and body as `membership-fee.spec.ts#topUpAccount`. */
async function topUp(page: Page, personId: string, amountCents: number): Promise<void> {
  const response = await page.request.post(`/api/v1/people/${personId}/account/top-ups`, {
    data: { amountCents, paymentMethod: 'CASH', effectiveDate: '2026-07-01' },
  });
  expect(response.status()).toBe(200);
}

test.describe.configure({ mode: 'serial' });

test.describe('Story 15.7 — Quota associativa a tutto schermo (ratifica R-15.7-g)', () => {
  test.afterAll(async ({ browser }) => {
    // Restore the value `membership-fee.spec.ts` leaves behind, so this
    // project stays a no-op for anything that might follow it in the chain.
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, ADMIN_EMAIL);
    await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents: 0 } });
    await context.close();
  });

  test('il pannello e` a tutto schermo, i suoi target sono >=44px, e l\'addebito riuscito resta quello di oggi (Idempotency-Key, saldo e scadenza nel messaggio)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents: 5000 } });
    const pilot = await createPilotPerson(page);
    await topUp(page, pilot.personId, 100_000);

    await page.goto('/it/dashboard/expiries');
    await page.getByTestId('scadenze-membership-fee-button').click();
    const panel = page.getByTestId('membership-fee-panel');
    await expect(panel).toHaveCount(1);
    await expect(panel).toBeVisible();

    // Full-screen: the panel IS the viewport (pre-fix, measured: 335x385 at
    // (20,213), a 131x35 submit and a 13x13 checkbox).
    const geometry = await panel.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
    });
    expect(geometry).toEqual({ x: 0, y: 0, w: 375, h: 812 });

    // Every control of this panel against the EPIC's floor — the same 43.5
    // threshold `mobile-expiries-movements.spec.ts` sweeps with (sub-pixel
    // layout), never one calibrated on the value obtained. Where a control is
    // WRAPPED by its label ("Forza addebito"), the tap target is the label
    // ROW, not the box: measured pre-fix 343x20 around a 20x20 checkbox, which
    // is exactly what this sweep exists to catch (review 15.7 MINOR-1).
    const small = await page.evaluate(() => {
      const out: { testid: string | null; target: string; h: number }[] = [];
      for (const el of Array.from(document.querySelectorAll('.mini-modal button, .mini-modal input, .mini-modal select'))) {
        if (el.getClientRects().length === 0) continue;
        const target = el.closest('label') ?? el;
        const rect = target.getBoundingClientRect();
        if (rect.height < 43.5) out.push({ testid: el.getAttribute('data-testid'), target: target.tagName, h: Math.round(rect.height * 10) / 10 });
      }
      return out;
    });
    expect(small).toEqual([]);
    expect(await panel.getByTestId('membership-fee-submit').evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);
    // The override's own target, said out loud: the row that wraps the box —
    // the control that decides whether a 422 from the server gets overridden.
    const overrideTarget = await panel.getByTestId('membership-fee-override-checkbox').evaluate((el) => {
      const row = el.closest('label');
      const rect = (row ?? el).getBoundingClientRect();
      return { wrapped: row !== null, h: Math.round(rect.height * 10) / 10 };
    });
    expect(overrideTarget.wrapped).toBe(true);
    expect(overrideTarget.h).toBeGreaterThanOrEqual(44);

    // AC 10 for the quota's own names: they exist only while this panel is
    // open with a non-zero fee, i.e. only inside this serialized project, so
    // `mobile-expiries-movements.spec.ts`'s enumeration cannot reach them
    // (review 15.7 LOW-6). The panel is ONE node in a CSS mode, never a second
    // tree (deviation D2) — which is exactly what this asserts, at both
    // widths, without navigating away (the modal keeps its state on resize).
    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      for (const testid of ['scadenze-membership-fee-button', 'membership-fee-panel', 'membership-fee-amount', 'membership-fee-submit', 'membership-fee-override-checkbox']) {
        await expect(page.getByTestId(testid), `${testid} @${viewport.width}`).toHaveCount(1);
      }
    }
    await page.setViewportSize(PHONE);

    const combobox = panel.getByRole('combobox', { name: 'Pilota' });
    await combobox.click();
    await combobox.fill(pilot.lastName);
    await page.getByRole('option', { name: `${pilot.lastName} ${pilot.firstName}`, exact: true }).click();

    await expect(panel.getByTestId('membership-fee-amount')).toHaveValue('50.00');
    await expect(panel.getByTestId('membership-fee-override-checkbox')).not.toBeChecked();
    await panel.getByTestId('membership-fee-submit').click();
    await expect(panel.getByTestId('membership-fee-success')).toBeVisible();

    const movements = (await (await page.request.get(`/api/v1/people/${pilot.personId}/account/movements`)).json()) as {
      items: { type: string; amountCents: number; description: string | null }[];
    };
    const adjustment = movements.items.find((item) => item.type === 'ADJUSTMENT' && item.description?.startsWith('Quota associativa'));
    expect(adjustment?.amountCents).toBe(-5000);
  });

  test('saldo insufficiente: 422 col messaggio che porta saldo e importo, nessun addebito; con "Forza addebito" passa', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, ADMIN_EMAIL);
    await page.request.put('/api/v1/settings/membership-fee', { data: { annualFeeCents: 5000 } });
    const pilot = await createPilotPerson(page); // no top-up: balance 0

    await page.goto('/it/dashboard/expiries');
    await page.getByTestId('scadenze-membership-fee-button').click();
    const panel = page.getByTestId('membership-fee-panel');
    const combobox = panel.getByRole('combobox', { name: 'Pilota' });
    await combobox.click();
    await combobox.fill(pilot.lastName);
    await page.getByRole('option', { name: `${pilot.lastName} ${pilot.firstName}`, exact: true }).click();

    await panel.getByTestId('membership-fee-submit').click();
    await expect(panel.getByTestId('membership-fee-error')).toBeVisible();
    await expect(panel.getByTestId('membership-fee-error')).toContainText('Saldo insufficiente');
    await expect(panel.getByTestId('membership-fee-success')).toHaveCount(0);

    // The override is a deliberate act, never the default path.
    await panel.getByTestId('membership-fee-override-checkbox').check();
    await panel.getByTestId('membership-fee-submit').click();
    await expect(panel.getByTestId('membership-fee-success')).toBeVisible();

    const movements = (await (await page.request.get(`/api/v1/people/${pilot.personId}/account/movements`)).json()) as {
      items: { type: string; amountCents: number; description: string | null }[];
    };
    const adjustment = movements.items.find((item) => item.type === 'ADJUSTMENT' && item.description?.startsWith('Quota associativa'));
    expect(adjustment?.amountCents).toBe(-5000);
  });
});
