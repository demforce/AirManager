// Load-test seed — fills a database with THOUSANDS of plausible rows so the
// app can be stress-tested (product-owner ask: "a plausible db seed with
// thousands users and planes and flights and transactions").
//
// ADDITIVE on top of the base seed (`prisma db seed`, `prisma/seed.ts`): that
// script must have already run — it provides the demo ADMIN user (this
// script looks it up by its known email, `admin@airmanager.local`) and the
// standard cash-category/expiry-type catalogues this script reads by name.
//
// Unlike `prisma/seed-demo.ts`, this script does NOT go through the real
// services (`registerFlight`, `createBooking`, ...) — at tens of thousands of
// rows that would take far too long (each one opens its own transaction and
// does several round trips). Instead it reproduces the invariants those
// services enforce with direct, batched `createMany` inserts: aircraft/
// instructor hourly-rate snapshots on every flight, hour-meter advances,
// FLIGHT_CHARGE amounts (`round(rate * minutes / 60)`), booking non-overlap
// for APPROVED bookings only, PPR per-year sequential numbering, etc. — see
// the per-phase comments below for exactly which invariant each phase
// reproduces and where it deliberately simplifies (always flagged).
//
// Run:
//   set -a && . ./.env && set +a
//   LOAD_SEED_TARGET_DB=<db-name-in-DATABASE_URL> npx tsx prisma/seed-load.ts
//
// Safety guard: refuses to run unless `LOAD_SEED_TARGET_DB` names the exact
// same database as `DATABASE_URL` — this is destined for a disposable
// load-test database, never the shared e2e/dev database (`airmanager`).
//
// Scale: `LOAD_SCALE` (default `1`) multiplies every base volume below.
// At scale 1, expect ~5-8 minutes and roughly (actual counts are printed at
// the end, and vary slightly run-to-run only through the organic/derived
// phases — the fixed-target phases are exactly reproducible):
//   ~5000 persons, ~2503 users, ~1500 aircraft (+ 1-3 rates each),
//   ~60000-60600 flights (~2% cancelled, ~1% of those corrected),
//   ~40000 bookings, ~90000-140000 account movements (see the Phase 5
//   comment for why this lands below the ~150000 originally suggested),
//   ~28000-32000 cash movements, ~5000 PPR requests, ~13000-16000 expiries,
//   a few thousand SentAlert rows, ~2000-3000 instructor payouts.
//
// Idempotency: every login this script creates uses the `load.` email
// prefix — if any such `User` already exists, the script exits immediately
// without writing anything (rerun against a freshly recreated database
// instead of trying to top up an existing one).
//
// Reproducibility: all randomness comes from one seeded PRNG (`mulberry32`),
// so two runs at the SAME `LOAD_SCALE` against a freshly reset database
// produce byte-identical data. Different scales are NOT expected to nest —
// changing `LOAD_SCALE` reseeds every random draw from scratch.

import { randomUUID } from 'node:crypto';
import { addMonthsClampUtc, toDateOnlyString } from '../src/lib/date-only';
import { hashPassword } from '../src/server/auth/password';
import { prisma } from '../src/server/db/prisma';
import type {
  AccountMovementType,
  AircraftStatus,
  BookingStatus,
  FlightStatus,
  FlightType,
  PaymentMethod,
  PprStatus,
  Role,
} from '../src/generated/prisma/client';

// -----------------------------------------------------------------------
// 0. Safety guard, scale, PRNG, generic helpers
// -----------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`seed-load: ${name} must be set.`);
  return value;
}

function targetDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return url.pathname.replace(/^\//, '');
}

const DATABASE_URL = requireEnv('DATABASE_URL');
const ACTUAL_DB_NAME = targetDatabaseName(DATABASE_URL);
const DECLARED_TARGET_DB = requireEnv('LOAD_SEED_TARGET_DB');
if (DECLARED_TARGET_DB !== ACTUAL_DB_NAME) {
  throw new Error(
    `seed-load: refusing to run — LOAD_SEED_TARGET_DB ("${DECLARED_TARGET_DB}") does not match the database in DATABASE_URL ("${ACTUAL_DB_NAME}"). ` +
      'This script is destructive-by-volume and must only ever target a disposable load-test database.',
  );
}

const LOAD_SCALE = Number(process.env['LOAD_SCALE'] ?? '1');
if (!Number.isFinite(LOAD_SCALE) || LOAD_SCALE <= 0) {
  throw new Error('seed-load: LOAD_SCALE must be a positive number.');
}
function scaled(base: number): number {
  return Math.max(1, Math.round(base * LOAD_SCALE));
}

/** Deterministic PRNG (mulberry32) — same seed + same LOAD_SCALE = same data on every rerun. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xc0ffee ^ Math.round(LOAD_SCALE * 1000));

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number): number {
  return rng() * (max - min) + min;
}
function chance(p: number): boolean {
  return rng() < p;
}
function choice<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)]!;
}
function shuffled<T>(arr: readonly T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
function id(): string {
  return randomUUID();
}

const DAY_MS = 86_400_000;
function utcMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
function atUtcTime(dateOnly: Date, hour: number, minute: number): Date {
  return new Date(Date.UTC(dateOnly.getUTCFullYear(), dateOnly.getUTCMonth(), dateOnly.getUTCDate(), hour, minute));
}

const NOW = new Date();
const TODAY = utcMidnight(NOW.getUTCFullYear(), NOW.getUTCMonth() + 1, NOW.getUTCDate());
const HISTORY_START = addDays(TODAY, -3 * 365);
const HISTORY_DAYS = Math.floor((TODAY.getTime() - HISTORY_START.getTime()) / DAY_MS) - 1;

/** Batched `createMany` — the whole point of not using the real services at this row count. */
async function batchInsert<T>(label: string, run: (batch: T[]) => Promise<unknown>, rows: T[], batchSize = 1000): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    await run(rows.slice(i, i + batchSize));
  }
  console.log(`  ${label}: ${rows.length} rows`);
}

const startedAt = Date.now();

// -----------------------------------------------------------------------
// Name / place pools (Italian, plausible — `@example.test` domain only)
// -----------------------------------------------------------------------

const FIRST_NAMES = [
  'Marco', 'Luca', 'Giulia', 'Francesca', 'Alessandro', 'Chiara', 'Matteo', 'Sara', 'Davide', 'Elena',
  'Andrea', 'Valentina', 'Simone', 'Federica', 'Stefano', 'Silvia', 'Paolo', 'Martina', 'Riccardo', 'Laura',
  'Giovanni', 'Ilaria', 'Fabio', 'Alessia', 'Roberto', 'Elisa', 'Antonio', 'Roberta', 'Michele', 'Alice',
  'Lorenzo', 'Beatrice', 'Filippo', 'Cristina', 'Emanuele', 'Serena', 'Giuseppe', 'Veronica', 'Nicola', 'Barbara',
  'Daniele', 'Monica', 'Pietro', 'Sabrina', 'Vincenzo', 'Anna', 'Massimo', 'Claudia', 'Gabriele', 'Federico',
];
const LAST_NAMES = [
  'Rossi', 'Ferrari', 'Russo', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno',
  'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri',
  'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone', 'Longo',
  'Gentile', 'Martinelli', 'Vitale', 'Ferraro', 'Sartori', 'Marchetti', 'Bianco', 'Villa', 'Conte', 'Serra',
  'Coppola', 'De Santis', 'D’Angelo', 'Marchesi', 'Parisi', 'Pellegrini', 'Palumbo', 'Sanna', 'Farina', 'Rizzi',
];
const CITIES = ['Pisa', 'Firenze', 'Lucca', 'Livorno', 'Siena', 'Pistoia', 'Prato', 'Massa', 'Grosseto', 'Arezzo'];
const STREET_TYPES = ['Via', 'Via', 'Via', 'Piazza', 'Viale', 'Corso'];
const STREET_NAMES = ['Roma', 'Garibaldi', 'Dante', 'della Repubblica', 'delle Colline', 'Verdi', 'Manzoni', 'IV Novembre', 'dei Mille', 'San Martino'];

