-- Story 5.1, Task 1: flight logging with automatic charges (AC 1/2).
-- CreateEnum
CREATE TYPE "FlightType" AS ENUM ('PRIVATE', 'SCHOOL', 'OTHER');

-- CreateEnum
CREATE TYPE "FlightStatus" AS ENUM ('REGISTERED', 'CANCELLED');

-- AlterEnum (additive only; the new value is used exclusively at runtime,
-- never within this migration/transaction)
ALTER TYPE "AccountMovementType" ADD VALUE 'FLIGHT_CHARGE';

-- AlterTable
ALTER TABLE "AccountMovement" ADD COLUMN     "flightId" TEXT;

-- CreateTable
CREATE TABLE "Flight" (
    "id" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "instructorProfileId" TEXT,
    "flightDate" DATE NOT NULL,
    "flightType" "FlightType" NOT NULL,
    "status" "FlightStatus" NOT NULL DEFAULT 'REGISTERED',
    "minutes" INTEGER NOT NULL,
    "hourMeterStart" INTEGER,
    "hourMeterEnd" INTEGER,
    "landings" INTEGER,
    "notes" TEXT,
    "aircraftRateCentsPerHour" INTEGER NOT NULL,
    "aircraftAmountCents" INTEGER NOT NULL,
    "instructorRateCentsPerHour" INTEGER,
    "instructorAmountCents" INTEGER,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Flight_aircraftId_idx" ON "Flight"("aircraftId");

-- CreateIndex
CREATE INDEX "Flight_personId_idx" ON "Flight"("personId");

-- CreateIndex
CREATE INDEX "Flight_instructorProfileId_idx" ON "Flight"("instructorProfileId");

-- CreateIndex
CREATE INDEX "Flight_flightDate_idx" ON "Flight"("flightDate");

-- CreateIndex
CREATE INDEX "AccountMovement_flightId_idx" ON "AccountMovement"("flightId");

-- AddForeignKey
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_instructorProfileId_fkey" FOREIGN KEY ("instructorProfileId") REFERENCES "InstructorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

