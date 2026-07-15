-- CreateEnum
CREATE TYPE "AircraftOwner" AS ENUM ('CLUB', 'PRIVATE');

-- AlterTable
ALTER TABLE "Aircraft" ADD COLUMN     "seats" INTEGER,
ADD COLUMN     "fuelType" TEXT,
ADD COLUMN     "owner" "AircraftOwner" NOT NULL DEFAULT 'CLUB',
ADD COLUMN     "based" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "AircraftRate" ADD COLUMN     "dryHourlyRateCents" INTEGER;
