import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Review 15.3 F3 — the "Prenotazioni in attesa" card is CAPPED at
 * `MOBILE_PENDING_BOOKINGS_PAGE_SIZE` (8) rows while its head counts the whole
 * window, so above the cap the two numbers disagreed and nothing on the page
 * said the missing rows existed. On a decision queue that is a real loss: the
 * reader has no way to learn that two more bookings are waiting.
 *
 * Why this spec lives in the SERIALIZED chain (`playwright.config.ts`, the rule
 * of CLAUDE.md): overflowing the card means holding NINE pending bookings in
 * the 48h window at once, and the window is global. Under `fullyParallel` that
 * would shift every other spec's view of the same card — `home-dashboard.spec`
 * already reads the 8-row window and the reviewer flagged it as fragile. Last
 * in the chain, and it cancels its own fixtures in `afterAll`, so nothing
 * downstream inherits them.
 *
 * Discriminance: the pre-fix card rendered NO footer at all, at any count, so
 * `toBeVisible()` on the footer fails against it. The count assertion is
 * relational (head - rows), not a photograph of a number.
 */

const ADMIN_EMAIL = 'admin@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];
const PHONE = { width: 375, height: 812 } as const;

/** One more than the card's cap of 8: the smallest fixture that proves truncation. */
const PENDING_TO_CREATE = 9;

const createdBookingIds: string[] = [];

async function loginExpectingDashboard(page: Page): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await page.waitForURL(/\/it\/dashboard/);
}

test.describe('story 15.3 — the pending card declares its own truncation (review F3)', () => {
  test.afterAll(async ({ browser }) => {
    if (createdBookingIds.length === 0) return;
    const page = await browser.newPage();
    await loginExpectingDashboard(page);
    for (const id of createdBookingIds) {
      await page.request.post(`/api/v1/bookings/${id}/cancel`);
    }
    await page.close();
  });

  test('with more pending bookings than the card lists, a "+N · Vedi tutte" footer appears and deep-links to the pending filter', async ({
    page,
  }) => {
    test.slow();
    await loginExpectingDashboard(page);

    // One run-unique aircraft and person, then nine non-overlapping slots on it.
    // Payload shapes copied VERBATIM from `mobile-overview.spec.ts`'s helpers:
    // `POST /aircraft` needs `type` and `hourMeterMinutes` (the composite create
    // of story 14.8) and answers `{ id }` at the top level, and a booking's
    // person needs an ACTIVE pilot profile.
    const tag = `OF${Date.now().toString().slice(-6)}`;
    const aircraftResponse = await page.request.post('/api/v1/aircraft', {
      data: { registration: `I-M${tag}`.slice(0, 20), type: 'Ultraleggero 3 assi', model: 'Overflow 15.3', hourMeterMinutes: 60 },
    });
    expect(aircraftResponse.status(), await aircraftResponse.text()).toBe(201);
    const aircraftId = ((await aircraftResponse.json()) as { id: string }).id;

    const personResponse = await page.request.post('/api/v1/people', {
      data: { firstName: 'Overflow', lastName: `Test${tag}` },
    });
    expect(personResponse.status(), await personResponse.text()).toBe(201);
    const personId = ((await personResponse.json()) as { id: string }).id;
    const profile = await page.request.put(`/api/v1/people/${personId}/profiles/pilot`, {
      data: { licenseNumber: `IT-PPL-${tag}`, licenseType: 'PPL(A)' },
    });
    expect(profile.status(), await profile.text()).toBe(200);

    // Same anchor as `safeSlotTomorrow`: the airfield's open/close window is a
    // global setting the serialized chain ahead of this project may have
    // touched, so the fixtures sit in the middle of the day rather than on the
    // wall clock. Nine 25-minute slots, 30 minutes apart: 07:30Z -> 11:30Z.
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    for (let index = 0; index < PENDING_TO_CREATE; index += 1) {
      const startsAt = new Date(`${tomorrow}T07:30:00.000Z`).getTime() + index * 30 * 60_000;
      const created = await page.request.post('/api/v1/bookings', {
        data: {
          aircraftId,
          personId,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(startsAt + 25 * 60_000).toISOString(),
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      const id = ((await created.json()) as { booking: { id: string } }).booking.id;
      createdBookingIds.push(id);
      // An admin-created booking is born APPROVED; these two legal hops reach
      // PENDING with public API calls only (same route `mobile-overview.spec`
      // documents).
      for (const to of ['NO_SHOW', 'PENDING'] as const) {
        const transition = await page.request.post(`/api/v1/bookings/${id}/transition`, { data: { to } });
        expect(transition.status(), `${to}: ${await transition.text()}`).toBe(200);
      }
    }

    await page.setViewportSize(PHONE);
    await page.goto('/it/dashboard');

    const rows = page.getByTestId('mobile-overview-pending-row');
    await expect(rows).toHaveCount(8);

    const footer = page.getByTestId('mobile-overview-pending-see-all');
    await expect(footer).toBeVisible();

    // The number is what the head counts minus what the card lists — read both
    // from the page, so the assertion holds whatever else the DB contains.
    const headCount = await page
      .getByTestId('mobile-overview-pending-bookings')
      .locator('.mobile-card-count')
      .innerText();
    const headTotal = Number(/\d+/.exec(headCount)?.[0] ?? '0');
    expect(headTotal).toBeGreaterThanOrEqual(PENDING_TO_CREATE);
    await expect(footer).toContainText(String(headTotal - 8));

    await footer.click();
    await page.waitForURL(/\/dashboard\/bookings\?status=PENDING/);

    // Story 15.4 (ratifica R-15.4-e): asserting the URL alone was blind by
    // construction — the page did not read `?status` at all, so this deep link
    // (added by the 15.3 F3 fix) landed on the UNFILTERED list and the suite
    // could not tell. The assertion now lives on the ROWS: every card the
    // filtered list shows must be a pending one, and the "In attesa" chip must
    // be the selected one.
    const listRows = page.getByTestId('booking-row-mobile');
    await expect(listRows.first()).toBeVisible();
    const statuses = await listRows.evaluateAll((nodes) => nodes.map((node) => node.querySelector('.badge')?.textContent?.trim() ?? ''));
    expect(statuses.length).toBeGreaterThan(0);
    expect([...new Set(statuses)]).toEqual(['In attesa']);
    await expect(page.getByTestId('mobile-status-chip-PENDING')).toHaveClass(/primary/);
  });
});
