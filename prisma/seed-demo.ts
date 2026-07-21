// Demo seed — realistic browsing data for a local/demo environment.
//
// Deliberately SEPARATE from `prisma/seed.ts` (the e2e fixture base wired to
// `prisma db seed`): this script populates a realistic aviosuperficie —
// 1 admin + 10 members (staff, 2 instructors, 6 pilots, 1 student), 3 aircraft
// with rate history, expiries, top-ups, ~24 registered flights, upcoming
// bookings in every workflow state, and PPR traffic.
//
// Domain data goes through the REAL services (registerFlight, recordTopUp,
// createBooking, ...) so every invariant holds (charges, hour meters, balances,
// PPR numbering); only catalogue/anagrafica rows are raw creates, mirroring
// `prisma/seed.ts`'s own idiom.
//
// Assumes a FRESHLY migrated, EMPTY domain DB (guard below) and the machine's
// local timezone being the airfield's (Europe/Rome). Run with:
//   set -a && . ./.env && set +a && npx tsx prisma/seed-demo.ts
// All users share the SEED_ADMIN_PASSWORD password (dev/demo-only, like seed.ts).
import { prisma } from '../src/server/db/prisma';
import { hashPassword } from '../src/server/auth/password';
import type { Actor } from '../src/server/auth/rbac';
import { recordTopUp } from '../src/server/services/accounts.service';
import { registerFlight } from '../src/server/services/flights.service';
import { createBooking, transitionBooking } from '../src/server/services/bookings.service';
import { createManualPprRequest, completePprRequest } from '../src/server/services/ppr.service';
import { setSchedulingSettings, setMetarStation, setMembershipFeeCents } from '../src/server/services/app-settings.service';
import type { Role, PaymentMethod, FlightType } from '../src/generated/prisma/client';

const AIRFIELD_NAME = 'Aviosuperficie Poggio al Vento';
const ADMIN_EMAIL = 'admin@airmanager.local';

// --- date helpers (relative to "now" so the seed always looks fresh) --------