const AIRCRAFT_MODELS: Array<{ type: string; model: string; seats: number; fuelType: string; priceBandCents: [number, number] }> = [
  { type: 'Ultraleggero 3 assi', model: 'Tecnam P92 Eaglet', seats: 2, fuelType: 'Mogas', priceBandCents: [11000, 13500] },
  { type: 'Ultraleggero 3 assi', model: 'Tecnam P2008 JC', seats: 2, fuelType: 'Mogas', priceBandCents: [11500, 14000] },
  { type: 'Ultraleggero 3 assi', model: 'Tecnam P2002 Sierra', seats: 2, fuelType: 'Mogas', priceBandCents: [11800, 14200] },
  { type: 'Ultraleggero 3 assi', model: 'Pipistrel Virus SW', seats: 2, fuelType: 'Mogas', priceBandCents: [12000, 14500] },
  { type: 'Ultraleggero 3 assi', model: 'Pipistrel Sinus', seats: 2, fuelType: 'Mogas', priceBandCents: [11500, 13800] },
  { type: 'Aereo certificato', model: 'Cessna 172 Skyhawk', seats: 4, fuelType: 'AVGAS 100LL', priceBandCents: [16000, 20000] },
  { type: 'Aereo certificato', model: 'Piper PA-28 Warrior II', seats: 4, fuelType: 'AVGAS 100LL', priceBandCents: [15500, 19500] },
  { type: 'Aereo certificato', model: 'Robin DR400', seats: 4, fuelType: 'AVGAS 100LL', priceBandCents: [17000, 21000] },
  { type: 'Aereo certificato', model: 'Aquila A210', seats: 2, fuelType: 'AVGAS 100LL', priceBandCents: [16500, 20500] },
  { type: 'Aereo certificato', model: 'Diamond DA40', seats: 4, fuelType: 'AVGAS 100LL', priceBandCents: [19000, 24000] },
];
const OOS_REASONS = [
  'Revisione 100h in corso.',
  'Sostituzione elica.',
  'Attesa ricambio motore.',
  'Ispezione straordinaria post atterraggio duro.',
  'Aggiornamento avionica.',
  'Verniciatura in officina.',
];
const CANCEL_REASONS = [
  'Errore di registrazione: velivolo indicato non corretto.',
  'Volo annullato per maltempo, registrato per errore.',
  'Duplicato: registrato due volte per lo stesso volo.',
  'Orario di decollo/atterraggio errato, va corretto.',
];
const CASH_OPERATIONAL_CATEGORIES: Array<{ name: string; descriptions: string[]; amountRangeCents: [number, number] }> = [
  { name: 'Carburante', descriptions: ['Rifornimento AVGAS', 'Rifornimento Mogas', 'Fattura carburante mensile'], amountRangeCents: [-40000, -3000] },
  { name: 'Assicurazione', descriptions: ['Premio assicurativo annuale', 'Rata assicurazione flotta'], amountRangeCents: [-250000, -20000] },
  { name: 'Manutenzione', descriptions: ['Manutenzione ordinaria', 'Revisione 100h', 'Ricambi officina'], amountRangeCents: [-180000, -8000] },
  { name: 'Utenze', descriptions: ['Bolletta elettrica hangar', 'Bolletta acqua', 'Canone telefono/internet'], amountRangeCents: [-30000, -2000] },
  { name: 'Altro', descriptions: ['Materiale di consumo', 'Spese varie', 'Rimborso spese socio'], amountRangeCents: [-15000, -1000] },
];

// -----------------------------------------------------------------------
// Volumes (all scaled by LOAD_SCALE)
// -----------------------------------------------------------------------

const VOL = {
  persons: scaled(5000),
  aircraft: scaled(1500),
  flights: scaled(60000),
  bookings: scaled(40000),
  topUps: scaled(25000),
  cashOperational: scaled(2500),
  pprRequests: scaled(5000),
  packagesSold: scaled(3000),
  users: scaled(2500),
};

