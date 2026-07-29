-- Story 14.9: remove STAFF from the Role enum. Postgres requires recreating
-- the type to drop a value. Ratifica R2 (piano epic 14): no defensive data
-- migration — the app has never been deployed, so dev/CI always rebuild the
-- DB from an empty state through this migration chain + a fresh seed.
--
-- WARNING (review 14.9, F1 + ratifica R-14.9-a): this migration ROLLS BACK
-- with "invalid input value for enum" on ANY database that still has a
-- User row with 'STAFF' in roles (every pre-14.9 dev DB, via the seeded
-- staff@airmanager.local) — the USING cast below cannot convert 'STAFF' to
-- Role_new. R2 forbids a defensive cleanup row here, so there is no
-- automatic fix in this file. Sanctioned remedy for any such DB (this
-- machine's dev DB, a teammate's, another checkout, the container
-- bootstrap in .claude/hooks/session-start.sh): wipe it and replay
-- migrations + seed from scratch (the new prisma/seed.ts no longer creates
-- staff@) — e.g. `docker compose down -v && docker compose up -d && npx
-- prisma migrate deploy && npx prisma db seed`, or `npx prisma migrate
-- reset`. Verified safe to add this comment after the fact: `prisma
-- migrate deploy`/`migrate status` (Prisma 7.8.0) do not checksum-validate
-- already-applied migrations — empirically confirmed on a throwaway DB,
-- comment-only edits produce "No pending migrations to apply" / "up to
-- date", not an error.
-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'INSTRUCTOR', 'PILOT', 'STUDENT');
ALTER TABLE "User" ALTER COLUMN "roles" TYPE "Role_new"[] USING ("roles"::text::"Role_new"[]);
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;
