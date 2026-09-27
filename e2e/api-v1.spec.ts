import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';
const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];

if (!SEED_PASSWORD) {
  throw new Error('e2e/api-v1.spec.ts requires SEED_ADMIN_PASSWORD (see .env.example) — migrate + seed the DB first.');
}

async function loginExpectingDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

test.describe('Shared API infrastructure (Story 1.5)', () => {
  test('GET /api/v1/openapi.json is public and returns a valid OpenAPI 3.x document (AC 1)', async ({ request }) => {
    // No login: the spec exposes only contracts, never data (Dev Notes).
    const response = await request.get('/api/v1/openapi.json');
    expect(response.status()).toBe(200);

    const spec = await response.json();
    expect(typeof spec.openapi).toBe('string');
    expect(spec.openapi.startsWith('3.')).toBe(true);

    const paths = Object.keys(spec.paths ?? {});
    for (const expectedPath of [
      '/api/v1/health',
      '/api/v1/me',
      '/api/v1/users',
      '/api/v1/users/{id}',
      '/api/v1/users/{id}/resend-invite',
      '/api/v1/auth/set-password',
      '/api/v1/auth/forgot-password',
    ]) {
      expect(paths).toContain(expectedPath);
    }

    // Security scheme for the session cookie is documented (Task 2).
    expect(spec.components?.securitySchemes?.cookieAuth).toBeDefined();
  });

  test('POST /api/v1/users with an invalid body answers the AD-8 422 envelope (AC 2)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const response = await page.request.post('/api/v1/users', {
      data: { email: 'not-an-email', roles: [] },
    });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeDefined();
  });

  test('an unauthenticated /api/v1/* request still gets the AD-8 401 envelope through the shared wrapper', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/users');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  // Story 12.13: `GET /api/v1/users` (list) was removed — no consumer left
  // (the Piloti page reads its roster from `people.service.ts` directly).
  // `POST /api/v1/users`'s own dates-as-ISO-8601-UTC behavior is still
  // exercised indirectly wherever its response is asserted elsewhere
  // (e.g. `user-management.spec.ts`); nothing left here to list-and-check.
});

// --- Booking approval workflow (epic 12, story 12.2) ------------------------
// API-level only (the UI arrives in story 12.3) — the legacy bookings page's
// own flow (staff create -> ACTIVE/APPROVED) is exercised by
// `e2e/bookings.spec.ts`, unchanged by this story.

const MAILPIT_API = 'http://localhost:8025/api/v1';

/** Run-unique registration (same convention as `bookings.spec.ts`'s `createAircraft`). */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Creates a run-unique aircraft via the admin API (caller must already be authenticated as admin/staff). */
async function createAircraft(page: Page): Promise<{ id: string; registration: string }> {
  const suffix = uniqueSuffix();
  const registration = `I-WF${suffix}`.toUpperCase().slice(0, 20);

  const response = await page.request.post('/api/v1/aircraft', {
    data: { registration, type: 'Ultraleggero 3 assi', model: 'Test Model', hourMeterMinutes: 50 },
  });
  expect(response.status()).toBe(201);
  const aircraft = (await response.json()) as { id: string };

  return { id: aircraft.id, registration };
}

type MailpitMessageSummary = { ID: string; Subject: string };
type MailpitFullMessage = { Text: string; Subject: string };

