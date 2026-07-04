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

async function seedAdminUser(): Promise<void> {
  const adminPassword = process.env['SEED_ADMIN_PASSWORD'];
  if (!adminPassword) {
    throw new Error('Seed: SEED_ADMIN_PASSWORD must be set (see .env.example).');
  }

  const passwordHash = await hashPassword(adminPassword);

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

async function main() {
  await seedAdminUser();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
