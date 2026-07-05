// Prisma seed script.
// Demo data (aircraft, rates, expiry types, ...) lands in later stories once
// the corresponding domain models exist. Story 1.2 adds the demo admin user
// needed to exercise login end-to-end.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';

const adapter = new PrismaPg(process.env['DATABASE_URL'] ?? '');
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = 'admin@airmanager.local';
const PILOT_EMAIL = 'pilot@airmanager.local';

async function seedAdminUser(passwordHash: string): Promise<void> {
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash, isActive: true, roles: ['ADMIN'] },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      isActive: true,
      roles: ['ADMIN'],
      person: {
        create: {
          firstName: 'Admin',
          lastName: 'AirManager',
          email: ADMIN_EMAIL,
        },
      },
    },
  });

  console.log(`Seed: demo admin user ready (${ADMIN_EMAIL}).`);
}

/**
 * Story 1.3: a PILOT test user, needed to exercise the RBAC permission
 * matrix and the e2e "dashboard shows different nav for admin vs pilot"
 * scenario. Same password as the admin (`SEED_ADMIN_PASSWORD`) for
 * simplicity — this is dev/test-only seed data.
 */
async function seedPilotUser(passwordHash: string): Promise<void> {
  await prisma.user.upsert({
    where: { email: PILOT_EMAIL },
    update: { passwordHash, isActive: true, roles: ['PILOT'] },
    create: {
      email: PILOT_EMAIL,
      passwordHash,
      isActive: true,
      roles: ['PILOT'],
      person: {
        create: {
          firstName: 'Piero',
          lastName: 'Volante',
          email: PILOT_EMAIL,
        },
      },
    },
  });

  console.log(`Seed: demo pilot user ready (${PILOT_EMAIL}).`);
}

/**
 * Story 2.2: the demo pilot's `Person` gets an active `PilotProfile`
 * (AD-11: 1-to-0/1 with `Person`), so the profiles UI/e2e have real data.
 * Idempotent like the rest of the seed: upsert keyed on the unique
 * `personId`, reactivated (`deactivatedAt: null`) if a test left it
 * deactivated.
 */
async function seedPilotProfile(): Promise<void> {
  const pilotUser = await prisma.user.findUnique({
    where: { email: PILOT_EMAIL },
    select: { personId: true },
  });
  if (!pilotUser?.personId) {
    console.warn(`Seed: no person linked to ${PILOT_EMAIL}, skipping pilot profile.`);
    return;
  }

  await prisma.pilotProfile.upsert({
    where: { personId: pilotUser.personId },
    update: { licenseNumber: 'IT-PPL-100200', licenseType: 'PPL(A)', deactivatedAt: null },
    create: { personId: pilotUser.personId, licenseNumber: 'IT-PPL-100200', licenseType: 'PPL(A)' },
  });

  console.log(`Seed: pilot profile ready for ${PILOT_EMAIL}.`);
}

/**
 * Story 2.4: a demo aircraft so the fleet CRUD UI/e2e have real data.
 * Idempotent like the rest of the seed — upsert keyed on the unique
 * `registration`. `hourMeterMinutes` is an integer (AD-2), never a decimal
 * hours value.
 */
async function seedAircraft(): Promise<void> {
  await prisma.aircraft.upsert({
    where: { registration: 'I-ABCD' },
    update: {},
    create: {
      registration: 'I-ABCD',
      type: 'Ultraleggero 3 assi',
      model: 'Tecnam P92 Eaglet',
      hourMeterMinutes: 12 * 60 + 30,
      notes: 'Velivolo scuola volo demo.',
    },
  });

  console.log('Seed: demo aircraft ready (I-ABCD).');
}

async function main() {
  const seedPassword = process.env['SEED_ADMIN_PASSWORD'];
  if (!seedPassword) {
    throw new Error('Seed: SEED_ADMIN_PASSWORD must be set (see .env.example).');
  }

  const passwordHash = await hashPassword(seedPassword);

  await seedAdminUser(passwordHash);
  await seedPilotUser(passwordHash);
  await seedPilotProfile();
  await seedAircraft();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