/** Same Mailpit-polling helper as `e2e/bookings.spec.ts`'s `waitForMailpitMessage`. */
async function waitForMailpitMessage(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<MailpitFullMessage> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const searchResponse = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
    const searchBody = (await searchResponse.json()) as { messages: MailpitMessageSummary[] };
    const found = searchBody.messages.find((message) => message.Subject.includes(subjectIncludes));

    if (found) {
      const messageResponse = await fetch(`${MAILPIT_API}/message/${found.ID}`);
      return (await messageResponse.json()) as MailpitFullMessage;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No Mailpit message to "${to}" with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

/** A run-unique future interval, far enough out to never collide across parallel runs of this suite — each test books its OWN freshly-created aircraft, so no cross-test overlap is possible either way. */
function futureInterval(): { startsAt: string; endsAt: string } {
  const start = new Date(Date.UTC(2099, 4, 1 + (Date.now() % 20), 10, 0, 0));
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

/**
 * Three days ago, 07:30Z-08:30Z (story 16.3, ops F9): a booking is closed as
 * FLOWN only once its slot has STARTED, and nobody can CREATE one in the past —
 * so the fixture is created in the future and moved here by staff (exempt from
 * `BOOKING_IN_PAST` on a move). Deliberately OUTSIDE the 48 h window every
 * list and the Overview card read (`listFrom = now - 48h`): the closed booking
 * stays behind, and inside that window it would crowd the soonest-first cards
 * other specs assert on (`home-dashboard.spec.ts`). Inside every opening window
 * the suite sets (07:00-21:00 Europe/Rome, both DST offsets).
 */
function longPastInterval(): { startsAt: string; endsAt: string } {
  const day = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  return { startsAt: `${day}T07:30:00.000Z`, endsAt: `${day}T08:30:00.000Z` };
}

test.describe('Booking approval workflow — API (Story 12.2)', () => {
  test('pilot creates a self-booking (PENDING); staff moves it into the past, approves it (re-checking create-time rules, R-16-b: a past booking stays approvable) then marks it FLOWN', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    // The seeded demo pilot (`prisma/seed.ts`) already has an active
    // PilotProfile and a login — no signup flow needed for this actor.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const meResponse = await page.request.get('/api/v1/me');
    expect(meResponse.status()).toBe(200);
    const me = (await meResponse.json()) as { person: { id: string } | null };
    const pilotPersonId = me.person!.id;

    const { startsAt, endsAt } = futureInterval();
    const createResponse = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilotPersonId, startsAt, endsAt },
    });
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()) as { booking: { id: string; status: string } };
    // AC 2: a `bookings.manage.own` actor's own booking starts PENDING.
    expect(created.booking.status).toBe('PENDING');
    const bookingId = created.booking.id;

    // Staff approves (AC 3): re-runs the create-time checks and stamps decidedAt/decidedByUserId.
    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // Story 16.3 (ops F9): FLOWN needs a slot that has STARTED — staff moves
    // the booking into the past first, so the approval below also proves,
    // end to end, that a past booking stays approvable (ratifica R-16-b).
    const moveResponse = await page.request.patch(`/api/v1/bookings/${bookingId}`, { data: longPastInterval() });
    expect(moveResponse.status(), await moveResponse.text()).toBe(200);

    const approveResponse = await page.request.post(`/api/v1/bookings/${bookingId}/transition`, { data: { to: 'APPROVED' } });
    expect(approveResponse.status()).toBe(200);
    const approved = (await approveResponse.json()) as { status: string; decidedAt: string | null };
    expect(approved.status).toBe('APPROVED');
    expect(approved.decidedAt).not.toBeNull();

    const flownResponse = await page.request.post(`/api/v1/bookings/${bookingId}/transition`, { data: { to: 'FLOWN' } });
    expect(flownResponse.status()).toBe(200);
    const flown = (await flownResponse.json()) as { status: string };
    expect(flown.status).toBe('FLOWN');
  });

  test('staff denies a PENDING booking with a reason — the pilot receives the denial email (AC 5)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);
    const aircraft = await createAircraft(page);

    await page.context().clearCookies();
    await loginExpectingDashboard(page, PILOT_EMAIL);
    const meResponse = await page.request.get('/api/v1/me');
    const me = (await meResponse.json()) as { person: { id: string } | null };
    const pilotPersonId = me.person!.id;

    const { startsAt, endsAt } = futureInterval();
    const createResponse = await page.request.post('/api/v1/bookings', {
      data: { aircraftId: aircraft.id, personId: pilotPersonId, startsAt, endsAt },
    });
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()) as { booking: { id: string; status: string } };
    expect(created.booking.status).toBe('PENDING');
    const bookingId = created.booking.id;

    // DENIED without a reason answers 422 (AC 3).
    await page.context().clearCookies();
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const missingReasonResponse = await page.request.post(`/api/v1/bookings/${bookingId}/transition`, { data: { to: 'DENIED' } });
    expect(missingReasonResponse.status()).toBe(422);
    const missingReasonBody = await missingReasonResponse.json();
    expect(missingReasonBody.error.code).toBe('BOOKING_DENY_REASON_REQUIRED');

    const denyReason = 'Aeromobile in manutenzione straordinaria';
    const denyResponse = await page.request.post(`/api/v1/bookings/${bookingId}/transition`, {
      data: { to: 'DENIED', reason: denyReason },
    });
    expect(denyResponse.status()).toBe(200);
    const denied = (await denyResponse.json()) as { status: string; denyReason: string | null };
    expect(denied.status).toBe('DENIED');
    expect(denied.denyReason).toBe(denyReason);

    // AC 5: best-effort email to the booking-holder, visible in Mailpit —
    // the seeded pilot's `User.locale` default is `it` (messages/it.json's
    // `Emails.bookingDenied.subject`: "Prenotazione rifiutata: ...").
    const email = await waitForMailpitMessage(PILOT_EMAIL, 'rifiutata');
    expect(email.Text).toContain(denyReason);
  });
});

