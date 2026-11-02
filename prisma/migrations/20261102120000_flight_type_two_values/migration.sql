-- Story 19.5 (CR PO 2026-11-01, punto 10 + §4.2): FlightType keeps only TOURISM and SCHOOL.
-- AERIAL_WORK carried no rule (charges, payouts and checks never read it): its flights become TOURISM.
-- Postgres cannot drop an enum value, so the type is recreated (same shape as
-- 20260729144406_remove_staff_role); the UPDATE must run BEFORE the cast, or the
-- cast fails with "invalid input value for enum" on any populated database.
-- isSolo is untouched: an AERIAL_WORK flight could never be solo (SOLO_REQUIRES_SCHOOL).
BEGIN;
UPDATE "Flight" SET "flightType" = 'TOURISM' WHERE "flightType" = 'AERIAL_WORK';
CREATE TYPE "FlightType_new" AS ENUM ('TOURISM', 'SCHOOL');
ALTER TABLE "Flight" ALTER COLUMN "flightType" TYPE "FlightType_new" USING ("flightType"::text::"FlightType_new");
ALTER TYPE "FlightType" RENAME TO "FlightType_old";
ALTER TYPE "FlightType_new" RENAME TO "FlightType";
DROP TYPE "public"."FlightType_old";
COMMIT;
