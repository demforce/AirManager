// Prisma 7 configuration file — replaces the old datasource `url = env(...)`
// pattern in schema.prisma. See https://pris.ly/prisma-config-env-vars
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