// --- One-step person create (story 13.1, AC 5) ------------------------------

function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@airmanager.local`;
}

test.describe('POST /api/v1/people — one-step composite create (story 13.1, AC 5)', () => {
  test('creates a person with a pilot profile, a registered expiry and a linked user in ONE call — invite visible in Mailpit', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    // A RATING type scoped to pilots, straight from the seeded catalogue (AC 2's `kind` filter).
    const typesResponse = await page.request.get('/api/v1/expiry-types?kind=RATING');
    expect(typesResponse.status()).toBe(200);
    const ratingTypes = (await typesResponse.json()) as Array<{ id: string; name: string; scope: string }>;
    const pilotRatingType = ratingTypes.find((type) => type.scope === 'PILOTS');
    expect(pilotRatingType).toBeDefined();

    const email = uniqueEmail('one-step');
    const suffix = uniqueSuffix();

    const createResponse = await page.request.post('/api/v1/people', {
      data: {
        firstName: 'OneStep',
        lastName: `Composite-${suffix}`,
        profiles: { pilot: { licenseNumber: `IT-PPL-${suffix}`, licenseType: 'PPL(A)' } },
        expiries: [{ expiryTypeId: pilotRatingType!.id, expiresAt: '2099-01-01' }],
        access: { email, roles: ['PILOT'] },
      },
    });
    expect(createResponse.status()).toBe(201);
    const person = (await createResponse.json()) as { id: string; profiles: { pilot: boolean; student: boolean; instructor: boolean } };
    expect(person.profiles).toEqual({ pilot: true, student: false, instructor: false });

    // The pilot profile really landed (AC 5's `profiles` block).
    const detailResponse = await page.request.get(`/api/v1/people/${person.id}`);
    expect(detailResponse.status()).toBe(200);
    const detail = (await detailResponse.json()) as { pilotProfile: { licenseNumber: string; deactivatedAt: string | null } | null };
    expect(detail.pilotProfile?.licenseNumber).toBe(`IT-PPL-${suffix}`);
    expect(detail.pilotProfile?.deactivatedAt).toBeNull();

    // The expiry really landed (AC 5's `expiries` block).
    const expiriesResponse = await page.request.get(`/api/v1/people/${person.id}/expiries`);
    expect(expiriesResponse.status()).toBe(200);
    const expiries = (await expiriesResponse.json()) as Array<{ typeName: string; expiresAt: string }>;
    expect(expiries.some((item) => item.typeName === pilotRatingType!.name && item.expiresAt === '2099-01-01')).toBe(true);

    // The invite really went out post-commit (AC 5's `access` block, fire-and-forget).
    const inviteEmail = await waitForMailpitMessage(email, 'invitato');
    expect(inviteEmail.Text).toContain('set-password');
  });

  test('an expiries entry missing expiresAt answers the AD-8 422 envelope (R-13.1-c)', async ({ page }) => {
    await loginExpectingDashboard(page, ADMIN_EMAIL);

    const typesResponse = await page.request.get('/api/v1/expiry-types?kind=RATING');
    const ratingTypes = (await typesResponse.json()) as Array<{ id: string; scope: string }>;
    const anyType = ratingTypes.find((type) => type.scope === 'ALL') ?? ratingTypes[0];

    const response = await page.request.post('/api/v1/people', {
      data: {
        firstName: 'Missing',
        lastName: `ExpiresAt-${uniqueSuffix()}`,
        // No `profiles` block needed for a 422 that never reaches the service.
        expiries: [{ expiryTypeId: anyType!.id }],
      },
    });
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
