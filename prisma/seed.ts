// Prisma seed script — stub for story 1.1.
// Demo data (people, aircraft, rates, expiry types, ...) lands in later stories
// once the corresponding domain models exist.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg(process.env['DATABASE_URL'] ?? '');
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seed: nothing to do yet (story 1.1 scaffold).');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
