-- Story 5.2, Task 1: package consumption in flight charges (AC 1/2).

-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "packageCoveredMinutes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PackageConsumption" (
    "id" TEXT NOT NULL,
    "flightId" TEXT NOT NULL,
    "hourPackageId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackageConsumption_hourPackageId_idx" ON "PackageConsumption"("hourPackageId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageConsumption_flightId_hourPackageId_key" ON "PackageConsumption"("flightId", "hourPackageId");

-- AddForeignKey
ALTER TABLE "PackageConsumption" ADD CONSTRAINT "PackageConsumption_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageConsumption" ADD CONSTRAINT "PackageConsumption_hourPackageId_fkey" FOREIGN KEY ("hourPackageId") REFERENCES "HourPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

