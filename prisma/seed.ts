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

async function main() {
  const seedPassword = process.env['SEED_ADMIN_PASSWORD'];
  if (!seedPassword) {
    throw new Error('Seed: SEED_ADMIN_PASSWORD must be set (see .env.example).');
  }

  const passwordHash = await hashPassword(seedPassword);

  await seedAdminUser(passwordHash);
  await seedPilotUser(passwordHash);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
