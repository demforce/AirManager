-- Story 19.2 (R-19-a, CR PO 2026-11-01): drops the person's fiscal code, the
-- aircraft's seats/fuel type/based flag/notes, the whole hour meter (the
-- aircraft counter, its rectification table, the per-flight start/end
-- readings) and the flight notes — data included, test database, nothing to
-- preserve. R-19-b: an aircraft's hours, wherever shown, are now the sum of
-- its REGISTERED flights' minutes; no rule of the domain read the counter.

-- DropForeignKey
ALTER TABLE "HourMeterAdjustment" DROP CONSTRAINT "HourMeterAdjustment_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "HourMeterAdjustment" DROP CONSTRAINT "HourMeterAdjustment_aircraftId_fkey";

-- DropIndex
DROP INDEX "Person_fiscalCode_key";

-- AlterTable
ALTER TABLE "Aircraft" DROP COLUMN "based",
DROP COLUMN "fuelType",
DROP COLUMN "hourMeterMinutes",
DROP COLUMN "notes",
DROP COLUMN "seats";

-- AlterTable
ALTER TABLE "Flight" DROP COLUMN "hourMeterEnd",
DROP COLUMN "hourMeterStart",
DROP COLUMN "notes";

-- AlterTable
ALTER TABLE "Person" DROP COLUMN "fiscalCode";

-- DropTable
DROP TABLE "HourMeterAdjustment";
