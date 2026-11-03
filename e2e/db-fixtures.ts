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
