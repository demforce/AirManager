-- Story 19.3 (R-19-e, A6, D-4, D-5, Q-19.3-c): the aircraft rate gets two
-- billed prices (student, pilot) in place of the billed "wet" one and the
-- display-only "dry" one; the student profile becomes exclusive with the
-- pilot AND the instructor profile; every flight records which of the two
-- prices it was charged. Hand-written (TD-2 pattern): `migrate dev` would
-- DROP+ADD the price column and lose the history.

-- 1. AircraftRate (A6): the wet price becomes both prices, the dry one is dropped.
ALTER TABLE "AircraftRate" RENAME COLUMN "priceCentsPerHour" TO "pilotPriceCents";
ALTER TABLE "AircraftRate" ADD COLUMN "studentPriceCents" INTEGER;
UPDATE "AircraftRate" SET "studentPriceCents" = "pilotPriceCents";
ALTER TABLE "AircraftRate" ALTER COLUMN "studentPriceCents" SET NOT NULL, DROP COLUMN "dryHourlyRateCents";

-- 2. Exclusive profiles (D-4, Q-19.3-c): a person with an active student
-- profile AND an active pilot or instructor profile loses the student one —
-- BEFORE the flight backfill below reads the profiles.
UPDATE "StudentProfile" s SET "deactivatedAt" = now()
 WHERE s."deactivatedAt" IS NULL
   AND (EXISTS (SELECT 1 FROM "PilotProfile" p WHERE p."personId" = s."personId" AND p."deactivatedAt" IS NULL)
     OR EXISTS (SELECT 1 FROM "InstructorProfile" i WHERE i."personId" = s."personId" AND i."deactivatedAt" IS NULL));

-- 3. Flight price category (D-5): student-only today → STUDENT, otherwise PILOT.
CREATE TYPE "AircraftPriceCategory" AS ENUM ('STUDENT', 'PILOT');
ALTER TABLE "Flight" ADD COLUMN "aircraftPriceCategory" "AircraftPriceCategory";
UPDATE "Flight" f SET "aircraftPriceCategory" = CASE
  WHEN EXISTS (SELECT 1 FROM "StudentProfile" s WHERE s."personId" = f."personId" AND s."deactivatedAt" IS NULL)
   AND NOT EXISTS (SELECT 1 FROM "PilotProfile" p WHERE p."personId" = f."personId" AND p."deactivatedAt" IS NULL)
  THEN 'STUDENT'::"AircraftPriceCategory" ELSE 'PILOT'::"AircraftPriceCategory" END;
ALTER TABLE "Flight" ALTER COLUMN "aircraftPriceCategory" SET NOT NULL;
