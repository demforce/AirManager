-- Story 19.6 (CR PO 2026-11-01, R-19-a/R-19-c/R-19-d): a flight is deleted together with its charge and
-- edited in place; the flights already cancelled disappear, with their movements and correction chains;
-- the no-charge flag joins the flight. Destructive by ratification (R-19-a: test data only).
-- Statement order is load-bearing: the DELETEs need "status" (dropped below) to select their rows, and
-- the RESTRICT table must go before the flights it references. ONE transaction: a failure leaves nothing.
BEGIN;

-- 1. Package consumption, retired by story 12.13 (no reader nor writer left): its RESTRICT FK on
--    "flightId" would block step 3 and, afterwards, every flight deletion.
DROP TABLE "PackageConsumption";

-- 2. Movements of cancelled flights: the charge and its FLIGHT_CHARGE_REVERSAL (they net to 0, so no
--    balance moves). A manual ADJUSTMENT pointing at one of them would keep its row with reversalOfId
--    NULL (existing SET NULL FK) — none expected, counted on the twin database.
DELETE FROM "AccountMovement" WHERE "flightId" IN (SELECT "id" FROM "Flight" WHERE "status" = 'CANCELLED');

-- 3. Cancelled flights, correction chains included: a surviving correction's "correctionOfId" goes NULL
--    via its SET NULL FK (the column is dropped right after), a TrainingNote's "flightId" too.
DELETE FROM "Flight" WHERE "status" = 'CANCELLED';

-- 4. Flight: no status, no cancellation, no chain; the no-charge flag (R-19-d).
ALTER TABLE "Flight" DROP CONSTRAINT "Flight_correctionOfId_fkey";
DROP INDEX "Flight_correctionOfId_key";
ALTER TABLE "Flight" DROP COLUMN "cancelReason",
DROP COLUMN "cancelledAt",
DROP COLUMN "correctionOfId",
DROP COLUMN "status",
ADD COLUMN     "noCharge" BOOLEAN NOT NULL DEFAULT false;
DROP TYPE "FlightStatus";

-- 5. AccountMovementType without FLIGHT_CHARGE_REVERSAL (Postgres cannot drop an enum value: the type
--    is recreated). The cast FAILS LOUDLY if any row still carries the value — that failure is the check.
CREATE TYPE "AccountMovementType_new" AS ENUM ('TOP_UP', 'ADJUSTMENT', 'PACKAGE_PURCHASE', 'FLIGHT_CHARGE');
ALTER TABLE "AccountMovement" ALTER COLUMN "type" TYPE "AccountMovementType_new" USING ("type"::text::"AccountMovementType_new");
ALTER TYPE "AccountMovementType" RENAME TO "AccountMovementType_old";
ALTER TYPE "AccountMovementType_new" RENAME TO "AccountMovementType";
DROP TYPE "public"."AccountMovementType_old";

-- 6. One charge per flight, and no flight deletable while its charge exists (AD-7). The unique index
--    fails if any flight still had two movements — after step 2 only FLIGHT_CHARGE rows carry "flightId".
ALTER TABLE "AccountMovement" DROP CONSTRAINT "AccountMovement_flightId_fkey";
DROP INDEX "AccountMovement_flightId_idx";
CREATE UNIQUE INDEX "AccountMovement_flightId_key" ON "AccountMovement"("flightId");
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
