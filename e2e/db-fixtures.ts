import pg from 'pg';

/**
 * Test-only SQL fixtures (story 19.3, D-7). Since that story the rate API
 * accepts only a `validFrom` of today or later (Europe/Rome — R-19-f), so the
 * specs whose flights are dated in the PAST (precise dates: month edges,
 * time-zone edges, expiry windows) can no longer prepare the rate those
 * flights need through `POST .../rates`. They write it here instead, with
 * the SAME date they always used — exactly what `prisma/seed-demo.ts` does
 * for its demo history. The API path of the rates (decorrenza, rewrite,
 * 422) is proved only in `aircraft-rates.spec.ts` / `instructor-rates.spec.ts`,
 * with dates of today or later.
 *
 * Coupled to the schema ON PURPOSE: these inserts write exactly the columns
 * the two `upsert*RateCore` writers write, so a schema change breaks them
 * loudly instead of seeding something the app would never write. Same
 * `DATABASE_URL` the app uses (`.env` locally via `playwright.config.ts`,
 * the e2e job's env in CI). Not a spec: the default `testMatch` ignores it.
 */
const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('e2e/db-fixtures.ts requires DATABASE_URL (see .env.example).');
}

// One small pool per worker; `allowExitOnIdle` so an idle pool never keeps
// the worker process alive.
const pool = new pg.Pool({ connectionString, max: 2, allowExitOnIdle: true });

/** Who the fixture rows are recorded by — the seeded admin, the same actor the API calls of these specs use. */
const ADMIN_USER = `(SELECT "id" FROM "User" WHERE "email" = 'admin@airmanager.local')`;