async function main(): Promise<void> {
  // --- Idempotency guard ---------------------------------------------------
  const existingLoadUser = await prisma.user.findFirst({ where: { email: { startsWith: 'load.' } }, select: { id: true } });
  if (existingLoadUser) {
    console.log('seed-load: load data already present (a "load."-prefixed User exists) — exiting without writing anything.');
    console.log('To reseed, drop and recreate the target database, migrate, base-seed, then rerun this script.');
    return;
  }

  const baseAdmin = await prisma.user.findUnique({ where: { email: 'admin@airmanager.local' }, select: { id: true } });
  if (!baseAdmin) {
    throw new Error('seed-load: base seed not found (no admin@airmanager.local) — run `npx prisma db seed` against this database first.');
  }
  const ADMIN_USER_ID = baseAdmin.id;

  console.log(`seed-load: target database "${ACTUAL_DB_NAME}", LOAD_SCALE=${LOAD_SCALE}`);
  console.log('Planned volumes (fixed-target phases; a few phases below are organic/derived and printed once known):');
  console.log(`  persons=${VOL.persons} aircraft=${VOL.aircraft} flights=${VOL.flights} bookings=${VOL.bookings}`);
  console.log(`  topUps=${VOL.topUps} cashOperational=${VOL.cashOperational} pprRequests=${VOL.pprRequests} packagesSold=${VOL.packagesSold} users=${VOL.users}`);

  const seedPassword = requireEnv('SEED_ADMIN_PASSWORD');
  const passwordHash = await hashPassword(seedPassword); // hashed ONCE — never per user.

  // ===========================================================================
  // PHASE 1 — Persons, profiles, accounts, users
  // ===========================================================================
  console.log('\nPhase 1: persons, profiles, accounts, users...');

  type PersonRecord = {
    id: string;
    firstName: string;
    lastName: string;
    archivedAt: Date | null;
    isPilot: boolean;
    isStudent: boolean;
    isInstructor: boolean;
    instructorProfileId?: string;
    payoutRateCents?: number | null;
    accountId?: string;
  };

  const N = VOL.persons;
  const order = shuffled([...Array(N).keys()]);
  const instructorCount = Math.round(N * 0.08);
  const totalPilotCount = Math.round(N * 0.6);
  const studentCount = Math.round(N * 0.25);
  const overlapCount = Math.round(instructorCount * 0.15); // "some with both pilot+instructor"

  const instructorIdxList = order.slice(0, instructorCount);
  const instructorIdxSet = new Set(instructorIdxList);
  const overlapIdxSet = new Set(shuffled(instructorIdxList).slice(0, overlapCount));
  const afterInstructor = order.slice(instructorCount);
  const pilotOnlyNeeded = Math.max(0, totalPilotCount - overlapCount);
  const pilotOnlyIdxSet = new Set(afterInstructor.slice(0, pilotOnlyNeeded));
  const afterPilot = afterInstructor.slice(pilotOnlyNeeded);
  const studentIdxSet = new Set(afterPilot.slice(0, studentCount));

  const archivedCount = Math.round(N * 0.05);
  const archivedIdxSet = new Set(shuffled(order).slice(0, archivedCount));

  const personRecords: PersonRecord[] = [];
  const personRows: Array<{ id: string; firstName: string; lastName: string; email: string; phone: string; address: string; archivedAt: Date | null }> = [];

  for (let i = 0; i < N; i++) {
    const firstName = choice(FIRST_NAMES);
    const lastName = choice(LAST_NAMES);
    const seq = String(i + 1).padStart(5, '0');
    const email = `person.${seq}@example.test`;
    const phone = `+39 3${randInt(10, 99)} ${randInt(100, 999)} ${randInt(1000, 9999)}`;
    const address = `${choice(STREET_TYPES)} ${choice(STREET_NAMES)} ${randInt(1, 200)}, ${choice(CITIES)}`;
    const isArchived = archivedIdxSet.has(i);
    // Archived sometime in the last 2 years, always before "now".
    const archivedAt = isArchived ? addDays(HISTORY_START, randInt(0, HISTORY_DAYS)) : null;

    const isInstructor = instructorIdxSet.has(i);
    const isPilot = pilotOnlyIdxSet.has(i) || overlapIdxSet.has(i);
    const isStudent = studentIdxSet.has(i);

    const record: PersonRecord = { id: id(), firstName, lastName, archivedAt, isPilot, isStudent, isInstructor };
    personRecords.push(record);
    personRows.push({ id: record.id, firstName, lastName, email, phone, address, archivedAt });
  }

  await batchInsert('Person', (batch) => prisma.person.createMany({ data: batch }), personRows);

  // --- Profiles --------------------------------------------------------------
  const pilotProfileRows: Array<{ id: string; personId: string; licenseNumber: string; licenseType: string; deactivatedAt: Date | null }> = [];
  const studentProfileRows: Array<{ id: string; personId: string; courseStartDate: Date; deactivatedAt: Date | null }> = [];
  const instructorProfileRows: Array<{ id: string; personId: string; payoutRateCents: number | null; deactivatedAt: Date | null }> = [];
  const licenseTypes = ['PPL(A)', 'PPL(A)', 'PPL(A)', 'LAPL(A)'];

  for (const p of personRecords) {
    if (p.isPilot) {
      pilotProfileRows.push({
        id: id(),
        personId: p.id,
        licenseNumber: `IT-PPL-${randInt(100000, 999999)}`,
        licenseType: choice(licenseTypes),
        deactivatedAt: p.archivedAt,
      });
    }
    if (p.isStudent) {
      studentProfileRows.push({
        id: id(),
        personId: p.id,
        courseStartDate: addDays(HISTORY_START, randInt(0, HISTORY_DAYS)),
        deactivatedAt: p.archivedAt,
      });
    }
    if (p.isInstructor) {
      const profileId = id();
      const hasPayoutRate = chance(0.8);
      const payoutRateCents = hasPayoutRate ? randInt(2000, 3500) : null;
      p.instructorProfileId = profileId;
      p.payoutRateCents = payoutRateCents;
      instructorProfileRows.push({ id: profileId, personId: p.id, payoutRateCents, deactivatedAt: p.archivedAt });
    }
  }

  await batchInsert('PilotProfile', (batch) => prisma.pilotProfile.createMany({ data: batch }), pilotProfileRows);
  await batchInsert('StudentProfile', (batch) => prisma.studentProfile.createMany({ data: batch }), studentProfileRows);
  await batchInsert('InstructorProfile', (batch) => prisma.instructorProfile.createMany({ data: batch }), instructorProfileRows);

  // --- Accounts (pilot OR student profile only — instructor-only never gets one, per accounts.service.ts) ---
  const accountRows: Array<{ id: string; personId: string }> = [];
  for (const p of personRecords) {
    if (p.isPilot || p.isStudent) {
      const accountId = id();
      p.accountId = accountId;
      accountRows.push({ id: accountId, personId: p.id });
    }
  }
  await batchInsert('Account', (batch) => prisma.account.createMany({ data: batch }), accountRows);

  // --- Instructor rates (one, spanning the whole 3-year window — see Phase 3 comment) ---
  const instructorRateRows: Array<{ id: string; instructorProfileId: string; priceCentsPerHour: number; validFrom: Date; actorUserId: string }> = [];
  for (const p of personRecords) {
    if (p.isInstructor && p.instructorProfileId) {
      instructorRateRows.push({
        id: id(),
        instructorProfileId: p.instructorProfileId,
        priceCentsPerHour: randInt(2800, 3800),
        validFrom: HISTORY_START,
        actorUserId: ADMIN_USER_ID,
      });
    }
  }
  await batchInsert('InstructorRate', (batch) => prisma.instructorRate.createMany({ data: batch }), instructorRateRows);

  // --- Users (logins) ---------------------------------------------------------
  const pilotPersons = personRecords.filter((p) => p.isPilot);
  const studentPersons = personRecords.filter((p) => p.isStudent);
  const instructorPersons = personRecords.filter((p) => p.isInstructor);

  // `pilotPersons` includes the instructor+pilot overlap (User.personId is
  // unique — a person picked for an instructor login must not ALSO be picked
  // for a pilot login), so each pool below excludes ids already claimed.
  let userBudget = VOL.users;
  const usedForUser = new Set<string>();
  const instructorUserPersons = shuffled(instructorPersons).slice(0, Math.min(instructorPersons.length, userBudget));
  instructorUserPersons.forEach((p) => usedForUser.add(p.id));
  userBudget -= instructorUserPersons.length;
  const pilotUserPersons = shuffled(pilotPersons.filter((p) => !usedForUser.has(p.id))).slice(0, Math.round(userBudget * 0.65));
  pilotUserPersons.forEach((p) => usedForUser.add(p.id));
  userBudget -= pilotUserPersons.length;
  const studentUserPersons = shuffled(studentPersons.filter((p) => !usedForUser.has(p.id))).slice(0, userBudget);

  type UserRow = { id: string; email: string; passwordHash: string; isActive: boolean; roles: Role[]; personId: string };
  const userRows: UserRow[] = [];

  function pushUsers(persons: PersonRecord[], prefix: string, extraRoles: (p: PersonRecord) => Role[]): void {
    persons.forEach((p, index) => {
      userRows.push({
        id: id(),
        email: `load.${prefix}.${String(index + 1).padStart(4, '0')}@example.test`,
        passwordHash,
        isActive: p.archivedAt === null,
        roles: extraRoles(p),
        personId: p.id,
      });
    });
  }
  pushUsers(instructorUserPersons, 'instructor', (p) => (p.isPilot ? ['INSTRUCTOR', 'PILOT'] : ['INSTRUCTOR']));
  pushUsers(pilotUserPersons, 'pilot', () => ['PILOT']);
  pushUsers(studentUserPersons, 'student', () => ['STUDENT']);

  // 3 extra admin persons+users (outside the main N-person population).
  const extraAdminPersonRows = Array.from({ length: 3 }, (_, i) => ({
    id: id(),
    firstName: choice(FIRST_NAMES),
    lastName: choice(LAST_NAMES),
    email: `load.admin.${String(i + 1).padStart(4, '0')}@example.test`,
    phone: `+39 3${randInt(10, 99)} ${randInt(100, 999)} ${randInt(1000, 9999)}`,
    address: null as string | null,
    archivedAt: null as Date | null,
  }));
  await batchInsert('Person (extra admins)', (batch) => prisma.person.createMany({ data: batch }), extraAdminPersonRows);
  for (const adminPerson of extraAdminPersonRows) {
    userRows.push({ id: id(), email: adminPerson.email, passwordHash, isActive: true, roles: ['ADMIN'], personId: adminPerson.id });
  }

  await batchInsert('User', (batch) => prisma.user.createMany({ data: batch }), userRows);

  console.log(
    `Phase 1 done: ${personRows.length + extraAdminPersonRows.length} persons (${pilotPersons.length} pilots, ${instructorPersons.length} instructors [${overlapIdxSet.size} also pilots], ${studentPersons.length} students, ${archivedCount} archived), ${accountRows.length} accounts, ${userRows.length} users.`,
  );

  // ===========================================================================
  // PHASE 2 — Fleet + rate history
  // ===========================================================================
  console.log('\nPhase 2: aircraft + rate history...');

  type AircraftRecord = {
    id: string;
    registration: string;
    archivedAt: Date | null;
    isOutOfService: boolean;
    rates: Array<{ validFrom: Date; priceCentsPerHour: number }>;
    meterMinutes: number; // mutable running hour-meter, advanced in Phase 3
    lastFlightDate: Date | null; // mutable, tracked in Phase 3 for correction ordering
  };

  function registrationForIndex(n: number): string {
    let value = n;
    let letters = '';
    for (let k = 0; k < 4; k++) {
      letters = String.fromCharCode(65 + (value % 26)) + letters;
      value = Math.floor(value / 26);
    }
    return `I-${letters}`;
  }

  const regOffset = randInt(0, 300000);
  const aircraftRecords: AircraftRecord[] = [];
  const aircraftRows: Array<{
    id: string;
    registration: string;
    type: string;
    model: string;
    hourMeterMinutes: number;
    seats: number;
    fuelType: string;
    status: AircraftStatus;
    statusReason: string | null;
    outOfServiceUntil: Date | null;
    archivedAt: Date | null;
  }> = [];
  const aircraftRateRows: Array<{ id: string; aircraftId: string; priceCentsPerHour: number; dryHourlyRateCents: number | null; validFrom: Date; actorUserId: string }> = [];

  for (let i = 0; i < VOL.aircraft; i++) {
    const spec = choice(AIRCRAFT_MODELS);
    const registration = registrationForIndex(regOffset + i);
    const isArchived = chance(0.03);
    const isOutOfService = chance(0.05);
    const archivedAt = isArchived ? addDays(HISTORY_START, randInt(HISTORY_DAYS - 400, HISTORY_DAYS)) : null;
    const outOfServiceUntil = isOutOfService && chance(0.5) ? addDays(TODAY, randInt(3, 45)) : null;
    const initialMeterMinutes = randInt(200, 3000) * 60;

    const aircraftId = id();
    aircraftRows.push({
      id: aircraftId,
      registration,
      type: spec.type,
      model: spec.model,
      hourMeterMinutes: initialMeterMinutes,
      seats: spec.seats,
      fuelType: spec.fuelType,
      status: isOutOfService ? 'OUT_OF_SERVICE' : 'OPERATIONAL',
      statusReason: isOutOfService ? choice(OOS_REASONS) : null,
      outOfServiceUntil,
      archivedAt,
    });

    // 1-3 rates over the last 3 years, ascending price.
    const rateCount = randInt(1, 3);
    const rates: Array<{ validFrom: Date; priceCentsPerHour: number }> = [];
    let priceCents = randInt(spec.priceBandCents[0], spec.priceBandCents[1]);
    for (let r = 0; r < rateCount; r++) {
      const validFrom = r === 0 ? HISTORY_START : addDays(HISTORY_START, Math.round((HISTORY_DAYS * r) / rateCount));
      const isLast = r === rateCount - 1;
      rates.push({ validFrom, priceCentsPerHour: priceCents });
      aircraftRateRows.push({
        id: id(),
        aircraftId,
        priceCentsPerHour: priceCents,
        dryHourlyRateCents: isLast && chance(0.6) ? Math.round(priceCents * 0.82) : null,
        validFrom,
        actorUserId: ADMIN_USER_ID,
      });
      priceCents = Math.round(priceCents * randFloat(1.03, 1.09));
    }

    aircraftRecords.push({ id: aircraftId, registration, archivedAt, isOutOfService, rates, meterMinutes: initialMeterMinutes, lastFlightDate: null });
  }

  await batchInsert('Aircraft', (batch) => prisma.aircraft.createMany({ data: batch }), aircraftRows);
  await batchInsert('AircraftRate', (batch) => prisma.aircraftRate.createMany({ data: batch }), aircraftRateRows);

  const operationalAircraft = aircraftRecords.filter((a) => a.archivedAt === null);
  console.log(`Phase 2 done: ${aircraftRows.length} aircraft, ${aircraftRateRows.length} rate rows.`);

  // ===========================================================================
  // PHASE 3 — Flights, hour-meter advance, FLIGHT_CHARGE (+ reversals/corrections)
  // ===========================================================================
  console.log('\nPhase 3: flights...');

  function effectiveRate(rates: Array<{ validFrom: Date; priceCentsPerHour: number }>, onDate: Date): number {
    let best = rates[0]!.priceCentsPerHour;
    for (const r of rates) {
      if (r.validFrom.getTime() <= onDate.getTime()) best = r.priceCentsPerHour;
    }
    return best;
  }

  function seasonalWeight(date: Date): number {
    const month = date.getUTCMonth() + 1;
    const dow = date.getUTCDay();
    let w = 1;
    if (month >= 5 && month <= 9) w *= 2.2;
    if (dow === 0 || dow === 6) w *= 1.8;
    return w;
  }
  function sampleFlightDate(): Date {
    for (let attempt = 0; attempt < 25; attempt++) {
      const candidate = addDays(HISTORY_START, randInt(0, HISTORY_DAYS));
      if (chance(Math.min(1, seasonalWeight(candidate) / 3))) return candidate;
    }
    return addDays(HISTORY_START, randInt(0, HISTORY_DAYS));
  }

  type FlightRow = {
    id: string;
    aircraftId: string;
    personId: string;
    instructorProfileId: string | null;
    flightDate: Date;
    flightType: FlightType;
    isSolo: boolean;
    status: FlightStatus;
    cancelledAt: Date | null;
    cancelReason: string | null;
    correctionOfId: string | null;
    departureAirfield: string;
    arrivalAirfield: string;
    takeoffAt: Date;
    landingAt: Date;
    minutes: number;
    hourMeterStart: number;
    hourMeterEnd: number;
    takeoffs: number;
    landings: number;
    aircraftRateCentsPerHour: number;
    aircraftAmountCents: number;
    instructorRateCentsPerHour: number | null;
    instructorAmountCents: number | null;
    actorUserId: string;
  };

  const instructorRateByProfileId = new Map(instructorRateRows.map((r) => [r.instructorProfileId, r.priceCentsPerHour]));
  const accountIdByPersonId = new Map(personRecords.filter((p) => p.accountId).map((p) => [p.id, p.accountId!]));
  const AIRFIELD_NAME = 'Aviosuperficie di carico';

  const flightRows: FlightRow[] = [];

  // Distribute the flight count across aircraft, weighted (archived/OOS aircraft fly less).
  const flightWeights = aircraftRecords.map((a) => randFloat(0.3, 1.7) * (a.archivedAt ? 0.3 : 1) * (a.isOutOfService ? 0.6 : 1));
  const totalWeight = flightWeights.reduce((s, w) => s + w, 0);
  const perAircraftCount = aircraftRecords.map((_, i) => Math.round((flightWeights[i]! / totalWeight) * VOL.flights));

  for (let ai = 0; ai < aircraftRecords.length; ai++) {
    const aircraft = aircraftRecords[ai]!;
    const count = perAircraftCount[ai]!;
    if (count === 0) continue;

    // Generate this aircraft's flight instants, sorted chronologically —
    // meter advances strictly in this order (see module doc: monotonicity by construction).
    // An aircraft cannot take off twice at the exact same instant — dedupe
    // per-aircraft takeoffAt (without this, an occasional (day, hour, minute)
    // collision produces a tied pair whose relative order then depends on
    // whatever tiebreak a reader sorts by, which can disagree with this
    // loop's own meter-assignment order and read back as non-monotonic).
    const usedTakeoffMs = new Set<number>();
    const instants = Array.from({ length: count }, () => {
      const day = sampleFlightDate();
      let takeoffAt = atUtcTime(day, randInt(8, 18), choice([0, 15, 30, 45]));
      while (usedTakeoffMs.has(takeoffAt.getTime())) {
        takeoffAt = new Date(takeoffAt.getTime() + randInt(1, 9) * 60_000);
      }
      usedTakeoffMs.add(takeoffAt.getTime());
      const durationMin = randInt(30, 150);
      return { day, takeoffAt, durationMin };
    }).sort((a, b) => a.takeoffAt.getTime() - b.takeoffAt.getTime());

    for (const instant of instants) {
      const flightDate = utcMidnight(instant.day.getUTCFullYear(), instant.day.getUTCMonth() + 1, instant.day.getUTCDate());
      const isSchool = chance(0.2) && studentPersons.length > 0 && instructorPersons.length > 0;
      const isAerialWork = !isSchool && chance(0.15);
      const flightType: FlightType = isSchool ? 'SCHOOL' : isAerialWork ? 'AERIAL_WORK' : 'TOURISM';

      let personId: string;
      let instructorProfileId: string | null = null;
      let isSolo = false;
      if (isSchool) {
        personId = choice(studentPersons).id;
        const instructor = choice(instructorPersons);
        instructorProfileId = instructor.instructorProfileId!;
        isSolo = chance(0.2);
      } else {
        personId = choice(pilotPersons).id;
        if (chance(0.08) && instructorPersons.length > 0) {
          const instructor = choice(instructorPersons);
          instructorProfileId = instructor.instructorProfileId!;
        }
      }

      const accountId = accountIdByPersonId.get(personId);
      if (!accountId) continue; // defensive — every pilot/student in the pools has one.

      const minutes = instant.durationMin;
      const landingAt = new Date(instant.takeoffAt.getTime() + minutes * 60_000);
      const hourMeterStart = aircraft.meterMinutes;
      const hourMeterEnd = hourMeterStart + minutes;
      aircraft.meterMinutes = hourMeterEnd;
      aircraft.lastFlightDate = flightDate;

      const aircraftRateCentsPerHour = effectiveRate(aircraft.rates, flightDate);
      const aircraftAmountCents = Math.round((aircraftRateCentsPerHour * minutes) / 60);
      const instructorRateCentsPerHour = instructorProfileId ? (instructorRateByProfileId.get(instructorProfileId) ?? null) : null;
      const instructorAmountCents = instructorRateCentsPerHour !== null ? Math.round((instructorRateCentsPerHour * minutes) / 60) : null;

      const touchAndGo = flightType === 'SCHOOL' && chance(0.4) ? randInt(2, 8) : 1;

      flightRows.push({
        id: id(),
        aircraftId: aircraft.id,
        personId,
        instructorProfileId,
        flightDate,
        flightType,
        isSolo,
        status: 'REGISTERED',
        cancelledAt: null,
        cancelReason: null,
        correctionOfId: null,
        departureAirfield: AIRFIELD_NAME,
        arrivalAirfield: AIRFIELD_NAME,
        takeoffAt: instant.takeoffAt,
        landingAt,
        minutes,
        hourMeterStart,
        hourMeterEnd,
        takeoffs: touchAndGo,
        landings: touchAndGo,
        aircraftRateCentsPerHour,
        aircraftAmountCents,
        instructorRateCentsPerHour,
        instructorAmountCents,
        actorUserId: ADMIN_USER_ID,
      });
    }
  }

  // --- Cancellations (~2%) + a small corrected share (~40% of those) --------
  // Deliberate load-seed simplification (documented for the ratifying session):
  // the REAL `cancelFlight` service rolls the aircraft's hour meter back by the
  // cancelled flight's minutes. Doing that here would make the meter sequence
  // depend on cancellation choice, and — since corrections are dated to stay
  // ordered after everything else already generated for their aircraft — could
  // reintroduce a monotonicity violation. This seed keeps the meter
  // strictly forward-only regardless of cancellation, trading a small,
  // flagged deviation from `cancelFlight`'s exact semantics for a dataset that
  // is unambiguously monotonic when ordered by flightDate.
  const cancelCandidates = shuffled(flightRows.map((_, i) => i)).slice(0, Math.round(flightRows.length * 0.02));
  const cancelledSet = new Set(cancelCandidates);
  const correctionFlightRows: FlightRow[] = [];
  const aircraftById = new Map(aircraftRecords.map((a) => [a.id, a]));

  for (const idx of cancelCandidates) {
    const original = flightRows[idx]!;
    original.status = 'CANCELLED';
    original.cancelledAt = addDays(original.flightDate, randInt(1, 10));
    if (original.cancelledAt.getTime() > NOW.getTime()) original.cancelledAt = NOW;
    original.cancelReason = choice(CANCEL_REASONS);

    if (chance(0.4)) {
      const aircraft = aircraftById.get(original.aircraftId)!;
      const correctionDay = addDays(original.flightDate, randInt(1, 5));
      const forcedDay = aircraft.lastFlightDate && correctionDay.getTime() <= aircraft.lastFlightDate.getTime() ? addDays(aircraft.lastFlightDate, 1) : correctionDay;
      if (forcedDay.getTime() > TODAY.getTime()) continue; // would land in the future — skip this one's correction.

      const newMinutes = Math.max(15, Math.round(original.minutes * randFloat(0.85, 1.15)));
      const takeoffAt = atUtcTime(forcedDay, randInt(8, 18), choice([0, 15, 30, 45]));
      const landingAt = new Date(takeoffAt.getTime() + newMinutes * 60_000);
      const hourMeterStart = aircraft.meterMinutes;
      const hourMeterEnd = hourMeterStart + newMinutes;
      aircraft.meterMinutes = hourMeterEnd;
      aircraft.lastFlightDate = forcedDay;

      const aircraftRateCentsPerHour = effectiveRate(aircraft.rates, forcedDay);
      const aircraftAmountCents = Math.round((aircraftRateCentsPerHour * newMinutes) / 60);
      const instructorRateCentsPerHour = original.instructorProfileId ? (instructorRateByProfileId.get(original.instructorProfileId) ?? null) : null;
      const instructorAmountCents = instructorRateCentsPerHour !== null ? Math.round((instructorRateCentsPerHour * newMinutes) / 60) : null;

      correctionFlightRows.push({
        id: id(),
        aircraftId: original.aircraftId,
        personId: original.personId,
        instructorProfileId: original.instructorProfileId,
        flightDate: forcedDay,
        flightType: original.flightType,
        isSolo: original.isSolo,
        status: 'REGISTERED',
        cancelledAt: null,
        cancelReason: null,
        correctionOfId: original.id,
        departureAirfield: AIRFIELD_NAME,
        arrivalAirfield: AIRFIELD_NAME,
        takeoffAt,
        landingAt,
        minutes: newMinutes,
        hourMeterStart,
        hourMeterEnd,
        takeoffs: 1,
        landings: 1,
        aircraftRateCentsPerHour,
        aircraftAmountCents,
        instructorRateCentsPerHour,
        instructorAmountCents,
        actorUserId: ADMIN_USER_ID,
      });
    }
  }

  const allFlightRows = flightRows.concat(correctionFlightRows);
  await batchInsert(
    'Flight',
    (batch) =>
      prisma.flight.createMany({
        data: batch.map((f) => ({
          id: f.id,
          aircraftId: f.aircraftId,
          personId: f.personId,
          instructorProfileId: f.instructorProfileId,
          flightDate: f.flightDate,
          flightType: f.flightType,
          isSolo: f.isSolo,
          status: f.status,
          cancelledAt: f.cancelledAt,
          cancelReason: f.cancelReason,
          correctionOfId: f.correctionOfId,
          departureAirfield: f.departureAirfield,
          arrivalAirfield: f.arrivalAirfield,
          takeoffAt: f.takeoffAt,
          landingAt: f.landingAt,
          minutes: f.minutes,
          hourMeterStart: f.hourMeterStart,
          hourMeterEnd: f.hourMeterEnd,
          takeoffs: f.takeoffs,
          landings: f.landings,
          aircraftRateCentsPerHour: f.aircraftRateCentsPerHour,
          aircraftAmountCents: f.aircraftAmountCents,
          instructorRateCentsPerHour: f.instructorRateCentsPerHour,
          instructorAmountCents: f.instructorAmountCents,
          actorUserId: f.actorUserId,
        })),
      }),
    allFlightRows,
  );

  // --- FLIGHT_CHARGE (+ FLIGHT_CHARGE_REVERSAL for cancelled originals) ------
  type MovementRow = {
    id: string;
    accountId: string;
    type: AccountMovementType;
    amountCents: number;
    paymentMethod: PaymentMethod | null;
    description: string | null;
    effectiveDate: Date;
    actorUserId: string;
    reversalOfId: string | null;
    flightId: string | null;
  };
  const movementRows: MovementRow[] = [];
  const flightChargeMovementIdByFlightId = new Map<string, string>();

  for (const f of allFlightRows) {
    const accountId = accountIdByPersonId.get(f.personId)!;
    const chargeId = id();
    flightChargeMovementIdByFlightId.set(f.id, chargeId);
    movementRows.push({
      id: chargeId,
      accountId,
      type: 'FLIGHT_CHARGE',
      amountCents: -(f.aircraftAmountCents + (f.instructorAmountCents ?? 0)),
      paymentMethod: null,
      description: `Volo ${f.aircraftId.slice(0, 6)} ${toDateOnlyString(f.flightDate)}`,
      effectiveDate: f.flightDate,
      actorUserId: ADMIN_USER_ID,
      reversalOfId: null,
      flightId: f.id,
    });
  }
  for (const idx of cancelledSet) {
    const original = flightRows[idx]!;
    const originalChargeId = flightChargeMovementIdByFlightId.get(original.id)!;
    const accountId = accountIdByPersonId.get(original.personId)!;
    movementRows.push({
      id: id(),
      accountId,
      type: 'FLIGHT_CHARGE_REVERSAL',
      amountCents: original.aircraftAmountCents + (original.instructorAmountCents ?? 0),
      paymentMethod: null,
      description: `Storno volo annullato: ${original.cancelReason}`,
      effectiveDate: original.cancelledAt!,
      actorUserId: ADMIN_USER_ID,
      reversalOfId: originalChargeId,
      flightId: original.id,
    });
  }

  await batchInsert('AccountMovement (FLIGHT_CHARGE/_REVERSAL)', (batch) => prisma.accountMovement.createMany({ data: batch }), movementRows);

  // --- Persist the simulated final hour-meter per aircraft --------------------
  const meterUpdates = aircraftRecords.filter((a) => a.meterMinutes !== aircraftRows.find((r) => r.id === a.id)!.hourMeterMinutes);
  for (let i = 0; i < meterUpdates.length; i += 50) {
    const chunk = meterUpdates.slice(i, i + 50);
    await Promise.all(chunk.map((a) => prisma.aircraft.update({ where: { id: a.id }, data: { hourMeterMinutes: a.meterMinutes } })));
  }

  console.log(
    `Phase 3 done: ${allFlightRows.length} flights (${flightRows.length} primary + ${correctionFlightRows.length} corrections, ${cancelledSet.size} cancelled), ${movementRows.length} flight-related account movements, ${meterUpdates.length} aircraft meters updated.`,
  );

  // ===========================================================================
  // PHASE 4 — Bookings
  // ===========================================================================
  console.log('\nPhase 4: bookings...');

  // Only a currently-APPROVED booking occupies a slot (bookings.service.ts) —
  // so only the FUTURE/APPROVED subset needs non-overlap enforcement; every
  // past booking ends up in a terminal, non-APPROVED status.
  const bookingApprovedIntervalsByAircraft = new Map<string, Array<{ start: number; end: number }>>();
  function overlapsApproved(aircraftId: string, start: number, end: number): boolean {
    const intervals = bookingApprovedIntervalsByAircraft.get(aircraftId);
    if (!intervals) return false;
    return intervals.some((iv) => start < iv.end && end > iv.start);
  }
  function registerApproved(aircraftId: string, start: number, end: number): void {
    const intervals = bookingApprovedIntervalsByAircraft.get(aircraftId) ?? [];
    intervals.push({ start, end });
    bookingApprovedIntervalsByAircraft.set(aircraftId, intervals);
  }

  type BookingRow = {
    id: string;
    aircraftId: string;
    personId: string;
    instructorProfileId: string | null;
    startsAt: Date;
    endsAt: Date;
    status: BookingStatus;
    cancelledAt: Date | null;
    cancelledByUserId: string | null;
    decidedAt: Date | null;
    decidedByUserId: string | null;
    denyReason: string | null;
    closedAt: Date | null;
    closedByUserId: string | null;
    actorUserId: string;
  };
  const bookingRows: BookingRow[] = [];
  const SCHED_OPEN_HOUR = 7;
  const SCHED_CLOSE_HOUR = 20;
  const MAX_ADVANCE_DAYS = 60;

  const pastBookingsCount = Math.round(VOL.bookings * 0.7);
  const futureBookingsCount = VOL.bookings - pastBookingsCount;

  for (let i = 0; i < pastBookingsCount; i++) {
    const aircraft = choice(operationalAircraft.length > 0 ? operationalAircraft : aircraftRecords);
    const isSchool = chance(0.2) && studentPersons.length > 0 && instructorPersons.length > 0;
    const personId = isSchool ? choice(studentPersons).id : choice(pilotPersons).id;
    const instructorProfileId = isSchool ? choice(instructorPersons).instructorProfileId! : null;

    const day = addDays(HISTORY_START, randInt(0, HISTORY_DAYS));
    const startHour = randInt(SCHED_OPEN_HOUR, SCHED_CLOSE_HOUR - 2);
    const durationMin = choice([30, 60, 90, 120]);
    const startsAt = atUtcTime(day, startHour, choice([0, 30]));
    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);

    const roll = rng();
    let status: BookingStatus;
    let decidedAt: Date | null = null;
    let denyReason: string | null = null;
    let closedAt: Date | null = null;
    let cancelledAt: Date | null = null;
    if (roll < 0.5) {
      status = 'FLOWN';
      decidedAt = addDays(startsAt, -1);
      closedAt = endsAt;
    } else if (roll < 0.6) {
      status = 'NO_SHOW';
      decidedAt = addDays(startsAt, -1);
      closedAt = endsAt;
    } else if (roll < 0.75) {
      status = 'DENIED';
      decidedAt = addDays(startsAt, -2);
      denyReason = 'Velivolo non disponibile per manutenzione programmata.';
    } else {
      status = 'CANCELLED';
      cancelledAt = addDays(startsAt, -1);
    }

    bookingRows.push({
      id: id(),
      aircraftId: aircraft.id,
      personId,
      instructorProfileId,
      startsAt,
      endsAt,
      status,
      cancelledAt,
      cancelledByUserId: cancelledAt ? ADMIN_USER_ID : null,
      decidedAt,
      decidedByUserId: decidedAt ? ADMIN_USER_ID : null,
      denyReason,
      closedAt,
      closedByUserId: closedAt ? ADMIN_USER_ID : null,
      actorUserId: ADMIN_USER_ID,
    });
  }

  for (let i = 0; i < futureBookingsCount; i++) {
    const aircraft = choice(operationalAircraft.length > 0 ? operationalAircraft : aircraftRecords);
    const isSchool = chance(0.2) && studentPersons.length > 0 && instructorPersons.length > 0;
    const personId = isSchool ? choice(studentPersons).id : choice(pilotPersons).id;
    const instructorProfileId = isSchool ? choice(instructorPersons).instructorProfileId! : null;

    let placed = false;
    for (let attempt = 0; attempt < 15 && !placed; attempt++) {
      const dayOffset = randInt(1, MAX_ADVANCE_DAYS);
      const day = addDays(TODAY, dayOffset);
      const startHour = randInt(SCHED_OPEN_HOUR, SCHED_CLOSE_HOUR - 2);
      const durationMin = choice([30, 60, 90, 120]);
      const startsAt = atUtcTime(day, startHour, choice([0, 30]));
      const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);

      const wantsApproved = chance(0.6);
      if (wantsApproved && overlapsApproved(aircraft.id, startsAt.getTime(), endsAt.getTime())) {
        continue; // retry a different slot rather than violate the overlap invariant.
      }

      const status: BookingStatus = wantsApproved ? 'APPROVED' : 'PENDING';
      if (wantsApproved) registerApproved(aircraft.id, startsAt.getTime(), endsAt.getTime());

      bookingRows.push({
        id: id(),
        aircraftId: aircraft.id,
        personId,
        instructorProfileId,
        startsAt,
        endsAt,
        status,
        cancelledAt: null,
        cancelledByUserId: null,
        decidedAt: wantsApproved ? addDays(NOW, -randInt(0, 2)) : null,
        decidedByUserId: wantsApproved ? ADMIN_USER_ID : null,
        denyReason: null,
        closedAt: null,
        closedByUserId: null,
        actorUserId: ADMIN_USER_ID,
      });
      placed = true;
    }
  }

  await batchInsert('Booking', (batch) => prisma.booking.createMany({ data: batch }), bookingRows);
  console.log(`Phase 4 done: ${bookingRows.length} bookings.`);

  // ===========================================================================
  // PHASE 5 — Account ledger: top-ups + adjustments (membership fees + misc)
  // ===========================================================================
  // NOTE on the ~150000 AccountMovement figure suggested in the brief: the
  // schema ties every TOP_UP/PPR-landing-fee/instructor-payout to EXACTLY one
  // CashMovement twin (accounts.service.ts#recordTopUp,
  // instructor-compensation.service.ts#recordPayout, ppr.service.ts), while
  // ADJUSTMENT/PACKAGE_PURCHASE never create one. Hitting ~150000
  // AccountMovement rows primarily via TOP_UP would have pushed CashMovement
  // volume 2-3x past the requested ~30000. This phase instead sizes TOP_UP to
  // stay consistent with the ~30000 CashMovement target and uses ADJUSTMENT
  // (membership-fee renewals + misc rettifiche, neither of which touches
  // CashMovement) to fill the rest — landing at a smaller, but internally
  // consistent, AccountMovement total. Flagged for the ratifying session.
  console.log('\nPhase 5: top-ups + adjustments...');

  const fundedPersons = personRecords.filter((p) => p.accountId);
  const cashCategoryRows = await prisma.cashCategory.findMany({
    where: { name: { in: ['Ricariche', 'PPR', 'Compensi istruttori', ...CASH_OPERATIONAL_CATEGORIES.map((c) => c.name)] } },
    select: { id: true, name: true },
  });
  const cashCategoryIdByName = new Map(cashCategoryRows.map((c) => [c.name, c.id]));
  const ricaricheId = cashCategoryIdByName.get('Ricariche');
  if (!ricaricheId) throw new Error('seed-load: "Ricariche" cash category missing — run the base seed first.');

  const topUpAmounts = [10000, 15000, 20000, 25000, 30000, 40000, 50000];
  const paymentMethods: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'POS'];

  const adjustmentMovementRows: MovementRow[] = [];
  const topUpMovementRows: MovementRow[] = [];
  const topUpCashRows: Array<{ id: string; categoryId: string; amountCents: number; paymentMethod: PaymentMethod; description: string | null; effectiveDate: Date; actorUserId: string; accountMovementId: string }> = [];

  for (let i = 0; i < VOL.topUps; i++) {
    const person = choice(fundedPersons);
    const accountId = person.accountId!;
    const effectiveDate = addDays(HISTORY_START, randInt(0, HISTORY_DAYS));
    const amountCents = choice(topUpAmounts);
    const method = choice(paymentMethods);
    const movementId = id();
    topUpMovementRows.push({
      id: movementId,
      accountId,
      type: 'TOP_UP',
      amountCents,
      paymentMethod: method,
      description: null,
      effectiveDate,
      actorUserId: ADMIN_USER_ID,
      reversalOfId: null,
      flightId: null,
    });
    topUpCashRows.push({
      id: id(),
      categoryId: ricaricheId,
      amountCents,
      paymentMethod: method,
      description: null,
      effectiveDate,
      actorUserId: ADMIN_USER_ID,
      accountMovementId: movementId,
    });
  }
  await batchInsert('AccountMovement (TOP_UP)', (batch) => prisma.accountMovement.createMany({ data: batch }), topUpMovementRows);
  await batchInsert('CashMovement (Ricariche)', (batch) => prisma.cashMovement.createMany({ data: batch }), topUpCashRows);

  // Membership-fee renewals (ADJUSTMENT, no cash twin — chargeMembershipFee's
  // own convention) — up to 3 yearly renewals per funded person who "pays".
  const membershipFeeCents = 8000;
  for (const person of fundedPersons) {
    if (!chance(0.75)) continue;
    const years = randInt(1, 3);
    for (let y = 0; y < years; y++) {
      const effectiveDate = addDays(HISTORY_START, Math.min(HISTORY_DAYS, 30 + y * 365 + randInt(0, 20)));
      adjustmentMovementRows.push({
        id: id(),
        accountId: person.accountId!,
        type: 'ADJUSTMENT',
        amountCents: -membershipFeeCents,
        paymentMethod: null,
        description: `Quota associativa ${HISTORY_START.getUTCFullYear() + y}`,
        effectiveDate,
        actorUserId: ADMIN_USER_ID,
        reversalOfId: null,
        flightId: null,
      });
    }
  }
  // Misc rettifiche (both signs) — fills out the ledger with plausible one-off corrections.
  const miscAdjustmentTarget = Math.round(fundedPersons.length * 2);
  const MISC_ADJUSTMENT_REASONS = ['Sconto commerciale', 'Correzione addebito volo', 'Rimborso parziale', 'Arrotondamento cassa', 'Bonus fedeltà'];
  for (let i = 0; i < miscAdjustmentTarget; i++) {
    const person = choice(fundedPersons);
    const sign = chance(0.6) ? 1 : -1;
    adjustmentMovementRows.push({
      id: id(),
      accountId: person.accountId!,
      type: 'ADJUSTMENT',
      amountCents: sign * randInt(500, 8000),
      paymentMethod: null,
      description: choice(MISC_ADJUSTMENT_REASONS),
      effectiveDate: addDays(HISTORY_START, randInt(0, HISTORY_DAYS)),
      actorUserId: ADMIN_USER_ID,
      reversalOfId: null,
      flightId: null,
    });
  }
  await batchInsert('AccountMovement (ADJUSTMENT)', (batch) => prisma.accountMovement.createMany({ data: batch }), adjustmentMovementRows);

  console.log(`Phase 5 done: ${topUpMovementRows.length} top-ups, ${adjustmentMovementRows.length} adjustments.`);

  // ===========================================================================
  // PHASE 6 — Hour packages (historical, decorative — see Phase 6 comment)
  // ===========================================================================
  // Story 12.13 retired package consumption from `flights.service.ts` — no
  // live flight ever consumes a package anymore, and the "Pacchetti" cash
  // category was dropped in the same story. These rows exist ONLY as
  // historical-shaped decorative data ("some hour packages purchased and
  // consumed"), deliberately NOT wired into any Phase 3 flight's own
  // `aircraftAmountCents` (that would require re-implementing retired
  // pro-ration logic for dead functionality) and posted under "Altro" since
  // there is no live category for a package sale anymore. Flagged for the
  // ratifying session.
  console.log('\nPhase 6: hour packages (historical/decorative)...');

  const altroId = cashCategoryIdByName.get('Altro');
  const packagePurchaseMovementRows: MovementRow[] = [];
  const hourPackageRows: Array<{ id: string; personId: string; packageTypeId: string | null; includedMinutes: number; pricePaidCents: number; paymentMethod: PaymentMethod; effectiveDate: Date; expiresAt: Date | null; accountMovementId: string; actorUserId: string }> = [];
  const packageConsumptionRows: Array<{ id: string; flightId: string; hourPackageId: string; minutes: number }> = [];

  // A single ad-hoc PackageType so sold packages have somewhere to point (a
  // fresh install has none — story 4.3's catalogue is otherwise empty).
  const packageTypeId = id();
  await prisma.packageType.create({
    data: { id: packageTypeId, name: 'Pacchetto 10 ore (storico)', includedMinutes: 600, priceCents: 105000, validityMonths: 12, isActive: false },
  });

  const oldFlightsForConsumption = flightRows.filter((f) => f.status === 'REGISTERED').slice(0, VOL.packagesSold);
  for (let i = 0; i < VOL.packagesSold; i++) {
    const person = choice(pilotPersons);
    const accountId = accountIdByPersonId.get(person.id);
    if (!accountId) continue;
    const effectiveDate = addDays(HISTORY_START, randInt(0, Math.max(1, HISTORY_DAYS - 30)));
    const movementId = id();
    packagePurchaseMovementRows.push({
      id: movementId,
      accountId,
      type: 'PACKAGE_PURCHASE',
      amountCents: 0,
      paymentMethod: null,
      description: 'Acquisto pacchetto ore (storico)',
      effectiveDate,
      actorUserId: ADMIN_USER_ID,
      reversalOfId: null,
      flightId: null,
    });
    const packageId = id();
    hourPackageRows.push({
      id: packageId,
      personId: person.id,
      packageTypeId,
      includedMinutes: 600,
      pricePaidCents: 105000,
      paymentMethod: choice(paymentMethods),
      effectiveDate,
      expiresAt: addMonthsClampUtc(effectiveDate, 12),
      accountMovementId: movementId,
      actorUserId: ADMIN_USER_ID,
    });

    const consumedFlight = oldFlightsForConsumption[i % Math.max(1, oldFlightsForConsumption.length)];
    if (consumedFlight && chance(0.5)) {
      packageConsumptionRows.push({ id: id(), flightId: consumedFlight.id, hourPackageId: packageId, minutes: Math.min(consumedFlight.minutes, randInt(15, 60)) });
    }
  }
  await batchInsert('AccountMovement (PACKAGE_PURCHASE)', (batch) => prisma.accountMovement.createMany({ data: batch }), packagePurchaseMovementRows);
  await batchInsert(
    'HourPackage',
    (batch) => prisma.hourPackage.createMany({ data: batch.map((r) => ({ ...r, packageTypeId: r.packageTypeId! })) }),
    hourPackageRows,
  );
  // De-duplicate by (flightId, hourPackageId) — the schema's own `@@unique`.
  const seenConsumptionKeys = new Set<string>();
  const dedupedConsumptionRows = packageConsumptionRows.filter((r) => {
    const key = `${r.flightId}:${r.hourPackageId}`;
    if (seenConsumptionKeys.has(key)) return false;
    seenConsumptionKeys.add(key);
    return true;
  });
  await batchInsert('PackageConsumption', (batch) => prisma.packageConsumption.createMany({ data: batch }), dedupedConsumptionRows);
  void altroId;

  console.log(`Phase 6 done: ${hourPackageRows.length} packages sold, ${dedupedConsumptionRows.length} consumption rows.`);

  // ===========================================================================
  // PHASE 7 — Cash ledger: operational movements
  // ===========================================================================
  console.log('\nPhase 7: operational cash movements...');

  const operationalCashRows: Array<{ id: string; categoryId: string; amountCents: number; paymentMethod: PaymentMethod; description: string | null; effectiveDate: Date; actorUserId: string }> = [];
  for (let i = 0; i < VOL.cashOperational; i++) {
    const category = choice(CASH_OPERATIONAL_CATEGORIES);
    const categoryId = cashCategoryIdByName.get(category.name);
    if (!categoryId) continue;
    operationalCashRows.push({
      id: id(),
      categoryId,
      amountCents: randInt(category.amountRangeCents[0], category.amountRangeCents[1]),
      paymentMethod: choice(paymentMethods),
      description: choice(category.descriptions),
      effectiveDate: addDays(HISTORY_START, randInt(0, HISTORY_DAYS)),
      actorUserId: ADMIN_USER_ID,
    });
  }
  await batchInsert('CashMovement (operational)', (batch) => prisma.cashMovement.createMany({ data: batch }), operationalCashRows);

  // ===========================================================================
  // PHASE 8 — PPR requests, per-year numbering, landing fees
  // ===========================================================================
  console.log('\nPhase 8: PPR requests...');

  const pprCashCategoryId = cashCategoryIdByName.get('PPR');
  const PPR_FIRST_NAMES = ['Hans', 'Andreas', 'Jean', 'Pierre', 'Martin', 'Tomas', 'Karel', 'Klaus', 'Wolfgang', 'Luc'];
  const PPR_LAST_NAMES = ['Müller', 'Schmidt', 'Dubois', 'Novak', 'Dvorak', 'Weber', 'Fischer', 'Bernard', 'Kral', 'Meyer'];
  const PPR_AIRCRAFT = [
    { reg: 'D-EKPT', type: 'Cessna 172S' },
    { reg: 'F-HBGA', type: 'Robin DR401' },
    { reg: 'OK-VPR', type: 'Cirrus SR20' },
    { reg: 'D-ELLE', type: 'Piper PA-28' },
    { reg: 'F-GXYZ', type: 'Diamond DA40' },
  ];
  const PPR_ORIGINS = ['Bolzano (LIPB)', 'Lucca-Tassignano (LIQL)', 'Siena-Ampugnano (LIQS)', 'Cannes (LFMD)', 'Praga-Letnany (LKLT)', 'Monaco (EDDM)'];

  type PprRow = {
    id: string;
    status: PprStatus;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
    aircraftRegistration: string;
    aircraftType: string;
    origin: string;
    destination: string;
    eta: Date;
    etd: Date | null;
    personsOnBoard: number;
    locale: string;
    pprNumber: string | null;
    rejectionReason: string | null;
    decidedAt: Date | null;
    decidedByUserId: string | null;
    closedAt: Date | null;
    closedByUserId: string | null;
    landingFeeCents: number | null;
    createdAt: Date;
  };

  const pprRows: PprRow[] = [];
  const yearSeq = new Map<number, number>();
  const AIRFIELD_DESTINATION = AIRFIELD_NAME;

  for (let i = 0; i < VOL.pprRequests; i++) {
    const createdAt = addDays(HISTORY_START, randInt(0, HISTORY_DAYS));
    const eta = new Date(createdAt.getTime() + randInt(1, 20) * DAY_MS);
    const roll = rng();
    let status: PprStatus;
    if (roll < 0.1) status = 'PENDING';
    else if (roll < 0.2) status = 'APPROVED';
    else if (roll < 0.35) status = 'REJECTED';
    else if (roll < 0.9) status = 'COMPLETED';
    else status = 'CANCELLED';

    let pprNumber: string | null = null;
    let decidedAt: Date | null = null;
    let closedAt: Date | null = null;
    let rejectionReason: string | null = null;
    let landingFeeCents: number | null = null;

    if (status !== 'PENDING') {
      decidedAt = new Date(createdAt.getTime() + randInt(1, 48) * 3_600_000);
      if (status === 'REJECTED') {
        rejectionReason = 'Slot non disponibile nella data richiesta.';
      } else {
        // APPROVED / COMPLETED / CANCELLED all went through an approval — assign a real per-year sequential number.
        const year = decidedAt.getUTCFullYear();
        const nextSeq = (yearSeq.get(year) ?? 0) + 1;
        yearSeq.set(year, nextSeq);
        pprNumber = `PPR-${year}-${String(nextSeq).padStart(4, '0')}`;
        if (status === 'COMPLETED' || status === 'CANCELLED') {
          closedAt = new Date(decidedAt.getTime() + randInt(1, 72) * 3_600_000);
          if (status === 'COMPLETED' && chance(0.7)) {
            landingFeeCents = choice([0, 1000, 1500, 2000, 2500, 3000]);
          }
        }
      }
    }

    const aircraft = choice(PPR_AIRCRAFT);
    pprRows.push({
      id: id(),
      status,
      firstName: choice(PPR_FIRST_NAMES),
      lastName: choice(PPR_LAST_NAMES),
      email: chance(0.9) ? `ppr.${String(i + 1).padStart(5, '0')}@example.test` : null,
      phone: `+49 17${randInt(0, 9)} ${randInt(1000000, 9999999)}`,
      aircraftRegistration: aircraft.reg,
      aircraftType: aircraft.type,
      origin: choice(PPR_ORIGINS),
      destination: AIRFIELD_DESTINATION,
      eta,
      etd: chance(0.7) ? new Date(eta.getTime() + randInt(2, 8) * 3_600_000) : null,
      personsOnBoard: randInt(1, 4),
      locale: chance(0.5) ? 'en' : 'it',
      pprNumber,
      rejectionReason,
      decidedAt,
      decidedByUserId: decidedAt ? ADMIN_USER_ID : null,
      closedAt,
      closedByUserId: closedAt ? ADMIN_USER_ID : null,
      landingFeeCents,
      createdAt,
    });
  }

  await batchInsert('PprRequest', (batch) => prisma.pprRequest.createMany({ data: batch }), pprRows);

  const pprCounterRows = Array.from(yearSeq.entries()).map(([year, lastSeq]) => ({ year, lastSeq }));
  if (pprCounterRows.length > 0) {
    await prisma.pprCounter.createMany({ data: pprCounterRows });
  }

  const pprLandingFeeCashRows = pprRows
    .filter((r) => r.landingFeeCents !== null && r.landingFeeCents > 0 && pprCashCategoryId)
    .map((r) => ({
      id: id(),
      categoryId: pprCashCategoryId!,
      amountCents: r.landingFeeCents!,
      paymentMethod: choice(paymentMethods),
      description: `Diritti di atterraggio ${r.pprNumber}`,
      effectiveDate: utcMidnight(r.closedAt!.getUTCFullYear(), r.closedAt!.getUTCMonth() + 1, r.closedAt!.getUTCDate()),
      actorUserId: ADMIN_USER_ID,
      pprRequestId: r.id,
    }));
  await batchInsert('CashMovement (PPR)', (batch) => prisma.cashMovement.createMany({ data: batch }), pprLandingFeeCashRows);

  console.log(`Phase 8 done: ${pprRows.length} PPR requests, ${pprCounterRows.length} year counters, ${pprLandingFeeCashRows.length} landing-fee cash movements.`);

  // ===========================================================================
  // PHASE 9 — Expiries + SentAlert
  // ===========================================================================
  console.log('\nPhase 9: expiries...');

  const expiryTypes = await prisma.expiryType.findMany({
    where: { name: { in: ['Visita medica classe 1', 'Visita medica classe 2', 'Visita medica LAPL', 'Licenza', 'Rating SEP', 'Inglese ICAO', 'Quota associativa'] } },
    select: { id: true, name: true },
  });
  const expiryTypeIdByName = new Map(expiryTypes.map((t) => [t.name, t.id]));
  function requireExpiryTypeId(name: string): string {
    const typeId = expiryTypeIdByName.get(name);
    if (!typeId) throw new Error(`seed-load: expiry type "${name}" missing — run the base seed first.`);
    return typeId;
  }

  /** valid (far future) / expiring soon / expired — see module doc. */
  function sampleExpiresAt(): Date {
    const roll = rng();
    if (roll < 0.6) return addDays(TODAY, randInt(90, 730)); // valid
    if (roll < 0.75) return addDays(TODAY, randInt(0, 60)); // expiring soon
    return addDays(TODAY, -randInt(1, 400)); // expired
  }

  const expiryRows: Array<{ id: string; personId: string; expiryTypeId: string; expiresAt: Date; actorUserId: string }> = [];
  // `@@unique([personId, expiryTypeId])` — a person in the pilot+instructor
  // overlap runs through BOTH the pilot and the instructor loop below, and
  // both attempt "Quota associativa"; this guard is what keeps that to one row.
  const addedExpiryKeys = new Set<string>();
  function maybeAddExpiry(personId: string, typeName: string, probability: number): void {
    const key = `${personId}:${typeName}`;
    if (addedExpiryKeys.has(key)) return;
    if (!chance(probability)) return;
    addedExpiryKeys.add(key);
    expiryRows.push({ id: id(), personId, expiryTypeId: requireExpiryTypeId(typeName), expiresAt: sampleExpiresAt(), actorUserId: ADMIN_USER_ID });
  }

  for (const p of pilotPersons) {
    maybeAddExpiry(p.id, 'Visita medica classe 2', 0.95);
    maybeAddExpiry(p.id, 'Licenza', 0.95);
    maybeAddExpiry(p.id, 'Rating SEP', 0.6);
    maybeAddExpiry(p.id, 'Inglese ICAO', 0.4);
    maybeAddExpiry(p.id, 'Quota associativa', 0.8);
  }
  for (const p of studentPersons) {
    maybeAddExpiry(p.id, 'Visita medica LAPL', 0.9);
    maybeAddExpiry(p.id, 'Quota associativa', 0.6);
  }
  for (const p of instructorPersons) {
    maybeAddExpiry(p.id, 'Visita medica classe 1', 0.95);
    maybeAddExpiry(p.id, 'Quota associativa', 0.8);
  }

  await batchInsert('Expiry', (batch) => prisma.expiry.createMany({ data: batch }), expiryRows);

  const EXPIRY_ALERT_THRESHOLDS = [60, 30, 7, 0];
  const sentAlertRows: Array<{ id: string; expiryId: string; threshold: number }> = [];
  for (const e of expiryRows) {
    const daysLeft = Math.round((e.expiresAt.getTime() - TODAY.getTime()) / DAY_MS);
    if (daysLeft > 60) continue; // nothing due yet.
    if (!chance(0.5)) continue; // sample down toward a plausible alert-history volume.
    for (const threshold of EXPIRY_ALERT_THRESHOLDS) {
      if (daysLeft <= threshold) sentAlertRows.push({ id: id(), expiryId: e.id, threshold });
    }
  }
  await batchInsert('SentAlert', (batch) => prisma.sentAlert.createMany({ data: batch }), sentAlertRows);

  console.log(`Phase 9 done: ${expiryRows.length} expiries, ${sentAlertRows.length} sent-alert rows.`);

  // ===========================================================================
  // PHASE 10 — Instructor payouts
  // ===========================================================================
  console.log('\nPhase 10: instructor payouts...');

  const compensiCategoryId = cashCategoryIdByName.get('Compensi istruttori');
  const schoolMinutesByInstructorProfile = new Map<string, number>();
  for (const f of allFlightRows) {
    if (f.flightType !== 'SCHOOL' || f.status === 'CANCELLED' || !f.instructorProfileId) continue;
    schoolMinutesByInstructorProfile.set(f.instructorProfileId, (schoolMinutesByInstructorProfile.get(f.instructorProfileId) ?? 0) + f.minutes);
  }

  const payoutRows: Array<{ id: string; instructorProfileId: string; amountCents: number; periodStart: Date; periodEnd: Date; method: PaymentMethod; actorUserId: string }> = [];
  const payoutCashRows: Array<{ id: string; categoryId: string; amountCents: number; paymentMethod: PaymentMethod; description: string; effectiveDate: Date; actorUserId: string; instructorPayoutId: string }> = [];

  for (const p of instructorPersons) {
    if (!p.instructorProfileId || p.payoutRateCents === null || p.payoutRateCents === undefined) continue;
    const totalMinutes = schoolMinutesByInstructorProfile.get(p.instructorProfileId) ?? 0;
    if (totalMinutes === 0) continue;
    const accrued = Math.round((totalMinutes / 60) * p.payoutRateCents);
    if (accrued <= 0) continue;

    const payoutCount = randInt(4, 10);
    const fractionToPay = randFloat(0.5, 0.9);
    const totalToPay = Math.floor(accrued * fractionToPay);
    if (totalToPay <= 0) continue;

    const perPayout = Math.floor(totalToPay / payoutCount);
    let remaining = totalToPay;
    for (let i = 0; i < payoutCount; i++) {
      const isLast = i === payoutCount - 1;
      const amount = isLast ? remaining : perPayout;
      remaining -= amount;
      if (amount <= 0) continue;

      const periodStart = addDays(HISTORY_START, Math.round((HISTORY_DAYS * i) / payoutCount));
      const periodEnd = addDays(HISTORY_START, Math.round((HISTORY_DAYS * (i + 1)) / payoutCount) - 1);
      const payoutId = id();
      const method = choice(paymentMethods);
      payoutRows.push({ id: payoutId, instructorProfileId: p.instructorProfileId, amountCents: amount, periodStart, periodEnd, method, actorUserId: ADMIN_USER_ID });
      if (compensiCategoryId) {
        payoutCashRows.push({
          id: id(),
          categoryId: compensiCategoryId,
          amountCents: -amount,
          paymentMethod: method,
          description: `Compenso istruttore ${toDateOnlyString(periodStart)} – ${toDateOnlyString(periodEnd)}`,
          effectiveDate: periodEnd,
          actorUserId: ADMIN_USER_ID,
          instructorPayoutId: payoutId,
        });
      }
    }
  }

  await batchInsert('InstructorPayout', (batch) => prisma.instructorPayout.createMany({ data: batch }), payoutRows);
  await batchInsert('CashMovement (Compensi istruttori)', (batch) => prisma.cashMovement.createMany({ data: batch }), payoutCashRows);

  console.log(`Phase 10 done: ${payoutRows.length} instructor payouts.`);

  // ===========================================================================
  // Summary
  // ===========================================================================
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const finalCounts = await prisma.$transaction([
    prisma.person.count(),
    prisma.user.count(),
    prisma.aircraft.count(),
    prisma.aircraftRate.count(),
    prisma.instructorRate.count(),
    prisma.flight.count(),
    prisma.booking.count(),
    prisma.accountMovement.count(),
    prisma.cashMovement.count(),
    prisma.pprRequest.count(),
    prisma.expiry.count(),
    prisma.sentAlert.count(),
    prisma.instructorPayout.count(),
    prisma.hourPackage.count(),
    prisma.packageConsumption.count(),
  ]);
  const [
    personCount, userCount, aircraftCount, aircraftRateCount, instructorRateCount, flightCount, bookingCount,
    accountMovementCount, cashMovementCount, pprCount, expiryCount, sentAlertCount, payoutCount, hourPackageCount, packageConsumptionCount,
  ] = finalCounts;

  console.log('\n=== seed-load summary ===');
  console.log(`Elapsed: ${elapsedSec}s`);
  console.log(`Person: ${personCount}`);
  console.log(`User: ${userCount}`);
  console.log(`Aircraft: ${aircraftCount}  AircraftRate: ${aircraftRateCount}  InstructorRate: ${instructorRateCount}`);
  console.log(`Flight: ${flightCount}`);
  console.log(`Booking: ${bookingCount}`);
  console.log(`AccountMovement: ${accountMovementCount}`);
  console.log(`CashMovement: ${cashMovementCount}`);
  console.log(`PprRequest: ${pprCount}`);
  console.log(`Expiry: ${expiryCount}  SentAlert: ${sentAlertCount}`);
  console.log(`InstructorPayout: ${payoutCount}`);
  console.log(`HourPackage: ${hourPackageCount}  PackageConsumption: ${packageConsumptionCount}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
