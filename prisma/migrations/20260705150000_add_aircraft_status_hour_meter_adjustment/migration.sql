-- CreateEnum
CREATE TYPE "AircraftStatus" AS ENUM ('OPERATIONAL', 'OUT_OF_SERVICE');

-- AlterTable
ALTER TABLE "Aircraft" ADD COLUMN     "status" "AircraftStatus" NOT NULL DEFAULT 'OPERATIONAL',
ADD COLUMN     "statusReason" TEXT;

-- CreateTable
CREATE TABLE "HourMeterAdjustment" (
    "id" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "previousMinutes" INTEGER NOT NULL,
    "newMinutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HourMeterAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HourMeterAdjustment_aircraftId_idx" ON "HourMeterAdjustment"("aircraftId");

-- AddForeignKey
ALTER TABLE "HourMeterAdjustment" ADD CONSTRAINT "HourMeterAdjustment_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourMeterAdjustment" ADD CONSTRAINT "HourMeterAdjustment_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
