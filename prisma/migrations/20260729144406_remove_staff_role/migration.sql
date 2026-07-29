-- Story 14.9: remove STAFF from the Role enum. Postgres requires recreating
-- the type to drop a value. Ratifica R2 (piano epic 14): no defensive data
-- migration — the app has never been deployed, so dev/CI always rebuild the
-- DB from an empty state through this migration chain + a fresh seed.
-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'INSTRUCTOR', 'PILOT', 'STUDENT');
ALTER TABLE "User" ALTER COLUMN "roles" TYPE "Role_new"[] USING ("roles"::text::"Role_new"[]);
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;