function daysFromNow(days: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** `YYYY-MM-DD` for a date `days` from today (local calendar). */
function dateOnly(days: number): string {
  const d = daysFromNow(days, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- people -----------------------------------------------------------------

type DemoPerson = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  role: Role;
  pilot?: { licenseNumber: string; licenseType: string };
  instructor?: { ratings: string; payoutRateCents: number; rateCentsPerHour: number };
  student?: { courseStartDate: string };
};

const DEMO_PEOPLE: DemoPerson[] = [
  { firstName: 'Giulia', lastName: 'Ferraro', email: 'giulia.ferraro@libero.it', phone: '+39 338 214 7765', role: 'STAFF' },
  {
    firstName: 'Luca', lastName: 'Bianchi', email: 'luca.bianchi.fi@gmail.com', phone: '+39 347 660 1183',
    address: 'Via delle Colline 14, Pontedera (PI)', role: 'INSTRUCTOR',
    instructor: { ratings: 'SEP(land), FI(A)', payoutRateCents: 2500, rateCentsPerHour: 3000 },
  },
  {
    firstName: 'Paola', lastName: 'Rinaldi', email: 'paola.rinaldi@outlook.it', phone: '+39 349 502 9917', role: 'INSTRUCTOR',
    instructor: { ratings: 'SEP(land), FI(A), CRI(A)', payoutRateCents: 2600, rateCentsPerHour: 3200 },
  },
  {
    firstName: 'Marco', lastName: 'De Santis', email: 'marco.desantis@gmail.com', phone: '+39 333 481 2209',
    address: 'Via Roma 82, Cascina (PI)', role: 'PILOT', pilot: { licenseNumber: 'IT-PPL-104211', licenseType: 'PPL(A)' },
  },
  {
    firstName: 'Alessandro', lastName: 'Greco', email: 'ale.greco77@gmail.com', phone: '+39 340 118 6634', role: 'PILOT',
    pilot: { licenseNumber: 'IT-PPL-098754', licenseType: 'PPL(A)' },
  },
  {
    firstName: 'Francesca', lastName: 'Romano', email: 'francesca.romano@tiscali.it', phone: '+39 366 774 2098',
    address: 'Borgo Stretto 4, Pisa', role: 'PILOT', pilot: { licenseNumber: 'IT-PPL-112430', licenseType: 'PPL(A)' },
  },
  {
    firstName: 'Stefano', lastName: 'Colombo', email: 'stefano.colombo61@libero.it', phone: '+39 335 902 4471', role: 'PILOT',
    pilot: { licenseNumber: 'IT-LAPL-021977', licenseType: 'LAPL(A)' },
  },
  {
    firstName: 'Davide', lastName: 'Marchetti', email: 'davide.marchetti@gmail.com', phone: '+39 331 640 5583', role: 'PILOT',
    pilot: { licenseNumber: 'IT-PPL-107785', licenseType: 'PPL(A)' },
  },
  {
    firstName: 'Chiara', lastName: 'Esposito', email: 'chiara.esposito88@gmail.com', phone: '+39 342 227 8140',
    address: 'Via dei Mille 27, Livorno', role: 'PILOT', pilot: { licenseNumber: 'IT-PPL-115602', licenseType: 'PPL(A)' },
  },
  {
    firstName: 'Matteo', lastName: 'Fontana', email: 'matteo.fontana01@gmail.com', phone: '+39 351 883 0246', role: 'STUDENT',
    student: { courseStartDate: '2026-02-10' },
  },
];

// --- catalogue (kept aligned with `prisma/seed.ts`, the canonical list) -----

const CASH_CATEGORY_NAMES = ['Ricariche', 'PPR', 'Carburante', 'Assicurazione', 'Manutenzione', 'Utenze', 'Altro'];

const STANDARD_EXPIRY_TYPES: Array<{ name: string; scope: 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' | 'ALL'; blocksBooking: boolean; validityMonths?: number }> = [
  { name: 'Visita medica classe 1', scope: 'INSTRUCTORS', blocksBooking: true },
  { name: 'Visita medica classe 2', scope: 'PILOTS', blocksBooking: true },
  { name: 'Visita medica LAPL', scope: 'STUDENTS', blocksBooking: true },
  { name: 'Licenza', scope: 'PILOTS', blocksBooking: true },
  { name: 'Rating SEP', scope: 'PILOTS', blocksBooking: false },
  { name: 'Inglese ICAO', scope: 'PILOTS', blocksBooking: false },
  { name: 'Quota associativa', scope: 'ALL', blocksBooking: false, validityMonths: 12 },
];

// --- fleet ------------------------------------------------------------------

const AIRCRAFT = [
  {
    registration: 'I-B412', type: 'Ultraleggero 3 assi', model: 'Tecnam P92 Echo Super',
    hourMeterMinutes: 1847 * 60 + 30, seats: 2, fuelType: 'Mogas', owner: 'CLUB' as const,
    notes: 'Revisione 100h eseguita a giugno; prossima prevista a 1900h.',
    rates: [{ validFrom: '2025-06-01', priceCentsPerHour: 12500 }, { validFrom: '2026-01-01', priceCentsPerHour: 13200, dryHourlyRateCents: 10500 }],
  },
  {
    registration: 'I-A661', type: 'Ultraleggero 3 assi', model: 'Tecnam P2002 Sierra',
    hourMeterMinutes: 932 * 60 + 10, seats: 2, fuelType: 'Mogas', owner: 'CLUB' as const,
    notes: 'Radio nuova (COMM2) installata a maggio.',
    rates: [{ validFrom: '2025-06-01', priceCentsPerHour: 13000 }, { validFrom: '2026-01-01', priceCentsPerHour: 13800, dryHourlyRateCents: 11000 }],
  },
  {
    registration: 'I-PDVB', type: 'Aereo certificato', model: 'Piper PA-28-161 Warrior II',
    hourMeterMinutes: 4210 * 60 + 45, seats: 4, fuelType: 'AVGAS 100LL', owner: 'PRIVATE' as const,
    notes: 'Di proprietà di un socio, in gestione al club con accordo di esercenza.',
    rates: [{ validFrom: '2025-06-01', priceCentsPerHour: 17900 }, { validFrom: '2026-01-01', priceCentsPerHour: 18900, dryHourlyRateCents: 15200 }],
  },
];

// --- movement plans ---------------------------------------------------------

const LOCAL = AIRFIELD_NAME;
const DESTINATIONS = {
  LIQL: 'Lucca-Tassignano (LIQL)',
  LILQ: 'Massa-Cinquale (LILQ)',
  LIQS: 'Siena-Ampugnano (LIQS)',
  LIDP: 'Pavullo nel Frignano (LIDP)',
  LIDR: 'Ravenna (LIDR)',
};

type TopUpPlan = { email: string; daysAgo: number; amountCents: number; method: PaymentMethod };

const TOP_UPS: TopUpPlan[] = [
  { email: 'marco.desantis@gmail.com', daysAgo: 68, amountCents: 30000, method: 'BANK_TRANSFER' },
  { email: 'marco.desantis@gmail.com', daysAgo: 35, amountCents: 30000, method: 'BANK_TRANSFER' },
  { email: 'marco.desantis@gmail.com', daysAgo: 10, amountCents: 40000, method: 'POS' },
  { email: 'ale.greco77@gmail.com', daysAgo: 60, amountCents: 50000, method: 'BANK_TRANSFER' },
  { email: 'ale.greco77@gmail.com', daysAgo: 15, amountCents: 40000, method: 'CASH' },
  { email: 'francesca.romano@tiscali.it', daysAgo: 52, amountCents: 35000, method: 'POS' },
  { email: 'francesca.romano@tiscali.it', daysAgo: 20, amountCents: 30000, method: 'BANK_TRANSFER' },
  { email: 'stefano.colombo61@libero.it', daysAgo: 74, amountCents: 20000, method: 'CASH' },
  { email: 'stefano.colombo61@libero.it', daysAgo: 30, amountCents: 20000, method: 'CASH' },
  { email: 'davide.marchetti@gmail.com', daysAgo: 40, amountCents: 50000, method: 'BANK_TRANSFER' },
  { email: 'chiara.esposito88@gmail.com', daysAgo: 55, amountCents: 30000, method: 'POS' },
  { email: 'chiara.esposito88@gmail.com', daysAgo: 12, amountCents: 30000, method: 'BANK_TRANSFER' },
  { email: 'matteo.fontana01@gmail.com', daysAgo: 32, amountCents: 30000, method: 'BANK_TRANSFER' },
];

type FlightPlan = {
  email: string;
  reg: string;
  daysAgo: number;
  takeoffHour: number;
  durationMin: number;
  destination?: string; // round-trip leg shown as local -> destination
  instructorEmail?: string;
  flightType?: FlightType;
  touchAndGo?: number; // takeoffs/landings count
};

// Chronological (oldest first) so hour meters and balances evolve sensibly.
const FLIGHTS: FlightPlan[] = [
  { email: 'stefano.colombo61@libero.it', reg: 'I-A661', daysAgo: 70, takeoffHour: 10, durationMin: 50 },
  { email: 'marco.desantis@gmail.com', reg: 'I-B412', daysAgo: 62, takeoffHour: 9, durationMin: 55, touchAndGo: 4 },
  { email: 'ale.greco77@gmail.com', reg: 'I-PDVB', daysAgo: 55, takeoffHour: 14, durationMin: 110, destination: DESTINATIONS.LIDR },
  { email: 'chiara.esposito88@gmail.com', reg: 'I-A661', daysAgo: 51, takeoffHour: 16, durationMin: 45 },
  { email: 'francesca.romano@tiscali.it', reg: 'I-B412', daysAgo: 48, takeoffHour: 10, durationMin: 75 },
  { email: 'stefano.colombo61@libero.it', reg: 'I-B412', daysAgo: 44, takeoffHour: 15, durationMin: 65 },
  { email: 'marco.desantis@gmail.com', reg: 'I-B412', daysAgo: 41, takeoffHour: 9, durationMin: 80, destination: DESTINATIONS.LIQL },
  { email: 'davide.marchetti@gmail.com', reg: 'I-PDVB', daysAgo: 38, takeoffHour: 11, durationMin: 85, destination: DESTINATIONS.LIQL },
  { email: 'ale.greco77@gmail.com', reg: 'I-A661', daysAgo: 33, takeoffHour: 17, durationMin: 60 },
  { email: 'matteo.fontana01@gmail.com', reg: 'I-B412', daysAgo: 30, takeoffHour: 9, durationMin: 40, instructorEmail: 'luca.bianchi.fi@gmail.com', touchAndGo: 5 },
  { email: 'francesca.romano@tiscali.it', reg: 'I-B412', daysAgo: 27, takeoffHour: 10, durationMin: 90, destination: DESTINATIONS.LIDP },
  { email: 'chiara.esposito88@gmail.com', reg: 'I-B412', daysAgo: 24, takeoffHour: 15, durationMin: 60, instructorEmail: 'luca.bianchi.fi@gmail.com' },
  { email: 'marco.desantis@gmail.com', reg: 'I-A661', daysAgo: 20, takeoffHour: 18, durationMin: 65 },
  { email: 'stefano.colombo61@libero.it', reg: 'I-A661', daysAgo: 18, takeoffHour: 10, durationMin: 40 },
  { email: 'davide.marchetti@gmail.com', reg: 'I-B412', daysAgo: 16, takeoffHour: 16, durationMin: 70 },
  { email: 'francesca.romano@tiscali.it', reg: 'I-A661', daysAgo: 13, takeoffHour: 9, durationMin: 55 },
  { email: 'ale.greco77@gmail.com', reg: 'I-A661', daysAgo: 12, takeoffHour: 14, durationMin: 70, destination: DESTINATIONS.LILQ },
  { email: 'matteo.fontana01@gmail.com', reg: 'I-B412', daysAgo: 10, takeoffHour: 9, durationMin: 45, instructorEmail: 'paola.rinaldi@outlook.it', touchAndGo: 6 },
  { email: 'marco.desantis@gmail.com', reg: 'I-B412', daysAgo: 9, takeoffHour: 11, durationMin: 50 },
  { email: 'chiara.esposito88@gmail.com', reg: 'I-A661', daysAgo: 8, takeoffHour: 10, durationMin: 85, destination: DESTINATIONS.LIQS },
  { email: 'francesca.romano@tiscali.it', reg: 'I-B412', daysAgo: 6, takeoffHour: 17, durationMin: 60 },
  { email: 'ale.greco77@gmail.com', reg: 'I-B412', daysAgo: 5, takeoffHour: 9, durationMin: 45, instructorEmail: 'luca.bianchi.fi@gmail.com' },
  { email: 'davide.marchetti@gmail.com', reg: 'I-A661', daysAgo: 4, takeoffHour: 15, durationMin: 75, destination: DESTINATIONS.LILQ },
  { email: 'marco.desantis@gmail.com', reg: 'I-PDVB', daysAgo: 2, takeoffHour: 10, durationMin: 95, destination: DESTINATIONS.LIQS },
];

// expiresAt as day-offsets from today where the tier matters (negative = expired).
type ExpiryPlan = { email: string; type: string; issuedAt: string; expiresAt: string };

const EXPIRIES: ExpiryPlan[] = [
  { email: 'marco.desantis@gmail.com', type: 'Visita medica classe 2', issuedAt: '2025-03-14', expiresAt: '2027-03-14' },
  { email: 'ale.greco77@gmail.com', type: 'Visita medica classe 2', issuedAt: '2024-11-30', expiresAt: '2026-11-30' },
  { email: 'francesca.romano@tiscali.it', type: 'Visita medica classe 2', issuedAt: '2025-01-22', expiresAt: '2027-01-22' },
  { email: 'stefano.colombo61@libero.it', type: 'Visita medica classe 2', issuedAt: '2024-07-11', expiresAt: dateOnly(-10) },
  { email: 'davide.marchetti@gmail.com', type: 'Visita medica classe 2', issuedAt: '2024-10-05', expiresAt: '2026-10-05' },
  { email: 'chiara.esposito88@gmail.com', type: 'Visita medica classe 2', issuedAt: '2024-08-02', expiresAt: dateOnly(12) },
  { email: 'luca.bianchi.fi@gmail.com', type: 'Visita medica classe 1', issuedAt: '2026-02-10', expiresAt: '2027-02-10' },
  { email: 'paola.rinaldi@outlook.it', type: 'Visita medica classe 1', issuedAt: '2025-09-18', expiresAt: '2026-09-18' },
  { email: 'matteo.fontana01@gmail.com', type: 'Visita medica LAPL', issuedAt: '2024-12-15', expiresAt: '2026-12-15' },
  { email: 'marco.desantis@gmail.com', type: 'Licenza', issuedAt: '2021-05-20', expiresAt: '2027-05-20' },
  { email: 'ale.greco77@gmail.com', type: 'Licenza', issuedAt: '2019-09-12', expiresAt: '2027-09-12' },
  { email: 'francesca.romano@tiscali.it', type: 'Licenza', issuedAt: '2022-04-08', expiresAt: '2028-04-08' },
  { email: 'stefano.colombo61@libero.it', type: 'Licenza', issuedAt: '2020-06-30', expiresAt: '2026-12-30' },
  { email: 'davide.marchetti@gmail.com', type: 'Licenza', issuedAt: '2021-10-17', expiresAt: '2027-10-17' },
  { email: 'chiara.esposito88@gmail.com', type: 'Licenza', issuedAt: '2023-03-25', expiresAt: '2029-03-25' },
  { email: 'marco.desantis@gmail.com', type: 'Rating SEP', issuedAt: '2025-05-31', expiresAt: '2027-05-31' },
  { email: 'ale.greco77@gmail.com', type: 'Rating SEP', issuedAt: '2024-09-30', expiresAt: '2026-09-30' },
  { email: 'francesca.romano@tiscali.it', type: 'Rating SEP', issuedAt: '2026-02-28', expiresAt: '2028-02-28' },
  { email: 'davide.marchetti@gmail.com', type: 'Rating SEP', issuedAt: '2024-08-31', expiresAt: '2026-08-31' },
  { email: 'chiara.esposito88@gmail.com', type: 'Rating SEP', issuedAt: '2025-11-30', expiresAt: '2027-11-30' },
  { email: 'marco.desantis@gmail.com', type: 'Inglese ICAO', issuedAt: '2022-06-30', expiresAt: '2028-06-30' },
  { email: 'francesca.romano@tiscali.it', type: 'Inglese ICAO', issuedAt: '2020-10-31', expiresAt: '2026-10-31' },
  { email: 'marco.desantis@gmail.com', type: 'Quota associativa', issuedAt: dateOnly(-340), expiresAt: dateOnly(25) },
  { email: 'ale.greco77@gmail.com', type: 'Quota associativa', issuedAt: '2026-01-31', expiresAt: '2027-01-31' },
  { email: 'francesca.romano@tiscali.it', type: 'Quota associativa', issuedAt: '2026-01-31', expiresAt: '2027-01-31' },
  { email: 'davide.marchetti@gmail.com', type: 'Quota associativa', issuedAt: '2026-02-28', expiresAt: '2027-02-28' },
  { email: 'chiara.esposito88@gmail.com', type: 'Quota associativa', issuedAt: '2026-01-31', expiresAt: '2027-01-31' },
  { email: 'luca.bianchi.fi@gmail.com', type: 'Quota associativa', issuedAt: '2026-01-31', expiresAt: '2027-01-31' },
  { email: 'matteo.fontana01@gmail.com', type: 'Quota associativa', issuedAt: '2026-03-31', expiresAt: '2027-03-31' },
];

// --- main -------------------------------------------------------------------

async function main(): Promise<void> {
  const seedPassword = process.env['SEED_ADMIN_PASSWORD'];
  if (!seedPassword) {
    throw new Error('Seed: SEED_ADMIN_PASSWORD must be set (see .env.example).');
  }

  // Guard: services are not idempotent (each run would duplicate flights,
  // movements, bookings) — this seed only runs against a fresh, empty DB.
  const flightCount = await prisma.flight.count();
  if (flightCount > 0) {
    throw new Error('Demo seed: DB already has flights — run it only on a freshly migrated, empty DB.');
  }

  const passwordHash = await hashPassword(seedPassword);

  // Admin (same login convention as prisma/seed.ts).
  const adminUser = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash, isActive: true, roles: ['ADMIN'] },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      isActive: true,
      roles: ['ADMIN'],
      person: { create: { firstName: 'Enrico', lastName: 'Masala', email: ADMIN_EMAIL, phone: '+39 335 700 1122' } },
    },
    select: { id: true, personId: true },
  });
  const admin: Actor = { userId: adminUser.id, personId: adminUser.personId, roles: ['ADMIN'] };
  console.log(`Seed: admin ready (${ADMIN_EMAIL}).`);

  // Catalogue.
  for (const name of CASH_CATEGORY_NAMES) {
    await prisma.cashCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
  const expiryTypeIdByName = new Map<string, string>();
  for (const { name, scope, blocksBooking, validityMonths } of STANDARD_EXPIRY_TYPES) {
    const type = await prisma.expiryType.upsert({
      where: { name },
      update: {},
      create: { name, scope, blocksBooking, validityMonths: validityMonths ?? null },
      select: { id: true },
    });
    expiryTypeIdByName.set(name, type.id);
  }
  console.log('Seed: catalogue ready (cash categories, expiry types).');

  // Settings — realistic Impostazioni card values.
  await prisma.appSetting.upsert({
    where: { key: 'airfield.name' },
    update: { value: AIRFIELD_NAME },
    create: { key: 'airfield.name', value: AIRFIELD_NAME },
  });
  await setSchedulingSettings(admin, { openTime: '08:00', closeTime: '20:00', minSlotMinutes: 30, turnaroundMinutes: 15, maxAdvanceDays: 30 });
  await setMetarStation(admin, 'LIRQ');
  await setMembershipFeeCents(admin, 28000);
  console.log('Seed: settings ready (airfield name, scheduling window, METAR, membership fee).');

  // People, users, profiles, accounts.
  const personIdByEmail = new Map<string, string>();
  const userIdByEmail = new Map<string, string>();
  const instructorProfileIdByEmail = new Map<string, string>();
  for (const p of DEMO_PEOPLE) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: { passwordHash, isActive: true, roles: [p.role] },
      create: {
        email: p.email,
        passwordHash,
        isActive: true,
        roles: [p.role],
        person: {
          create: {
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            phone: p.phone ?? null,
            address: p.address ?? null,
          },
        },
      },
      select: { id: true, personId: true },
    });
    const personId = user.personId!;
    personIdByEmail.set(p.email, personId);
    userIdByEmail.set(p.email, user.id);

    if (p.pilot) {
      await prisma.pilotProfile.upsert({
        where: { personId },
        update: { ...p.pilot, deactivatedAt: null },
        create: { personId, ...p.pilot },
      });
      await prisma.account.upsert({ where: { personId }, update: {}, create: { personId } });
    }
    if (p.student) {
      await prisma.studentProfile.upsert({
        where: { personId },
        update: { deactivatedAt: null },
        create: { personId, courseStartDate: new Date(p.student.courseStartDate) },
      });
      await prisma.account.upsert({ where: { personId }, update: {}, create: { personId } });
    }
    if (p.instructor) {
      const profile = await prisma.instructorProfile.upsert({
        where: { personId },
        update: { ratings: p.instructor.ratings, payoutRateCents: p.instructor.payoutRateCents, deactivatedAt: null },
        create: { personId, ratings: p.instructor.ratings, payoutRateCents: p.instructor.payoutRateCents },
        select: { id: true },
      });
      instructorProfileIdByEmail.set(p.email, profile.id);
      await prisma.instructorRate.create({
        data: {
          instructorProfileId: profile.id,
          priceCentsPerHour: p.instructor.rateCentsPerHour,
          validFrom: new Date('2026-01-01'),
          actorUserId: admin.userId,
        },
      });
    }
  }
  console.log(`Seed: ${DEMO_PEOPLE.length} members ready (users, profiles, accounts).`);

  // Fleet + rate history.
  const aircraftIdByReg = new Map<string, string>();
  for (const a of AIRCRAFT) {
    const { rates, ...data } = a;
    const created = await prisma.aircraft.upsert({
      where: { registration: a.registration },
      update: {},
      create: data,
      select: { id: true },
    });
    aircraftIdByReg.set(a.registration, created.id);
    for (const rate of rates) {
      await prisma.aircraftRate.create({
        data: {
          aircraftId: created.id,
          priceCentsPerHour: rate.priceCentsPerHour,
          dryHourlyRateCents: 'dryHourlyRateCents' in rate ? rate.dryHourlyRateCents : null,
          validFrom: new Date(rate.validFrom),
          actorUserId: admin.userId,
        },
      });
    }
  }
  console.log(`Seed: ${AIRCRAFT.length} aircraft ready (with rate history).`);

  // Expiries.
  for (const e of EXPIRIES) {
    await prisma.expiry.create({
      data: {
        personId: personIdByEmail.get(e.email)!,
        expiryTypeId: expiryTypeIdByName.get(e.type)!,
        issuedAt: new Date(e.issuedAt),
        expiresAt: new Date(e.expiresAt),
        actorUserId: admin.userId,
      },
    });
  }
  console.log(`Seed: ${EXPIRIES.length} expiries ready.`);

  // Top-ups (through the service: creates the account movement + cash twin).
  for (const t of TOP_UPS) {
    await recordTopUp(admin, personIdByEmail.get(t.email)!, {
      amountCents: t.amountCents,
      paymentMethod: t.method,
      effectiveDate: dateOnly(-t.daysAgo),
      description: null,
    });
  }
  console.log(`Seed: ${TOP_UPS.length} top-ups recorded.`);

  // Flights (through the service: charges, hour meters, balances all real).
  for (const f of FLIGHTS) {
    const takeoffAt = daysFromNow(-f.daysAgo, f.takeoffHour);
    const landingAt = new Date(takeoffAt.getTime() + f.durationMin * 60_000);
    await registerFlight(admin, {
      aircraftId: aircraftIdByReg.get(f.reg)!,
      personId: personIdByEmail.get(f.email)!,
      instructorPersonId: f.instructorEmail ? personIdByEmail.get(f.instructorEmail)! : null,
      departureAirfield: LOCAL,
      arrivalAirfield: f.destination ?? LOCAL,
      takeoffAt: takeoffAt.toISOString(),
      landingAt: landingAt.toISOString(),
      flightType: f.flightType ?? 'TOURISM',
      isSolo: false,
      takeoffs: f.touchAndGo ?? 1,
      landings: f.touchAndGo ?? 1,
      notes: f.destination ? 'Andata e ritorno in giornata.' : null,
    });
  }
  console.log(`Seed: ${FLIGHTS.length} flights registered.`);

  // Upcoming bookings — every workflow state represented. Staff-created
  // bookings are born APPROVED (story 12.2); a pilot's own request is born
  // PENDING, which is what the pending/denied rows need.
  function pilotActor(email: string): Actor {
    return { userId: userIdByEmail.get(email)!, personId: personIdByEmail.get(email)!, roles: ['PILOT'] };
  }

  async function book(actor: Actor, email: string, reg: string, days: number, fromH: number, fromM: number, toH: number, toM: number): Promise<string> {
    const result = await createBooking(actor, {
      aircraftId: aircraftIdByReg.get(reg)!,
      personId: personIdByEmail.get(email)!,
      startsAt: daysFromNow(days, fromH, fromM).toISOString(),
      endsAt: daysFromNow(days, toH, toM).toISOString(),
    });
    return result.booking.id;
  }

  await book(admin, 'marco.desantis@gmail.com', 'I-B412', 1, 9, 0, 10, 30);
  await book(admin, 'francesca.romano@tiscali.it', 'I-A661', 1, 15, 0, 16, 0);
  await book(admin, 'ale.greco77@gmail.com', 'I-PDVB', 3, 10, 0, 12, 0);
  await book(pilotActor('chiara.esposito88@gmail.com'), 'chiara.esposito88@gmail.com', 'I-B412', 5, 14, 0, 15, 30); // stays PENDING
  await book(pilotActor('davide.marchetti@gmail.com'), 'davide.marchetti@gmail.com', 'I-A661', 6, 9, 30, 11, 0); // stays PENDING
  const denied = await book(pilotActor('davide.marchetti@gmail.com'), 'davide.marchetti@gmail.com', 'I-B412', 4, 16, 0, 17, 30);
  await transitionBooking(admin, denied, { to: 'DENIED', reason: 'Manutenzione programmata: sostituzione elica, velivolo fermo tutto il giorno.' });
  console.log('Seed: 6 bookings ready (3 approved, 2 pending, 1 denied).');

  // PPR traffic — one completed (with landing fee), one approved, one pending.
  const completedPpr = await createManualPprRequest(admin, {
    firstName: 'Andreas', lastName: 'Keller', email: 'a.keller@web.de', phone: '+49 171 5502211',
    aircraftRegistration: 'D-EKPT', aircraftType: 'Cessna 172S', origin: 'Bolzano (LIPB)', destination: AIRFIELD_NAME,
    eta: daysFromNow(-1, 11, 20).toISOString(), etd: daysFromNow(-1, 16, 0).toISOString(),
    personsOnBoard: 2, notes: 'Sosta pranzo e rifornimento.', locale: 'en', approveImmediately: true,
  }, { approveImmediately: true });
  await completePprRequest(admin, completedPpr.id, { landingFeeCents: 2500 });
  await createManualPprRequest(admin, {
    firstName: 'Jean', lastName: 'Moreau', email: 'j.moreau@orange.fr', phone: '+33 6 44 71 08 92',
    aircraftRegistration: 'F-HBGA', aircraftType: 'Robin DR401', origin: 'Cannes (LFMD)', destination: AIRFIELD_NAME,
    eta: daysFromNow(1, 10, 30).toISOString(), etd: daysFromNow(1, 17, 30).toISOString(),
    personsOnBoard: 3, locale: 'en', approveImmediately: true,
  }, { approveImmediately: true });
  await createManualPprRequest(admin, {
    firstName: 'Martin', lastName: 'Novak', email: 'm.novak@seznam.cz', phone: '+420 736 220 418',
    aircraftRegistration: 'OK-VPR', aircraftType: 'Cirrus SR20', origin: 'Praga-Letnany (LKLT)', destination: AIRFIELD_NAME,
    eta: daysFromNow(3, 9, 45).toISOString(),
    personsOnBoard: 2, notes: 'Tappa di un giro turistico in Italia, chiede parcheggio per due notti.', locale: 'en', approveImmediately: false,
  });
  console.log('Seed: 3 PPR requests ready (1 completed with landing fee, 1 approved, 1 pending).');

  console.log('\nDemo seed complete. Login: admin@airmanager.local (password: SEED_ADMIN_PASSWORD from .env).');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
