-- Hand-written (story 11.1, FR-43 — same backfill pattern as
-- 20260709120000_add_booking_expiry_block/migration.sql): the logbook
-- fields (departure/arrival airport, takeoff/landing instant) are nullable
-- ONLY to keep every historical Flight row valid as-is — new
-- registrations/corrections require all four (enforced in
-- flights.service.ts, not the DB).

-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "departureAirfield" TEXT,
ADD COLUMN     "arrivalAirfield" TEXT,
ADD COLUMN     "takeoffAt" TIMESTAMP(3),
ADD COLUMN     "landingAt" TIMESTAMP(3),
ADD COLUMN     "takeoffs" INTEGER NOT NULL DEFAULT 1;

-- Backfill (story 11.1 Contesto): every flight recorded before this story
-- never counted landings — a single landing is the correct assumption, the
-- overwhelming default for a normal flight.
UPDATE "Flight" SET "landings" = 1 WHERE "landings" IS NULL;

-- AlterTable
ALTER TABLE "Flight" ALTER COLUMN "landings" SET DEFAULT 1,
ALTER COLUMN "landings" SET NOT NULL;