/** An aircraft rate on any `validFrom` (past included), rewriting the row already on that date — the same upsert as `rates.service.ts#upsertAircraftRateCore`. */
export async function seedAircraftRate(
  aircraftId: string,
  rate: { studentPriceCents: number; pilotPriceCents: number; validFrom: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO "AircraftRate" ("id", "aircraftId", "studentPriceCents", "pilotPriceCents", "validFrom", "actorUserId")
     VALUES ('e2e_' || gen_random_uuid(), $1, $2, $3, $4::date, ${ADMIN_USER})
     ON CONFLICT ("aircraftId", "validFrom") DO UPDATE SET "studentPriceCents" = EXCLUDED."studentPriceCents", "pilotPriceCents" = EXCLUDED."pilotPriceCents"`,
    [aircraftId, rate.studentPriceCents, rate.pilotPriceCents, rate.validFrom],
  );
}

/** An instructor rate on any `validFrom`, keyed on the PERSON (like the API route) — `upsertInstructorRateCore`'s twin. Throws if the person has no instructor profile. */
export async function seedInstructorRate(personId: string, rate: { priceCentsPerHour: number; validFrom: string }): Promise<void> {
  const result = await pool.query(
    `INSERT INTO "InstructorRate" ("id", "instructorProfileId", "priceCentsPerHour", "validFrom", "actorUserId")
     SELECT 'e2e_' || gen_random_uuid(), ip."id", $2, $3::date, ${ADMIN_USER} FROM "InstructorProfile" ip WHERE ip."personId" = $1
     ON CONFLICT ("instructorProfileId", "validFrom") DO UPDATE SET "priceCentsPerHour" = EXCLUDED."priceCentsPerHour"`,
    [personId, rate.priceCentsPerHour, rate.validFrom],
  );
  if (result.rowCount !== 1) {
    throw new Error(`seedInstructorRate: person ${personId} has no instructor profile.`);
  }
}

/**
 * `ADJUSTMENT` movements on ANY value date, written straight into the
 * person's account (story 19.11): the API dates a rettifica today, and the
 * estratto conto specs need movements of either sign on chosen past dates —
 * up to the 2 001 of the PDF cap. The columns `accounts.service.ts#recordAdjustment`
 * writes (no cash twin, no link). `createdAt` advances 1 ms per row in ARRAY
 * order, so the insertion order — the statement's tie-break within a day — is
 * the array's. Returns the ids in array order; throws if the person has no account.
 */
export async function seedAccountAdjustments(personId: string, rows: Array<{ amountCents: number; effectiveDate: string; description?: string }>): Promise<string[]> {
  const result = await pool.query<{ id: string; createdAt: Date }>(
    `INSERT INTO "AccountMovement" ("id", "accountId", "type", "amountCents", "description", "effectiveDate", "actorUserId", "createdAt")
     SELECT 'e2e_' || gen_random_uuid(), a."id", 'ADJUSTMENT', r.amount, r.description, r.effective::date, ${ADMIN_USER},
            (clock_timestamp() AT TIME ZONE 'UTC') + r.ord * INTERVAL '1 millisecond'
     FROM "Account" a, unnest($2::int[], $3::text[], $4::text[]) WITH ORDINALITY AS r(amount, effective, description, ord)
     WHERE a."personId" = $1
     ORDER BY r.ord
     RETURNING "id", "createdAt"`,
    [personId, rows.map((row) => row.amountCents), rows.map((row) => row.effectiveDate), rows.map((row) => row.description ?? null)],
  );
  if (result.rowCount !== rows.length) {
    throw new Error(`seedAccountAdjustments: person ${personId} has no account.`);
  }
  // RETURNING carries no order guarantee: sort back on the insertion order the rows were given.
  return [...result.rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((row) => row.id);
}

/**
 * `count` instructor payouts on a chosen past period, straight into the
 * history (story 16.6a): the self-service «I miei compensi» list is capped at
 * 50, and 51 `POST /instructor-payouts` would each also write a cash twin
 * dated TODAY into the global cash book other specs aggregate. The columns
 * `instructor-compensation.service.ts#recordPayout` writes on
 * `InstructorPayout`, WITHOUT that twin — the page under test reads only this
 * table. Throws if the person has no instructor profile.
 */
export async function seedInstructorPayouts(personId: string, count: number, payout: { amountCents: number; period: string }): Promise<void> {
  const result = await pool.query(
    `INSERT INTO "InstructorPayout" ("id", "instructorProfileId", "amountCents", "periodStart", "periodEnd", "method", "actorUserId")
     SELECT 'e2e_' || gen_random_uuid(), ip."id", $2, $3::date, $3::date, 'CASH', ${ADMIN_USER}
     FROM "InstructorProfile" ip, generate_series(1, $4::int)
     WHERE ip."personId" = $1`,
    [personId, payout.amountCents, payout.period, count],
  );
  if (result.rowCount !== count) {
    throw new Error(`seedInstructorPayouts: person ${personId} has no instructor profile.`);
  }
}

/** Independent cross-check for the balances count, exposure and preview. */
export async function negativeBalanceControl(): Promise<{ count: number; exposureCents: number; top: Array<{ personId: string; balanceCents: number }> }> {
  const result = await pool.query<{ personId: string; balance: string }>(`
    SELECT a."personId", SUM(m."amountCents") AS balance
    FROM "Account" a JOIN "AccountMovement" m ON m."accountId" = a.id
    GROUP BY a."personId"
    HAVING SUM(m."amountCents") < 0
    ORDER BY balance, a."personId"
  `);
  return {
    count: result.rows.length,
    exposureCents: -result.rows.reduce((sum, row) => sum + Number(row.balance), 0),
    top: result.rows.slice(0, 20).map(({ personId, balance }) => ({ personId, balanceCents: Number(balance) })),
  };
}

/** A run-unique set of active students whose surname sorts before the booking-test targets. */
export async function seedPickerStudents(stamp: string): Promise<void> {
  await pool.query(
    `WITH people AS (
       INSERT INTO "Person" (id, "firstName", "lastName", "updatedAt")
       SELECT gen_random_uuid()::text, 'Buffer', 'N176-' || $1 || '-' || i, now()
       FROM generate_series(1, 101) i RETURNING id
     )
     INSERT INTO "StudentProfile" (id, "personId", "courseStartDate", "updatedAt")
     SELECT gen_random_uuid()::text, id, CURRENT_DATE, now() FROM people`,
    [stamp],
  );
}

export async function seedPickerAircraft(stamp: string): Promise<void> {
  await pool.query(
    `INSERT INTO "Aircraft" (id, registration, type, model, "updatedAt")
     SELECT gen_random_uuid()::text, 'I-' || $1 || '-' || i, 'Test', 'Typeahead', now()
     FROM generate_series(1, 51) i`,
    [stamp],
  );
}

/** Non-overlapping short slots on fixture-only rows exercise the calendar cap in one day. */
export async function seedBoundedCalendar(day: string): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `WITH ac AS (
       INSERT INTO "Aircraft" (id, registration, type, model, "updatedAt")
       VALUES (gen_random_uuid()::text, 'I-' || gen_random_uuid(), 'Test', 'Calendar', now()) RETURNING id
     ), p AS (
       INSERT INTO "Person" (id, "firstName", "lastName", "updatedAt")
       VALUES (gen_random_uuid()::text, 'Calendar', 'Test', now()) RETURNING id
     )
     INSERT INTO "Booking" (id, "aircraftId", "personId", "startsAt", "endsAt", status, "actorUserId", "updatedAt")
     SELECT gen_random_uuid()::text, ac.id, p.id, $1::date + time '10:00' + i * interval '1 second',
            $1::date + time '10:00' + i * interval '1 second' + interval '900 milliseconds',
            'APPROVED', ${ADMIN_USER}, now()
     FROM ac, p, generate_series(1, 1001) i RETURNING id`, [day],
  );
  return result.rows.map(({ id }) => id);
}

export async function removeCalendarFixtures(ids: string[]): Promise<void> {
  await pool.query('DELETE FROM "Booking" WHERE id = ANY($1::text[])', [ids]);
}

/** One full registry page. The unique filter avoids depending on the order of other tests' data. */
export async function seedDesktopRegistries(stamp: string): Promise<void> {
  await pool.query(
    `WITH people AS (
       INSERT INTO "Person" (id, "firstName", "lastName", "updatedAt")
       SELECT gen_random_uuid()::text, 'Pilota', $1 || '-' || i, now()
       FROM generate_series(1, 20) i RETURNING id
     ), aircraft AS (
       INSERT INTO "Aircraft" (id, registration, type, model, "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Test', 'Registro', now()) RETURNING id
     ), profiles AS (
       INSERT INTO "PilotProfile" (id, "personId", "licenseType", "licenseNumber", "updatedAt")
       SELECT gen_random_uuid()::text, id, 'PPL', id, now() FROM people
     ), users AS (
       INSERT INTO "User" (id, "personId", email, roles, "updatedAt")
       SELECT gen_random_uuid()::text, id, id || '@example.invalid', ARRAY['PILOT']::"Role"[], now() FROM people
     )
     INSERT INTO "Flight" (id, "aircraftId", "personId", "actorUserId", "flightDate", "flightType",
       minutes, "aircraftRateCentsPerHour", "aircraftPriceCategory", "aircraftAmountCents", "noCharge",
       "departureAirfield", "arrivalAirfield", "updatedAt")
     SELECT gen_random_uuid()::text, aircraft.id, people.id, ${ADMIN_USER}, DATE '2001-01-01', 'TOURISM',
       30, 10000, 'PILOT', 0, true, 'Aviosuperficie Campo di Addestramento Nord',
       'Aviosuperficie Campo di Addestramento Sud', now() FROM people, aircraft`, [stamp],
  );
}

export async function removeDesktopRegistries(stamp: string): Promise<void> {
  await pool.query(
    `WITH people AS (SELECT id FROM "Person" WHERE starts_with("lastName", $1 || '-')),
     flights AS (DELETE FROM "Flight" WHERE "personId" IN (SELECT id FROM people)),
     users AS (DELETE FROM "User" WHERE "personId" IN (SELECT id FROM people)),
     profiles AS (DELETE FROM "PilotProfile" WHERE "personId" IN (SELECT id FROM people)),
     aircraft AS (DELETE FROM "Aircraft" WHERE registration = $1)
     DELETE FROM "Person" WHERE id IN (SELECT id FROM people)`, [stamp],
  );
}

/** A private fleet for 18.7b: eleven booked aircraft, one flown only, two grounded,
 * one inactive, one with a pending slot and one with a flight on the previous date. */
export async function seedOverviewActivity(stamp: string): Promise<void> {
  await pool.query(
    `WITH people AS (
       INSERT INTO "Person" (id, "firstName", "lastName", "updatedAt")
       SELECT $1 || '-p' || i, 'Test', $1, now() FROM generate_series(1, 14) i RETURNING id
     ) INSERT INTO "PilotProfile" (id, "personId", "licenseType", "licenseNumber", "updatedAt")
       SELECT gen_random_uuid()::text, id, 'PPL', id, now() FROM people`, [stamp],
  );
  await pool.query(
    `INSERT INTO "Aircraft" (id, registration, type, model, status, "statusReason", "archivedAt", "updatedAt")
     SELECT $1 || i, (CASE WHEN i IN (13, 14, 17) THEN '0' ELSE 'Z' END) || $1 || lpad(i::text, 2, '0'), 'Test', $1,
       CASE WHEN i IN (15, 16, 17) THEN 'OUT_OF_SERVICE' ELSE 'OPERATIONAL' END::"AircraftStatus",
       CASE WHEN i IN (15, 16, 17) THEN 'Test' END, CASE WHEN i = 17 THEN now() END, now()
     FROM generate_series(1, 17) i`, [stamp],
  );
  await pool.query(
    `WITH wall AS (SELECT date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AS midnight),
       bounds AS (SELECT midnight AT TIME ZONE 'Europe/Rome' AS lo,
         (midnight + interval '1 day') AT TIME ZONE 'Europe/Rome' AS hi FROM wall),
       slots AS (
         SELECT i, CASE i WHEN 2 THEN lo - interval '10 minutes' WHEN 3 THEN hi - interval '10 minutes' ELSE now() - interval '10 minutes' END AS start,
           CASE i WHEN 2 THEN lo + interval '10 minutes' WHEN 3 THEN hi + interval '10 minutes' ELSE now() + interval '2 hours' END AS finish,
           CASE WHEN i = 13 THEN 'PENDING' ELSE 'APPROVED' END AS status
         FROM generate_series(2, 13) i, bounds
         UNION ALL SELECT 13, hi, hi + interval '10 minutes', 'APPROVED' FROM bounds
         UNION ALL SELECT 14, lo - interval '10 minutes', lo, 'APPROVED' FROM bounds
       )
     INSERT INTO "Booking" (id, "aircraftId", "personId", "startsAt", "endsAt", status, "actorUserId", "updatedAt")
     SELECT gen_random_uuid()::text, $1 || i, $1 || '-p' || i, start, finish, status::"BookingStatus",
       ${ADMIN_USER}, now() FROM slots`, [stamp],
  );
  await pool.query(
    `INSERT INTO "Flight" (id, "aircraftId", "personId", "actorUserId", "flightDate", "flightType", minutes,
       "aircraftRateCentsPerHour", "aircraftPriceCategory", "aircraftAmountCents", "noCharge", "updatedAt")
     SELECT gen_random_uuid()::text, $1 || i, $1 || '-p' || i, ${ADMIN_USER},
       (now() AT TIME ZONE 'Europe/Rome')::date - CASE WHEN i = 14 THEN 1 ELSE 0 END,
       'TOURISM', 30, 10000, 'PILOT', 0, true, now() FROM unnest(ARRAY[1, 2, 14]) i`, [stamp],
  );
}

export async function addOverviewFreeAircraft(stamp: string): Promise<void> {
  await pool.query(
    `INSERT INTO "Aircraft" (id, registration, type, model, "updatedAt")
     SELECT gen_random_uuid()::text, 'A' || $1 || i, 'Test', $1, now()
     FROM generate_series(1, 110) i`, [stamp],
  );
}

export async function removeOverviewFixtures(stamp: string): Promise<void> {
  const owned = 'SELECT id FROM "Aircraft" WHERE model = $1';
  await pool.query(`DELETE FROM "Flight" WHERE "aircraftId" IN (${owned})`, [stamp]);
  await pool.query(`DELETE FROM "Booking" WHERE "aircraftId" IN (${owned})`, [stamp]);
  await pool.query('DELETE FROM "Aircraft" WHERE model = $1', [stamp]);
  await pool.query('DELETE FROM "PilotProfile" WHERE "personId" IN (SELECT id FROM "Person" WHERE "lastName" = $1)', [stamp]);
  await pool.query('DELETE FROM "Person" WHERE "lastName" = $1', [stamp]);
}

/** Independent oracle: read the ordered registry, logbook and approved slots separately.
 * Use Rome's day boundaries in SQL; production derives its boundaries in TypeScript. */
export async function expectedOverviewFleet() {
  const registry = await pool.query<{ id: string; status: string }>(
    'SELECT id, status FROM "Aircraft" WHERE "archivedAt" IS NULL ORDER BY registration, id',
  );
  const flights = await pool.query<{ id: string }>(
    `SELECT "aircraftId" AS id FROM "Flight" WHERE "flightDate" = (now() AT TIME ZONE 'Europe/Rome')::date`,
  );
  const bookings = await pool.query<{ id: string; reserved: boolean }>(
    `SELECT "aircraftId" AS id, "startsAt" <= now() AND "endsAt" > now() AS reserved FROM "Booking"
     WHERE status = 'APPROVED'
       AND ("startsAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome')::date <= (now() AT TIME ZONE 'Europe/Rome')::date
       AND (("endsAt" - interval '1 millisecond') AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome')::date >= (now() AT TIME ZONE 'Europe/Rome')::date`,
  );
  const active = new Set([...flights.rows, ...bookings.rows].map(({ id }) => id));
  const reserved = new Set(bookings.rows.filter((b) => b.reserved).map((b) => b.id));
  const grounded = registry.rows.filter((a) => a.status === 'OUT_OF_SERVICE');
  const operational = registry.rows.filter((a) => a.status === 'OPERATIONAL');
  const ordered = [...grounded, ...operational.filter((a) => active.has(a.id)), ...operational.filter((a) => !active.has(a.id))];
  return {
    ids: ordered.slice(0, 8).map((a) => a.id),
    total: registry.rows.length, operational: operational.length,
    availableNow: operational.filter((a) => !reserved.has(a.id)).length,
  };
}
